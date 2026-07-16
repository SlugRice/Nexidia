//[Last Update: 8:20 PM 7/16/2026]
//##> WGS Transcripts.
//##> Accepts pasted pairs of a key value (default Orig ANI / UDFVarchar115) and a
//##> minimum date threshold. Runs one wide search across the full date window,
//##> then per-row keeps only calls whose recordedDateTime is strictly greater
//##> than the paired threshold for that row's key value. Duplicate keys collapse
//##> to the earliest supplied threshold date.
//##>
//##> Paste is a single textarea. Accepts:
//##>   - Two columns side-by-side (tab or comma between): date and key(s)
//##>   - Semicolon or comma inside the key column for multiple keys on one date
//##>   - Alternating lines (one date, one line of key(s), repeat)
//##> Column order is auto-detected per line: whichever side parses as a date is
//##> the threshold; the other side is the key(s).
(() => {
  const reg = (window.NEXIDIA_TOOLS && window.NEXIDIA_TOOLS.getShared)
    ? window.NEXIDIA_TOOLS.getShared("reportRegistry")
    : null;
  if (!reg) return;
  const getFieldValue = window.NEXIDIA_TOOLS.getShared("reportGetFieldValue");
  const DEFAULT_KEY_FIELD = "UDFVarchar115";
  const DEFAULT_DATE_FIELD = "recordedDateTime";
  const OUTPUT_TRANS_ID_FIELD = "UDFVarchar110";
  const ISO_LIKE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\d{1,2}:(\d{2})(?::(\d{2}))?)?/;
  const US_LIKE_RE = /^(\d{1,2})\d{1,2}\d{2,4}(?:\d{1,2}:(\d{2})(?::(\d{2}))?)?/;
  const DATE_HINT_RE = /[\/\-T:]/;
  //##> Flexible date parser. Handles ISO Z, MM/DD/YYYY, M/D/YYYY, MM-DD-YYYY,
  //##> YYYY-MM-DD, and any of those with an optional trailing time.
  function parseFlexibleDate(raw) {
    if (raw === null || raw === undefined) return NaN;
    const s = String(raw).trim();
    if (!s) return NaN;
    const nativeMs = Date.parse(s);
    if (!isNaN(nativeMs)) return nativeMs;
    const iso = s.match(ISO_LIKE_RE);
    if (iso) {
      const y = +iso[1], mo = +iso[2] - 1, d = +iso[3];
      const hh = iso[4] ? +iso[4] : 0;
      const mm = iso[5] ? +iso[5] : 0;
      const ss = iso[6] ? +iso[6] : 0;
      return Date.UTC(y, mo, d, hh, mm, ss);
    }
    const us = s.match(US_LIKE_RE);
    if (us) {
      const mo = +us[1] - 1, d = +us[2];
      let y = +us[3];
      if (y < 100) y += 2000;
      const hh = us[4] ? +us[4] : 0;
      const mm = us[5] ? +us[5] : 0;
      const ss = us[6] ? +us[6] : 0;
      return Date.UTC(y, mo, d, hh, mm, ss);
    }
    return NaN;
  }
  //##> Splits a key cell on semicolon or comma. Trims and drops blanks.
  function splitKeys(cell) {
    return String(cell || "")
      .split(/[;,]+/)
      .map(x => x.trim())
      .filter(Boolean);
  }
  //##> Turns pasted text into an array of { keys:[...], dateStr, parsedMs, lineNo, error }.
  //##> Handles two layouts:
  //##>   1) Per-line pairs delimited by tab or comma (either column order).
  //##>   2) Alternating lines where a date-only line applies to the following
  //##>      key-only line(s) until the next date-only line.
  function parsePairs(text) {
    const rawLines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    const lines = [];
    for (let i = 0; i < rawLines.length; i++) {
      const trimmed = rawLines[i].trim();
      if (!trimmed) continue;
      lines.push({ lineNo: i + 1, raw: rawLines[i] });
    }
    const out = [];
    let pendingDate = null;
    let pendingDateMs = NaN;
    for (const line of lines) {
      let parts;
      if (line.raw.indexOf("\t") !== -1) {
        parts = line.raw.split("\t");
      } else if (line.raw.indexOf(",") !== -1 && DATE_HINT_RE.test(line.raw)) {
        //##> Only treat a comma as a pair separator when the line also looks
        //##> date-ish; otherwise a comma inside the key column stays intact.
        parts = line.raw.split(/,(.+)/, 2).filter(x => x !== undefined);
      } else {
        parts = [line.raw];
      }
      parts = parts.map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        //##> Auto-detect: whichever side is a date is the threshold.
        const aMs = parseFlexibleDate(parts[0]);
        const bMs = parseFlexibleDate(parts[1]);
        let dateStr, keysCell;
        if (!isNaN(aMs) && isNaN(bMs)) { dateStr = parts[0]; keysCell = parts[1]; }
        else if (isNaN(aMs) && !isNaN(bMs)) { dateStr = parts[1]; keysCell = parts[0]; }
        else if (!isNaN(aMs) && !isNaN(bMs)) { dateStr = parts[0]; keysCell = parts[1]; }
        else {
          out.push({ lineNo: line.lineNo, keys: [], dateStr: parts[0], parsedMs: NaN, error: "No parseable date on line" });
          continue;
        }
        const keys = splitKeys(keysCell);
        if (!keys.length) {
          out.push({ lineNo: line.lineNo, keys: [], dateStr, parsedMs: parseFlexibleDate(dateStr), error: "No key value(s) on line" });
          continue;
        }
        out.push({ lineNo: line.lineNo, keys, dateStr, parsedMs: parseFlexibleDate(dateStr), error: null });
        pendingDate = null;
        pendingDateMs = NaN;
        continue;
      }
      //##> Single-token line. Treat as date if parseable, else as key list
      //##> that inherits the most recent pending date.
      const only = parts[0] || "";
      const onlyMs = parseFlexibleDate(only);
      if (!isNaN(onlyMs)) {
        pendingDate = only;
        pendingDateMs = onlyMs;
        continue;
      }
      const keys = splitKeys(only);
      if (!keys.length) continue;
      if (!pendingDate) {
        out.push({ lineNo: line.lineNo, keys, dateStr: "", parsedMs: NaN, error: "Keys with no preceding date" });
        continue;
      }
      out.push({ lineNo: line.lineNo, keys, dateStr: pendingDate, parsedMs: pendingDateMs, error: null });
    }
    return out;
  }
  //##> Expands the parsed list into individual key->date entries and dedupes,
  //##> keeping the earliest date per key.
  function dedupeKeepEarliest(entries) {
    const map = new Map();
    const errors = [];
    let expandedCount = 0;
    let dedupedCount = 0;
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
  reg.register({
    id: "wgsTranscripts",
    label: "WGS Transcripts",
    description: "Paste pairs of key value and minimum date. Runs one search across the selected range and keeps only calls strictly after each row's paired threshold.",
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
      container.appendChild(el("div", { style: "font-size:13px;font-weight:600;color:#374151;margin:10px 0 6px;" }, "Paired Input"));
      const fieldRow = el("div", { style: "display:flex;gap:10px;margin-bottom:8px;flex-wrap:wrap;" });
      const keyWrap = el("div", { style: "flex:1;min-width:220px;" });
      keyWrap.appendChild(el("div", { style: "font-size:11px;color:#6b7280;margin-bottom:4px;" }, "Key field (paired value)"));
      const keyPicker = makeFieldPicker(metadataFields, DEFAULT_KEY_FIELD);
      keyWrap.appendChild(keyPicker.wrapper);
      fieldRow.appendChild(keyWrap);
      container.appendChild(fieldRow);
      container.appendChild(el("div", { style: "font-size:11px;color:#6b7280;margin:6px 0 4px;line-height:1.5;" },
        "Paste two side-by-side Excel columns. One column is the date (MM/DD/YYYY, M/D/YYYY, YYYY-MM-DD, ISO Z, etc.), the other is the key value. Column order is auto-detected. Multiple keys can share a single date using ; or , between keys. Alternating layout (date line, key line, date line, ...) also works. Only calls strictly after the paired date are kept."
      ));
      const textarea = el("textarea", {
        placeholder: "6/22/2026\tG45904915;G48862214\n6/22/2026\tG45801039\n6/29/2026\tG45108973",
        style: "width:100%;min-height:160px;padding:8px 10px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-family:ui-monospace,Consolas,monospace;font-size:12px;resize:vertical;"
      });
      container.appendChild(textarea);
      const summary = el("div", { style: "font-size:11px;color:#6b7280;margin-top:6px;line-height:1.5;min-height:16px;white-space:pre-wrap;" });
      container.appendChild(summary);
      function refreshSummary() {
        const entries = parsePairs(textarea.value);
        if (!entries.length) { summary.textContent = ""; return; }
        const { map, errors, dedupedCount, expandedCount } = dedupeKeepEarliest(entries);
        const bits = [];
        bits.push(map.size.toLocaleString() + " unique key(s) from " + expandedCount.toLocaleString() + " total");
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
          const paired = {};
          const pairedMs = {};
          for (const [k, v] of map.entries()) {
            paired[k] = v.dateStr;
            pairedMs[k] = v.parsedMs;
          }
          return {
            keyField: keyPicker.getStorageName() || DEFAULT_KEY_FIELD,
            dateField: DEFAULT_DATE_FIELD,
            paired,
            pairedMs,
            errors: errors.map(e => ({ lineNo: e.lineNo, keys: e.keys, dateStr: e.dateStr, error: e.error })),
            dedupedCount,
            expandedCount
          };
        }
      };
    },
    validateConfig(config) {
      if (!config || !config.paired || !Object.keys(config.paired).length) {
        alert("Paste at least one valid key + date pair before running.");
        return false;
      }
      if (config.errors && config.errors.length) {
        const preview = config.errors.slice(0, 5).map(e =>
          "Line " + e.lineNo + ": " + e.error +
          (e.dateStr ? " (date: " + e.dateStr + ")" : "") +
          (e.keys && e.keys.length ? " (keys: " + e.keys.join(", ") + ")" : "")
        ).join("\n");
        const proceed = confirm(
          config.errors.length + " line(s) have errors and will be ignored:\n\n" +
          preview + (config.errors.length > 5 ? "\n..." : "") +
          "\n\nProceed with the remaining " + Object.keys(config.paired).length + " valid key(s)?"
        );
        if (!proceed) return false;
      }
      return true;
    },
    getSearchAugment(config) {
      const keys = Object.keys(config.paired || {});
      const keyField = config.keyField || DEFAULT_KEY_FIELD;
      const dateField = config.dateField || DEFAULT_DATE_FIELD;
      return {
        keywordFilters: [{
          operator: "IN",
          type: "KEYWORD",
          parameterName: keyField,
          value: keys
        }],
        searchFields: [keyField, dateField, OUTPUT_TRANS_ID_FIELD]
      };
    },
    //##> Row-level filter. Kept only when rowDate > pairedThreshold (strict).
    //##> Same-timestamp calls are discarded per business rule.
    filterRows(rows, config) {
      const keyField = config.keyField || DEFAULT_KEY_FIELD;
      const dateField = config.dateField || DEFAULT_DATE_FIELD;
      const paired = config.paired || {};
      const pairedMs = config.pairedMs || {};
      const missingMs = Object.keys(paired).some(k => !(k in pairedMs));
      if (missingMs) {
        for (const k of Object.keys(paired)) {
          const ms = parseFlexibleDate(paired[k]);
          if (!isNaN(ms)) pairedMs[k] = ms;
        }
      }
      const keptRows = [];
      let discardedCount = 0;
      let noPairCount = 0;
      for (const row of rows) {
        const keyVal = String(getFieldValue(row, keyField) || "").trim();
        const dateVal = String(getFieldValue(row, dateField) || "").trim();
        if (!keyVal || !(keyVal in pairedMs)) { noPairCount++; continue; }
        const rowMs = parseFlexibleDate(dateVal);
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
