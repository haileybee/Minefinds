-- ============================================================================
-- MineFinds — migration import (run ONCE, AFTER supabase-setup.sql AND
-- AFTER at least one person has signed up in the app, in the Supabase
-- SQL Editor).
--
-- NEW multi-user design: the world created here belongs to the earliest
-- signed-up auth user (at import time there should be exactly one account
-- — Hailey's — which is why the import runs right after she signs up and
-- BEFORE anyone else is invited). The world is named "My World" (she can
-- rename it in the app any time) and gets a generated sync code from the
-- worlds table default, so Jason — or anyone she shares the code with —
-- can join it from their own account.
--
-- Data inserted is Hailey's EXACT saved data from the Oct 24, 2026
-- migration snapshot:
--   1 world ("My World", seed -5701622969722961025), 2 finds, 1 build
--   video, 1 need item, and 1 lore entry (Day 1 — finding Princess Peach).
-- NO invented data. Princess Peach the pink sheep has NO logged
-- coordinates and is deliberately NOT a row in finds; she appears only
-- as the Day 1 lore entry below, exactly as Hailey told it.
--
-- Idempotent-ish: it skips the import if that first account already owns
-- a world, so running it twice will not duplicate the lists.
-- ============================================================================

do $$
declare
  v_owner uuid;
  v_world uuid;
begin
  select id into v_owner from auth.users order by created_at asc limit 1;
  if v_owner is null then
    raise exception 'No auth user found. Sign up in the MineFinds app first (your own email + password), then re-run this file.';
  end if;

  select id into v_world from public.worlds where owner_id = v_owner limit 1;
  if v_world is not null then
    raise notice 'The first account already owns a world (%) — import skipped, nothing duplicated.', v_world;
    return;
  end if;

  -- The world: name + seed live on the worlds row. The sync_code column
  -- default generates a fresh unique code, and the worlds trigger adds
  -- the owner to world_members automatically.
  insert into public.worlds (owner_id, name, seed)
  values (v_owner, 'My World', '-5701622969722961025')
  returning id into v_world;

  -- Finds — exact snapshot values
  insert into public.finds (world_id, name, dimension, x, y, z, note) values
    (v_world, 'Iron farm/ spawn', 'Overworld', 0,   66, 0,   'Iron farm'),
    (v_world, 'Village',          'Overworld', 280, 63, 200, 'Closest village to home');

  -- Builds — exact snapshot values
  insert into public.build_videos (world_id, title, url, youtube_id, note, status) values
    (v_world, 'home', 'https://youtu.be/yHVqPbxfQis?si=dqFGOcg2cNcnfMb7', 'yHVqPbxfQis', null, 'building');

  -- Things I Need — exact snapshot values
  insert into public.need_items (world_id, item_name, amount_needed, gathered, stack_size) values
    (v_world, 'Dark oak planks', 866, 0, 64);

  -- Lore Log — Day 1, exactly as Hailey told it (Oct 24, 2026).
  -- Princess Peach has no logged coordinates; this is a story entry, not a find.
  insert into public.lore_entries (world_id, day_number, title, story) values
    (v_world, 1, 'Found Princess Peach, the rare pink sheep',
     'Day 1: I found a rare pink sheep — she had spawned naturally, which almost never happens (about a 0.164% chance). I named her Princess Peach.');

  raise notice 'MineFinds migration imported: world "My World" (%) with seed + 2 finds + 1 build video + 1 need item + 1 lore entry. Find its sync code in the app (or in the worlds table) to invite others.', v_world;
end $$;
