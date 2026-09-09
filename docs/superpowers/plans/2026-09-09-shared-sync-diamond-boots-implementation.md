# MineFinds Shared Sync + Diamond Boots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship MineFinds v1.1.0 with private two-phone shared worlds, offline-first sync, per-player coordinates, and diamond-boots branding while preserving v1.0.1 local data and signing compatibility.

**Architecture:** Keep SQLite as the on-device source/cache and add stable UUIDs plus tombstones for sync. Reuse PocketRewards Supabase project `jytglrhvkzbsfpizjtrp` with isolated `minefinds_*` tables and one custom-authenticated `minefinds-sync` Edge Function. The Android app calls the function with a locally generated device id/secret; no email/password account is required.

**Tech Stack:** Android Java, SQLite, `HttpURLConnection`, `org.json`, Supabase Postgres, Supabase Edge Functions (Deno/TypeScript), GitHub Actions, Android SDK 35.

**Spec:** `docs/superpowers/specs/2026-09-09-shared-sync-diamond-boots-design.md`

## Global Constraints
- Reuse PocketRewards project `jytglrhvkzbsfpizjtrp`; do not create another Supabase project.
- Do not alter or delete existing PocketRewards `pr_*` tables.
- All new backend objects use `minefinds_*` names except the Edge Function `minefinds-sync`.
- Preserve SQLite database name `minefinds.db` and migrate DB version 1 to version 2 without dropping `worlds` or `finds`.
- Preserve application id `com.hailey.minefinds` and permanent v1.0.1 signing certificate.
- Build version: `versionCode 3`, `versionName 1.1.0`.
- Nearby distance always uses the current device's local X/Z coordinates.
- Offline local edits must never be blocked by network failure.

---

### Task 1: PocketRewards MineFinds schema

**Files:**
- Backend migration only: Supabase migration `minefinds_shared_sync_v1`

**Interfaces:**
- Produces tables `minefinds_devices`, `minefinds_worlds`, `minefinds_world_invites`, `minefinds_world_members`, `minefinds_finds`, `minefinds_member_locations`.

- [ ] Apply DDL creating only `minefinds_*` tables, indexes, foreign keys, and RLS.
- [ ] List public tables and confirm existing `pr_*` tables still exist unchanged.
- [ ] Run Supabase security advisor after migration.

### Task 2: Custom-authenticated `minefinds-sync` Edge Function

**Files:**
- Edge Function: `minefinds-sync/index.ts`

**Interfaces:**
- Request headers: `X-MineFinds-Device`, `X-MineFinds-Secret`.
- Request JSON operations: `register`, `create_world`, `share_world`, `join_world`, `sync_world`.
- Response JSON: `{ok:true,...}` on success or `{ok:false,error:"..."}` with appropriate HTTP status.

- [ ] Implement SHA-256 device-secret authentication and registration.
- [ ] Implement membership-checked create/share/join flows using 8-character codes whose plaintext is never stored server-side.
- [ ] Implement `sync_world` last-write-wins upsert for world metadata/finds, soft deletes, member location update, and canonical world/find/member/player response.
- [ ] Deploy with `verify_jwt=false` because the function performs its own device-secret authentication.
- [ ] Exercise register/create/share/join/sync with two temporary device identities and verify a non-member cannot fetch a world.

### Task 3: SQLite v1 → v2 migration and sync models

**Files:**
- Modify: `app/src/main/java/com/hailey/minefinds/DatabaseHelper.java`
- Modify: `app/src/main/java/com/hailey/minefinds/World.java`
- Modify: `app/src/main/java/com/hailey/minefinds/FindItem.java`
- Create: `app/src/main/java/com/hailey/minefinds/PlayerLocation.java`
- Create: `app/src/main/java/com/hailey/minefinds/DeviceIdentity.java`
- Create: `app/src/main/java/com/hailey/minefinds/SyncMergeUtils.java`
- Create: `app/src/main/java/com/hailey/minefinds/JoinCodeUtils.java`

**Interfaces:**
- Existing numeric local `worlds.id` / `finds.id` remain stable.
- New `cloud_uuid` columns provide cross-device identity.
- Deleted finds remain as local tombstones with `deleted_at` and are filtered from normal UI queries.

- [ ] Set `DB_VERSION=2` and add migration ALTER statements without dropping existing tables.
- [ ] Backfill UUIDs for existing worlds/finds and initialize sync metadata.
- [ ] Add local players cache and helpers for cloud import/merge.
- [ ] Add pure-Java merge/join-code logic suitable for CI tests.

### Task 4: Android sync client and shared-world UI

**Files:**
- Create: `app/src/main/java/com/hailey/minefinds/MineFindsSyncClient.java`
- Modify: `app/src/main/java/com/hailey/minefinds/MainActivity.java`
- Modify: `app/src/main/AndroidManifest.xml`

**Interfaces:**
- Edge endpoint: `https://jytglrhvkzbsfpizjtrp.supabase.co/functions/v1/minefinds-sync`.
- `MineFindsSyncClient` performs network work off the UI thread and returns results on the main thread.

- [ ] Register the local device identity lazily before the first cloud action.
- [ ] Add `Join Shared World` to the world bar/welcome flow.
- [ ] Add `Share World` and `Sync now` controls for the active world.
- [ ] Share flow asks/stores the local display name and shows/copies the returned 8-character code.
- [ ] Join flow asks for code + display name, imports the returned shared world/finds/players into SQLite, and selects it.
- [ ] Local add/edit/delete/location operations save immediately first, then attempt background sync; failure shows `Saved on this phone • Waiting to sync`.
- [ ] Nearby continues using this device's `current_x/current_z`; a Players section shows synced member locations separately.

### Task 5: Diamond-boots branding

**Files:**
- Add launcher PNGs under `app/src/main/res/mipmap-*`.
- Add in-app boots image under `app/src/main/res/drawable-nodpi/minefinds_boots.png`.
- Modify `AndroidManifest.xml` icon metadata.
- Modify `MainActivity.java` header.

**Interfaces:**
- Launcher/recent-app icon: boots-only artwork.
- In-app header: boots image + `MineFinds` title.

- [ ] Generate density-specific icon assets from the approved transparent boots artwork.
- [ ] Set application `android:icon` and `android:roundIcon`.
- [ ] Replace the pickaxe header with the boots logo.
- [ ] Verify PNG dimensions and alpha channels.

### Task 6: Tests, packaging, stable signing, and APK artifact

**Files:**
- Modify: `app/src/test/java/com/hailey/minefinds/CoreBehaviorTest.java`
- Modify: `.github/workflows/build-apk.yml`
- Replace: `.payload/project.b64.part*`

**Interfaces:**
- CI artifact: `MineFinds-APK-v1.1.0` containing `app-debug.apk` signed with the permanent MineFinds key.

- [ ] Add pure-Java tests for distance, Seed Map URLs, 8-character join-code validation, merge timestamps, and soft-delete visibility.
- [ ] Run local source/static checks and create a reproducible tar.gz/base64 payload.
- [ ] Update workflow to reconstruct the new payload, build `versionCode 3` / `versionName 1.1.0`, run core tests, verify APK existence, and verify the existing signing certificate fingerprint.
- [ ] Push payload/workflow, wait for GitHub Actions, inspect job steps, and fix any compiler/test failure before proceeding.
- [ ] Download the successful artifact, extract `MineFinds-v1.1.0.apk`, and verify it locally as a valid ZIP/APK with `AndroidManifest.xml` present.
