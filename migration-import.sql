-- ============================================================================
-- MineFinds — migration import (run ONCE, AFTER supabase-setup.sql AND
-- AFTER Hailey has created the single shared family account, in the
-- Supabase SQL Editor).
--
-- It attaches everything to the earliest-created auth user (the family
-- account) and inserts Hailey's EXACT saved data from the Oct 24, 2026
-- migration snapshot:
--   1 world, seed -5701622969722961025, 2 finds, 1 build video, 1 need item,
--   and 1 lore entry (Day 1 — finding Princess Peach).
-- NO invented data. Princess Peach the pink sheep has NO logged
-- coordinates and is deliberately NOT a row in finds; she appears only
-- as the Day 1 lore entry below, exactly as Hailey told it.
--
-- Idempotent-ish: it skips the import if a world already exists for the
-- family account, so running it twice will not duplicate the lists.
-- ============================================================================

do $$
declare
  v_owner uuid;
  v_world uuid;
begin
  select id into v_owner from auth.users order by created_at asc limit 1;
  if v_owner is null then
    raise exception 'No auth user found. Create the shared family account first (plan Phase 4, Step 18), then re-run this file.';
  end if;

  select id into v_world from public.worlds where owner_id = v_owner limit 1;
  if v_world is not null then
    raise notice 'A world already exists for the family account (%) — import skipped, nothing duplicated.', v_owner;
    return;
  end if;

  insert into public.worlds (owner_id, name) values (v_owner, null)
  returning id into v_world;

  -- Seed (single home: settings.seed)
  insert into public.settings (world_id, seed)
  values (v_world, '-5701622969722961025');

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

  raise notice 'MineFinds migration imported for world %: seed + 2 finds + 1 build video + 1 need item + 1 lore entry.', v_world;
end $$;
