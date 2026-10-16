//[Last Update: 1:41 PM 10/16/2026]
//[Please confirm this timestamp in your response any time it was formed using this document!]
(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;
  const PROMPT_URL = "https://raw.githubusercontent.com/SlugRice/Nexidia/main/docs/PromptBuilder.txt";
  const SEARCH_URL = "https://apug01.nxondemand.com/NxIA/api-gateway/explore/api/v1.0/search";
  const FIELDS_URL = "https://apug01.nxondemand.com/NxIA/api-gateway/explore/api/v1.0/metadata/fields/names";
  const PLAYER_URL = (smid) => `https://apug01.nxondemand.com/NxIA/ui/explore/(search//player:player/${encodeURIComponent(smid)})`;
  const DB_NAME = "nexidia_unpack";
  const DB_STORE = "sessions";
  //##> INCOMING DELIMITER: CoPilot outputs always stack values with semicolons. Incoming values are
  //##> always split on this, no matter what display delimiter the user picks in Unpack Settings.
  //##> The display delimiters (basicDelim / proseDelim) are only used when joining for the grid and export.
  const INCOMING_DELIM = ";";
  const TRANS_FIELD = "UDFVarchar110";
  const TRANS_ALIASES = ["trans_id", "transid", "trans id"];
  //##> MERGE MATCHING: Column names are compared after removing case, spaces, and symbols. Close
  //##> matches (up to 2 letters different) only count when both names are at least FUZZY_MIN_LENGTH
  //##> characters, so short names like DOS and DOB never match. KNOWN_PAIRS are names that mean the
  //##> same thing but don't look alike.
  const FUZZY_MIN_LENGTH = 6;
  const FUZZY_MAX_DISTANCE = 2;
  const KNOWN_PAIRS = [
  ["notes", "summary"],
  ["tin", "providertaxid"]
  ];
  const ROW_HEIGHT = 28;
  const BUFFER_ROWS = 20;
  const DEFAULT_COL_W = 150;
  const COL0_W = 36;
  const COL1_W = 44;
  const PLAY_COL_W = 28;
  const PALETTE = ["#fde68a", "#fecaca", "#bbf7d0", "#bfdbfe", "#ddd6fe", "#fbcfe8", "#fed7aa", "#a5f3fc", "#d9f99d", "#e5e7eb"];
  const NO_FILL_STYLE = "background:linear-gradient(to top right,#fff calc(50% - 1px),#ef4444 50%,#fff calc(50% + 1px));";
  const BASIC_RULES = [["majority", "Majority Rule"], ["listDedup", "List All (deduped)"], ["listAll", "List All (not deduped)"], ["first", "Show First"], ["last", "Show Last"]];
  const NO_MAJORITY_RULES = [["first", "List the first value only"], ["last", "List the last value only"], ["all", "List all values"]];
  const PROSE_RULES = [["listAll", "List All"], ["first", "Show First"], ["last", "Show Last"]];
  const HL_COLS = [["majority", "Majority Selected"], ["noMajority", "No Majority"], ["first", "First Only"], ["last", "Last Only"], ["all", "Listing All"]];
  const HL_ROWS = [["basic", "Basic Values"], ["prose", "Prose Values"]];
  const PROSE_HL_ALLOWED = new Set(["first", "last", "all"]);
  const TYPES = [["auto", "Auto Detect"], ["text", "Text"], ["prose", "Prose"], ["boolean", "Boolean"], ["categorical", "Categorical"], ["identifier", "Identifier"], ["number", "Number"], ["currency", "Currency"], ["date", "Date"], ["timestamp", "Timestamp"]];
  const TYPE_LABELS = Object.fromEntries(TYPES);
  const NULL_EQ = [["zero", "0 = blank"], ["zeros", "All-zero groupings = blank"], ["null", "null = blank"], ["false", "false = blank"], ["na", "N/A = blank"]];
  const KNOWN_MESSAGES = [/^no transcripts found\.?$/i, /^no file attached\.?$/i, /^no matches found\.?$/i];
  const OP_LIST = [["hideempty", "Hide Empty"], ["showempty", "Show Empty Only"], ["contains", "Contains"], ["notcontains", "Does Not Contain"], ["exact", "Exact Match"], ["startswith", "Starts With"], ["endswith", "Ends With"], ["gt", "Greater Than"], ["lt", "Less Than"], ["eq", "Equal To"], ["between", "Between"]];
  const NO_VALUE_OPS = new Set(["hideempty", "showempty"]);
  const TWO_VALUE_OPS = new Set(["between"]);
  const FONT = "font-family:Segoe UI,Arial,sans-serif;";

  const el = (tag, props, ...children) => {
    props = props || {};
    const node = document.createElement(tag);
    Object.assign(node, props);
    for (const ch of children) {
      if (ch === null || ch === undefined || ch === false) continue;
      node.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
    }
    return node;
  };
  const btnStyle = (color, extra) => `padding:6px 10px;border-radius:8px;border:1px solid ${color};background:#fff;color:${color};cursor:pointer;font-size:12px;flex-shrink:0;${extra || ""}`;
  const PRIMARY_BTN = "padding:9px 14px;border-radius:8px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:13px;font-weight:600;cursor:pointer;";
  const PLAIN_BTN = "padding:9px 14px;border-radius:8px;border:1px solid #d1d5db;background:#f9fafb;color:#111827;font-size:13px;cursor:pointer;";

  function splitTokens(v, delim) {
    if (v === null || v === undefined) return [];
    return String(v).split(delim).map((s) => s.trim()).filter(Boolean);
  }
  function dedupeTokens(tokens) {
    const seen = new Set();
    const out = [];
    for (const t of tokens) {
      const k = t.toLowerCase();
      if (!seen.has(k)) { seen.add(k); out.push(t); }
    }
    return out;
  }
  function dedupeExact(values) {
    const seen = new Set();
    const out = [];
    for (const v of values) { if (!seen.has(v)) { seen.add(v); out.push(v); } }
    return out;
  }
  function mergeIncoming(a, b) {
    if (a === null || a === undefined || a === "") return b;
    if (b === null || b === undefined || b === "") return a;
    return dedupeTokens([...splitTokens(a, INCOMING_DELIM), ...splitTokens(b, INCOMING_DELIM)]).join(INCOMING_DELIM);
  }
  function isEmptyValue(v) {
    return v === null || v === undefined || String(v).trim() === "";
  }
  function preview(text) {
    const t = String(text || "").trim();
    if (t.length <= 100) return t;
    return t.slice(0, 60) + " ... " + t.slice(-30);
  }
  function joinNames(list) {
    if (list.length === 1) return list[0];
    return list.join(", ") + ",";
  }
  function normName(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > FUZZY_MAX_DISTANCE) return FUZZY_MAX_DISTANCE + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function namesMatch(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    if (KNOWN_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x))) return true;
    return a.length >= FUZZY_MIN_LENGTH && b.length >= FUZZY_MIN_LENGTH && editDistance(a, b) <= FUZZY_MAX_DISTANCE;
  }
  function pairKey(a, b) {
    return [a, b].sort().join("|");
  }

  //##> VALIDATION: Every pasted line is checked before anything reaches the grid. Truncation is the
  //##> known failure mode for CoPilot outputs (the response stops before the final closing bracket).
  //##> A line is treated as truncated if it doesn't end with } or ], or if a brace or quote is still
  //##> open when the line ends. Good lines in the same paste are still accepted.
  function stripFence(t) {
    return t.replace(/^```(?:json|jsonl)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  function scanObjects(text) {
    const objects = [];
    let depth = 0, start = -1, inQ = false, esc = false, stray = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inQ = false;
        continue;
      }
      if (c === '"') { if (depth === 0) stray = true; inQ = true; continue; }
      if (c === "{") { if (depth === 0) start = i; depth++; }
      else if (c === "}") {
        depth--;
        if (depth < 0) { stray = true; depth = 0; start = -1; }
        else if (depth === 0 && start >= 0) { objects.push(text.slice(start, i + 1)); start = -1; }
      } else if (depth === 0 && !/[\s,\[\]]/.test(c)) stray = true;
    }
    return { objects, open: depth > 0 || inQ, stray };
  }
  function parseObject(src) {
    const body = src.slice(1, -1);
    let p = 0;
    const pairs = [];
    const index = new Map();
    const dups = [];
    const ws = () => { while (p < body.length && /\s/.test(body[p])) p++; };
    function readString() {
      if (body[p] !== '"') return null;
      p++;
      let out = "";
      while (p < body.length) {
        const c = body[p];
        if (c === "\\") {
          p++;
          const e = body[p];
          if (e === "u") {
            const h = body.substr(p + 1, 4);
            if (!/^[0-9a-fA-F]{4}$/.test(h)) return null;
            out += String.fromCharCode(parseInt(h, 16));
            p += 5;
            continue;
          }
          const map = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
          out += map[e] !== undefined ? map[e] : (e === undefined ? "" : e);
          p++;
          continue;
        }
        if (c === '"') { p++; return out; }
        out += c;
        p++;
      }
      return null;
    }
    function readValue() {
      const c = body[p];
      if (c === '"') { const s = readString(); return s === null ? { ok: false } : { ok: true, v: s }; }
      if (c === "{" || c === "[") {
        const s = p;
        let d = 0, inQ = false, esc = false;
        for (; p < body.length; p++) {
          const ch = body[p];
          if (inQ) {
            if (esc) esc = false;
            else if (ch === "\\") esc = true;
            else if (ch === '"') inQ = false;
            continue;
          }
          if (ch === '"') inQ = true;
          else if (ch === "{" || ch === "[") d++;
          else if (ch === "}" || ch === "]") {
            d--;
            if (d === 0) { p++; return { ok: true, v: body.slice(s, p) }; }
          }
        }
        return { ok: false };
      }
      const s = p;
      while (p < body.length && body[p] !== ",") p++;
      const raw = body.slice(s, p).trim();
      if (!raw) return { ok: false };
      return { ok: true, v: raw.toLowerCase() === "null" ? null : raw };
    }
    for (;;) {
      ws();
      if (p >= body.length) break;
      const key = readString();
      if (key === null) return { error: "expected a quoted key" };
      ws();
      if (body[p] !== ":") return { error: `missing colon after "${key}"` };
      p++;
      ws();
      const val = readValue();
      if (!val.ok) return { error: `the value for "${key}" could not be read` };
      const lk = key.toLowerCase();
      if (index.has(lk)) {
        const pr = pairs[index.get(lk)];
        pr[1] = mergeIncoming(pr[1], val.v);
        dups.push(key);
      } else {
        index.set(lk, pairs.length);
        pairs.push([key, val.v]);
      }
      ws();
      if (p >= body.length) break;
      if (body[p] !== ",") return { error: "expected a comma between values" };
      p++;
    }
    if (!pairs.length) return { error: "no values were found" };
    return { pairs, dups };
  }
  function validateLine(line) {
    const t = stripFence(String(line || "").trim());
    if (!t) return { status: "blank" };
    if (KNOWN_MESSAGES.some((r) => r.test(t))) return { status: "message", message: t };
    const scan = scanObjects(t);
    if (scan.open || !/[}\]]$/.test(t)) return { status: "truncated" };
    if (!scan.objects.length) return { status: "invalid", message: "no JSON objects were found" };
    if (scan.stray) return { status: "invalid", message: "it contains text outside of the JSON objects" };
    const objects = [];
    let dups = 0;
    for (let i = 0; i < scan.objects.length; i++) {
      const r = parseObject(scan.objects[i]);
      if (r.error) return { status: "invalid", message: `object ${i + 1} failed because ${r.error}` };
      objects.push(r.pairs);
      dups += r.dups.length;
    }
    return { status: "ok", objects, dups };
  }

  //##> TYPE DETECTION: Types are inferred from the values, never from the JSONL. Re-run on every
  //##> derive, so a Boolean column that later receives a "3" drops to Number on its own. Prose is
  //##> decided by the first 10 values (3+ spaces, majority). Categorical waits for 100+ values.
  //##> A user-selected type always wins over detection.
  function parseTimestampToken(value, fallbackLabel) {
    const raw = String(value || "").trim();
    const at = raw.lastIndexOf("@");
    const label = at > 0 ? raw.slice(0, at).trim() : (fallbackLabel || "Timestamp");
    const time = at > 0 ? raw.slice(at + 1).trim() : raw;
    const m = time.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1] || 0), min = Number(m[2]), sec = Number(m[3]);
    if (min > 59 || sec > 59) return null;
    return { label, ms: (h * 3600 + min * 60 + sec) * 1000 };
  }
  function timestampTokens(value, fallbackLabel) {
    return splitTokens(value, INCOMING_DELIM).map((v) => parseTimestampToken(v, fallbackLabel)).filter(Boolean);
  }
  function detectType(values) {
    if (!values.length) return "text";
    if (values.length >= 3 && values.every((v) => {
      const tokens = splitTokens(v, INCOMING_DELIM);
      return tokens.length && tokens.every((t) => parseTimestampToken(t));
    })) return "timestamp";
    const sample = values.slice(0, 10);
    const proseHits = sample.filter((v) => (v.match(/ /g) || []).length >= 3).length;
    if (proseHits * 2 > sample.length) return "prose";
    if (values.every((v) => v === "0" || v === "1")) return "boolean";
    const toks = [];
    for (const v of values) for (const t of splitTokens(v, INCOMING_DELIM)) toks.push(t);
    const real = toks.filter((t) => t !== "0");
    if (real.length) {
      if (real.every((t) => /^\$-?[\d,]+(\.\d+)?$/.test(t))) return "currency";
      if (real.every((t) => /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t) || /^\d{4}-\d{2}-\d{2}/.test(t))) return "date";
      if (real.every((t) => /^[A-Za-z]{0,2}\d{7,}[A-Za-z]?$/.test(t) || /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(t))) return "identifier";
      if (real.every((t) => /^-?\d+(\.\d+)?$/.test(t))) return "number";
    }
    if (values.length >= 100) {
      const distinct = new Set(values.map((v) => v.toLowerCase())).size;
      if (distinct <= 25 && distinct / values.length < 0.1) return "categorical";
    }
    return "text";
  }

  function parseDelimited(text) {
    const head = text.split(/\r?\n/, 5).join("\n");
    const delim = (head.match(/\t/g) || []).length > (head.match(/,/g) || []).length ? "\t" : ",";
    const rows = [];
    let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
        continue;
      }
      if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c !== "\r") cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function parseSpreadsheetML(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const sheets = [];
    const wsList = doc.getElementsByTagNameNS("*", "Worksheet");
    for (let w = 0; w < wsList.length; w++) {
      const ws = wsList[w];
      const name = ws.getAttribute("ss:Name") || "Sheet " + (w + 1);
      const rows = [];
      const rowEls = ws.getElementsByTagNameNS("*", "Row");
      for (let r = 0; r < rowEls.length; r++) {
        const rEl = rowEls[r];
        const ri = Number(rEl.getAttribute("ss:Index") || 0);
        if (ri) while (rows.length < ri - 1) rows.push([]);
        const cells = [];
        const cellEls = rEl.getElementsByTagNameNS("*", "Cell");
        for (let c = 0; c < cellEls.length; c++) {
          const cEl = cellEls[c];
          const ci = Number(cEl.getAttribute("ss:Index") || 0);
          if (ci) while (cells.length < ci - 1) cells.push("");
          const d = cEl.getElementsByTagNameNS("*", "Data")[0];
          cells.push(d ? d.textContent : "");
        }
        rows.push(cells);
      }
      sheets.push({ name, rows });
    }
    return sheets;
  }
  function parseHtmlTables(text) {
    const doc = new DOMParser().parseFromString(text, "text/html");
    const names = [...text.matchAll(/<x:Name>([^<]*)<\/x:Name>/gi)].map((m) => m[1]);
    return [...doc.querySelectorAll("table")].map((t, i) => ({
      name: names[i] || "Table " + (i + 1),
      rows: [...t.rows].map((tr) => {
        const out = [];
        for (const td of tr.cells) {
          out.push(td.textContent.replace(/\u00a0/g, " ").trim());
          for (let s = 1; s < (td.colSpan || 1); s++) out.push("");
        }
        return out;
      })
    }));
  }
  function isBlankRow(r) {
    return !r || !r.length || r.every((c) => !String(c == null ? "" : c).trim());
  }
  //##> PREAMBLE STRIP: Mirrors the CleanSearchResultsPreamble macro. Forensic exports have a block of
  //##> text above the real header. Scan bottom-up for the last fully blank row and take the row under
  //##> it as the header, but only if that row actually contains a key column name. Otherwise fall back
  //##> to the first row that contains a key column name.
  function findHeaderRow(rows, keyNames) {
    let end = rows.length;
    while (end > 0 && isBlankRow(rows[end - 1])) end--;
    const hasKey = (r) => r && r.some((c) => keyNames.has(String(c == null ? "" : c).trim().toLowerCase()));
    let lastBlank = -1;
    for (let i = end - 1; i >= 0; i--) { if (isBlankRow(rows[i])) { lastBlank = i; break; } }
    if (lastBlank >= 0 && hasKey(rows[lastBlank + 1])) return lastBlank + 1;
    for (let i = 0; i < end; i++) if (hasKey(rows[i])) return i;
    return -1;
  }
  function secondsFromMillisish(raw) {
    const n = Number(String(raw == null ? "" : raw).trim());
    if (!isFinite(n) || !String(raw).trim() || String(raw).trim() === "0") return null;
    if (n >= 1000 && n % 1000 === 0) return n / 1000;
    if (n > 86400 * 1000) return Math.round(n / 1000);
    return n;
  }
  function parseLooseDate(raw) {
    const s = String(raw || "").trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      let y = Number(m[3]);
      if (y < 100) y += 2000;
      return { y, mo: Number(m[1]), d: Number(m[2]) };
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
    return null;
  }

  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((res, rej) => {
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(DB_STORE)) r.result.createObjectStore(DB_STORE, { keyPath: "id" }); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbPromise;
  }
  async function dbTx(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction(DB_STORE, mode);
      const req = fn(tx.objectStore(DB_STORE));
      tx.oncomplete = () => res(req ? req.result : undefined);
      tx.onerror = () => rej(tx.error);
    });
  }
  const dbPut = (rec) => dbTx("readwrite", (st) => st.put(rec)).catch((e) => console.warn("[unpack] save failed", e));
  const dbDel = (id) => dbTx("readwrite", (st) => st.delete(id)).catch((e) => console.warn("[unpack] delete failed", e));
  const dbAll = () => dbTx("readonly", (st) => st.getAll()).catch(() => []);

  function dialog(opts) {
    return new Promise((resolve) => {
      let cb = null, input = null;
      const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000020;display:flex;align-items:center;justify-content:center;" + FONT });
      const box = el("div", { style: `background:#fff;width:${opts.width || 440}px;max-width:94vw;max-height:84vh;overflow:auto;border-radius:12px;padding:22px;box-shadow:0 8px 24px rgba(0,0,0,.3);` });
      const finish = (value) => { overlay.remove(); resolve({ value, checked: cb ? cb.checked : false, input: input ? input.value : null }); };
      if (opts.title) box.appendChild(el("div", { style: `font-size:15px;font-weight:700;color:${opts.danger ? "#b91c1c" : "#111827"};margin-bottom:10px;` }, opts.title));
      if (opts.message) {
        for (const para of String(opts.message).split("\n\n")) box.appendChild(el("div", { style: "font-size:13px;color:#374151;line-height:1.45;margin-bottom:10px;white-space:pre-wrap;" }, para));
      }
      if (opts.list && opts.list.length) {
        const wrap = el("div", { style: "border:1px solid #e5e7eb;border-radius:8px;max-height:260px;overflow-y:auto;margin-bottom:12px;" });
        for (const item of opts.list) {
          const label = typeof item === "string" ? item : item.label;
          const row = el("div", { style: `padding:8px 12px;font-size:12px;border-bottom:1px solid #f1f5f9;color:#111827;word-break:break-all;${opts.listClickable ? "cursor:pointer;" : ""}` }, label);
          if (opts.listClickable) {
            row.onmouseenter = () => { row.style.background = "#e8f0fe"; };
            row.onmouseleave = () => { row.style.background = ""; };
            row.onclick = () => finish(typeof item === "string" ? item : item.value);
          }
          wrap.appendChild(row);
        }
        box.appendChild(wrap);
      }
      if (opts.input) {
        input = el("input", { type: "text", value: opts.input.value || "", placeholder: opts.input.placeholder || "", style: "width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;margin-bottom:12px;" });
        if (opts.input.maxLength) input.maxLength = opts.input.maxLength;
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") finish(opts.input.enterValue !== undefined ? opts.input.enterValue : true); });
        box.appendChild(input);
        setTimeout(() => { input.focus(); input.select(); }, 30);
      }
      if (opts.checkbox) {
        cb = el("input", { type: "checkbox" });
        box.appendChild(el("label", { style: "display:flex;align-items:center;gap:6px;font-size:12px;color:#6b7280;margin-bottom:12px;cursor:pointer;" }, cb, opts.checkbox));
      }
      const btnRow = el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;" });
      for (const b of (opts.buttons || [{ label: "OK", value: true, primary: true }])) {
        const btn = el("button", { style: "flex:1;" + (b.primary ? PRIMARY_BTN : PLAIN_BTN) }, b.label);
        btn.onclick = () => finish(b.value);
        btnRow.appendChild(btn);
      }
      box.appendChild(btnRow);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
  }
  function toast(text, color) {
    const n = el("div", { style: `position:fixed;bottom:20px;right:20px;background:${color || "#22c55e"};color:#fff;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;z-index:1000030;box-shadow:0 4px 12px rgba(0,0,0,.2);transition:opacity 0.3s;` + FONT }, text);
    document.body.appendChild(n);
    setTimeout(() => { n.style.opacity = "0"; setTimeout(() => n.remove(), 300); }, 1800);
  }
  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function stamp() {
    return new Date().toISOString().replace(/[:]/g, "-").replace(/\..+$/, "");
  }
  function defaultSettings() {
    return {
      primaryKey: "Trans_Id",
      combine: true,
      basicRule: "listDedup",
      noMajority: "all",
      basicDelim: ";",
      proseRule: "listAll",
      proseDelim: "|",
      highlight: { basic: {}, prose: {} },
      showConfidence: false,
      autoMeta: true,
      unpackImmediately: true,
      multiTop: false
    };
  }
  function newState() {
    return {
      sessionId: "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      createdAt: Date.now(),
      entries: [],
      nextEntryId: 1,
      pasteCount: 0,
      columns: [],
      nextColId: 1,
      settings: defaultSettings(),
      metaFields: [],
      metaHeaders: {},
      metaAdded: false,
      meta: {},
      metaStatus: {},
      merges: [],
      mergeDismissed: [],
      imports: [],
      removed: [],
      pending: [{ text: "", error: "" }],
      notices: [],
      suppress: {},
      grid: { order: [], visible: [], widths: {}, sorts: [], filters: {}, globalFilter: "", clickMode: "select" }
    };
  }

  function openUnpack() {
    if (document.querySelector("[data-nexidia-unpack]")) return;
    const xls = api.getShared("xlsBuilder");
    const hiddenFields = api.getShared("hiddenFields") || new Set(["sourceMediaId"]);
    let S = newState();
    let rows = [];
    let view = [];
    let selected = new Set();
    let cellSel = new Set();
    let cellAnchor = null;
    let cellDragging = false;
    let playerCtrl = null;
    let stopPlayer = null;
    let activeSmid = null;
    let saveTimer = null;
    let closed = false;
    let metaBusy = false;
    let mergeDialogOpen = false;
    let lastRange = { start: 0, end: 0 };
    let rafPending = false;
    let dragColIndex = null;
    let dragGhost = null;
    let dragPendingIndex = null;
    let bannerDismissed = new Set();

    function getFV(rowObj, key) {
      if (xls && xls.getFieldValue) return xls.getFieldValue(rowObj, key);
      if (!rowObj) return "";
      if (rowObj[key] !== undefined && rowObj[key] !== null) return String(rowObj[key]);
      const lower = String(key).toLowerCase();
      for (const k of Object.keys(rowObj)) if (k.toLowerCase() === lower && rowObj[k] !== null) return String(rowObj[k]);
      return "";
    }
    function colPrefs() {
      return api.getShared("columnPrefs") || { fields: [], headers: [] };
    }

    function colById(id) { return S.columns.find((c) => c.id === id) || null; }
    function aliasMap() {
      const m = new Map();
      for (const c of S.columns) for (const a of c.aliases) m.set(String(a).toLowerCase(), c.id);
      return m;
    }
    function effType(c) { return !c ? "text" : (c.type === "auto" ? c.detected : c.type); }
    function isProse(c) { return effType(c) === "prose"; }
    function isBlank(c, v) {
      if (isEmptyValue(v)) return true;
      const s = String(v).trim();
      const n = (c && c.nullEq) || {};
      if (n.zero && s === "0") return true;
      if (n.zeros && /^0+$/.test(s)) return true;
      if (n.null && s.toLowerCase() === "null") return true;
      if (n.false && s.toLowerCase() === "false") return true;
      if (n.na && /^n\/?a$/i.test(s)) return true;
      return false;
    }
    function isVis(f) { return S.grid.visible.includes(f); }
    function setVis(f, on) {
      const i = S.grid.visible.indexOf(f);
      if (on && i === -1) S.grid.visible.push(f);
      if (!on && i !== -1) S.grid.visible.splice(i, 1);
    }
    function baseHeader(f) {
      if (f === "__conf__") return "Confidence";
      if (f.startsWith("j:")) { const c = colById(f.slice(2)); return c ? c.header : f; }
      if (f.startsWith("m:")) return S.metaHeaders[f.slice(2)] || f.slice(2);
      return f;
    }
    function headerOf(f) { return baseHeader(f); }
    function sourceName(f) { return String(f).startsWith("m:") ? "Nexidia" : "CoPilot"; }

    //##> MERGES: S.merges is a log of { source, target } links between columns. A merged source column
    //##> leaves the grid, and its values are stacked after the target's own values at render time.
    //##> Each column can only be merged into one target, but a target can take in many. Merges chain,
    //##> so a column merged into an already-merged column joins that whole group. Unmerge just removes
    //##> the log entry and puts the column back next to its former target.
    function mergeSourceOf(f, list) { return (list || S.merges).find((m) => m.source === f) || null; }
    function rootOf(f, list) {
      list = list || S.merges;
      for (let g = 0; g < 100; g++) {
        const m = list.find((x) => x.source === f);
        if (!m) return f;
        f = m.target;
      }
      return f;
    }
    function membersOf(f, list, depth) {
      list = list || S.merges;
      depth = depth || 0;
      const out = [f];
      if (depth > 50) return out;
      for (const m of list) if (m.target === f) out.push(...membersOf(m.source, list, depth + 1));
      return out;
    }
    function groupHasMeta(f, list) { return membersOf(f, list).some((x) => x.startsWith("m:")); }
    function groupLabel(f, list) {
      const others = membersOf(f, list).slice(1).map(baseHeader);
      return others.length ? `${baseHeader(f)} \u2190 ${others.join(", ")}` : baseHeader(f);
    }
    function applyMerge(source, target, auto) {
      if (!source || !target || source === target || mergeSourceOf(source)) return false;
      S.merges.push({ id: "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), source, target, auto: !!auto, at: Date.now() });
      const i = S.grid.order.indexOf(source);
      if (i !== -1) S.grid.order.splice(i, 1);
      setVis(source, false);
      delete S.grid.filters[source];
      S.grid.sorts = S.grid.sorts.filter((s) => s.field !== source);
      return true;
    }
    function unmerge(mergeId) {
      const m = S.merges.find((x) => x.id === mergeId);
      if (!m) return;
      S.merges = S.merges.filter((x) => x !== m);
      const k = pairKey(m.source, m.target);
      if (!S.mergeDismissed.includes(k)) S.mergeDismissed.push(k);
      const ti = S.grid.order.indexOf(rootOf(m.target));
      S.grid.order.splice(ti === -1 ? S.grid.order.length : ti + 1, 0, m.source);
      setVis(m.source, true);
      refreshAll();
      toast(baseHeader(m.source) + " unmerged", "#0369a1");
    }
    function mergeableFields() {
      const out = [];
      for (const f of S.metaFields) if (!mergeSourceOf("m:" + f)) out.push("m:" + f);
      for (const c of S.columns) if (!mergeSourceOf("j:" + c.id)) out.push("j:" + c.id);
      return out;
    }

    function ensureColumn(key, map) {
      const lk = String(key).trim().toLowerCase();
      if (map.has(lk)) return map.get(lk);
      const id = "c" + (S.nextColId++);
      S.columns.push({ id, source: key, header: key, aliases: [key], type: "auto", detected: "text", nullEq: {} });
      map.set(lk, id);
      S.grid.order.push("j:" + id);
      S.grid.visible.push("j:" + id);
      return id;
    }
    function ingest(objectList) {
      S.pasteCount++;
      const pasteId = S.pasteCount;
      const map = aliasMap();
      const added = [];
      for (const pairs of objectList) {
        const values = {};
        for (const [k, v] of pairs) {
          const id = ensureColumn(k, map);
          values[id] = id in values ? mergeIncoming(values[id], v) : v;
        }
        const entry = { id: S.nextEntryId++, pasteId, values };
        S.entries.push(entry);
        added.push(entry);
      }
      return added;
    }
    function pkColumn() {
      const lk = String(S.settings.primaryKey || "").trim().toLowerCase();
      if (!lk) return null;
      const id = aliasMap().get(lk);
      return id ? colById(id) : null;
    }
    function transColumn() {
      return S.columns.find((c) => c.aliases.some((a) => normName(a) === "transid")) || null;
    }
    function keyOf(entry, pk) {
      if (!pk) return "";
      const v = entry.values[pk.id];
      return isEmptyValue(v) ? "" : String(v).trim();
    }

    function detectTypes() {
      const vals = new Map(S.columns.map((c) => [c.id, []]));
      for (const e of S.entries) {
        for (const id in e.values) {
          const v = e.values[id];
          if (!isEmptyValue(v) && vals.has(id)) vals.get(id).push(String(v).trim());
        }
      }
      for (const c of S.columns) c.detected = detectType(vals.get(c.id) || []);
    }
    function resolveValues(c, raw) {
      const s = S.settings;
      const present = raw.filter((v) => !isEmptyValue(v)).map((v) => String(v).trim());
      if (!present.length) return { tokens: [] };
      const voting = present.filter((v) => !isBlank(c, v));
      const pool = voting.length ? voting : [present[0]];
      if (isProse(c)) {
        const distinct = dedupeExact(pool);
        if (distinct.length === 1) return { tokens: [distinct[0]] };
        if (s.proseRule === "first") return { tokens: [pool[0]], cat: "first" };
        if (s.proseRule === "last") return { tokens: [pool[pool.length - 1]], cat: "last" };
        return { tokens: distinct, cat: "all" };
      }
      const toks = pool.map((v) => splitTokens(v, INCOMING_DELIM));
      const sig = toks.map((t) => dedupeTokens(t).map((x) => x.toLowerCase()).sort().join("\u0001"));
      const flat = () => [].concat(...toks);
      if (new Set(sig).size === 1) return { tokens: dedupeTokens(toks[0]) };
      switch (s.basicRule) {
        case "first": return { tokens: toks[0], cat: "first" };
        case "last": return { tokens: toks[toks.length - 1], cat: "last" };
        case "listAll": return { tokens: flat(), cat: "all" };
        case "majority": {
          const counts = new Map();
          sig.forEach((k, i) => { if (!counts.has(k)) counts.set(k, { n: 0, i }); counts.get(k).n++; });
          let best = null;
          for (const v of counts.values()) if (!best || v.n > best.n) best = v;
          if (best.n * 2 > sig.length) return { tokens: toks[best.i], cat: "majority" };
          if (s.noMajority === "first") return { tokens: toks[0], cat: "noMajority" };
          if (s.noMajority === "last") return { tokens: toks[toks.length - 1], cat: "noMajority" };
          return { tokens: dedupeTokens(flat()), cat: "noMajority" };
        }
        default: return { tokens: dedupeTokens(flat()), cat: "all" };
      }
    }
    function applyImports(row, imports) {
      for (const imp of imports) {
        if (imp.target.startsWith("m:")) {
          const f = imp.target.slice(2);
          if (!row.over[f]) row.over[f] = imp.value;
          continue;
        }
        const id = imp.target.slice(2);
        const c = colById(id);
        if (!c) continue;
        const cur = row.tok[id] || [];
        if (isProse(c)) {
          if (!cur.some((x) => x.trim() === imp.value.trim())) row.tok[id] = cur.concat([imp.value]);
        } else {
          row.tok[id] = dedupeTokens(cur.concat(splitTokens(imp.value, INCOMING_DELIM)));
        }
      }
    }
    function buildRow(g, importMap) {
      const row = { id: g.id, key: g.key, missing: g.missing, count: g.entries.length, tok: {}, hl: {}, over: {}, cache: {}, meta: null, status: null };
      for (const c of S.columns) {
        const r = resolveValues(c, g.entries.map((e) => e.values[c.id]));
        row.tok[c.id] = r.tokens;
        if (r.cat) {
          const color = S.settings.highlight[isProse(c) ? "prose" : "basic"][r.cat];
          if (color) row.hl[c.id] = color;
        }
      }
      if (g.key && importMap.has(g.key.toLowerCase())) applyImports(row, importMap.get(g.key.toLowerCase()));
      return row;
    }
    function syncConfidenceField(show) {
      const f = "__conf__";
      const inOrder = S.grid.order.includes(f);
      if (show && !inOrder) {
        const firstJ = S.grid.order.findIndex((x) => x.startsWith("j:"));
        S.grid.order.splice(firstJ === -1 ? S.grid.order.length : firstJ, 0, f);
        setVis(f, true);
      } else if (!show && inOrder) {
        S.grid.order.splice(S.grid.order.indexOf(f), 1);
        setVis(f, false);
      }
    }
    //##> DERIVATION: The grid is never edited directly. S.entries (every parsed object, in paste order)
    //##> plus settings, imports, merges, and metadata are the source of truth; derive() rebuilds the rows
    //##> from them. Any settings change just calls derive() again, so nothing has to be re-pasted.
    function derive() {
      detectTypes();
      const pk = pkColumn();
      const s = S.settings;
      const removed = new Set(S.removed);
      const importMap = new Map();
      for (const imp of S.imports) {
        if (!importMap.has(imp.key)) importMap.set(imp.key, []);
        importMap.get(imp.key).push(imp);
      }
      const groups = new Map();
      for (const e of S.entries) {
        const key = keyOf(e, pk);
        const gid = !key ? "e:" + e.id : (s.combine ? "k:" + key.toLowerCase() : "e:" + e.id);
        if (!groups.has(gid)) groups.set(gid, { id: gid, key, missing: !key, entries: [] });
        groups.get(gid).entries.push(e);
      }
      const out = [];
      for (const g of groups.values()) {
        const base = buildRow(g, importMap);
        const lk = g.key.toLowerCase();
        const matches = g.key ? S.meta[lk] : null;
        const status = g.key ? (S.metaStatus[lk] || null) : null;
        if (matches && matches.length > 1 && status === "multi") {
          matches.forEach((m, i) => {
            const r = Object.assign({}, base, { id: base.id + "#" + i, meta: m, status: "multi", cache: {} });
            if (!removed.has(r.id)) out.push(r);
          });
        } else {
          base.meta = matches && matches.length ? matches[0] : null;
          base.status = status;
          if (!removed.has(base.id)) out.push(base);
        }
      }
      out.forEach((r, i) => { r.seq = i; });
      const rank = (r) => (r.status === "missing" ? 0 : (r.status === "multi" && s.multiTop ? 1 : 2));
      out.sort((a, b) => rank(a) - rank(b) || a.seq - b.seq);
      rows = out;
      syncConfidenceField(s.combine && s.showConfidence && rows.some((r) => r.count > 1));
    }

    function delimFor(f) {
      if (f.startsWith("j:") && isProse(colById(f.slice(2)))) return S.settings.proseDelim || "|";
      return S.settings.basicDelim || ";";
    }
    //##> METADATA ZEROS: For calls found in Nexidia, blank, all-zero, and masked (*) metadata values show
    //##> as a single 0, matching the results grid. Calls that weren't found stay blank. When columns are
    //##> merged, a 0 is dropped as soon as any real value is stacked with it.
    function metaOwn(row, k) {
      let v = row.meta ? getFV(row.meta, k) : "";
      v = v == null ? "" : String(v).trim();
      if (row.meta && (!v || /^0+$/.test(v) || v.includes("*"))) v = "0";
      if ((!v || v === "0") && row.over[k]) v = row.over[k];
      return v ? [v] : [];
    }
    function cellParts(row, f, depth) {
      depth = depth || 0;
      if (row.cache[f]) return row.cache[f];
      let own;
      if (f === "__conf__") own = [String(row.count)];
      else if (f.startsWith("j:")) own = row.tok[f.slice(2)] || [];
      else if (f.startsWith("m:")) own = metaOwn(row, f.slice(2));
      else own = [];
      const inbound = depth < 50 ? S.merges.filter((m) => m.target === f) : [];
      let tokens = own;
      if (inbound.length) {
        let all = own.slice();
        for (const m of inbound) all = all.concat(cellParts(row, m.source, depth + 1).tokens);
        all = dedupeTokens(all);
        if (all.some((t) => !/^0+$/.test(t))) all = all.filter((t) => !/^0+$/.test(t));
        tokens = all;
      }
      const res = { tokens, ownFirst: own[0], delim: delimFor(f) };
      row.cache[f] = res;
      return res;
    }
    function cellRaw(row, f) {
      const p = cellParts(row, f);
      return p.tokens.join(p.delim);
    }
    function cellText(row, f) {
      const p = cellParts(row, f);
      if (!p.tokens.length) return "";
      if (f.startsWith("m:") && xls && xls.formatDisplayValue && p.tokens[0] === p.ownFirst) {
        const parts = p.tokens.slice();
        parts[0] = xls.formatDisplayValue(f.slice(2), parts[0]);
        return parts.join(p.delim);
      }
      return p.tokens.join(p.delim);
    }
    function cellIsBlank(row, f) {
      const v = cellRaw(row, f);
      if (isEmptyValue(v)) return true;
      if (f.startsWith("j:")) return isBlank(colById(f.slice(2)), v);
      if (f.startsWith("m:")) return v === "0";
      return false;
    }
    function cellHl(row, f, depth) {
      depth = depth || 0;
      if (f.startsWith("j:") && row.hl[f.slice(2)]) return row.hl[f.slice(2)];
      if (depth > 50) return null;
      for (const m of S.merges) {
        if (m.target !== f) continue;
        const h = cellHl(row, m.source, depth + 1);
        if (h) return h;
      }
      return null;
    }

    function addNotice(kind, text, id) {
      S.notices = S.notices.filter((n) => n.id !== id);
      S.notices.push({ id: id || ("n" + Date.now()), kind, text });
      renderNotices();
    }
    function clearNotice(id) {
      const before = S.notices.length;
      S.notices = S.notices.filter((n) => n.id !== id);
      if (before !== S.notices.length) renderNotices();
    }

    function searchFieldFor(name) {
      const lk = String(name || "").trim().toLowerCase();
      if (!lk) return null;
      if (normName(lk) === "transid") return TRANS_FIELD;
      const cp = colPrefs();
      for (let i = 0; i < cp.fields.length; i++) {
        if (String(cp.headers[i] || "").toLowerCase() === lk || String(cp.fields[i]).toLowerCase() === lk) return cp.fields[i];
      }
      for (const f of (api.getShared("metadataFields") || [])) {
        if (String(f.displayName || "").toLowerCase() === lk || String(f.storageName || "").toLowerCase() === lk) return f.storageName;
      }
      return null;
    }
    function pkSearchField() {
      const pk = pkColumn();
      const names = [S.settings.primaryKey].concat(pk ? pk.aliases : []);
      for (const n of names) { const f = searchFieldFor(n); if (f) return f; }
      return null;
    }
    function ensureMetaColumns() {
      if (S.metaFields.length) return;
      const cp = colPrefs();
      const fields = [];
      const hdrs = {};
      cp.fields.forEach((f, i) => { if (!hiddenFields.has(f)) { fields.push(f); hdrs[f] = cp.headers[i] || f; } });
      S.metaFields = fields;
      S.metaHeaders = hdrs;
      const mf = fields.map((f) => "m:" + f);
      S.grid.order = mf.concat(S.grid.order.filter((f) => !f.startsWith("m:")));
      S.grid.visible = mf.concat(S.grid.visible.filter((f) => !f.startsWith("m:")));
    }
    function ensureMetaField(field, header) {
      if (!field || S.metaFields.includes(field)) return;
      if (!header) {
        const cp = colPrefs();
        const i = cp.fields.indexOf(field);
        if (i !== -1) header = cp.headers[i];
        if (!header) {
          const mf = (api.getShared("metadataFields") || []).find((x) => x.storageName === field);
          header = mf ? mf.displayName : field;
        }
      }
      S.metaFields.push(field);
      S.metaHeaders[field] = header;
      let lastM = -1;
      S.grid.order.forEach((f, i) => { if (f.startsWith("m:")) lastM = i; });
      S.grid.order.splice(lastM + 1, 0, "m:" + field);
      setVis("m:" + field, true);
    }
    function updateMissingNotice() {
      const pk = pkColumn();
      const missing = [];
      const seen = new Set();
      for (const e of S.entries) {
        const k = keyOf(e, pk);
        const lk = k.toLowerCase();
        if (k && !seen.has(lk) && S.metaStatus[lk] === "missing") { seen.add(lk); missing.push(k); }
      }
      if (!missing.length) { clearNotice("missing"); return; }
      const shown = missing.slice(0, 15).join(", ") + (missing.length > 15 ? `, and ${missing.length - 15} more` : "");
      addNotice("error", `${missing.length} call${missing.length === 1 ? "" : "s"} not found: ${shown}. Check the ${S.settings.primaryKey}. Also check that all your calls are from within the last 90 days.`, "missing");
    }
    //##> KEY MERGE: The primary key column and any Trans_Id column are merged into their matching
    //##> Nexidia column automatically, with no prompt. Unmerging one adds it to S.mergeDismissed so it
    //##> isn't merged again on the next paste.
    function autoMergeKeys() {
      let changed = false;
      const tryMerge = (colId, field) => {
        const src = "j:" + colId;
        const tgt = rootOf("m:" + field);
        if (mergeSourceOf(src) || rootOf(src) === tgt) return;
        if (S.mergeDismissed.includes(pairKey(src, "m:" + field))) return;
        if (groupHasMeta(src)) return;
        if (applyMerge(src, tgt, true)) changed = true;
      };
      const pk = pkColumn();
      const field = pkSearchField();
      if (pk && field) { ensureMetaField(field); tryMerge(pk.id, field); }
      const tc = transColumn();
      if (tc && S.metaFields.includes(TRANS_FIELD)) tryMerge(tc.id, TRANS_FIELD);
      return changed;
    }
    function detectCandidates() {
      const pairs = [];
      const metas = S.metaFields.filter((f) => !mergeSourceOf("m:" + f));
      const cops = S.columns.filter((c) => !mergeSourceOf("j:" + c.id));
      for (const f of metas) {
        const L = "m:" + f;
        const mNames = [S.metaHeaders[f] || f, f].map(normName).filter(Boolean);
        for (const c of cops) {
          const R = "j:" + c.id;
          if (rootOf(L) === rootOf(R) || groupHasMeta(R)) continue;
          if (S.mergeDismissed.includes(pairKey(L, R))) continue;
          const cNames = [c.header].concat(c.aliases).map(normName).filter(Boolean);
          if (mNames.some((a) => cNames.some((b) => namesMatch(a, b)))) pairs.push({ left: L, right: R, auto: true });
        }
      }
      return pairs;
    }
    function runMergeDetection() {
      if (closed || mergeDialogOpen || !S.metaFields.length) return;
      if (autoMergeKeys()) refreshAll();
      const pairs = detectCandidates();
      if (pairs.length) openMergeDialog(pairs, true);
    }
    //##> METADATA: Searches the Explore API with the primary key's Nexidia field (Trans_Id resolves to
    //##> UDFVarchar110). If a key matches several calls, the Trans_Id column (when one exists and isn't
    //##> already the primary key) is used to narrow the matches down. The API only covers the last 90
    //##> days, so misses get a popup and an inline note, and their metadata cells stay blank.
    async function fetchMetadata(onlyNew) {
      if (metaBusy) return;
      const pk = pkColumn();
      const pkName = S.settings.primaryKey || "Primary Key";
      if (!pk) {
        addNotice("error", `The primary key "${pkName}" doesn't match any column on the grid, so metadata can't be added. Change it in Unpack Settings.`, "pk");
        return;
      }
      const field = pkSearchField();
      if (!field) {
        addNotice("error", `"${pkName}" isn't a Nexidia field, so there's nothing to search metadata with. Change the Primary Key in Unpack Settings to a Nexidia field like Trans_Id.`, "pk");
        return;
      }
      clearNotice("pk");
      ensureMetaColumns();
      ensureMetaField(field);
      const keys = new Map();
      for (const e of S.entries) {
        const k = keyOf(e, pk);
        if (!k) continue;
        const lk = k.toLowerCase();
        if (!keys.has(lk) && (!onlyNew || !S.metaStatus[lk])) keys.set(lk, k);
      }
      if (!keys.size) { S.metaAdded = true; refreshAll(); runMergeDetection(); return; }
      metaBusy = true;
      setMetaBusy(true, keys.size);
      const found = new Map();
      let failed = null;
      const list = [...keys.values()];
      const reqFields = [...new Set(S.metaFields.concat(["sourceMediaId", TRANS_FIELD, field]))];
      try {
        for (let i = 0; i < list.length; i += 200) {
          const chunk = list.slice(i, i + 200);
          const payload = { from: 0, to: chunk.length * 5, fields: reqFields, query: { operator: "AND", invertOperator: false, filters: [{ operator: "AND", invertOperator: false, filterType: "interactions", filters: [{ operator: "IN", type: "KEYWORD", parameterName: field, value: chunk }] }] } };
          const res = await fetch(SEARCH_URL, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          if (!res.ok) throw new Error("API returned " + res.status);
          const json = await res.json();
          const results = Array.isArray(json.results) ? json.results : [];
          for (const r of results) {
            const lk = String(getFV(r, field) || "").trim().toLowerCase();
            if (!lk) continue;
            if (!found.has(lk)) found.set(lk, []);
            const arr = found.get(lk);
            const smid = getFV(r, "sourceMediaId");
            if (!arr.some((x) => getFV(x, "sourceMediaId") === smid)) arr.push(r);
          }
        }
      } catch (err) {
        failed = err;
      }
      metaBusy = false;
      setMetaBusy(false);
      if (closed) return;
      if (failed) {
        console.error(failed);
        addNotice("error", "Metadata search failed: " + (failed.message || failed) + ". Try Add Nexidia Metadata again.", "metaFail");
        refreshAll();
        return;
      }
      clearNotice("metaFail");
      const tc = transColumn();
      const multi = [];
      const notFound = [];
      for (const [lk, orig] of keys) {
        let m = found.get(lk) || [];
        if (m.length > 1 && tc && tc.id !== pk.id) {
          const tids = new Set();
          for (const e of S.entries) {
            if (keyOf(e, pk).toLowerCase() === lk) splitTokens(e.values[tc.id], INCOMING_DELIM).forEach((t) => tids.add(t.toLowerCase()));
          }
          const narrowed = m.filter((r) => tids.has(String(getFV(r, TRANS_FIELD) || "").trim().toLowerCase()));
          if (narrowed.length) m = narrowed;
        }
        S.meta[lk] = m;
        S.metaStatus[lk] = !m.length ? "missing" : (m.length > 1 ? "multi" : "ok");
        if (m.length > 1) multi.push(orig);
        if (!m.length) notFound.push(orig);
      }
      S.metaAdded = true;
      autoMergeKeys();
      updateMissingNotice();
      refreshAll();
      if (notFound.length && !S.suppress.notFound) {
        const r = await dialog({
          title: `${notFound.length} call${notFound.length === 1 ? "" : "s"} not found`,
          danger: true,
          message: `No Nexidia metadata was found for ${notFound.length === 1 ? "this" : "these"} ${pkName} value${notFound.length === 1 ? "" : "s"}. ${notFound.length === 1 ? "Its" : "Their"} CoPilot values are still on the grid, but the metadata columns are left blank.\n\nCheck the ${pkName}. Also check that all your calls are from within the last 90 days.`,
          list: notFound.slice(0, 300),
          checkbox: "Do not show this again",
          buttons: [{ label: "OK", value: true, primary: true }]
        });
        if (r.checked) { S.suppress.notFound = true; scheduleSave(); }
      }
      if (multi.length && !S.suppress.multi) {
        const r = await dialog({
          title: "Multiple calls matched",
          message: `${multi.length} ${pkName} value${multi.length === 1 ? "" : "s"} matched more than one call and couldn't be narrowed down with a Trans_Id. Every match was added to the grid as its own row.\n\nMove these rows to the top of the grid?`,
          list: multi.slice(0, 50),
          checkbox: "Do not show this again",
          buttons: [{ label: "Move to Top", value: true, primary: true }, { label: "Leave in Place", value: false }]
        });
        if (r.checked) S.suppress.multi = true;
        S.settings.multiTop = !!r.value;
        refreshAll();
      }
      runMergeDetection();
    }

    function processBlocks(blocks) {
      const accepted = [];
      const failures = [];
      let lineCount = 0;
      for (let b = 0; b < blocks.length; b++) {
        const lines = String(blocks[b].text || "").split(/\r?\n/);
        const failedLines = [];
        lines.forEach((ln, i) => {
          const r = validateLine(ln);
          if (r.status === "blank") return;
          lineCount++;
          if (r.status === "ok") accepted.push(r);
          else if (r.status === "message") accepted.push({ objects: [], message: r.message });
          else { failures.push({ block: b, line: i + 1, raw: ln, status: r.status, message: r.message }); failedLines.push(ln); }
        });
        blocks[b].failedText = failedLines.join("\n");
      }
      const objects = [];
      for (const a of accepted) for (const o of a.objects) objects.push(o);
      let added = [];
      if (objects.length) added = ingest(objects);
      const emptyBatches = accepted.filter((a) => a.message).length;
      if (emptyBatches) toast(`${emptyBatches} batch${emptyBatches === 1 ? "" : "es"} returned no rows (${accepted.find((a) => a.message).message})`, "#6366f1");
      if (added.length) {
        refreshAll();
        toast(`${added.length} row${added.length === 1 ? "" : "s"} added`);
        checkMissingKeys(added);
        if (S.settings.autoMeta) fetchMetadata(true);
        else runMergeDetection();
      }
      const errorPromise = failures.length ? showFailures(failures, lineCount, objects.length > 0) : Promise.resolve();
      return { failures, added: added.length, errorPromise };
    }
    function showFailures(failures, lineCount, someAdded) {
      const trunc = failures.filter((f) => f.status === "truncated");
      const bad = failures.filter((f) => f.status === "invalid");
      const many = lineCount > 1;
      const parts = [];
      if (trunc.length) {
        parts.push(`It looks like ${many ? (trunc.length === 1 ? "one of these outputs" : trunc.length + " of these outputs") : "this output"} might have gotten cut off. ${trunc.length === 1 ? "It doesn't" : "They don't"} end with a closing curly bracket }.`);
        parts.push("Run that batch again in CoPilot and make sure the response is complete before pasting it here.");
      }
      if (bad.length) {
        parts.push(bad.length === 1 && !many ? `This output couldn't be read: ${bad[0].message}.` : `${bad.length} output${bad.length === 1 ? "" : "s"} couldn't be read. Details are listed below.`);
      }
      if (someAdded) parts.push("Everything else in this paste was added to the grid. The failed output is shown below for review and will be cleared when you click OK.");
      const list = failures.map((f) => `${many ? "Line " + f.line + ": " : ""}${f.status === "truncated" ? "Cut off" : f.message}. ${f.raw}`);
      return dialog({ title: "This output contains an error", danger: true, message: parts.join("\n\n"), list, buttons: [{ label: "OK", value: true, primary: true }] });
    }
    function checkMissingKeys(added) {
      const pk = pkColumn();
      const missing = added.filter((e) => !keyOf(e, pk)).length;
      if (!missing || S.suppress.missingKey) return;
      dialog({
        title: "Missing primary key",
        danger: true,
        message: `${missing} row${missing === 1 ? " is" : "s are"} missing a primary key (${S.settings.primaryKey}). Without it, ${missing === 1 ? "that row" : "those rows"} can't be combined with duplicates or matched to Nexidia metadata. ${missing === 1 ? "It was" : "They were"} still added to the grid.`,
        checkbox: "Do not show this again",
        buttons: [{ label: "OK", value: true, primary: true }]
      }).then((r) => { if (r.checked) { S.suppress.missingKey = true; scheduleSave(); } });
    }

    function scheduleSave() {
      if (closed) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveNow, 600);
    }
    function saveNow() {
      if (closed) return;
      const hasPending = S.pending.some((p) => p.text);
      if (!S.entries.length && !hasPending) { dbDel(S.sessionId); return; }
      dbPut({ id: S.sessionId, createdAt: S.createdAt, updatedAt: Date.now(), rowCount: rows.length, pasteCount: S.pasteCount, data: JSON.parse(JSON.stringify(S)) });
    }
    function sessionFile(data) {
      return JSON.stringify({ type: "nexidiaUnpackSession", version: 1, savedAt: new Date().toISOString(), data }, null, 1);
    }
    function exportSession() {
      downloadText("nexidia_unpack_session_" + stamp() + ".txt", sessionFile(JSON.parse(JSON.stringify(S))));
    }
    function rawObject(entry) {
      const out = {};
      for (const c of S.columns) if (Object.prototype.hasOwnProperty.call(entry.values, c.id)) out[c.source] = entry.values[c.id];
      return out;
    }
    function rawLines() {
      return S.entries.map((entry) => JSON.stringify(rawObject(entry)));
    }
    function exportRawData() {
      const lines = rawLines();
      if (!lines.length) { toast("Nothing to export yet.", "#6b7280"); return; }
      const body = lines.map((line) => `<tr><td x:str="${escHtml(line)}">${escHtml(line)}</td></tr>`).join("");
      const html = `<?mso-application progid="Excel.Sheet"?><html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"/></head><body><table><tr><th>CoPilot Output</th></tr>${body}</table></body></html>`;
      const name = "nexidia_copilot_raw_" + stamp() + ".xls";
      if (xls && xls.downloadExcelFile) xls.downloadExcelFile(name, html);
      else downloadText(name, html);
    }
    async function chooseExportData() {
      if (!S.entries.length) { toast("Nothing to export yet.", "#6b7280"); return; }
      const r = await dialog({
        title: "Export",
        message: `Choose what to export.\n\nSession Data includes metadata and transformations and restores the sheet exactly as you see it here.\n\nRaw CoPilot Data includes only the original CoPilot JSON objects, one object per spreadsheet row.`,
        buttons: [{ label: "Export Session Data", value: "session", primary: true }, { label: "Export Raw CoPilot Data", value: "raw" }, { label: "Cancel", value: null }]
      });
      if (r.value === "session") exportSession();
      else if (r.value === "raw") exportRawData();
    }
    async function importRawFile(file) {
      let text = await file.text();
      if (/<table/i.test(text)) {
        const sheets = parseHtmlTables(text);
        text = sheets.flatMap((sh) => sh.rows.slice(1).map((row) => row[0] || "")).filter(Boolean).join("\n");
      }
      const blocks = [{ text }];
      const result = processBlocks(blocks);
      if (!result.added && !result.failures.length) dialog({ title: "Import failed", danger: true, message: "No CoPilot JSON objects were found in that file." });
    }
    async function chooseImportData() {
      const r = await dialog({
        title: "Import",
        message: `Choose what to import.\n\nSession Data includes metadata and transformations and replaces the current page.\n\nRaw CoPilot Data includes only CoPilot JSON objects and adds them to the current grid.`,
        buttons: [{ label: "Import Session Data", value: "session", primary: true }, { label: "Import Raw CoPilot Data", value: "raw" }, { label: "Cancel", value: null }]
      });
      if (!r.value) return;
      sessionInput.dataset.mode = r.value;
      sessionInput.accept = r.value === "session" ? ".txt,.json" : ".xls,.html,.htm,.txt,.jsonl,.json";
      sessionInput.click();
    }
    function loadSessionData(data, keepId) {
      const base = newState();
      const next = Object.assign(base, data || {});
      next.settings = Object.assign(defaultSettings(), next.settings || {});
      next.grid = Object.assign(base.grid, next.grid || {});
      if (!Array.isArray(next.pending) || !next.pending.length) next.pending = [{ text: "", error: "" }];
      if (!Array.isArray(next.merges)) next.merges = [];
      if (!Array.isArray(next.mergeDismissed)) next.mergeDismissed = [];
      if (!keepId) { next.sessionId = newState().sessionId; next.createdAt = Date.now(); }
      S = next;
      selected.clear();
      cellSel.clear();
      globalSearchBox.value = S.grid.globalFilter || "";
      setClickMode(S.grid.clickMode);
      updateMetaBtn();
      refreshAll();
      renderInput();
      scheduleSave();
    }
    async function importSessionFile(file) {
      let parsed;
      try { parsed = JSON.parse(await file.text()); } catch (_) { parsed = null; }
      if (!parsed || parsed.type !== "nexidiaUnpackSession" || !parsed.data) {
        dialog({ title: "Import failed", danger: true, message: "That file isn't an exported Unpack session." });
        return;
      }
      if (S.entries.length) {
        const r = await dialog({ title: "Replace current session?", message: "Importing replaces what's on the grid now. Your current session will stay saved in the resume list.", buttons: [{ label: "Import", value: true, primary: true }, { label: "Cancel", value: false }] });
        if (!r.value) return;
        saveNow();
      }
      loadSessionData(parsed.data, false);
      toast("Session imported");
    }

    async function importSpreadsheet(file) {
      if (!S.entries.length) {
        dialog({ title: "Nothing to join to", message: "Paste your CoPilot outputs first. Spreadsheet imports only add values to rows already on the grid." });
        return;
      }
      let text;
      try { text = await file.text(); } catch (_) { text = null; }
      if (text === null) { dialog({ title: "Import failed", danger: true, message: "That file couldn't be read." }); return; }
      if (text.startsWith("PK")) {
        dialog({ title: "Unsupported file", danger: true, message: "This looks like an .xlsx workbook, which can't be read here. Use the original .xls export from Nexidia, or save the sheet as CSV and import that." });
        return;
      }
      const head = text.slice(0, 3000).toLowerCase();
      let sheets;
      if (head.includes("<workbook")) sheets = parseSpreadsheetML(text);
      else if (/<html|<table/i.test(head) || /<table/i.test(text)) sheets = parseHtmlTables(text);
      else sheets = [{ name: file.name, rows: parseDelimited(text) }];
      const pk = pkColumn();
      const keyNames = new Set(TRANS_ALIASES);
      keyNames.add(String(S.settings.primaryKey || "").trim().toLowerCase());
      if (pk) for (const a of pk.aliases) keyNames.add(String(a).toLowerCase());
      const sf = pkSearchField();
      if (sf) {
        keyNames.add(sf.toLowerCase());
        const cp = colPrefs();
        const i = cp.fields.indexOf(sf);
        if (i !== -1) keyNames.add(String(cp.headers[i]).toLowerCase());
      }
      const candidates = [];
      for (const sh of sheets) {
        const h = findHeaderRow(sh.rows, keyNames);
        if (h >= 0) candidates.push({ sheet: sh, header: h });
      }
      if (!candidates.length) {
        dialog({ title: "No matching table found", danger: true, message: `None of the sheets in this file have a ${S.settings.primaryKey} or Trans_Id column, so there's nothing to join on.` });
        return;
      }
      let pick = candidates[0];
      if (candidates.length > 1) {
        const r = await dialog({
          title: "Choose a sheet",
          message: "More than one sheet in this file has a key column. Select the one you want to import.",
          list: candidates.map((c, i) => ({ label: `${c.sheet.name} (${Math.max(0, c.sheet.rows.length - c.header - 1).toLocaleString()} rows)`, value: i })),
          listClickable: true,
          buttons: [{ label: "Cancel", value: null }]
        });
        if (r.value === null || r.value === undefined) return;
        pick = candidates[r.value];
      }
      joinSheet(pick.sheet.rows, pick.header, keyNames, file.name);
    }
    function convertImportedMeta(field, value) {
      const f = field.toLowerCase();
      const n = Number(value);
      if (!/^-?\d+(\.\d+)?$/.test(value) || !isFinite(n)) return value;
      if (f === "recordeddatetime" && n > 20000 && n < 80000) return new Date(Math.round((n - 25569) * 86400000)).toISOString();
      if (f === "mediafileduration" && n < 1) return String(Math.round(n * 86400) * 1000);
      if (f === "udfint4") return String(Math.round(n) * 1000);
      return value;
    }
    //##> SPREADSHEET JOIN: Additive only, like the Feeder merge macro. Values are only added to rows
    //##> whose key is already on the grid, and only to columns that already exist (matched by header or
    //##> alias, including columns that were merged into others). Stacked values are split on semicolons
    //##> and deduped into the existing cell. Metadata cells are only filled when they're empty.
    function joinSheet(sheetRows, headerIdx, keyNames, fileName) {
      const headers = sheetRows[headerIdx].map((h) => String(h == null ? "" : h).trim());
      const am = aliasMap();
      const metaByHeader = new Map();
      const cp = colPrefs();
      cp.fields.forEach((f, i) => { metaByHeader.set(String(cp.headers[i] || f).toLowerCase(), f); metaByHeader.set(f.toLowerCase(), f); });
      for (const f of S.metaFields) { metaByHeader.set(String(S.metaHeaders[f] || f).toLowerCase(), f); metaByHeader.set(f.toLowerCase(), f); }
      const pk = pkColumn();
      const map = {};
      const skipped = [];
      let keyIdx = -1;
      headers.forEach((h, i) => {
        const lk = h.toLowerCase();
        if (!lk) return;
        if (am.has(lk)) {
          map[i] = "j:" + am.get(lk);
          if (pk && am.get(lk) === pk.id) keyIdx = i;
        } else if (metaByHeader.has(lk) && S.metaFields.includes(metaByHeader.get(lk))) {
          map[i] = "m:" + metaByHeader.get(lk);
        } else {
          skipped.push(h);
        }
        if (keyIdx === -1 && keyNames.has(lk)) keyIdx = i;
      });
      if (keyIdx === -1) { dialog({ title: "Import failed", danger: true, message: "The key column couldn't be located in that sheet." }); return; }
      const existing = new Set();
      for (const e of S.entries) { const k = keyOf(e, pk); if (k) existing.add(k.toLowerCase()); }
      let matchedRows = 0, unmatched = 0, values = 0;
      for (let r = headerIdx + 1; r < sheetRows.length; r++) {
        const row = sheetRows[r];
        if (isBlankRow(row)) continue;
        const key = String(row[keyIdx] == null ? "" : row[keyIdx]).trim();
        if (!key) continue;
        const lk = key.toLowerCase();
        if (!existing.has(lk)) { unmatched++; continue; }
        matchedRows++;
        for (const i in map) {
          if (Number(i) === keyIdx) continue;
          let v = String(row[i] == null ? "" : row[i]).trim();
          if (!v) continue;
          if (map[i].startsWith("m:")) {
            if (v.includes("*") || /^0+$/.test(v)) continue;
            v = convertImportedMeta(map[i].slice(2), v);
          }
          S.imports.push({ key: lk, target: map[i], value: v });
          values++;
        }
      }
      refreshAll();
      const parts = [`Imported ${values.toLocaleString()} value${values === 1 ? "" : "s"} into ${matchedRows.toLocaleString()} row${matchedRows === 1 ? "" : "s"} from ${fileName}.`];
      if (unmatched) parts.push(`${unmatched.toLocaleString()} row${unmatched === 1 ? " had a key" : "s had keys"} not on the grid and ${unmatched === 1 ? "was" : "were"} skipped.`);
      if (skipped.length) parts.push(`Columns not on the grid were skipped: ${skipped.slice(0, 12).join(", ")}${skipped.length > 12 ? ", and " + (skipped.length - 12) + " more" : ""}.`);
      addNotice("info", parts.join(" "), "import");
    }

    //##> MERGE POPUP: Pairs are worked top to bottom. Each pair's choice is simulated before the next
    //##> pair is drawn, so if Member_Id is merged into Member ID, a later Member ID / MemberID pair shows
    //##> the combined group. The auto-detected popup can't be closed until every pair has a choice,
    //##> unless the user picks Close Anyway, which leaves unanswered pairs separate.
    function openMergeDialog(initialRows, auto) {
      if (mergeDialogOpen) return;
      mergeDialogOpen = true;
      const items = initialRows.map((r) => ({ left: r.left || "", right: r.right || "", auto: !!r.auto, manual: !!r.manual, choice: null }));
      const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000018;display:flex;align-items:center;justify-content:center;" + FONT });
      const box = el("div", { style: "background:#fff;width:760px;max-width:96vw;max-height:88vh;overflow-y:auto;border-radius:12px;padding:22px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
      box.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#111827;margin-bottom:6px;" }, auto ? "Possible Matches Detected" : "Merge Columns"));
      box.appendChild(el("div", { style: "font-size:13px;color:#374151;margin-bottom:12px;" }, auto ? "Would you like to merge any of the following columns:" : "Choose the columns to merge and how to combine them. The column the arrow points to keeps its name and its values come first."));
      const listWrap = el("div", { style: "display:flex;flex-direction:column;gap:8px;" });
      const addBtn = el("button", { style: btnStyle("#6366f1", "margin-top:10px;") }, "+ Add Columns to Merge");
      const noteEl = el("div", { style: "font-size:12px;color:#b91c1c;margin-top:10px;display:none;" });
      const btnRow = el("div", { style: "display:flex;gap:8px;margin-top:14px;" });
      const applyB = el("button", { style: "flex:1;" + PRIMARY_BTN }, "Apply");
      const closeAnywayB = el("button", { style: "flex:1;display:none;" + PLAIN_BTN }, "Close Anyway");
      const cancelB = el("button", { style: "flex:1;" + PLAIN_BTN }, "Cancel");
      btnRow.appendChild(applyB);
      btnRow.appendChild(closeAnywayB);
      if (!auto) btnRow.appendChild(cancelB);
      box.appendChild(listWrap);
      box.appendChild(addBtn);
      box.appendChild(noteEl);
      box.appendChild(btnRow);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      function simulate() {
        const sim = S.merges.slice();
        return items.map((it) => {
          if (!it.left || !it.right) return { state: "incomplete", sim: sim.slice() };
          const L = rootOf(it.left, sim), R = rootOf(it.right, sim);
          const info = { L, R, sim: sim.slice() };
          if (L === R) info.state = "same";
          else if (groupHasMeta(L, sim) && groupHasMeta(R, sim)) info.state = "twoMeta";
          else {
            info.state = "ok";
            if (it.choice === "left") sim.push({ source: R, target: L });
            else if (it.choice === "right") sim.push({ source: L, target: R });
          }
          return info;
        });
      }
      function choiceText(choice, info) {
        const metaPair = info.L.startsWith("m:") && !info.R.startsWith("m:");
        if (choice === "sep") return "Leave Both Columns Separate";
        if (choice === "left") return metaPair ? "Merge CoPilot to Nexidia" : `Merge ${baseHeader(info.R)} into ${baseHeader(info.L)}`;
        return metaPair ? "Merge Nexidia to CoPilot" : `Merge ${baseHeader(info.L)} into ${baseHeader(info.R)}`;
      }
      const ICONS = { left: "\u2190", sep: "| |", right: "\u2192" };
      function sourceTag(f) {
        const isMeta = String(f).startsWith("m:");
        return el("span", {
          style: `font-size:10px;font-weight:700;padding:2px 6px;border-radius:999px;flex-shrink:0;cursor:help;${isMeta ? "background:#ede9fe;color:#6d28d9;" : "background:#dcfce7;color:#15803d;"}`,
          title: isMeta ? "This column came from Nexidia." : "This column came from your CoPilot output."
        }, isMeta ? "Nexidia" : "CoPilot");
      }
      function sideSelect(it, side) {
        const sel = el("select", { style: "flex:1;min-width:0;padding:5px 6px;border:1px solid #ccc;border-radius:6px;font-size:12px;" });
        sel.appendChild(el("option", { value: "" }, "Choose a column..."));
        for (const f of mergeableFields()) sel.appendChild(el("option", { value: f }, `${groupLabel(f)} (${sourceName(f)})`));
        sel.value = it[side];
        sel.onchange = async () => {
          const prev = it[side];
          it[side] = sel.value;
          it.choice = null;
          if (it.left && it.right && it.left.startsWith("m:") && it.right.startsWith("m:")) {
            it[side] = prev;
            await dialog({ title: "Can't merge these columns", danger: true, message: "You can't merge two Nexidia columns together." });
          } else if (it.left && it.left === it.right) {
            it[side] = "";
          } else if (it.right.startsWith("m:") && !it.left.startsWith("m:")) {
            const t = it.left;
            it.left = it.right;
            it.right = t;
          }
          render();
        };
        return sel;
      }
      function choiceControl(it, info) {
        const wrap = el("div", { style: "display:flex;align-items:center;gap:2px;flex-shrink:0;" });
        const shown = it.choice || "left";
        const btn = el("button", { style: `width:200px;display:flex;flex-direction:column;align-items:center;padding:5px 6px;border-radius:8px;cursor:pointer;background:${it.choice ? "#eff6ff" : "#fff"};border:${it.choice ? "1px solid #3b82f6" : "1px dashed #94a3b8"};opacity:${it.choice ? 1 : 0.6};`, title: "Click to choose, click again to change" });
        btn.appendChild(el("span", { style: "font-size:16px;font-weight:700;color:#1d4ed8;line-height:1;" }, ICONS[shown]));
        btn.appendChild(el("span", { style: "font-size:10px;color:#374151;margin-top:3px;text-align:center;" }, choiceText(shown, info)));
        if (!it.choice) btn.appendChild(el("span", { style: "font-size:9px;color:#b45309;margin-top:2px;" }, "Click to choose"));
        btn.onclick = () => {
          const order = ["left", "sep", "right"];
          it.choice = !it.choice ? "left" : order[(order.indexOf(it.choice) + 1) % 3];
          noteEl.style.display = "none";
          render();
        };
        const more = el("span", { style: "font-size:13px;color:#64748b;cursor:pointer;padding:2px 4px;", title: "Pick an option" }, "\u25BE");
        more.onclick = () => {
          const r = more.getBoundingClientRect();
          const pop = popover(null, 230, r.left - 200, r.bottom + 4);
          pop.style.zIndex = "1000019";
          for (const opt of ["left", "sep", "right"]) {
            const row = el("div", { style: "padding:6px 10px;font-size:12px;cursor:pointer;display:flex;gap:8px;align-items:center;" }, el("span", { style: "font-weight:700;color:#1d4ed8;width:22px;" }, ICONS[opt]), choiceText(opt, info));
            row.onmouseenter = () => { row.style.background = "#e8f0fe"; };
            row.onmouseleave = () => { row.style.background = ""; };
            row.onclick = () => { pop.remove(); it.choice = opt; noteEl.style.display = "none"; render(); };
            pop.appendChild(row);
          }
        };
        wrap.appendChild(btn);
        wrap.appendChild(more);
        return wrap;
      }
      function render() {
        listWrap.innerHTML = "";
        const infos = simulate();
        items.forEach((it, i) => {
          const info = infos[i];
          const row = el("div", { style: "display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #e5e7eb;border-radius:8px;" });
          const side = (key) => {
            const cell = el("div", { style: "flex:1;min-width:0;display:flex;align-items:center;gap:6px;" });
            if (it.manual) {
              cell.appendChild(sideSelect(it, key));
              if (it[key]) cell.appendChild(sourceTag(it[key]));
              return cell;
            }
            const root = key === "left" ? info.L : info.R;
            cell.appendChild(sourceTag(root));
            const label = groupLabel(root, info.sim);
            cell.appendChild(el("span", { style: "font-size:12px;color:#111827;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;", title: label }, label));
            return cell;
          };
          row.appendChild(side("left"));
          if (info.state === "ok") row.appendChild(choiceControl(it, info));
          else {
            const msg = info.state === "same" ? "Already combined by a selection above" : (info.state === "twoMeta" ? "Can't merge two Nexidia columns" : "Choose both columns");
            row.appendChild(el("div", { style: "width:224px;text-align:center;font-size:11px;color:#6b7280;flex-shrink:0;" }, msg));
          }
          row.appendChild(side("right"));
          if (it.manual) {
            const x = el("span", { style: "cursor:pointer;font-size:15px;color:#9ca3af;flex-shrink:0;", title: "Remove" }, "\u00D7");
            x.onclick = () => { items.splice(i, 1); render(); };
            row.appendChild(x);
          }
          listWrap.appendChild(row);
        });
        if (!items.length) listWrap.appendChild(el("div", { style: "font-size:12px;color:#9ca3af;padding:6px;" }, "No pairs. Use Add Columns to Merge."));
      }
      function finish() {
        closePopovers();
        overlay.remove();
        mergeDialogOpen = false;
      }
      function commit(force) {
        const infos = simulate();
        const pending = items.some((it, i) => (infos[i].state === "ok" && !it.choice) || (it.manual && infos[i].state === "incomplete" && (it.left || it.right)));
        if (pending && !force) {
          noteEl.textContent = "Make a selection for every pair before applying. Or choose Close Anyway, and any pair without a selection will be left separate.";
          noteEl.style.display = "block";
          closeAnywayB.style.display = "";
          return;
        }
        let merged = 0;
        for (const it of items) {
          if (!it.left || !it.right) continue;
          const L = rootOf(it.left), R = rootOf(it.right);
          const valid = L !== R && !(groupHasMeta(L) && groupHasMeta(R));
          if (valid && it.choice === "left") { if (applyMerge(R, L, false)) merged++; }
          else if (valid && it.choice === "right") { if (applyMerge(L, R, false)) merged++; }
          else if (it.auto) {
            const k = pairKey(it.left, it.right);
            if (!S.mergeDismissed.includes(k)) S.mergeDismissed.push(k);
          }
        }
        finish();
        refreshAll();
        if (merged) toast(`${merged} column${merged === 1 ? "" : "s"} merged`, "#0369a1");
      }
      addBtn.onclick = () => { items.push({ left: "", right: "", manual: true, auto: false, choice: null }); render(); };
      applyB.onclick = () => commit(false);
      closeAnywayB.onclick = () => commit(true);
      cancelB.onclick = () => finish();
      render();
    }
    function openUnmerge(field) {
      const inbound = S.merges.filter((m) => m.target === field);
      if (!inbound.length) return;
      dialog({
        title: "Unmerge Column",
        message: `Choose a column to separate from ${baseHeader(field)}.`,
        list: inbound.map((m) => ({ label: `${groupLabel(m.source)} (${sourceName(m.source)})`, value: m.id })),
        listClickable: true,
        buttons: [{ label: "Cancel", value: null }]
      }).then((r) => { if (r.value) unmerge(r.value); });
    }

    const modal = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999999;display:flex;align-items:center;justify-content:center;" + FONT });
    modal.dataset.nexidiaUnpack = "1";
    const stickyClose = el("button", { style: "position:fixed;top:20px;right:20px;z-index:1000000;border:0;background:rgba(30,30,30,.75);color:#fff;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4);" }, "X");
    const card = el("div", { style: "background:#fff;width:1280px;max-width:97vw;height:92vh;overflow:hidden;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.35);display:flex;flex-direction:column;" });

    const toolbar = el("div", { style: "padding:12px 16px 8px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:8px;flex-wrap:wrap;" });
    const titleEl = el("div", { style: "font-size:15px;font-weight:700;color:#111827;flex-shrink:0;" }, "Unpack CoPilot Outputs");
    const menuBtn = el("button", { style: btnStyle("#94a3b8", "color:#475569;") }, "\u2190 Main Menu");
    const rowCountEl = el("div", { style: "font-size:12px;color:#6b7280;flex-shrink:0;" });
    const statsEl = el("div", { style: "font-size:11px;color:#64748b;flex-shrink:0;padding:3px 8px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:999px;", title: "Pastes are accepted input events. Objects are the original CoPilot JSON objects. Duplicates are additional objects sharing the current Primary Key." });
    const selCountEl = el("div", { style: "font-size:12px;color:#2563eb;font-weight:600;flex-shrink:0;display:none;" });
    const cellSelCountEl = el("div", { style: "font-size:12px;color:#16a34a;font-weight:600;flex-shrink:0;display:none;" });
    const removeSelectedBtn = el("button", { style: btnStyle("#ef4444", "display:none;") }, "Remove Selected");
    const settingsBtn = el("button", { style: btnStyle("#0ea5e9", "color:#0369a1;") }, "\u2699 Unpack Settings");
    const metaBtn = el("button", { style: btnStyle("#8b5cf6", "color:#7c3aed;") }, "Add Nexidia Metadata");
    const mergeBtn = el("button", { style: btnStyle("#0369a1") }, "Merge Columns");
    const columnsBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #d1d5db;background:#f9fafb;cursor:pointer;font-size:14px;flex-shrink:0;", title: "Show / Hide Columns" }, "\u2630");
    const adHocBtn = el("button", { style: btnStyle("#6366f1") }, "+ Add Column");
    const importSheetBtn = el("button", { style: btnStyle("#0f766e") }, "Import Spreadsheet");
    const exportExcelBtn = el("button", { style: btnStyle("#22c55e", "color:#16a34a;") }, "Export to Excel");
    const exportTranscriptsBtn = el("button", { style: btnStyle("#6366f1", "color:#4f46e5;") }, "Export Transcripts");
    const exportSessionBtn = el("button", { style: btnStyle("#f59e0b", "color:#b45309;") }, "Export Session");
    const importSessionBtn = el("button", { style: btnStyle("#f59e0b", "color:#b45309;") }, "Import Session");
    const resetBtn = el("button", { style: btnStyle("#9ca3af", "color:#374151;") }, "Clear / Reset");
    const playTimestampsBtn = el("button", { style: btnStyle("#f97316", "color:#c2410c;") }, "Play Timestamps");
    const clickModeBtn = el("button", { style: btnStyle("#22c55e", "color:#16a34a;") }, "On Click: Select Field");
    const globalSearchBox = el("input", { type: "text", placeholder: "Search all visible columns...", style: "margin-left:auto;width:220px;max-width:26vw;padding:6px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;" });
    const sheetInput = el("input", { type: "file", accept: ".xls,.xml,.csv,.tsv,.txt,.htm,.html", style: "display:none;" });
    const sessionInput = el("input", { type: "file", accept: ".txt,.json", style: "display:none;" });
    [titleEl, menuBtn, rowCountEl, statsEl, selCountEl, cellSelCountEl, removeSelectedBtn, settingsBtn, metaBtn, mergeBtn, columnsBtn, adHocBtn, importSheetBtn, exportExcelBtn, exportTranscriptsBtn, exportSessionBtn, importSessionBtn, resetBtn, playTimestampsBtn, clickModeBtn, globalSearchBox, sheetInput, sessionInput].forEach((n) => toolbar.appendChild(n));

    const bannerWrap = el("div", { style: "display:none;padding:8px 16px;background:#fffbeb;border-bottom:1px solid #fde68a;" });
    const topPanel = el("div", { style: "padding:8px 16px;border-bottom:1px solid #e5e7eb;display:flex;flex-direction:column;gap:6px;" });
    const instrHead = el("div", { style: "font-size:12px;font-weight:600;color:#1d4ed8;cursor:pointer;user-select:none;" }, "\u25B8 Instructions");
    const instrBody = el("div", { style: "display:none;font-size:12px;color:#374151;line-height:1.55;padding:6px 10px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;" });
    const noticeWrap = el("div", { style: "display:flex;flex-direction:column;gap:4px;" });
    const inputWrap = el("div", {});
    topPanel.appendChild(instrHead);
    topPanel.appendChild(instrBody);
    topPanel.appendChild(noticeWrap);
    topPanel.appendChild(inputWrap);

    const sortBar = el("div", { style: "padding:4px 16px;min-height:30px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;border-bottom:1px solid #f1f5f9;background:#fafafa;" });
    const body = el("div", { style: "display:flex;flex:1;min-height:0;" });
    const colPanel = el("div", { style: "width:220px;border-right:1px solid #e5e7eb;padding:10px;overflow-y:auto;display:none;flex-shrink:0;" });
    colPanel.appendChild(el("div", { style: "font-size:12px;font-weight:700;margin-bottom:8px;color:#111827;" }, "Show / Hide Columns"));
    const colList = el("div", {});
    colPanel.appendChild(colList);
    const gridWrap = el("div", { style: "flex:1;min-width:0;display:flex;flex-direction:column;" });
    const tableWrap = el("div", { style: "flex:1;min-height:0;overflow:auto;position:relative;" });
    const table = el("table", { style: "border-collapse:separate;border-spacing:0;table-layout:fixed;" });
    const thead = el("thead", {});
    const tbody = el("tbody", {});
    const emptyEl = el("div", { style: "padding:40px;text-align:center;font-size:13px;color:#9ca3af;display:none;" }, "Paste your first CoPilot output above to start building the grid.");
    table.appendChild(thead);
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    tableWrap.appendChild(emptyEl);
    gridWrap.appendChild(tableWrap);
    body.appendChild(colPanel);
    body.appendChild(gridWrap);
    card.appendChild(toolbar);
    card.appendChild(bannerWrap);
    card.appendChild(topPanel);
    card.appendChild(sortBar);
    card.appendChild(body);
    modal.appendChild(card);
    document.body.appendChild(modal);
    document.body.appendChild(stickyClose);

    instrBody.appendChild(el("div", {}, "1. Build your prompt: open the PromptBuilder below, paste all of it into a new CoPilot chat, describe your job at the bottom under \"Input from Analyst\", and work through its questions until it hands you a finished prompt."));
    instrBody.appendChild(el("div", {}, "2. Run your batches: send each transcript batch file with that prompt in its own fresh CoPilot chat."));
    instrBody.appendChild(el("div", {}, "3. Check each response ends with a closing curly bracket }, copy it, and paste it into the box below. Rows are added to the grid as you go."));
    instrBody.appendChild(el("div", {}, "4. Metadata from Nexidia is added using your primary key (Trans_Id by default). If your columns look like Nexidia's, you'll be asked whether to merge them. Adjust duplicates, delimiters, and highlights in Unpack Settings."));
    instrBody.appendChild(el("div", {}, "5. Review, play calls, and export to Excel. Use Export Session to save your work to a file you can import later."));
    const promptBtn = el("button", { style: btnStyle("#1d4ed8", "margin-top:6px;") }, "View PromptBuilder");
    instrBody.appendChild(promptBtn);
    instrHead.onclick = () => {
      const open = instrBody.style.display === "none";
      instrBody.style.display = open ? "block" : "none";
      instrHead.textContent = (open ? "\u25BE" : "\u25B8") + " Instructions";
    };
    promptBtn.onclick = () => openPromptPanel();

    async function openPromptPanel() {
      document.querySelectorAll("[data-unpack-prompt]").forEach((p) => p.remove());
      const panel = el("div", { style: "position:fixed;top:70px;right:24px;width:480px;max-width:92vw;height:70vh;background:#fff;border:1px solid #d1d5db;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.3);z-index:1000010;display:flex;flex-direction:column;padding:14px;" + FONT });
      panel.dataset.unpackPrompt = "1";
      const head = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:8px;" });
      head.appendChild(el("div", { style: "font-size:14px;font-weight:700;color:#111827;flex:1;" }, "PromptBuilder"));
      const copyBtn = el("button", { style: btnStyle("#22c55e", "color:#16a34a;") }, "Copy");
      const dlBtn = el("button", { style: btnStyle("#6366f1") }, "Download");
      const xBtn = el("button", { style: btnStyle("#9ca3af", "color:#374151;") }, "Close");
      head.appendChild(copyBtn);
      head.appendChild(dlBtn);
      head.appendChild(xBtn);
      const ta = el("textarea", { readOnly: true, style: "flex:1;width:100%;box-sizing:border-box;border:1px solid #e5e7eb;border-radius:8px;padding:10px;font-size:11px;font-family:Consolas,monospace;resize:none;color:#111827;" });
      ta.value = "Loading...";
      panel.appendChild(head);
      panel.appendChild(ta);
      document.body.appendChild(panel);
      xBtn.onclick = () => panel.remove();
      let text = "";
      try {
        const res = await fetch(PROMPT_URL + "?v=" + Date.now(), { credentials: "omit", cache: "no-store" });
        if (!res.ok) throw new Error(res.status);
        text = await res.text();
        ta.value = text;
      } catch (_) {
        ta.value = "The PromptBuilder couldn't be loaded. Check your connection and try again.";
      }
      copyBtn.onclick = () => {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => toast("PromptBuilder copied")).catch(() => { ta.select(); document.execCommand("copy"); toast("PromptBuilder copied"); });
      };
      dlBtn.onclick = () => { if (text) downloadText("PromptBuilder.txt", text); };
    }

    function renderNotices() {
      noticeWrap.innerHTML = "";
      for (const n of S.notices) {
        const isErr = n.kind === "error";
        const row = el("div", { style: `display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.4;color:${isErr ? "#b91c1c" : "#1e40af"};` });
        row.appendChild(el("div", { style: "flex:1;" }, n.text));
        const x = el("span", { style: "cursor:pointer;font-size:14px;line-height:1;color:#9ca3af;", title: "Dismiss" }, "\u00D7");
        x.onclick = () => { S.notices = S.notices.filter((m) => m !== n); renderNotices(); scheduleSave(); };
        row.appendChild(x);
        noticeWrap.appendChild(row);
      }
      updateMetaBtn();
    }

    function renderInput() {
      inputWrap.innerHTML = "";
      const immediate = S.settings.unpackImmediately;
      const head = el("div", { style: "display:flex;align-items:center;gap:10px;margin-bottom:6px;" });
      const sw = el("div", { style: `width:34px;height:18px;border-radius:999px;background:${immediate ? "#22c55e" : "#cbd5e1"};position:relative;cursor:pointer;flex-shrink:0;transition:background .15s;` });
      sw.appendChild(el("div", { style: `position:absolute;top:2px;left:${immediate ? 18 : 2}px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:left .15s;` }));
      sw.onclick = () => { S.settings.unpackImmediately = !S.settings.unpackImmediately; renderInput(); scheduleSave(); };
      head.appendChild(sw);
      head.appendChild(el("div", { style: "font-size:12px;color:#374151;font-weight:600;" }, "Unpack Immediately"));
      head.appendChild(el("div", { style: "font-size:11px;color:#9ca3af;" }, immediate ? "Each paste is added to the grid right away." : "Pastes are queued until you click Add to Grid."));
      inputWrap.appendChild(head);
      if (immediate) {
        const ta = el("textarea", { placeholder: "Paste a CoPilot output here", style: "width:100%;height:46px;box-sizing:border-box;border:1px dashed #93c5fd;border-radius:8px;padding:8px 10px;font-size:12px;font-family:Consolas,monospace;resize:vertical;background:#f8fbff;" });
        ta.addEventListener("paste", (e) => {
          const txt = (e.clipboardData || window.clipboardData).getData("text");
          if (!txt) return;
          e.preventDefault();
          const blocks = [{ text: txt }];
          const result = processBlocks(blocks);
          ta.value = blocks[0].failedText || "";
          result.errorPromise.finally(() => { ta.value = ""; ta.focus(); });
        });
        ta.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && ta.value.trim()) {
            e.preventDefault();
            const blocks = [{ text: ta.value }];
            const result = processBlocks(blocks);
            ta.value = blocks[0].failedText || "";
            result.errorPromise.finally(() => { ta.value = ""; ta.focus(); });
          }
        });
        inputWrap.appendChild(ta);
        setTimeout(() => ta.focus(), 30);
        return;
      }
      if (!S.pending.length || S.pending[S.pending.length - 1].text) S.pending.push({ text: "", error: "" });
      const list = el("div", { style: "display:flex;flex-direction:column;gap:4px;max-height:170px;overflow-y:auto;" });
      S.pending.forEach((p, i) => {
        const filled = !!p.text;
        const row = el("div", { style: "display:flex;align-items:center;gap:6px;" });
        const handle = el("span", { style: `font-size:12px;color:#9ca3af;cursor:${filled ? "grab" : "default"};user-select:none;width:12px;`, title: filled ? "Drag to reorder" : "" }, filled ? "\u22EE\u22EE" : "");
        const box = el("textarea", { rows: 1, readOnly: filled, placeholder: "Paste a CoPilot output here", style: `flex:1;box-sizing:border-box;border:1px ${filled ? "solid" : "dashed"} ${p.error ? "#ef4444" : (filled ? "#d1d5db" : "#93c5fd")};border-radius:6px;padding:5px 8px;font-size:11px;font-family:Consolas,monospace;resize:none;white-space:nowrap;overflow:hidden;background:${filled ? "#f3f4f6" : "#f8fbff"};color:#374151;height:28px;` });
        box.value = p.text;
        if (p.error) box.title = p.error;
        if (!filled) {
          box.addEventListener("paste", (e) => {
            const txt = (e.clipboardData || window.clipboardData).getData("text");
            if (!txt) return;
            e.preventDefault();
            const lines = txt.split(/\r?\n/).filter((l) => l.trim());
            if (!lines.length) return;
            const items = lines.map((l) => ({ text: l, error: "" }));
            S.pending.splice(i, 1, ...items);
            renderInput();
            scheduleSave();
            const boxes = inputWrap.querySelectorAll("textarea");
            if (boxes.length) boxes[boxes.length - 1].focus();
          });
        }
        row.appendChild(handle);
        row.appendChild(box);
        if (filled) {
          const x = el("span", { style: "cursor:pointer;font-size:15px;color:#9ca3af;line-height:1;", title: "Remove" }, "\u00D7");
          x.onclick = () => { S.pending.splice(i, 1); renderInput(); scheduleSave(); };
          row.appendChild(x);
          row.draggable = true;
          row.addEventListener("dragstart", (e) => { dragPendingIndex = i; e.dataTransfer.effectAllowed = "move"; setTimeout(() => { row.style.opacity = "0.4"; }, 0); });
          row.addEventListener("dragend", () => { row.style.opacity = "1"; dragPendingIndex = null; });
        } else {
          row.appendChild(el("span", { style: "width:9px;" }));
        }
        row.addEventListener("dragover", (e) => { if (dragPendingIndex !== null) { e.preventDefault(); row.style.borderTop = "2px solid #3b82f6"; } });
        row.addEventListener("dragleave", () => { row.style.borderTop = ""; });
        row.addEventListener("drop", (e) => {
          e.preventDefault();
          row.style.borderTop = "";
          if (dragPendingIndex === null || dragPendingIndex === i) return;
          const [moved] = S.pending.splice(dragPendingIndex, 1);
          const target = dragPendingIndex < i ? i - 1 : i;
          S.pending.splice(target, 0, moved);
          dragPendingIndex = null;
          renderInput();
          scheduleSave();
        });
        list.appendChild(row);
      });
      inputWrap.appendChild(list);
      const btnRow = el("div", { style: "display:flex;gap:8px;margin-top:6px;" });
      const addRowBtn = el("button", { style: btnStyle("#6366f1") }, "+ Add Row");
      const submitBtn = el("button", { style: "padding:6px 14px;border-radius:8px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;cursor:pointer;font-size:12px;font-weight:600;" }, "Add to Grid");
      const queued = S.pending.filter((p) => p.text).length;
      btnRow.appendChild(addRowBtn);
      btnRow.appendChild(submitBtn);
      btnRow.appendChild(el("div", { style: "font-size:11px;color:#6b7280;align-self:center;" }, queued ? `${queued} queued` : ""));
      inputWrap.appendChild(btnRow);
      addRowBtn.onclick = () => { S.pending.push({ text: "", error: "" }); renderInput(); };
      submitBtn.onclick = () => {
        const filled = S.pending.filter((p) => p.text);
        if (!filled.length) return;
        const blocks = filled.map((p) => ({ text: p.text }));
        const result = processBlocks(blocks);
        S.pending = blocks.filter((b) => b.failedText).map((b) => ({ text: b.failedText, error: "This output couldn't be processed. Rerun it and paste again." })).concat([{ text: "", error: "" }]);
        renderInput();
        result.errorPromise.finally(() => { S.pending = [{ text: "", error: "" }]; renderInput(); scheduleSave(); });
        scheduleSave();
      };
    }

    function setMetaBusy(on, count) {
      metaBtn.disabled = on;
      metaBtn.textContent = on ? `Adding metadata for ${count ? count.toLocaleString() + " " : ""}call${count === 1 ? "" : "s"}...` : "Add Nexidia Metadata";
      if (!on) updateMetaBtn();
    }
    function updateMetaBtn() {
      if (metaBusy) return;
      const failed = S.notices.some((n) => n.id === "metaFail");
      metaBtn.style.display = S.settings.autoMeta && !failed ? "none" : "";
    }

    function getColWidth(f) { return S.grid.widths[f] || DEFAULT_COL_W; }
    function frozenCount() { return S.grid.clickMode === "select" ? 3 : 2; }
    function frozenW() { return COL0_W + COL1_W + (S.grid.clickMode === "select" ? PLAY_COL_W : 0); }
    function frozenStyle(i, isHeader) {
      const lefts = [0, COL0_W, COL0_W + COL1_W];
      const widths = [COL0_W, COL1_W, PLAY_COL_W];
      return `position:sticky;left:${lefts[i]}px;z-index:${isHeader ? 6 : 3};width:${widths[i]}px;min-width:${widths[i]}px;max-width:${widths[i]}px;box-sizing:border-box;`;
    }
    function visFields() { return S.grid.order.filter((f) => isVis(f)); }

    function evaluateRule(rule, row, field) {
      const cell = cellText(row, field);
      const cellLower = cell.toLowerCase();
      const val = (rule.value || "").trim().toLowerCase();
      const val2 = (rule.value2 || "").trim().toLowerCase();
      const numCell = Number(cell), numVal = Number(rule.value), numVal2 = Number(rule.value2);
      const num = cell !== "" && !isNaN(numCell);
      switch (rule.op) {
        case "hideempty": return !cellIsBlank(row, field);
        case "showempty": return cellIsBlank(row, field);
        case "contains": return !val || cellLower.includes(val);
        case "notcontains": return !val || !cellLower.includes(val);
        case "exact": return cellLower === val;
        case "startswith": return !val || cellLower.startsWith(val);
        case "endswith": return !val || cellLower.endsWith(val);
        case "gt": return num && !isNaN(numVal) ? numCell > numVal : cellLower.localeCompare(val) > 0;
        case "lt": return num && !isNaN(numVal) ? numCell < numVal : cellLower.localeCompare(val) < 0;
        case "eq": return num && !isNaN(numVal) ? numCell === numVal : cellLower === val;
        case "between":
          if (num && !isNaN(numVal) && !isNaN(numVal2)) return numCell >= numVal && numCell <= numVal2;
          return cellLower.localeCompare(val) >= 0 && cellLower.localeCompare(val2) <= 0;
        default: return true;
      }
    }
    function recompute() {
      let list = rows.slice();
      const active = Object.entries(S.grid.filters).filter(([f, flt]) => flt && flt.rules && flt.rules.length && S.grid.order.includes(f));
      if (active.length) {
        list = list.filter((r) => {
          for (const [f, flt] of active) {
            const res = flt.rules.map((rule) => evaluateRule(rule, r, f));
            if (flt.mode === "any" ? !res.some(Boolean) : !res.every(Boolean)) return false;
          }
          return true;
        });
      }
      const q = (S.grid.globalFilter || "").trim().toLowerCase();
      if (q) {
        const vf = visFields();
        list = list.filter((r) => vf.some((f) => cellText(r, f).toLowerCase().includes(q)));
      }
      const sorts = S.grid.sorts.filter((s) => S.grid.order.includes(s.field));
      if (sorts.length) {
        list.sort((a, b) => {
          for (const { field, dir } of sorts) {
            const va = cellRaw(a, field), vb = cellRaw(b, field);
            if (va === vb) continue;
            const na = Number(va), nb = Number(vb);
            if (va !== "" && vb !== "" && !isNaN(na) && !isNaN(nb)) return (na - nb) * dir;
            return va < vb ? -dir : dir;
          }
          return 0;
        });
      }
      view = list;
      const ids = new Set(view.map((r) => r.id));
      selected = new Set([...selected].filter((id) => ids.has(id)));
      cellSel.clear();
      cellAnchor = null;
    }
    function refreshAll() {
      if (closed) return;
      derive();
      recompute();
      renderSortBar();
      renderHeader();
      renderRows();
      rebuildColPanel();
      renderNotices();
      scheduleSave();
    }
    function rerender() {
      recompute();
      renderSortBar();
      renderHeader();
      renderRows();
      rebuildColPanel();
      scheduleSave();
    }

    function updateCounts() {
      rowCountEl.textContent = view.length.toLocaleString() + " of " + rows.length.toLocaleString() + " rows";
      const pk = pkColumn();
      const seen = new Set();
      let duplicates = 0;
      for (const entry of S.entries) {
        const key = keyOf(entry, pk).toLowerCase();
        if (!key) continue;
        if (seen.has(key)) duplicates++;
        else seen.add(key);
      }
      statsEl.textContent = `Pastes: ${S.pasteCount.toLocaleString()}  |  Objects: ${S.entries.length.toLocaleString()}  |  Duplicates: ${duplicates.toLocaleString()}  |  Unique Calls: ${seen.size.toLocaleString()}`;
      selCountEl.textContent = selected.size ? selected.size.toLocaleString() + " selected" : "";
      selCountEl.style.display = selected.size ? "" : "none";
      removeSelectedBtn.style.display = selected.size ? "" : "none";
      if (S.grid.clickMode === "select" && cellSel.size) {
        cellSelCountEl.textContent = cellSel.size.toLocaleString() + " cells";
        cellSelCountEl.style.display = "";
      } else cellSelCountEl.style.display = "none";
    }

    function renderSortBar() {
      sortBar.innerHTML = "";
      const sorts = S.grid.sorts.filter((s) => S.grid.order.includes(s.field));
      if (!sorts.length) { sortBar.appendChild(el("div", { style: "font-size:11px;color:#9ca3af;" }, "No active sorts. Click a column header to sort.")); return; }
      const tierColors = ["#1d4ed8", "#0369a1", "#0f766e"];
      sorts.forEach(({ field, dir }, i) => {
        const badge = el("div", { style: `display:inline-flex;align-items:center;gap:4px;padding:4px 8px 4px 6px;border-radius:999px;background:${tierColors[i] || "#374151"};color:#fff;font-size:11px;font-weight:600;cursor:pointer;user-select:none;` });
        badge.appendChild(el("span", { style: "opacity:0.7;font-size:10px;" }, (i + 1) + "."));
        badge.appendChild(el("span", {}, headerOf(field)));
        badge.appendChild(el("span", {}, dir === 1 ? " \u2191" : " \u2193"));
        const rm = el("span", { style: "margin-left:5px;opacity:0.75;font-size:11px;cursor:pointer;" }, "\u2715");
        badge.appendChild(rm);
        badge.onclick = (e) => {
          const idx = S.grid.sorts.findIndex((s) => s.field === field);
          if (e.target === rm) S.grid.sorts.splice(idx, 1);
          else S.grid.sorts[idx].dir *= -1;
          rerender();
        };
        sortBar.appendChild(badge);
      });
    }
    function sortBy(field, dir) {
      const existing = S.grid.sorts.findIndex((s) => s.field === field);
      if (dir) {
        if (existing !== -1) S.grid.sorts.splice(existing, 1);
        S.grid.sorts.unshift({ field, dir });
      } else if (existing === 0) S.grid.sorts[0].dir *= -1;
      else {
        if (existing > 0) S.grid.sorts.splice(existing, 1);
        S.grid.sorts.unshift({ field, dir: 1 });
      }
      if (S.grid.sorts.length > 3) S.grid.sorts.length = 3;
      rerender();
    }

    function rebuildColPanel() {
      colList.innerHTML = "";
      for (const f of S.grid.order) {
        const hasFilter = S.grid.filters[f] && S.grid.filters[f].rules && S.grid.filters[f].rules.length;
        const rowEl = el("div", { style: "display:flex;align-items:center;gap:6px;margin:4px 0;" });
        const cb = el("input", { type: "checkbox" });
        cb.checked = isVis(f);
        cb.onchange = () => { setVis(f, cb.checked); renderHeader(); renderRows(); scheduleSave(); };
        const labelEl = el("span", { style: `font-size:11px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;${hasFilter ? "color:#2563eb;font-weight:600;" : "color:#111827;"}`, title: groupLabel(f) }, headerOf(f) + (hasFilter ? " (filtered)" : ""));
        labelEl.onclick = () => openFilterPopover(f, labelEl);
        rowEl.appendChild(cb);
        rowEl.appendChild(labelEl);
        colList.appendChild(rowEl);
      }
    }

    function closePopovers() {
      document.querySelectorAll("[data-unpack-pop]").forEach((p) => p.remove());
    }
    function popover(anchor, width, x, y) {
      closePopovers();
      let top, left;
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        top = rect.bottom + 4;
        left = Math.min(rect.left, window.innerWidth - width - 10);
      } else { top = y; left = Math.min(Math.max(10, x), window.innerWidth - width - 10); }
      const pop = el("div", { style: `position:fixed;top:${top}px;left:${left}px;width:${width}px;max-height:${Math.max(200, window.innerHeight - top - 20)}px;overflow-y:auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px;box-shadow:0 6px 20px rgba(0,0,0,.18);z-index:1000012;` + FONT });
      pop.dataset.unpackPop = "1";
      document.body.appendChild(pop);
      const onOutside = (e) => { if (!pop.contains(e.target) && e.target !== anchor) { pop.remove(); document.removeEventListener("mousedown", onOutside); } };
      setTimeout(() => document.addEventListener("mousedown", onOutside), 60);
      return pop;
    }
    function openFilterPopover(field, anchor, x, y) {
      const existing = S.grid.filters[field] || { mode: "all", rules: [] };
      const pop = popover(anchor, 270, x, y);
      pop.appendChild(el("div", { style: "font-size:12px;font-weight:700;color:#111827;margin-bottom:8px;" }, "Filter: " + headerOf(field)));
      let localMode = existing.mode || "all";
      const localRules = existing.rules.map((r) => Object.assign({}, r));
      const modeRow = el("div", { style: "display:flex;align-items:center;gap:4px;margin-bottom:8px;" });
      const allBtn = el("button", { style: "flex:1;padding:4px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid #d1d5db;" }, "ALL");
      const anyBtn = el("button", { style: "flex:1;padding:4px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid #d1d5db;" }, "ANY");
      const syncMode = () => {
        allBtn.style.background = localMode === "all" ? "#3b82f6" : "#fff";
        allBtn.style.color = localMode === "all" ? "#fff" : "#374151";
        anyBtn.style.background = localMode === "any" ? "#f59e0b" : "#fff";
        anyBtn.style.color = localMode === "any" ? "#fff" : "#374151";
      };
      allBtn.onclick = () => { localMode = "all"; syncMode(); };
      anyBtn.onclick = () => { localMode = "any"; syncMode(); };
      modeRow.appendChild(el("span", { style: "font-size:10px;color:#6b7280;" }, "Match:"));
      modeRow.appendChild(allBtn);
      modeRow.appendChild(anyBtn);
      syncMode();
      const rulesWrap = el("div", { style: "margin-bottom:8px;" });
      const renderRules = () => {
        rulesWrap.innerHTML = "";
        modeRow.style.display = localRules.length > 1 ? "flex" : "none";
        localRules.forEach((r, i) => {
          let label = (OP_LIST.find(([v]) => v === r.op) || [])[1] || r.op;
          if (!NO_VALUE_OPS.has(r.op)) label += ": " + (r.value || "");
          if (TWO_VALUE_OPS.has(r.op)) label += " to " + (r.value2 || "");
          const chip = el("div", { style: "display:flex;align-items:center;gap:4px;padding:4px 8px;background:#eff6ff;border:1px solid #93c5fd;border-radius:6px;margin-bottom:4px;font-size:11px;color:#1d4ed8;" });
          chip.appendChild(el("span", { style: "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" }, label));
          const x2 = el("span", { style: "cursor:pointer;font-size:13px;color:#6b7280;" }, "\u00D7");
          x2.onclick = () => { localRules.splice(i, 1); renderRules(); };
          chip.appendChild(x2);
          rulesWrap.appendChild(chip);
        });
      };
      renderRules();
      const opSelect = el("select", { style: "width:100%;padding:5px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;margin-bottom:6px;box-sizing:border-box;" });
      for (const [v, l] of OP_LIST) opSelect.appendChild(el("option", { value: v }, l));
      const valInput = el("input", { type: "text", placeholder: "Value...", style: "width:100%;padding:5px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;box-sizing:border-box;margin-bottom:4px;" });
      const val2Input = el("input", { type: "text", placeholder: "To value...", style: "width:100%;padding:5px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;box-sizing:border-box;margin-bottom:6px;display:none;" });
      const syncInputs = () => {
        valInput.style.display = NO_VALUE_OPS.has(opSelect.value) ? "none" : "";
        val2Input.style.display = TWO_VALUE_OPS.has(opSelect.value) ? "" : "none";
      };
      opSelect.onchange = syncInputs;
      syncInputs();
      const addRow = el("div", { style: "display:flex;gap:6px;margin-bottom:8px;" });
      const addB = el("button", { style: "flex:1;padding:5px;border-radius:6px;border:0;background:#3b82f6;color:#fff;font-size:12px;cursor:pointer;font-weight:600;" }, "Add");
      const applyB = el("button", { style: "flex:1;padding:5px;border-radius:6px;border:0;background:#22c55e;color:#fff;font-size:12px;cursor:pointer;font-weight:600;" }, "Apply");
      addB.onclick = () => { localRules.push({ op: opSelect.value, value: valInput.value, value2: val2Input.value }); valInput.value = ""; val2Input.value = ""; renderRules(); };
      applyB.onclick = () => {
        if (localRules.length) S.grid.filters[field] = { mode: localMode, rules: localRules };
        else delete S.grid.filters[field];
        pop.remove();
        rerender();
      };
      addRow.appendChild(addB);
      addRow.appendChild(applyB);
      const clearB = el("button", { style: "width:100%;padding:5px;border-radius:6px;border:1px solid #e5e7eb;background:#f9fafb;font-size:12px;cursor:pointer;" }, "Clear All");
      clearB.onclick = () => { delete S.grid.filters[field]; pop.remove(); rerender(); };
      pop.appendChild(modeRow);
      pop.appendChild(rulesWrap);
      pop.appendChild(opSelect);
      pop.appendChild(valInput);
      pop.appendChild(val2Input);
      pop.appendChild(addRow);
      pop.appendChild(clearB);
    }
    function menu(x, y, items) {
      const pop = popover(null, 200, x, y);
      pop.style.padding = "4px 0";
      for (const it of items) {
        if (it === "-") { pop.appendChild(el("div", { style: "height:1px;background:#f1f5f9;margin:4px 0;" })); continue; }
        const row = el("div", { style: `padding:6px 14px;font-size:12px;cursor:pointer;color:${it.danger ? "#b91c1c" : "#111827"};` }, it.label);
        row.onmouseenter = () => { row.style.background = "#e8f0fe"; };
        row.onmouseleave = () => { row.style.background = ""; };
        row.onclick = () => { pop.remove(); it.run(); };
        pop.appendChild(row);
      }
      return pop;
    }
    function pkCandidateFor(field) {
      if (field.startsWith("j:")) return colById(field.slice(2));
      const j = membersOf(field).find((f) => f.startsWith("j:"));
      return j ? colById(j.slice(2)) : null;
    }
    function openMergeFor(field) {
      if (field.startsWith("m:")) openMergeDialog([{ left: field, right: "", manual: true }], false);
      else openMergeDialog([{ left: "", right: field, manual: true }], false);
    }
    function openHeaderMenu(field, x, y) {
      const isJ = field.startsWith("j:");
      const items = [
        { label: "Sort A \u2192 Z", run: () => sortBy(field, 1) },
        { label: "Sort Z \u2192 A", run: () => sortBy(field, -1) },
        { label: "Filter...", run: () => openFilterPopover(field, null, x, y) },
        "-"
      ];
      if (isJ) {
        items.push({ label: "Rename...", run: () => renameColumn(colById(field.slice(2))) });
        items.push({ label: "Attributes...", run: () => openAttributes(colById(field.slice(2)), x, y) });
      }
      if (field !== "__conf__") {
        items.push({ label: "Merge Column...", run: () => openMergeFor(field) });
        if (S.merges.some((m) => m.target === field)) items.push({ label: "Unmerge...", run: () => openUnmerge(field) });
        const pkc = pkCandidateFor(field);
        if (pkc) items.push({ label: "Set as Primary Key", run: () => setPrimaryKey(pkc.header) });
      }
      items.push("-");
      items.push({ label: "Select Column", run: () => selectColumn(field) });
      items.push({ label: "Hide Column", run: () => { setVis(field, false); rerender(); } });
      menu(x, y, items);
    }
    async function renameColumn(c) {
      if (!c) return;
      let value = c.header;
      for (;;) {
        const r = await dialog({ title: "Rename Column", message: `Original name: ${c.source}. Both the original name and the new one will keep matching incoming values.`, input: { value, maxLength: 80 }, buttons: [{ label: "Rename", value: true, primary: true }, { label: "Cancel", value: false }] });
        if (!r.value) return;
        value = String(r.input || "").trim();
        if (!value || value === c.header) return;
        const lk = value.toLowerCase();
        const clash = S.columns.find((o) => o.id !== c.id && o.aliases.some((a) => String(a).toLowerCase() === lk));
        const metaClash = S.metaFields.find((f) => String(S.metaHeaders[f] || "").toLowerCase() === lk);
        if (!clash && !metaClash) break;
        const otherRef = metaClash ? rootOf("m:" + metaClash) : rootOf("j:" + clash.id);
        const self = "j:" + c.id;
        const sameGroup = rootOf(self) === otherRef;
        const canMerge = !sameGroup && !(groupHasMeta(otherRef) && groupHasMeta(rootOf(self)));
        const res = await dialog({
          title: "Name already in use",
          danger: true,
          message: `"${value}" is already used by the ${baseHeader(otherRef)} column.${canMerge ? " You can merge these two columns instead, or pick a different name." : " Pick a different name."}`,
          buttons: canMerge ? [{ label: "Merge Columns", value: "merge", primary: true }, { label: "Pick Another Name", value: "again" }, { label: "Cancel", value: null }] : [{ label: "Pick Another Name", value: "again", primary: true }, { label: "Cancel", value: null }]
        });
        if (res.value === "merge") {
          const selfRoot = rootOf(self);
          if (otherRef.startsWith("m:") || !selfRoot.startsWith("m:")) openMergeDialog([{ left: otherRef, right: selfRoot, manual: true }], false);
          else openMergeDialog([{ left: selfRoot, right: otherRef, manual: true }], false);
          return;
        }
        if (res.value !== "again") return;
      }
      const wasPk = pkColumn() === c;
      c.header = value;
      if (!c.aliases.some((a) => String(a).toLowerCase() === value.toLowerCase())) c.aliases.push(value);
      if (wasPk) S.settings.primaryKey = value;
      refreshAll();
      runMergeDetection();
    }
    function openAttributes(c, x, y) {
      if (!c) return;
      const pop = popover(null, 260, x, y);
      pop.appendChild(el("div", { style: "font-size:12px;font-weight:700;color:#111827;margin-bottom:8px;" }, "Attributes: " + c.header));
      pop.appendChild(el("div", { style: "font-size:11px;color:#6b7280;margin-bottom:4px;" }, "Type"));
      const sel = el("select", { style: "width:100%;padding:5px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;margin-bottom:10px;box-sizing:border-box;" });
      for (const [v, l] of TYPES) sel.appendChild(el("option", { value: v }, v === "auto" ? `${l} (${TYPE_LABELS[c.detected] || c.detected})` : l));
      sel.value = c.type;
      sel.onchange = () => { c.type = sel.value; refreshAll(); };
      pop.appendChild(sel);
      pop.appendChild(el("div", { style: "font-size:11px;color:#6b7280;margin-bottom:4px;" }, "Treat as blank (affects filters and duplicate voting, never changes the data)"));
      pop.appendChild(el("label", { style: "display:flex;align-items:center;gap:6px;font-size:12px;color:#9ca3af;margin:3px 0;" }, el("input", { type: "checkbox", checked: true, disabled: true }), "Empty"));
      for (const [k, l] of NULL_EQ) {
        const cb = el("input", { type: "checkbox", checked: !!c.nullEq[k] });
        cb.onchange = () => { if (cb.checked) c.nullEq[k] = true; else delete c.nullEq[k]; refreshAll(); };
        pop.appendChild(el("label", { style: "display:flex;align-items:center;gap:6px;font-size:12px;color:#111827;margin:3px 0;cursor:pointer;" }, cb, l));
      }
    }
    function setPrimaryKey(name) {
      if (!name || name === S.settings.primaryKey) return;
      S.settings.primaryKey = name;
      S.meta = {};
      S.metaStatus = {};
      clearNotice("missing");
      clearNotice("pk");
      refreshAll();
      toast("Primary key set to " + name, "#0369a1");
      if (S.settings.autoMeta && S.entries.length) fetchMetadata(true);
    }
    function selectColumn(field) {
      if (S.grid.clickMode !== "select") setClickMode("select");
      const ci = visFields().indexOf(field);
      if (ci === -1) return;
      cellSel.clear();
      for (let r = 0; r < view.length; r++) cellSel.add(r + "," + ci);
      updateCellHighlights();
    }
    function removeRows(ids) {
      if (!ids.length) return;
      for (const id of ids) if (!S.removed.includes(id)) S.removed.push(id);
      for (const id of ids) selected.delete(id);
      refreshAll();
      toast(`${ids.length} row${ids.length === 1 ? "" : "s"} removed`, "#ef4444");
    }
    function openRowMenu(row, ri, x, y) {
      const items = [
        { label: "Select Row", run: () => { if (S.grid.clickMode !== "select") setClickMode("select"); cellSel.clear(); visFields().forEach((_, c) => cellSel.add(ri + "," + c)); updateCellHighlights(); } },
        { label: "Play Call", run: () => triggerPlay(row) },
        "-",
        { label: "Remove Row", danger: true, run: () => removeRows([row.id]) }
      ];
      menu(x, y, items);
    }

    function createDragGhost(text) {
      if (dragGhost) dragGhost.remove();
      dragGhost = el("div", { style: "position:fixed;top:-9999px;left:-9999px;z-index:1000010;background:#1d4ed8;color:#fff;font-size:11px;font-weight:700;padding:6px 14px;border-radius:6px;white-space:nowrap;pointer-events:none;" + FONT }, text);
      document.body.appendChild(dragGhost);
      return dragGhost;
    }
    function removeDragGhost() { if (dragGhost) { dragGhost.remove(); dragGhost = null; } }
    let resizeField = null, resizeStartX = 0, resizeStartW = 0;
    function onResizeMove(e) {
      if (!resizeField) return;
      S.grid.widths[resizeField] = Math.max(40, resizeStartW + (e.clientX - resizeStartX));
      renderHeader();
      renderRows();
    }
    function onResizeUp() {
      resizeField = null;
      document.removeEventListener("mousemove", onResizeMove);
      document.removeEventListener("mouseup", onResizeUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      scheduleSave();
    }
    const measureCtx = document.createElement("canvas").getContext("2d");
    measureCtx.font = "11px 'Segoe UI',Arial,sans-serif";
    function autoFit(field) {
      let maxW = measureCtx.measureText(headerOf(field)).width + 40;
      const end = Math.min(view.length, lastRange.end + 200);
      for (let i = lastRange.start; i < end; i++) {
        const w = measureCtx.measureText(cellText(view[i], field)).width + 24;
        if (w > maxW) maxW = w;
      }
      S.grid.widths[field] = Math.min(500, Math.max(60, Math.ceil(maxW)));
      renderHeader();
      renderRows();
      scheduleSave();
    }

    function renderHeader() {
      const vf = visFields();
      thead.innerHTML = "";
      const trh = el("tr", {});
      const thSel = el("th", { style: `position:sticky;top:0;${frozenStyle(0, true)}background:#f9fafb;border-bottom:2px solid #e5e7eb;padding:6px 4px;` });
      const selectAll = el("input", { type: "checkbox", title: "Select all" });
      selectAll.checked = view.length > 0 && view.every((r) => selected.has(r.id));
      selectAll.indeterminate = selected.size > 0 && !selectAll.checked;
      selectAll.onchange = () => {
        if (selectAll.checked) view.forEach((r) => selected.add(r.id));
        else selected.clear();
        renderRows();
      };
      thSel.appendChild(selectAll);
      trh.appendChild(thSel);
      trh.appendChild(el("th", { style: `position:sticky;top:0;${frozenStyle(1, true)}background:#f9fafb;border-bottom:2px solid #e5e7eb;padding:4px 6px;font-size:10px;color:#9ca3af;text-align:right;` }, "#"));
      if (S.grid.clickMode === "select") trh.appendChild(el("th", { style: `position:sticky;top:0;${frozenStyle(2, true)}background:#f9fafb;border-bottom:2px solid #e5e7eb;padding:4px;font-size:10px;color:#9ca3af;text-align:center;` }, "\u25B6"));
      const tierColors = ["#1d4ed8", "#0369a1", "#0f766e"];
      const pkc = pkColumn();
      const pkRoot = pkc ? rootOf("j:" + pkc.id) : null;
      vf.forEach((field, i) => {
        const sortIdx = S.grid.sorts.findIndex((s) => s.field === field);
        const hasFilter = S.grid.filters[field] && S.grid.filters[field].rules && S.grid.filters[field].rules.length;
        const sortColor = sortIdx >= 0 ? (tierColors[sortIdx] || "#374151") : null;
        const isMeta = field.startsWith("m:");
        const w = getColWidth(field);
        const isPk = field === pkRoot;
        const memberCount = membersOf(field).length - 1;
        const tip = (isMeta ? "Nexidia metadata. " : "") + (memberCount ? "Merged: " + groupLabel(field) + ". " : "") + "Click to sort, drag to reorder, right-click for options";
        const th = el("th", { style: `position:sticky;top:0;z-index:5;width:${w}px;min-width:${w}px;max-width:${w}px;box-sizing:border-box;background:${sortColor ? "#dbeafe" : (hasFilter ? "#eff6ff" : (isMeta ? "#f5f3ff" : "#f9fafb"))};border-bottom:2px solid ${sortColor || (hasFilter ? "#3b82f6" : "#e5e7eb")};padding:0;font-size:11px;text-align:left;white-space:nowrap;user-select:none;${sortColor ? "color:" + sortColor + ";font-weight:700;" : (hasFilter ? "color:#2563eb;font-weight:600;" : "color:#374151;")}`, title: tip });
        const labelRow = el("div", { style: "display:flex;align-items:center;padding:7px 4px 7px 10px;cursor:pointer;" });
        let label = (isPk ? "\uD83D\uDD11 " : "") + headerOf(field);
        if (sortIdx >= 0) label += S.grid.sorts[sortIdx].dir === 1 ? " \u2191" : " \u2193";
        const thLabel = el("span", { style: "flex:1;overflow:hidden;text-overflow:ellipsis;" }, label);
        labelRow.appendChild(thLabel);
        if (memberCount) labelRow.appendChild(el("span", { style: "font-size:9px;font-weight:700;color:#0369a1;background:#e0f2fe;border-radius:999px;padding:1px 5px;margin-left:4px;flex-shrink:0;" }, "+" + memberCount));
        const chev = el("span", { style: `font-size:14px;cursor:pointer;margin-left:4px;padding:0 4px;border-radius:4px;color:${hasFilter ? "#3b82f6" : "#94a3b8"};`, title: "Column options" }, hasFilter ? "\u25BC" : "\u25BE");
        chev.onmouseenter = () => { chev.style.background = "#e5e7eb"; };
        chev.onmouseleave = () => { chev.style.background = ""; };
        chev.onclick = (e) => { e.stopPropagation(); const r = chev.getBoundingClientRect(); openHeaderMenu(field, r.left, r.bottom + 4); };
        labelRow.appendChild(chev);
        th.appendChild(labelRow);
        const handle = el("div", { style: "position:absolute;top:0;right:0;width:5px;height:100%;cursor:col-resize;z-index:7;" });
        handle.addEventListener("mousedown", (e) => {
          e.stopPropagation();
          e.preventDefault();
          resizeField = field;
          resizeStartX = e.clientX;
          resizeStartW = w;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
          document.addEventListener("mousemove", onResizeMove);
          document.addEventListener("mouseup", onResizeUp);
        });
        handle.addEventListener("dblclick", (e) => { e.stopPropagation(); autoFit(field); });
        th.appendChild(handle);
        th.draggable = true;
        th.addEventListener("dragstart", (e) => {
          dragColIndex = i;
          e.dataTransfer.effectAllowed = "move";
          const g = createDragGhost(headerOf(field));
          e.dataTransfer.setDragImage(g, g.offsetWidth / 2, g.offsetHeight / 2);
          setTimeout(() => { th.style.opacity = "0.3"; }, 0);
        });
        th.addEventListener("dragend", () => { th.style.opacity = "1"; dragColIndex = null; removeDragGhost(); });
        th.addEventListener("dragover", (e) => {
          if (dragColIndex === null) return;
          e.preventDefault();
          if (dragColIndex !== i) th.style[dragColIndex < i ? "borderRight" : "borderLeft"] = "3px solid #3b82f6";
        });
        th.addEventListener("dragleave", () => { th.style.borderLeft = ""; th.style.borderRight = ""; });
        th.addEventListener("drop", (e) => {
          e.preventDefault();
          th.style.borderLeft = "";
          th.style.borderRight = "";
          removeDragGhost();
          if (dragColIndex === null || dragColIndex === i) return;
          const src = vf[dragColIndex];
          S.grid.order.splice(S.grid.order.indexOf(src), 1);
          const dstIdx = S.grid.order.indexOf(field);
          S.grid.order.splice(dragColIndex < i ? dstIdx + 1 : dstIdx, 0, src);
          dragColIndex = null;
          rerender();
        });
        th.addEventListener("contextmenu", (e) => { e.preventDefault(); openHeaderMenu(field, e.clientX, e.clientY); });
        th.onclick = (e) => {
          if (e.target === handle || e.target === chev) return;
          sortBy(field);
        };
        trh.appendChild(th);
      });
      thead.appendChild(trh);
      table.style.width = (frozenW() + vf.reduce((s, f) => s + getColWidth(f), 0)) + "px";
      emptyEl.style.display = rows.length ? "none" : "block";
    }

    function getVisibleRange() {
      if (!view.length) return { start: 0, end: 0 };
      const st = tableWrap.scrollTop;
      const vh = tableWrap.clientHeight;
      return { start: Math.max(0, Math.floor(st / ROW_HEIGHT) - BUFFER_ROWS), end: Math.min(view.length, Math.ceil((st + vh) / ROW_HEIGHT) + BUFFER_ROWS) };
    }
    function rowFlag(row) {
      if (row.missing) return { color: "#dc2626", title: `Missing ${S.settings.primaryKey}. This row can't be combined with duplicates or matched to metadata.` };
      if (row.status === "missing") return { color: "#dc2626", title: "No call found in Nexidia for this key." };
      if (row.status === "multi") return { color: "#d97706", title: "This key matched more than one call." };
      return null;
    }
    function renderRows() {
      const range = getVisibleRange();
      lastRange = range;
      const vf = visFields();
      const selectMode = S.grid.clickMode === "select";
      updateCounts();
      const selAll = thead.querySelector("input[type=checkbox]");
      if (selAll) {
        selAll.checked = view.length > 0 && view.every((r) => selected.has(r.id));
        selAll.indeterminate = selected.size > 0 && !selAll.checked;
      }
      tbody.innerHTML = "";
      const span = vf.length + frozenCount();
      if (range.start > 0) {
        const sp = el("tr", {});
        sp.appendChild(el("td", { colSpan: span, style: `height:${range.start * ROW_HEIGHT}px;padding:0;border:0;` }));
        tbody.appendChild(sp);
      }
      for (let ri = range.start; ri < range.end; ri++) {
        const row = view[ri];
        const smid = row.meta ? getFV(row.meta, "sourceMediaId") : "";
        const isActive = smid && smid === activeSmid;
        const isChecked = selected.has(row.id);
        const bg = isActive || isChecked ? "#eff6ff" : (ri % 2 ? "#f8fafc" : "#fff");
        const tr = el("tr", { style: `height:${ROW_HEIGHT}px;background:${bg};${isActive ? "outline:2px solid #3b82f6;outline-offset:-2px;" : ""}${selectMode ? "" : "cursor:pointer;"}` });
        const tdSel = el("td", { style: `${frozenStyle(0, false)}background:${bg};padding:2px 4px;border-bottom:1px solid #f1f5f9;text-align:center;height:${ROW_HEIGHT}px;` });
        const cb = el("input", { type: "checkbox" });
        cb.checked = isChecked;
        cb.onclick = (e) => e.stopPropagation();
        cb.onchange = () => { if (cb.checked) selected.add(row.id); else selected.delete(row.id); renderRows(); };
        tdSel.appendChild(cb);
        tr.appendChild(tdSel);
        const flag = rowFlag(row);
        const tdNum = el("td", { style: `${frozenStyle(1, false)}background:${bg};padding:2px 6px;border-bottom:1px solid #f1f5f9;font-size:10px;color:#9ca3af;text-align:right;height:${ROW_HEIGHT}px;cursor:context-menu;`, title: flag ? flag.title : "Right-click for row options" });
        if (flag) tdNum.appendChild(el("span", { style: `color:${flag.color};font-weight:700;margin-right:4px;` }, "!"));
        tdNum.appendChild(document.createTextNode(String(ri + 1)));
        tdNum.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); openRowMenu(row, ri, e.clientX, e.clientY); });
        tdNum.onclick = (e) => {
          e.stopPropagation();
          if (!selectMode) return;
          if (!e.ctrlKey && !e.shiftKey) cellSel.clear();
          vf.forEach((_, c) => cellSel.add(ri + "," + c));
          updateCellHighlights();
        };
        tr.appendChild(tdNum);
        if (selectMode) {
          const tdPlay = el("td", { style: `${frozenStyle(2, false)}background:${bg};padding:2px 4px;border-bottom:1px solid #f1f5f9;text-align:center;height:${ROW_HEIGHT}px;` });
          const icon = el("span", { style: `font-size:13px;cursor:${smid ? "pointer" : "default"};color:${smid ? "#3b82f6" : "#d1d5db"};`, title: smid ? "Play" : "No call linked yet" }, "\u25B6");
          icon.onclick = (e) => { e.stopPropagation(); triggerPlay(row); };
          tdPlay.appendChild(icon);
          tr.appendChild(tdPlay);
        }
        vf.forEach((field, ci) => {
          const display = cellText(row, field);
          const w = getColWidth(field);
          const hl = cellHl(row, field);
          const cSel = selectMode && cellSel.has(ri + "," + ci);
          const td = el("td", { style: `padding:4px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:${w}px;min-width:${w}px;max-width:${w}px;box-sizing:border-box;height:${ROW_HEIGHT}px;${selectMode ? "cursor:cell;" : ""}${cSel ? "background:#dbeafe;outline:1px solid #93c5fd;outline-offset:-1px;" : (hl ? "background:" + hl + ";" : "")}`, title: display }, display);
          td.dataset.r = String(ri);
          td.dataset.c = String(ci);
          if (hl) td.dataset.hl = hl;
          tr.appendChild(td);
        });
        tr.addEventListener("click", (e) => {
          if (selectMode || tdSel.contains(e.target) || tdNum.contains(e.target)) return;
          triggerPlay(row);
        });
        tbody.appendChild(tr);
      }
      if (range.end < view.length) {
        const sp = el("tr", {});
        sp.appendChild(el("td", { colSpan: span, style: `height:${(view.length - range.end) * ROW_HEIGHT}px;padding:0;border:0;` }));
        tbody.appendChild(sp);
      }
    }
    function updateCellHighlights() {
      tbody.querySelectorAll("td[data-r]").forEach((td) => {
        const on = cellSel.has(td.dataset.r + "," + td.dataset.c);
        td.style.background = on ? "#dbeafe" : (td.dataset.hl || "");
        td.style.outline = on ? "1px solid #93c5fd" : "";
        td.style.outlineOffset = on ? "-1px" : "";
      });
      updateCounts();
    }
    function selectRect(r1, c1, r2, c2) {
      cellSel.clear();
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) cellSel.add(r + "," + c);
    }
    function copyCellSelection() {
      if (!cellSel.size) return;
      const vf = visFields();
      let rMin = Infinity, rMax = -1, cMin = Infinity, cMax = -1;
      for (const key of cellSel) {
        const [r, c] = key.split(",").map(Number);
        rMin = Math.min(rMin, r); rMax = Math.max(rMax, r); cMin = Math.min(cMin, c); cMax = Math.max(cMax, c);
      }
      const lines = [];
      for (let r = rMin; r <= rMax; r++) {
        const cells = [];
        for (let c = cMin; c <= cMax; c++) cells.push(cellSel.has(r + "," + c) && view[r] ? cellText(view[r], vf[c]) : "");
        lines.push(cells.join("\t"));
      }
      const text = lines.join("\n");
      const done = () => toast(cellSel.size + " cell" + (cellSel.size === 1 ? "" : "s") + " copied");
      navigator.clipboard.writeText(text).then(done).catch(() => {
        const ta = el("textarea", { style: "position:fixed;left:-9999px;" });
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        done();
      });
    }
    tbody.addEventListener("mousedown", (e) => {
      if (S.grid.clickMode !== "select" || e.button !== 0) return;
      const td = e.target.closest ? e.target.closest("td[data-r]") : null;
      if (!td) return;
      e.preventDefault();
      const r = Number(td.dataset.r), c = Number(td.dataset.c);
      if (e.shiftKey && cellAnchor) selectRect(cellAnchor.r, cellAnchor.c, r, c);
      else if (e.ctrlKey) {
        const k = r + "," + c;
        if (cellSel.has(k)) cellSel.delete(k); else cellSel.add(k);
        cellAnchor = { r, c };
      } else {
        cellSel.clear();
        cellSel.add(r + "," + c);
        cellAnchor = { r, c };
      }
      cellDragging = true;
      updateCellHighlights();
      const onMove = (ev) => {
        if (!cellDragging || !cellAnchor) return;
        const t = document.elementFromPoint(ev.clientX, ev.clientY);
        const cell = t && t.closest ? t.closest("td[data-r]") : null;
        if (!cell) return;
        selectRect(cellAnchor.r, cellAnchor.c, Number(cell.dataset.r), Number(cell.dataset.c));
        updateCellHighlights();
      };
      const onUp = () => { cellDragging = false; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
    tableWrap.addEventListener("contextmenu", (e) => {
      if (e.target.closest && (e.target.closest("th") || !e.target.closest("td[data-r]"))) return;
      if (S.grid.clickMode !== "select" || !cellSel.size) return;
      e.preventDefault();
      menu(e.clientX, e.clientY, [{ label: "Copy", run: copyCellSelection }]);
    });
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && S.grid.clickMode === "select" && cellSel.size) {
        const a = document.activeElement;
        if (a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT") && a.selectionStart !== a.selectionEnd) return;
        e.preventDefault();
        copyCellSelection();
      }
    }
    document.addEventListener("keydown", onKey);
    tableWrap.addEventListener("scroll", () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => { renderRows(); rafPending = false; });
    });
    function setClickMode(mode) {
      S.grid.clickMode = mode === "play" ? "play" : "select";
      if (S.grid.clickMode === "play") {
        cellSel.clear();
        cellAnchor = null;
        clickModeBtn.textContent = "On Click: Play Audio";
        clickModeBtn.style.borderColor = "#6366f1";
        clickModeBtn.style.color = "#6366f1";
      } else {
        clickModeBtn.textContent = "On Click: Select Field";
        clickModeBtn.style.borderColor = "#22c55e";
        clickModeBtn.style.color = "#16a34a";
      }
      renderHeader();
      renderRows();
      scheduleSave();
    }

    function rowLabel(row) {
      const m = row.meta || {};
      const agent = getFV(m, "agentName");
      const tid = getFV(m, TRANS_FIELD) || row.key;
      const dt = getFV(m, "recordedDateTime");
      return [agent, tid, dt ? new Date(dt).toLocaleDateString() : ""].filter(Boolean).join(" \u00B7 ") || "Call";
    }
    function triggerPlay(row) {
      const smid = row.meta ? getFV(row.meta, "sourceMediaId") : "";
      if (!smid) { toast("No call is linked to this row yet. Add Nexidia Metadata first.", "#6b7280"); return; }
      if (!playerCtrl) {
        const pt = api.listTools().find((t) => t.id === "mediaPlayer");
        if (!pt || !pt._openPlayerPane) { window.open(PLAYER_URL(smid), "_blank"); return; }
        playerCtrl = pt._openPlayerPane(card, (reg) => { stopPlayer = reg; }, { initialHeight: "50vh" });
      }
      activeSmid = smid;
      const idx = view.indexOf(row);
      playerCtrl.setGridNav({
        items: view.map((r) => ({ row: r.meta || {} })),
        currentIndex: idx >= 0 ? idx : 0,
        onNavigate: (i) => { const t = view[i]; if (t) triggerPlay(t); }
      });
      playerCtrl.loadCall(smid, rowLabel(row), undefined, null);
      renderRows();
    }

    function escHtml(s) {
      return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    //##> EXCEL EXPORT: Unpacked columns export as text (x:str) by default so long identifiers like
    //##> User to User never turn into scientific notation. Only columns positively typed as Date,
    //##> Number, or Currency export as real Excel values. Metadata columns follow the same date,
    //##> duration, hold, and sentiment formatting as export.js. Merged cells with stacked values
    //##> always export as text.
    function exportCell(row, f) {
      const raw = cellRaw(row, f);
      const str = (v) => '<td x:str="' + escHtml(v) + '">' + escHtml(v) + "</td>";
      const num = (v, cls) => '<td class="' + cls + '" x:num="' + v + '">' + v + "</td>";
      if (!raw) return "<td></td>";
      if (f === "__conf__") return num(raw, "int");
      if (f.startsWith("m:")) {
        const k = f.slice(2).toLowerCase();
        if (k === "recordeddatetime") {
          const d = new Date(raw);
          if (!isNaN(d.getTime())) return num(d.getTime() / 86400000 + 25569, "dt");
        }
        if (k === "mediafileduration") { const sec = secondsFromMillisish(raw); if (sec !== null) return num(sec / 86400, "dur"); }
        if (k === "udfint4") { const sec = secondsFromMillisish(raw); if (sec !== null) return num(Math.round(sec), "int"); }
        if ((k === "sentimentscore" || k === "overallsentimentscore") && isFinite(Number(raw))) return num(Number(raw), "dec2");
        return str(raw);
      }
      const c = colById(f.slice(2));
      const t = effType(c);
      if (t === "date") {
        const d = parseLooseDate(raw);
        if (d) return num(Date.UTC(d.y, d.mo - 1, d.d) / 86400000 + 25569, "d");
      }
      if (t === "number" && /^-?\d+(\.\d+)?$/.test(raw) && raw.replace(/[-.]/g, "").length < 15) return num(raw, "gen");
      if (t === "currency" && /^\$?-?[\d,]+(\.\d+)?$/.test(raw)) {
        const n = Number(raw.replace(/[$,]/g, ""));
        if (isFinite(n)) return num(n, "cur");
      }
      return str(raw);
    }
    function doExcelExport(list) {
      if (!list.length) { toast("No rows to export.", "#6b7280"); return; }
      const fields = visFields();
      const cssText = [
        "table{border-collapse:collapse}",
        'td,th{padding:4px 8px;font-family:"Aptos Narrow","Aptos",Calibri,Arial,sans-serif;font-size:10pt;text-align:left;vertical-align:bottom;white-space:nowrap;border:none}',
        "th{font-weight:700}",
        '.dt{mso-number-format:"m\\/d\\/yyyy\\ h\\:mm"}',
        '.d{mso-number-format:"m\\/d\\/yyyy"}',
        '.dur{mso-number-format:"h\\:mm\\:ss"}',
        '.int{mso-number-format:"0"}',
        '.dec2{mso-number-format:"0.00"}',
        '.cur{mso-number-format:"\\$\\#\\,\\#\\#0\\.00"}',
        ".gen{mso-number-format:General}"
      ].join("");
      const head = "<tr>" + fields.map((f) => "<th>" + escHtml(headerOf(f)) + "</th>").join("") + "</tr>";
      const bodyRows = list.map((r) => "<tr>" + fields.map((f) => exportCell(r, f)).join("") + "</tr>").join("\n");
      const html = '<?mso-application progid="Excel.Sheet"?>' +
        '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
        '<head><meta charset="utf-8"/><style>' + cssText + "</style>" +
        "<xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Unpacked</x:Name>" +
        "<x:WorksheetOptions><x:FreezePanes/><x:FrozenNoSplit/><x:SplitHorizontal>1</x:SplitHorizontal>" +
        "<x:TopRowBottomPane>1</x:TopRowBottomPane><x:ActivePane>2</x:ActivePane>" +
        "</x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml>" +
        "</head><body><table>" + head + bodyRows + "</table></body></html>";
      const name = "nexidia_unpacked_" + stamp() + ".xls";
      if (xls && xls.downloadExcelFile) xls.downloadExcelFile(name, html);
      else {
        const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = el("a", { href: url, download: name });
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    }
    async function chooseScope() {
      if (!selected.size) return view;
      const r = await dialog({ title: "Export Options", message: `You have ${selected.size.toLocaleString()} row${selected.size === 1 ? "" : "s"} selected. Export selected or the entire grid?`, buttons: [{ label: "Export Selected", value: "sel", primary: true }, { label: "Export All", value: "all" }, { label: "Cancel", value: null }] });
      if (!r.value) return null;
      return r.value === "sel" ? view.filter((row) => selected.has(row.id)) : view;
    }
    async function exportExcel() {
      const list = await chooseScope();
      if (list) doExcelExport(list);
    }
    async function exportTranscripts() {
      const list = await chooseScope();
      if (!list) return;
      const tc = transColumn();
      const ids = [];
      for (const r of list) {
        let t = r.meta ? getFV(r.meta, TRANS_FIELD) : "";
        if (!t && tc) t = (r.tok[tc.id] || [])[0] || "";
        if (t && t !== "0" && !ids.includes(t)) ids.push(t);
      }
      if (!ids.length) { dialog({ title: "No Trans_Ids found", message: "None of these rows have a Trans_Id to send to the Batch Builder." }); return; }
      api.setShared("batchBuilderPreload", ids.join("\n"));
      const tool = api.listTools().find((t) => t.id === "transcriptBatchBuilder");
      if (tool) tool.open(); else dialog({ title: "Unavailable", message: "Transcript Batch Builder isn't loaded." });
    }
    function openAdHocPicker() {
      const metaFields = api.getShared("metadataFields") || [];
      const all = metaFields.filter((f) => f.isEnabled !== false && !S.metaFields.includes(f.storageName) && !hiddenFields.has(f.storageName));
      const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000015;display:flex;align-items:center;justify-content:center;" + FONT });
      const box = el("div", { style: "background:#fff;width:380px;border-radius:12px;padding:18px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
      box.appendChild(el("div", { style: "font-size:14px;font-weight:700;margin-bottom:10px;color:#111827;" }, "Add Nexidia Column"));
      const input = el("input", { type: "text", placeholder: "Search fields...", style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;margin-bottom:8px;" });
      const list = el("div", { style: "max-height:240px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px;" });
      const renderList = (q) => {
        list.innerHTML = "";
        const ql = q.toLowerCase().trim();
        const matches = all.filter((f) => !ql || String(f.displayName).toLowerCase().includes(ql) || String(f.storageName).toLowerCase().includes(ql));
        if (!matches.length) { list.appendChild(el("div", { style: "padding:10px;font-size:12px;color:#6b7280;" }, all.length ? "No fields found." : "Field list isn't loaded yet.")); return; }
        for (const f of matches.slice(0, 100)) {
          const row = el("div", { style: "padding:8px 10px;font-size:12px;cursor:pointer;border-bottom:1px solid #f1f5f9;color:#111827;" }, f.displayName);
          row.onmouseenter = () => { row.style.background = "#e8f0fe"; };
          row.onmouseleave = () => { row.style.background = ""; };
          row.onclick = () => { overlay.remove(); addMetaColumn(f.storageName, f.displayName); };
          list.appendChild(row);
        }
      };
      input.addEventListener("input", () => renderList(input.value));
      renderList("");
      const cancel = el("button", { style: "margin-top:10px;width:100%;" + PLAIN_BTN }, "Cancel");
      cancel.onclick = () => overlay.remove();
      box.appendChild(input);
      box.appendChild(list);
      box.appendChild(cancel);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      setTimeout(() => input.focus(), 50);
    }
    function addMetaColumn(field, header) {
      ensureMetaColumns();
      ensureMetaField(field, header);
      if (S.entries.length) {
        S.meta = {};
        S.metaStatus = {};
        fetchMetadata(false);
      } else refreshAll();
    }

    function openSettings() {
      const d = JSON.parse(JSON.stringify(S.settings));
      const colTypes = new Map(S.columns.map((c) => [c.id, c.type]));
      const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000014;display:flex;align-items:center;justify-content:center;" + FONT });
      const box = el("div", { style: "background:#fff;width:600px;max-width:95vw;max-height:88vh;overflow-y:auto;border-radius:12px;padding:22px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
      box.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#111827;margin-bottom:4px;" }, "Unpack Settings"));
      const section = (t) => el("div", { style: "font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:.05em;margin:16px 0 6px;padding-bottom:4px;border-bottom:1px solid #e5e7eb;" }, t);
      const info = (tip) => { const s = el("span", { style: "display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:#e0e7ff;color:#3730a3;font-size:10px;font-weight:700;cursor:help;margin-left:6px;flex-shrink:0;" }, "i"); s.title = tip; return s; };
      const label = (t, tipNode) => { const l = el("div", { style: "font-size:13px;color:#111827;display:flex;align-items:center;" }, t); if (tipNode) l.appendChild(tipNode); return l; };
      const line = (l, ctrl, indent) => el("div", { style: `display:flex;align-items:center;justify-content:space-between;gap:10px;margin:7px 0;${indent ? "padding-left:18px;" : ""}` }, l, ctrl);
      const select = (opts, val) => { const s = el("select", { style: "padding:5px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;width:210px;" }); for (const [v, t] of opts) s.appendChild(el("option", { value: v }, t)); s.value = val; return s; };
      const textIn = (val, max) => el("input", { type: "text", value: val, maxLength: max, style: "padding:5px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;width:210px;box-sizing:border-box;" });

      box.appendChild(section("Primary Key"));
      const pkInput = textIn(d.primaryKey, 80);
      pkInput.setAttribute("list", "nx-unpack-pk-options");
      const dl = el("datalist", { id: "nx-unpack-pk-options" });
      const sugg = new Set();
      S.columns.forEach((c) => sugg.add(c.header));
      colPrefs().headers.forEach((h) => sugg.add(h));
      (api.getShared("metadataFields") || []).forEach((f) => { if (f.displayName) sugg.add(f.displayName); });
      sugg.forEach((v) => dl.appendChild(el("option", { value: v })));
      box.appendChild(dl);
      box.appendChild(line(label("Primary Key", info("What field will uniquely identify your call? This will be used to fill metadata and handle duplicates.")), pkInput));
      const pkNote = el("div", { style: "font-size:11px;padding-left:2px;margin-top:-2px;" });
      box.appendChild(pkNote);

      box.appendChild(section("Duplicate Handling"));
      const combineCb = el("input", { type: "checkbox", checked: d.combine });
      const combineTip = info("");
      box.appendChild(line(label("Combine Duplicates", combineTip), combineCb));
      const dupWrap = el("div", {});
      box.appendChild(dupWrap);
      const basicSel = select(BASIC_RULES, d.basicRule);
      dupWrap.appendChild(line(label("Conflicting Values (Basic)", info("Majority Rule: When a majority value exists, only populate that value.\nList All (deduped): List every unique value that appears.\nList All (not deduped): List all values in the order they appeared.\nShow First: Only list the first value that appeared, discard the rest.\nShow Last: Only list the last value that appeared, discard the rest.")), basicSel));
      const noMajSel = select(NO_MAJORITY_RULES, d.noMajority);
      const noMajRow = line(label("If No Majority Exists:"), noMajSel, true);
      dupWrap.appendChild(noMajRow);
      const basicDelimIn = textIn(d.basicDelim, 20);
      const basicDelimRow = line(label("Separate Values With:"), basicDelimIn, true);
      dupWrap.appendChild(basicDelimRow);
      const proseSel = select(PROSE_RULES, d.proseRule);
      dupWrap.appendChild(line(label("Conflicting Values (Prose)", info("Prose = Freehand values like summaries that are different every time.")), proseSel));
      const proseDelimIn = textIn(d.proseDelim, 20);
      const proseDelimRow = line(label("Separate Values With:"), proseDelimIn, true);
      dupWrap.appendChild(proseDelimRow);

      dupWrap.appendChild(el("div", { style: "font-size:13px;color:#111827;margin:14px 0 6px;display:flex;align-items:center;" }, "Highlight Options", info("Color cells where duplicates disagreed, based on how the conflict was resolved. Only applies to rows that were combined from more than one output.")));
      const matrix = el("table", { style: "border-collapse:collapse;font-size:11px;width:100%;" });
      const hr = el("tr", {});
      hr.appendChild(el("th", {}));
      for (const [, l] of HL_COLS) hr.appendChild(el("th", { style: "padding:4px;color:#6b7280;font-weight:600;text-align:center;" }, l));
      matrix.appendChild(hr);
      const cellName = (rk, ck) => `${HL_ROWS.find(([k]) => k === rk)[1]} / ${HL_COLS.find(([k]) => k === ck)[1]}`;
      const paintSwatch = (sw, color) => { sw.style.cssText = `width:26px;height:18px;border-radius:4px;border:1px solid #d1d5db;cursor:pointer;display:inline-block;${color ? "background:" + color + ";" : NO_FILL_STYLE}`; sw.title = color ? "Click to change" : "No Fill"; };
      for (const [rk, rl] of HL_ROWS) {
        const tr = el("tr", {});
        tr.appendChild(el("td", { style: "padding:6px 4px;color:#374151;font-weight:600;white-space:nowrap;" }, rl));
        for (const [ck] of HL_COLS) {
          const td = el("td", { style: "padding:6px 4px;text-align:center;" });
          if (rk === "prose" && !PROSE_HL_ALLOWED.has(ck)) { tr.appendChild(td); continue; }
          const sw = el("span", {});
          paintSwatch(sw, d.highlight[rk][ck]);
          sw.onclick = () => openPalette(sw, rk, ck);
          td.appendChild(sw);
          tr.appendChild(td);
        }
        matrix.appendChild(tr);
      }
      dupWrap.appendChild(matrix);
      function openPalette(sw, rk, ck) {
        const pop = popover(sw, 170);
        pop.style.zIndex = "1000016";
        const grid = el("div", { style: "display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:8px;" });
        const pick = async (color) => {
          pop.remove();
          if (color) {
            const others = [];
            for (const [r2] of HL_ROWS) for (const [c2] of HL_COLS) if (!(r2 === rk && c2 === ck) && d.highlight[r2][c2] === color) others.push(cellName(r2, c2));
            if (others.length) {
              const r = await dialog({ title: "Color already in use", message: `Use this color for ${joinNames(others)} and this one?`, buttons: [{ label: "Yes", value: true, primary: true }, { label: "Cancel", value: false }] });
              if (!r.value) return;
            }
            d.highlight[rk][ck] = color;
          } else delete d.highlight[rk][ck];
          paintSwatch(sw, color);
        };
        for (const color of PALETTE) {
          const c = el("span", { style: `width:24px;height:20px;border-radius:4px;background:${color};border:1px solid #d1d5db;cursor:pointer;display:inline-block;` });
          c.onclick = () => pick(color);
          grid.appendChild(c);
        }
        pop.appendChild(grid);
        const none = el("div", { style: "display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;color:#374151;" });
        const ns = el("span", { style: `width:24px;height:18px;border-radius:4px;border:1px solid #d1d5db;display:inline-block;${NO_FILL_STYLE}` });
        none.appendChild(ns);
        none.appendChild(document.createTextNode("No Fill"));
        none.onclick = () => pick(null);
        pop.appendChild(none);
      }
      const confCb = el("input", { type: "checkbox", checked: d.showConfidence });
      const confTip = info("");
      dupWrap.appendChild(line(label("Display Confidence Score", confTip), confCb));

      box.appendChild(section("Metadata"));
      const autoCb = el("input", { type: "checkbox", checked: d.autoMeta });
      box.appendChild(line(label("Add Nexidia Metadata Automatically", info("Look up each new call in Nexidia as soon as it's added. When this is off, use the Add Nexidia Metadata button instead.")), autoCb));

      if (S.columns.length) {
        box.appendChild(section("Column Types"));
        box.appendChild(el("div", { style: "font-size:11px;color:#6b7280;margin-bottom:4px;" }, "Auto Detect reads the values as they come in. Prose columns use the Prose rules above; everything else uses the Basic rules."));
        for (const c of S.columns) {
          const sel = el("select", { style: "padding:4px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;width:210px;" });
          for (const [v, l] of TYPES) sel.appendChild(el("option", { value: v }, v === "auto" ? `${l} (${TYPE_LABELS[c.detected] || c.detected})` : l));
          sel.value = colTypes.get(c.id);
          sel.onchange = () => colTypes.set(c.id, sel.value);
          box.appendChild(line(label(c.header), sel));
        }
      }

      const sync = () => {
        const pkName = pkInput.value.trim() || "Primary Key";
        combineTip.title = `Combine rows with a ${pkName} value in common, rather than list multiple rows for the same call. (Recommended)`;
        confTip.title = `If duplicate rows are detected by ${pkName}, a confidence score will display how many times it appeared. Use this if you're running your calls through multiple passes to measure how many times each call was flagged.`;
        const lk = pkInput.value.trim().toLowerCase();
        const gridCol = S.columns.find((c) => c.aliases.some((a) => String(a).toLowerCase() === lk));
        const searchable = !!searchFieldFor(pkInput.value) || (gridCol && gridCol.aliases.some((a) => searchFieldFor(a)));
        if (!lk) { pkNote.textContent = ""; }
        else if (!S.columns.length) { pkNote.textContent = searchable ? "Nexidia field. Metadata can be added with it." : "Not a Nexidia field. Duplicates can be combined, but metadata can't be searched."; pkNote.style.color = searchable ? "#16a34a" : "#b45309"; }
        else if (!gridCol) { pkNote.textContent = "No column on the grid has this name yet."; pkNote.style.color = "#b91c1c"; }
        else { pkNote.textContent = searchable ? "On the grid and searchable in Nexidia." : "On the grid, but not a Nexidia field. Metadata can't be searched with it."; pkNote.style.color = searchable ? "#16a34a" : "#b45309"; }
        dupWrap.style.opacity = combineCb.checked ? "1" : "0.45";
        dupWrap.style.pointerEvents = combineCb.checked ? "" : "none";
        noMajRow.style.display = basicSel.value === "majority" ? "flex" : "none";
        const listing = basicSel.value === "listDedup" || basicSel.value === "listAll" || (basicSel.value === "majority" && noMajSel.value === "all");
        basicDelimRow.style.display = listing ? "flex" : "none";
        proseDelimRow.style.display = proseSel.value === "listAll" ? "flex" : "none";
      };
      [pkInput, basicDelimIn, proseDelimIn].forEach((n) => n.addEventListener("input", sync));
      [combineCb, basicSel, noMajSel, proseSel].forEach((n) => n.addEventListener("change", sync));
      sync();

      const btnRow = el("div", { style: "display:flex;gap:8px;margin-top:18px;" });
      const applyB = el("button", { style: "flex:1;" + PRIMARY_BTN }, "Apply");
      const cancelB = el("button", { style: "flex:1;" + PLAIN_BTN }, "Cancel");
      btnRow.appendChild(applyB);
      btnRow.appendChild(cancelB);
      box.appendChild(btnRow);
      cancelB.onclick = () => { closePopovers(); overlay.remove(); };
      applyB.onclick = () => {
        d.primaryKey = pkInput.value.trim() || "Trans_Id";
        d.combine = combineCb.checked;
        d.basicRule = basicSel.value;
        d.noMajority = noMajSel.value;
        d.basicDelim = basicDelimIn.value || ";";
        d.proseRule = proseSel.value;
        d.proseDelim = proseDelimIn.value || "|";
        d.showConfidence = confCb.checked;
        d.autoMeta = autoCb.checked;
        const pkChanged = d.primaryKey !== S.settings.primaryKey;
        const autoTurnedOn = d.autoMeta && !S.settings.autoMeta;
        S.settings = d;
        for (const c of S.columns) if (colTypes.has(c.id)) c.type = colTypes.get(c.id);
        if (pkChanged) {
          S.meta = {};
          S.metaStatus = {};
          clearNotice("missing");
          clearNotice("pk");
        }
        closePopovers();
        overlay.remove();
        updateMetaBtn();
        refreshAll();
        if ((pkChanged || autoTurnedOn) && d.autoMeta && S.entries.length) fetchMetadata(true);
      };
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    }

    //##> RESUME BANNER: Sessions are saved to IndexedDB as you work and deleted when the tool is closed
    //##> properly (X or Main Menu). So a session only shows up here if the tab crashed, reloaded, or was
    //##> closed without exiting the tool. Nothing loads unless the user picks Resume.
    async function renderBanner() {
      const all = (await dbAll()).filter((r) => r && r.id !== S.sessionId && !bannerDismissed.has(r.id));
      bannerWrap.innerHTML = "";
      if (!all.length || closed) { bannerWrap.style.display = "none"; return; }
      all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      bannerWrap.style.display = "block";
      bannerWrap.appendChild(el("div", { style: "font-size:12px;font-weight:700;color:#92400e;margin-bottom:4px;" }, all.length === 1 ? "Were you finished with this session?" : "Were you finished with these sessions?"));
      for (const rec of all) {
        const row = el("div", { style: "display:flex;align-items:center;gap:8px;padding:3px 0;" });
        const when = new Date(rec.updatedAt || rec.createdAt).toLocaleString();
        row.appendChild(el("div", { style: "flex:1;font-size:12px;color:#78350f;" }, `Last edited ${when} \u00B7 ${Number(rec.rowCount || 0).toLocaleString()} rows \u00B7 ${Number(rec.pasteCount || 0).toLocaleString()} pastes`));
        const mk = (t, color) => el("button", { style: btnStyle(color, "padding:3px 9px;font-size:11px;") }, t);
        const resumeB = mk("Resume Session", "#1d4ed8");
        const saveB = mk("Save", "#16a34a");
        const expB = mk("Export", "#b45309");
        const discB = mk("Discard", "#b91c1c");
        resumeB.onclick = async () => {
          if (S.entries.length) {
            const r = await dialog({ title: "Resume session?", message: "Your current session will stay saved in this list so you can come back to it.", buttons: [{ label: "Resume", value: true, primary: true }, { label: "Cancel", value: false }] });
            if (!r.value) return;
            saveNow();
          } else dbDel(S.sessionId);
          loadSessionData(rec.data, true);
          if (S.settings.autoMeta && S.entries.length) fetchMetadata(true);
          renderBanner();
        };
        saveB.onclick = () => { bannerDismissed.add(rec.id); renderBanner(); };
        expB.onclick = () => downloadText("nexidia_unpack_session_" + stamp() + ".txt", sessionFile(rec.data));
        discB.onclick = async () => {
          const r = await dialog({ title: "Discard session?", message: "This session will be deleted permanently.", buttons: [{ label: "Discard", value: true, primary: true }, { label: "Cancel", value: false }] });
          if (!r.value) return;
          await dbDel(rec.id);
          renderBanner();
        };
        [resumeB, saveB, expB, discB].forEach((b) => row.appendChild(b));
        bannerWrap.appendChild(row);
      }
    }

    function defaultGridOrder() {
      const meta = S.metaFields.map((f) => "m:" + f);
      const json = S.columns.map((c) => "j:" + c.id);
      return meta.concat(S.settings.showConfidence ? ["__conf__"] : [], json);
    }
    async function resetPrompt() {
      const r = await dialog({
        title: "Clear / Reset",
        message: "Choose what to reset. Clear Transformations rebuilds from the original CoPilot objects. Clear Page removes everything. You can export first from either option.",
        buttons: [{ label: "Clear Transformations", value: "transform", primary: true }, { label: "Clear Page", value: "page" }, { label: "Cancel", value: null }]
      });
      if (r.value === "transform") openResetTransformations();
      else if (r.value === "page") confirmClearPage();
    }
    async function openResetTransformations() {
      const options = [
        ["filters", "Filters", "Clear column and global filters"],
        ["added", "Added Columns", "Remove manually added Nexidia columns"],
        ["removed", "Removed Columns", "Restore hidden columns and removed rows"],
        ["sorts", "Sorts", "Restore original object order"],
        ["merges", "Merges", "Undo all column merges"],
        ["layout", "Column Layout", "Restore column order and widths"],
        ["renames", "Renames and Type Overrides", "Restore original column names and automatic typing"],
        ["highlights", "Highlights", "Clear highlight colors"],
        ["imports", "Spreadsheet Joins", "Remove values added through Import Spreadsheet"],
        ["metadata", "Metadata", "Remove fetched Nexidia metadata"]
      ];
      const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000020;display:flex;align-items:center;justify-content:center;" + FONT });
      const box = el("div", { style: "background:#fff;width:500px;max-width:94vw;max-height:84vh;overflow:auto;border-radius:12px;padding:22px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
      box.appendChild(el("div", { style: "font-size:15px;font-weight:700;margin-bottom:6px;" }, "Clear Transformations"));
      box.appendChild(el("div", { style: "font-size:12px;color:#4b5563;margin-bottom:12px;" }, "Selected items will be rebuilt from the original CoPilot objects. All are selected by default."));
      const checks = {};
      for (const [key, label, help] of options) {
        const cb = el("input", { type: "checkbox", checked: true }); checks[key] = cb;
        box.appendChild(el("label", { style: "display:flex;align-items:flex-start;gap:8px;padding:6px 0;cursor:pointer;" }, cb, el("span", {}, el("div", { style: "font-size:12px;font-weight:600;" }, label), el("div", { style: "font-size:10px;color:#6b7280;" }, help))));
      }
      const btns = el("div", { style: "display:flex;gap:8px;margin-top:14px;" });
      const exp = el("button", { style: "flex:1;" + PRIMARY_BTN }, "Export Session & Continue");
      const go = el("button", { style: "flex:1;" + PLAIN_BTN }, "Continue Without Export");
      const cancel = el("button", { style: "flex:1;" + PLAIN_BTN }, "Cancel");
      btns.append(exp, go, cancel); box.append(btns); overlay.append(box); document.body.append(overlay);
      const apply = (doExport) => {
        if (doExport) exportSession();
        if (checks.filters.checked) { S.grid.filters = {}; S.grid.globalFilter = ""; globalSearchBox.value = ""; }
        if (checks.added.checked) { const defaults = new Set(colPrefs().fields); S.metaFields = S.metaFields.filter((f) => defaults.has(f)); for (const f of Object.keys(S.metaHeaders)) if (!defaults.has(f)) delete S.metaHeaders[f]; }
        if (checks.removed.checked) S.removed = [];
        if (checks.sorts.checked) S.grid.sorts = [];
        if (checks.merges.checked) { for (const m of S.merges) { const k = pairKey(m.source, m.target); if (!S.mergeDismissed.includes(k)) S.mergeDismissed.push(k); } S.merges = []; }
        if (checks.renames.checked) for (const c of S.columns) { c.header = c.source; c.aliases = [c.source]; c.type = "auto"; c.nullEq = {}; }
        if (checks.highlights.checked) S.settings.highlight = { basic: {}, prose: {} };
        if (checks.imports.checked) S.imports = [];
        if (checks.metadata.checked) { S.meta = {}; S.metaStatus = {}; S.metaAdded = false; clearNotice("missing"); }
        if (checks.layout.checked || checks.added.checked || checks.merges.checked) { S.grid.order = defaultGridOrder(); S.grid.widths = {}; }
        if (checks.removed.checked || checks.layout.checked || checks.added.checked || checks.merges.checked) S.grid.visible = S.grid.order.slice();
        overlay.remove(); selected.clear(); refreshAll();
      };
      exp.onclick = () => apply(true); go.onclick = () => apply(false); cancel.onclick = () => overlay.remove();
    }
    async function confirmClearPage() {
      const r = await dialog({ title: "Clear Page?", danger: true, message: "This removes the raw CoPilot objects, metadata, joins, and every transformation from this page.", buttons: [{ label: "Export Session & Clear", value: "export", primary: true }, { label: "Clear Without Export", value: "clear" }, { label: "Cancel", value: null }] });
      if (!r.value) return;
      if (r.value === "export") exportSession();
      const id = S.sessionId; S = newState(); selected.clear(); cellSel.clear(); activeSmid = null; await dbDel(id); renderInput(); globalSearchBox.value = ""; refreshAll(); toast("Page cleared", "#6b7280");
    }
    function timestampColumns() {
      return S.columns.filter((c) => effType(c) === "timestamp" && !mergeSourceOf("j:" + c.id));
    }
    async function chooseTimestampColumn() {
      const choices = S.columns.map((c) => ({ label: c.header, value: c.id }));
      const r = await dialog({ title: "Select Timestamp Column", message: "No timestamp column has been identified yet. Select the column containing Label@MM:SS, MM:SS, or H:MM:SS values.", list: choices, listClickable: true, buttons: [{ label: "Cancel", value: null }] });
      if (!r.value) return null;
      const c = colById(r.value); if (c) { c.type = "timestamp"; refreshAll(); } return c;
    }
    async function playTimestamps() {
      let cols = timestampColumns();
      if (!cols.length) { const chosen = await chooseTimestampColumn(); if (!chosen) return; cols = [chosen]; }
      const items = [];
      let skippedDuration = 0, noCall = 0;
      for (const row of rows) {
        const smid = row.meta ? getFV(row.meta, "sourceMediaId") : "";
        let stamps = [];
        for (const c of cols) for (const token of (row.tok[c.id] || [])) stamps.push(...timestampTokens(token, c.header));
        stamps = stamps.filter((t, i, a) => a.findIndex((x) => x.ms === t.ms && x.label.toLowerCase() === t.label.toLowerCase()) === i);
        if (!stamps.length) continue;
        const dur = row.meta ? secondsFromMillisish(getFV(row.meta, "mediaFileDuration")) : null;
        if (dur !== null) { const before = stamps.length; stamps = stamps.filter((t) => t.ms <= dur * 1000); skippedDuration += before - stamps.length; }
        if (!stamps.length) continue;
        if (!smid) { noCall++; continue; }
        items.push({ key: row.key, smid, displayLabel: rowLabel(row), timestamps: stamps });
      }
      if (!items.length) { dialog({ title: "No playable timestamps", message: noCall ? "Timestamped rows were found, but their calls are not linked to Nexidia metadata." : "No valid timestamp values were found in the selected column." }); return; }
      api.setShared("playlistState", { mode: "standalone", timestampsPrimary: true, items });
      if (!playerCtrl) {
        const pt = api.listTools().find((t) => t.id === "mediaPlayer");
        if (!pt || !pt._openPlayerPane) { dialog({ title: "Media Player unavailable", danger: true, message: "The Media Player module is not loaded." }); return; }
        playerCtrl = pt._openPlayerPane(card, (reg) => { stopPlayer = reg; }, { initialHeight: "50vh", closeable: true, onClosed: () => { playerCtrl = null; stopPlayer = null; activeSmid = null; api.setShared("playlistState", null); } });
      }
      playerCtrl.setPlaylist(items); playerCtrl.loadPlaylistIndex(0);
      if (skippedDuration) addNotice("error", `${skippedDuration} timestamp${skippedDuration === 1 ? " was" : "s were"} skipped because ${skippedDuration === 1 ? "it was" : "they were"} beyond the call duration.`, "timestampDuration");
    }
    function teardown() {
      closed = true;
      clearTimeout(saveTimer);
      if (typeof stopPlayer === "function") { try { stopPlayer(); } catch (_) {} }
      removeDragGhost();
      closePopovers();
      document.removeEventListener("keydown", onKey);
      document.querySelectorAll("[data-unpack-prompt]").forEach((p) => p.remove());
      try { modal.remove(); } catch (_) {}
      try { stickyClose.remove(); } catch (_) {}
    }
    async function requestClose(toMenu) {
      if (S.entries.length) {
        const r = await dialog({
          title: "Close this session?",
          message: "Closing clears this session. Export Session first if you want to pick it back up later.",
          buttons: [{ label: "Export & Close", value: "export", primary: true }, { label: "Close", value: "close" }, { label: "Cancel", value: null }]
        });
        if (!r.value) return;
        if (r.value === "export") exportSession();
      }
      const id = S.sessionId;
      teardown();
      await dbDel(id);
      if (toMenu) {
        const fn = api.getShared("openEntryMenu");
        if (typeof fn === "function") fn();
      }
    }

    stickyClose.onclick = () => requestClose(false);
    menuBtn.onclick = () => requestClose(true);
    settingsBtn.onclick = () => openSettings();
    metaBtn.onclick = () => fetchMetadata(false);
    mergeBtn.onclick = () => {
      if (!S.columns.length) { toast("Paste a CoPilot output first.", "#6b7280"); return; }
      openMergeDialog([{ left: "", right: "", manual: true }], false);
    };
    columnsBtn.onclick = () => { colPanel.style.display = colPanel.style.display === "none" ? "block" : "none"; };
    adHocBtn.onclick = () => openAdHocPicker();
    importSheetBtn.onclick = () => sheetInput.click();
    sheetInput.onchange = () => { const f = sheetInput.files && sheetInput.files[0]; sheetInput.value = ""; if (f) importSpreadsheet(f); };
    exportExcelBtn.onclick = () => exportExcel();
    exportTranscriptsBtn.onclick = () => exportTranscripts();
    exportSessionBtn.textContent = "Export Data";
    exportSessionBtn.title = "Export the entire session or only the original CoPilot outputs.";
    importSessionBtn.textContent = "Import Data";
    importSessionBtn.title = "Import a saved session or raw CoPilot outputs.";
    exportSessionBtn.onclick = () => chooseExportData();
    importSessionBtn.onclick = () => chooseImportData();
    sessionInput.onchange = () => { const f = sessionInput.files && sessionInput.files[0]; const mode = sessionInput.dataset.mode; sessionInput.value = ""; if (f) { if (mode === "raw") importRawFile(f); else importSessionFile(f); } };
    removeSelectedBtn.onclick = async () => {
      const r = await dialog({ title: "Remove rows?", message: `Remove ${selected.size.toLocaleString()} selected row${selected.size === 1 ? "" : "s"} from the grid?`, buttons: [{ label: "Remove", value: true, primary: true }, { label: "Cancel", value: false }] });
      if (r.value) removeRows([...selected]);
    };
    resetBtn.onclick = () => resetPrompt();
    playTimestampsBtn.onclick = () => playTimestamps();
    clickModeBtn.onclick = () => setClickMode(S.grid.clickMode === "select" ? "play" : "select");
    globalSearchBox.oninput = () => { S.grid.globalFilter = globalSearchBox.value || ""; rerender(); };

    (async () => {
      if (!api.getShared("metadataFields")) {
        try {
          const res = await fetch(FIELDS_URL, { credentials: "include", cache: "no-store" });
          if (res.ok) {
            const json = await res.json();
            api.setShared("metadataFields", Array.isArray(json) ? json.filter((f) => f.isEnabled !== false) : []);
          }
        } catch (_) {}
      }
    })();
    setClickMode("select");
    updateMetaBtn();
    renderInput();
    refreshAll();
    renderBanner();
  }

  api.registerTool({ id: "unpack", label: "Unpack CoPilot Outputs", open: openUnpack });
})();
