# MineFinds — standalone web app

A phone-first web app that rebuilds the Muse MineFinds outside Muse.
**Design (updated Oct 25, 2026): personal accounts + named worlds + sync
codes** — this supersedes the earlier one-shared-family-login design.

- **Personal accounts:** anyone can sign up in the app with their own
  email + password (Supabase Auth) and log in on any phone or browser.
- **Multiple named worlds:** each person can create as many worlds as
  they like. Every world has a **name** and a **seed**, and everything in
  the app (Finds, Builds, Stacks, Nether, Lore, and the Chunkbase link)
  belongs to the world picked at the top of the screen.
- **Sync codes:** every world has a unique 8-character **sync code**.
  The people in a world can see and copy its code; anyone signed in who
  types the code **joins** that world, and members share the same finds,
  build videos, need items, and lore for that world. Owners can rename
  their world and change its seed; members can add to all the lists.

The Muse MineFinds app is not touched by this project.

Plan: `~/workspace/goals/minefinds-app/files/minefinds-standalone-rebuild-plan.md`

## Files

| File | What it is |
|---|---|
| `index.html` | The whole app page: login/sign-up screen, world picker, and the Finds, Builds, Stacks, Nether, Lore tabs. |
| `style.css` | Phone-first styling: big readable text/buttons, no sideways scrolling. |
| `app.js` | All app logic. Talks to the data through one "Store" layer that works the same in demo mode (localStorage) and live mode (Supabase). |
| `config.js` | **The only file edited to go live.** Holds `SUPABASE_URL` + `SUPABASE_ANON_KEY`. |
| `manifest.json` + `icon.svg` | PWA basics so **Add to Home Screen** works on phones with the MineFinds name/icon. |
| `supabase-setup.sql` | Run once in Supabase (SQL Editor). Creates `worlds` (name + seed + sync code), `world_members`, `finds`, `build_videos`, `need_items`, `lore_entries`, turns on Row Level Security with membership-based policies, and adds the `join_world_by_code()` function. |
| `migration-import.sql` | Run once, *after* the setup SQL *and* after the first person (Hailey) has signed up in the app. Gives that first account the exact migration data as a world named **"My World"** (seed `-5701622969722961025`, Iron farm/ spawn 0/66/0, Village 280/63/200, "home" build video (Building), Dark oak planks 866/0/64, and the Day 1 lore entry about Princess Peach). No invented data; Princess Peach has no coordinates and is not a find — she is only the Day 1 lore entry. |

## How sharing works (the short version)

1. Hailey signs up with her own email and runs the migration import, so
   her saved world "My World" is waiting in her account.
2. She opens "My World", reads its **sync code**, and gives the code to
   Jason (in person / by text — the code is the key to the world, so it
   is shared like a password, never posted publicly).
3. Jason signs up with **his own** email, taps **Join with a code**,
   types the code — and he is looking at the same lists. Anything either
   of them adds shows up for both.

In the database, joining goes through a `SECURITY DEFINER` Postgres
function (`join_world_by_code`), because Row Level Security quite
rightly stops a non-member from reading a world row to look its code up.
RLS stays ON for every table; there is no access at all when logged out.

## Test demo mode locally (no accounts needed)

While `config.js` still has the placeholder values, the app runs in
**LOCAL DEMO MODE** (yellow banner at the top). Demo mode mirrors the
full design — accounts, named worlds, sync codes, joining — with
everything stored only in this browser's localStorage
(`minefinds_demo_v2` key):

- **Sign up** with any email + password (they are fake demo accounts —
  the password is stored in plain text in the browser, which is only OK
  because demo mode is an offline try-out; live mode uses Supabase Auth).
- The **first** demo account starts with the migration data as world
  **"My World"**: seed, 2 finds, 1 build video ("home", Building),
  1 need item (Dark oak planks ×866), and 1 lore entry (Day 1 —
  Princess Peach). Later demo accounts start with no worlds.
- To test sharing: note My World's sync code, **log out**, sign up a
  second demo account, and **Join with a code** — the second account
  sees and can add to the same world. Creating extra named worlds and
  switching between them works too.
- Clearing the browser's site data resets the demo completely. (The old
  pre-accounts demo used a different storage key, so old demo saves
  simply start fresh under the new design.)

To run it:

```bash
cd ~/workspace/goals/minefinds-app/standalone/minefinds-web
python3 -m http.server 8000
# then open http://localhost:8000 on the computer,
# or http://<computer-ip>:8000 on a phone on the same Wi-Fi
```

## Coordinates — negatives fully supported

Minecraft coordinates are often negative, and every coordinate field
(Find X/Y/Z, edit-find, and the Nether calculator X/Y/Z) accepts them.
The boxes are deliberately `type="text"` with `inputmode="numeric"` and
a `-?[0-9]*` pattern instead of `type="number"`: on many phone
keyboards a `type="number"` field hides the minus key, which made
negative coordinates impossible to type. A strict whole-number parser
in `app.js` (`parseCoord`) accepts `-280` and rejects junk the same way
an empty box was treated before. Find search also matches coordinates,
so typing `-280` finds the find logged there. Copy buttons copy the
minus signs (`-280 63 -200`), the nearby check and Nether conversion
(÷8 / ×8 with floor) are negative-safe, and the Supabase columns are
plain integers.

## Lore Log tab

The story of the current world, one entry per day (or per big moment):

- Each entry has a **day number** (Day 1, Day 2, …), a **title/headline**,
  a **story** text, and created/updated timestamps (live mode stores them
  in the `lore_entries` table; the list shows a "Logged / Updated" date).
- Add, edit, delete, and search entries (search matches the day, title,
  and story).
- **Ordering choice:** entries display as a timeline in day order —
  **Day 1 first**, then Day 2, Day 3… — so the list reads like the
  world's story from the start. Newest entries sit at the end, where the
  story left off, and the search box jumps straight to any entry.
- Seeded entry (demo mode and `migration-import.sql` both carry exactly
  this one, in world "My World", nothing else): **Day 1 — "Found
  Princess Peach, the rare pink sheep"** — a rare pink sheep who spawned
  naturally on Day 1 (about a 0.164% spawn chance) and was named Princess
  Peach. No coordinates are recorded for her, because none were ever
  logged.

## Go live — setup steps for the new model

`config.js` needs only the two **public** project values (safe to be in
the app; they are not passwords):

1. **Supabase URL** — Supabase dashboard → the MineFinds project →
   Project Settings → API → "Project URL"
2. **Supabase anon key** — same API page → "anon public" key

With those pasted in, the app switches to live mode automatically.
Then, in order (Sunny walks Hailey through it, one step at a time):

1. **Run `supabase-setup.sql`** in the Supabase SQL Editor (creates the
   tables, membership rules, and the join-by-code function).
2. **Check Auth settings** in Supabase (Authentication → Settings):
   email sign-ups must be allowed, since people now create their own
   accounts in the app. If "Confirm email" is on, each new account has
   to click the link in a confirmation email before its first login.
3. **Hailey signs up in the app** with her own email + a MineFinds-only
   password she sets herself. She is the FIRST account — that matters
   for the next step.
4. **Run `migration-import.sql`** — it attaches Hailey's saved world
   ("My World": seed, both finds, the "home" video, Dark oak planks,
   Day 1 lore) to that first account.
5. **Host the folder** (GitHub Pages) and Add to Home Screen on each
   phone.
6. **Share the sync code** from inside the app with Jason (or anyone
   else) — they sign up with their own email and join with the code.

**Never** put any of these in `config.js`, this repo, or chat: the
Supabase database password, the Supabase `service_role`/secret key, or
anybody's MineFinds login password. The app only ever needs the URL +
anon key — Row Level Security in `supabase-setup.sql` is what keeps
every world's lists visible only to that world's members.

## Notes / limits of this code drop

- YouTube thumbnails/embeds come from YouTube, Chunkbase is linked out
  (not embedded), and the Supabase JS client loads from a CDN — all three
  need internet.
- `manifest.json` references `icon.svg`. Some Android Chrome versions
  prefer a 192×192 PNG for install prompts; swap in a PNG icon before
  go-live if the install prompt looks plain (no code change needed
  beyond the manifest icon entry).
- "Forgot password" (live mode) sends a reset email through Supabase to
  the account's own email — each person needs an inbox they can open.
- Design decisions in this version: only a world's **owner** can rename
  it or change its seed (members can still add/edit all the lists);
  there is no "leave world" button yet (the database allows leaving —
  a button can be added later); worlds can't be deleted from the app
  yet, only created.
