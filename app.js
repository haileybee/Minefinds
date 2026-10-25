"use strict";
/* ============================================================================
   MineFinds standalone — plain JS, no build step.
   Backend switch: if config.js still holds placeholders -> LOCAL DEMO MODE
   (localStorage, seeded with the migration data). If real Supabase values are
   in config.js -> Supabase Auth + database. Config-only change.
   ========================================================================== */

// ---------- Pure math (also used by the local tests) ----------
function stackMath(amount, size) {
  amount = Math.max(0, Math.floor(Number(amount) || 0));
  size = [64, 16, 1].includes(Number(size)) ? Number(size) : 64;
  let fullStacks, remainder, slots;
  if (size === 1) { fullStacks = amount; remainder = 0; slots = amount; }
  else { fullStacks = Math.floor(amount / size); remainder = amount % size; slots = fullStacks + (remainder > 0 ? 1 : 0); }
  return {
    amount, size, fullStacks, remainder, slots,
    shulkerBoxes: Math.ceil(slots / 27),
    doubleChests: Math.ceil(slots / 54),
  };
}
function stackText(m) {
  if (m.amount === 0) return "0 items";
  if (m.size === 1) return `${m.amount} items (no stack — 1 per slot) · ${m.slots} slots`;
  const main = m.remainder > 0 ? `${m.fullStacks} full stack${m.fullStacks === 1 ? "" : "s"} + ${m.remainder} more`
                               : `${m.fullStacks} full stack${m.fullStacks === 1 ? "" : "s"}`;
  return `${main} · ${m.slots} slot${m.slots === 1 ? "" : "s"} · ${m.shulkerBoxes} shulker box${m.shulkerBoxes === 1 ? "" : "es"} / ${m.doubleChests} double chest${m.doubleChests === 1 ? "" : "s"}`;
}
function overworldToNether(x, y, z) { return { x: Math.floor(x / 8), y: Math.floor(y), z: Math.floor(z / 8) }; }
function netherToOverworld(x, y, z) { return { x: Math.floor(x) * 8, y: Math.floor(y), z: Math.floor(z) * 8 }; }
function dist3d(a, b) { return Math.round(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)); }
function youtubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}
// Expose pure helpers for headless tests.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { stackMath, stackText, overworldToNether, netherToOverworld, dist3d, youtubeId };
}
/* Browser-only code below. In a headless Node test run, `document` is
   undefined and this whole block is skipped (a top-level `return` would be
   a syntax error in a classic browser script, so a block is used instead). */
if (typeof document !== "undefined") {

// ---------- Config / mode ----------
const cfg = window.MINEFINDS_CONFIG || {};
const DEMO = !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR_") || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes("YOUR_");
let sb = null;
if (!DEMO && window.supabase) sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

// ---------- Migration seed data (demo mode) — exact snapshot values ----------
const MIGRATION = {
  seed: "-5701622969722961025",
  finds: [
    { id: "find-1", name: "Iron farm/ spawn", dimension: "Overworld", x: 0, y: 66, z: 0, note: "Iron farm" },
    { id: "find-2", name: "Village", dimension: "Overworld", x: 280, y: 63, z: 200, note: "Closest village to home" },
  ],
  videos: [
    { id: "video-1", title: "home", url: "https://youtu.be/yHVqPbxfQis?si=dqFGOcg2cNcnfMb7", youtube_id: "yHVqPbxfQis", note: "", status: "building" },
  ],
  needs: [
    { id: "need-1", item_name: "Dark oak planks", amount_needed: 866, gathered: 0, stack_size: 64 },
  ],
  lore: [
    { id: "lore-1", day_number: 1, title: "Found Princess Peach, the rare pink sheep",
      story: "Day 1: I found a rare pink sheep — she had spawned naturally, which almost never happens (about a 0.164% chance). I named her Princess Peach.",
      created_at: "2026-10-24", updated_at: "2026-10-24" },
  ],
};

// ---------- Store abstraction ----------
const LS_KEY = "minefinds_demo_v1";
let worldId = null;
const Store = {
  state: null,
  loadDemo() {
    try { this.state = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { this.state = null; }
    if (!this.state) { this.state = JSON.parse(JSON.stringify(MIGRATION)); this.saveDemo(); }
    // Older demo saves (from before the Lore tab existed) have no lore list —
    // give them the seeded Day 1 entry instead of breaking.
    if (!Array.isArray(this.state.lore)) { this.state.lore = JSON.parse(JSON.stringify(MIGRATION.lore)); this.saveDemo(); }
    return this.state;
  },
  saveDemo() { localStorage.setItem(LS_KEY, JSON.stringify(this.state)); },
  newId(prefix) { return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

  async loadAll() {
    if (DEMO) return this.loadDemo();
    const { data: worlds, error } = await sb.from("worlds").select("id").limit(1);
    if (error) throw error;
    if (!worlds || !worlds.length) throw new Error("No world found yet — run migration-import.sql in Supabase first.");
    worldId = worlds[0].id;
    const [settings, finds, videos, needs, lore] = await Promise.all([
      sb.from("settings").select("seed").eq("world_id", worldId).limit(1),
      sb.from("finds").select("*").eq("world_id", worldId).order("created_at"),
      sb.from("build_videos").select("*").eq("world_id", worldId).order("created_at"),
      sb.from("need_items").select("*").eq("world_id", worldId).order("created_at"),
      sb.from("lore_entries").select("*").eq("world_id", worldId).order("day_number"),
    ]);
    this.state = {
      seed: settings.data && settings.data[0] ? String(settings.data[0].seed) : "",
      finds: (finds.data || []).map(f => ({ id: f.id, name: f.name, dimension: f.dimension, x: f.x, y: f.y, z: f.z, note: f.note || "" })),
      videos: (videos.data || []).map(v => ({ id: v.id, title: v.title, url: v.url, youtube_id: v.youtube_id, note: v.note || "", status: v.status })),
      needs: (needs.data || []).map(n => ({ id: n.id, item_name: n.item_name, amount_needed: n.amount_needed, gathered: n.gathered, stack_size: n.stack_size })),
      lore: (lore.data || []).map(l => ({ id: l.id, day_number: l.day_number, title: l.title, story: l.story || "", created_at: l.created_at || "", updated_at: l.updated_at || "" })),
    };
    return this.state;
  },
  async setSeed(seed) {
    this.state.seed = seed;
    if (DEMO) { this.saveDemo(); return; }
    const { data } = await sb.from("settings").select("id").eq("world_id", worldId).limit(1);
    if (data && data.length) await sb.from("settings").update({ seed }).eq("id", data[0].id);
    else await sb.from("settings").insert({ world_id: worldId, seed });
  },
  async upsertFind(f) {
    if (DEMO) {
      if (f.id) { const i = this.state.finds.findIndex(x => x.id === f.id); if (i >= 0) this.state.finds[i] = f; }
      else { f.id = this.newId("find"); this.state.finds.push(f); }
      this.saveDemo(); return f;
    }
    const row = { world_id: worldId, name: f.name, dimension: f.dimension, x: f.x, y: f.y, z: f.z, note: f.note || null };
    if (f.id && !String(f.id).startsWith("find-")) row.id = f.id;
    const { data, error } = await sb.from("finds").upsert(row).select().single();
    if (error) throw error; f.id = data.id; return f;
  },
  async deleteFind(id) {
    if (DEMO) { this.state.finds = this.state.finds.filter(x => x.id !== id); this.saveDemo(); return; }
    await sb.from("finds").delete().eq("id", id);
  },
  async upsertVideo(v) {
    if (DEMO) {
      if (v.id) { const i = this.state.videos.findIndex(x => x.id === v.id); if (i >= 0) this.state.videos[i] = v; }
      else { v.id = this.newId("video"); this.state.videos.push(v); }
      this.saveDemo(); return v;
    }
    const row = { world_id: worldId, title: v.title, url: v.url, youtube_id: v.youtube_id, note: v.note || null, status: v.status };
    if (v.id && !String(v.id).startsWith("video-")) row.id = v.id;
    const { data, error } = await sb.from("build_videos").upsert(row).select().single();
    if (error) throw error; v.id = data.id; return v;
  },
  async deleteVideo(id) {
    if (DEMO) { this.state.videos = this.state.videos.filter(x => x.id !== id); this.saveDemo(); return; }
    await sb.from("build_videos").delete().eq("id", id);
  },
  async upsertNeed(n) {
    n.gathered = Math.max(0, Math.min(n.gathered, n.amount_needed));
    if (DEMO) {
      if (n.id) { const i = this.state.needs.findIndex(x => x.id === n.id); if (i >= 0) this.state.needs[i] = n; }
      else { n.id = this.newId("need"); this.state.needs.push(n); }
      this.saveDemo(); return n;
    }
    const row = { world_id: worldId, item_name: n.item_name, amount_needed: n.amount_needed, gathered: n.gathered, stack_size: n.stack_size };
    if (n.id && !String(n.id).startsWith("need-")) row.id = n.id;
    const { data, error } = await sb.from("need_items").upsert(row).select().single();
    if (error) throw error; n.id = data.id; return n;
  },
  async deleteNeed(id) {
    if (DEMO) { this.state.needs = this.state.needs.filter(x => x.id !== id); this.saveDemo(); return; }
    await sb.from("need_items").delete().eq("id", id);
  },
  async clearGathered() {
    const got = this.state.needs.filter(n => n.gathered >= n.amount_needed && n.amount_needed > 0);
    for (const n of got) await this.deleteNeed(n.id);
    this.state.needs = this.state.needs.filter(n => !(n.gathered >= n.amount_needed && n.amount_needed > 0));
    if (DEMO) this.saveDemo();
  },
  async upsertLore(l) {
    l.day_number = Math.max(1, Math.floor(Number(l.day_number) || 1));
    if (DEMO) {
      const now = new Date().toISOString();
      if (l.id) {
        const i = this.state.lore.findIndex(x => x.id === l.id);
        if (i >= 0) { l.created_at = this.state.lore[i].created_at || now; l.updated_at = now; this.state.lore[i] = l; }
      } else { l.id = this.newId("lore"); l.created_at = now; l.updated_at = now; this.state.lore.push(l); }
      this.saveDemo(); return l;
    }
    const row = { world_id: worldId, day_number: l.day_number, title: l.title, story: l.story || null };
    if (l.id && !String(l.id).startsWith("lore-")) row.id = l.id;
    const { data, error } = await sb.from("lore_entries").upsert(row).select().single();
    if (error) throw error;
    l.id = data.id; l.created_at = data.created_at || l.created_at || ""; l.updated_at = data.updated_at || "";
    return l;
  },
  async deleteLore(id) {
    if (DEMO) { this.state.lore = this.state.lore.filter(x => x.id !== id); this.saveDemo(); return; }
    await sb.from("lore_entries").delete().eq("id", id);
  },
};

// ---------- UI helpers ----------
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let toastTimer = null;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}
const STATUS_LABEL = { building: "Building", want_to_build: "Want to Build", built: "Built" };
const STATUS_ORDER = ["building", "want_to_build", "built"];
let videoFilter = "all", playingId = null;

// ---------- Rendering ----------
function renderAll() {
  const s = Store.state;
  $("seed-display").textContent = s.seed || "—";
  $("chunkbase-link").href = s.seed
    ? `https://www.chunkbase.com/apps/seed-map#seed=${encodeURIComponent(s.seed)}`
    : "https://www.chunkbase.com/apps/seed-map";
  $("count-finds").textContent = s.finds.length ? `(${s.finds.length})` : "";
  $("count-builds").textContent = s.videos.length ? `(${s.videos.length})` : "";
  $("count-needs").textContent = s.needs.length ? `(${s.needs.length})` : "";
  $("count-lore").textContent = s.lore.length ? `(${s.lore.length})` : "";
  renderFinds(); renderVideos(); renderNeeds(); renderNetherPicker(); renderLore();
}
function loreDateLabel(l) {
  const raw = l.updated_at || l.created_at;
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const when = d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  return l.created_at && l.updated_at && l.created_at !== l.updated_at ? `Updated ${when}` : `Logged ${when}`;
}
function renderLore() {
  // Timeline order: by day number, Day 1 first (ties: earliest logged first),
  // so the list reads like the world's story from the start.
  const q = $("lore-search").value.trim().toLowerCase();
  const list = [...Store.state.lore]
    .sort((a, b) => (a.day_number - b.day_number) || String(a.created_at || "").localeCompare(String(b.created_at || "")))
    .filter(l => !q || (("day " + l.day_number) + " " + l.title + " " + (l.story || "")).toLowerCase().includes(q));
  $("lore-list").innerHTML = list.length ? list.map(l => `
    <article class="lore-card">
      <p class="card-title"><span class="badge">Day ${l.day_number}</span> ${esc(l.title)}</p>
      ${l.story ? `<p class="card-sub lore-story">${esc(l.story)}</p>` : ""}
      ${loreDateLabel(l) ? `<p class="card-sub">${esc(loreDateLabel(l))}</p>` : ""}
      <div class="btn-row">
        <button class="btn btn-small" data-edit-lore="${l.id}">Edit</button>
        <button class="btn btn-small" data-del-lore="${l.id}">Delete</button>
      </div>
    </article>`).join("") : `<p class="empty">No lore yet — add the story of your world above.</p>`;
}
function renderFinds() {
  const q = $("find-search").value.trim().toLowerCase();
  const list = Store.state.finds.filter(f => !q || (f.name + " " + (f.note || "") + " " + f.dimension).toLowerCase().includes(q));
  $("finds-list").innerHTML = list.length ? list.map(f => `
    <article class="find-card">
      <p class="card-title">${esc(f.name)} <span class="badge">${esc(f.dimension)}</span></p>
      <p class="coords">X ${f.x} · Y ${f.y} · Z ${f.z}</p>
      ${f.note ? `<p class="card-sub">${esc(f.note)}</p>` : ""}
      <div class="btn-row">
        <button class="btn btn-small" data-copy="${f.x} ${f.y} ${f.z}">Copy coords</button>
        <button class="btn btn-small" data-edit-find="${f.id}">Edit</button>
        <button class="btn btn-small" data-del-find="${f.id}">Delete</button>
      </div>
    </article>`).join("") : `<p class="empty">No finds yet — log your first one above.</p>`;
}
function renderVideos() {
  const q = $("video-search").value.trim().toLowerCase();
  const all = Store.state.videos;
  let html = "";
  for (const st of STATUS_ORDER) {
    const group = all.filter(v => v.status === st && (videoFilter === "all" || videoFilter === st) && (!q || (v.title + " " + (v.note || "")).toLowerCase().includes(q)));
    if (videoFilter !== "all" && videoFilter !== st) continue;
    html += `<h3 class="group-title">${STATUS_LABEL[st]} (${all.filter(v => v.status === st).length})</h3>`;
    html += group.length ? group.map(v => `
      <article class="video-card">
        <p class="card-title">${esc(v.title)} <span class="badge ${st === "want_to_build" ? "badge-want" : st === "built" ? "badge-built" : ""}">${STATUS_LABEL[st]}</span></p>
        ${v.note ? `<p class="card-sub">${esc(v.note)}</p>` : ""}
        ${v.youtube_id ? (playingId === v.id
          ? `<iframe class="video-frame" src="https://www.youtube.com/embed/${v.youtube_id}" title="${esc(v.title)}" allowfullscreen></iframe>`
          : `<div class="thumb-wrap"><img loading="lazy" src="https://i.ytimg.com/vi/${v.youtube_id}/hqdefault.jpg" alt="Thumbnail for ${esc(v.title)}"><button class="thumb-play" data-play="${v.id}" aria-label="Play ${esc(v.title)}">▶</button></div>`)
        : ""}
        <div class="btn-row">
          <a class="btn btn-small" href="${esc(v.url)}" target="_blank" rel="noopener">Open in YouTube ↗</a>
          ${st === "want_to_build" ? `<button class="btn btn-small" data-move-video="${v.id}:building">Start building</button>` : ""}
          ${st === "building" ? `<button class="btn btn-small" data-move-video="${v.id}:built">Mark built</button>` : ""}
          ${st === "built" ? `<button class="btn btn-small" data-move-video="${v.id}:building">Back to Building</button>` : ""}
          <button class="btn btn-small" data-edit-video="${v.id}">Edit</button>
          <button class="btn btn-small" data-del-video="${v.id}">Delete</button>
        </div>
      </article>`).join("") : `<p class="empty">Nothing here yet.</p>`;
  }
  $("videos-list").innerHTML = html;
}
function needCard(n) {
  const m = stackMath(n.amount_needed, n.stack_size);
  const pct = n.amount_needed > 0 ? Math.round((n.gathered / n.amount_needed) * 100) : 0;
  return `
    <article class="need-card">
      <p class="card-title">${esc(n.item_name)}</p>
      <p class="card-sub">${stackText(m)}</p>
      <p class="coords">Gathered ${n.gathered} / ${n.amount_needed}</p>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="gather-row">
        <button class="btn" data-gather="${n.id}:-${n.stack_size}">− stack</button>
        <button class="btn" data-gather="${n.id}:-1">−1</button>
        <input type="number" min="0" max="${n.amount_needed}" value="${n.gathered}" data-gather-input="${n.id}" aria-label="Gathered amount for ${esc(n.item_name)}">
        <button class="btn" data-gather="${n.id}:1">+1</button>
        <button class="btn" data-gather="${n.id}:${n.stack_size}">+ stack</button>
      </div>
      <div class="btn-row">
        ${n.gathered < n.amount_needed ? `<button class="btn btn-small" data-got="${n.id}">Mark got it</button>` : ""}
        <button class="btn btn-small" data-edit-need="${n.id}">Edit</button>
        <button class="btn btn-small" data-del-need="${n.id}">Delete</button>
      </div>
    </article>`;
}
function renderNeeds() {
  const q = $("need-search").value.trim().toLowerCase();
  const all = Store.state.needs.filter(n => !q || n.item_name.toLowerCase().includes(q));
  const still = all.filter(n => n.gathered < n.amount_needed);
  const got = all.filter(n => n.gathered >= n.amount_needed && n.amount_needed > 0);
  $("still-count").textContent = `(${still.length})`;
  $("got-count").textContent = `(${got.length})`;
  $("needs-count-label").textContent = Store.state.needs.length ? `(${Store.state.needs.length})` : "";
  $("needs-still-list").innerHTML = still.length ? still.map(needCard).join("") : `<p class="empty">Nothing still needed.</p>`;
  $("needs-got-list").innerHTML = got.length ? got.map(needCard).join("") : `<p class="empty">Nothing gathered yet.</p>`;
  $("clear-gathered-btn").hidden = got.length === 0;
}
function renderNetherPicker() {
  const sel = $("nether-find-picker");
  const cur = sel.value;
  sel.innerHTML = `<option value="">— type coords below —</option>` + Store.state.finds.map(f =>
    `<option value="${f.id}">${esc(f.name)} (${f.x}, ${f.y}, ${f.z})</option>`).join("");
  sel.value = cur;
}

// ---------- Nearby (while typing a find) ----------
function updateNearby() {
  const x = parseInt($("find-x").value, 10), y = parseInt($("find-y").value, 10), z = parseInt($("find-z").value, 10);
  const box = $("nearby-box"), editId = $("find-id").value;
  if ([x, y, z].some(Number.isNaN)) { box.hidden = true; return; }
  const near = Store.state.finds.filter(f => f.id !== editId)
    .map(f => ({ f, d: dist3d({ x, y, z }, f) })).filter(n => n.d <= 1000).sort((a, b) => a.d - b.d);
  if (!near.length) { box.hidden = true; return; }
  box.innerHTML = "<strong>Nearby finds:</strong><br>" + near.map(n => `${esc(n.f.name)} — ${n.d} blocks away (${n.f.x}, ${n.f.y}, ${n.f.z})`).join("<br>");
  box.hidden = false;
}

// ---------- Nether ----------
let netherDir = "to-nether", netherResult = null;
function updateNether() {
  const x = parseFloat($("nether-x").value), y = parseFloat($("nether-y").value), z = parseFloat($("nether-z").value);
  const box = $("nether-result");
  if ([x, y, z].some(Number.isNaN)) { box.innerHTML = ""; netherResult = null; $("nether-copy-btn").hidden = true; $("nether-save-btn").hidden = true; return; }
  const r = netherDir === "to-nether" ? overworldToNether(x, y, z) : netherToOverworld(x, y, z);
  netherResult = r;
  const op = netherDir === "to-nether" ? "÷ 8" : "× 8";
  const fromName = netherDir === "to-nether" ? "Overworld" : "Nether";
  const toName = netherDir === "to-nether" ? "Nether" : "Overworld";
  box.innerHTML = `<strong>${toName}: X ${r.x} · Y ${r.y} · Z ${r.z}</strong><br>` +
    `X: ${x} ${op} = ${r.x}<br>Y: ${y} (unchanged) = ${r.y}<br>Z: ${z} ${op} = ${r.z}<br>` +
    `<span class="hint">Build your ${toName} portal at ${r.x}, ${r.y}, ${r.z} to link with ${fromName} ${x}, ${y}, ${z}.</span>`;
  $("nether-copy-btn").hidden = false; $("nether-save-btn").hidden = false;
}

// ---------- Calculator ----------
function updateCalc() {
  const amount = parseInt($("calc-amount").value, 10);
  const size = parseInt($("calc-size").value, 10);
  $("calc-result").innerHTML = Number.isNaN(amount) ? "" :
    `<strong>${esc($("calc-item").value.trim() || "Item")}:</strong> ${stackText(stackMath(amount, size))}`;
}

// ---------- Events ----------
function bind() {
  // Tabs
  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".tab-panel").forEach(p => { p.hidden = p.id !== "tab-" + btn.dataset.tab; });
  }));
  // Seed
  $("seed-edit-btn").addEventListener("click", () => { $("seed-input").value = Store.state.seed || ""; $("seed-form").hidden = false; });
  $("seed-cancel-btn").addEventListener("click", () => { $("seed-form").hidden = true; });
  $("seed-form").addEventListener("submit", async e => {
    e.preventDefault(); await Store.setSeed($("seed-input").value.trim()); $("seed-form").hidden = true; renderAll(); toast("Seed saved");
  });
  // Finds
  ["find-x", "find-y", "find-z"].forEach(id => $(id).addEventListener("input", updateNearby));
  $("find-search").addEventListener("input", renderFinds);
  $("find-form").addEventListener("submit", async e => {
    e.preventDefault();
    const f = { id: $("find-id").value || null, name: $("find-what").value.trim(), dimension: $("find-dimension").value,
      x: parseInt($("find-x").value, 10), y: parseInt($("find-y").value, 10), z: parseInt($("find-z").value, 10), note: $("find-note").value.trim() };
    await Store.upsertFind(f); e.target.reset(); $("find-id").value = ""; $("find-form-title").textContent = "Log a find";
    $("find-cancel-edit").hidden = true; $("nearby-box").hidden = true; renderAll(); toast("Find saved");
  });
  $("find-cancel-edit").addEventListener("click", () => { $("find-form").reset(); $("find-id").value = ""; $("find-form-title").textContent = "Log a find"; $("find-cancel-edit").hidden = true; });
  // Videos
  $("video-search").addEventListener("input", renderVideos);
  $("video-filters").addEventListener("click", e => {
    const c = e.target.closest(".chip"); if (!c) return; videoFilter = c.dataset.filter;
    document.querySelectorAll("#video-filters .chip").forEach(x => x.classList.toggle("active", x === c)); renderVideos();
  });
  $("video-form").addEventListener("submit", async e => {
    e.preventDefault();
    const url = $("video-url").value.trim();
    const v = { id: $("video-id").value || null, title: $("video-title").value.trim(), url, youtube_id: youtubeId(url), note: $("video-note").value.trim(), status: $("video-status").value };
    await Store.upsertVideo(v); e.target.reset(); $("video-id").value = ""; $("video-form-title").textContent = "Add a build video";
    $("video-cancel-edit").hidden = true; renderAll(); toast("Video saved");
  });
  $("video-cancel-edit").addEventListener("click", () => { $("video-form").reset(); $("video-id").value = ""; $("video-form-title").textContent = "Add a build video"; $("video-cancel-edit").hidden = true; });
  // Stacks calculator
  ["calc-amount", "calc-size", "calc-item"].forEach(id => $(id).addEventListener("input", updateCalc));
  $("calc-form").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("calc-item").value.trim(), amount = parseInt($("calc-amount").value, 10);
    if (!name || Number.isNaN(amount)) { toast("Type an item and how many you need first"); return; }
    await Store.upsertNeed({ id: null, item_name: name, amount_needed: amount, gathered: 0, stack_size: parseInt($("calc-size").value, 10) });
    e.target.reset(); $("calc-result").innerHTML = ""; renderAll(); toast("Added to Things I Need");
  });
  $("need-search").addEventListener("input", renderNeeds);
  $("clear-gathered-btn").addEventListener("click", async () => {
    if (!confirm("Remove all “Got it” items from the list?")) return;
    await Store.clearGathered(); renderAll(); toast("Gathered items cleared");
  });
  $("need-edit-form").addEventListener("submit", async e => {
    e.preventDefault();
    const n = Store.state.needs.find(x => x.id === $("need-edit-id").value); if (!n) return;
    n.item_name = $("need-edit-name").value.trim(); n.amount_needed = parseInt($("need-edit-amount").value, 10);
    n.stack_size = parseInt($("need-edit-size").value, 10); n.gathered = Math.min(n.gathered, n.amount_needed);
    await Store.upsertNeed(n); $("need-edit-form").hidden = true; renderAll(); toast("Item saved");
  });
  $("need-edit-cancel").addEventListener("click", () => { $("need-edit-form").hidden = true; });
  // Nether
  $("dir-to-nether").addEventListener("click", () => { netherDir = "to-nether"; $("dir-to-nether").classList.add("active", "btn-primary"); $("dir-to-overworld").classList.remove("active", "btn-primary"); updateNether(); });
  $("dir-to-overworld").addEventListener("click", () => { netherDir = "to-overworld"; $("dir-to-overworld").classList.add("active", "btn-primary"); $("dir-to-nether").classList.remove("active", "btn-primary"); updateNether(); });
  ["nether-x", "nether-y", "nether-z"].forEach(id => $(id).addEventListener("input", updateNether));
  $("nether-find-picker").addEventListener("change", () => {
    const f = Store.state.finds.find(x => x.id === $("nether-find-picker").value); if (!f) return;
    $("nether-x").value = f.x; $("nether-y").value = f.y; $("nether-z").value = f.z; updateNether();
  });
  $("nether-copy-btn").addEventListener("click", async () => {
    if (!netherResult) return;
    try { await navigator.clipboard.writeText(`${netherResult.x} ${netherResult.y} ${netherResult.z}`); toast("Copied"); }
    catch (e) { toast(`${netherResult.x} ${netherResult.y} ${netherResult.z}`); }
  });
  $("nether-save-btn").addEventListener("click", async () => {
    if (!netherResult) return;
    const dim = netherDir === "to-nether" ? "Nether" : "Overworld";
    const name = prompt("Name for this find?", netherDir === "to-nether" ? "Nether portal spot" : "Overworld portal spot");
    if (!name) return;
    await Store.upsertFind({ id: null, name, dimension: dim, x: netherResult.x, y: netherResult.y, z: netherResult.z, note: "Converted with the Nether calculator" });
    $("nether-save-msg").textContent = "Saved! Find it in the Finds tab."; renderAll(); toast("Find saved");
  });
  // Lore
  $("lore-search").addEventListener("input", renderLore);
  $("lore-form").addEventListener("submit", async e => {
    e.preventDefault();
    const l = { id: $("lore-id").value || null, day_number: parseInt($("lore-day").value, 10),
      title: $("lore-title").value.trim(), story: $("lore-story").value.trim() };
    if (!l.title || Number.isNaN(l.day_number)) { toast("Give the entry a day number and a title first"); return; }
    await Store.upsertLore(l); e.target.reset(); $("lore-id").value = ""; $("lore-form-title").textContent = "Add a lore entry";
    $("lore-cancel-edit").hidden = true; renderAll(); toast("Lore entry saved");
  });
  $("lore-cancel-edit").addEventListener("click", () => { $("lore-form").reset(); $("lore-id").value = ""; $("lore-form-title").textContent = "Add a lore entry"; $("lore-cancel-edit").hidden = true; });
  // Delegated card buttons
  document.addEventListener("click", async e => {
    const t = e.target.closest("[data-copy],[data-edit-find],[data-del-find],[data-play],[data-move-video],[data-edit-video],[data-del-video],[data-gather],[data-got],[data-edit-need],[data-del-need],[data-edit-lore],[data-del-lore]");
    if (!t) return;
    if (t.dataset.copy) { try { await navigator.clipboard.writeText(t.dataset.copy); toast("Coordinates copied"); } catch (err) { toast(t.dataset.copy); } }
    if (t.dataset.editFind) { const f = Store.state.finds.find(x => x.id === t.dataset.editFind); if (!f) return;
      $("find-id").value = f.id; $("find-what").value = f.name; $("find-dimension").value = f.dimension;
      $("find-x").value = f.x; $("find-y").value = f.y; $("find-z").value = f.z; $("find-note").value = f.note || "";
      $("find-form-title").textContent = "Edit find"; $("find-cancel-edit").hidden = false; updateNearby(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    if (t.dataset.delFind) { if (!confirm("Delete this find for good?")) return; await Store.deleteFind(t.dataset.delFind); renderAll(); toast("Find deleted"); }
    if (t.dataset.play) { playingId = t.dataset.play; renderVideos(); }
    if (t.dataset.moveVideo) { const [id, st] = t.dataset.moveVideo.split(":"); const v = Store.state.videos.find(x => x.id === id); if (!v) return;
      v.status = st; await Store.upsertVideo(v); renderAll(); toast("Moved to " + STATUS_LABEL[st]); }
    if (t.dataset.editVideo) { const v = Store.state.videos.find(x => x.id === t.dataset.editVideo); if (!v) return;
      $("video-id").value = v.id; $("video-title").value = v.title; $("video-url").value = v.url; $("video-status").value = v.status; $("video-note").value = v.note || "";
      $("video-form-title").textContent = "Edit video"; $("video-cancel-edit").hidden = false; window.scrollTo({ top: 0, behavior: "smooth" }); }
    if (t.dataset.delVideo) { if (!confirm("Delete this video for good?")) return; await Store.deleteVideo(t.dataset.delVideo); renderAll(); toast("Video deleted"); }
    if (t.dataset.gather) { const [id, delta] = t.dataset.gather.split(":"); const n = Store.state.needs.find(x => x.id === id); if (!n) return;
      n.gathered = Math.max(0, Math.min(n.amount_needed, n.gathered + parseInt(delta, 10))); await Store.upsertNeed(n); renderAll(); }
    if (t.dataset.got) { const n = Store.state.needs.find(x => x.id === t.dataset.got); if (!n) return;
      n.gathered = n.amount_needed; await Store.upsertNeed(n); renderAll(); toast("Got it!"); }
    if (t.dataset.editNeed) { const n = Store.state.needs.find(x => x.id === t.dataset.editNeed); if (!n) return;
      $("need-edit-id").value = n.id; $("need-edit-name").value = n.item_name; $("need-edit-amount").value = n.amount_needed; $("need-edit-size").value = String(n.stack_size);
      $("need-edit-form").hidden = false; $("need-edit-form").scrollIntoView({ behavior: "smooth" }); }
    if (t.dataset.delNeed) { if (!confirm("Delete this item for good?")) return; await Store.deleteNeed(t.dataset.delNeed); renderAll(); toast("Item deleted"); }
    if (t.dataset.editLore) { const l = Store.state.lore.find(x => x.id === t.dataset.editLore); if (!l) return;
      $("lore-id").value = l.id; $("lore-day").value = l.day_number; $("lore-title").value = l.title; $("lore-story").value = l.story || "";
      $("lore-form-title").textContent = "Edit lore entry"; $("lore-cancel-edit").hidden = false; window.scrollTo({ top: 0, behavior: "smooth" }); }
    if (t.dataset.delLore) { if (!confirm("Delete this lore entry for good?")) return; await Store.deleteLore(t.dataset.delLore); renderAll(); toast("Lore entry deleted"); }
  });
  document.addEventListener("change", async e => {
    const inp = e.target.closest("[data-gather-input]"); if (!inp) return;
    const n = Store.state.needs.find(x => x.id === inp.dataset.gatherInput); if (!n) return;
    n.gathered = Math.max(0, Math.min(n.amount_needed, parseInt(inp.value, 10) || 0)); await Store.upsertNeed(n); renderAll();
  });
  // Auth
  $("login-form").addEventListener("submit", async e => {
    e.preventDefault(); $("login-error").textContent = "";
    const { error } = await sb.auth.signInWithPassword({ email: $("login-email").value.trim(), password: $("login-password").value });
    if (error) $("login-error").textContent = error.message;
  });
  $("forgot-btn").addEventListener("click", async () => {
    const email = $("login-email").value.trim();
    if (!email) { $("forgot-msg").textContent = "Type your email above first, then tap Forgot password."; return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
    $("forgot-msg").textContent = error ? error.message : "Password reset email sent — check that inbox.";
  });
  $("logout-btn").addEventListener("click", async () => { if (sb) await sb.auth.signOut(); location.reload(); });
}

// ---------- Boot ----------
async function showApp() {
  $("login-view").hidden = true; $("app-view").hidden = false; $("logout-btn").hidden = false;
  await Store.loadAll(); renderAll();
}
async function boot() {
  bind();
  if (DEMO) {
    $("demo-banner").hidden = false;
    $("login-view").hidden = true; $("logout-btn").hidden = true;
    await Store.loadAll(); $("app-view").hidden = false; renderAll();
    return;
  }
  const { data } = await sb.auth.getSession();
  if (data.session) await showApp(); else { $("login-view").hidden = false; }
  sb.auth.onAuthStateChange(async (_evt, session) => {
    if (session) await showApp();
    else { $("app-view").hidden = true; $("logout-btn").hidden = true; $("login-view").hidden = false; }
  });
}
document.addEventListener("DOMContentLoaded", boot);

} // end browser-only block
