//[Last Update: 9:35 PM 6/24/2026]
//[Please confirm this timestamp in your response any time it was formed using this document!]
(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;
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
  const IDB_NAME = "nexidia_batch_builder";
  const IDB_VERSION = 1;
  const JOB_AGE_LIMIT_MS = 30 * 24 * 60 * 60 * 1000;
  let _idbPromise = null;
  function idb() {
    if (!_idbPromise) {
      _idbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("jobs")) {
            db.createObjectStore("jobs", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("transcripts")) {
            const ts = db.createObjectStore("transcripts", { keyPath: ["jobId", "sourceMediaId"] });
            ts.createIndex("byJob", "jobId", { unique: false });
          }
        };
        req.onsuccess = () => {
          _idbPromise = Promise.resolve(req.result);
          resolve(req.result);
        };
        req.onerror = () => { _idbPromise = null; reject(req.error); };
      });
    }
    return _idbPromise;
  }
  async function requestPersistence() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        await navigator.storage.persist();
      }
    } catch (_) {}
  }
  async function idbPut(store, value) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  }
  async function idbGet(store, key) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  async function idbGetAll(store) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });
  }
  async function idbGetAllByIndex(store, indexName, value) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).index(indexName).getAll(IDBKeyRange.only(value));
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });
  }
  async function deleteJobAndTranscripts(jobId) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(["jobs", "transcripts"], "readwrite");
      tx.objectStore("jobs").delete(jobId);
      const idx = tx.objectStore("transcripts").index("byJob");
      const cursorReq = idx.openCursor(IDBKeyRange.only(jobId));
      cursorReq.onsuccess = (e) => {
        const cur = e.target.result;
        if (cur) {
          tx.objectStore("transcripts").delete(cur.primaryKey);
          cur.continue();
        }
      };
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  }
  async function updateJob(jobId, patch) {
    const existing = await idbGet("jobs", jobId);
    if (!existing) return null;
    const next = Object.assign({}, existing, patch, { updatedAt: Date.now() });
    await idbPut("jobs", next);
    return next;
  }
  function generateJobId() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const rand = Math.random().toString(36).slice(2, 8);
    return `job_${stamp}_${rand}`;
  }
  //##> Resume-candidate gate. Every check below must pass for a job to be offered
  //##> as resumable. Any single failure silently drops the job from the prompt.
  async function getResumeCandidates() {
    let jobs;
    try { jobs = await idbGetAll("jobs"); } catch (_) { return []; }
    if (!Array.isArray(jobs)) return [];
    const now = Date.now();
    const valid = [];
    for (const job of jobs) {
      if (!job || typeof job !== "object") continue;
      if (job.status !== "in-progress") continue;
      if (!job.id || typeof job.id !== "string") continue;
      if (!job.cfg || typeof job.cfg !== "object") continue;
      if (!job.inputStorageName || typeof job.inputStorageName !== "string") continue;
      if (!Array.isArray(job.values) || job.values.length === 0) continue;
      if (typeof job.createdAt !== "number" || job.createdAt <= 0) continue;
      if ((now - job.createdAt) > JOB_AGE_LIMIT_MS) continue;
      if (typeof job.totalExpected === "number"
          && typeof job.completedCount === "number"
          && job.totalExpected > 0
          && job.completedCount >= job.totalExpected) {
        try { await updateJob(job.id, { status: "complete" }); } catch (_) {}
        continue;
      }
      valid.push(job);
    }
    valid.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    return valid;
  }
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
    fileSubIncrement: "a",
    outputFields: [{ storageName: "UDFVarchar110", displayName: "Trans_Id" }],
    zipFileName: "",
    autoDownload: false,
    keepAwake: true
  };
  const METADATA_URL = "https://apug01.nxondemand.com/NxIA/api-gateway/explore/api/v1.0/metadata/fields/names";
  const SEARCH_URL = "https://apug01.nxondemand.com/NxIA/api-gateway/explore/api/v1.0/search";
  const SEARCH_PAGE_SIZE = 1000;
  const SEARCH_CAP_LIMIT = 10000;
  const SEARCH_CHUNK_SIZE = 5000;
  const SEARCH_MAX_SPLIT_DEPTH = 10;
  const PINNED_NAMING = [
    { storageName: "UDFVarchar110", displayName: "Trans_Id" },
    { storageName: "UDFVarchar1", displayName: "User to User" },
    { storageName: "mediaFileName", displayName: "Media File Name" }
  ];
  const PINNED_INPUT = [
    { storageName: "UDFVarchar110", displayName: "Trans_Id" },
    { storageName: "UDFVarchar1", displayName: "User to User" },
    { storageName: "experienceId", displayName: "Experience ID" }
  ];
  const PAIR_STORAGE = new Set(["UDFVarchar1", "experienceId"]);
  const PAIR_DISPLAY = ["user to user", "experience id"];
  function isPairField(storageName, displayName) {
    if (PAIR_STORAGE.has(storageName)) return true;
    const dn = (displayName || "").toLowerCase();
    return PAIR_DISPLAY.some(p => dn.includes(p));
  }
  const PINNED_OUTPUT = [
    { storageName: "UDFVarchar110", displayName: "Trans_Id" },
    { storageName: "UDFVarchar1", displayName: "User to User" },
    { storageName: "recordeddate", displayName: "Recorded Date" }
  ];
  function resolveConfig(overrides) {
    return Object.assign({}, DEFAULTS, overrides || {});
  }
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
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function nowStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }
  function uniq(arr) { return [...new Set(arr)]; }
  function sanitizeFilename(name) {
    return name.replace(/[\\/:\*?"<>\|]/g, "_").trim() || "unnamed";
  }
  function resolveZipName(cfgName, fallback) {
    const raw = (cfgName || "").trim();
    if (!raw) return fallback;
    const cleaned = sanitizeFilename(raw);
    return cleaned.toLowerCase().endsWith(".zip") ? cleaned : cleaned + ".zip";
  }
  function parseValues(raw) {
    return [...new Set(raw.split(/[\r\n,\t]+/).map(s => s.trim()).filter(Boolean))];
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
      const tsRaw = r.TotalSecondsFromStart ?? r.totalSecondsFromStart;
      const tsParsed = (typeof tsRaw === "number") ? tsRaw : (typeof tsRaw === "string") ? parseFloat(tsRaw) : NaN;
      const ts = isNaN(tsParsed) ? null : tsParsed;
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
  function makeFieldPicker(metadataFields, pinnedList, defaultField) {
    const wrapper = el("div", { style: "position:relative;" });
    const input = el("input", { type: "text", placeholder: "Search fields...", style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;" });
    const dropdown = el("div", { style: "display:none;position:absolute;top:100%;left:0;right:0;max-height:220px;overflow-y:auto;background:#fff;border:1px solid #ccc;border-top:none;border-radius:0 0 6px 6px;z-index:1000010;box-shadow:0 4px 12px rgba(0,0,0,.15);" });
    let hi = -1, vis = [];
    const pinnedSet = new Set(pinnedList.map(p => p.storageName));
    function getOrderedFields(query) {
      const ql = query.toLowerCase().trim();
      const pinned = [];
      for (const p of pinnedList) {
        if (ql && !p.displayName.toLowerCase().includes(ql)) continue;
        const meta = metadataFields.find(f => f.storageName === p.storageName);
        pinned.push({ storageName: p.storageName, displayName: meta ? meta.displayName : p.displayName });
      }
      const rest = metadataFields.filter(f => {
        if (pinnedSet.has(f.storageName)) return false;
        return ql ? f.displayName.toLowerCase().includes(ql) : true;
      });
      return { pinned, rest };
    }
    function render(q) {
      dropdown.innerHTML = ""; vis = []; hi = -1;
      const { pinned, rest } = getOrderedFields(q);
      if (!pinned.length && !rest.length) { dropdown.style.display = "none"; return; }
      function addItem(f) {
        const item = el("div", { style: "padding:6px 10px;cursor:pointer;font-size:13px;border-bottom:1px solid #f0f0f0;" }, f.displayName);
        item.onmouseenter = () => { for (let j = 0; j < vis.length; j++) vis[j].style.background = vis[j] === item ? "#e8f0fe" : ""; hi = vis.indexOf(item); };
        item.onmouseleave = () => { item.style.background = ""; };
        item.onmousedown = (e) => { e.preventDefault(); pick(f); };
        dropdown.appendChild(item); vis.push(item);
      }
      for (const p of pinned) addItem(p);
      if (pinned.length && rest.length) {
        dropdown.appendChild(el("div", { style: "height:1px;background:#e5e7eb;margin:2px 0;" }));
      }
      for (let i = 0; i < Math.min(rest.length, 80); i++) addItem(rest[i]);
      dropdown.style.display = "block";
    }
    function pick(f) {
      input.value = f.displayName;
      input.dataset.storageName = f.storageName;
      dropdown.style.display = "none";
      hi = -1;
    }
    input.addEventListener("input", () => { delete input.dataset.storageName; render(input.value); });
    input.addEventListener("focus", () => { render(input.value); });
    input.addEventListener("blur", () => { setTimeout(() => { dropdown.style.display = "none"; }, 150); });
    input.addEventListener("keydown", (e) => {
      if (!vis.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); for (let i = 0; i < vis.length; i++) vis[i].style.background = ""; hi = Math.min(hi + 1, vis.length - 1); vis[hi].style.background = "#e8f0fe"; vis[hi].scrollIntoView({ block: "nearest" }); }
      else if (e.key === "ArrowUp") { e.preventDefault(); for (let i = 0; i < vis.length; i++) vis[i].style.background = ""; hi = Math.max(hi - 1, 0); vis[hi].style.background = "#e8f0fe"; vis[hi].scrollIntoView({ block: "nearest" }); }
      else if (e.key === "Enter") { e.preventDefault(); if (hi >= 0 && vis[hi]) vis[hi].onmousedown(e); }
      else if (e.key === "Escape") { dropdown.style.display = "none"; }
    });
    wrapper.appendChild(input);
    wrapper.appendChild(dropdown);
    const defaultMeta = metadataFields.find(f => f.storageName === defaultField.storageName);
    pick({ storageName: defaultField.storageName, displayName: defaultMeta ? defaultMeta.displayName : defaultField.displayName });
    return {
      wrapper, input,
      getStorageName: () => input.dataset.storageName || "",
      getDisplayName: () => input.value
    };
  }
  function openSettingsModal(currentCfg, metadataFields, onSave) {
    let draft = Object.assign({}, currentCfg);
    const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1000005;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
    const box = el("div", { style: "background:#fff;width:560px;max-height:88vh;overflow-y:auto;border-radius:14px;padding:22px 24px 18px;box-shadow:0 10px 30px rgba(0,0,0,.35);position:relative;" });
    box.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#111827;margin-bottom:4px;" }, "Batch Settings"));
    const closeBtn = el("button", { style: "position:absolute;top:14px;right:16px;border:0;background:#f3f4f6;color:#6b7280;width:26px;height:26px;border-radius:50%;font-size:13px;cursor:pointer;" }, "\u2715");
    closeBtn.onclick = () => overlay.remove();
    box.appendChild(closeBtn);
    box.appendChild(divider());
    box.appendChild(sectionHead("Batch Size"));
    const radioLength = el("input", { type: "radio", name: "batchMode", value: "length" });
    radioLength.checked = draft.batchMode === "length";
    const radioLengthRow = el("label", { style: "display:flex;align-items:center;gap:8px;font-size:13px;color:#111827;cursor:pointer;margin-bottom:8px;" });
    radioLengthRow.appendChild(radioLength);
    radioLengthRow.appendChild(document.createTextNode("Cap batches based on length of text"));
    radioLengthRow.appendChild(tooltip("Use this to optimize batches for Copilot prompts. Batches are split based on how much text they contain, so each batch fits within a predictable token range."));
    box.appendChild(radioLengthRow);
    const sliderArea = el("div", { style: "margin-left:22px;margin-bottom:10px;" + (draft.batchMode !== "length" ? "display:none;" : "") });
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
    const matchedPreset = PRESETS.findIndex(p => p.tokens === draft.targetTokens);
    slider.value = matchedPreset >= 0 ? matchedPreset : 1;
    const sliderTip = el("div", { style: "font-size:11px;color:#6b7280;margin-bottom:8px;" });
    function updateSliderTip(tokens) {
      const chars = Math.round(tokens * draft.charsPerToken).toLocaleString();
      sliderTip.textContent = `About ${chars} characters per batch`;
    }
    updateSliderTip(draft.targetTokens);
    slider.oninput = () => {
      const p = PRESETS[parseInt(slider.value)];
      if (p) { draft.targetTokens = p.tokens; customTokenInput.value = ""; updateSliderTip(p.tokens); }
    };
    sliderArea.appendChild(slider);
    sliderArea.appendChild(sliderTip);
    const customRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:4px;" });
    customRow.appendChild(el("span", { style: "font-size:12px;color:#374151;" }, "Custom token count:"));
    const customTokenInput = el("input", { type: "number", min: 1000, max: 100000, placeholder: "e.g. 20000", style: "width:100px;padding:5px 7px;border:1px solid #ccc;border-radius:6px;font-size:12px;" });
    if (matchedPreset < 0) customTokenInput.value = draft.targetTokens;
    const customTip = el("span", { style: "font-size:11px;color:#6b7280;" });
    function updateCustomTip(val) {
      if (!val) { customTip.textContent = ""; return; }
      const chars = Math.round(val * draft.charsPerToken).toLocaleString();
      customTip.textContent = `\u2248 ${chars} characters`;
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
    const radioCount = el("input", { type: "radio", name: "batchMode", value: "count" });
    radioCount.checked = draft.batchMode === "count";
    const radioCountRow = el("label", { style: "display:flex;align-items:center;gap:8px;font-size:13px;color:#111827;cursor:pointer;margin-bottom:8px;" });
    radioCountRow.appendChild(radioCount);
    radioCountRow.appendChild(document.createTextNode("Cap batches by count"));
    radioCountRow.appendChild(tooltip("Split batches by a fixed number of transcripts regardless of how long they are."));
    box.appendChild(radioCountRow);
    const countArea = el("div", { style: "margin-left:22px;margin-bottom:10px;" + (draft.batchMode !== "count" && draft.batchMode !== "all" ? "display:none;" : "") });
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
    function updateModeAreas() {
      sliderArea.style.display = draft.batchMode === "length" ? "" : "none";
      countArea.style.display = (draft.batchMode === "count" || draft.batchMode === "all") ? "" : "none";
    }
    radioLength.onchange = () => { if (radioLength.checked) { draft.batchMode = "length"; updateModeAreas(); } };
    radioCount.onchange = () => { if (radioCount.checked) { draft.batchMode = "count"; updateModeAreas(); } };
    box.appendChild(divider());
    box.appendChild(sectionHead("Transcript Formatting"));
    const gapRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:10px;" });
    const gapInput = el("input", { type: "number", min: 0, max: 600, value: draft.gapThresholdSeconds, style: "width:70px;padding:5px 7px;border:1px solid #ccc;border-radius:6px;font-size:12px;" });
    gapRow.appendChild(el("span", { style: "font-size:12px;color:#374151;" }, "Insert gap markers when silence exceeds"));
    gapRow.appendChild(gapInput);
    gapRow.appendChild(el("span", { style: "font-size:12px;color:#374151;" }, "seconds"));
    gapRow.appendChild(tooltip("Adds a [GAP X:XX] marker in the transcript when there is a long pause. Set to 0 to disable gap markers entirely."));
    box.appendChild(gapRow);
    const tsRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:6px;" });
    const tsCheck = el("input", { type: "checkbox" });
    tsCheck.checked = draft.showTimestamps;
    const tsLabel = el("label", { style: "display:flex;align-items:center;gap:8px;font-size:12px;color:#374151;cursor:pointer;" });
    tsLabel.appendChild(tsCheck);
    tsLabel.appendChild(document.createTextNode("Include timestamps in transcripts"));
    tsLabel.appendChild(tooltip("Adds a [M:SS] timestamp before each speaker turn. Useful when you need to reference specific moments in a call, but increases file size."));
    tsRow.appendChild(tsLabel);
    box.appendChild(tsRow);
    box.appendChild(divider());
    box.appendChild(sectionHead("Output Fields"));
    box.appendChild(el("div", { style: "font-size:11px;color:#6b7280;margin-bottom:8px;" }, "Choose which metadata fields appear in each transcript header."));
    const chipWrap = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;min-height:28px;" });
    function renderChips() {
      chipWrap.innerHTML = "";
      for (let ci = 0; ci < draft.outputFields.length; ci++) {
        const cf = draft.outputFields[ci];
        const chip = el("div", { style: "display:inline-flex;align-items:center;gap:4px;background:#e8f0fe;color:#1d4ed8;padding:4px 10px;border-radius:6px;font-size:12px;" });
        chip.appendChild(el("span", {}, cf.displayName));
        const removeBtn = el("span", { style: "cursor:pointer;font-size:14px;color:#6b7280;margin-left:2px;" }, "\u2715");
        ((idx) => { removeBtn.onclick = () => { draft.outputFields.splice(idx, 1); renderChips(); }; })(ci);
        chip.appendChild(removeBtn);
        chipWrap.appendChild(chip);
      }
    }
    renderChips();
    box.appendChild(chipWrap);
    const addFieldRow = el("div", { style: "display:flex;gap:6px;align-items:flex-start;" });
    const outputPicker = makeFieldPicker(metadataFields, PINNED_OUTPUT, { storageName: "", displayName: "" });
    outputPicker.input.value = "";
    outputPicker.input.placeholder = "Search fields to add...";
    addFieldRow.appendChild(el("div", { style: "flex:1;" }, outputPicker.wrapper));
    const addFieldBtn = el("button", { style: "padding:7px 14px;border-radius:6px;border:1px solid #3b82f6;background:#3b82f6;color:#fff;font-size:12px;cursor:pointer;white-space:nowrap;" }, "+ Add");
    addFieldBtn.onclick = () => {
      const sn = outputPicker.getStorageName();
      const dn = outputPicker.getDisplayName();
      if (!sn || !dn) return;
      if (draft.outputFields.some(f => f.storageName === sn)) return;
      draft.outputFields.push({ storageName: sn, displayName: dn });
      renderChips();
      outputPicker.input.value = "";
      delete outputPicker.input.dataset.storageName;
    };
    addFieldRow.appendChild(addFieldBtn);
    box.appendChild(addFieldRow);
    box.appendChild(divider());
    box.appendChild(sectionHead("File Naming"));
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
      return v.replace(/[\\/:\*?"<>\|]/g, "").trim() || "Batch";
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
    const zipNameRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:10px;" });
    zipNameRow.appendChild(el("span", { style: "font-size:12px;color:#374151;min-width:80px;" }, "ZIP filename:"));
    const zipNameInput = el("input", { type: "text", value: draft.zipFileName || "", placeholder: `nexidia_batches_${nowStamp()}.zip`, style: "flex:1;padding:5px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;" });
    zipNameInput.oninput = () => { draft.zipFileName = zipNameInput.value; };
    zipNameRow.appendChild(zipNameInput);
    zipNameRow.appendChild(tooltip("Custom name for the downloaded ZIP file. Leave blank to use the default systematic name shown in the placeholder. The .zip extension will be added automatically if you omit it."));
    box.appendChild(zipNameRow);
    box.appendChild(divider());
    box.appendChild(sectionHead("Behavior"));
    const autoDlRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:8px;" });
    const autoDlCheck = el("input", { type: "checkbox" });
    autoDlCheck.checked = !!draft.autoDownload;
    const autoDlLabel = el("label", { style: "display:flex;align-items:center;gap:8px;font-size:12px;color:#374151;cursor:pointer;" });
    autoDlLabel.appendChild(autoDlCheck);
    autoDlLabel.appendChild(document.createTextNode("Auto-download ZIP when ready"));
    autoDlLabel.appendChild(tooltip("Automatically trigger the ZIP download as soon as the job finishes. Useful for long unattended runs. Requires the tab to remain open."));
    autoDlRow.appendChild(autoDlLabel);
    box.appendChild(autoDlRow);
    const keepAwakeRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:8px;" });
    const keepAwakeCheck = el("input", { type: "checkbox" });
    keepAwakeCheck.checked = !!draft.keepAwake;
    const keepAwakeLabel = el("label", { style: "display:flex;align-items:center;gap:8px;font-size:12px;color:#374151;cursor:pointer;" });
    keepAwakeLabel.appendChild(keepAwakeCheck);
    keepAwakeLabel.appendChild(document.createTextNode("Keep screen awake during job"));
    keepAwakeLabel.appendChild(tooltip("Requests a screen wake lock and plays inaudible audio to discourage sleep. This may NOT prevent corporate idle-lock policies enforced by Windows. If your IT enforces lock at 15 min and ignores synthesized activity, a USB mouse jiggler is the only reliable workaround."));
    keepAwakeRow.appendChild(keepAwakeLabel);
    box.appendChild(keepAwakeRow);
    box.appendChild(divider());
    const fetchToggle = el("div", { style: "display:flex;align-items:center;gap:6px;margin-bottom:6px;" });
    const fetchLink = el("span", { style: "font-size:12px;color:#3b82f6;cursor:pointer;text-decoration:underline;" }, "Fetch Settings");
    fetchToggle.appendChild(fetchLink);
    fetchToggle.appendChild(tooltip("These settings control how transcripts are fetched from the Nexidia API. Only adjust these if you are troubleshooting fetch errors or performance issues."));
    box.appendChild(fetchToggle);
    const fetchArea = el("div", { style: "display:none;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:10px;" });
    fetchLink.onclick = () => { fetchArea.style.display = fetchArea.style.display === "none" ? "block" : "none"; };
    const fetchRefs = {};
    function fetchField(labelText, tipText, key, min, max) {
      const row = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:8px;" });
      const input = el("input", { type: "number", min, max, value: draft[key], style: "width:80px;padding:5px 7px;border:1px solid #ccc;border-radius:6px;font-size:12px;" });
      fetchRefs[key] = input;
      row.appendChild(el("span", { style: "font-size:12px;color:#374151;min-width:160px;" }, labelText));
      row.appendChild(input);
      if (tipText) row.appendChild(tooltip(tipText));
      return row;
    }
    fetchArea.appendChild(fetchField("Concurrency", "Number of transcript fetches running at the same time. Higher = faster but may trigger rate limiting.", "concurrency", 1, 100));
    fetchArea.appendChild(fetchField("Delay (ms)", "Milliseconds to wait between each worker picking up a new fetch. Lower = faster pipeline.", "delayMs", 0, 2000));
    fetchArea.appendChild(fetchField("Fetch retries", "How many times to retry a failed transcript fetch before giving up.", "fetchRetries", 0, 10));
    fetchArea.appendChild(fetchField("Retry backoff (ms)", "How long to wait before each retry attempt. Multiplied by the attempt number.", "retryBackoffMs", 0, 5000));
    box.appendChild(fetchArea);
    box.appendChild(divider());
    const saveBtn = el("button", {
      style: "width:100%;padding:10px;border-radius:10px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(59,130,246,0.35);"
    }, "Apply Settings");
    saveBtn.onclick = () => {
      draft.showTimestamps = tsCheck.checked;
      draft.autoDownload = autoDlCheck.checked;
      draft.keepAwake = keepAwakeCheck.checked;
      draft.zipFileName = zipNameInput.value;
      const gapVal = parseInt(gapInput.value);
      if (!isNaN(gapVal) && gapVal >= 0) draft.gapThresholdSeconds = gapVal;
      if (radioLength.checked) {
        draft.batchMode = "length";
        const cv = parseInt(customTokenInput.value);
        if (!isNaN(cv) && cv > 0) {
          draft.targetTokens = cv;
        } else {
          const si = parseInt(slider.value);
          if (si >= 0 && si < PRESETS.length) draft.targetTokens = PRESETS[si].tokens;
        }
      } else if (draft.batchMode !== "all") {
        draft.batchMode = "count";
      }
      const cntVal = parseInt(countInput.value);
      if (!isNaN(cntVal) && cntVal > 0) draft.countPerBatch = cntVal;
      for (const [key, inp] of Object.entries(fetchRefs)) {
        const v = parseInt(inp.value);
        if (!isNaN(v)) draft[key] = v;
      }
      onSave(draft);
      overlay.remove();
    };
    box.appendChild(saveBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }
//##> Keep-awake helpers. Best-effort only; corporate idle-lock policies may
  //##> ignore both wake lock and silent audio. Hardware mouse jiggler is the
  //##> only reliable workaround for strict GPO-enforced lock.
  function createKeepAwake() {
    let wakeLock = null;
    let audioCtx = null;
    let oscillator = null;
    let gainNode = null;
    let visibilityHandler = null;
    let active = false;
    async function acquireWakeLock() {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
          wakeLock.addEventListener("release", () => { wakeLock = null; });
        }
      } catch (_) { wakeLock = null; }
    }
    function startAudio() {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        audioCtx = new Ctx();
        oscillator = audioCtx.createOscillator();
        gainNode = audioCtx.createGain();
        gainNode.gain.value = 0.0001;
        oscillator.frequency.value = 20;
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
      } catch (_) {}
    }
    return {
      async start() {
        if (active) return;
        active = true;
        await acquireWakeLock();
        startAudio();
        visibilityHandler = async () => {
          if (document.visibilityState === "visible" && active && !wakeLock) {
            await acquireWakeLock();
          }
        };
        document.addEventListener("visibilitychange", visibilityHandler);
      },
      stop() {
        active = false;
        if (visibilityHandler) {
          document.removeEventListener("visibilitychange", visibilityHandler);
          visibilityHandler = null;
        }
        try { if (wakeLock) wakeLock.release(); } catch (_) {}
        wakeLock = null;
        try { if (oscillator) oscillator.stop(); } catch (_) {}
        try { if (audioCtx) audioCtx.close(); } catch (_) {}
        oscillator = null; gainNode = null; audioCtx = null;
      },
      isActive() { return active; }
    };
  }
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
    const btnBackToSearch = document.createElement("button");
    btnBackToSearch.textContent = "Back to Search";
    btnBackToSearch.style.cssText = "background:#3b82f6; color:#fff; border:0; padding:8px 10px; border-radius:8px; cursor:pointer; font-weight:700; display:none;";
    btnRow.appendChild(btnDownload);
    btnRow.appendChild(btnBackToSearch);
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
      btnBackToSearch,
      remove() { try { overlay.remove(); } catch (_) {} }
    };
  }
  //##> Chunked search: splits input value list into chunks and pages within each.
  //##> If a chunk's totalResults exceeds 10K (or the server bails on the probe),
  //##> the chunk is recursively split in half until under cap or single value.
  async function chunkedSearch(values, inputStorageName, searchFields, UI) {
    const merged = new Map();
    let segmentsDone = 0;
    let segmentsEst = Math.ceil(values.length / SEARCH_CHUNK_SIZE);
    function updateProgress(label) {
      const pct = Math.min(55, 3 + Math.floor((segmentsDone / Math.max(1, segmentsEst)) * 52));
      UI.setProgress(pct, label, `Segments: ${segmentsDone} of ~${Math.max(segmentsEst, segmentsDone)}\nCalls: ${merged.size}`);
    }
    async function probe(chunkValues) {
      const payload = {
        from: 0, to: 1, fields: ["sourceMediaId"],
        query: { operator: "AND", filters: [{ filterType: "interactions", filters: [{
          operator: "IN", type: "KEYWORD", parameterName: inputStorageName, value: chunkValues
        }] }] }
      };
      const res = await fetchJson(SEARCH_URL, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const total = (res && typeof res.totalResults === "number") ? res.totalResults : 0;
      const avail = (res && typeof res.totalAvailableResults === "number") ? res.totalAvailableResults : 0;
      const errReason = res && res.errorReason ? res.errorReason : "";
      const bailed = (total === 0 && avail >= SEARCH_CAP_LIMIT) || !!errReason;
      return { total, avail, bailed, errReason };
    }
    async function fetchPaged(chunkValues, knownTotal) {
      let from = 0;
      const ceiling = Math.min(knownTotal || SEARCH_CAP_LIMIT, SEARCH_CAP_LIMIT);
      while (from < ceiling) {
        const payload = {
          from, to: from + SEARCH_PAGE_SIZE, fields: searchFields,
          query: { operator: "AND", filters: [{ filterType: "interactions", filters: [{
            operator: "IN", type: "KEYWORD", parameterName: inputStorageName, value: chunkValues
          }] }] }
        };
        const res = await fetchJson(SEARCH_URL, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const rows = Array.isArray(res.results) ? res.results : [];
        if (!rows.length) break;
        for (const r of rows) {
          if (r && r.sourceMediaId && !merged.has(r.sourceMediaId)) {
            merged.set(r.sourceMediaId, r);
          }
        }
        if (rows.length < SEARCH_PAGE_SIZE) break;
        from += SEARCH_PAGE_SIZE;
      }
    }
    async function processChunk(chunkValues, depth) {
      if (!chunkValues.length) return;
      const p = await probe(chunkValues);
      if ((p.total > SEARCH_CAP_LIMIT || p.bailed) && chunkValues.length > 1 && depth < SEARCH_MAX_SPLIT_DEPTH) {
        segmentsEst++;
        const mid = Math.ceil(chunkValues.length / 2);
        await processChunk(chunkValues.slice(0, mid), depth + 1);
        await processChunk(chunkValues.slice(mid), depth + 1);
        return;
      }
      if (p.total === 0 && !p.bailed) {
        segmentsDone++;
        updateProgress("Searching...");
        return;
      }
      if (p.bailed && chunkValues.length === 1) {
        UI.appendLog(`Warning: server bailed on single value (depth ${depth}). Pulling capped 10K.`);
      }
      await fetchPaged(chunkValues, p.total);
      segmentsDone++;
      updateProgress("Searching...");
    }
    for (let i = 0; i < values.length; i += SEARCH_CHUNK_SIZE) {
      await processChunk(values.slice(i, i + SEARCH_CHUNK_SIZE), 0);
    }
    return [...merged.values()];
  }
  function showResumeModal(candidates, onResume, onDiscard, onCancel) {
    const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1000005;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
    const box = el("div", { style: "background:#fff;width:560px;max-height:80vh;overflow-y:auto;border-radius:14px;padding:22px 24px 18px;box-shadow:0 10px 30px rgba(0,0,0,.35);position:relative;" });
    const closeBtn = el("button", { style: "position:absolute;top:14px;right:16px;border:0;background:#f3f4f6;color:#6b7280;width:26px;height:26px;border-radius:50%;font-size:13px;cursor:pointer;" }, "\u2715");
    closeBtn.onclick = () => { overlay.remove(); onCancel(); };
    box.appendChild(closeBtn);
    const title = candidates.length === 1
      ? "Unfinished Job Detected"
      : `${candidates.length} Unfinished Jobs Detected`;
    box.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#111827;margin-bottom:6px;" }, title));
    box.appendChild(el("div", { style: "font-size:12px;color:#6b7280;margin-bottom:14px;" },
      "Progress for the following job(s) was saved before you closed the previous session. Resume to continue fetching only what's missing, or discard to start fresh."
    ));
    for (const job of candidates) {
      const total = job.totalExpected || 0;
      const done = job.completedCount || 0;
      const pct = total > 0 ? Math.floor((done / total) * 100) : 0;
      const created = new Date(job.createdAt);
      const updated = new Date(job.updatedAt || job.createdAt);
      const inputLabel = job.inputDisplayName || job.inputStorageName;
      const card = el("div", { style: "border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-bottom:10px;background:#f8fafc;" });
      const headerRow = el("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;" });
      headerRow.appendChild(el("div", { style: "font-size:13px;font-weight:600;color:#111827;" },
        `${done.toLocaleString()} / ${total.toLocaleString()} transcripts saved`));
      headerRow.appendChild(el("div", { style: "font-size:11px;color:#6b7280;" }, `${pct}%`));
      card.appendChild(headerRow);
      const barOuter = el("div", { style: "height:6px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin-bottom:8px;" });
      const barInner = el("div", { style: `height:100%;width:${pct}%;background:linear-gradient(90deg,#38bdf8,#a78bfa);` });
      barOuter.appendChild(barInner);
      card.appendChild(barOuter);
      const meta = el("div", { style: "font-size:11px;color:#6b7280;margin-bottom:8px;line-height:1.5;" });
      meta.appendChild(el("div", {}, `Input field: ${inputLabel}`));
      meta.appendChild(el("div", {}, `Input values: ${job.values.length.toLocaleString()}`));
      meta.appendChild(el("div", {}, `Started: ${created.toLocaleString()}`));
      meta.appendChild(el("div", {}, `Last update: ${updated.toLocaleString()}`));
      card.appendChild(meta);
      const btnRow = el("div", { style: "display:flex;gap:8px;" });
      const resumeBtn = el("button", { style: "flex:1;padding:7px;border-radius:7px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:12px;font-weight:600;cursor:pointer;" }, "Resume");
      const discardBtn = el("button", { style: "padding:7px 14px;border-radius:7px;border:1px solid #ef4444;background:#fff;color:#ef4444;font-size:12px;font-weight:600;cursor:pointer;" }, "Discard");
      resumeBtn.onclick = () => { overlay.remove(); onResume(job); };
      discardBtn.onclick = async () => {
        if (!confirm(`Discard this job and delete its ${done.toLocaleString()} saved transcript(s)?`)) return;
        try { await deleteJobAndTranscripts(job.id); } catch (_) {}
        card.remove();
        if (!box.querySelector("[data-job-card]")) { overlay.remove(); onDiscard(); }
      };
      card.dataset.jobCard = "1";
      btnRow.appendChild(resumeBtn);
      btnRow.appendChild(discardBtn);
      card.appendChild(btnRow);
      box.appendChild(card);
    }
    const skipRow = el("div", { style: "display:flex;justify-content:flex-end;margin-top:6px;" });
    const skipBtn = el("button", { style: "padding:7px 14px;border-radius:7px;border:1px solid #d1d5db;background:#fff;color:#6b7280;font-size:12px;cursor:pointer;" }, "Start new job instead");
    skipBtn.onclick = () => { overlay.remove(); onCancel(); };
    skipRow.appendChild(skipBtn);
    box.appendChild(skipRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }
  async function loadMetadataFields() {
    try {
      const mRes = await fetch(METADATA_URL, { credentials: "include", cache: "no-store" });
      if (mRes.ok) {
        const mJson = await mRes.json();
        return Array.isArray(mJson) ? mJson.filter(f => f.isEnabled !== false) : [];
      }
    } catch (_) {}
    return [];
  }
  //##> Back-to-search handler. Tries dispatcher first with the live result map,
  //##> falls back to a synthesized result from job items if no live result exists.
  function backToSearch(synthesizedResult) {
    const dispatcher = api.listTools().find(t => t.id === "dispatcher");
    const existing = api.getShared("lastSearchResult");
    if (!existing && synthesizedResult) {
      api.setShared("lastSearchResult", synthesizedResult);
    }
    if (dispatcher) {
      dispatcher.open();
      return true;
    }
    const search = api.listTools().find(t => t.id === "search");
    if (search) {
      api.setShared("returnToSearch", true);
      search.open();
      return true;
    }
    return false;
  }
  function synthesizeSearchResult(items, cfg) {
    const rows = items.map(it => ({
      row: {
        sourceMediaId: it.sourceMediaId,
        recordeddate: it.recordeddate,
        UDFVarchar110: it.transId,
        UDFVarchar1: it.userToUser,
        ...it.fieldValues
      },
      phrases: []
    }));
    const colPrefs = api.getShared("columnPrefs") || { fields: [], headers: [] };
    const fields = colPrefs.fields.length ? colPrefs.fields : ["sourceMediaId", "recordeddate", "UDFVarchar110", "UDFVarchar1"];
    const headers = colPrefs.headers.length ? colPrefs.headers : ["SMID", "Recorded Date", "Trans_Id", "User to User"];
    return { rows, fields, headers, maxPhraseCols: 1, includePhraseCol: false };
  }
  function openTranscriptBatchBuilder() {
    (async () => {
      try {
        await requestPersistence();
        const candidates = await getResumeCandidates();
        if (candidates.length > 0) {
          showResumeModal(
            candidates,
            (job) => { resumeJob(job); },
            () => { openInputModal(); },
            () => { openInputModal(); }
          );
          return;
        }
        openInputModal();
      } catch (e) {
        console.error(e);
        alert("Failed to run. Make sure you're running this from an active Nexidia session.");
      }
    })();
  }
  async function resumeJob(job) {
    try {
      const existingTranscripts = await idbGetAllByIndex("transcripts", "byJob", job.id);
      const alreadyFetched = new Set(existingTranscripts.map(t => t.sourceMediaId));
      await runBatchBuild(
        job.cfg,
        job.values,
        job.inputStorageName,
        job.inputDisplayName,
        job.singleFileConfig || { enabled: false },
        { jobId: job.id, alreadyFetched, resumed: true }
      );
    } catch (e) {
      console.error(e);
      alert("Failed to resume job. See console for details.");
    }
  }
  async function openInputModal() {
    let cfg = resolveConfig(loadSavedSettings());
    const metadataFields = await loadMetadataFields();
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
    const inputFieldRow = el("div", { style: "margin-bottom:10px;margin-top:10px;" });
    inputFieldRow.appendChild(el("div", { style: "font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;" }, "Input field:"));
    const inputPicker = makeFieldPicker(metadataFields, PINNED_INPUT, PINNED_INPUT[0]);
    inputFieldRow.appendChild(inputPicker.wrapper);
    card.appendChild(inputFieldRow);
    card.appendChild(el("div", { style: "font-size:12px;color:#6b7280;margin-bottom:10px;" },
      "Select the input field above, then paste values below. Separate with commas or line breaks. You can paste directly from Excel."
    ));
    const textarea = el("textarea", {
      rows: 6,
      placeholder: "Paste values here...",
      style: "width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;font-family:ui-monospace,Consolas,monospace;box-sizing:border-box;resize:vertical;margin-bottom:12px;"
    });
    card.appendChild(textarea);
    const preload = api.getShared("batchBuilderPreload");
    if (preload) {
      textarea.value = preload;
      api.setShared("batchBuilderPreload", null);
    }
    let singleFileEnabled = false;
    const namingPicker = makeFieldPicker(metadataFields, PINNED_NAMING, PINNED_NAMING[0]);
    const toggleRow = el("div", { style: "display:flex;align-items:center;gap:10px;margin-bottom:12px;" });
    const pill = el("div", { style: "width:36px;height:20px;border-radius:10px;background:#d1d5db;position:relative;cursor:pointer;transition:background .2s;" });
    const knob = el("div", { style: "width:14px;height:14px;border-radius:50%;background:#fff;position:absolute;top:3px;left:3px;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.2);" });
    pill.appendChild(knob);
    const toggleLabel = el("span", { style: "font-size:13px;color:#374151;user-select:none;cursor:pointer;" }, "Single File Export");
    toggleRow.appendChild(pill);
    toggleRow.appendChild(toggleLabel);
    const namingArea = el("div", { style: "display:none;padding:10px 12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:12px;" });
    namingArea.appendChild(el("div", { style: "font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;" }, "Name files using:"));
    namingArea.appendChild(namingPicker.wrapper);
    function toggleSingle() {
      singleFileEnabled = !singleFileEnabled;
      pill.style.background = singleFileEnabled ? "#3b82f6" : "#d1d5db";
      knob.style.left = singleFileEnabled ? "19px" : "3px";
      namingArea.style.display = singleFileEnabled ? "block" : "none";
      submitBtn.textContent = singleFileEnabled ? "Export Files" : "Build Batches";
    }
    pill.onclick = toggleSingle;
    toggleLabel.onclick = toggleSingle;
    card.appendChild(toggleRow);
    card.appendChild(namingArea);
    const bottomRow = el("div", { style: "display:flex;align-items:center;gap:8px;flex-wrap:wrap;" });
    const settingsBtn = el("button", { style: "padding:8px 14px;border-radius:8px;border:1px solid #6366f1;background:#fff;color:#6366f1;font-size:13px;cursor:pointer;font-weight:600;" }, "\u2699\uFE0F Batch Settings");
    settingsBtn.onclick = () => {
      openSettingsModal(cfg, metadataFields, (newCfg) => { cfg = newCfg; });
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
    submitBtn.onclick = async () => {
      const raw = textarea.value.trim();
      if (!raw) { alert("Please paste some values before building batches."); return; }
      if (saveCheck.checked) { saveSettings(cfg); refreshClearBtn(); }
      const values = parseValues(raw);
      if (!values.length) { alert("No valid values detected."); return; }
      const inputStorageName = inputPicker.getStorageName();
      const inputDisplayName = inputPicker.getDisplayName();
      if (!inputStorageName) { alert("Please select a valid input field from the dropdown."); return; }
      modal.remove();
      const singleFileConfig = { enabled: singleFileEnabled, namingField: namingPicker.getStorageName(), namingDisplay: namingPicker.getDisplayName() };
      await runBatchBuild(cfg, values, inputStorageName, inputDisplayName, singleFileConfig, null);
    };
  }
  async function runBatchBuild(cfg, values, inputStorageName, inputDisplayName, singleFileConfig, resumeContext) {
    const UI = makeProgressUI();
    const keepAwake = createKeepAwake();
    if (cfg.keepAwake) {
      await keepAwake.start();
      UI.appendLog("Keep-awake active (best effort)");
    }
    const TARGET_CHARS = Math.floor(cfg.targetTokens * cfg.charsPerToken);
    const pairingActive = isPairField(inputStorageName, inputDisplayName);
    const jobId = resumeContext?.jobId || generateJobId();
    const alreadyFetched = resumeContext?.alreadyFetched || new Set();
    const resumed = !!resumeContext?.resumed;
    UI.appendLog(resumed ? `Resuming job ${jobId}` : `Starting job ${jobId}`);
    UI.appendLog(`Input values: ${values.length}`);
    UI.appendLog(`Field: ${inputDisplayName} (${inputStorageName})`);
    if (pairingActive) UI.appendLog("Pairing: enabled");
    if (resumed) UI.appendLog(`Already saved: ${alreadyFetched.size}`);
    UI.setProgress(3, "Resolving values to calls...", "Running search");
    const searchFields = ["sourceMediaId", "recordeddate", "UDFVarchar1", "UDFVarchar110"];
    for (const outF of cfg.outputFields) { if (!searchFields.includes(outF.storageName)) searchFields.push(outF.storageName); }
    if (!searchFields.includes(inputStorageName)) searchFields.push(inputStorageName);
    if (singleFileConfig && singleFileConfig.enabled && singleFileConfig.namingField && !searchFields.includes(singleFileConfig.namingField)) {
      searchFields.push(singleFileConfig.namingField);
    }
    const results = await chunkedSearch(values, inputStorageName, searchFields, UI);
    if (!results.length) { UI.setProgress(0, "No results returned.", "No calls matched."); keepAwake.stop(); return; }
    UI.appendLog(`Calls returned: ${results.length}`);
    const groups = new Map();
    for (const r of results) {
      const smid = r.sourceMediaId; if (!smid) continue;
      let key;
      if (pairingActive) {
        const fieldVal = (r[inputStorageName] || "").toString().trim();
        key = fieldVal || `SMID_${smid}`;
      } else {
        key = `SMID_${smid}`;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    const items = [];
    for (const [key, arr] of groups.entries()) {
      arr.sort((a, b) => ((a.recordeddate || "").toString()).localeCompare((b.recordeddate || "").toString()));
      const seen = new Set(), uniqArr = [];
      for (const r of arr) { if (!seen.has(r.sourceMediaId)) { seen.add(r.sourceMediaId); uniqArr.push(r); } }
      const isSet = pairingActive && uniqArr.length > 1;
      uniqArr.forEach((r, idx) => {
        items.push({
          groupKey: key, isSet, setKey: isSet ? key : null,
          sourceMediaId: r.sourceMediaId,
          recordeddate: (r.recordeddate || "").toString(),
          transId: (r.UDFVarchar110 || "").toString(),
          userToUser: (r.UDFVarchar1 || "").toString(),
          leg: isSet ? (idx + 1) : null,
          namingValue: (singleFileConfig && singleFileConfig.enabled && singleFileConfig.namingField) ? (r[singleFileConfig.namingField] || "").toString().trim() : "",
          fieldValues: Object.fromEntries(cfg.outputFields.map(f => [f.storageName, (r[f.storageName] || "").toString()]))
        });
      });
    }
    UI.appendLog(`Transcript pulls: ${items.length}`);
    const jobRecord = {
      id: jobId,
      status: "in-progress",
      cfg,
      values,
      inputStorageName,
      inputDisplayName,
      singleFileConfig,
      totalExpected: items.length,
      completedCount: alreadyFetched.size,
      createdAt: resumed ? (await idbGet("jobs", jobId))?.createdAt || Date.now() : Date.now(),
      updatedAt: Date.now()
    };
    try { await idbPut("jobs", jobRecord); } catch (e) { UI.appendLog(`Warning: could not save job record: ${e.message}`); }
    if (cfg.batchMode === "all" && !resumed) {
      if (items.length > 50) {
        const ok = confirm(
          `Batch files this size are not recommended if you're using them with Copilot. ` +
          `Copilot may omit information or produce unreliable results with very large inputs.\n\nDo you want to proceed?`
        );
        if (!ok) { UI.remove(); keepAwake.stop(); try { await deleteJobAndTranscripts(jobId); } catch (_) {} return; }
      }
      if (items.length > 500) {
        const ok = confirm(
          `Combining ${items.length} transcripts will create a very large file. ` +
          `Your browser or computer may encounter issues opening or processing this file.\n\nDo you want to proceed?`
        );
        if (!ok) { UI.remove(); keepAwake.stop(); try { await deleteJobAndTranscripts(jobId); } catch (_) {} return; }
      }
    }
    const toFetch = items.filter(it => !alreadyFetched.has(it.sourceMediaId));
    UI.setProgress(58, "Fetching transcripts...", `0 / ${toFetch.length} (${alreadyFetched.size} already saved)`);
    let cursor = 0;
    const failed = [];
    let completedDelta = 0;
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
      while (cursor < toFetch.length) {
        const i = cursor++;
        const it = toFetch[i];
        await sleep(cfg.delayMs);
        const res = await fetchOne(it);
        const record = {
          jobId, sourceMediaId: it.sourceMediaId,
          text: res.ok ? res.text : `FAILED TO FETCH TRANSCRIPT\nSMID:${it.sourceMediaId}\nERROR:${res.error}`,
          charCount: res.ok ? res.text.length : 0,
          failed: !res.ok,
          meta: {
            groupKey: it.groupKey, isSet: it.isSet, setKey: it.setKey,
            recordeddate: it.recordeddate, transId: it.transId, userToUser: it.userToUser,
            leg: it.leg, namingValue: it.namingValue, fieldValues: it.fieldValues
          }
        };
        try { await idbPut("transcripts", record); } catch (e) { UI.appendLog(`IDB write failed for ${it.sourceMediaId}: ${e.message}`); }
        completedDelta++;
        if (!res.ok) failed.push(it);
        if (completedDelta % 25 === 0 || (i + 1) === toFetch.length) {
          const totalDone = alreadyFetched.size + completedDelta;
          try { await updateJob(jobId, { completedCount: totalDone }); } catch (_) {}
          const pct = 58 + Math.floor((completedDelta / Math.max(1, toFetch.length)) * 27);
          UI.setProgress(Math.min(85, pct), "Fetching transcripts...", `${completedDelta} / ${toFetch.length}\nTotal saved: ${totalDone}\nFailed: ${failed.length}`);
          UI.appendLog(`Fetched ${completedDelta}/${toFetch.length}`);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(cfg.concurrency, toFetch.length || 1) }, () => worker()));
    try { await updateJob(jobId, { completedCount: alreadyFetched.size + completedDelta }); } catch (_) {}
    UI.appendLog(`Fetch complete. Failed: ${failed.length}`);
    UI.setProgress(86, "Assembling output from saved transcripts...", "");
    const allRecords = await idbGetAllByIndex("transcripts", "byJob", jobId);
    const recordsBySmid = new Map(allRecords.map(rec => [rec.sourceMediaId, rec]));
    const out = items.map(it => {
      const rec = recordsBySmid.get(it.sourceMediaId);
      if (!rec) return { ...it, text: `NO RECORD\nSMID:${it.sourceMediaId}`, charCount: 0, failed: true };
      return { ...it, text: rec.text, charCount: rec.charCount, failed: rec.failed };
    });
    function attachBackToSearchHandler() {
      UI.btnBackToSearch.style.display = "inline-block";
      UI.btnBackToSearch.onclick = () => {
        const synthesized = synthesizeSearchResult(items, cfg);
        if (backToSearch(synthesized)) {
          UI.remove();
        } else {
          UI.appendLog("Could not find dispatcher or search tool.");
        }
      };
    }
    if (singleFileConfig && singleFileConfig.enabled) {
      UI.setProgress(88, "Building single files...", "");
      const singleFiles = [];
      const usedNames = new Map();
      for (const it of out) {
        let baseName = sanitizeFilename(it.namingValue || it.sourceMediaId);
        if (usedNames.has(baseName)) {
          const count = usedNames.get(baseName) + 1;
          usedNames.set(baseName, count);
          baseName = baseName + "_" + count;
        } else {
          usedNames.set(baseName, 1);
        }
        let body = "";
        for (const outF of cfg.outputFields) { body += outF.displayName + "=" + (it.fieldValues[outF.storageName] || "") + "\n"; }
        body += "CharCount=" + it.charCount + "\n\n";
        body += (it.text || "").trim() + "\n";
        singleFiles.push({ name: baseName + ".txt", text: body });
      }
      UI.setProgress(92, "Creating ZIP...", `Files: ${singleFiles.length}`);
      const zip = makeZip(singleFiles);
      const zipName = resolveZipName(cfg.zipFileName, `nexidia_singles_${nowStamp()}.zip`);
      const blobUrl = URL.createObjectURL(zip);
      UI.appendLog(`ZIP READY: ${zipName}`);
      UI.btnDownload.disabled = false;
      UI.btnDownload.style.opacity = "1";
      const triggerDownload = async () => {
        const a = document.createElement("a");
        a.href = blobUrl; a.download = zipName;
        document.body.appendChild(a); a.click(); a.remove();
        UI.appendLog("Download triggered.");
        try { await updateJob(jobId, { status: "complete" }); } catch (_) {}
        UI.setProgress(100, "Done.", `ZIP: ${zipName}\nFiles: ${singleFiles.length}\nFailed: ${failed.length}`);
        keepAwake.stop();
        attachBackToSearchHandler();
      };
      UI.btnDownload.onclick = triggerDownload;
      if (cfg.autoDownload) {
        UI.appendLog("Auto-downloading...");
        triggerDownload();
      } else {
        UI.appendLog(`Click "Download ZIP"`);
        UI.setProgress(96, "ZIP ready.", `Click Download ZIP.\nFiles: ${singleFiles.length}\nFailed: ${failed.length}`);
        attachBackToSearchHandler();
      }
      return;
    }
    UI.setProgress(88, "Batching...", "");
    let batches = [];
    if (cfg.batchMode === "all") {
      batches = [out.slice()];
    } else if (cfg.batchMode === "count") {
      for (let i = 0; i < out.length; i += cfg.countPerBatch) {
        batches.push(out.slice(i, i + cfg.countPerBatch));
      }
    } else {
      let curBatch = [], curChars = 0;
      const flush = () => { if (curBatch.length) { batches.push(curBatch); curBatch = []; curChars = 0; } };
      if (!pairingActive) {
        const sorted = out.slice().sort((a, b) => (a.recordeddate || "").localeCompare(b.recordeddate || ""));
        for (const it of sorted) {
          if (curBatch.length && curChars + it.charCount > TARGET_CHARS) flush();
          curBatch.push(it);
          curChars += it.charCount;
        }
        flush();
      } else {
        const sets = new Map(), singles = [];
        for (const it of out) {
          if (it.isSet) { if (!sets.has(it.setKey)) sets.set(it.setKey, []); sets.get(it.setKey).push(it); }
          else singles.push(it);
        }
        const pairUnits = [...sets.entries()].map(([k, v]) => {
          v.sort((a, b) => (a.recordeddate || "").localeCompare(b.recordeddate || ""));
          return { type: "pair", items: v, chars: v.reduce((a, x) => a + (x.charCount || 0), 0), date: v[0]?.recordeddate || "" };
        });
        const singleUnits = singles.map(s => ({ type: "single", items: [s], chars: s.charCount || 0, date: s.recordeddate || "" }));
        const allUnits = [...pairUnits, ...singleUnits].sort((a, b) => a.date.localeCompare(b.date));
        const skippedPairs = [];
        const tryPlaceSkipped = () => {
          let placed = true;
          while (placed && skippedPairs.length) {
            placed = false;
            for (let i = 0; i < skippedPairs.length; i++) {
              if (curChars + skippedPairs[i].chars <= TARGET_CHARS) {
                const [p] = skippedPairs.splice(i, 1);
                curBatch.push(...p.items);
                curChars += p.chars;
                placed = true;
                break;
              }
            }
          }
        };
        for (const unit of allUnits) {
          const fits = curBatch.length === 0 || curChars + unit.chars <= TARGET_CHARS;
          if (fits) {
            curBatch.push(...unit.items);
            curChars += unit.chars;
          } else if (unit.type === "pair") {
            skippedPairs.push(unit);
          } else {
            flush();
            tryPlaceSkipped();
            if (curChars + unit.chars > TARGET_CHARS) flush();
            curBatch.push(...unit.items);
            curChars += unit.chars;
          }
        }
        flush();
        for (const p of skippedPairs) {
          if (curBatch.length && curChars + p.chars > TARGET_CHARS) flush();
          curBatch.push(...p.items);
          curChars += p.chars;
        }
        flush();
      }
    }
    UI.appendLog(`Batches built: ${batches.length}`);
    const totalFiles = batches.length * cfg.copies;
    if (totalFiles > 10000) {
      const totalCharsEst = out.reduce((a, x) => a + (x.charCount || 0), 0) * cfg.copies;
      const sizeMB = (totalCharsEst / 1048576).toFixed(1);
      const sizeStr = parseFloat(sizeMB) >= 1000 ? (totalCharsEst / 1073741824).toFixed(2) + " GB" : sizeMB + " MB";
      const ok = confirm(
        `This download would be ${totalFiles.toLocaleString()} files at approximately ${sizeStr}. ` +
        `This is much larger than usual. We recommend confirming your request and double-checking you have it correct.\n\nPress OK to proceed.`
      );
      if (!ok) { UI.remove(); keepAwake.stop(); return; }
    }
    UI.setProgress(91, "Writing batch files...", "");
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
        bodyText += `===BEGIN CALL===\nCallNumber=${callLabel}\n`;
        for (const outF of cfg.outputFields) { bodyText += `${outF.displayName}=${it.fieldValues[outF.storageName] || ""}\n`; }
        bodyText += `CharCount=${it.charCount}\nEstimatedTokens=${tk}\n`;
        bodyText += (it.text || "").trim() + "\n";
        bodyText += `===END CALL===\nCallNumber=${callLabel}\n\n`;
      }
      bodyText += `===BATCH END===\nTotalChars=${totalChars}\nEstimatedTokens=${estTokens}\n`;
      for (let c = 0; c < cfg.copies; c++) {
        const fname = buildFilename(cfg.fileBase, startNum + bn, incWidth, cfg.copies, c, cfg.fileSubIncrement) + ".txt";
        batchFiles.push({ name: fname, text: bodyText });
      }
    }
    UI.setProgress(94, "Creating ZIP...", `Files: ${batchFiles.length}`);
    const zip = makeZip(batchFiles);
    const zipName = resolveZipName(cfg.zipFileName, `nexidia_batches_${nowStamp()}.zip`);
    const blobUrl = URL.createObjectURL(zip);
    UI.appendLog(`ZIP READY: ${zipName}`);
    UI.btnDownload.disabled = false;
    UI.btnDownload.style.opacity = "1";
    const triggerDownload = async () => {
      const a = document.createElement("a");
      a.href = blobUrl; a.download = zipName;
      document.body.appendChild(a); a.click(); a.remove();
      UI.appendLog("Download triggered.");
      try { await updateJob(jobId, { status: "complete" }); } catch (_) {}
      UI.setProgress(100, "Done.", `ZIP: ${zipName}\nFailed: ${failed.length}\nBatches: ${batches.length}`);
      keepAwake.stop();
      attachBackToSearchHandler();
    };
    UI.btnDownload.onclick = triggerDownload;
    if (cfg.autoDownload) {
      UI.appendLog("Auto-downloading...");
      triggerDownload();
    } else {
      UI.appendLog(`Click "Download ZIP"`);
      UI.setProgress(96, "ZIP ready.", `Click Download ZIP.\nFailed: ${failed.length}\nBatches: ${batches.length}`);
      attachBackToSearchHandler();
    }
  }
  api.registerTool({ id: "transcriptBatchBuilder", label: "Transcript Batch Builder", open: openTranscriptBatchBuilder });
})();
