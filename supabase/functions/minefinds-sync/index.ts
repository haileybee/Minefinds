import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,x-minefinds-device,x-minefinds-secret",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8" },
  });
}

function text(v: unknown, max = 2000) {
  return String(v ?? "").trim().slice(0, max);
}
function int(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
function uuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
async function hash(v: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function makeCode() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return [...b].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join("");
}

async function auth(req: Request, canRegister = false) {
  const id = req.headers.get("x-minefinds-device")?.trim() ?? "";
  const secret = req.headers.get("x-minefinds-secret")?.trim() ?? "";
  if (!uuid(id) || secret.length < 32) throw json({ ok: false, error: "Invalid device credentials" }, 401);
  const secretHash = await hash(secret);
  const { data, error } = await db.from("minefinds_devices").select("id,secret_hash").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    if (!canRegister) throw json({ ok: false, error: "Device not registered" }, 401);
    const { error: e } = await db.from("minefinds_devices").insert({ id, secret_hash: secretHash, created_at: Date.now() });
    if (e) throw new Error(e.message);
  } else if (data.secret_hash !== secretHash) {
    throw json({ ok: false, error: "Device authentication failed" }, 401);
  }
  return id;
}

async function member(worldId: string, deviceId: string) {
  const { data, error } = await db.from("minefinds_world_members").select("world_id").eq("world_id", worldId).eq("device_id", deviceId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw json({ ok: false, error: "You are not a member of this world" }, 403);
}

async function bundle(worldId: string) {
  const { data: world, error: we } = await db.from("minefinds_worlds").select("*").eq("id", worldId).maybeSingle();
  if (we) throw new Error(we.message);
  const { data: finds, error: fe } = await db.from("minefinds_finds").select("*").eq("world_id", worldId).order("updated_at", { ascending: false });
  if (fe) throw new Error(fe.message);
  const { data: members, error: me } = await db.from("minefinds_world_members").select("world_id,device_id,display_name,joined_at").eq("world_id", worldId);
  if (me) throw new Error(me.message);
  const { data: locations, error: le } = await db.from("minefinds_member_locations").select("world_id,device_id,x,y,z,updated_at").eq("world_id", worldId);
  if (le) throw new Error(le.message);
  const loc = new Map((locations ?? []).map((x: any) => [x.device_id, x]));
  const players = (members ?? []).map((m: any) => ({ ...m, location: loc.get(m.device_id) ?? null }));
  return { world, finds: finds ?? [], players };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return json({ ok: true });
    if (req.method === "GET") return json({ ok: true, service: "minefinds-sync", version: "1.1.0" });
    if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405);

    const body = await req.json().catch(() => ({}));
    const op = text(body?.op, 40);
    const deviceId = await auth(req, op === "register");
    if (op === "register") return json({ ok: true, device_id: deviceId });

    if (op === "create_world") {
      const w = body?.world ?? {};
      const worldId = text(w.id, 60);
      if (!uuid(worldId)) return json({ ok: false, error: "Invalid world id" }, 400);
      const displayName = text(body?.display_name, 60) || "Player";
      const { data: existing, error: ee } = await db.from("minefinds_worlds").select("id,updated_at").eq("id", worldId).maybeSingle();
      if (ee) throw new Error(ee.message);
      if (existing) await member(worldId, deviceId);
      const now = Date.now();
      const updatedAt = Math.max(int(w.updated_at, now), 1);
      if (!existing || updatedAt >= int(existing.updated_at, 0)) {
        const row: Record<string, unknown> = {
          id: worldId,
          name: text(w.name, 120) || "Minecraft World",
          seed: text(w.seed, 120),
          edition: text(w.edition, 30) || "Bedrock",
          minecraft_version: text(w.minecraft_version, 40) || "26.2",
          dimension: text(w.dimension, 40) || "Overworld",
          created_at: Math.max(int(w.created_at, now), 1),
          updated_at: updatedAt,
          deleted_at: w.deleted_at == null ? null : int(w.deleted_at),
        };
        if (!existing) row.created_by = deviceId;
        const { error } = await db.from("minefinds_worlds").upsert(row, { onConflict: "id" });
        if (error) throw new Error(error.message);
      }
      const { error: m } = await db.from("minefinds_world_members").upsert(
        { world_id: worldId, device_id: deviceId, display_name: displayName, joined_at: now },
        { onConflict: "world_id,device_id" },
      );
      if (m) throw new Error(m.message);
      return json({ ok: true, ...(await bundle(worldId)) });
    }

    if (op === "share_world") {
      const worldId = text(body?.world_id, 60);
      if (!uuid(worldId)) return json({ ok: false, error: "Invalid world id" }, 400);
      await member(worldId, deviceId);
      let code = "";
      let codeHash = "";
      for (let i = 0; i < 8; i++) {
        code = makeCode();
        codeHash = await hash(code);
        const { data } = await db.from("minefinds_world_invites").select("world_id").eq("join_code_hash", codeHash).maybeSingle();
        if (!data) break;
      }
      const { error } = await db.from("minefinds_world_invites").upsert(
        { world_id: worldId, join_code_hash: codeHash, active: true, created_at: Date.now() },
        { onConflict: "world_id" },
      );
      if (error) throw new Error(error.message);
      return json({ ok: true, join_code: code });
    }

    if (op === "join_world") {
      const code = text(body?.join_code, 20).toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code.length !== 8) return json({ ok: false, error: "Join code must be 8 characters" }, 400);
      const { data: invite, error: ie } = await db.from("minefinds_world_invites").select("world_id,active").eq("join_code_hash", await hash(code)).eq("active", true).maybeSingle();
      if (ie) throw new Error(ie.message);
      if (!invite) return json({ ok: false, error: "That join code is invalid or expired" }, 404);
      const displayName = text(body?.display_name, 60) || "Player";
      const { error: m } = await db.from("minefinds_world_members").upsert(
        { world_id: invite.world_id, device_id: deviceId, display_name: displayName, joined_at: Date.now() },
        { onConflict: "world_id,device_id" },
      );
      if (m) throw new Error(m.message);
      return json({ ok: true, ...(await bundle(invite.world_id)) });
    }

    if (op === "sync_world") {
      const worldId = text(body?.world_id, 60);
      if (!uuid(worldId)) return json({ ok: false, error: "Invalid world id" }, 400);
      await member(worldId, deviceId);
      const incoming = Array.isArray(body?.finds) ? body.finds.slice(0, 1000) : [];
      for (const f of incoming) {
        const findId = text(f?.id, 60);
        if (!uuid(findId)) continue;
        const { data: existing, error: qe } = await db.from("minefinds_finds").select("updated_at").eq("id", findId).maybeSingle();
        if (qe) throw new Error(qe.message);
        const updatedAt = Math.max(int(f?.updated_at, Date.now()), 1);
        if (!existing || updatedAt >= int(existing.updated_at, 0)) {
          const { error } = await db.from("minefinds_finds").upsert({
            id: findId,
            world_id: worldId,
            name: text(f?.name, 160) || "Saved find",
            category: text(f?.category, 80) || "Other",
            x: int(f?.x), y: int(f?.y), z: int(f?.z),
            notes: text(f?.notes, 5000),
            created_by: uuid(f?.created_by) ? f.created_by : deviceId,
            updated_by: deviceId,
            created_at: Math.max(int(f?.created_at, updatedAt), 1),
            updated_at: updatedAt,
            deleted_at: f?.deleted_at == null ? null : int(f.deleted_at),
          }, { onConflict: "id" });
          if (error) throw new Error(error.message);
        }
      }
      const loc = body?.location;
      if (loc && typeof loc === "object") {
        const { error } = await db.from("minefinds_member_locations").upsert({
          world_id: worldId,
          device_id: deviceId,
          x: int(loc.x), y: int(loc.y, 64), z: int(loc.z),
          updated_at: Math.max(int(loc.updated_at, Date.now()), 1),
        }, { onConflict: "world_id,device_id" });
        if (error) throw new Error(error.message);
      }
      return json({ ok: true, ...(await bundle(worldId)) });
    }

    return json({ ok: false, error: "Unknown operation" }, 400);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : "Unexpected server error" }, 500);
  }
});
