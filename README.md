# MineFinds — standalone web app

A phone-first web app that rebuilds the Muse MineFinds outside Muse, so
Hailey and Jason can both log in with **one shared family login** and add to
the **same** lists. The Muse MineFinds app is not touched by this project —
it stays as the backup.

Plan: `~/workspace/goals/minefinds-app/files/minefinds-standalone-rebuild-plan.md`

## Files

| File | What it is |
|---|---|
| `index.html` | The whole app page: login screen + Finds, Builds, Stacks, Nether, Lore tabs. |
| `style.css` | Phone-first styling: big readable text/buttons, no sideways scrolling. |
| `app.js` | All app logic. Talks to the data through one "Store" layer that works the same in demo mode (localStorage) and live mode (Supabase). |
| `config.js` | **The only file edited to go live.** Holds `SUPABASE_URL` + `SUPABASE_ANON_KEY` placeholders. |
| `manifest.json` + `icon.svg` | PWA basics so **Add to Home Screen** works on phones with the MineFinds name/icon. |
| `supabase-setup.sql` | Run once in Supabase (SQL Editor). Creates `worlds`, `settings`, `finds`, `build_videos`, `need_items`, `lore_entries`, turns on Row Level Security, and adds owner-only policies. Seed lives in `settings.seed` only. |
| `migration-import.sql` | Run once, *after* setup SQL *and* after the family account exists. Inserts the exact migration data (seed `-5701622969722961025`, Iron farm/ spawn 0/66/0, Village 280/63/200, "home" build video (Building), Dark oak planks 866/0/64, and the Day 1 lore entry about Princess Peach). No invented data; Princess Peach has no coordinates and is not a find — she is only the Day 1 lore entry. |

## Test demo mode locally (no accounts needed)

While `config.js` still has the placeholder values, the app runs in
**LOCAL DEMO MODE** (yellow banner at the top):

- Data lives only in the browser's localStorage (`minefinds_demo_v1` key).
- It starts seeded with the migration data: 2 finds, 1 build video
  ("home", Building), 1 need item (Dark oak planks ×866), the seed, and
  1 lore entry (Day 1 — finding Princess Peach, see below).
- All five tabs fully work: add/edit/delete, stack math, Nether converter,
  nearby-finds, thumbnails, progress tracking — nothing is shared with
  anyone and nothing leaves the device. Clearing the browser's site data
  resets the demo back to the migration seed data. (Demo saves made before
  the Lore tab existed get the seeded Day 1 lore entry added on load, so
  nothing breaks.)

## Lore Log tab

The story of the world, one entry per day (or per big moment):

- Each entry has a **day number** (Day 1, Day 2, …), a **title/headline**,
  a **story** text, and created/updated timestamps (live mode stores them
  in the `lore_entries` table; the list shows a "Logged / Updated" date).
- Add, edit, delete, and search entries (search matches the day, title,
  and story).
- **Ordering choice:** entries display as a timeline in day order —
  **Day 1 first**, then Day 2, Day 3… — so the list reads like the
  world's story from the start, following the app's usual
  oldest-first list order. Newest entries sit at the end, where the
  story left off, and the search box jumps straight to any entry.
- Seeded entry (demo mode and `migration-import.sql` both carry exactly
  this one, nothing else): **Day 1 — "Found Princess Peach, the rare
  pink sheep"** — a rare pink sheep who spawned naturally on Day 1
  (about a 0.164% spawn chance) and was named Princess Peach. No
  coordinates are recorded for her, because none were ever logged.

To run it:

```bash
cd ~/workspace/goals/minefinds-app/standalone/minefinds-web
python3 -m http.server 8000
# then open http://localhost:8000 on the computer,
# or http://<computer-ip>:8000 on a phone on the same Wi-Fi
```

## Go live later — what Hailey must provide

**Only two values, both safe to share (they are public project values, not
passwords):**

1. **Supabase URL** — Supabase dashboard → the MineFinds project →
   Project Settings → API → "Project URL"
2. **Supabase anon key** — same API page → "anon public" key

Paste those two into `config.js`, and the app switches to live mode
automatically: the login screen appears, and data saves to Supabase so
both phones see the same lists.

Before that, in Supabase (Sunny walks Hailey through it, one step at a time):

1. Run `supabase-setup.sql` in the SQL Editor.
2. Hailey creates the **one shared family account** herself
   (Authentication → Users → Add user, or the route Sunny walks through).
   **The password is set by Hailey and is never sent in chat and never
   written in any file in this project.**
3. Run `migration-import.sql`.
4. Host the folder (e.g. Netlify, from GitHub) and Add to Home Screen on
   both phones.

**Never** put any of these in `config.js`, this repo, or chat: the
Supabase database password, the Supabase `service_role`/secret key, or the
MineFinds login password. The app only ever needs the URL + anon key —
Row Level Security in `supabase-setup.sql` is what keeps the lists
private to the logged-in family account.

## Notes / limits of this code drop

- YouTube thumbnails/embeds come from YouTube, Chunkbase is linked out
  (not embedded), and the Supabase JS client loads from a CDN — all three
  need internet, same as the plan says.
- `manifest.json` references `icon.svg`. Some Android Chrome versions
  prefer a 192×192 PNG for install prompts; swap in a PNG icon before
  go-live if the install prompt looks plain (no code change needed
  beyond the manifest icon entry).
- In live mode, "Forgot password" sends a reset email through Supabase to
  the family login email — that inbox must be one Hailey can open.
