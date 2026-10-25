-- ============================================================================
-- MineFinds — Supabase setup (run ONCE, in Supabase dashboard:
--   SQL Editor -> New query -> paste this whole file -> Run)
--
-- Design (plan Section 3 + 4):
--   * ONE shared family login (a single auth.users account for Hailey+Jason)
--   * ONE world owned by that account
--   * Seed lives in ONE place only: settings.seed
--     (worlds has no seed column, so two copies can never disagree)
--   * Row Level Security ON everywhere: only the logged-in owner account
--     can read/write. No public / logged-out access.
-- Safe to leave un-run until go-live. Nothing here creates a user account —
-- Hailey creates the family account herself (plan Phase 4, Step 18).
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- worlds — the one Minecraft world
-- ---------------------------------------------------------------------------
create table if not exists public.worlds (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- settings — world settings / seed (ONE row per world, seed lives here only)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id         uuid primary key default gen_random_uuid(),
  world_id   uuid not null unique references public.worlds (id) on delete cascade,
  seed       text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- finds — saved locations
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

-- ---------------------------------------------------------------------------
-- build_videos — Builds tab (YouTube videos)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- need_items — Things I Need log (Stacks tab)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- lore_entries — Lore Log tab (world story, by day number)
-- ---------------------------------------------------------------------------
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
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
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
-- Row Level Security — only the logged-in owner (the shared family account)
-- ---------------------------------------------------------------------------
alter table public.worlds       enable row level security;
alter table public.settings     enable row level security;
alter table public.finds        enable row level security;
alter table public.build_videos enable row level security;
alter table public.need_items   enable row level security;
alter table public.lore_entries enable row level security;

-- worlds: owner only
drop policy if exists "owner can do anything with own worlds" on public.worlds;
create policy "owner can do anything with own worlds" on public.worlds
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- child tables: only when the row's world belongs to the logged-in account
drop policy if exists "owner via world" on public.settings;
create policy "owner via world" on public.settings
  for all to authenticated
  using (exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = auth.uid()));

drop policy if exists "owner via world" on public.finds;
create policy "owner via world" on public.finds
  for all to authenticated
  using (exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = auth.uid()));

drop policy if exists "owner via world" on public.build_videos;
create policy "owner via world" on public.build_videos
  for all to authenticated
  using (exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = auth.uid()));

drop policy if exists "owner via world" on public.need_items;
create policy "owner via world" on public.need_items
  for all to authenticated
  using (exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = auth.uid()));

drop policy if exists "owner via world" on public.lore_entries;
create policy "owner via world" on public.lore_entries
  for all to authenticated
  using (exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.worlds w where w.id = world_id and w.owner_id = auth.uid()));

-- No policies are created for the anon role on purpose: logged-out visitors
-- get nothing. Run migration-import.sql NEXT, after the family account exists.
