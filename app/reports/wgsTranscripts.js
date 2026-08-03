//[Last Update: 7:49 PM 8/3/2026]
//##> Standalone report. Accepts pasted pairs of a key value (default Orig ANI /
//##> UDFVarchar115) and a minimum date threshold. Runs one search across the date
//##> window, then keeps only calls whose recordedDateTime is strictly greater than
//##> the paired threshold for that row's key. Duplicate keys collapse to the
//##> earliest supplied threshold. No transcript phase; dispatches straight to grid
//##> with batch overrides preloaded.
(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;
  const registry = api.getShared("reportRegistry");
  if (!registry) return;

  const DEFAULT_KEY_FIELD = "UDFVarchar115";
  const DEFAULT_DATE_FIELD = "recordedDateTime";
  const OUTPUT_TRANS_ID_FIELD = "UDFVarchar110";
  const ISO_LIKE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
  const US_LIKE_RE = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
  const DATE_HINT_RE = /[\/\-T:]/;

  function parseFlexibleDate(raw) {
    if (raw == null) return NaN;
    const s = String(raw).trim();
    if (!s) return NaN;
    const nativeMs = Date.parse(s);
    if (!isNaN(nativeMs)) return nativeMs;
    const iso = s.match(ISO_LIKE_RE);
    if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3], iso[4] ? +iso[4] : 0, iso[5] ? +iso[5] : 0, iso[6] ? +iso[6] : 0);
    const us = s.match(US_LIKE_RE);
    if (us) { let y = +us[3]; if (y < 100) y += 2000; return Date.UTC(y, +us[1] - 1, +us[2], us[4] ? +us[4] : 0, us[5] ? +us[5] : 0, us[6] ? +us[6] : 0); }
    return NaN;
  }
  function splitKeys(cell) { return String(cell || "").split(/[;,]+/).map(x => x.trim()).filter(Boolean); }

  function parsePairs(text) {
    const rawLines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    const lines = [];
    for (let i = 0; i < rawLines.length; i++) { if (rawLines[i].trim()) lines.push({ lineNo: i + 1, raw: rawLines[i] }); }
    const out = [];
    let pendingDate = null, pendingDateMs = NaN;
    for (const line of lines) {
      let parts;
      if (line.raw.indexOf("\t") !== -1) parts = line.raw.split("\t");
      else if (line.raw.indexOf(",") !== -1 && DATE_HINT_RE.test(line.raw)) parts = line.raw.split(/,(.+)/, 2).filter(x => x !== undefined);
      else parts = [line.raw];
      parts = parts.map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const aMs = parseFlexibleDate(parts[0]), bMs = parseFlexibleDate(parts[1]);
        let dateStr, keysCell;
        if (!isNaN(aMs) && isNaN(bMs)) { dateStr = parts[0]; keysCell = parts[1]; }
        else if (isNaN(aMs) && !isNaN(bMs)) { dateStr = parts[1]; keysCell = parts[0]; }
        else if (!isNaN(aMs) && !isNaN(bMs)) { dateStr = parts[0]; keysCell = parts[1]; }
        else { out.push({ lineNo: line.lineNo, keys: [], dateStr: parts[0], parsedMs: NaN, error: "No parseable date on line" }); continue; }
        const keys = splitKeys(keysCell);
        if (!keys.length) { out.push({ lineNo: line.lineNo, keys: [], dateStr, parsedMs: parseFlexibleDate(dateStr), error: "No key value(s) on line" }); continue; }
        out.push({ lineNo: line.lineNo, keys, dateStr, parsedMs: parseFlexibleDate(dateStr), error: null });
        pendingDate = null; pendingDateMs = NaN;
        continue;
      }
      const only = parts[0] || "";
      const onlyMs = parseFlexibleDate(only);
      if (!isNaN(onlyMs)) { pendingDate = only; pendingDateMs = onlyMs; continue; }
      const keys = splitKeys(only);
      if (!keys.length) continue;
      if (!pendingDate) { out.push({ lineNo: line.lineNo, keys, dateStr: "", parsedMs: NaN, error: "Keys with no preceding date" }); continue; }
      out.push({ lineNo: line.lineNo, keys, dateStr: pendingDate, parsedMs: pendingDateMs, error: null });
    }
    return out;
  }
  function dedupeKeepEarliest(entries) {
    const map = new Map(); const errors = []; let expandedCount = 0, dedupedCount = 0;
    for (const e of entries) {
      if (e.error) { errors.push(e); continue; }
      if (isNaN(e.parsedMs)) { errors.push(Object.assign({}, e, { error: "Unrecognized date/time" })); continue; }
      for (const k of e.keys) {
        expandedCount++;
        const existing = map.get(k);
        if (!existing) { map.set(k, { key: k, dateStr: e.dateStr, parsedMs: e.parsedMs }); continue; }
        dedupedCount++;
        if (e.parsedMs < existing.parsedMs) map.set(k, { key: k, dateStr: e.dateStr, parsedMs: e.parsedMs });
      }
    }
    return { map, errors, dedupedCount, expandedCount };
  }

  registry.register({
    id: "wgsTranscripts",
    label: "WGS Transcripts",
    description: "Paste pairs of key value and minimum date. Runs one search across the selected range and keeps only calls strictly after each row's paired threshold.",
    columns: [{ key: "pairedThreshold", label: "Paired Threshold" }],

    buildConfig(container, ctx) {
      const el = ctx.el;
      const metadataFields = ctx.metadataFields || [];
      container.appendChild(el("div", { style: "font-size:13px;font-weight:600;color:#374151;margin:10px 0 6px;" }, "Paired Input"));
      const keyWrap = el("div", { style: "flex:1;min-width:220px;margin-bottom:8px;" });
      keyWrap.appendChild(el("div", { style: "font-size:11px;color:#6b7280;margin-bottom:4px;" }, "Key field (paired value)"));
      const keyPicker = ctx.makeFieldPicker(metadataFields, DEFAULT_KEY_FIELD);
      keyWrap.appendChild(keyPicker.wrapper);
      container.appendChild(keyWrap);
      container.appendChild(el("div", { style: "font-size:11px;color:#6b7280;margin:6px 0 4px;line-height:1.5;" }, "Paste two side-by-side Excel columns. One column is the date (MM/DD/YYYY, M/D/YYYY, YYYY-MM-DD, ISO Z, etc.), the other is the key value. Column order is auto-detected. Multiple keys can share a single date using ; or , between keys. Alternating layout (date line, key line, ...) also works. Only calls strictly after the paired date are kept."));
      const textarea = el("textarea", { placeholder: "6/22/2026\tG45904915;G48862214\n6/22/2026\tG45801039\n6/29/2026\tG45108973", style: "width:100%;min-height:160px;padding:8px 10px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-family:ui-monospace,Consolas,monospace;font-size:12px;resize:vertical;" });
      container.appendChild(textarea);
      const summary = el("div", { style: "font-size:11px;color:#6b7280;margin-top:6px;line-height:1.5;min-height:16px;white-space:pre-wrap;" });
      container.appendChild(summary);
      function refreshSummary() {
        const entries = parsePairs(textarea.value);
        if (!entries.length) { summary.textContent = ""; return; }
        const { map, errors, dedupedCount, expandedCount } = dedupeKeepEarliest(entries);
        const bits = [map.size.toLocaleString() + " unique key(s) from " + expandedCount.toLocaleString() + " total"];
        if (dedupedCount) bits.push(dedupedCount + " duplicate(s) collapsed to earliest date");
        if (errors.length) bits.push(errors.length + " line(s) with errors");
        summary.textContent = bits.join(" \u2022 ");
      }
      textarea.addEventListener("input", refreshSummary);
      textarea.addEventListener("blur", refreshSummary);
      return {
        getConfig() {
          const entries = parsePairs(textarea.value);
          const { map, errors, dedupedCount, expandedCount } = dedupeKeepEarliest(entries);
          const paired = {}, pairedMs = {};
          for (const [k, v] of map.entries()) { paired[k] = v.dateStr; pairedMs[k] = v.parsedMs; }
          return { keyField: keyPicker.getStorageName() || DEFAULT_KEY_FIELD, dateField: DEFAULT_DATE_FIELD, paired, pairedMs, errors: errors.map(e => ({ lineNo: e.lineNo, keys: e.keys, dateStr: e.dateStr, error: e.error })), dedupedCount, expandedCount };
        }
      };
    },

    validateConfig(config) {
      if (!config || !config.paired || !Object.keys(config.paired).length) { alert("Paste at least one valid key + date pair before running."); return false; }
      if (config.errors && config.errors.length) {
        const preview = config.errors.slice(0, 5).map(e => "Line " + e.lineNo + ": " + e.error + (e.dateStr ? " (date: " + e.dateStr + ")" : "") + (e.keys && e.keys.length ? " (keys: " + e.keys.join(", ") + ")" : "")).join("\n");
        if (!confirm(config.errors.length + " line(s) have errors and will be ignored:\n\n" + preview + (config.errors.length > 5 ? "\n..." : "") + "\n\nProceed with the remaining " + Object.keys(config.paired).length + " valid key(s)?")) return false;
      }
      return true;
    },

    async run(ctx) {
      const eng = ctx.services.searchEngine;
      const getFieldValue = ctx.helpers.getFieldValue;
      const config = ctx.config;
      const keyField = config.keyField || DEFAULT_KEY_FIELD;
      const dateField = config.dateField || DEFAULT_DATE_FIELD;
      const keys = Object.keys(config.paired || {});

      const keywordGroup = { operator: "AND", invertOperator: false, filters: [eng.buildKeywordFilter(keyField, keys, "IN")] };
      const searchFields = ["sourceMediaId", keyField, dateField, OUTPUT_TRANS_ID_FIELD];

      ctx.progress.set(12, "Searching...", keys.length + " key(s)");
      const result = await ctx.runSearch([{ keywordGroup, phraseGroups: [] }], searchFields, {});
      if (result === null) return;
      if (!result.finalRows.length) { ctx.progress.remove(); alert("No results returned from search."); return; }

      const paired = config.paired || {};
      const pairedMs = config.pairedMs || {};
      for (const k of Object.keys(paired)) if (!(k in pairedMs)) { const ms = parseFlexibleDate(paired[k]); if (!isNaN(ms)) pairedMs[k] = ms; }

      const keptRows = [];
      let discardedCount = 0, noPairCount = 0;
      for (const entry of result.finalRows) {
        const keyVal = String(getFieldValue(entry.row, keyField) || "").trim();
        const dateVal = String(getFieldValue(entry.row, dateField) || "").trim();
        if (!keyVal || !(keyVal in pairedMs)) { noPairCount++; continue; }
        const rowMs = parseFlexibleDate(dateVal);
        if (isNaN(rowMs)) { noPairCount++; continue; }
        if (rowMs > pairedMs[keyVal]) { entry.row["_report_pairedThreshold"] = paired[keyVal]; keptRows.push(entry); }
        else discardedCount++;
      }
      if (!keptRows.length) { ctx.progress.remove(); alert("No calls remained after the paired-threshold filter."); return; }

      ctx.progress.set(96, "Preparing results...", keptRows.length + " rows");
      ctx.dispatchToGrid(keptRows, {
        extraColumns: this.columns,
        batchOverrides: { groupMode: "byValue", groupField: keyField, outputFields: [OUTPUT_TRANS_ID_FIELD, keyField, dateField], outputHeaders: ["Trans_Id", "Orig ANI", "Date/Time"] }
      });
      const total = keptRows.length + discardedCount + noPairCount;
      alert("WGS Transcripts complete.\n\nCalls Found: " + total.toLocaleString() + "\nCalls Kept: " + keptRows.length.toLocaleString() + "\nDiscarded (on/before paired date): " + discardedCount.toLocaleString() + (noPairCount ? "\nNo paired threshold for row: " + noPairCount.toLocaleString() : ""));
    }
  });
})();
