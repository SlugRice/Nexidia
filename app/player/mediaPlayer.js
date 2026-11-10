//[Last Update: 12:19 AM 11/10/2026]
//[Please confirm this timestamp in your response any time it was formed using this document!]
(() => {
const api = window.NEXIDIA_TOOLS;
if (!api) return;
const BASE = "https://apug01.nxondemand.com/NxIA";
const PREPARE_URL = (smid, offset) =>
  `${BASE}/api/media-preparation/prepare?sourceMediaId=${smid}&startOffsetMilliseconds=${offset}&clipDurationMilliseconds=0&requestVideoIfAvailable=true`;
const HIT_LINES_URL = `${BASE}/api/search/media-hit-lines`;
const AUTOSUMMARY_URL = (smid) => `${BASE}/api/autosummary/${smid}`;
const TRANSCRIPT_URL = (smid) => `${BASE}/api/transcript/${smid}`;
const HIGHLIGHTS_URL = (smid) =>
  `${BASE}/api-gateway/explore/api/v1.0/transcripts/${smid}/highlights`;
const SEGMENT_COLORS = {
  Agent: "#3b82f6", Customer: "#22c55e",
  CrossTalk: "#ef4444", NonTalk: "#f59e0b"
};
const PHRASE_PIN_COLOR = "#a855f7";
const EVENT_PIN_COLOR = "#0ea5e9";
const IMPORT_PIN_COLOR = "#f97316";
const COMPLETE_COLOR = "#f87171";
const PLAYHEAD_COLOR = "#ffffff";
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5, 6];
const LS_SPEED_KEY = "nexidia_player_speed";
const TRANS_FIELD = "UDFVarchar110";
const GRID_LIST_WINDOW = 100;
//##> PLAYER SETTINGS: Settings resolve in layers: BUILTIN_SETTINGS, then the general settings saved in
//##> this browser (LS_SETTINGS_KEY), then a module's defaults, then the module's saved values. Settings
//##> changed while the player is open from a module (like Unpack) are handed back to that module to
//##> save with its session. Settings changed with no module attached are saved as the general defaults.
//##> Modules can hide general settings and add their own panes through the settings config.
const LS_SETTINGS_KEY = "nexidia_player_settings";
const BUILTIN_SETTINGS = {
  nameField: TRANS_FIELD,
  stageFields: [],
  showAllEvents: true,
  timestampBuffer: 10,
  tagAfterComplete: "jump",
  tagAutoPause: true,
  tagPauseIncomplete: false
};
const livePlayers = new Set();
function loadSavedSpeed() {
  try { const v = parseFloat(localStorage.getItem(LS_SPEED_KEY)); if (SPEEDS.includes(v)) return v; } catch (_) {}
  return null;
}
function saveSpeed(rate) { try { localStorage.setItem(LS_SPEED_KEY, String(rate)); } catch (_) {} }
function clearSavedSpeed() { try { localStorage.removeItem(LS_SPEED_KEY); } catch (_) {} }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (o) => JSON.parse(JSON.stringify(o == null ? {} : o));
const sameVal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function fetchJson(url, init) {
  const res = await fetch(url, Object.assign({ credentials: "include" }, init || {}));
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) return res.json();
  const t = await res.text();
  try { return JSON.parse(t); } catch { return { raw: t }; }
}
async function preparePoll(smid, offsetMs) {
  for (let i = 0; i < 10; i++) {
    const data = await fetchJson(PREPARE_URL(smid, offsetMs));
    if (data.isMediaPrepared) return data;
    await sleep(1500);
  }
  throw new Error("Media preparation timed out.");
}
function fmtTime(ms) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, "0"), mm = String(m % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
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
function ensurePlayerStyles() {
  if (document.getElementById("nx-player-styles")) return;
  const st = el("style", { id: "nx-player-styles" });
  st.textContent = "@keyframes nxTagPulse{0%,100%{box-shadow:0 0 0 3px rgba(239,68,68,.95)}50%{box-shadow:0 0 0 3px rgba(239,68,68,.15)}}" +
    ".nx-tag-pulse{animation:nxTagPulse 1.6s ease-in-out infinite;}" +
    "@media (prefers-reduced-motion: reduce){.nx-tag-pulse{animation:none;box-shadow:0 0 0 3px rgba(239,68,68,.95);}}";
  document.head.appendChild(st);
}
/* ───────────────────── SETTINGS ───────────────────── */
function loadGeneral() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_SETTINGS_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch (_) { return {}; }
}
function getGeneralSettings() {
  return Object.assign(clone(BUILTIN_SETTINGS), loadGeneral());
}
function saveGeneralSettings(patch) {
  const next = Object.assign(getGeneralSettings(), clone(patch || {}));
  const diff = {};
  for (const k of Object.keys(BUILTIN_SETTINGS)) if (!sameVal(next[k], BUILTIN_SETTINGS[k])) diff[k] = next[k];
  try { localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(diff)); } catch (_) {}
  for (const p of livePlayers) { try { p.refreshSettings(); } catch (_) {} }
}
function baseSettings(config) {
  return Object.assign(getGeneralSettings(), clone((config && config.defaults) || {}));
}
function resolveSettings(config) {
  const vals = config && typeof config.getValues === "function" ? (config.getValues() || {}) : {};
  const out = Object.assign(baseSettings(config), clone(vals));
  if (!Array.isArray(out.stageFields)) out.stageFields = [];
  return out;
}
function settingsFields(config) {
  const s = resolveSettings(config);
  return [...new Set([s.nameField].concat(s.stageFields).filter(Boolean))];
}
/* ───────────────────── FIELD HELPERS ───────────────────── */
function rawFieldValue(row, key) {
  if (!row || !key) return "";
  const xls = api.getShared("xlsBuilder");
  if (xls && xls.getFieldValue) return xls.getFieldValue(row, key);
  if (row[key] !== undefined && row[key] !== null) return row[key];
  const lower = String(key).toLowerCase();
  for (const k of Object.keys(row)) if (k.toLowerCase() === lower && row[k] !== null) return row[k];
  return "";
}
function fieldValue(row, key) {
  let v = rawFieldValue(row, key);
  v = v == null ? "" : String(v).trim();
  if (!v || /^0+$/.test(v) || v.includes("*")) return "";
  const xls = api.getShared("xlsBuilder");
  if (xls && xls.formatDisplayValue) {
    try { const f = xls.formatDisplayValue(key, v); if (f !== undefined && f !== null && String(f).trim()) return String(f); } catch (_) {}
    return v;
  }
  if (/date/i.test(key) && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toLocaleDateString();
  }
  return v;
}
function fieldOptions() {
  const out = [];
  const seen = new Set();
  const add = (storageName, displayName) => {
    if (!storageName || seen.has(storageName)) return;
    seen.add(storageName);
    out.push({ storageName, displayName: displayName || storageName });
  };
  add(TRANS_FIELD, "Trans_Id");
  for (const f of (api.getShared("metadataFields") || [])) if (f && f.isEnabled !== false) add(f.storageName, f.displayName);
  const cp = api.getShared("columnPrefs");
  if (cp && Array.isArray(cp.fields)) cp.fields.forEach((f, i) => add(f, cp.headers && cp.headers[i]));
  out.sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
  return out;
}
function fieldName(storage) {
  if (!storage) return "";
  if (storage === TRANS_FIELD) return "Trans_Id";
  const lower = String(storage).toLowerCase();
  const f = fieldOptions().find((x) => String(x.storageName).toLowerCase() === lower);
  return f ? f.displayName : storage;
}
/* ───────────────────── SETTINGS DIALOG ───────────────────── */
function openSettingsDialog(config, onApplied) {
  config = config || {};
  const scoped = !!config.scope;
  const scopeLabel = config.label || config.scope || "";
  const base = scoped ? baseSettings(config) : clone(BUILTIN_SETTINGS);
  let draft = scoped ? resolveSettings(config) : getGeneralSettings();
  const hidden = new Set(config.hide || []);
  const panes = [{ id: "general", label: "General", render: renderGeneral }].concat((config.panes || []).map((p) => ({ id: p.id, label: p.label, render: (body) => p.render(body, draft) })));
  let activePane = config.startPane && panes.some((p) => p.id === config.startPane) ? config.startPane : "general";
  const FONT = "font-family:Segoe UI,Arial,sans-serif;";
  const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000040;display:flex;align-items:center;justify-content:center;" + FONT });
  const box = el("div", { style: "background:#fff;width:680px;max-width:95vw;height:560px;max-height:90vh;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden;" });
  const head = el("div", { style: "padding:16px 20px 10px;border-bottom:1px solid #e5e7eb;" });
  head.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#111827;" }, "Media Player Settings"));
  head.appendChild(el("div", { style: "font-size:12px;color:#6b7280;margin-top:3px;" }, scoped ? `Changes here are saved with this ${scopeLabel} session only. To change your defaults everywhere, open Media Player settings from the main menu.` : "Changes here are your defaults and are saved in this browser."));
  const mid = el("div", { style: "display:flex;flex:1;min-height:0;" });
  const nav = el("div", { style: "width:150px;border-right:1px solid #e5e7eb;padding:8px 0;flex-shrink:0;overflow-y:auto;" });
  const body = el("div", { style: "flex:1;min-width:0;overflow-y:auto;padding:14px 20px;" });
  mid.appendChild(nav);
  mid.appendChild(body);
  const foot = el("div", { style: "display:flex;gap:8px;padding:12px 20px;border-top:1px solid #e5e7eb;" });
  const btn = (t, primary) => el("button", { style: primary ? "flex:1;padding:9px 14px;border-radius:8px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:13px;font-weight:600;cursor:pointer;" : "flex:1;padding:9px 14px;border-radius:8px;border:1px solid #d1d5db;background:#f9fafb;color:#111827;font-size:13px;cursor:pointer;" }, t);
  const applyB = btn("Apply", true);
  const resetB = btn(scoped ? "Reset to Defaults" : "Reset to Original Defaults");
  resetB.title = scoped ? "Go back to your general defaults for this session." : "Go back to the settings the Media Player shipped with.";
  const cancelB = btn("Cancel");
  foot.append(applyB, resetB, cancelB);
  box.append(head, mid, foot);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  const info = (tip) => { const s = el("span", { style: "display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:#e0e7ff;color:#3730a3;font-size:10px;font-weight:700;cursor:help;margin-left:6px;flex-shrink:0;" }, "i"); s.title = tip; return s; };
  const label = (t, tip) => { const l = el("div", { style: "font-size:13px;color:#111827;display:flex;align-items:center;font-weight:600;" }, t); if (tip) l.appendChild(info(tip)); return l; };
  const section = (t) => el("div", { style: "font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:.05em;margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid #e5e7eb;" }, t);
  function fieldSelect(value, exclude, placeholder) {
    const sel = el("select", { style: "padding:5px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;width:240px;max-width:100%;" });
    if (placeholder) sel.appendChild(el("option", { value: "" }, placeholder));
    for (const f of fieldOptions()) {
      if (exclude && exclude.has(f.storageName)) continue;
      sel.appendChild(el("option", { value: f.storageName }, f.displayName));
    }
    if (value && ![...sel.options].some((o) => o.value === value)) sel.appendChild(el("option", { value }, fieldName(value)));
    sel.value = value || "";
    return sel;
  }
  function renderGeneral(container) {
    container.appendChild(section("Calls"));
    if (!hidden.has("nameField")) {
      const nameSel = fieldSelect(draft.nameField);
      nameSel.onchange = () => { draft.nameField = nameSel.value || TRANS_FIELD; draft.stageFields = draft.stageFields.filter((f) => f !== draft.nameField); renderStage(); };
      container.appendChild(el("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0;" }, label("Name calls by", "The field shown as each call's title in the player and the call list."), nameSel));
    }
    let renderStage = () => {};
    if (!hidden.has("stageFields")) {
      container.appendChild(el("div", { style: "margin:12px 0 6px;" }, label("Details shown with each call", "Pick fields to show under the call name. Drag them to change the order.")));
      const stage = el("div", { style: "display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-height:38px;padding:6px;border:1px dashed #cbd5e1;border-radius:8px;background:#f8fafc;" });
      const addRow = el("div", { style: "margin-top:6px;" });
      const previewEl = el("div", { style: "margin-top:10px;padding:10px;border-radius:8px;background:#0f172a;text-align:center;" });
      let dragIdx = null;
      renderStage = () => {
        stage.innerHTML = "";
        if (!draft.stageFields.length) stage.appendChild(el("span", { style: "font-size:11px;color:#9ca3af;padding:0 4px;" }, "No details added. Use the list below to add fields."));
        draft.stageFields.forEach((f, i) => {
          const chip = el("div", { draggable: true, title: "Drag to reorder", style: "display:inline-flex;align-items:center;gap:6px;padding:5px 6px 5px 10px;border-radius:6px;background:#1d4ed8;color:#fff;font-size:11px;font-weight:600;cursor:grab;user-select:none;" }, fieldName(f));
          const x = el("span", { style: "cursor:pointer;opacity:.8;font-size:12px;padding:0 3px;", title: "Remove" }, "\u2715");
          x.onclick = () => { draft.stageFields.splice(i, 1); renderStage(); };
          chip.appendChild(x);
          chip.addEventListener("dragstart", (e) => { dragIdx = i; e.dataTransfer.effectAllowed = "move"; setTimeout(() => { chip.style.opacity = "0.4"; }, 0); });
          chip.addEventListener("dragend", () => { chip.style.opacity = "1"; dragIdx = null; });
          chip.addEventListener("dragover", (e) => { if (dragIdx === null) return; e.preventDefault(); chip.style.boxShadow = dragIdx < i ? "3px 0 0 #f59e0b" : "-3px 0 0 #f59e0b"; });
          chip.addEventListener("dragleave", () => { chip.style.boxShadow = ""; });
          chip.addEventListener("drop", (e) => {
            e.preventDefault();
            chip.style.boxShadow = "";
            if (dragIdx === null || dragIdx === i) return;
            const [moved] = draft.stageFields.splice(dragIdx, 1);
            draft.stageFields.splice(i, 0, moved);
            dragIdx = null;
            renderStage();
          });
          stage.appendChild(chip);
        });
        addRow.innerHTML = "";
        const addSel = fieldSelect("", new Set(draft.stageFields.concat([draft.nameField])), "+ Add a field...");
        addSel.onchange = () => { if (addSel.value) { draft.stageFields.push(addSel.value); renderStage(); } };
        addRow.appendChild(addSel);
        previewEl.innerHTML = "";
        previewEl.appendChild(el("div", { style: "font-size:10px;color:#64748b;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;" }, "Preview"));
        previewEl.appendChild(el("div", { style: "font-size:16px;font-weight:800;color:#93c5fd;" }, `[${fieldName(draft.nameField)}]`));
        if (draft.stageFields.length) previewEl.appendChild(el("div", { style: "font-size:12px;color:#94a3b8;margin-top:3px;" }, draft.stageFields.map((f) => `[${fieldName(f)}]`).join(" \u00B7 ")));
      };
      container.appendChild(stage);
      container.appendChild(addRow);
      container.appendChild(previewEl);
      renderStage();
    }
    if (!hidden.has("showAllEvents") || !hidden.has("timestampBuffer")) container.appendChild(section("Playback"));
    if (!hidden.has("showAllEvents")) {
      const cb = el("input", { type: "checkbox", checked: !!draft.showAllEvents });
      cb.onchange = () => { draft.showAllEvents = cb.checked; };
      container.appendChild(el("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0;" }, label("Show All Events", "Show Nexidia's built-in events (E1, E2...) on each call when it loads. You can still turn them on or off for a single call with the Show Events box under the timeline. Events are always hidden while playing timestamps from Unpack."), cb));
    }
    if (!hidden.has("timestampBuffer")) {
      const num = el("input", { type: "number", min: 0, max: 600, step: 1, value: String(draft.timestampBuffer), style: "width:80px;padding:5px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;" });
      num.oninput = () => { const n = Math.round(Number(num.value)); draft.timestampBuffer = isFinite(n) && n >= 0 ? Math.min(n, 600) : 0; };
      container.appendChild(el("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0;" }, label("Timestamp Buffer (seconds)", "How close the next tag can be before playback pauses automatically while you're still working on the current one. 0 = Don't Pause."), num));
    }
  }
  function renderNav() {
    nav.innerHTML = "";
    for (const p of panes) {
      const on = p.id === activePane;
      const item = el("div", { style: `padding:8px 14px;font-size:13px;cursor:pointer;color:${on ? "#1d4ed8" : "#374151"};font-weight:${on ? 700 : 400};background:${on ? "#eff6ff" : "transparent"};border-left:3px solid ${on ? "#3b82f6" : "transparent"};` }, p.label);
      item.onclick = () => { activePane = p.id; renderAll(); };
      nav.appendChild(item);
    }
  }
  function renderAll() {
    renderNav();
    body.innerHTML = "";
    const p = panes.find((x) => x.id === activePane) || panes[0];
    try { p.render(body); } catch (e) { console.error(e); body.appendChild(el("div", { style: "font-size:12px;color:#b91c1c;" }, "This settings pane couldn't be loaded.")); }
  }
  const close = () => { overlay.remove(); document.removeEventListener("keydown", onEsc, true); };
  const onEsc = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onEsc, true);
  cancelB.onclick = close;
  resetB.onclick = () => {
    const fresh = clone(base);
    for (const k of Object.keys(draft)) delete draft[k];
    Object.assign(draft, fresh);
    renderAll();
  };
  applyB.onclick = () => {
    if (!Array.isArray(draft.stageFields)) draft.stageFields = [];
    if (scoped) {
      const diff = {};
      for (const k of Object.keys(draft)) if (!sameVal(draft[k], base[k])) diff[k] = clone(draft[k]);
      if (typeof config.onSave === "function") config.onSave(diff);
    } else {
      const patch = {};
      for (const k of Object.keys(BUILTIN_SETTINGS)) patch[k] = draft[k];
      saveGeneralSettings(patch);
    }
    close();
    if (typeof onApplied === "function") onApplied();
  };
  renderAll();
}
/* ───────────────────── BUILD PLAYER PANE ───────────────────── */
function buildPlayerPane(gridCard, initialHeight, unbounded) {
  ensurePlayerStyles();
  const DEFAULT_H = initialHeight || "85vh";
  const pane = el("div", {
    style: `height:${DEFAULT_H};min-height:200px;max-height:${unbounded ? "none" : "95vh"};border-top:1px solid #e5e7eb;background:#111827;display:flex;flex-direction:column;position:relative;flex-shrink:0;font-family:Segoe UI,Arial,sans-serif;`
  });
  const handle = el("div", {
    style: "height:6px;cursor:ns-resize;background:#1f2937;border-bottom:1px solid #374151;flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:4px;"
  });
  for (let i = 0; i < 3; i++) {
    handle.appendChild(el("div", { style: "width:20px;height:2px;background:#4b5563;border-radius:1px;" }));
  }
  const utilBar = el("div", {
    style: "display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:4px 12px;background:#0f172a;flex-shrink:0;"
  });
  const statusEl = el("div", { style: "font-size:11px;color:#64748b;flex:1;" }, "");
  const pauseWrap = el("div", { style: "display:none;align-items:center;gap:10px;flex-shrink:0;" });
  pauseWrap.setAttribute("role", "status");
  pauseWrap.setAttribute("aria-live", "polite");
  const pauseText = el("span", { style: "font-size:11px;font-weight:700;color:#f87171;" }, "Playback Paused for editing.");
  const pauseLabel = el("label", { style: "display:flex;align-items:center;gap:4px;font-size:10px;color:#94a3b8;cursor:pointer;", title: "Turn off automatic pausing. You can turn it back on in Settings." });
  const pauseCb = el("input", { type: "checkbox" });
  pauseLabel.append(pauseCb, document.createTextNode("Stop Pausing Automatically"));
  pauseWrap.append(pauseText, pauseLabel);
  const exitTagsBtn = el("button", {
    style: "display:none;border:1px solid #f59e0b;background:transparent;color:#fbbf24;padding:3px 8px;border-radius:6px;font-size:11px;cursor:pointer;flex-shrink:0;",
    title: "Leave timestamp playback and go back to playing calls from the grid."
  }, "Exit Timestamps");
  const settingsBtn = el("button", {
    style: "border:0;background:#1e293b;color:#94a3b8;padding:3px 8px;border-radius:6px;font-size:11px;cursor:pointer;flex-shrink:0;",
    title: "Media Player Settings"
  }, "\u2699 Settings");
  const hideBtn = el("button", {
    style: "border:0;background:#1e293b;color:#94a3b8;padding:3px 8px;border-radius:6px;font-size:11px;cursor:pointer;flex-shrink:0;"
  }, "Hide Player");
  utilBar.appendChild(statusEl);
  utilBar.appendChild(pauseWrap);
  utilBar.appendChild(exitTagsBtn);
  utilBar.appendChild(settingsBtn);
  utilBar.appendChild(hideBtn);
  const body = el("div", { style: "display:flex;flex:1;min-height:0;overflow:hidden;" });
  const sidebarWrap = el("div", {
    style: "width:240px;min-width:240px;background:#0a0f1a;border-right:1px solid #1e293b;display:flex;flex-direction:column;flex-shrink:0;"
  });
  const tabBar = el("div", { style: "display:flex;border-bottom:1px solid #1e293b;flex-shrink:0;" });
  const tabStyle = "flex:1;padding:9px 6px;font-size:12px;font-weight:700;border:0;background:transparent;cursor:pointer;border-bottom:2px solid transparent;";
  const callsTab = el("button", { style: tabStyle, title: "Calls in this playlist" }, "Calls");
  const tagsTab = el("button", { style: tabStyle + "display:none;", title: "Timestamps grouped by call" }, "Tags");
  tabBar.appendChild(callsTab);
  tabBar.appendChild(tagsTab);
  const sidebarTools = el("div", { style: "display:none;flex-direction:column;gap:5px;padding:6px 8px;border-bottom:1px solid #1e293b;flex-shrink:0;" });
  const sidebarList = el("div", {
    style: "flex:1;overflow-y:auto;padding:4px 0;"
  });
  sidebarWrap.appendChild(tabBar);
  sidebarWrap.appendChild(sidebarTools);
  sidebarWrap.appendChild(sidebarList);
  const mainCol = el("div", { style: "display:flex;flex-direction:column;flex:1;min-width:0;overflow:hidden;" });
  const titleBar = el("div", {
    style: "text-align:center;padding:10px 16px 4px;background:#0f172a;flex-shrink:0;"
  });
  const callTitle = el("div", {
    style: "font-size:22px;font-weight:800;color:#93c5fd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
  }, "No call loaded");
  const callSub = el("div", {
    style: "font-size:13px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-height:0;"
  }, "");
  titleBar.appendChild(callTitle);
  titleBar.appendChild(callSub);
  const navBar = el("div", {
    style: "display:flex;align-items:center;justify-content:center;gap:14px;padding:8px 16px;background:#0f172a;border-bottom:1px solid #1e293b;flex-shrink:0;flex-wrap:wrap;"
  });
  const navBtnStyle = "font-size:14px;font-weight:700;padding:8px 18px;border-radius:8px;background:#1e293b;color:#e2e8f0;border:1px solid #374151;cursor:pointer;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
  const prevNavBtn = el("button", { style: navBtnStyle, title: "Previous" }, "\u25C0 Prev");
  const navLabel = el("div", {
    style: "font-size:18px;font-weight:700;color:#94a3b8;min-width:80px;text-align:center;"
  }, "");
  const nextNavBtn = el("button", { style: navBtnStyle, title: "Next" }, "Next \u25B6");
  const replayBtn = el("button", {
    style: "display:none;font-size:12px;font-weight:600;padding:8px 12px;border-radius:8px;background:transparent;color:#cbd5e1;border:1px solid #475569;cursor:pointer;",
    title: "Jump back to the start of this tag and play it again."
  }, "\u21BA Replay Tag");
  const markBtn = el("button", {
    style: "display:none;font-size:13px;font-weight:700;padding:8px 16px;border-radius:8px;background:#16a34a;color:#fff;border:0;cursor:pointer;",
    title: "Mark this tag as done and move on."
  }, "\u2713 Mark Complete");
  navBar.appendChild(prevNavBtn);
  navBar.appendChild(navLabel);
  navBar.appendChild(nextNavBtn);
  navBar.appendChild(replayBtn);
  navBar.appendChild(markBtn);
  const tagInfo = el("div", {
    style: "display:none;align-items:center;justify-content:center;gap:8px;padding:4px 12px;background:#0f172a;border-bottom:1px solid #1e293b;font-size:12px;color:#cbd5e1;flex-shrink:0;flex-wrap:wrap;"
  });
  const timelineWrap = el("div", {
    style: "position:relative;flex-shrink:0;height:80px;background:#0f172a;cursor:pointer;overflow:hidden;"
  });
  const waveformImg = el("img", {
    style: "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:fill;opacity:0.25;", alt: ""
  });
  const segCanvas = el("canvas", { style: "position:absolute;top:0;left:0;width:100%;height:100%;" });
  const playheadDiv = el("div", {
    style: `position:absolute;top:0;bottom:0;width:2px;background:${PLAYHEAD_COLOR};pointer-events:none;left:0%;`
  });
  timelineWrap.appendChild(waveformImg);
  timelineWrap.appendChild(segCanvas);
  timelineWrap.appendChild(playheadDiv);
  const controls = el("div", {
    style: "display:flex;align-items:center;gap:6px;padding:6px 10px;background:#0f172a;flex-shrink:0;border-top:1px solid #1e293b;flex-wrap:wrap;"
  });
  const tBtnStyle = "min-width:36px;height:32px;border-radius:6px;background:#1e293b;color:#94a3b8;border:1px solid #374151;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
  const outerPrevBtn = el("button", { style: tBtnStyle, title: "Previous event" }, "\u23EE");
  const innerPrevBtn = el("button", { style: tBtnStyle, title: "Skip backward" }, "\u23EA");
  const stopBtn = el("button", { style: tBtnStyle, title: "Stop" }, "\u23F9");
  const pauseBtn = el("button", { style: tBtnStyle, title: "Pause" }, "\u23F8");
  const playBtn = el("button", {
    style: "min-width:36px;height:32px;border-radius:6px;background:#3b82f6;color:#fff;border:0;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;",
    title: "Play"
  }, "\u25B6");
  const innerNextBtn = el("button", { style: tBtnStyle, title: "Skip forward" }, "\u23E9");
  const outerNextBtn = el("button", { style: tBtnStyle, title: "Next event" }, "\u23ED");
  const timeEl = el("div", {
    style: "font-size:11px;color:#94a3b8;flex-shrink:0;font-family:monospace;min-width:90px;margin-left:6px;"
  }, "00:00 / 00:00");
  const seekBar = el("input", {
    type: "range", min: 0, max: 1000, value: 0,
    style: "flex:1;min-width:120px;accent-color:#3b82f6;cursor:pointer;"
  });
  const speedBtn = el("button", {
    style: "border:1px solid #475569;background:transparent;color:#94a3b8;padding:3px 8px;border-radius:6px;font-size:11px;cursor:pointer;font-family:monospace;flex-shrink:0;min-width:38px;text-align:center;"
  }, "1x");
  const rememberSpeedLabel = el("label", {
    style: "display:flex;align-items:center;gap:4px;font-size:10px;color:#64748b;cursor:pointer;flex-shrink:0;"
  });
  const rememberSpeedCb = el("input", { type: "checkbox" });
  rememberSpeedCb.checked = loadSavedSpeed() !== null;
  rememberSpeedLabel.appendChild(rememberSpeedCb);
  rememberSpeedLabel.appendChild(document.createTextNode("Remember"));
  const showAllEventsLabel = el("label", {
    style: "display:flex;align-items:center;gap:4px;font-size:10px;color:#64748b;cursor:pointer;flex-shrink:0;margin-left:6px;",
    title: "Show Nexidia's built-in events on this call. The default for each call is set in Settings."
  });
  const showAllEventsCb = el("input", { type: "checkbox" });
  showAllEventsLabel.appendChild(showAllEventsCb);
  showAllEventsLabel.appendChild(document.createTextNode("Show Events"));
  const pinBar = el("div", {
    style: "display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-left:8px;"
  });
  controls.appendChild(outerPrevBtn);
  controls.appendChild(innerPrevBtn);
  controls.appendChild(stopBtn);
  controls.appendChild(pauseBtn);
  controls.appendChild(playBtn);
  controls.appendChild(innerNextBtn);
  controls.appendChild(outerNextBtn);
  controls.appendChild(timeEl);
  controls.appendChild(seekBar);
  controls.appendChild(speedBtn);
  controls.appendChild(rememberSpeedLabel);
  controls.appendChild(showAllEventsLabel);
  controls.appendChild(pinBar);
  const searchBar = el("div", {
    style: "display:none;align-items:center;gap:8px;padding:6px 10px;background:#0f172a;border-top:1px solid #1e293b;flex-shrink:0;"
  });
  const searchInput = el("input", {
    type: "text", placeholder: "Search transcript...",
    style: "flex:1;padding:6px 8px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;font-size:12px;box-sizing:border-box;"
  });
  const searchCount = el("div", { style: "font-size:11px;color:#64748b;min-width:60px;text-align:center;" }, "");
  const sBtnStyle = "border:0;background:#1e293b;color:#cbd5e1;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:12px;";
  const searchPrevBtn = el("button", { style: sBtnStyle }, "\u25B2");
  const searchNextBtn = el("button", { style: sBtnStyle }, "\u25BC");
  const searchCloseBtn = el("button", { style: sBtnStyle }, "\u2715");
  searchBar.appendChild(searchInput);
  searchBar.appendChild(searchCount);
  searchBar.appendChild(searchPrevBtn);
  searchBar.appendChild(searchNextBtn);
  searchBar.appendChild(searchCloseBtn);
  const transcriptOuter = el("div", {
    style: "position:relative;flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;"
  });
  const transcriptBar = el("div", {
    style: "display:flex;align-items:center;gap:10px;padding:4px 10px;background:#0f172a;border-top:1px solid #1e293b;flex-shrink:0;"
  });
  const autoScrollLabel = el("label", {
    style: "display:flex;align-items:center;gap:5px;font-size:11px;color:#94a3b8;cursor:pointer;"
  });
  const autoScrollCb = el("input", { type: "checkbox" });
  autoScrollCb.checked = true;
  autoScrollLabel.appendChild(autoScrollCb);
  autoScrollLabel.appendChild(document.createTextNode("Auto-scroll with playback"));
  transcriptBar.appendChild(autoScrollLabel);
  const copyTxBtn = el("button", {
    title: "Copy Transcript To Clipboard",
    style: "margin-left:auto;border:0;background:#1e293b;color:#cbd5e1;padding:4px 7px;border-radius:6px;cursor:pointer;font-size:13px;line-height:1;"
  }, "\u29C9");
  transcriptBar.appendChild(copyTxBtn);
  const transcriptPane = el("div", {
    style: "flex:1;min-height:0;overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:6px;"
  });
  transcriptOuter.appendChild(transcriptBar);
  transcriptOuter.appendChild(transcriptPane);
  const workspaceSlot = el("div", { style: "display:none;flex-shrink:0;position:relative;z-index:4;" });
  const lower = el("div", { style: "display:flex;flex:1;min-height:0;overflow:hidden;" });
  const taskCol = el("div", {
    style: "display:none;width:320px;min-width:260px;flex-shrink:0;background:#0b1220;border-left:1px solid #1e293b;border-top:1px solid #1e293b;padding:12px;box-sizing:border-box;overflow-y:auto;flex-direction:column;gap:10px;"
  });
  taskCol.appendChild(el("div", { style: "font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;" }, "Current Task"));
  const taskBody = el("div", { style: "display:flex;flex-direction:column;gap:10px;" });
  const taskBtns = el("div", { style: "display:flex;flex-direction:column;gap:8px;" });
  const taskHint = el("div", { style: "font-size:11px;color:#64748b;line-height:1.5;" });
  taskCol.append(taskBody, taskBtns, taskHint);
  lower.appendChild(transcriptOuter);
  lower.appendChild(taskCol);
  mainCol.appendChild(titleBar);
  mainCol.appendChild(navBar);
  mainCol.appendChild(tagInfo);
  mainCol.appendChild(timelineWrap);
  mainCol.appendChild(controls);
  mainCol.appendChild(searchBar);
  mainCol.appendChild(workspaceSlot);
  mainCol.appendChild(lower);
  body.appendChild(sidebarWrap);
  body.appendChild(mainCol);
  pane.appendChild(handle);
  pane.appendChild(utilBar);
  pane.appendChild(body);
  gridCard.appendChild(pane);
  return {
    pane, handle, body, utilBar, callTitle, callSub, statusEl, hideBtn, settingsBtn,
    pauseWrap, pauseCb, exitTagsBtn,
    prevNavBtn, nextNavBtn, navLabel, replayBtn, markBtn, tagInfo,
    sidebarList, sidebarWrap, sidebarTools, callsTab, tagsTab,
    timelineWrap, waveformImg, segCanvas, playheadDiv,
    outerPrevBtn, innerPrevBtn, stopBtn, pauseBtn, playBtn, innerNextBtn, outerNextBtn,
    timeEl, seekBar, pinBar,
    speedBtn, rememberSpeedCb,
    showAllEventsLabel, showAllEventsCb,
    searchBar, searchInput, searchCount, searchPrevBtn, searchNextBtn, searchCloseBtn,
    autoScrollCb, copyTxBtn,
    transcriptPane, transcriptOuter,
    workspaceSlot, lower, taskCol, taskBody, taskBtns, taskHint, titleBar
  };
}
/* ───────────────────── DRAW TIMELINE ───────────────────── */
function drawTimeline(canvas, wrap, durationMs, segments, phraseOffsets, eventOffsets, importOffsets, activeId) {
  const W = wrap.offsetWidth || 800, H = wrap.offsetHeight || 80;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  if (!durationMs) return;
  const agentH = Math.round(H * 0.4), custH = Math.round(H * 0.4);
  for (const seg of segments) {
    const x = (seg.startOffset / durationMs) * W;
    const w = Math.max(1, (seg.duration / durationMs) * W);
    const type = seg.spokenText || "NonTalk";
    if (type === "Agent") { ctx.fillStyle = SEGMENT_COLORS.Agent; ctx.fillRect(x, 0, w, agentH); }
    else if (type === "Customer") { ctx.fillStyle = SEGMENT_COLORS.Customer; ctx.fillRect(x, H - custH, w, custH); }
    else if (type === "CrossTalk") { ctx.fillStyle = SEGMENT_COLORS.CrossTalk; ctx.fillRect(x, 0, w, H); }
    else { ctx.fillStyle = "rgba(245,158,11,0.25)"; ctx.fillRect(x, 0, w, H); }
  }
  for (const offsetMs of (eventOffsets || [])) {
    const x = Math.round((offsetMs / durationMs) * W);
    ctx.strokeStyle = EVENT_PIN_COLOR; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const offsetMs of (phraseOffsets || [])) {
    const x = Math.round((offsetMs / durationMs) * W);
    ctx.strokeStyle = PHRASE_PIN_COLOR; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.fillStyle = PHRASE_PIN_COLOR;
    ctx.beginPath(); ctx.arc(x, 6, 4, 0, Math.PI * 2); ctx.fill();
  }
  for (const imp of (importOffsets || [])) {
    const x = Math.round((imp.ms / durationMs) * W);
    const color = imp.complete ? COMPLETE_COLOR : IMPORT_PIN_COLOR;
    const isActive = activeId && imp.id === activeId;
    ctx.strokeStyle = color; ctx.lineWidth = isActive ? 3 : 2;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, 6, isActive ? 7 : 5, 0, Math.PI * 2); ctx.fill();
    if (isActive) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, 6, 7, 0, Math.PI * 2); ctx.stroke(); }
  }
}
function updatePlayhead(playheadDiv, currentMs, durationMs) {
  if (!durationMs) return;
  playheadDiv.style.left = (Math.min(1, currentMs / durationMs) * 100) + "%";
}
/* ───────────────────── OPEN PLAYER PANE ───────────────────── */
function openPlayerPane(gridCard, onClose, options) {
  const opts = options || {};
  let configuredHeight = opts.initialHeight || "85vh";
  const settingsConfig = opts.settings || null;
  const els = buildPlayerPane(gridCard, opts.initialHeight, typeof opts.getMaxHeight === "function");
  let settings = resolveSettings(settingsConfig);
  let audio = null;
  let audioCtx = null;
  let audioSource = null;
  let lpFilter = null;
  let filterAvailable = false;
  let durationMs = 0;
  let transcriptRows = [];
  let phraseOffsets = [];
  let eventOffsets = [];
  let importedTimestamps = [];
  let segments = [];
  let currentSmid = null;
  let currentRow = null;
  let currentLabel = "";
  let seeking = false;
  let nonTalkSegments = [];
  let autoScrollEnabled = true;
  let scrollSnapTimer = null;
  let playlist = null;
  let playlistIdx = -1;
  let showAllEvents = !!settings.showAllEvents;
  let searchActive = false;
  let searchMatches = [];
  let searchMatchIdx = -1;
  let autoScrollBeforeSearch = true;
  let gridNav = null;
  let activeTab = "calls";
  let tagFilter = "all";
  let showHiddenTags = false;
  let tagSeq = 0;
  let tagHost = null;
  let groupList = [];
  let activeTagId = null;
  let activeNote = null;
  let pausedForTag = null;
  let pauseOverride = null;
  let jumpTimer = null;
  let lastTickMs = null;
  let lastSkipAt = 0;
  const eventsCache = new Map();
  const saved = loadSavedSpeed();
  let speedIdx = saved !== null ? SPEEDS.indexOf(saved) : 2;
  if (speedIdx < 0) speedIdx = 2;
  els.speedBtn.textContent = SPEEDS[speedIdx] + "x";
  if (SPEEDS[speedIdx] !== 1) {
    els.speedBtn.style.color = "#3b82f6";
    els.speedBtn.style.borderColor = "#3b82f6";
  }
  els.showAllEventsCb.checked = showAllEvents;
  /* ── Resize handle ── */
  let dragging = false, startY = 0, startH = 0;
  els.handle.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true; startY = e.clientY; startH = els.pane.offsetHeight;
    document.body.style.userSelect = "none";
  });
  function maxPaneHeight() {
    if (typeof opts.getMaxHeight === "function") {
      const m = Number(opts.getMaxHeight());
      if (isFinite(m) && m > 0) return Math.max(200, m);
    }
    return window.innerHeight * 0.95;
  }
  const onDocMouseMove = (e) => {
    if (!dragging) return;
    const newH = Math.max(200, Math.min(maxPaneHeight(), startH + (startY - e.clientY)));
    els.pane.style.height = newH + "px";
  };
  const onDocMouseUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = "";
    configuredHeight = els.pane.offsetHeight + "px";
    if (typeof opts.onHeightChange === "function") {
      try { opts.onHeightChange(els.pane.offsetHeight); } catch (e) { console.error(e); }
    }
    refreshPinsAndTimeline();
  };
  document.addEventListener("mousemove", onDocMouseMove);
  document.addEventListener("mouseup", onDocMouseUp);
  /* ── Audio context / filter ── */
  function initAudioCtx() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      lpFilter = audioCtx.createBiquadFilter();
      lpFilter.type = "lowpass"; lpFilter.frequency.value = 22050;
      lpFilter.connect(audioCtx.destination);
      filterAvailable = true;
    } catch (e) { console.warn("Web Audio unavailable:", e.message); filterAvailable = false; }
  }
  function connectAudioNode(audioEl) {
    if (!filterAvailable && !audioCtx) initAudioCtx();
    if (!filterAvailable) return;
    try {
      if (audioCtx.state === "suspended") audioCtx.resume();
      if (audioSource) { try { audioSource.disconnect(); } catch (_) {} }
      audioSource = audioCtx.createMediaElementSource(audioEl);
      audioSource.connect(lpFilter);
    } catch (e) { console.warn("Filter connect failed:", e.message); filterAvailable = false; }
  }
  function updateLpCutoff(rate) {
    if (!lpFilter || !filterAvailable) return;
    if (rate <= 2) { lpFilter.frequency.value = 22050; }
    else { const t = (rate - 2) / 4; lpFilter.frequency.value = Math.max(2000, 22050 * Math.pow(0.12, t)); }
  }
  /* ── Speed ── */
  function applySpeed(idx) {
    speedIdx = idx;
    const rate = SPEEDS[speedIdx];
    if (audio) audio.playbackRate = rate;
    updateLpCutoff(rate);
    els.speedBtn.textContent = rate + "x";
    els.speedBtn.style.color = rate === 1 ? "#94a3b8" : "#3b82f6";
    els.speedBtn.style.borderColor = rate === 1 ? "#475569" : "#3b82f6";
    if (els.rememberSpeedCb.checked) saveSpeed(rate);
  }
  els.speedBtn.onclick = () => { applySpeed((speedIdx + 1) % SPEEDS.length); };
  els.rememberSpeedCb.onchange = () => {
    if (els.rememberSpeedCb.checked) saveSpeed(SPEEDS[speedIdx]);
    else clearSavedSpeed();
  };
  els.speedBtn.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.deltaY < 0) applySpeed(Math.min(speedIdx + 1, SPEEDS.length - 1));
    else applySpeed(Math.max(speedIdx - 1, 0));
  }, { passive: false });
  const onSpeedKeys = (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
    if (e.shiftKey && e.key === "ArrowUp") { e.preventDefault(); applySpeed(Math.min(speedIdx + 1, SPEEDS.length - 1)); }
    else if (e.shiftKey && e.key === "ArrowDown") { e.preventDefault(); applySpeed(Math.max(speedIdx - 1, 0)); }
  };
  document.addEventListener("keydown", onSpeedKeys);
  /* ── Transcript scroll: breaks auto-scroll, snaps back after 5s ── */
  els.transcriptPane.addEventListener("wheel", () => {
    if (autoScrollEnabled) {
      autoScrollEnabled = false;
      els.autoScrollCb.checked = false;
    }
    if (scrollSnapTimer) clearTimeout(scrollSnapTimer);
    scrollSnapTimer = setTimeout(() => {
      if (!searchActive) {
        autoScrollEnabled = true;
        els.autoScrollCb.checked = true;
      }
    }, 5000);
  }, { passive: true });
  els.autoScrollCb.onchange = () => {
    autoScrollEnabled = els.autoScrollCb.checked;
    if (scrollSnapTimer) { clearTimeout(scrollSnapTimer); scrollSnapTimer = null; }
  };
  /* ── Copy transcript ── */
  els.copyTxBtn.onclick = () => {
    const lines = [];
    for (const row of transcriptRows) {
      const spRaw = (row.speaker || "").toLowerCase();
      const sp = spRaw === "agent" ? "Agent" : spRaw === "customer" ? "Customer" : "Unknown";
      const range = [row.formattedStartOffset, row.formattedEndOffset].filter(Boolean).join(" - ");
      const text = (row.text || "").trim();
      if (!text) continue;
      lines.push(sp + " (" + range + ")\n" + text);
    }
    navigator.clipboard.writeText(lines.join("\n"));
    els.copyTxBtn.textContent = "\u2713";
    setTimeout(() => { els.copyTxBtn.textContent = "\u29C9"; }, 1500);
  };
  /* ── Show events toggle (this call only) ── */
  els.showAllEventsCb.onchange = () => {
    showAllEvents = els.showAllEventsCb.checked;
    refreshPinsAndTimeline();
    updateOuterButtonState();
    buildSidebar();
  };
  /* ── Settings ── */
  function callName(row, fallback) {
    return fieldValue(row, settings.nameField) || fallback || "";
  }
  function callDetails(row) {
    if (!row) return "";
    return settings.stageFields.filter((f) => f !== settings.nameField).map((f) => fieldValue(row, f)).filter(Boolean).join(" \u00B7 ");
  }
  //##> ITEM TITLES: A playlist or grid item can carry titleFn() returning { title, tip }. When it does, that
  //##> replaces the Name calls by field everywhere the call is named (header, Calls tab, Tags tab), so a
  //##> module like Unpack can show live row numbers instead of long ids.
  function itemTitle(item, fallback) {
    if (item && typeof item.titleFn === "function") {
      try {
        const t = item.titleFn();
        if (t && t.title) return { title: String(t.title), tip: t.tip ? String(t.tip) : "" };
      } catch (e) { console.error(e); }
    }
    const name = callName(item && item.row, fallback);
    return { title: name, tip: "" };
  }
  function currentItemRef() {
    if (playlist && playlist[playlistIdx] && playlist[playlistIdx].smid === currentSmid) return playlist[playlistIdx];
    if (!playlist && gridNav && gridNav.items) return gridNav.items[gridNav.currentIndex] || null;
    return null;
  }
  function renderCallHeader() {
    const ref = currentItemRef();
    if (ref && typeof ref.titleFn === "function") {
      const t = itemTitle(ref, currentLabel);
      const details = callDetails(currentRow);
      els.callTitle.textContent = t.title;
      els.callTitle.title = t.tip || t.title;
      els.callSub.textContent = details;
      els.callSub.title = details;
      minimizedTitle.textContent = details ? `${t.title} \u00B7 ${details}` : t.title;
      return;
    }
    const name = callName(currentRow, currentLabel) || (currentSmid ? `SMID ${currentSmid}` : "No call loaded");
    const details = callDetails(currentRow);
    els.callTitle.textContent = name;
    els.callTitle.title = name;
    els.callSub.textContent = details;
    els.callSub.title = details;
    minimizedTitle.textContent = details ? `${name} \u00B7 ${details}` : name;
  }
  function eventsAllowed() {
    return !tagHost;
  }
  function refreshSettings() {
    settings = resolveSettings(settingsConfig);
    showAllEvents = eventsAllowed() && !!settings.showAllEvents;
    els.showAllEventsCb.checked = showAllEvents;
    els.showAllEventsLabel.style.display = eventsAllowed() ? "flex" : "none";
    renderCallHeader();
    refreshPinsAndTimeline();
    updateOuterButtonState();
    updateTagUI();
  }
  function saveSetting(key, value) {
    if (settingsConfig && settingsConfig.scope && typeof settingsConfig.onSave === "function") {
      const vals = Object.assign({}, typeof settingsConfig.getValues === "function" ? settingsConfig.getValues() : {});
      vals[key] = value;
      settingsConfig.onSave(vals);
    } else {
      saveGeneralSettings({ [key]: value });
    }
    settings = resolveSettings(settingsConfig);
  }
  function openSettings() {
    openSettingsDialog(settingsConfig, refreshSettings);
  }
  els.settingsBtn.onclick = openSettings;
  /* ── Tags ── */
  //##> TAG WORKFLOW: Each call's tags play in group order (the first timestamp field's tags by time,
  //##> then the next field's). Only one tag is active at a time. A tag becomes active when it's
  //##> picked, when Prev/Next lands on it, or when playback naturally crosses it (manual seeks don't
  //##> count). Edit Fields tags can pause playback near the next tag while the host says its field is
  //##> still being edited. The host (Unpack) owns saving tag state and moving the grid.
  function prepTags(list) {
    for (const t of (list || [])) {
      if (!t.id) t.id = "t" + (++tagSeq);
      if (typeof t.complete !== "boolean") t.complete = false;
      if (typeof t.hidden !== "boolean") t.hidden = false;
      if (!t.group) t.group = "Timestamps";
      if (!t.kind) t.kind = "nav";
    }
    return list || [];
  }
  function groupInfo(id) {
    return groupList.find((g) => g.id === id) || null;
  }
  function groupEnabled(id) {
    const g = groupInfo(id);
    return !g || g.enabled !== false;
  }
  function groupRank(id) {
    const i = groupList.findIndex((g) => g.id === id);
    return i === -1 ? groupList.length : i;
  }
  function groupName(t) {
    const g = groupInfo(t.group);
    return (g && g.label) || t.groupLabel || t.group;
  }
  function itemTags(item) {
    if (!item) return [];
    return (item.timestamps || []).filter((t) => !t.hidden && groupEnabled(t.group))
      .slice().sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.ms - b.ms);
  }
  function curItem() {
    return playlist && playlistIdx >= 0 ? playlist[playlistIdx] || null : null;
  }
  function curSeq() {
    return itemTags(curItem());
  }
  function activeTag() {
    if (!activeTagId) return null;
    return curSeq().find((t) => t.id === activeTagId) || null;
  }
  function findTag(id) {
    const item = curItem();
    return item ? (item.timestamps || []).find((t) => t.id === id) || null : null;
  }
  function tagGroups() {
    if (!playlist) return [];
    const out = [];
    playlist.forEach((item, i) => { if (item.timestamps && item.timestamps.length) out.push({ i, item, tags: item.timestamps }); });
    return out;
  }
  function tagTotal() {
    return tagGroups().reduce((n, g) => n + g.tags.filter((t) => groupEnabled(t.group)).length, 0);
  }
  function notifyTagChange(tag) {
    if (tagHost && typeof tagHost.onTagChange === "function") {
      try { tagHost.onTagChange(tag, curItem()); } catch (e) { console.error(e); }
    }
  }
  function hostEditing(tag) {
    if (!tag || !tagHost || typeof tagHost.isEditing !== "function") return false;
    try { return !!tagHost.isEditing(tag); } catch (_) { return false; }
  }
  function clearPause() {
    pausedForTag = null;
    els.pauseWrap.style.display = "none";
    els.nextNavBtn.classList.remove("nx-tag-pulse");
  }
  function showPause(tag) {
    pausedForTag = tag.id;
    els.pauseCb.checked = settings.tagAutoPause === false;
    els.pauseWrap.style.display = "flex";
    els.nextNavBtn.classList.add("nx-tag-pulse");
  }
  els.pauseCb.onchange = () => { saveSetting("tagAutoPause", !els.pauseCb.checked); };
  function activateTag(tag, how) {
    how = how || {};
    if (jumpTimer) { clearTimeout(jumpTimer); jumpTimer = null; }
    activeTagId = tag ? tag.id : null;
    clearPause();
    pauseOverride = null;
    activeNote = null;
    if (tag && how.seek && audio) {
      audio.currentTime = tag.ms / 1000;
      if (how.play) audio.play().catch(() => {});
    }
    if (tag) lastTickMs = tag.ms;
    if (tag && tagHost && typeof tagHost.onActiveTag === "function") {
      try { activeNote = tagHost.onActiveTag(tag, curItem()) || null; } catch (e) { console.error(e); }
    }
    updateTagUI();
  }
  function catchUpActivation() {
    if (!audio) return;
    const seq = curSeq();
    const i = seq.findIndex((t) => t.id === activeTagId);
    const act = seq[i], nxt = seq[i + 1];
    if (!act || !nxt || nxt.ms < act.ms) return;
    const cur = audio.currentTime * 1000;
    if (cur >= nxt.ms && !hostEditing(act)) activateTag(nxt);
  }
  function maybePause(act, nxt, curMs) {
    if (!tagHost || !act || act.kind !== "edit" || act.complete) return false;
    if (settings.tagAutoPause === false) return false;
    if (pauseOverride === act.id || pausedForTag === act.id) return false;
    if (!hostEditing(act) && !settings.tagPauseIncomplete) return false;
    if (curMs < act.ms) return false;
    const nearEnd = durationMs > 0 && curMs >= durationMs - 750;
    if (!nearEnd) return false;
    if (audio) audio.pause();
    showPause(act);
    return true;
  }
  function tagTick(curMs) {
    const prev = lastTickMs;
    lastTickMs = curMs;
    const seq = curSeq();
    if (!seq.length) return;
    const i = seq.findIndex((t) => t.id === activeTagId);
    const act = seq[i], nxt = seq[i + 1];
    if (act && maybePause(act, nxt, curMs)) return;
    if (!act || !nxt || nxt.ms < act.ms) return;
    const natural = prev !== null && curMs >= prev && (curMs - prev < 2000 || Date.now() - lastSkipAt < 1500);
    if (!natural || prev >= nxt.ms || curMs < nxt.ms) return;
    if (hostEditing(act)) return;
    activateTag(nxt);
  }
  function completeTag(id, how) {
    how = how || {};
    const tag = findTag(id);
    if (!tag) return;
    tag.complete = true;
    notifyTagChange(tag);
    const wasPaused = !!pausedForTag;
    clearPause();
    pauseOverride = tag.id;
    const seq = curSeq();
    const i = seq.findIndex((t) => t.id === tag.id);
    const nxt = i >= 0 ? seq[i + 1] : null;
    if (settings.tagAfterComplete !== "continue" && nxt && activeTagId === tag.id) {
      if (jumpTimer) clearTimeout(jumpTimer);
      const go = () => { jumpTimer = null; if (activeTagId === tag.id) activateTag(nxt, { seek: true, play: true }); };
      if (how.delay) jumpTimer = setTimeout(go, how.delay);
      else go();
    } else if (audio && audio.paused && wasPaused) {
      audio.play().catch(() => {});
      catchUpActivation();
    } else {
      catchUpActivation();
    }
    updateTagUI();
  }
  function uncompleteTag(id) {
    const tag = findTag(id);
    if (!tag) return;
    tag.complete = false;
    pauseOverride = null;
    notifyTagChange(tag);
    updateTagUI();
  }
  function resumeFromEdit() {
    if (pausedForTag) {
      pauseOverride = pausedForTag;
      clearPause();
      if (audio) audio.play().catch(() => {});
    }
    catchUpActivation();
    updateTagUI();
  }
  els.markBtn.onclick = () => {
    const t = activeTag();
    if (!t) return;
    if (t.complete) uncompleteTag(t.id);
    else completeTag(t.id);
  };
  els.replayBtn.onclick = () => {
    const t = activeTag();
    if (!t || !audio) return;
    clearPause();
    pauseOverride = null;
    audio.currentTime = t.ms / 1000;
    lastTickMs = t.ms;
    audio.play().catch(() => {});
    updateTagUI();
  };
  function navText(dir, tag, fallback) {
    if (tag) return dir < 0 ? `\u25C0 ${tag.label}` : `${tag.label} \u25B6`;
    return fallback;
  }
  function renderTagInfo(act) {
    const info = els.tagInfo;
    info.innerHTML = "";
    if (!act) { info.style.display = "none"; return; }
    info.style.display = "flex";
    const kindText = act.kind === "edit" ? "Edit" : "Navigation";
    info.appendChild(el("span", { style: "color:#64748b;" }, "Active tag:"));
    info.appendChild(el("span", { style: `font-weight:700;color:${act.complete ? COMPLETE_COLOR : "#fdba74"};${act.complete ? "text-decoration:line-through;text-decoration-color:#ef4444;" : ""}` }, `${act.label} @ ${fmtTime(act.ms)}`));
    info.appendChild(el("span", { style: "color:#64748b;" }, `${groupName(act)} \u00B7 ${kindText}`));
    if (activeNote && activeNote.text) {
      info.appendChild(el("span", { style: "color:#fbbf24;font-weight:600;" }, activeNote.text));
      if (activeNote.action && typeof activeNote.run === "function") {
        const a = el("button", { style: "border:1px solid #fbbf24;background:transparent;color:#fbbf24;padding:1px 8px;border-radius:999px;font-size:11px;cursor:pointer;" }, activeNote.action);
        a.onclick = () => {
          let res = null;
          try { res = activeNote.run(); } catch (e) { console.error(e); }
          activeNote = res || null;
          renderTagInfo(activeTag());
        };
        info.appendChild(a);
      }
    }
  }
  function updateTagUI() {
    const seq = curSeq();
    const act = activeTag();
    if (playlist && playlist.length && seq.length) {
      const i = seq.findIndex((t) => t.id === activeTagId);
      const prevTag = i > 0 ? seq[i - 1] : null;
      const nextTag = i >= 0 ? seq[i + 1] || null : seq[0];
      els.prevNavBtn.textContent = navText(-1, prevTag, "\u25C0 Prev Call");
      els.nextNavBtn.textContent = navText(1, nextTag, "Next Call \u25B6");
      els.prevNavBtn.title = prevTag ? `Go to ${prevTag.label} at ${fmtTime(prevTag.ms)}` : "Previous call";
      els.nextNavBtn.title = nextTag ? `Go to ${nextTag.label} at ${fmtTime(nextTag.ms)}` : "Next call";
      els.prevNavBtn.style.opacity = !prevTag && playlistIdx <= 0 ? "0.4" : "1";
      els.nextNavBtn.style.opacity = !nextTag && playlistIdx >= playlist.length - 1 ? "0.4" : "1";
    } else if (playlist && playlist.length) {
      els.prevNavBtn.textContent = "\u25C0 Prev";
      els.nextNavBtn.textContent = "Next \u25B6";
      els.prevNavBtn.title = "Previous call";
      els.nextNavBtn.title = "Next call";
    } else {
      els.prevNavBtn.textContent = "\u25C0 Prev";
      els.nextNavBtn.textContent = "Next \u25B6";
    }
    els.replayBtn.style.display = act ? "" : "none";
    const editable = !!(act && tagHost && act.kind === "edit");
    els.markBtn.style.display = editable ? "" : "none";
    if (editable) {
      els.markBtn.textContent = act.complete ? "\u21A9 Mark Incomplete" : "\u2713 Mark Complete";
      els.markBtn.style.background = act.complete ? "#475569" : "#16a34a";
      els.markBtn.title = act.complete ? "Put this tag back to not done." : "Mark this tag as done and move on.";
    }
    els.exitTagsBtn.style.display = tagHost ? "" : "none";
    if (tagHost && tagHost.exitLabel) els.exitTagsBtn.textContent = tagHost.exitLabel;
    renderTagInfo(act);
    renderCallHeader();
    refreshPinsAndTimeline();
    buildSidebar();
  }
  els.exitTagsBtn.onclick = () => {
    if (tagHost && typeof tagHost.onExit === "function") tagHost.onExit();
  };
  //##> TASK CARD: When a module drives tag playback (tagHost), the active-tag info, Mark Complete, Replay Tag,
  //##> and the paused message move out of the crowded center into a card on the right of the transcript.
  //##> They move back to their normal spots when tag playback ends.
  let taskMode = false;
  const homeSpots = {
    tagInfo: () => els.timelineWrap.parentNode.insertBefore(els.tagInfo, els.timelineWrap),
    replayBtn: () => els.prevNavBtn.parentNode.appendChild(els.replayBtn),
    markBtn: () => els.prevNavBtn.parentNode.appendChild(els.markBtn),
    pauseWrap: () => els.utilBar.insertBefore(els.pauseWrap, els.exitTagsBtn)
  };
  function setTaskMode(on) {
    if (on === taskMode) return;
    taskMode = on;
    if (on) {
      els.taskBody.appendChild(els.tagInfo);
      els.taskBtns.appendChild(els.markBtn);
      els.taskBtns.appendChild(els.replayBtn);
      els.taskBtns.appendChild(els.pauseWrap);
      els.tagInfo.style.flexDirection = "column";
      els.tagInfo.style.alignItems = "flex-start";
      els.tagInfo.style.justifyContent = "flex-start";
      els.tagInfo.style.padding = "0";
      els.tagInfo.style.borderBottom = "0";
      els.tagInfo.style.background = "transparent";
      els.pauseWrap.style.flexDirection = "column";
      els.pauseWrap.style.alignItems = "flex-start";
      els.markBtn.style.width = "100%";
      els.replayBtn.style.width = "100%";
      els.taskCol.style.display = "flex";
    } else {
      els.tagInfo.style.flexDirection = "";
      els.tagInfo.style.alignItems = "center";
      els.tagInfo.style.justifyContent = "center";
      els.tagInfo.style.padding = "4px 12px";
      els.tagInfo.style.borderBottom = "1px solid #1e293b";
      els.tagInfo.style.background = "#0f172a";
      els.pauseWrap.style.flexDirection = "";
      els.pauseWrap.style.alignItems = "center";
      els.markBtn.style.width = "";
      els.replayBtn.style.width = "";
      homeSpots.tagInfo();
      homeSpots.replayBtn();
      homeSpots.markBtn();
      homeSpots.pauseWrap();
      els.taskCol.style.display = "none";
    }
  }
  function setTaskHint(text) {
    els.taskHint.textContent = text || "";
  }
  function setWorkspace(node) {
    els.workspaceSlot.innerHTML = "";
    if (node) {
      els.workspaceSlot.appendChild(node);
      els.workspaceSlot.style.display = "block";
    } else {
      els.workspaceSlot.style.display = "none";
    }
    setTimeout(() => { if (!closedPlayer) refreshPinsAndTimeline(); }, 30);
  }
  /* ── Pins / timeline helpers ── */
  function getVisiblePins() {
    const imports = importedTimestamps.filter((t) => !t.hidden && groupEnabled(t.group));
    return {
      phrases: showAllEvents || !imports.length ? (tagHost ? [] : phraseOffsets) : [],
      events: showAllEvents ? eventOffsets : [],
      imports
    };
  }
  function refreshPinsAndTimeline() {
    const vis = getVisiblePins();
    drawTimeline(els.segCanvas, els.timelineWrap, durationMs, segments, vis.phrases, vis.events, vis.imports, activeTagId);
    buildPinBar(vis);
  }
  function stopAudio() {
    if (audioSource) { try { audioSource.disconnect(); } catch (_) {} audioSource = null; }
    if (audio) { audio.pause(); audio.src = ""; audio = null; }
  }
  function setStatus(msg) { els.statusEl.textContent = msg; }
  /* ── Time / playhead / transcript sync ── */
  function updateTime() {
    if (!audio || !durationMs) return;
    const curMs = audio.currentTime * 1000;
    els.timeEl.textContent = `${fmtTime(curMs)} / ${fmtTime(durationMs)}`;
    const total = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : durationMs / 1000;
    if (!seeking && total > 0) els.seekBar.value = Math.round((audio.currentTime / total) * 1000);
    updatePlayhead(els.playheadDiv, curMs, durationMs);
    syncTranscript(curMs);
  }
  function syncTranscript(curMs) {
    if (!audio || audio.currentTime <= 0.5) return;
    const curSec = curMs / 1000;
    let activeIdx = -1;
    for (let i = 0; i < transcriptRows.length; i++) {
      if ((transcriptRows[i].totalSecondsFromStart || 0) <= curSec) activeIdx = i;
    }
    els.transcriptPane.querySelectorAll("[data-tx-idx]").forEach((b) => {
      const idx = parseInt(b.getAttribute("data-tx-idx"));
      const isActive = idx === activeIdx;
      b.style.outline = isActive ? "2px solid #3b82f6" : "none";
      if (autoScrollEnabled && !searchActive && isActive && b.getAttribute("data-active") !== "1" && audio && audio.currentTime > 0.5) {
        b.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      b.setAttribute("data-active", isActive ? "1" : "0");
    });
  }
  /* ── Pin bar ── */
  function pinBtn(color, text, title, onClick, complete, active) {
    const c = complete ? COMPLETE_COLOR : color;
    const btn = el("button", {
      style: `border:1px solid ${c};background:${active ? c : "transparent"};color:${active ? "#111827" : c};font-weight:${active ? 700 : 400};padding:2px 7px;border-radius:999px;font-size:10px;cursor:pointer;${complete ? "text-decoration:line-through;text-decoration-color:#ef4444;" : ""}`,
      title
    }, text);
    btn.onclick = onClick;
    return btn;
  }
  function buildPinBar(vis) {
    els.pinBar.innerHTML = "";
    for (const imp of vis.imports) {
      els.pinBar.appendChild(pinBtn(IMPORT_PIN_COLOR, `${imp.label} ${fmtTime(imp.ms)}`, `${imp.label} at ${fmtTime(imp.ms)}${imp.complete ? " (complete)" : ""}`, () => activateTag(imp, { seek: true, play: true }), imp.complete, imp.id === activeTagId));
    }
    vis.phrases.forEach((ms, i) => {
      els.pinBar.appendChild(pinBtn(PHRASE_PIN_COLOR, `P${i + 1} ${fmtTime(ms)}`, `Phrase hit at ${fmtTime(ms)}`, () => { if (audio) audio.currentTime = ms / 1000; }));
    });
    vis.events.forEach((ms, i) => {
      els.pinBar.appendChild(pinBtn(EVENT_PIN_COLOR, `E${i + 1} ${fmtTime(ms)}`, `Event at ${fmtTime(ms)}`, () => { if (audio) audio.currentTime = ms / 1000; }));
    });
  }
  /* ── Non-talk skip ── */
  function skipNonTalk() {
    if (!audio || !nonTalkSegments.length) return;
    const curMs = audio.currentTime * 1000;
    for (const seg of nonTalkSegments) {
      if (curMs >= seg.startOffset - 200 && curMs < seg.startOffset + seg.duration - 200) {
        audio.currentTime = (seg.startOffset + seg.duration) / 1000;
        lastSkipAt = Date.now();
        return;
      }
    }
  }
  /* ── Sidebar ── */
  function syncTabs() {
    const total = tagTotal();
    els.tagsTab.style.display = total ? "" : "none";
    els.tagsTab.textContent = total ? `Tags (${total})` : "Tags";
    if (!total && activeTab === "tags") activeTab = "calls";
    const paint = (b, on) => {
      b.style.color = on ? "#93c5fd" : "#64748b";
      b.style.borderBottomColor = on ? "#3b82f6" : "transparent";
    };
    paint(els.callsTab, activeTab === "calls");
    paint(els.tagsTab, activeTab === "tags");
  }
  els.callsTab.onclick = () => { activeTab = "calls"; buildSidebar(); };
  els.tagsTab.onclick = () => { activeTab = "tags"; buildSidebar(); };
  function buildSidebar() {
    if (closedPlayer) return;
    syncTabs();
    els.sidebarList.innerHTML = "";
    els.sidebarTools.innerHTML = "";
    els.sidebarTools.style.display = "none";
    if (activeTab === "tags") buildTagsTab();
    else buildCallsTab();
  }
  function callRow(name, details, isCurrent, isAdjacent, onClick, tip) {
    const row = el("div", {
      style: `padding:7px 12px;cursor:pointer;border-bottom:1px solid rgba(30,41,59,0.4);background:${isCurrent ? "#1e293b" : isAdjacent ? "#111827" : "transparent"};`
    });
    row.appendChild(el("div", { style: `font-size:12px;color:${isCurrent ? "#93c5fd" : "#cbd5e1"};font-weight:${isCurrent ? "700" : "400"};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;` }, name));
    if (details) row.appendChild(el("div", { style: "font-size:10px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px;" }, details));
    row.title = (tip ? tip + " \u00B7 " : "") + (details ? `${name} \u00B7 ${details}` : name);
    row.onclick = onClick;
    if (isCurrent) row.dataset.current = "1";
    return row;
  }
  function subRow(text, title, onClick, complete, active) {
    const base = complete ? COMPLETE_COLOR : (active ? "#fdba74" : "#64748b");
    const r = el("div", {
      style: `padding:3px 12px 3px 24px;font-size:11px;color:${base};cursor:pointer;font-weight:${active ? 700 : 400};${complete ? "text-decoration:line-through;text-decoration-color:#ef4444;" : ""}`,
      title: title || text
    }, (active ? "\u25B8 " : "") + text);
    r.onmouseenter = () => { if (!complete) r.style.color = "#93c5fd"; };
    r.onmouseleave = () => { r.style.color = base; };
    r.onclick = (e) => { e.stopPropagation(); onClick(); };
    return r;
  }
  function moreRow(text) {
    return el("div", { style: "padding:6px 12px;font-size:10px;color:#475569;text-align:center;" }, text);
  }
  function scrollCurrentIntoView(block) {
    const cur = els.sidebarList.querySelector("[data-current='1']");
    if (cur) cur.scrollIntoView({ block: block || "nearest" });
  }
  function buildCallsTab() {
    if (playlist && playlist.length) {
      for (let i = 0; i < playlist.length; i++) {
        const item = playlist[i];
        const isCurrent = i === playlistIdx;
        const isAdjacent = i === playlistIdx - 1 || i === playlistIdx + 1;
        const it = itemTitle(item, item.displayLabel || item.key);
        els.sidebarList.appendChild(callRow(it.title, callDetails(item.row), isCurrent, isAdjacent, () => loadPlaylistIndex(i), it.tip));
        if (!isCurrent && !isAdjacent) continue;
        if (isCurrent) {
          for (const ts of itemTags(item)) {
            els.sidebarList.appendChild(subRow(`${ts.label} \u2022 ${fmtTime(ts.ms)}`, null, () => jumpToTag(i, ts), ts.complete, ts.id === activeTagId));
          }
        }
        if (showAllEvents) {
          for (const evt of (eventsCache.get(item.smid) || [])) {
            els.sidebarList.appendChild(subRow(`${evt.label || "Event"} \u2022 ${fmtTime(evt.ms)}`, null, () => {
              if (i === playlistIdx && audio) audio.currentTime = evt.ms / 1000;
              else loadPlaylistIndex(i, evt.ms);
            }));
          }
        }
      }
      scrollCurrentIntoView();
      return;
    }
    if (gridNav && gridNav.items && gridNav.items.length) {
      const items = gridNav.items;
      const cur = Math.max(0, Math.min(items.length - 1, gridNav.currentIndex || 0));
      const start = Math.max(0, cur - GRID_LIST_WINDOW);
      const end = Math.min(items.length, cur + GRID_LIST_WINDOW + 1);
      if (start > 0) els.sidebarList.appendChild(moreRow(`${start.toLocaleString()} earlier call${start === 1 ? "" : "s"}`));
      for (let i = start; i < end; i++) {
        const row = items[i] && items[i].row;
        const isCurrent = i === cur;
        const it = itemTitle(items[i], `Call ${i + 1}`);
        els.sidebarList.appendChild(callRow(it.title, callDetails(row), isCurrent, i === cur - 1 || i === cur + 1, () => { if (i !== gridNav.currentIndex) gridNav.onNavigate(i); }, it.tip));
        if (isCurrent && showAllEvents && currentSmid) {
          for (const evt of (eventsCache.get(currentSmid) || [])) {
            els.sidebarList.appendChild(subRow(`${evt.label || "Event"} \u2022 ${fmtTime(evt.ms)}`, null, () => { if (audio) audio.currentTime = evt.ms / 1000; }));
          }
        }
      }
      if (end < items.length) els.sidebarList.appendChild(moreRow(`${(items.length - end).toLocaleString()} more call${items.length - end === 1 ? "" : "s"}`));
      scrollCurrentIntoView();
      return;
    }
    els.sidebarList.appendChild(moreRow("No calls loaded."));
  }
  function toolBtn(text, on, title, onClick) {
    const b = el("button", {
      style: `border:1px solid ${on ? "#3b82f6" : "#334155"};background:${on ? "#1e3a8a" : "transparent"};color:${on ? "#dbeafe" : "#94a3b8"};padding:3px 8px;border-radius:6px;font-size:10px;cursor:pointer;`,
      title
    }, text);
    b.onclick = onClick;
    return b;
  }
  function setGroupEnabled(id, on) {
    const g = groupInfo(id);
    if (!g) return;
    g.enabled = on;
    if (tagHost && typeof tagHost.onGroupsChange === "function") {
      try { tagHost.onGroupsChange(groupList.map((x) => ({ id: x.id, enabled: x.enabled !== false }))); } catch (e) { console.error(e); }
    }
    const act = activeTag();
    if (!act) {
      const seq = curSeq();
      if (seq.length) activateTag(seq[0], { seek: true });
      else updateTagUI();
    } else updateTagUI();
  }
  function buildTagsTab() {
    const groups = tagGroups();
    const hiddenCount = groups.reduce((n, g) => n + g.tags.filter((t) => t.hidden && groupEnabled(t.group)).length, 0);
    els.sidebarTools.style.display = "flex";
    const showRow = el("div", { style: "display:flex;align-items:center;gap:4px;flex-wrap:wrap;" });
    showRow.appendChild(el("span", { style: "font-size:10px;color:#64748b;margin-right:2px;" }, "Show:"));
    showRow.appendChild(toolBtn("All", tagFilter === "all", "Show every tag", () => { tagFilter = "all"; buildSidebar(); }));
    showRow.appendChild(toolBtn("Incomplete", tagFilter === "incomplete", "Only show tags that haven't been marked complete", () => { tagFilter = "incomplete"; buildSidebar(); }));
    if (hiddenCount) showRow.appendChild(toolBtn(showHiddenTags ? "Hide hidden" : `Hidden (${hiddenCount})`, showHiddenTags, "Show or hide tags you've hidden", () => { showHiddenTags = !showHiddenTags; buildSidebar(); }));
    els.sidebarTools.appendChild(showRow);
    if (groupList.length > 1) {
      const gRow = el("div", { style: "display:flex;flex-direction:column;gap:2px;" });
      gRow.appendChild(el("span", { style: "font-size:10px;color:#64748b;" }, "Timestamp fields:"));
      const enabledCount = groupList.filter((g) => g.enabled !== false).length;
      for (const g of groupList) {
        const on = g.enabled !== false;
        const cb = el("input", { type: "checkbox", checked: on, disabled: on && enabledCount <= 1 });
        cb.onchange = () => setGroupEnabled(g.id, cb.checked);
        const kind = g.kind === "edit" ? "Edit" : "Navigation";
        gRow.appendChild(el("label", { style: `display:flex;align-items:center;gap:5px;font-size:11px;color:${on ? "#e2e8f0" : "#64748b"};cursor:pointer;`, title: on && enabledCount <= 1 ? "At least one timestamp field has to stay on." : `Turn ${g.label} tags on or off` }, cb, `${g.label} (${kind})`));
      }
      els.sidebarTools.appendChild(gRow);
    }
    let shownGroups = 0;
    for (const g of groups) {
      const visible = g.tags.filter((t) => groupEnabled(t.group));
      const tags = visible.filter((t) => (showHiddenTags || !t.hidden) && (tagFilter === "all" || !t.complete))
        .slice().sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.ms - b.ms);
      const isActive = g.i === playlistIdx;
      if (!tags.length && !isActive) continue;
      shownGroups++;
      const done = visible.filter((t) => t.complete).length;
      const card = el("div", { style: `margin:6px 8px;border-radius:8px;background:${isActive ? "#172036" : "#0f172a"};border:1px solid ${isActive ? "#3b82f6" : "#1e293b"};overflow:hidden;` });
      if (isActive) card.dataset.current = "1";
      const head = el("div", { style: "display:flex;align-items:center;gap:6px;padding:6px 8px;cursor:pointer;border-bottom:1px solid #1e293b;" });
      const it = itemTitle(g.item, g.item.displayLabel || g.item.key);
      const name = it.title;
      const det = callDetails(g.item.row);
      const nameWrap = el("div", { style: "flex:1;min-width:0;", title: (it.tip ? it.tip + " \u00B7 " : "") + name + (det ? " \u00B7 " + det : "") });
      nameWrap.appendChild(el("div", { style: `font-size:11px;font-weight:700;color:${isActive ? "#93c5fd" : "#cbd5e1"};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;` }, name));
      if (det) nameWrap.appendChild(el("div", { style: "font-size:9px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" }, det));
      head.appendChild(nameWrap);
      head.appendChild(el("div", { style: `font-size:10px;color:${visible.length && done === visible.length ? "#4ade80" : "#64748b"};flex-shrink:0;` }, `${done}/${visible.length} done`));
      head.onclick = () => { if (g.i !== playlistIdx) loadPlaylistIndex(g.i); };
      card.appendChild(head);
      const list = el("div", { style: "display:flex;flex-direction:column;padding:4px;" });
      if (!tags.length) list.appendChild(el("div", { style: "font-size:10px;color:#475569;padding:4px;" }, tagFilter === "incomplete" ? "All tags on this call are complete." : "No tags to show."));
      let lastGroup = null;
      const multi = groupList.filter((x) => x.enabled !== false).length > 1;
      for (const t of tags) {
        if (multi && t.group !== lastGroup) {
          lastGroup = t.group;
          list.appendChild(el("div", { style: "font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;padding:4px 6px 1px;" }, groupName(t)));
        }
        const isAct = isActive && t.id === activeTagId;
        const row = el("div", { style: `display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:5px;cursor:pointer;opacity:${t.hidden ? 0.45 : 1};background:${isAct ? "#1e3a8a" : ""};` });
        if (isAct) row.dataset.activeTag = "1";
        row.onmouseenter = () => { if (!isAct) row.style.background = "#1e293b"; };
        row.onmouseleave = () => { row.style.background = isAct ? "#1e3a8a" : ""; };
        const text = el("div", { style: `flex:1;min-width:0;font-size:11px;color:${t.complete ? COMPLETE_COLOR : "#e2e8f0"};font-weight:${isAct ? 700 : 400};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${t.complete ? "text-decoration:line-through;text-decoration-color:#ef4444;" : ""}` }, t.label);
        const time = el("div", { style: "font-size:10px;color:#64748b;font-family:monospace;flex-shrink:0;" }, fmtTime(t.ms));
        const hideX = el("span", { style: "font-size:11px;color:#475569;cursor:pointer;padding:0 2px;flex-shrink:0;", title: t.hidden ? "Unhide this tag" : "Hide this tag" }, t.hidden ? "\u21BA" : "\u2715");
        hideX.onclick = (e) => {
          e.stopPropagation();
          t.hidden = !t.hidden;
          notifyTagChange(t);
          if (t.hidden && t.id === activeTagId) {
            const seq = curSeq();
            activateTag(seq.find((x) => x.ms >= t.ms) || seq[0] || null);
          } else updateTagUI();
        };
        row.title = `${t.label} at ${fmtTime(t.ms)} (${groupName(t)})${t.complete ? " \u00B7 complete" : ""}`;
        row.append(text, time, hideX);
        row.onclick = () => { if (!t.hidden) jumpToTag(g.i, t); };
        list.appendChild(row);
      }
      card.appendChild(list);
      els.sidebarList.appendChild(card);
    }
    if (!shownGroups) els.sidebarList.appendChild(moreRow(tagFilter === "incomplete" ? "Every tag is complete." : "No tags to show."));
    scrollCurrentIntoView("center");
  }
  function jumpToTag(i, tag) {
    if (i === playlistIdx) { activateTag(tag, { seek: true, play: true }); return; }
    loadPlaylistIndex(i, tag.ms, tag.id);
  }
  async function prefetchAdjacentEvents(idx) {
    if (!playlist || tagHost) return;
    const toFetch = [];
    if (idx > 0 && playlist[idx - 1] && !eventsCache.has(playlist[idx - 1].smid)) toFetch.push(playlist[idx - 1].smid);
    if (idx < playlist.length - 1 && playlist[idx + 1] && !eventsCache.has(playlist[idx + 1].smid)) toFetch.push(playlist[idx + 1].smid);
    for (const smid of toFetch) {
      try {
        const raw = await fetchJson(AUTOSUMMARY_URL(smid));
        const events = Array.isArray(raw) ? raw : (raw.contactEvents || raw.events || []);
        eventsCache.set(smid, events.map((e, i) => ({
          label: e.eventName || e.eventType || `Event ${i + 1}`,
          ms: e.startOffsetInMs || e.startOffset || 0
        })).filter((e) => e.ms > 0));
      } catch (_) {
        eventsCache.set(smid, []);
      }
    }
    if (!closedPlayer) buildSidebar();
  }
  /* ── Playlist navigation UI ── */
  function updatePlaylistUI() {
    if (!playlist || !playlist.length) {
      els.prevNavBtn.style.display = "none";
      els.nextNavBtn.style.display = "none";
      els.navLabel.textContent = "";
      return;
    }
    els.prevNavBtn.style.display = "";
    els.nextNavBtn.style.display = "";
    els.navLabel.textContent = `${playlistIdx + 1} / ${playlist.length}`;
    els.prevNavBtn.style.opacity = playlistIdx <= 0 ? "0.4" : "1";
    els.nextNavBtn.style.opacity = playlistIdx >= playlist.length - 1 ? "0.4" : "1";
    updateTagUI();
  }
  els.prevNavBtn.onclick = () => {
    if (playlist && playlist.length) {
      const seq = curSeq();
      const i = seq.findIndex((t) => t.id === activeTagId);
      if (i > 0) { activateTag(seq[i - 1], { seek: true, play: true }); return; }
      if (playlistIdx > 0) loadPlaylistIndex(playlistIdx - 1);
    } else if (gridNav) {
      if (gridNav.currentIndex > 0) gridNav.onNavigate(gridNav.currentIndex - 1);
    }
  };
  els.nextNavBtn.onclick = () => {
    if (playlist && playlist.length) {
      const seq = curSeq();
      const i = seq.findIndex((t) => t.id === activeTagId);
      const nxt = i >= 0 ? seq[i + 1] : seq[0];
      if (nxt) {
        if (pausedForTag) pauseOverride = pausedForTag;
        activateTag(nxt, { seek: true, play: true });
        return;
      }
      clearPause();
      if (playlistIdx < playlist.length - 1) loadPlaylistIndex(playlistIdx + 1);
    } else if (gridNav) {
      if (gridNav.currentIndex < gridNav.items.length - 1) gridNav.onNavigate(gridNav.currentIndex + 1);
    }
  };
  /* ── Transport button handlers ── */
  els.playBtn.onclick = () => {
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
  };
  els.pauseBtn.onclick = () => {
    if (audio && !audio.paused) audio.pause();
  };
  els.stopBtn.onclick = () => {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    els.playBtn.style.background = "#3b82f6";
    updateTime();
  };
  els.innerPrevBtn.onclick = () => {
    if (audio) audio.currentTime = Math.max(0, audio.currentTime - 5);
  };
  els.innerNextBtn.onclick = () => {
    if (audio) audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
  };
  function getAllSortedEventMs() {
    const vis = getVisiblePins();
    const all = vis.events.slice();
    for (const imp of vis.imports) all.push(imp.ms);
    all.sort((a, b) => a - b);
    return all;
  }
  /* ── Grid navigation ── */
  function setGridNav(ctx) {
    gridNav = ctx;
    updateOuterButtonState();
    updateGridNavUI();
    if (!playlist) buildSidebar();
  }
  function updateGridNavUI() {
    if (gridNav && !playlist) {
      els.prevNavBtn.style.display = "";
      els.nextNavBtn.style.display = "";
      els.prevNavBtn.textContent = "\u25C0 Prev";
      els.nextNavBtn.textContent = "Next \u25B6";
      els.navLabel.textContent = `${gridNav.currentIndex + 1} / ${gridNav.items.length}`;
      els.prevNavBtn.style.opacity = gridNav.currentIndex <= 0 ? "0.4" : "1";
      els.nextNavBtn.style.opacity = gridNav.currentIndex >= gridNav.items.length - 1 ? "0.4" : "1";
      els.prevNavBtn.title = gridNav.currentIndex <= 0 ? "No previous call" : "Previous call";
      els.nextNavBtn.title = gridNav.currentIndex >= gridNav.items.length - 1 ? "No next call" : "Next call";
    }
  }
  function playlistMode() {
    return !!(playlist && playlist.length);
  }
  function updateOuterButtonState() {
    if (playlistMode()) {
      const hasEvents = getAllSortedEventMs().length > 0;
      const hasCalls = playlist.length > 1;
      els.outerPrevBtn.disabled = !hasEvents && !hasCalls;
      els.outerPrevBtn.style.opacity = hasEvents || hasCalls ? "1" : "0.3";
      els.outerPrevBtn.title = hasEvents ? "Previous tag or event" : "Previous call";
      els.outerNextBtn.disabled = !hasEvents && !hasCalls;
      els.outerNextBtn.style.opacity = hasEvents || hasCalls ? "1" : "0.3";
      els.outerNextBtn.title = hasEvents ? "Next tag or event" : "Next call";
    } else if (gridNav) {
      const canPrev = gridNav.currentIndex > 0;
      const canNext = gridNav.currentIndex < gridNav.items.length - 1;
      els.outerPrevBtn.disabled = !canPrev;
      els.outerPrevBtn.style.opacity = canPrev ? "1" : "0.3";
      els.outerPrevBtn.title = canPrev ? "Previous call" : "No previous call";
      els.outerNextBtn.disabled = !canNext;
      els.outerNextBtn.style.opacity = canNext ? "1" : "0.3";
      els.outerNextBtn.title = canNext ? "Next call" : "No next call";
    }
  }
  els.outerPrevBtn.onclick = () => {
    if (playlistMode()) {
      const allEvts = getAllSortedEventMs();
      const curMs = audio ? audio.currentTime * 1000 : 0;
      let target = null;
      for (let i = allEvts.length - 1; i >= 0; i--) {
        if (allEvts[i] < curMs - 500) { target = allEvts[i]; break; }
      }
      if (target !== null && audio) { audio.currentTime = target / 1000; }
      else if (playlistIdx > 0) { loadPlaylistIndex(playlistIdx - 1); }
    } else if (gridNav) {
      if (gridNav.currentIndex > 0) gridNav.onNavigate(gridNav.currentIndex - 1);
    }
  };
  els.outerNextBtn.onclick = () => {
    if (playlistMode()) {
      const allEvts = getAllSortedEventMs();
      const curMs = audio ? audio.currentTime * 1000 : 0;
      let target = null;
      for (let i = 0; i < allEvts.length; i++) {
        if (allEvts[i] > curMs + 500) { target = allEvts[i]; break; }
      }
      if (target !== null && audio) { audio.currentTime = target / 1000; }
      else if (playlistIdx < playlist.length - 1) { loadPlaylistIndex(playlistIdx + 1); }
    } else if (gridNav) {
      if (gridNav.currentIndex < gridNav.items.length - 1) gridNav.onNavigate(gridNav.currentIndex + 1);
    }
  };
  /* ── Seek bar ── */
  els.seekBar.addEventListener("mousedown", () => { seeking = true; });
  els.seekBar.addEventListener("input", () => {
    if (!audio) return;
    audio.currentTime = (parseInt(els.seekBar.value) / 1000) * audio.duration;
  });
  els.seekBar.addEventListener("mouseup", () => { seeking = false; });
  /* ── Timeline click-to-seek ── */
  els.timelineWrap.addEventListener("click", (e) => {
    if (!audio || !durationMs) return;
    const rect = els.timelineWrap.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * (durationMs / 1000);
  });
  /* ── Hide/show/close controls ── */
  const minimizedBar = el("div", { style: "display:none;height:34px;min-height:34px;background:#0f172a;border-top:1px solid #334155;align-items:center;gap:8px;padding:0 10px;color:#cbd5e1;font-family:Segoe UI,Arial,sans-serif;" });
  const minimizedTitle = el("div", { style: "flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" }, "Media Player");
  const restoreBtn = el("button", { style: "border:0;background:#1e293b;color:#cbd5e1;width:26px;height:24px;border-radius:6px;cursor:pointer;", title: "Restore Player" }, "\u2191");
  const closePlayerBtn = el("button", { style: "border:0;background:#7f1d1d;color:#fff;width:26px;height:24px;border-radius:6px;cursor:pointer;", title: "Close Player" }, "\u00D7");
  minimizedBar.append(minimizedTitle, restoreBtn, closePlayerBtn);
  els.pane.parentNode.insertBefore(minimizedBar, els.pane.nextSibling);
  let closedPlayer = false;
  function minimizePlayer() { els.pane.style.display = "none"; minimizedBar.style.display = "flex"; }
  function restorePlayer() { minimizedBar.style.display = "none"; els.pane.style.display = "flex"; els.pane.style.height = configuredHeight; els.pane.style.overflow = "visible"; }
  function setHeight(h) {
    configuredHeight = h || configuredHeight;
    if (els.pane.style.display !== "none") els.pane.style.height = configuredHeight;
    setTimeout(() => { if (!closedPlayer) refreshPinsAndTimeline(); }, 50);
  }
  const onResize = () => {
    if (closedPlayer) return;
    if (typeof opts.getMaxHeight === "function" && els.pane.style.display !== "none" && els.pane.offsetHeight > maxPaneHeight()) {
      els.pane.style.height = maxPaneHeight() + "px";
    }
    refreshPinsAndTimeline();
  };
  window.addEventListener("resize", onResize, { passive: true });
  function closePlayer() {
    if (closedPlayer) return;
    closedPlayer = true;
    if (jumpTimer) clearTimeout(jumpTimer);
    stopAudio();
    livePlayers.delete(instance);
    document.removeEventListener("mousemove", onDocMouseMove);
    document.removeEventListener("mouseup", onDocMouseUp);
    document.removeEventListener("keydown", onSpeedKeys);
    document.removeEventListener("keydown", onFindKey);
    window.removeEventListener("resize", onResize);
    if (scrollSnapTimer) clearTimeout(scrollSnapTimer);
    minimizedBar.remove();
    els.pane.remove();
    api.setShared("playlistState", null);
    if (typeof opts.onClosed === "function") opts.onClosed();
  }
  els.hideBtn.onclick = minimizePlayer;
  restoreBtn.onclick = restorePlayer;
  closePlayerBtn.onclick = closePlayer;
  if (opts.closeable) {
    const topClose = el("button", { style: "border:0;background:#7f1d1d;color:#fff;padding:3px 8px;border-radius:6px;font-size:11px;cursor:pointer;", title: "Close Player" }, "Close");
    topClose.onclick = closePlayer;
    els.utilBar.appendChild(topClose);
  }
  if (typeof onClose === "function") onClose(() => closePlayer());
  /* ── SEARCH (Ctrl+F) ── */
  function openSearch() {
    if (!audio) return;
    searchActive = true;
    autoScrollBeforeSearch = autoScrollEnabled;
    els.searchBar.style.display = "flex";
    els.searchInput.value = "";
    els.searchInput.focus();
    searchMatches = [];
    searchMatchIdx = -1;
    els.searchCount.textContent = "";
  }
  function closeSearch() {
    searchActive = false;
    els.searchBar.style.display = "none";
    els.searchInput.value = "";
    searchMatches = [];
    searchMatchIdx = -1;
    els.searchCount.textContent = "";
    els.transcriptPane.querySelectorAll("[data-tx-idx]").forEach((bubble) => {
      const msgEl = bubble.querySelector("[data-msg]");
      if (msgEl) msgEl.textContent = msgEl.getAttribute("data-original") || msgEl.textContent;
    });
    autoScrollEnabled = autoScrollBeforeSearch;
    els.autoScrollCb.checked = autoScrollEnabled;
  }
  function doSearch() {
    const query = els.searchInput.value.trim().toLowerCase();
    searchMatches = [];
    searchMatchIdx = -1;
    els.transcriptPane.querySelectorAll("[data-msg]").forEach((msgEl) => {
      msgEl.textContent = msgEl.getAttribute("data-original") || msgEl.textContent;
    });
    if (!query) { els.searchCount.textContent = ""; return; }
    els.transcriptPane.querySelectorAll("[data-tx-idx]").forEach((bubble) => {
      const idx = parseInt(bubble.getAttribute("data-tx-idx"));
      const msgEl = bubble.querySelector("[data-msg]");
      if (!msgEl) return;
      const original = msgEl.getAttribute("data-original") || msgEl.textContent;
      const lower = original.toLowerCase();
      if (lower.includes(query)) {
        searchMatches.push({ idx, bubble, msgEl, original });
        msgEl.innerHTML = "";
        let pos = 0;
        let searchFrom = 0;
        while (true) {
          const found = lower.indexOf(query, searchFrom);
          if (found === -1) break;
          if (found > pos) msgEl.appendChild(document.createTextNode(original.substring(pos, found)));
          msgEl.appendChild(el("span", { style: "background:#fbbf24;color:#111827;border-radius:2px;padding:0 1px;" }, original.substring(found, found + query.length)));
          pos = found + query.length;
          searchFrom = pos;
        }
        if (pos < original.length) msgEl.appendChild(document.createTextNode(original.substring(pos)));
      }
    });
    els.searchCount.textContent = searchMatches.length ? `0 of ${searchMatches.length}` : "No matches";
    if (searchMatches.length) {
      autoScrollEnabled = false;
      els.autoScrollCb.checked = false;
      navigateSearch(0);
    }
  }
  function navigateSearch(idx) {
    if (!searchMatches.length) return;
    searchMatchIdx = ((idx % searchMatches.length) + searchMatches.length) % searchMatches.length;
    els.searchCount.textContent = `${searchMatchIdx + 1} of ${searchMatches.length}`;
    searchMatches[searchMatchIdx].bubble.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  els.searchInput.addEventListener("input", doSearch);
  els.searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); navigateSearch(searchMatchIdx + 1); }
    if (e.key === "Escape") { closeSearch(); }
  });
  els.searchPrevBtn.onclick = () => { navigateSearch(searchMatchIdx - 1); };
  els.searchNextBtn.onclick = () => { navigateSearch(searchMatchIdx + 1); };
  els.searchCloseBtn.onclick = () => { closeSearch(); };
  const onFindKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "f" && audio) {
      e.preventDefault();
      openSearch();
    }
  };
  document.addEventListener("keydown", onFindKey);
  /* ── Playlist management ── */
  //##> PLAYLIST HOOK: setPlaylist(items, { host, groups }) puts the player into tag mode for a module.
  //##> host: onActiveTag(tag) returns an optional note { text, action, run }, onTagChange(tag),
  //##> isEditing(tag), onGroupsChange(groups), onExit(), exitLabel. Without a host (standalone), every
  //##> tag is treated as Navigation. clearPlaylist() hands control back to grid navigation.
  function setPlaylist(items, setup) {
    setup = setup || {};
    if (jumpTimer) { clearTimeout(jumpTimer); jumpTimer = null; }
    clearPause();
    playlist = items;
    playlistIdx = -1;
    activeTagId = null;
    activeNote = null;
    tagHost = setup.host || null;
    setTaskMode(!!tagHost);
    setTaskHint(tagHost && tagHost.hint ? tagHost.hint : "");
    for (const item of (playlist || [])) {
      item.timestamps = prepTags(item.timestamps);
      if (!tagHost) for (const t of item.timestamps) t.kind = "nav";
    }
    if (Array.isArray(setup.groups) && setup.groups.length) {
      groupList = setup.groups.map((g) => ({ id: g.id, label: g.label || g.id, kind: g.kind || "nav", enabled: g.enabled !== false }));
    } else {
      groupList = [];
      for (const item of (playlist || [])) for (const t of item.timestamps) if (!groupList.some((g) => g.id === t.group)) groupList.push({ id: t.group, label: t.groupLabel || t.group, kind: t.kind, enabled: true });
    }
    if (groupList.length && !groupList.some((g) => g.enabled)) groupList[0].enabled = true;
    showAllEvents = eventsAllowed() && !!settings.showAllEvents;
    els.showAllEventsCb.checked = showAllEvents;
    els.showAllEventsLabel.style.display = eventsAllowed() ? "flex" : "none";
    activeTab = tagHost && tagTotal() ? "tags" : "calls";
    updatePlaylistUI();
  }
  function clearPlaylist() {
    if (jumpTimer) { clearTimeout(jumpTimer); jumpTimer = null; }
    clearPause();
    playlist = null;
    playlistIdx = -1;
    tagHost = null;
    setTaskMode(false);
    setTaskHint("");
    groupList = [];
    activeTagId = null;
    activeNote = null;
    importedTimestamps = [];
    activeTab = "calls";
    showAllEvents = !!settings.showAllEvents;
    els.showAllEventsCb.checked = showAllEvents;
    els.showAllEventsLabel.style.display = "flex";
    updatePlaylistUI();
    updateTagUI();
    updateGridNavUI();
    updateOuterButtonState();
  }
  function loadPlaylistIndex(idx, jumpMs, tagId) {
    if (!playlist || idx < 0 || idx >= playlist.length) return;
    if (jumpTimer) { clearTimeout(jumpTimer); jumpTimer = null; }
    clearPause();
    playlistIdx = idx;
    const item = playlist[idx];
    const seq = itemTags(item);
    const first = (tagId && seq.find((t) => t.id === tagId)) || (jumpMs === undefined ? seq[0] : null) || null;
    const target = jumpMs !== undefined ? jumpMs : (first ? first.ms : undefined);
    els.navLabel.textContent = `${playlistIdx + 1} / ${playlist.length}`;
    els.prevNavBtn.style.display = "";
    els.nextNavBtn.style.display = "";
    loadCall(item.smid, item.displayLabel, target, null, item.timestamps || []);
    activateTag(first);
    lastTickMs = target === undefined ? null : target;
  }
  /* ── LOAD CALL ── */
  async function loadCall(smid, label, jumpToMs, searchQuery, impTimestamps) {
    if (currentSmid === smid && jumpToMs !== undefined && audio) {
      importedTimestamps = prepTags(impTimestamps || importedTimestamps);
      audio.currentTime = jumpToMs / 1000;
      audio.play().catch(() => {});
      return;
    }
    currentSmid = smid;
    currentLabel = label || "";
    if (playlist && playlist[playlistIdx] && playlist[playlistIdx].smid === smid) currentRow = playlist[playlistIdx].row || null;
    else if (gridNav && gridNav.items && gridNav.items[gridNav.currentIndex]) currentRow = gridNav.items[gridNav.currentIndex].row || null;
    else currentRow = null;
    stopAudio();
    closeSearch();
    transcriptRows = []; phraseOffsets = []; eventOffsets = [];
    importedTimestamps = prepTags(impTimestamps || []);
    segments = []; nonTalkSegments = [];
    durationMs = 0;
    showAllEvents = eventsAllowed() && !!settings.showAllEvents;
    els.showAllEventsCb.checked = showAllEvents;
    els.transcriptPane.innerHTML = "";
    els.pinBar.innerHTML = "";
    els.playBtn.style.background = "#3b82f6";
    els.seekBar.value = 0;
    els.timeEl.textContent = "00:00 / 00:00";
    els.waveformImg.src = "";
    els.playheadDiv.style.left = "0%";
    renderCallHeader();
    setStatus("Preparing...");
    if (els.pane.style.display !== "none") {
      els.pane.style.height = configuredHeight;
      els.pane.style.overflow = "visible";
    }
    els.hideBtn.textContent = "Hide Player";
    if (!playlist) buildSidebar();
    let prepared;
    try {
      prepared = await preparePoll(smid, jumpToMs || 0);
    } catch (e) {
      if (currentSmid === smid) setStatus("Preparation failed: " + e.message);
      return;
    }
    if (currentSmid !== smid || closedPlayer) return;
    durationMs = prepared.durationMs || 0;
    if (prepared.waveformUri) els.waveformImg.src = prepared.waveformUri;
    audio = new Audio(prepared.mediaUri);
    const thisAudio = audio;
    connectAudioNode(audio);
    audio.volume = 1;
    audio.playbackRate = SPEEDS[speedIdx];
    updateLpCutoff(SPEEDS[speedIdx]);
    els.timeEl.textContent = `${fmtTime(jumpToMs || 0)} / ${fmtTime(durationMs)}`;
    audio.ontimeupdate = () => {
      updateTime();
      if (thisAudio.currentTime > 0) {
        tagTick(thisAudio.currentTime * 1000);
        if (!thisAudio.paused) skipNonTalk();
      }
    };
    audio.onseeked = () => updateTime();
    audio.ondurationchange = () => updateTime();
    audio.onplay = () => {
      els.playBtn.style.background = "#22c55e";
      if (pausedForTag) { pauseOverride = pausedForTag; clearPause(); }
    };
    audio.onpause = () => { els.playBtn.style.background = "#3b82f6"; };
    audio.onended = () => {
      els.playBtn.style.background = "#3b82f6";
      const seq = curSeq();
      const i = seq.findIndex((t) => t.id === activeTagId);
      const nxt = i >= 0 ? seq[i + 1] : null;
      const act = seq[i];
      if (act && nxt && nxt.ms < act.ms) {
        activateTag(nxt, { seek: true, play: true });
        return;
      }
      if (playlist && playlistIdx < playlist.length - 1) {
        setTimeout(() => loadPlaylistIndex(playlistIdx + 1), 400);
      }
    };
    audio.onloadedmetadata = () => {
      if (jumpToMs) thisAudio.currentTime = jumpToMs / 1000;
      updateTime();
      thisAudio.play().catch(() => { if (thisAudio === audio) setStatus("Press play to start this call."); });
    };
    setStatus("Loading data...");
    const [hitLinesResult, autoSummaryResult, transcriptResult, highlightsResult] = await Promise.allSettled([
      fetchJson(HIT_LINES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceMediaId: smid, context: {} })
      }),
      fetchJson(AUTOSUMMARY_URL(smid)),
      fetchJson(TRANSCRIPT_URL(smid)),
      searchQuery ? fetchJson(HIGHLIGHTS_URL(smid), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          languageFilter: searchQuery.languageFilter || { languages: [] },
          namedSetId: searchQuery.namedSetId || null,
          query: searchQuery.query,
          highlightFragmentSize: 0
        })
      }) : Promise.resolve(null)
    ]);
    if (currentSmid !== smid || closedPlayer) return;
    if (hitLinesResult.status === "fulfilled" && hitLinesResult.value) {
      segments = hitLinesResult.value.hitLines || [];
      nonTalkSegments = segments.filter((s) => s.spokenText === "NonTalk" || s.spokenText === "NonSpeech");
    }
    if (autoSummaryResult.status === "fulfilled" && autoSummaryResult.value) {
      const raw = autoSummaryResult.value;
      const events = Array.isArray(raw) ? raw : (raw.contactEvents || raw.events || []);
      eventOffsets = events.map((e) => e.startOffsetInMs || e.startOffset || 0).filter(Boolean);
      eventsCache.set(smid, events.map((e, i) => ({
        label: e.eventName || e.eventType || `Event ${i + 1}`,
        ms: e.startOffsetInMs || e.startOffset || 0
      })).filter((ev) => ev.ms > 0));
    }
    updateOuterButtonState();
    if (transcriptResult.status === "fulfilled" && transcriptResult.value) {
      const raw = transcriptResult.value;
      transcriptRows = raw.transcriptRows || raw.TranscriptRows || raw.rows || [];
      els.transcriptPane.innerHTML = "";
      for (let i = 0; i < transcriptRows.length; i++) {
        const row = transcriptRows[i];
        const isAgent = (row.speaker || row.Speaker || "").toLowerCase() === "agent";
        const tsLabel = [row.formattedStartOffset, row.formattedEndOffset].filter(Boolean).join(" - ");
        const bubble = el("div", {
          style: `max-width:80%;display:flex;flex-direction:column;align-self:${isAgent ? "flex-end" : "flex-start"};`
        });
        const msgEl = el("div", {
          style: `background:${isAgent ? "#1e3a5f" : "#1e293b"};color:${isAgent ? "#bfdbfe" : "#e2e8f0"};border-radius:${isAgent ? "10px 10px 2px 10px" : "10px 10px 10px 2px"};padding:5px 10px;font-size:11px;line-height:1.4;cursor:pointer;`
        });
        const textContent = (row.text || row.Text || "").trim();
        msgEl.textContent = textContent;
        msgEl.setAttribute("data-msg", "1");
        msgEl.setAttribute("data-original", textContent);
        const tsEl = el("div", {
          style: `font-size:10px;color:#475569;margin-top:2px;text-align:${isAgent ? "right" : "left"};padding:0 4px;`
        }, tsLabel);
        bubble.appendChild(msgEl);
        bubble.appendChild(tsEl);
        bubble.setAttribute("data-tx-idx", i);
        bubble.onclick = () => { if (audio) audio.currentTime = row.totalSecondsFromStart || 0; };
        const wrapper = el("div", {
          style: `display:flex;justify-content:${isAgent ? "flex-end" : "flex-start"};`
        });
        wrapper.appendChild(bubble);
        els.transcriptPane.appendChild(wrapper);
      }
    }
    if (highlightsResult.status === "fulfilled" && highlightsResult.value && transcriptRows.length) {
      const raw = highlightsResult.value;
      const hlText = (raw.transcriptHighlights || []).join("\n");
      const plainRows = [];
      for (const row of transcriptRows) {
        const t = (row.text || "").trim().toLowerCase().replace(/<unk>/g, "").replace(/\s+/g, " ").trim();
        if (t) plainRows.push({ text: t, ts: row.totalSecondsFromStart || 0 });
      }
      const markerRegex = /\{\{\{(.+?)\}\}\}/g;
      let match;
      const phraseTexts = [];
      while ((match = markerRegex.exec(hlText)) !== null) {
        phraseTexts.push(match[1].toLowerCase().trim());
      }
      const seen = new Set();
      phraseOffsets = [];
      for (const phrase of phraseTexts) {
        for (const pr of plainRows) {
          if (pr.text.includes(phrase) && !seen.has(pr.ts)) {
            seen.add(pr.ts);
            phraseOffsets.push(pr.ts * 1000);
            break;
          }
        }
      }
    }
    refreshPinsAndTimeline();
    if (jumpToMs === undefined && audio) {
      const vis = getVisiblePins();
      if (vis.imports.length) audio.currentTime = vis.imports[0].ms / 1000;
      else if (phraseOffsets.length) audio.currentTime = phraseOffsets[0] / 1000;
    }
    setStatus(durationMs
      ? `${fmtTime(durationMs)} \u00B7 ${segments.length} segments \u00B7 ${phraseOffsets.length} phrase hits`
      : "Loaded");
    buildSidebar();
    prefetchAdjacentEvents(playlistIdx);
  }
  const instance = {
    loadCall, stopAudio, setPlaylist, clearPlaylist, loadPlaylistIndex, setGridNav,
    completeTag, uncompleteTag, resumeFromEdit, refreshTags: updateTagUI,
    getActiveTag: () => activeTag(),
    setHeight, setWorkspace, setTaskHint,
    isMinimized: () => els.pane.style.display === "none",
    minimize: minimizePlayer, restore: restorePlayer, close: closePlayer,
    openSettings, refreshSettings, getSettings: () => clone(settings),
    els
  };
  livePlayers.add(instance);
  syncTabs();
  return instance;
}
api.registerTool({
  id: "mediaPlayer",
  label: "Media Player",
  hidden: true,
  open: () => {},
  _openPlayerPane: openPlayerPane,
  openSettings: openSettingsDialog,
  getGeneralSettings,
  saveGeneralSettings,
  resolveSettings,
  settingsFields,
  fieldValue,
  fieldName
});
})();
