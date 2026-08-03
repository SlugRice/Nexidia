//[Last Update: 8/3/2026]
//##> Standalone report. Population comes from the standard filter rows. Each call's
//##> transcript is fetched and analyzed for the agent's first speech time; a call
//##> qualifies when the agent never speaks or speaks after the threshold. Qualifying
//##> calls get a detail search for the display columns, then dispatch to the grid.
(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;
  const registry = api.getShared("reportRegistry");
  if (!registry) return;

  function getRows(payload) { return (payload && (payload.TranscriptRows || payload.rows || payload.transcriptRows)) || []; }

  function analyze(transcriptPayload, config) {
    const rows = getRows(transcriptPayload);
    if (!rows || rows.length === 0) return { match: false, data: { agentDelay: "", customerDelay: "" } };
    const threshold = (config && config.threshold) || 10;
    let firstAgentTs = null, firstCustomerTs = null;
    for (const r of rows) {
      const speaker = (r.Speaker || r.speaker || "").toString().trim().toLowerCase();
      const tsRaw = r.TotalSecondsFromStart != null ? r.TotalSecondsFromStart : r.totalSecondsFromStart;
      const ts = (typeof tsRaw === "number") ? tsRaw : (typeof tsRaw === "string") ? parseFloat(tsRaw) : NaN;
      if (isNaN(ts)) continue;
      const text = (r.Text || r.text || "").toString().replace(/<unk>/gi, "").trim();
      if (!text) continue;
      if (speaker === "agent" && firstAgentTs === null) firstAgentTs = ts;
      if (speaker === "customer" && firstCustomerTs === null) firstCustomerTs = ts;
      if (firstAgentTs !== null && firstCustomerTs !== null) break;
    }
    return {
      match: firstAgentTs === null || firstAgentTs > threshold,
      data: { agentDelay: firstAgentTs !== null ? firstAgentTs.toFixed(1) : "Never", customerDelay: firstCustomerTs !== null ? firstCustomerTs.toFixed(1) : "Never" }
    };
  }

  registry.register({
    id: "agentResponseDelay",
    label: "Agent Response Delay",
    description: "Find calls where the agent does not speak within a configurable number of seconds from the start of the call.",
    usesStandardFilters: true,
    columns: [
      { key: "agentDelay", label: "Agent First Speech (s)" },
      { key: "customerDelay", label: "Customer First Speech (s)" }
    ],
    buildConfig(container, helpers) {
      const box = helpers.el("div", { style: "background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 16px;margin:10px 0;" });
      box.appendChild(helpers.el("div", { style: "font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:10px;" }, "Report Settings"));
      const row = helpers.el("div", { style: "display:flex;align-items:center;gap:8px;font-size:13px;color:#374151;" });
      row.appendChild(document.createTextNode("Agent must speak within"));
      const input = helpers.el("input", { type: "number", min: 1, max: 300, value: 10, style: "width:60px;padding:5px 7px;border:1px solid #93c5fd;border-radius:6px;font-size:13px;text-align:center;" });
      row.appendChild(input);
      row.appendChild(document.createTextNode("seconds of call start"));
      box.appendChild(row);
      container.appendChild(box);
      return { getConfig() { return { threshold: parseInt(input.value) || 10 }; } };
    },

    async run(ctx) {
      const eng = ctx.services.searchEngine;
      const getFieldValue = ctx.helpers.getFieldValue;

      const filters = [];
      for (const f of ctx.standardFilters) filters.push(eng.buildKeywordFilter(f.storageName, f.values, f.matchMode));
      const keywordGroup = filters.length ? { operator: "AND", invertOperator: false, filters } : null;

      const popFields = ["sourceMediaId", "UDFVarchar110", "recordedDateTime"];
      ctx.progress.set(10, "Searching population...", "");
      const searchResult = await ctx.runSearch([{ keywordGroup, phraseGroups: [] }], popFields, {});
      if (searchResult === null) return;
      if (!searchResult.finalRows.length) { ctx.progress.remove(); alert("No results returned from search."); return; }

      const items = searchResult.finalRows.map((entry) => ({ sourceMediaId: getFieldValue(entry.row, "sourceMediaId"), transId: getFieldValue(entry.row, "UDFVarchar110").trim() })).filter((it) => it.sourceMediaId);
      try { await ctx.services.jobStore.updateJob(ctx.jobId, { totalCallsResolved: items.length }); } catch (_) {}

      ctx.progress.set(35, "Fetching transcripts...", "0 / " + items.length);
      const phase = await ctx.runTranscriptPhase(items, { analyze, config: ctx.config });
      if (phase.abandoned) { ctx.progress.set(null, "Stopped. Progress saved.", "Reopen Reports to resume."); return; }

      const records = await ctx.services.jobStore.getAllByIndex("transcripts", "byJob", ctx.jobId);
      const dataByTid = new Map();
      const qualifyingIds = [];
      for (const rec of records) {
        if (!rec.analyzeMatch) continue;
        const tid = (rec.transId || "").trim();
        if (!tid || tid === "0" || dataByTid.has(tid)) continue;
        dataByTid.set(tid, rec.analyzeData || {});
        qualifyingIds.push(tid);
      }
      if (!qualifyingIds.length) { ctx.progress.remove(); alert("No qualifying calls found."); return; }

      ctx.progress.set(88, "Running detail search...", qualifyingIds.length + " calls");
      const detailFields = ctx.columnPrefs.fields.includes("sourceMediaId") ? ctx.columnPrefs.fields.slice() : ctx.columnPrefs.fields.concat(["sourceMediaId"]);
      if (!detailFields.includes("UDFVarchar110")) detailFields.push("UDFVarchar110");
      const detailGroup = { operator: "AND", invertOperator: false, filters: [{ operator: "IN", type: "KEYWORD", parameterName: "UDFVarchar110", value: qualifyingIds }] };
      const detail = await ctx.runSearch([{ keywordGroup: detailGroup, phraseGroups: [] }], detailFields, {});
      if (detail === null) return;
      if (!detail.finalRows.length) { ctx.progress.remove(); alert("Detail search returned no results."); return; }

      for (const entry of detail.finalRows) {
        const tid = getFieldValue(entry.row, "UDFVarchar110").trim();
        const data = dataByTid.get(tid);
        if (data) for (const c of this.columns) entry.row["_report_" + c.key] = (data[c.key] || "").toString();
      }
      ctx.progress.set(96, "Preparing results...", detail.finalRows.length + " rows");
      ctx.dispatchToGrid(detail.finalRows, { extraColumns: this.columns });
    }
  });
})();
