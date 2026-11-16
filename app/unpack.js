//[Last Update: 10:30 AM 11/16/2026]
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
  const KNOWN_PAIRS = [["notes", "summary"], ["tin", "providertaxid"], ["tin", "taxid"], ["providertaxid", "taxid"]];
  const ROW_HEIGHT = 28;
  const BUFFER_ROWS = 20;
  const DEFAULT_COL_W = 150;
  const COL0_W = 36;
  const COL1_W = 44;
  const PLAY_COL_W = 28;
  const EDIT_COLOR = "#f97316";
  const COMPLETE_DELAY_MS = 2000;
  const PLAYER_DEFAULTS = { showAllEvents: false, stageFields: ["agentName", "recordedDateTime"], tagEditCaret: "newline", tagUnhide: false, tsUse: {} };
  //##> PLAYER HEIGHTS: Timestamp mode and regular grid playback each remember their own player height in
  //##> this browser, saved whenever the user drags the player's top edge. Timestamp mode defaults to filling
  //##> everything under the toolbar, which hides the grid until the player is dragged down.
  const LS_TS_HEIGHT = "nexidia_unpack_ts_height";
  const LS_GRID_HEIGHT = "nexidia_unpack_grid_height";
  const LS_ALL_DONE = "nexidia_unpack_all_done";
  const LS_EDITOR_POS = "nexidia_unpack_editor_pos";
  const DEFAULT_STEPS = [
    "Build your prompt: open the PromptBuilder below, paste all of it into a new CoPilot chat, describe your job at the bottom under \"Input from Analyst\", and work through its questions until it hands you a finished prompt.",
    "Run your batches: send each transcript batch file with that prompt in its own fresh CoPilot chat.",
    "Check each response ends with a closing curly bracket }, copy it, and paste it into the box below. Rows are added to the grid as you go.",
    "Metadata from Nexidia is added using your primary key (Trans_Id by default). If your columns look like Nexidia's, you'll be asked whether to merge them. Adjust duplicates, delimiters, and highlights in Unpack Settings.",
    "Review your rows and play calls. To fix a value, switch On Click to Edit Field and click the cell. If your outputs have timestamps, use Play All Timestamps to work through them one at a time. Use Save Session to keep a copy you can load later and keep working.",
    "When you're finished, click Export to save the grid, your session log, or the raw outputs you pasted, as Excel, CSV, or text."
  ];
  const STRIP_ROW_H = 26;
  const STRIP_ROWS_COLLAPSED = 2;
  const STRIP_ROWS_EXPANDED_ABOVE = 4;
  const STRIP_ROWS_EXPANDED_BELOW = 5;
  //##> TIMESTAMP DETECTION: A column is a timestamp field if any value looks like Label@MM:SS, if it's a
  //##> CoPilot column where every value is a plain MM:SS (or H:MM:SS), or if its name contains "timestamp".
  //##> Plain MM:SS in Nexidia columns (like Duration) never counts.
  const TS_TAG_RE = /^(.*?)@\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*$/;
  const TS_TIME_RE = /^\d{1,2}:\d{2}(?::\d{2})?$/;
  const PALETTE = ["#fde68a", "#fecaca", "#bbf7d0", "#bfdbfe", "#ddd6fe", "#fbcfe8", "#fed7aa", "#a5f3fc", "#d9f99d", "#e5e7eb"];
  const NO_FILL_STYLE = "background:linear-gradient(to top right,#fff calc(50% - 1px),#ef4444 50%,#fff calc(50% + 1px));";
  const BASIC_RULES = [["majority", "Majority Rule"], ["listDedup", "List All (deduped)"], ["listAll", "List All (not deduped)"], ["first", "Show First"], ["last", "Show Last"]];
  const NO_MAJORITY_RULES = [["first", "List the first value only"], ["last", "List the last value only"], ["all", "List all values"]];
  const PROSE_RULES = [["listAll", "List All"], ["first", "Show First"], ["last", "Show Last"]];
  const HL_COLS = [["majority", "Majority Selected"], ["noMajority", "No Majority"], ["first", "First Only"], ["last", "Last Only"], ["all", "Listing All"]];
  const HL_ROWS = [["basic", "Basic Values"], ["prose", "Prose Values"]];
  const PROSE_HL_ALLOWED = new Set(["first", "last", "all"]);
  const TYPES = [["auto", "Auto Detect"], ["text", "Text"], ["prose", "Prose"], ["boolean", "Boolean"], ["categorical", "Categorical"], ["identifier", "Identifier"], ["number", "Number"], ["currency", "Currency"], ["date", "Date"]];
  const TYPE_LABELS = Object.fromEntries(TYPES);
  const NULL_EQ = [["zero", "0 = blank"], ["zeros", "All-zero groupings = blank"], ["null", "null = blank"], ["false", "false = blank"], ["na", "N/A = blank"]];
  const KNOWN_MESSAGES = [/^no transcripts found\.?$/i, /^no file attached\.?$/i, /^no matches found\.?$/i];
  const OP_LIST = [["hideempty", "Hide Empty"], ["showempty", "Show Empty Only"], ["contains", "Contains"], ["notcontains", "Does Not Contain"], ["exact", "Exact Match"], ["startswith", "Starts With"], ["endswith", "Ends With"], ["gt", "Greater Than"], ["lt", "Less Than"], ["eq", "Equal To"], ["between", "Between"]];
  const NO_VALUE_OPS = new Set(["hideempty", "showempty"]);
  const TWO_VALUE_OPS = new Set(["between"]);
  const CLICK_MODES = {
    select: { text: "On Click: Select Field", color: "#22c55e", textColor: "#16a34a", tip: "Clicking a cell selects it. Click to switch to Play Audio." },
    play: { text: "On Click: Play Audio", color: "#6366f1", textColor: "#6366f1", tip: "Clicking a row plays its call. Click to switch to Edit Field." },
    edit: { text: "On Click: Edit Field", color: "#f59e0b", textColor: "#b45309", tip: "Clicking a cell lets you type over it. Enter, Tab, or clicking away saves. Esc cancels. Click to switch to Select Field." }
  };
  const CLICK_ORDER = ["select", "play", "edit"];
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
  function timeToMs(s) {
    const parts = String(s).split(":").map((p) => parseInt(p, 10));
    if (parts.some((n) => isNaN(n))) return null;
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
    if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    return null;
  }
  function parseTsToken(tok, fallbackLabel) {
    const t = String(tok || "").trim();
    if (!t) return null;
    const m = t.match(TS_TAG_RE);
    if (m) {
      const ms = timeToMs(m[2]);
      return ms === null ? null : { label: m[1].trim() || fallbackLabel, ms, labeled: true };
    }
    if (TS_TIME_RE.test(t)) {
      const ms = timeToMs(t);
      return ms === null ? null : { label: fallbackLabel, ms, labeled: false };
    }
    return null;
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
    return { status: "ok", objects, dups, sources: scan.objects };
  }
  //##> FORMATS: Date, Currency, and Number columns can have a display format. A column's format comes from,
  //##> in order: the user's choice in Attributes, the report's column setup, or a pattern learned from the
  //##> values (zero values are ignored). Learning waits for FORMAT_MIN_SAMPLES values and needs
  //##> FORMAT_MIN_SHARE of them to agree, so early mixed values don't lock anything in. Formatting is applied
  //##> when the grid is built, so the original pasted values are never changed. Values that can't be read
  //##> as the column's type are left exactly as they came in.
  const FORMATS = {
    date: [["M/D/YYYY", "4/30/2026"], ["MM/DD/YYYY", "04/30/2026"], ["M/D/YY", "4/30/26"], ["MM/DD/YY", "04/30/26"], ["YYYY-MM-DD", "2026-04-30"]],
    currency: [["$#,##0.00", "$25,444.00"], ["$#,##0", "$25,444"], ["#,##0.00", "25,444.00"], ["0.00", "25444.00"]],
    number: [["#,##0", "25,444"], ["0", "25444"]]
  };
  const BUILTIN_CHECKS = {
    npi: { label: "NPI: 10 digits starting with 1", names: ["npi", "providernpi", "npinumber"], test: (v) => /^1\d{9}$/.test(v.replace(/\s/g, "")), message: "NPIs should be 10 digits starting with 1." },
    tin: { label: "TIN: 9 digits (leading zeros count)", names: ["tin", "providertaxid", "taxid", "providertin", "taxidnumber"], test: (v) => /^\d{9}$/.test(v.replace(/[\s-]/g, "")), message: "TINs should be 9 digits. Leading zeros count." }
  };
  const CHECK_TYPES = [["required", "Required (not blank)"], ["length", "Character count"], ["range", "Value range"], ["contains", "Contains"], ["notContains", "Doesn't contain"], ["startsWith", "Starts with"], ["endsWith", "Ends with"], ["allowed", "One of a list"], ["npi", "NPI format"], ["tin", "TIN format"], ["pattern", "Pattern (reports only)"]];
  const FORMAT_MIN_SAMPLES = 3;
  const FORMAT_MIN_SHARE = 0.8;
  function isZeroish(t) {
    return /^\(?-?\$?\s*-?0+(\.0+)?\)?$/.test(String(t == null ? "" : t).trim());
  }
  function daysIn(y, mo) {
    return new Date(Date.UTC(y, mo, 0)).getUTCDate();
  }
  function parseDateToken(t) {
    const s = String(t == null ? "" : t).trim();
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
    let p = null;
    if (m) {
      let y = Number(m[3]);
      if (m[3].length === 2) y += 2000;
      p = { y, mo: Number(m[1]), d: Number(m[2]), padM: m[1].length === 2, padD: m[2].length === 2, yLen: m[3].length, iso: false };
    } else {
      m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ][\d:.]+Z?)?$/);
      if (m) p = { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]), padM: true, padD: true, yLen: 4, iso: true };
    }
    if (!p) return null;
    if (p.mo < 1 || p.mo > 12 || p.d < 1 || p.d > daysIn(p.y, p.mo) || p.y < 1900 || p.y > 2100) return null;
    return p;
  }
  function parseMoneyToken(t) {
    let s = String(t == null ? "" : t).trim();
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
    if (s.startsWith("-")) { neg = !neg; s = s.slice(1).trim(); }
    const dollar = s.startsWith("$");
    if (dollar) s = s.slice(1).trim();
    if (s.startsWith("-")) { neg = !neg; s = s.slice(1).trim(); }
    if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(s)) return null;
    const commas = s.includes(",");
    const dot = s.indexOf(".");
    const decimals = dot === -1 ? 0 : s.length - dot - 1;
    const n = Number(s.replace(/,/g, ""));
    if (!isFinite(n)) return null;
    return { n: neg ? -n : n, abs: n, dollar, commas, decimals, intPart: (dot === -1 ? s : s.slice(0, dot)).replace(/,/g, ""), fracPart: dot === -1 ? "" : s.slice(dot + 1), leadingZero: /^0\d/.test(s.replace(/,/g, "")) };
  }
  function tokenStyles(type, tok) {
    if (type === "date") {
      const p = parseDateToken(tok);
      if (!p) return null;
      if (p.iso) return ["YYYY-MM-DD"];
      const big = p.mo >= 10 && p.d >= 10;
      const padded = (p.padM && p.mo < 10) || (p.padD && p.d < 10);
      const pads = big ? ["M/D", "MM/DD"] : (padded ? ["MM/DD"] : ["M/D"]);
      return pads.map((x) => x + (p.yLen === 2 ? "/YY" : "/YYYY"));
    }
    const p = parseMoneyToken(tok);
    if (!p) return null;
    if (type === "currency") {
      return FORMATS.currency.map(([f]) => f).filter((f) => {
        const hasDollar = f.startsWith("$");
        const hasCommas = f.includes(",");
        const decs = f.endsWith(".00") ? 2 : 0;
        if (hasDollar !== p.dollar) return false;
        if (p.abs >= 1000 && hasCommas !== p.commas) return false;
        return decs === 2 ? p.decimals > 0 : p.decimals === 0;
      });
    }
    if (type === "number") {
      if (p.dollar) return null;
      return p.abs >= 1000 ? [p.commas ? "#,##0" : "0"] : ["#,##0", "0"];
    }
    return null;
  }
  function learnFormat(type, tokens) {
    if (!FORMATS[type]) return null;
    const real = tokens.filter((t) => !isZeroish(t));
    if (real.length < FORMAT_MIN_SAMPLES) return null;
    const counts = new Map();
    for (const t of real) {
      const st = tokenStyles(type, t);
      if (!st) continue;
      for (const s of st) counts.set(s, (counts.get(s) || 0) + 1);
    }
    let best = null, bestN = 0;
    for (const [f] of FORMATS[type]) {
      const n = counts.get(f) || 0;
      if (n > bestN) { best = f; bestN = n; }
    }
    if (!best || bestN < FORMAT_MIN_SAMPLES || bestN / real.length < FORMAT_MIN_SHARE) return null;
    return best;
  }
  function groupThousands(intStr) {
    return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function formatValue(type, style, tok) {
    if (type === "date") {
      const p = parseDateToken(tok);
      if (!p) return null;
      if (!style) return String(tok).trim();
      const pad = (n) => (n < 10 ? "0" + n : String(n));
      if (style === "YYYY-MM-DD") return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
      const padded = style.startsWith("MM");
      const yr = style.endsWith("/YY") ? pad(p.y % 100) : String(p.y);
      return `${padded ? pad(p.mo) : p.mo}/${padded ? pad(p.d) : p.d}/${yr}`;
    }
    const p = parseMoneyToken(tok);
    if (!p) return null;
    if (type === "number" && p.dollar) return null;
    if (!style) return String(tok).trim();
    if (type === "number") {
      if (p.leadingZero) return String(tok).trim();
      const intStr = style === "#,##0" ? groupThousands(String(Number(p.intPart))) : String(Number(p.intPart));
      return (p.n < 0 ? "-" : "") + intStr + (p.fracPart ? "." + p.fracPart : "");
    }
    const decs = style.endsWith(".00") ? 2 : 0;
    const fixed = p.abs.toFixed(decs);
    const [ip, fp] = fixed.split(".");
    const body = (style.includes(",") ? groupThousands(ip) : ip) + (fp ? "." + fp : "");
    return (p.n < 0 ? "-" : "") + (style.startsWith("$") ? "$" : "") + body;
  }
  function sortNumber(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s) return null;
    const d = parseDateToken(s);
    if (d) return Date.UTC(d.y, d.mo - 1, d.d);
    const m = parseMoneyToken(s);
    return m ? m.n : null;
  }
  //##> TYPE DETECTION: Types are inferred from the values, never from the JSONL. Re-run on every
  //##> derive, so a Boolean column that later receives a "3" drops to Number on its own. Prose is
  //##> decided by the first 10 values (3+ spaces, majority). Categorical waits for 100+ values.
  //##> A user-selected type always wins over detection.
  function detectType(values) {
    if (!values.length) return "text";
    const sample = values.slice(0, 10);
    const proseHits = sample.filter((v) => (v.match(/ /g) || []).length >= 3).length;
    if (proseHits * 2 > sample.length) return "prose";
    if (values.every((v) => v === "0" || v === "1")) return "boolean";
    const toks = [];
    for (const v of values) for (const t of splitTokens(v, INCOMING_DELIM)) toks.push(t);
    const real = toks.filter((t) => !isZeroish(t));
    if (real.length) {
      const money = real.map(parseMoneyToken);
      if (money.every(Boolean) && money.filter((m) => m.dollar).length * 2 >= real.length) return "currency";
      if (real.every((t) => parseDateToken(t))) return "date";
      if (real.every((t) => /^[A-Za-z]{0,2}\d{7,}[A-Za-z]?$/.test(t) || /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(t))) return "identifier";
      if (money.every((m) => m && !m.dollar)) return money.some((m) => m.leadingZero) ? "identifier" : "number";
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
  //##> XLSX IMPORT: .xlsx files are zip folders of XML. They're opened in the browser with no outside library,
  //##> using the browser's built-in unzip (DecompressionStream). Only cell text and numbers are read, never
  //##> formatting, so dates come in as Excel date numbers and are converted on import.
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") throw new Error("this browser can't open .xlsx files. Save the sheet as CSV and import that instead");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function openZip(buf) {
    const u8 = new Uint8Array(buf);
    const dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("the workbook couldn't be opened");
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    const files = new Map();
    for (let n = 0; n < count && p + 46 <= u8.length; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      files.set(dec.decode(u8.subarray(p + 46, p + 46 + nameLen)), { method, csize, local });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return {
      async text(name) {
        const f = files.get(name);
        if (!f) return null;
        const start = f.local + 30 + dv.getUint16(f.local + 26, true) + dv.getUint16(f.local + 28, true);
        const raw = u8.subarray(start, start + f.csize);
        if (f.method !== 0 && f.method !== 8) throw new Error("the workbook uses a compression type that can't be read");
        return dec.decode(f.method === 0 ? raw : await inflateRaw(raw));
      }
    };
  }
  function xlsxColIndex(ref) {
    const m = /^([A-Z]+)/.exec(String(ref || ""));
    if (!m) return -1;
    let n = 0;
    for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }
  async function parseXlsx(buf) {
    const zip = openZip(buf);
    const xml = (t) => new DOMParser().parseFromString(t || "<x/>", "application/xml");
    const textOf = (node) => {
      let s = "";
      for (const t of node.getElementsByTagNameNS("*", "t")) if (!t.parentNode || t.parentNode.localName !== "rPh") s += t.textContent;
      return s;
    };
    const shared = [];
    const sst = await zip.text("xl/sharedStrings.xml");
    if (sst) for (const si of xml(sst).getElementsByTagNameNS("*", "si")) shared.push(textOf(si));
    const rels = new Map();
    for (const r of xml(await zip.text("xl/_rels/workbook.xml.rels")).getElementsByTagNameNS("*", "Relationship")) rels.set(r.getAttribute("Id"), r.getAttribute("Target"));
    const sheets = [];
    const wb = xml(await zip.text("xl/workbook.xml"));
    for (const s of wb.getElementsByTagNameNS("*", "sheet")) {
      const rid = s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || s.getAttribute("r:id");
      let target = String(rels.get(rid) || "");
      if (!target) continue;
      target = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
      const txt = await zip.text(target);
      if (!txt) continue;
      const rows = [];
      for (const r of xml(txt).getElementsByTagNameNS("*", "row")) {
        const ri = Number(r.getAttribute("r") || 0);
        if (ri) while (rows.length < ri - 1) rows.push([]);
        const cells = [];
        for (const c of r.getElementsByTagNameNS("*", "c")) {
          let ci = xlsxColIndex(c.getAttribute("r"));
          if (ci < 0) ci = cells.length;
          while (cells.length < ci) cells.push("");
          const t = c.getAttribute("t");
          const v = c.getElementsByTagNameNS("*", "v")[0];
          let val = "";
          if (t === "s") val = v ? (shared[Number(v.textContent)] || "") : "";
          else if (t === "inlineStr") val = textOf(c);
          else if (t === "b") val = v ? (v.textContent === "1" ? "TRUE" : "FALSE") : "";
          else val = v ? v.textContent : "";
          cells[ci] = val;
        }
        rows.push(cells);
      }
      sheets.push({ name: s.getAttribute("name") || "Sheet " + (sheets.length + 1), rows });
    }
    return sheets;
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
  //##> NEXIDIA TIMES: Duration (mediaFileDuration) and Hold Time (UDFInt4) come from Nexidia in milliseconds,
  //##> and spreadsheet imports are converted to milliseconds too, so export always divides by 1000.
  function msToSeconds(raw) {
    const s = String(raw == null ? "" : raw).trim();
    const n = Number(s);
    if (!s || !isFinite(n) || n === 0) return null;
    return n / 1000;
  }
  //##> XLSX EXPORT: Builds a real .xlsx file in the browser with no outside library. The workbook has one
  //##> sheet with inline strings, a bold frozen header row, every cell aligned left, and number formats from
  //##> XLSX_FORMATS. Column widths are sized to the longest value shown in each column (like Excel's
  //##> autofit), between XLSX_MIN_COL_CHARS and XLSX_MAX_COL_CHARS. The zip is written with no compression.
  const XLSX_FORMATS = {
    dt: "m/d/yyyy h:mm",
    dts: "m/d/yyyy h:mm:ss",
    d: "m/d/yyyy",
    dpad: "mm/dd/yyyy",
    d2: "m/d/yy",
    dpad2: "mm/dd/yy",
    diso: "yyyy-mm-dd",
    dur: "[h]:mm:ss",
    int: "0",
    dec2: "0.00",
    dec2c: "#,##0.00",
    thou: "#,##0",
    cur: "$#,##0.00",
    cur0: "$#,##0",
    gen: "General"
  };
  const XLSX_MAX_TEXT = 32767;
  const XLSX_MIN_COL_CHARS = 6;
  const XLSX_MAX_COL_CHARS = 255;
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zipStore(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [];
    const central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, dosTime, true);
      local.setUint16(12, dosDate, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, data);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, dosTime, true);
      cen.setUint16(14, dosDate, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, data.length, true);
      cen.setUint32(24, data.length, true);
      cen.setUint16(28, name.length, true);
      cen.setUint16(30, 0, true);
      cen.setUint16(32, 0, true);
      cen.setUint16(34, 0, true);
      cen.setUint16(36, 0, true);
      cen.setUint32(38, 0, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cenSize = central.reduce((n, p) => n + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cenSize, true);
    end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  function xmlEsc(s) {
    return String(s == null ? "" : s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function colLetter(i) {
    let s = "";
    i += 1;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }
  function buildXlsx(sheetName, headers, rowsData, widthsChars, opts) {
    const noHeader = !!(opts && opts.noHeader);
    const fmtKeys = Object.keys(XLSX_FORMATS).filter((k) => k !== "gen");
    const styleIndex = { gen: 0 };
    fmtKeys.forEach((k, i) => { styleIndex[k] = i + 2; });
    const left = '<alignment horizontal="left"/>';
    const numFmts = fmtKeys.map((k, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xmlEsc(XLSX_FORMATS[k])}"/>`).join("");
    const xfs = [`<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">${left}</xf>`, `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">${left}</xf>`]
      .concat(fmtKeys.map((k, i) => `<xf numFmtId="${164 + i}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1">${left}</xf>`)).join("");
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<numFmts count="${fmtKeys.length}">${numFmts}</numFmts>` +
      '<fonts count="2"><font><sz val="10"/><name val="Aptos Narrow"/><family val="2"/></font><font><b/><sz val="10"/><name val="Aptos Narrow"/><family val="2"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${fmtKeys.length + 2}">${xfs}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>";
    const lastCol = colLetter(Math.max(0, headers.length - 1));
    const cols = headers.length ? "<cols>" + headers.map((_, i) => {
      const w = Math.max(XLSX_MIN_COL_CHARS, Math.min(XLSX_MAX_COL_CHARS, (widthsChars && widthsChars[i]) || XLSX_MIN_COL_CHARS));
      return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    }).join("") + "</cols>" : "";
    const out = [];
    const strCell = (ref, v, s) => {
      const t = String(v == null ? "" : v).slice(0, XLSX_MAX_TEXT);
      return `<c r="${ref}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${xmlEsc(t)}</t></is></c>`;
    };
    const startRow = noHeader ? 1 : 2;
    if (!noHeader) out.push('<row r="1">' + headers.map((h, i) => strCell(colLetter(i) + "1", h, 1)).join("") + "</row>");
    rowsData.forEach((cells, ri) => {
      const r = ri + startRow;
      const xml = [];
      cells.forEach((cell, ci) => {
        if (!cell) return;
        const ref = colLetter(ci) + r;
        if (cell.t === "n" && isFinite(cell.v)) xml.push(`<c r="${ref}" s="${styleIndex[cell.cls] || 0}"><v>${cell.v}</v></c>`);
        else if (cell.v !== "" && cell.v != null) xml.push(strCell(ref, cell.v, 0));
      });
      out.push(`<row r="${r}">${xml.join("")}</row>`);
    });
    const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<dimension ref="A1:${lastCol}${Math.max(1, rowsData.length + startRow - 1)}"/>` +
      (noHeader ? '<sheetViews><sheetView workbookViewId="0"/></sheetViews>' : '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>') +
      '<sheetFormatPr defaultRowHeight="15"/>' + cols +
      `<sheetData>${out.join("")}</sheetData>` +
      "</worksheet>";
    const safeName = xmlEsc(String(sheetName || "Sheet1").replace(/[\\\/\?\*\[\]:]/g, " ").slice(0, 31) || "Sheet1");
    const files = [
      { name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
      { name: "xl/_rels/workbook.xml.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: "xl/styles.xml", data: styles },
      { name: "xl/worksheets/sheet1.xml", data: sheet }
    ];
    return zipStore(files);
  }
  //##> LONG VALUES: Excel holds at most XLSX_MAX_TEXT characters in one cell. Any text value longer than that
  //##> continues into extra columns right next to it, labeled (Part 2), (Part 3), and so on, so nothing is cut
  //##> off. The same split is used for CSV, since Excel applies the same limit when it opens one.
  function expandOverflow(headers, data) {
    const parts = headers.map((_, ci) => {
      let m = 1;
      for (const r of data) {
        const c = r[ci];
        if (c && c.t === "s") { const n = Math.ceil(String(c.v).length / XLSX_MAX_TEXT); if (n > m) m = n; }
      }
      return m;
    });
    const map = [];
    const outHeaders = [];
    headers.forEach((h, ci) => { for (let p = 0; p < parts[ci]; p++) { outHeaders.push(p ? `${h} (Part ${p + 1})` : h); map.push(ci); } });
    if (parts.every((p) => p === 1)) return { headers, data, map, long: 0 };
    let long = 0;
    const outData = data.map((r) => {
      const out = [];
      headers.forEach((_, ci) => {
        const c = r[ci];
        if (parts[ci] === 1) { out.push(c); return; }
        if (!c || c.t !== "s") { out.push(c); for (let p = 1; p < parts[ci]; p++) out.push(null); return; }
        const str = String(c.v);
        if (str.length > XLSX_MAX_TEXT) long++;
        for (let p = 0; p < parts[ci]; p++) {
          const seg = str.slice(p * XLSX_MAX_TEXT, (p + 1) * XLSX_MAX_TEXT);
          out.push(seg ? { t: "s", v: seg } : null);
        }
      });
      return out;
    });
    return { headers: outHeaders, data: outData, map, long };
  }
  function csvCell(v) {
    const s = String(v == null ? "" : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function tsvCell(v) {
    return String(v == null ? "" : v).replace(/[\t\r\n]+/g, " ");
  }
  function buildDelimited(format, headers, rowsText) {
    const lines = [];
    const join = format === "csv" ? (cells) => cells.map(csvCell).join(",") : (cells) => cells.map(tsvCell).join("\t");
    if (headers) lines.push(join(headers));
    for (const r of rowsText) lines.push(join(r));
    return (format === "csv" ? "\uFEFF" : "") + lines.join("\r\n");
  }
  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function excelLocalTime(ms) {
    const d = new Date(ms);
    return (ms - d.getTimezoneOffset() * 60000) / 86400000 + 25569;
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
      overlay.dataset.nxDialog = "1";
      const box = el("div", { style: `background:#fff;width:${opts.width || 440}px;max-width:94vw;max-height:84vh;overflow:auto;border-radius:12px;padding:22px;box-shadow:0 8px 24px rgba(0,0,0,.3);` });
      const finish = (value) => { overlay.remove(); resolve({ value, checked: cb ? cb.checked : false, input: input ? input.value : null }); };
      if (opts.title) box.appendChild(el("div", { style: `font-size:15px;font-weight:700;color:${opts.danger ? "#b91c1c" : "#111827"};margin-bottom:10px;` }, opts.title));
      if (opts.message) {
        for (const para of String(opts.message).split("\n\n")) box.appendChild(el("div", { style: "font-size:13px;color:#374151;line-height:1.45;margin-bottom:10px;white-space:pre-wrap;" }, para));
      }
      if (opts.list && opts.list.length) {
        const wrap = el("div", { style: "border:1px solid #e5e7eb;border-radius:8px;max-height:260px;overflow-y:auto;margin-bottom:12px;" });
        if (opts.collapseOver && opts.list.length > opts.collapseOver) {
          const count = opts.list.length;
          const toggle = el("button", { type: "button", style: "background:none;border:0;padding:0 0 8px;font-size:12px;font-weight:600;color:#1d4ed8;cursor:pointer;" + FONT }, `\u25B8 Show all ${count.toLocaleString()}`);
          wrap.style.display = "none";
          toggle.onclick = () => {
            const open = wrap.style.display === "none";
            wrap.style.display = open ? "" : "none";
            toggle.textContent = `${open ? "\u25BE Hide" : "\u25B8 Show all"} ${count.toLocaleString()}`;
          };
          box.appendChild(toggle);
        }
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
        if (b.title) btn.title = b.title;
        btn.onclick = () => finish(b.value);
        btnRow.appendChild(btn);
      }
      box.appendChild(btnRow);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
  }
  //##> FLASH MESSAGES: Quick notes like "5 rows added" drop in at the top center of the screen, stack if
  //##> several arrive together, and fade out on their own after FLASH_MS. The color still tells the kind of note.
  const FLASH_MS = 3200;
  function toast(text, color) {
    let host = document.querySelector("[data-nx-flash]");
    if (!host) {
      host = el("div", { style: "position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:1000040;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;max-width:90vw;" + FONT });
      host.dataset.nxFlash = "1";
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    }
    const n = el("div", { style: `background:${color || "#16a34a"};color:#fff;padding:12px 28px;border-radius:10px;font-size:15px;font-weight:700;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.3);opacity:0;transform:translateY(-12px);transition:opacity .35s,transform .35s;` }, text);
    host.appendChild(n);
    requestAnimationFrame(() => { n.style.opacity = "1"; n.style.transform = "translateY(0)"; });
    setTimeout(() => {
      n.style.opacity = "0";
      n.style.transform = "translateY(-12px)";
      setTimeout(() => { n.remove(); if (!host.children.length) host.remove(); }, 400);
    }, FLASH_MS);
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
      multiTop: false,
      hideWorkedTs: true,
      showFlags: true,
      checkOnExport: true,
      reviewAutoNext: true
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
      edits: {},
      editPolicy: { all: null, fields: {} },
      playerSettings: {},
      tsFields: {},
      tsGroupsOff: [],
      tagState: {},
      tsAutoHidden: {},
      formatAllow: {},
      checks: {},
      checkOff: {},
      issueIgnore: { items: {}, rules: {} },
      pending: [{ text: "", error: "" }],
      notices: [],
      suppress: {},
      grid: { order: [], visible: [], widths: {}, sorts: [], filters: {}, globalFilter: "", clickMode: "select" },
      preset: null,
      lockedKeys: null,
      log: [],
      nextLogId: 1
    };
  }
  function openUnpack() {
    if (document.querySelector("[data-nexidia-unpack]")) {
      if (api.getShared("unpackPreload")) {
        api.setShared("unpackPreload", null);
        alert("Unpack is already open. Close it, then run the report again.");
      }
      return;
    }
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
    let editing = null;
    let newDataPending = false;
    let conflictBusy = false;
    let conflictAgain = false;
    let tsActive = false;
    let tsTempShown = null;
    let tsCache = null;
    let freshKeys = new Set();
    let exportChoice = { grid: { on: true, format: "xlsx" }, log: { on: false, format: "xlsx" }, raw: { on: false, format: "xlsx" } };
    function getFV(rowObj, key) {
      if (xls && xls.getFieldValue) return xls.getFieldValue(rowObj, key);
      if (!rowObj) return "";
      if (rowObj[key] !== undefined && rowObj[key] !== null) return String(rowObj[key]);
      const lower = String(key).toLowerCase();
      for (const k of Object.keys(rowObj)) if (k.toLowerCase() === lower && rowObj[k] !== null) return String(rowObj[k]);
      return "";
    }
    //##> PLAYER SETTINGS HOOK: Unpack hands the Media Player its own defaults (PLAYER_DEFAULTS) and keeps
    //##> any player settings changed from here in S.playerSettings, so they save and load with the session.
    //##> Timestamp field choices (Navigation / Edit Fields) live in S.tsFields and are passed through the
    //##> player's settings as tsUse so the Unpack pane can change them.
    function playerTool() {
      return api.listTools().find((t) => t.id === "mediaPlayer") || null;
    }
    function playerConfig(startPane) {
      return {
        scope: "unpack",
        label: "Unpack",
        startPane: startPane || null,
        defaults: PLAYER_DEFAULTS,
        getValues: () => Object.assign({}, S.playerSettings || {}, { tsUse: Object.assign({}, S.tsFields) }),
        onSave: (values) => {
          const vals = Object.assign({}, values || {});
          const before = JSON.stringify(S.tsFields);
          S.tsFields = Object.assign({}, vals.tsUse || {});
          delete vals.tsUse;
          S.playerSettings = vals;
          scheduleSave();
          if (playerCtrl && playerCtrl.refreshSettings) playerCtrl.refreshSettings();
          if (tsActive && before !== JSON.stringify(S.tsFields)) startTimestamps(true);
        },
        panes: [{ id: "unpack", label: "Unpack", render: renderUnpackPane }]
      };
    }
    function unpackPref(key) {
      const v = S.playerSettings ? S.playerSettings[key] : undefined;
      return v === undefined ? PLAYER_DEFAULTS[key] : v;
    }
    function playerPref(key) {
      const t = playerTool();
      if (t && t.resolveSettings) return t.resolveSettings(playerConfig())[key];
      return unpackPref(key);
    }
    function playerFields() {
      const t = playerTool();
      return t && t.settingsFields ? t.settingsFields(playerConfig()) : [];
    }
    function openPlayerSettings(startPane) {
      const t = playerTool();
      if (!t || !t.openSettings) { toast("Media Player isn't loaded.", "#6b7280"); return; }
      t.openSettings(playerConfig(startPane));
    }
    function renderUnpackPane(body, draft) {
      const section = (t) => el("div", { style: "font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:.05em;margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid #e5e7eb;" }, t);
      const info = (tip) => { const s = el("span", { style: "display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:#e0e7ff;color:#3730a3;font-size:10px;font-weight:700;cursor:help;margin-left:6px;flex-shrink:0;" }, "i"); s.title = tip; return s; };
      const label = (t, tip) => { const l = el("div", { style: "font-size:13px;color:#111827;display:flex;align-items:center;font-weight:600;" }, t); if (tip) l.appendChild(info(tip)); return l; };
      const line = (l, ctrl) => el("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0;" }, l, ctrl);
      const select = (opts, val, onChange) => {
        const s = el("select", { style: "padding:5px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;width:230px;" });
        for (const [v, t] of opts) s.appendChild(el("option", { value: v }, t));
        s.value = val;
        s.onchange = () => onChange(s.value);
        return s;
      };
      const check = (val, onChange) => { const c = el("input", { type: "checkbox", checked: !!val }); c.onchange = () => onChange(c.checked); return c; };
      if (!draft.tsUse || typeof draft.tsUse !== "object") draft.tsUse = {};
      body.appendChild(section("Timestamp Fields"));
      const fields = detectTsFields();
      if (!fields.length) body.appendChild(el("div", { style: "font-size:12px;color:#6b7280;" }, "No timestamp fields are on the grid yet."));
      for (const f of fields) {
        const cur = draft.tsUse[f] || "";
        const opts = (cur ? [] : [["", "Not chosen yet"]]).concat([["nav", "Navigation"], ["edit", "Edit Fields"]]);
        body.appendChild(line(label(headerOf(f), "Navigation: just for listening, like jumping to tagged points of interest. Edit Fields: for correcting or clarifying data on your sheet."), select(opts, cur, (v) => { if (v) draft.tsUse[f] = v; else delete draft.tsUse[f]; })));
      }
      body.appendChild(section("Edit Fields Workflow"));
      body.appendChild(line(label("After a tag is marked complete", "Jump: go straight to the next tag. Keep Playing: let the call play until it reaches the next tag."), select([["jump", "Jump to the next tag"], ["continue", "Keep playing"]], draft.tagAfterComplete || "jump", (v) => { draft.tagAfterComplete = v; })));
      body.appendChild(line(label("When a field opens for editing", "Start on a new line: the cursor waits on an empty line under the existing values, ready for a new one. Start on the last value: the cursor goes to the end of the last value already in the field."), select([["newline", "Start on a new line"], ["last", "Start on the last value"]], draft.tagEditCaret === "last" ? "last" : "newline", (v) => { draft.tagEditCaret = v; })));
      const doneSel = select([["ask", "Ask me"], ["exit", "Exit editing mode"], ["stay", "Stay in timestamp mode"]], allDonePref(), (v) => { try { localStorage.setItem(LS_ALL_DONE, v); } catch (_) {} });
      body.appendChild(line(label("When every timestamp is complete", "What happens once the last timestamp is marked complete. This one is saved in this browser, not just this session."), doneSel));
      body.appendChild(line(label("Pause automatically", "Pause playback near the end of the call if you're still editing, so it doesn't move on to the next call."), check(draft.tagAutoPause !== false, (v) => { draft.tagAutoPause = v; })));
      body.appendChild(line(label("Also pause for incomplete tags", "Also pause near the end of the call whenever the current tag isn't marked complete, even if you aren't editing."), check(!!draft.tagPauseIncomplete, (v) => { draft.tagPauseIncomplete = v; })));
      body.appendChild(line(label("Unhide hidden columns while their tag is active", "If a tag's column is hidden, show it while that tag is active, then hide it again."), check(!!draft.tagUnhide, (v) => { draft.tagUnhide = v; })));
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
      logEvent("unmerge", `Unmerged ${baseHeader(m.source)} from ${baseHeader(rootOf(m.target))}`);
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
      for (const imp of S.imports) {
        const id = imp.target.startsWith("j:") ? imp.target.slice(2) : null;
        if (id && vals.has(id) && !isEmptyValue(imp.value)) vals.get(id).push(String(imp.value).trim());
      }
      for (const c of S.columns) {
        const v = vals.get(c.id) || [];
        c.detected = detectType(v);
        const t = effType(c);
        if (FORMATS[t]) {
          const toks = [];
          for (const x of v) for (const y of splitTokens(x, INCOMING_DELIM)) toks.push(y);
          c.learned = learnFormat(t, toks);
        } else c.learned = null;
      }
    }
    function colFormat(c) {
      if (!c) return null;
      const t = effType(c);
      if (!FORMATS[t] || c.format === "none") return null;
      if (c.format && FORMATS[t].some(([f]) => f === c.format)) return c.format;
      return c.learned || null;
    }
    function formatTokens(c, toks) {
      const t = effType(c);
      const style = colFormat(c);
      if (!style || !toks.length) return toks;
      return dedupeTokens(toks.map((x) => {
        if (isZeroish(x)) return x;
        const f = formatValue(t, style, x);
        return f === null ? x : f;
      }));
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
          if (imp.mode === "replace") row.rep[f] = imp.value;
          else if (imp.mode === "stack") (row.add[f] = row.add[f] || []).push(imp.value);
          else if (!row.over[f]) row.over[f] = imp.value;
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
      const row = { id: g.id, key: g.key, missing: g.missing, count: g.entries.filter((e) => !e.seed).length, tok: {}, hl: {}, over: {}, rep: {}, add: {}, cache: {}, bcache: {}, meta: null, status: null };
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
            const r = Object.assign({}, base, { id: base.id + "#" + i, meta: m, status: "multi", cache: {}, bcache: {} });
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
      tsCache = null;
      issueCache = null;
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
      if (row.rep && row.rep[k]) v = row.rep[k];
      const out = v ? [v] : [];
      if (row.add && row.add[k]) for (const a of row.add[k]) if (!out.some((x) => tokenKey(x) === tokenKey(a))) out.push(a);
      return out.length > 1 ? out.filter((x) => !/^0+$/.test(x)) : out;
    }
    //##> EDITS: Stored in S.edits by row id and field, layered over the derived value at render time.
    //##> Revert just deletes the edit. Conflicts with new data are checked only after a paste,
    //##> spreadsheet import, or metadata lookup.
    function getEdit(row, f) {
      const r = row && S.edits[row.id];
      return r && r[f] ? r[f] : null;
    }
    function baseParts(row, f, depth) {
      depth = depth || 0;
      if (row.bcache[f]) return row.bcache[f];
      let own;
      if (f === "__conf__") own = [String(row.count)];
      else if (f.startsWith("j:")) own = formatTokens(colById(f.slice(2)), row.tok[f.slice(2)] || []);
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
      row.bcache[f] = res;
      return res;
    }
    function cellParts(row, f, depth) {
      if (row.cache[f]) return row.cache[f];
      const base = baseParts(row, f, depth);
      const ed = getEdit(row, f);
      const res = ed ? { tokens: isEmptyValue(ed.value) ? (f.startsWith("m:") && row.meta ? ["0"] : []) : [String(ed.value)], ownFirst: undefined, delim: base.delim, edited: true } : base;
      row.cache[f] = res;
      return res;
    }
    function baseRaw(row, f) {
      const p = baseParts(row, f);
      return p.tokens.join(p.delim);
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
    function clearRowCaches() {
      for (const r of rows) { r.cache = {}; r.bcache = {}; }
      tsCache = null;
      invalidateIssues();
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
    //##> SESSION LOG: Every paste, lookup, import, edit, and export is added to S.log with a time, so it saves
    //##> and loads with the session. Paste entries keep the raw objects that were read in their items list, and
    //##> Raw Data exports come straight from those entries.
    function logEvent(kind, text, extra) {
      if (!Array.isArray(S.log)) S.log = [];
      const entry = Object.assign({ id: S.nextLogId++, t: Date.now(), kind, text }, extra || {});
      if (Array.isArray(entry.keys)) entry.keys = dedupeTokens(entry.keys.map((k) => String(k == null ? "" : k).trim()).filter((k) => k && !/^\(no /.test(k)));
      S.log.push(entry);
      if (logPanel.style.display !== "none") renderLog();
      scheduleSave();
      return entry;
    }
    function keyForRowId(rowId) {
      const r = rows.find((x) => x.id === rowId);
      return r ? r.key : "";
    }
    function logKeys(x) {
      if (Array.isArray(x.keys)) return x.keys;
      if (["leftOff", "addedMissing", "addKeys", "remove"].includes(x.kind) && Array.isArray(x.items)) return x.items.filter((k) => !/^\(no /.test(k));
      return [];
    }
    function plural(n, one, many) {
      return `${Number(n).toLocaleString()} ${n === 1 ? one : (many || one + "s")}`;
    }
    function pkPlural() {
      const name = String(S.settings.primaryKey || "Trans_Id").trim();
      return /s$/i.test(name) ? name : name + "s";
    }
    //##> NOT FOUND NOTICE: The red note under the instructions only lists calls that weren't found in the
    //##> lookup that just ran. Older misses keep their red ! on the row number but aren't announced again.
    function updateMissingNotice(missing) {
      if (!missing || !missing.length) { clearNotice("missing"); return; }
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
      if (S.preset && S.preset.suppressMergePrompts) return;
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
      const reqFields = [...new Set(S.metaFields.concat(["sourceMediaId", TRANS_FIELD, field], playerFields()))];
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
      const priorStatus = {};
      for (const lk of keys.keys()) priorStatus[lk] = S.metaStatus[lk];
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
      const foundCount = keys.size - notFound.length;
      logEvent("lookup", `Metadata lookup for ${plural(keys.size, "call")}: ${foundCount.toLocaleString()} found, ${notFound.length.toLocaleString()} not found${multi.length ? `, ${multi.length.toLocaleString()} with more than one match` : ""}`, Object.assign({ keys: [...keys.values()] }, notFound.length ? { items: notFound.slice() } : {}));
      const newMissing = notFound.filter((k) => freshKeys.has(k.toLowerCase()));
      const lostMissing = notFound.filter((k) => !freshKeys.has(k.toLowerCase()) && priorStatus[k.toLowerCase()] && priorStatus[k.toLowerCase()] !== "missing");
      for (const lk of keys.keys()) freshKeys.delete(lk);
      let announce = lostMissing.slice();
      if (newMissing.length) {
        let choice = S.suppress.notFoundChoice || null;
        if (!choice) {
          const one = newMissing.length === 1;
          const r = await dialog({
            title: `${plural(newMissing.length, "call")} not found`,
            danger: true,
            message: `No Nexidia call was found for ${one ? "this" : "these"} ${pkName} value${one ? "" : "s"}. Check the ${pkName}, and check that the call${one ? " is" : "s are"} from within the last 90 days.\n\nLeave ${one ? "it" : "them"} off the grid, or add ${one ? "it" : "them"} anyway with the metadata columns left blank?`,
            list: newMissing.slice(0, 300),
            collapseOver: 12,
            checkbox: "Remember my choice for this session",
            buttons: [{ label: "Leave Off", value: "leave", primary: true, title: "Don't add rows for calls that weren't found." }, { label: "Add Anyway", value: "add", title: "Add the rows with their CoPilot values and blank metadata." }]
          });
          if (closed) return;
          choice = r.value || "leave";
          if (r.checked) S.suppress.notFoundChoice = choice;
        }
        if (choice === "leave") {
          dropKeys(newMissing, pk);
          logEvent("leftOff", `Left ${plural(newMissing.length, "call")} off the grid because ${newMissing.length === 1 ? "it wasn't" : "they weren't"} found`, { items: newMissing.slice(), keys: newMissing.slice() });
          toast(`${plural(newMissing.length, "call")} not found and left off`, "#dc2626");
        } else {
          announce = announce.concat(newMissing);
          logEvent("addedMissing", `Added ${plural(newMissing.length, "call")} that weren't found, with blank metadata`, { items: newMissing.slice(), keys: newMissing.slice() });
        }
      }
      autoMergeKeys();
      updateMissingNotice(announce);
      newDataPending = true;
      refreshAll();
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
    function dropKeys(keys, pk) {
      const set = new Set(keys.map((k) => String(k).toLowerCase()));
      S.entries = S.entries.filter((e) => { const k = keyOf(e, pk); return !k || !set.has(k.toLowerCase()); });
      for (const lk of set) { delete S.meta[lk]; delete S.metaStatus[lk]; }
    }
    function currentKeys(pk) {
      const set = new Set();
      for (const e of S.entries) { const k = keyOf(e, pk); if (k) set.add(k.toLowerCase()); }
      return set;
    }
    //##> REMOVED ROWS: A key counts as removed when at least one of its rows was removed and none of its rows
    //##> are still showing. Reinstating takes every removed row for that key out of S.removed.
    function removedByKey(pk) {
      const out = new Map();
      const entryById = new Map(S.entries.map((e) => [e.id, e]));
      for (const id of S.removed) {
        let lk = "";
        if (id.startsWith("k:")) lk = id.slice(2).replace(/#\d+$/, "");
        else if (id.startsWith("e:")) { const e = entryById.get(Number(id.slice(2))); lk = e ? keyOf(e, pk).toLowerCase() : ""; }
        if (!lk) continue;
        if (!out.has(lk)) out.set(lk, []);
        out.get(lk).push(id);
      }
      for (const r of rows) if (r.key) out.delete(r.key.toLowerCase());
      return out;
    }
    async function askReinstate(keys, source) {
      if (!keys.length) return "keep";
      let choice = S.suppress.removedChoice || null;
      if (!choice) {
        const one = keys.length === 1;
        const r = await dialog({
          title: `${plural(keys.length, "row")} you removed`,
          message: `${source} include${source.endsWith("s") ? "" : "s"} ${one ? "a " + S.settings.primaryKey + " that was" : keys.length.toLocaleString() + " " + pkPlural() + " that were"} removed from the grid earlier. Put ${one ? "it" : "them"} back on the grid, or keep ${one ? "it" : "them"} removed?`,
          list: keys.slice(0, 500),
          collapseOver: 10,
          checkbox: "Remember my choice for this session",
          buttons: [{ label: "Keep Removed", value: "keep", primary: true }, { label: "Reinstate", value: "reinstate" }]
        });
        choice = r.value || "keep";
        if (r.checked) S.suppress.removedChoice = choice;
      }
      return choice;
    }
    function reinstateKeys(keys, removedMap) {
      const ids = new Set();
      for (const k of keys) for (const id of (removedMap.get(String(k).toLowerCase()) || [])) ids.add(id);
      S.removed = S.removed.filter((id) => !ids.has(id));
    }
    //##> ADD KEYS: Pasted keys become placeholder rows (seed entries with only the primary key), then a
    //##> metadata lookup fills them in. CoPilot columns start blank. Keys already on the grid are skipped. Reports
    //##> can turn the button off with allowAddKeys: false. In a report session, added keys join its call list.
    async function addKeys(list) {
      if (S.preset && S.preset.allowAddKeys === false) return;
      const seen = new Set();
      const keys = [];
      for (const raw of list) {
        const k = String(raw || "").trim();
        if (!k || /^0+$/.test(k) || seen.has(k.toLowerCase())) continue;
        seen.add(k.toLowerCase());
        keys.push(k);
      }
      if (!keys.length) return;
      let pk = pkColumn();
      if (!pk) { const id = ensureColumn(S.settings.primaryKey || "Trans_Id", aliasMap()); pk = colById(id); derive(); }
      const present = currentKeys(pk);
      const removedMap = removedByKey(pk);
      const already = [], removedHits = [], fresh = [];
      for (const k of keys) {
        const lk = k.toLowerCase();
        if (removedMap.has(lk)) removedHits.push(k);
        else if (present.has(lk)) already.push(k);
        else fresh.push(k);
      }
      let reinstated = [];
      if (removedHits.length && (await askReinstate(removedHits, "These " + pkPlural())) === "reinstate") {
        reinstateKeys(removedHits, removedMap);
        reinstated = removedHits;
      }
      if (closed) return;
      for (const k of fresh) {
        S.entries.push({ id: S.nextEntryId++, pasteId: 0, seed: true, values: { [pk.id]: k } });
        freshKeys.add(k.toLowerCase());
        if (S.lockedKeys && !S.lockedKeys.includes(k.toLowerCase())) S.lockedKeys.push(k.toLowerCase());
      }
      const parts = [];
      if (fresh.length) parts.push(`${fresh.length.toLocaleString()} added`);
      if (reinstated.length) parts.push(`${reinstated.length.toLocaleString()} reinstated`);
      if (already.length) parts.push(`${already.length.toLocaleString()} already on the grid`);
      if (removedHits.length - reinstated.length) parts.push(`${(removedHits.length - reinstated.length).toLocaleString()} kept removed`);
      logEvent("addKeys", `Added ${pkPlural()}: ${parts.join(", ")}`, { items: keys.slice(), keys: keys.slice() });
      newDataPending = true;
      refreshAll();
      toast(`${pkPlural()}: ${parts.join(", ")}`, fresh.length || reinstated.length ? "#16a34a" : "#6b7280");
      if (fresh.length) fetchMetadata(true);
    }
    function openAddKeys() {
      const name = pkPlural();
      const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000015;display:flex;align-items:center;justify-content:center;" + FONT });
      const box = el("div", { style: "background:#fff;width:440px;max-width:94vw;border-radius:12px;padding:20px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
      const labelId = "nxAddKeys" + Date.now();
      box.appendChild(el("div", { id: labelId, style: "font-size:15px;font-weight:700;color:#111827;margin-bottom:6px;" }, "Add " + name));
      box.appendChild(el("div", { style: "font-size:12px;color:#4b5563;line-height:1.45;margin-bottom:10px;" }, `Paste one or more ${name}. Each one is added as a row and filled in with Nexidia metadata. Your CoPilot columns start blank, so you can edit them here or paste outputs for these calls later.`));
      const ta = el("textarea", { placeholder: `One ${S.settings.primaryKey} per line, or separated by commas or spaces`, style: "width:100%;height:150px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:8px;padding:8px 10px;font-size:12px;font-family:Consolas,monospace;resize:vertical;" });
      ta.setAttribute("aria-labelledby", labelId);
      const count = el("div", { style: "font-size:11px;color:#6b7280;margin:6px 0 12px;" }, "");
      count.setAttribute("aria-live", "polite");
      const parse = () => ta.value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
      ta.addEventListener("input", () => { const n = new Set(parse().map((x) => x.toLowerCase())).size; count.textContent = n ? `${n.toLocaleString()} ${n === 1 ? S.settings.primaryKey : name} found` : ""; });
      const row = el("div", { style: "display:flex;gap:8px;" });
      const addB = el("button", { type: "button", style: "flex:1;" + PRIMARY_BTN }, "Add to Grid");
      const cancelB = el("button", { type: "button", style: "flex:1;" + PLAIN_BTN }, "Cancel");
      addB.onclick = () => { const list = parse(); if (!list.length) { ta.focus(); return; } overlay.remove(); addKeys(list); };
      cancelB.onclick = () => overlay.remove();
      overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") overlay.remove(); });
      row.appendChild(addB);
      row.appendChild(cancelB);
      box.appendChild(ta);
      box.appendChild(count);
      box.appendChild(row);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      setTimeout(() => ta.focus(), 30);
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
          if (r.status === "ok") accepted.push(Object.assign({ line: ln }, r));
          else if (r.status === "message") accepted.push({ objects: [], message: r.message });
          else { failures.push({ block: b, line: i + 1, raw: ln, status: r.status, message: r.message }); failedLines.push(ln); }
        });
        blocks[b].failedText = failedLines.join("\n");
      }
      const objects = [];
      const rawObjects = [];
      for (const a of accepted) {
        a.objects.forEach((o, i) => { objects.push(o); rawObjects.push(a.sources && a.sources[i] ? a.sources[i] : ""); });
      }
      const rejected = [];
      let keep = objects;
      if (S.lockedKeys && S.lockedKeys.length) {
        const locked = new Set(S.lockedKeys);
        const pk = pkColumn();
        keep = [];
        for (const o of objects) {
          const k = objectKey(o, pk);
          if (k && locked.has(k.toLowerCase())) keep.push(o);
          else rejected.push(k || "(no " + S.settings.primaryKey + ")");
        }
      }
      const pkNow = pkColumn();
      const before = currentKeys(pkNow);
      const colsBefore = S.columns.length;
      let added = [];
      if (keep.length) added = ingest(keep);
      const pkAfter = pkColumn();
      let newRows = 0, combined = 0;
      const newSet = new Set();
      for (const e of added) {
        const k = keyOf(e, pkAfter).toLowerCase();
        if (!k || !S.settings.combine) { newRows++; if (k && !before.has(k)) freshKeys.add(k); continue; }
        if (before.has(k) || newSet.has(k)) combined++;
        else { newSet.add(k); newRows++; freshKeys.add(k); }
      }
      const newCols = S.columns.slice(colsBefore).map((c) => c.header);
      const emptyBatches = accepted.filter((a) => a.message).length;
      if (objects.length || failures.length || emptyBatches) {
        const bits = [];
        if (objects.length) bits.push(`${plural(newRows, "new row")}${combined ? `, ${combined.toLocaleString()} combined into existing rows` : ""}`);
        if (newCols.length) bits.push(`new column${newCols.length === 1 ? "" : "s"}: ${newCols.join(", ")}`);
        if (rejected.length) bits.push(`${rejected.length.toLocaleString()} not in this report`);
        if (failures.length) bits.push(`${plural(failures.length, "line")} couldn't be read`);
        if (emptyBatches) bits.push(`${plural(emptyBatches, "batch", "batches")} returned no rows`);
        logEvent("paste", `Paste #${S.pasteCount + (added.length ? 0 : 1)}: ${plural(objects.length, "object")}${bits.length ? " \u00B7 " + bits.join(" \u00B7 ") : ""}`, { items: rawObjects, count: objects.length, keys: objects.map((o) => objectKey(o, pkAfter)) });
        if (!added.length) S.pasteCount++;
      }
      if (emptyBatches) toast(`${emptyBatches} batch${emptyBatches === 1 ? "" : "es"} returned no rows (${accepted.find((a) => a.message).message})`, "#6366f1");
      if (added.length) {
        newDataPending = true;
        refreshAll();
        toast(combined && S.settings.combine ? `${plural(newRows, "row")} added, ${combined.toLocaleString()} combined into existing rows` : `${plural(newRows, "row")} added`);
        checkMissingKeys(added);
        if (S.settings.autoMeta) fetchMetadata(true);
        else runMergeDetection();
      }
      if (rejected.length) showRejected(rejected);
      if (failures.length) showFailures(failures, lineCount, keep.length > 0);
      return { failures, added: added.length };
    }
    function objectKey(pairs, pk) {
      if (!pk) return "";
      const names = new Set(pk.aliases.map((a) => String(a).toLowerCase()));
      for (const [k, v] of pairs) {
        if (names.has(String(k).toLowerCase())) return isEmptyValue(v) ? "" : String(v).trim();
      }
      return "";
    }
    function showRejected(keys) {
      const unique = dedupeTokens(keys);
      dialog({
        title: `${unique.length} call${unique.length === 1 ? "" : "s"} not in this report`,
        danger: true,
        message: `${unique.length === 1 ? "This " + S.settings.primaryKey + " doesn't" : "These " + S.settings.primaryKey + " values don't"} match any call that was pulled for ${S.preset && S.preset.label ? S.preset.label : "this session"}, so ${unique.length === 1 ? "it was" : "they were"} left off the grid.\n\nCheck that the right batch was pasted.`,
        list: unique.slice(0, 300),
        buttons: [{ label: "OK", value: true, primary: true }]
      });
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
      if (someAdded) parts.push("Everything else in this paste was added to the grid. The lines that failed were left in the input so you can see which ones to rerun.");
      const list = many ? failures.map((f) => `Line ${f.line}: ${f.status === "truncated" ? "Cut off" : f.message}. ${preview(f.raw)}`) : [];
      dialog({ title: "This output contains an error", danger: true, message: parts.join("\n\n"), list, buttons: [{ label: "OK", value: true, primary: true }] });
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
    //##> SAVE NAME: Save Session asks for a file name in three parts: a name the user can type over (it starts
    //##> as the last name used, or UnpackSession), the date and time, and the row count. The date/time and row
    //##> count can't be typed in, but each has a red x to leave it out and a link to put it back. The finished
    //##> file name is shown live under the fields. Characters Windows doesn't allow in file names are removed.
    function saveStamp(d) {
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
    }
    function cleanFileName(t) {
      return String(t || "").replace(/[\\/:*?"<>|\u0000-\u001F]+/g, "").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
    }
    function askSaveName(rowCount) {
      return new Promise((resolve) => {
        const when = saveStamp(new Date());
        const rowsPart = `${Number(rowCount || 0)}rows`;
        const parts = { date: true, rows: true };
        const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000022;display:flex;align-items:center;justify-content:center;" + FONT });
        overlay.dataset.nxDialog = "1";
        const box = el("div", { style: "background:#fff;width:500px;max-width:94vw;border-radius:12px;padding:20px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-modal", "true");
        const titleId = "nxSaveTitle" + Date.now();
        box.setAttribute("aria-labelledby", titleId);
        box.appendChild(el("div", { id: titleId, style: "font-size:15px;font-weight:700;color:#111827;margin-bottom:4px;" }, "Save Session"));
        box.appendChild(el("div", { style: "font-size:12px;color:#4b5563;margin-bottom:12px;line-height:1.45;" }, "Name your session file. The date and time and the row count are added to the end. Click a red x to leave that part out."));
        const nameId = "nxSaveName" + Date.now();
        box.appendChild(el("label", { htmlFor: nameId, style: "display:block;font-size:12px;font-weight:600;color:#111827;margin-bottom:4px;" }, "Session name"));
        const nameIn = el("input", { type: "text", id: nameId, value: S.saveName || "UnpackSession", maxLength: 100, autocomplete: "off", style: "width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #9ca3af;border-radius:6px;font-size:13px;margin-bottom:10px;" });
        box.appendChild(nameIn);
        const chipRow = el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;" });
        box.appendChild(chipRow);
        const preview = el("div", { style: "font-size:12px;color:#111827;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;margin-bottom:14px;word-break:break-all;" });
        preview.setAttribute("aria-live", "polite");
        box.appendChild(el("div", { style: "font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px;" }, "File name"));
        box.appendChild(preview);
        const fileName = () => {
          const base = cleanFileName(nameIn.value) || "UnpackSession";
          return [base].concat(parts.date ? [when] : [], parts.rows ? [rowsPart] : []).join("_") + ".txt";
        };
        const chip = (key, label, value) => {
          const wrap = el("div", { style: "display:flex;align-items:center;gap:6px;" });
          if (parts[key]) {
            wrap.appendChild(el("span", { style: "font-size:12px;color:#374151;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;", title: label + " (filled in automatically)" }, value));
            const x = el("button", { type: "button", style: "border:0;background:#fee2e2;color:#dc2626;border-radius:50%;width:22px;height:22px;font-size:13px;font-weight:700;cursor:pointer;line-height:1;" }, "\u00D7");
            x.setAttribute("aria-label", "Leave the " + label.toLowerCase() + " out of the file name");
            x.title = "Leave this out";
            x.onclick = () => { parts[key] = false; render(); nameIn.focus(); };
            wrap.appendChild(x);
          } else {
            const add = el("button", { type: "button", style: "border:1px dashed #94a3b8;background:#fff;color:#475569;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;" }, "+ " + label);
            add.onclick = () => { parts[key] = true; render(); nameIn.focus(); };
            wrap.appendChild(add);
          }
          return wrap;
        };
        function render() {
          chipRow.innerHTML = "";
          chipRow.appendChild(chip("date", "Date and time", when));
          chipRow.appendChild(chip("rows", "Row count", rowsPart));
          preview.textContent = fileName();
        }
        const finish = (name) => { overlay.remove(); resolve(name); };
        const btnRow = el("div", { style: "display:flex;gap:8px;" });
        const saveB = el("button", { type: "button", style: "flex:1;" + PRIMARY_BTN }, "Save");
        const cancelB = el("button", { type: "button", style: "flex:1;" + PLAIN_BTN }, "Cancel");
        saveB.onclick = () => { const n = cleanFileName(nameIn.value); if (n) S.saveName = n; finish(fileName()); };
        cancelB.onclick = () => finish(null);
        nameIn.addEventListener("input", () => { preview.textContent = fileName(); });
        overlay.addEventListener("keydown", (e) => {
          if (e.key === "Escape") { e.preventDefault(); finish(null); }
          else if (e.key === "Enter" && e.target === nameIn) { e.preventDefault(); saveB.click(); }
        });
        btnRow.append(saveB, cancelB);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        render();
        setTimeout(() => { nameIn.focus(); nameIn.select(); }, 30);
      });
    }
    async function saveSessionFile() {
      if (editing) commitEdit();
      const name = await askSaveName(rows.length);
      if (!name || closed) return false;
      downloadText(name, sessionFile(JSON.parse(JSON.stringify(S))));
      logEvent("session", `Saved the session as ${name}`);
      return true;
    }
    function loadSessionData(data, keepId) {
      if (tsActive) exitTimestamps(true);
      editing = null;
      const base = newState();
      const next = Object.assign(base, data || {});
      next.settings = Object.assign(defaultSettings(), next.settings || {});
      next.grid = Object.assign(base.grid, next.grid || {});
      if (!Array.isArray(next.pending) || !next.pending.length) next.pending = [{ text: "", error: "" }];
      if (!Array.isArray(next.merges)) next.merges = [];
      if (!Array.isArray(next.mergeDismissed)) next.mergeDismissed = [];
      if (!Array.isArray(next.lockedKeys) || !next.lockedKeys.length) next.lockedKeys = null;
      if (!next.edits || typeof next.edits !== "object") next.edits = {};
      if (!next.editPolicy || typeof next.editPolicy !== "object") next.editPolicy = { all: null, fields: {} };
      if (!next.editPolicy.fields) next.editPolicy.fields = {};
      if (!next.playerSettings || typeof next.playerSettings !== "object") next.playerSettings = {};
      if (!next.tsFields || typeof next.tsFields !== "object") next.tsFields = {};
      if (!Array.isArray(next.tsGroupsOff)) next.tsGroupsOff = [];
      if (!next.tagState || typeof next.tagState !== "object") next.tagState = {};
      if (!next.tsAutoHidden || typeof next.tsAutoHidden !== "object") next.tsAutoHidden = {};
      if (!next.formatAllow || typeof next.formatAllow !== "object") next.formatAllow = {};
      if (!next.checks || typeof next.checks !== "object") next.checks = {};
      if (!next.checkOff || typeof next.checkOff !== "object") next.checkOff = {};
      if (!next.issueIgnore || typeof next.issueIgnore !== "object") next.issueIgnore = { items: {}, rules: {} };
      if (!next.issueIgnore.items) next.issueIgnore.items = {};
      if (!next.issueIgnore.rules) next.issueIgnore.rules = {};
      if (!next.suppress || typeof next.suppress !== "object") next.suppress = {};
      if (!Array.isArray(next.log)) next.log = [];
      if (!next.nextLogId) next.nextLogId = next.log.reduce((n, x) => Math.max(n, x.id || 0), 0) + 1;
      if (!keepId) { next.sessionId = newState().sessionId; next.createdAt = Date.now(); }
      S = next;
      selected.clear();
      cellSel.clear();
      globalSearchBox.value = S.grid.globalFilter || "";
      updateTitle();
      setClickMode(S.grid.clickMode);
      updateMetaBtn();
      refreshAll();
      renderInput();
      if (playerCtrl && playerCtrl.refreshSettings) playerCtrl.refreshSettings();
      scheduleSave();
    }
    async function loadSessionFile(file) {
      let parsed;
      try { parsed = JSON.parse(await file.text()); } catch (_) { parsed = null; }
      if (!parsed || parsed.type !== "nexidiaUnpackSession" || !parsed.data) {
        dialog({ title: "Load failed", danger: true, message: "That file isn't a saved Unpack session." });
        return;
      }
      if (S.entries.length) {
        const r = await dialog({ title: "Replace current session?", message: "Loading replaces what's on the grid now. Your current session will stay saved in the resume list.", buttons: [{ label: "Load", value: true, primary: true }, { label: "Cancel", value: false }] });
        if (!r.value) return;
        saveNow();
      }
      loadSessionData(parsed.data, false);
      logEvent("session", `Loaded a saved session from ${file.name}`);
      toast("Session loaded");
    }
    async function importSpreadsheet(file) {
      const allowNew = !(S.preset && S.preset.allowImportNew === false);
      if (!S.entries.length && !allowNew) {
        dialog({ title: "Nothing to join to", message: "Paste your CoPilot outputs first. Spreadsheet imports only add values to rows already on the grid." });
        return;
      }
      let sheets;
      try {
        const buf = await file.arrayBuffer();
        const sig = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
        if (sig[0] === 0x50 && sig[1] === 0x4b) sheets = await parseXlsx(buf);
        else {
          const text = new TextDecoder().decode(buf);
          const head = text.slice(0, 3000).toLowerCase();
          if (head.includes("<workbook")) sheets = parseSpreadsheetML(text);
          else if (/<html|<table/i.test(head) || /<table/i.test(text)) sheets = parseHtmlTables(text);
          else sheets = [{ name: file.name, rows: parseDelimited(text) }];
        }
      } catch (e) {
        console.error(e);
        dialog({ title: "Import failed", danger: true, message: "That file couldn't be read: " + (e && e.message ? e.message : e) + "." });
        return;
      }
      if (closed) return;
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
      await joinSheet(pick.sheet.rows, pick.header, keyNames, file.name);
    }
    //##> IMPORT STANDARDIZING: Nexidia values from a spreadsheet are put back into the form Nexidia uses before
    //##> they're compared. Date/Time becomes a date-time (from an Excel date number or text like 11/3/2026 10:15 AM),
    //##> Duration and Hold Time become milliseconds (from Excel time, seconds, or text like 2:05). Masked and
    //##> all-zero values are skipped. Values only count as different from Nexidia when they really are: dates
    //##> within the same minute, times within the same second, and numbers that only lost leading zeros all match.
    function convertImportedMeta(field, value) {
      const f = field.toLowerCase();
      const s = String(value == null ? "" : value).trim();
      const n = Number(s);
      const numeric = /^-?\d+(\.\d+)?$/.test(s) && isFinite(n);
      if (f === "recordeddatetime") {
        if (numeric && n > 20000 && n < 80000) return new Date(Math.round((n - 25569) * 86400000)).toISOString();
        const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/);
        if (m) {
          let y = Number(m[3]);
          if (m[3].length === 2) y += 2000;
          let h = Number(m[4] || 0);
          if (m[7]) { const pm = /p/i.test(m[7]); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
          const d = new Date(y, Number(m[1]) - 1, Number(m[2]), h, Number(m[5] || 0), Number(m[6] || 0));
          if (!isNaN(d.getTime())) return d.toISOString();
        }
        return s;
      }
      if (f === "mediafileduration") {
        if (numeric && n < 1) return String(Math.round(n * 86400) * 1000);
        if (TS_TIME_RE.test(s)) { const ms = timeToMs(s); if (ms !== null) return String(ms); }
        return s;
      }
      if (f === "udfint4") {
        if (numeric) return String(Math.round(n) * 1000);
        if (TS_TIME_RE.test(s)) { const ms = timeToMs(s); if (ms !== null) return String(ms); }
        return s;
      }
      return s;
    }
    function metaSame(field, a, b) {
      const f = field.toLowerCase();
      const x = String(a == null ? "" : a).trim(), y = String(b == null ? "" : b).trim();
      if (x === y) return true;
      if (f === "recordeddatetime") {
        const d1 = new Date(x).getTime(), d2 = new Date(y).getTime();
        if (!isNaN(d1) && !isNaN(d2)) return Math.abs(d1 - d2) < 60000;
      }
      if (f === "mediafileduration" || f === "udfint4") {
        const n1 = Number(x), n2 = Number(y);
        if (x && y && isFinite(n1) && isFinite(n2)) return Math.abs(n1 - n2) < 1000;
      }
      if (/^\d+$/.test(x) && /^\d+$/.test(y)) return x.replace(/^0+/, "") === y.replace(/^0+/, "");
      const n1 = Number(x), n2 = Number(y);
      if (x && y && isFinite(n1) && isFinite(n2) && n1 === n2) return true;
      return x.toLowerCase() === y.toLowerCase();
    }
    function nexidiaValue(lk, field) {
      const m = S.meta[lk];
      if (!m || !m.length) return "";
      const v = String(getFV(m[0], field) == null ? "" : getFV(m[0], field)).trim();
      return !v || /^0+$/.test(v) || v.includes("*") ? "" : v;
    }
    function importedCopilotValue(c, v) {
      if (!c || effType(c) !== "date") return v;
      const n = Number(v);
      if (/^\d+(\.\d+)?$/.test(v) && n > 20000 && n < 80000) {
        const d = new Date(Math.round((Math.floor(n) - 25569) * 86400000));
        return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
      }
      return v;
    }
    //##> SPREADSHEET JOIN: Values are added to rows whose key is already on the grid. Columns are matched by
    //##> header or alias, including columns that were merged into others. Stacked values are split on
    //##> semicolons and deduped into the cell. Calls and columns that aren't on the grid each get their own
    //##> Yes/No (reports can turn this off with allowImportNew: false). Calls the user removed earlier get the
    //##> Reinstate / Keep Removed question. A Nexidia cell that's blank is filled from the file. When the file
    //##> and Nexidia disagree, the user picks Keep Nexidia, Use File Values, or Keep Both (stacked).
    //##> IMPORT VS GRID: Before a spreadsheet value is added, it's compared to what the cell shows right now,
    //##> edits included. Matching values are skipped. Values that only add something new are added. Values that
    //##> leave out something the cell has (like an old value the user already fixed) are listed in one popup:
    //##> Keep Grid, Use File Values, or Keep Both. File values chosen there are saved as edits. Dates and numbers
    //##> are compared by what they mean, not how they're written.
    function rowsForKey(lk) {
      return rows.filter((r) => r.key && r.key.toLowerCase() === lk);
    }
    function compareKey(f, t) {
      const c = f.startsWith("j:") ? colById(f.slice(2)) : null;
      const type = c ? effType(c) : "text";
      const s = String(t).trim();
      if (type === "date") { const d = parseDateToken(s); if (d) return `d:${d.y}-${d.mo}-${d.d}`; }
      if (type === "number" || type === "currency") { const m = parseMoneyToken(s); if (m && !m.leadingZero) return "n:" + m.n; }
      return tokenKey(s);
    }
    function splitFileValue(f, v) {
      const dl = delimFor(f);
      const c = f.startsWith("j:") ? colById(f.slice(2)) : null;
      const out = [];
      for (const t of splitTokens(v, dl)) {
        if (c && isProse(c)) out.push(t);
        else for (const x of splitTokens(t, INCOMING_DELIM)) out.push(x);
      }
      return out.filter((t) => !checkTokenBlank(f, t));
    }
    function cellTokensFor(row, f) {
      const dl = delimFor(f);
      const out = [];
      for (const t of cellParts(row, f).tokens) for (const x of splitTokens(t, dl)) if (!checkTokenBlank(f, x)) out.push(x);
      return out;
    }
    function gridCompare(lk, target, v) {
      const f = rootOf(target);
      const rs = rowsForKey(lk);
      if (!rs.length) return { state: "new" };
      const row = rs[0];
      const edited = !!getEdit(row, f);
      const cur = cellTokensFor(row, f);
      const file = splitFileValue(f, v);
      if (!file.length) return { state: "same" };
      const curKeys = new Set(cur.map((t) => compareKey(f, t)));
      const fileKeys = new Set(file.map((t) => compareKey(f, t)));
      const ed = getEdit(row, f);
      const dropped = new Set(ed && ed.dropped ? ed.dropped : []);
      if (!cur.length) return edited ? { state: "differs", current: "" } : { state: "new" };
      const missing = [...curKeys].some((k) => !fileKeys.has(k));
      const add = file.filter((t) => !curKeys.has(compareKey(f, t)) && !dropped.has(tokenKey(t)));
      if (!missing && !add.length) return { state: "same" };
      if (missing) return { state: "differs", current: cur.join(delimFor(f)) };
      return { state: "adds", add: dedupeTokens(add), edited, rows: rs, field: f };
    }
    function gridMetaCompare(lk, target, field, v) {
      const f = rootOf(target);
      const row = rowsForKey(lk)[0];
      if (!row || !getEdit(row, f)) return "none";
      const cur = cellRaw(row, f);
      if (metaSame(field, cur, v) || splitTokens(cur, delimFor(f)).some((t) => metaSame(field, t, v))) return "same";
      return "differs";
    }
    async function joinSheet(sheetRows, headerIdx, keyNames, fileName) {
      const allowNew = !(S.preset && S.preset.allowImportNew === false);
      const headers = sheetRows[headerIdx].map((h) => String(h == null ? "" : h).trim());
      const am = aliasMap();
      const metaByHeader = new Map();
      for (const f of S.metaFields) { metaByHeader.set(String(S.metaHeaders[f] || f).toLowerCase(), f); metaByHeader.set(f.toLowerCase(), f); }
      let pk = pkColumn();
      const map = {};
      const unknown = [];
      let keyIdx = -1;
      headers.forEach((h, i) => {
        const lk = h.toLowerCase();
        if (!lk) return;
        if (keyIdx === -1 && ((pk && am.get(lk) === pk.id) || keyNames.has(lk))) keyIdx = i;
        if (am.has(lk)) map[i] = "j:" + am.get(lk);
        else if (metaByHeader.has(lk)) map[i] = "m:" + metaByHeader.get(lk);
        else if (!keyNames.has(lk)) unknown.push(i);
      });
      if (keyIdx === -1) { dialog({ title: "Import failed", danger: true, message: "The key column couldn't be located in that sheet." }); return; }
      if (!pk) {
        ensureColumn(S.settings.primaryKey || "Trans_Id", aliasMap());
        pk = pkColumn();
      }
      const existing = currentKeys(pk);
      const removedMap = removedByKey(pk);
      const dataRows = [];
      const newKeys = [], removedHits = [];
      const seenNew = new Set();
      for (let r = headerIdx + 1; r < sheetRows.length; r++) {
        const row = sheetRows[r];
        if (isBlankRow(row)) continue;
        const key = String(row[keyIdx] == null ? "" : row[keyIdx]).trim();
        if (!key || /^0+$/.test(key)) continue;
        const lk = key.toLowerCase();
        dataRows.push({ row, key, lk });
        if (seenNew.has(lk)) continue;
        if (removedMap.has(lk)) { seenNew.add(lk); removedHits.push(key); }
        else if (!existing.has(lk)) { seenNew.add(lk); newKeys.push(key); }
      }
      let addCols = false;
      if (unknown.length && allowNew) {
        const names = unknown.map((i) => headers[i]);
        const r = await dialog({
          title: `${plural(names.length, "column")} not on the grid`,
          message: `${fileName} has ${names.length === 1 ? "a column" : "columns"} the grid doesn't have yet. Add ${names.length === 1 ? "it" : "them"} to the grid with ${names.length === 1 ? "its" : "their"} values?`,
          list: names.slice(0, 300),
          collapseOver: 10,
          buttons: [{ label: "Add Columns", value: true, primary: true }, { label: "Skip Them", value: false }]
        });
        if (closed) return;
        addCols = !!r.value;
      }
      let addCalls = false;
      if (newKeys.length && allowNew) {
        const r = await dialog({
          title: `${plural(newKeys.length, "call")} not on the grid`,
          message: `${fileName} has ${newKeys.length === 1 ? "a " + S.settings.primaryKey + " that isn't" : newKeys.length.toLocaleString() + " " + pkPlural() + " that aren't"} on the grid yet. Add ${newKeys.length === 1 ? "it" : "them"} as new rows? ${newKeys.length === 1 ? "It" : "They"}'ll be looked up in Nexidia like any other new call.`,
          list: newKeys.slice(0, 500),
          collapseOver: 10,
          buttons: [{ label: "Add Calls", value: true, primary: true }, { label: "Skip Them", value: false }]
        });
        if (closed) return;
        addCalls = !!r.value;
      }
      let reinstated = new Set();
      if (removedHits.length && (await askReinstate(removedHits, "This file")) === "reinstate") {
        reinstateKeys(removedHits, removedMap);
        reinstated = new Set(removedHits.map((k) => k.toLowerCase()));
      }
      if (closed) return;
      const added = [];
      if (addCols) {
        for (const i of unknown) {
          const h = headers[i];
          const field = normName(h) === "transid" ? null : searchFieldFor(h);
          if (field && !S.metaFields.includes(field) && !mergeSourceOf("m:" + field)) {
            ensureMetaField(field, h);
            map[i] = "m:" + field;
          } else {
            map[i] = "j:" + ensureColumn(h, aliasMap());
          }
          added.push(h);
        }
      }
      const accept = new Set(existing);
      for (const k of reinstated) accept.add(k);
      if (addCalls) {
        for (const k of newKeys) {
          const lk = k.toLowerCase();
          S.entries.push({ id: S.nextEntryId++, pasteId: 0, seed: true, values: { [pk.id]: k } });
          freshKeys.add(lk);
          if (S.lockedKeys && !S.lockedKeys.includes(lk)) S.lockedKeys.push(lk);
          accept.add(lk);
        }
      }
      const conflicts = [];
      const gridDiffs = [];
      let matchedRows = 0, values = 0, skippedRows = 0, sameAsNexidia = 0, sameAsGrid = 0;
      const rowKeys = new Set();
      for (const d of dataRows) {
        if (!accept.has(d.lk)) { skippedRows++; continue; }
        rowKeys.add(d.lk);
        matchedRows++;
        for (const i in map) {
          if (Number(i) === keyIdx) continue;
          let v = String(d.row[i] == null ? "" : d.row[i]).trim();
          if (!v) continue;
          const target = map[i];
          if (target.startsWith("m:")) {
            if (v.includes("*") || /^0+$/.test(v)) continue;
            const field = target.slice(2);
            v = convertImportedMeta(field, v);
            const shown = gridMetaCompare(d.lk, target, field, v);
            if (shown === "same") { sameAsGrid++; continue; }
            if (shown === "differs") { gridDiffs.push({ key: d.key, lk: d.lk, target, field, value: v }); continue; }
            const nex = existing.has(d.lk) ? nexidiaValue(d.lk, field) : "";
            if (nex && metaSame(field, nex, v)) { sameAsNexidia++; continue; }
            if (nex) { conflicts.push({ key: d.key, lk: d.lk, target, field, nex, value: v }); continue; }
            S.imports.push({ key: d.lk, target, value: v });
          } else {
            const val = importedCopilotValue(colById(target.slice(2)), v);
            const cmp = gridCompare(d.lk, target, val);
            if (cmp.state === "same") { sameAsGrid++; continue; }
            if (cmp.state === "differs") { gridDiffs.push({ key: d.key, lk: d.lk, target, value: val, current: cmp.current }); continue; }
            if (cmp.state === "adds" && cmp.edited) { for (const r of cmp.rows) setEditQuiet(r, cmp.field, dedupeTokens(cellTokensFor(r, cmp.field).concat(cmp.add)).join(delimFor(cmp.field))); values++; continue; }
            S.imports.push({ key: d.lk, target, value: cmp.state === "adds" ? cmp.add.join(INCOMING_DELIM) : val });
          }
          values++;
        }
      }
      let gridChoice = null;
      if (gridDiffs.length) {
        gridChoice = S.suppress.importGridDiff || null;
        if (!gridChoice) {
          const r = await dialog({
            title: `${plural(gridDiffs.length, "value")} differ from the grid`,
            message: `These values in ${fileName} don't match what's on the grid now, including your edits and fixes. Keep what's on the grid, use the file's values, or keep both in the cell? File values are saved as edits, so they can be reverted.`,
            list: gridDiffs.slice(0, 300).map((c) => { const f = rootOf(c.target); const row = rowsForKey(c.lk)[0]; return `${c.key} \u00B7 ${baseHeader(f)}: grid "${row ? cellText(row, f) : ""}", file "${c.value}"`; }),
            collapseOver: 8,
            width: 520,
            checkbox: "Remember my choice for this session",
            buttons: [{ label: "Keep Grid", value: "keep", primary: true }, { label: "Use File Values", value: "replace" }, { label: "Keep Both", value: "stack" }]
          });
          if (closed) return;
          gridChoice = r.value || "keep";
          if (r.checked) S.suppress.importGridDiff = gridChoice;
        }
        if (gridChoice !== "keep") {
          for (const c of gridDiffs) {
            const f = rootOf(c.target);
            const dl = delimFor(f);
            const fileToks = c.field ? [c.value] : splitFileValue(f, c.value);
            for (const row of rowsForKey(c.lk)) {
              const next = gridChoice === "replace" ? dedupeTokens(fileToks) : dedupeTokens(cellTokensFor(row, f).concat(fileToks));
              setEditQuiet(row, f, next.join(dl));
            }
            values++;
          }
        }
      }
      let conflictChoice = null;
      if (conflicts.length) {
        conflictChoice = S.suppress.importConflict || null;
        if (!conflictChoice) {
          const fmt = (c, v) => (xls && xls.formatDisplayValue ? xls.formatDisplayValue(c.field, v) : v);
          const r = await dialog({
            title: `${plural(conflicts.length, "value")} differ from Nexidia`,
            message: `These values in ${fileName} don't match what Nexidia has. Keep Nexidia's values, use the file's values, or keep both in the cell?`,
            list: conflicts.slice(0, 300).map((c) => `${c.key} \u00B7 ${baseHeader(rootOf(c.target))}: Nexidia "${fmt(c, c.nex)}", file "${fmt(c, c.value)}"`),
            collapseOver: 8,
            width: 520,
            checkbox: "Remember my choice for this session",
            buttons: [{ label: "Keep Nexidia", value: "keep", primary: true }, { label: "Use File Values", value: "replace" }, { label: "Keep Both", value: "stack" }]
          });
          if (closed) return;
          conflictChoice = r.value || "keep";
          if (r.checked) S.suppress.importConflict = conflictChoice;
        }
        if (conflictChoice !== "keep") {
          for (const c of conflicts) { S.imports.push({ key: c.lk, target: c.target, value: c.value, mode: conflictChoice }); values++; }
        }
      }
      newDataPending = true;
      refreshAll();
      const parts = [`Imported ${plural(values, "value")} into ${plural(rowKeys.size, "row")} from ${fileName}.`];
      if (addCalls && newKeys.length) parts.push(`${plural(newKeys.length, "new call")} added.`);
      if (reinstated.size) parts.push(`${plural(reinstated.size, "removed row")} reinstated.`);
      if (added.length) parts.push(`New column${added.length === 1 ? "" : "s"}: ${added.slice(0, 12).join(", ")}${added.length > 12 ? ", and " + (added.length - 12) + " more" : ""}.`);
      if (sameAsGrid) parts.push(`${plural(sameAsGrid, "value")} already matched the grid.`);
      if (gridDiffs.length) parts.push(`${plural(gridDiffs.length, "value")} differed from the grid: ${gridChoice === "replace" ? "used the file's values as edits" : gridChoice === "stack" ? "kept both as edits" : "kept the grid"}.`);
      if (sameAsNexidia) parts.push(`${plural(sameAsNexidia, "value")} already matched Nexidia.`);
      if (conflicts.length) parts.push(`${plural(conflicts.length, "value")} differed from Nexidia: ${conflictChoice === "replace" ? "used the file's values" : conflictChoice === "stack" ? "kept both" : "kept Nexidia's"}.`);
      if (skippedRows) parts.push(`${plural(skippedRows, "row")} with ${skippedRows === 1 ? "a key" : "keys"} not on the grid ${skippedRows === 1 ? "was" : "were"} skipped.`);
      if (unknown.length && !addCols) parts.push(`Columns not on the grid were skipped: ${unknown.slice(0, 12).map((i) => headers[i]).join(", ")}${unknown.length > 12 ? ", and " + (unknown.length - 12) + " more" : ""}.`);
      addNotice("info", parts.join(" "), "import");
      logEvent("import", parts.join(" "), Object.assign({ keys: dataRows.filter((d) => rowKeys.has(d.lk)).map((d) => d.key) }, added.length ? { items: added.slice() } : {}));
      toast(`Imported ${plural(values, "value")}`);
      if (addCalls && newKeys.length) {
        if (S.settings.autoMeta) fetchMetadata(true);
        else runMergeDetection();
      }
    }
    function rowsById() {
      return new Map(rows.map((r) => [r.id, r]));
    }
    function syncEditBases() {
      if (conflictBusy) return;
      const byId = rowsById();
      for (const rowId of Object.keys(S.edits)) {
        const row = byId.get(rowId);
        if (!row) continue;
        for (const f of Object.keys(S.edits[rowId])) S.edits[rowId][f].base = baseRaw(row, f);
      }
    }
    function hasEdits() {
      return Object.keys(S.edits).some((k) => Object.keys(S.edits[k]).length);
    }
    function conflictDialog(row, f, ed, incoming) {
      return new Promise((resolve) => {
        const delim = delimFor(f);
        const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000021;display:flex;align-items:center;justify-content:center;" + FONT });
        const box = el("div", { style: "background:#fff;width:500px;max-width:94vw;max-height:86vh;overflow:auto;border-radius:12px;padding:22px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
        box.appendChild(el("div", { style: "font-size:15px;font-weight:700;color:#111827;margin-bottom:10px;" }, "New data for an edited field"));
        box.appendChild(el("div", { style: "font-size:13px;color:#374151;line-height:1.45;margin-bottom:10px;" }, "This data impacts a field that you have made edits to. How should we handle the new data?"));
        const detail = el("div", { style: "border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin-bottom:12px;font-size:12px;color:#374151;line-height:1.5;" });
        detail.appendChild(el("div", {}, el("b", {}, "Field: "), baseHeader(f)));
        detail.appendChild(el("div", {}, el("b", {}, "Row: "), row.key || row.id));
        detail.appendChild(el("div", { style: "word-break:break-word;" }, el("b", {}, "Your edit: "), String(ed.value || "(blank)")));
        detail.appendChild(el("div", { style: "word-break:break-word;" }, el("b", {}, "New data: "), String(incoming || "(blank)")));
        box.appendChild(detail);
        const scopeName = "nx-conflict-scope-" + Date.now();
        const scopes = [["all", "Always do this for all edited fields."], ["field", `Always do this for this field (${baseHeader(f)}).`], ["ask", "Ask Again Next Time"]];
        const scopeWrap = el("div", { style: "margin:4px 0 14px;" });
        const radios = [];
        for (const [v, l] of scopes) {
          const rb = el("input", { type: "radio", name: scopeName, value: v, checked: v === "ask" });
          radios.push(rb);
          scopeWrap.appendChild(el("label", { style: "display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;margin:4px 0;cursor:pointer;" }, rb, l));
        }
        const choices = [
          ["ignore", "Ignore New Data", "Disregard new info for this field, leave it as it is."],
          ["replace", "Replace With New Data", "Disregard your edit and replace the field with this new value."],
          ["combine", "Add And Combine", `Stack new incoming data on top of existing data using a [${delim}] delimiter.`]
        ];
        const btnRow = el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;" });
        for (const [v, l, tip] of choices) {
          const b = el("button", { style: "flex:1;" + (v === "ignore" ? PRIMARY_BTN : PLAIN_BTN), title: tip }, l);
          b.onclick = () => {
            const picked = radios.find((r) => r.checked);
            overlay.remove();
            resolve({ choice: v, scope: picked ? picked.value : "ask" });
          };
          btnRow.appendChild(b);
        }
        box.appendChild(btnRow);
        box.appendChild(scopeWrap);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
      });
    }
    async function checkEditConflicts() {
      if (!hasEdits()) return;
      if (conflictBusy) { conflictAgain = true; return; }
      conflictBusy = true;
      try {
        const byId = rowsById();
        for (const rowId of Object.keys(S.edits)) {
          const row = byId.get(rowId);
          if (!row) continue;
          for (const f of Object.keys(S.edits[rowId] || {})) {
            const ed = S.edits[rowId] && S.edits[rowId][f];
            if (!ed) continue;
            const nb = baseRaw(row, f);
            if (nb === ed.base) continue;
            if (isEmptyValue(nb) || nb === ed.value) { ed.base = nb; continue; }
            const dl = delimFor(f);
            const known = new Set(splitTokens(ed.base, dl).concat(splitTokens(ed.value, dl)).map(tokenKey));
            for (const k of (ed.dropped || [])) known.add(k);
            const freshToks = splitTokens(nb, dl).filter((t) => !known.has(tokenKey(t)));
            if (!freshToks.length) { ed.base = nb; row.cache = {}; continue; }
            let choice = (S.editPolicy.fields && S.editPolicy.fields[f]) || S.editPolicy.all;
            if (!choice) {
              const r = await conflictDialog(row, f, ed, freshToks.join(dl));
              if (closed) return;
              choice = r.choice;
              if (r.scope === "all") S.editPolicy.all = choice;
              else if (r.scope === "field") S.editPolicy.fields[f] = choice;
            }
            if (choice === "replace") {
              delete S.edits[rowId][f];
              if (!Object.keys(S.edits[rowId]).length) delete S.edits[rowId];
            } else if (choice === "combine") {
              ed.value = dedupeTokens(splitTokens(ed.value, dl).concat(freshToks)).join(dl);
              ed.base = nb;
              ed.at = Date.now();
            } else {
              ed.base = nb;
            }
            row.cache = {};
          }
        }
      } finally {
        conflictBusy = false;
      }
      if (closed) return;
      clearRowCaches();
      renderRows();
      scheduleSave();
      if (conflictAgain) { conflictAgain = false; checkEditConflicts(); }
    }
    //##> KEPT CHANGES: Every edit remembers the values the user took out of the cell (dropped). When new data
    //##> arrives later (a paste, an import, a lookup), only values that are truly new to that cell count as new
    //##> data. Values the user already had, already removed, or already fixed never bring the edit prompt back
    //##> and never reappear in the cell.
    function droppedTokens(f, base, value, prior) {
      const d = delimFor(f);
      const keep = new Set(splitTokens(value, d).map(tokenKey));
      const out = new Set((prior || []).filter((k) => !keep.has(k)));
      for (const t of splitTokens(base, d)) { const k = tokenKey(t); if (!keep.has(k)) out.add(k); }
      return [...out];
    }
    function setEditQuiet(row, f, value) {
      const base = baseRaw(row, f);
      if (value === base) {
        if (S.edits[row.id]) { delete S.edits[row.id][f]; if (!Object.keys(S.edits[row.id]).length) delete S.edits[row.id]; }
      } else {
        if (!S.edits[row.id]) S.edits[row.id] = {};
        const prev = S.edits[row.id][f];
        S.edits[row.id][f] = { value, base, at: Date.now(), dropped: droppedTokens(f, base, value, prev && prev.dropped) };
      }
      row.cache = {};
    }
    function applyEdit(rowId, f, value) {
      const row = rows.find((r) => r.id === rowId);
      if (!row) return false;
      const cur = cellRaw(row, f);
      if (value === cur) return false;
      const base = baseRaw(row, f);
      if (value === base) {
        if (S.edits[rowId]) {
          delete S.edits[rowId][f];
          if (!Object.keys(S.edits[rowId]).length) delete S.edits[rowId];
        }
      } else {
        if (!S.edits[rowId]) S.edits[rowId] = {};
        const prev = S.edits[rowId][f];
        S.edits[rowId][f] = { value, base, at: Date.now(), dropped: droppedTokens(f, base, value, prev && prev.dropped) };
      }
      logEvent("edit", `${value === base ? "Returned" : "Edited"} ${baseHeader(f)} on ${row.key || "a row with no " + S.settings.primaryKey}`, { keys: [row.key] });
      row.cache = {};
      tsCache = null;
      invalidateIssues();
      scheduleSave();
      return true;
    }
    async function revertEdits(targets) {
      const list = targets.filter((t) => S.edits[t.rowId] && S.edits[t.rowId][t.field]);
      if (!list.length) return;
      if (!S.suppress.revertConfirm) {
        const one = list.length === 1;
        const r = await dialog({
          title: one ? "Revert this field?" : `Revert ${list.length} fields?`,
          message: one ? "This field will go back to its original value from your CoPilot output, spreadsheet import, or Nexidia metadata. Your edit will be removed." : "These fields will go back to their original values from your CoPilot outputs, spreadsheet imports, or Nexidia metadata. Your edits will be removed.",
          checkbox: "Don't ask me again this session",
          buttons: [{ label: "Revert", value: true, primary: true }, { label: "Cancel", value: false }]
        });
        if (!r.value) return;
        if (r.checked) S.suppress.revertConfirm = true;
      }
      for (const t of list) {
        delete S.edits[t.rowId][t.field];
        if (!Object.keys(S.edits[t.rowId]).length) delete S.edits[t.rowId];
      }
      clearRowCaches();
      renderRows();
      logEvent("revert", `Reverted ${plural(list.length, "field")}`, { keys: list.map((t) => { const r = rows.find((x) => x.id === t.rowId); return r ? r.key : ""; }) });
      toast(`${list.length} field${list.length === 1 ? "" : "s"} reverted`, "#0369a1");
    }
    function editedInSelection() {
      const vf = visFields();
      const out = [];
      for (const key of cellSel) {
        const [r, c] = key.split(",").map(Number);
        const row = view[r], f = vf[c];
        if (row && f && getEdit(row, f)) out.push({ rowId: row.id, field: f });
      }
      return out;
    }
    function scrollCellIntoView(ri, ci, center) {
      const vf = visFields();
      const top = ri * ROW_HEIGHT;
      const headH = thead.offsetHeight || ROW_HEIGHT;
      if (center) tableWrap.scrollTop = Math.max(0, top - (tableWrap.clientHeight - headH) / 2);
      else if (top < tableWrap.scrollTop) tableWrap.scrollTop = top;
      else if (top + ROW_HEIGHT > tableWrap.scrollTop + tableWrap.clientHeight - headH) tableWrap.scrollTop = top + ROW_HEIGHT - tableWrap.clientHeight + headH;
      let left = frozenW();
      for (let i = 0; i < ci; i++) left += getColWidth(vf[i]);
      const w = getColWidth(vf[ci]);
      const visLeft = tableWrap.scrollLeft + frozenW();
      if (left < visLeft) tableWrap.scrollLeft = left - frozenW();
      else if (left + w > tableWrap.scrollLeft + tableWrap.clientWidth) tableWrap.scrollLeft = left + w - tableWrap.clientWidth;
    }
    //##> STACKED EDITOR: Editing opens a panel that floats over the cell (in the grid or the row strip). Every
    //##> value already in the cell gets its own line, split on the column's delimiter, and the user types new
    //##> values on empty lines below. Nobody has to type delimiters. While typing, existing values that match
    //##> move to the top and light up. Saving drops any new value that's already in the field and says so.
    //##> Prose columns get a single text box instead. editing.where is "grid" or "strip".
    function tokenKey(v) {
      return String(v == null ? "" : v).trim().toLowerCase().replace(/\s+/g, " ");
    }
    function editorPrefCaret() {
      return unpackPref("tagEditCaret") === "last" ? "last" : "newline";
    }
    function editorAnchor(ed) {
      if (!ed) return null;
      if (ed.where === "strip") {
        if (!stripBox) return null;
        for (const td of stripBox.querySelectorAll("td[data-field]")) {
          if (td.dataset.rowid === ed.rowId && td.dataset.field === ed.field) return td;
        }
        return null;
      }
      return tbody.querySelector(`td[data-r="${ed.ri}"][data-c="${ed.ci}"]`);
    }
    function savedEditorPos() {
      try {
        const v = JSON.parse(localStorage.getItem(LS_EDITOR_POS) || "null");
        return v && isFinite(v.left) && isFinite(v.top) ? v : null;
      } catch (_) { return null; }
    }
    function positionEditor() {
      if (!editing || !editing.panel) return;
      const a = editorAnchor(editing);
      const p = editing.panel;
      const pos = savedEditorPos();
      if (pos) {
        p.style.visibility = "visible";
        if (!p.style.width) p.style.width = "320px";
        const w = p.offsetWidth, h = p.offsetHeight;
        p.style.left = Math.max(4, Math.min(pos.left, window.innerWidth - w - 4)) + "px";
        p.style.top = Math.max(4, Math.min(pos.top, window.innerHeight - h - 4)) + "px";
        return;
      }
      if (!a) { p.style.visibility = "hidden"; return; }
      const r = a.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { p.style.visibility = "hidden"; return; }
      p.style.visibility = "visible";
      const w = Math.min(440, Math.max(r.width + 2, 260));
      p.style.width = w + "px";
      let left = Math.min(r.left - 1, window.innerWidth - w - 8);
      left = Math.max(8, left);
      p.style.left = left + "px";
      const h = p.offsetHeight;
      let top = r.top - 1;
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.bottom + 1 - h);
      p.style.top = top + "px";
    }
    function closeEditorPanel(ed) {
      if (ed && ed.panel) { try { ed.panel.remove(); } catch (_) {} }
    }
    function openEditor(row, f, opts) {
      opts = opts || {};
      if (!row || !f) return;
      if (f === "__conf__") { toast("Confidence is calculated and can't be edited.", "#6b7280"); return; }
      if (editing) commitEdit();
      const c = f.startsWith("j:") ? colById(f.slice(2)) : null;
      const prose = !!(c && isProse(c));
      const delim = delimFor(f);
      const raw = cellRaw(row, f);
      const accent = opts.tagId ? "#ef4444" : "#f59e0b";
      const panel = el("div", { style: `position:fixed;z-index:1000006;background:#fff;border:2px solid ${accent};border-radius:6px;box-shadow:0 10px 28px rgba(0,0,0,.35);padding:6px;box-sizing:border-box;max-height:300px;overflow-y:auto;visibility:hidden;` + FONT });
      panel.dataset.nxEditor = "1";
      panel.addEventListener("mousedown", (e) => e.stopPropagation());
      //##> EDITOR POSITION: The editor can be dragged by its header so it doesn't cover nearby cells. The spot is
      //##> saved in this browser and used for every edit after that. Double-clicking the header puts it back
      //##> over the cell being edited.
      const single = !prose && isSingleField(f);
      const head = el("div", { style: "display:flex;flex-direction:column;gap:1px;margin:0 2px 5px;cursor:move;user-select:none;", title: "Drag to move this box. Double-click to put it back over the cell." });
      const headTop = el("div", { style: "display:flex;align-items:flex-start;gap:6px;" });
      headTop.appendChild(el("span", { style: "font-size:12px;font-weight:700;color:#111827;flex:1;min-width:0;white-space:normal;word-break:break-word;line-height:1.3;" }, baseHeader(f)));
      headTop.appendChild(el("span", { style: "font-size:12px;color:#9ca3af;flex-shrink:0;line-height:1.3;" }, "\u2725"));
      head.appendChild(headTop);
      head.appendChild(el("span", { style: "font-size:10px;color:#6b7280;" }, prose ? "Enter saves \u00B7 Shift+Enter new line \u00B7 Esc cancels" : (single ? "One value only \u00B7 Enter saves \u00B7 Esc cancels" : "Enter saves \u00B7 Tab adds a line \u00B7 Esc cancels")));
      head.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const r0 = panel.getBoundingClientRect();
        const dx = e.clientX - r0.left, dy = e.clientY - r0.top;
        const keep = document.activeElement;
        const move = (ev) => {
          panel.style.left = Math.max(4, Math.min(ev.clientX - dx, window.innerWidth - panel.offsetWidth - 4)) + "px";
          panel.style.top = Math.max(4, Math.min(ev.clientY - dy, window.innerHeight - panel.offsetHeight - 4)) + "px";
        };
        const up = () => {
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
          try { localStorage.setItem(LS_EDITOR_POS, JSON.stringify({ left: parseFloat(panel.style.left), top: parseFloat(panel.style.top) })); } catch (_) {}
          if (keep && panel.contains(keep)) keep.focus();
        };
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      });
      head.addEventListener("dblclick", () => {
        try { localStorage.removeItem(LS_EDITOR_POS); } catch (_) {}
        positionEditor();
        const t = ed.newInputs[ed.newInputs.length - 1] || ed.input;
        if (t) t.focus();
      });
      panel.appendChild(head);
      const openIss = S.settings.showFlags ? cellIssues(row, f) : [];
      if (openIss.length) panel.appendChild(el("div", { style: "font-size:11px;color:#b91c1c;background:#fef2f2;border-radius:4px;padding:4px 6px;margin:0 0 5px;line-height:1.4;" }, openIss.map((i) => "\u26A0 " + i.message).join("\n")));
      const ed = { rowId: row.id, field: f, ri: opts.ri, ci: opts.ci, where: opts.where || "grid", panel, tagId: opts.tagId || null, prose, single, delim, orig: raw, tokens: [], newInputs: [], input: null };
      const keyHandler = (e, inp) => {
        if (isNavShortcut(e)) { e.preventDefault(); e.stopPropagation(); shortcutNav(e.key === "ArrowLeft" ? -1 : 1); return; }
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelEdit(); return; }
        if (e.key === "Enter" && !(prose && e.shiftKey)) {
          e.preventDefault(); e.stopPropagation();
          finishEditor(e.shiftKey ? "up" : "down");
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault(); e.stopPropagation();
          if (e.shiftKey) { finishEditor("left"); return; }
          if (prose || single || !inp.value.trim()) { finishEditor("right"); return; }
          const emptyNew = ed.newInputs.find((x) => x !== inp && !x.value.trim());
          if (emptyNew) { emptyNew.focus(); return; }
          addNewLine(true);
        }
      };
      if (prose) {
        const ta = el("textarea", { rows: 4, style: "width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:4px;padding:6px 8px;font-size:12px;resize:vertical;outline:none;color:#111827;" + FONT });
        ta.value = raw;
        ta.addEventListener("keydown", (e) => keyHandler(e, ta));
        panel.appendChild(ta);
        ed.input = ta;
      } else {
        const list = el("div", { style: "display:flex;flex-direction:column;gap:3px;" });
        const newWrap = el("div", { style: "display:flex;flex-direction:column;gap:3px;margin-top:3px;" });
        const plusRow = el("div", { style: "display:flex;justify-content:flex-start;margin-top:4px;" });
        const plusBtn = el("button", { type: "button", title: "Add another value (same as Tab)", style: "border:1px dashed #94a3b8;background:#f8fafc;color:#475569;border-radius:4px;font-size:11px;padding:2px 10px;cursor:pointer;" }, "+ Add value");
        plusBtn.addEventListener("mousedown", (e) => e.preventDefault());
        plusBtn.onclick = () => addNewLine(true);
        plusRow.appendChild(plusBtn);
        const lineStyle = "flex:1;min-width:0;box-sizing:border-box;border:1px solid #e5e7eb;border-radius:4px;padding:4px 8px;font-size:12px;outline:none;color:#111827;background:#f9fafb;" + FONT;
        //##> ZERO CELLS: A 0 placeholder isn't listed as a value, so whatever the user types replaces it.
        splitTokens(raw, delim).filter((v) => !isZeroish(v)).forEach((v, i) => {
          const wrap = el("div", { style: "display:flex;align-items:center;gap:4px;border-radius:4px;" });
          const inp = el("input", { type: "text", value: v, style: lineStyle, title: "Click to change this value" });
          inp.addEventListener("focus", () => { inp.style.background = "#fff"; inp.style.borderColor = "#93c5fd"; });
          inp.addEventListener("blur", () => { inp.style.background = "#f9fafb"; inp.style.borderColor = "#e5e7eb"; });
          inp.addEventListener("keydown", (e) => keyHandler(e, inp));
          const x = el("button", { type: "button", title: "Remove this value", style: "border:0;background:transparent;color:#9ca3af;font-size:14px;cursor:pointer;padding:0 4px;line-height:1;" }, "\u00D7");
          x.addEventListener("mousedown", (e) => e.preventDefault());
          const tok = { orig: v, input: inp, wrap, removed: false, order: i };
          x.onclick = () => removeToken(tok);
          wrap.append(inp, x);
          list.appendChild(wrap);
          ed.tokens.push(tok);
        });
        function addNewLine(focus) {
          const wrap = el("div", { style: "display:flex;align-items:center;gap:4px;" });
          const inp = el("input", { type: "text", placeholder: ed.tokens.length || ed.newInputs.length ? "Add a value..." : "Type a value...", style: "flex:1;min-width:0;box-sizing:border-box;border:1px solid #fcd34d;border-radius:4px;padding:4px 8px;font-size:12px;outline:none;color:#111827;background:#fffbeb;" + FONT });
          inp.addEventListener("keydown", (e) => keyHandler(e, inp));
          inp.addEventListener("input", () => rankMatches(inp.value));
          inp.addEventListener("focus", () => rankMatches(inp.value));
          wrap.appendChild(inp);
          wrap.appendChild(el("span", { style: "width:22px;flex-shrink:0;" }));
          newWrap.appendChild(wrap);
          ed.newInputs.push(inp);
          if (focus) { inp.focus(); setTimeout(positionEditor, 0); }
          return inp;
        }
        function rankMatches(q) {
          const k = tokenKey(q);
          const live = ed.tokens.filter((t) => !t.removed);
          for (const t of live) {
            const tk = tokenKey(t.input.value);
            t.score = !k ? 0 : (tk === k ? 3 : (tk.startsWith(k) ? 2 : (tk.includes(k) ? 1 : 0)));
            t.wrap.style.background = t.score === 3 ? "#fde68a" : (t.score ? "#fef9c3" : "");
            t.wrap.title = t.score === 3 ? "Already in this field" : "";
          }
          const ordered = live.slice().sort((a, b) => (b.score || 0) - (a.score || 0) || a.order - b.order);
          for (const t of ordered) list.appendChild(t.wrap);
        }
        async function removeToken(tok) {
          if (!S.suppress.tokenDelete) {
            const r = await dialog({ title: "Remove this value?", message: `"${tok.input.value || tok.orig}" will be taken out of ${baseHeader(f)}. You can still press Esc to cancel everything before saving.`, checkbox: "Don't ask me again this session", buttons: [{ label: "Remove", value: true, primary: true }, { label: "Cancel", value: false }] });
            if (!r.value) { tok.input.focus(); return; }
            if (r.checked) S.suppress.tokenDelete = true;
          }
          tok.removed = true;
          tok.wrap.remove();
          const target = ed.newInputs[0];
          if (target) target.focus();
          positionEditor();
        }
        panel.appendChild(list);
        panel.appendChild(newWrap);
        if (!single) panel.appendChild(plusRow);
        const first = single && ed.tokens.length ? null : addNewLine(false);
        ed.input = first || ed.tokens[ed.tokens.length - 1].input;
        ed.addNewLine = addNewLine;
      }
      editing = ed;
      document.body.appendChild(panel);
      if (ed.where === "grid") scrollCellIntoView(opts.ri, opts.ci, !!opts.center);
      renderRows();
      if (ed.where === "strip") renderStrip();
      positionEditor();
      let focusEl = ed.input;
      if (!prose && (single || editorPrefCaret() === "last") && ed.tokens.length) focusEl = ed.tokens[ed.tokens.length - 1].input;
      focusEl.focus();
      try { const n = focusEl.value.length; focusEl.setSelectionRange(n, n); } catch (_) {}
    }
    function startEdit(ri, ci, opts) {
      opts = opts || {};
      const vf = visFields();
      const row = view[ri], f = vf[ci];
      if (!row || !f) return;
      openEditor(row, f, Object.assign({}, opts, { where: "grid", ri, ci }));
    }
    function editorValue(ed) {
      if (ed.prose) return { value: ed.input.value, dupes: [] };
      const kept = [];
      const keys = new Set();
      for (const t of ed.tokens) {
        if (t.removed) continue;
        const v = t.input.value.trim();
        if (!v) continue;
        const k = tokenKey(v);
        if (keys.has(k)) continue;
        keys.add(k);
        kept.push(v);
      }
      const dupes = [];
      for (const inp of ed.newInputs) {
        const v = inp.value.trim();
        if (!v) continue;
        const k = tokenKey(v);
        if (keys.has(k)) { dupes.push(v); continue; }
        keys.add(k);
        kept.push(v);
      }
      const unchanged = kept.join(ed.delim) === splitTokens(ed.orig, ed.delim).filter((v) => !isZeroish(v)).join(ed.delim);
      return { value: unchanged ? ed.orig : kept.join(ed.delim), dupes };
    }
    //##> TYPED EDITS: When a user saves an edit in a Date, Currency, or Number column, new values are put into
    //##> the column's format (04/30/26 becomes 4/30/2026). A new value that can't be read as that type gets a
    //##> popup: Keep It, Remove It, or Edit Again, with a box to allow values like that in the column for the
    //##> rest of the session (S.formatAllow). Values that were already in the cell are never questioned.
    function normalizeEdit(ed, value) {
      if (ed.prose || !ed.field.startsWith("j:")) return { value, bad: [] };
      const c = colById(ed.field.slice(2));
      const t = effType(c);
      if (!FORMATS[t]) return { value, bad: [] };
      const style = colFormat(c);
      const before = new Set(splitTokens(ed.orig, ed.delim).map(tokenKey));
      const out = [];
      const bad = [];
      for (const tok of splitTokens(value, ed.delim)) {
        if (isZeroish(tok) || before.has(tokenKey(tok))) { out.push(tok); continue; }
        const f = formatValue(t, style, tok);
        if (f === null) { bad.push(tok); out.push(tok); }
        else out.push(f);
      }
      const joined = dedupeTokens(out).join(ed.delim);
      return { value: joined === splitTokens(ed.orig, ed.delim).join(ed.delim) ? ed.orig : joined, bad, type: t };
    }
    function reopenEditor(ed) {
      const row = rows.find((r) => r.id === ed.rowId);
      if (!row) return;
      if (ed.where === "strip" && tsActive && stripRowId === ed.rowId) {
        openEditor(row, ed.field, { where: "strip", tagId: ed.tagId });
        return;
      }
      const ri = view.findIndex((r) => r.id === ed.rowId);
      const ci = visFields().indexOf(ed.field);
      if (ri >= 0 && ci >= 0) startEdit(ri, ci, { tagId: ed.tagId });
    }
    async function askBadValues(ed, norm) {
      const list = norm.bad.map((b) => `"${b}"`).join(", ");
      const typeName = TYPE_LABELS[norm.type] || norm.type;
      const r = await dialog({
        title: "Value doesn't match this column",
        danger: true,
        message: `Cannot enter ${list} into a [${typeName}] field type.\n\n${baseHeader(ed.field)} is set up as ${typeName}. You can keep it anyway, take it out, or go back and fix it.`,
        checkbox: `Allow values like this in ${baseHeader(ed.field)} for the rest of this session`,
        buttons: [{ label: "Edit Again", value: "edit", primary: true }, { label: "Keep It", value: "keep" }, { label: "Remove It", value: "remove" }]
      });
      if (r.checked) { S.formatAllow[ed.field] = true; scheduleSave(); }
      if (r.value === "remove") {
        const badKeys = new Set(norm.bad.map(tokenKey));
        const kept = splitTokens(norm.value, ed.delim).filter((x) => !badKeys.has(tokenKey(x)));
        applyEdit(ed.rowId, ed.field, kept.join(ed.delim));
        tsCache = null;
        renderRows();
        if (tsActive) renderStrip();
        return "go";
      }
      return r.value === "keep" ? "go" : "edit";
    }
    //##> SAVE CHECKS: After an edit is saved, the cell is checked against its column's checks. If anything
    //##> fails, a popup lists the problems right away with Edit Again, Keep It, or Ignore. Timestamp tags
    //##> aren't marked complete until it's answered.
    async function askIssues(ed) {
      if (!S.settings.showFlags) return "go";
      const row = rows.find((r) => r.id === ed.rowId);
      if (!row) return "go";
      issueCache = null;
      const iss = cellIssues(row, ed.field);
      if (!iss.length) return "go";
      const r = await dialog({
        title: `Possible issue in ${baseHeader(ed.field)}`,
        danger: true,
        message: iss.map((i) => "\u26A0 " + i.message).join("\n"),
        buttons: [{ label: "Edit Again", value: "edit", primary: true }, { label: "Keep It", value: "keep", title: "Keep the value. The cell stays flagged." }, { label: "Ignore", value: "ignore", title: "Keep the value and stop flagging these problems in this cell." }]
      });
      if (r.value === "ignore") {
        for (const i of iss) S.issueIgnore.items[i.key] = true;
        scheduleSave();
        invalidateIssues();
        renderRows();
        if (tsActive) renderStrip();
      }
      return r.value === "edit" ? "edit" : "go";
    }
    function commitEdit(after) {
      if (!editing) return false;
      const ed = editing;
      editing = null;
      closeEditorPanel(ed);
      const ev = editorValue(ed);
      const norm = normalizeEdit(ed, ev.value);
      const changed = applyEdit(ed.rowId, ed.field, norm.value);
      renderRows();
      if (ed.where === "strip") { stripExpanded = false; renderStrip(); }
      const needBad = norm.bad.length && !S.formatAllow[ed.field];
      if (!needBad && !ev.dupes.length && !changed) {
        if (after) after();
        return changed;
      }
      (async () => {
        if (needBad && (await askBadValues(ed, norm)) === "edit") { if (!closed) reopenEditor(ed); return; }
        if (closed) return;
        if (ev.dupes.length) {
          await dialog({ title: "Already in this field", message: `${ev.dupes.length === 1 ? `"${ev.dupes[0]}" is` : ev.dupes.map((d) => `"${d}"`).join(", ") + " are"} already in ${baseHeader(ed.field)}, so ${ev.dupes.length === 1 ? "it wasn't" : "they weren't"} added again.` });
        }
        if (closed) return;
        if (changed && !review && (await askIssues(ed)) === "edit") { if (!closed) reopenEditor(ed); return; }
        if (!closed && after) after();
      })();
      return changed;
    }
    function cancelEdit() {
      if (!editing) return;
      const ed = editing;
      editing = null;
      closeEditorPanel(ed);
      renderRows();
      if (ed.where === "strip") renderStrip();
    }
    function moveEdit(dr, dc) {
      if (!editing) return;
      const { ri, ci } = editing;
      const nr = ri + dr, nc = ci + dc;
      commitEdit(() => {
        if (nr < 0 || nr >= view.length || nc < 0 || nc >= visFields().length) return;
        startEdit(nr, nc);
      });
    }
    function finishEditor(dir) {
      if (!editing) return;
      if (editing.tagId) { finishTagEdit(); return; }
      if (editing.where === "grid") {
        if (dir === "down") moveEdit(1, 0);
        else if (dir === "up") moveEdit(-1, 0);
        else if (dir === "right") moveEdit(0, 1);
        else if (dir === "left") moveEdit(0, -1);
        else commitEdit();
        return;
      }
      commitEdit();
    }
    function finishTagEdit() {
      if (!editing) return;
      const tagId = editing.tagId;
      commitEdit(() => { if (playerCtrl && tagId) playerCtrl.completeTag(tagId, { delay: COMPLETE_DELAY_MS }); });
    }
    document.addEventListener("mousedown", onOutsideEdit, true);
    function onOutsideEdit(e) {
      const t = e.target;
      const inDialog = t && t.closest && t.closest("[data-nx-dialog]");
      if (stripExpanded && stripBox && !stripBox.contains(t) && !inDialog && !(editing && editing.panel && editing.panel.contains(t))) {
        stripExpanded = false;
        setTimeout(renderStrip, 0);
      }
      if (!editing) return;
      if (editing.panel && editing.panel.contains(t)) return;
      if (inDialog) return;
      if (stripBox && stripBox.contains(t)) return;
      if (editing.tagId && playerCtrl && playerCtrl.els && playerCtrl.els.pane.contains(t)) {
        const keep = editing.panel;
        setTimeout(() => {
          if (editing && editing.panel === keep && keep.isConnected && !keep.contains(document.activeElement)) {
            const target = editing.newInputs && editing.newInputs.length ? editing.newInputs[editing.newInputs.length - 1] : editing.input;
            if (target) target.focus();
          }
        }, 0);
        return;
      }
      const wasTag = editing.tagId;
      commitEdit();
      if (wasTag && playerCtrl) playerCtrl.resumeFromEdit();
    }
    window.addEventListener("resize", onWinResize, { passive: true });
    function onWinResize() {
      positionEditor();
      if (tsActive && playerCtrl && !playerCtrl.isMinimized()) {
        const max = availPlayerHeight();
        if (playerCtrl.els.pane.offsetHeight > max) playerCtrl.setHeight(max + "px");
      }
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
        if (merged) { logEvent("merge", `Merged ${plural(merged, "column")}`); toast(`${merged} column${merged === 1 ? "" : "s"} merged`, "#0369a1"); }
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
    const selCountEl = el("div", { style: "font-size:12px;color:#2563eb;font-weight:600;flex-shrink:0;display:none;" });
    const cellSelCountEl = el("div", { style: "font-size:12px;color:#16a34a;font-weight:600;flex-shrink:0;display:none;" });
    const removeSelectedBtn = el("button", { style: btnStyle("#ef4444", "display:none;") }, "Remove Selected");
    const settingsBtn = el("button", { style: btnStyle("#0ea5e9", "color:#0369a1;") }, "\u2699 Unpack Settings");
    const metaBtn = el("button", { style: btnStyle("#8b5cf6", "color:#7c3aed;") }, "Add Nexidia Metadata");
    const mergeBtn = el("button", { style: btnStyle("#0369a1"), title: "Combine columns that hold the same information, like a CoPilot Member_Id column and the Nexidia Member ID column." }, "Merge Columns");
    const columnsBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #d1d5db;background:#f9fafb;cursor:pointer;font-size:14px;flex-shrink:0;", title: "Show / Hide Columns" }, "\u2630");
    const adHocBtn = el("button", { style: btnStyle("#6366f1") }, "+ Add Column");
    const importSheetBtn = el("button", { style: btnStyle("#0f766e") }, "Import Spreadsheet");
    const addKeysBtn = el("button", { type: "button", style: btnStyle("#0f766e"), title: "Add calls to the grid by pasting their primary keys." }, "+ Add Trans_Ids");
    const logBtn = el("button", { type: "button", style: btnStyle("#475569", "color:#334155;"), title: "Show the session log: pastes, lookups, edits, and exports." }, "Log");
    const exportTranscriptsBtn = el("button", { style: btnStyle("#6366f1", "color:#4f46e5;") }, "Export Transcripts");
    const saveSessionBtn = el("button", { style: btnStyle("#f59e0b", "color:#b45309;"), title: "Save a hard copy of this session so you can come back later and continue your work." }, "Save Session");
    const loadSessionBtn = el("button", { style: btnStyle("#f59e0b", "color:#b45309;"), title: "Load a saved copy from a previous session." }, "Load Session");
    const resetBtn = el("button", { style: btnStyle("#9ca3af", "color:#374151;") }, "Reset View");
    const clickModeBtn = el("button", { style: btnStyle("#22c55e", "color:#16a34a;") }, "On Click: Select Field");
    const exportSlot = el("div", { style: "flex:1;min-width:170px;display:flex;justify-content:center;gap:10px;flex-wrap:wrap;" });
    const exportExcelBtn = el("button", { type: "button", style: "padding:8px 20px;border-radius:8px;border:0;background:#16a34a;color:#fff;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;box-shadow:0 2px 8px rgba(22,163,74,.35);", title: "Export the grid, the session log, or the raw outputs you pasted." }, "Export");
    const playTsBtn = el("button", { style: "display:none;padding:8px 16px;border-radius:8px;border:0;background:#ea580c;color:#fff;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;box-shadow:0 2px 8px rgba(234,88,12,.35);", title: "Play every call that has timestamps, one tag at a time." }, "\u25B6 Play All Timestamps");
    exportSlot.appendChild(playTsBtn);
    exportSlot.appendChild(exportExcelBtn);
    const globalSearchBox = el("input", { type: "text", placeholder: "Search all visible columns...", style: "width:220px;max-width:26vw;padding:6px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;" });
    const sheetInput = el("input", { type: "file", accept: ".xlsx,.xls,.xml,.csv,.tsv,.txt,.htm,.html", style: "display:none;" });
    const sessionInput = el("input", { type: "file", accept: ".txt,.json", style: "display:none;" });
    const issuesBtn = el("button", { style: btnStyle("#dc2626", "color:#b91c1c;display:none;"), title: "Step through cells that didn't pass their checks." }, "");
    const reviewBar = el("div", { style: "display:none;flex-direction:column;align-items:stretch;gap:2px;padding:6px 12px;max-height:40%;overflow-y:auto;flex-shrink:0;background:#fef2f2;border-bottom:1px solid #fecaca;" });
    [titleEl, menuBtn, rowCountEl, issuesBtn, selCountEl, cellSelCountEl, removeSelectedBtn, settingsBtn, metaBtn, mergeBtn, columnsBtn, adHocBtn, importSheetBtn, addKeysBtn, exportTranscriptsBtn, saveSessionBtn, loadSessionBtn, resetBtn, clickModeBtn, logBtn, exportSlot, globalSearchBox, sheetInput, sessionInput].forEach((n) => toolbar.appendChild(n));
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
    gridWrap.appendChild(reviewBar);
    gridWrap.appendChild(tableWrap);
    const logPanel = el("div", { style: "width:320px;max-width:40vw;border-left:1px solid #e5e7eb;display:none;flex-direction:column;flex-shrink:0;min-height:0;background:#fcfcfd;" });
    const logHead = el("div", { style: "display:flex;align-items:center;gap:6px;padding:10px 12px 6px;" });
    logHead.appendChild(el("div", { style: "flex:1;font-size:13px;font-weight:700;color:#111827;" }, "Session Log"));
    const logExportBtn = el("button", { type: "button", style: btnStyle("#16a34a", "padding:3px 9px;font-size:11px;") }, "Export");
    const logCloseBtn = el("button", { type: "button", style: btnStyle("#9ca3af", "padding:3px 8px;font-size:11px;color:#374151;"), title: "Close the log" }, "\u2715");
    logHead.appendChild(logExportBtn);
    logHead.appendChild(logCloseBtn);
    const logStats = el("div", { style: "padding:4px 12px 10px;border-bottom:1px solid #e5e7eb;display:grid;grid-template-columns:1fr auto;gap:2px 10px;font-size:12px;color:#374151;" });
    const logList = el("div", { style: "flex:1;min-height:0;overflow-y:auto;padding:6px 0;" });
    logPanel.appendChild(logHead);
    logPanel.appendChild(logStats);
    logPanel.appendChild(logList);
    body.appendChild(colPanel);
    body.appendChild(gridWrap);
    body.appendChild(logPanel);
    card.appendChild(toolbar);
    card.appendChild(bannerWrap);
    card.appendChild(topPanel);
    card.appendChild(sortBar);
    card.appendChild(body);
    modal.appendChild(card);
    document.body.appendChild(modal);
    document.body.appendChild(stickyClose);
    const promptBtn = el("button", { style: btnStyle("#1d4ed8", "margin-top:6px;") }, "View PromptBuilder");
    //##> REPORT INSTRUCTIONS: A report can replace the Instructions steps and the prompt button with its own
    //##> (preset.instructions, preset.promptUrl, preset.promptLabel). Steps are numbered automatically.
    function promptInfo() {
      const p = S.preset || {};
      const url = p.promptUrl || PROMPT_URL;
      const label = p.promptLabel || "PromptBuilder";
      const file = (url.split("/").pop() || "Prompt.txt").split("?")[0];
      return { url, label, file };
    }
    function renderInstructions() {
      instrBody.innerHTML = "";
      const steps = S.preset && Array.isArray(S.preset.instructions) && S.preset.instructions.length ? S.preset.instructions : DEFAULT_STEPS;
      steps.forEach((t, i) => instrBody.appendChild(el("div", {}, `${i + 1}. ${t}`)));
      const pi = promptInfo();
      promptBtn.textContent = S.preset && S.preset.promptLabel ? pi.label : "View PromptBuilder";
      instrBody.appendChild(promptBtn);
    }
    renderInstructions();
    function setInstructions(open) {
      instrBody.style.display = open ? "block" : "none";
      instrHead.textContent = (open ? "\u25BE" : "\u25B8") + " Instructions";
    }
    instrHead.onclick = () => setInstructions(instrBody.style.display === "none");
    promptBtn.onclick = () => openPromptPanel();
    async function openPromptPanel() {
      document.querySelectorAll("[data-unpack-prompt]").forEach((p) => p.remove());
      const panel = el("div", { style: "position:fixed;top:70px;right:24px;width:480px;max-width:92vw;height:70vh;background:#fff;border:1px solid #d1d5db;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.3);z-index:1000010;display:flex;flex-direction:column;padding:14px;" + FONT });
      panel.dataset.unpackPrompt = "1";
      const head = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:8px;" });
      const pi = promptInfo();
      head.appendChild(el("div", { style: "font-size:14px;font-weight:700;color:#111827;flex:1;" }, pi.label));
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
        const res = await fetch(pi.url + (pi.url.includes("?") ? "&" : "?") + "v=" + Date.now(), { credentials: "omit", cache: "no-store" });
        if (!res.ok) throw new Error(res.status);
        text = await res.text();
        ta.value = text;
      } catch (_) {
        ta.value = `The ${pi.label} couldn't be loaded. Check your connection and try again.`;
      }
      copyBtn.onclick = () => {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => toast(pi.label + " copied")).catch(() => { ta.select(); document.execCommand("copy"); toast(pi.label + " copied"); });
      };
      dlBtn.onclick = () => { if (text) downloadText(pi.file, text); };
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
          processBlocks(blocks);
          ta.value = blocks[0].failedText || "";
          ta.focus();
        });
        ta.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && ta.value.trim()) {
            e.preventDefault();
            const blocks = [{ text: ta.value }];
            processBlocks(blocks);
            ta.value = blocks[0].failedText || "";
          }
        });
        inputWrap.appendChild(ta);
        setTimeout(() => { if (!tsActive) ta.focus(); }, 30);
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
        processBlocks(blocks);
        const kept = [];
        blocks.forEach((b) => {
          if (b.failedText) kept.push({ text: b.failedText, error: "This output couldn't be processed. Rerun it and paste again." });
        });
        S.pending = kept.concat([{ text: "", error: "" }]);
        renderInput();
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
    function showPlayCol() { return S.grid.clickMode !== "play"; }
    function frozenCount() { return showPlayCol() ? 3 : 2; }
    function frozenW() { return COL0_W + COL1_W + (showPlayCol() ? PLAY_COL_W : 0); }
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
      const sn = sortNumber(cell), sv = sortNumber(rule.value), sv2 = sortNumber(rule.value2);
      const numCell = sn === null ? NaN : sn, numVal = sv === null ? NaN : sv, numVal2 = sv2 === null ? NaN : sv2;
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
            const na = sortNumber(va), nb = sortNumber(vb);
            if (na !== null && nb !== null && na !== nb) return (na - nb) * dir;
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
      if (editing) commitEdit();
      derive();
      if (newDataPending) {
        newDataPending = false;
        checkEditConflicts();
      } else {
        syncEditBases();
      }
      recompute();
      renderSortBar();
      renderHeader();
      renderRows();
      rebuildColPanel();
      renderNotices();
      updateTsBtn();
      updateKeyButtons();
      if (logPanel.style.display !== "none") renderLog();
      syncPlayerView();
      invalidateIssues();
      scheduleSave();
    }
    function rerender() {
      if (editing) commitEdit();
      recompute();
      renderSortBar();
      renderHeader();
      renderRows();
      rebuildColPanel();
      updateTsBtn();
      syncPlayerView();
      invalidateIssues();
      scheduleSave();
    }
    function syncPlayerView() {
      if (!playerCtrl) return;
      if (tsActive) renderStrip();
      if (playerCtrl.refreshTags) playerCtrl.refreshTags();
    }
    function updateCounts() {
      rowCountEl.textContent = view.length.toLocaleString() + " of " + rows.length.toLocaleString() + " rows";
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
        cb.onchange = () => { if (editing) commitEdit(); setVis(f, cb.checked); if (tsTempShown === f) tsTempShown = null; renderHeader(); renderRows(); scheduleSave(); };
        const autoHid = S.tsAutoHidden[f] && !isVis(f);
        const labelEl = el("span", { style: `font-size:11px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;${hasFilter ? "color:#2563eb;font-weight:600;" : "color:#111827;"}`, title: autoHid ? "Hidden because every timestamp in it was worked. Check the box to bring it back." : groupLabel(f) }, headerOf(f) + (hasFilter ? " (filtered)" : "") + (autoHid ? " (all worked)" : ""));
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
        items.push({ label: "Checks...", run: () => openChecks(field) });
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
    //##> CHECKS: Columns can be checked for problems. Each column can flag duplicate values (compared across
    //##> the whole column, with stacked values counted separately) and can have rules (required, character
    //##> count, value range, contains, starts/ends with, one of a list, pattern, NPI, TIN). Rules come from the
    //##> user (Checks... in the column menu) or from a report's column setup, and every stacked value is checked
    //##> on its own. NPI and TIN rules turn on by themselves for columns with those names. Rules set on a column
    //##> keep working after it's merged into another. Zero placeholders count as blank. Flagged cells get a red
    //##> corner and a soft red fill. Export offers to step through them first (the review bar). Ignored items and
    //##> rules are kept in S.issueIgnore and saved with the session.
    let issueCache = null;
    let issueSyncTimer = null;
    let review = null;
    //##> REVIEW FLOW: With "Move to the next cell automatically" checked (the default, saved with the session),
    //##> finishing a card moves to the next open card after REVIEW_ADVANCE_MS, long enough to see the strikethrough.
    //##> Once nothing is left, the bar says so and the Done button closes it.
    const REVIEW_ADVANCE_MS = 700;
    function invalidateIssues() {
      issueCache = null;
      if (issueSyncTimer) return;
      issueSyncTimer = setTimeout(() => {
        issueSyncTimer = null;
        if (closed) return;
        updateIssuesBtn();
        if (review) syncReview();
      }, 0);
    }
    function ensureIssueCache() {
      if (!issueCache) issueCache = { cells: new Map(), dups: new Map(), rules: new Map() };
      return issueCache;
    }
    function groupNames(f) {
      const out = [];
      for (const m of membersOf(f)) {
        out.push(baseHeader(m));
        if (m.startsWith("j:")) {
          const c = colById(m.slice(2));
          if (c) out.push(c.source, ...c.aliases);
        } else if (m.startsWith("m:")) out.push(m.slice(2));
      }
      return out.map(normName).filter(Boolean);
    }
    function checkEntry(f) {
      if (!S.checks[f]) S.checks[f] = { unique: false, rules: [] };
      return S.checks[f];
    }
    function builtinsFor(f) {
      const names = groupNames(f);
      return Object.keys(BUILTIN_CHECKS).filter((k) => BUILTIN_CHECKS[k].names.some((n) => names.includes(n)));
    }
    function rulesFor(f) {
      const ic = ensureIssueCache();
      if (ic.rules.has(f)) return ic.rules.get(f);
      const out = [];
      for (const k of builtinsFor(f)) {
        const id = "b:" + k;
        if (!S.checkOff[f + "|" + id]) out.push({ id, type: k, builtin: true, source: "built-in" });
      }
      for (const m of membersOf(f)) {
        const ce = S.checks[m];
        if (ce && Array.isArray(ce.rules)) for (const r of ce.rules) out.push(r);
      }
      ic.rules.set(f, out);
      return out;
    }
    function isUnique(f) {
      return membersOf(f).some((m) => S.checks[m] && S.checks[m].unique);
    }
    //##> ONE VALUE ONLY: A column marked single (Attributes, or single: true from a report) holds one value.
    //##> The editor won't offer an extra line once a value is there, and a cell that still ends up with
    //##> stacked values (from a paste) is flagged.
    function isSingleField(f) {
      return membersOf(f).some((m) => m.startsWith("j:") && colById(m.slice(2)) && colById(m.slice(2)).single);
    }
    function hasChecks(f) {
      return f !== "__conf__" && (isUnique(f) || isSingleField(f) || rulesFor(f).length > 0);
    }
    function checkTokenBlank(f, t) {
      if (isEmptyValue(t) || /^0+$/.test(String(t).trim())) return true;
      if (f.startsWith("j:")) return isBlank(colById(f.slice(2)), t);
      return false;
    }
    function liveTokens(row, f) {
      const delim = delimFor(f);
      const out = [];
      for (const t of cellParts(row, f).tokens) {
        for (const v of splitTokens(t, delim)) if (!checkTokenBlank(f, v)) out.push(v);
      }
      return out;
    }
    function dupMap(f) {
      const ic = ensureIssueCache();
      if (ic.dups.has(f)) return ic.dups.get(f);
      const m = new Map();
      for (const r of rows) {
        for (const t of liveTokens(r, f)) {
          const k = tokenKey(t);
          if (!m.has(k)) m.set(k, []);
          const list = m.get(k);
          if (!list.includes(r.id)) list.push(r.id);
        }
      }
      ic.dups.set(f, m);
      return m;
    }
    function presetMessage(type) {
      const pm = S.preset && S.preset.checkMessages;
      return pm && pm[type] ? String(pm[type]) : "";
    }
    function fillMessage(msg, tok, header) {
      return String(msg).replace(/\{value\}/g, tok == null ? "" : tok).replace(/\{column\}/g, header);
    }
    function describeRule(r, header) {
      const a = r.a == null ? "" : String(r.a).trim(), b = r.b == null ? "" : String(r.b).trim();
      switch (r.type) {
        case "required": return `${header} shouldn't be blank.`;
        case "length":
          if (a && b && a === b) return `${header} should be exactly ${a} characters.`;
          if (a && b) return `${header} should be between ${a} and ${b} characters.`;
          if (a) return `${header} should be at least ${a} characters.`;
          return `${header} should be at most ${b} characters.`;
        case "range":
          if (a && b) return `${header} should be between ${a} and ${b}.`;
          if (a) return `${header} should be at least ${a}.`;
          return `${header} should be at most ${b}.`;
        case "contains": return `${header} should contain "${a}".`;
        case "notContains": return `${header} shouldn't contain "${a}".`;
        case "startsWith": return `${header} should start with "${a}".`;
        case "endsWith": return `${header} should end with "${a}".`;
        case "allowed": return `${header} should be one of: ${splitList(a).join(", ")}.`;
        case "pattern": return `${header} doesn't match the expected format.`;
        default: return BUILTIN_CHECKS[r.type] ? BUILTIN_CHECKS[r.type].message : `${header} has a problem.`;
      }
    }
    function splitList(s) {
      return String(s == null ? "" : s).split(/[;,\n]/).map((x) => x.trim()).filter(Boolean);
    }
    function ruleMessage(r, header, tok) {
      const custom = r.message || presetMessage(r.type);
      return fillMessage(custom || describeRule(r, header), tok, header);
    }
    function ruleFails(r, tok) {
      const t = String(tok).trim();
      const low = t.toLowerCase();
      const a = r.a == null ? "" : String(r.a).trim(), b = r.b == null ? "" : String(r.b).trim();
      switch (r.type) {
        case "length": {
          const n = t.length;
          if (a && n < Number(a)) return true;
          if (b && n > Number(b)) return true;
          return false;
        }
        case "range": {
          const v = sortNumber(t);
          if (v === null) return true;
          const lo = a ? sortNumber(a) : null, hi = b ? sortNumber(b) : null;
          if (lo !== null && v < lo) return true;
          if (hi !== null && v > hi) return true;
          return false;
        }
        case "contains": return !!a && !low.includes(a.toLowerCase());
        case "notContains": return !!a && low.includes(a.toLowerCase());
        case "startsWith": return !!a && !low.startsWith(a.toLowerCase());
        case "endsWith": return !!a && !low.endsWith(a.toLowerCase());
        case "allowed": {
          const list = splitList(a).map((x) => x.toLowerCase());
          return list.length > 0 && !list.includes(low);
        }
        case "pattern": {
          if (!a) return false;
          let re;
          try { re = new RegExp("^(?:" + a + ")$", "i"); } catch (_) { return false; }
          return !re.test(t);
        }
        default:
          if (BUILTIN_CHECKS[r.type]) return !BUILTIN_CHECKS[r.type].test(t);
          return false;
      }
    }
    function rowNumberText(ids) {
      const nums = ids.map((id) => view.findIndex((r) => r.id === id)).filter((i) => i >= 0).map((i) => i + 1).sort((x, y) => x - y);
      const hidden = ids.length - nums.length;
      const parts = [];
      if (nums.length) parts.push((nums.length === 1 ? "row " : "rows ") + (nums.length > 6 ? nums.slice(0, 6).join(", ") + ", and " + (nums.length - 6) + " more" : nums.join(", ")));
      if (hidden) parts.push(hidden === 1 ? "a row that's filtered out" : hidden + " rows that are filtered out");
      return parts.join(" and ");
    }
    function issueKey(rowId, f, ruleId, tok) {
      return rowId + "|" + f + "|" + ruleId + "|" + tokenKey(tok);
    }
    function cellIssues(row, f) {
      if (!row || !f || f === "__conf__") return [];
      const ic = ensureIssueCache();
      const ck = row.id + "|" + f;
      if (ic.cells.has(ck)) return ic.cells.get(ck);
      const out = [];
      if (hasChecks(f)) {
        const header = baseHeader(f);
        const live = liveTokens(row, f);
        if (live.length > 1 && isSingleField(f) && !S.issueIgnore.rules[f + "|single"]) {
          const custom = presetMessage("single");
          out.push({ key: issueKey(row.id, f, "single", live.join("|")), rowId: row.id, field: f, ruleId: "single", token: "", message: custom ? fillMessage(custom, live.join(", "), header) : `${header} should only have one value. It has ${live.length}: ${live.join(", ")}.` });
        }
        for (const r of rulesFor(f)) {
          if (S.issueIgnore.rules[f + "|" + r.id]) continue;
          if (r.type === "required") {
            if (!live.length) out.push({ key: issueKey(row.id, f, r.id, ""), rowId: row.id, field: f, ruleId: r.id, token: "", message: ruleMessage(r, header, "") });
            continue;
          }
          for (const t of live) if (ruleFails(r, t)) out.push({ key: issueKey(row.id, f, r.id, t), rowId: row.id, field: f, ruleId: r.id, token: t, message: ruleMessage(r, header, t) });
        }
        if (isUnique(f) && !S.issueIgnore.rules[f + "|dup"]) {
          const m = dupMap(f);
          for (const t of live) {
            const ids = m.get(tokenKey(t)) || [];
            if (ids.length < 2) continue;
            const others = ids.filter((id) => id !== row.id);
            const custom = presetMessage("duplicate");
            const msg = custom ? fillMessage(custom, t, header) : `"${t}" is a duplicate. It also appears in ${rowNumberText(others)}.`;
            out.push({ key: issueKey(row.id, f, "dup", t), rowId: row.id, field: f, ruleId: "dup", token: t, message: msg });
          }
        }
      }
      const kept = out.filter((i) => !S.issueIgnore.items[i.key]);
      ic.cells.set(ck, kept);
      return kept;
    }
    function computeIssues(list, fields) {
      const out = [];
      const fs = fields.filter(hasChecks);
      if (!fs.length) return out;
      for (const row of list) for (const f of fs) for (const i of cellIssues(row, f)) out.push(i);
      return out;
    }
    function exportFields() {
      return visFields().filter((f) => !(tsTempShown && f === tsTempShown));
    }
    function flagMarker(iss) {
      const hit = el("span", { style: "position:absolute;bottom:0;left:0;width:12px;height:12px;z-index:2;cursor:help;", title: iss.map((i) => i.message).join("\n") });
      hit.appendChild(el("span", { style: "position:absolute;bottom:0;left:0;width:0;height:0;border-bottom:8px solid #dc2626;border-right:8px solid transparent;" }));
      return hit;
    }
    function updateIssuesBtn() {
      if (!S.settings.showFlags) { issuesBtn.style.display = "none"; return; }
      const n = computeIssues(view, exportFields()).length;
      issuesBtn.style.display = n ? "" : "none";
      issuesBtn.textContent = `\u26A0 ${n.toLocaleString()} possible issue${n === 1 ? "" : "s"}`;
    }
    //##> REVIEW CARDS: The review works like Excel's Find, one card per flagged cell. Each flagged value in the
    //##> cell is its own line with its own actions, and every action only touches that one value. The one
    //##> exception is Ignore Rule, which covers the whole column, so the card's other lines for that rule show as
    //##> Ignored (rule). Flags are rechecked after every action. A card that's finished stays on screen showing
    //##> what happened to each line until the user moves on. Finished means nothing in the cell needs attention.
    function openReview(list, exportList, exportFormat) {
      if (editing) commitEdit();
      if (tsActive) exitTimestamps(true);
      review = { ids: new Set(list.map((r) => r.id)), exportList: exportList || null, exportFormat: exportFormat || "xlsx", order: [], pos: 0, cards: new Map(), seen: new Map(), status: {}, done: new Set(), current: null };
      reviewBar.style.display = "flex";
      syncReview(true);
    }
    function closeReview() {
      review = null;
      reviewBar.style.display = "none";
      reviewBar.innerHTML = "";
      renderRows();
    }
    function reviewRows() {
      return view.filter((r) => review.ids.has(r.id));
    }
    function syncReview(jump) {
      if (!review) return;
      const fresh = computeIssues(reviewRows(), exportFields());
      const cards = new Map();
      for (const i of fresh) {
        const k = i.rowId + "|" + i.field;
        if (!cards.has(k)) cards.set(k, { key: k, rowId: i.rowId, field: i.field, issues: [] });
        cards.get(k).issues.push(i);
      }
      const curKey = review.order[review.pos];
      const wasOpen = !!(curKey && review.cards.has(curKey));
      for (const k of review.order) if (!cards.has(k)) review.done.add(k);
      const order = review.order.filter((k) => cards.has(k) || k === curKey);
      for (const k of cards.keys()) {
        review.done.delete(k);
        if (!order.includes(k)) order.push(k);
      }
      review.order = order;
      review.cards = cards;
      if (curKey && order.includes(curKey)) review.pos = order.indexOf(curKey);
      if (review.pos >= order.length) review.pos = 0;
      rememberCard(order[review.pos]);
      renderReview();
      if (jump || review.current !== order[review.pos]) goToIssue();
      if (wasOpen && curKey && !cards.has(curKey) && cards.size && S.settings.reviewAutoNext !== false) {
        setTimeout(() => {
          if (!review || editing || review.order[review.pos] !== curKey || review.cards.has(curKey)) return;
          nextOpenCard();
        }, REVIEW_ADVANCE_MS);
      }
    }
    function nextOpenCard() {
      if (!review || !review.cards.size) return;
      const n = review.order.length;
      for (let step = 1; step <= n; step++) {
        const k = review.order[(review.pos + step) % n];
        if (review.cards.has(k)) {
          review.order = review.order.filter((x) => x === k || review.cards.has(x));
          review.pos = Math.max(0, review.order.indexOf(k));
          rememberCard(k);
          goToIssue();
          return;
        }
      }
    }
    function finishReview() {
      const n = review ? review.done.size : 0;
      closeReview();
      if (n) toast(`Review finished: ${plural(n, "cell")} addressed`);
    }
    function rememberCard(key) {
      if (!key) return;
      const card = review.cards.get(key);
      if (!review.seen.has(key)) review.seen.set(key, new Map());
      const seen = review.seen.get(key);
      if (card) for (const i of card.issues) seen.set(i.key, i);
    }
    function moveReview(delta) {
      if (!review || !review.order.length) return;
      const n = review.order.length;
      const target = review.order[(review.pos + delta + n) % n];
      review.order = review.order.filter((k) => k === target || review.cards.has(k));
      review.pos = Math.max(0, review.order.indexOf(target));
      rememberCard(target);
      goToIssue();
    }
    function skipCard() {
      if (!review || review.order.length < 2) return;
      const k = review.order.splice(review.pos, 1)[0];
      review.order = review.order.filter((x) => review.cards.has(x));
      if (review.cards.has(k)) review.order.push(k);
      if (review.pos >= review.order.length) review.pos = 0;
      rememberCard(review.order[review.pos]);
      goToIssue();
    }
    function goToIssue() {
      if (!review) return;
      const key = review.order[review.pos];
      review.current = key || null;
      const card = key ? (review.cards.get(key) || cardFromKey(key)) : null;
      if (card) {
        const ri = view.findIndex((r) => r.id === card.rowId);
        const ci = visFields().indexOf(card.field);
        if (ri >= 0 && ci >= 0) scrollCellIntoView(ri, ci, true);
      }
      renderRows();
      renderReview();
    }
    function cardFromKey(key) {
      const i = key.indexOf("|");
      return { key, rowId: key.slice(0, i), field: key.slice(i + 1), issues: [] };
    }
    function editCard(card) {
      const ri = view.findIndex((r) => r.id === card.rowId);
      const ci = visFields().indexOf(card.field);
      if (ri < 0 || ci < 0) return;
      startEdit(ri, ci);
    }
    //##> REMOVE VALUE: Takes one value out of a cell as a normal edit, so it can be reverted. If it was the only
    //##> value, the cell goes blank, which shows as 0 for Nexidia columns and empty for CoPilot columns.
    function removeCellValue(rowId, f, token) {
      const row = rows.find((r) => r.id === rowId);
      if (!row) return false;
      const delim = delimFor(f);
      const k = tokenKey(token);
      const kept = [];
      for (const t of cellParts(row, f).tokens) for (const v of splitTokens(t, delim)) if (tokenKey(v) !== k) kept.push(v);
      let value = dedupeTokens(kept).join(delim);
      if (!value && f.startsWith("m:") && row.meta) value = "0";
      return applyEdit(rowId, f, value);
    }
    function issueAction(card, iss, kind) {
      if (kind === "remove") {
        if (removeCellValue(iss.rowId, iss.field, iss.token)) review.status[iss.key] = "Removed";
        renderRows();
        return;
      }
      if (kind === "ignore") {
        S.issueIgnore.items[iss.key] = true;
        review.status[iss.key] = "Ignored";
        logEvent("ignore", `Ignored a flag in ${baseHeader(iss.field)}${iss.token ? ` ("${iss.token}")` : ""}`, { keys: [keyForRowId(iss.rowId)] });
      } else if (kind === "rule") {
        S.issueIgnore.rules[iss.field + "|" + iss.ruleId] = true;
        const seen = review.seen.get(card.key);
        if (seen) for (const x of seen.values()) if (x.ruleId === iss.ruleId && !review.status[x.key]) review.status[x.key] = "Ignored (rule)";
        review.status[iss.key] = "Ignored (rule)";
        logEvent("ignore", `Ignored a rule in ${baseHeader(iss.field)} for this session`, { keys: [keyForRowId(iss.rowId)] });
      }
      scheduleSave();
      invalidateIssues();
      renderRows();
    }
    function renderReview() {
      if (!review) return;
      reviewBar.innerHTML = "";
      const b = (t, tip, fn, primary) => {
        const x = el("button", { type: "button", title: tip || "", style: primary ? "padding:4px 10px;border-radius:6px;border:0;background:#dc2626;color:#fff;font-size:12px;font-weight:600;cursor:pointer;flex-shrink:0;" : "padding:4px 10px;border-radius:6px;border:1px solid #fca5a5;background:#fff;color:#b91c1c;font-size:12px;cursor:pointer;flex-shrink:0;" }, t);
        x.addEventListener("mousedown", (e) => e.preventDefault());
        x.onclick = fn;
        return x;
      };
      const exportNow = () => { const l = review.exportList, f = review.exportFormat; closeReview(); doGridExport(l, f); };
      const doneBtn = (primary) => {
        const x = b("\u2713 Done", "Close the review. Everything flagged has been addressed.", finishReview, primary);
        if (primary) setTimeout(() => { if (x.isConnected) x.focus(); }, 30);
        return x;
      };
      const top = el("div", { style: "display:flex;align-items:center;gap:6px;flex-wrap:wrap;" });
      reviewBar.appendChild(top);
      if (!review.cards.size && !review.order.length) {
        top.appendChild(el("div", { style: "flex:1;font-size:12px;font-weight:700;color:#15803d;" }, `\u2713 All flagged items are addressed.${review.done.size ? ` ${plural(review.done.size, "cell")} finished.` : ""}`));
        if (review.exportList) top.appendChild(b("Export", "Export now", exportNow, true));
        top.appendChild(doneBtn(!review.exportList));
        return;
      }
      const key = review.order[review.pos];
      const card = review.cards.get(key) || cardFromKey(key);
      const finished = !review.cards.has(key);
      const ri = view.findIndex((r) => r.id === card.rowId);
      const openCount = review.cards.size;
      const total = openCount + review.done.size;
      const info = el("div", { style: "flex:1;min-width:0;font-size:12px;color:#991b1b;font-weight:700;" }, `Cell ${review.pos + 1} of ${review.order.length} \u00B7 ${review.done.size.toLocaleString()} of ${total.toLocaleString()} finished \u00B7 Row ${ri >= 0 ? ri + 1 : "?"} \u00B7 ${baseHeader(card.field)}`);
      info.setAttribute("aria-live", "polite");
      top.appendChild(b("\u25C0", "Previous cell (Ctrl+\u2190)", () => moveReview(-1)));
      top.appendChild(b("\u25B6", "Next cell (Ctrl+\u2192)", () => moveReview(1)));
      top.appendChild(info);
      top.appendChild(b("Edit Cell", "Open this cell to change its values. Flags clear once the values pass.", () => editCard(card), !finished));
      if (!finished && review.order.length > 1) top.appendChild(b("Skip", "Come back to this cell after the others.", skipCard));
      if (finished && openCount) top.appendChild(b("Next Cell \u25B6", "Move on to the next flagged cell.", () => moveReview(1), true));
      if (review.exportList) top.appendChild(b(openCount ? "Export Anyway" : "Export", openCount ? "Export now without fixing the rest. Flags aren't included in the export." : "Export now", exportNow, !openCount));
      if (openCount) {
        const autoId = "nxAutoNext" + Date.now();
        const auto = el("input", { type: "checkbox", id: autoId, checked: S.settings.reviewAutoNext !== false });
        auto.onchange = () => { S.settings.reviewAutoNext = auto.checked; scheduleSave(); };
        top.appendChild(el("label", { htmlFor: autoId, style: "display:flex;align-items:center;gap:4px;font-size:11px;color:#991b1b;cursor:pointer;flex-shrink:0;", title: "After a cell is finished, move to the next flagged cell on its own." }, auto, "Move to the next cell automatically"));
        top.appendChild(b("\u2715", "Close the review", closeReview));
      } else top.appendChild(doneBtn(!review.exportList));
      const list = el("div", { style: "display:flex;flex-direction:column;gap:3px;margin-top:5px;" });
      const seen = review.seen.get(key) || new Map();
      const openKeys = new Set(card.issues.map((i) => i.key));
      for (const i of card.issues) if (!seen.has(i.key)) seen.set(i.key, i);
      for (const iss of seen.values()) {
        const open = openKeys.has(iss.key);
        const line = el("div", { style: `display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;background:${open ? "#fff" : "#f0fdf4"};border:1px solid ${open ? "#fecaca" : "#bbf7d0"};flex-wrap:wrap;` });
        const txt = el("div", { style: `flex:1;min-width:180px;font-size:12px;color:${open ? "#111827" : "#6b7280"};${open ? "" : "text-decoration:line-through;"}`, title: iss.message }, (iss.token ? `"${iss.token}": ` : "") + iss.message);
        line.appendChild(txt);
        if (open) {
          if (iss.token) line.appendChild(b("Remove Value", `Take "${iss.token}" out of this cell. Other values in the cell stay.`, () => issueAction(card, iss, "remove")));
          line.appendChild(b("Ignore", "Stop flagging this value in this cell.", () => issueAction(card, iss, "ignore")));
          line.appendChild(b("Ignore Rule", `Stop flagging this rule anywhere in ${baseHeader(iss.field)} for this session.`, () => issueAction(card, iss, "rule")));
        } else {
          line.appendChild(el("span", { style: "font-size:11px;font-weight:700;color:#15803d;flex-shrink:0;" }, "\u2713 " + (review.status[iss.key] || "Fixed")));
        }
        list.appendChild(line);
      }
      if (finished) list.appendChild(el("div", { style: "font-size:12px;font-weight:700;color:#15803d;padding:2px 2px 0;" }, openCount ? "\u2713 This cell is finished." : "\u2713 This was the last flagged cell. All flagged items are addressed. Click Done to close the review."));
      reviewBar.appendChild(list);
    }
    function reviewCellKey() {
      if (!review || !review.current) return null;
      return review.current;
    }
    function openChecks(f) {
      if (!f || f === "__conf__") return;
      const header = baseHeader(f);
      const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000016;display:flex;align-items:center;justify-content:center;" + FONT });
      overlay.dataset.nxDialog = "1";
      const box = el("div", { style: "background:#fff;width:560px;max-width:95vw;max-height:88vh;overflow-y:auto;border-radius:12px;padding:20px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      const section = (t) => el("div", { style: "font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:.05em;margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid #e5e7eb;" }, t);
      const changed = () => { issueCache = null; scheduleSave(); };
      function render() {
        box.innerHTML = "";
        box.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#111827;" }, "Checks: " + header));
        box.appendChild(el("div", { style: "font-size:12px;color:#6b7280;margin-top:3px;" }, "Cells that don't pass get a red corner. You'll be offered a review of them before exporting. Stacked values are checked one at a time, and 0 counts as blank."));
        box.appendChild(section("Duplicates"));
        const uq = el("input", { type: "checkbox", checked: isUnique(f) });
        uq.onchange = () => {
          if (uq.checked) checkEntry(f).unique = true;
          else for (const m of membersOf(f)) if (S.checks[m]) S.checks[m].unique = false;
          changed();
        };
        box.appendChild(el("label", { style: "display:flex;align-items:center;gap:8px;font-size:13px;color:#111827;cursor:pointer;" }, uq, "Flag values that appear in more than one row"));
        const bis = builtinsFor(f);
        if (bis.length) {
          box.appendChild(section("Standard Checks"));
          for (const k of bis) {
            const id = "b:" + k;
            const cb = el("input", { type: "checkbox", checked: !S.checkOff[f + "|" + id] });
            cb.onchange = () => { if (cb.checked) delete S.checkOff[f + "|" + id]; else S.checkOff[f + "|" + id] = true; changed(); };
            box.appendChild(el("label", { style: "display:flex;align-items:center;gap:8px;font-size:13px;color:#111827;cursor:pointer;margin:4px 0;", title: "Turned on because this column is named " + header + "." }, cb, BUILTIN_CHECKS[k].label));
          }
        }
        box.appendChild(section("Rules"));
        const own = [];
        for (const m of membersOf(f)) {
          const ce = S.checks[m];
          if (ce && Array.isArray(ce.rules)) ce.rules.forEach((r) => own.push({ m, r }));
        }
        if (!own.length) box.appendChild(el("div", { style: "font-size:12px;color:#9ca3af;" }, "No rules yet."));
        for (const { m, r } of own) {
          const row = el("div", { style: "display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:5px;" });
          const txt = el("div", { style: "flex:1;min-width:0;" });
          txt.appendChild(el("div", { style: "font-size:12px;color:#111827;font-weight:600;" }, (CHECK_TYPES.find(([v]) => v === r.type) || [0, r.type])[1] + (r.a ? `: ${r.a}` : "") + (r.b ? ` to ${r.b}` : "")));
          txt.appendChild(el("div", { style: "font-size:11px;color:#6b7280;" }, ruleMessage(r, header, "")));
          const tag = el("span", { style: `font-size:10px;font-weight:700;padding:2px 6px;border-radius:999px;flex-shrink:0;${r.source === "report" ? "background:#ede9fe;color:#6d28d9;" : "background:#dcfce7;color:#15803d;"}` }, r.source === "report" ? "Report" : "You");
          const x = el("button", { type: "button", title: "Remove this rule", style: "border:0;background:transparent;color:#9ca3af;font-size:15px;cursor:pointer;" }, "\u00D7");
          x.onclick = () => { S.checks[m].rules = S.checks[m].rules.filter((y) => y !== r); changed(); render(); };
          row.append(txt, tag, x);
          box.appendChild(row);
        }
        box.appendChild(section("Add a Rule"));
        const form = el("div", { style: "display:flex;flex-direction:column;gap:6px;" });
        const typeSel = el("select", { style: "padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;" });
        for (const [v, l] of CHECK_TYPES) if (v !== "pattern") typeSel.appendChild(el("option", { value: v }, l));
        const inA = el("input", { type: "text", style: "flex:1;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;" });
        const inB = el("input", { type: "text", style: "flex:1;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;" });
        const inRow = el("div", { style: "display:flex;gap:6px;" }, inA, inB);
        const msgIn = el("input", { type: "text", placeholder: "Message to show (optional). Use {value} to include the value.", style: "padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;" });
        const err = el("div", { style: "font-size:11px;color:#b91c1c;min-height:14px;" });
        const syncForm = () => {
          const t = typeSel.value;
          const two = t === "length" || t === "range";
          const none = t === "required" || BUILTIN_CHECKS[t];
          inRow.style.display = none ? "none" : "flex";
          inB.style.display = two ? "" : "none";
          inA.placeholder = t === "length" ? "Min characters" : t === "range" ? "Min value" : t === "allowed" ? "Allowed values, separated by ; or ," : "Text";
          inB.placeholder = t === "length" ? "Max characters" : "Max value";
          err.textContent = "";
        };
        typeSel.onchange = syncForm;
        syncForm();
        const addB = el("button", { type: "button", style: "align-self:flex-start;" + PRIMARY_BTN }, "Add Rule");
        addB.onclick = () => {
          const t = typeSel.value;
          const a = inA.value.trim(), b = inB.value.trim();
          if ((t === "length" || t === "range") && !a && !b) { err.textContent = "Enter a minimum, a maximum, or both."; return; }
          if (t === "length" && ((a && !/^\d+$/.test(a)) || (b && !/^\d+$/.test(b)))) { err.textContent = "Character counts have to be whole numbers."; return; }
          if (t === "range" && ((a && sortNumber(a) === null) || (b && sortNumber(b) === null))) { err.textContent = "Use numbers, amounts, or dates for the range."; return; }
          if (!(t === "required" || BUILTIN_CHECKS[t] || t === "length" || t === "range") && !a) { err.textContent = "Enter the text to check for."; return; }
          checkEntry(f).rules.push({ id: "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type: t, a, b, message: msgIn.value.trim(), source: "user" });
          changed();
          render();
        };
        form.append(typeSel, inRow, msgIn, err, addB);
        box.appendChild(form);
        const done = el("button", { style: "width:100%;margin-top:16px;" + PLAIN_BTN }, "Done");
        done.onclick = () => { overlay.remove(); refreshAll(); };
        box.appendChild(done);
      }
      render();
    }
    function openAttributes(c, x, y) {
      if (!c) return;
      const pop = popover(null, 260, x, y);
      pop.appendChild(el("div", { style: "font-size:12px;font-weight:700;color:#111827;margin-bottom:8px;" }, "Attributes: " + c.header));
      pop.appendChild(el("div", { style: "font-size:11px;color:#6b7280;margin-bottom:4px;" }, "Type"));
      const sel = el("select", { style: "width:100%;padding:5px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;margin-bottom:10px;box-sizing:border-box;" });
      for (const [v, l] of TYPES) sel.appendChild(el("option", { value: v }, v === "auto" ? `${l} (${TYPE_LABELS[c.detected] || c.detected})` : l));
      sel.value = c.type;
      sel.onchange = () => { c.type = sel.value; refreshAll(); openAttributes(c, x, y); };
      pop.appendChild(sel);
      const t = effType(c);
      if (FORMATS[t]) {
        const fmtLabel = (f) => { const hit = FORMATS[t].find(([k]) => k === f); return hit ? `${hit[0]} (${hit[1]})` : f; };
        pop.appendChild(el("div", { style: "font-size:11px;color:#6b7280;margin-bottom:4px;" }, "Format"));
        const fs = el("select", { style: "width:100%;padding:5px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;margin-bottom:4px;box-sizing:border-box;" });
        fs.appendChild(el("option", { value: "" }, `Auto (${c.learned ? fmtLabel(c.learned) : "no pattern yet"})`));
        for (const [f] of FORMATS[t]) fs.appendChild(el("option", { value: f }, fmtLabel(f)));
        fs.appendChild(el("option", { value: "none" }, "Leave as entered"));
        fs.value = c.format && (c.format === "none" || FORMATS[t].some(([f]) => f === c.format)) ? c.format : "";
        fs.onchange = () => { c.format = fs.value; refreshAll(); };
        pop.appendChild(fs);
        pop.appendChild(el("div", { style: "font-size:10px;color:#9ca3af;margin-bottom:10px;line-height:1.4;" }, "Values are shown and exported in this format. The original values are kept underneath, so this can be changed any time."));
        if (S.formatAllow["j:" + c.id]) {
          const resetA = el("button", { style: btnStyle("#9ca3af", "color:#374151;padding:3px 8px;font-size:11px;margin-bottom:10px;") }, "Ask again about values that don't match");
          resetA.onclick = () => { delete S.formatAllow["j:" + c.id]; resetA.remove(); scheduleSave(); };
          pop.appendChild(resetA);
        }
      }
      const singleCb = el("input", { type: "checkbox", checked: !!c.single });
      singleCb.onchange = () => { c.single = singleCb.checked; refreshAll(); };
      pop.appendChild(el("label", { style: "display:flex;align-items:center;gap:6px;font-size:12px;color:#111827;margin:0 0 10px;cursor:pointer;", title: "The editor won't add a second line once a value is there, and cells with more than one value get flagged." }, singleCb, "Only one value per cell"));
      const chkB = el("button", { style: btnStyle("#dc2626", "color:#b91c1c;padding:3px 8px;font-size:11px;margin-bottom:10px;") }, "Checks (duplicates and rules)...");
      chkB.onclick = () => { closePopovers(); openChecks(rootOf("j:" + c.id)); };
      pop.appendChild(chkB);
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
      const keys = ids.map((id) => { const r = rows.find((x) => x.id === id); return r && r.key ? r.key : "(no " + S.settings.primaryKey + ")"; });
      refreshAll();
      logEvent("remove", `Removed ${plural(ids.length, "row")}`, { items: keys, keys });
      toast(`${ids.length} row${ids.length === 1 ? "" : "s"} removed`, "#ef4444");
    }
    function openRowMenu(row, ri, x, y) {
      const items = [
        { label: "Select Row", run: () => { if (S.grid.clickMode !== "select") setClickMode("select"); cellSel.clear(); visFields().forEach((_, c) => cellSel.add(ri + "," + c)); updateCellHighlights(); } },
        { label: "Play Call", run: () => triggerPlay(row) }
      ];
      const rowEdits = S.edits[row.id] ? Object.keys(S.edits[row.id]) : [];
      if (rowEdits.length) items.push({ label: `Revert Edits in Row (${rowEdits.length})`, run: () => revertEdits(rowEdits.map((f) => ({ rowId: row.id, field: f }))) });
      items.push("-");
      items.push({ label: "Remove Row", danger: true, run: () => removeRows([row.id]) });
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
    //##> TIMESTAMP WORKFLOW: Play All Timestamps builds a playlist from the grid's rows (in grid order) that
    //##> have a linked call and at least one tag. Tag ids are row id + column + label + time, so their
    //##> complete/hidden state (S.tagState) survives re-derives and Save Session. A tag's label finds its
    //##> grid column by name, following renames and merges, every time it becomes active.
    function cellTokens(row, f) {
      const out = [];
      for (const t of cellParts(row, f).tokens) for (const s of splitTokens(t, INCOMING_DELIM)) out.push(s);
      return out;
    }
    function detectTsFields() {
      if (tsCache) return tsCache;
      const found = [];
      for (const f of S.grid.order) {
        if (f === "__conf__") continue;
        const isMeta = f.startsWith("m:");
        let labeled = false, plain = 0, other = 0;
        for (const r of rows) {
          for (const t of cellTokens(r, f)) {
            if (/^0+$/.test(t)) continue;
            const p = parseTsToken(t, "");
            if (!p) { other++; continue; }
            if (p.labeled) labeled = true;
            else plain++;
          }
          if (labeled) break;
        }
        const named = normName(baseHeader(f)).includes("timestamp");
        if (labeled || named || (!isMeta && plain > 0 && other === 0)) found.push(f);
      }
      tsCache = found;
      return found;
    }
    function presetKind(f) {
      const map = S.preset && S.preset.timestampUse;
      if (!map) return null;
      const n = normName(baseHeader(f));
      for (const k of Object.keys(map)) if (normName(k) === n) return map[k] === "edit" ? "edit" : "nav";
      return null;
    }
    function kindFor(f) {
      return S.tsFields[f] || presetKind(f) || null;
    }
    function fieldForLabel(label) {
      const n = normName(label);
      if (!n) return null;
      const ts = new Set(detectTsFields());
      const cands = [];
      for (const c of S.columns) cands.push({ f: "j:" + c.id, names: [c.header, c.source].concat(c.aliases) });
      for (const m of S.metaFields) cands.push({ f: "m:" + m, names: [S.metaHeaders[m], m] });
      const pick = (test) => {
        for (const c of cands) {
          if (!c.names.some((x) => test(normName(x)))) continue;
          const root = rootOf(c.f);
          if (!ts.has(root) && S.grid.order.includes(root)) return root;
        }
        return null;
      };
      return pick((x) => x === n) || pick((x) => namesMatch(x, n));
    }
    function tagsForRow(row, f, kind) {
      const out = [];
      const seen = new Set();
      for (const t of cellTokens(row, f)) {
        const p = parseTsToken(t, baseHeader(f));
        if (!p) continue;
        let id = `${row.id}|${f}|${p.label}|${p.ms}`;
        let n = 2;
        while (seen.has(id)) id = `${row.id}|${f}|${p.label}|${p.ms}|${n++}`;
        seen.add(id);
        const st = S.tagState[id] || {};
        out.push({ id, label: p.label, ms: p.ms, group: f, groupLabel: baseHeader(f), kind, rowId: row.id, complete: !!st.complete, hidden: !!st.hidden });
      }
      return out;
    }
    function allTagsFor(f) {
      const out = [];
      for (const r of rows) for (const t of tagsForRow(r, f, "nav")) if (!t.hidden) out.push(t);
      return out;
    }
    function checkWorked(f, quiet) {
      if (!S.settings.hideWorkedTs || S.tsAutoHidden[f] || !isVis(f)) return false;
      const tags = allTagsFor(f);
      if (!tags.length || !tags.every((t) => t.complete)) return false;
      setVis(f, false);
      S.tsAutoHidden[f] = true;
      renderHeader();
      renderRows();
      rebuildColPanel();
      scheduleSave();
      if (!quiet) toast(`Every tag in ${baseHeader(f)} is worked, so the column is hidden and won't be exported. Bring it back with Show / Hide Columns.`, "#0369a1");
      return true;
    }
    function checkAllWorked() {
      for (const f of detectTsFields()) checkWorked(f, false);
    }
    function updateTsBtn() {
      const n = detectTsFields().length;
      playTsBtn.style.display = n ? "" : "none";
      playTsBtn.textContent = tsActive ? "\u21BB Restart Timestamps" : "\u25B6 Play All Timestamps";
    }
    function suggestKind(f) {
      let mapped = 0, total = 0;
      for (const r of rows.slice(0, 200)) {
        for (const t of tagsForRow(r, f, "nav")) {
          total++;
          if (fieldForLabel(t.label)) mapped++;
        }
      }
      return total && mapped * 2 >= total ? "edit" : "nav";
    }
    function askTsUsage(fields) {
      if (fields.every((f) => kindFor(f))) {
        for (const f of fields) if (!S.tsFields[f]) S.tsFields[f] = kindFor(f);
        return Promise.resolve(true);
      }
      return new Promise((resolve) => {
        const picks = {};
        for (const f of fields) picks[f] = kindFor(f) || suggestKind(f);
        const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000021;display:flex;align-items:center;justify-content:center;" + FONT });
        const box = el("div", { style: "background:#fff;width:520px;max-width:94vw;max-height:86vh;overflow:auto;border-radius:12px;padding:22px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
        box.appendChild(el("div", { style: "font-size:15px;font-weight:700;color:#111827;margin-bottom:6px;" }, `${fields.length} Timestamp Field${fields.length === 1 ? "" : "s"} Detected. How are you using ${fields.length === 1 ? "it" : "them"}?`));
        box.appendChild(el("div", { style: "font-size:12px;color:#6b7280;margin-bottom:12px;" }, "You can change this later in the Media Player's settings, on the Unpack tab."));
        const list = el("div", { style: "display:flex;flex-direction:column;gap:8px;margin-bottom:14px;" });
        const OPTS = [
          ["nav", "Navigation", "Select if you'll be using the timestamps just for listening purposes, such as jumping to tagged points of interest."],
          ["edit", "Edit Fields", "Select if you'll be using the timestamps to correct or clarify data on your sheet."]
        ];
        const paint = () => {
          list.querySelectorAll("button[data-f]").forEach((b) => {
            const on = picks[b.dataset.f] === b.dataset.v;
            b.style.background = on ? "#1d4ed8" : "#fff";
            b.style.color = on ? "#fff" : "#1d4ed8";
            b.setAttribute("aria-pressed", on ? "true" : "false");
          });
        };
        for (const f of fields) {
          const row = el("div", { style: "display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;" });
          row.appendChild(el("div", { style: "flex:1;min-width:0;font-size:13px;font-weight:600;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;", title: groupLabel(f) }, baseHeader(f)));
          for (const [v, l, tip] of OPTS) {
            const b = el("button", { type: "button", title: tip, style: "padding:6px 12px;border-radius:8px;border:1px solid #1d4ed8;font-size:12px;font-weight:600;cursor:pointer;" }, l);
            b.dataset.f = f;
            b.dataset.v = v;
            b.onclick = () => { picks[f] = v; paint(); };
            row.appendChild(b);
          }
          list.appendChild(row);
        }
        box.appendChild(list);
        const btnRow = el("div", { style: "display:flex;gap:8px;" });
        const go = el("button", { style: "flex:1;" + PRIMARY_BTN }, "Start");
        const cancel = el("button", { style: "flex:1;" + PLAIN_BTN }, "Cancel");
        go.onclick = () => { for (const f of fields) S.tsFields[f] = picks[f]; scheduleSave(); overlay.remove(); resolve(true); };
        cancel.onclick = () => { overlay.remove(); resolve(false); };
        btnRow.append(go, cancel);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        paint();
      });
    }
    function restoreTempShown(keep) {
      if (tsTempShown && tsTempShown !== keep) {
        setVis(tsTempShown, false);
        tsTempShown = null;
        renderHeader();
        renderRows();
        rebuildColPanel();
      }
    }
    //##> TIMESTAMP LAYOUT: In timestamp mode the banner, instructions, paste box, and sort bar are tucked away
    //##> and the player fills the space under the toolbar. The grid is still there underneath; dragging the
    //##> player down reveals it. Everything comes back when timestamp mode ends.
    function setTsLayout(on) {
      for (const n of [bannerWrap, topPanel, sortBar]) {
        if (on) {
          if (n.dataset.tsPrev === undefined) n.dataset.tsPrev = n.style.display || "";
          n.style.display = "none";
        } else if (n.dataset.tsPrev !== undefined) {
          n.style.display = n.dataset.tsPrev;
          delete n.dataset.tsPrev;
        }
      }
      if (!on) renderBanner();
    }
    function availPlayerHeight() {
      return Math.max(200, card.clientHeight - toolbar.offsetHeight - 2);
    }
    function savedHeight(key) {
      try {
        const n = parseInt(localStorage.getItem(key), 10);
        return isFinite(n) && n >= 200 ? n : null;
      } catch (_) { return null; }
    }
    function playerHeightFor(mode) {
      const max = availPlayerHeight();
      const saved = savedHeight(mode === "ts" ? LS_TS_HEIGHT : LS_GRID_HEIGHT);
      if (saved) return Math.min(saved, max) + "px";
      return (mode === "ts" ? max : Math.round(card.clientHeight * 0.5)) + "px";
    }
    function allDonePref() {
      try {
        const v = localStorage.getItem(LS_ALL_DONE);
        return v === "exit" || v === "stay" ? v : "ask";
      } catch (_) { return "ask"; }
    }
    function rowNumberOf(rowId) {
      const i = view.findIndex((r) => r.id === rowId);
      return i >= 0 ? i + 1 : 0;
    }
    function rowTitle(row) {
      const n = row ? rowNumberOf(row.id) : 0;
      const tid = row ? ((row.meta && getFV(row.meta, TRANS_FIELD)) || row.key || "") : "";
      return { title: n ? `Row ${n}` : "Row (filtered out)", tip: tid ? `Trans_Id ${tid}` : "" };
    }
    //##> ROW STRIP: A slice of the grid shown inside the player in timestamp mode: the header, the active row,
    //##> and two faded rows above and below. All visible columns are there and it scrolls sideways, starting
    //##> centered on the active tag's field. Clicking it opens to about ten rows; clicking away or saving
    //##> closes it. In Edit Fields mode the active row's cells open the stacked editor; Navigation is read-only.
    let stripWrap = null;
    let stripBox = null;
    let stripExpanded = false;
    let stripRowId = null;
    let stripTarget = null;
    let stripTagId = null;
    let stripEditable = false;
    let stripCentered = null;
    function stripCollapsedHeight() {
      return STRIP_ROW_H * (STRIP_ROWS_COLLAPSED * 2 + 2) + 14;
    }
    function buildStrip() {
      if (stripWrap) return stripWrap;
      stripWrap = el("div", { style: `position:relative;height:${stripCollapsedHeight()}px;background:#0f172a;border-top:1px solid #1e293b;` });
      stripBox = el("div", { style: `position:absolute;left:0;right:0;top:0;height:${stripCollapsedHeight()}px;overflow:auto;background:#fff;transition:height .25s ease, box-shadow .25s ease;` + FONT });
      stripWrap.appendChild(stripBox);
      stripBox.addEventListener("mousedown", onStripMouseDown);
      return stripWrap;
    }
    function onStripMouseDown(e) {
      if (e.button !== 0) return;
      const td = e.target.closest ? e.target.closest("td[data-field]") : null;
      if (td && stripEditable && S.grid.clickMode === "edit") {
        const isActiveRow = td.dataset.rowid === stripRowId;
        if (isActiveRow || stripExpanded) {
          e.preventDefault();
          const row = rows.find((r) => r.id === td.dataset.rowid);
          const f = td.dataset.field;
          if (editing && editing.rowId === td.dataset.rowid && editing.field === f) return;
          const tagId = isActiveRow && f === stripTarget ? stripTagId : null;
          const prevTag = editing && editing.tagId;
          openEditor(row, f, { where: "strip", tagId });
          if (prevTag && !tagId && playerCtrl) playerCtrl.resumeFromEdit();
          return;
        }
      }
      if (!stripExpanded) {
        e.preventDefault();
        stripExpanded = true;
        renderStrip();
      }
    }
    function renderStrip() {
      if (!stripBox) return;
      const keepLeft = stripBox.scrollLeft;
      const fullH = stripExpanded ? STRIP_ROW_H * (STRIP_ROWS_EXPANDED_ABOVE + STRIP_ROWS_EXPANDED_BELOW + 2) + 14 : stripCollapsedHeight();
      stripBox.style.height = fullH + "px";
      stripBox.style.boxShadow = stripExpanded ? "0 12px 24px rgba(0,0,0,.45)" : "none";
      stripBox.innerHTML = "";
      const ri = view.findIndex((r) => r.id === stripRowId);
      if (ri < 0) {
        stripBox.appendChild(el("div", { style: "padding:14px;font-size:12px;color:#6b7280;" }, stripRowId ? "This row isn't showing on the grid right now (it may be filtered out)." : "No row selected."));
        return;
      }
      const above = stripExpanded ? STRIP_ROWS_EXPANDED_ABOVE : STRIP_ROWS_COLLAPSED;
      const below = stripExpanded ? STRIP_ROWS_EXPANDED_BELOW : STRIP_ROWS_COLLAPSED;
      const from = Math.max(0, ri - above);
      const to = Math.min(view.length - 1, ri + below);
      const vf = visFields();
      const tbl = el("table", { style: "border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:11px;" });
      tbl.style.width = (COL1_W + vf.reduce((n, f) => n + getColWidth(f), 0)) + "px";
      const hr = el("tr", {});
      hr.appendChild(el("th", { style: `position:sticky;top:0;left:0;z-index:3;width:${COL1_W}px;min-width:${COL1_W}px;background:#f1f5f9;border-bottom:1px solid #e5e7eb;font-size:10px;color:#64748b;height:${STRIP_ROW_H}px;` }, "#"));
      for (const f of vf) {
        const w = getColWidth(f);
        const isTarget = f === stripTarget;
        hr.appendChild(el("th", { title: groupLabel(f), style: `position:sticky;top:0;z-index:2;width:${w}px;min-width:${w}px;max-width:${w}px;box-sizing:border-box;padding:0 8px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;height:${STRIP_ROW_H}px;border-bottom:1px solid #e5e7eb;background:${isTarget ? "#fee2e2" : "#f8fafc"};color:${isTarget ? "#b91c1c" : "#374151"};font-weight:${isTarget ? 700 : 600};` }, headerOf(f)));
      }
      const thead2 = el("thead", {});
      thead2.appendChild(hr);
      tbl.appendChild(thead2);
      const tb = el("tbody", {});
      for (let i = from; i <= to; i++) {
        const row = view[i];
        const dist = Math.abs(i - ri);
        const opacity = dist === 0 ? 1 : Math.max(0.2, stripExpanded ? 1 - dist * 0.13 : 1 - dist * 0.38);
        const active = dist === 0;
        const bg = active ? "#fffbeb" : "#fff";
        const tr = el("tr", { style: `height:${STRIP_ROW_H}px;opacity:${opacity};` });
        tr.appendChild(el("td", { style: `position:sticky;left:0;z-index:1;width:${COL1_W}px;min-width:${COL1_W}px;text-align:right;padding:0 6px;font-size:10px;font-weight:${active ? 700 : 400};color:${active ? "#b45309" : "#9ca3af"};background:${active ? "#fef3c7" : "#f8fafc"};border-bottom:1px solid #f1f5f9;` }, String(i + 1)));
        for (const f of vf) {
          const w = getColWidth(f);
          const text = cellText(row, f);
          const isTarget = active && f === stripTarget;
          const isEd = editing && editing.where === "strip" && editing.rowId === row.id && editing.field === f;
          const td = el("td", { title: text, style: `position:relative;width:${w}px;min-width:${w}px;max-width:${w}px;box-sizing:border-box;padding:0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid #f1f5f9;color:#111827;background:${bg};${(isTarget || isEd) ? `outline:2px solid ${isEd && !editing.tagId ? "#f59e0b" : "#ef4444"};outline-offset:-2px;` : ""}${stripEditable && (active || stripExpanded) && S.grid.clickMode === "edit" ? "cursor:text;" : "cursor:pointer;"}` }, text);
          td.dataset.rowid = row.id;
          td.dataset.field = f;
          if (getEdit(row, f)) td.appendChild(editMarker(row, f));
          const sIss = S.settings.showFlags ? cellIssues(row, f) : [];
          if (sIss.length) { td.appendChild(flagMarker(sIss)); if (!isTarget && !isEd) td.style.background = active ? "#fee2e2" : "#fef2f2"; }
          tr.appendChild(td);
        }
        tb.appendChild(tr);
      }
      tbl.appendChild(tb);
      stripBox.appendChild(tbl);
      const centerKey = stripRowId + "|" + stripTarget;
      if (stripTarget && stripCentered !== centerKey) {
        stripCentered = centerKey;
        const ci = vf.indexOf(stripTarget);
        if (ci >= 0) {
          let left = COL1_W;
          for (let k = 0; k < ci; k++) left += getColWidth(vf[k]);
          const w = getColWidth(stripTarget);
          stripBox.scrollLeft = Math.max(0, left - COL1_W - (stripBox.clientWidth - COL1_W - w) / 2);
        }
      } else {
        stripBox.scrollLeft = keepLeft;
      }
      if (stripExpanded) {
        const activeTr = tb.children[ri - from];
        if (activeTr) stripBox.scrollTop = Math.max(0, activeTr.offsetTop - STRIP_ROW_H * 3);
      }
      if (editing && editing.where === "strip") setTimeout(positionEditor, 0);
    }
    function setStripFocus(rowId, target, tagId, editable) {
      stripRowId = rowId;
      stripTarget = target || null;
      stripTagId = tagId || null;
      stripEditable = !!editable;
      stripExpanded = false;
      buildStrip();
      if (playerCtrl && stripWrap.parentNode !== playerCtrl.els.workspaceSlot) playerCtrl.setWorkspace(stripWrap);
      renderStrip();
    }
    function focusTag(tag) {
      const target = fieldForLabel(tag.label);
      tag.target = target;
      const row = rows.find((r) => r.id === tag.rowId);
      const ri = view.findIndex((r) => r.id === tag.rowId);
      if (!row || ri < 0 || !target || !isVis(target)) return null;
      if (S.grid.clickMode !== "edit") setClickMode("edit");
      setStripFocus(tag.rowId, target, tag.id, true);
      const ci = visFields().indexOf(target);
      if (ci >= 0) scrollCellIntoView(ri, ci, true);
      openEditor(row, target, { where: "strip", tagId: tag.id });
      return null;
    }
    let tsItems = [];
    let tsDonePrompted = false;
    function editTagsAllDone() {
      let n = 0;
      for (const it of tsItems) {
        for (const t of it.timestamps) {
          if (t.kind !== "edit" || t.hidden || S.tsGroupsOff.includes(t.group)) continue;
          n++;
          if (!t.complete) return false;
        }
      }
      return n > 0;
    }
    async function checkAllDone() {
      if (!tsActive) return;
      if (!editTagsAllDone()) { tsDonePrompted = false; return; }
      if (tsDonePrompted) return;
      tsDonePrompted = true;
      const pref = allDonePref();
      let leave = pref === "exit";
      if (pref === "ask") {
        const r = await dialog({
          title: "All Timestamps Complete",
          message: "Every timestamp has been marked complete. Exit editing mode?\n\nYou'll go back to the grid. The player stays open at its normal size, and you can still play any call.",
          checkbox: "Always do this",
          buttons: [{ label: "Yes", value: true, primary: true }, { label: "No", value: false }]
        });
        leave = !!r.value;
        if (r.checked) { try { localStorage.setItem(LS_ALL_DONE, leave ? "exit" : "stay"); } catch (_) {} }
      }
      if (leave && tsActive) {
        exitTimestamps();
        setClickMode("select");
      }
    }
    function tagHost() {
      return {
        exitLabel: "Exit Timestamps",
        hint: "Enter saves the field and marks the tag complete. Tab adds another value. Ctrl+\u2190 and Ctrl+\u2192 move between tags. Drag the edit box by its header to move it. Click the row above to see more of the grid.",
        onActiveTag(tag, item) {
          if (item) activeSmid = item.smid;
          const ri = view.findIndex((r) => r.id === tag.rowId);
          if (tag.kind !== "edit") {
            restoreTempShown(null);
            if (editing && editing.tagId) commitEdit();
            setStripFocus(tag.rowId, fieldForLabel(tag.label), null, false);
            if (ri >= 0) scrollCellIntoView(ri, 0, true);
            renderRows();
            return null;
          }
          const target = fieldForLabel(tag.label);
          tag.target = target;
          restoreTempShown(target);
          if (!target) {
            if (editing && editing.tagId) commitEdit();
            setStripFocus(tag.rowId, null, tag.id, true);
            if (ri >= 0) scrollCellIntoView(ri, 0, true);
            renderRows();
            return { text: "(No matching column)" };
          }
          if (ri < 0) {
            if (editing && editing.tagId) commitEdit();
            setStripFocus(tag.rowId, target, tag.id, true);
            renderRows();
            return {
              text: "(Row Filtered Out)",
              action: "Clear Filters",
              run: () => {
                S.grid.filters = {};
                S.grid.globalFilter = "";
                globalSearchBox.value = "";
                rerender();
                return focusTag(tag);
              }
            };
          }
          if (!isVis(target)) {
            if (unpackPref("tagUnhide")) {
              setVis(target, true);
              tsTempShown = target;
              renderHeader();
              rebuildColPanel();
            } else {
              if (editing && editing.tagId) commitEdit();
              setStripFocus(tag.rowId, null, tag.id, true);
              scrollCellIntoView(ri, 0, true);
              renderRows();
              return {
                text: "(Field Hidden)",
                action: "Unhide",
                run: () => {
                  setVis(target, true);
                  rerender();
                  return focusTag(tag);
                }
              };
            }
          }
          return focusTag(tag);
        },
        onTagChange(tag) {
          const was = S.tagState[tag.id];
          if (tag.complete && !(was && was.complete)) logEvent("timestamp", `Completed a timestamp in ${baseHeader(tag.group)}`, { keys: [keyForRowId(tag.rowId)] });
          if (tag.complete || tag.hidden) S.tagState[tag.id] = { complete: !!tag.complete, hidden: !!tag.hidden };
          else delete S.tagState[tag.id];
          scheduleSave();
          renderRows();
          renderStrip();
          checkWorked(tag.group, false);
          checkAllDone();
        },
        isEditing(tag) {
          if (!editing) return false;
          if (editing.tagId === tag.id) return true;
          return !!tag.target && editing.rowId === tag.rowId && editing.field === tag.target;
        },
        onGroupsChange(groups) {
          S.tsGroupsOff = groups.filter((g) => !g.enabled).map((g) => g.id);
          scheduleSave();
          checkAllDone();
        },
        onExit() { exitTimestamps(); }
      };
    }
    function ensurePlayer(mode) {
      const height = playerHeightFor(mode);
      if (playerCtrl) {
        if (playerCtrl.restore) playerCtrl.restore();
        if (playerCtrl.setHeight) playerCtrl.setHeight(height);
        return playerCtrl;
      }
      const pt = playerTool();
      if (!pt || !pt._openPlayerPane) return null;
      playerCtrl = pt._openPlayerPane(card, (reg) => { stopPlayer = reg; }, {
        initialHeight: height,
        shortcuts: false,
        settings: playerConfig(),
        getMaxHeight: availPlayerHeight,
        onHeightChange: (px) => {
          const max = availPlayerHeight();
          try { localStorage.setItem(tsActive ? LS_TS_HEIGHT : LS_GRID_HEIGHT, String(Math.min(px, max))); } catch (_) {}
          positionEditor();
        },
        onClosed: () => {
          playerCtrl = null;
          stopPlayer = null;
          activeSmid = null;
          if (editing && editing.where === "strip") cancelEdit();
          if (tsActive) { tsActive = false; restoreTempShown(null); setTsLayout(false); updateTsBtn(); }
          if (!closed) renderRows();
        }
      });
      return playerCtrl;
    }
    async function startTimestamps(keepPos) {
      if (editing) commitEdit();
      const fields = detectTsFields();
      if (!fields.length) { toast("No timestamp fields were found on the grid.", "#6b7280"); return; }
      if (!keepPos) {
        const ok = await askTsUsage(fields);
        if (!ok || closed) return;
      }
      for (const f of fields) if (!S.tsFields[f]) S.tsFields[f] = kindFor(f) || "nav";
      const groups = fields.map((f) => ({ id: f, label: baseHeader(f), kind: S.tsFields[f], enabled: !S.tsGroupsOff.includes(f) }));
      if (!groups.some((g) => g.enabled)) groups[0].enabled = true;
      const items = [];
      let unlinked = 0;
      for (const row of view) {
        const tags = [];
        for (const f of fields) tags.push(...tagsForRow(row, f, S.tsFields[f]));
        if (!tags.length) continue;
        const smid = row.meta ? getFV(row.meta, "sourceMediaId") : "";
        if (!smid) { unlinked++; continue; }
        const rowRef = row;
        items.push({ key: row.key, smid, displayLabel: row.key || rowLabel(row), row: row.meta || {}, rowId: row.id, timestamps: tags, titleFn: () => rowTitle(rows.find((r) => r.id === rowRef.id) || rowRef) });
      }
      if (!items.length) {
        dialog({ title: "No calls to play", message: unlinked ? "The rows with timestamps aren't linked to calls yet. Add Nexidia Metadata first." : "None of the rows showing on the grid have timestamps. Check your filters." });
        return;
      }
      const prevRow = keepPos && tsActive && playerCtrl && playerCtrl.getActiveTag && playerCtrl.getActiveTag() ? playerCtrl.getActiveTag().rowId : null;
      setInstructions(false);
      tsActive = true;
      setTsLayout(true);
      const p = ensurePlayer("ts");
      if (!p) { tsActive = false; setTsLayout(false); toast("Media Player isn't loaded.", "#6b7280"); return; }
      tsItems = items;
      tsDonePrompted = editTagsAllDone();
      buildStrip();
      p.setWorkspace(stripWrap);
      if (groups.some((g) => g.kind === "edit" && g.enabled)) setClickMode("edit");
      p.setPlaylist(items, { host: tagHost(), groups });
      let start = prevRow ? items.findIndex((it) => it.rowId === prevRow) : -1;
      if (start < 0) start = items.findIndex((it) => it.timestamps.some((t) => !t.complete && !t.hidden && !S.tsGroupsOff.includes(t.group)));
      if (start < 0) start = 0;
      p.loadPlaylistIndex(start);
      updateTsBtn();
      if (unlinked) toast(`${unlinked} row${unlinked === 1 ? " has" : "s have"} timestamps but no linked call, so ${unlinked === 1 ? "it was" : "they were"} skipped.`, "#d97706");
    }
    function gridNavFor(idx) {
      return {
        items: view.map((r) => ({ row: r.meta || {}, titleFn: () => rowTitle(r) })),
        currentIndex: idx >= 0 ? idx : 0,
        onNavigate: (i) => { const t = view[i]; if (t) triggerPlay(t); }
      };
    }
    function exitTimestamps(quiet) {
      if (!tsActive) return;
      if (editing) commitEdit();
      const lastRowId = stripRowId;
      tsActive = false;
      tsItems = [];
      stripRowId = null;
      stripExpanded = false;
      restoreTempShown(null);
      setTsLayout(false);
      if (playerCtrl) {
        playerCtrl.setWorkspace(null);
        playerCtrl.clearPlaylist();
        playerCtrl.setHeight(playerHeightFor("grid"));
        const idx = view.findIndex((r) => r.id === lastRowId);
        if (idx >= 0) {
          playerCtrl.setGridNav(gridNavFor(idx));
          if (playerCtrl.refreshTags) playerCtrl.refreshTags();
        }
      }
      updateTsBtn();
      if (!quiet) renderRows();
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
      if (showPlayCol()) trh.appendChild(el("th", { style: `position:sticky;top:0;${frozenStyle(2, true)}background:#f9fafb;border-bottom:2px solid #e5e7eb;padding:4px;font-size:10px;color:#9ca3af;text-align:center;` }, "\u25B6"));
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
    function editMarker(row, field) {
      const hit = el("span", { style: "position:absolute;top:0;right:0;width:12px;height:12px;cursor:pointer;z-index:2;", title: "This field has been edited. Click to revert back to original value." });
      hit.appendChild(el("span", { style: `position:absolute;top:0;right:0;width:0;height:0;border-top:8px solid ${EDIT_COLOR};border-left:8px solid transparent;` }));
      hit.addEventListener("mousedown", (e) => { e.stopPropagation(); e.preventDefault(); });
      hit.addEventListener("click", (e) => { e.stopPropagation(); revertEdits([{ rowId: row.id, field }]); });
      return hit;
    }
    function renderRows() {
      const range = getVisibleRange();
      lastRange = range;
      const vf = visFields();
      const mode = S.grid.clickMode;
      const selectMode = mode === "select";
      const editMode = mode === "edit";
      const playCol = showPlayCol();
      updateCounts();
      const selAll = thead.querySelector("input[type=checkbox]");
      if (selAll) {
        selAll.checked = view.length > 0 && view.every((r) => selected.has(r.id));
        selAll.indeterminate = selected.size > 0 && !selAll.checked;
      }
      tbody.innerHTML = "";
      const revKey = reviewCellKey();
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
        const tr = el("tr", { style: `height:${ROW_HEIGHT}px;background:${bg};${isActive ? "outline:2px solid #3b82f6;outline-offset:-2px;" : ""}${mode === "play" ? "cursor:pointer;" : ""}` });
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
        if (playCol) {
          const tdPlay = el("td", { style: `${frozenStyle(2, false)}background:${bg};padding:2px 4px;border-bottom:1px solid #f1f5f9;text-align:center;height:${ROW_HEIGHT}px;` });
          const icon = el("span", { style: `font-size:13px;cursor:${smid ? "pointer" : "default"};color:${smid ? "#3b82f6" : "#d1d5db"};`, title: smid ? (tsActive ? "Play this call (leaves timestamp playback)" : "Play") : "No call linked yet" }, "\u25B6");
          icon.onclick = (e) => { e.stopPropagation(); triggerPlay(row); };
          tdPlay.appendChild(icon);
          tr.appendChild(tdPlay);
        }
        vf.forEach((field, ci) => {
          const w = getColWidth(field);
          const isEditing = editing && editing.rowId === row.id && editing.field === field;
          const edited = !!getEdit(row, field);
          if (isEditing && editing.where === "grid") { editing.ri = ri; editing.ci = ci; }
          const display = cellText(row, field);
          const iss = S.settings.showFlags ? cellIssues(row, field) : [];
          const hl = cellHl(row, field) || (iss.length ? "#fef2f2" : null);
          const cSel = selectMode && cellSel.has(ri + "," + ci);
          const td = el("td", { style: `position:relative;padding:4px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:${w}px;min-width:${w}px;max-width:${w}px;box-sizing:border-box;height:${ROW_HEIGHT}px;${selectMode ? "cursor:cell;" : (editMode ? "cursor:text;" : "")}${cSel ? "background:#dbeafe;outline:1px solid #93c5fd;outline-offset:-1px;" : (hl ? "background:" + hl + ";" : "")}`, title: display }, display);
          td.dataset.r = String(ri);
          td.dataset.c = String(ci);
          if (hl) td.dataset.hl = hl;
          if (isEditing) { td.style.outline = `2px solid ${editing.tagId ? "#ef4444" : "#f59e0b"}`; td.style.outlineOffset = "-2px"; }
          else if (revKey && revKey === row.id + "|" + field) { td.style.outline = "2px solid #dc2626"; td.style.outlineOffset = "-2px"; }
          if (edited) td.appendChild(editMarker(row, field));
          if (iss.length) td.appendChild(flagMarker(iss));
          tr.appendChild(td);
        });
        tr.addEventListener("click", (e) => {
          if (mode !== "play" || tdSel.contains(e.target) || tdNum.contains(e.target)) return;
          triggerPlay(row);
        });
        tbody.appendChild(tr);
      }
      if (range.end < view.length) {
        const sp = el("tr", {});
        sp.appendChild(el("td", { colSpan: span, style: `height:${(view.length - range.end) * ROW_HEIGHT}px;padding:0;border:0;` }));
        tbody.appendChild(sp);
      }
      if (editing && editing.where === "grid") positionEditor();
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
      if (e.button !== 0) return;
      const td = e.target.closest ? e.target.closest("td[data-r]") : null;
      if (!td) return;
      const r = Number(td.dataset.r), c = Number(td.dataset.c);
      if (S.grid.clickMode === "edit") {
        e.preventDefault();
        const prevTag = editing && editing.tagId;
        startEdit(r, c);
        if (prevTag && playerCtrl) playerCtrl.resumeFromEdit();
        return;
      }
      if (S.grid.clickMode !== "select") return;
      e.preventDefault();
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
      const items = [{ label: "Copy", run: copyCellSelection }];
      const editedCells = editedInSelection();
      if (editedCells.length) items.push({ label: `Revert Edited Cells (${editedCells.length})`, run: () => revertEdits(editedCells) });
      menu(e.clientX, e.clientY, items);
    });
    //##> SHORTCUTS: Ctrl+Left / Ctrl+Right step back and forth one item: the previous or next issue while the
    //##> review bar is open, otherwise the previous or next tag (timestamp mode) or call (regular playback).
    //##> Inside the editor they replace the usual jump-by-word; Ctrl+Shift+arrows still select words.
    function isNavShortcut(e) {
      return (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight");
    }
    function shortcutNav(dir) {
      if (review && review.order.length) {
        if (editing) commitEdit();
        moveReview(dir);
        return true;
      }
      if (playerCtrl) {
        if (editing && !tsActive) commitEdit();
        const btn = dir < 0 ? playerCtrl.els.prevNavBtn : playerCtrl.els.nextNavBtn;
        if (btn && btn.style.display !== "none") { btn.click(); return true; }
      }
      return false;
    }
    function onKey(e) {
      if (isNavShortcut(e) && !closed) {
        const a = document.activeElement;
        const typing = a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable);
        if (!typing && !document.querySelector("[data-nx-dialog]") && shortcutNav(e.key === "ArrowLeft" ? -1 : 1)) e.preventDefault();
        return;
      }
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
      if (editing) commitEdit();
      S.grid.clickMode = CLICK_MODES[mode] ? mode : "select";
      const m = CLICK_MODES[S.grid.clickMode];
      if (S.grid.clickMode !== "select") {
        cellSel.clear();
        cellAnchor = null;
      }
      clickModeBtn.textContent = m.text;
      clickModeBtn.style.borderColor = m.color;
      clickModeBtn.style.color = m.textColor;
      clickModeBtn.title = m.tip;
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
      if (tsActive) exitTimestamps(true);
      const p = ensurePlayer("grid");
      if (!p) { window.open(PLAYER_URL(smid), "_blank"); return; }
      activeSmid = smid;
      const idx = view.indexOf(row);
      p.setGridNav(gridNavFor(idx));
      p.loadCall(smid, rowLabel(row), undefined, null);
      renderRows();
    }
    //##> EXCEL EXPORT: Unpacked columns export as text by default so long identifiers like
    //##> User to User never turn into scientific notation. Only columns positively typed as Date,
    //##> Number, or Currency export as real Excel values. Metadata columns follow the same date,
    //##> duration, hold, and sentiment formatting as export.js. Merged cells with stacked values
    //##> always export as text. Only visible columns export, so worked timestamp columns that were
    //##> hidden automatically are left out.
    const LOG_KINDS = { paste: "Paste", lookup: "Lookup", leftOff: "Left Off", addedMissing: "Added Anyway", addKeys: "Add Keys", import: "Import", edit: "Edit", revert: "Revert", merge: "Merge", unmerge: "Unmerge", remove: "Remove Rows", ignore: "Flag", timestamp: "Timestamp", export: "Export", session: "Session" };
    const LOG_ITEMS_SHOWN = 200;
    function logStatsList() {
      const log = S.log || [];
      const pastes = log.filter((x) => x.kind === "paste");
      const objects = pastes.reduce((n, x) => n + (x.count || 0), 0);
      let found = 0, missing = 0, multi = 0;
      for (const r of rows) { if (r.status === "missing") missing++; else if (r.status === "multi") multi++; else if (r.meta) found++; }
      let edits = 0;
      for (const id of Object.keys(S.edits)) edits += Object.keys(S.edits[id]).length;
      const started = new Date(S.createdAt);
      const mins = Math.max(0, Math.round((Date.now() - S.createdAt) / 60000));
      return [
        ["Session started", started.toLocaleString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })],
        ["Time in session", mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} hr ${mins % 60} min`],
        ["Pastes", pastes.length.toLocaleString()],
        ["Objects read", objects.toLocaleString()],
        ["Rows on grid", rows.length.toLocaleString()],
        ["Calls found", found.toLocaleString()],
        ["Not found", missing.toLocaleString()],
        ["More than one match", multi.toLocaleString()],
        ["Edited fields", edits.toLocaleString()],
        ["Removed rows", S.removed.length.toLocaleString()],
        ["Exports", log.filter((x) => x.kind === "export").length.toLocaleString()]
      ];
    }
    function renderLog() {
      logStats.innerHTML = "";
      for (const [k, v] of logStatsList()) {
        logStats.appendChild(el("div", { style: "color:#6b7280;" }, k));
        logStats.appendChild(el("div", { style: "font-weight:600;text-align:right;color:#111827;" }, v));
      }
      logList.innerHTML = "";
      const log = (S.log || []).slice().reverse();
      if (!log.length) { logList.appendChild(el("div", { style: "padding:14px 12px;font-size:12px;color:#9ca3af;" }, "Nothing logged yet. Pastes, lookups, edits, and exports show up here.")); return; }
      for (const x of log) {
        const item = el("div", { style: "padding:6px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;line-height:1.4;" });
        const top = el("div", { style: "display:flex;gap:6px;align-items:baseline;" });
        top.appendChild(el("span", { style: "color:#9ca3af;font-size:11px;flex-shrink:0;" }, new Date(x.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })));
        top.appendChild(el("span", { style: "font-weight:700;color:#334155;flex-shrink:0;" }, LOG_KINDS[x.kind] || x.kind));
        item.appendChild(top);
        item.appendChild(el("div", { style: "color:#111827;word-break:break-word;" }, x.text));
        if (Array.isArray(x.items) && x.items.length) {
          const n = x.items.length;
          const what = x.kind === "paste" ? (n === 1 ? "raw object" : "raw objects") : (n === 1 ? "value" : "values");
          const toggle = el("button", { type: "button", style: "background:none;border:0;padding:2px 0;font-size:11px;font-weight:600;color:#1d4ed8;cursor:pointer;" + FONT }, `\u25B8 Show ${n.toLocaleString()} ${what}`);
          const pre = el("pre", { style: "display:none;margin:4px 0 0;max-height:220px;overflow:auto;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px;font-size:11px;font-family:Consolas,monospace;white-space:pre-wrap;word-break:break-all;color:#111827;" });
          toggle.onclick = () => {
            const open = pre.style.display === "none";
            if (open && !pre.textContent) pre.textContent = x.items.slice(0, LOG_ITEMS_SHOWN).join("\n") + (n > LOG_ITEMS_SHOWN ? `\n... and ${(n - LOG_ITEMS_SHOWN).toLocaleString()} more (included in exports)` : "");
            pre.style.display = open ? "block" : "none";
            toggle.textContent = `${open ? "\u25BE Hide" : "\u25B8 Show"} ${n.toLocaleString()} ${what}`;
          };
          item.appendChild(toggle);
          item.appendChild(pre);
        }
        logList.appendChild(item);
      }
    }
    function setLogOpen(open) {
      logPanel.style.display = open ? "flex" : "none";
      logBtn.style.background = open ? "#e2e8f0" : "#fff";
      if (open) renderLog();
    }
    function updateKeyButtons() {
      addKeysBtn.textContent = "+ Add " + pkPlural();
      addKeysBtn.style.display = S.preset && S.preset.allowAddKeys === false ? "none" : "";
    }
    function exportBase() {
      const label = S.preset && S.preset.label ? S.preset.label.replace(/[\\/:*?"<>|]+/g, "-").trim() : "";
      return (label ? label + " " : "nexidia_unpacked_") + stamp();
    }
    function warnLong(long, what) {
      if (!long) return;
      dialog({ title: "Some values were too long for one cell", message: `${plural(long, "value")} in the ${what} ${long === 1 ? "was" : "were"} longer than Excel's limit of ${XLSX_MAX_TEXT.toLocaleString()} characters per cell. Nothing was cut off: ${long === 1 ? "it continues" : "each one continues"} into the column${long === 1 ? "" : "s"} right next to ${long === 1 ? "it" : "them"}${what === "grid" ? ", labeled (Part 2), (Part 3), and so on" : ""}.` });
    }
    //##> LOG KEYS: Each log entry keeps the primary keys it touched in keys. The log export lists them in a
    //##> column after Values, separated by commas with no spaces. Entries logged before this was added only have
    //##> keys when their Values list already held them.
    function exportLog(format) {
      const log = S.log || [];
      if (!log.length) { toast("Nothing is in the log yet.", "#6b7280"); return false; }
      const headers = ["Time", "Event", "Details", "Values", pkPlural()];
      const name = exportBase() + "_log." + format;
      const valuesText = (x) => (x.kind === "paste" ? String(x.count || "") : (x.items || []).join(", "));
      if (format === "xlsx") {
        const data = log.map((x) => {
          const keys = logKeys(x).join(",");
          return [{ t: "n", v: excelLocalTime(x.t), cls: "dts" }, { t: "s", v: LOG_KINDS[x.kind] || x.kind }, { t: "s", v: x.text }, x.kind === "paste" ? (x.count ? { t: "n", v: x.count, cls: "int" } : null) : (x.items && x.items.length ? { t: "s", v: x.items.join(", ") } : null), keys ? { t: "s", v: keys } : null];
        });
        const ex = expandOverflow(headers, data);
        const base = [20, 13, 80, 40, 40];
        downloadBlob(name, buildXlsx("Session Log", ex.headers, ex.data, ex.map.map((i) => base[i])));
        warnLong(ex.long, "log");
        return true;
      }
      const stats = format === "txt" ? logStatsList().map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n\r\n" : "";
      const rowsText = log.map((x) => [new Date(x.t).toLocaleString(), LOG_KINDS[x.kind] || x.kind, x.text, valuesText(x), logKeys(x).join(",")]);
      const text = format === "csv" ? buildDelimited("csv", headers, rowsText) : stats + buildDelimited("txt", headers, rowsText);
      downloadBlob(name, new Blob([text], { type: format === "csv" ? "text/csv" : "text/plain" }));
      return true;
    }
    function exportRaw(format) {
      const raw = [];
      for (const x of (S.log || [])) if (x.kind === "paste" && Array.isArray(x.items)) for (const o of x.items) if (o) raw.push(o);
      if (!raw.length) { toast("No raw outputs are stored for this session yet.", "#6b7280"); return false; }
      const name = exportBase() + "_raw." + format;
      if (format === "txt") {
        downloadBlob(name, new Blob([raw.map((o) => o.replace(/\r?\n/g, " ")).join("\r\n")], { type: "text/plain" }));
        return true;
      }
      const ex = expandOverflow([""], raw.map((o) => [{ t: "s", v: o }]));
      if (format === "xlsx") {
        downloadBlob(name, buildXlsx("Raw Data", ex.headers, ex.data, ex.headers.map(() => 120), { noHeader: true }));
      } else {
        downloadBlob(name, new Blob([buildDelimited("csv", null, ex.data.map((r) => r.map((c) => (c ? c.v : ""))))], { type: "text/csv" }));
      }
      warnLong(ex.long, "raw data");
      return true;
    }
    //##> EXPORT PICKER: The Export button opens one box with Grid, Session Log, and Raw Data, each with its own
    //##> format (Excel, CSV, or tab-delimited text). Choices are remembered while Unpack is open. The grid
    //##> goes last because its issue check can send the user to review first.
    function openExportDialog() {
      if (editing) commitEdit();
      const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000015;display:flex;align-items:center;justify-content:center;" + FONT });
      const box = el("div", { style: "background:#fff;width:440px;max-width:94vw;border-radius:12px;padding:20px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-label", "Export");
      box.appendChild(el("div", { style: "font-size:15px;font-weight:700;color:#111827;margin-bottom:12px;" }, "Export"));
      const items = [
        ["grid", "Grid", "Everything on the grid, the way it looks now."],
        ["log", "Session Log", "Every paste, lookup, edit, and export with its time."],
        ["raw", "Raw Data", "Each object you pasted, one per row in column A, with no headers."]
      ];
      const formats = [["xlsx", "Excel (.xlsx)"], ["csv", "CSV (.csv)"], ["txt", "Text (.txt)"]];
      const draft = JSON.parse(JSON.stringify(exportChoice));
      const msg = el("div", { style: "font-size:12px;color:#b91c1c;min-height:16px;margin:4px 0 8px;" });
      msg.setAttribute("aria-live", "polite");
      for (const [id, label, tip] of items) {
        const row = el("div", { style: "display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9;" });
        const cbId = "nxExp_" + id + Date.now();
        const cb = el("input", { type: "checkbox", id: cbId, checked: !!draft[id].on });
        const lab = el("label", { htmlFor: cbId, style: "flex:1;cursor:pointer;" });
        lab.appendChild(el("div", { style: "font-size:13px;font-weight:600;color:#111827;" }, label));
        lab.appendChild(el("div", { style: "font-size:11px;color:#6b7280;" }, tip));
        const sel = el("select", { style: "padding:5px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;" });
        sel.setAttribute("aria-label", label + " format");
        for (const [v, t] of formats) sel.appendChild(el("option", { value: v }, t));
        sel.value = draft[id].format;
        sel.disabled = !cb.checked;
        cb.onchange = () => { draft[id].on = cb.checked; sel.disabled = !cb.checked; msg.textContent = ""; };
        sel.onchange = () => { draft[id].format = sel.value; };
        row.appendChild(cb);
        row.appendChild(lab);
        row.appendChild(sel);
        box.appendChild(row);
      }
      box.appendChild(msg);
      const btnRow = el("div", { style: "display:flex;gap:8px;" });
      const goB = el("button", { type: "button", style: "flex:1;" + PRIMARY_BTN }, "Export");
      const cancelB = el("button", { type: "button", style: "flex:1;" + PLAIN_BTN }, "Cancel");
      goB.onclick = async () => {
        if (!draft.grid.on && !draft.log.on && !draft.raw.on) { msg.textContent = "Choose at least one thing to export."; return; }
        exportChoice = draft;
        overlay.remove();
        if (draft.log.on && exportLog(draft.log.format)) logEvent("export", `Exported the session log as ${draft.log.format.toUpperCase()}`);
        if (draft.raw.on && exportRaw(draft.raw.format)) logEvent("export", `Exported raw data as ${draft.raw.format.toUpperCase()}`);
        if (draft.grid.on) await exportGrid(draft.grid.format);
      };
      cancelB.onclick = () => overlay.remove();
      overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") overlay.remove(); });
      btnRow.appendChild(goB);
      btnRow.appendChild(cancelB);
      box.appendChild(btnRow);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      setTimeout(() => goB.focus(), 30);
    }
    function exportCell(row, f) {
      const raw = cellRaw(row, f);
      const str = (v) => ({ t: "s", v });
      const num = (v, cls) => ({ t: "n", v: Number(v), cls });
      if (!raw) return null;
      if (f === "__conf__") return num(raw, "int");
      if (f.startsWith("m:")) {
        if (getEdit(row, f)) return str(raw);
        const k = f.slice(2).toLowerCase();
        if (k === "recordeddatetime") {
          const d = new Date(raw);
          if (!isNaN(d.getTime())) return num(d.getTime() / 86400000 + 25569, "dt");
        }
        if (k === "mediafileduration") { const sec = msToSeconds(raw); if (sec !== null) return num(Math.round(sec) / 86400, "dur"); }
        if (k === "udfint4") { const sec = msToSeconds(raw); if (sec !== null) return num(Math.round(sec), "int"); }
        if ((k === "sentimentscore" || k === "overallsentimentscore") && isFinite(Number(raw))) return num(Number(raw), "dec2");
        return str(raw);
      }
      const c = colById(f.slice(2));
      const t = effType(c);
      if (t === "date") {
        const d = parseDateToken(raw);
        if (d) {
          const style = colFormat(c);
          const cls = style === "MM/DD/YYYY" ? "dpad" : style === "YYYY-MM-DD" ? "diso" : style === "M/D/YY" ? "d2" : style === "MM/DD/YY" ? "dpad2" : "d";
          return num(Date.UTC(d.y, d.mo - 1, d.d) / 86400000 + 25569, cls);
        }
      }
      const style = colFormat(c);
      if (t === "number") {
        const m = parseMoneyToken(raw);
        if (m && !m.dollar && !m.leadingZero && m.intPart.length < 15) return num(String(m.n), style === "#,##0" ? (m.decimals ? "gen" : "thou") : "gen");
      }
      if (t === "currency") {
        const m = parseMoneyToken(raw);
        if (m) return num(String(m.n), style === "$#,##0" ? "cur0" : (style === "#,##0.00" ? "dec2c" : (style === "0.00" ? "dec2" : "cur")));
      }
      return str(raw);
    }
    function doGridExport(list, format) {
      if (!list.length) { toast("No rows to export.", "#6b7280"); return; }
      format = format || "xlsx";
      const fields = exportFields();
      const headers = fields.map((f) => headerOf(f));
      const name = exportBase() + "." + format;
      if (format === "txt" || format === "csv") {
        const textRows = list.map((r) => fields.map((f) => cellRaw(r, f) || ""));
        const asCells = textRows.map((r) => r.map((v) => (v ? { t: "s", v } : null)));
        const ex = format === "csv" ? expandOverflow(headers, asCells) : { headers, data: asCells, long: 0 };
        const text = buildDelimited(format, ex.headers, ex.data.map((r) => r.map((c) => (c ? c.v : ""))));
        downloadBlob(name, new Blob([text], { type: format === "csv" ? "text/csv" : "text/plain" }));
        logEvent("export", `Exported ${plural(list.length, "row")} of the grid as ${format.toUpperCase()}`, { keys: list.map((r) => r.key) });
        warnLong(ex.long, "grid");
        return;
      }
      const data = list.map((r) => fields.map((f) => exportCell(r, f)));
      const charWidths = fields.map((f, ci) => {
        let n = Math.ceil(String(headers[ci]).length * 1.1);
        for (const r of list) {
          const len = String(cellText(r, f) || "").length;
          if (len > n) n = len;
        }
        return n + 2;
      });
      const ex = expandOverflow(headers, data);
      let blob;
      try { blob = buildXlsx(S.preset && S.preset.label ? S.preset.label : "Unpacked", ex.headers, ex.data, ex.map.map((i) => charWidths[i])); }
      catch (e) { console.error(e); dialog({ title: "Export failed", danger: true, message: "The Excel file couldn't be built: " + (e.message || e) }); return; }
      downloadBlob(name, blob);
      logEvent("export", `Exported ${plural(list.length, "row")} of the grid as XLSX`, { keys: list.map((r) => r.key) });
      warnLong(ex.long, "grid");
    }
    async function chooseScope() {
      if (!selected.size) return view;
      const r = await dialog({ title: "Export Options", message: `You have ${selected.size.toLocaleString()} row${selected.size === 1 ? "" : "s"} selected. Export selected or the entire grid?`, buttons: [{ label: "Export Selected", value: "sel", primary: true }, { label: "Export All", value: "all" }, { label: "Cancel", value: null }] });
      if (!r.value) return null;
      return r.value === "sel" ? view.filter((row) => selected.has(row.id)) : view;
    }
    async function exportGrid(format) {
      if (editing) commitEdit();
      const list = await chooseScope();
      if (!list) return;
      if (S.settings.checkOnExport) {
        const n = computeIssues(list, exportFields()).length;
        if (n) {
          const r = await dialog({
            title: `There ${n === 1 ? "is 1 possible issue" : `are ${n.toLocaleString()} possible issues`}.`,
            message: `Do you want to review ${n === 1 ? "it" : "them"} before exporting? Flags and highlights aren't included in the export either way.`,
            buttons: [{ label: "Review", value: "review", primary: true }, { label: "Export Anyway", value: "export" }, { label: "Cancel", value: null }]
          });
          if (!r.value) return;
          if (r.value === "review") { openReview(list, list, format); return; }
        }
      }
      doGridExport(list, format);
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
      if (S.preset && S.preset.batchPreset) api.setShared("reportBatchPreset", Object.assign({}, S.preset.batchPreset));
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
      box.appendChild(section("Edited Fields"));
      const policyOpts = [["ask", "Ask me each time"], ["ignore", "Ignore New Data"], ["replace", "Replace With New Data"], ["combine", "Add And Combine"]];
      const policySel = select(policyOpts, S.editPolicy.all || "ask");
      box.appendChild(line(label("When new data hits an edited field", info("What to do when a new paste, spreadsheet import, or metadata lookup changes a field you've already edited. Applies to all edited fields this session.")), policySel));
      const fieldPolicies = Object.keys(S.editPolicy.fields || {});
      const clearFieldPol = el("button", { style: btnStyle("#9ca3af", "color:#374151;padding:4px 10px;font-size:11px;") }, `Clear ${fieldPolicies.length} field choice${fieldPolicies.length === 1 ? "" : "s"}`);
      let clearFields = false;
      clearFieldPol.onclick = () => { clearFields = true; clearFieldPol.disabled = true; clearFieldPol.textContent = "Will clear on Apply"; };
      if (fieldPolicies.length) box.appendChild(line(label("Saved choices for single fields", info("Fields where you picked \"Always do this for this field.\" Clear them to be asked again.")), clearFieldPol));
      const revertCb = el("input", { type: "checkbox", checked: !S.suppress.revertConfirm });
      box.appendChild(line(label("Confirm before reverting an edit"), revertCb));
      box.appendChild(section("Checks"));
      const flagsCb = el("input", { type: "checkbox", checked: d.showFlags !== false });
      box.appendChild(line(label("Flag cells that fail their checks", info("Show a red corner on cells that are duplicates or don't meet a column's rules. Set checks from a column's menu, under Checks.")), flagsCb));
      const expCb = el("input", { type: "checkbox", checked: d.checkOnExport !== false });
      box.appendChild(line(label("Offer a review before exporting", info("When flagged cells are in what you're exporting, ask whether to step through them first.")), expCb));
      const ignN = Object.keys(S.issueIgnore.items).length + Object.keys(S.issueIgnore.rules).length;
      let clearIgn = false;
      if (ignN) {
        const ignB = el("button", { style: btnStyle("#9ca3af", "color:#374151;padding:4px 10px;font-size:11px;") }, `Clear ${ignN} ignored item${ignN === 1 ? "" : "s"}`);
        ignB.onclick = () => { clearIgn = true; ignB.disabled = true; ignB.textContent = "Will clear on Apply"; };
        box.appendChild(line(label("Ignored items and rules", info("Items and rules you chose to ignore during a review. Clear them to be flagged again.")), ignB));
      }
      box.appendChild(section("Timestamps"));
      const hideWorkedCb = el("input", { type: "checkbox", checked: d.hideWorkedTs !== false });
      box.appendChild(line(label("Hide timestamp columns once every tag is worked", info("When every tag in a timestamp column is marked complete, that column is hidden so it isn't exported. You can always bring it back with Show / Hide Columns.")), hideWorkedCb));
      const tsBtn = el("button", { style: btnStyle("#ea580c", "color:#c2410c;") }, "Timestamp Settings");
      tsBtn.onclick = () => openPlayerSettings("unpack");
      box.appendChild(line(label("Navigation / Edit Fields and playback", info("Choose how each timestamp field is used, and how the workflow moves between tags.")), tsBtn));
      box.appendChild(section("Media Player"));
      const playerBtn = el("button", { style: btnStyle("#0ea5e9", "color:#0369a1;") }, "\u2699 Player Settings");
      playerBtn.onclick = () => openPlayerSettings();
      box.appendChild(line(label("Player settings for this session", info("How calls are named, which details show with each call, and playback options. Changes made here are saved with this session only.")), playerBtn));
      if (S.columns.length) {
        box.appendChild(section("Column Types"));
        box.appendChild(el("div", { style: "font-size:11px;color:#6b7280;margin-bottom:4px;" }, "Auto Detect reads the values as they come in. Prose columns use the Prose rules above; everything else uses the Basic rules. Date, Currency, and Number formats are set in each column's Attributes menu."));
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
        d.hideWorkedTs = hideWorkedCb.checked;
        d.showFlags = flagsCb.checked;
        d.checkOnExport = expCb.checked;
        if (clearIgn) S.issueIgnore = { items: {}, rules: {} };
        const pkChanged = d.primaryKey !== S.settings.primaryKey;
        const autoTurnedOn = d.autoMeta && !S.settings.autoMeta;
        const hideTurnedOn = d.hideWorkedTs && !S.settings.hideWorkedTs;
        S.settings = d;
        S.editPolicy.all = policySel.value === "ask" ? null : policySel.value;
        if (clearFields) S.editPolicy.fields = {};
        if (revertCb.checked) delete S.suppress.revertConfirm; else S.suppress.revertConfirm = true;
        for (const c of S.columns) if (colTypes.has(c.id)) c.type = colTypes.get(c.id);
        if (pkChanged) {
          S.meta = {};
          S.metaStatus = {};
          clearNotice("missing");
          clearNotice("pk");
        }
        if (hideTurnedOn) S.tsAutoHidden = {};
        closePopovers();
        overlay.remove();
        updateMetaBtn();
        refreshAll();
        if (hideTurnedOn) checkAllWorked();
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
        const mk = (t, color, tip) => el("button", { style: btnStyle(color, "padding:3px 9px;font-size:11px;"), title: tip || "" }, t);
        const resumeB = mk("Resume Session", "#1d4ed8", "Pick this session back up where you left off.");
        const keepB = mk("Keep for Later", "#16a34a", "Hide this from the list for now. It stays saved in this browser.");
        const saveB = mk("Save Session", "#b45309", "Save a hard copy of this session so you can come back later and continue your work.");
        const discB = mk("Discard", "#b91c1c", "Delete this session permanently.");
        resumeB.onclick = async () => {
          if (S.entries.length) {
            const r = await dialog({ title: "Resume session?", message: "Your current session will stay saved in this list so you can come back to it.", buttons: [{ label: "Resume", value: true, primary: true }, { label: "Cancel", value: false }] });
            if (!r.value) return;
            saveNow();
          } else dbDel(S.sessionId);
          loadSessionData(rec.data, true);
          logEvent("session", "Resumed this session");
          if (S.settings.autoMeta && S.entries.length) fetchMetadata(true);
          renderBanner();
        };
        keepB.onclick = () => { bannerDismissed.add(rec.id); renderBanner(); };
        saveB.onclick = async () => { const name = await askSaveName(rec.rowCount); if (name) downloadText(name, sessionFile(rec.data)); };
        discB.onclick = async () => {
          const r = await dialog({ title: "Discard session?", message: "This session will be deleted permanently.", buttons: [{ label: "Discard", value: true, primary: true }, { label: "Cancel", value: false }] });
          if (!r.value) return;
          await dbDel(rec.id);
          renderBanner();
        };
        [resumeB, keepB, saveB, discB].forEach((b) => row.appendChild(b));
        bannerWrap.appendChild(row);
      }
    }
    function teardown() {
      closed = true;
      if (editing) closeEditorPanel(editing);
      editing = null;
      tsActive = false;
      clearTimeout(saveTimer);
      if (typeof stopPlayer === "function") { try { stopPlayer(); } catch (_) {} }
      removeDragGhost();
      closePopovers();
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onOutsideEdit, true);
      window.removeEventListener("resize", onWinResize);
      document.querySelectorAll("[data-nx-editor]").forEach((p) => p.remove());
      document.querySelectorAll("[data-unpack-prompt]").forEach((p) => p.remove());
      try { modal.remove(); } catch (_) {}
      try { stickyClose.remove(); } catch (_) {}
    }
    async function requestClose(toMenu) {
      if (editing) commitEdit();
      if (S.entries.length) {
        const r = await dialog({
          title: "Close this session?",
          message: "Closing clears this session. Use Save Session first if you want to pick it back up later.",
          buttons: [{ label: "Save & Close", value: "save", primary: true, title: "Save a hard copy of this session, then close." }, { label: "Close", value: "close" }, { label: "Cancel", value: null }]
        });
        if (!r.value) return;
        if (r.value === "save" && !(await saveSessionFile())) return;
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
    exportExcelBtn.onclick = () => openExportDialog();
    addKeysBtn.onclick = () => openAddKeys();
    logBtn.onclick = () => setLogOpen(logPanel.style.display === "none");
    logCloseBtn.onclick = () => setLogOpen(false);
    logExportBtn.onclick = () => openExportDialog();
    issuesBtn.onclick = () => openReview(view, null);
    playTsBtn.onclick = () => startTimestamps(false);
    exportTranscriptsBtn.onclick = () => exportTranscripts();
    saveSessionBtn.onclick = () => { if (!S.entries.length) { toast("Nothing to save yet.", "#6b7280"); return; } saveSessionFile(); };
    loadSessionBtn.onclick = () => sessionInput.click();
    sessionInput.onchange = () => { const f = sessionInput.files && sessionInput.files[0]; sessionInput.value = ""; if (f) loadSessionFile(f); };
    removeSelectedBtn.onclick = async () => {
      const r = await dialog({ title: "Remove rows?", message: `Remove ${selected.size.toLocaleString()} selected row${selected.size === 1 ? "" : "s"} from the grid?`, buttons: [{ label: "Remove", value: true, primary: true }, { label: "Cancel", value: false }] });
      if (r.value) removeRows([...selected]);
    };
    resetBtn.onclick = () => {
      S.grid.sorts = [];
      S.grid.filters = {};
      S.grid.globalFilter = "";
      S.grid.widths = {};
      S.grid.visible = S.grid.order.slice();
      globalSearchBox.value = "";
      selected.clear();
      rerender();
    };
    clickModeBtn.onclick = () => setClickMode(CLICK_ORDER[(CLICK_ORDER.indexOf(S.grid.clickMode) + 1) % CLICK_ORDER.length]);
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
    function updateTitle() {
      titleEl.textContent = S.preset && S.preset.label ? "Unpack CoPilot Outputs: " + S.preset.label : "Unpack CoPilot Outputs";
      renderInstructions();
      updateKeyButtons();
    }
    function presetAliases(c) {
      const out = [];
      for (const a of [c.key, c.header].concat(c.aliases || [])) {
        const t = String(a == null ? "" : a).trim();
        if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
      }
      return out;
    }
    //##> REPORT CHECKS: A report column can include unique: true and checks: [{ type, a, b, message }]. Types
    //##> match the Checks menu (required, length, range, contains, notContains, startsWith, endsWith, allowed,
    //##> pattern, npi, tin). Pattern is a regular expression that has to match the whole value. Messages can use
    //##> {value} and {column}. The report can also pass checkMessages: { npi, tin, duplicate, ... } to replace
    //##> the default message for a type.
    function presetChecks(f, c) {
      const list = Array.isArray(c.checks) ? c.checks : [];
      if (!c.unique && !list.length) return;
      const ce = checkEntry(f);
      if (c.unique) ce.unique = true;
      list.forEach((r, i) => {
        if (!r || !CHECK_TYPES.some(([v]) => v === r.type)) return;
        ce.rules.push({ id: "p" + i + "_" + f.replace(/[^A-Za-z0-9]/g, ""), type: r.type, a: r.a == null ? "" : String(r.a), b: r.b == null ? "" : String(r.b), message: r.message || "", source: "report" });
      });
    }
    //##> REPORT SETUP: Reports can also hand Unpack their extra settings through the shared value
    //##> "unpackReportSetup" right before dispatching, so they arrive even if the report hub only forwards the
    //##> options it already knows. Column settings in it are matched by column header or key, and anything the
    //##> dispatch options already carry wins. Unpack clears the value once it's read.
    function readReportSetup(p) {
      const setup = api.getShared("unpackReportSetup");
      api.setShared("unpackReportSetup", null);
      if (!setup || typeof setup !== "object") return p;
      const out = Object.assign({}, setup, p);
      for (const k of ["instructions", "promptUrl", "promptLabel", "timestampUse", "checkMessages", "label"]) if (out[k] == null && setup[k] != null) out[k] = setup[k];
      const extra = setup.columns || {};
      const lookup = (c) => extra[c.header] || extra[c.key] || null;
      out.columns = (p.columns || []).map((c) => {
        const x = c && c.type !== "meta" ? lookup(c) : (c ? extra[c.header] : null);
        return x ? Object.assign({}, x, c) : c;
      });
      return out;
    }
    function applyPreload(p) {
      p = readReportSetup(p);
      S = newState();
      S.settings.primaryKey = p.primaryKey || "Trans_Id";
      S.preset = { label: p.label || "", batchPreset: p.batchPreset || null, suppressMergePrompts: p.suppressMergePrompts !== false, timestampUse: p.timestampUse || null, checkMessages: p.checkMessages || null, instructions: Array.isArray(p.instructions) ? p.instructions.slice() : null, promptUrl: p.promptUrl || null, promptLabel: p.promptLabel || null, allowImportNew: p.allowImportNew !== false, allowAddKeys: p.allowAddKeys !== false };
      const order = [];
      const merges = [];
      for (const c of (p.columns || [])) {
        if (c.type === "meta" && c.field) {
          if (!S.metaFields.includes(c.field)) {
            S.metaFields.push(c.field);
            S.metaHeaders[c.field] = c.header || c.field;
            order.push("m:" + c.field);
          }
          presetChecks("m:" + c.field, c);
          continue;
        }
        const aliases = presetAliases(c);
        if (!aliases.length) continue;
        const taken = aliasMap();
        if (aliases.some((a) => taken.has(a.toLowerCase()))) continue;
        const id = "c" + (S.nextColId++);
        const presetType = TYPES.some(([v]) => v === c.dataType) ? c.dataType : "auto";
        S.columns.push({ id, source: c.key || c.header, header: c.header || c.key, aliases, type: presetType, format: c.format || "", single: !!c.single, detected: "text", nullEq: {} });
        presetChecks("j:" + id, c);
        if (c.mergeInto) merges.push({ source: "j:" + id, target: "m:" + c.mergeInto });
        else order.push("j:" + id);
      }
      S.grid.order = order;
      S.grid.visible = order.slice();
      const pk = pkColumn();
      if (!pk) {
        addNotice("error", `The report didn't include a ${S.settings.primaryKey} column, so outputs can't be matched to its calls.`, "pk");
        return;
      }
      const keyField = p.keyField || TRANS_FIELD;
      let list = (p.rows || []).filter(Boolean);
      if (p.sortField) {
        list = list.slice().sort((a, b) => {
          const va = String(getFV(a, p.sortField) || ""), vb = String(getFV(b, p.sortField) || "");
          return va < vb ? -1 : va > vb ? 1 : 0;
        });
      }
      const locked = [];
      let noKey = 0;
      for (const r of list) {
        const k = String(getFV(r, keyField) || "").trim();
        if (!k || /^0+$/.test(k)) { noKey++; continue; }
        const lk = k.toLowerCase();
        if (!S.meta[lk]) {
          S.meta[lk] = [];
          S.entries.push({ id: S.nextEntryId++, pasteId: 0, seed: true, values: { [pk.id]: k } });
          locked.push(lk);
        }
        S.meta[lk].push(r);
        S.metaStatus[lk] = S.meta[lk].length > 1 ? "multi" : "ok";
      }
      S.lockedKeys = locked;
      S.metaAdded = true;
      for (const m of merges) {
        if (S.metaFields.includes(m.target.slice(2))) applyMerge(m.source, m.target, true);
        else { S.grid.order.push(m.source); setVis(m.source, true); }
      }
      if (noKey) addNotice("error", `${noKey} call${noKey === 1 ? " was" : "s were"} left off because ${noKey === 1 ? "it has" : "they have"} no ${S.settings.primaryKey}.`, "noKey");
    }
    const preload = api.getShared("unpackPreload");
    if (preload) {
      api.setShared("unpackPreload", null);
      applyPreload(preload);
    }
    updateTitle();
    setClickMode("select");
    updateMetaBtn();
    renderInput();
    refreshAll();
    renderBanner();
  }
  api.registerTool({ id: "unpack", label: "Unpack CoPilot Outputs", open: openUnpack });
})();
