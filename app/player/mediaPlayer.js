(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;

  const BASE = "https://apug01.nxondemand.com/NxIA";
  const PREPARE_URL = (smid, offset) => `${BASE}/api/media-preparation/prepare?sourceMediaId=${smid}&startOffsetMilliseconds=${offset}&clipDurationMilliseconds=0&requestVideoIfAvailable=true`;
  const HIT_LINES_URL = `${BASE}/api/search/media-hit-lines`;
  const AUTOSUMMARY_URL = (smid) => `${BASE}/api/autosummary/${smid}`;
  const TRANSCRIPT_URL = (smid) => `${BASE}/api/transcript/${smid}`;
  const HIGHLIGHTS_URL = (smid) => `${BASE}/api-gateway/explore/api/v1.0/transcripts/${smid}/highlights`;

  const SEGMENT_COLORS = { Agent: "#3b82f6", Customer: "#22c55e", CrossTalk: "#ef4444", NonTalk: "#f59e0b" };
  const PHRASE_PIN_COLOR = "#a855f7";
  const EVENT_PIN_COLOR = "#0ea5e9";
  const IMPORTED_PIN_COLOR = "#f97316";
  const PLAYHEAD_COLOR = "#ffffff";
  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
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
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const ss = String(s % 60).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
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

  function buildPlayerPane(gridCard) {
    const DEFAULT_H = 280;
    const pane = el("div", {
      style: `height:${DEFAULT_H}px;min-height:120px;max-height:80vh;border-top:1px solid #e5e7eb;background:#111827;display:flex;flex-direction:column;position:relative;flex-shrink:0;font-family:Segoe UI,Arial,sans-serif;`
    });

    const handle = el("div", { style: "height:6px;cursor:ns-resize;background:#1f2937;border-bottom:1px solid #374151;flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:4px;" });
    for (let i = 0; i < 3; i++) handle.appendChild(el("div", { style: "width:20px;height:2px;background:#4b5563;border-radius:1px;" }));
    let dragging = false, startY = 0, startH = 0;
    handle.addEventListener("mousedown", (e) => { dragging = true; startY = e.clientY; startH = pane.offsetHeight; document.body.style.userSelect = "none"; });
    document.addEventListener("mousemove", (e) => { if (!dragging) return; pane.style.height = Math.max(120, Math.min(window.innerHeight * 0.8, startH + (startY - e.clientY))) + "px"; });
    document.addEventListener("mouseup", () => { if (dragging) { dragging = false; document.body.style.userSelect = ""; } });

    const header = el("div", { style: "display:flex;align-items:center;gap:8px;padding:6px 12px;background:#0f172a;flex-shrink:0;" });
    const titleEl = el("div", { style: "font-size:12px;font-weight:700;color:#93c5fd;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" }, "No call loaded");
    const statusEl = el("div", { style: "font-size:11px;color:#64748b;flex-shrink:0;" }, "");
    const hideBtn = el("button", { style: "border:0;background:#1e293b;color:#94a3b8;padding:3px 8px;border-radius:6px;font-size:11px;cursor:pointer;flex-shrink:0;" }, "Hide Player");
    header.appendChild(titleEl); header.appendChild(statusEl); header.appendChild(hideBtn);

    const body = el("div", { style: "display:flex;flex:1;min-height:0;overflow:hidden;" });
    const leftCol = el("div", { style: "display:flex;flex-direction:column;flex:1;min-width:0;overflow:hidden;" });

    const timelineWrap = el("div", { style: "position:relative;flex-shrink:0;height:80px;background:#0f172a;cursor:pointer;overflow:hidden;" });
    const waveformImg = el("img", { style: "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:fill;opacity:0.25;", alt: "" });
    const segCanvas = el("canvas", { style: "position:absolute;top:0;left:0;width:100%;height:100%;" });
    const playheadDiv = el("div", { style: `position:absolute;top:0;bottom:0;width:2px;background:${PLAYHEAD_COLOR};pointer-events:none;left:0%;` });
    timelineWrap.appendChild(waveformImg); timelineWrap.appendChild(segCanvas); timelineWrap.appendChild(playheadDiv);

    const controls = el("div", { style: "display:flex;align-items:center;gap:6px;padding:6px 10px;background:#0f172a;flex-shrink:0;border-top:1px solid #1e293b;" });
    const hopStyle = "width:26px;height:26px;border-radius:50%;border:1px solid #475569;background:transparent;font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:monospace;color:#94a3b8;cursor:pointer;";
    const prevCallBtn = el("button", { style: hopStyle, title: "Previous Call" }, "\u00AB");
    const prevEventBtn = el("button", { style: hopStyle, title: "Previous Event" }, "\u2039");
    const playBtn = el("button", { style: "width:32px;height:32px;border-radius:50%;border:0;background:#3b82f6;color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;" }, "\u25B6");
    const nextEventBtn = el("button", { style: hopStyle, title: "Next Event" }, "\u203A");
    const nextCallBtn = el("button", { style: hopStyle, title: "Next Call" }, "\u00BB");
    const timeEl = el("div", { style: "font-size:11px;color:#94a3b8;flex-shrink:0;font-family:monospace;min-width:90px;" }, "00:00 / 00:00");
    const seekBar = el("input", { type: "range", min: 0, max: 1000, value: 0, style: "flex:1;accent-color:#3b82f6;cursor:pointer;" });
    const volBtn = el("button", { style: "border:0;background:transparent;color:#94a3b8;font-size:14px;cursor:pointer;flex-shrink:0;padding:2px 4px;" }, "\uD83D\uDD0A");
    const volSlider = el("input", { type: "range", min: 0, max: 1, step: 0.05, value: 1, style: "width:60px;accent-color:#3b82f6;cursor:pointer;flex-shrink:0;" });
    const speedBtn = el("button", { style: "border:1px solid #475569;background:transparent;color:#94a3b8;padding:3px 8px;border-radius:6px;font-size:11px;cursor:pointer;font-family:monospace;flex-shrink:0;min-width:38px;text-align:center;" }, "1x");
    const rememberSpeedLabel = el("label", { style: "display:flex;align-items:center;gap:4px;font-size:10px;color:#64748b;cursor:pointer;flex-shrink:0;" });
    const rememberSpeedCb = el("input", { type: "checkbox" });
    rememberSpeedCb.checked = loadSavedSpeed() !== null;
    rememberSpeedLabel.appendChild(rememberSpeedCb);
    rememberSpeedLabel.appendChild(document.createTextNode("Remember"));
    const pinBar = el("div", { style: "display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-left:8px;" });

    controls.appendChild(prevCallBtn);
    controls.appendChild(prevEventBtn);
    controls.appendChild(playBtn);
    controls.appendChild(nextEventBtn);
    controls.appendChild(nextCallBtn);
    controls.appendChild(timeEl);
    controls.appendChild(seekBar);
    controls.appendChild(volBtn);
    controls.appendChild(volSlider);
    controls.appendChild(speedBtn);
    controls.appendChild(rememberSpeedLabel);
    controls.appendChild(pinBar);

    const transcriptOuter = el("div", { style: "position:relative;flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;" });
    const transcriptBar = el("div", { style: "display:flex;align-items:center;gap:10px;padding:4px 10px;background:#0f172a;border-top:1px solid #1e293b;flex-shrink:0;" });
    const autoScrollLabel = el("label", { style: "display:flex;align-items:center;gap:5px;font-size:11px;color:#94a3b8;cursor:pointer;" });
    const autoScrollCb = el("input", { type: "checkbox" });
    autoScrollCb.checked = true;
    autoScrollLabel.appendChild(autoScrollCb);
    autoScrollLabel.appendChild(document.createTextNode("Auto-scroll with playback"));
    transcriptBar.appendChild(autoScrollLabel);
    const copyTxBtn = el("button", { title: "Copy Transcript To Clipboard", style: "margin-left:auto;border:0;background:#1e293b;color:#cbd5e1;padding:4px 7px;border-radius:6px;cursor:pointer;font-size:13px;line-height:1;" }, "\u29C9");
    transcriptBar.appendChild(copyTxBtn);

    const tabBar = el("div", { style: "display:flex;gap:0;background:#0f172a;border-top:1px solid #1e293b;flex-shrink:0;" });
    const tabTranscript = el("button", { style: "flex:1;padding:5px 8px;border:0;border-bottom:2px solid #3b82f6;background:transparent;color:#93c5fd;font-size:11px;font-weight:600;cursor:pointer;" }, "Transcript");
    const tabEvents = el("button", { style: "flex:1;padding:5px 8px;border:0;border-bottom:2px solid transparent;background:transparent;color:#64748b;font-size:11px;font-weight:600;cursor:pointer;" }, "Events");
    tabBar.appendChild(tabTranscript); tabBar.appendChild(tabEvents);

    const transcriptPane = el("div", { style: "flex:1;min-height:0;overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:6px;" });
    const eventsPane = el("div", { style: "flex:1;min-height:0;overflow-y:auto;padding:8px 10px;display:none;" });
    const eventsFilterRow = el("div", { style: "display:flex;align-items:center;gap:6px;padding:4px 0 6px;border-bottom:1px solid #1e293b;margin-bottom:6px;" });
    const eventsFilterLabel = el("label", { style: "display:flex;align-items:center;gap:4px;font-size:10px;color:#94a3b8;cursor:pointer;" });
    const eventsFilterCb = el("input", { type: "checkbox" });
    eventsFilterLabel.appendChild(eventsFilterCb);
    eventsFilterLabel.appendChild(document.createTextNode("Imported only"));
    eventsFilterRow.appendChild(eventsFilterLabel);
    const eventsListEl = el("div", {});
    eventsPane.appendChild(eventsFilterRow);
    eventsPane.appendChild(eventsListEl);

    tabTranscript.onclick = () => {
      transcriptPane.style.display = "flex"; eventsPane.style.display = "none";
      tabTranscript.style.borderBottomColor = "#3b82f6"; tabTranscript.style.color = "#93c5fd";
      tabEvents.style.borderBottomColor = "transparent"; tabEvents.style.color = "#64748b";
    };
    tabEvents.onclick = () => {
      transcriptPane.style.display = "none"; eventsPane.style.display = "block";
      tabEvents.style.borderBottomColor = "#3b82f6"; tabEvents.style.color = "#93c5fd";
      tabTranscript.style.borderBottomColor = "transparent"; tabTranscript.style.color = "#64748b";
    };

    transcriptOuter.appendChild(transcriptBar);
    transcriptOuter.appendChild(tabBar);
    transcriptOuter.appendChild(transcriptPane);
    transcriptOuter.appendChild(eventsPane);

    const playlistPane = el("div", { style: "width:0;min-width:0;overflow-y:auto;overflow-x:hidden;background:#0f172a;border-left:1px solid #1e293b;transition:width .2s;flex-shrink:0;" });

    leftCol.appendChild(timelineWrap);
    leftCol.appendChild(controls);
    leftCol.appendChild(transcriptOuter);
    body.appendChild(leftCol);
    body.appendChild(playlistPane);
    pane.appendChild(handle);
    pane.appendChild(header);
    pane.appendChild(body);
    gridCard.appendChild(pane);

    return {
      pane, titleEl, statusEl, hideBtn,
      timelineWrap, waveformImg, segCanvas, playheadDiv,
      playBtn, timeEl, seekBar, volBtn, volSlider, pinBar,
      speedBtn, rememberSpeedCb, autoScrollCb, copyTxBtn,
      transcriptPane, eventsPane, eventsListEl, eventsFilterCb,
      prevCallBtn, prevEventBtn, nextEventBtn, nextCallBtn,
      playlistPane
    };
  }

  function drawTimeline(canvas, wrap, durationMs, segments, phraseOffsets, eventOffsets, importedOffsets) {
    const W = wrap.offsetWidth || 800;
    const H = wrap.offsetHeight || 80;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    if (!durationMs) return;
    const agentH = Math.round(H * 0.4);
    const custH = Math.round(H * 0.4);
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
      ctx.fillStyle = PHRASE_PIN_COLOR; ctx.beginPath(); ctx.arc(x, 6, 4, 0, Math.PI * 2); ctx.fill();
    }
    for (const imp of (importedOffsets || [])) {
      const x = Math.round((imp.ms / durationMs) * W);
      ctx.strokeStyle = IMPORTED_PIN_COLOR; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.fillStyle = IMPORTED_PIN_COLOR; ctx.beginPath(); ctx.arc(x, H - 6, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  function updatePlayhead(playheadDiv, currentMs, durationMs) {
    if (!durationMs) return;
    playheadDiv.style.left = (Math.min(1, currentMs / durationMs) * 100) + "%";
  }

  function openPlayerPane(gridCard, onClose) {
    const els = buildPlayerPane(gridCard);
    let audio = null;
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
    let callMeta = { displayFieldName: "", displayFieldValue: "", smid: null };

    let playlistItems = [];
    let playlistIndex = -1;

    const saved = loadSavedSpeed();
    let speedIdx = saved !== null ? SPEEDS.indexOf(saved) : 2;
    if (speedIdx < 0) speedIdx = 2;
    els.speedBtn.textContent = SPEEDS[speedIdx] + "x";
    if (SPEEDS[speedIdx] !== 1) { els.speedBtn.style.color = "#3b82f6"; els.speedBtn.style.borderColor = "#3b82f6"; }

    function applySpeed(idx) {
      speedIdx = idx;
      const rate = SPEEDS[speedIdx];
      if (audio) audio.playbackRate = rate;
      els.speedBtn.textContent = rate + "x";
      els.speedBtn.style.color = rate === 1 ? "#94a3b8" : "#3b82f6";
      els.speedBtn.style.borderColor = rate === 1 ? "#475569" : "#3b82f6";
      if (els.rememberSpeedCb.checked) saveSpeed(rate);
    }
    els.speedBtn.onclick = () => applySpeed((speedIdx + 1) % SPEEDS.length);
    els.rememberSpeedCb.onchange = () => { if (els.rememberSpeedCb.checked) saveSpeed(SPEEDS[speedIdx]); else clearSavedSpeed(); };

    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
      if (e.key === "ArrowRight") { e.preventDefault(); applySpeed(Math.min(speedIdx + 1, SPEEDS.length - 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); applySpeed(Math.max(speedIdx - 1, 0)); }
    });

    els.autoScrollCb.onchange = () => { autoScrollEnabled = els.autoScrollCb.checked; };

    function getAllHoppableEvents() {
      const all = [];
      for (const ms of eventOffsets) { if (ms > 0) all.push({ ms, label: "Event", type: "native" }); }
      for (const imp of importedTimestamps) { if (imp.ms > 0) all.push({ ms: imp.ms, label: imp.label, type: "imported" }); }
      all.sort((a, b) => a.ms - b.ms);
      return all;
    }

    function updateHopStates() {
      const grayOut = "opacity:0.3;cursor:default;";
      const active = "opacity:1;cursor:pointer;";
      const hasPrev = playlistIndex > 0;
      const hasNext = playlistIndex < playlistItems.length - 1;
      els.prevCallBtn.style.cssText = els.prevCallBtn.style.cssText.replace(/opacity:[^;]+;cursor:[^;]+;/, "") + (hasPrev ? active : grayOut);
      els.nextCallBtn.style.cssText = els.nextCallBtn.style.cssText.replace(/opacity:[^;]+;cursor:[^;]+;/, "") + (hasNext ? active : grayOut);
      const evts = getAllHoppableEvents();
      const curMs = audio ? audio.currentTime * 1000 : 0;
      const hasPrevEvt = evts.some(e => e.ms < curMs - 500);
      const hasNextEvt = evts.some(e => e.ms > curMs + 500);
      els.prevEventBtn.style.cssText = els.prevEventBtn.style.cssText.replace(/opacity:[^;]+;cursor:[^;]+;/, "") + (hasPrevEvt ? active : grayOut);
      els.nextEventBtn.style.cssText = els.nextEventBtn.style.cssText.replace(/opacity:[^;]+;cursor:[^;]+;/, "") + (hasNextEvt ? active : grayOut);
    }

    els.prevCallBtn.onclick = () => { if (playlistIndex > 0) loadPlaylistIndex(playlistIndex - 1); };
    els.nextCallBtn.onclick = () => { if (playlistIndex < playlistItems.length - 1) loadPlaylistIndex(playlistIndex + 1); };
    els.prevEventBtn.onclick = () => {
      if (!audio) return;
      const evts = getAllHoppableEvents();
      const curMs = audio.currentTime * 1000;
      for (let i = evts.length - 1; i >= 0; i--) { if (evts[i].ms < curMs - 500) { audio.currentTime = evts[i].ms / 1000; return; } }
    };
    els.nextEventBtn.onclick = () => {
      if (!audio) return;
      const evts = getAllHoppableEvents();
      const curMs = audio.currentTime * 1000;
      for (const e of evts) { if (e.ms > curMs + 500) { audio.currentTime = e.ms / 1000; return; } }
    };

    els.copyTxBtn.onclick = () => {
      const lines = [];
      if (callMeta.displayFieldName && callMeta.displayFieldValue) {
        lines.push(callMeta.displayFieldName + ": " + callMeta.displayFieldValue);
      }
      if (callMeta.smid) lines.push("SMID: " + callMeta.smid);
      if (lines.length) lines.push("");
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

    function buildEventsPane(showImportedOnly) {
      els.eventsListEl.innerHTML = "";
      const evts = [];
      if (!showImportedOnly) {
        for (const ms of eventOffsets) evts.push({ ms, label: "Event", type: "native" });
      }
      for (const imp of importedTimestamps) evts.push({ ms: imp.ms, label: imp.label, type: "imported" });
      evts.sort((a, b) => a.ms - b.ms);
      if (!evts.length) {
        els.eventsListEl.appendChild(el("div", { style: "font-size:11px;color:#64748b;padding:6px 0;" }, "No events."));
        return;
      }
      for (const ev of evts) {
        const color = ev.type === "imported" ? IMPORTED_PIN_COLOR : EVENT_PIN_COLOR;
        const row = el("div", { style: "display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;font-size:11px;color:#e2e8f0;" });
        row.appendChild(el("span", { style: `color:${color};font-weight:700;min-width:52px;font-family:monospace;` }, fmtTime(ev.ms)));
        row.appendChild(el("span", {}, ev.label));
        if (ev.type === "imported") row.appendChild(el("span", { style: `color:${IMPORTED_PIN_COLOR};font-size:9px;margin-left:auto;` }, "imported"));
        row.onmouseenter = () => { row.style.background = "#1e293b"; };
        row.onmouseleave = () => { row.style.background = ""; };
        row.onclick = () => { if (audio) audio.currentTime = ev.ms / 1000; };
        els.eventsListEl.appendChild(row);
      }
    }
    els.eventsFilterCb.onchange = () => buildEventsPane(els.eventsFilterCb.checked);

    function renderPlaylistPane() {
      els.playlistPane.innerHTML = "";
      if (!playlistItems.length) { els.playlistPane.style.width = "0"; return; }
      els.playlistPane.style.width = "180px";
      const hdr = el("div", { style: "padding:6px 8px;font-size:11px;font-weight:700;color:#93c5fd;border-bottom:1px solid #1e293b;" }, "Playlist (" + playlistItems.length + ")");
      els.playlistPane.appendChild(hdr);
      for (let i = 0; i < playlistItems.length; i++) {
        const it = playlistItems[i];
        const isActive = i === playlistIndex;
        const row = el("div", {
          style: `padding:6px 8px;font-size:11px;cursor:pointer;border-bottom:1px solid #1e293b;color:${isActive ? "#fff" : "#94a3b8"};background:${isActive ? "#1e3a5f" : "transparent"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`
        }, it.displayLabel || it.key);
        row.onmouseenter = () => { if (!isActive) row.style.background = "#1e293b"; };
        row.onmouseleave = () => { if (!isActive) row.style.background = ""; };
        row.onclick = () => loadPlaylistIndex(i);
        els.playlistPane.appendChild(row);
      }
    }

    function loadPlaylistIndex(idx) {
      if (idx < 0 || idx >= playlistItems.length) return;
      playlistIndex = idx;
      const it = playlistItems[idx];
      renderPlaylistPane();
      loadCall(it.smid, it.displayLabel || it.key, undefined, null, it.timestamps || []);
    }

    function stopAudio() { if (audio) { audio.pause(); audio.src = ""; audio = null; } }
    function setStatus(msg) { els.statusEl.textContent = msg; }
    function setTitle(t) { els.titleEl.textContent = t; }

    function updateTime() {
      if (!audio || !durationMs) return;
      const curMs = audio.currentTime * 1000;
      els.timeEl.textContent = `${fmtTime(curMs)} / ${fmtTime(durationMs)}`;
      if (!seeking) els.seekBar.value = Math.round((audio.currentTime / audio.duration) * 1000);
      updatePlayhead(els.playheadDiv, curMs, durationMs);
      syncTranscript(curMs);
      updateHopStates();
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
        if (autoScrollEnabled && isActive && b.getAttribute("data-active") !== "1" && audio && audio.currentTime > 0.5) {
          b.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
        b.setAttribute("data-active", isActive ? "1" : "0");
      });
    }

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

    function buildPinBar() {
      els.pinBar.innerHTML = "";
      for (let i = 0; i < phraseOffsets.length; i++) {
        const ms = phraseOffsets[i];
        const btn = el("button", {
          style: `border:1px solid ${PHRASE_PIN_COLOR};background:transparent;color:${PHRASE_PIN_COLOR};padding:2px 7px;border-radius:999px;font-size:10px;cursor:pointer;`,
          title: `Phrase hit at ${fmtTime(ms)}`
        }, `P${i + 1} ${fmtTime(ms)}`);
        btn.onclick = () => { if (audio) audio.currentTime = ms / 1000; };
        els.pinBar.appendChild(btn);
      }
      for (let i = 0; i < eventOffsets.length; i++) {
        const ms = eventOffsets[i];
        const btn = el("button", {
          style: `border:1px solid ${EVENT_PIN_COLOR};background:transparent;color:${EVENT_PIN_COLOR};padding:2px 7px;border-radius:999px;font-size:10px;cursor:pointer;`,
          title: `Event at ${fmtTime(ms)}`
        }, `E${i + 1} ${fmtTime(ms)}`);
        btn.onclick = () => { if (audio) audio.currentTime = ms / 1000; };
        els.pinBar.appendChild(btn);
      }
      for (let i = 0; i < importedTimestamps.length; i++) {
        const imp = importedTimestamps[i];
        if (imp.ms <= 0) continue;
        const btn = el("button", {
          style: `border:1px solid ${IMPORTED_PIN_COLOR};background:transparent;color:${IMPORTED_PIN_COLOR};padding:2px 7px;border-radius:999px;font-size:10px;cursor:pointer;`,
          title: `${imp.label} at ${fmtTime(imp.ms)}`
        }, `${imp.label} ${fmtTime(imp.ms)}`);
        btn.onclick = () => { if (audio) audio.currentTime = imp.ms / 1000; };
        els.pinBar.appendChild(btn);
      }
    }

    els.playBtn.onclick = () => { if (!audio) return; if (audio.paused) audio.play().catch(() => {}); else audio.pause(); };
    els.seekBar.addEventListener("mousedown", () => { seeking = true; });
    els.seekBar.addEventListener("input", () => { if (!audio) return; audio.currentTime = (parseInt(els.seekBar.value) / 1000) * audio.duration; });
    els.seekBar.addEventListener("mouseup", () => { seeking = false; });
    els.volSlider.oninput = () => { if (audio) audio.volume = parseFloat(els.volSlider.value); };
    els.volBtn.onclick = () => { if (!audio) return; audio.muted = !audio.muted; els.volBtn.textContent = audio.muted ? "\uD83D\uDD07" : "\uD83D\uDD0A"; };
    els.timelineWrap.addEventListener("click", (e) => {
      if (!audio || !durationMs) return;
      const rect = els.timelineWrap.getBoundingClientRect();
      audio.currentTime = ((e.clientX - rect.left) / rect.width) * (durationMs / 1000);
    });
    els.hideBtn.onclick = () => {
      const hidden = els.pane.style.height === "0px";
      els.pane.style.height = hidden ? "280px" : "0px";
      els.pane.style.overflow = hidden ? "visible" : "hidden";
      els.hideBtn.textContent = hidden ? "Hide Player" : "Show Player";
    };
    if (typeof onClose === "function") onClose(() => stopAudio());

    async function loadCall(smid, label, jumpToMs, searchQuery, impTs) {
      if (currentSmid === smid && jumpToMs !== undefined) { if (audio) audio.currentTime = jumpToMs / 1000; return; }
      currentSmid = smid;
      callMeta.smid = smid;
      const plState = api.getShared("playlistState");
      if (plState) {
        callMeta.displayFieldName = plState.displayFieldName || "";
        const found = (plState.items || []).find(it => it.smid === smid);
        callMeta.displayFieldValue = found ? (found.displayLabel || found.key) : (label || "");
      } else {
        callMeta.displayFieldName = ""; callMeta.displayFieldValue = label || "";
      }
      stopAudio();
      importedTimestamps = (impTs || []).map(t => ({ label: t.label, ms: t.ms }));
      transcriptRows = []; phraseOffsets = []; eventOffsets = [];
      segments = []; nonTalkSegments = [];
      els.transcriptPane.innerHTML = ""; els.pinBar.innerHTML = "";
      els.playBtn.textContent = "\u25B6"; els.seekBar.value = 0;
      els.timeEl.textContent = "00:00 / 00:00";
      els.waveformImg.src = ""; els.playheadDiv.style.left = "0%";
      setTitle(label || `SMID ${smid}`); setStatus("Preparing...");
      els.pane.style.height = "280px"; els.pane.style.overflow = "visible"; els.hideBtn.textContent = "Hide Player";

      let prepared;
      try { prepared = await preparePoll(smid, jumpToMs || 0); } catch (e) { setStatus("Preparation failed: " + e.message); return; }
      durationMs = prepared.durationMs || 0;
      if (prepared.waveformUri) els.waveformImg.src = prepared.waveformUri;
      audio = new Audio(prepared.mediaUri);
      audio.volume = parseFloat(els.volSlider.value);
      audio.playbackRate = SPEEDS[speedIdx];
      audio.ontimeupdate = () => { if (audio.currentTime > 0) { updateTime(); skipNonTalk(); } };
      audio.onplay = () => { els.playBtn.textContent = "\u23F8"; };
      audio.onpause = () => { els.playBtn.textContent = "\u25B6"; };
      audio.onended = () => { els.playBtn.textContent = "\u25B6"; };
      audio.onloadedmetadata = () => { if (jumpToMs) audio.currentTime = jumpToMs / 1000; updateTime(); audio.play().catch(() => {}); };

      setStatus("Loading data...");
      const [hitLinesResult, autoSummaryResult, transcriptResult, highlightsResult] = await Promise.allSettled([
        fetchJson(HIT_LINES_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceMediaId: smid, context: {} }) }),
        fetchJson(AUTOSUMMARY_URL(smid)),
        fetchJson(TRANSCRIPT_URL(smid)),
        searchQuery ? fetchJson(HIGHLIGHTS_URL(smid), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ languageFilter: searchQuery.languageFilter || { languages: [] }, namedSetId: searchQuery.namedSetId || null, query: searchQuery.query, highlightFragmentSize: 0 }) }) : Promise.resolve(null)
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
      }
      if (transcriptResult.status === "fulfilled" && transcriptResult.value) {
        const raw = transcriptResult.value;
        transcriptRows = raw.transcriptRows || raw.TranscriptRows || raw.rows || [];
        els.transcriptPane.innerHTML = "";
        for (let i = 0; i < transcriptRows.length; i++) {
          const row = transcriptRows[i];
          const isAgent = (row.speaker || row.Speaker || "").toLowerCase() === "agent";
          const tsLabel = [row.formattedStartOffset, row.formattedEndOffset].filter(Boolean).join(" - ");
          const bubble = el("div", { style: `max-width:80%;display:flex;flex-direction:column;align-self:${isAgent ? "flex-end" : "flex-start"};` });
          const msgEl = el("div", { style: `background:${isAgent ? "#1e3a5f" : "#1e293b"};color:${isAgent ? "#bfdbfe" : "#e2e8f0"};border-radius:${isAgent ? "10px 10px 2px 10px" : "10px 10px 10px 2px"};padding:5px 10px;font-size:11px;line-height:1.4;cursor:pointer;` });
          msgEl.textContent = (row.text || row.Text || "").trim();
          const tsEl = el("div", { style: `font-size:10px;color:#475569;margin-top:2px;text-align:${isAgent ? "right" : "left"};padding:0 4px;` }, tsLabel);
          bubble.appendChild(msgEl); bubble.appendChild(tsEl);
          bubble.setAttribute("data-tx-idx", i);
          bubble.onclick = () => { if (audio) audio.currentTime = row.totalSecondsFromStart || 0; };
          const wrapper = el("div", { style: `display:flex;justify-content:${isAgent ? "flex-end" : "flex-start"};` });
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
        let match; const phraseTexts = [];
        while ((match = markerRegex.exec(hlText)) !== null) phraseTexts.push(match[1].toLowerCase().trim());
        const seen = new Set(); phraseOffsets = [];
        for (const phrase of phraseTexts) {
          for (const pr of plainRows) {
            if (pr.text.includes(phrase) && !seen.has(pr.ts)) { seen.add(pr.ts); phraseOffsets.push(pr.ts * 1000); break; }
          }
        }
      }

      drawTimeline(els.segCanvas, els.timelineWrap, durationMs, segments, phraseOffsets, eventOffsets, importedTimestamps);
      buildPinBar();
      buildEventsPane(els.eventsFilterCb.checked);
      updateHopStates();
      if (importedTimestamps.length && importedTimestamps[0].ms > 0) {
        audio.currentTime = importedTimestamps[0].ms / 1000;
      } else if (phraseOffsets.length) {
        audio.currentTime = phraseOffsets[0] / 1000;
      }
      setStatus(durationMs ? `${fmtTime(durationMs)} \u00B7 ${segments.length} seg \u00B7 ${phraseOffsets.length} phrases \u00B7 ${importedTimestamps.length} imported` : "Loaded");
      window.addEventListener("resize", () => { drawTimeline(els.segCanvas, els.timelineWrap, durationMs, segments, phraseOffsets, eventOffsets, importedTimestamps); }, { passive: true });
    }

    function setPlaylist(items) {
      playlistItems = items || [];
      playlistIndex = -1;
      renderPlaylistPane();
      updateHopStates();
    }

    return { loadCall, stopAudio, els, setPlaylist, loadPlaylistIndex, renderPlaylistPane };
  }

  api.registerTool({
    id: "mediaPlayer",
    label: "Media Player",
    hidden: true,
    open: () => {},
    _openPlayerPane: openPlayerPane
  });
})();
