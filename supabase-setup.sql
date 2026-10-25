-- ============================================================================
-- MineFinds — Supabase setup (run ONCE, in Supabase dashboard:
--   SQL Editor -> New query -> paste this whole file -> Run)
--
-- NEW DESIGN (Oct 25, 2026 — supersedes the one-shared-family-login design):
--   * PERSONAL accounts: anyone can sign up with their own email + password
--     (Supabase Auth). There is no single shared account any more.
--   * MULTIPLE NAMED WORLDS per person: every world has a NAME and a SEED,
--     both stored on the worlds row itself.
--   * SYNC CODE: every world gets a unique, human-typeable 8-character code.
--     Anyone signed in can JOIN a world by entering its code, and then they
--     share that world's finds / builds / need items / lore.
--   * Membership lives in world_members (world_id, user_id, role).
--     Row Level Security is ON for every table and is based on membership.
--   * Joining goes through join_world_by_code() — a SECURITY DEFINER
--     function — because RLS (correctly) stops a non-member from reading a
--     world row to look its code up directly.
--
-- This file is safe to run once on a FRESH project. It also carries small
-- "upgrade" guards so re-running it over the earlier single-world schema
-- adds the new worlds columns instead of erroring; the old `settings`
-- table (which used to hold the seed) is no longer used by the app.
--
-- Nothing here creates a user account — people sign up in the app itself.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Sync code generator — 8 characters from an alphabet with no look-alikes
-- (no 0/O, no 1/I/L), so codes are easy to read out loud and type on a phone.
-- (plpgsql bodies are only checked when they run, so it is fine that this
-- refers to public.worlds before that table is created below.)
-- ---------------------------------------------------------------------------
create or replace function public.generate_sync_code()
returns text language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.worlds w where w.sync_code = code);
  end loop;
  return code;
end; $$;

-- ---------------------------------------------------------------------------
-- worlds — one row per Minecraft world. Name + seed live here.
-- ---------------------------------------------------------------------------
create table if not exists public.worlds (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null default 'My World',
  seed       text not null default '',
  sync_code  text not null default public.generate_sync_code(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade guards: if `worlds` already exists from the old single-world
-- schema (no seed / sync_code columns yet), add what is missing.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'worlds' and column_name = 'seed') then
    alter table public.worlds add column seed text not null default '';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'worlds' and column_name = 'sync_code') then
    alter table public.worlds add column sync_code text;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'worlds' and column_name = 'updated_at') then
    alter table public.worlds add column updated_at timestamptz not null default now();
  end if;
end $$;
update public.worlds set name = 'My World' where name is null;
update public.worlds set sync_code = public.generate_sync_code() where sync_code is null;
alter table public.worlds alter column name set default 'My World';
alter table public.worlds alter column name set not null;
alter table public.worlds alter column sync_code set default public.generate_sync_code();
alter table public.worlds alter column sync_code set not null;
create unique index if not exists worlds_sync_code_unique on public.worlds (sync_code);

-- ---------------------------------------------------------------------------
-- world_members — who belongs to which world, and in what role.
-- The world's creator is role 'owner'; people who join with the sync code
-- are role 'member'. Both roles can use the world's lists; only the owner
-- can rename the world, change its seed, or delete it.
-- ---------------------------------------------------------------------------
create table if not exists public.world_members (
  world_id  uuid not null references public.worlds (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (world_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Child tables — every row belongs to exactly one world (world_id).
-- Same shapes as the previous design.
-- ---------------------------------------------------------------------------
create table if not exists public.finds (
  id         uuid primary key default gen_random_uuid(),
  world_id   uuid not null references public.worlds (id) on delete cascade,
  name       text not null,
  dimension  text not null check (dimension in ('Overworld', 'Nether', 'The End')),
  x          integer not null,
  y          integer not null,
  z          integer not null,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.build_videos (
  id         uuid primary key default gen_random_uuid(),
  world_id   uuid not null references public.worlds (id) on delete cascade,
  title      text not null,
  url        text not null,
  youtube_id text,
  note       text,
  status     text not null default 'want_to_build'
             check (status in ('want_to_build', 'building', 'built')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.need_items (
  id            uuid primary key default gen_random_uuid(),
  world_id      uuid not null references public.worlds (id) on delete cascade,
  item_name     text not null,
  amount_needed integer not null check (amount_needed >= 0),
  gathered      integer not null default 0 check (gathered >= 0),
  stack_size    integer not null default 64 check (stack_size in (64, 16, 1)),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.lore_entries (
  id         uuid primary key default gen_random_uuid(),
  world_id   uuid not null references public.worlds (id) on delete cascade,
  day_number integer not null check (day_number >= 1),
  title      text not null,
  story      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Membership helpers. SECURITY DEFINER so RLS policies can ask "is the
-- signed-in user a member of this world?" without the check itself being
-- blocked by RLS (which would recurse forever on world_members).
-- ---------------------------------------------------------------------------
create or replace function public.is_world_member(p_world_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.world_members m
    where m.world_id = p_world_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_world_owner(p_world_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.worlds w
    where w.id = p_world_id and w.owner_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- When someone creates a world, automatically make them a member with the
-- 'owner' role, so the app never has to do two writes.
-- ---------------------------------------------------------------------------
create or replace function public.add_owner_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.world_members (world_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (world_id, user_id) do nothing;
  return new;
end; $$;

drop trigger if exists worlds_add_owner on public.worlds;
create trigger worlds_add_owner after insert on public.worlds
  for each row execute function public.add_owner_membership();

-- ---------------------------------------------------------------------------
-- Join a world by sync code. SECURITY DEFINER: a non-member cannot SELECT
-- the world row under RLS, so this function does the code lookup for them,
-- adds their membership row, and hands back the world's id. It only ever
-- acts for the signed-in caller (auth.uid()) — nobody can join someone
-- else, and a wrong code just gets a friendly error.
-- ---------------------------------------------------------------------------
create or replace function public.join_world_by_code(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_world_id uuid;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'You must be logged in to join a world.';
  end if;
  select id into v_world_id from public.worlds
  where sync_code = upper(btrim(p_code));
  if v_world_id is null then
    raise exception 'No world has that sync code — check the code and try again.';
  end if;
  insert into public.world_members (world_id, user_id, role)
  values (v_world_id, v_user, 'member')
  on conflict (world_id, user_id) do nothing;
  return v_world_id;
end; $$;

grant execute on function public.join_world_by_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists worlds_touch on public.worlds;
create trigger worlds_touch before update on public.worlds
  for each row execute function public.touch_updated_at();
drop trigger if exists finds_touch on public.finds;
create trigger finds_touch before update on public.finds
  for each row execute function public.touch_updated_at();
drop trigger if exists build_videos_touch on public.build_videos;
create trigger build_videos_touch before update on public.build_videos
  for each row execute function public.touch_updated_at();
drop trigger if exists need_items_touch on public.need_items;
create trigger need_items_touch before update on public.need_items
  for each row execute function public.touch_updated_at();
drop trigger if exists lore_entries_touch on public.lore_entries;
create trigger lore_entries_touch before update on public.lore_entries
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — membership decides everything.
-- ---------------------------------------------------------------------------
alter table public.worlds       enable row level security;
alter table public.world_members enable row level security;
alter table public.finds        enable row level security;
alter table public.build_videos enable row level security;
alter table public.need_items   enable row level security;
alter table public.lore_entries enable row level security;

-- (Drops first include the previous design's policy names, so re-running
-- this file over the old single-login schema leaves no stale policies
-- behind — Postgres ORs multiple policies together.)
drop policy if exists "owner can do anything with own worlds" on public.worlds;

-- worlds: members can see a world; only the owner can create (as
-- themselves), rename / re-seed, or delete it.
drop policy if exists "members can view worlds" on public.worlds;
create policy "members can view worlds" on public.worlds
  for select to authenticated
  using (public.is_world_member(id));

drop policy if exists "users can create their own worlds" on public.worlds;
create policy "users can create their own worlds" on public.worlds
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "owner can update own worlds" on public.worlds;
create policy "owner can update own worlds" on public.worlds
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "owner can delete own worlds" on public.worlds;
create policy "owner can delete own worlds" on public.worlds
  for delete to authenticated
  using (owner_id = auth.uid());

-- world_members: members can see who else is in their worlds. There is
-- deliberately NO insert/update policy for regular users — rows are only
-- ever written by the worlds trigger above and join_world_by_code().
-- Delete = "leave": you may remove yourself, and the owner may remove a
-- member from their world.
drop policy if exists "members can view membership" on public.world_members;
create policy "members can view membership" on public.world_members
  for select to authenticated
  using (public.is_world_member(world_id));

drop policy if exists "leave or owner-remove membership" on public.world_members;
create policy "leave or owner-remove membership" on public.world_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_world_owner(world_id));

-- child tables: any member of the row's world can read and write.
drop policy if exists "owner via world" on public.finds;
drop policy if exists "owner via world" on public.build_videos;
drop policy if exists "owner via world" on public.need_items;
drop policy if exists "owner via world" on public.lore_entries;
drop policy if exists "members via world" on public.finds;
create policy "members via world" on public.finds
  for all to authenticated
  using (public.is_world_member(world_id))
  with check (public.is_world_member(world_id));

drop policy if exists "members via world" on public.build_videos;
create policy "members via world" on public.build_videos
  for all to authenticated
  using (public.is_world_member(world_id))
  with check (public.is_world_member(world_id));

drop policy if exists "members via world" on public.need_items;
create policy "members via world" on public.need_items
  for all to authenticated
  using (public.is_world_member(world_id))
  with check (public.is_world_member(world_id));

drop policy if exists "members via world" on public.lore_entries;
create policy "members via world" on public.lore_entries
  for all to authenticated
  using (public.is_world_member(world_id))
  with check (public.is_world_member(world_id));

-- No policies are created for the anon role on purpose: logged-out visitors
-- get nothing. Next step after this file: people sign up in the app, then
-- run migration-import.sql to give the first account Hailey's saved world.
