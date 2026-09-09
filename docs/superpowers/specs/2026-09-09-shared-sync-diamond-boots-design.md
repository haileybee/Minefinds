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
- A compact **Players** section may show the latest synced coordinate for each member with a last-updated time.

### 3. Sync behavior
- Each phone receives an anonymous app identity so no email/password account is required.
- Local records receive stable UUIDs so the same find is not duplicated across devices.
- Create/edit/delete operations are queued locally when offline.
- Sync runs when the app opens, when returning online, after a local edit, and via pull-to-refresh.
- Conflicts use last-write-wins based on `updated_at` for v1.
- Deletes are soft-deleted in the cloud so an offline phone cannot accidentally resurrect a deleted find.

### 4. Private backend
Use a dedicated new Supabase project for MineFinds only. It must not reuse or modify MoMHQ, PocketRewards, Disabled Veterans to Beekeepers, or any other project.

Cloud tables:
- `worlds`: id, name, seed, edition, minecraft_version, dimension, created_by, updated_at, deleted_at
- `world_invites`: world_id, join_code_hash, active, created_at
- `world_members`: world_id, user_id, display_name, joined_at
- `finds`: id, world_id, title, category, x, y, z, notes, created_by, updated_by, created_at, updated_at, deleted_at
- `member_locations`: world_id, user_id, x, y, z, updated_at

Security:
- Supabase anonymous authentication for each installation.
- Row Level Security limits world and find access to members of that world.
- Plain join codes are never stored; only a hash is stored server-side.
- Joining a world is handled by a server-side function/RPC so users cannot query invite hashes.

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
- Launcher icon: boots only, centered and cropped for Android adaptive icon safety.
- Splash screen: boots plus MineFinds wordmark.
- In-app header: smaller boots plus MineFinds name.
- Recent-apps thumbnail uses the same launcher icon through Android app metadata.
- Keep the existing dark, blocky visual direction, but replace the temporary pickaxe branding.

### 7. Upgrade/signing rules
- Continue using the permanent MineFinds signing key established in v1.0.1.
- Increase versionCode/versionName for every new APK.
- Do not require uninstalling v1.0.1 for this update.
- Database migrations must preserve all existing local worlds/finds.

## Error handling
- Offline: show **Saved on this phone • Waiting to sync** rather than blocking the user.
- Invalid/expired join code: clear inline message, no partial world creation.
- Sync failure: keep local data, retry later, and show last successful sync time.
- Unauthorized membership: never expose the world or its finds.
- Duplicate join attempt: treat as already joined rather than creating duplicate membership.

## Testing
- Unit tests for distance math, Seed Map URLs, join-code formatting, sync merge rules, and soft-delete behavior.
- SQLite migration test from the current schema to the shared-sync schema.
- Instrumented/logic tests for create world, join world, add/edit/delete find, offline queue, and resync.
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
8. The APK passes CI build/tests and permanent signing verification.
