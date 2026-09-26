"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  run: 0,             // increments per letter so late responses from an old letter are ignored
  sampleId: null,
  transcript: null,   // {lines, uncertain, ...}
  modern: null,       // {sentences, glossary}
  context: null,
  narrationText: "",
  narration: null,    // {audio, words}
  audio: null,
  speaking: false,
  status: { gemini: false, elevenlabs: false },
};

// ---------- helpers ----------

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function api(path, body) {
  const opts = body instanceof FormData
    ? { method: "POST", body }
    : body !== undefined
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {};
  const res = await fetch(path, opts);
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail || detail; } catch (_) { /* not JSON */ }
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json();
}

function setStep(name, cls) {
  const li = document.querySelector(`[data-step="${name}"]`);
  if (li) li.className = cls;
}

function showError(msg) {
  const el = $("#error");
  el.textContent = msg;
  el.hidden = !msg;
}

function showNotice(msg) {
  const el = $("#notice");
  el.textContent = msg;
  el.hidden = !msg;
}

// ---------- status + samples ----------

async function loadStatus() {
  try {
    state.status = await api("/api/status");
  } catch (_) { /* leave defaults */ }
  const el = $("#status");
  const live = state.status.gemini;
  el.textContent = live ? (state.status.elevenlabs ? "Live" : "Live · browser voice") : "Demo mode";
  el.className = "status " + (live ? "live" : "demo");
  el.title = live
    ? `Transcription: ${state.status.transcribe_model}`
    : "No Gemini key yet: uploads show the sample letter. Add keys to .env and restart.";
}

async function loadSamples() {
  const box = $("#samples");
  try {
    const samples = await api("/api/samples");
    box.innerHTML = samples.map((s) => `
      <button class="sample" type="button" data-id="${esc(s.id)}">
        <img src="/api/samples/${esc(s.id)}/image" alt="" loading="lazy">
        <div><strong>${esc(s.title)}</strong><span>${esc(s.writer)} · ${esc(s.date)}</span></div>
      </button>`).join("");
    box.querySelectorAll(".sample").forEach((b) => b.addEventListener("click", () => openSample(b.dataset.id, samples)));
  } catch (e) {
    box.innerHTML = `<p class="placeholder">Could not load samples (${esc(e.message)}).</p>`;
  }
}

// ---------- navigation ----------

function showView(name) {
  $("#view-home").hidden = name !== "home";
  $("#view-reader").hidden = name !== "reader";
  $("#player").hidden = name !== "reader";
  window.scrollTo(0, 0);
}

function selectTab(tab) {
  $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  $$(".panel").forEach((p) => { p.hidden = p.dataset.panel !== tab; });
}

function resetReader() {
  stopNarration();
  state.run += 1;
  Object.assign(state, { sampleId: null, transcript: null, modern: null, context: null, narrationText: "", narration: null, audio: null });
  showError("");
  showNotice("");
  $("#written").innerHTML = '<p class="placeholder">Transcribing…</p>';
  $("#modern").innerHTML = '<p class="placeholder">Waiting for the transcription…</p>';
  $("#context").innerHTML = '<p class="placeholder">Waiting for the modern text…</p>';
  $("#classroom").innerHTML = '<p class="placeholder">Waiting for context…</p>';
  $("#gloss-pop").hidden = true;
  $("#page-img").classList.remove("zoomed");
  ["transcribe", "modernize", "context"].forEach((s) => setStep(s, ""));
  $("#play-btn").disabled = true;
  $("#player-sub").textContent = "Available once the modern version is ready";
  selectTab("written");
}

// ---------- pipeline ----------

async function openFile(file) {
  if (!file) return;
  resetReader();
  const run = state.run;
  showView("reader");
  $("#page-img").src = URL.createObjectURL(file);
  $("#page-caption").textContent = file.name || "Your photo";
  setStep("transcribe", "running");
  try {
    const form = new FormData();
    form.append("image", file);
    const t = await api("/api/transcribe", form);
    if (run !== state.run) return;
    if (t.demo) {
      showNotice("Demo mode: no Gemini key is set, so this shows the sample letter instead of reading your photo.");
    }
    await afterTranscript(t, run);
  } catch (e) {
    if (run !== state.run) return;
    setStep("transcribe", "failed");
    showError(`Could not read the letter. ${e.message}`);
  }
}

async function openSample(id, samples) {
  resetReader();
  const run = state.run;
  state.sampleId = id;
  showView("reader");
  const meta = (samples || []).find((s) => s.id === id);
  $("#page-img").src = `/api/samples/${encodeURIComponent(id)}/image`;
  $("#page-caption").textContent = meta ? meta.note : "";
  setStep("transcribe", "running");
  try {
    const t = await api(`/api/samples/${encodeURIComponent(id)}/transcribe`);
    if (run !== state.run) return;
    await afterTranscript(t, run);
  } catch (e) {
    setStep("transcribe", "failed");
    showError(e.message);
  }
}

async function afterTranscript(t, run) {
  state.transcript = t;
  setStep("transcribe", "done");
  renderWritten();

  setStep("modernize", "running");
  try {
    const m = await api("/api/modernize", { lines: t.lines, sample_id: state.sampleId });
    if (run !== state.run) return;
    state.modern = m;
    setStep("modernize", "done");
    renderWritten();  // glossary now available for the spelling toggle
    renderModern();
    renderGlossaryTable();
    preparePlayer();
  } catch (e) {
    if (run !== state.run) return;
    setStep("modernize", "failed");
    showError(`Modernizing failed. ${e.message}`);
    return;
  }

  setStep("context", "running");
  try {
    const metadata = { writer: t.writer_guess, date: t.date_guess };
    const c = await api("/api/context", { modern_text: state.narrationText, metadata, sample_id: state.sampleId });
    if (run !== state.run) return;
    state.context = c;
    setStep("context", "done");
    renderContext();
    renderClassroom();
  } catch (e) {
    if (run !== state.run) return;
    setStep("context", "failed");
    showError(`Context cards failed. ${e.message}`);
  }
}

// ---------- rendering: as written ----------

const PUNCT = /^[^\wſ^]+|[^\wſ^]+$/g;

function glossIndex() {
  const map = new Map();
  (state.modern?.glossary || []).forEach((g, i) => map.set(g.original.replace(PUNCT, ""), i));
  return map;
}

function markupToken(raw) {
  // raw is one whitespace-free token of diplomatic text; returns HTML
  let h = esc(raw);
  h = h.replace(/\^([^^]+)\^/g, "<sup>$1</sup>");
  h = h.replace(/ſ/g, '<span class="longs">ſ</span>');
  return h;
}

function markupLine(line, gidx) {
  // pull out tags first so tokenizing doesn't split them
  const parts = [];
  const re = /<del>([\s\S]*?)<\/del>|<ins>([\s\S]*?)<\/ins>|\[illegible\]|\[([^\]]*?)\?\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(line))) {
    parts.push({ kind: "text", s: line.slice(last, m.index) });
    if (m[1] !== undefined) parts.push({ kind: "del", s: m[1] });
    else if (m[2] !== undefined) parts.push({ kind: "ins", s: m[2] });
    else if (m[0] === "[illegible]") parts.push({ kind: "illegible" });
    else parts.push({ kind: "guess", s: m[3] });
    last = re.lastIndex;
  }
  parts.push({ kind: "text", s: line.slice(last) });

  const tokens = (s) => s.split(/(\s+)/).map((tok) => {
    if (!tok || /^\s+$/.test(tok)) return tok;
    const i = gidx.get(tok.replace(PUNCT, ""));
    const inner = markupToken(tok);
    return i === undefined ? inner : `<span class="gloss" data-g="${i}">${inner}</span>`;
  }).join("");

  return parts.map((p) => {
    switch (p.kind) {
      case "del": return `<del>${tokens(p.s)}</del>`;
      case "ins": return `<ins>${tokens(p.s)}</ins>`;
      case "illegible": return '<span class="illegible">[illegible]</span>';
      case "guess": return `<span class="guess" title="Best guess">${tokens(p.s)}</span>`;
      default: return tokens(p.s);
    }
  }).join("");
}

function renderWritten() {
  const lines = state.transcript?.lines || [];
  const gidx = glossIndex();
  const box = $("#written");
  box.innerHTML = lines.length
    ? lines.map((l, i) => `<span class="ln" data-line="${i + 1}">${markupLine(l, gidx) || "&nbsp;"}</span>`).join("")
    : '<p class="placeholder">No text found on this page.</p>';
  box.classList.toggle("ling", $("#ling-toggle").checked);
}

function showGloss(i) {
  const g = state.modern?.glossary?.[i];
  const pop = $("#gloss-pop");
  if (!g) { pop.hidden = true; return; }
  pop.innerHTML = `<b>${markupToken(g.original)}</b> → <strong>${esc(g.modern)}</strong>
    <span class="reason">${esc(g.reason)}</span>${g.note ? `<div>${esc(g.note)}</div>` : ""}`;
  pop.hidden = false;
}

// ---------- rendering: modern ----------

function renderModern() {
  const sentences = state.modern?.sentences || [];
  let w = 0;
  const texts = [];
  $("#modern").innerHTML = sentences.map((s, si) => {
    texts.push(s.modern);
    const words = s.modern.split(/\s+/).filter(Boolean)
      .map((word) => `<span class="w" data-w="${w++}">${esc(word)}</span>`).join(" ");
    return `<span class="sent" data-s="${si}">${words}</span> `;
  }).join("") || '<p class="placeholder">Nothing to modernize.</p>';
  // narration text: the same words, in the same order, as the spans above
  state.narrationText = texts.join(" ");
}

function toggleOriginal(sentEl) {
  const next = sentEl.nextElementSibling;
  if (next && next.classList.contains("orig")) { next.remove(); return; }
  const s = state.modern.sentences[Number(sentEl.dataset.s)];
  const div = document.createElement("span");
  div.className = "orig";
  div.innerHTML = markupLine(s.original, new Map());
  sentEl.after(div);
}

// ---------- rendering: context + classroom ----------

function entityCard(e) {
  const map = e.type === "place" && e.modern_location
    ? `<p><a href="https://www.openstreetmap.org/search?query=${encodeURIComponent(e.modern_location)}" target="_blank" rel="noopener">Map: ${esc(e.modern_location)}</a></p>`
    : "";
  const low = e.confidence === "low";
  return `<article class="card">
    <h3>${esc(e.canonical_name || e.name)}<span class="badge">${esc(e.type)}</span>${low ? '<span class="badge low">unverified</span>' : ""}</h3>
    <div class="meta">Written as <span class="as-written">${markupToken(e.name)}</span></div>
    <p>${esc(e.who_or_what)}</p>
    <p class="meta">${esc(e.role_in_letter)}</p>
    ${map}
  </article>`;
}

function renderContext() {
  const c = state.context;
  const L = c.letter || {};
  $("#context").innerHTML = `
    <article class="card">
      <h3>About this letter</h3>
      <dl class="grid-meta">
        <dt>From</dt><dd>${esc(L.writer)}</dd>
        <dt>To</dt><dd>${esc(L.recipient)}</dd>
        <dt>Date</dt><dd>${esc(L.date)}</dd>
        <dt>Place</dt><dd>${esc(L.place)}</dd>
      </dl>
      <p>${esc(L.setting)}</p>
    </article>
    ${(c.entities || []).map(entityCard).join("")}`;
}

function renderClassroom() {
  const qs = state.context?.questions || [];
  $("#classroom").innerHTML = `
    <h2 class="section-title">Discussion questions</h2>
    <ol class="questions">${qs.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>
    <h2 class="section-title">Glossary</h2>
    <div id="glossary-table"></div>`;
  renderGlossaryTable();
}

function renderGlossaryTable() {
  const box = document.getElementById("glossary-table");
  const g = state.modern?.glossary || [];
  if (!box) return;
  box.innerHTML = g.length ? `<table class="glossary">
    <thead><tr><th>Written</th><th>Modern</th><th>Why</th></tr></thead>
    <tbody>${g.map((x) => `<tr><td>${markupToken(x.original)}</td><td>${esc(x.modern)}</td><td>${esc(x.reason)}${x.note ? ` · ${esc(x.note)}` : ""}</td></tr>`).join("")}</tbody>
  </table>` : '<p class="placeholder">No glossary.</p>';
}

// ---------- narration ----------

function preparePlayer() {
  $("#play-btn").disabled = !state.narrationText;
  $("#player-sub").textContent = state.status.elevenlabs
    ? "ElevenLabs narration of the modern version"
    : "Browser voice for now; ElevenLabs once its key is added";
}

function highlightWord(i) {
  const prev = document.querySelector(".w.on");
  if (prev) prev.classList.remove("on");
  if (i == null || i < 0) return;
  const el = document.querySelector(`.w[data-w="${i}"]`);
  if (el) {
    el.classList.add("on");
    const r = el.getBoundingClientRect();
    if (r.top < 120 || r.bottom > window.innerHeight - 110) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function setPlaying(on) {
  state.speaking = on;
  $("#play-btn").textContent = on ? "❚❚" : "▶";
  $("#play-btn").setAttribute("aria-label", on ? "Pause narration" : "Play narration");
  if (!on) highlightWord(null);
}

function stopNarration() {
  if (state.audio) { state.audio.pause(); state.audio = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  setPlaying(false);
}

async function togglePlay() {
  if (state.speaking) { stopNarration(); return; }
  if (!state.narrationText) return;
  selectTab("modern");
  const run = state.run;
  const btn = $("#play-btn");
  if (!state.narration) {
    btn.disabled = true;
    $("#player-sub").textContent = "Generating narration…";
    try {
      state.narration = await api("/api/narrate", { text: state.narrationText });
    } catch (e) {
      state.narration = { audio: null, words: [] };
      showError(`Narration failed, using the browser voice. ${e.message}`);
    }
    btn.disabled = false;
    if (run !== state.run) return;
    preparePlayer();
  }
  if (state.narration.audio) playAudio(state.narration);
  else speakWithBrowser(state.narrationText);
}

function playAudio({ audio, words }) {
  const a = new Audio(audio);
  state.audio = a;
  let raf = 0;
  const tick = () => {
    const t = a.currentTime;
    let i = -1;
    for (let k = 0; k < words.length; k++) { if (words[k].start <= t) i = k; else break; }
    highlightWord(i);
    if (!a.paused) raf = requestAnimationFrame(tick);
  };
  a.addEventListener("play", () => { setPlaying(true); raf = requestAnimationFrame(tick); });
  a.addEventListener("pause", () => { cancelAnimationFrame(raf); setPlaying(false); });
  a.addEventListener("ended", () => { cancelAnimationFrame(raf); setPlaying(false); state.audio = null; });
  a.play().catch((e) => showError(`Could not play audio. ${e.message}`));
}

function speakWithBrowser(text) {
  if (!("speechSynthesis" in window)) { showError("This browser has no speech support."); return; }
  // char offset of each word, matching the .w spans
  const offsets = [];
  text.replace(/\S+/g, (m, off) => { offsets.push(off); return m; });
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.95;
  u.onboundary = (ev) => {
    if (ev.name && ev.name !== "word") return;
    let i = 0;
    while (i + 1 < offsets.length && offsets[i + 1] <= ev.charIndex) i++;
    highlightWord(i);
  };
  u.onend = () => setPlaying(false);
  u.onerror = () => setPlaying(false);
  setPlaying(true);
  speechSynthesis.speak(u);
}

// ---------- wiring ----------

function init() {
  $("#home-link").addEventListener("click", () => { stopNarration(); showView("home"); });
  ["#camera-input", "#upload-input"].forEach((id) => {
    $(id).addEventListener("change", (e) => { openFile(e.target.files[0]); e.target.value = ""; });
  });
  $$(".tabs button").forEach((b) => b.addEventListener("click", () => selectTab(b.dataset.tab)));
  $("#ling-toggle").addEventListener("change", (e) => {
    $("#written").classList.toggle("ling", e.target.checked);
    if (!e.target.checked) $("#gloss-pop").hidden = true;
  });
  $("#written").addEventListener("click", (e) => {
    const g = e.target.closest(".gloss");
    if (g && $("#ling-toggle").checked) showGloss(Number(g.dataset.g));
  });
  $("#modern").addEventListener("click", (e) => {
    const s = e.target.closest(".sent");
    if (s) toggleOriginal(s);
  });
  $("#page-img").addEventListener("click", (e) => e.target.classList.toggle("zoomed"));
  $("#play-btn").addEventListener("click", togglePlay);

  showView("home");
  loadStatus();
  loadSamples();
}

init();
