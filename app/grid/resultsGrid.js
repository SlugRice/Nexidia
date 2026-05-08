//[Last Update: 7:06 AM 5/8/2026]
//[Please confirm this timestamp in your response any time it was formed using this document!]

(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;
  function openResultsGrid() {
    (async () => {
      try {
        const data = api.getShared("lastSearchResult");
        if (!data || !Array.isArray(data.rows) || !data.rows.length) {
          alert("No search results found. Run a search first.");
          return;
        }
        const colPrefs = api.getShared("columnPrefs") || { fields: [], headers: [] };
        const hiddenFields = api.getShared("hiddenFields") || new Set(["sourceMediaId"]);
        const xls = api.getShared("xlsBuilder");
        const searchQuery = api.getShared("lastSearchQuery") || null;
        const BASE_SEARCH_URL = "https://apug01.nxondemand.com/NxIA/api-gateway/explore/api/v1.0/search";
        const PLAYER_URL = (smid) => `https://apug01.nxondemand.com/NxIA/ui/explore/(search//player:player/${encodeURIComponent(smid)})`;
        const ROW_HEIGHT = 28;
        const BUFFER_ROWS = 20;
        const COL0_W = 36;
        const COL1_W = 28;
        const COL2_W = 44;
        const FROZEN_W = COL0_W + COL1_W + COL2_W;
        const PLAY_COL_W = 28;
        const DEFAULT_COL_W = 150;
        const LS_HIDE_TIP_KEY = "nexidia_hide_col_tooltip_seen";
        const el = (tag, props, ...children) => {
          props = props || {};
          const node = document.createElement(tag);
          Object.assign(node, props);
          for (const ch of children) {
            if (ch === null || ch === undefined) continue;
            node.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
          }
          return node;
        };
        function getFieldValue(rowObj, key) {
          if (xls) return xls.getFieldValue(rowObj, key);
          if (!rowObj) return "";
          const want = String(key || "");
          if (!want) return "";
          if (rowObj[want] !== undefined && rowObj[want] !== null) return String(rowObj[want]);
          const lower = want.toLowerCase();
          for (const k of Object.keys(rowObj)) {
            if (k.toLowerCase() === lower && rowObj[k] !== null) return String(rowObj[k]);
          }
          return "";
        }
        function normalizeCellText(raw) {
          if (xls) return xls.normalizeCellText(raw);
          return (raw === null || raw === undefined) ? "" : String(raw).trim();
        }
        function formatDisplay(fieldKey, raw) {
          if (!raw || raw === "0") return raw || "";
          if (xls && xls.formatDisplayValue) return xls.formatDisplayValue(fieldKey, raw);
          return raw;
        }
        function getSourceMediaId(item) {
          const r = item && (item.row || item);
          if (!r) return null;
          const direct = r.sourceMediaId || r.SourceMediaId;
          if (direct) return direct;
          return getFieldValue(r, "sourceMediaId") || null;
        }
        function getCellValue(item, field) {
          if (field.startsWith("__PHRASE_") && !field.startsWith("__PHRASE_OFFSET_")) {
            const idx = parseInt(field.replace(/\D/g, ""), 10) - 1;
            return (item.phrases && item.phrases[idx]) ? item.phrases[idx] : "";
          }
          if (field === "__PHRASE_OFFSETS__") {
            return (item.__phraseOffsets__ && item.__phraseOffsets__.length) ? item.__phraseOffsets__.join(",") : "";
          }
          const r = item.row || item;
          return normalizeCellText(getFieldValue(r, field));
        }
        function getCellDisplay(item, field) {
          if (field.startsWith("__PHRASE_") && !field.startsWith("__PHRASE_OFFSET_")) return getCellValue(item, field);
          if (field === "__PHRASE_OFFSETS__") return getCellValue(item, field);
          const r = item.row || item;
          const raw = normalizeCellText(getFieldValue(r, field));
          return formatDisplay(field, raw);
        }
        function getRowLabel(item) {
          const r = item.row || item;
          const agent = getFieldValue(r, "agentName") || "";
          const tid = getFieldValue(r, "UDFVarchar110") || "";
          const dt = getFieldValue(r, "recordedDateTime") || getFieldValue(r, "recordedDate") || "";
          const datePart = dt ? new Date(dt).toLocaleDateString() : "";
          return [agent, tid, datePart].filter(Boolean).join(" \u00B7 ") || "Call";
        }
        const measureCtx = document.createElement("canvas").getContext("2d");
        measureCtx.font = "11px 'Segoe UI',Arial,sans-serif";
        function measureText(text) { return measureCtx.measureText(text || "").width + 24; }
        const allFields = colPrefs.fields.filter((f) => !hiddenFields.has(f));
        const allHeaders = colPrefs.headers.filter((_, i) => !hiddenFields.has(colPrefs.fields[i]));
        const phraseFields = [];
        const phraseHeaders = [];
        if (data.includePhraseCol) {
          for (let i = 1; i <= data.maxPhraseCols; i++) {
            phraseFields.push("__PHRASE_" + i + "__");
            phraseHeaders.push(i === 1 ? "Search" : "Search" + i);
          }
        }
        const state = {
          rows: data.rows.slice(),
          fields: [...phraseFields, ...allFields],
          headers: [...phraseHeaders, ...allHeaders],
          visible: new Set([...phraseFields, ...allFields]),
          sorts: [],
          columnFilters: {},
          globalFilter: "",
          adHocPending: false,
          selected: new Set(),
          hiddenRows: new Set(),
          colWidths: new Map(),
          filteredRows: [],
          clickMode: "play",
          cellSel: new Set(),
          cellAnchor: null,
          cellDragging: false
        };
        let dragColIndex = null;
        let dragSrcIndex = null;
        let dragGhost = null;
        let playerCtrl = null;
        let activeSmid = null;
        let lastRange = { start: 0, end: 0 };
        let rafPending = false;
        function createDragGhost(text) {
          if (dragGhost) dragGhost.remove();
          dragGhost = el("div", { style: "position:fixed;top:-9999px;left:-9999px;z-index:1000010;background:#1d4ed8;color:#fff;font-size:11px;font-weight:700;padding:6px 14px;border-radius:6px;white-space:nowrap;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.3);font-family:Segoe UI,Arial,sans-serif;" }, text);
          document.body.appendChild(dragGhost);
          return dragGhost;
        }
        function removeDragGhost() { if (dragGhost) { dragGhost.remove(); dragGhost = null; } }
        function clearDropIndicators() {
          thead.querySelectorAll("th").forEach((th) => { th.style.borderLeft = ""; th.style.borderRight = ""; });
        }
        function getColWidth(field) { return state.colWidths.get(field) || DEFAULT_COL_W; }
        function applySort(rows) {
          if (!state.sorts.length) return rows;
          return rows.slice().sort((a, b) => {
            for (let i = 0; i < state.sorts.length; i++) {
              const { field, dir } = state.sorts[i];
              const va = getCellValue(a, field), vb = getCellValue(b, field);
              if (va === vb) continue;
              const na = Number(va), nb = Number(vb);
              if (!isNaN(na) && !isNaN(nb)) return (na - nb) * dir;
              return va < vb ? -1 * dir : 1 * dir;
            }
            return 0;
          });
        }
        function handleHeaderClick(field) {
          const existing = state.sorts.findIndex((s) => s.field === field);
          if (existing === 0) { state.sorts[0].dir *= -1; }
          else if (existing > 0) { const [removed] = state.sorts.splice(existing, 1); removed.dir = 1; state.sorts.unshift(removed); }
          else { state.sorts.unshift({ field, dir: 1 }); if (state.sorts.length > 3) state.sorts.length = 3; }
          renderSortBadges();
          recomputeAndRender();
        }
        function removeSortTier(index) { state.sorts.splice(index, 1); renderSortBadges(); recomputeAndRender(); }
        function evaluateRule(rule, cell) {
          const cellLower = cell.toLowerCase();
          const val = (rule.value || "").trim().toLowerCase();
          const val2 = (rule.value2 || "").trim().toLowerCase();
          const numCell = Number(cell), numVal = Number(rule.value), numVal2 = Number(rule.value2);
          switch (rule.op) {
            case "hideempty": return !(cell === "" || cell === "0");
            case "showempty": return cell === "" || cell === "0";
            case "contains": return !val || cellLower.includes(val);
            case "notcontains": return !val || !cellLower.includes(val);
            case "exact": return cellLower === val;
            case "startswith": return !val || cellLower.startsWith(val);
            case "endswith": return !val || cellLower.endsWith(val);
            case "gt":
              if (!isNaN(numCell) && !isNaN(numVal)) return numCell > numVal;
              return cellLower.localeCompare(val) > 0;
            case "lt":
              if (!isNaN(numCell) && !isNaN(numVal)) return numCell < numVal;
              return cellLower.localeCompare(val) < 0;
            case "eq":
              if (!isNaN(numCell) && !isNaN(numVal)) return numCell === numVal;
              return cellLower === val;
            case "between":
              if (!isNaN(numCell) && !isNaN(numVal) && !isNaN(numVal2)) return numCell >= numVal && numCell <= numVal2;
              return cellLower.localeCompare(val) >= 0 && cellLower.localeCompare(val2) <= 0;
            default: return true;
          }
        }
        function applyColumnFilters(rows) {
          const active = Object.entries(state.columnFilters).filter(([, f]) => f && f.rules && f.rules.length);
          if (!active.length) return rows;
          return rows.filter((item) => {
            for (const [field, filter] of active) {
              const cell = getCellValue(item, field);
              const results = filter.rules.map((r) => evaluateRule(r, cell));
              if (filter.mode === "any") { if (!results.some(Boolean)) return false; }
              else { if (!results.every(Boolean)) return false; }
            }
            return true;
          });
        }
        function applyGlobalFilter(rows) {
          const q = state.globalFilter.trim().toLowerCase();
          if (!q) return rows;
          const vis = state.fields.filter((f) => state.visible.has(f));
          return rows.filter((item) => vis.some((f) => getCellValue(item, f).toLowerCase().includes(q)));
        }
        function applyHiddenFilter(rows) {
          if (!state.hiddenRows.size) return rows;
          return rows.filter((item) => { const idx = state.rows.indexOf(item); return !state.hiddenRows.has(idx); });
        }
        function recomputeRows() {
          let rows = state.rows.slice();
          rows = applyHiddenFilter(rows);
          rows = applyColumnFilters(rows);
          rows = applyGlobalFilter(rows);
          rows = applySort(rows);
          state.filteredRows = rows;
          state.selected = new Set([...state.selected].filter((i) => i < rows.length));
        }
        function getSelectedItems() { return [...state.selected].map((i) => state.filteredRows[i]).filter(Boolean); }
        function updateToolbarCounts() {
          rowCountEl.textContent = state.filteredRows.length.toLocaleString() + " of " + state.rows.length.toLocaleString() + " rows";
          selCountEl.textContent = state.selected.size ? state.selected.size.toLocaleString() + " selected" : "";
          selCountEl.style.display = state.selected.size ? "" : "none";
          hideSelectedBtn.style.display = state.selected.size ? "" : "none";
          hiddenCountEl.textContent = state.hiddenRows.size ? state.hiddenRows.size.toLocaleString() + " hidden" : "";
          hiddenCountEl.style.display = state.hiddenRows.size ? "" : "none";
          unhideBtn.style.display = state.hiddenRows.size ? "" : "none";
          if (state.clickMode === "select" && state.cellSel.size) {
            cellSelCountEl.textContent = state.cellSel.size.toLocaleString() + " cells";
            cellSelCountEl.style.display = "";
          } else {
            cellSelCountEl.style.display = "none";
          }
        }
        function confirmExportScope(onSelected, onAll) {
          if (!state.selected.size) { onAll(); return; }
          const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000003;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
          const box = el("div", { style: "background:#fff;width:400px;border-radius:12px;padding:22px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
          box.appendChild(el("div", { style: "font-size:14px;font-weight:700;color:#111827;margin-bottom:8px;" }, "Export Options"));
          box.appendChild(el("div", { style: "font-size:13px;color:#374151;margin-bottom:18px;" }, `You have ${state.selected.size.toLocaleString()} item${state.selected.size !== 1 ? "s" : ""} selected. Export selected or entire dataset?`));
          const btnRow = el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;" });
          const selBtn = el("button", { style: "flex:1;padding:9px;border-radius:8px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:13px;font-weight:600;cursor:pointer;" }, "Export Selected");
          const allBtn = el("button", { style: "flex:1;padding:9px;border-radius:8px;border:0;background:#f9fafb;border:1px solid #d1d5db;color:#111827;font-size:13px;cursor:pointer;" }, "Export All");
          const cancelBtn = el("button", { style: "width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:13px;cursor:pointer;color:#6b7280;" }, "Cancel");
          selBtn.onclick = () => { overlay.remove(); onSelected(); };
          allBtn.onclick = () => { overlay.remove(); onAll(); };
          cancelBtn.onclick = () => overlay.remove();
          btnRow.appendChild(selBtn); btnRow.appendChild(allBtn);
          box.appendChild(btnRow); box.appendChild(cancelBtn);
          overlay.appendChild(box); document.body.appendChild(overlay);
        }
        function doExcelExport(rows) {
          if (!xls) { alert("Export builder not loaded."); return; }
          const hasOffsets = rows.some((item) => item.__phraseOffsets__ && item.__phraseOffsets__.length);
          const visF = state.fields.filter((f) => state.visible.has(f));
          const visH = state.fields.map((f, i) => ({ f, h: state.headers[i] })).filter(({ f }) => state.visible.has(f)).map(({ h }) => h);
          let exportFields = visF, exportHeaders = visH;
          if (hasOffsets) { exportFields = [...visF, "__PHRASE_OFFSETS__"]; exportHeaders = [...visH, "PhraseOffsets"]; }
          if (!rows.length) { alert("No rows to export."); return; }
          const html = xls.buildExcelHtml(exportHeaders, exportFields, rows, hasOffsets ? ["PhraseOffsets"] : []);
          const stamp = new Date().toISOString().replace(/[:]/g, "-").replace(/\..+$/, "");
          xls.downloadExcelFile("nexidia_grid_export_" + stamp + ".xls", html);
        }
        function exportToExcel() { confirmExportScope(() => doExcelExport(getSelectedItems()), () => doExcelExport(state.filteredRows)); }
        function doTranscriptExport(rows) {
          const smids = rows.map((item) => getSourceMediaId(item)).filter(Boolean);
          const transIds = rows.map((item) => getCellValue(item, "UDFVarchar110")).filter((v) => v && v !== "0");
          if (!smids.length && !transIds.length) { alert("No valid IDs found."); return; }
          const ids = transIds.length ? transIds : smids;
          api.setShared("batchBuilderPreload", ids.join("\n"));
          const tool = api.listTools().find((t) => t.id === "transcriptBatchBuilder");
          if (tool) tool.open(); else alert("Transcript Batch Builder not loaded.");
        }
        function exportTranscripts() { confirmExportScope(() => doTranscriptExport(getSelectedItems()), () => doTranscriptExport(state.filteredRows)); }
        async function fetchAdHocColumn(storageName, displayName) {
          if (state.adHocPending) { alert("A column fetch is already in progress."); return; }
          if (state.fields.includes(storageName)) { alert("That column is already in the grid."); return; }
          state.adHocPending = true; adHocBtn.disabled = true;
          adHocBtn.textContent = "Adding column...";
          try {
            const smids = state.rows.map((item) => getSourceMediaId(item)).filter(Boolean);
            if (!smids.length) throw new Error("No sourceMediaId values found.");
            const payload = { from: 0, to: smids.length, fields: ["sourceMediaId", storageName], query: { operator: "AND", invertOperator: false, filters: [{ operator: "AND", invertOperator: false, filterType: "interactions", filters: [{ operator: "IN", type: "KEYWORD", parameterName: "sourceMediaId", value: smids }] }] } };
            const res = await fetch(BASE_SEARCH_URL, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            if (!res.ok) throw new Error("API returned " + res.status);
            const json = await res.json();
            const results = Array.isArray(json.results) ? json.results : [];
            const valueMap = new Map();
            for (const r of results) { const smid = String(r.sourceMediaId || "").trim(); if (smid) valueMap.set(smid, getFieldValue(r, storageName)); }
            for (const item of state.rows) { const smid = String(getSourceMediaId(item) || "").trim(); const r = item.row || item; r[storageName] = valueMap.get(smid) || ""; }
            state.fields.push(storageName); state.headers.push(displayName); state.visible.add(storageName);
            rebuildColumnPanel(); renderSortBadges(); recomputeAndRender();
          } catch (err) { console.error(err); alert("Column fetch failed: " + (err.message || err)); }
          finally { state.adHocPending = false; adHocBtn.disabled = false; adHocBtn.textContent = "+ Add Column"; }
        }
        function openAdHocPicker() {
          const metaFields = api.getShared("metadataFields") || [];
          const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000001;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
          const box = el("div", { style: "background:#fff;width:380px;border-radius:12px;padding:18px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
          box.appendChild(el("div", { style: "font-size:14px;font-weight:700;margin-bottom:10px;color:#111827;" }, "Add Column"));
          const input = el("input", { type: "text", placeholder: "Search fields...", style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;margin-bottom:8px;" });
          const list = el("div", { style: "max-height:240px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px;" });
          const allKnown = metaFields.filter((f) => f.isEnabled !== false && !state.fields.includes(f.storageName));
          function renderList(q) {
            list.innerHTML = "";
            const ql = q.toLowerCase().trim();
            const matches = allKnown.filter((f) => !ql || f.displayName.toLowerCase().includes(ql) || f.storageName.toLowerCase().includes(ql));
            if (!matches.length) { list.appendChild(el("div", { style: "padding:10px;font-size:12px;color:#6b7280;" }, "No fields found.")); return; }
            for (const f of matches.slice(0, 100)) {
              const row = el("div", { style: "padding:8px 10px;font-size:12px;cursor:pointer;border-bottom:1px solid #f1f5f9;color:#111827;" }, f.displayName);
              row.onmouseenter = () => { row.style.background = "#e8f0fe"; };
              row.onmouseleave = () => { row.style.background = ""; };
              row.onclick = () => { overlay.remove(); fetchAdHocColumn(f.storageName, f.displayName); };
              list.appendChild(row);
            }
          }
          input.addEventListener("input", () => renderList(input.value));
          renderList("");
          const cancelBtn = el("button", { style: "margin-top:10px;width:100%;padding:8px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;cursor:pointer;font-size:13px;" }, "Cancel");
          cancelBtn.onclick = () => overlay.remove();
          box.appendChild(input); box.appendChild(list); box.appendChild(cancelBtn);
          overlay.appendChild(box); document.body.appendChild(overlay);
          setTimeout(() => input.focus(), 50);
        }
        const OP_LIST = [["hideempty","Hide Empty"],["showempty","Show Empty Only"],["contains","Contains"],["notcontains","Does Not Contain"],["exact","Exact Match"],["startswith","Starts With"],["endswith","Ends With"],["gt","Greater Than"],["lt","Less Than"],["eq","Equal To"],["between","Between"]];
        const NO_VALUE_OPS = new Set(["hideempty","showempty"]);
        const TWO_VALUE_OPS = new Set(["between"]);
        function openColumnFilterPopover(field, anchorEl) {
          document.querySelectorAll("[data-col-filter-popover]").forEach((p) => p.remove());
          const existing = state.columnFilters[field] || { mode: "all", rules: [] };
          const rect = anchorEl.getBoundingClientRect();
          const pop = el("div", { style: `position:fixed;top:${rect.bottom + 4}px;left:${Math.min(rect.left, window.innerWidth - 280)}px;width:270px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px;box-shadow:0 6px 20px rgba(0,0,0,.18);z-index:1000002;font-family:Segoe UI,Arial,sans-serif;` });
          pop.setAttribute("data-col-filter-popover", "1");
          let localMode = existing.mode || "all";
          let localRules = existing.rules.map((r) => ({ ...r }));
          const modeRow = el("div", { style: "display:flex;align-items:center;gap:4px;margin-bottom:8px;" });
          const allBtn = el("button", { style: "flex:1;padding:4px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid #d1d5db;" }, "ALL");
          const anyBtn = el("button", { style: "flex:1;padding:4px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid #d1d5db;" }, "ANY");
          function syncModeUI() {
            allBtn.style.background = localMode === "all" ? "#3b82f6" : "#fff";
            allBtn.style.color = localMode === "all" ? "#fff" : "#374151";
            anyBtn.style.background = localMode === "any" ? "#f59e0b" : "#fff";
            anyBtn.style.color = localMode === "any" ? "#fff" : "#374151";
          }
          allBtn.onclick = () => { localMode = "all"; syncModeUI(); };
          anyBtn.onclick = () => { localMode = "any"; syncModeUI(); };
          modeRow.appendChild(el("span", { style: "font-size:10px;color:#6b7280;" }, "Match:"));
          modeRow.appendChild(allBtn); modeRow.appendChild(anyBtn);
          syncModeUI();
          const rulesWrap = el("div", { style: "margin-bottom:8px;max-height:140px;overflow-y:auto;" });
          function renderRules() {
            rulesWrap.innerHTML = "";
            for (let i = 0; i < localRules.length; i++) {
              const r = localRules[i];
              const opLabel = (OP_LIST.find(([v]) => v === r.op) || [])[1] || r.op;
              const chip = el("div", { style: "display:flex;align-items:center;gap:4px;padding:4px 8px;background:#eff6ff;border:1px solid #93c5fd;border-radius:6px;margin-bottom:4px;font-size:11px;color:#1d4ed8;" });
              let label = opLabel;
              if (!NO_VALUE_OPS.has(r.op)) label += ": " + (r.value || "");
              if (TWO_VALUE_OPS.has(r.op)) label += " to " + (r.value2 || "");
              chip.appendChild(el("span", { style: "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" }, label));
              const x = el("span", { style: "cursor:pointer;font-size:13px;color:#6b7280;line-height:1;" }, "\u00D7");
              ((idx) => { x.onclick = () => { localRules.splice(idx, 1); renderRules(); }; })(i);
              chip.appendChild(x);
              rulesWrap.appendChild(chip);
            }
          }
          renderRules();
          const opSelect = el("select", { style: "width:100%;padding:5px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;margin-bottom:6px;box-sizing:border-box;" });
          for (const [val, label] of OP_LIST) { opSelect.appendChild(el("option", { value: val }, label)); }
          const valInput = el("input", { type: "text", placeholder: "Value...", style: "width:100%;padding:5px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;box-sizing:border-box;margin-bottom:4px;" });
          const val2Input = el("input", { type: "text", placeholder: "To value...", style: "width:100%;padding:5px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;box-sizing:border-box;margin-bottom:6px;display:none;" });
          function syncInputVis() {
            valInput.style.display = NO_VALUE_OPS.has(opSelect.value) ? "none" : "";
            val2Input.style.display = TWO_VALUE_OPS.has(opSelect.value) ? "" : "none";
          }
          opSelect.onchange = syncInputVis;
          syncInputVis();
          const addBtnRow = el("div", { style: "display:flex;gap:6px;margin-bottom:8px;" });
          const addBtn = el("button", { style: "flex:1;padding:5px;border-radius:6px;border:0;background:#3b82f6;color:#fff;font-size:12px;cursor:pointer;font-weight:600;" }, "Add");
          addBtn.onclick = () => {
            const op = opSelect.value;
            const rule = { op, value: valInput.value, value2: val2Input.value };
            localRules.push(rule);
            valInput.value = ""; val2Input.value = "";
            renderRules();
          };
          const applyBtn = el("button", { style: "flex:1;padding:5px;border-radius:6px;border:0;background:#22c55e;color:#fff;font-size:12px;cursor:pointer;font-weight:600;" }, "Apply");
          applyBtn.onclick = () => {
            if (localRules.length) { state.columnFilters[field] = { mode: localMode, rules: localRules }; }
            else { delete state.columnFilters[field]; }
            pop.remove(); rebuildColumnPanel(); recomputeAndRender();
          };
          addBtnRow.appendChild(addBtn); addBtnRow.appendChild(applyBtn);
          const clearBtn = el("button", { style: "width:100%;padding:5px;border-radius:6px;border:1px solid #e5e7eb;background:#f9fafb;font-size:12px;cursor:pointer;" }, "Clear All");
          clearBtn.onclick = () => { delete state.columnFilters[field]; pop.remove(); rebuildColumnPanel(); recomputeAndRender(); };
          if (localRules.length > 1) pop.appendChild(modeRow);
          pop.appendChild(rulesWrap);
          pop.appendChild(opSelect); pop.appendChild(valInput); pop.appendChild(val2Input);
          pop.appendChild(addBtnRow); pop.appendChild(clearBtn);
          document.body.appendChild(pop);
          setTimeout(() => { if (valInput.style.display !== "none") valInput.focus(); }, 30);
          function onOutside(e) { if (!pop.contains(e.target) && e.target !== anchorEl) { pop.remove(); document.removeEventListener("mousedown", onOutside); } }
          setTimeout(() => document.addEventListener("mousedown", onOutside), 100);
        }
        function showHideColumnTip(anchorEl) {
          try { if (localStorage.getItem(LS_HIDE_TIP_KEY)) return; } catch (_) {}
          const rect = anchorEl.getBoundingClientRect();
          const tip = el("div", { style: `position:fixed;top:${rect.bottom + 6}px;left:${rect.left - 60}px;width:260px;background:#1e293b;color:#e2e8f0;font-size:11px;line-height:1.5;padding:10px 14px;border-radius:8px;z-index:1000005;box-shadow:0 4px 14px rgba(0,0,0,.35);pointer-events:auto;opacity:1;transition:opacity 0.6s ease;` }, "Hidden columns will still appear on your export. Clear the column to fully remove it from your results and export.");
          document.body.appendChild(tip);
          try { localStorage.setItem(LS_HIDE_TIP_KEY, "1"); } catch (_) {}
          function dismiss() { tip.style.opacity = "0"; setTimeout(() => tip.remove(), 600); }
          setTimeout(dismiss, 4000);
          const handler = () => { dismiss(); document.removeEventListener("mousedown", handler); };
          setTimeout(() => document.addEventListener("mousedown", handler), 50);
        }
        function resetGrid() {
          state.sorts = []; state.columnFilters = {}; state.globalFilter = "";
          state.visible = new Set([...phraseFields, ...allFields]);
          state.selected.clear(); state.hiddenRows.clear(); state.colWidths.clear();
          state.cellSel.clear(); state.cellAnchor = null; state.cellDragging = false;
          globalSearchBox.value = "";
          rebuildColumnPanel(); renderSortBadges(); recomputeAndRender();
        }
        const modal = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
        const stickyClose = el("button", { style: "position:fixed;top:20px;right:20px;z-index:1000000;border:0;background:rgba(30,30,30,.75);color:#fff;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4);" }, "X");
        const card = el("div", { style: "background:#fff;width:1280px;max-width:97vw;max-height:92vh;overflow:hidden;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.35);display:flex;flex-direction:column;" });
        const toolbar = el("div", { style: "padding:12px 16px 8px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:8px;flex-wrap:wrap;" });
        const titleEl = el("div", { style: "font-size:15px;font-weight:700;color:#111827;flex-shrink:0;" }, "Results Grid");
        const backToSearchBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #94a3b8;background:#fff;color:#475569;cursor:pointer;font-size:12px;flex-shrink:0;" }, "\u2190 Back to Search");
        const rowCountEl = el("div", { style: "font-size:12px;color:#6b7280;flex-shrink:0;" });
        const selCountEl = el("div", { style: "font-size:12px;color:#2563eb;font-weight:600;flex-shrink:0;display:none;" });
        const cellSelCountEl = el("div", { style: "font-size:12px;color:#16a34a;font-weight:600;flex-shrink:0;display:none;" });
        const hiddenCountEl = el("div", { style: "font-size:12px;color:#f59e0b;font-weight:600;flex-shrink:0;display:none;" });
        const unhideBtn = el("button", { style: "padding:4px 8px;border-radius:6px;border:1px solid #f59e0b;background:#fff;color:#b45309;cursor:pointer;font-size:11px;flex-shrink:0;display:none;" }, "Unhide All");
        unhideBtn.onclick = () => { state.hiddenRows.clear(); recomputeAndRender(); };
        const globalSearchBox = el("input", { type: "text", placeholder: "Search all visible columns...", style: "margin-left:auto;width:240px;max-width:30vw;padding:6px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;" });
        globalSearchBox.oninput = () => { state.globalFilter = globalSearchBox.value || ""; recomputeAndRender(); };
        const columnsBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #d1d5db;background:#f9fafb;cursor:pointer;font-size:14px;flex-shrink:0;", title: "Show / Hide Columns" }, "\u2630");
        const adHocBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #6366f1;background:#fff;color:#6366f1;cursor:pointer;font-size:12px;flex-shrink:0;" }, "+ Add Column");
        adHocBtn.onclick = () => openAdHocPicker();
        const hideSelectedBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #9ca3af;background:#fff;color:#374151;cursor:pointer;font-size:12px;flex-shrink:0;display:none;" }, "Hide Selected");
        hideSelectedBtn.onclick = () => {
          for (const i of state.selected) { const item = state.filteredRows[i]; if (item) { const oi = state.rows.indexOf(item); if (oi !== -1) state.hiddenRows.add(oi); } }
          state.selected.clear(); recomputeAndRender();
        };
        const exportExcelBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #22c55e;background:#fff;color:#16a34a;cursor:pointer;font-size:12px;flex-shrink:0;" }, "Export to Excel");
        exportExcelBtn.onclick = () => exportToExcel();
        const exportTranscriptsBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #6366f1;background:#fff;color:#4f46e5;cursor:pointer;font-size:12px;flex-shrink:0;" }, "Export Transcripts");
        exportTranscriptsBtn.onclick = () => exportTranscripts();
        const queryEnrichBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #8b5cf6;background:#fff;color:#7c3aed;cursor:pointer;font-size:12px;flex-shrink:0;" }, "Queries");
        queryEnrichBtn.onclick = () => openQueryEnrichment();
        const resetBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #f59e0b;background:#fff;color:#b45309;cursor:pointer;font-size:12px;flex-shrink:0;" }, "Reset");
        resetBtn.onclick = () => resetGrid();
        const saveSearchGridBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #22c55e;background:#fff;color:#16a34a;cursor:pointer;font-size:12px;flex-shrink:0;" }, "\uD83D\uDCBE Save Search");
        saveSearchGridBtn.onclick = () => { const fn = api.getShared("openGlobalSavePrompt"); if (fn) fn(); else alert("Save function not available."); };
        const clickModeBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #6366f1;background:#fff;color:#6366f1;cursor:pointer;font-size:12px;flex-shrink:0;" }, "On Click: Play Audio");
        clickModeBtn.onclick = () => {
          state.clickMode = state.clickMode === "play" ? "select" : "play";
          if (state.clickMode === "play") {
            state.cellSel.clear(); state.cellAnchor = null; state.cellDragging = false;
            clickModeBtn.textContent = "On Click: Play Audio";
            clickModeBtn.style.borderColor = "#6366f1"; clickModeBtn.style.color = "#6366f1";
          } else {
            clickModeBtn.textContent = "On Click: Select Field";
            clickModeBtn.style.borderColor = "#22c55e"; clickModeBtn.style.color = "#16a34a";
          }
          recomputeAndRender();
        };
        toolbar.appendChild(titleEl); toolbar.appendChild(backToSearchBtn); toolbar.appendChild(rowCountEl);
        toolbar.appendChild(selCountEl); toolbar.appendChild(cellSelCountEl); toolbar.appendChild(hiddenCountEl); toolbar.appendChild(unhideBtn);
        toolbar.appendChild(columnsBtn); toolbar.appendChild(adHocBtn); toolbar.appendChild(hideSelectedBtn);
        toolbar.appendChild(exportExcelBtn); toolbar.appendChild(exportTranscriptsBtn);
        toolbar.appendChild(queryEnrichBtn); toolbar.appendChild(resetBtn); toolbar.appendChild(saveSearchGridBtn); toolbar.appendChild(clickModeBtn);
        toolbar.appendChild(globalSearchBox);
        const sortBar = el("div", { style: "padding:4px 16px;min-height:32px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;border-bottom:1px solid #f1f5f9;background:#fafafa;" });
        function renderSortBadges() {
          sortBar.innerHTML = "";
          if (!state.sorts.length) { sortBar.appendChild(el("div", { style: "font-size:11px;color:#9ca3af;" }, "No active sorts \u2014 click a column header to sort.")); return; }
          const tierColors = ["#1d4ed8", "#0369a1", "#0f766e"];
          for (let i = 0; i < state.sorts.length; i++) {
            const { field, dir } = state.sorts[i];
            const hIdx = state.fields.indexOf(field);
            const label = hIdx >= 0 ? (state.headers[hIdx] || field) : field;
            const color = tierColors[i] || "#374151";
            const badge = el("div", { draggable: true, style: `display:inline-flex;align-items:center;gap:4px;padding:4px 8px 4px 6px;border-radius:999px;background:${color};color:#fff;font-size:11px;font-weight:600;cursor:grab;user-select:none;` });
            badge.appendChild(el("span", { style: "opacity:0.7;font-size:10px;" }, (i + 1) + "."));
            badge.appendChild(el("span", {}, label));
            badge.appendChild(el("span", {}, dir === 1 ? " \u2191" : " \u2193"));
            const removeEl = el("span", { style: "margin-left:5px;opacity:0.75;font-size:11px;cursor:pointer;" }, "\u2715");
            badge.appendChild(removeEl);
            badge.onclick = (e) => { if (e.target === removeEl) { removeSortTier(i); return; } state.sorts[i].dir *= -1; renderSortBadges(); recomputeAndRender(); };
            badge.addEventListener("dragstart", (e) => { dragSrcIndex = i; e.dataTransfer.effectAllowed = "move"; setTimeout(() => { badge.style.opacity = "0.4"; }, 0); });
            badge.addEventListener("dragend", () => { badge.style.opacity = "1"; dragSrcIndex = null; });
            badge.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
            badge.addEventListener("drop", (e) => { e.preventDefault(); if (dragSrcIndex === null || dragSrcIndex === i) return; const moved = state.sorts.splice(dragSrcIndex, 1)[0]; state.sorts.splice(i, 0, moved); renderSortBadges(); recomputeAndRender(); });
            sortBar.appendChild(badge);
          }
        }
        const body = el("div", { style: "display:flex;flex:1;min-height:0;" });
        const colPanel = el("div", { style: "width:220px;border-right:1px solid #e5e7eb;padding:10px;overflow-y:auto;display:none;flex-shrink:0;" });
        colPanel.appendChild(el("div", { style: "font-size:12px;font-weight:700;margin-bottom:8px;color:#111827;" }, "Show / Hide Columns"));
        const colList = el("div", {});
        colPanel.appendChild(colList);
        function rebuildColumnPanel() {
          colList.innerHTML = "";
          for (let i = 0; i < state.fields.length; i++) {
            const f = state.fields[i], h = state.headers[i] || f;
            const hasFilter = state.columnFilters[f] && state.columnFilters[f].rules && state.columnFilters[f].rules.length;
            const rowEl = el("div", { style: "display:flex;align-items:center;gap:6px;margin:4px 0;" });
            const cb = el("input", { type: "checkbox" });
            cb.checked = state.visible.has(f);
            cb.onchange = () => { if (cb.checked) state.visible.add(f); else state.visible.delete(f); renderHeader(); renderVisibleRows(); };
            const labelEl = el("span", { style: `font-size:11px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;${hasFilter ? "color:#2563eb;font-weight:600;" : "color:#111827;"}` }, h + (hasFilter ? " (filtered)" : ""));
            labelEl.onclick = () => openColumnFilterPopover(f, labelEl);
            rowEl.appendChild(cb); rowEl.appendChild(labelEl);
            colList.appendChild(rowEl);
          }
        }
        columnsBtn.onclick = () => { colPanel.style.display = colPanel.style.display !== "none" ? "none" : "block"; };
        const gridWrap = el("div", { style: "flex:1;min-width:0;display:flex;flex-direction:column;" });
        const tableWrap = el("div", { style: "flex:1;min-height:0;overflow:auto;position:relative;" });
        const table = el("table", { style: "border-collapse:separate;border-spacing:0;table-layout:fixed;" });
        const thead = el("thead", {});
        const tbody = el("tbody", {});
        table.appendChild(thead); table.appendChild(tbody);
        tableWrap.appendChild(table);
        gridWrap.appendChild(tableWrap);
        let resizeField = null, resizeStartX = 0, resizeStartW = 0;
        function onResizeMove(e) {
          if (!resizeField) return;
          const w = Math.max(40, resizeStartW + (e.clientX - resizeStartX));
          state.colWidths.set(resizeField, w);
          renderHeader();
          renderVisibleRows();
        }
        function onResizeUp() {
          resizeField = null;
          document.removeEventListener("mousemove", onResizeMove);
          document.removeEventListener("mouseup", onResizeUp);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        }
        function autoFitColumn(field) {
          const hIdx = state.fields.indexOf(field);
          let maxW = measureText(hIdx >= 0 ? state.headers[hIdx] : field);
          const rows = state.filteredRows;
          const end = Math.min(rows.length, lastRange.end + 200);
          for (let i = lastRange.start; i < end; i++) {
            const w = measureText(getCellDisplay(rows[i], field));
            if (w > maxW) maxW = w;
          }
          state.colWidths.set(field, Math.min(500, Math.max(60, Math.ceil(maxW))));
          renderHeader(); renderVisibleRows();
        }
        function frozenStyle(colIdx, isHeader) {
          const lefts = [0, COL0_W, COL0_W + COL1_W, COL0_W + COL1_W + COL2_W];
          const widths = [COL0_W, COL1_W, COL2_W, PLAY_COL_W];
          const z = isHeader ? 6 : 3;
          return `position:sticky;left:${lefts[colIdx]}px;z-index:${z};width:${widths[colIdx]}px;min-width:${widths[colIdx]}px;max-width:${widths[colIdx]}px;box-sizing:border-box;`;
        }
        function currentFrozenW() {
          return state.clickMode === "select" ? FROZEN_W + PLAY_COL_W : FROZEN_W;
        }
        function cellKey(r, c) { return r + "," + c; }
        function isCellSelected(r, c) { return state.cellSel.has(cellKey(r, c)); }
        function selectRect(r1, c1, r2, c2, additive) {
          if (!additive) state.cellSel.clear();
          const rMin = Math.min(r1, r2), rMax = Math.max(r1, r2);
          const cMin = Math.min(c1, c2), cMax = Math.max(c1, c2);
          for (let r = rMin; r <= rMax; r++) {
            for (let c = cMin; c <= cMax; c++) {
              state.cellSel.add(cellKey(r, c));
            }
          }
        }
        function copyCellSelection() {
          if (!state.cellSel.size) return;
          const visF = state.fields.filter((f) => state.visible.has(f));
          let rMin = Infinity, rMax = -1, cMin = Infinity, cMax = -1;
          for (const key of state.cellSel) {
            const parts = key.split(",");
            const r = parseInt(parts[0]), c = parseInt(parts[1]);
            if (r < rMin) rMin = r; if (r > rMax) rMax = r;
            if (c < cMin) cMin = c; if (c > cMax) cMax = c;
          }
          const copyLines = [];
          for (let r = rMin; r <= rMax; r++) {
            const cells = [];
            for (let c = cMin; c <= cMax; c++) {
              if (state.cellSel.has(cellKey(r, c))) {
                const item = state.filteredRows[r];
                cells.push(item ? getCellDisplay(item, visF[c]) : "");
              } else { cells.push(""); }
            }
            copyLines.push(cells.join("\t"));
          }
          const text = copyLines.join("\n");
          navigator.clipboard.writeText(text).then(() => {
            showCopyNotice(state.cellSel.size);
          }).catch(() => {
            const ta = document.createElement("textarea");
            ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;";
            document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
            showCopyNotice(state.cellSel.size);
          });
        }
        function showCopyNotice(count) {
          const n = el("div", { style: "position:fixed;bottom:20px;right:20px;background:#22c55e;color:#fff;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:600;z-index:1000010;font-family:Segoe UI,Arial,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.2);transition:opacity 0.3s;" }, count + " cell" + (count !== 1 ? "s" : "") + " copied");
          document.body.appendChild(n);
          setTimeout(() => { n.style.opacity = "0"; setTimeout(() => n.remove(), 300); }, 1200);
        }
        function updateCellHighlights() {
          tbody.querySelectorAll("td[data-r]").forEach((td) => {
            const r = parseInt(td.getAttribute("data-r"));
            const c = parseInt(td.getAttribute("data-c"));
            if (isCellSelected(r, c)) {
              td.style.background = "#dbeafe";
              td.style.outline = "1px solid #93c5fd";
              td.style.outlineOffset = "-1px";
            } else {
              td.style.background = "";
              td.style.outline = "";
              td.style.outlineOffset = "";
            }
          });
          updateToolbarCounts();
        }
        function renderHeader() {
          const visFields = state.fields.filter((f) => state.visible.has(f));
          const visHeaders = state.fields.map((f, i) => ({ f, h: state.headers[i] })).filter(({ f }) => state.visible.has(f)).map(({ h }) => h);
          thead.innerHTML = "";
          const trh = el("tr", {});
          const thSel = el("th", { style: `position:sticky;top:0;${frozenStyle(0, true)}background:#f9fafb;border-bottom:2px solid #e5e7eb;padding:6px 4px;` });
          const selectAllCb = el("input", { type: "checkbox", title: "Select all" });
          selectAllCb.onchange = () => {
            if (selectAllCb.checked) { state.filteredRows.forEach((_, i) => state.selected.add(i)); }
            else { state.selected.clear(); }
            renderVisibleRows(); updateToolbarCounts();
          };
          thSel.appendChild(selectAllCb);
          trh.appendChild(thSel);
          trh.appendChild(el("th", { style: `position:sticky;top:0;${frozenStyle(1, true)}background:#f9fafb;border-bottom:2px solid #e5e7eb;padding:4px;font-size:11px;` }));
          trh.appendChild(el("th", { style: `position:sticky;top:0;${frozenStyle(2, true)}background:#f9fafb;border-bottom:2px solid #e5e7eb;padding:4px 6px;font-size:10px;color:#9ca3af;text-align:right;` }, "#"));
          if (state.clickMode === "select") {
            trh.appendChild(el("th", { style: `position:sticky;top:0;${frozenStyle(3, true)}background:#f9fafb;border-bottom:2px solid #e5e7eb;padding:4px;font-size:10px;color:#9ca3af;text-align:center;` }, "\u25B6"));
          }
          for (let i = 0; i < visFields.length; i++) {
            const field = visFields[i], headerText = visHeaders[i] || field;
            const sortIdx = state.sorts.findIndex((s) => s.field === field);
            const hasFilter = state.columnFilters[field] && state.columnFilters[field].rules && state.columnFilters[field].rules.length;
            const tierColors = ["#1d4ed8", "#0369a1", "#0f766e"];
            const sortColor = sortIdx >= 0 ? (tierColors[sortIdx] || "#374151") : null;
            const w = getColWidth(field);
            const th = el("th", {
              style: `position:sticky;top:0;z-index:5;width:${w}px;min-width:${w}px;max-width:${w}px;box-sizing:border-box;background:${sortColor ? "#dbeafe" : (hasFilter ? "#eff6ff" : "#f9fafb")};border-bottom:2px solid ${sortColor || (hasFilter ? "#3b82f6" : "#e5e7eb")};padding:0;font-size:11px;text-align:left;white-space:nowrap;user-select:none;${sortColor ? "color:" + sortColor + ";font-weight:700;" : (hasFilter ? "color:#2563eb;font-weight:600;" : "color:#374151;")}`,
              title: "Click to sort, drag to reorder"
            });
            const thInner = el("div", { style: "display:flex;flex-direction:column;padding:2px 0;" });
            const hideChev = el("div", { style: "text-align:center;font-size:8px;color:#cbd5e1;cursor:pointer;line-height:1;height:12px;transition:color 0.15s;", title: "Hide Column" }, "\u25BE");
            hideChev.onmouseenter = () => { hideChev.textContent = "\u25BE\u25BE"; hideChev.style.color = "#6b7280"; hideChev.style.fontSize = "9px"; };
            hideChev.onmouseleave = () => { hideChev.textContent = "\u25BE"; hideChev.style.color = "#cbd5e1"; hideChev.style.fontSize = "8px"; };
            hideChev.onclick = (e) => { e.stopPropagation(); state.visible.delete(field); showHideColumnTip(hideChev); rebuildColumnPanel(); renderHeader(); renderVisibleRows(); };
            const labelRow = el("div", { style: "display:flex;align-items:center;padding:0 10px 4px;cursor:pointer;" });
            let sortLabel = headerText;
            if (sortIdx >= 0) sortLabel += state.sorts[sortIdx].dir === 1 ? " \u2191" : " \u2193";
            const thLabel = el("span", { style: "flex:1;overflow:hidden;text-overflow:ellipsis;" }, sortLabel);
            const filterIcon = el("span", { style: `font-size:14px;cursor:pointer;margin-left:6px;padding:2px 4px;border-radius:4px;color:${hasFilter ? "#3b82f6" : "#94a3b8"};transition:color 0.15s,background 0.15s;` }, hasFilter ? "\u25BC" : "\u25BE");
            filterIcon.onclick = (e) => { e.stopPropagation(); openColumnFilterPopover(field, filterIcon); };
            filterIcon.onmouseenter = () => { filterIcon.style.color = hasFilter ? "#2563eb" : "#6b7280"; filterIcon.style.background = "#e5e7eb"; };
            filterIcon.onmouseleave = () => { filterIcon.style.color = hasFilter ? "#3b82f6" : "#94a3b8"; filterIcon.style.background = ""; };
            labelRow.appendChild(thLabel); labelRow.appendChild(filterIcon);
            thInner.appendChild(hideChev); thInner.appendChild(labelRow);
            th.appendChild(thInner);
            const resizeHandle = el("div", { style: "position:absolute;top:0;right:0;width:5px;height:100%;cursor:col-resize;z-index:7;" });
            resizeHandle.addEventListener("mousedown", (e) => {
              e.stopPropagation(); e.preventDefault();
              resizeField = field; resizeStartX = e.clientX; resizeStartW = w;
              document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
              document.addEventListener("mousemove", onResizeMove);
              document.addEventListener("mouseup", onResizeUp);
            });
            resizeHandle.addEventListener("dblclick", (e) => { e.stopPropagation(); autoFitColumn(field); });
            th.style.position = "sticky"; th.style.top = "0";
            th.style.position += "";
            th.appendChild(resizeHandle);
            th.setAttribute("data-col-idx", i);
            th.draggable = true;
            th.addEventListener("dragstart", (e) => {
              dragColIndex = i; e.dataTransfer.effectAllowed = "move";
              const ghost = createDragGhost(headerText);
              e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
              setTimeout(() => { th.style.opacity = "0.3"; }, 0);
            });
            th.addEventListener("dragend", () => { th.style.opacity = "1"; dragColIndex = null; removeDragGhost(); clearDropIndicators(); });
            th.addEventListener("dragover", (e) => {
              if (dragColIndex === null) return; e.preventDefault(); e.dataTransfer.dropEffect = "move";
              clearDropIndicators();
              const myIdx = parseInt(th.getAttribute("data-col-idx"));
              if (myIdx === dragColIndex) return;
              th.style[dragColIndex < myIdx ? "borderRight" : "borderLeft"] = "3px solid #3b82f6";
            });
            th.addEventListener("dragleave", () => { th.style.borderLeft = ""; th.style.borderRight = ""; });
            th.addEventListener("drop", (e) => {
              e.preventDefault(); clearDropIndicators(); removeDragGhost();
              if (dragColIndex === null || dragColIndex === i) return;
              const srcField = visFields[dragColIndex], dstField = visFields[i];
              const srcG = state.fields.indexOf(srcField), dstG = state.fields.indexOf(dstField);
              if (srcG === -1 || dstG === -1) return;
              const [mf] = state.fields.splice(srcG, 1); const [mh] = state.headers.splice(srcG, 1);
              const nd = state.fields.indexOf(dstField);
              state.fields.splice(nd, 0, mf); state.headers.splice(nd, 0, mh);
              dragColIndex = null; rebuildColumnPanel(); renderHeader(); renderVisibleRows();
            });
            th.onclick = (e) => {
              if (dragColIndex !== null || e.target === resizeHandle || e.target === filterIcon || e.target === hideChev) return;
              if (state.clickMode === "select") {
                if (!e.shiftKey && !e.ctrlKey) state.cellSel.clear();
                for (let r = 0; r < state.filteredRows.length; r++) state.cellSel.add(cellKey(r, i));
                updateCellHighlights();
                return;
              }
              handleHeaderClick(field);
            };
            trh.appendChild(th);
          }
          thead.appendChild(trh);
          const totalW = currentFrozenW() + visFields.reduce((s, f) => s + getColWidth(f), 0);
          table.style.width = totalW + "px";
        }
        function getVisibleRange() {
          const rows = state.filteredRows;
          if (!rows.length) return { start: 0, end: 0 };
          const scrollTop = tableWrap.scrollTop;
          const viewH = tableWrap.clientHeight;
          const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
          const end = Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW_HEIGHT) + BUFFER_ROWS);
          return { start, end };
        }
        function renderVisibleRows() {
          const rows = state.filteredRows;
          const range = getVisibleRange();
          lastRange = range;
          const visFields = state.fields.filter((f) => state.visible.has(f));
          updateToolbarCounts();
          const selAll = thead.querySelector("input[type=checkbox]");
          if (selAll) {
            selAll.checked = rows.length > 0 && rows.every((_, i) => state.selected.has(i));
            selAll.indeterminate = state.selected.size > 0 && !selAll.checked;
          }
          const isGroupTop = new Set(), isGroupBottom = new Set();
          for (let gi = range.start; gi < range.end; gi++) {
            if (!state.selected.has(gi)) continue;
            if (!state.selected.has(gi - 1)) isGroupTop.add(gi);
            if (!state.selected.has(gi + 1)) isGroupBottom.add(gi);
          }
          const frozenCols = state.clickMode === "select" ? 4 : 3;
          tbody.innerHTML = "";
          if (range.start > 0) {
            const spacer = el("tr", {}); spacer.appendChild(el("td", { colSpan: visFields.length + frozenCols, style: `height:${range.start * ROW_HEIGHT}px;padding:0;border:0;` }));
            tbody.appendChild(spacer);
          }
          for (let ri = range.start; ri < range.end; ri++) {
            const item = rows[ri];
            const smid = getSourceMediaId(item);
            const isActive = smid && smid == activeSmid;
            const isChecked = state.selected.has(ri);
            const tr = el("tr", { style: `height:${ROW_HEIGHT}px;${isActive ? "background:#eff6ff;outline:2px solid #3b82f6;outline-offset:-2px;" : (isChecked ? "background:#eff6ff;" : (ri % 2 ? "background:#f8fafc;" : "background:#fff;"))}cursor:pointer;` });
            const bgColor = isActive ? "#eff6ff" : (isChecked ? "#eff6ff" : (ri % 2 ? "#f8fafc" : "#fff"));
            const tdSel = el("td", { style: `${frozenStyle(0, false)}background:${bgColor};padding:2px 4px;border-bottom:1px solid #f1f5f9;vertical-align:middle;height:${ROW_HEIGHT}px;` });
            const rowCb = el("input", { type: "checkbox" });
            rowCb.checked = isChecked;
            rowCb.onclick = (e) => { e.stopPropagation(); };
            rowCb.onchange = () => { if (rowCb.checked) state.selected.add(ri); else state.selected.delete(ri); renderVisibleRows(); updateToolbarCounts(); };
            const selStack = el("div", { style: "display:flex;flex-direction:column;align-items:center;" });
            if (isChecked && isGroupTop.has(ri)) {
              const upA = el("span", { style: "font-size:9px;cursor:pointer;color:#9ca3af;line-height:1;", title: "Select all above" }, "\u25B2");
              upA.onclick = (e) => { e.stopPropagation(); for (let j = 0; j < ri; j++) state.selected.add(j); renderVisibleRows(); updateToolbarCounts(); };
              selStack.appendChild(upA);
            }
            selStack.appendChild(rowCb);
            if (isChecked && isGroupBottom.has(ri)) {
              const dnA = el("span", { style: "font-size:9px;cursor:pointer;color:#9ca3af;line-height:1;", title: "Select all below" }, "\u25BC");
              dnA.onclick = (e) => { e.stopPropagation(); for (let j = ri + 1; j < rows.length; j++) state.selected.add(j); renderVisibleRows(); updateToolbarCounts(); };
              selStack.appendChild(dnA);
            }
            tdSel.appendChild(selStack);
            tr.appendChild(tdSel);
            const tdHide = el("td", { style: `${frozenStyle(1, false)}background:${bgColor};padding:2px 4px;border-bottom:1px solid #f1f5f9;height:${ROW_HEIGHT}px;` });
            const hideBtn = el("span", { style: "font-size:11px;cursor:pointer;color:#d1d5db;", title: "Hide this row" }, "\u00BB");
            hideBtn.onmouseenter = () => { hideBtn.style.color = "#6b7280"; };
            hideBtn.onmouseleave = () => { hideBtn.style.color = "#d1d5db"; };
            hideBtn.onclick = (e) => { e.stopPropagation(); const oi = state.rows.indexOf(item); if (oi !== -1) state.hiddenRows.add(oi); state.selected.delete(ri); recomputeAndRender(); };
            tdHide.appendChild(hideBtn);
            tr.appendChild(tdHide);
            const tdRowNum = el("td", { style: `${frozenStyle(2, false)}background:${bgColor};padding:2px 6px;border-bottom:1px solid #f1f5f9;font-size:10px;color:#9ca3af;text-align:right;height:${ROW_HEIGHT}px;${state.clickMode === "select" ? "cursor:pointer;" : ""}` }, String(ri + 1));
            if (state.clickMode === "select") {
              tdRowNum.onclick = (e) => {
                e.stopPropagation();
                if (!e.ctrlKey && !e.shiftKey) state.cellSel.clear();
                for (let c = 0; c < visFields.length; c++) state.cellSel.add(cellKey(ri, c));
                updateCellHighlights();
              };
            }
            tr.appendChild(tdRowNum);
            if (state.clickMode === "select") {
              const tdPlay = el("td", { style: `${frozenStyle(3, false)}background:${bgColor};padding:2px 4px;border-bottom:1px solid #f1f5f9;text-align:center;height:${ROW_HEIGHT}px;` });
              const playIcon = el("span", { style: "font-size:13px;cursor:pointer;color:#3b82f6;", title: "Play" }, "\u25B6");
              playIcon.onclick = (e) => { e.stopPropagation(); triggerPlay(item); };
              playIcon.onmouseenter = () => { playIcon.style.color = "#1d4ed8"; };
              playIcon.onmouseleave = () => { playIcon.style.color = "#3b82f6"; };
              tdPlay.appendChild(playIcon);
              tr.appendChild(tdPlay);
            }
            for (let ci = 0; ci < visFields.length; ci++) {
              const field = visFields[ci];
              const display = getCellDisplay(item, field);
              const w = getColWidth(field);
              const cSel = state.clickMode === "select" && isCellSelected(ri, ci);
              const td = el("td", {
                style: `padding:4px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:${w}px;min-width:${w}px;max-width:${w}px;box-sizing:border-box;height:${ROW_HEIGHT}px;${state.clickMode === "select" ? "cursor:cell;" : ""}${cSel ? "background:#dbeafe;outline:1px solid #93c5fd;outline-offset:-1px;" : ""}`,
                title: display
              }, display);
              td.setAttribute("data-r", String(ri));
              td.setAttribute("data-c", String(ci));
              tr.appendChild(td);
            }
            tr.addEventListener("click", (e) => {
              if (e.target === rowCb || tdSel.contains(e.target) || tdHide.contains(e.target) || tdRowNum.contains(e.target)) return;
              if (state.clickMode === "select") return;
              triggerPlay(item);
            });
            tbody.appendChild(tr);
          }
          if (range.end < rows.length) {
            const spacer = el("tr", {}); spacer.appendChild(el("td", { colSpan: visFields.length + frozenCols, style: `height:${(rows.length - range.end) * ROW_HEIGHT}px;padding:0;border:0;` }));
            tbody.appendChild(spacer);
          }
        }
        function recomputeAndRender() { recomputeRows(); renderHeader(); renderVisibleRows(); }
        tableWrap.addEventListener("scroll", () => {
          if (rafPending) return;
          rafPending = true;
          requestAnimationFrame(() => { renderVisibleRows(); rafPending = false; });
        });
        tbody.addEventListener("mousedown", (e) => {
          if (state.clickMode !== "select") return;
          const td = e.target.closest ? e.target.closest("td[data-r]") : null;
          if (!td) return;
          e.preventDefault();
          const r = parseInt(td.getAttribute("data-r")), c = parseInt(td.getAttribute("data-c"));
          if (e.shiftKey && state.cellAnchor) {
            selectRect(state.cellAnchor.r, state.cellAnchor.c, r, c, e.ctrlKey);
          } else if (e.ctrlKey) {
            const key = cellKey(r, c);
            if (state.cellSel.has(key)) state.cellSel.delete(key); else state.cellSel.add(key);
            state.cellAnchor = { r: r, c: c };
          } else {
            state.cellSel.clear();
            state.cellSel.add(cellKey(r, c));
            state.cellAnchor = { r: r, c: c };
          }
          state.cellDragging = true;
          updateCellHighlights();
          const onMove = (ev) => {
            if (!state.cellDragging) return;
            const target = document.elementFromPoint(ev.clientX, ev.clientY);
            const cell = target && target.closest ? target.closest("td[data-r]") : null;
            if (!cell || !state.cellAnchor) return;
            const cr = parseInt(cell.getAttribute("data-r")), cc = parseInt(cell.getAttribute("data-c"));
            selectRect(state.cellAnchor.r, state.cellAnchor.c, cr, cc, false);
            updateCellHighlights();
          };
          const onUp = () => {
            state.cellDragging = false;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        });
        function onCellCopyKey(e) {
          if ((e.ctrlKey || e.metaKey) && e.key === "c" && state.clickMode === "select" && state.cellSel.size) {
            e.preventDefault();
            copyCellSelection();
          }
        }
        document.addEventListener("keydown", onCellCopyKey);
        tableWrap.addEventListener("contextmenu", (e) => {
          if (state.clickMode !== "select" || !state.cellSel.size) return;
          e.preventDefault();
          document.querySelectorAll("[data-cell-ctx]").forEach((m) => m.remove());
          const menu = el("div", { style: `position:fixed;top:${e.clientY}px;left:${e.clientX}px;background:#fff;border:1px solid #d1d5db;border-radius:8px;padding:4px 0;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:1000010;font-family:Segoe UI,Arial,sans-serif;` });
          menu.setAttribute("data-cell-ctx", "1");
          const copyItem = el("div", { style: "padding:6px 16px;font-size:12px;cursor:pointer;color:#111827;" }, "Copy");
          copyItem.onmouseenter = () => { copyItem.style.background = "#e8f0fe"; };
          copyItem.onmouseleave = () => { copyItem.style.background = ""; };
          copyItem.onclick = () => { copyCellSelection(); menu.remove(); };
          menu.appendChild(copyItem);
          document.body.appendChild(menu);
          setTimeout(() => {
            const handler = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener("mousedown", handler); } };
            document.addEventListener("mousedown", handler);
          }, 50);
        });
        function triggerPlay(item) {
          const smid = getSourceMediaId(item);
          if (!smid) return;
          const label = getRowLabel(item);
          if (!playerCtrl) {
            const playerTool = api.listTools().find((t) => t.id === "mediaPlayer");
            if (!playerTool || !playerTool._openPlayerPane) { window.open(PLAYER_URL(smid), "_blank"); return; }
            playerCtrl = playerTool._openPlayerPane(card, (registerStop) => { stopPlayer = registerStop; });
          }
          activeSmid = smid;
          playerCtrl.loadCall(smid, label, undefined, searchQuery);
          renderVisibleRows();
        }
        async function openQueryEnrichment() {
          let queryCatalog = [];
          try {
            const res = await fetch("https://apug01.nxondemand.com/NxIA/api/queries", { credentials: "include" });
            if (res.ok) { var raw = await res.json(); queryCatalog = Array.isArray(raw) ? raw : (Array.isArray(raw.data) ? raw.data : []); }
          } catch (_) {}
          if (!queryCatalog.length) { alert("Could not load query catalog."); return; }
          const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000003;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
          const box = el("div", { style: "background:#fff;width:480px;max-height:80vh;overflow:auto;border-radius:12px;padding:22px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
          box.appendChild(el("div", { style: "font-size:15px;font-weight:700;color:#111827;margin-bottom:4px;" }, "Query Search"));
          box.appendChild(el("div", { style: "font-size:11px;color:#6b7280;line-height:1.4;margin-bottom:14px;" }, "Select queries to check which calls matched."));
          const searchInput = el("input", { type: "text", placeholder: "Search queries...", style: "width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;margin-bottom:8px;" });
          box.appendChild(searchInput);
          const listWrap = el("div", { style: "max-height:220px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:14px;" });
          let queryQueue = [];
          const queueWrap = el("div", { style: "display:none;flex-wrap:wrap;gap:6px;padding:8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:14px;" });
          const runBtn = el("button", { style: "width:100%;padding:10px;border-radius:10px;border:0;background:linear-gradient(135deg,#6d28d9,#8b5cf6);color:#fff;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(139,92,246,0.35);margin-bottom:8px;opacity:0.5;pointer-events:none;" }, "Search Query");
          function renderQueue() {
            queueWrap.innerHTML = "";
            if (!queryQueue.length) { queueWrap.style.display = "none"; runBtn.style.opacity = "0.5"; runBtn.style.pointerEvents = "none"; runBtn.textContent = "Search Query"; return; }
            queueWrap.style.display = "flex"; runBtn.style.opacity = "1"; runBtn.style.pointerEvents = "auto";
            runBtn.textContent = queryQueue.length === 1 ? "Search Query" : "Search Queries";
            for (let qi = 0; qi < queryQueue.length; qi++) {
              const q = queryQueue[qi];
              const chip = el("div", { style: "display:inline-flex;align-items:center;gap:5px;background:#eff6ff;border:1px solid #93c5fd;border-radius:999px;padding:4px 10px;font-size:11px;color:#1d4ed8;font-weight:600;" });
              chip.appendChild(el("span", {}, q.name));
              const rx = el("span", { style: "cursor:pointer;font-size:13px;color:#6b7280;line-height:1;" }, "\u00D7");
              ((query) => { rx.onclick = () => { queryQueue = queryQueue.filter((qq) => qq.id !== query.id); renderQueue(); renderQList(searchInput.value); }; })(q);
              chip.appendChild(rx); queueWrap.appendChild(chip);
            }
          }
          function renderQList(filter) {
            listWrap.innerHTML = "";
            const fl = (filter || "").toLowerCase().trim();
            const matches = queryCatalog.filter((q) => !fl || (q.name || "").toLowerCase().includes(fl));
            if (!matches.length) { listWrap.appendChild(el("div", { style: "padding:10px;font-size:12px;color:#6b7280;" }, "No queries found.")); return; }
            for (const q of matches) {
              const sp = (q.speaker || "Either").toLowerCase();
              const spLabel = sp === "agent" ? "Agent" : sp === "customer" ? "Customer" : "Either";
              const inQ = queryQueue.some((qq) => qq.id === q.id);
              const row = el("div", { style: `display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:12px;color:#111827;${inQ ? "background:#eff6ff;" : ""}` });
              row.appendChild(el("div", { style: "flex:1;" }, q.name));
              row.appendChild(el("div", { style: "font-size:10px;color:#6b7280;flex-shrink:0;" }, spLabel));
              ((query, rowEl) => {
                rowEl.onmouseenter = () => { if (!queryQueue.some((qq) => qq.id === query.id)) rowEl.style.background = "#e8f0fe"; };
                rowEl.onmouseleave = () => { rowEl.style.background = queryQueue.some((qq) => qq.id === query.id) ? "#eff6ff" : ""; };
                rowEl.onclick = () => { const idx = queryQueue.findIndex((qq) => qq.id === query.id); if (idx >= 0) queryQueue.splice(idx, 1); else queryQueue.push(query); renderQueue(); renderQList(searchInput.value); };
              })(q, row);
              listWrap.appendChild(row);
            }
          }
          searchInput.addEventListener("input", () => renderQList(searchInput.value));
          renderQList("");
          box.appendChild(listWrap); box.appendChild(queueWrap);
          runBtn.onclick = async () => { if (!queryQueue.length) return; const toRun = queryQueue.slice(); overlay.remove(); await runQueryEnrichment(toRun); };
          const cancelBtn = el("button", { style: "width:100%;padding:8px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;cursor:pointer;font-size:13px;color:#6b7280;" }, "Cancel");
          cancelBtn.onclick = () => overlay.remove();
          box.appendChild(runBtn); box.appendChild(cancelBtn);
          overlay.appendChild(box); document.body.appendChild(overlay);
          setTimeout(() => searchInput.focus(), 50);
        }
        async function runQueryEnrichment(queries) {
          if (!Array.isArray(queries)) queries = [queries];
          const HITS_URL = (smid) => "https://apug01.nxondemand.com/NxIA/api/hits/fetch/" + smid;
          const BATCH = 50;
          const smids = [];
          for (let si = 0; si < state.rows.length; si++) {
            const smid = getSourceMediaId(state.rows[si]);
            if (smid) smids.push({ idx: si, smid: String(smid) });
          }
          if (!smids.length) { alert("No SMIDs found in results."); return; }
          const scoreMaps = new Map();
          for (let qmi = 0; qmi < queries.length; qmi++) { scoreMaps.set(queries[qmi].id, new Map()); }
          const progOverlay = el("div", { style: "position:fixed;top:16px;right:16px;z-index:1000010;width:360px;background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:10px;padding:12px;font-family:Segoe UI,Arial,sans-serif;box-shadow:0 12px 28px rgba(0,0,0,.35);" });
          const progTitle = el("div", { style: "font-weight:700;font-size:13px;color:#c4b5fd;margin-bottom:6px;" }, "Searching " + queries.length + " quer" + (queries.length === 1 ? "y" : "ies"));
          const progStatus = el("div", { style: "font-size:12px;margin-bottom:6px;" }, "Starting...");
          const progBarOuter = el("div", { style: "height:8px;background:#1f2937;border-radius:999px;overflow:hidden;border:1px solid #374151;" });
          const progBarInner = el("div", { style: "height:100%;width:0%;background:#8b5cf6;transition:width 0.3s;" });
          progBarOuter.appendChild(progBarInner);
          const progEta = el("div", { style: "font-size:10px;color:#94a3b8;margin-top:4px;" });
          const progCancel = el("div", { style: "margin-top:6px;font-size:11px;color:#f87171;cursor:pointer;text-decoration:underline;" }, "Cancel");
          let cancelled = false;
          progCancel.onclick = () => { cancelled = true; };
          progOverlay.appendChild(progTitle); progOverlay.appendChild(progStatus);
          progOverlay.appendChild(progBarOuter); progOverlay.appendChild(progEta); progOverlay.appendChild(progCancel);
          document.body.appendChild(progOverlay);
          let done = 0;
          const startTime = Date.now();
          for (let bi = 0; bi < smids.length; bi += BATCH) {
            if (cancelled) break;
            const batch = smids.slice(bi, bi + BATCH);
            const promises = batch.map((entry) => {
              return fetch(HITS_URL(entry.smid), { credentials: "include" })
                .then((r) => r.ok ? r.json() : [])
                .then((hits) => {
                  const arr = Array.isArray(hits) ? hits : (hits && Array.isArray(hits.data) ? hits.data : []);
                  for (let qi = 0; qi < queries.length; qi++) {
                    const query = queries[qi];
                    const matches = arr.filter((h) => h.id === query.id || h.name === query.name);
                    let best = 0;
                    for (let mi = 0; mi < matches.length; mi++) { if ((matches[mi].score || 0) > best) best = matches[mi].score; }
                    scoreMaps.get(query.id).set(entry.smid, best);
                  }
                })
                .catch(() => {
                  for (let qi = 0; qi < queries.length; qi++) { scoreMaps.get(queries[qi].id).set(entry.smid, 0); }
                });
            });
            await Promise.all(promises);
            done += batch.length;
            const pct = Math.round((done / smids.length) * 100);
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = done / elapsed;
            const remaining = rate > 0 ? Math.ceil((smids.length - done) / rate) : 0;
            progStatus.textContent = done + " / " + smids.length + " calls checked";
            progBarInner.style.width = pct + "%";
            progEta.textContent = remaining > 0 ? "~" + remaining + "s remaining" : "";
            if (bi + BATCH < smids.length && !cancelled) await new Promise((r) => setTimeout(r, 100));
          }
          progOverlay.remove();
          if (cancelled) return;
          for (let qi = 0; qi < queries.length; qi++) {
            const query = queries[qi];
            const colName = "__QUERY_" + query.id + "__";
            const colHeader = query.name;
            const qScoreMap = scoreMaps.get(query.id);
            for (let ri = 0; ri < state.rows.length; ri++) {
              const item = state.rows[ri];
              const rowSmid = String(getSourceMediaId(item) || "");
              const r = item.row || item;
              r[colName] = qScoreMap.has(rowSmid) ? qScoreMap.get(rowSmid) : "";
            }
            if (!state.fields.includes(colName)) {
              state.fields.unshift(colName);
              state.headers.unshift(colHeader);
              state.visible.add(colName);
            }
          }
          rebuildColumnPanel();
          renderSortBadges();
          recomputeAndRender();
        }
        body.appendChild(colPanel);
        body.appendChild(gridWrap);
        card.appendChild(toolbar);
        card.appendChild(sortBar);
        card.appendChild(body);
        modal.appendChild(card);
        document.body.appendChild(modal);
        document.body.appendChild(stickyClose);
        let stopPlayer = null;
        function close() {
          if (typeof stopPlayer === "function") stopPlayer();
          removeDragGhost();
          try { modal.remove(); } catch (_) {}
          try { stickyClose.remove(); } catch (_) {}
          document.querySelectorAll("[data-col-filter-popover]").forEach((p) => p.remove());
          document.removeEventListener("keydown", onCellCopyKey);
          document.querySelectorAll("[data-cell-ctx]").forEach((p) => p.remove());
        }
        stickyClose.onclick = close;
        backToSearchBtn.onclick = () => {
          close();
          api.setShared("returnToSearch", true);
          const searchTool = api.listTools().find((t) => t.id === "search");
          if (searchTool) searchTool.open();
        };
        try {
          const res = await fetch("https://apug01.nxondemand.com/NxIA/api-gateway/explore/api/v1.0/metadata/fields/names", { credentials: "include", cache: "no-store" });
          if (res.ok) {
            const json = await res.json();
            api.setShared("metadataFields", Array.isArray(json) ? json.filter((f) => f.isEnabled !== false) : []);
          }
        } catch (_) {}
        rebuildColumnPanel();
        renderSortBadges();
        recomputeAndRender();
      } catch (e) {
        console.error(e);
        alert("Failed to open grid. Check console for details.");
      }
    })();
  }
  api.registerTool({ id: "resultsGrid", label: "Results Grid", hidden: true, open: openResultsGrid });
})();
