//[Last Update: 8/17/26 2:14 PM - reportsHub - custom load + direct grid]
//##> Thin reports host. Loads the catalog, lets the user pick a report, collects
//##> the date range plus any report-specific config, then calls report.run(ctx).
//##> The hub owns no search/transcript/export logic; it wires shared services into
//##> ctx and hands control to the report. Reports are standalone instruction sets.
//##>
//##> Report contract (registered via reportRegistry.register):
//##>   id, label, description
//##>   columns:            [{ key, label }]           report-added columns (optional)
//##>   blankColumns:       ["Notes", ...]             columns named only, values empty
//##>   usesStandardFilters: bool                      show the generic filter rows
//##>   defaultFilters:     ["UDFVarchar10", ...]      storageNames prefilled when shown
//##>   buildConfig(container, helpers) -> { getConfig() }   optional config panel
//##>   validateConfig(config) -> bool                       optional gate
//##>   async run(ctx) -> void                               the whole instruction set
(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;
  const REPO_BASE = "https://raw.githubusercontent.com/SlugRice/Nexidia/main/";
  const REPORTS_CATALOG_URL = REPO_BASE + "reports.json";
  const BASE = "https://apug01.nxondemand.com";
  const METADATA_URL = BASE + "/NxIA/api-gateway/explore/api/v1.0/metadata/fields/names";
  const DEFAULT_FILTER_STORAGES = ["UDFVarchar10", "siteName", "DNIS", "UDFVarchar110"];
  const reportDefs = {};
  const reportRegistry = {
    register(def) { reportDefs[def.id] = def; },
    get(id) { return reportDefs[id] || null; }
  };
  api.setShared("reportRegistry", reportRegistry);
  function el(tag, props, ...children) {
    props = props || {};
    const node = document.createElement(tag);
    Object.assign(node, props);
    for (const ch of children) { if (ch == null) continue; node.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch); }
    return node;
  }
  function hr() { return el("div", { style: "height:1px;background:#e5e7eb;margin:14px 0;" }); }
  function getServices() {
    return {
      searchEngine: api.getShared("searchEngine"),
      transcriptService: api.getShared("transcriptService"),
      jobStore: api.getShared("jobStore"),
      xlsBuilder: api.getShared("xlsBuilder")
    };
  }
  function makeProgressUI(title) {
    const overlay = el("div", { style: "position:fixed;top:20px;right:20px;z-index:999999;background:#0b1225;color:#e5e7eb;font-family:ui-monospace,Consolas,monospace;padding:14px 14px 12px;border-radius:10px;min-width:380px;max-width:520px;box-shadow:0 10px 30px rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.12);" });
    const titleEl = el("div", { style: "font-size:14px;font-weight:700;color:#7dd3fc;margin-bottom:10px;" }, title || "Reports");
    const closeBtn = el("div", { style: "position:absolute;top:10px;right:12px;cursor:pointer;color:#94a3b8;font-size:16px;" }, "\u2715");
    const status = el("div", { style: "font-size:12px;margin-bottom:6px;" });
    const detail = el("div", { style: "font-size:11px;color:#94a3b8;white-space:pre-wrap;margin-bottom:10px;" });
    const barWrap = el("div", { style: "height:10px;background:#070b14;border:1px solid rgba(255,255,255,0.10);border-radius:999px;overflow:hidden;" });
    const bar = el("div", { style: "height:100%;width:0%;background:linear-gradient(90deg,#38bdf8,#a78bfa);transition:width 0.3s;" });
    barWrap.appendChild(bar);
    overlay.appendChild(closeBtn); overlay.appendChild(titleEl); overlay.appendChild(status); overlay.appendChild(detail); overlay.appendChild(barWrap);
    document.body.appendChild(overlay);
    let onClose = () => overlay.remove();
    closeBtn.onclick = () => onClose();
    return {
      set(pct, msg, det) {
        if (pct != null) bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
        if (msg !== undefined) status.textContent = msg;
        if (det !== undefined) detail.textContent = det;
      },
      onClose(fn) { onClose = fn; },
      remove() { try { overlay.remove(); } catch (_) {} }
    };
  }
  //##> Safeguard modal for the transcript phase (10 empty transcripts in a row).
  function showZeroRowSafeguardModal(items, onResume, onAbandon) {
    const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1000010;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
    const box = el("div", { style: "background:#fff;width:540px;max-height:82vh;overflow-y:auto;border-radius:14px;padding:22px 24px 18px;box-shadow:0 10px 30px rgba(0,0,0,.35);position:relative;" });
    const closeBtn = el("button", { style: "position:absolute;top:14px;right:16px;border:0;background:#f3f4f6;color:#6b7280;width:26px;height:26px;border-radius:50%;font-size:13px;cursor:pointer;" }, "\u2715");
    closeBtn.onclick = () => { overlay.remove(); onAbandon(); };
    box.appendChild(closeBtn);
    box.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#111827;margin-bottom:6px;" }, "Possible Transcript Session Issue"));
    box.appendChild(el("div", { style: "font-size:12px;color:#6b7280;margin-bottom:14px;line-height:1.5;" }, "10 transcripts in a row came back with no content. This usually points to a transcript session problem rather than the calls themselves. Test the Trans_IDs below in another tab. If those calls have content, click Resume to retry these and continue. Closing this prompt stops the run, but progress is saved and the job can be resumed later from the Reports menu."));
    const listWrap = el("div", { style: "background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin-bottom:10px;font-family:ui-monospace,Consolas,monospace;font-size:12px;color:#111827;max-height:240px;overflow-y:auto;" });
    for (const it of items) listWrap.appendChild(el("div", { style: "padding:3px 0;" }, it.transId || "(no Trans_ID, SMID:" + it.sourceMediaId + ")"));
    box.appendChild(listWrap);
    const copyBtn = el("button", { style: "padding:6px 12px;border-radius:7px;border:1px solid #d1d5db;background:#fff;color:#374151;font-size:12px;cursor:pointer;margin-bottom:14px;" }, "Copy Trans_IDs");
    copyBtn.onclick = () => { try { navigator.clipboard.writeText(items.map(it => it.transId || it.sourceMediaId).join("\n")); copyBtn.textContent = "Copied"; setTimeout(() => { copyBtn.textContent = "Copy Trans_IDs"; }, 1500); } catch (_) {} };
    box.appendChild(copyBtn);
    const resumeBtn = el("button", { style: "width:100%;padding:10px;border-radius:8px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:13px;font-weight:600;cursor:pointer;" }, "Resume");
    resumeBtn.onclick = () => { overlay.remove(); onResume(); };
    box.appendChild(resumeBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }
  function makeFieldPicker(metadataFields, defaultSn) {
    const wrapper = el("div", { style: "position:relative;flex:1;min-width:160px;" });
    const input = el("input", { type: "text", placeholder: "Search fields...", style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;" });
    const dropdown = el("div", { style: "display:none;position:absolute;top:100%;left:0;right:0;max-height:200px;overflow-y:auto;background:#fff;border:1px solid #ccc;border-top:none;border-radius:0 0 6px 6px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,.15);" });
    let vis = [];
    function render(q) {
      dropdown.innerHTML = ""; vis = [];
      const ql = q.toLowerCase().trim();
      const cur = input.dataset.storageName || "";
      const matches = metadataFields.filter((f) => f.storageName === cur ? true : (ql ? f.displayName.toLowerCase().includes(ql) : true));
      if (!matches.length) { dropdown.style.display = "none"; return; }
      for (let i = 0; i < Math.min(matches.length, 80); i++) {
        const f = matches[i];
        const item = el("div", { style: "padding:6px 10px;cursor:pointer;font-size:13px;border-bottom:1px solid #f0f0f0;" }, f.displayName);
        item.onmousedown = (e) => { e.preventDefault(); pick(f); };
        dropdown.appendChild(item); vis.push(item);
      }
      dropdown.style.display = "block";
    }
    function pick(f) { input.value = f.displayName; input.dataset.storageName = f.storageName; dropdown.style.display = "none"; }
    input.addEventListener("input", () => { delete input.dataset.storageName; render(input.value); });
    input.addEventListener("focus", () => render(input.value));
    input.addEventListener("blur", () => setTimeout(() => { dropdown.style.display = "none"; }, 150));
    wrapper.appendChild(input); wrapper.appendChild(dropdown);
    if (defaultSn) { const f = metadataFields.find((x) => x.storageName === defaultSn); if (f) pick(f); else { input.value = defaultSn; input.dataset.storageName = defaultSn; } }
    return { wrapper, input, getStorageName: () => input.dataset.storageName || "", getDisplayName: () => input.value };
  }
  //##> Build the ctx handed to report.run. Everything a report needs is here.
  function buildRunContext(activeReport, opts) {
    const services = getServices();
    const progress = opts.progress;
    const abortController = opts.abortController;
    const jobId = opts.jobId;
    const metadataFields = api.getShared("reportMetadataFields") || [];
    const colPrefs = api.getShared("columnPrefs") || { fields: [], headers: [] };
    const eng = services.searchEngine;
    function getDisplayName(sn) { const f = metadataFields.find((x) => x.storageName === sn); return f ? f.displayName : sn; }
    function resolveStorageByDisplay(name) { const f = metadataFields.find((x) => (x.displayName || "").toLowerCase() === String(name).toLowerCase()); return f ? f.storageName : null; }
    const ctx = {
      config: opts.config || {},
      dateFilter: opts.dateFilter,
      fromVal: opts.fromVal,
      toVal: opts.toVal,
      standardFilters: opts.standardFilters || [],
      jobId,
      services,
      builders: { buildKeywordFilter: eng.buildKeywordFilter, buildTextFilter: eng.buildTextFilter, buildDateFilter: eng.buildDateFilter, buildDecimalFilter: eng.buildDecimalFilter },
      helpers: { el, metadataFields, getFieldValue: eng.getFieldValue, getDisplayName, resolveStorageByDisplay },
      progress,
      signal: abortController.signal,
      isCancelled: () => abortController.signal.aborted,
      columnPrefs: { fields: colPrefs.fields.slice(), headers: colPrefs.headers.slice() },
      //##> Run population + phrase searches through the shared engine.
      async runSearch(runSets, fields, env) {
        env = Object.assign({
          jobId, signal: abortController.signal,
          isCancelled: () => abortController.signal.aborted,
          onProgress: (pct, msg, det) => progress.set(pct == null ? null : Math.min(85, pct), msg, det),
          warnAtomicCap: () => setTimeout(() => alert("A search segment hit the 10,000 result limit and could not be split further. Results from that segment are partial. Narrow the date range or filters to see more."), 0)
        }, env || {});
        return eng.executeSearch(runSets, fields, opts.dateFilter, env);
      },
      //##> Run the transcript phase for items [{sourceMediaId, transId}].
      async runTranscriptPhase(items, phaseOpts) {
        return services.transcriptService.runTranscriptPhase(items, Object.assign({
          jobId, signal: abortController.signal,
          onProgress: (pct, msg, det) => progress.set(pct, msg, det),
          onSafeguard: (flagged, resume, abandon) => showZeroRowSafeguardModal(flagged, resume, abandon)
        }, phaseOpts || {}));
      },
      //##> Publish rows to the results grid.
      //##> Either pass explicit ordered columns via { fields, headers }, or let the
      //##> hub append from { extraColumns:[{key,label}], blankColumns:["Name",...] }.
      //##> phraseInfo = { maxPhraseCols, includePhraseCol } if phrase labels are used.
      dispatchToGrid(rows, dispatchOpts) {
        dispatchOpts = dispatchOpts || {};
        let fields, headers;
        if (Array.isArray(dispatchOpts.fields) && Array.isArray(dispatchOpts.headers)) {
          //##> Report supplied an explicit, already-ordered column list (real +
          //##> report + blank columns interleaved). Use it verbatim.
          fields = dispatchOpts.fields.slice();
          headers = dispatchOpts.headers.slice();
        } else {
          fields = colPrefs.fields.slice();
          headers = colPrefs.headers.slice();
          const extra = dispatchOpts.extraColumns || activeReport.columns || [];
          for (const c of extra) { const key = "_report_" + c.key; if (!fields.includes(key)) { fields.push(key); headers.push(c.label); } }
          const blanks = dispatchOpts.blankColumns || activeReport.blankColumns || [];
          for (const label of blanks) { const key = "_blank_" + label.replace(/[^a-zA-Z0-9]/g, "_"); if (!fields.includes(key)) { fields.push(key); headers.push(label); } }
        }
        api.setShared("columnPrefs", { fields: fields.slice(), headers: headers.slice() });
        api.setShared("reportBatchOverrides", dispatchOpts.batchOverrides || null);
        api.setShared("lastSearchResult", {
          rows, fields, headers,
          maxPhraseCols: dispatchOpts.maxPhraseCols || 1,
          includePhraseCol: !!dispatchOpts.includePhraseCol
        });
        progress.remove();
        const grid = api.listTools().find((t) => t.id === "resultsGrid");
        if (grid) grid.open(); else alert("Results Grid not loaded. Check manifest.");
      }
    };
    return ctx;
  }
  async function executeReport(activeReport, params) {
    const abortController = new AbortController();
    const progress = makeProgressUI(activeReport.label + (params.resumed ? " (Resumed)" : ""));
    progress.set(6, params.resumed ? "Resuming..." : "Preparing...", "");
    progress.onClose(() => { abortController.abort(); progress.remove(); });
    const jobId = params.jobId;
    const jobRecord = {
      id: jobId, status: "in-progress", reportId: activeReport.id,
      reportConfig: params.config, dateFilter: params.dateFilter,
      fromVal: params.fromVal, toVal: params.toVal,
      standardFilters: params.standardFilters || [],
      customSource: params.customSource || null,
      createdAt: params.createdAt || Date.now(), updatedAt: Date.now()
    };
    try { await api.getShared("jobStore").put("jobs", jobRecord); } catch (_) {}
    const ctx = buildRunContext(activeReport, { progress, abortController, jobId, config: params.config, dateFilter: params.dateFilter, fromVal: params.fromVal, toVal: params.toVal, standardFilters: params.standardFilters });
    try {
      await activeReport.run(ctx);
      try { await api.getShared("jobStore").updateJob(jobId, { status: "complete" }); } catch (_) {}
    } catch (err) {
      if (err && err.name === "AbortError") { progress.remove(); return; }
      console.error(err);
      progress.set(null, "Report failed. Check console.", String(err && err.message || err));
      try { await api.getShared("jobStore").updateJob(jobId, { status: "in-progress" }); } catch (_) {}
    }
  }
  async function loadReportModule(entry) {
    if (reportDefs[entry.id] || !entry.file) return reportDefs[entry.id] || null;
    const res = await fetch(REPO_BASE + entry.file + "?v=" + Date.now(), { credentials: "omit", cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    (0, eval)(await res.text());
    return reportDefs[entry.id] || null;
  }
  //##> Evaluate custom report source text. Snapshots the registry so the newly
  //##> registered id can be identified and returned along with the raw source
  //##> (used to persist a resumable job for a report not in the GitHub catalog).
  function loadReportFromSource(source) {
    const before = new Set(Object.keys(reportDefs));
    (0, eval)(source);
    const added = Object.keys(reportDefs).filter((k) => !before.has(k));
    const id = added.length ? added[added.length - 1] : null;
    return { id, def: id ? reportDefs[id] : null };
  }
  function showResumeModal(candidates, catalog, onResume, onFresh) {
    const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1000005;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
    const box = el("div", { style: "background:#fff;width:520px;max-height:80vh;overflow-y:auto;border-radius:14px;padding:22px 24px 18px;box-shadow:0 10px 30px rgba(0,0,0,.35);position:relative;" });
    const closeBtn = el("button", { style: "position:absolute;top:14px;right:16px;border:0;background:#f3f4f6;color:#6b7280;width:26px;height:26px;border-radius:50%;font-size:13px;cursor:pointer;" }, "\u2715");
    closeBtn.onclick = () => { overlay.remove(); onFresh(); };
    box.appendChild(closeBtn);
    box.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#111827;margin-bottom:6px;" }, candidates.length === 1 ? "Unfinished Report Detected" : candidates.length + " Unfinished Reports Detected"));
    box.appendChild(el("div", { style: "font-size:12px;color:#6b7280;margin-bottom:14px;" }, "Progress for the following report(s) was saved before the previous session ended. Resume to continue, or discard to start fresh."));
    for (const job of candidates) {
      const entry = catalog.find(c => c.id === job.reportId);
      const card = el("div", { style: "border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-bottom:10px;background:#f8fafc;" });
      card.dataset.jobCard = "1";
      card.appendChild(el("div", { style: "font-size:13px;font-weight:600;color:#111827;margin-bottom:6px;" }, entry ? entry.label : job.reportId));
      card.appendChild(el("div", { style: "font-size:11px;color:#6b7280;margin-bottom:8px;" }, "Started: " + new Date(job.createdAt).toLocaleString()));
      const btnRow = el("div", { style: "display:flex;gap:8px;" });
      const resumeBtn = el("button", { style: "flex:1;padding:7px;border-radius:7px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:12px;font-weight:600;cursor:pointer;" }, "Resume");
      const discardBtn = el("button", { style: "padding:7px 14px;border-radius:7px;border:1px solid #ef4444;background:#fff;color:#ef4444;font-size:12px;font-weight:600;cursor:pointer;" }, "Discard");
      resumeBtn.onclick = () => { overlay.remove(); onResume(job); };
      discardBtn.onclick = async () => { if (!confirm("Discard this report and delete its saved progress?")) return; try { await api.getShared("jobStore").deleteJobCascade(job.id); } catch (_) {} card.remove(); if (!box.querySelector("[data-job-card]")) { overlay.remove(); onFresh(); } };
      btnRow.appendChild(resumeBtn); btnRow.appendChild(discardBtn);
      card.appendChild(btnRow);
      box.appendChild(card);
    }
    const skipBtn = el("button", { style: "padding:7px 14px;border-radius:7px;border:1px solid #d1d5db;background:#fff;color:#6b7280;font-size:12px;cursor:pointer;float:right;" }, "Start new report instead");
    skipBtn.onclick = () => { overlay.remove(); onFresh(); };
    box.appendChild(skipBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }
  function openReports() {
    (async () => {
      try {
        const isNexidiaPage = typeof location !== "undefined" && /nxondemand\.com/i.test(location.hostname) && /\/NxIA\//i.test(location.pathname);
        if (!isNexidiaPage) { alert("Failed to run. Make sure you're running this from an active Nexidia session."); return; }
        const services = getServices();
        if (!services.searchEngine || !services.jobStore) { alert("Report services not loaded. Check that reportServices is in the manifest before reportsHub."); return; }
        await services.jobStore.requestPersistence();
        let metadataFields = [];
        try { const res = await fetch(METADATA_URL, { credentials: "include", cache: "no-store" }); if (res.ok) { const json = await res.json(); metadataFields = Array.isArray(json) ? json.filter((f) => f.isEnabled !== false) : []; } } catch (_) {}
        api.setShared("reportMetadataFields", metadataFields);
        let catalog = [];
        try { const mRes = await fetch(REPORTS_CATALOG_URL + "?v=" + Date.now(), { credentials: "omit", cache: "no-store" }); if (mRes.ok) { const mJson = await mRes.json(); catalog = Array.isArray(mJson.reports) ? mJson.reports : []; } } catch (_) {}
        const candidates = await services.jobStore.getResumeCandidates(null);
        if (candidates.length > 0) {
          let choice = null;
          await new Promise((resolve) => showResumeModal(candidates, catalog, (job) => { choice = { type: "resume", job }; resolve(); }, () => { choice = { type: "fresh" }; resolve(); }));
          if (choice && choice.type === "resume") {
            let def = null;
            const entry = catalog.find(c => c.id === choice.job.reportId);
            if (entry) { def = await loadReportModule(entry); }
            else if (choice.job.customSource) { try { def = loadReportFromSource(choice.job.customSource).def; } catch (_) { def = null; } }
            if (!def) { alert("Report module not found: " + choice.job.reportId); return; }
            await executeReport(def, { resumed: true, jobId: choice.job.id, config: choice.job.reportConfig, dateFilter: choice.job.dateFilter, fromVal: choice.job.fromVal, toVal: choice.job.toVal, standardFilters: choice.job.standardFilters, customSource: choice.job.customSource, createdAt: choice.job.createdAt });
            return;
          }
        }
        let activeReport = null, configGetter = null, customSource = null;
        const filterRows = [];
        const modal = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
        const card = el("div", { style: "background:#f8fafc;width:720px;max-height:90vh;overflow-y:auto;border-radius:14px;padding:22px 24px;box-shadow:0 10px 30px rgba(0,0,0,.35);position:relative;" });
        const closeBtn = el("button", { style: "position:absolute;top:14px;right:16px;border:0;background:#f3f4f6;color:#6b7280;width:26px;height:26px;border-radius:50%;font-size:13px;cursor:pointer;" }, "\u2715");
        closeBtn.onclick = () => modal.remove();
        card.appendChild(closeBtn);
        card.appendChild(el("div", { style: "font-size:18px;font-weight:700;color:#111827;margin-bottom:14px;" }, "Reports"));
        card.appendChild(hr());
        const selectWrap = el("div", { style: "margin-bottom:10px;" });
        selectWrap.appendChild(el("div", { style: "font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;" }, "Select a report"));
        const select = el("select", { style: "width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;background:#fff;cursor:pointer;" });
        select.appendChild(el("option", { value: "" }, "\u2014 Choose a report \u2014"));
        for (const entry of catalog) select.appendChild(el("option", { value: entry.id }, entry.label));
        selectWrap.appendChild(select);
        const customRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-top:8px;" });
        const customBtn = el("button", { style: "padding:6px 12px;border-radius:8px;border:1px solid #6b7280;background:#fff;color:#374151;cursor:pointer;font-size:12px;" }, "Load custom report (.js)");
        const customNote = el("div", { style: "font-size:11px;color:#6b7280;" }, "");
        const fileInput = el("input", { type: "file", accept: ".js,.txt,text/javascript,text/plain", style: "display:none;" });
        customRow.appendChild(customBtn); customRow.appendChild(customNote); customRow.appendChild(fileInput);
        selectWrap.appendChild(customRow);
        card.appendChild(selectWrap);
        const descArea = el("div", { style: "font-size:12px;color:#6b7280;line-height:1.5;margin-bottom:10px;min-height:18px;" });
        card.appendChild(descArea);
        const configArea = el("div", {});
        card.appendChild(configArea);
        card.appendChild(hr());
        card.appendChild(el("div", { style: "font-size:15px;font-weight:600;margin:10px 0;" }, "Date Range"));
        const dateRow = el("div", { style: "display:flex;gap:10px;align-items:flex-end;margin:8px 0;flex-wrap:wrap;" });
        const today = new Date(); const monthAgo = new Date(today); monthAgo.setMonth(today.getMonth() - 1);
        const fromWrap = el("div", { style: "flex:1;min-width:200px;" });
        fromWrap.appendChild(el("div", { style: "font-size:12px;color:#444;margin-bottom:4px;" }, "From"));
        const fromInput = el("input", { type: "date", style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;" });
        fromInput.valueAsDate = monthAgo; fromWrap.appendChild(fromInput);
        const toWrap = el("div", { style: "flex:1;min-width:200px;" });
        toWrap.appendChild(el("div", { style: "font-size:12px;color:#444;margin-bottom:4px;" }, "To"));
        const toInput = el("input", { type: "date", style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;" });
        toInput.valueAsDate = today; toWrap.appendChild(toInput);
        dateRow.appendChild(fromWrap); dateRow.appendChild(toWrap);
        card.appendChild(dateRow);
        const filtersHr = hr(); card.appendChild(filtersHr);
        const filtersHeader = el("div", { style: "font-size:15px;font-weight:600;margin:10px 0;" }, "Filters");
        card.appendChild(filtersHeader);
        const filtersContainer = el("div", {});
        card.appendChild(filtersContainer);
        function addFilterRow(storageName) {
          const row = { picker: null, valueInput: null };
          const removeBtn = el("button", { style: "width:22px;height:22px;border-radius:50%;border:1px solid #e5e7eb;background:#fff;color:#aaa;cursor:pointer;font-size:11px;flex-shrink:0;" }, "X");
          const picker = makeFieldPicker(metadataFields, storageName || "");
          const valueInput = el("input", { type: "text", placeholder: "Values (comma or line separated)", style: "flex:1;min-width:0;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;" });
          const rowEl = el("div", { style: "display:flex;gap:8px;align-items:center;margin:6px 0;" });
          rowEl.appendChild(removeBtn); rowEl.appendChild(picker.wrapper); rowEl.appendChild(valueInput);
          row.picker = picker; row.valueInput = valueInput; row.rowEl = rowEl;
          filterRows.push(row); filtersContainer.appendChild(rowEl);
          removeBtn.onclick = () => { rowEl.remove(); const i = filterRows.indexOf(row); if (i !== -1) filterRows.splice(i, 1); };
          return row;
        }
        const addFilterBtn = el("button", { style: "margin-top:8px;padding:6px 12px;border-radius:8px;border:1px solid #3b82f6;background:#fff;color:#3b82f6;cursor:pointer;font-size:12px;" }, "+ Add Filter");
        addFilterBtn.onclick = () => addFilterRow("");
        card.appendChild(addFilterBtn);
        card.appendChild(hr());
        const runBtn = el("button", { style: "width:100%;padding:12px;border-radius:12px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(59,130,246,0.4);letter-spacing:0.5px;" }, "Run Report");
        card.appendChild(runBtn);
        modal.appendChild(card);
        document.body.appendChild(modal);
        function setFiltersVisible(show, defaults) {
          filtersHr.style.display = show ? "" : "none";
          filtersHeader.style.display = show ? "" : "none";
          filtersContainer.style.display = show ? "" : "none";
          addFilterBtn.style.display = show ? "" : "none";
          filtersContainer.innerHTML = "";
          filterRows.length = 0;
          if (show) for (const sn of (defaults || DEFAULT_FILTER_STORAGES)) addFilterRow(sn);
        }
        setFiltersVisible(false);
        //##> Activate a definition in the modal (shared by dropdown select and
        //##> custom file load). Wires description, filter rows, and config panel.
        function activateDef(def, descText) {
          configArea.innerHTML = "";
          activeReport = def;
          configGetter = null;
          descArea.textContent = descText || def.description || "";
          setFiltersVisible(!!def.usesStandardFilters, def.defaultFilters);
          if (def.buildConfig) configGetter = def.buildConfig(configArea, { el, metadataFields, makeFieldPicker });
        }
        select.onchange = async () => {
          const id = select.value;
          configArea.innerHTML = ""; descArea.textContent = ""; activeReport = null; configGetter = null; customSource = null;
          customNote.textContent = "";
          setFiltersVisible(false);
          if (!id) return;
          const entry = catalog.find((c) => c.id === id);
          if (entry) descArea.textContent = entry.description || "";
          let def;
          try { descArea.textContent = "Loading report module..."; def = await loadReportModule(entry); descArea.textContent = entry.description || ""; }
          catch (e) { descArea.textContent = "Failed to load report module: " + e.message; return; }
          if (!def) { descArea.textContent = "Report module not found for id: " + id; return; }
          activateDef(def, entry.description || "");
        };
        customBtn.onclick = () => fileInput.click();
        fileInput.onchange = () => {
          const file = fileInput.files && fileInput.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const source = String(reader.result || "");
            let loaded;
            try { loaded = loadReportFromSource(source); }
            catch (e) { customNote.textContent = ""; alert("That file could not be loaded as a report:\n\n" + (e && e.message || e)); fileInput.value = ""; return; }
            if (!loaded || !loaded.def) { alert("That file did not register a report. Make sure it registers through reportRegistry.register."); fileInput.value = ""; return; }
            select.value = "";
            customSource = source;
            activateDef(loaded.def, loaded.def.description || "");
            customNote.textContent = "Loaded: " + (loaded.def.label || loaded.id) + " (custom)";
            fileInput.value = "";
          };
          reader.onerror = () => { alert("Could not read that file."); fileInput.value = ""; };
          reader.readAsText(file);
        };
        runBtn.onclick = async () => {
          if (!activeReport) { alert("Please select a report before running."); return; }
          const fromVal = fromInput.value, toVal = toInput.value;
          if (!fromVal || !toVal) { alert("Please select both From and To dates."); return; }
          const config = configGetter ? configGetter.getConfig() : {};
          if (activeReport.validateConfig && !activeReport.validateConfig(config)) return;
          const standardFilters = [];
          if (activeReport.usesStandardFilters) {
            for (const fr of filterRows) {
              const sn = fr.picker.getStorageName();
              const raw = (fr.valueInput.value || "").trim();
              if (!sn || !raw) continue;
              const values = [...new Set(raw.replace(/\r\n/g, "\n").replace(/\t/g, "\n").split(/[\n,]+/).map(s => s.trim()).filter(Boolean))];
              if (values.length) standardFilters.push({ storageName: sn, values, matchMode: "IN", exclude: false });
            }
          }
          modal.remove();
          const dateFilter = services.searchEngine.buildDateFilter(fromVal, toVal);
          const jobId = services.jobStore.generateJobId("rptjob");
          await executeReport(activeReport, { jobId, config, dateFilter, fromVal, toVal, standardFilters, customSource, createdAt: Date.now() });
        };
      } catch (e) {
        console.error(e);
        alert("Failed to open Reports. Make sure you're running this from an active Nexidia session.");
      }
    })();
  }
  api.registerTool({ id: "reports", label: "Reports", open: openReports });
})();
