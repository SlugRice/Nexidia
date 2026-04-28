(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;

  // ── LocalStorage helpers ─────────────────────────────────────────────────
  const LS_KEY = "nexidia_batch_settings";
  function loadSavedSettings() {
    try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch (_) { return null; }
  }
  function saveSettings(cfg) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (_) {}
  }
  function clearSavedSettings() {
    try { localStorage.removeItem(LS_KEY); } catch (_) {}
  }
  function hasSavedSettings() {
    return !!localStorage.getItem(LS_KEY);
  }

  // ── Defaults ─────────────────────────────────────────────────────────────
  const DEFAULTS = {
    targetTokens: 25000,
    charsPerToken: 3.5,
    gapThresholdSeconds: 60,
    showTimestamps: false,
    concurrency: 50,
    delayMs: 20,
    fetchRetries: 3,
    retryBackoffMs: 600,
    searchTo: 10000,
    useApiFirst: true,
    batchMode: "length",
    countPerBatch: 50,
    copies: 1,
    fileBase: "Batch",
    fileIncrement: "001",
    fileSubIncrement: "a"
  };

  // ── Config resolution ────────────────────────────────────────────────────
  function resolveConfig(overrides) {
    return Object.assign({}, DEFAULTS, overrides || {});
  }

  // ── Increment helpers ────────────────────────────────────────────────────
  function padIncrement(base, width) {
    const s = String(base);
    return s.length >= width ? s : "0".repeat(width - s.length) + s;
  }

  function incrementString(s) {
    if (!s) return "a";
    const last = s[s.length - 1];
    if (last >= "a" && last <= "z") {
      if (last === "z") return s.slice(0, -1) + "aa";
      return s.slice(0, -1) + String.fromCharCode(last.charCodeAt(0) + 1);
    }
    if (last >= "A" && last <= "Z") {
      if (last === "Z") return s.slice(0, -1) + "AA";
      return s.slice(0, -1) + String.fromCharCode(last.charCodeAt(0) + 1);
    }
    if (last >= "0" && last <= "9") {
      const num = parseInt(s, 10);
      if (!isNaN(num)) return String(num + 1);
      return s.slice(0, -1) + String(parseInt(last) + 1);
    }
    return s + "1";
  }

  function getIncrementWidth(incStr) {
    return incStr.replace(/^0+/, "").length === 0 ? incStr.length : incStr.length;
  }

  function buildFilename(base, incNum, incWidth, copies, copyIdx, subInc) {
    const inc = padIncrement(incNum, incWidth);
    if (copies <= 1) return base + inc;
    let sub = subInc || "a";
    for (let i = 0; i < copyIdx; i++) sub = incrementString(sub);
    return base + inc + sub;
  }

  function buildExamples(base, incStr, copies, subInc) {
    const width = incStr.length;
    let startNum = parseInt(incStr.replace(/^0+/, "") || "0", 10);
    if (isNaN(startNum)) startNum = 1;
    const examples = [];
    let batchNum = startNum;
    outer: for (let b = 0; b < 3; b++) {
      if (copies <= 1) {
        examples.push(buildFilename(base, batchNum, width, 1, 0, ""));
        batchNum++;
      } else {
        for (let c = 0; c < copies; c++) {
          examples.push(buildFilename(base, batchNum, width, copies, c, subInc));
          if (examples.length >= 3) break outer;
        }
        batchNum++;
      }
    }
    return examples;
  }

  // ── Utility ──────────────────────────────────────────────────────────────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function nowStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function uniq(arr) { return [...new Set(arr)]; }

  //##> ID DETECTION: UCIDs are always exactly 20 digits. Trans_Ids are 8-10 digits.
  //##> These length rules are load-bearing for auto-routing pasted IDs to the correct
  //##> search parameter (UDFVarchar1 vs UDFVarchar110). Do not change without verifying
  //##> against actual Nexidia data conventions.
  function parseMixed(raw) {
    const tokens = uniq(
      raw.split(/[\s,]+/g).map((s) => s.trim()).filter(Boolean)
        .map((s) => s.replace(/[^\d]/g, "")).filter(Boolean)
    );
    const userToUser = [], transIds = [], ignored = [];
    for (const t of tokens) {
      if (t.length === 20) userToUser.push(t);
      else if (t.length >= 8 && t.length <= 10) transIds.push(t);
      else ignored.push(t);
    }
    return { userToUser, transIds, ignored, total: tokens.length };
  }

  async function fetchJson(url, init) {
    const res = await fetch(url, init || { credentials: "include" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText} :: ${body.slice(0, 200)}`);
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) return res.json();
    const t = await res.text();
    try { return JSON.parse(t); } catch { return { raw: t }; }
  }

  async function getTranscriptBySmid(smid, cfg) {
    const apiUrl = `https://apug01.nxondemand.com/NxIA/api/transcript/${smid}`;
    const svcUrl = `https://apug01.nxondemand.com/NxIA/Search/ClientServices/TranscriptService.svc/Transcripts/?SourceMediaId=${smid}&_=${Date.now()}`;
    if (cfg.useApiFirst) {
      try { return await fetchJson(apiUrl, { credentials: "include" }); } catch { return await fetchJson(svcUrl, { credentials: "include" }); }
    } else {
      try { return await fetchJson(svcUrl, { credentials: "include" }); } catch { return await fetchJson(apiUrl, { credentials: "include" }); }
    }
  }

  function gapFmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
  }

  function cleanTranscript(payload, cfg) {
    const rows = payload?.TranscriptRows || payload?.rows || payload?.transcriptRows || [];
    const out = [];
    let lastTs = null, lastSp = null;
    for (const r of rows) {
      const speakerRaw = (r.Speaker || r.speaker || "").toString().trim().toLowerCase();
      let text = (r.Text || r.text || "").toString();
      const ts = (typeof r.TotalSecondsFromStart === "number") ? r.TotalSecondsFromStart : null;
      text = text.replace(/<unk>/gi, "").trim().replace(/\s+/g, " ").trim();
      if (!text) { if (ts !== null) lastTs = ts; continue; }
      let sp = "";
      if (speakerRaw === "agent") sp = "S1";
      else if (speakerRaw === "customer") sp = "S2";
      else if (speakerRaw) sp = "S?";
      if (lastTs !== null && ts !== null) {
        const gap = ts - lastTs;
        if (gap >= cfg.gapThresholdSeconds) out.push(`[GAP ${gapFmt(gap)}]`);
      }
      let line = "";
      if (cfg.showTimestamps && ts !== null) {
        const m = Math.floor(ts / 60), s = Math.floor(ts % 60);
        line = `[${m}:${String(s).padStart(2, "0")}] `;
      }
      line += `${sp}: ${text}`;
      if (out.length && sp && lastSp === sp && !out[out.length - 1].startsWith("[GAP")) {
        out[out.length - 1] = out[out.length - 1] + " " + text;
      } else {
        out.push(line);
        lastSp = sp || null;
      }
      if (ts !== null) lastTs = ts;
    }
    return out.join("\n");
  }

  // ── ZIP builder ──────────────────────────────────────────────────────────
  function crc32(buf) {
    let crc = ~0;
    for (let i = 0; i < buf.length; i++) { crc ^= buf[i]; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1)); }
    return ~crc >>> 0;
  }
  const enc = new TextEncoder();
  const u16 = (n) => new Uint8Array([n & 255, (n >>> 8) & 255]);
  const u32 = (n) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
  const strBytes = (s) => enc.encode(s);

  function makeZip(files) {
    const localParts = [], centralParts = [];
    let offset = 0;
    for (const f of files) {
      const nameBytes = strBytes(f.name);
      const dataBytes = strBytes(f.text);
      const crc = crc32(dataBytes);
      const localHeader = [u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(dataBytes.length),u32(dataBytes.length),u16(nameBytes.length),u16(0)];
      const localBlobParts = [...localHeader, nameBytes, dataBytes];
      const localSize = localBlobParts.reduce((a, p) => a + p.length, 0);
      localParts.push(...localBlobParts);
      const centralHeader = [u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(dataBytes.length),u32(dataBytes.length),u16(nameBytes.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset)];
      centralParts.push(...centralHeader, nameBytes);
      offset += localSize;
    }
    const centralSize = centralParts.reduce((a, p) => a + p.length, 0);
    const localSizeTotal = localParts.reduce((a, p) => a + p.length, 0);
    const eocd = [u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralSize),u32(localSizeTotal),u16(0)];
    return new Blob([...localParts, ...centralParts, ...eocd], { type: "application/zip" });
  }

  // ── DOM helper ───────────────────────────────────────────────────────────
  function el(tag, props, ...children) {
    props = props || {};
    const node = document.createElement(tag);
    Object.assign(node, props);
    for (const ch of children) {
      if (ch === null || ch === undefined) continue;
      node.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
    }
    return node;
  }

  function tooltip(text) {
    const wrap = el("span", { style: "position:relative;display:inline-flex;align-items:center;cursor:help;margin-left:4px;" });
    const icon = el("span", { style: "display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:#e5e7eb;color:#6b7280;font-size:10px;font-weight:700;line-height:1;flex-shrink:0;" }, "i");
    const tip = el("div", { style: "display:none;position:fixed;background:#1f2937;color:#f9fafb;font-size:11px;padding:6px 10px;border-radius:7px;width:220px;z-index:1000010;line-height:1.4;white-space:normal;pointer-events:none;" }, text);
    wrap.appendChild(icon);
    wrap.appendChild(tip);
    wrap.onmouseenter = () => {
      const r = wrap.getBoundingClientRect();
      tip.style.display = "block";
      tip.style.left = Math.min(r.left + r.width / 2 - 110, window.innerWidth - 230) + "px";
      tip.style.top = (r.top - tip.offsetHeight - 8) + "px";
    };
    wrap.onmouseleave = () => { tip.style.display = "none"; };
    return wrap;
  }

  function labelRow(labelText, tipText, inputEl) {
    const row = el("div", { style: "display:flex;align-items:center;gap:6px;margin-bottom:6px;" });
    row.appendChild(el("span", { style: "font-size:12px;color:#374151;font-weight:600;" }, labelText));
    if (tipText) row.appendChild(tooltip(tipText));
    if (inputEl) row.appendChild(inputEl);
    return row;
  }

  function sectionHead(text) {
    return el("div", { style: "font-size:13px;font-weight:700;color:#1e3a5f;margin:14px 0 8px;" }, text);
  }

  function divider() {
    return el("div", { style: "height:1px;background:#e5e7eb;margin:14px 0;" });
  }

  // ── Settings modal ───────────────────────────────────────────────────────
  function openSettingsModal(currentCfg, onSave) {
    let draft = Object.assign({}, currentCfg);

    const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1000005;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
    const box = el("div", { style: "background:#fff;width:560px;max-height:88vh;overflow-y:auto;border-radius:14px;padding:22px 24px 18px;box-shadow:0 10px 30px rgba(0,0,0,.35);position:relative;" });

    box.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#111827;margin-bottom:4px;" }, "Batch Settings"));
    const closeBtn = el("button", { style: "position:absolute;top:14px;right:16px;border:0;background:#f3f4f6;color:#6b7280;width:26px;height:26px;border-radius:50%;font-size:13px;cursor:pointer;" }, "\u2715");
    closeBtn.onclick = () => overlay.remove();
    box.appendChild(closeBtn);
    box.appendChild(divider());

    // ── Section 1: Batch size mode ────────────────────────────────────────
    box.appendChild(sectionHead("Batch Size"));

    // Radio: length
    const radioLength = el("input", { type: "radio", name: "batchMode", value: "length" });
    radioLength.checked = draft.batchMode === "length";
    const radioLengthRow = el("label", { style: "display:flex;align-items:center;gap:8px;font-size:13px;color:#111827;cursor:pointer;margin-bottom:8px;" });
    radioLengthRow.appendChild(radioLength);
    radioLengthRow.appendChild(document.createTextNode("Cap batches based on length of text"));
    radioLengthRow.appendChild(tooltip("Use this to optimize batches for Copilot prompts. Batches are split based on how much text they contain, so each batch fits within a predictable token range."));
    box.appendChild(radioLengthRow);

    // Slider area
    const sliderArea = el("div", { style: "margin-left:22px;margin-bottom:10px;" + (draft.batchMode !== "length" ? "display:none;" : "") });
    sliderArea.id = "sliderArea";

    const PRESETS = [
      { label: "Small", tokens: 18500, tip: "Best for heavy or multi-pass prompts where Copilot needs to analyze each call carefully." },
      { label: "Medium", tokens: 25000, tip: "A balanced default. Works well for most standard prompt types." },
      { label: "Large", tokens: 32500, tip: "Best for simple prompts like single-flag reviews or basic call summaries." }
    ];

    const sliderLabels = el("div", { style: "display:flex;justify-content:space-between;margin-bottom:4px;" });
    for (const p of PRESETS) {
      const lbl = el("div", { style: "display:flex;flex-direction:column;align-items:center;gap:2px;" });
      lbl.appendChild(el("span", { style: "font-size:11px;font-weight:600;color:#374151;" }, p.label));
      lbl.appendChild(tooltip(p.tip));
      sliderLabels.appendChild(lbl);
    }
    sliderArea.appendChild(sliderLabels);

    const slider = el("input", { type: "range", min: 0, max: 2, step: 1, style: "width:100%;margin-bottom:6px;accent-color:#3b82f6;" });
    const matchedPreset = PRESETS.findIndex((p) => p.tokens === draft.targetTokens);
    slider.value = matchedPreset >= 0 ? matchedPreset : 1;

    const sliderTip = el("div", { style: "font-size:11px;color:#6b7280;margin-bottom:8px;" });
    function updateSliderTip(tokens) {
      const chars = Math.round(tokens * draft.charsPerToken).toLocaleString();
      sliderTip.textContent = `About ${chars} characters per batch`;
    }
    updateSliderTip(draft.targetTokens);

    slider.oninput = () => {
      const p = PRESETS[parseInt(slider.value)];
      draft.targetTokens = p.tokens;
      customTokenInput.value = "";
      updateSliderTip(p.tokens);
    };
    sliderArea.appendChild(slider);
    sliderArea.appendChild(sliderTip);

    // Custom size
    const customRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:4px;" });
    customRow.appendChild(el("span", { style: "font-size:12px;color:#374151;" }, "Custom token count:"));
    const customTokenInput = el("input", { type: "number", min: 1000, max: 100000, placeholder: "e.g. 20000", style: "width:100px;padding:5px 7px;border:1px solid #ccc;border-radius:6px;font-size:12px;" });
    if (matchedPreset < 0) customTokenInput.value = draft.targetTokens;
    const customTip = el("span", { style: "font-size:11px;color:#6b7280;" });
    function updateCustomTip(val) {
      if (!val) { customTip.textContent = ""; return; }
      const chars = Math.round(val * draft.charsPerToken).toLocaleString();
      customTip.textContent = `≈ ${chars} characters`;
    }
    customTokenInput.oninput = () => {
      const v = parseInt(customTokenInput.value);
      if (!isNaN(v) && v > 0) { draft.targetTokens = v; slider.value = -1; updateSliderTip(v); updateCustomTip(v); }
    };
    updateCustomTip(matchedPreset < 0 ? draft.targetTokens : null);
    customRow.appendChild(customTokenInput);
    customRow.appendChild(customTip);
    sliderArea.appendChild(customRow);
    box.appendChild(sliderArea);

    // Radio: count
    const radioCount = el("input", { type: "radio", name: "batchMode", value: "count" });
    radioCount.checked = draft.batchMode === "count";
    const radioCountRow = el("label", { style: "display:flex;align-items:center;gap:8px;font-size:13px;color:#111827;cursor:pointer;margin-bottom:8px;" });
    radioCountRow.appendChild(radioCount);
    radioCountRow.appendChild(document.createTextNode("Cap batches by count"));
    radioCountRow.appendChild(tooltip("Split batches by a fixed number of transcripts regardless of how long they are."));
    box.appendChild(radioCountRow);

    const countArea = el("div", { style: "margin-left:22px;margin-bottom:10px;" + (draft.batchMode !== "count" && draft.batchMode !== "all" ? "display:none;" : "") });
    countArea.id = "countArea";

    const countRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:6px;" });
    const countInput = el("input", { type: "number", min: 1, max: 10000, value: draft.countPerBatch, style: "width:80px;padding:5px 7px;border:1px solid #ccc;border-radius:6px;font-size:12px;" });
    countInput.oninput = () => { const v = parseInt(countInput.value); if (!isNaN(v) && v > 0) draft.countPerBatch = v; };
    countRow.appendChild(el("span", { style: "font-size:12px;color:#374151;" }, "Transcripts per batch:"));
    countRow.appendChild(countInput);

    const allBtn = el("button", { style: "padding:5px 12px;border-radius:7px;border:1px solid #d1d5db;background:#f9fafb;font-size:12px;cursor:pointer;", title: "Combine all transcripts into one single file regardless of size." }, "All");
    allBtn.onclick = () => {
      draft.batchMode = "all";
      radioCount.checked = true;
      countInput.value = 999999;
      draft.countPerBatch = 999999;
    };
    countRow.appendChild(allBtn);
    countArea.appendChild(countRow);
    box.appendChild(countArea);

    // Radio toggle behavior
    function updateModeAreas() {
      sliderArea.style.display = draft.batchMode === "length" ? "" : "none";
      countArea.style.display = (draft.batchMode === "count" || draft.batchMode === "all") ? "" : "none";
    }
    radioLength.onchange = () => { if (radioLength.checked) { draft.batchMode = "length"; updateModeAreas(); } };
    radioCount.onchange = () => { if (radioCount.checked) { draft.batchMode = "count"; updateModeAreas(); } };

    box.appendChild(divider());

    // ── Section 2: Transcript formatting ─────────────────────────────────
    box.appendChild(sectionHead("Transcript Formatting"));

    // Gap threshold
    const gapRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:10px;" });
    const gapInput = el("input", { type: "number", min: 0, max: 600, value: draft.gapThresholdSeconds, style: "width:70px;padding:5px 7px;border:1px solid #ccc;border-radius:6px;font-size:12px;" });
    gapInput.oninput = () => { const v = parseInt(gapInput.value); if (!isNaN(v) && v >= 0) draft.gapThresholdSeconds = v; };
    gapRow.appendChild(el("span", { style: "font-size:12px;color:#374151;" }, "Insert gap markers when silence exceeds"));
    gapRow.appendChild(gapInput);
    gapRow.appendChild(el("span", { style: "font-size:12px;color:#374151;" }, "seconds"));
    gapRow.appendChild(tooltip("Adds a [GAP X:XX] marker in the transcript when there is a long pause. Set to 0 to disable gap markers entirely."));
    box.appendChild(gapRow);

    // Timestamps toggle
    const tsRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:6px;" });
    const tsCheck = el("input", { type: "checkbox" });
    tsCheck.checked = draft.showTimestamps;
    tsCheck.onchange = () => { draft.showTimestamps = tsCheck.checked; };
    const tsLabel = el("label", { style: "display:flex;align-items:center;gap:8px;font-size:12px;color:#374151;cursor:pointer;" });
    tsLabel.appendChild(tsCheck);
    tsLabel.appendChild(document.createTextNode("Include timestamps in transcripts"));
    tsLabel.appendChild(tooltip("Adds a [M:SS] timestamp before each speaker turn. Useful when you need to reference specific moments in a call, but increases file size."));
    tsRow.appendChild(tsLabel);
    box.appendChild(tsRow);

    box.appendChild(divider());

    // ── Section 3: File naming ────────────────────────────────────────────
    box.appendChild(sectionHead("File Naming"));

    // Segmented filename editor
    const filenameWrap = el("div", { style: "display:inline-flex;align-items:center;border:1px solid #d1d5db;border-radius:8px;overflow:hidden;margin-bottom:10px;font-size:13px;" });

    function makeSegment(value, validator, onUpdate, tipText) {
      const seg = el("div", { style: "padding:6px 10px;background:#f9fafb;cursor:pointer;border-right:1px solid #d1d5db;min-width:40px;text-align:center;position:relative;", title: tipText });
      const display = el("span", {}, value);
      const input = el("input", { type: "text", value, style: "display:none;width:80px;padding:0;border:0;background:transparent;font-size:13px;outline:none;text-align:center;" });
      seg.appendChild(display);
      seg.appendChild(input);

      seg.onclick = () => {
        display.style.display = "none";
        input.style.display = "inline";
        input.focus();
        input.select();
      };

      input.onblur = () => {
        let val = input.value;
        if (validator) val = validator(val);
        input.value = val;
        display.textContent = val;
        display.style.display = "inline";
        input.style.display = "none";
        onUpdate(val);
        refreshExamples();
      };

      input.onkeydown = (e) => {
        if (e.key === "Enter") input.blur();
        if (e.key === "Tab") { e.preventDefault(); input.blur(); }
      };

      return seg;
    }

    function validateBase(v) {
      return v.replace(/[\\/:*?"<>|]/g, "").trim() || "Batch";
    }
    function validateIncrement(v) {
      const n = parseInt(v.replace(/\D/g, ""));
      if (isNaN(n)) return draft.fileIncrement;
      const width = Math.max(v.length, String(n).length);
      return padIncrement(n, width);
    }
    function validateSubIncrement(v) {
      return v.trim() || "a";
    }

    const baseSeg = makeSegment(draft.fileBase, validateBase, (v) => { draft.fileBase = v; }, "Click to edit base filename");
    const incSeg = makeSegment(draft.fileIncrement, validateIncrement, (v) => { draft.fileIncrement = v; }, "Click to edit starting increment (numbers only)");
    filenameWrap.appendChild(baseSeg);
    filenameWrap.appendChild(incSeg);

    let subSeg = null;
    function rebuildSubSeg() {
      if (subSeg && filenameWrap.contains(subSeg)) filenameWrap.removeChild(subSeg);
      subSeg = null;
      if (draft.copies > 1) {
        subSeg = makeSegment(draft.fileSubIncrement, validateSubIncrement, (v) => { draft.fileSubIncrement = v; }, "Click to edit sub-increment (letters or numbers)");
        filenameWrap.appendChild(subSeg);
      }
    }
    rebuildSubSeg();
    box.appendChild(filenameWrap);

    // Copies
    const copiesRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:10px;" });
    copiesRow.appendChild(el("span", { style: "font-size:12px;color:#374151;" }, "Copies per batch:"));
    const copiesDec = el("button", { style: "width:24px;height:24px;border-radius:6px;border:1px solid #d1d5db;background:#f9fafb;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;" }, "\u2212");
    const copiesVal = el("span", { style: "font-size:13px;font-weight:600;color:#111827;min-width:20px;text-align:center;" }, String(draft.copies));
    const copiesInc = el("button", { style: "width:24px;height:24px;border-radius:6px;border:1px solid #d1d5db;background:#f9fafb;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;" }, "+");
    copiesDec.onclick = () => {
      if (draft.copies > 1) { draft.copies--; copiesVal.textContent = String(draft.copies); rebuildSubSeg(); refreshExamples(); }
    };
    copiesInc.onclick = () => {
      if (draft.copies < 5) { draft.copies++; copiesVal.textContent = String(draft.copies); rebuildSubSeg(); refreshExamples(); }
    };
    copiesRow.appendChild(copiesDec);
    copiesRow.appendChild(copiesVal);
    copiesRow.appendChild(copiesInc);
    copiesRow.appendChild(tooltip("Generate multiple copies of each batch file. Useful if you want to process the same calls with different prompts. Maximum 5 copies."));
    box.appendChild(copiesRow);

    // Examples
    const examplesWrap = el("div", { style: "background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;margin-bottom:10px;" });
    const examplesTitle = el("div", { style: "font-size:11px;color:#6b7280;margin-bottom:4px;" }, "Example filenames:");
    const examplesList = el("div", { style: "font-size:12px;color:#111827;font-family:monospace;" });
    examplesWrap.appendChild(examplesTitle);
    examplesWrap.appendChild(examplesList);
    box.appendChild(examplesWrap);

    function refreshExamples() {
      const examples = buildExamples(draft.fileBase, draft.fileIncrement, draft.copies, draft.fileSubIncrement);
      examplesList.innerHTML = "";
      for (const e of examples) {
        examplesList.appendChild(el("div", {}, e + ".txt"));
      }
    }
    refreshExamples();

    box.appendChild(divider());

    // ── Section 4: Fetch settings (collapsed) ─────────────────────────────
    const fetchToggle = el("div", { style: "display:flex;align-items:center;gap:6px;margin-bottom:6px;" });
    const fetchLink = el("span", { style: "font-size:12px;color:#3b82f6;cursor:pointer;text-decoration:underline;" }, "Fetch Settings");
    fetchToggle.appendChild(fetchLink);
    fetchToggle.appendChild(tooltip("These settings control how transcripts are fetched from the Nexidia API. Only adjust these if you are troubleshooting fetch errors or performance issues."));
    box.appendChild(fetchToggle);

    const fetchArea = el("div", { style: "display:none;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:10px;" });
    fetchLink.onclick = () => { fetchArea.style.display = fetchArea.style.display === "none" ? "block" : "none"; };

    function fetchField(labelText, tipText, key, min, max) {
      const row = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:8px;" });
      const input = el("input", { type: "number", min, max, value: draft[key], style: "width:80px;padding:5px 7px;border:1px solid #ccc;border-radius:6px;font-size:12px;" });
      input.oninput = () => { const v = parseInt(input.value); if (!isNaN(v)) draft[key] = v; };
      row.appendChild(el("span", { style: "font-size:12px;color:#374151;min-width:160px;" }, labelText));
      row.appendChild(input);
      if (tipText) row.appendChild(tooltip(tipText));
      return row;
    }

    fetchArea.appendChild(fetchField("Concurrency", "Number of transcript fetches running at the same time. Higher = faster but may trigger rate limiting.", "concurrency", 1, 100));
    fetchArea.appendChild(fetchField("Delay (ms)", "Milliseconds to wait between each worker picking up a new fetch. Lower = faster pipeline.", "delayMs", 0, 2000));
    fetchArea.appendChild(fetchField("Fetch retries", "How many times to retry a failed transcript fetch before giving up.", "fetchRetries", 0, 10));
    fetchArea.appendChild(fetchField("Retry backoff (ms)", "How long to wait before each retry attempt. Multiplied by the attempt number.", "retryBackoffMs", 0, 5000));
    fetchArea.appendChild(fetchField("Search limit", "Maximum number of calls to retrieve from a single search query.", "searchTo", 100, 50000));
    box.appendChild(fetchArea);

    box.appendChild(divider());

    // ── Save button ───────────────────────────────────────────────────────
    const saveBtn = el("button", {
      style: "width:100%;padding:10px;border-radius:10px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(59,130,246,0.35);"
    }, "Apply Settings");
    saveBtn.onclick = () => { onSave(draft); overlay.remove(); };
    box.appendChild(saveBtn);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  // ── Progress UI ──────────────────────────────────────────────────────────
  function makeProgressUI() {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 999999;
      background: #0b1225; color: #e5e7eb; font-family: ui-monospace, Consolas, monospace;
      padding: 14px 14px 12px; border-radius: 10px; min-width: 360px; max-width: 520px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.12);
    `;
    const title = document.createElement("div");
    title.textContent = "Nexidia Batch Builder";
    title.style.cssText = "font-size: 14px; font-weight: 700; color: #7dd3fc; margin-bottom: 10px;";
    const closeBtn = document.createElement("div");
    closeBtn.textContent = "\u2715";
    closeBtn.style.cssText = "position:absolute; top:10px; right:12px; cursor:pointer; color:#94a3b8; font-size:16px;";
    closeBtn.onclick = () => overlay.remove();
    const status = document.createElement("div");
    status.style.cssText = "font-size: 12px; margin-bottom: 6px;";
    const detail = document.createElement("div");
    detail.style.cssText = "font-size: 11px; color:#94a3b8; white-space: pre-wrap; margin-bottom: 10px;";
    const barWrap = document.createElement("div");
    barWrap.style.cssText = "height:10px; background:#070b14; border:1px solid rgba(255,255,255,0.10); border-radius:999px; overflow:hidden;";
    const bar = document.createElement("div");
    bar.style.cssText = "height:100%; width:0%; background: linear-gradient(90deg,#38bdf8,#a78bfa);";
    barWrap.appendChild(bar);
    const log = document.createElement("div");
    log.style.cssText = "margin-top:10px; max-height:160px; overflow:auto; font-size:11px; color:#cbd5e1; border-top:1px solid rgba(255,255,255,0.08); padding-top:8px; white-space:pre-wrap;";
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;";
    const btnDownload = document.createElement("button");
    btnDownload.textContent = "Download ZIP";
    btnDownload.disabled = true;
    btnDownload.style.cssText = "background:#22c55e; color:#06210f; border:0; padding:8px 10px; border-radius:8px; cursor:pointer; font-weight:700; opacity:0.6;";
    btnRow.appendChild(btnDownload);
    overlay.appendChild(closeBtn);
    overlay.appendChild(title);
    overlay.appendChild(status);
    overlay.appendChild(detail);
    overlay.appendChild(barWrap);
    overlay.appendChild(btnRow);
    overlay.appendChild(log);
    document.body.appendChild(overlay);
    return {
      setProgress(pct, msg, det) {
        bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        if (msg !== undefined) status.textContent = msg;
        if (det !== undefined) detail.textContent = det;
      },
      appendLog(line) { log.textContent += (log.textContent ? "\n" : "") + line; log.scrollTop = log.scrollHeight; },
      btnDownload,
      remove() { try { overlay.remove(); } catch (_) {} }
    };
  }

  // ── Main launcher UI ─────────────────────────────────────────────────────
  function openTranscriptBatchBuilder() {
    (async () => {
      try {
        // Resolve config — saved settings override defaults
        let cfg = resolveConfig(loadSavedSettings());

        // ── Launcher modal ────────────────────────────────────────────────
        const modal = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
        const card = el("div", { style: "background:#fff;width:540px;border-radius:14px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.35);position:relative;" });

        const titleRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:4px;" });
        const backBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #94a3b8;background:#fff;color:#475569;cursor:pointer;font-size:12px;flex-shrink:0;display:flex;align-items:center;gap:5px;" });
        backBtn.appendChild(el("span", { style: "font-size:14px;" }, "\u2190"));
        backBtn.appendChild(document.createTextNode("Back"));
        backBtn.onclick = () => modal.remove();
        const titleEl = el("div", { style: "font-size:16px;font-weight:700;color:#111827;" }, "Transcript Batch Builder");
        const closeBtn = el("button", { style: "position:absolute;top:14px;right:16px;border:0;background:#f3f4f6;color:#6b7280;width:26px;height:26px;border-radius:50%;font-size:13px;cursor:pointer;" }, "\u2715");
        closeBtn.onclick = () => modal.remove();
        titleRow.appendChild(backBtn);
        titleRow.appendChild(titleEl);
        card.appendChild(titleRow);
        card.appendChild(closeBtn);

        card.appendChild(el("div", { style: "font-size:12px;color:#6b7280;margin-bottom:14px;" },
          "Paste Trans_Id or User to User values below. Values can be separated by commas or line breaks. You can paste directly from Excel."
        ));

        const textarea = el("textarea", {
          rows: 6,
          placeholder: "Paste IDs here...",
          style: "width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;font-family:ui-monospace,Consolas,monospace;box-sizing:border-box;resize:vertical;margin-bottom:12px;"
        });
        card.appendChild(textarea);

        const preload = api.getShared("batchBuilderPreload");
        if (preload) {
          textarea.value = preload;
          api.setShared("batchBuilderPreload", null);
        }

        // Bottom row: settings button + submit + save checkbox + clear
        const bottomRow = el("div", { style: "display:flex;align-items:center;gap:8px;flex-wrap:wrap;" });

        const settingsBtn = el("button", { style: "padding:8px 14px;border-radius:8px;border:1px solid #6366f1;background:#fff;color:#6366f1;font-size:13px;cursor:pointer;font-weight:600;" }, "\u2699\uFE0F Batch Settings");
        settingsBtn.onclick = () => {
          openSettingsModal(cfg, (newCfg) => { cfg = newCfg; });
        };

        const submitBtn = el("button", { style: "flex:1;padding:9px 14px;border-radius:8px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:13px;font-weight:600;cursor:pointer;" }, "Build Batches");

        const saveLabel = el("label", { style: "display:flex;align-items:center;gap:5px;font-size:12px;color:#374151;cursor:pointer;flex-shrink:0;" });
        const saveCheck = el("input", { type: "checkbox" });
        saveCheck.checked = false;
        saveLabel.appendChild(saveCheck);
        saveLabel.appendChild(document.createTextNode("Save these settings"));

        bottomRow.appendChild(settingsBtn);
        bottomRow.appendChild(submitBtn);
        bottomRow.appendChild(saveLabel);

        // Clear saved settings button — only shown when saved settings exist
        let clearBtn = null;
        function refreshClearBtn() {
          if (clearBtn && bottomRow.contains(clearBtn)) bottomRow.removeChild(clearBtn);
          clearBtn = null;
          if (hasSavedSettings()) {
            clearBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #f87171;background:#fff;color:#ef4444;font-size:12px;cursor:pointer;flex-shrink:0;" }, "Clear saved settings");
            clearBtn.onclick = () => { clearSavedSettings(); cfg = resolveConfig(); refreshClearBtn(); };
            bottomRow.appendChild(clearBtn);
          }
        }
        refreshClearBtn();

        card.appendChild(bottomRow);
        modal.appendChild(card);
        document.body.appendChild(modal);

        // ── Submit ────────────────────────────────────────────────────────
        submitBtn.onclick = async () => {
          const raw = textarea.value.trim();
          if (!raw) { alert("Please paste some IDs before building batches."); return; }

          if (saveCheck.checked) { saveSettings(cfg); refreshClearBtn(); }

          const { userToUser, transIds, ignored, total } = parseMixed(raw);
          if (!userToUser.length && !transIds.length) {
            alert("No valid IDs detected. Paste Trans_Id (8-10 digits) or User to User (20 digits) values.");
            return;
          }

          modal.remove();
          await runBatchBuild(cfg, userToUser, transIds, ignored, total);
        };

      } catch (e) {
        console.error(e);
        alert("Failed to run. Make sure you're running this from an active Nexidia session.");
      }
    })();
  }

  // ── Core batch build ─────────────────────────────────────────────────────
  async function runBatchBuild(cfg, userToUser, transIds, ignored, total) {
    const UI = makeProgressUI();
    const TARGET_CHARS = Math.floor(cfg.targetTokens * cfg.charsPerToken);

    UI.appendLog(`Input values: ${total}`);
    UI.appendLog(`Matched IDs: ${userToUser.length + transIds.length}`);
    if (ignored.length) UI.appendLog(`Ignored values: ${ignored.length}`);

    // ── Resolve IDs to calls ──────────────────────────────────────────────
    UI.setProgress(3, "Resolving IDs to calls...", "Running search");
    const filters = [];
    if (transIds.length) filters.push({ operator: "IN", type: "KEYWORD", parameterName: "UDFVarchar110", value: transIds });
    if (userToUser.length) filters.push({ operator: "IN", type: "KEYWORD", parameterName: "UDFVarchar1", value: userToUser });

    const searchPayload = {
      from: 0, to: cfg.searchTo,
      fields: ["sourceMediaId","recordeddate","UDFVarchar1","UDFVarchar110"],
      query: { operator: "AND", filters: [{ filterType: "interactions", filters }] }
    };

    const searchData = await fetchJson("https://apug01.nxondemand.com/NxIA/api-gateway/explore/api/v1.0/search", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(searchPayload)
    });

    const results = Array.isArray(searchData.results) ? searchData.results : [];
    if (!results.length) { UI.setProgress(0, "No results returned.", "No calls matched."); return; }
    UI.appendLog(`Calls returned: ${results.length}`);

    // ── Group results ─────────────────────────────────────────────────────
    const groups = new Map();
    for (const r of results) {
      const smid = r.sourceMediaId; if (!smid) continue;
      const u2u = (r.UDFVarchar1 || "").toString().trim();
      const tid = (r.UDFVarchar110 || "").toString().trim();
      const key = u2u || tid || `SMID_${smid}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }

    const items = [];
    for (const [key, arr] of groups.entries()) {
      arr.sort((a, b) => ((a.recordeddate || "").toString()).localeCompare((b.recordeddate || "").toString()));
      const seen = new Set(), uniqArr = [];
      for (const r of arr) { if (!seen.has(r.sourceMediaId)) { seen.add(r.sourceMediaId); uniqArr.push(r); } }
      const isSet = uniqArr.length > 1;
      uniqArr.forEach((r, idx) => {
        items.push({
          groupKey: key, isSet, setKey: isSet ? key : null,
          sourceMediaId: r.sourceMediaId,
          recordeddate: (r.recordeddate || "").toString(),
          transId: (r.UDFVarchar110 || "").toString(),
          userToUser: (r.UDFVarchar1 || "").toString(),
          leg: isSet ? (idx + 1) : null
        });
      });
    }

    UI.appendLog(`Transcript pulls: ${items.length}`);

    // ── "All" mode warnings ───────────────────────────────────────────────
    if (cfg.batchMode === "all") {
      if (items.length > 50) {
        const ok = confirm(
          `Batch files this size are not recommended if you're using them with Copilot. ` +
          `Copilot may omit information or produce unreliable results with very large inputs.\n\nDo you want to proceed?`
        );
        if (!ok) { UI.remove(); return; }
      }
      if (items.length > 500) {
        const ok = confirm(
          `Combining ${items.length} transcripts will create a very large file. ` +
          `Your browser or computer may encounter issues opening or processing this file.\n\nDo you want to proceed?`
        );
        if (!ok) { UI.remove(); return; }
      }
    }

    // ── Fetch transcripts ─────────────────────────────────────────────────
    UI.setProgress(8, "Fetching transcripts...", `0 / ${items.length}`);
    let cursor = 0;
    const out = new Array(items.length);
    const failed = [];

    async function fetchOne(it) {
      for (let attempt = 1; attempt <= cfg.fetchRetries; attempt++) {
        try {
          const payload = await getTranscriptBySmid(it.sourceMediaId, cfg);
          const text = cleanTranscript(payload, cfg);
          return { ok: true, text: text && text.trim() ? text : `NO TRANSCRIPT ROWS\nSMID:${it.sourceMediaId}` };
        } catch (e) {
          if (attempt === cfg.fetchRetries) return { ok: false, error: String(e) };
          await sleep(cfg.retryBackoffMs * attempt);
        }
      }
    }

    async function worker() {
      while (cursor < items.length) {
        const i = cursor++;
        const it = items[i];
        await sleep(cfg.delayMs);
        const res = await fetchOne(it);
        if (res.ok) {
          out[i] = { ...it, text: res.text, charCount: res.text.length };
        } else {
          out[i] = { ...it, text: `FAILED TO FETCH TRANSCRIPT\nSMID:${it.sourceMediaId}\nERROR:${res.error}`, charCount: 0, failed: true };
          failed.push(it);
        }
        const done = i + 1;
        if (done % 50 === 0 || done === items.length) {
          const pct = 8 + Math.floor((done / items.length) * 52);
          UI.setProgress(pct, "Fetching transcripts...", `${done} / ${items.length}\nFailed: ${failed.length}`);
          UI.appendLog(`Fetched ${done}/${items.length}`);
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(cfg.concurrency, items.length) }, () => worker()));
    UI.appendLog(`Fetch complete. Failed: ${failed.length}`);

    // ── Batch assembly ────────────────────────────────────────────────────
    UI.setProgress(62, "Batching...", "");

    let batches = [];

    if (cfg.batchMode === "all") {
      batches = [out.slice()];
    } else if (cfg.batchMode === "count") {
      for (let i = 0; i < out.length; i += cfg.countPerBatch) {
        batches.push(out.slice(i, i + cfg.countPerBatch));
      }
    } else {
      // Length-based batching (original logic)
      const sets = new Map(), singles = [];
      for (const it of out) {
        if (it.isSet) { if (!sets.has(it.setKey)) sets.set(it.setKey, []); sets.get(it.setKey).push(it); }
        else singles.push(it);
      }
      const setUnits = [...sets.entries()].map(([k, v]) => {
        v.sort((a, b) => (a.recordeddate || "").localeCompare(b.recordeddate || ""));
        return { key: k, items: v, first: v[0]?.recordeddate || "", chars: v.reduce((a, x) => a + (x.charCount || 0), 0) };
      }).sort((a, b) => a.first.localeCompare(b.first));
      singles.sort((a, b) => (a.recordeddate || "").localeCompare(b.recordeddate || ""));
      let sIdx = 0, curBatch = [], curChars = 0;
      const flush = () => { if (curBatch.length) { batches.push(curBatch); curBatch = []; curChars = 0; } };
      const addSingleIfFits = () => {
        if (sIdx >= singles.length) return false;
        const it = singles[sIdx];
        if (curBatch.length && (curChars + it.charCount > TARGET_CHARS)) return false;
        curBatch.push(it); curChars += it.charCount; sIdx++; return true;
      };
      for (const set of setUnits) {
        if (curBatch.length && (curChars + set.chars > TARGET_CHARS)) { while (addSingleIfFits()) {} flush(); }
        if (!curBatch.length && set.chars > TARGET_CHARS) { batches.push(set.items.slice()); continue; }
        curBatch.push(...set.items); curChars += set.chars;
        while (addSingleIfFits()) {} flush();
      }
      while (sIdx < singles.length) {
        if (curBatch.length && (curChars + singles[sIdx].charCount > TARGET_CHARS)) flush();
        while (addSingleIfFits()) {} flush();
      }
    }

    UI.appendLog(`Batches built: ${batches.length}`);

    // ── 10,000 file warning ───────────────────────────────────────────────
    const totalFiles = batches.length * cfg.copies;
    if (totalFiles > 10000) {
      const totalCharsEst = out.reduce((a, x) => a + (x.charCount || 0), 0) * cfg.copies;
      const sizeMB = (totalCharsEst / 1048576).toFixed(1);
      const sizeStr = parseFloat(sizeMB) >= 1000 ? (totalCharsEst / 1073741824).toFixed(2) + " GB" : sizeMB + " MB";
      const ok = confirm(
        `This download would be ${totalFiles.toLocaleString()} files at approximately ${sizeStr}. ` +
        `This is much larger than usual. We recommend confirming your request and double-checking you have it correct.\n\nPress OK to proceed.`
      );
      if (!ok) { UI.remove(); return; }
    }

    // ── Write batch files ─────────────────────────────────────────────────
    UI.setProgress(78, "Writing batch files...", "");

    const incWidth = cfg.fileIncrement.length;
    let startNum = parseInt(cfg.fileIncrement.replace(/^0+/, "") || "0", 10);
    if (isNaN(startNum)) startNum = 1;

    const batchFiles = [];

    //##> BATCHING CONFIG: targetTokens drives how transcripts are grouped into batch files
    //##> for downstream LLM processing. charsPerToken is a heuristic (3.5 chars = 1 token).
    //##> Batch size presets (Small/Medium/Large) are user-selectable via the settings UI.
    for (let bn = 0; bn < batches.length; bn++) {
      const b = batches[bn];
      const totalChars = b.reduce((a, x) => a + (x.charCount || 0), 0);
      const estTokens = Math.floor(totalChars / cfg.charsPerToken);

      const header = `===BATCH START===\nCreated=${new Date().toISOString()}\nTotalFiles=${b.length}\nTotalChars=${totalChars}\nEstimatedTokens=${estTokens}\n`;
      const notes = `Notes: Cleaned (<unk> removed, speakers abbreviated). [GAP X:XX] marks silences of ${cfg.gapThresholdSeconds}+ seconds.${cfg.showTimestamps ? " Timestamps included." : ""}\n\n`;

      let bodyText = header + notes;
      let cn = 0;
      for (const it of b) {
        cn++;
        const callLabel = String(cn).padStart(2, "0");
        const tk = it.charCount ? Math.floor(it.charCount / cfg.charsPerToken) : 0;
        bodyText += `===BEGIN CALL===\nCallNumber=${callLabel}\nSourceMediaId=${it.sourceMediaId}\nRecordedDate=${it.recordeddate}\nTrans_Id=${it.transId}\nUserToUser=${it.userToUser}\nCharCount=${it.charCount}\nEstimatedTokens=${tk}\n`;
        bodyText += (it.text || "").trim() + "\n";
        bodyText += `===END CALL===\nCallNumber=${callLabel}\nSourceMediaId=${it.sourceMediaId}\n\n`;
      }
      bodyText += `===BATCH END===\nTotalChars=${totalChars}\nEstimatedTokens=${estTokens}\n`;

      for (let c = 0; c < cfg.copies; c++) {
        const fname = buildFilename(cfg.fileBase, startNum + bn, incWidth, cfg.copies, c, cfg.fileSubIncrement) + ".txt";
        batchFiles.push({ name: fname, text: bodyText });
      }
    }

    // ── ZIP and download ──────────────────────────────────────────────────
    UI.setProgress(90, "Creating ZIP...", `Files: ${batchFiles.length}`);
    const zip = makeZip(batchFiles);
    const zipName = `nexidia_batches_${nowStamp()}.zip`;
    const blobUrl = URL.createObjectURL(zip);

    UI.appendLog(`ZIP READY: ${zipName}`);
    UI.appendLog(`Click "Download ZIP"`);
    UI.btnDownload.disabled = false;
    UI.btnDownload.style.opacity = "1";
    UI.btnDownload.onclick = () => {
      const a = document.createElement("a");
      a.href = blobUrl; a.download = zipName;
      document.body.appendChild(a); a.click(); a.remove();
      UI.appendLog("Download triggered.");
      UI.setProgress(100, "Done.", `ZIP: ${zipName}\nFailed: ${failed.length}\nBatches: ${batches.length}`);
    };
    UI.setProgress(96, "ZIP ready.", `Click Download ZIP.\nFailed: ${failed.length}\nBatches: ${batches.length}`);
  }

  api.registerTool({ id: "transcriptBatchBuilder", label: "Transcript Batch Builder", open: openTranscriptBatchBuilder });
})();
