# MineFinds Shared Sync + Diamond Boots Design

## Goal
Upgrade the existing private MineFinds Android app so Hailey and Jason can use the same Minecraft world journal from separate phones while keeping local persistence and the existing coordinate/Seed Map workflow. Replace the launcher icon and in-app branding with the approved pair of diamond boots travel logo.

## Scope

### 1. Shared worlds
- A phone can create a world locally as it does today.
- A world can be turned into a shared world.
- The app generates an 8-character private join code.
- A second phone installs the same APK, taps **Join Shared World**, enters the code, and chooses a display name.
- Both phones then see the same world metadata and finds.
- Each find records who added or last edited it.
- The app remains usable offline. Local SQLite stays the primary on-device cache and unsynced changes upload when connectivity returns.

### 2. Per-person current coordinates
- Current coordinates are stored per member, not as one global world position.
- Hailey's phone uses Hailey's current X/Y/Z for Nearby calculations.
- Jason's phone uses Jason's current X/Y/Z for Nearby calculations.
- A compact **Players** section shows the latest synced coordinate for each member with a last-updated time.

### 3. Sync behavior
- Each installation receives a private device identity and random device secret, stored only on that phone.
- No email/password account is required.
- Local records receive stable UUIDs so the same world/find is not duplicated across devices.
- Create/edit/delete operations remain stored locally while offline and upload when connectivity returns.
- Sync runs when the app opens, after a local edit, and from a **Sync now** button.
- Conflicts use last-write-wins based on `updated_at` for v1.
- Deletes are soft-deleted in the cloud so an offline phone cannot accidentally resurrect a deleted find.

### 4. Private backend
Reuse the existing healthy **PocketRewards** Supabase project (`jytglrhvkzbsfpizjtrp`). Do not create another paid Supabase project. MineFinds data must remain isolated from PocketRewards by using only `minefinds_*` tables and a `minefinds-sync` Edge Function. Existing `pr_*` PocketRewards tables must not be modified or deleted.

Cloud tables:
- `minefinds_devices`: device id, hashed device secret, created time
- `minefinds_worlds`: id, name, seed, edition, minecraft_version, dimension, created_by, updated_at, deleted_at
- `minefinds_world_invites`: world_id, join_code_hash, active, created_at
- `minefinds_world_members`: world_id, device_id, display_name, joined_at
- `minefinds_finds`: id, world_id, name, category, x, y, z, notes, created_by, updated_by, created_at, updated_at, deleted_at
- `minefinds_member_locations`: world_id, device_id, x, y, z, updated_at

Security:
- The Edge Function uses a per-installation device id + random secret for custom authentication.
- Only a SHA-256 hash of each device secret is stored server-side.
- RLS is enabled on all MineFinds tables with no public client policies; the Edge Function performs authorized operations with the service role.
- Plain join codes are never stored in Supabase; only a SHA-256 hash is stored server-side.
- The `minefinds-sync` Edge Function verifies world membership before returning or changing world data.

### 5. Existing MineFinds behavior retained
- Permanent local storage across sessions.
- Multiple worlds.
- X/Y/Z logging.
- Categories and notes.
- Search/edit/delete.
- Nearby sorting by distance.
- Seed Map links for the selected world and find coordinates.
- Bedrock/Java metadata and dimension selection.

### 6. Diamond boots branding
Use the approved pair of bright cyan/blue voxel diamond boots as the central MineFinds travel symbol.

Brand application:
- Launcher icon: boots only, centered and cropped for Android icon safety.
- Android system splash: the same boots launcher icon.
- In-app header: smaller boots plus MineFinds name.
- Recent-apps thumbnail uses the same launcher icon through Android app metadata.
- Keep the existing dark, blocky visual direction, but replace the temporary pickaxe branding.

### 7. Upgrade/signing rules
- Continue using the permanent MineFinds signing key established in v1.0.1.
- Increase versionCode/versionName for every new APK.
- Do not require uninstalling v1.0.1 for this update.
- SQLite migration from database version 1 to version 2 must preserve all existing local worlds and finds.

## Error handling
- Offline: show **Saved on this phone • Waiting to sync** rather than blocking the user.
- Invalid/expired join code: clear message and no partial world creation.
- Sync failure: keep local data, retry later, and show the failure without deleting anything.
- Unauthorized membership: never expose the world or its finds.
- Duplicate join attempt: treat as already joined rather than creating duplicate membership.

## Testing
- Unit tests for distance math, Seed Map URLs, join-code formatting, sync merge rules, and soft-delete behavior.
- Migration checks confirm the version 1 tables are upgraded instead of dropped.
- Backend acceptance checks cover device registration, create/share/join, find syncing, location syncing, and rejected unauthorized access.
- CI must build the APK, verify it exists, and verify the permanent signing certificate before publishing the artifact.
- Manual two-device acceptance flow: phone A creates/shares a world, phone B joins, each adds a find, each sees the other's find, Nearby remains based on each phone's own coordinates.

## Acceptance criteria
The build is ready when:
1. Existing v1.0.1 users can update without uninstalling or losing local data.
2. Hailey can create/share **Jason and Hailey** and receive a join code.
3. Jason can install MineFinds, join with that code, and see the same finds.
4. Either person can add/edit/delete and the other phone receives the change after sync.
5. Offline logging still works and later syncs.
6. Nearby is calculated from the current user/device's own coordinates.
7. The app launcher, splash, and in-app logo consistently use the approved diamond boots branding.
8. PocketRewards `pr_*` tables remain untouched.
9. The APK passes CI build/tests and permanent signing verification.
