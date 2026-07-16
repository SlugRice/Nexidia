//[Last Update: 4:35 PM 7/14/2026]
//##> WGS Transcripts.
//##> Accepts pasted pairs of a key value (default Orig ANI / UDFVarchar115) and a
//##> minimum recordedDateTime threshold. Runs one wide search across the full
//##> date window, then per-row keeps only calls whose recordedDateTime is
//##> strictly greater than the paired threshold for that row's key value.
//##> Duplicate keys collapse to the earliest supplied threshold date.
(() => {
  const reg = (window.NEXIDIA_TOOLS && window.NEXIDIA_TOOLS.getShared)
    ? window.NEXIDIA_TOOLS.getShared("reportRegistry")
    : null;
  if (!reg) return;
  const getFieldValue = window.NEXIDIA_TOOLS.getShared("reportGetFieldValue");
  const DEFAULT_KEY_FIELD = "UDFVarchar115";
  const DEFAULT_DATE_FIELD = "recordedDateTime";
  const OUTPUT_TRANS_ID_FIELD = "UDFVarchar110";
  function parsePairs(text) {
    const out = [];
    const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (!raw) continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      let parts;
      if (raw.indexOf("\t") !== -1) parts = raw.split("\t");
      else if (raw.indexOf(",") !== -1) parts = raw.split(",");
      else parts = raw.split(/\s{2,}/);
      const key = (parts[0] || "").trim();
      const date = (parts[1] || "").trim();
      if (!key || !date) { out.push({ lineNo: i + 1, key, date, error: "Missing key or date" }); continue; }
      const parsed = Date.parse(date);
      if (isNaN(parsed)) { out.push({ lineNo: i + 1, key, date, error: "Unrecognized date/time" }); continue; }
      out.push({ lineNo: i + 1, key, date, parsedMs: parsed, error: null });
    }
    return out;
  }
  function dedupeKeepEarliest(pairs) {
    const map = new Map();
    const errors = [];
    let dedupedCount = 0;
    for (const p of pairs) {
      if (p.error) { errors.push(p); continue; }
      const existing = map.get(p.key);
      if (!existing) { map.set(p.key, p); continue; }
      dedupedCount++;
      if (p.parsedMs < existing.parsedMs) map.set(p.key, p);
    }
    return { map, errors, dedupedCount };
  }
  reg.register({
    id: "wgsTranscripts",
    label: "WGS Transcripts",
    description: "Paste pairs of key value (default Orig ANI) and minimum recordedDateTime. Runs one search across the selected date range and keeps only calls strictly after each row's paired threshold.",
    skipTranscriptPhase: true,
    hideStandardFilters: true,
    columns: [
      { key: "pairedThreshold", label: "Paired Threshold" }
    ],
    batchOverrides: {
      groupMode: "byValue",
      groupField: "UDFVarchar115",
      outputFields: ["UDFVarchar110", "UDFVarchar115", "recordedDateTime"],
      outputHeaders: ["Trans_Id", "Orig ANI", "Date/Time"]
    },
    buildConfig(container, ctx) {
      const el = ctx.el;
      const metadataFields = ctx.metadataFields || [];
      const makeFieldPicker = ctx.makeFieldPicker;
      container.appendChild(el("div", { style: "font-size:13px;font-weight:600;color:#374151;margin:10px 0 6px;" }, "Paired Inputs"));
      const fieldRow = el("div", { style: "display:flex;gap:10px;margin-bottom:8px;flex-wrap:wrap;" });
      const keyWrap = el("div", { style: "flex:1;min-width:200px;" });
      keyWrap.appendChild(el("div", { style: "font-size:11px;color:#6b7280;margin-bottom:4px;" }, "Key field (column A)"));
      const keyPicker = makeFieldPicker(metadataFields, DEFAULT_KEY_FIELD);
      keyWrap.appendChild(keyPicker.wrapper);
      const dateWrap = el("div", { style: "flex:1;min-width:200px;" });
      dateWrap.appendChild(el("div", { style: "font-size:11px;color:#6b7280;margin-bottom:4px;" }, "Threshold field (column B)"));
      const datePicker = makeFieldPicker(metadataFields, DEFAULT_DATE_FIELD);
      dateWrap.appendChild(datePicker.wrapper);
      fieldRow.appendChild(keyWrap);
      fieldRow.appendChild(dateWrap);
      container.appendChild(fieldRow);
      container.appendChild(el("div", { style: "font-size:11px;color:#6b7280;margin:6px 0 4px;line-height:1.5;" },
        "Paste two columns from Excel. Column A is the key value, column B is the minimum date/time in ISO Z format (e.g. 2026-07-08T08:30:33Z). Only calls strictly after the paired date are kept."
      ));
      const textarea = el("textarea", {
        placeholder: "5551234567\t2026-07-08T08:30:33Z\n5559876543\t2026-07-09T14:22:10Z",
        style: "width:100%;min-height:140px;padding:8px 10px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-family:ui-monospace,Consolas,monospace;font-size:12px;resize:vertical;"
      });
      container.appendChild(textarea);
      const summary = el("div", { style: "font-size:11px;color:#6b7280;margin-top:6px;line-height:1.5;min-height:16px;" });
      container.appendChild(summary);
      function refreshSummary() {
        const pairs = parsePairs(textarea.value);
        if (!pairs.length) { summary.textContent = ""; return; }
        const { map, errors, dedupedCount } = dedupeKeepEarliest(pairs);
        const bits = [];
        bits.push(map.size.toLocaleString() + " unique key(s)");
        if (dedupedCount) bits.push(dedupedCount + " duplicate line(s) collapsed to earliest date");
        if (errors.length) bits.push(errors.length + " line(s) with errors");
        summary.textContent = bits.join(" \u2022 ");
      }
      textarea.addEventListener("input", refreshSummary);
      textarea.addEventListener("blur", refreshSummary);
      return {
        getConfig() {
          const pairs = parsePairs(textarea.value);
          const { map, errors, dedupedCount } = dedupeKeepEarliest(pairs);
          const paired = {};
          for (const [k, v] of map.entries()) paired[k] = v.date;
          return {
            keyField: keyPicker.getStorageName() || DEFAULT_KEY_FIELD,
            dateField: datePicker.getStorageName() || DEFAULT_DATE_FIELD,
            paired,
            errors: errors.map(e => ({ lineNo: e.lineNo, key: e.key, date: e.date, error: e.error })),
            dedupedCount
          };
        }
      };
    },
    validateConfig(config) {
      if (!config || !config.paired || !Object.keys(config.paired).length) {
        alert("Paste at least one valid key / date pair before running.");
        return false;
      }
      if (config.errors && config.errors.length) {
        const preview = config.errors.slice(0, 5).map(e => "Line " + e.lineNo + ": " + e.error + " (" + (e.key || "?") + ", " + (e.date || "?") + ")").join("\n");
        const proceed = confirm(
          config.errors.length + " line(s) have errors and will be ignored:\n\n" +
          preview + (config.errors.length > 5 ? "\n..." : "") +
          "\n\nProceed with the remaining " + Object.keys(config.paired).length + " valid pair(s)?"
        );
        if (!proceed) return false;
      }
      return true;
    },
    getSearchAugment(config) {
      const keys = Object.keys(config.paired || {});
      const searchFields = [config.keyField || DEFAULT_KEY_FIELD, config.dateField || DEFAULT_DATE_FIELD, OUTPUT_TRANS_ID_FIELD];
      return {
        keywordFilters: [{
          operator: "IN",
          type: "KEYWORD",
          parameterName: config.keyField || DEFAULT_KEY_FIELD,
          value: keys
        }],
        searchFields
      };
    },
    //##> Row-level filter. Kept only when rowDate > pairedThreshold (strict).
    //##> Same-timestamp calls are discarded per business rule.
    filterRows(rows, config) {
      const keyField = config.keyField || DEFAULT_KEY_FIELD;
      const dateField = config.dateField || DEFAULT_DATE_FIELD;
      const paired = config.paired || {};
      const pairedMs = {};
      for (const k of Object.keys(paired)) {
        const ms = Date.parse(paired[k]);
        if (!isNaN(ms)) pairedMs[String(k).trim()] = ms;
      }
      const keptRows = [];
      let discardedCount = 0;
      let noPairCount = 0;
      for (const row of rows) {
        const keyVal = String(getFieldValue(row, keyField) || "").trim();
        const dateVal = String(getFieldValue(row, dateField) || "").trim();
        if (!keyVal || !(keyVal in pairedMs)) { noPairCount++; continue; }
        const rowMs = Date.parse(dateVal);
        if (isNaN(rowMs)) { noPairCount++; continue; }
        if (rowMs > pairedMs[keyVal]) {
          row["_report_pairedThreshold"] = paired[keyVal];
          keptRows.push(row);
        } else {
          discardedCount++;
        }
      }
      return { keptRows, discardedCount, noPairCount };
    },
    analyze() { return { match: false, data: {} }; }
  });
})();
