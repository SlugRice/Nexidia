(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;

  const BASE = "https://apug01.nxondemand.com/NxIA";
  const PREPARE_URL = (smid, offset) =>
    `${BASE}/api/media-preparation/prepare?sourceMediaId=${smid}&startOffsetMilliseconds=${offset}&clipDurationMilliseconds=0&requestVideoIfAvailable=true`;
  const HIT_LINES_URL = `${BASE}/api/search/media-hit-lines`;
  const AUTOSUMMARY_URL = (smid) => `${BASE}/api/autosummary/${smid}`;
  const TRANSCRIPT_URL = (smid) => `${BASE}/api/transcript/${smid}`;
  const HIGHLIGHTS_URL = (smid) => `${BASE}/api-gateway/explore/api/v1.0/transcripts/${smid}/highlights`;

  const SEGMENT_COLORS = {
    Agent: "#3b82f6",
    Customer: "#22c55e",
    CrossTalk: "#ef4444",
    NonTalk: "#f59e0b"
  };
  const PHRASE_PIN_COLOR = "#a855f7";
  const EVENT_PIN_COLOR = "#0ea5e9";
  const PLAYHEAD_COLOR = "#ffffff";

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

    const handle = el("div", {
      style: `height:6px;cursor:ns-resize;background:#1f2937;border-bottom:1px solid #374151;flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:4px;`
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
      const newH = Math.max(120, Math.min(window.innerHeight * 0.8, startH + (startY - e.clientY)));
      pane.style.height = newH + "px";
    });
    document.addEventListener("mouseup", () => {
      if (dragging) { dragging = false; document.body.style.userSelect = ""; }
    });

    const header = el("div", {
      style: "display:flex;align-items:center;gap:8px;padding:6px 12px;background:#0f172a;flex-shrink:0;"
    });
    const titleEl = el("div", {
      style: "font-size:12px;font-weight:700;color:#93c5fd;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
    }, "No call loaded");
    const statusEl = el("div", {
      style: "font-size:11px;color:#64748b;flex-shrink:0;"
    }, "");
    const hideBtn = el("button", {
      style: "border:0;background:#1e293b;color:#94a3b8;padding:3px 8px;border-radius:6px;font-size:11px;cursor:pointer;flex-shrink:0;"
    }, "Hide Player");
    header.appendChild(titleEl);
    header.appendChild(statusEl);
    header.appendChild(hideBtn);

    const body = el("div", { style: "display:flex;flex:1;min-height:0;overflow:hidden;" });
    const leftCol = el("div", { style: "display:flex;flex-direction:column;flex:1;min-width:0;overflow:hidden;" });

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

    const controls = el("div", {
      style: "display:flex;align-items:center;gap:8px;padding:6px 10px;background:#0f172a;flex-shrink:0;border-top:1px solid #1e293b;"
    });
    const playBtn = el("button", {
      style: "width:32px;height:32px;border-radius:50%;border:0;background:#3b82f6;color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;"
    }, "▶");
    const timeEl = el("div", {
      style: "font-size:11px;color:#94a3b8;flex-shrink:0;font-family:monospace;min-width:90px;"
    }, "00:00 / 00:00");
    const seekBar = el("input", {
      type: "range", min: 0, max: 1000, value: 0,
      style: "flex:1;accent-color:#3b82f6;cursor:pointer;"
    });
    const volBtn = el("button", {
      style: "border:0;background:transparent;color:#94a3b8;font-size:14px;cursor:pointer;flex-shrink:0;padding:2px 4px;"
    }, "🔊");
    const volSlider = el("input", {
      type: "range", min: 0, max: 1, step: 0.05, value: 1,
      style: "width:60px;accent-color:#3b82f6;cursor:pointer;flex-shrink:0;"
    });
    const pinBar = el("div", {
      style: "display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-left:8px;"
    });
    controls.appendChild(playBtn);
    controls.appendChild(timeEl);
    controls.appendChild(seekBar);
    controls.appendChild(volBtn);
    controls.appendChild(volSlider);
    controls.appendChild(pinBar);

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
    autoScrollCb.onchange = () => { autoScrollEnabled = autoScrollCb.checked; };
    autoScrollLabel.appendChild(autoScrollCb);
    autoScrollLabel.appendChild(document.createTextNode("Auto-scroll with playback"));
    transcriptBar.appendChild(autoScrollLabel);

    const copyTxBtn = el("button", {
      title: "Copy Transcript To Clipboard",
      style: "margin-left:auto;border:0;background:#1e293b;color:#cbd5e1;padding:4px 7px;border-radius:6px;cursor:pointer;font-size:13px;line-height:1;"
    }, "\u29C9");
    copyTxBtn.onclick = () => {
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
      copyTxBtn.textContent = "\u2713";
      setTimeout(() => { copyTxBtn.textContent = "\u29C9"; }, 1500);
    };
    transcriptBar.appendChild(copyTxBtn);

    const transcriptPane = el("div", {
      style: "flex:1;min-height:0;overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:6px;"
    });

    transcriptOuter.appendChild(transcriptBar);
    transcriptOuter.appendChild(transcriptPane);

    leftCol.appendChild(timelineWrap);
    leftCol.appendChild(controls);
    leftCol.appendChild(transcriptOuter);
    body.appendChild(leftCol);
    pane.appendChild(handle);
    pane.appendChild(header);
    pane.appendChild(body);
    gridCard.appendChild(pane);

    return {
      pane, titleEl, statusEl, hideBtn,
      timelineWrap, waveformImg, segCanvas, playheadDiv,
      playBtn, timeEl, seekBar, volBtn, volSlider, pinBar,
      transcriptPane
    };
  }

  function drawTimeline(canvas, wrap, durationMs, segments, phraseOffsets, eventOffsets) {
    const W = wrap.offsetWidth || 800;
    const H = wrap.offsetHeight || 80;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    if (!durationMs) return;

    const agentH = Math.round(H * 0.4);
    const custH = Math.round(H * 0.4);

    for (const seg of segments) {
      const x = (seg.startOffset / durationMs) * W;
      const w = Math.max(1, (seg.duration / durationMs) * W);
      const type = seg.spokenText || "NonTalk";
      if (type === "Agent") {
        ctx.fillStyle = SEGMENT_COLORS.Agent;
        ctx.fillRect(x, 0, w, agentH);
      } else if (type === "Customer") {
        ctx.fillStyle = SEGMENT_COLORS.Customer;
        ctx.fillRect(x, H - custH, w, custH);
      } else if (type === "CrossTalk") {
        ctx.fillStyle = SEGMENT_COLORS.CrossTalk;
        ctx.fillRect(x, 0, w, H);
      } else {
        ctx.fillStyle = "rgba(245,158,11,0.25)";
        ctx.fillRect(x, 0, w, H);
      }
    }

    for (const offsetMs of (eventOffsets || [])) {
      const x = Math.round((offsetMs / durationMs) * W);
      ctx.strokeStyle = EVENT_PIN_COLOR;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const offsetMs of (phraseOffsets || [])) {
      const x = Math.round((offsetMs / durationMs) * W);
      ctx.strokeStyle = PHRASE_PIN_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.fillStyle = PHRASE_PIN_COLOR;
      ctx.beginPath(); ctx.arc(x, 6, 4, 0, Math.PI * 2); ctx.fill();
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
    let segments = [];
    let currentSmid = null;
    let seeking = false;
    let nonTalkSegments = [];
    let autoScrollEnabled = true;

    function stopAudio() {
      if (audio) {
        audio.pause();
        audio.src = "";
        audio = null;
      }
    }

    function setStatus(msg) { els.statusEl.textContent = msg; }
    function setTitle(t) { els.titleEl.textContent = t; }

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
        if (autoScrollEnabled && isActive && b.getAttribute("data-active") !== "1" && audio && audio.currentTime > 0.5) { b.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
        b.setAttribute("data-active", isActive ? "1" : "0");
      });
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

    els.playBtn.onclick = () => {
      if (!audio) return;
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    };
    els.seekBar.addEventListener("mousedown", () => { seeking = true; });
    els.seekBar.addEventListener("input", () => {
      if (!audio) return;
      audio.currentTime = (parseInt(els.seekBar.value) / 1000) * audio.duration;
    });
    els.seekBar.addEventListener("mouseup", () => { seeking = false; });
    els.volSlider.oninput = () => { if (audio) audio.volume = parseFloat(els.volSlider.value); };
    els.volBtn.onclick = () => {
      if (!audio) return;
      audio.muted = !audio.muted;
      els.volBtn.textContent = audio.muted ? "🔇" : "🔊";
    };
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

    if (typeof onClose === "function") {
      onClose(() => stopAudio());
    }

    async function loadCall(smid, label, jumpToMs, searchQuery) {
      if (currentSmid === smid && jumpToMs !== undefined) {
        if (audio) audio.currentTime = jumpToMs / 1000;
        return;
      }
      currentSmid = smid;
      stopAudio();
      transcriptRows = []; phraseOffsets = []; eventOffsets = [];
      segments = []; nonTalkSegments = [];
      els.transcriptPane.innerHTML = "";
      els.pinBar.innerHTML = "";
      els.playBtn.textContent = "▶";
      els.seekBar.value = 0;
      els.timeEl.textContent = "00:00 / 00:00";
      els.waveformImg.src = "";
      els.playheadDiv.style.left = "0%";

      setTitle(label || `SMID ${smid}`);
      setStatus("Preparing...");
      els.pane.style.height = "280px";
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
      audio.volume = parseFloat(els.volSlider.value);
      audio.ontimeupdate = () => { if (audio.currentTime > 0) { updateTime(); skipNonTalk(); } };
      audio.onplay = () => { els.playBtn.textContent = "⏸"; };
      audio.onpause = () => { els.playBtn.textContent = "▶"; };
      audio.onended = () => { els.playBtn.textContent = "▶"; };
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
          msgEl.textContent = (row.text || row.Text || "").trim();

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
        let runningText = "";
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

      drawTimeline(els.segCanvas, els.timelineWrap, durationMs, segments, phraseOffsets, eventOffsets);
      buildPinBar();

      if (phraseOffsets.length) {
        audio.currentTime = phraseOffsets[0] / 1000;
      }

      setStatus(durationMs
        ? `${fmtTime(durationMs)} · ${segments.length} segments · ${phraseOffsets.length} phrase hits`
        : "Loaded");

      window.addEventListener("resize", () => {
        drawTimeline(els.segCanvas, els.timelineWrap, durationMs, segments, phraseOffsets, eventOffsets);
      }, { passive: true });
    }

    return { loadCall, stopAudio, els };
  }

  api.registerTool({
    id: "mediaPlayer",
    label: "Media Player",
    hidden: true,
    open: () => {},
    _openPlayerPane: openPlayerPane
  });

})();
