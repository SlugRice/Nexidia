//[Last Update: 8/3/2026]
//##> Shared engine layer for reports. Exposes services via api.setShared:
//##>   jobStore          - IndexedDB job/segment/transcript persistence + resume
//##>   searchEngine      - probe / split / paginate / merge population + phrase runs
//##>   transcriptService - per-call transcript fetch + zero-row safeguard
//##> Reports read these; the reports hub stays thin. Nothing here renders report UI.
(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;

  const BASE = "https://apug01.nxondemand.com";
  const SEARCH_URL = BASE + "/NxIA/api-gateway/explore/api/v1.0/search";
  const PAGE_SIZE = 1000;
  const MAX_ROWS = 50000;
  const CAP_LIMIT = 10000;
  const MAX_SPLIT_DEPTH = 8;
  const MAX_SEGMENTS = 64;
  const FETCH_RETRIES = 3;
  const RETRY_BACKOFF = 600;
  const CONCURRENCY = 50;
  const DELAY_MS = 20;
  const ZERO_ROW_THRESHOLD = 10;
  const IDB_NAME = "nexidia_reports";
  const IDB_VERSION = 1;
  const JOB_AGE_LIMIT_MS = 30 * 24 * 60 * 60 * 1000;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  //##> ---- jobStore -----------------------------------------------------------
  let _idbPromise = null;
  function idb() {
    if (!_idbPromise) {
      _idbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("jobs")) db.createObjectStore("jobs", { keyPath: "id" });
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
  async function requestPersistence() { try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) {} }
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
      const segCur = tx.objectStore("segments").index("byJob").openCursor(IDBKeyRange.only(jobId));
      segCur.onsuccess = (e) => { const c = e.target.result; if (c) { tx.objectStore("segments").delete(c.primaryKey); c.continue(); } };
      const trCur = tx.objectStore("transcripts").index("byJob").openCursor(IDBKeyRange.only(jobId));
      trCur.onsuccess = (e) => { const c = e.target.result; if (c) { tx.objectStore("transcripts").delete(c.primaryKey); c.continue(); } };
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
  function generateJobId(prefix) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    return `${prefix || "rptjob"}_${stamp}_${Math.random().toString(36).slice(2, 8)}`;
  }
  function stableStringify(o) {
    if (o === null || typeof o !== "object") return JSON.stringify(o);
    if (Array.isArray(o)) return "[" + o.map(stableStringify).join(",") + "]";
    const keys = Object.keys(o).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",") + "}";
  }
  function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function computeSegmentHash(keywordGroup, phraseFilter, dateFilter, excludeGroup) {
    return hashStr(stableStringify({ k: keywordGroup || null, p: phraseFilter || null, d: dateFilter || null, e: excludeGroup || null }));
  }
  async function getResumeCandidates(reportId) {
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
      if (reportId && job.reportId !== reportId) continue;
      if (typeof job.createdAt !== "number" || job.createdAt <= 0) continue;
      if ((now - job.createdAt) > JOB_AGE_LIMIT_MS) continue;
      valid.push(job);
    }
    valid.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    return valid;
  }

  const jobStore = {
    requestPersistence, generateJobId, computeSegmentHash,
    put: idbPut, get: idbGet, getAll: idbGetAll, getAllByIndex: idbGetAllByIndex,
    delete: idbDelete, deleteJobCascade, updateJob, getResumeCandidates
  };
  api.setShared("jobStore", jobStore);

  //##> ---- shared payload helpers --------------------------------------------
  function normalizeParamName(p) {
    if (!p) return p;
    const s = String(p).trim();
    if (s.toLowerCase() === "experienceid") return "ExperienceId";
    if (s.toLowerCase() === "site") return "Site";
    if (s.toLowerCase() === "dnis") return "DNIS";
    const m = s.match(/udfvarchar(\d+)/i);
    if (m) return "UDFVarchar" + m[1];
    return s;
  }
  function normalizeKeywordValues(pn, vals) {
    if (normalizeParamName(pn) === "UDFVarchar120") return vals.map((v) => String(v).toLowerCase());
    return vals;
  }
  function buildKeywordFilter(pn, vals, op) {
    return {
      operator: op === "CONTAINS" ? "CONTAINS" : "IN",
      type: "KEYWORD",
      parameterName: normalizeParamName(pn),
      value: normalizeKeywordValues(pn, vals)
    };
  }
  function buildTextFilter(phrase, paramName) {
    return {
      operator: "IN",
      type: "TEXT",
      parameterName: paramName || "transcript",
      value: { phrases: [phrase], anotherPhrases: [], relevance: "Anywhere", position: "Begin" }
    };
  }
  function buildDateFilter(fromVal, toVal) {
    return {
      parameterName: "recordedDateTime", operator: "BETWEEN", type: "DATE",
      value: { firstValue: fromVal + "T00:00:00Z", secondValue: toVal + "T23:59:59Z" }
    };
  }
  //##> Numeric range filter (e.g. sentimentScore BETWEEN floor and ceiling).
  //##> firstValue/secondValue are raw numbers. Lives inside a keyword group's
  //##> filters array; the splitter ignores it (only KEYWORD filters split).
  function buildDecimalFilter(paramName, firstValue, secondValue) {
    return {
      operator: "BETWEEN", type: "DECIMAL",
      parameterName: normalizeParamName(paramName),
      value: { firstValue: firstValue, secondValue: secondValue }
    };
  }
  function getFieldValue(rowObj, key) {
    if (!rowObj) return "";
    const want = String(key || "");
    if (!want) return "";
    if (rowObj[want] !== undefined && rowObj[want] !== null) return String(rowObj[want]);
    const lower = want.toLowerCase();
    const keys1 = Object.keys(rowObj);
    for (let i = 0; i < keys1.length; i++) if (keys1[i].toLowerCase() === lower && rowObj[keys1[i]] !== null) return String(rowObj[keys1[i]]);
    const containers = [rowObj.fields, rowObj.values, rowObj.data];
    for (let ci = 0; ci < containers.length; ci++) {
      const c = containers[ci];
      if (!c || typeof c !== "object") continue;
      if (c[want] !== undefined && c[want] !== null) return String(c[want]);
      const keys2 = Object.keys(c);
      for (let i = 0; i < keys2.length; i++) if (keys2[i].toLowerCase() === lower && c[keys2[i]] !== null) return String(c[keys2[i]]);
    }
    return "";
  }

  //##> ---- searchEngine -------------------------------------------------------
  async function safeRead(res) {
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const text = await res.text();
    if (ct.includes("application/json")) { try { return { json: JSON.parse(text), text }; } catch (_) { return { json: null, text }; } }
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
    const start = new Date(df.value.firstValue), end = new Date(df.value.secondValue);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    return Math.floor((e - s) / 86400000) + 1;
  }
  function splitKeywordGroup(kg) {
    if (!kg || !kg.filters) return null;
    let idx = -1, len = 1;
    for (let i = 0; i < kg.filters.length; i++) {
      const f = kg.filters[i];
      if (f && f.type === "KEYWORD" && Array.isArray(f.value) && f.value.length > len) { idx = i; len = f.value.length; }
    }
    if (idx === -1) return null;
    const tf = kg.filters[idx], vals = tf.value, mid = Math.ceil(vals.length / 2);
    const rebuild = (nv) => { const nf = kg.filters.slice(); nf[idx] = Object.assign({}, tf, { value: nv }); return Object.assign({}, kg, { filters: nf }); };
    return [rebuild(vals.slice(0, mid)), rebuild(vals.slice(mid))];
  }
  function splitDateFilter(df) {
    if (!df || !df.value) return null;
    const start = new Date(df.value.firstValue), end = new Date(df.value.secondValue);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const dayMs = 86400000;
    const startDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    if (startDay.getTime() >= endDay.getTime()) return null;
    const totalDays = Math.round((endDay.getTime() - startDay.getTime()) / dayMs) + 1;
    if (totalDays < 2) return null;
    const halfDays = Math.floor(totalDays / 2);
    const midDay = new Date(startDay.getTime() + (halfDays - 1) * dayMs);
    const nextDay = new Date(startDay.getTime() + halfDays * dayMs);
    const fmt = (d) => d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
    return [
      Object.assign({}, df, { value: { firstValue: fmt(startDay) + "T00:00:00Z", secondValue: fmt(midDay) + "T23:59:59Z" } }),
      Object.assign({}, df, { value: { firstValue: fmt(nextDay) + "T00:00:00Z", secondValue: fmt(endDay) + "T23:59:59Z" } })
    ];
  }
  function chooseSplit(kg, df) {
    const vc = countSplittableValues(kg), dc = countDateDays(df);
    const cv = vc >= 2, cd = dc >= 2;
    if (!cv && !cd) return null;
    if (cv && !cd) { const p = splitKeywordGroup(kg); return p ? p.map(x => ({ kg: x, df })) : null; }
    if (!cv && cd) { const p = splitDateFilter(df); return p ? p.map(x => ({ kg, df: x })) : null; }
    if (vc >= dc) { const p = splitKeywordGroup(kg); if (p) return p.map(x => ({ kg: x, df })); const p2 = splitDateFilter(df); return p2 ? p2.map(x => ({ kg, df: x })) : null; }
    const p = splitDateFilter(df); if (p) return p.map(x => ({ kg, df: x })); const p2 = splitKeywordGroup(kg); return p2 ? p2.map(x => ({ kg: x, df })) : null;
  }

  //##> executeSearch: runSets is [{ keywordGroup, phraseGroups:[{group,display}] }].
  //##> Each phrase in a runSet expands to its own search AND'd with that runSet's
  //##> keyword group. Rows merge by Trans_Id; matched phrase labels accumulate on
  //##> each row (.phrases). env supplies { excludeGroup, jobId, signal, isCancelled,
  //##> onProgress, warnAtomicCap, transIdField }.
  async function executeSearch(runSets, baseFields, dateFilter, env) {
    env = env || {};
    const transIdField = env.transIdField || "UDFVarchar110";
    const excludeGroup = env.excludeGroup || null;
    const jobId = env.jobId || null;
    const signal = env.signal || null;
    const isCancelled = env.isCancelled || (() => false);
    const onProgress = env.onProgress || function () {};
    const warnAtomicCap = env.warnAtomicCap || function () {};

    const merged = new Map();
    const passthroughNoKey = [];
    const distinctPhraseLabels = new Set();
    const ctx = { segmentsCompleted: 0, estimatedSegments: 0, totalKept: 0, capWarned: false };

    const cachedSegments = new Map();
    if (jobId) {
      try { const list = await jobStore.getAllByIndex("segments", "byJob", jobId); for (const seg of list) cachedSegments.set(seg.segmentHash, seg); } catch (_) {}
    }
    function meta() { return "Segments: " + ctx.segmentsCompleted + " of ~" + Math.max(ctx.estimatedSegments, ctx.segmentsCompleted) + " \u2022 Rows: " + ctx.totalKept; }
    async function persistSegment(h, rows) { if (jobId) { try { await jobStore.put("segments", { jobId, segmentHash: h, rows, savedAt: Date.now() }); } catch (_) {} } }
    async function bump() { if (jobId) { try { await jobStore.updateJob(jobId, { searchSegmentsCompleted: ctx.segmentsCompleted, searchSegmentsExpected: Math.max(ctx.estimatedSegments, ctx.segmentsCompleted) }); } catch (_) {} } }

    async function probe(kg, pf, df) {
      if (isCancelled()) return { total: -1 };
      const ints = [];
      if (kg) ints.push(Object.assign({ disabled: false }, kg));
      if (pf) ints.push(Object.assign({ disabled: false }, pf));
      if (excludeGroup) ints.push(Object.assign({ disabled: false }, excludeGroup));
      const payload = { languageFilter: { languages: [] }, namedSetId: null, from: 0, to: 1, fields: [transIdField],
        query: { operator: "AND", invertOperator: false, disabled: false, filters: [
          { operator: "AND", invertOperator: false, filterType: "interactions", disabled: false, filters: ints },
          Object.assign({ disabled: false }, df) ] } };
      let res;
      try { res = await fetch(SEARCH_URL, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal }); }
      catch (err) { if (err.name === "AbortError") return { total: -1 }; throw err; }
      if (!res.ok) return { total: 0, bailed: true };
      const sr = await safeRead(res);
      const total = sr.json && typeof sr.json.totalResults === "number" ? sr.json.totalResults : 0;
      const avail = sr.json && typeof sr.json.totalAvailableResults === "number" ? sr.json.totalAvailableResults : 0;
      const errReason = sr.json && sr.json.errorReason ? sr.json.errorReason : "";
      return { total, bailed: (total === 0 && avail >= CAP_LIMIT) || !!errReason };
    }
    async function fetchSeg(kg, pf, df, label) {
      let from = 0; const rowsOut = [];
      while (true) {
        if (isCancelled()) return null;
        const ints = [];
        if (kg) ints.push(Object.assign({ disabled: false }, kg));
        if (pf) ints.push(Object.assign({ disabled: false }, pf));
        if (excludeGroup) ints.push(Object.assign({ disabled: false }, excludeGroup));
        const payload = { languageFilter: { languages: [] }, namedSetId: null, from, to: from + PAGE_SIZE, fields: baseFields,
          query: { operator: "AND", invertOperator: false, disabled: false, filters: [
            { operator: "AND", invertOperator: false, filterType: "interactions", disabled: false, filters: ints },
            Object.assign({ disabled: false }, df) ] } };
        api.setShared("lastSearchQuery", payload);
        let res;
        try { res = await fetch(SEARCH_URL, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal }); }
        catch (err) { if (err.name === "AbortError") return null; throw err; }
        if (!res.ok) { const sr = await safeRead(res); throw new Error("Search failed: HTTP " + res.status + "\n" + sr.text.slice(0, 300)); }
        const sr = await safeRead(res);
        const rows = pickRows(sr.json);
        if (!rows.length) break;
        for (let i = 0; i < rows.length; i++) rowsOut.push(rows[i]);
        onProgress(Math.min(80, 25 + Math.floor((ctx.segmentsCompleted / Math.max(1, ctx.estimatedSegments)) * 55)), label, meta());
        if (rows.length < PAGE_SIZE) break;
        if (rowsOut.length >= MAX_ROWS) break;
        from += PAGE_SIZE;
        await sleep(250);
      }
      return rowsOut;
    }
    async function runWithSplit(kg, pf, df, label, depth) {
      if (ctx.segmentsCompleted >= MAX_SEGMENTS) { if (!ctx.capWarned) { ctx.capWarned = true; warnAtomicCap(); } return []; }
      const h = computeSegmentHash(kg, pf, df, excludeGroup);
      const cached = cachedSegments.get(h);
      if (cached && Array.isArray(cached.rows)) { ctx.segmentsCompleted++; await bump(); return cached.rows; }
      const p = await probe(kg, pf, df);
      if (p.total === -1) return null;
      if (p.bailed || p.total === 0) { ctx.segmentsCompleted++; await persistSegment(h, []); await bump(); return []; }
      if (p.total > CAP_LIMIT) {
        const splits = depth >= MAX_SPLIT_DEPTH ? null : chooseSplit(kg, df);
        if (!splits) {
          onProgress(null, "Pulling capped 10K...", meta());
          const rows = await fetchSeg(kg, pf, df, label);
          if (rows === null) return null;
          ctx.segmentsCompleted++; await persistSegment(h, rows); await bump();
          if (!ctx.capWarned) { ctx.capWarned = true; warnAtomicCap(); }
          return rows;
        }
        ctx.estimatedSegments += splits.length;
        onProgress(null, "Result count " + p.total + " exceeds 10K. Splitting...", meta());
        const out = [];
        for (let i = 0; i < splits.length; i++) {
          const sub = await runWithSplit(splits[i].kg, pf, splits[i].df, label, depth + 1);
          if (sub === null) return null;
          for (let j = 0; j < sub.length; j++) out.push(sub[j]);
        }
        return out;
      }
      const rows = await fetchSeg(kg, pf, df, label);
      if (rows === null) return null;
      ctx.segmentsCompleted++; await persistSegment(h, rows); await bump();
      return rows;
    }

    for (let si = 0; si < runSets.length; si++) {
      const rs = runSets[si];
      ctx.estimatedSegments += (rs.phraseGroups && rs.phraseGroups.length) ? rs.phraseGroups.length : 1;
    }
    for (let si = 0; si < runSets.length; si++) {
      const rs = runSets[si];
      const expansions = (rs.phraseGroups && rs.phraseGroups.length) ? rs.phraseGroups : [{ group: null, display: null }];
      for (let ei = 0; ei < expansions.length; ei++) {
        const ex = expansions[ei];
        if (ex.display != null) distinctPhraseLabels.add(ex.display);
        const label = "Searching (" + (si + 1) + "/" + runSets.length + ")...";
        onProgress(25, label, meta());
        const rows = await runWithSplit(rs.keywordGroup, ex.group, dateFilter, label, 1);
        if (rows === null) return null;
        const rowLabel = ex.display != null ? ex.display : null;
        for (let ri = 0; ri < rows.length; ri++) {
          const r = rows[ri];
          const tidRaw = getFieldValue(r, transIdField);
          const tid = (tidRaw && tidRaw.trim() && tidRaw !== "0") ? tidRaw.trim() : null;
          if (!tid) { passthroughNoKey.push({ row: r, phrases: rowLabel != null ? [rowLabel] : [] }); continue; }
          const existing = merged.get(tid);
          if (!existing) { merged.set(tid, { row: r, phrases: rowLabel != null ? [rowLabel] : [] }); }
          else {
            if (rowLabel != null && !existing.phrases.includes(rowLabel)) existing.phrases.push(rowLabel);
            for (let fi = 0; fi < baseFields.length; fi++) {
              const k = baseFields[fi];
              const cur = getFieldValue(existing.row, k);
              if (cur && cur !== "0") continue;
              const nxt = getFieldValue(r, k);
              if (nxt && nxt !== "0") existing.row[k] = nxt;
            }
          }
        }
        ctx.totalKept = merged.size + passthroughNoKey.length;
        onProgress(Math.min(85, 25 + Math.floor((ctx.segmentsCompleted / Math.max(1, ctx.estimatedSegments)) * 55)), label, meta());
      }
    }
    if (isCancelled()) return null;
    const finalRows = [];
    let maxPhraseCols = 1;
    for (const v of merged.values()) { if (v.phrases.length > maxPhraseCols) maxPhraseCols = v.phrases.length; finalRows.push(v); }
    for (let i = 0; i < passthroughNoKey.length; i++) { if (passthroughNoKey[i].phrases.length > maxPhraseCols) maxPhraseCols = passthroughNoKey[i].phrases.length; finalRows.push(passthroughNoKey[i]); }
    return { finalRows, maxPhraseCols, includePhraseCol: distinctPhraseLabels.size >= 2 };
  }

  const searchEngine = {
    executeSearch, buildKeywordFilter, buildTextFilter, buildDateFilter, buildDecimalFilter,
    normalizeParamName, getFieldValue, CAP_LIMIT, MAX_ROWS
  };
  api.setShared("searchEngine", searchEngine);

  //##> ---- transcriptService --------------------------------------------------
  async function apiFetch(url, signal) {
    const res = await fetch(url, { credentials: "include", signal });
    if (!res.ok) { const body = await res.text().catch(() => ""); throw new Error(res.status + " " + res.statusText + " :: " + body.slice(0, 200)); }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) return res.json();
    const t = await res.text();
    try { return JSON.parse(t); } catch { return { raw: t }; }
  }
  async function fetchForSmid(smid, signal) {
    const apiUrl = BASE + "/NxIA/api/transcript/" + smid;
    const svcUrl = BASE + "/NxIA/Search/ClientServices/TranscriptService.svc/Transcripts/?SourceMediaId=" + smid + "&_=" + Date.now();
    try { return await apiFetch(apiUrl, signal); } catch { return await apiFetch(svcUrl, signal); }
  }
  function getTranscriptRows(payload) { return (payload && (payload.TranscriptRows || payload.rows || payload.transcriptRows)) || []; }

  //##> runTranscriptPhase: fetches transcripts for items [{sourceMediaId, transId}],
  //##> calls opts.analyze(payload, config) per call, persists results under jobId,
  //##> and fires opts.onSafeguard(flaggedItems, resume, abandon) after 10 empty in a
  //##> row. Resumable: cached transcript records are skipped. Returns {abandoned}.
  async function runTranscriptPhase(items, opts) {
    opts = opts || {};
    const jobId = opts.jobId;
    const analyze = opts.analyze || (() => ({ match: false, data: {} }));
    const config = opts.config || {};
    const onProgress = opts.onProgress || function () {};
    const onSafeguard = opts.onSafeguard || null;
    const signal = opts.signal || null;

    const existing = jobId ? await jobStore.getAllByIndex("transcripts", "byJob", jobId) : [];
    const bySmid = new Map(existing.map(r => [r.sourceMediaId, r]));
    let completed = 0; for (const it of items) if (bySmid.has(it.sourceMediaId)) completed++;
    let cursor = 0, failCount = 0, zeroStreak = 0, zeroItems = [], paused = false, abandoned = false;
    let workersFinished = 0, workerCount = 0, resolveAll = null;
    const allDone = new Promise(r => { resolveAll = r; });

    function update() {
      const pct = 35 + Math.floor((completed / Math.max(1, items.length)) * 50);
      onProgress(Math.min(85, pct), "Fetching transcripts...", `${completed} / ${items.length}\nFailed: ${failCount}\nEmpty in a row: ${zeroStreak}`);
    }
    update();
    async function persist(it, ok, rowCount, analyzeResult, err) {
      if (!jobId) return;
      try { await jobStore.put("transcripts", { jobId, sourceMediaId: it.sourceMediaId, transId: it.transId, payloadOk: !!ok, rowCount: rowCount || 0, analyzeMatch: analyzeResult ? !!analyzeResult.match : false, analyzeData: analyzeResult ? analyzeResult.data : null, error: err || null, savedAt: Date.now() }); } catch (_) {}
    }
    async function processOne(it) {
      const cached = bySmid.get(it.sourceMediaId);
      if (cached) {
        if (cached.payloadOk && cached.rowCount > 0) { zeroStreak = 0; zeroItems = []; }
        else if (cached.payloadOk && cached.rowCount === 0) { zeroStreak++; zeroItems.push(it); }
        return;
      }
      let payload = null, err = null;
      for (let a = 1; a <= FETCH_RETRIES; a++) {
        try { payload = await fetchForSmid(it.sourceMediaId, signal); break; }
        catch (e) { err = e; if (a === FETCH_RETRIES) break; await sleep(RETRY_BACKOFF * a); }
      }
      if (!payload) { failCount++; await persist(it, false, 0, null, String(err)); return; }
      const rows = getTranscriptRows(payload);
      if (rows.length === 0) { zeroStreak++; zeroItems.push(it); await persist(it, true, 0, { match: false, data: {} }, null); return; }
      zeroStreak = 0; zeroItems = [];
      let ar = null;
      try { ar = analyze(payload, config); } catch (_) { ar = { match: false, data: {} }; }
      await persist(it, true, rows.length, ar, null);
    }
    async function worker() {
      while (true) {
        if (abandoned) break;
        if (paused) { await sleep(150); continue; }
        if (cursor >= items.length) break;
        const it = items[cursor++];
        await sleep(DELAY_MS);
        try { await processOne(it); } catch (_) { failCount++; }
        completed++;
        if (completed % 25 === 0 || completed === items.length) { if (jobId) { try { await jobStore.updateJob(jobId, { transcriptsCompleted: completed }); } catch (_) {} } update(); }
        if (zeroStreak >= ZERO_ROW_THRESHOLD && !paused && !abandoned && onSafeguard) {
          paused = true;
          const flagged = zeroItems.slice(0, ZERO_ROW_THRESHOLD);
          onSafeguard(flagged,
            async () => {
              for (const f of flagged) { try { await jobStore.delete("transcripts", [jobId, f.sourceMediaId]); } catch (_) {} bySmid.delete(f.sourceMediaId); }
              const idx = items.findIndex(x => x.sourceMediaId === flagged[0].sourceMediaId);
              if (idx >= 0) { cursor = idx; completed = Math.max(0, completed - flagged.length); if (jobId) { try { await jobStore.updateJob(jobId, { transcriptsCompleted: completed }); } catch (_) {} } }
              zeroStreak = 0; zeroItems = []; paused = false; update();
            },
            () => { abandoned = true; paused = false; });
        }
      }
      workersFinished++;
      if (workersFinished >= workerCount) resolveAll();
    }
    const remaining = items.length - completed;
    workerCount = Math.max(1, Math.min(CONCURRENCY, remaining || 1));
    for (let i = 0; i < workerCount; i++) worker();
    await allDone;
    return { completed, failCount, abandoned };
  }

  const transcriptService = { fetchForSmid, getTranscriptRows, runTranscriptPhase };
  api.setShared("transcriptService", transcriptService);
})();
