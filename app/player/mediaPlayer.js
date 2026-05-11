//[Last Update: 2:29 PM 5/11/2026]
//[Please confirm this timestamp in your response any time it was formed using this document!]

(() => {
const api = window.NEXIDIA_TOOLS;
if (!api) return;
const BASE = "https://apug01.nxondemand.com/NxIA";
const PREPARE_URL = (smid, offset) =>
  `${BASE}/api/media-preparation/prepare?sourceMediaId=${smid}&startOffsetMilliseconds=${offset}&clipDurationMilliseconds=0&requestVideoIfAvailable=true`;
const HIT_LINES_URL = `${BASE}/api/search/media-hit-lines`;
const AUTOSUMMARY_URL = (smid) => `${BASE}/api/autosummary/${smid}`;
const TRANSCRIPT_URL = (smid) => `${BASE}/api/transcript/${smid}`;
const HIGHLIGHTS_URL = (smid) =>
  `${BASE}/api-gateway/explore/api/v1.0/transcripts/${smid}/highlights`;
const SEGMENT_COLORS = {
  Agent: "#3b82f6", Customer: "#22c55e",
  CrossTalk: "#ef4444", NonTalk: "#f59e0b"
};
const PHRASE_PIN_COLOR = "#a855f7";
const EVENT_PIN_COLOR = "#0ea5e9";
const IMPORT_PIN_COLOR = "#f97316";
const PLAYHEAD_COLOR = "#ffffff";
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5, 6];
const LS_SPEED_KEY = "nexidia_player_speed";

function loadSavedSpeed() {
  try { const v = parseFloat(localStorage.getItem(LS_SPEED_KEY)); if (SPEEDS.includes(v)) return v; } catch (_) {}
  return null;
}
function saveSpeed(rate) { try { localStorage.setItem(LS_SPEED_KEY, String(rate)); } catch (_) {} }
function clearSavedSpeed() { try { localStorage.removeItem(LS_SPEED_KEY); } catch (_) {} }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, init) {
  const res = await fetch(url, Object.assign({ credentials: "include" }, init || {}));
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) return res.json();
  const t = await res.text();
  try { return JSON.parse(t); } catch { return { raw: t }; }
}

async function preparePoll(smid, offsetMs) {
  for (let i = 0; i < 10; i++) {
    const data = await fetchJson(PREPARE_URL(smid, offsetMs));
    if (data.isMediaPrepared) return data;
    await sleep(1500);
  }
  throw new Error("Media preparation timed out.");
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, "0"), mm = String(m % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const el = (tag, props, ...children) => {
  props = props || {};
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const ch of children) {
    if (ch === null || ch === undefined) continue;
    node.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
  }
  return node;
};

/* ───────────────────── BUILD PLAYER PANE ───────────────────── */
function buildPlayerPane(gridCard) {
  const DEFAULT_H = "85vh";
  const pane = el("div", {
    style: `height:${DEFAULT_H};min-height:200px;max-height:95vh;border-top:1px solid #e5e7eb;background:#111827;display:flex;flex-direction:column;position:relative;flex-shrink:0;font-family:Segoe UI,Arial,sans-serif;`
  });

  /* ── Resize handle ── */
  const handle = el("div", {
    style: "height:6px;cursor:ns-resize;background:#1f2937;border-bottom:1px solid #374151;flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:4px;"
  });
  for (let i = 0; i < 3; i++) {
    handle.appendChild(el("div", { style: "width:20px;height:2px;background:#4b5563;border-radius:1px;" }));
  }
  let dragging = false, startY = 0, startH = 0;
  handle.addEventListener("mousedown", (e) => {
    dragging = true; startY = e.clientY; startH = pane.offsetHeight;
    document.body.style.userSelect = "none";
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const newH = Math.max(200, Math.min(window.innerHeight * 0.95, startH + (startY - e.clientY)));
    pane.style.height = newH + "px";
  });
  document.addEventListener("mouseup", () => {
    if (dragging) { dragging = false; document.body.style.userSelect = ""; }
  });

  /* ── Top-right utility bar (hide + status) ── */
  const utilBar = el("div", {
    style: "display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:4px 12px;background:#0f172a;flex-shrink:0;"
  });
  const statusEl = el("div", { style: "font-size:11px;color:#64748b;flex:1;" }, "");
  const hideBtn = el("button", {
    style: "border:0;background:#1e293b;color:#94a3b8;padding:3px 8px;border-radius:6px;font-size:11px;cursor:pointer;flex-shrink:0;"
  }, "Hide Player");
  utilBar.appendChild(statusEl);
  utilBar.appendChild(hideBtn);

  /* ── Body: sidebar + main content ── */
  const body = el("div", { style: "display:flex;flex:1;min-height:0;overflow:hidden;" });

  /* ── LEFT SIDEBAR ── */
  const sidebarWrap = el("div", {
    style: "width:240px;min-width:240px;background:#0a0f1a;border-right:1px solid #1e293b;display:flex;flex-direction:column;flex-shrink:0;"
  });
  const sidebarHeader = el("div", {
    style: "padding:10px 12px;font-size:13px;font-weight:700;color:#94a3b8;border-bottom:1px solid #1e293b;"
  }, "Playlist");
  const sidebarList = el("div", {
    style: "flex:1;overflow-y:auto;padding:4px 0;"
  });
  sidebarWrap.appendChild(sidebarHeader);
  sidebarWrap.appendChild(sidebarList);

  /* ── MAIN CONTENT (right of sidebar) ── */
  const mainCol = el("div", { style: "display:flex;flex-direction:column;flex:1;min-width:0;overflow:hidden;" });

  /* Title bar */
  const titleBar = el("div", {
    style: "text-align:center;padding:10px 16px 4px;background:#0f172a;flex-shrink:0;"
  });
  const callTitle = el("div", {
    style: "font-size:22px;font-weight:800;color:#93c5fd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
  }, "No call loaded");
  titleBar.appendChild(callTitle);

  /* Nav bar with large Prev / Label / Next */
  const navBar = el("div", {
    style: "display:flex;align-items:center;justify-content:center;gap:20px;padding:8px 16px;background:#0f172a;border-bottom:1px solid #1e293b;flex-shrink:0;"
  });
  const prevNavBtn = el("button", {
    style: "font-size:14px;font-weight:700;padding:8px 18px;border-radius:8px;background:#1e293b;color:#e2e8f0;border:1px solid #374151;cursor:pointer;"
  }, "\u25C0 Prev");
  const navLabel = el("div", {
    style: "font-size:18px;font-weight:700;color:#94a3b8;min-width:100px;text-align:center;"
  }, "");
  const nextNavBtn = el("button", {
    style: "font-size:14px;font-weight:700;padding:8px 18px;border-radius:8px;background:#1e293b;color:#e2e8f0;border:1px solid #374151;cursor:pointer;"
  }, "Next \u25B6");
  navBar.appendChild(prevNavBtn);
  navBar.appendChild(navLabel);
  navBar.appendChild(nextNavBtn);

  /* Timeline */
  const timelineWrap = el("div", {
    style: "position:relative;flex-shrink:0;height:80px;background:#0f172a;cursor:pointer;overflow:hidden;"
  });
  const waveformImg = el("img", {
    style: "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:fill;opacity:0.25;", alt: ""
  });
  const segCanvas = el("canvas", { style: "position:absolute;top:0;left:0;width:100%;height:100%;" });
  const playheadDiv = el("div", {
    style: `position:absolute;top:0;bottom:0;width:2px;background:${PLAYHEAD_COLOR};pointer-events:none;left:0%;`
  });
  timelineWrap.appendChild(waveformImg);
  timelineWrap.appendChild(segCanvas);
  timelineWrap.appendChild(playheadDiv);

  /* ── TRANSPORT CONTROLS ── */
  const controls = el("div", {
    style: "display:flex;align-items:center;gap:6px;padding:6px 10px;background:#0f172a;flex-shrink:0;border-top:1px solid #1e293b;"
  });
  const tBtnStyle = "min-width:36px;height:32px;border-radius:6px;background:#1e293b;color:#94a3b8;border:1px solid #374151;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
  const outerPrevBtn = el("button", { style: tBtnStyle }, "\u23EE");
  const innerPrevBtn = el("button", { style: tBtnStyle }, "\u23EA");
  const stopBtn = el("button", { style: tBtnStyle }, "\u23F9");
  const pauseBtn = el("button", { style: tBtnStyle }, "\u23F8");
  const playBtn = el("button", {
    style: "min-width:36px;height:32px;border-radius:6px;background:#3b82f6;color:#fff;border:0;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;"
  }, "\u25B6");
  const innerNextBtn = el("button", { style: tBtnStyle }, "\u23E9");
  const outerNextBtn = el("button", { style: tBtnStyle }, "\u23ED");
  const timeEl = el("div", {
    style: "font-size:11px;color:#94a3b8;flex-shrink:0;font-family:monospace;min-width:90px;margin-left:6px;"
  }, "00:00 / 00:00");
  const seekBar = el("input", {
    type: "range", min: 0, max: 1000, value: 0,
    style: "flex:1;accent-color:#3b82f6;cursor:pointer;"
  });
  const speedBtn = el("button", {
    style: "border:1px solid #475569;background:transparent;color:#94a3b8;padding:3px 8px;border-radius:6px;font-size:11px;cursor:pointer;font-family:monospace;flex-shrink:0;min-width:38px;text-align:center;"
  }, "1x");
  const rememberSpeedLabel = el("label", {
    style: "display:flex;align-items:center;gap:4px;font-size:10px;color:#64748b;cursor:pointer;flex-shrink:0;"
  });
  const rememberSpeedCb = el("input", { type: "checkbox" });
  rememberSpeedCb.checked = loadSavedSpeed() !== null;
  rememberSpeedLabel.appendChild(rememberSpeedCb);
  rememberSpeedLabel.appendChild(document.createTextNode("Remember"));
  const showAllEventsLabel = el("label", {
    style: "display:none;align-items:center;gap:4px;font-size:10px;color:#64748b;cursor:pointer;flex-shrink:0;margin-left:6px;"
  });
  const showAllEventsCb = el("input", { type: "checkbox" });
  showAllEventsLabel.appendChild(showAllEventsCb);
  showAllEventsLabel.appendChild(document.createTextNode("All events"));
  const pinBar = el("div", {
    style: "display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-left:8px;"
  });

  controls.appendChild(outerPrevBtn);
  controls.appendChild(innerPrevBtn);
  controls.appendChild(stopBtn);
  controls.appendChild(pauseBtn);
  controls.appendChild(playBtn);
  controls.appendChild(innerNextBtn);
  controls.appendChild(outerNextBtn);
  controls.appendChild(timeEl);
  controls.appendChild(seekBar);
  controls.appendChild(speedBtn);
  controls.appendChild(rememberSpeedLabel);
  controls.appendChild(showAllEventsLabel);
  controls.appendChild(pinBar);

  /* ── SEARCH BAR (hidden by default) ── */
  const searchBar = el("div", {
    style: "display:none;align-items:center;gap:8px;padding:6px 10px;background:#0f172a;border-top:1px solid #1e293b;flex-shrink:0;"
  });
  const searchInput = el("input", {
    type: "text", placeholder: "Search transcript...",
    style: "flex:1;padding:6px 8px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;font-size:12px;box-sizing:border-box;"
  });
  const searchCount = el("div", { style: "font-size:11px;color:#64748b;min-width:60px;text-align:center;" }, "");
  const sBtnStyle = "border:0;background:#1e293b;color:#cbd5e1;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:12px;";
  const searchPrevBtn = el("button", { style: sBtnStyle }, "\u25B2");
  const searchNextBtn = el("button", { style: sBtnStyle }, "\u25BC");
  const searchCloseBtn = el("button", { style: sBtnStyle }, "\u2715");
  searchBar.appendChild(searchInput);
  searchBar.appendChild(searchCount);
  searchBar.appendChild(searchPrevBtn);
  searchBar.appendChild(searchNextBtn);
  searchBar.appendChild(searchCloseBtn);

  /* ── TRANSCRIPT ── */
  const transcriptOuter = el("div", {
    style: "position:relative;flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;"
  });
  const transcriptBar = el("div", {
    style: "display:flex;align-items:center;gap:10px;padding:4px 10px;background:#0f172a;border-top:1px solid #1e293b;flex-shrink:0;"
  });
  const autoScrollLabel = el("label", {
    style: "display:flex;align-items:center;gap:5px;font-size:11px;color:#94a3b8;cursor:pointer;"
  });
  const autoScrollCb = el("input", { type: "checkbox" });
  autoScrollCb.checked = true;
  autoScrollLabel.appendChild(autoScrollCb);
  autoScrollLabel.appendChild(document.createTextNode("Auto-scroll with playback"));
  transcriptBar.appendChild(autoScrollLabel);
  const copyTxBtn = el("button", {
    title: "Copy Transcript To Clipboard",
    style: "margin-left:auto;border:0;background:#1e293b;color:#cbd5e1;padding:4px 7px;border-radius:6px;cursor:pointer;font-size:13px;line-height:1;"
  }, "\u29C9");
  transcriptBar.appendChild(copyTxBtn);
  const transcriptPane = el("div", {
    style: "flex:1;min-height:0;overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:6px;"
  });
  transcriptOuter.appendChild(transcriptBar);
  transcriptOuter.appendChild(transcriptPane);

  /* ── Assemble main column ── */
  mainCol.appendChild(titleBar);
  mainCol.appendChild(navBar);
  mainCol.appendChild(timelineWrap);
  mainCol.appendChild(controls);
  mainCol.appendChild(searchBar);
  mainCol.appendChild(transcriptOuter);

  /* ── Assemble body ── */
  body.appendChild(sidebarWrap);
  body.appendChild(mainCol);

  /* ── Assemble pane ── */
  pane.appendChild(handle);
  pane.appendChild(utilBar);
  pane.appendChild(body);
  gridCard.appendChild(pane);

  return {
    pane, callTitle, statusEl, hideBtn,
    prevNavBtn, nextNavBtn, navLabel,
    sidebarList, sidebarWrap,
    timelineWrap, waveformImg, segCanvas, playheadDiv,
    outerPrevBtn, innerPrevBtn, stopBtn, pauseBtn, playBtn, innerNextBtn, outerNextBtn,
    timeEl, seekBar, pinBar,
    speedBtn, rememberSpeedCb,
    showAllEventsLabel, showAllEventsCb,
    searchBar, searchInput, searchCount, searchPrevBtn, searchNextBtn, searchCloseBtn,
    autoScrollCb, copyTxBtn,
    transcriptPane
  };
}

/* ───────────────────── DRAW TIMELINE ───────────────────── */
function drawTimeline(canvas, wrap, durationMs, segments, phraseOffsets, eventOffsets, importOffsets) {
  const W = wrap.offsetWidth || 800, H = wrap.offsetHeight || 80;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  if (!durationMs) return;
  const agentH = Math.round(H * 0.4), custH = Math.round(H * 0.4);
  for (const seg of segments) {
    const x = (seg.startOffset / durationMs) * W;
    const w = Math.max(1, (seg.duration / durationMs) * W);
    const type = seg.spokenText || "NonTalk";
    if (type === "Agent") { ctx.fillStyle = SEGMENT_COLORS.Agent; ctx.fillRect(x, 0, w, agentH); }
    else if (type === "Customer") { ctx.fillStyle = SEGMENT_COLORS.Customer; ctx.fillRect(x, H - custH, w, custH); }
    else if (type === "CrossTalk") { ctx.fillStyle = SEGMENT_COLORS.CrossTalk; ctx.fillRect(x, 0, w, H); }
    else { ctx.fillStyle = "rgba(245,158,11,0.25)"; ctx.fillRect(x, 0, w, H); }
  }
  for (const offsetMs of (eventOffsets || [])) {
    const x = Math.round((offsetMs / durationMs) * W);
    ctx.strokeStyle = EVENT_PIN_COLOR; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const offsetMs of (phraseOffsets || [])) {
    const x = Math.round((offsetMs / durationMs) * W);
    ctx.strokeStyle = PHRASE_PIN_COLOR; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.fillStyle = PHRASE_PIN_COLOR;
    ctx.beginPath(); ctx.arc(x, 6, 4, 0, Math.PI * 2); ctx.fill();
  }
  for (const imp of (importOffsets || [])) {
    const x = Math.round((imp.ms / durationMs) * W);
    ctx.strokeStyle = IMPORT_PIN_COLOR; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.fillStyle = IMPORT_PIN_COLOR;
    ctx.beginPath(); ctx.arc(x, 6, 5, 0, Math.PI * 2); ctx.fill();
  }
}

function updatePlayhead(playheadDiv, currentMs, durationMs) {
  if (!durationMs) return;
  playheadDiv.style.left = (Math.min(1, currentMs / durationMs) * 100) + "%";
}

/* ───────────────────── OPEN PLAYER PANE ───────────────────── */
function openPlayerPane(gridCard, onClose) {
  const els = buildPlayerPane(gridCard);
  let audio = null;
  let audioCtx = null;
  let audioSource = null;
  let lpFilter = null;
  let filterAvailable = false;
  let durationMs = 0;
  let transcriptRows = [];
  let phraseOffsets = [];
  let eventOffsets = [];
  let importedTimestamps = [];
  let segments = [];
  let currentSmid = null;
  let seeking = false;
  let nonTalkSegments = [];
  let autoScrollEnabled = true;
  let scrollSnapTimer = null;
  let playlist = null;
  let playlistIdx = -1;
  let isStandaloneMode = false;
  let timestampsPrimary = false;
  let showAllEvents = false;
  let searchActive = false;
  let searchMatches = [];
  let searchMatchIdx = -1;
  let autoScrollBeforeSearch = true;
  const eventsCache = new Map();

  const saved = loadSavedSpeed();
  let speedIdx = saved !== null ? SPEEDS.indexOf(saved) : 2;
  if (speedIdx < 0) speedIdx = 2;
  els.speedBtn.textContent = SPEEDS[speedIdx] + "x";
  if (SPEEDS[speedIdx] !== 1) {
    els.speedBtn.style.color = "#3b82f6";
    els.speedBtn.style.borderColor = "#3b82f6";
  }

  /* ── Audio context / filter ── */
  function initAudioCtx() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      lpFilter = audioCtx.createBiquadFilter();
      lpFilter.type = "lowpass"; lpFilter.frequency.value = 22050;
      lpFilter.connect(audioCtx.destination);
      filterAvailable = true;
    } catch (e) { console.warn("Web Audio unavailable:", e.message); filterAvailable = false; }
  }
  function connectAudioNode(audioEl) {
    if (!filterAvailable && !audioCtx) initAudioCtx();
    if (!filterAvailable) return;
    try {
      if (audioCtx.state === "suspended") audioCtx.resume();
      if (audioSource) { try { audioSource.disconnect(); } catch (_) {} }
      audioSource = audioCtx.createMediaElementSource(audioEl);
      audioSource.connect(lpFilter);
    } catch (e) { console.warn("Filter connect failed:", e.message); filterAvailable = false; }
  }
  function updateLpCutoff(rate) {
    if (!lpFilter || !filterAvailable) return;
    if (rate <= 2) { lpFilter.frequency.value = 22050; }
    else { const t = (rate - 2) / 4; lpFilter.frequency.value = Math.max(2000, 22050 * Math.pow(0.12, t)); }
  }

  /* ── Speed ── */
  function applySpeed(idx) {
    speedIdx = idx;
    const rate = SPEEDS[speedIdx];
    if (audio) audio.playbackRate = rate;
    updateLpCutoff(rate);
    els.speedBtn.textContent = rate + "x";
    els.speedBtn.style.color = rate === 1 ? "#94a3b8" : "#3b82f6";
    els.speedBtn.style.borderColor = rate === 1 ? "#475569" : "#3b82f6";
    if (els.rememberSpeedCb.checked) saveSpeed(rate);
  }
  els.speedBtn.onclick = () => { applySpeed((speedIdx + 1) % SPEEDS.length); };
  els.rememberSpeedCb.onchange = () => {
    if (els.rememberSpeedCb.checked) saveSpeed(SPEEDS[speedIdx]);
    else clearSavedSpeed();
  };

  /* Speed scroll on speed button only */
  els.speedBtn.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.deltaY < 0) applySpeed(Math.min(speedIdx + 1, SPEEDS.length - 1));
    else applySpeed(Math.max(speedIdx - 1, 0));
  }, { passive: false });

  /* Shift+Arrow speed shortcuts */
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
    if (e.shiftKey && e.key === "ArrowUp") { e.preventDefault(); applySpeed(Math.min(speedIdx + 1, SPEEDS.length - 1)); }
    else if (e.shiftKey && e.key === "ArrowDown") { e.preventDefault(); applySpeed(Math.max(speedIdx - 1, 0)); }
  });

  /* ── Transcript scroll: breaks auto-scroll, snaps back after 5s ── */
  els.transcriptPane.addEventListener("wheel", (e) => {
    /* Let it scroll naturally — no preventDefault — just manage auto-scroll lock */
    if (autoScrollEnabled) {
      autoScrollEnabled = false;
      els.autoScrollCb.checked = false;
    }
    if (scrollSnapTimer) clearTimeout(scrollSnapTimer);
    scrollSnapTimer = setTimeout(() => {
      if (!searchActive) {
        autoScrollEnabled = true;
        els.autoScrollCb.checked = true;
      }
    }, 5000);
  }, { passive: true });

  els.autoScrollCb.onchange = () => {
    autoScrollEnabled = els.autoScrollCb.checked;
    if (scrollSnapTimer) { clearTimeout(scrollSnapTimer); scrollSnapTimer = null; }
  };

  /* ── Copy transcript ── */
  els.copyTxBtn.onclick = () => {
    const lines = [];
    for (const row of transcriptRows) {
      const spRaw = (row.speaker || "").toLowerCase();
      const sp = spRaw === "agent" ? "Agent" : spRaw === "customer" ? "Customer" : "Unknown";
      const range = [row.formattedStartOffset, row.formattedEndOffset].filter(Boolean).join(" - ");
      const text = (row.text || "").trim();
      if (!text) continue;
      lines.push(sp + " (" + range + ")\n" + text);
    }
    navigator.clipboard.writeText(lines.join("\n"));
    els.copyTxBtn.textContent = "\u2713";
    setTimeout(() => { els.copyTxBtn.textContent = "\u29C9"; }, 1500);
  };

  /* ── Show all events toggle ── */
  els.showAllEventsCb.onchange = () => {
    showAllEvents = els.showAllEventsCb.checked;
    refreshPinsAndTimeline();
  };

  /* ── Pins / timeline helpers ── */
  function getVisiblePins() {
    if (isStandaloneMode && timestampsPrimary && !showAllEvents) {
      return { phrases: [], events: [], imports: importedTimestamps };
    }
    return { phrases: phraseOffsets, events: eventOffsets, imports: importedTimestamps };
  }
  function refreshPinsAndTimeline() {
    const vis = getVisiblePins();
    drawTimeline(els.segCanvas, els.timelineWrap, durationMs, segments, vis.phrases, vis.events, vis.imports);
    buildPinBar(vis);
  }
  function stopAudio() {
    if (audioSource) { try { audioSource.disconnect(); } catch (_) {} audioSource = null; }
    if (audio) { audio.pause(); audio.src = ""; audio = null; }
  }
  function setStatus(msg) { els.statusEl.textContent = msg; }
  function setTitle(t) { els.callTitle.textContent = t; }

  /* ── Time / playhead / transcript sync ── */
  function updateTime() {
    if (!audio || !durationMs) return;
    const curMs = audio.currentTime * 1000;
    els.timeEl.textContent = `${fmtTime(curMs)} / ${fmtTime(durationMs)}`;
    if (!seeking) els.seekBar.value = Math.round((audio.currentTime / audio.duration) * 1000);
    updatePlayhead(els.playheadDiv, curMs, durationMs);
    syncTranscript(curMs);
  }
  function syncTranscript(curMs) {
    if (!audio || audio.currentTime <= 0.5) return;
    const curSec = curMs / 1000;
    let activeIdx = -1;
    for (let i = 0; i < transcriptRows.length; i++) {
      if ((transcriptRows[i].totalSecondsFromStart || 0) <= curSec) activeIdx = i;
    }
    els.transcriptPane.querySelectorAll("[data-tx-idx]").forEach((b) => {
      const idx = parseInt(b.getAttribute("data-tx-idx"));
      const isActive = idx === activeIdx;
      b.style.outline = isActive ? "2px solid #3b82f6" : "none";
      if (autoScrollEnabled && !searchActive && isActive && b.getAttribute("data-active") !== "1" && audio && audio.currentTime > 0.5) {
        b.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      b.setAttribute("data-active", isActive ? "1" : "0");
    });
  }

  /* ── Pin bar ── */
  function buildPinBar(vis) {
    els.pinBar.innerHTML = "";
    for (let i = 0; i < vis.imports.length; i++) {
      const imp = vis.imports[i];
      const btn = el("button", {
        style: `border:1px solid ${IMPORT_PIN_COLOR};background:transparent;color:${IMPORT_PIN_COLOR};padding:2px 7px;border-radius:999px;font-size:10px;cursor:pointer;`,
        title: `${imp.label} at ${fmtTime(imp.ms)}`
      }, `${imp.label} ${fmtTime(imp.ms)}`);
      btn.onclick = () => { if (audio) audio.currentTime = imp.ms / 1000; };
      els.pinBar.appendChild(btn);
    }
    for (let i = 0; i < vis.phrases.length; i++) {
      const ms = vis.phrases[i];
      const btn = el("button", {
        style: `border:1px solid ${PHRASE_PIN_COLOR};background:transparent;color:${PHRASE_PIN_COLOR};padding:2px 7px;border-radius:999px;font-size:10px;cursor:pointer;`,
        title: `Phrase hit at ${fmtTime(ms)}`
      }, `P${i + 1} ${fmtTime(ms)}`);
      btn.onclick = () => { if (audio) audio.currentTime = ms / 1000; };
      els.pinBar.appendChild(btn);
    }
    for (let i = 0; i < vis.events.length; i++) {
      const ms = vis.events[i];
      const btn = el("button", {
        style: `border:1px solid ${EVENT_PIN_COLOR};background:transparent;color:${EVENT_PIN_COLOR};padding:2px 7px;border-radius:999px;font-size:10px;cursor:pointer;`,
        title: `Event at ${fmtTime(ms)}`
      }, `E${i + 1} ${fmtTime(ms)}`);
      btn.onclick = () => { if (audio) audio.currentTime = ms / 1000; };
      els.pinBar.appendChild(btn);
    }
  }

  /* ── Non-talk skip ── */
  function skipNonTalk() {
    if (!audio || !nonTalkSegments.length) return;
    const curMs = audio.currentTime * 1000;
    for (const seg of nonTalkSegments) {
      if (curMs >= seg.startOffset - 200 && curMs < seg.startOffset + seg.duration - 200) {
        audio.currentTime = (seg.startOffset + seg.duration) / 1000;
        return;
      }
    }
  }

  /* ── Sidebar ── */
  function buildSidebar() {
    els.sidebarList.innerHTML = "";
    if (!playlist || !playlist.length) return;
    for (let i = 0; i < playlist.length; i++) {
      const item = playlist[i];
      const isCurrent = i === playlistIdx;
      const isAdjacent = (i === playlistIdx - 1 || i === playlistIdx + 1);
      const row = el("div", {
        style: `padding:8px 12px;font-size:12px;cursor:pointer;border-bottom:1px solid rgba(30,41,59,0.4);color:${isCurrent ? "#93c5fd" : "#cbd5e1"};font-weight:${isCurrent ? "700" : "400"};background:${isCurrent ? "#1e293b" : isAdjacent ? "#111827" : "transparent"};`
      }, item.displayLabel || item.key);
      row.onclick = () => { loadPlaylistIndex(i); };
      els.sidebarList.appendChild(row);

      /* Expanded events for current, prev, next */
      if (isCurrent || isAdjacent) {
        const cached = eventsCache.get(item.smid);
        const evts = cached || [];
        /* Also show imported timestamps for current */
        const stamps = isCurrent ? (item.timestamps || []) : [];
        const allEvts = [...stamps.map(ts => ({ label: ts.label, ms: ts.ms })), ...evts];
        for (const evt of allEvts) {
          const evRow = el("div", {
            style: `padding:4px 12px 4px 24px;font-size:11px;color:#64748b;cursor:pointer;`
          }, `${evt.label || "Event"} \u2022 ${fmtTime(evt.ms)}`);
          evRow.onmouseenter = () => { evRow.style.color = "#93c5fd"; };
          evRow.onmouseleave = () => { evRow.style.color = "#64748b"; };
          evRow.onclick = (e) => {
            e.stopPropagation();
            if (i === playlistIdx && audio) {
              audio.currentTime = evt.ms / 1000;
            } else {
              loadPlaylistIndex(i);
              /* After loading, seek will happen via jumpToMs */
            }
          };
          els.sidebarList.appendChild(evRow);
        }
      }
    }
  }

  async function prefetchAdjacentEvents(idx) {
    const toFetch = [];
    if (idx > 0 && playlist[idx - 1] && !eventsCache.has(playlist[idx - 1].smid)) {
      toFetch.push(playlist[idx - 1].smid);
    }
    if (idx < playlist.length - 1 && playlist[idx + 1] && !eventsCache.has(playlist[idx + 1].smid)) {
      toFetch.push(playlist[idx + 1].smid);
    }
    for (const smid of toFetch) {
      try {
        const raw = await fetchJson(AUTOSUMMARY_URL(smid));
        const events = Array.isArray(raw) ? raw : (raw.contactEvents || raw.events || []);
        const parsed = events.map((e, i) => ({
          label: e.eventName || e.eventType || `Event ${i + 1}`,
          ms: e.startOffsetInMs || e.startOffset || 0
        })).filter(e => e.ms > 0);
        eventsCache.set(smid, parsed);
      } catch (_) {
        eventsCache.set(smid, []);
      }
    }
    buildSidebar();
  }

  /* ── Playlist navigation UI ── */
  function updatePlaylistUI() {
    if (!playlist || !playlist.length) {
      els.prevNavBtn.style.display = "none";
      els.nextNavBtn.style.display = "none";
      els.navLabel.textContent = "";
      return;
    }
    els.prevNavBtn.style.display = "";
    els.nextNavBtn.style.display = "";
    els.navLabel.textContent = `${playlistIdx + 1} / ${playlist.length}`;
    els.prevNavBtn.style.opacity = playlistIdx <= 0 ? "0.4" : "1";
    els.nextNavBtn.style.opacity = playlistIdx >= playlist.length - 1 ? "0.4" : "1";
    buildSidebar();
  }

  els.prevNavBtn.onclick = () => {
    if (playlist && playlistIdx > 0) loadPlaylistIndex(playlistIdx - 1);
  };
  els.nextNavBtn.onclick = () => {
    if (playlist && playlistIdx < playlist.length - 1) loadPlaylistIndex(playlistIdx + 1);
  };

  /* ── Transport button handlers ── */
  els.playBtn.onclick = () => {
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
  };
  els.pauseBtn.onclick = () => {
    if (audio && !audio.paused) audio.pause();
  };
  els.stopBtn.onclick = () => {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    els.playBtn.style.background = "#3b82f6";
    updateTime();
  };
  els.innerPrevBtn.onclick = () => {
    if (audio) audio.currentTime = Math.max(0, audio.currentTime - 5);
  };
  els.innerNextBtn.onclick = () => {
    if (audio) audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
  };

  /* Outer buttons: context-aware */
  function getAllSortedEventMs() {
    const all = [];
    for (const ms of eventOffsets) all.push(ms);
    for (const imp of importedTimestamps) all.push(imp.ms);
    all.sort((a, b) => a - b);
    return all;
  }
  els.outerPrevBtn.onclick = () => {
    if (isStandaloneMode) {
      /* Jump to previous event */
      const allEvts = getAllSortedEventMs();
      const curMs = audio ? audio.currentTime * 1000 : 0;
      let target = null;
      for (let i = allEvts.length - 1; i >= 0; i--) {
        if (allEvts[i] < curMs - 500) { target = allEvts[i]; break; }
      }
      if (target !== null && audio) { audio.currentTime = target / 1000; }
      else if (playlist && playlistIdx > 0) { loadPlaylistIndex(playlistIdx - 1); }
    } else {
      if (playlist && playlistIdx > 0) loadPlaylistIndex(playlistIdx - 1);
    }
  };
  els.outerNextBtn.onclick = () => {
    if (isStandaloneMode) {
      const allEvts = getAllSortedEventMs();
      const curMs = audio ? audio.currentTime * 1000 : 0;
      let target = null;
      for (let i = 0; i < allEvts.length; i++) {
        if (allEvts[i] > curMs + 500) { target = allEvts[i]; break; }
      }
      if (target !== null && audio) { audio.currentTime = target / 1000; }
      else if (playlist && playlistIdx < playlist.length - 1) { loadPlaylistIndex(playlistIdx + 1); }
    } else {
      if (playlist && playlistIdx < playlist.length - 1) loadPlaylistIndex(playlistIdx + 1);
    }
  };

  /* ── Seek bar ── */
  els.seekBar.addEventListener("mousedown", () => { seeking = true; });
  els.seekBar.addEventListener("input", () => {
    if (!audio) return;
    audio.currentTime = (parseInt(els.seekBar.value) / 1000) * audio.duration;
  });
  els.seekBar.addEventListener("mouseup", () => { seeking = false; });

  /* ── Timeline click-to-seek ── */
  els.timelineWrap.addEventListener("click", (e) => {
    if (!audio || !durationMs) return;
    const rect = els.timelineWrap.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * (durationMs / 1000);
  });

  /* ── Hide/show toggle ── */
  els.hideBtn.onclick = () => {
    const hidden = pane_is_hidden();
    els.pane.style.height = hidden ? "85vh" : "0px";
    els.pane.style.overflow = hidden ? "visible" : "hidden";
    els.hideBtn.textContent = hidden ? "Hide Player" : "Show Player";
  };
  function pane_is_hidden() { return els.pane.style.height === "0px"; }

  if (typeof onClose === "function") {
    onClose(() => stopAudio());
  }

  /* ── SEARCH (Ctrl+F) ── */
  function openSearch() {
    if (!audio) return;
    searchActive = true;
    autoScrollBeforeSearch = autoScrollEnabled;
    els.searchBar.style.display = "flex";
    els.searchInput.value = "";
    els.searchInput.focus();
    searchMatches = [];
    searchMatchIdx = -1;
    els.searchCount.textContent = "";
  }
  function closeSearch() {
    searchActive = false;
    els.searchBar.style.display = "none";
    els.searchInput.value = "";
    searchMatches = [];
    searchMatchIdx = -1;
    els.searchCount.textContent = "";
    /* Restore original text (remove highlight spans) */
    els.transcriptPane.querySelectorAll("[data-tx-idx]").forEach((bubble) => {
      const msgEl = bubble.querySelector("[data-msg]");
      if (msgEl) msgEl.textContent = msgEl.getAttribute("data-original") || msgEl.textContent;
    });
    /* Restore auto-scroll */
    autoScrollEnabled = autoScrollBeforeSearch;
    els.autoScrollCb.checked = autoScrollEnabled;
  }
  function doSearch() {
    const query = els.searchInput.value.trim().toLowerCase();
    searchMatches = [];
    searchMatchIdx = -1;
    /* Reset all highlights */
    els.transcriptPane.querySelectorAll("[data-msg]").forEach((msgEl) => {
      msgEl.textContent = msgEl.getAttribute("data-original") || msgEl.textContent;
    });
    if (!query) { els.searchCount.textContent = ""; return; }
    els.transcriptPane.querySelectorAll("[data-tx-idx]").forEach((bubble) => {
      const idx = parseInt(bubble.getAttribute("data-tx-idx"));
      const msgEl = bubble.querySelector("[data-msg]");
      if (!msgEl) return;
      const original = msgEl.getAttribute("data-original") || msgEl.textContent;
      const lower = original.toLowerCase();
      if (lower.includes(query)) {
        searchMatches.push({ idx, bubble, msgEl, original });
        /* Highlight matches */
        msgEl.innerHTML = "";
        let pos = 0;
        let searchFrom = 0;
        while (true) {
          const found = lower.indexOf(query, searchFrom);
          if (found === -1) break;
          if (found > pos) msgEl.appendChild(document.createTextNode(original.substring(pos, found)));
          const hlSpan = el("span", { style: "background:#fbbf24;color:#111827;border-radius:2px;padding:0 1px;" }, original.substring(found, found + query.length));
          msgEl.appendChild(hlSpan);
          pos = found + query.length;
          searchFrom = pos;
        }
        if (pos < original.length) msgEl.appendChild(document.createTextNode(original.substring(pos)));
      }
    });
    els.searchCount.textContent = searchMatches.length ? `0 of ${searchMatches.length}` : "No matches";
    if (searchMatches.length) {
      autoScrollEnabled = false;
      els.autoScrollCb.checked = false;
      navigateSearch(0);
    }
  }
  function navigateSearch(idx) {
    if (!searchMatches.length) return;
    searchMatchIdx = ((idx % searchMatches.length) + searchMatches.length) % searchMatches.length;
    els.searchCount.textContent = `${searchMatchIdx + 1} of ${searchMatches.length}`;
    searchMatches[searchMatchIdx].bubble.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  els.searchInput.addEventListener("input", doSearch);
  els.searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); navigateSearch(searchMatchIdx + 1); }
    if (e.key === "Escape") { closeSearch(); }
  });
  els.searchPrevBtn.onclick = () => { navigateSearch(searchMatchIdx - 1); };
  els.searchNextBtn.onclick = () => { navigateSearch(searchMatchIdx + 1); };
  els.searchCloseBtn.onclick = () => { closeSearch(); };

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "f" && audio) {
      e.preventDefault();
      openSearch();
    }
  });

  /* ── Playlist management ── */
  function setPlaylist(items) {
    playlist = items;
    playlistIdx = -1;
    const plState = api.getShared("playlistState");
    isStandaloneMode = plState && plState.mode === "standalone";
    timestampsPrimary = plState && plState.timestampsPrimary === true;
    if (isStandaloneMode && timestampsPrimary) {
      els.showAllEventsLabel.style.display = "flex";
    } else {
      els.showAllEventsLabel.style.display = "none";
    }
    updatePlaylistUI();
  }

  function loadPlaylistIndex(idx) {
    if (!playlist || idx < 0 || idx >= playlist.length) return;
    playlistIdx = idx;
    updatePlaylistUI();
    const item = playlist[idx];
    const jumpMs = item.timestamps && item.timestamps.length ? item.timestamps[0].ms : undefined;
    loadCall(item.smid, item.displayLabel, jumpMs, null, item.timestamps || []);
  }

  /* ── LOAD CALL ── */
  async function loadCall(smid, label, jumpToMs, searchQuery, impTimestamps) {
    if (currentSmid === smid && jumpToMs !== undefined) {
      if (audio) audio.currentTime = jumpToMs / 1000;
      return;
    }
    currentSmid = smid;
    stopAudio();
    closeSearch();
    transcriptRows = []; phraseOffsets = []; eventOffsets = [];
    importedTimestamps = impTimestamps || [];
    segments = []; nonTalkSegments = [];
    els.transcriptPane.innerHTML = "";
    els.pinBar.innerHTML = "";
    els.playBtn.style.background = "#3b82f6";
    els.seekBar.value = 0;
    els.timeEl.textContent = "00:00 / 00:00";
    els.waveformImg.src = "";
    els.playheadDiv.style.left = "0%";
    setTitle(label || `SMID ${smid}`);
    setStatus("Preparing...");
    els.pane.style.height = "85vh";
    els.pane.style.overflow = "visible";
    els.hideBtn.textContent = "Hide Player";

    let prepared;
    try {
      prepared = await preparePoll(smid, jumpToMs || 0);
    } catch (e) {
      setStatus("Preparation failed: " + e.message);
      return;
    }
    durationMs = prepared.durationMs || 0;
    if (prepared.waveformUri) els.waveformImg.src = prepared.waveformUri;
    audio = new Audio(prepared.mediaUri);
    connectAudioNode(audio);
    audio.volume = 1;
    audio.playbackRate = SPEEDS[speedIdx];
    updateLpCutoff(SPEEDS[speedIdx]);
    audio.ontimeupdate = () => { if (audio.currentTime > 0) { updateTime(); skipNonTalk(); } };
    audio.onplay = () => { els.playBtn.style.background = "#22c55e"; };
    audio.onpause = () => { els.playBtn.style.background = "#3b82f6"; };
    audio.onended = () => {
      els.playBtn.style.background = "#3b82f6";
      if (playlist && playlistIdx < playlist.length - 1) {
        setTimeout(() => loadPlaylistIndex(playlistIdx + 1), 400);
      }
    };
    audio.onloadedmetadata = () => {
      if (jumpToMs) audio.currentTime = jumpToMs / 1000;
      updateTime();
      audio.play().catch(() => {});
    };

    setStatus("Loading data...");
    const [hitLinesResult, autoSummaryResult, transcriptResult, highlightsResult] = await Promise.allSettled([
      fetchJson(HIT_LINES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceMediaId: smid, context: {} })
      }),
      fetchJson(AUTOSUMMARY_URL(smid)),
      fetchJson(TRANSCRIPT_URL(smid)),
      searchQuery ? fetchJson(HIGHLIGHTS_URL(smid), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          languageFilter: searchQuery.languageFilter || { languages: [] },
          namedSetId: searchQuery.namedSetId || null,
          query: searchQuery.query,
          highlightFragmentSize: 0
        })
      }) : Promise.resolve(null)
    ]);

    if (hitLinesResult.status === "fulfilled" && hitLinesResult.value) {
      const raw = hitLinesResult.value;
      segments = raw.hitLines || [];
      nonTalkSegments = segments.filter((s) => s.spokenText === "NonTalk" || s.spokenText === "NonSpeech");
    }
    if (autoSummaryResult.status === "fulfilled" && autoSummaryResult.value) {
      const raw = autoSummaryResult.value;
      const events = Array.isArray(raw) ? raw : (raw.contactEvents || raw.events || []);
      eventOffsets = events.map((e) => e.startOffsetInMs || e.startOffset || 0).filter(Boolean);
      /* Cache events for sidebar */
      const parsedEvts = events.map((e, i) => ({
        label: e.eventName || e.eventType || `Event ${i + 1}`,
        ms: e.startOffsetInMs || e.startOffset || 0
      })).filter(ev => ev.ms > 0);
      eventsCache.set(smid, parsedEvts);
    }
    if (transcriptResult.status === "fulfilled" && transcriptResult.value) {
      const raw = transcriptResult.value;
      transcriptRows = raw.transcriptRows || raw.TranscriptRows || raw.rows || [];
      els.transcriptPane.innerHTML = "";
      for (let i = 0; i < transcriptRows.length; i++) {
        const row = transcriptRows[i];
        const isAgent = (row.speaker || row.Speaker || "").toLowerCase() === "agent";
        const tsLabel = [row.formattedStartOffset, row.formattedEndOffset].filter(Boolean).join(" - ");
        const bubble = el("div", {
          style: `max-width:80%;display:flex;flex-direction:column;align-self:${isAgent ? "flex-end" : "flex-start"};`
        });
        const msgEl = el("div", {
          style: `background:${isAgent ? "#1e3a5f" : "#1e293b"};color:${isAgent ? "#bfdbfe" : "#e2e8f0"};border-radius:${isAgent ? "10px 10px 2px 10px" : "10px 10px 10px 2px"};padding:5px 10px;font-size:11px;line-height:1.4;cursor:pointer;`
        });
        const textContent = (row.text || row.Text || "").trim();
        msgEl.textContent = textContent;
        msgEl.setAttribute("data-msg", "1");
        msgEl.setAttribute("data-original", textContent);
        const tsEl = el("div", {
          style: `font-size:10px;color:#475569;margin-top:2px;text-align:${isAgent ? "right" : "left"};padding:0 4px;`
        }, tsLabel);
        bubble.appendChild(msgEl);
        bubble.appendChild(tsEl);
        bubble.setAttribute("data-tx-idx", i);
        bubble.onclick = () => { if (audio) audio.currentTime = row.totalSecondsFromStart || 0; };
        const wrapper = el("div", {
          style: `display:flex;justify-content:${isAgent ? "flex-end" : "flex-start"};`
        });
        wrapper.appendChild(bubble);
        els.transcriptPane.appendChild(wrapper);
      }
    }
    if (highlightsResult.status === "fulfilled" && highlightsResult.value && transcriptRows.length) {
      const raw = highlightsResult.value;
      const hlText = (raw.transcriptHighlights || []).join("\n");
      const plainRows = [];
      for (const row of transcriptRows) {
        const t = (row.text || "").trim().toLowerCase().replace(/<unk>/g, "").replace(/\s+/g, " ").trim();
        if (t) plainRows.push({ text: t, ts: row.totalSecondsFromStart || 0 });
      }
      const markerRegex = /\{\{\{(.+?)\}\}\}/g;
      let match;
      const phraseTexts = [];
      while ((match = markerRegex.exec(hlText)) !== null) {
        phraseTexts.push(match[1].toLowerCase().trim());
      }
      const seen = new Set();
      phraseOffsets = [];
      for (const phrase of phraseTexts) {
        for (const pr of plainRows) {
          if (pr.text.includes(phrase) && !seen.has(pr.ts)) {
            seen.add(pr.ts);
            phraseOffsets.push(pr.ts * 1000);
            break;
          }
        }
      }
    }
    refreshPinsAndTimeline();
    const vis = getVisiblePins();
    if (vis.imports.length) {
      audio.currentTime = vis.imports[0].ms / 1000;
    } else if (phraseOffsets.length) {
      audio.currentTime = phraseOffsets[0] / 1000;
    }
    setStatus(durationMs
      ? `${fmtTime(durationMs)} \u00B7 ${segments.length} segments \u00B7 ${phraseOffsets.length} phrase hits`
      : "Loaded");

    buildSidebar();
    prefetchAdjacentEvents(playlistIdx);

    window.addEventListener("resize", () => {
      refreshPinsAndTimeline();
    }, { passive: true });
  }

  return { loadCall, stopAudio, setPlaylist, loadPlaylistIndex, els };
}

api.registerTool({
  id: "mediaPlayer",
  label: "Media Player",
  hidden: true,
  open: () => {},
  _openPlayerPane: openPlayerPane
});
})();
