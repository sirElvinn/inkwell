// Frontend for the diatom SEM pipeline.
// Processed runs come from results.json. Analyze posts multipart
// { file, backend, sample_type } to /api/analyze and expects one run object back.

const DAMAGE = [
  { key: "all", label: "All" },
  { key: "intact", label: "Intact" },
  { key: "cracked", label: "Cracked" },
  { key: "fragmented", label: "Fragmented" },
  { key: "partial", label: "Partial" },
];

const state = {
  runs: [],
  activeId: null,
  selectedId: null,
  filter: "all",
  sortKey: "frustule_id",
  sortDir: 1,
  file: null,
};

const els = {
  runs: document.getElementById("runs"),
  runCount: document.getElementById("run-count"),
  session: document.getElementById("session-note"),
  summary: document.getElementById("summary"),
  overlay: document.getElementById("overlay"),
  marker: document.getElementById("marker"),
  scale: document.getElementById("scale"),
  scaleBar: document.getElementById("scale-bar"),
  scaleLabel: document.getElementById("scale-label"),
  detail: document.getElementById("detail"),
  rows: document.getElementById("rows"),
  empty: document.getElementById("empty"),
  filters: document.getElementById("filters"),
  status: document.getElementById("status"),
  file: document.getElementById("file"),
  sidecar: document.getElementById("sidecar"),
  drop: document.getElementById("drop"),
  analyze: document.getElementById("analyze"),
  intake: document.getElementById("intake"),
  backend: document.getElementById("backend"),
  sampleType: document.getElementById("sample-type"),
};

function asset(path) {
  if (!path || /^(blob:|data:|https?:)/.test(path)) return path;
  return "../" + path.replace(/\\/g, "/");
}

function fileName(image) {
  return String(image || "Untitled").split(/[/\\]/).pop();
}

function shortName(image) {
  return fileName(image)
    .replace(/\.[^.]+$/, "")
    .replace(/_q\d+$/i, "")
    .replace(/_10kV_ASL$/i, "")
    .replace(/_/g, " ");
}

function damageKey(value) {
  if (!value) return "unknown";
  if (String(value).startsWith("partial")) return "partial";
  return value;
}

function damageLabel(value) {
  const key = damageKey(value);
  return key === "partial" ? "Partial" : key;
}

function speciesName(name) {
  if (!name || name === "unknown") return "Unknown";
  const parts = String(name).split(" ");
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

function num(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toFixed(digits);
}

function countDamage(shells, key) {
  return shells.filter((shell) => damageKey(shell.damage) === key).length;
}

function activeRun() {
  return state.runs.find((run) => run.id === state.activeId) || null;
}

function selectedShell(run) {
  if (!run) return null;
  return run.shells.find((shell) => shell.frustule_id === state.selectedId) || null;
}

function setStatus(text) {
  els.status.textContent = text;
}

async function loadRuns() {
  const response = await fetch("results.json");
  if (!response.ok) throw new Error("Could not load results.json");
  const data = await response.json();
  state.runs = data.runs || [];
  state.activeId = state.runs[0] ? state.runs[0].id : null;
  els.session.textContent = state.runs.length
    ? `${state.runs.length} processed images`
    : "No processed images";
  render();
}

function render() {
  renderRuns();
  renderSummary();
  renderImage();
  renderDetail();
  renderFilters();
  renderTable();
}

function renderRuns() {
  els.runCount.textContent = String(state.runs.length);
  els.runs.innerHTML = "";
  for (const run of state.runs) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "run" + (run.id === state.activeId ? " active" : "");
    const shells = run.shells || [];
    const summary = run.note
      ? run.note
      : `${(run.backend || "preview").toUpperCase()} · ${shells.length} shells`;
    button.innerHTML = `
      <img alt="" src="${asset(run.overlay)}">
      <span>
        <strong>${shortName(run.image)}</strong>
        <span>${summary}</span>
      </span>`;
    button.querySelector("img").addEventListener("error", (event) => {
      event.currentTarget.style.visibility = "hidden";
    });
    button.addEventListener("click", () => {
      state.activeId = run.id;
      state.selectedId = null;
      state.filter = "all";
      render();
    });
    item.appendChild(button);
    els.runs.appendChild(item);
  }
}

function renderSummary() {
  const run = activeRun();
  els.summary.innerHTML = "";
  if (!run) return;
  const shells = run.shells || [];
  const partial = countDamage(shells, "partial");
  const confidence = run.sample_type_confidence == null
    ? ""
    : ` · ${Math.round(run.sample_type_confidence * 100)}%`;
  const block = document.createElement("div");
  block.className = "identity";
  block.innerHTML = `
    <h2>${shortName(run.image)}</h2>
    <p>${speciesName(run.sample_type)}${confidence} · ${run.sample_type_source || "preview"}</p>`;
  els.summary.appendChild(block);
  const stats = [
    ["Shells", shells.length],
    ["Intact", run.n_intact ?? countDamage(shells, "intact")],
    ["Cracked", run.n_cracked ?? countDamage(shells, "cracked")],
    ["Fragmented", run.n_fragmented ?? countDamage(shells, "fragmented")],
    ["Partial", partial],
    ["Median µm", run.median_length_um == null ? "—" : num(run.median_length_um, 2)],
  ];
  for (const [label, value] of stats) {
    const stat = document.createElement("div");
    stat.className = "stat";
    stat.innerHTML = `<b>${value}</b><span>${label}</span>`;
    els.summary.appendChild(stat);
  }
}

function renderImage() {
  const run = activeRun();
  els.marker.innerHTML = "";
  els.scale.hidden = true;
  if (!run) {
    els.overlay.removeAttribute("src");
    els.overlay.alt = "No image selected";
    return;
  }
  const next = asset(run.overlay);
  if (els.overlay.getAttribute("src") !== next) els.overlay.src = next;
  els.overlay.alt = `Segmentation overlay for ${fileName(run.image)}`;
  if (els.overlay.complete && els.overlay.naturalWidth) placeOverlay();
}

function placeOverlay() {
  const run = activeRun();
  const width = els.overlay.naturalWidth;
  const height = els.overlay.naturalHeight;
  if (!run || !width) return;
  els.marker.setAttribute("viewBox", `0 0 ${width} ${height}`);
  drawScale(run, width);
  drawMarker(run, width, height);
}

function drawScale(run, width) {
  if (!run.um_per_px) {
    els.scale.hidden = true;
    return;
  }
  const field = run.um_per_px * width;
  const choices = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  const target = field * 0.22;
  const um = choices.reduce((best, choice) =>
    Math.abs(choice - target) < Math.abs(best - target) ? choice : best);
  const px = um / run.um_per_px;
  els.scaleBar.style.width = `${(px / width) * 100}%`;
  els.scaleLabel.textContent = `${um} µm`;
  els.scale.hidden = false;
}

function drawMarker(run) {
  els.marker.innerHTML = "";
  const shell = selectedShell(run);
  if (!shell || !run.um_per_px) return;
  const cx = shell.x_um / run.um_per_px;
  const cy = shell.y_um / run.um_per_px;
  const rx = shell.length_um / run.um_per_px / 2;
  const ry = (shell.width_um || shell.length_um) / run.um_per_px / 2;
  const angle = shell.orientation_deg || 0;
  const ellipse = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
  ellipse.setAttribute("cx", cx);
  ellipse.setAttribute("cy", cy);
  ellipse.setAttribute("rx", rx);
  ellipse.setAttribute("ry", ry);
  ellipse.setAttribute("fill", "none");
  ellipse.setAttribute("stroke", "#ffffff");
  ellipse.setAttribute("stroke-width", "2.5");
  ellipse.setAttribute("vector-effect", "non-scaling-stroke");
  ellipse.setAttribute("transform", `rotate(${angle} ${cx} ${cy})`);
  const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  dot.setAttribute("cx", cx);
  dot.setAttribute("cy", cy);
  dot.setAttribute("r", Math.max(3, Math.min(rx, ry) * 0.12));
  dot.setAttribute("fill", "#ffffff");
  els.marker.append(ellipse, dot);
}

function renderDetail() {
  const run = activeRun();
  const shell = selectedShell(run);
  if (!run) {
    els.detail.innerHTML = "";
    return;
  }
  if (!shell) {
    els.detail.innerHTML = `
      <h3>Segmentation</h3>
      <p class="lede">Select a shell in the table. A marker will sit on that outline.</p>
      <div class="legend">
        <span><i class="dot intact"></i>Intact</span>
        <span><i class="dot cracked"></i>Cracked</span>
        <span><i class="dot fragmented"></i>Fragmented</span>
        <span><i class="dot partial"></i>Cut by the image edge</span>
      </div>
      <p class="reason">${run.pore_note || "Pores are listed when the magnification can resolve them."}</p>
      <p class="reason">${scaleLine(run)}</p>`;
    return;
  }
  const key = damageKey(shell.damage);
  els.detail.innerHTML = `
    <h3>Shell ${shell.frustule_id}</h3>
    <p class="lede"><i class="dot ${key}"></i>${damageLabel(shell.damage)} · ${speciesName(shell.species)}</p>
    <dl class="facts">
      <div><dt>Length</dt><dd>${num(shell.length_um)} µm</dd></div>
      <div><dt>Width</dt><dd>${num(shell.width_um)} µm</dd></div>
      <div><dt>Area</dt><dd>${num(shell.area_um2, 1)} µm²</dd></div>
      <div class="wide"><dt>View</dt><dd>${shell.view || "—"}</dd></div>
      <div><dt>Orientation</dt><dd>${shell.orientation_deg == null ? "—" : num(shell.orientation_deg, 1) + "°"}</dd></div>
      <div><dt>Circularity</dt><dd>${num(shell.circularity, 2)}</dd></div>
      <div><dt>Solidity</dt><dd>${num(shell.solidity, 2)}</dd></div>
      <div><dt>Aspect</dt><dd>${num(shell.aspect_ratio, 2)}</dd></div>
    </dl>
    <p class="reason">${shell.species_reason || ""}</p>`;
}

function scaleLine(run) {
  if (!run.um_per_px) return "No scale on this preview.";
  const check = run.scale_check ? ` ${run.scale_check}` : "";
  return `${num(run.um_per_px, 4)} µm/px from ${run.scale_source || "metadata"}.${check}`;
}

function renderFilters() {
  const run = activeRun();
  const shells = run ? run.shells || [] : [];
  els.filters.innerHTML = "";
  for (const item of DAMAGE) {
    const count = item.key === "all" ? shells.length : countDamage(shells, item.key);
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(state.filter === item.key));
    button.textContent = `${item.label} ${count}`;
    button.addEventListener("click", () => {
      state.filter = item.key;
      renderFilters();
      renderTable();
    });
    els.filters.appendChild(button);
  }
}

function visibleShells(run) {
  let shells = [...(run.shells || [])];
  if (state.filter !== "all") {
    shells = shells.filter((shell) => damageKey(shell.damage) === state.filter);
  }
  const key = state.sortKey;
  shells.sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * state.sortDir;
    return String(av).localeCompare(String(bv)) * state.sortDir;
  });
  return shells;
}

function renderTable() {
  const run = activeRun();
  els.rows.innerHTML = "";
  document.querySelectorAll("thead button").forEach((button) => {
    button.classList.toggle("active", button.dataset.sort === state.sortKey);
  });
  if (!run || !(run.shells || []).length) {
    els.empty.hidden = false;
    els.empty.textContent = run && run.note
      ? run.note
      : run && run.preview
        ? "This image is only a preview. Measurements appear after analysis."
        : "No shells in this image.";
    return;
  }
  const shells = visibleShells(run);
  els.empty.hidden = shells.length > 0;
  els.empty.textContent = "No shells in this group.";
  for (const shell of shells) {
    const key = damageKey(shell.damage);
    const row = document.createElement("tr");
    row.className = shell.frustule_id === state.selectedId ? "selected" : "";
    row.dataset.id = String(shell.frustule_id);
    row.tabIndex = 0;
    row.innerHTML = `
      <td class="num">${shell.frustule_id}</td>
      <td><span class="pill"><i class="dot ${key}"></i>${damageLabel(shell.damage)}</span></td>
      <td title="${shell.species || ""}">${speciesName(shell.species)}</td>
      <td class="num">${num(shell.length_um)}</td>
      <td class="num">${num(shell.width_um)}</td>
      <td class="num">${num(shell.area_um2, 1)}</td>
      <td>${shell.view || "—"}</td>`;
    const select = () => {
      state.selectedId = shell.frustule_id;
      renderDetail();
      drawMarker(activeRun());
      for (const tr of els.rows.children) {
        tr.classList.toggle("selected", tr.dataset.id === String(shell.frustule_id));
      }
    };
    row.addEventListener("click", select);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
    els.rows.appendChild(row);
  }
}

function chooseFile(file) {
  if (!file) return;
  state.file = file;
  els.analyze.disabled = false;
  setStatus(`${file.name} is ready to analyze.`);
  const preview = {
    id: "preview",
    image: file.name,
    overlay: URL.createObjectURL(file),
    backend: els.backend.value,
    sample_type: "Not analyzed",
    sample_type_source: "preview",
    sample_type_confidence: null,
    um_per_px: null,
    shells: [],
    preview: true,
    pore_note: "Measurements appear after the image is analyzed.",
  };
  state.runs = state.runs.filter((run) => run.id !== "preview");
  state.runs.unshift(preview);
  state.activeId = preview.id;
  state.selectedId = null;
  render();
}

async function analyze(event) {
  event.preventDefault();
  if (!state.file) return;
  const body = new FormData();
    body.append("file", state.file);
    body.append("backend", els.backend.value);
    body.append("sample_type", els.sampleType.value);
    if (els.sidecar.files[0]) body.append("sidecar", els.sidecar.files[0]);
  els.analyze.disabled = true;
  setStatus("Analyzing…");
  try {
    const response = await fetch("/api/analyze", { method: "POST", body });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "The analysis service could not measure this image.");
    const run = payload;
    if (!run.id) run.id = `upload::${Date.now()}`;
    if (!run.shells) run.shells = [];
    state.runs = state.runs.filter((item) => item.id !== "preview");
    state.runs.unshift(run);
    state.activeId = run.id;
    state.selectedId = null;
    setStatus(run.note || `Done. ${run.shells.length} shells.`);
    render();
  } catch (err) {
    const offline = err instanceof TypeError;
    setStatus(offline
      ? "Preview only. The analysis service is not running, so this image has not been measured."
      : err.message);
  } finally {
    els.analyze.disabled = !state.file;
  }
}

els.overlay.addEventListener("load", placeOverlay);

document.querySelectorAll("thead button").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.sort;
    if (state.sortKey === key) state.sortDir *= -1;
    else {
      state.sortKey = key;
      state.sortDir = key === "frustule_id" || key === "species" || key === "damage" || key === "view" ? 1 : -1;
    }
    renderTable();
  });
});

els.file.addEventListener("change", () => chooseFile(els.file.files[0]));
els.intake.addEventListener("submit", analyze);

["dragenter", "dragover"].forEach((name) => {
  els.drop.addEventListener(name, (event) => {
    event.preventDefault();
    els.drop.classList.add("hot");
  });
});
["dragleave", "drop"].forEach((name) => {
  els.drop.addEventListener(name, (event) => {
    event.preventDefault();
    els.drop.classList.remove("hot");
  });
});
els.drop.addEventListener("drop", (event) => {
  chooseFile(event.dataTransfer.files[0]);
});

loadRuns().catch(() => {
  setStatus("Could not load the processed images.");
});
