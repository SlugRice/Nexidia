(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;

  const FORCE_TEXT_FIELDS = new Set([
    "UDFVarchar1","UDFVarchar122","UDFVarchar110","UDFVarchar41",
    "UDFVarchar115","UDFVarchar136","UDFVarchar50","UDFVarchar104","UDFVarchar105"
  ]);

  // ── Field value lookup ───────────────────────────────────────────────────
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

  // ── Normalization helpers ────────────────────────────────────────────────
  function normalizeCellText(raw) {
    let s = (raw === null || raw === undefined) ? "" : String(raw);
    s = s.trim();
    if (!s) return "0";
    if (s.includes("*")) return "0";
    if (/^0+$/.test(s)) return "0";
    return s;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function toNumberOrNull(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s || s === "0") return null;
    const n = Number(s);
    return isFinite(n) ? n : null;
  }

  function excelSerialFromDate(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    return (d.getTime() / 86400000) + 25569;
  }

  function secondsFromMillisish(raw) {
    const n = toNumberOrNull(raw);
    if (n === null) return null;
    if (n >= 1000 && n % 1000 === 0) return n / 1000;
    if (n > 86400 * 1000) return Math.round(n / 1000);
    return n;
  }

  function excelSerialFromSeconds(sec) {
    const n = Number(sec);
    return isFinite(n) ? n / 86400 : null;
  }

  function estimateDisplayLen(fieldKey, rawText) {
    const lk = String(fieldKey || "").toLowerCase();
    if (lk === "recordeddatetime") return 18;
    if (lk === "mediafileduration") return 10;
    if (lk === "udfint4") return 6;
    if (lk === "sentimentscore" || lk === "overallsentimentscore") return 6;
    return clamp(String(rawText == null ? "" : rawText).length, 1, 60);
  }

  function isDateTimeField(k) { return String(k || "").toLowerCase() === "recordeddatetime"; }
  function isDurationField(k) { return String(k || "").toLowerCase() === "mediafileduration"; }
  function isHoldField(k) { return String(k || "").toLowerCase() === "udfint4"; }
  function isSentimentField(k) {
    const lk = String(k || "").toLowerCase();
    return lk === "sentimentscore" || lk === "overallsentimentscore";
  }
  function isForceTextField(k) { return FORCE_TEXT_FIELDS.has(String(k || "")); }

  // ── Display formatters (for grid use) ────────────────────────────────────
  //##> DISPLAY FORMATTERS: Used by resultsGrid.js to render human-readable values
  //##> without Excel serial conversion. Keep in sync with Excel cell builders below.
  //##> formatDisplayValue is exposed via shared state as part of the xlsBuilder API.
  function formatDisplayValue(fieldKey, raw) {
    if (!raw || raw === "0") return raw;
    if (isDateTimeField(fieldKey)) {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return raw;
      const mo = d.getMonth() + 1;
      const dy = d.getDate();
      const yr = d.getFullYear();
      const hr = d.getHours();
      const mn = String(d.getMinutes()).padStart(2, "0");
      const ampm = hr >= 12 ? "PM" : "AM";
      const hr12 = hr % 12 || 12;
      return `${mo}/${dy}/${yr} ${hr12}:${mn} ${ampm}`;
    }
    if (isDurationField(fieldKey)) {
      const sec = secondsFromMillisish(raw);
      if (sec === null) return raw;
      const h = Math.floor(sec / 3600);
      const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
      const s = String(Math.floor(sec % 60)).padStart(2, "0");
      return `${h}:${m}:${s}`;
    }
    if (isHoldField(fieldKey)) {
      const sec = secondsFromMillisish(raw);
      if (sec === null) return raw;
      const h = Math.floor(sec / 3600);
      const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
      const s = String(Math.floor(sec % 60)).padStart(2, "0");
      return h > 0 ? `${h}:${m}:${s}` : `${Math.floor(sec / 60)}:${s}`;
    }
    return raw;
  }

  // ── HTML escape ──────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Column group sizing ──────────────────────────────────────────────────
  function buildColGroup(headers, rows, exportFields) {
    const maxLens = headers.map((h) => String(h == null ? "" : h).length);
    for (let ri = 0; ri < rows.length; ri++) {
      const phrases = rows[ri].phrases || [];
      for (let c = 0; c < exportFields.length; c++) {
        const k = exportFields[c];
        let raw;
        if (k.startsWith("__PHRASE_")) {
          raw = normalizeCellText(phrases[parseInt(k.replace(/\D/g, ""), 10) - 1] || "");
        } else {
          raw = normalizeCellText(getFieldValue(rows[ri].row, k));
        }
        maxLens[c] = Math.max(maxLens[c] || 8, estimateDisplayLen(k, raw));
      }
    }
    return "<colgroup>" + maxLens.map((len) =>
      '<col style="width:' + clamp(Math.round(len * 6.5 + 16), 50, 520) + 'px">'
    ).join("") + "</colgroup>";
  }

  // ── Excel cell builder ───────────────────────────────────────────────────
  //##> EXCEL EXPORT: HTML-table XLS format.
  //##> Date/Time: Excel serial + mso-number-format m/d/yyyy h:mm
  //##> Duration: serial (seconds/86400) + mso-number-format h:mm:ss (no brackets - calls never exceed 24h)
  //##> Hold Time: integer seconds displayed as h:mm:ss
  //##> Sentiment: decimal 2dp
  //##> Force-text fields: x:str prevents scientific notation on long digit strings
  //##> normalizeCellText: blank/asterisk/all-zeros -> "0", no empty cells
  //##> Freeze pane row 1 via MSO XML workbook block
  //##> Search column prepended only when 2+ distinct phrase labels exist across results
  function buildCell(k, raw, phrases) {
    if (k.startsWith("__PHRASE_")) {
      const idx = parseInt(k.replace(/\D/g, ""), 10) - 1;
      const val = normalizeCellText(phrases && phrases[idx] ? phrases[idx] : "");
      return '<td x:str="' + escapeHtml(val) + '">' + escapeHtml(val) + "</td>";
    }
    if (isDateTimeField(k)) {
      if (raw === "0") return '<td class="dt" x:num="0">0</td>';
      const serial = excelSerialFromDate(new Date(raw));
      if (serial === null) return '<td class="dt" x:str="' + escapeHtml(raw) + '">' + escapeHtml(raw) + "</td>";
      return '<td class="dt" x:num="' + serial + '">' + serial + "</td>";
    }
    if (isDurationField(k)) {
      if (raw === "0") return '<td class="dur" x:num="0">0</td>';
      const sec = secondsFromMillisish(raw);
      const serial = sec === null ? null : excelSerialFromSeconds(sec);
      if (serial === null) return '<td class="dur" x:str="' + escapeHtml(raw) + '">' + escapeHtml(raw) + "</td>";
      return '<td class="dur" x:num="' + serial + '">' + serial + "</td>";
    }
    if (isHoldField(k)) {
      if (raw === "0") return '<td class="int" x:num="0">0</td>';
      const sec = secondsFromMillisish(raw);
      if (sec === null) return '<td class="int" x:num="0">0</td>';
      const n = String(Math.round(sec));
      return '<td class="int" x:num="' + n + '">' + n + "</td>";
    }
    if (isSentimentField(k)) {
      if (raw === "0") return '<td class="dec2" x:num="0">0</td>';
      const n0 = toNumberOrNull(raw);
      if (n0 === null) return '<td x:str="' + escapeHtml(raw) + '">' + escapeHtml(raw) + "</td>";
      return '<td class="dec2" x:num="' + n0 + '">' + n0 + "</td>";
    }
    if (isForceTextField(k)) {
      return '<td x:str="' + escapeHtml(raw) + '">' + escapeHtml(raw) + "</td>";
    }
    return "<td>" + escapeHtml(raw) + "</td>";
  }

  // ── Excel HTML builder ───────────────────────────────────────────────────
  function buildExcelHtml(exportHeaders, exportFields, finalRows, phraseKeys) {
    const css = [
      "table{border-collapse:collapse}",
      'td,th{padding:4px 8px;font-family:"Aptos Narrow","Aptos",Calibri,Arial,sans-serif;font-size:10pt;text-align:left;vertical-align:bottom;white-space:nowrap;border:none}',
      "th{font-weight:700}",
      '.dt{mso-number-format:"m\\/d\\/yyyy\\ h\\:mm"}',
      '.dur{mso-number-format:"h\\:mm\\:ss"}',
      '.int{mso-number-format:"0"}',
      '.dec2{mso-number-format:"0.00"}'
    ].join("");

    const colGroup = buildColGroup(exportHeaders, finalRows, exportFields);
    const headerCells = exportHeaders.map((h) => "<th>" + escapeHtml(h) + "</th>").join("");
    const bodyRows = finalRows.map((item) => {
      const r = item.row;
      const phrases = item.phrases;
      const tds = exportFields.map((k) => {
        const raw = k.startsWith("__PHRASE_") ? "" : normalizeCellText(getFieldValue(r, k));
        return buildCell(k, raw, phrases);
      }).join("");
      return "<tr>" + tds + "</tr>";
    }).join("\n");

    return '<?mso-application progid="Excel.Sheet"?>' +
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8"/><style>' + css + "</style>" +
      "<xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Results</x:Name>" +
      "<x:WorksheetOptions><x:FreezePanes/><x:FrozenNoSplit/><x:SplitHorizontal>1</x:SplitHorizontal>" +
      "<x:TopRowBottomPane>1</x:TopRowBottomPane><x:ActivePane>2</x:ActivePane>" +
      "</x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml>" +
      "</head><body><table>" + colGroup + "<tr>" + headerCells + "</tr>" + bodyRows + "</table></body></html>";
  }

  // ── Download trigger ─────────────────────────────────────────────────────
  function downloadExcelFile(filename, html) {
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  //##> SHARED XLS BUILDER: Exposed via api.setShared so resultsGrid.js can call
  //##> buildExcelHtml and downloadExcelFile directly without duplicating cell
  //##> formatting logic. Also exposes formatDisplayValue for human-readable grid
  //##> rendering of dates and durations. Any module needing Excel output or
  //##> formatted display values should read this from shared state, not reimplement.
  api.setShared("xlsBuilder", {
    buildExcelHtml,
    downloadExcelFile,
    formatDisplayValue,
    normalizeCellText,
    getFieldValue
  });

  // ── Open metadata export ─────────────────────────────────────────────────
  function openMetadataExport() {
    try {
      const data = api.getShared("lastSearchResult");
      if (!data || !Array.isArray(data.rows) || !data.rows.length) {
        alert("No search results available. Run a search first.");
        return;
      }

      const colPrefs = api.getShared("columnPrefs");
      if (!colPrefs || !Array.isArray(colPrefs.fields) || !colPrefs.fields.length) {
        alert("Column preferences not loaded. Try again or relaunch from the legacy Nexidia page.");
        return;
      }

      const hiddenFields = api.getShared("hiddenFields") || new Set(["sourceMediaId"]);

      const visibleFields = colPrefs.fields.filter((f) => !hiddenFields.has(f));
      const visibleHeaders = colPrefs.headers.filter((_, i) => !hiddenFields.has(colPrefs.fields[i]));

      let exportFields = visibleFields;
      let exportHeaders = visibleHeaders;
      const phraseKeys = [];

      if (data.includePhraseCol) {
        const phraseHeaders = [];
        for (let i = 1; i <= data.maxPhraseCols; i++) {
          phraseHeaders.push(i === 1 ? "Search" : "Search" + i);
          phraseKeys.push("__PHRASE_" + i + "__");
        }
        exportHeaders = phraseHeaders.concat(visibleHeaders);
        exportFields = phraseKeys.concat(visibleFields);
      }

      const html = buildExcelHtml(exportHeaders, exportFields, data.rows, phraseKeys);
      const stamp = new Date().toISOString().replace(/[:]/g, "-").replace(/\..+$/, "");
      downloadExcelFile("nexidia_export_" + stamp + ".xls", html);

    } catch (err) {
      console.error(err);
      alert("Export failed. Check console for details.");
    }
  }

  api.registerTool({ id: "metadataExport", label: "Metadata Export", hidden: true, open: openMetadataExport });
})();
