/* PurffleShorts Studio — no framework, no build step. Talks to the local JSON API in studio.py. */
"use strict";

const TOKEN = document.querySelector('meta[name="studio-token"]').content;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const I = {
  check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
  dl: '<svg viewBox="0 0 24 24"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>',
  yt: '<svg viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="M10 9v6l5-3z"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>',
  film: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/></svg>',
  doc: '<svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
  bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>',
  scissors: '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.6 7.6 20 18M8.6 16.4 20 6"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>',
};

const FORMATS = [
  ["auto", "Auto", "The AI picks the best format"],
  ["facts", "Facts", "Rapid-fire surprising facts"],
  ["story", "Story", "A true story with a twist"],
  ["listicle", "Top 3", "Countdown to number one"],
  ["myth", "Myth vs fact", "Bust a common belief"],
  ["quiz", "Quiz", "Question, suspense, answer"],
  ["explainer", "Explainer", "One idea, one analogy"],
  ["motivational", "Motivation", "A story and a takeaway"],
  ["news", "News", "What happened and why"],
  ["dialogue", "Dialogue", "Two voices, back and forth", true],
  ["chat", "Text story", "Animated text messages", true],
  ["reddit", "Reddit story", "Post card, then the story", true],
];
const MULTI = new Set(["dialogue", "chat"]);
const STAGES = [["topic", "Topic"], ["script", "Script"], ["review", "Review"], ["voice", "Voice"], ["footage", "Footage"],
  ["captions", "Captions"], ["render", "Render"], ["check", "Check"], ["upload", "Upload"]];
const STATUS_CHIP = { uploaded: "ok", scheduled: "blue", rendered: "accent", queued: "", failed: "bad" };
const KIND_ICON = { make: I.film, draft: I.pen, clip: I.scissors, plan: I.bulb, upload: I.upload, stats: I.chart,
  render: I.refresh, doctor: I.spark };
const SETTING_INFO = {
  channel_name: ["Channel name", "Used as the default watermark and for your branding."],
  audience: ["Audience", "Who the videos are for — guides the AI's tone and examples."],
  watermark: ["Watermark", "Text burned into every video. Blank uses the channel name; type none to hide it."],
  end_cta: ["End call-to-action", "Shown at the end of each video. Leave blank to turn it off."],
  caption_style: ["Caption style", "How the spoken captions look."],
  caption_position: ["Caption position", "Where captions sit in the frame."],
  caption_max_words: ["Words per caption", "How many words appear on screen at once (1–20)."],
  caption_uppercase: ["Uppercase captions", "Render the captions in capitals."],
  color_grade: ["Colour grade", "Colour treatment applied to the footage. vivid is punchy; none leaves it untouched."],
  transition: ["Transitions", "How scenes join together. random picks one per cut."],
  ken_burns: ["Ken Burns motion", "Slow zoom and pan on still photos so they feel alive."],
  progress_bar: ["Progress bar", "Thin bar along the bottom that fills as the video plays."],
  hook_overlay: ["Hook title", "The big title shown at the start to hook viewers."],
  music_dir: ["Music folder", "A track is picked at random per video (searched recursively)."],
  music_file: ["Fallback track", "Used only when the music folder has no tracks."],
  music_volume: ["Music volume", "Background music level, mixed under the voice (0–1)."],
  music_ducking: ["Duck under voice", "Automatically lower the music while the voice is speaking."],
};
const SETTING_GROUPS = [
  ["Branding", ["channel_name", "audience", "watermark", "end_cta"]],
  ["Captions", ["caption_style", "caption_position", "caption_max_words", "caption_uppercase"]],
  ["Look", ["color_grade", "transition", "ken_burns", "progress_bar", "hook_overlay"]],
  ["Music", ["music_dir", "music_file", "music_volume", "music_ducking"]],
];

const store = {
  get(k, d) { try { const v = localStorage.getItem("purffle." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("purffle." + k, JSON.stringify(v)); } catch { /* private mode: fine */ } },
};

async function get(url) {
  const r = await fetch(url);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}
async function post(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Studio-Token": TOKEN }, body: JSON.stringify(body || {}) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

const S = {
  info: null, options: null, jobs: [], view: "create",
  form: store.get("form", {}), draft: store.get("draft", null), createJob: store.get("createJob", null),
  draftMeta: store.get("draftMeta", null),   // {id, api, fbase, fromVideo} for the current script's footage
  lib: { status: "", q: "" }, seen: new Map(), voices: {},
};

// ------------------------------------------------------------------ helpers
function toast(html, kind = "info", ms = 5200) {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `${kind === "ok" ? I.check : kind === "bad" ? I.x : I.info}<div>${html}</div>`;
  $("#toasts").append(el);
  setTimeout(() => el.remove(), ms);
}
function paint(root = document) {  // CSP forbids inline styles: sizes are applied from data attributes
  $$("[data-w]", root).forEach(el => { el.style.width = Math.max(0, Math.min(100, +el.dataset.w)) + "%"; });
  $$("[data-p]", root).forEach(el => { el.style.setProperty("--p", el.dataset.p); el.style.setProperty("--c", scoreColor(+el.dataset.p)); });
}
const scoreColor = p => p >= 75 ? "var(--ok)" : p >= 55 ? "var(--accent)" : "var(--bad)";
const fmtSec = s => s == null ? "" : s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : `${Math.round(s)}s`;
const fmtNum = n => n == null ? "–" : Number(n).toLocaleString();
function ago(ts) {
  if (!ts) return "";
  const t = typeof ts === "number" ? ts * 1000 : Date.parse(ts);
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
function seg(name, opts, cur) {
  return `<div class="seg" role="group">${opts.map(([v, label]) =>
    `<button type="button" data-seg="${name}" data-v="${esc(v)}" aria-pressed="${String(v) === String(cur)}">${label}</button>`).join("")}</div>`;
}
function sel(name, opts, cur) {
  return `<select data-f="${name}">${opts.map(([v, label]) => `<option value="${esc(v)}"${String(v) === String(cur) ? " selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
}
const shortTitle = t => (t || "").replace(/\s*#shorts$/i, "");
const words = t => (t || "").trim().split(/\s+/).filter(Boolean).length;
const saveForm = () => store.set("form", S.form);
const saveDraft = () => store.set("draft", S.draft);
const saveDraftMeta = () => store.set("draftMeta", S.draftMeta);
function doctor() {                       // the Script Doctor state that travels with the current script
  if (!S.draftMeta) S.draftMeta = { id: null, api: "", fbase: "", fromVideo: null, doctor: null };
  if (!S.draftMeta.doctor) {
    S.draftMeta.doctor = { score: S.draft ? (S.draft.score ?? null) : null,
                           issues: (S.draft && S.draft.review) ? S.draft.review.slice() : [], history: [] };
  }
  return S.draftMeta.doctor;
}
function setDoctor(patch) { Object.assign(doctor(), patch); saveDraftMeta(); }

// ------------------------------------------------------------------ boot & routing
async function boot() {
  try {
    [S.info, S.options] = await Promise.all([get("/api/info"), get("/api/options")]);
  } catch (e) {
    $("#main").innerHTML = `<div class="empty"><b>Can't reach the Studio server</b>${esc(e.message)}</div>`;
    return;
  }
  const i = S.info;
  S.form = Object.assign({
    mode: "topic", topic: "", url: "", style: i.style || "auto", language: i.language, duration: i.duration,
    aspect: ["9:16", "16:9", "1:1", "4:5"].includes(i.aspect) ? i.aspect : "9:16", caption_style: i.caption_style,
    caption_position: i.caption_position, grade: i.grade, transition: i.transition, review: i.review, tts: i.tts,
    voice: "", voice_b: "", provider: "", model: "", also_langs: (i.also_languages || []).join(", "), music: true,
    upload: false, offline: !i.llm_ok, visuals: i.visuals,
  }, S.form);
  if (!i.llm_ok) S.form.offline = true;
  status();
  window.addEventListener("hashchange", route);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (!$("#doc-modal").hidden) closeDocModal();
      else if (!$("#viewer").hidden) closeViewer();
      else if (!$("#cand").hidden) closeCand();
      else if (PICK) closePicker();
      else closeDrawer();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && S.view === "create") startMake();
  });
  $("#drawer").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeDrawer(); });
  $("#picker").addEventListener("click", onPickerClick);
  $("#picker").addEventListener("input", onPickerInput);
  $("#picker").addEventListener("keydown", onPickerKey);
  $("#cand").addEventListener("click", e => {
    if (e.target.closest("[data-cand-close]")) return closeCand();
    if (e.target.closest("[data-cand-search]")) return candSearch();
    const view = e.target.closest("[data-cand-view]");
    if (view) return candView(+view.dataset.candView);
    const pick = e.target.closest("[data-cand-pick]");
    if (pick) return candPick(+pick.dataset.candPick);
  });
  $("#viewer").addEventListener("click", e => { if (e.target.closest("[data-view-close]")) closeViewer(); });
  $("#doc-modal").addEventListener("click", async e => {
    if (e.target.closest("[data-doc-close]")) return closeDocModal();
    const ta = $("#doc-text");
    if (e.target.closest("[data-doc-copy]")) { try { await navigator.clipboard.writeText(ta.value); toast("Copied.", "ok", 2000); } catch { toast("Select the text and copy it.", "info"); } return; }
    if (e.target.closest("[data-doc-download]")) { downloadText("purffle-scenes.json", ta.value); return; }
    if (e.target.closest("[data-doc-apply]")) {
      try { const n = applyImport(ta.value); closeDocModal(); drawEditor(); toast(`Imported ${n} scene(s) — check the footage and render.`, "ok"); }
      catch (err) { toast(esc(err.message), "bad"); }
    }
  });
  route();
  tick();
  setInterval(tick, 1500);
  setInterval(async () => { try { S.info = await get("/api/info"); status(); } catch { /* server restarting */ } }, 15000);
}

function status() {
  const i = S.info;
  $("#status").innerHTML = [
    ["AI", i.llm_ok ? i.llm : "demo only"], ["Voice", i.tts], ["Uploads left", i.upload ? `${Math.max(0, i.quota_left)} / ${i.daily_limit}` : "off"],
  ].map(([k, v]) => `<div class="row"><span>${k}</span><b title="${esc(v)}">${esc(v)}</b></div>`).join("");
  const ib = $("#ibadge");
  ib.hidden = !i.ideas;
  ib.textContent = i.ideas;
}

const VIEWS = { create: viewCreate, library: viewLibrary, queue: viewQueue, ideas: viewIdeas, clip: viewClip, channel: viewChannel, system: viewSystem };
function route() {
  const v = (location.hash || "#create").slice(1).split("/")[0];
  S.view = VIEWS[v] ? v : "create";
  $$("#nav a").forEach(a => a.classList.toggle("active", a.dataset.view === S.view));
  $("#main").innerHTML = "";
  VIEWS[S.view]();
  $("#main").focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ jobs polling
async function tick() {
  let jobs;
  try { jobs = await get("/api/jobs"); } catch { return; }
  S.jobs = jobs;
  const active = jobs.filter(j => j.status === "running" || j.status === "queued").length;
  const qb = $("#qbadge");
  qb.hidden = !active;
  qb.textContent = active;
  for (const j of jobs) {
    const before = S.seen.get(j.id);
    S.seen.set(j.id, j.status);
    if (before && before !== j.status && ["done", "failed"].includes(j.status)) finished(j);
  }
  // A draft that finished while this page was closed or reloading still belongs in the editor.
  const cj = currentCreateJob();
  if (cj && cj.kind === "draft" && cj.status === "done" && !S.createJob.loaded) finished(cj);
  if (S.view === "queue") drawJobs();
  if (S.view === "create") drawLive();
}

function finished(j) {
  const r = j.result || {};
  if (j.kind === "draft" && j.status === "done" && currentCreateJob() === j) {
    if (S.createJob.loaded) return;
    S.createJob.loaded = true;
    store.set("createJob", S.createJob);
    S.draft = r.script;
    saveDraft();
    if (r.draft_id) {
      S.draftMeta = { id: r.draft_id, api: `/api/drafts/${r.draft_id}`, fbase: `/drafts/${r.draft_id}/media`,
                      fromVideo: null, doctor: { score: r.script.score ?? null, issues: (r.script.review || []).slice(),
                                                 history: [] } };
      saveDraftMeta();
    }
    toast("Script ready — footage is picked below. Change a scene or its search, then render.", "ok", 6000);
    if (S.view === "create") drawSide();
    return;
  }
  if (j.kind === "doctor" && j.status === "done") {
    const doc = doctor();
    S.draft = r.script;
    saveDraft();
    doc.score = r.script.score;
    doc.issues = r.script.review || [];
    doc.history = (doc.history || []).concat(r.history || []);
    saveDraftMeta();
    toast("Script Doctor finished.", "ok");
    if (S.view === "create") drawSide();
    return;
  }
  if (j.status === "failed") {
    toast(`<b>${esc(j.label)}</b><br>${esc((r.error || j.message || "failed").slice(0, 220))}`, "bad", 9000);
  } else if (j.kind === "make" || j.kind === "clip") {
    const id = r.id || (r.clips && r.clips.find(c => c.ok) || {}).id;
    toast(`<b>${esc(r.title || j.label)}</b> is ready. ${id ? `<a href="#library" data-open="${id}">Watch it</a>` : ""}`, "ok", 9000);
  } else if (j.kind === "plan") {
    toast(`${r.ideas} new idea(s) in the queue.`, "ok");
    if (S.view === "ideas") viewIdeas();
  } else if (j.kind === "upload") {
    toast(`Upload: ${esc(r.status)}`, r.status === "failed" ? "bad" : "ok");
  } else if (j.kind === "stats") {
    toast(`Stats refreshed for ${r.updated} video(s).`, "ok");
    if (S.view === "channel") viewChannel();
  }
  get("/api/info").then(i => { S.info = i; status(); }).catch(() => {});
  if (S.view === "library") drawLibrary();
  if (S.view === "create") drawSide();
}

document.addEventListener("click", e => {
  const o = e.target.closest("[data-open]");
  if (o) { e.preventDefault(); if (S.view !== "library") location.hash = "#library"; openVideo(+o.dataset.open); }
});

// ------------------------------------------------------------------ CREATE
function payload(extra = {}) {
  const f = S.form;
  const p = {
    style: f.style === "auto" ? "" : f.style, language: f.language, duration: f.duration, aspect: f.aspect,
    caption_style: f.caption_style, caption_position: f.caption_position, grade: f.grade, transition: f.transition,
    tts: f.tts, voice: f.voice, voice_b: f.voice_b, provider: f.provider, model: f.model, review: f.review,
    also_langs: f.also_langs, music: f.music, upload: f.upload && S.info.upload && !f.offline, offline: f.offline,
    visuals: f.visuals,
  };
  if (f.mode === "topic") p.topic = f.topic.trim();
  if (f.mode === "url") p.url = f.url.trim();
  if (f.mode === "queue") p.source = "queue";
  return Object.assign(p, extra);
}

async function startMake(extra = {}) {
  const f = S.form;
  if (f.mode === "url" && !f.url.trim() && !extra.script) return toast("Paste the address of a web page first.", "bad");
  const e = Object.assign({}, extra);
  if (S.draftMeta) {                      // render with the footage already picked for this script
    if (S.draftMeta.id) e.draft_id = S.draftMeta.id;
    else if (S.draftMeta.fromVideo) e.from_video = S.draftMeta.fromVideo;
  }
  try {
    const { job } = await post("/api/make", payload(e));
    S.createJob = { id: job, kind: "make", session: TOKEN };
    store.set("createJob", S.createJob);
    S.seen.set(job, "queued");
    toast(extra.script ? "Rendering your script…" : "Making your video…", "info", 3000);
    drawSide();
    tick();
  } catch (e) { toast(esc(e.message), "bad"); }
}
async function startDraft() {
  const f = S.form;
  if (f.offline) return toast("Drafting needs an AI model. Turn off demo mode (and add a key in .env).", "bad");
  if (f.mode === "url" && !f.url.trim()) return toast("Paste the address of a web page first.", "bad");
  try {
    const { job } = await post("/api/draft", payload());
    S.createJob = { id: job, kind: "draft", session: TOKEN };
    store.set("createJob", S.createJob);
    S.seen.set(job, "queued");
    drawSide();
    tick();
  } catch (e) { toast(esc(e.message), "bad"); }
}

function viewCreate() {
  const i = S.info, f = S.form;
  $("#main").innerHTML = `
  <div class="page-head"><div><h1>Create</h1><p>From an idea to a finished, captioned video. Draft first to read and edit the script, or go straight to the render.</p></div></div>
  ${i.llm_ok ? "" : `<div class="banner">${I.info}<p><b>No AI model is set up yet.</b> Demo mode renders a sample video with no keys. Add one API key (or run Ollama) in <span class="mono">.env</span> to write real scripts — see <a href="#system">System</a>.</p></div>`}
  <div class="create"><div id="form"></div><div class="sticky" id="side"></div></div>`;
  drawForm();
  drawSide();
}

function drawForm() {
  const f = S.form, o = S.options;
  const langs = Object.entries(o.languages);
  const provs = [["", "Default (.env)"], ...o.providers.map(p => [p.name, `${p.label}${p.ready ? "" : " — no key"}`])];
  const multi = MULTI.has(f.style);
  $("#form").innerHTML = `
  <section class="card">
    <h2>What's it about?</h2>
    <div class="src-tabs">${seg("mode", [["topic", "Topic"], ["url", "Web page"], ["queue", "Idea queue"], ["auto", "Surprise me"]], f.mode)}</div>
    ${f.mode === "topic" ? `<div class="field"><label>Topic</label><textarea class="topic-input" data-f="topic" placeholder="e.g. Why octopuses have three hearts" aria-label="Topic">${esc(f.topic)}</textarea><p class="hint">Be as broad or specific as you like — the AI finds the surprising angle.</p></div>`
    : f.mode === "url" ? `<div class="field"><input type="url" data-f="url" value="${esc(f.url)}" placeholder="https://… an article, blog post or Wikipedia page" aria-label="Web page"><p class="hint">The page's text becomes the script's source material.</p></div>`
    : f.mode === "queue" ? `<p class="hint">Uses the oldest idea from your queue (${i_ideas()} waiting) — plan more on the <a href="#ideas">Ideas</a> page.</p>`
    : `<p class="hint">Picks a fresh topic from your niches and topic sources in .env.</p>`}
  </section>

  <section class="card">
    <h2>Format</h2>
    <div class="formats">${FORMATS.map(([k, name, blurb, isNew]) =>
      `<button type="button" class="fmt" data-seg="style" data-v="${k}" aria-pressed="${f.style === k}"><b>${name}${isNew ? '<span class="new">NEW</span>' : ""}</b><span>${blurb}</span></button>`).join("")}</div>
  </section>

  <section class="card">
    <h2>Shape & voice</h2>
    <div class="grid2">
      <div class="field"><label>Language</label>${sel("language", langs.map(([c, n]) => [c, `${n} (${c})`]), f.language)}</div>
      <div class="field"><label>Length</label><div class="range-row"><input type="range" min="15" max="120" step="5" data-f="duration" value="${f.duration}" aria-label="Length in seconds"><output id="dur-out">${f.duration}s</output></div></div>
    </div>
    <div class="field"><label>Aspect</label>${seg("aspect", [["9:16", '<i class="shape s916"></i>9:16 Short'], ["16:9", '<i class="shape s169"></i>16:9 YouTube'], ["1:1", '<i class="shape s11"></i>1:1 Square'], ["4:5", '<i class="shape s45"></i>4:5 Feed']], f.aspect)}</div>
    <div class="grid2">
      <div class="field"><label>Voice engine</label>${sel("tts", o.tts.map(t => [t, { edge: "Microsoft neural (free)", openai: "OpenAI", elevenlabs: "ElevenLabs", kokoro: "Kokoro (local)", coqui: "Coqui (local)", system: "System voice" }[t] || t]), f.tts)}</div>
      <div class="field"><label>${multi ? "Voice A" : "Voice"}</label><input type="text" data-f="voice" list="voices" value="${esc(f.voice)}" placeholder="automatic for the language"></div>
    </div>
    ${multi ? `<div class="field"><label>Voice B (second speaker)</label><input type="text" data-f="voice_b" list="voices" value="${esc(f.voice_b)}" placeholder="automatic contrasting voice"></div>` : ""}
    <datalist id="voices"></datalist>
  </section>

  <section class="card">
    <h2>Look</h2>
    <div class="swatches">${o.caption_styles.map(c => `<button type="button" class="sw" data-seg="caption_style" data-v="${c}" aria-pressed="${f.caption_style === c}">${capSample(c)}<small>${c}</small></button>`).join("")}</div>
    <div class="field"><label>Caption position</label>${seg("caption_position", [["upper", "Top"], ["center", "Middle"], ["lower", "Lower third"]], f.caption_position)}</div>
    <div class="grid2">
      <div class="field"><label>Colour grade</label>${sel("grade", o.grades.map(g => [g, g]), f.grade)}</div>
      <div class="field"><label>Transitions</label>${sel("transition", o.transitions.map(t => [t, t]), f.transition)}</div>
    </div>
    <div class="field"><label>Footage & images</label><div class="checks-inline">${o.visuals.map(v => `<label><input type="checkbox" data-visual="${v}"${(f.visuals || []).includes(v) ? " checked" : ""}>${{ pexels: "Pexels", pixabay: "Pixabay", local: "My media folder", pollinations: "AI images (Pollinations, key advised)", "openai-images": "OpenAI images" }[v] || v}</label>`).join("")}</div></div>
    <div class="field"><label class="switch"><input type="checkbox" data-f="music"${f.music ? " checked" : ""}><span>Background music<small>From your music folder, ducked under the voice</small></span></label></div>
  </section>

  <section class="card">
    <h2>AI & publishing</h2>
    <div class="grid2">
      <div class="field"><label>AI model provider</label>${sel("provider", provs, f.provider)}</div>
      <div class="field"><label>Model</label><input type="text" data-f="model" value="${esc(f.model)}" placeholder="provider default"></div>
    </div>
    <div class="field"><label>Script Doctor</label>${seg("review", [["off", "Off"], ["score", "Score only"], ["rewrite", "Score & rewrite"]], f.review)}<p class="hint">A second AI pass grades the hook and pacing, then rewrites weak lines.</p></div>
    <div class="field"><label>Also make it in</label><input type="text" data-f="also_langs" value="${esc(f.also_langs)}" placeholder="e.g. es, hi, pt — translated copies, same footage"></div>
    <div class="grid2">
      <label class="switch"><input type="checkbox" data-f="upload"${f.upload ? " checked" : ""}${S.info.upload ? "" : " disabled"}><span>Upload to YouTube<small>${S.info.upload ? `${S.info.privacy}, or scheduled` : "disabled in .env (UPLOAD=false)"}</small></span></label>
      <label class="switch"><input type="checkbox" data-f="offline"${f.offline ? " checked" : ""}><span>Demo mode<small>No keys: sample script, generated backgrounds</small></span></label>
    </div>
  </section>

  <div class="go-row">
    <button class="btn" id="draft-btn" type="button">${I.pen}Draft script</button>
    <button class="btn primary" id="make-btn" type="button">${I.play}Create video</button>
  </div>`;
  bindForm();
  loadVoices();
}
const i_ideas = () => S.info.ideas || 0;

function capSample(style) {
  if (style === "karaoke") return `<span class="cap karaoke"><u>THREE</u> <i>HEARTS</i></span>`;
  return `<span class="cap ${style}">THREE <i>HEARTS</i></span>`;
}

function bindForm() {
  const root = $("#form");
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-seg]");
    if (!b) return;
    const k = b.dataset.seg, v = b.dataset.v;
    const multiBefore = MULTI.has(S.form.style);
    S.form[k] = v;
    saveForm();
    if (k === "mode" || (k === "style" && MULTI.has(v) !== multiBefore)) return drawForm();
    $$(`[data-seg="${k}"]`, root).forEach(x => x.setAttribute("aria-pressed", String(x.dataset.v === v)));
    if (k === "caption_style" || k === "aspect") drawSide();
  });
  root.addEventListener("input", e => {
    const el = e.target;
    if (el.dataset.visual) {
      S.form.visuals = $$("[data-visual]", root).filter(x => x.checked).map(x => x.dataset.visual);
    } else if (el.dataset.f) {
      S.form[el.dataset.f] = el.type === "checkbox" ? el.checked : el.type === "range" ? +el.value : el.value;
      if (el.dataset.f === "duration") $("#dur-out").textContent = el.value + "s";
      if (el.dataset.f === "language" || el.dataset.f === "tts") loadVoices();
    }
    saveForm();
  });
  $("#make-btn").onclick = () => startMake();
  $("#draft-btn").onclick = startDraft;
}

async function loadVoices() {
  const f = S.form, dl = $("#voices");
  if (!dl || f.tts !== "edge") { if (dl) dl.innerHTML = ""; return; }
  const lang = f.language;
  if (!S.voices[lang]) {
    try { S.voices[lang] = await get("/api/voices?lang=" + encodeURIComponent(lang)); } catch { S.voices[lang] = []; }
  }
  if (S.form.language === lang && $("#voices")) {
    $("#voices").innerHTML = S.voices[lang].map(v => `<option value="${esc(v.name)}">${esc(v.gender)} · ${esc(v.locale)}</option>`).join("");
  }
}

function currentCreateJob() {
  // Job ids restart with the server, so a job remembered from an earlier session is not this one.
  if (!S.createJob || S.createJob.session !== TOKEN) return null;
  return S.jobs.find(j => j.id === S.createJob.id) || null;
}

function drawSide() {
  const side = $("#side");
  if (!side) return;
  side.innerHTML = `<div id="live"></div><div id="editor"></div>`;
  drawLive();
  drawEditor();
}

function drawLive() {
  const box = $("#live");
  if (!box) return;
  const j = currentCreateJob();
  if (!j || (j.status === "done" && j.kind === "draft") || j.status === "cancelled") { box.innerHTML = ""; return; }
  const r = j.result || {};
  const idx = STAGES.findIndex(([k]) => k === j.stage);
  const running = j.status === "running" || j.status === "queued";
  const name = j.status === "queued" ? "Waiting for the previous job" : j.status === "failed" ? "Failed"
    : j.status === "done" ? "Finished" : (STAGES[idx] || [0, "Starting"])[1];
  box.innerHTML = `<section class="card live ${j.status}">
    <div class="actions"><span class="status-pill ${j.status}">${j.kind === "draft" ? "Drafting" : "Making"} · ${j.status}</span>
      ${!running ? `<button class="btn ghost sm" id="live-close" type="button" aria-label="Dismiss">${I.x}</button>` : ""}</div>
    <h3>${esc(r.title || j.label)}</h3>
    ${running ? `<div class="stages">${STAGES.map(([k], n) => `<span class="${n < idx ? "done" : n === idx ? "now" : ""}" title="${k}"></span>`).join("")}</div>
      <div class="stage-name"><b>${esc(name)}</b><span>${esc(j.message || "")}</span></div>` : ""}
    ${j.status === "done" && r.id ? `<div class="actions"><button class="btn primary sm" type="button" data-open="${r.id}">${I.play}Watch</button>
      ${r.score != null ? `<span class="chip ${r.score >= 75 ? "ok" : r.score >= 55 ? "accent" : "bad"}">Retention score ${r.score}</span>` : ""}
      <span class="chip">${esc(r.status)}</span>${(r.variants || []).map(v => `<span class="chip ${v.ok ? "ok" : "bad"}">${esc(v.language)} ${v.ok ? "✓" : "✗"}</span>`).join("")}</div>` : ""}
    ${j.status === "failed" ? `<div class="err">${esc(r.error || j.message)}</div>` : ""}
    ${running ? `<pre class="log" id="live-log">${esc(j.log.slice(-8).join("\n"))}</pre>` : ""}
  </section>`;
  const c = $("#live-close");
  if (c) c.onclick = () => { S.createJob = null; store.set("createJob", null); drawSide(); };
}

function drawEditor() {
  const box = $("#editor");
  if (!box) return;
  const d = S.draft, f = S.form;
  const j = currentCreateJob();
  if (!d) {
    if (j && (j.status === "running" || j.status === "queued")) { box.innerHTML = ""; return; }
    box.innerHTML = `<section class="card"><h2>Preview</h2>
      <div class="phone"><div class="bar"></div><div class="ph-hook">This animal has 3 hearts</div>${capSample(f.caption_style)}</div>
      <p class="hint">Caption style <b>${esc(f.caption_style)}</b> · ${esc(f.aspect)} · ${esc(f.language)}</p>
      <div class="list">
        <div class="item"><span class="chip accent">1</span><div class="grow"><b>Draft script</b><small>The AI writes it, the Script Doctor scores and improves it, and you edit any line before rendering.</small></div></div>
        <div class="item"><span class="chip accent">2</span><div class="grow"><b>Create video</b><small>Voice, footage, word-synced captions, music and render in one go — about a minute.</small></div></div>
        <div class="item"><span class="chip accent">3</span><div class="grow"><b>Publish</b><small>Upload or schedule from the Library, or turn on upload here.</small></div></div>
      </div></section>`;
    return;
  }
  const multi = MULTI.has(d.style) || d.scenes.some(s => s.speaker === "B");
  const total = d.scenes.reduce((n, s) => n + words(s.narration), 0);
  const target = Math.round((f.duration || 40) * 2.6);
  box.innerHTML = `<section class="card">
    <div class="actions"><h2>Script</h2><span class="chip">${esc(d.style)}</span><span class="chip">${esc(d.language)}</span>
      <span class="wc" id="wc">${total} words · ~${Math.round(total / 2.6)}s</span>
      <button class="btn ghost sm" id="discard" type="button">${I.trash}Discard</button></div>
    ${doctorPanel()}
    <div class="field"><label>Title</label><input type="text" data-k="title" value="${esc(d.title)}" maxlength="90"></div>
    <div class="field"><label>On-screen hook</label><input type="text" data-k="hook_text" value="${esc(d.hook_text)}" maxlength="48"></div>
    ${multi ? `<div class="grid2"><div class="field"><label>Speaker A</label><input type="text" data-cast="0" value="${esc((d.cast || [])[0] || "")}"></div>
      <div class="field"><label>Speaker B</label><input type="text" data-cast="1" value="${esc((d.cast || [])[1] || "")}"></div></div>` : ""}
    <div class="field"><label>Scenes <span class="hint">· target about ${target} words</span></label>
    <div class="scenes">${d.scenes.map((s, n) => `
      <div class="scene ${s.speaker === "B" ? "b" : "a"}${multi ? " multi" : ""}">
        <span class="num">${multi ? esc(s.speaker || "A") : n + 1}</span>
        <div class="field">
          <textarea data-i="${n}" data-s="narration" aria-label="Scene ${n + 1} narration">${esc(s.narration)}</textarea>
          ${S.draftMeta && S.draftMeta.api ? `<div class="scene-foot">
            <div class="scene-thumb" data-thumb="${n}"><span class="ph">…</span></div>
            <div class="grow">
              <div class="with-btn"><input type="text" data-i="${n}" data-s="search_query" value="${esc(s.search_query)}" placeholder="footage search" aria-label="Footage search"><button class="btn sm" type="button" data-find="${n}">${I.search}Search</button><button class="btn ghost sm" type="button" data-file="${n}" title="Use an image or video from this computer">${I.upload}</button></div>
              <input class="im" type="text" data-i="${n}" data-s="image_prompt" value="${esc(s.image_prompt || "")}" placeholder="AI image prompt (for AI-image scenes)" aria-label="AI image prompt">
              <div class="match" data-match="${n}"></div>
            </div>
          </div>` : `<input type="text" data-i="${n}" data-s="search_query" value="${esc(s.search_query)}" placeholder="footage search" aria-label="Footage search"><input class="im" type="text" data-i="${n}" data-s="image_prompt" value="${esc(s.image_prompt || "")}" placeholder="AI image prompt (for AI-image scenes)" aria-label="AI image prompt">`}
          <div class="row">
            ${multi ? `<button class="btn ghost sm" type="button" data-act="speaker" data-i="${n}" title="Switch speaker">A/B</button>` : ""}
            <span class="tools">
              <button class="btn ghost sm" type="button" data-act="up" data-i="${n}" aria-label="Move up">${I.up}</button>
              <button class="btn ghost sm" type="button" data-act="down" data-i="${n}" aria-label="Move down">${I.down}</button>
              <button class="btn ghost sm" type="button" data-act="del" data-i="${n}" aria-label="Delete scene">${I.trash}</button>
            </span>
          </div>
        </div>
      </div>`).join("")}</div>
    <div class="actions"><button class="btn ghost sm" type="button" data-act="add">${I.plus}Add scene</button></div></div>
    <div class="field"><label>Description</label><textarea data-k="description">${esc(d.description)}</textarea></div>
    <div class="field"><label>Hashtags</label><input type="text" data-tags value="${esc((d.hashtags || []).join(" "))}"></div>
    <div class="go-row"><span></span><button class="btn primary" id="render-btn" type="button">${I.play}Render this script</button></div>
  </section>`;
  paint(box);
  box.oninput = e => {
    const el = e.target;
    if (el.id === "doc-issues") { setDoctor({ issues: el.value.split("\n").map(s => s.trim()).filter(Boolean) }); return; }
    if (el.dataset.k) d[el.dataset.k] = el.value;
    else if (el.dataset.s) d.scenes[+el.dataset.i][el.dataset.s] = el.value;
    else if (el.dataset.cast) { d.cast = d.cast || ["", ""]; d.cast[+el.dataset.cast] = el.value; }
    else if (el.hasAttribute("data-tags")) d.hashtags = el.value.split(/\s+/).filter(Boolean);
    const t = d.scenes.reduce((n, s) => n + words(s.narration), 0);
    $("#wc").textContent = `${t} words · ~${Math.round(t / 2.6)}s`;
    saveDraft();
  };
  box.onclick = e => {
    const zoom = e.target.closest(".scene-thumb.zoom");
    if (zoom && zoom.dataset.view) return openViewer(zoom.dataset.view, zoom.dataset.kind, zoom.dataset.title);
    const doc = e.target.closest("[data-doctor]");
    if (doc) {
      const act = doc.dataset.doctor;
      if (act === "critique") return doctorCritique(doc);
      if (act === "rewrite") return doctorRewrite(doc);
      if (act === "passes") return doctorPasses(doc);
      if (act === "export") return openDocModal("export", buildExport());
      if (act === "import") return openDocModal("import", "");
    }
    const find = e.target.closest("[data-find]");
    if (find && S.draftMeta && S.draftMeta.api) {
      const n = +find.dataset.find;
      const q = box.querySelector(`[data-i="${n}"][data-s="search_query"]`);
      return openCand(S.draftMeta.api, S.draftMeta.fbase, n, q ? q.value : "", loadEditorFootage);
    }
    const file = e.target.closest("[data-file]");
    if (file && S.draftMeta && S.draftMeta.api) return editorManual(+file.dataset.file);
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const n = +b.dataset.i, sc = d.scenes;
    if (b.dataset.act === "del" && sc.length > 1) sc.splice(n, 1);
    if (b.dataset.act === "up" && n > 0) [sc[n - 1], sc[n]] = [sc[n], sc[n - 1]];
    if (b.dataset.act === "down" && n < sc.length - 1) [sc[n + 1], sc[n]] = [sc[n], sc[n + 1]];
    if (b.dataset.act === "speaker") sc[n].speaker = sc[n].speaker === "B" ? "A" : "B";
    if (b.dataset.act === "add") sc.push({ narration: "", search_query: "", image_prompt: "", speaker: sc.length && sc[sc.length - 1].speaker === "A" && multi ? "B" : "A" });
    saveDraft();
    drawEditor();
  };
  if (S.draftMeta && S.draftMeta.api) loadEditorFootage();
  $("#discard").onclick = () => {
    if (!confirm("Discard this script?")) return;
    S.draft = null; S.draftMeta = null;
    saveDraft(); store.set("draftMeta", null);
    drawEditor();
  };
  $("#render-btn").onclick = () => {
    const clean = Object.assign({}, d, { scenes: d.scenes.filter(s => s.narration.trim()) });
    if (!clean.scenes.length) return toast("The script has no narration.", "bad");
    startMake({ script: clean, topic: "", url: "", source: "" });
  };
}

// ------------------------------------------------------------------ LIBRARY
function viewLibrary() {
  $("#main").innerHTML = `
  <div class="page-head"><div><h1>Library</h1><p>Everything you've made. Click a video to watch, edit, upload or delete it.</p></div></div>
  <div class="toolbar">${seg("lib", [["", "All"], ["rendered", "Ready"], ["scheduled", "Scheduled"], ["uploaded", "Uploaded"], ["queued", "Queued"], ["failed", "Failed"]], S.lib.status)}
    <input type="search" id="lib-q" placeholder="Search titles" value="${esc(S.lib.q)}" aria-label="Search"></div>
  <div class="lib" id="lib"></div>`;
  $(".toolbar").addEventListener("click", e => {
    const b = e.target.closest("[data-seg]");
    if (!b) return;
    S.lib.status = b.dataset.v;
    $$("[data-seg=lib]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.v === S.lib.status)));
    drawLibrary();
  });
  let t;
  $("#lib-q").oninput = e => { clearTimeout(t); t = setTimeout(() => { S.lib.q = e.target.value; drawLibrary(); }, 200); };
  drawLibrary();
}

async function drawLibrary() {
  const box = $("#lib");
  if (!box) return;
  let vs;
  try { vs = await get(`/api/videos?status=${encodeURIComponent(S.lib.status)}&q=${encodeURIComponent(S.lib.q)}`); } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (!vs.length) {
    box.innerHTML = `<div class="empty"><b>${S.lib.status || S.lib.q ? "Nothing matches" : "No videos yet"}</b>${S.lib.status || S.lib.q ? "Try another filter." : `<a href="#create">Create your first one</a>.`}</div>`;
    return;
  }
  box.innerHTML = vs.map(v => `
    <button class="vcard" type="button" data-open="${v.id}">
      <div class="thumb">${v.has_cover ? `<img src="/files/${v.id}/cover.jpg" alt="" loading="lazy">` : `<div class="ph">${v.status === "failed" ? "failed" : "no preview"}</div>`}
        <div class="tl"><span class="chip ${STATUS_CHIP[v.status] || ""}">${esc(v.status)}</span>${v.score != null ? `<span class="chip">${v.score}</span>` : ""}</div>
        ${v.duration ? `<span class="dur">${fmtSec(v.duration)}</span>` : ""}</div>
      <div class="meta"><b>${esc(shortTitle(v.title) || "(untitled)")}</b>
        <span class="sub">${esc(v.style || "")}${v.language ? ` · ${esc(v.language)}` : ""}${v.parent_id ? " · translation" : ""}${v.views != null ? ` · ${fmtNum(v.views)} views` : ""}</span>
        <span class="sub">${ago(v.created)}</span></div>
    </button>`).join("");
}

async function openVideo(id) {
  let v;
  try { v = await get("/api/videos/" + id); } catch (e) { return toast(esc(e.message), "bad"); }
  const m = v.metadata || {}, sc = v.script;
  const panel = $("#drawer-panel");
  const review = m.review || [];
  panel.innerHTML = `
    <button class="btn ghost close" type="button" data-close aria-label="Close">${I.x}</button>
    <div class="player">${v.video ? `<video src="/files/${id}/${esc(v.video)}" controls playsinline preload="metadata"${v.has_cover ? ` poster="/files/${id}/cover.jpg"` : ""}></video>`
      : v.has_cover ? `<img src="/files/${id}/cover.jpg" alt="" class="thumb">` : `<div class="empty">The video file is gone${v.youtube_id ? " — it lives on YouTube now" : ""}.</div>`}
      <div class="actions">${v.video ? `<a class="btn sm" href="/files/${id}/${esc(v.video)}?download=1">${I.dl}MP4</a>` : ""}${v.has_srt ? `<a class="btn sm" href="/files/${id}/captions.srt?download=1">${I.dl}Captions</a>` : ""}</div>
    </div>
    <div>
      <div class="chips"><span class="chip ${STATUS_CHIP[v.status] || ""}">${esc(v.status)}</span>${v.style ? `<span class="chip">${esc(v.style)}</span>` : ""}${v.language ? `<span class="chip">${esc(v.language)}</span>` : ""}${v.parent_id ? `<span class="chip" data-open="${v.parent_id}">translation of #${v.parent_id}</span>` : ""}</div>
      <h2>${esc(v.title)}</h2>
      ${v.youtube_id ? `<p><a class="btn sm" href="https://youtube.com/shorts/${esc(v.youtube_id)}" target="_blank" rel="noopener">${I.yt}Open on YouTube</a>${v.publish_at ? ` <span class="muted">goes public ${esc(new Date(v.publish_at).toLocaleString())}</span>` : ""}</p>` : ""}
      ${v.error ? `<div class="banner">${I.info}<p>${esc(v.error)}</p></div>` : ""}
      <div class="actions">
        ${v.video && !v.youtube_id ? `<button class="btn primary sm" type="button" id="d-up">${I.upload}Upload</button>` : ""}
        ${sc ? `<button class="btn sm" type="button" id="d-edit">${I.pen}Edit & re-render</button>` : ""}
        <button class="btn sm danger" type="button" id="d-del">${I.trash}Delete</button>
      </div>
      ${v.score != null ? `<div class="score"><div class="ring" data-p="${v.score}"><b>${v.score}</b></div><div><b>Retention score</b>${review.length ? `<ul>${review.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div></div>` : ""}
      <dl class="kv">
        <dt>Length</dt><dd>${fmtSec(v.duration)}</dd>
        ${m.resolution ? `<dt>Size</dt><dd>${esc(m.resolution)}</dd>` : ""}
        <dt>Voice</dt><dd>${esc(v.voice || m.voice || "")}</dd>
        <dt>Script by</dt><dd>${esc(v.llm || "")}</dd>
        ${v.topic ? `<dt>Topic</dt><dd>${esc(v.topic)}</dd>` : ""}
        ${v.views != null ? `<dt>Views</dt><dd>${fmtNum(v.views)} · ${fmtNum(v.likes)} likes · ${fmtNum(v.comments)} comments</dd>` : ""}
        <dt>Made</dt><dd>${esc(new Date(v.created_at).toLocaleString())}</dd>
        <dt>Folder</dt><dd class="mono">${esc(v.folder || "")}</dd>
      </dl>
      ${v.description ? `<div class="desc">${esc(v.description)}</div>` : ""}
      ${v.tags && v.tags.length ? `<div class="chips">${v.tags.map(t => `<span class="chip">${esc(t)}</span>`).join("")}</div>` : ""}
    </div>
    ${sc ? `<div class="drawer-wide" id="d-footage"></div>` : ""}`;
  paint(panel);
  $("#drawer").hidden = false;
  document.body.style.overflow = "hidden";
  const foot = $("#d-footage");
  if (foot) { bindFootage(foot, id); loadFootage(id); }
  const up = $("#d-up");
  if (up) up.onclick = async () => { up.disabled = true; try { await post("/api/upload/" + id); toast("Upload queued — follow it in Queue.", "info"); tick(); } catch (e) { toast(esc(e.message), "bad"); } };
  const ed = $("#d-edit");
  if (ed) ed.onclick = () => {
    S.draft = Object.assign({}, sc, { title: (sc.title || "").replace(/\s*#shorts$/i, "") });
    saveDraft();
    S.draftMeta = { id: null, api: `/api/videos/${id}`, fbase: `/media/${id}`, fromVideo: id,
                    doctor: { score: sc.score ?? null, issues: (sc.review || []).slice(), history: [] } };
    saveDraftMeta();
    if (sc.language) S.form.language = sc.language;
    if (sc.style) S.form.style = sc.style;
    saveForm();
    closeDrawer();
    location.hash = "#create";
    if (S.view === "create") route();
  };
  $("#d-del").onclick = async () => {
    if (!confirm("Delete this video and its folder from your computer? (Nothing is removed from YouTube.)")) return;
    try { await post(`/api/videos/${id}/delete`); closeDrawer(); toast("Deleted.", "ok"); drawLibrary(); } catch (e) { toast(esc(e.message), "bad"); }
  };
}
function closeDrawer() {
  const d = $("#drawer");
  if (d.hidden) return;
  $$("video", d).forEach(v => v.pause());
  d.hidden = true;
  document.body.style.overflow = "";
}

// ------------------------------------------------------------------ FOOTAGE (per scene)
function mediaTag(fbase, n, kind) {
  const src = `${fbase}/${n}`;
  return kind === "video" ? `<video src="${src}" muted playsinline preload="metadata"></video>`
    : `<img src="${src}" alt="" loading="lazy">`;
}
function describeMatch(sc) {
  const m = sc.media || {};
  const wanted = (sc.search_query || "").trim();
  const used = ((m.query || "") || wanted).trim();
  if (m.source === "generated") return `Nothing matched “${esc(wanted || used)}” — a generated background will be used.`;
  if (used) return `Using ${esc(m.source)}${m.kind ? " " + esc(m.kind) : ""} for “${esc(used)}”${wanted && used.toLowerCase() !== wanted.toLowerCase() ? ` (fallback from “${esc(wanted)}”)` : ""}.`;
  return wanted ? `Will search “${esc(wanted)}”.` : "";
}

// Create editor: preview the footage picked for each scene, and let it be changed.
async function loadEditorFootage() {
  const meta = S.draftMeta;
  if (!meta || !$("#editor")) return;
  let data;
  try { data = await get(`${meta.api}/scenes`); } catch { return; }
  if (S.draftMeta !== meta || !$("#editor")) return;
  (data.scenes || []).forEach(sc => {
    const thumb = $(`[data-thumb="${sc.index}"]`);
    if (thumb) {
      thumb.innerHTML = sc.preview ? mediaTag(meta.fbase, sc.index, sc.kind)
        : `<div class="ph">${esc(sc.media ? sc.media.source : "none")}</div>`;
      if (sc.preview) {
        thumb.dataset.view = `${meta.fbase}/${sc.index}`;
        thumb.dataset.kind = sc.kind;
        thumb.dataset.title = `Scene ${sc.index + 1}`;
        thumb.classList.add("zoom");
      } else {
        delete thumb.dataset.view;
        thumb.classList.remove("zoom");
      }
    }
    const match = $(`[data-match="${sc.index}"]`);
    if (match) match.innerHTML = describeMatch(sc);
  });
}
function editorManual(n) {
  chooseMediaFile(S.draftMeta.api, n, loadEditorFootage);
}

// ------------------------------------------------------------------ Script Doctor panel
function doctorPanel() {
  const doc = doctor();
  const h = doc.history || [];
  const chip = doc.score == null ? `<span class="chip">not scored</span>`
    : `<span class="chip ${doc.score >= 75 ? "ok" : doc.score >= 55 ? "accent" : "bad"}">Score ${doc.score}</span>`;
  return `<section class="doctor">
    <div class="actions"><h2>Script Doctor</h2>${chip}</div>
    <p class="hint">Critique scores the script and lists issues. Edit the issues, then Rewrite to fix exactly those. Auto runs critique + rewrite several times, keeping a history.</p>
    <div class="field"><label>Issues the rewrite will fix <span class="hint">· one per line</span></label>
      <textarea id="doc-issues" placeholder="Run Critique to fill this in…">${esc((doc.issues || []).join("\n"))}</textarea></div>
    <div class="actions">
      <button class="btn sm" type="button" data-doctor="critique">${I.spark}Critique</button>
      <button class="btn primary sm" type="button" data-doctor="rewrite">${I.pen}Rewrite</button>
      <span class="auto-passes with-btn"><input type="number" id="doc-passes" min="1" max="6" value="2" aria-label="Passes"><button class="btn sm" type="button" data-doctor="passes">Auto</button></span>
      <button class="btn ghost sm" type="button" data-doctor="export">${I.dl}Export</button>
      <button class="btn ghost sm" type="button" data-doctor="import">${I.upload}Import</button>
    </div>
    ${h.length ? `<div class="doc-history"><b class="hint">History</b>${h.map(doctorPassHtml).join("")}</div>` : ""}
  </section>`;
}
function doctorPassHtml(e) {
  if (!e.critique) return `<div class="doc-pass bad">Pass ${e.pass}: ${esc(e.error || "failed")}</div>`;
  const c = e.critique || {}, a = e.after || {};
  return `<div class="doc-pass">
    <div class="actions"><b>Pass ${e.pass}</b><span class="chip">${c.score ?? "?"}${a.score != null ? ` → ${a.score}` : ""}</span>
      ${e.rewrote ? `<span class="chip ok">rewritten</span>` : `<span class="chip bad">kept</span>`}</div>
    ${(c.issues || []).length ? `<ul>${c.issues.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="hint">No issues found.</p>`}
    ${e.error ? `<p class="hint">${esc(e.error)}</p>` : ""}
  </div>`;
}
async function doctorCritique(btn) {
  if (!S.draft) return;
  btn.disabled = true;
  try {
    const res = await post("/api/doctor/critique", { script: S.draft });
    setDoctor({ score: res.score, issues: res.issues || [] });
    const ta = $("#doc-issues");
    if (ta) ta.value = (res.issues || []).join("\n");
    toast("Critique ready — edit the issues, then Rewrite.", "ok");
  } catch (e) { toast(esc(e.message), "bad"); }
  finally { btn.disabled = false; }
}
async function doctorRewrite(btn) {
  if (!S.draft) return;
  const doc = doctor();
  const issues = (($("#doc-issues") || {}).value || "").split("\n").map(s => s.trim()).filter(Boolean);
  btn.disabled = true;
  try {
    const res = await post("/api/doctor/rewrite", { script: S.draft, score: doc.score, issues });
    const before = { title: S.draft.title, score: doc.score, issues: issues.slice() };
    S.draft = res.script;
    saveDraft();
    doc.score = res.score;
    doc.issues = res.issues || [];
    doc.history = (doc.history || []).concat([{ pass: (doc.history || []).length + 1, before,
      critique: { score: before.score, issues: before.issues }, rewrote: true,
      after: { title: res.script.title, score: res.score, issues: res.issues || [] } }]);
    saveDraftMeta();
    drawEditor();
    toast("Rewritten — the issues are fixed and re-scored.", "ok");
  } catch (e) { toast(esc(e.message), "bad"); }
  finally { if (document.body.contains(btn)) btn.disabled = false; }
}
async function doctorPasses(btn) {
  if (!S.draft) return;
  const passes = +($("#doc-passes") || {}).value || 2;
  btn.disabled = true;
  try {
    await post("/api/doctor/passes", { script: S.draft, passes });
    toast(`Script Doctor running ${passes} pass(es)…`, "info");
    tick();
  } catch (e) { toast(esc(e.message), "bad"); btn.disabled = false; }
}

// ------------------------------------------------------------------ export / import (scene text + image text)
function buildExport() {
  const d = S.draft;
  const multi = MULTI.has(d.style) || d.scenes.some(s => s.speaker === "B");
  const secs = S.form.duration || 40;
  const targetWords = Math.round(secs * 2.6);
  const scenes = d.scenes.map((s, i) => {
    const o = { index: i, narration: s.narration, search_query: s.search_query, image_prompt: s.image_prompt };
    if (multi) o.speaker = s.speaker || "A";
    return o;
  });
  // the original topic the user typed (not the script's normalised subject)
  const topic = (S.form.mode === "topic" && (S.form.topic || "").trim()) || d.topic || "";
  const rules = 'Return ONLY a JSON object, no other text: {"scenes":[{"narration":"the spoken line",'
    + '"search_query":"1-4 English words naming concrete stock footage","image_prompt":"a vivid English prompt '
    + 'for an AI image"}]}. Keep the total spoken length about the same — roughly ' + targetWords + ' words (~'
    + secs + ' seconds). You may rework, split or merge scenes as long as the length stays close'
    + (multi ? ", and keep a speaker (A/B) on each scene." : ".")
    + ' Output raw, valid JSON only. Do not use Markdown code fences, XML tags, escape wrappers, or any '
    + 'formatting around the JSON. Ensure the response can be parsed directly by JSON.parse() without any '
    + 'preprocessing.';
  return JSON.stringify({
    topic,
    instructions: "Rewrite these short vertical-video scenes so they hold viewers to the end. "
      + 'The scenes were generated from the "topic" field — use it as context. ' + rules,
    scenes,
  }, null, 2);
}
function openDocModal(mode, text) {
  const el = $("#doc-modal");
  el.hidden = false;
  const isExport = mode === "export";
  el.innerHTML = `<div class="docmodal-bg" data-doc-close></div>
    <section class="docmodal-panel" role="dialog" aria-modal="true" aria-label="${isExport ? "Export scenes" : "Import scenes"}">
      <div class="docmodal-head"><b>${isExport ? "Export scenes" : "Import scenes"}</b></div>
      <p class="hint">${isExport
        ? "Paste this into another chat model. It returns JSON you can Import back — scene text and image text only."
        : "Paste the JSON another model returned, e.g. {&quot;scenes&quot;:[{&quot;narration&quot;:…,&quot;search_query&quot;:…,&quot;image_prompt&quot;:…}]}."}</p>
      <textarea id="doc-text" spellcheck="false" placeholder="${isExport ? "" : "Paste JSON here…"}">${esc(text || "")}</textarea>
      <div class="actions end">
        ${isExport
          ? `<button class="btn sm" type="button" data-doc-copy>${I.copy}Copy</button><button class="btn sm" type="button" data-doc-download>${I.dl}Download</button>`
          : `<button class="btn primary sm" type="button" data-doc-apply>Apply</button>`}
        <button class="btn sm" type="button" data-doc-close>Close</button>
      </div>
    </section>`;
}
function closeDocModal() { const el = $("#doc-modal"); if (el) { el.hidden = true; el.innerHTML = ""; } }
function downloadText(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
function parseScenesText(text) {
  let t = String(text || "").trim();
  const fence = t.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);   // strip ```json … ``` wrappers
  if (fence) t = fence[1].trim();
  const tryParse = s => { try { return JSON.parse(s); } catch { return undefined; } };
  let data = tryParse(t);
  if (data === undefined) {                                      // else pull the first {…} / […] block out
    const start = Math.min(...[t.indexOf("{"), t.indexOf("[")].filter(i => i !== -1));
    const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
    if (Number.isFinite(start) && end > start) data = tryParse(t.slice(start, end + 1));
  }
  if (data === undefined) throw new Error("That isn't valid JSON — paste the model's JSON (code fences are fine).");
  return data;
}
function applyImport(text) {
  const data = parseScenesText(text);
  const scenes = Array.isArray(data) ? data : (data.scenes || []);
  if (!Array.isArray(scenes) || !scenes.length) throw new Error("No scenes found in that JSON.");
  let changed = 0;
  scenes.forEach((sc, i) => {
    const idx = Number.isInteger(sc.index) ? sc.index : i;
    const target = S.draft.scenes[idx];
    if (!target) return;
    if (typeof sc.narration === "string" && sc.narration.trim()) { target.narration = sc.narration.trim(); changed++; }
    if (typeof sc.search_query === "string") target.search_query = sc.search_query.trim();
    if (typeof sc.image_prompt === "string") target.image_prompt = sc.image_prompt.trim();
    if (sc.speaker && ["A", "B"].includes(sc.speaker)) target.speaker = sc.speaker;
  });
  if (!changed) throw new Error("Nothing to import (no narration found).");
  saveDraft();
  return changed;
}

// Post-render drawer: the same scenes for a finished video.
async function loadFootage(vid) {
  const box = $("#d-footage");
  if (!box) return;
  let data;
  try { data = await get(`/api/videos/${vid}/scenes`); }
  catch (e) { box.innerHTML = `<h2>Footage</h2><p class="hint">${esc(e.message)}</p>`; return; }
  if (!$("#d-footage")) return;
  const scenes = data.scenes || [];
  box.innerHTML = `<h2>Footage</h2>
    <p class="hint">Each scene is matched with the AI's short search phrase (below), tried against your visual sources in order — Pexels/Pixabay <b>videos first, then photos</b> — and retried with a simplified phrase and the topic if nothing scores. Not happy? <b>Replace</b> searches again with a phrase you can edit; <b>Use my file</b> takes an image or video from this computer. Then re-render — the rest is kept.</p>
    ${scenes.length ? `<div class="shots">${scenes.map(s => shotCard(vid, s)).join("")}</div>`
      : `<div class="empty">This video has no scenes to edit.</div>`}
    <div class="actions end"><button class="btn primary" type="button" data-rerender="${vid}">${I.refresh}Re-render with this footage</button></div>`;
}
function shotCard(vid, s) {
  const m = s.media || {};
  const generated = m.source === "generated";
  const preview = s.preview ? mediaTag(`/media/${vid}`, s.index, m.kind)
    : `<div class="ph">${generated ? "generated" : esc(m.source || "no clip")}</div>`;
  const chip = !s.media ? `<span class="chip">none</span>`
    : generated ? `<span class="chip bad">no match</span>`
      : `<span class="chip">${esc(m.source)}${m.kind ? " · " + esc(m.kind) : ""}${m.credit ? " · " + esc(m.credit) : ""}</span>`;
  const viewAttrs = s.preview ? ` data-view="/media/${vid}/${s.index}" data-kind="${esc(m.kind || "")}" data-title="Scene ${s.index + 1}"` : "";
  return `<div class="shot">
    <div class="shot-thumb${s.preview ? " zoom" : ""}"${viewAttrs}>${preview}</div>
    <div class="shot-body">
      <div class="shot-head"><b>Scene ${s.index + 1}</b>${chip}</div>
      <small>${esc((s.narration || "").slice(0, 150))}</small>
      <small class="match">${describeMatch(s)}</small>
      <div class="actions">
        <button class="btn ghost sm" type="button" data-replace="${s.index}" data-q="${esc(s.search_query || "")}">${I.spark}Replace</button>
        <button class="btn ghost sm" type="button" data-manual="${s.index}">${I.upload}Use my file</button>
      </div>
    </div>
  </div>`;
}
function bindFootage(box, vid) {
  box.onclick = async e => {
    const zoom = e.target.closest(".shot-thumb.zoom");
    if (zoom && zoom.dataset.view) return openViewer(zoom.dataset.view, zoom.dataset.kind, zoom.dataset.title);
    const rep = e.target.closest("[data-replace]");
    if (rep) return openCand(`/api/videos/${vid}`, `/media/${vid}`, +rep.dataset.replace, rep.dataset.q || "",
                             () => loadFootage(vid));
    const man = e.target.closest("[data-manual]");
    if (man) return manualPick(vid, +man.dataset.manual);
    const rr = e.target.closest("[data-rerender]");
    if (rr) {
      try { await post(`/api/videos/${vid}/render`, {}); toast("Re-rendering in the background — watch Queue.", "info"); tick(); }
      catch (err) { toast(esc(err.message), "bad"); }
    }
  };
}
function manualPick(vid, n) {
  chooseMediaFile(`/api/videos/${vid}`, n, () => loadFootage(vid));
}

// ------------------------------------------------------------------ candidate picker (shared modal)
let CAND = { api: "", fbase: "", n: 0, query: "", cands: [], onPicked: null };
async function openCand(api, fbase, n, query, onPicked) {
  CAND = { api, fbase, n, query: query || "", cands: [], onPicked };
  const el = $("#cand");
  el.hidden = false;
  el.innerHTML = `<div class="cand-bg" data-cand-close></div>
    <section class="cand-panel" role="dialog" aria-modal="true" aria-label="Choose footage">
      <div class="cand-head"><b>Scene ${n + 1} footage</b></div>
      <div class="cand-body">
        <div class="with-btn"><input type="text" id="cand-q" value="${esc(query)}" placeholder="footage search"><button class="btn sm" type="button" data-cand-search>${I.search}Search</button></div>
        <div class="cand-list" id="cand-list"><div class="empty">Searching…</div></div>
      </div>
      <div class="cand-foot"><span class="hint">Pick a result to use for this scene.</span><button class="btn sm" type="button" data-cand-close>Cancel</button></div>
    </section>`;
  await candSearch();
}
async function candSearch() {
  const q = $("#cand-q") ? $("#cand-q").value.trim() : CAND.query;
  CAND.query = q;
  const list = $("#cand-list");
  if (list) list.innerHTML = `<div class="empty">Searching…</div>`;
  try {
    CAND.cands = (await post(`${CAND.api}/scenes/${CAND.n}/search`, { query: q })).candidates || [];
  } catch (e) {
    if (list) list.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  drawCandList();
}
function drawCandList() {
  const list = $("#cand-list");
  if (!list) return;
  if (!CAND.cands.length) {
    list.innerHTML = `<div class="empty"><b>No results</b>Try different words, or add a free Pexels/Pixabay key in <a href="#system">System</a>.</div>`;
    return;
  }
  list.innerHTML = CAND.cands.map((c, i) => `
    <div class="cand">
      <button class="cand-thumb" type="button" data-cand-view="${i}" aria-label="Preview">
        ${c.thumb ? `<img src="${esc(c.thumb)}" alt="" loading="lazy">` : `<span class="ph">${esc(c.kind)}</span>`}
        ${c.kind === "video" ? `<span class="play">${I.play}</span>` : ""}
      </button>
      <div class="cand-meta"><b>${esc(c.source)}</b><small>${esc(c.kind)}${c.width ? ` · ${c.width}×${c.height}` : ""}${c.duration ? ` · ${Math.round(c.duration)}s` : ""}${c.credit ? ` · ${esc(c.credit)}` : ""}</small></div>
      <div class="cand-actions"><button class="btn sm" type="button" data-cand-pick="${i}">Use this</button></div>
    </div>`).join("");
}
function candView(i) {
  const c = CAND.cands[i];
  if (!c) return;
  if (c.local) return toast("A local file — the browser can't preview it here.", "info");
  openViewer(c.kind === "video" ? c.url : (c.thumb || c.url), c.kind, `${c.source} · ${c.kind}`);
}
async function candPick(i) {
  const c = CAND.cands[i];
  if (!c) return;
  const list = $("#cand-list");
  if (list) list.innerHTML = `<div class="empty">Downloading…</div>`;
  try {
    await post(`${CAND.api}/scenes/${CAND.n}/pick`, { item: c });
    const done = CAND.onPicked;
    closeCand();
    toast("Footage picked.", "ok");
    if (done) done();
  } catch (e) { toast(esc(e.message), "bad"); drawCandList(); }
}
function closeCand() {
  const el = $("#cand");
  if (el) { el.hidden = true; el.innerHTML = ""; }
}

// ------------------------------------------------------------------ QUEUE
const openLogs = new Set();
function viewQueue() {
  $("#main").innerHTML = `<div class="page-head"><div><h1>Queue</h1><p>Jobs run one at a time, in order. Each shows its live stage and log.</p></div></div><div class="jobs" id="jobs"></div>`;
  drawJobs();
}
function drawJobs() {
  const box = $("#jobs");
  if (!box) return;
  if (!S.jobs.length) { box.innerHTML = `<div class="empty"><b>Nothing running</b>Jobs you start from Create, Ideas or Clip show up here.</div>`; return; }
  const scroll = {};
  $$(".log", box).forEach(l => { scroll[l.dataset.id] = l.scrollHeight - l.scrollTop - l.clientHeight < 30; });
  box.innerHTML = S.jobs.map(j => {
    const r = j.result || {};
    const running = j.status === "running";
    const open = running || openLogs.has(j.id);
    const took = j.started ? Math.round(((j.finished || Date.now() / 1000) - j.started)) : null;
    const stage = (STAGES.find(([k]) => k === j.stage) || [0, j.stage])[1];
    return `<div class="job ${j.status}">
      <div class="job-top"><span class="kind">${KIND_ICON[j.kind] || I.film}</span>
        <div class="t"><b>${esc(r.title || j.label)}</b><small><span class="status-pill ${j.status}">${j.status}</span>${running && stage ? ` · ${esc(stage)}` : ""}${running && j.message ? ` · ${esc(j.message)}` : ""}${took != null ? ` · ${fmtSec(took)}` : ""}</small></div>
        ${j.status === "queued" ? `<button class="btn ghost sm" type="button" data-cancel="${j.id}">Cancel</button>` : ""}
        ${j.status === "done" && r.id ? `<button class="btn sm" type="button" data-open="${r.id}">${I.play}Watch</button>` : ""}
        ${j.status === "done" && j.kind === "draft" ? `<a class="btn sm" href="#create">${I.pen}Edit</a>` : ""}
        <button class="btn ghost sm" type="button" data-log="${j.id}">${open ? "Hide log" : "Log"}</button>
      </div>
      ${j.status !== "cancelled" ? `<div class="pbar"><i data-w="${j.status === "failed" ? 100 : j.pct}"></i></div>` : ""}
      ${r.error ? `<div class="err">${esc(r.error)}</div>` : ""}
      ${r.clips ? `<div class="chips">${r.clips.map(c => `<span class="chip ${c.ok ? "ok" : "bad"}"${c.id ? ` data-open="${c.id}"` : ""}>${esc(c.title || "clip")}</span>`).join("")}</div>` : ""}
      ${open ? `<pre class="log" data-id="${j.id}">${esc(j.log.join("\n")) || "…"}</pre>` : ""}
    </div>`;
  }).join("");
  paint(box);
  $$(".log", box).forEach(l => { if (scroll[l.dataset.id] !== false) l.scrollTop = l.scrollHeight; });
  box.onclick = async e => {
    const lg = e.target.closest("[data-log]");
    if (lg) { const id = +lg.dataset.log; openLogs.has(id) ? openLogs.delete(id) : openLogs.add(id); drawJobs(); }
    const c = e.target.closest("[data-cancel]");
    if (c) { await post(`/api/jobs/${c.dataset.cancel}/cancel`).catch(() => {}); tick(); }
  };
}

// ------------------------------------------------------------------ IDEAS
async function viewIdeas() {
  const main = $("#main");
  let data;
  try { data = await get("/api/ideas"); } catch (e) { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (S.view !== "ideas") return;
  const styles = [["", "Any format"], ...FORMATS.filter(([k]) => k !== "auto").map(([k, n]) => [k, n])];
  main.innerHTML = `
  <div class="page-head"><div><h1>Ideas</h1><p>Plan a week of videos in one go. The autopilot and Create → Idea queue always use these first, oldest first.</p></div></div>
  <div class="grid2">
    <section class="card"><h2>Plan with AI</h2>
      <div class="field"><label>Niche (optional)</label><input type="text" id="plan-niche" placeholder="e.g. space and the universe — blank uses your NICHES"></div>
      <div class="field"><label>How many</label><div class="range-row"><input type="range" id="plan-n" min="3" max="30" value="10"><output id="plan-out">10</output></div></div>
      <div class="actions end"><button class="btn primary" id="plan-go" type="button">${I.spark}Plan ideas</button></div>
    </section>
    <section class="card"><h2>Add your own</h2>
      <div class="field"><label>Idea</label><input type="text" id="idea-s" placeholder="e.g. The man who survived two atomic bombs"></div>
      <div class="field"><label>Format</label><select id="idea-f">${styles.map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></div>
      <div class="actions end"><button class="btn" id="idea-add" type="button">${I.plus}Add to queue</button></div>
    </section>
  </div>
  <section class="card"><h2>Queue · ${data.pending.length}</h2>
    ${data.pending.length ? `<div class="list">${data.pending.map(i => `
      <div class="item"><span class="chip ${i.style ? "accent" : ""}">${esc(i.style || "auto")}</span>
        <div class="grow"><b>${esc(i.subject)}</b>${i.notes ? `<small>${esc(i.notes)}</small>` : ""}</div>
        <button class="btn sm" type="button" data-make="${i.id}">${I.play}Make now</button>
        <button class="btn ghost sm" type="button" data-del="${i.id}" aria-label="Remove">${I.trash}</button></div>`).join("")}</div>`
      : `<div class="empty"><b>The queue is empty</b>Plan some ideas with AI, or add your own.</div>`}
  </section>
  ${data.used.length ? `<section class="card"><h2>Recently made</h2><div class="list">${data.used.map(i => `
      <div class="item"><span class="chip">${esc(i.style || "auto")}</span><div class="grow"><b>${esc(i.subject)}</b><small>${ago(i.used_at)}</small></div>
      ${i.video_id ? `<button class="btn ghost sm" type="button" data-open="${i.video_id}">${I.play}Watch</button>` : ""}</div>`).join("")}</div></section>` : ""}`;
  $("#plan-n").oninput = e => { $("#plan-out").textContent = e.target.value; };
  $("#plan-go").onclick = async () => {
    try { await post("/api/plan", { count: +$("#plan-n").value, niche: $("#plan-niche").value }); toast("Planning ideas… (see Queue)", "info"); tick(); }
    catch (e) { toast(esc(e.message), "bad"); }
  };
  $("#idea-add").onclick = async () => {
    const s = $("#idea-s").value.trim();
    if (!s) return;
    try { await post("/api/ideas", { subject: s, style: $("#idea-f").value }); viewIdeas(); refreshInfo(); } catch (e) { toast(esc(e.message), "bad"); }
  };
  main.onclick = async e => {
    const d = e.target.closest("[data-del]"), m = e.target.closest("[data-make]");
    if (d) { await post(`/api/ideas/${d.dataset.del}/delete`).catch(() => {}); viewIdeas(); refreshInfo(); }
    if (m) {
      const idea = data.pending.find(i => i.id === +m.dataset.make);
      await post(`/api/ideas/${idea.id}/delete`).catch(() => {});
      const topic = idea.notes ? `${idea.subject} (angle: ${idea.notes})` : idea.subject;
      try { await post("/api/make", payload({ topic, url: "", source: "", style: idea.style || "" })); toast("Making it now — see Queue.", "info"); tick(); viewIdeas(); refreshInfo(); }
      catch (err) { toast(esc(err.message), "bad"); }
    }
  };
}
async function refreshInfo() { try { S.info = await get("/api/info"); status(); } catch { /* ignore */ } }

// ------------------------------------------------------------------ CLIP
function viewClip() {
  const c = store.get("clip", { source: "", count: 3, crop: "center", upload: false });
  $("#main").innerHTML = `
  <div class="page-head"><div><h1>Clip a long video</h1><p>Turn a podcast, interview, talk or stream into Shorts of its best moments.</p></div></div>
  <div class="create">
    <section class="card"><h2>Source</h2>
      <div class="field"><label>Video file or URL</label><input type="text" id="c-src" value="${esc(c.source)}" placeholder="/Users/me/Videos/podcast.mp4  or  https://…"><p class="hint">Local files work out of the box. URLs need <span class="mono">pip install yt-dlp</span>. Only clip videos you own or may reuse.</p></div>
      <div class="grid2">
        <div class="field"><label>Clips</label><div class="range-row"><input type="range" id="c-n" min="1" max="10" value="${c.count}"><output id="c-out">${c.count}</output></div></div>
        <div class="field"><label>Framing</label>${seg("crop", [["center", "Fill (crop)"], ["blur", "Fit + blur"]], c.crop)}</div>
      </div>
      <div class="field"><label class="switch"><input type="checkbox" id="c-up"${c.upload ? " checked" : ""}${S.info.upload ? "" : " disabled"}><span>Upload the clips when done</span></label></div>
      <div class="actions end"><button class="btn primary" id="c-go" type="button">${I.scissors}Find the best moments</button></div>
    </section>
    <section class="card"><h2>How it works</h2><div class="list">
      <div class="item"><span class="chip accent">1</span><div class="grow"><b>Transcribe</b><small>Word-level timing with faster-whisper (free, local) or OpenAI.</small></div></div>
      <div class="item"><span class="chip accent">2</span><div class="grow"><b>AI picks the moments</b><small>Self-contained, 20–58 s, a hook in the first line and a payoff at the end. Each gets a title and a retention score.</small></div></div>
      <div class="item"><span class="chip accent">3</span><div class="grow"><b>Vertical, captioned, loud enough</b><small>9:16 crop or blurred fit, word-by-word captions, hook title, loudness to −14 LUFS.</small></div></div>
    </div></section>
  </div>`;
  const save = () => store.set("clip", c);
  $("#c-n").oninput = e => { c.count = +e.target.value; $("#c-out").textContent = c.count; save(); };
  $("#c-src").oninput = e => { c.source = e.target.value; save(); };
  $("#c-up").onchange = e => { c.upload = e.target.checked; save(); };
  $("#main").addEventListener("click", e => {
    const b = e.target.closest("[data-seg=crop]");
    if (b) { c.crop = b.dataset.v; $$("[data-seg=crop]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.v === c.crop))); save(); }
  });
  $("#c-go").onclick = async () => {
    if (!c.source.trim()) return toast("Give a video file path or URL.", "bad");
    try { await post("/api/clip", { source: c.source.trim(), count: c.count, crop: c.crop, upload: c.upload }); toast("Clipping… follow it in Queue.", "info"); tick(); }
    catch (e) { toast(esc(e.message), "bad"); }
  };
}

// ------------------------------------------------------------------ CHANNEL
async function viewChannel() {
  const main = $("#main");
  let ch;
  try { [ch, S.info] = await Promise.all([get("/api/channel"), get("/api/info")]); } catch (e) { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (S.view !== "channel") return;
  const i = S.info, cnt = i.counts || {};
  const live = (cnt.uploaded || 0) + (cnt.scheduled || 0);
  const top = Math.max(1, ...ch.by_style.map(s => s.avg_views));
  main.innerHTML = `
  <div class="page-head"><div><h1>Channel</h1><p>How your uploads are doing${ch.synced ? ` · stats from ${ago(ch.synced)}` : ""}.</p></div>
    <button class="btn" id="sync" type="button">${I.refresh}Refresh stats</button></div>
  ${i.learn_from_stats ? "" : `<div class="banner">${I.spark}<p>Set <span class="mono">LEARN_FROM_STATS=true</span> in .env and new scripts will learn from what performs best here. Add <span class="mono">YOUTUBE_API_KEY</span> (or run <span class="mono">purffle-shorts auth</span> again) so stats can be read.</p></div>`}
  <div class="kpis">
    <div class="kpi"><small>Videos made</small><b>${fmtNum(i.total)}</b></div>
    <div class="kpi"><small>On YouTube</small><b>${fmtNum(live)}</b></div>
    <div class="kpi"><small>Total views</small><b>${fmtNum(i.views)}</b></div>
    <div class="kpi"><small>Ideas queued</small><b>${fmtNum(i.ideas)}</b></div>
  </div>
  ${ch.videos.length ? `<div class="grid2">
    <section class="card"><h2>Average views by format</h2>${ch.by_style.map(s => `<div class="hbar"><span>${esc(s.style)}</span><span class="track"><i data-w="${100 * s.avg_views / top}"></i></span><span class="num">${fmtNum(s.avg_views)}</span></div>`).join("")}</section>
    <section class="card"><h2>Best performer</h2>${(() => { const v = ch.videos[0]; return `<h3>${esc(v.title)}</h3><p class="muted">${fmtNum(v.views)} views · ${fmtNum(v.likes)} likes · ${esc(v.style || "")}</p><button class="btn sm" type="button" data-open="${v.id}">${I.play}Open</button>`; })()}</section>
  </div>
  <section class="card"><h2>Videos</h2><table><thead><tr><th>Title</th><th>Format</th><th class="num">Score</th><th class="num">Views</th><th class="num">Likes</th></tr></thead>
    <tbody>${ch.videos.map(v => `<tr><td><a href="#library" data-open="${v.id}">${esc(v.title)}</a></td><td>${esc(v.style || "")}</td><td class="num">${v.score ?? "–"}</td><td class="num">${fmtNum(v.views)}</td><td class="num">${fmtNum(v.likes)}</td></tr>`).join("")}</tbody></table></section>`
    : `<section class="card"><div class="empty"><b>No stats yet</b>Upload some videos, then refresh. View counts need a day or two to mean something.</div></section>`}`;
  paint(main);
  $("#sync").onclick = async () => { try { await post("/api/stats"); toast("Refreshing stats…", "info"); tick(); } catch (e) { toast(esc(e.message), "bad"); } };
}

// ------------------------------------------------------------------ SYSTEM
async function viewSystem() {
  const main = $("#main");
  main.innerHTML = `<div class="page-head"><div><h1>System</h1><p>Setup checks, settings and ways to drive PurffleShorts from other tools.</p></div></div><div id="sys"><div class="empty">Checking your setup…</div></div>`;
  let checks, set;
  try { [checks, set] = await Promise.all([get("/api/doctor"), get("/api/settings")]); }
  catch (e) { $("#sys").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (S.view !== "system") return;
  const bad = checks.filter(c => c.ok === false).length;
  const mcp = JSON.stringify({ mcpServers: { "purffle-shorts": { command: "purffle-shorts", args: ["mcp"], env: { PURFFLE_HOME: "/path/to/your/purffle/folder" } } } }, null, 2);
  $("#sys").innerHTML = `
  <section class="card"><h2>Setup · ${bad ? `<span class="chip bad">${bad} to fix</span>` : `<span class="chip ok">all good</span>`}</h2>
    <div class="checks">${checks.map(c => `<div class="check"><span class="m ${c.ok === true ? "ok" : c.ok === false ? "bad" : "info"}">${c.ok === true ? "✔" : c.ok === false ? "✘" : "•"}</span><span>${esc(c.label)}</span><span>${esc(c.detail)}</span></div>`).join("")}</div>
    <p class="hint">Settings live in <span class="mono">.env</span>. Appearance &amp; content can be edited below and apply to new videos straight away; edits you make to <span class="mono">.env</span> by hand need a restart.</p></section>
  ${settingsCard(set)}
  <div class="grid2">
    <section class="card"><h2>Use from Claude & other AI apps (MCP)</h2>
      <p class="muted">Add this to Claude Desktop, Claude Code, Cursor or any MCP client, then ask: “make a 30-second Short about why cats purr”.</p>
      <pre class="code" id="mcp">${esc(mcp)}</pre><div class="actions end"><button class="btn sm" id="copy" type="button">${I.copy}Copy</button></div></section>
    <section class="card"><h2>Command line</h2><pre class="code">purffle-shorts run                 # autopilot
purffle-shorts make --style chat   # one video
purffle-shorts make --url https://…
purffle-shorts clip talk.mp4 --count 3
purffle-shorts plan --count 14
purffle-shorts stats
purffle-shorts doctor</pre></section>
  </div>
  <p class="hint">PurffleShorts ${esc(S.info.version)} · <a href="https://github.com/Chamanrajragu/purffle-shorts" target="_blank" rel="noopener">GitHub</a></p>`;
  $("#copy").onclick = async () => { try { await navigator.clipboard.writeText(mcp); toast("Copied.", "ok", 2000); } catch { toast("Select the text and copy it.", "info"); } };
  bindSettings(set);
}

function settingsCard(set) {
  if (!set.can_save) {
    return `<section class="card"><h2>Settings</h2>
      <p class="hint">No <span class="mono">.env</span> file was found next to the Studio, so these can only be edited by hand for now.</p></section>`;
  }
  const v = set.values || {}, ch = set.choices || {};
  const kinds = {}; (set.fields || []).forEach(f => { kinds[f.attr] = f.kind; });
  const groups = SETTING_GROUPS.map(([name, attrs]) => {
    const rows = attrs.filter(a => a in kinds).map(a => settingRow(a, kinds[a], v[a], ch[a])).join("");
    return `<fieldset class="settings-group"><legend>${esc(name)}</legend>${rows}</fieldset>`;
  }).join("");
  return `<section class="card"><h2>Settings</h2>
    <p class="hint">Saved to <span class="mono">${esc(set.env_file)}</span> and applied to new videos right away. Your keys and every other line are left untouched.</p>
    <div class="settings-groups">${groups}</div>
    <div class="actions end"><button class="btn primary" id="set-save" type="button">${I.check}Save settings</button></div>
  </section>`;
}

function settingRow(attr, kind, val, choices) {
  const [label, desc] = SETTING_INFO[attr] || [attr, ""];
  if (kind === "bool")
    return `<label class="setting-switch"><span class="txt"><b>${esc(label)}</b><small>${esc(desc)}</small></span><input type="checkbox" data-set="${attr}"${val ? " checked" : ""}></label>`;
  const hint = `<p class="hint">${esc(desc)}</p>`;
  if (kind === "choice")
    return `<div class="field"><label>${esc(label)}</label><select data-set="${attr}">${(choices || []).map(o => `<option value="${esc(o)}"${o === val ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>${hint}</div>`;
  if (kind === "int")
    return `<div class="field"><label>${esc(label)}</label><input type="number" min="1" max="20" data-set="${attr}" value="${esc(val)}">${hint}</div>`;
  if (kind === "float")
    return `<div class="field"><label>${esc(label)}<output data-out="${attr}"> ${esc(val)}</output></label><input type="range" min="0" max="1" step="0.02" data-set="${attr}" value="${esc(val)}">${hint}</div>`;
  if (attr === "music_dir" || attr === "music_file") {
    const mode = attr === "music_dir" ? "dir" : "file";
    const list = attr === "music_file" ? ' list="music-file-list"' : "";
    const datalist = attr === "music_file" ? `<datalist id="music-file-list"></datalist>` : "";
    const count = attr === "music_dir" ? `<small class="hint" data-music-count></small>` : "";
    return `<div class="field"><label>${esc(label)}</label>
      <div class="with-btn"><input type="text" data-set="${attr}" value="${esc(val)}"${list}><button class="btn ghost sm" type="button" data-pick="${mode}">${I.folder}Browse</button></div>
      ${count}${datalist}${hint}</div>`;
  }
  return `<div class="field"><label>${esc(label)}</label><input type="text" data-set="${attr}" value="${esc(val)}">${hint}</div>`;
}

function bindSettings(set) {
  const btn = $("#set-save"), sys = $("#sys");
  if (!btn || !sys) return;
  sys.addEventListener("input", e => {
    const el = e.target.closest("[data-set]");
    if (el && el.dataset.set === "music_volume") { const o = sys.querySelector('[data-out="music_volume"]'); if (o) o.textContent = " " + el.value; }
  });
  sys.addEventListener("change", e => {
    const el = e.target.closest("[data-set]");
    if (el && el.dataset.set === "music_dir") refreshMusic();
  });
  sys.addEventListener("click", e => {
    const b = e.target.closest("[data-pick]");
    if (!b) return;
    const dir = sys.querySelector('[data-set="music_dir"]');
    const file = sys.querySelector('[data-set="music_file"]');
    if (b.dataset.pick === "dir") {
      openPicker({ mode: "dir", kind: "dir", title: "Choose a music folder", start: dir ? dir.value.trim() : "",
        onPick: v => { if (dir) dir.value = v; refreshMusic(); } });
    } else {
      openPicker({ mode: "file", kind: "audio", title: "Choose a background track",
        start: (file && file.value.trim()) || (dir ? dir.value.trim() : ""),
        onPick: v => { if (file) file.value = v; } });
    }
  });
  btn.onclick = async () => {
    const body = {};
    (set.fields || []).forEach(({ attr, kind }) => {
      const el = sys.querySelector(`[data-set="${attr}"]`);
      if (!el) return;
      body[attr] = kind === "bool" ? el.checked : (kind === "int" || kind === "float") ? +el.value : el.value;
    });
    btn.disabled = true;
    try {
      const res = await post("/api/settings", body);
      Object.entries(res.values || {}).forEach(([k, val]) => {
        const el = sys.querySelector(`[data-set="${k}"]`);
        if (el) { if (el.type === "checkbox") el.checked = !!val; else el.value = val; }
        const o = sys.querySelector(`[data-out="${k}"]`);
        if (o) o.textContent = " " + val;
      });
      toast("Settings saved — they apply to new videos.", "ok");
      refreshInfo();
      refreshMusic();
    } catch (e) { toast(esc(e.message), "bad"); }
    finally { btn.disabled = false; }
  };
  refreshMusic();
}

async function refreshMusic() {
  const sys = $("#sys");
  if (!sys) return;
  const dir = sys.querySelector('[data-set="music_dir"]');
  const countEl = sys.querySelector("[data-music-count]");
  const value = dir ? dir.value.trim() : "";
  try {
    const m = await get("/api/music?dir=" + encodeURIComponent(value));
    if (countEl) {
      countEl.textContent = !value ? "Uses the project's music/ folder."
        : m.exists ? `${m.count} track${m.count === 1 ? "" : "s"} found${m.count ? " — one is picked per video" : " (the folder is empty)"}`
          : "That folder doesn't exist yet.";
    }
    const dl = $("#music-file-list");
    if (dl) dl.innerHTML = (m.files || []).map(f => `<option value="${esc(f)}"></option>`).join("");
  } catch { /* server restarting — leave the hint as is */ }
}

// ------------------------------------------------------------------ folder / file picker (reusable)
let PICK = null;
function joinPath(dir, name) {
  return /[\\/]$/.test(dir) ? dir + name : dir + (dir.includes("\\") && !dir.includes("/") ? "\\" : "/") + name;
}
// opts: {mode:"dir"|"file", kind:"dir"|"audio"|"media", title, start, onPick(value)}
async function openPicker(opts) {
  PICK = { mode: opts.mode || "file", kind: opts.kind || (opts.mode === "dir" ? "dir" : "audio"),
           title: opts.title || (opts.mode === "dir" ? "Choose a folder" : "Choose a file"),
           onPick: opts.onPick, filter: "", dirs: [], files: [], path: "", parent: "", home: "", error: "" };
  $("#picker").hidden = false;
  await loadPicker(opts.start || "");
}
async function loadPicker(path) {
  if (!PICK) return;
  let data;
  try { data = await get(`/api/browse?kind=${encodeURIComponent(PICK.kind)}&path=${encodeURIComponent(path)}`); }
  catch (e) { return toast(esc(e.message), "bad"); }
  PICK.path = data.path || ""; PICK.parent = data.parent || ""; PICK.home = data.home || "";
  PICK.dirs = data.dirs || []; PICK.files = data.files || []; PICK.error = data.error || "";
  PICK.filter = "";
  drawPicker();
}
function pickerRows() {
  const f = PICK.filter.toLowerCase();
  const rows = [];
  if (PICK.parent) rows.push(`<button class="picker-row" type="button" data-nav="${esc(PICK.parent)}">${I.up}<b>Parent folder</b></button>`);
  if (PICK.home && PICK.home !== PICK.path) rows.push(`<button class="picker-row" type="button" data-nav="${esc(PICK.home)}">${I.home}<b>Home</b></button>`);
  PICK.dirs.filter(d => d.toLowerCase().includes(f)).forEach(d =>
    rows.push(`<button class="picker-row dir" type="button" data-nav="${esc(joinPath(PICK.path, d))}">${I.folder}<b>${esc(d)}</b></button>`));
  if (PICK.mode === "file") PICK.files.filter(n => n.toLowerCase().includes(f)).forEach(n =>
    rows.push(`<button class="picker-row" type="button" data-file="${esc(n)}">${I.note}<span>${esc(n)}</span></button>`));
  return rows.join("") || `<div class="picker-empty">${esc(PICK.error || "Nothing here.")}</div>`;
}
function drawPicker() {
  const el = $("#picker");
  if (!el) return;
  el.innerHTML = `<div class="picker-bg" data-pk="close"></div>
    <section class="picker-panel" role="dialog" aria-modal="true" aria-label="${esc(PICK.title)}">
      <div class="picker-head">
        <div class="picker-title">${esc(PICK.title)}</div>
        <div class="with-btn"><input type="text" id="pk-path" value="${esc(PICK.path)}" aria-label="Path"><button class="btn sm" type="button" data-pk-go>Go</button></div>
        <div class="with-btn"><input type="search" id="pk-filter" value="${esc(PICK.filter)}" placeholder="Filter this folder…" aria-label="Filter"><button class="btn sm" type="button" data-pk="up"${PICK.parent ? "" : " disabled"}>Up</button></div>
      </div>
      <div class="picker-list">${pickerRows()}</div>
      <div class="picker-foot">
        ${PICK.mode === "dir" ? `<button class="btn primary sm" type="button" data-use>Use this folder</button>`
          : `<span class="hint">${PICK.kind === "audio" ? "Pick an audio file." : "Pick an image or video."}</span>`}
        <button class="btn sm" type="button" data-pk="close">Cancel</button>
      </div>
    </section>`;
}
function onPickerClick(e) {
  if (!PICK) return;
  const close = e.target.closest("[data-pk]");
  if (close) return close.dataset.pk === "up" ? (PICK.parent && loadPicker(PICK.parent)) : closePicker();
  if (e.target.closest("[data-pk-go]")) { const p = $("#pk-path"); return loadPicker(p ? p.value.trim() : ""); }
  const nav = e.target.closest("[data-nav]");
  if (nav) return loadPicker(nav.dataset.nav);
  const file = e.target.closest("[data-file]");
  if (file) { const cb = PICK.onPick; const v = joinPath(PICK.path, file.dataset.file); closePicker(); return cb && cb(v); }
  if (e.target.closest("[data-use]")) { const cb = PICK.onPick; const v = PICK.path; closePicker(); return cb && cb(v); }
}
function onPickerInput(e) {
  if (!PICK || e.target.id !== "pk-filter") return;
  PICK.filter = e.target.value;
  const list = $("#picker .picker-list");
  if (list) list.innerHTML = pickerRows();
}
function onPickerKey(e) {
  if (!PICK || e.key !== "Enter") return;
  if (e.target.id === "pk-path") { e.preventDefault(); loadPicker(e.target.value.trim()); }
  else if (e.target.id === "pk-filter" && PICK.mode === "file") {
    const first = $("#picker [data-file]");
    if (first) { e.preventDefault(); first.click(); }
  }
}
function closePicker() {
  const p = $("#picker");
  if (p) { p.hidden = true; p.innerHTML = ""; }
  PICK = null;
}

// ------------------------------------------------------------------ media viewer
function openViewer(src, kind, title) {
  const el = $("#viewer");
  if (!el) return;
  el.hidden = false;
  el.innerHTML = `<div class="viewer-bg" data-view-close></div>
    <section class="viewer-panel" role="dialog" aria-modal="true" aria-label="${esc(title || "Preview")}">
      <div class="viewer-head"><b>${esc(title || "")}</b><button class="btn ghost sm" type="button" data-view-close aria-label="Close">${I.x}</button></div>
      <div class="viewer-body">${kind === "video" ? `<video src="${esc(src)}" controls autoplay playsinline></video>` : `<img src="${esc(src)}" alt="">`}</div>
    </section>`;
}
function closeViewer() {
  const el = $("#viewer");
  if (!el) return;
  $$("video", el).forEach(v => v.pause());
  el.hidden = true;
  el.innerHTML = "";
}
function chooseMediaFile(api, n, after) {
  openPicker({ mode: "file", kind: "media", title: "Choose an image or video", start: "",
    onPick: async v => {
      try { await post(`${api}/scenes/${n}/manual`, { path: v }); toast("Footage set — it will be used when you render.", "ok"); after && after(); }
      catch (e) { toast(esc(e.message), "bad"); }
    } });
}

boot();
