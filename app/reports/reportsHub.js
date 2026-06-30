//[Last Update: 6:56 PM 6/29/2026]
//[Please confirm this timestamp in your response any time it was formed using this document!]
(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;
  const REPO_BASE = "https://raw.githubusercontent.com/SlugRice/Nexidia/main/";
  const REPORTS_CATALOG_URL = REPO_BASE + "reports.json";
  const BASE = "https://apug01.nxondemand.com";
  const SEARCH_URL = BASE + "/NxIA/api-gateway/explore/api/v1.0/search";
  const METADATA_URL = BASE + "/NxIA/api-gateway/explore/api/v1.0/metadata/fields/names";
  const PAGE_SIZE = 1000;
  const MAX_ROWS = 50000;
  const CAP_LIMIT = 10000;
  const MAX_SPLIT_DEPTH = 8;
  const MAX_SEGMENTS = 64;
  const CONCURRENCY = 50;
  const DELAY_MS = 20;
  const FETCH_RETRIES = 3;
  const RETRY_BACKOFF = 600;
  const ZERO_ROW_THRESHOLD = 10;
  const IDB_NAME = "nexidia_reports";
  const IDB_VERSION = 1;
  const JOB_AGE_LIMIT_MS = 30 * 24 * 60 * 60 * 1000;
  const DEFAULT_FILTER_STORAGES = ["UDFVarchar10", "siteName", "DNIS", "UDFVarchar110"];

  //##> Report modules register themselves here at load time.
  //##> The hub lazy-loads modules from the repo; once eval'd they call register().
  const reportDefs = {};
  const reportRegistry = {
    register(def) { reportDefs[def.id] = def; },
    get(id) { return reportDefs[id] || null; }
  };
  api.setShared("reportRegistry", reportRegistry);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
          if (!db.objectStoreNames.contains("segments")) {
            const s = db.createObjectStore("segments", { keyPath: ["jobId", "segmentHash"] });
            s.createIndex("byJob", "jobId", { unique: false });
          }
          if (!db.objectStoreNames.contains("transcripts")) {
            const t = db.createObjectStore("transcripts", { keyPath: ["jobId", "sourceMediaId"] });
            t.createIndex("byJob", "jobId", { unique: false });
          }
        };
        req.onsuccess = () => { _idbPromise = Promise.resolve(req.result); resolve(req.result); };
        req.onerror = () => { _idbPromise = null; reject(req.error); };
      });
    }
    return _idbPromise;
  }
  async function requestPersistence() {
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) {}
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
  async function idbDelete(store, key) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async function deleteJobCascade(jobId) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(["jobs", "segments", "transcripts"], "readwrite");
      tx.objectStore("jobs").delete(jobId);
      const segIdx = tx.objectStore("segments").index("byJob");
      const segCur = segIdx.openCursor(IDBKeyRange.only(jobId));
      segCur.onsuccess = (e) => {
        const c = e.target.result;
        if (c) { tx.objectStore("segments").delete(c.primaryKey); c.continue(); }
      };
      const trIdx = tx.objectStore("transcripts").index("byJob");
      const trCur = trIdx.openCursor(IDBKeyRange.only(jobId));
      trCur.onsuccess = (e) => {
        const c = e.target.result;
        if (c) { tx.objectStore("transcripts").delete(c.primaryKey); c.continue(); }
      };
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
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
    return `rptjob_${stamp}_${rand}`;
  }

  function stableStringify(o) {
    if (o === null || typeof o !== "object") return JSON.stringify(o);
    if (Array.isArray(o)) return "[" + o.map(stableStringify).join(",") + "]";
    const keys = Object.keys(o).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",") + "}";
  }
  function hashStr(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function computeSegmentHash(keywordGroup, dateFilter) {
    return hashStr(stableStringify({ k: keywordGroup || null, d: dateFilter || null }));
  }

  //##> Resume gate. Every check must pass for a job to appear in the resume modal.
  async function getReportResumeCandidates() {
    let jobs;
    try { jobs = await idbGetAll("jobs"); } catch (_) { return []; }
    if (!Array.isArray(jobs)) return [];
    const now = Date.now();
    const valid = [];
    for (const job of jobs) {
      if (!job || typeof job !== "object") continue;
      if (job.status !== "in-progress") continue;
      if (!job.id || typeof job.id !== "string") continue;
      if (!job.reportId || typeof job.reportId !== "string") continue;
      if (!job.dateFilter || typeof job.dateFilter !== "object") continue;
      if (typeof job.createdAt !== "number" || job.createdAt <= 0) continue;
      if ((now - job.createdAt) > JOB_AGE_LIMIT_MS) continue;
      valid.push(job);
    }
    valid.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    return valid;
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
  function hr() {
    return el("div", { style: "height:1px;background:#e5e7eb;margin:14px 0;" });
  }

  async function apiFetch(url, init) {
    const res = await fetch(url, init || { credentials: "include" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(res.status + " " + res.statusText + " :: " + body.slice(0, 200));
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) return res.json();
    const t = await res.text();
    try { return JSON.parse(t); } catch { return { raw: t }; }
  }

  function getTranscriptRows(payload) {
    return payload?.TranscriptRows || payload?.rows || payload?.transcriptRows || [];
  }

  function getFieldValue(rowObj, key) {
    if (!rowObj) return "";
    const want = String(key || "");
    if (!want) return "";
    if (rowObj[want] !== undefined && rowObj[want] !== null) return String(rowObj[want]);
    const lower = want.toLowerCase();
    const keys1 = Object.keys(rowObj);
    for (let i = 0; i < keys1.length; i++) {
      if (keys1[i].toLowerCase() === lower && rowObj[keys1[i]] !== null) return String(rowObj[keys1[i]]);
    }
    const containers = [rowObj.fields, rowObj.values, rowObj.data];
    for (let ci = 0; ci < containers.length; ci++) {
      const c = containers[ci];
      if (!c || typeof c !== "object") continue;
      if (c[want] !== undefined && c[want] !== null) return String(c[want]);
      const keys2 = Object.keys(c);
      for (let i = 0; i < keys2.length; i++) {
        if (keys2[i].toLowerCase() === lower && c[keys2[i]] !== null) return String(c[keys2[i]]);
      }
    }
    return "";
  }

  function splitValues(raw) {
    return String(raw || "")
      .replace(/\r\n/g, "\n")
      .replace(/\t/g, "\n")
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function safeRead(res) {
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const text = await res.text();
    if (ct.includes("application/json")) {
      try { return { json: JSON.parse(text), text }; } catch (_) { return { json: null, text }; }
    }
    return { json: null, text };
  }
  function pickRows(json) {
    if (!json) return [];
    if (Array.isArray(json.results)) return json.results;
    if (Array.isArray(json.items)) return json.items;
    if (Array.isArray(json.rows)) return json.rows;
    if (Array.isArray(json.data)) return json.data;
    if (json.result && Array.isArray(json.result.results)) return json.result.results;
    return [];
  }

  function countSplittableValues(kg) {
    if (!kg || !kg.filters) return 0;
    let max = 0;
    for (let i = 0; i < kg.filters.length; i++) {
      const f = kg.filters[i];
      if (f && f.type === "KEYWORD" && Array.isArray(f.value) && f.value.length > max) max = f.value.length;
    }
    return max;
  }
  function countDateDays(df) {
    if (!df || !df.value) return 0;
    const start = new Date(df.value.firstValue);
    const end = new Date(df.value.secondValue);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    return Math.floor((endDay - startDay) / (24 * 60 * 60 * 1000)) + 1;
  }
  function splitKeywordGroup(kg) {
    if (!kg || !kg.filters) return null;
    let targetIdx = -1, targetLen = 1;
    for (let i = 0; i < kg.filters.length; i++) {
      const f = kg.filters[i];
      if (f && f.type === "KEYWORD" && Array.isArray(f.value) && f.value.length > targetLen) {
        targetIdx = i; targetLen = f.value.length;
      }
    }
    if (targetIdx === -1) return null;
    const targetFilter = kg.filters[targetIdx];
    const vals = targetFilter.value;
    const mid = Math.ceil(vals.length / 2);
    function rebuild(newVals) {
      const newFilters = kg.filters.slice();
      newFilters[targetIdx] = Object.assign({}, targetFilter, { value: newVals });
      return Object.assign({}, kg, { filters: newFilters });
    }
    return [rebuild(vals.slice(0, mid)), rebuild(vals.slice(mid))];
  }
  function splitDateFilter(df) {
    if (!df || !df.value) return null;
    const start = new Date(df.value.firstValue);
    const end = new Date(df.value.secondValue);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const dayMs = 24 * 60 * 60 * 1000;
    const startDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    if (startDay.getTime() >= endDay.getTime()) return null;
    const totalDays = Math.round((endDay.getTime() - startDay.getTime()) / dayMs) + 1;
    if (totalDays < 2) return null;
    const halfDays = Math.floor(totalDays / 2);
    const midDay = new Date(startDay.getTime() + (halfDays - 1) * dayMs);
    const nextDay = new Date(startDay.getTime() + halfDays * dayMs);
    function fmt(d) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      return y + "-" + m + "-" + dd;
    }
    return [
      Object.assign({}, df, { value: { firstValue: fmt(startDay) + "T00:00:00Z", secondValue: fmt(midDay) + "T23:59:59Z" } }),
      Object.assign({}, df, { value: { firstValue: fmt(nextDay) + "T00:00:00Z", secondValue: fmt(endDay) + "T23:59:59Z" } })
    ];
  }
  function chooseSplit(kg, df) {
    const valCount = countSplittableValues(kg);
    const dayCount = countDateDays(df);
    const canValues = valCount >= 2;
    const canDate = dayCount >= 2;
    if (!canValues && !canDate) return null;
    if (canValues && !canDate) {
      const parts = splitKeywordGroup(kg);
      return parts ? parts.map(p => ({ kg: p, df })) : null;
    }
    if (!canValues && canDate) {
      const parts = splitDateFilter(df);
      return parts ? parts.map(p => ({ kg, df: p })) : null;
    }
    if (valCount >= dayCount) {
      const parts = splitKeywordGroup(kg);
      if (parts) return parts.map(p => ({ kg: p, df }));
      const parts2 = splitDateFilter(df);
      return parts2 ? parts2.map(p => ({ kg, df: p })) : null;
    } else {
      const parts = splitDateFilter(df);
      if (parts) return parts.map(p => ({ kg, df: p }));
      const parts2 = splitKeywordGroup(kg);
      return parts2 ? parts2.map(p => ({ kg: p, df })) : null;
    }
  }

  async function probeTotalResults(keywordGroup, dateFilter) {
    const interactionFilters = [];
    if (keywordGroup) interactionFilters.push(Object.assign({ disabled: false }, keywordGroup));
    const payload = {
      languageFilter: { languages: [] }, namedSetId: null,
      from: 0, to: 1, fields: ["UDFVarchar110"],
      query: {
        operator: "AND", invertOperator: false, disabled: false,
        filters: [
          { operator: "AND", invertOperator: false, filterType: "interactions", disabled: false, filters: interactionFilters },
          Object.assign({ disabled: false }, dateFilter)
        ]
      }
    };
    const res = await fetch(SEARCH_URL, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) return { total: 0, bailed: true };
    const sr = await safeRead(res);
    const total = sr.json && typeof sr.json.totalResults === "number" ? sr.json.totalResults : 0;
    const avail = sr.json && typeof sr.json.totalAvailableResults === "number" ? sr.json.totalAvailableResults : 0;
    const errReason = sr.json && sr.json.errorReason ? sr.json.errorReason : "";
    const bailed = (total === 0 && avail >= CAP_LIMIT) || !!errReason;
    return { total, bailed, errReason };
  }

  async function fetchSegmentPaged(keywordGroup, dateFilter, fields) {
    let from = 0;
    const setRows = [];
    while (true) {
      const interactionFilters = [];
      if (keywordGroup) interactionFilters.push(Object.assign({ disabled: false }, keywordGroup));
      const payload = {
        languageFilter: { languages: [] }, namedSetId: null,
        from, to: from + PAGE_SIZE, fields,
        query: {
          operator: "AND", invertOperator: false, disabled: false,
          filters: [
            { operator: "AND", invertOperator: false, filterType: "interactions", disabled: false, filters: interactionFilters },
            Object.assign({ disabled: false }, dateFilter)
          ]
        }
      };
      const res = await fetch(SEARCH_URL, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const sr = await safeRead(res);
        throw new Error("Search failed: HTTP " + res.status + "\n" + sr.text.slice(0, 300));
      }
      const sr = await safeRead(res);
      const rows = pickRows(sr.json);
      if (!rows.length) break;
      for (const r of rows) setRows.push(r);
      if (rows.length < PAGE_SIZE) break;
      if (setRows.length >= MAX_ROWS) break;
      from += PAGE_SIZE;
      await sleep(250);
    }
    return setRows;
  }

  async function executeReportSearch(jobId, keywordGroup, dateFilter, fields, UI) {
    const merged = new Map();
    const ctx = { segmentsCompleted: 0, estimatedSegments: 1, atomicCapWarned: false };
    const cachedSegments = new Map();
    try {
      const cachedList = await idbGetAllByIndex("segments", "byJob", jobId);
      for (const seg of cachedList) cachedSegments.set(seg.segmentHash, seg);
    } catch (_) {}

    function progressMeta() {
      return "Segments: " + ctx.segmentsCompleted + " of ~" + Math.max(ctx.estimatedSegments, ctx.segmentsCompleted) + " \u2022 Calls: " + merged.size;
    }
    async function persistSegment(segmentHash, rows) {
      try { await idbPut("segments", { jobId, segmentHash, rows, savedAt: Date.now() }); } catch (_) {}
    }
    async function bumpProgress() {
      try {
        await updateJob(jobId, {
          searchSegmentsCompleted: ctx.segmentsCompleted,
          searchSegmentsExpected: Math.max(ctx.estimatedSegments, ctx.segmentsCompleted)
        });
      } catch (_) {}
    }
    function showAtomicCapWarning() {
      if (ctx.atomicCapWarned) return;
      ctx.atomicCapWarned = true;
      setTimeout(() => {
        alert("A search segment hit the 10,000 result limit and could not be split further. Results from that segment are partial. To see more, narrow the search by shortening the date range or filtering more.");
      }, 0);
    }
    async function runWithSplit(kg, df, depth) {
      if (ctx.segmentsCompleted >= MAX_SEGMENTS) { showAtomicCapWarning(); return []; }
      const segHash = computeSegmentHash(kg, df);
      const cached = cachedSegments.get(segHash);
      if (cached && Array.isArray(cached.rows)) {
        ctx.segmentsCompleted++;
        await bumpProgress();
        return cached.rows;
      }
      const probe = await probeTotalResults(kg, df);
      if (probe.bailed) {
        ctx.segmentsCompleted++;
        await persistSegment(segHash, []);
        await bumpProgress();
        return [];
      }
      if (probe.total === 0) {
        ctx.segmentsCompleted++;
        await persistSegment(segHash, []);
        await bumpProgress();
        return [];
      }
      if (probe.total > CAP_LIMIT) {
        if (depth >= MAX_SPLIT_DEPTH) {
          UI.set(null, "Reached split depth limit. Pulling capped 10K...", progressMeta());
          const rows = await fetchSegmentPaged(kg, df, fields);
          ctx.segmentsCompleted++;
          await persistSegment(segHash, rows);
          await bumpProgress();
          showAtomicCapWarning();
          return rows;
        }
        const splits = chooseSplit(kg, df);
        if (!splits) {
          UI.set(null, "No further splits possible. Pulling capped 10K...", progressMeta());
          const rows = await fetchSegmentPaged(kg, df, fields);
          ctx.segmentsCompleted++;
          await persistSegment(segHash, rows);
          await bumpProgress();
          showAtomicCapWarning();
          return rows;
        }
        ctx.estimatedSegments += splits.length;
        UI.set(null, "Result count " + probe.total + " exceeds 10K. Splitting...", progressMeta());
        const out = [];
        for (const sub of splits) {
          const subRows = await runWithSplit(sub.kg, sub.df, depth + 1);
          for (const r of subRows) out.push(r);
        }
        return out;
      }
      const rows = await fetchSegmentPaged(kg, df, fields);
      ctx.segmentsCompleted++;
      await persistSegment(segHash, rows);
      await bumpProgress();
      return rows;
    }
    UI.set(10, "Searching...", progressMeta());
    const allRows = await runWithSplit(keywordGroup, dateFilter, 1);
    for (const r of allRows) {
      const smid = r.sourceMediaId;
      if (!smid || merged.has(smid)) continue;
      merged.set(smid, r);
    }
    return [...merged.values()];
  }

  //##> Per-call transcript fetch with API-first, SVC-fallback. A bad first call
  //##> no longer locks the entire run to a broken endpoint.
  async function fetchTranscriptForSmid(smid) {
    const apiUrl = BASE + "/NxIA/api/transcript/" + smid;
    const svcUrl = BASE + "/NxIA/Search/ClientServices/TranscriptService.svc/Transcripts/?SourceMediaId=" + smid + "&_=" + Date.now();
    try { return await apiFetch(apiUrl, { credentials: "include" }); }
    catch { return await apiFetch(svcUrl, { credentials: "include" }); }
  }

  function makeProgressUI(title) {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;top:20px;right:20px;z-index:999999;background:#0b1225;color:#e5e7eb;font-family:ui-monospace,Consolas,monospace;padding:14px 14px 12px;border-radius:10px;min-width:380px;max-width:520px;box-shadow:0 10px 30px rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.12);";
    const titleEl = document.createElement("div");
    titleEl.textContent = title || "Reports";
    titleEl.style.cssText = "font-size:14px;font-weight:700;color:#7dd3fc;margin-bottom:10px;";
    const closeBtn = document.createElement("div");
    closeBtn.textContent = "\u2715";
    closeBtn.style.cssText = "position:absolute;top:10px;right:12px;cursor:pointer;color:#94a3b8;font-size:16px;";
    const status = document.createElement("div");
    status.style.cssText = "font-size:12px;margin-bottom:6px;";
    const detail = document.createElement("div");
    detail.style.cssText = "font-size:11px;color:#94a3b8;white-space:pre-wrap;margin-bottom:10px;";
    const barWrap = document.createElement("div");
    barWrap.style.cssText = "height:10px;background:#070b14;border:1px solid rgba(255,255,255,0.10);border-radius:999px;overflow:hidden;";
    const bar = document.createElement("div");
    bar.style.cssText = "height:100%;width:0%;background:linear-gradient(90deg,#38bdf8,#a78bfa);transition:width 0.3s;";
    barWrap.appendChild(bar);
    overlay.appendChild(closeBtn);
    overlay.appendChild(titleEl);
    overlay.appendChild(status);
    overlay.appendChild(detail);
    overlay.appendChild(barWrap);
    document.body.appendChild(overlay);
    let closeHandler = () => overlay.remove();
    closeBtn.onclick = () => closeHandler();
    return {
      set(pct, msg, det) {
        if (pct !== null && pct !== undefined) bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
        if (msg !== undefined) status.textContent = msg;
        if (det !== undefined) detail.textContent = det;
      },
      onClose(fn) { closeHandler = fn; },
      remove() { try { overlay.remove(); } catch (_) {} }
    };
  }

  //##> Safeguard modal. Fires when ZERO_ROW_THRESHOLD transcripts in a row return
  //##> with no rows. Resume re-queues those Trans_IDs at the front and clears
  //##> their saved records so they get re-fetched. Closing abandons the run.
  function showZeroRowSafeguardModal(items, onResume, onAbandon) {
    const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1000010;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
    const box = el("div", { style: "background:#fff;width:540px;max-height:82vh;overflow-y:auto;border-radius:14px;padding:22px 24px 18px;box-shadow:0 10px 30px rgba(0,0,0,.35);position:relative;" });
    const closeBtn = el("button", { style: "position:absolute;top:14px;right:16px;border:0;background:#f3f4f6;color:#6b7280;width:26px;height:26px;border-radius:50%;font-size:13px;cursor:pointer;" }, "\u2715");
    closeBtn.onclick = () => { overlay.remove(); onAbandon(); };
    box.appendChild(closeBtn);
    box.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#111827;margin-bottom:6px;" }, "Possible Transcript Session Issue"));
    box.appendChild(el("div", { style: "font-size:12px;color:#6b7280;margin-bottom:14px;line-height:1.5;" },
      ZERO_ROW_THRESHOLD + " transcripts in a row came back with no content. This usually points to a transcript session problem rather than the calls themselves. Test the Trans_IDs below in another tab. If those calls have content, click Resume to retry these and continue. Closing this prompt stops the run, but progress is saved and the job can be resumed later from the Reports menu."
    ));
    const listWrap = el("div", { style: "background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin-bottom:10px;font-family:ui-monospace,Consolas,monospace;font-size:12px;color:#111827;max-height:240px;overflow-y:auto;" });
    for (const it of items) {
      const label = it.transId || "(no Trans_ID, SMID:" + it.sourceMediaId + ")";
      listWrap.appendChild(el("div", { style: "padding:3px 0;" }, label));
    }
    box.appendChild(listWrap);
    const copyRow = el("div", { style: "display:flex;gap:8px;margin-bottom:14px;" });
    const copyBtn = el("button", { style: "padding:6px 12px;border-radius:7px;border:1px solid #d1d5db;background:#fff;color:#374151;font-size:12px;cursor:pointer;" }, "Copy Trans_IDs");
    copyBtn.onclick = () => {
      const text = items.map(it => it.transId || it.sourceMediaId).join("\n");
      try {
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.textContent = "Copied";
          setTimeout(() => { copyBtn.textContent = "Copy Trans_IDs"; }, 1500);
        });
      } catch (_) {}
    };
    copyRow.appendChild(copyBtn);
    box.appendChild(copyRow);
    const btnRow = el("div", { style: "display:flex;gap:8px;" });
    const resumeBtn = el("button", { style: "flex:1;padding:10px;border-radius:8px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:13px;font-weight:600;cursor:pointer;" }, "Resume");
    resumeBtn.onclick = () => { overlay.remove(); onResume(); };
    btnRow.appendChild(resumeBtn);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function showReportResumeModal(candidates, catalog, onResume, onDiscardAll, onCancel) {
    const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1000005;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
    const box = el("div", { style: "background:#fff;width:560px;max-height:80vh;overflow-y:auto;border-radius:14px;padding:22px 24px 18px;box-shadow:0 10px 30px rgba(0,0,0,.35);position:relative;" });
    const closeBtn = el("button", { style: "position:absolute;top:14px;right:16px;border:0;background:#f3f4f6;color:#6b7280;width:26px;height:26px;border-radius:50%;font-size:13px;cursor:pointer;" }, "\u2715");
    closeBtn.onclick = () => { overlay.remove(); onCancel(); };
    box.appendChild(closeBtn);
    const title = candidates.length === 1 ? "Unfinished Report Detected" : candidates.length + " Unfinished Reports Detected";
    box.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#111827;margin-bottom:6px;" }, title));
    box.appendChild(el("div", { style: "font-size:12px;color:#6b7280;margin-bottom:14px;" },
      "Progress for the following report(s) was saved before the previous session ended. Resume to continue where it left off, or discard to start fresh."
    ));
    for (const job of candidates) {
      const reportEntry = catalog.find(c => c.id === job.reportId);
      const reportLabel = reportEntry ? reportEntry.label : job.reportId;
      const searchDone = job.searchSegmentsCompleted || 0;
      const searchTotal = job.searchSegmentsExpected || 0;
      const transcriptsDone = job.transcriptsCompleted || 0;
      const transcriptsTotal = job.totalCallsResolved || 0;
      let phaseLabel, pct;
      if (transcriptsTotal > 0) {
        phaseLabel = `Transcripts: ${transcriptsDone.toLocaleString()} / ${transcriptsTotal.toLocaleString()}`;
        pct = Math.min(100, Math.floor((transcriptsDone / transcriptsTotal) * 100));
      } else {
        phaseLabel = `Search: ${searchDone} / ${searchTotal || "?"} segments`;
        pct = searchTotal > 0 ? Math.min(100, Math.floor((searchDone / searchTotal) * 100)) : 0;
      }
      const created = new Date(job.createdAt);
      const updated = new Date(job.updatedAt || job.createdAt);
      const card = el("div", { style: "border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-bottom:10px;background:#f8fafc;" });
      const headerRow = el("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;" });
      headerRow.appendChild(el("div", { style: "font-size:13px;font-weight:600;color:#111827;" }, reportLabel));
      headerRow.appendChild(el("div", { style: "font-size:11px;color:#6b7280;" }, `${pct}%`));
      card.appendChild(headerRow);
      const barOuter = el("div", { style: "height:6px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin-bottom:8px;" });
      const barInner = el("div", { style: `height:100%;width:${pct}%;background:linear-gradient(90deg,#38bdf8,#a78bfa);` });
      barOuter.appendChild(barInner);
      card.appendChild(barOuter);
      const meta = el("div", { style: "font-size:11px;color:#6b7280;margin-bottom:8px;line-height:1.5;" });
      meta.appendChild(el("div", {}, phaseLabel));
      meta.appendChild(el("div", {}, `Started: ${created.toLocaleString()}`));
      meta.appendChild(el("div", {}, `Last update: ${updated.toLocaleString()}`));
      card.appendChild(meta);
      const btnRow = el("div", { style: "display:flex;gap:8px;" });
      const resumeBtn = el("button", { style: "flex:1;padding:7px;border-radius:7px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:12px;font-weight:600;cursor:pointer;" }, "Resume");
      const discardBtn = el("button", { style: "padding:7px 14px;border-radius:7px;border:1px solid #ef4444;background:#fff;color:#ef4444;font-size:12px;font-weight:600;cursor:pointer;" }, "Discard");
      resumeBtn.onclick = () => { overlay.remove(); onResume(job); };
      discardBtn.onclick = async () => {
        if (!confirm(`Discard this report and delete its saved progress?`)) return;
        try { await deleteJobCascade(job.id); } catch (_) {}
        card.remove();
        if (!box.querySelector("[data-job-card]")) { overlay.remove(); onDiscardAll(); }
      };
      card.dataset.jobCard = "1";
      btnRow.appendChild(resumeBtn);
      btnRow.appendChild(discardBtn);
      card.appendChild(btnRow);
      box.appendChild(card);
    }
    const skipRow = el("div", { style: "display:flex;justify-content:flex-end;margin-top:6px;" });
    const skipBtn = el("button", { style: "padding:7px 14px;border-radius:7px;border:1px solid #d1d5db;background:#fff;color:#6b7280;font-size:12px;cursor:pointer;" }, "Start new report instead");
    skipBtn.onclick = () => { overlay.remove(); onCancel(); };
    skipRow.appendChild(skipBtn);
    box.appendChild(skipRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function makeFieldPicker(metadataFields, defaultSn) {
    const wrapper = el("div", { style: "position:relative;flex:1;min-width:160px;" });
    const input = el("input", {
      type: "text", placeholder: "Search fields...",
      style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;"
    });
    const dropdown = el("div", {
      style: "display:none;position:absolute;top:100%;left:0;right:0;max-height:200px;overflow-y:auto;background:#fff;border:1px solid #ccc;border-top:none;border-radius:0 0 6px 6px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,.15);"
    });
    let hi = -1, vis = [];
    function render(q) {
      dropdown.innerHTML = ""; vis = []; hi = -1;
      const ql = q.toLowerCase().trim();
      const cur = input.dataset.storageName || "";
      const matches = metadataFields.filter((f) => {
        if (f.storageName === cur) return true;
        return ql ? f.displayName.toLowerCase().includes(ql) : true;
      });
      if (!matches.length) { dropdown.style.display = "none"; return; }
      for (let i = 0; i < Math.min(matches.length, 80); i++) {
        const f = matches[i];
        const item = el("div", { style: "padding:6px 10px;cursor:pointer;font-size:13px;border-bottom:1px solid #f0f0f0;" }, f.displayName);
        ((fi) => {
          item.onmouseenter = () => { for (let j = 0; j < vis.length; j++) vis[j].style.background = vis[j] === item ? "#e8f0fe" : ""; hi = vis.indexOf(item); };
          item.onmouseleave = () => { item.style.background = ""; };
          item.onmousedown = (e) => { e.preventDefault(); pick(fi); };
        })(f);
        dropdown.appendChild(item); vis.push(item);
      }
      dropdown.style.display = "block";
    }
    function pick(f) {
      input.value = f.displayName; input.dataset.storageName = f.storageName;
      dropdown.style.display = "none"; hi = -1;
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
    wrapper.appendChild(input); wrapper.appendChild(dropdown);
    if (defaultSn) {
      const f = metadataFields.find((x) => x.storageName === defaultSn);
      if (f) pick(f); else { input.value = defaultSn; input.dataset.storageName = defaultSn; }
    }
    return {
      wrapper, input,
      getStorageName: () => input.dataset.storageName || "",
      getDisplayName: () => input.value
    };
  }

  //##> Main transcript fetch + analyze phase. Tracks consecutive zero-row
  //##> payloads; on threshold, pauses workers and surfaces the safeguard modal.
  async function runTranscriptPhase(jobId, activeReport, reportConfig, items, progress) {
    const colPrefs = api.getShared("columnPrefs") || { fields: [], headers: [] };
    const existingRecords = await idbGetAllByIndex("transcripts", "byJob", jobId);
    const recordsBySmid = new Map(existingRecords.map(r => [r.sourceMediaId, r]));
    let alreadyDone = 0;
    for (const it of items) { if (recordsBySmid.has(it.sourceMediaId)) alreadyDone++; }

    let cursor = 0;
    let completed = alreadyDone;
    let failCount = 0;
    let zeroStreak = 0;
    let zeroStreakItems = [];
    let paused = false;
    let abandoned = false;
    let workersFinished = 0;
    let workerCount = 0;
    let resolveAll = null;
    const allDone = new Promise(r => { resolveAll = r; });

    function updateProgress() {
      const pct = 35 + Math.floor((completed / Math.max(1, items.length)) * 50);
      progress.set(Math.min(85, pct), "Fetching transcripts...",
        `${completed} / ${items.length}\nFailed: ${failCount}\nEmpty in a row: ${zeroStreak}`);
    }
    updateProgress();

    async function persistRecord(it, payloadOk, rowCount, analyzeResult, errorText) {
      try {
        await idbPut("transcripts", {
          jobId,
          sourceMediaId: it.sourceMediaId,
          transId: it.transId,
          payloadOk: !!payloadOk,
          rowCount: rowCount || 0,
          analyzeMatch: analyzeResult ? !!analyzeResult.match : false,
          analyzeData: analyzeResult ? analyzeResult.data : null,
          error: errorText || null,
          savedAt: Date.now()
        });
      } catch (_) {}
    }

    async function processOne(it) {
      const cached = recordsBySmid.get(it.sourceMediaId);
      if (cached) {
        if (cached.payloadOk && cached.rowCount > 0) {
          zeroStreak = 0; zeroStreakItems = [];
        } else if (cached.payloadOk && cached.rowCount === 0) {
          zeroStreak++; zeroStreakItems.push(it);
        }
        return;
      }
      let payload = null;
      let err = null;
      for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
        try { payload = await fetchTranscriptForSmid(it.sourceMediaId); break; }
        catch (e) {
          err = e;
          if (attempt === FETCH_RETRIES) break;
          await sleep(RETRY_BACKOFF * attempt);
        }
      }
      if (!payload) {
        failCount++;
        await persistRecord(it, false, 0, null, String(err));
        return;
      }
      const rows = getTranscriptRows(payload);
      const rowCount = rows.length;
      if (rowCount === 0) {
        zeroStreak++;
        zeroStreakItems.push(it);
        await persistRecord(it, true, 0, { match: false, data: {} }, null);
        return;
      }
      zeroStreak = 0;
      zeroStreakItems = [];
      let analyzeResult = null;
      try { analyzeResult = activeReport.analyze(payload, reportConfig); }
      catch (e) { analyzeResult = { match: false, data: {} }; }
      await persistRecord(it, true, rowCount, analyzeResult, null);
    }

    async function worker() {
      while (true) {
        if (abandoned) break;
        if (paused) { await sleep(150); continue; }
        if (cursor >= items.length) break;
        const i = cursor++;
        const it = items[i];
        await sleep(DELAY_MS);
        try { await processOne(it); } catch (_) { failCount++; }
        completed++;
        if (completed % 25 === 0 || completed === items.length) {
          try { await updateJob(jobId, { transcriptsCompleted: completed }); } catch (_) {}
          updateProgress();
        }
        if (zeroStreak >= ZERO_ROW_THRESHOLD && !paused && !abandoned) {
          paused = true;
          const flagged = zeroStreakItems.slice(0, ZERO_ROW_THRESHOLD);
          progress.set(null, "Paused: possible session issue.",
            `Awaiting user decision on ${flagged.length} flagged calls.`);
          showZeroRowSafeguardModal(
            flagged,
            async () => {
              //##> Resume: wipe cached records for the flagged items, rewind
              //##> cursor to the first flagged item so they retry.
              for (const f of flagged) {
                try { await idbDelete("transcripts", [jobId, f.sourceMediaId]); } catch (_) {}
                recordsBySmid.delete(f.sourceMediaId);
              }
              const firstSmid = flagged[0].sourceMediaId;
              const rewindIdx = items.findIndex(x => x.sourceMediaId === firstSmid);
              if (rewindIdx >= 0) {
                cursor = rewindIdx;
                completed = Math.max(0, completed - flagged.length);
                try { await updateJob(jobId, { transcriptsCompleted: completed }); } catch (_) {}
              }
              zeroStreak = 0;
              zeroStreakItems = [];
              paused = false;
              updateProgress();
            },
            () => {
              abandoned = true;
              paused = false;
            }
          );
        }
      }
      workersFinished++;
      if (workersFinished >= workerCount) resolveAll();
    }

    const remaining = items.length - alreadyDone;
    workerCount = Math.max(1, Math.min(CONCURRENCY, remaining || 1));
    const promises = [];
    for (let i = 0; i < workerCount; i++) promises.push(worker());
    await allDone;
    return { completed, failCount, abandoned };
  }

  async function buildAndDispatchResults(jobId, activeReport, items, dateFilter, progress) {
    const records = await idbGetAllByIndex("transcripts", "byJob", jobId);
    const bySmid = new Map(records.map(r => [r.sourceMediaId, r]));
    const matches = [];
    for (const it of items) {
      const rec = bySmid.get(it.sourceMediaId);
      if (!rec) continue;
      if (!rec.analyzeMatch) continue;
      matches.push({ smid: it.sourceMediaId, transId: it.transId, data: rec.analyzeData || {} });
    }
    if (!matches.length) {
      alert("No qualifying calls found.");
      progress.remove();
      return;
    }
    const reportDataMap = new Map();
    const qualifyingIds = [];
    for (const m of matches) {
      const tid = (m.transId || "").trim();
      if (!tid || tid === "0") continue;
      if (!reportDataMap.has(tid)) {
        reportDataMap.set(tid, m.data);
        qualifyingIds.push(tid);
      }
    }
    if (!qualifyingIds.length) {
      alert("Qualifying calls found but no valid Trans_IDs to look up.\n\nMatches: " + matches.length);
      progress.remove();
      return;
    }
    progress.set(88, "Running detail search...", qualifyingIds.length + " Trans_IDs");
    const colPrefs = api.getShared("columnPrefs") || { fields: [], headers: [] };
    const detailFields = colPrefs.fields.includes("sourceMediaId") ? colPrefs.fields.slice() : colPrefs.fields.concat(["sourceMediaId"]);
    if (!detailFields.includes("UDFVarchar110")) detailFields.push("UDFVarchar110");
    const detailKeywordGroup = {
      operator: "AND", invertOperator: false,
      filters: [{ operator: "IN", type: "KEYWORD", parameterName: "UDFVarchar110", value: qualifyingIds }]
    };
    const detailResults = await executeReportSearch(jobId + "_detail", detailKeywordGroup, dateFilter, detailFields, {
      set: (pct, msg, det) => {
        if (pct !== null && pct !== undefined) progress.set(Math.min(95, 88 + Math.floor(pct / 20)), msg, det);
        else progress.set(null, msg, det);
      }
    });
    if (!detailResults.length) {
      alert("Detail search returned no results.");
      progress.remove();
      return;
    }
    progress.set(96, "Preparing results...", detailResults.length + " rows");
    const cols = activeReport.columns || [];
    for (const row of detailResults) {
      const tid = getFieldValue(row, "UDFVarchar110").trim();
      const data = reportDataMap.get(tid);
      if (data) {
        for (const c of cols) {
          row["_report_" + c.key] = (data[c.key] || "").toString();
        }
      }
    }
    const formatted = detailResults.map((row) => ({ row, phrases: [] }));
    const fields = detailFields.slice();
    const headers = colPrefs.headers.slice();
    for (const c of cols) {
      const key = "_report_" + c.key;
      if (!fields.includes(key)) { fields.push(key); headers.push(c.label); }
    }
    api.setShared("columnPrefs", { fields: fields.slice(), headers: headers.slice() });
    api.setShared("lastSearchResult", {
      rows: formatted, fields, headers,
      maxPhraseCols: 1, includePhraseCol: false
    });
    try { await updateJob(jobId, { status: "complete" }); } catch (_) {}
    progress.remove();
    const dispatcher = api.listTools().find((t) => t.id === "dispatcher");
    if (dispatcher) { dispatcher.open(); }
    else { alert("Dispatcher not loaded. Check manifest."); }
  }

  async function resumeReportJob(job, catalog) {
    const entry = catalog.find(c => c.id === job.reportId);
    if (!entry) { alert("Report definition not found in catalog for: " + job.reportId); return; }
    if (!reportDefs[job.reportId] && entry.file) {
      try {
        const res = await fetch(REPO_BASE + entry.file + "?v=" + Date.now(), { credentials: "omit", cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const code = await res.text();
        (0, eval)(code);
      } catch (e) {
        alert("Failed to load report module: " + e.message);
        return;
      }
    }
    const activeReport = reportDefs[job.reportId];
    if (!activeReport) { alert("Report module not found after load: " + job.reportId); return; }
    const progress = makeProgressUI(entry.label + " (Resumed)");
    progress.set(8, "Resuming search...", "");
    const searchFields = job.searchFields && job.searchFields.length
      ? job.searchFields
      : ["sourceMediaId", "recordeddate", "UDFVarchar110", "UDFVarchar1", "recordedDateTime"];
    const searchRows = await executeReportSearch(job.id, job.keywordGroup || null, job.dateFilter, searchFields, {
      set: (pct, msg, det) => {
        if (pct !== null && pct !== undefined) progress.set(Math.min(30, 8 + Math.floor(pct / 5)), msg, det);
        else progress.set(null, msg, det);
      }
    });
    if (!searchRows.length) {
      alert("No results returned from search.");
      progress.remove();
      return;
    }
    const items = searchRows.map(r => ({
      sourceMediaId: r.sourceMediaId,
      transId: getFieldValue(r, "UDFVarchar110").trim()
    })).filter(it => it.sourceMediaId);
    try { await updateJob(job.id, { totalCallsResolved: items.length }); } catch (_) {}
    progress.set(35, "Fetching transcripts...", "0 / " + items.length);
    const result = await runTranscriptPhase(job.id, activeReport, job.reportConfig || {}, items, progress);
    if (result.abandoned) {
      progress.set(null, "Stopped. Progress saved.", "Reopen Reports to resume.");
      try { await updateJob(job.id, { status: "in-progress" }); } catch (_) {}
      return;
    }
    progress.set(86, "Analyzing transcripts...", "Building results");
    await buildAndDispatchResults(job.id, activeReport, items, job.dateFilter, progress);
  }

  function openReports() {
    (async () => {
      try {
        const isNexidiaPage =
          typeof window !== "undefined" &&
          typeof location !== "undefined" &&
          /nxondemand\.com/i.test(location.hostname) &&
          /\/NxIA\//i.test(location.pathname);
        if (!isNexidiaPage) {
          alert("Failed to run. Make sure you're running this from an active Nexidia session.");
          return;
        }
        await requestPersistence();

        let metadataFields = [];
        try {
          const res = await fetch(METADATA_URL, { credentials: "include", cache: "no-store" });
          if (res.ok) {
            const json = await res.json();
            metadataFields = Array.isArray(json) ? json.filter((f) => f.isEnabled !== false) : [];
          }
        } catch (_) {}
        let catalog = [];
        try {
          const mRes = await fetch(REPORTS_CATALOG_URL + "?v=" + Date.now(), { credentials: "omit", cache: "no-store" });
          if (mRes.ok) {
            const mJson = await mRes.json();
            catalog = Array.isArray(mJson.reports) ? mJson.reports : [];
          }
        } catch (_) {}

        const candidates = await getReportResumeCandidates();
        if (candidates.length > 0) {
          let userChoice = null;
          await new Promise((resolve) => {
            showReportResumeModal(
              candidates, catalog,
              (job) => { userChoice = { type: "resume", job }; resolve(); },
              () => { userChoice = { type: "fresh" }; resolve(); },
              () => { userChoice = { type: "fresh" }; resolve(); }
            );
          });
          if (userChoice && userChoice.type === "resume") {
            await resumeReportJob(userChoice.job, catalog);
            return;
          }
        }

        let activeReport = null;
        let configGetter = null;
        const filterRows = [];
        const modal = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
        const card = el("div", { style: "background:#f8fafc;width:720px;max-height:90vh;overflow-y:auto;border-radius:14px;padding:22px 24px;box-shadow:0 10px 30px rgba(0,0,0,.35);position:relative;" });
        const closeBtn = el("button", { style: "position:absolute;top:14px;right:16px;border:0;background:#f3f4f6;color:#6b7280;width:26px;height:26px;border-radius:50%;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;" }, "\u2715");
        closeBtn.onclick = () => modal.remove();
        card.appendChild(closeBtn);
        card.appendChild(el("div", { style: "font-size:18px;font-weight:700;color:#111827;margin-bottom:14px;" }, "Reports"));
        card.appendChild(hr());
        const selectWrap = el("div", { style: "margin-bottom:10px;" });
        selectWrap.appendChild(el("div", { style: "font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;" }, "Select a report"));
        const select = el("select", { style: "width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;background:#fff;cursor:pointer;" });
        const defaultOpt = el("option", { value: "" }, "\u2014 Choose a report \u2014");
        select.appendChild(defaultOpt);
        for (const entry of catalog) {
          select.appendChild(el("option", { value: entry.id }, entry.label));
        }
        selectWrap.appendChild(select);
        card.appendChild(selectWrap);
        const descArea = el("div", { style: "font-size:12px;color:#6b7280;line-height:1.5;margin-bottom:10px;min-height:18px;" });
        card.appendChild(descArea);
        const configArea = el("div", {});
        card.appendChild(configArea);
        card.appendChild(hr());
        card.appendChild(el("div", { style: "font-size:15px;font-weight:600;margin:10px 0;" }, "Date Range"));
        const dateRow = el("div", { style: "display:flex;gap:10px;align-items:flex-end;margin:8px 0;flex-wrap:wrap;" });
        const today = new Date();
        const monthAgo = new Date(today);
        monthAgo.setMonth(today.getMonth() - 1);
        const fromWrap = el("div", { style: "flex:1;min-width:200px;" });
        fromWrap.appendChild(el("div", { style: "font-size:12px;color:#444;margin-bottom:4px;" }, "From"));
        const fromInput = el("input", { type: "date", style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;" });
        fromInput.valueAsDate = monthAgo;
        fromWrap.appendChild(fromInput);
        const toWrap = el("div", { style: "flex:1;min-width:200px;" });
        toWrap.appendChild(el("div", { style: "font-size:12px;color:#444;margin-bottom:4px;" }, "To"));
        const toInput = el("input", { type: "date", style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;" });
        toInput.valueAsDate = today;
        toWrap.appendChild(toInput);
        dateRow.appendChild(fromWrap);
        dateRow.appendChild(toWrap);
        card.appendChild(dateRow);
        card.appendChild(hr());
        card.appendChild(el("div", { style: "font-size:15px;font-weight:600;margin:10px 0;" }, "Filters"));
        const filtersContainer = el("div", {});
        card.appendChild(filtersContainer);
        function addFilterRow(storageName) {
          const row = { picker: null, valueInput: null, rowEl: null };
          const removeBtn = el("button", { style: "width:22px;height:22px;border-radius:50%;border:1px solid #e5e7eb;background:#fff;color:#aaa;cursor:pointer;font-size:11px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;" }, "X");
          const picker = makeFieldPicker(metadataFields, storageName || "");
          const valueInput = el("input", {
            type: "text",
            placeholder: "Values (comma or line separated)",
            style: "flex:1;min-width:0;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;"
          });
          valueInput.addEventListener("paste", (e) => {
            try {
              const text = (e.clipboardData || window.clipboardData).getData("text");
              if (typeof text !== "string") return;
              const norm = text.replace(/\r\n/g, ",").replace(/\n/g, ",").replace(/\t/g, ",");
              if (norm !== text) {
                e.preventDefault();
                const s = valueInput.selectionStart != null ? valueInput.selectionStart : valueInput.value.length;
                const en = valueInput.selectionEnd != null ? valueInput.selectionEnd : valueInput.value.length;
                valueInput.value = valueInput.value.slice(0, s) + norm + valueInput.value.slice(en);
                valueInput.selectionStart = valueInput.selectionEnd = s + norm.length;
              }
            } catch (_) {}
          });
          const fieldLabel = el("div", {
            style: "flex:0 0 180px;padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;background:#f3f4f6;font-size:13px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;cursor:pointer;"
          });
          if (storageName) {
            const f = metadataFields.find((x) => x.storageName === storageName);
            fieldLabel.textContent = f ? f.displayName : storageName;
            fieldLabel.title = fieldLabel.textContent;
            picker.wrapper.style.display = "none";
          } else {
            fieldLabel.style.display = "none";
          }
          fieldLabel.onclick = () => {
            fieldLabel.style.display = "none";
            picker.wrapper.style.display = "block";
            picker.input.focus();
          };
          picker.input.addEventListener("blur", () => {
            setTimeout(() => {
              if (picker.getStorageName()) {
                const f = metadataFields.find((x) => x.storageName === picker.getStorageName());
                fieldLabel.textContent = f ? f.displayName : picker.getDisplayName();
                fieldLabel.title = fieldLabel.textContent;
                fieldLabel.style.display = "block";
                picker.wrapper.style.display = "none";
              }
            }, 160);
          });
          const rowEl = el("div", { style: "display:flex;gap:8px;align-items:center;margin:6px 0;" });
          rowEl.appendChild(removeBtn);
          rowEl.appendChild(fieldLabel);
          rowEl.appendChild(picker.wrapper);
          rowEl.appendChild(valueInput);
          row.picker = picker;
          row.valueInput = valueInput;
          row.rowEl = rowEl;
          filterRows.push(row);
          filtersContainer.appendChild(rowEl);
          removeBtn.onclick = () => {
            rowEl.remove();
            const idx = filterRows.indexOf(row);
            if (idx !== -1) filterRows.splice(idx, 1);
          };
          return row;
        }
        for (const sn of DEFAULT_FILTER_STORAGES) addFilterRow(sn);
        const addFilterBtn = el("button", { style: "margin-top:8px;padding:6px 12px;border-radius:8px;border:1px solid #3b82f6;background:#fff;color:#3b82f6;cursor:pointer;font-size:12px;" }, "+ Add Filter");
        addFilterBtn.onclick = () => { addFilterRow(""); };
        card.appendChild(addFilterBtn);
        card.appendChild(hr());
        const runBtn = el("button", {
          style: "width:100%;padding:12px;border-radius:12px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(59,130,246,0.4);letter-spacing:0.5px;"
        }, "Run Report");
        card.appendChild(runBtn);
        modal.appendChild(card);
        document.body.appendChild(modal);

        select.onchange = async () => {
          const id = select.value;
          configArea.innerHTML = "";
          descArea.textContent = "";
          activeReport = null;
          configGetter = null;
          if (!id) return;
          const entry = catalog.find((c) => c.id === id);
          if (entry) descArea.textContent = entry.description || "";
          if (!reportDefs[id] && entry && entry.file) {
            descArea.textContent = "Loading report module...";
            try {
              const fileUrl = REPO_BASE + entry.file + "?v=" + Date.now();
              const res = await fetch(fileUrl, { credentials: "omit", cache: "no-store" });
              if (!res.ok) throw new Error("HTTP " + res.status);
              const code = await res.text();
              (0, eval)(code);
            } catch (e) {
              descArea.textContent = "Failed to load report module: " + e.message;
              return;
            }
            descArea.textContent = entry.description || "";
          }
          const def = reportDefs[id];
          if (!def) { descArea.textContent = "Report module not found for id: " + id; return; }
          activeReport = def;
          if (def.buildConfig) configGetter = def.buildConfig(configArea, { el });
        };

        runBtn.onclick = async () => {
          if (!activeReport) { alert("Please select a report before running."); return; }
          const fromVal = fromInput.value;
          const toVal = toInput.value;
          if (!fromVal || !toVal) { alert("Please select both From and To dates."); return; }
          runBtn.disabled = true;
          runBtn.style.opacity = "0.5";
          const reportConfig = configGetter ? configGetter.getConfig() : {};
          modal.remove();
          const progress = makeProgressUI(activeReport.label);
          progress.set(5, "Preparing search...", "");

          const dateFilter = {
            parameterName: "recordedDateTime",
            operator: "BETWEEN",
            type: "DATE",
            value: { firstValue: fromVal + "T00:00:00Z", secondValue: toVal + "T23:59:59Z" }
          };
          const keywordFilters = [];
          const searchFields = ["sourceMediaId", "recordeddate", "UDFVarchar110", "UDFVarchar1", "recordedDateTime"];
          for (const fr of filterRows) {
            const sn = fr.picker.getStorageName();
            const raw = fr.valueInput.value.trim();
            if (!sn || !raw) continue;
            const vals = [...new Set(splitValues(raw))];
            if (!vals.length) continue;
            keywordFilters.push({ operator: "IN", type: "KEYWORD", parameterName: sn, value: vals });
            if (!searchFields.includes(sn)) searchFields.push(sn);
          }
          const keywordGroup = keywordFilters.length
            ? { operator: "AND", invertOperator: false, filters: keywordFilters }
            : null;

          const jobId = generateJobId();
          const jobRecord = {
            id: jobId,
            status: "in-progress",
            reportId: activeReport.id,
            reportConfig,
            dateFilter,
            keywordGroup,
            searchFields,
            searchSegmentsCompleted: 0,
            searchSegmentsExpected: 1,
            totalCallsResolved: 0,
            transcriptsCompleted: 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          try { await idbPut("jobs", jobRecord); } catch (_) {}

          progress.set(8, "Searching...", "");
          const searchRows = await executeReportSearch(jobId, keywordGroup, dateFilter, searchFields, {
            set: (pct, msg, det) => {
              if (pct !== null && pct !== undefined) progress.set(Math.min(30, 8 + Math.floor(pct / 5)), msg, det);
              else progress.set(null, msg, det);
            }
          });
          if (!searchRows.length) {
            alert("No results returned from search.");
            try { await deleteJobCascade(jobId); } catch (_) {}
            progress.remove();
            return;
          }
          const items = searchRows.map(r => ({
            sourceMediaId: r.sourceMediaId,
            transId: getFieldValue(r, "UDFVarchar110").trim()
          })).filter(it => it.sourceMediaId);
          try { await updateJob(jobId, { totalCallsResolved: items.length }); } catch (_) {}
          progress.set(35, "Fetching transcripts...", "0 / " + items.length);
          const result = await runTranscriptPhase(jobId, activeReport, reportConfig, items, progress);
          if (result.abandoned) {
            progress.set(null, "Stopped. Progress saved.", "Reopen Reports to resume.");
            try { await updateJob(jobId, { status: "in-progress" }); } catch (_) {}
            return;
          }
          progress.set(86, "Analyzing transcripts...", "Building results");
          await buildAndDispatchResults(jobId, activeReport, items, dateFilter, progress);
        };
      } catch (e) {
        console.error(e);
        alert("Failed to open Reports. Make sure you're running this from an active Nexidia session.");
      }
    })();
  }

  api.registerTool({ id: "reports", label: "Reports", open: openReports });
})();
