//[Last Update: 9/8/2026]
(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;

  const registry = api.getShared("reportRegistry");
  if (!registry) return;

  const UCID_FIELD = "UDFVarchar1";
  const TRANSID_FIELD = "UDFVarchar110";
  const UCID_LENGTH = 20;
  const DEFAULT_CALLS_PER_TOPIC = 15;
  const GAP_THRESHOLD_SECONDS = 60;
  const SHOW_TIMESTAMPS = false;
  const CHARS_PER_TOKEN = 3.5;

  const MONTH_CHOICES = 12;
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  /* ---------- ZIP reading (xlsx is a zip of xml) ---------- */

  function readU16(b, o) { return b[o] | (b[o + 1] << 8); }
  function readU32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  function findEndOfCentralDirectory(bytes) {
    const min = Math.max(0, bytes.length - 65557);
    for (let i = bytes.length - 22; i >= min; i--) {
      if (readU32(bytes, i) === 0x06054b50) return i;
    }
    return -1;
  }

  function listZipEntries(bytes) {
    const eocd = findEndOfCentralDirectory(bytes);
    if (eocd === -1) throw new Error("Not a readable .xlsx file.");
    const count = readU16(bytes, eocd + 10);
    let ptr = readU32(bytes, eocd + 16);
    const entries = [];
    const decoder = new TextDecoder("utf-8");
    for (let i = 0; i < count; i++) {
      if (readU32(bytes, ptr) !== 0x02014b50) break;
      const method = readU16(bytes, ptr + 10);
      const compressedSize = readU32(bytes, ptr + 20);
      const nameLength = readU16(bytes, ptr + 28);
      const extraLength = readU16(bytes, ptr + 30);
      const commentLength = readU16(bytes, ptr + 32);
      const localOffset = readU32(bytes, ptr + 42);
      const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLength));
      entries.push({ name, method, compressedSize, localOffset });
      ptr += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== "function") {
      throw new Error("This browser cannot read .xlsx files (DecompressionStream unavailable).");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function readZipEntry(bytes, entry) {
    const nameLength = readU16(bytes, entry.localOffset + 26);
    const extraLength = readU16(bytes, entry.localOffset + 28);
    const start = entry.localOffset + 30 + nameLength + extraLength;
    const raw = bytes.subarray(start, start + entry.compressedSize);
    const out = entry.method === 0 ? raw : await inflateRaw(raw);
    return new TextDecoder("utf-8").decode(out);
  }

  /* ---------- Workbook parsing ---------- */

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("Malformed workbook XML.");
    return doc;
  }

  function localName(node) {
    return node.localName || node.nodeName.replace(/^.*:/, "");
  }

  function childrenNamed(parent, name) {
    const out = [];
    for (let i = 0; i < parent.childNodes.length; i++) {
      const c = parent.childNodes[i];
      if (c.nodeType === 1 && localName(c) === name) out.push(c);
    }
    return out;
  }

  function descendantsNamed(root, name) {
    const out = [];
    const walk = (node) => {
      for (let i = 0; i < node.childNodes.length; i++) {
        const c = node.childNodes[i];
        if (c.nodeType !== 1) continue;
        if (localName(c) === name) out.push(c);
        walk(c);
      }
    };
    walk(root);
    return out;
  }

  function parseSharedStrings(text) {
    if (!text) return [];
    const doc = parseXml(text);
    const items = descendantsNamed(doc.documentElement, "si");
    return items.map((si) => descendantsNamed(si, "t").map((t) => t.textContent || "").join(""));
  }

  function columnLetters(ref) {
    const m = String(ref || "").match(/^([A-Z]+)/i);
    return m ? m[1].toUpperCase() : "";
  }

  function rowNumber(ref) {
    const m = String(ref || "").match(/(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function cellText(cell, sharedStrings) {
    const type = cell.getAttribute("t") || "";
    if (type === "inlineStr") {
      return descendantsNamed(cell, "t").map((t) => t.textContent || "").join("").trim();
    }
    const vNodes = childrenNamed(cell, "v");
    if (!vNodes.length) return "";
    const raw = (vNodes[0].textContent || "").trim();
    if (type === "s") {
      const idx = parseInt(raw, 10);
      return (!isNaN(idx) && sharedStrings[idx] !== undefined) ? String(sharedStrings[idx]).trim() : "";
    }
    return raw;
  }

  function looksLikeUcid(value) {
    return /^\d{20}$/.test(value);
  }

  function extractSuffix(fileName) {
    let name = String(fileName || "");
    const dot = name.lastIndexOf(".");
    if (dot > 0) name = name.slice(0, dot);
    const marker = "analysis - ";
    const pos = name.toLowerCase().indexOf(marker);
    if (pos >= 0) return name.slice(pos + marker.length);
    return name;
  }

  function sanitizeFileName(name) {
    return String(name || "").replace(/[\\/:*?"<>|]/g, "").trim() || "unnamed";
  }

  //##> Workbooks are read once and every UCID on each sheet is kept. The calls
  //##> per topic cap is applied later, at preview and run time, so changing the
  //##> number never requires re-reading the files.
  async function parseWorkbook(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const entries = listZipEntries(bytes);
    const byName = new Map(entries.map((e) => [e.name, e]));

    const workbookEntry = byName.get("xl/workbook.xml");
    if (!workbookEntry) throw new Error("Missing workbook.xml.");

    const relsEntry = byName.get("xl/_rels/workbook.xml.rels");
    const relTargets = new Map();
    if (relsEntry) {
      const relsDoc = parseXml(await readZipEntry(bytes, relsEntry));
      for (const rel of descendantsNamed(relsDoc.documentElement, "Relationship")) {
        let target = rel.getAttribute("Target") || "";
        if (target.startsWith("/")) target = target.slice(1);
        else if (!target.startsWith("xl/")) target = "xl/" + target.replace(/^\.\//, "");
        relTargets.set(rel.getAttribute("Id"), target);
      }
    }

    let sharedStrings = [];
    const sharedEntry = byName.get("xl/sharedStrings.xml");
    if (sharedEntry) sharedStrings = parseSharedStrings(await readZipEntry(bytes, sharedEntry));

    const workbookDoc = parseXml(await readZipEntry(bytes, workbookEntry));
    const sheetNodes = descendantsNamed(workbookDoc.documentElement, "sheet");

    const suffix = extractSuffix(file.name);
    const groups = [];
    const warnings = [];

    for (let si = 0; si < sheetNodes.length; si++) {
      const sheetNode = sheetNodes[si];
      const sheetName = sheetNode.getAttribute("name") || ("Sheet" + (si + 1));

      let ridAttr = null;
      for (let ai = 0; ai < sheetNode.attributes.length; ai++) {
        const a = sheetNode.attributes[ai];
        if (a.name === "r:id" || a.localName === "id") { ridAttr = a.value; break; }
      }

      let target = ridAttr ? relTargets.get(ridAttr) : null;
      if (!target || !byName.has(target)) target = "xl/worksheets/sheet" + (si + 1) + ".xml";
      const sheetEntry = byName.get(target);
      if (!sheetEntry) { warnings.push(sheetName + ": worksheet data not found."); continue; }

      const sheetDoc = parseXml(await readZipEntry(bytes, sheetEntry));
      const rows = descendantsNamed(sheetDoc.documentElement, "row");
      if (!rows.length) continue;

      let ucidColumn = null;
      const headerCells = descendantsNamed(rows[0], "c");
      for (const cell of headerCells) {
        if (cellText(cell, sharedStrings).toLowerCase() === "ucid") {
          ucidColumn = columnLetters(cell.getAttribute("r"));
          break;
        }
      }
      if (!ucidColumn) continue;

      const seen = new Set();
      const ucids = [];
      const malformed = [];

      for (let ri = 1; ri < rows.length; ri++) {
        const rowNode = rows[ri];
        if (rowNumber(rowNode.getAttribute("r")) === 1) continue;

        for (const cell of descendantsNamed(rowNode, "c")) {
          if (columnLetters(cell.getAttribute("r")) !== ucidColumn) continue;
          const value = cellText(cell, sharedStrings).trim();
          if (!value) break;
          if (!looksLikeUcid(value)) { malformed.push(value); break; }
          if (!seen.has(value)) { seen.add(value); ucids.push(value); }
          break;
        }
      }

      if (malformed.length) {
        warnings.push(sheetName + ": skipped " + malformed.length + " value(s) that are not " + UCID_LENGTH + " digits (first: " + malformed[0] + ").");
      }
      if (ucids.length) {
        groups.push({ key: suffix + " - " + sheetName, sourceFile: file.name, topic: sheetName, ucids });
      }
    }

    return { groups, warnings };
  }

  /* ---------- Transcript formatting ---------- */

  function gapLabel(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    return m > 0 ? m + ":" + String(s % 60).padStart(2, "0") : (s % 60) + "s";
  }

  function cleanTranscript(rows) {
    const out = [];
    let lastTs = null;
    let lastSpeaker = null;
    for (const r of rows) {
      const speakerRaw = String(r.Speaker || r.speaker || "").trim().toLowerCase();
      let text = String(r.Text || r.text || "");
      const tsRaw = r.TotalSecondsFromStart !== undefined ? r.TotalSecondsFromStart : r.totalSecondsFromStart;
      const tsParsed = typeof tsRaw === "number" ? tsRaw : (typeof tsRaw === "string" ? parseFloat(tsRaw) : NaN);
      const ts = isNaN(tsParsed) ? null : tsParsed;

      text = text.replace(/<unk>/gi, "").trim().replace(/\s+/g, " ").trim();
      if (!text) { if (ts !== null) lastTs = ts; continue; }

      let speaker = "";
      if (speakerRaw === "agent") speaker = "S1";
      else if (speakerRaw === "customer") speaker = "S2";
      else if (speakerRaw) speaker = "S?";

      if (lastTs !== null && ts !== null) {
        const gap = ts - lastTs;
        if (GAP_THRESHOLD_SECONDS > 0 && gap >= GAP_THRESHOLD_SECONDS) out.push("[GAP " + gapLabel(gap) + "]");
      }

      let line = "";
      if (SHOW_TIMESTAMPS && ts !== null) {
        line = "[" + Math.floor(ts / 60) + ":" + String(Math.floor(ts % 60)).padStart(2, "0") + "] ";
      }
      line += speaker + ": " + text;

      if (out.length && speaker && lastSpeaker === speaker && !out[out.length - 1].startsWith("[GAP")) {
        out[out.length - 1] = out[out.length - 1] + " " + text;
      } else {
        out.push(line);
        lastSpeaker = speaker || null;
      }
      if (ts !== null) lastTs = ts;
    }
    return out.join("\n");
  }

  /* ---------- ZIP writing ---------- */

  function crc32(buf) {
    let crc = ~0;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
    return ~crc >>> 0;
  }

  function makeZip(files) {
    const encoder = new TextEncoder();
    const u16 = (n) => new Uint8Array([n & 255, (n >>> 8) & 255]);
    const u32 = (n) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    for (const f of files) {
      const nameBytes = encoder.encode(f.name);
      const dataBytes = encoder.encode(f.text || "");
      const crc = crc32(dataBytes);
      const local = [u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(dataBytes.length), u32(dataBytes.length), u16(nameBytes.length), u16(0)];
      const localBlob = [...local, nameBytes, dataBytes];
      const localSize = localBlob.reduce((a, p) => a + p.length, 0);
      localParts.push(...localBlob);
      centralParts.push(...[u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(dataBytes.length), u32(dataBytes.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)], nameBytes);
      offset += localSize;
    }
    const centralSize = centralParts.reduce((a, p) => a + p.length, 0);
    const localSizeTotal = localParts.reduce((a, p) => a + p.length, 0);
    const eocd = [u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralSize), u32(localSizeTotal), u16(0)];
    return new Blob([...localParts, ...centralParts, ...eocd], { type: "application/zip" });
  }

  function timestampName() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "_" + p(d.getHours()) + p(d.getMinutes());
  }

  //##> Applies the calls per topic cap to the stored full UCID lists. Called at
  //##> preview time and again at run time so the live number is always honored.
  function applyCap(loadedFiles, callsPerTopic, takeAll) {
    const groups = [];
    for (const entry of loadedFiles) {
      for (const group of entry.groups) {
        const ucids = takeAll ? group.ucids.slice() : group.ucids.slice(0, callsPerTopic);
        if (ucids.length) groups.push({ key: group.key, sourceFile: group.sourceFile, topic: group.topic, ucids });
      }
    }
    return groups;
  }

  //##> Converts a YYYY-MM month value into the first and last calendar day of
  //##> that month. Day zero of the following month is the last day of this one,
  //##> which handles leap years without a lookup table. The current month stops
  //##> at today rather than running out to a future date.
  function monthToRange(value) {
    const m = String(value || "").match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    if (month < 1 || month > 12) return null;
    const pad = (n) => String(n).padStart(2, "0");
    const now = new Date();
    const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;
    const lastDay = isCurrent ? now.getDate() : new Date(year, month, 0).getDate();
    return {
      from: year + "-" + pad(month) + "-01",
      to: year + "-" + pad(month) + "-" + pad(lastDay),
      label: MONTH_NAMES[month - 1] + " " + year,
      partial: isCurrent
    };
  }

  //##> The month list runs backwards from the current month, so each month name
  //##> appears once and always resolves to its most recent occurrence.
  function monthOptions(count) {
    const now = new Date();
    const out = [];
    for (let i = 0; i < count; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      out.push({
        value: year + "-" + String(month).padStart(2, "0"),
        label: MONTH_NAMES[month - 1] + " " + year
      });
    }
    return out;
  }

  function currentMonthValue() {
    const now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  }

  /* ---------- Config panel ---------- */

  function buildConfig(container, helpers) {
    const el = helpers.el;
    const saved = helpers.savedConfig || null;
    const dateControl = helpers.dateControl || null;

    let loadedFiles = saved && Array.isArray(saved.loadedFiles) ? saved.loadedFiles.slice() : [];
    let callsPerTopic = saved && saved.callsPerTopic ? saved.callsPerTopic : DEFAULT_CALLS_PER_TOPIC;
    let takeAll = !!(saved && saved.takeAll);
    let reportMonth = saved && saved.reportMonth ? saved.reportMonth : currentMonthValue();
    let warnings = [];
    let busy = false;

    /* ---- Report month ---- */

    container.appendChild(el("div", { style: "font-size:15px;font-weight:600;margin:10px 0;" }, "Report Month"));

    const monthRow = el("div", { style: "display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;" });
    const monthInput = el("select", { style: "padding:7px 8px;border:1px solid #ccc;border-radius:6px;font-size:13px;background:#fff;cursor:pointer;min-width:170px;" });
    const options = monthOptions(MONTH_CHOICES);
    if (!options.some((o) => o.value === reportMonth)) reportMonth = options[0].value;
    for (const o of options) monthInput.appendChild(el("option", { value: o.value }, o.label));
    monthInput.value = reportMonth;
    const monthNote = el("div", { style: "font-size:11px;color:#6b7280;" }, "");
    monthRow.appendChild(monthInput);
    monthRow.appendChild(monthNote);
    container.appendChild(monthRow);

    if (!dateControl) {
      container.appendChild(el("div", { style: "font-size:11px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;margin-bottom:10px;" },
        "This report cannot set the date range automatically on this version of the hub. Set the From and To dates below by hand."));
    }

    //##> Pushes the selected month onto the hub's own From and To inputs. The hub
    //##> stays the single source of truth for the date range; this report only
    //##> writes to it.
    function pushMonth() {
      const range = monthToRange(monthInput.value);
      if (!range) {
        monthNote.textContent = "Pick a month to set the date range.";
        monthNote.style.color = "#b45309";
        return;
      }
      reportMonth = monthInput.value;
      const tail = range.partial ? " (month to date)" : "";
      if (dateControl) {
        dateControl.setRange(range.from, range.to);
        monthNote.textContent = "Date range set to " + range.from + " through " + range.to + tail + ".";
        monthNote.style.color = "#15803d";
      } else {
        monthNote.textContent = "Set the range below to " + range.from + " through " + range.to + tail + ".";
        monthNote.style.color = "#b45309";
      }
    }

    monthInput.onchange = pushMonth;

    /* ---- Workbooks ---- */

    container.appendChild(el("div", { style: "font-size:15px;font-weight:600;margin:10px 0;" }, "Contact Rate Workbooks"));

    const dropZone = el("div", { style: "border:2px dashed #cbd5e1;border-radius:10px;padding:18px;text-align:center;background:#fff;cursor:pointer;margin-bottom:10px;transition:border-color .15s,background .15s;" });
    const dropTitle = el("div", { style: "font-size:13px;color:#374151;font-weight:600;margin-bottom:4px;" }, "Drop Contact Rate files here, or click to browse");
    const dropHint = el("div", { style: "font-size:11px;color:#6b7280;" }, "Files add to the list. Dropping the same file twice is ignored.");
    dropZone.appendChild(dropTitle);
    dropZone.appendChild(dropHint);

    //##> Determinate progress for the read phase. Workbook parsing is synchronous
    //##> enough per file that a file-by-file counter reads better than a spinner.
    const loadWrap = el("div", { style: "display:none;margin-top:10px;" });
    const loadLabel = el("div", { style: "font-size:11px;color:#1d4ed8;font-weight:600;margin-bottom:5px;" }, "Reading...");
    const loadBarOuter = el("div", { style: "height:6px;background:#e5e7eb;border-radius:999px;overflow:hidden;" });
    const loadBarInner = el("div", { style: "height:100%;width:0%;background:linear-gradient(90deg,#38bdf8,#a78bfa);transition:width .2s;" });
    loadBarOuter.appendChild(loadBarInner);
    loadWrap.appendChild(loadLabel);
    loadWrap.appendChild(loadBarOuter);
    dropZone.appendChild(loadWrap);

    const fileInput = el("input", { type: "file", accept: ".xlsx,.xlsm", multiple: true, style: "display:none;" });
    container.appendChild(dropZone);
    container.appendChild(fileInput);

    const countRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;" });
    countRow.appendChild(el("span", { style: "font-size:12px;color:#374151;font-weight:600;" }, "Calls per topic:"));
    const countInput = el("input", { type: "number", min: 1, max: 10000, value: String(callsPerTopic), style: "width:80px;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;" });
    const allBtn = el("button", { style: "padding:5px 12px;border-radius:7px;border:1px solid #d1d5db;background:#f9fafb;font-size:12px;cursor:pointer;" }, "All");
    const allNote = el("span", { style: "font-size:11px;color:#b45309;font-weight:600;display:none;" }, "Taking every UCID on every sheet.");
    const clearBtn = el("button", { style: "margin-left:auto;padding:5px 12px;border-radius:7px;border:1px solid #ef4444;background:#fff;color:#ef4444;font-size:12px;cursor:pointer;display:none;" }, "Clear All");
    countRow.appendChild(countInput);
    countRow.appendChild(allBtn);
    countRow.appendChild(allNote);
    countRow.appendChild(clearBtn);
    container.appendChild(countRow);

    const summary = el("div", { style: "font-size:12px;color:#6b7280;margin-bottom:8px;" }, "No files loaded.");
    container.appendChild(summary);

    const fileListWrap = el("div", { style: "display:none;margin-bottom:8px;" });
    container.appendChild(fileListWrap);

    const previewWrap = el("div", { style: "display:none;max-height:220px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;background:#fff;margin-bottom:8px;" });
    container.appendChild(previewWrap);

    const warningWrap = el("div", { style: "display:none;font-size:11px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;margin-bottom:8px;white-space:pre-wrap;" });
    container.appendChild(warningWrap);

    function paintAll() {
      allBtn.style.background = takeAll ? "#3b82f6" : "#f9fafb";
      allBtn.style.color = takeAll ? "#fff" : "#374151";
      countInput.disabled = takeAll;
      allNote.style.display = takeAll ? "" : "none";
    }

    function setBusy(on) {
      busy = on;
      loadWrap.style.display = on ? "" : "none";
      dropZone.style.cursor = on ? "default" : "pointer";
      dropZone.style.opacity = on ? "0.75" : "1";
      dropTitle.style.display = on ? "none" : "";
      dropHint.style.display = on ? "none" : "";
      countInput.disabled = on || takeAll;
      allBtn.disabled = on;
      clearBtn.disabled = on;
      monthInput.disabled = on;
    }

    function renderFileList() {
      fileListWrap.innerHTML = "";
      if (!loadedFiles.length) { fileListWrap.style.display = "none"; return; }
      fileListWrap.style.display = "";
      for (const entry of loadedFiles) {
        const topics = entry.groups.length;
        const row = el("div", { style: "display:flex;align-items:center;gap:8px;padding:5px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:7px;margin-bottom:4px;font-size:12px;" });
        row.appendChild(el("div", { style: "flex:1;color:#1d4ed8;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" }, entry.name));
        row.appendChild(el("div", { style: "color:#6b7280;flex-shrink:0;" }, topics + " topic" + (topics === 1 ? "" : "s")));
        const removeBtn = el("span", { style: "cursor:pointer;color:#6b7280;font-size:14px;line-height:1;flex-shrink:0;" }, "\u2715");
        ((key, name) => {
          removeBtn.onclick = () => {
            if (busy) return;
            loadedFiles = loadedFiles.filter((f) => f.key !== key);
            warnings = warnings.filter((w) => w.indexOf(name + " ->") !== 0);
            render();
          };
        })(entry.key, entry.name);
        row.appendChild(removeBtn);
        fileListWrap.appendChild(row);
      }
    }

    function render() {
      renderFileList();
      previewWrap.innerHTML = "";
      clearBtn.style.display = loadedFiles.length ? "" : "none";

      const groups = applyCap(loadedFiles, callsPerTopic, takeAll);
      if (!groups.length) {
        previewWrap.style.display = "none";
        summary.textContent = loadedFiles.length ? "No topics found in the loaded files." : "No files loaded.";
      } else {
        previewWrap.style.display = "";
        const unique = new Set();
        let total = 0;
        for (const g of groups) {
          total += g.ucids.length;
          for (const u of g.ucids) unique.add(u);
          const row = el("div", { style: "display:flex;justify-content:space-between;gap:10px;padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;" });
          row.appendChild(el("div", { style: "flex:1;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" }, g.key));
          row.appendChild(el("div", { style: "color:#6b7280;flex-shrink:0;" }, g.ucids.length + " calls"));
          previewWrap.appendChild(row);
        }
        summary.textContent = loadedFiles.length + " file(s), " + groups.length + " topic(s), " + total + " call slot(s), " + unique.size + " unique UCID(s) to fetch.";
      }

      if (warnings.length) {
        warningWrap.style.display = "";
        warningWrap.textContent = warnings.join("\n");
      } else {
        warningWrap.style.display = "none";
      }
    }

    //##> Files are keyed by name, size and last modified date so the same workbook
    //##> dropped twice is ignored, but a re-saved version of it is treated as new.
    function fileKey(file) {
      return file.name + "::" + file.size + "::" + (file.lastModified || 0);
    }

    async function ingest(fileList) {
      if (busy) return;
      const all = Array.from(fileList || []);
      const candidates = all.filter((f) => /\.xlsx$|\.xlsm$/i.test(f.name));
      if (!candidates.length) {
        alert("Please choose .xlsx workbooks.");
        return;
      }

      const existingKeys = new Set(loadedFiles.map((f) => f.key));
      const fresh = [];
      let duplicates = 0;
      for (const file of candidates) {
        const key = fileKey(file);
        if (existingKeys.has(key)) { duplicates++; continue; }
        existingKeys.add(key);
        fresh.push({ file, key });
      }

      if (!fresh.length) {
        summary.textContent = duplicates + " file(s) already loaded. Nothing added.";
        setTimeout(render, 1600);
        return;
      }

      setBusy(true);
      const newWarnings = [];

      for (let i = 0; i < fresh.length; i++) {
        const { file, key } = fresh[i];
        loadLabel.textContent = "Reading " + (i + 1) + " of " + fresh.length + ": " + file.name;
        loadBarInner.style.width = Math.round((i / fresh.length) * 100) + "%";
        await new Promise((r) => setTimeout(r, 0));

        try {
          const result = await parseWorkbook(file);
          if (!result.groups.length) {
            newWarnings.push(file.name + " -> no sheets with a UCID header were found.");
          }
          loadedFiles.push({ key, name: file.name, groups: result.groups });
          newWarnings.push(...result.warnings.map((w) => file.name + " -> " + w));
        } catch (e) {
          newWarnings.push(file.name + " -> could not be read: " + (e && e.message ? e.message : e));
        }
      }

      loadBarInner.style.width = "100%";
      loadLabel.textContent = "Finishing up...";
      await new Promise((r) => setTimeout(r, 120));

      warnings = warnings.concat(newWarnings);
      if (duplicates) warnings.push(duplicates + " file(s) were already loaded and were skipped.");

      setBusy(false);
      loadBarInner.style.width = "0%";
      render();
    }

    dropZone.onclick = () => { if (!busy) fileInput.click(); };
    dropZone.ondragover = (e) => {
      e.preventDefault();
      if (busy) return;
      dropZone.style.borderColor = "#3b82f6";
      dropZone.style.background = "#eff6ff";
    };
    dropZone.ondragleave = () => { dropZone.style.borderColor = "#cbd5e1"; dropZone.style.background = "#fff"; };
    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.style.borderColor = "#cbd5e1";
      dropZone.style.background = "#fff";
      if (busy) return;
      ingest(e.dataTransfer.files);
    };
    fileInput.onchange = () => { ingest(fileInput.files); fileInput.value = ""; };

    countInput.oninput = () => {
      const v = parseInt(countInput.value, 10);
      if (!isNaN(v) && v > 0) { callsPerTopic = v; takeAll = false; paintAll(); render(); }
    };
    allBtn.onclick = () => { if (busy) return; takeAll = !takeAll; paintAll(); render(); };
    clearBtn.onclick = () => {
      if (busy) return;
      if (loadedFiles.length && !confirm("Clear all loaded workbooks?")) return;
      loadedFiles = [];
      warnings = [];
      callsPerTopic = DEFAULT_CALLS_PER_TOPIC;
      takeAll = false;
      countInput.value = String(DEFAULT_CALLS_PER_TOPIC);
      paintAll();
      render();
    };

    paintAll();
    render();
    pushMonth();

    return {
      getConfig() {
        return {
          callsPerTopic,
          takeAll,
          reportMonth,
          loadedFiles,
          groups: applyCap(loadedFiles, callsPerTopic, takeAll)
        };
      }
    };
  }

  /* ---------- Run ---------- */

  async function run(ctx) {
    const groups = (ctx.config && Array.isArray(ctx.config.groups)) ? ctx.config.groups : [];
    if (!groups.length) { alert("No topics loaded. Add your Contact Rate workbooks and try again."); return; }

    const getFieldValue = ctx.helpers.getFieldValue;
    const uniqueUcids = [...new Set(groups.reduce((acc, g) => acc.concat(g.ucids), []))];

    ctx.progress.set(10, "Resolving UCIDs...", uniqueUcids.length + " unique UCID(s) across " + groups.length + " topic(s)");

    const keywordGroup = {
      operator: "AND",
      invertOperator: false,
      filters: [ctx.builders.buildKeywordFilter(UCID_FIELD, uniqueUcids, "IN")]
    };

    const fields = ["sourceMediaId", "recordeddate", UCID_FIELD, TRANSID_FIELD];
    const searchResult = await ctx.runSearch([{ keywordGroup, phraseGroups: [] }], fields, { transIdField: TRANSID_FIELD });
    if (!searchResult || ctx.isCancelled()) return;

    const legsByUcid = new Map();
    for (const entry of searchResult.finalRows) {
      const row = entry.row || entry;
      const smid = getFieldValue(row, "sourceMediaId");
      if (!smid) continue;
      const ucid = String(getFieldValue(row, UCID_FIELD) || "").trim();
      if (!ucid) continue;
      if (!legsByUcid.has(ucid)) legsByUcid.set(ucid, []);
      legsByUcid.get(ucid).push({
        sourceMediaId: String(smid),
        transId: String(getFieldValue(row, TRANSID_FIELD) || ""),
        recordedDate: String(getFieldValue(row, "recordeddate") || "")
      });
    }

    for (const legs of legsByUcid.values()) {
      legs.sort((a, b) => a.recordedDate.localeCompare(b.recordedDate));
      const seen = new Set();
      const deduped = [];
      for (const leg of legs) {
        if (seen.has(leg.sourceMediaId)) continue;
        seen.add(leg.sourceMediaId);
        deduped.push(leg);
      }
      legs.length = 0;
      legs.push(...deduped);
    }

    const missingUcids = uniqueUcids.filter((u) => !legsByUcid.has(u));

    const fetchItems = [];
    const seenSmids = new Set();
    for (const legs of legsByUcid.values()) {
      for (const leg of legs) {
        if (seenSmids.has(leg.sourceMediaId)) continue;
        seenSmids.add(leg.sourceMediaId);
        fetchItems.push({ sourceMediaId: leg.sourceMediaId, transId: leg.transId });
      }
    }

    if (!fetchItems.length) {
      ctx.progress.set(100, "Nothing to build.", "No calls matched the UCIDs in these workbooks.");
      return;
    }

    ctx.progress.set(35, "Fetching transcripts...", fetchItems.length + " call(s)");

    const transcriptService = ctx.services.transcriptService;
    const phaseResult = await ctx.runTranscriptPhase(fetchItems, {
      analyze(payload) {
        const rows = transcriptService.getTranscriptRows(payload);
        const text = cleanTranscript(rows);
        return { match: rows.length > 0, data: { text } };
      }
    });

    if (ctx.isCancelled() || (phaseResult && phaseResult.abandoned)) return;

    ctx.progress.set(88, "Assembling topic files...", "");

    const records = await ctx.services.jobStore.getAllByIndex("transcripts", "byJob", ctx.jobId);
    const textBySmid = new Map();
    for (const rec of records) {
      const text = (rec.analyzeData && rec.analyzeData.text) ? rec.analyzeData.text : "";
      textBySmid.set(rec.sourceMediaId, {
        text,
        failed: !rec.payloadOk,
        empty: rec.payloadOk && rec.rowCount === 0
      });
    }

    const files = [];
    const usedNames = new Map();
    let totalEntries = 0;

    for (const group of groups) {
      const entries = [];
      for (const ucid of group.ucids) {
        const legs = legsByUcid.get(ucid);
        if (!legs || !legs.length) continue;
        legs.forEach((leg, index) => {
          const label = "UCID: " + ucid + " (Call " + (index + 1) + " of " + legs.length + ")";
          const record = textBySmid.get(leg.sourceMediaId);
          let body = "";
          if (!record) {
            body = "NO RECORD\nSMID:" + leg.sourceMediaId;
          } else if (record.failed) {
            body = "FAILED TO FETCH TRANSCRIPT\nSMID:" + leg.sourceMediaId;
          } else if (record.empty || !record.text.trim()) {
            body = "NO TRANSCRIPT ROWS\nSMID:" + leg.sourceMediaId;
          } else {
            body = record.text.trim();
          }
          const charCount = body.length;
          const block = "Trans_Id=" + leg.transId + "\n" +
            "CharCount=" + charCount + "\n" +
            "EstimatedTokens=" + Math.floor(charCount / CHARS_PER_TOKEN) + "\n\n" +
            body + "\n";
          entries.push("=== " + label + " ===\n" + block);
        });
      }

      if (!entries.length) continue;
      totalEntries += entries.length;

      let baseName = sanitizeFileName(group.key);
      if (usedNames.has(baseName)) {
        const next = usedNames.get(baseName) + 1;
        usedNames.set(baseName, next);
        baseName = baseName + "_" + next;
      } else {
        usedNames.set(baseName, 1);
      }

      let text = "TotalFiles=" + entries.length + "\n";
      for (const entry of entries) text += "\n" + entry + "\n";
      files.push({ name: baseName + ".txt", text });
    }

    if (!files.length) {
      ctx.progress.set(100, "Nothing to build.", "No transcripts were assembled.");
      return;
    }

    ctx.progress.set(95, "Creating ZIP...", files.length + " file(s)");

    const zip = makeZip(files);
    const zipName = "contact_rate_" + timestampName() + ".zip";
    const url = URL.createObjectURL(zip);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = zipName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    let detail = "Topic files: " + files.length + "\nTranscript entries: " + totalEntries;
    if (missingUcids.length) detail += "\nUCIDs with no call found: " + missingUcids.length;
    if (phaseResult && phaseResult.failCount) detail += "\nFailed fetches: " + phaseResult.failCount;
    ctx.progress.set(100, "Done. Downloading " + zipName, detail);
  }

  registry.register({
    id: "contactRate",
    label: "Contact Rate Analysis",
    description: "Takes all the Excel files for the Contact Rate Analysis and creates batched transcripts ready for CoPilot.",
    usesStandardFilters: false,
    buildConfig,
    validateConfig(config) {
      if (!config || !Array.isArray(config.groups) || !config.groups.length) {
        alert("Add at least one Contact Rate workbook before running.");
        return false;
      }
      return true;
    },
    run
  });
})();
