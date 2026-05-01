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
            return (item.__phraseOffsets__ && item.__phraseOffsets__.length)
              ? item.__phraseOffsets__.join("|")
              : "";
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
          hiddenRows: new Set()
        };

        let dragColIndex = null;
        let dragSrcIndex = null;
        let dragGhost = null;
        let playerCtrl = null;
        let activeSmid = null;

        function createDragGhost(text) {
          if (dragGhost) dragGhost.remove();
          dragGhost = el("div", {
            style: "position:fixed;top:-9999px;left:-9999px;z-index:1000010;background:#1d4ed8;color:#fff;font-size:11px;font-weight:700;padding:6px 14px;border-radius:6px;white-space:nowrap;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.3);font-family:Segoe UI,Arial,sans-serif;"
          }, text);
          document.body.appendChild(dragGhost);
          return dragGhost;
        }

        function removeDragGhost() {
          if (dragGhost) { dragGhost.remove(); dragGhost = null; }
        }

        function clearDropIndicators() {
          thead.querySelectorAll("th").forEach((th) => {
            th.style.borderLeft = "";
            th.style.borderRight = "";
          });
        }

        function applySort(rows) {
          if (!state.sorts.length) return rows;
          return rows.slice().sort((a, b) => {
            for (let i = 0; i < state.sorts.length; i++) {
              const { field, dir } = state.sorts[i];
              const va = getCellValue(a, field);
              const vb = getCellValue(b, field);
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
          if (existing === 0) {
            state.sorts[0].dir *= -1;
          } else if (existing > 0) {
            const [removed] = state.sorts.splice(existing, 1);
            removed.dir = 1;
            state.sorts.unshift(removed);
          } else {
            state.sorts.unshift({ field, dir: 1 });
            if (state.sorts.length > 3) state.sorts.length = 3;
          }
          renderSortBadges();
          renderTable();
        }

        function removeSortTier(index) {
          state.sorts.splice(index, 1);
          renderSortBadges();
          renderTable();
        }

        function applyColumnFilters(rows) {
          const active = Object.entries(state.columnFilters).filter(([, f]) => f && f.op);
          if (!active.length) return rows;
          return rows.filter((item) => {
            for (const [field, filter] of active) {
              const cell = getCellValue(item, field);
              const cellLower = cell.toLowerCase();
              const val = (filter.value || "").trim().toLowerCase();
              const numCell = Number(cell);
              const numVal = Number(filter.value);
              switch (filter.op) {
                case "hideempty":
                  if (cell === "" || cell === "0") return false;
                  break;
                case "showempty":
                  if (cell !== "" && cell !== "0") return false;
                  break;
                case "contains":
                  if (!val || !cellLower.includes(val)) return false;
                  break;
                case "notcontains":
                  if (val && cellLower.includes(val)) return false;
                  break;
                case "exact":
                  if (cellLower !== val) return false;
                  break;
                case "gt":
                  if (isNaN(numCell) || isNaN(numVal) || numCell <= numVal) return false;
                  break;
                case "lt":
                  if (isNaN(numCell) || isNaN(numVal) || numCell >= numVal) return false;
                  break;
                case "eq":
                  if (isNaN(numCell) || isNaN(numVal) || numCell !== numVal) return false;
                  break;
              }
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
          return rows.filter((item) => {
            const origIdx = state.rows.indexOf(item);
            return !state.hiddenRows.has(origIdx);
          });
        }

        function getFilteredSortedRows() {
          let rows = state.rows.slice();
          rows = applyHiddenFilter(rows);
          rows = applyColumnFilters(rows);
          rows = applyGlobalFilter(rows);
          rows = applySort(rows);
          return rows;
        }

        function getSelectedItems() {
          const rows = getFilteredSortedRows();
          return [...state.selected].map((i) => rows[i]).filter(Boolean);
        }

        function updateToolbarCounts() {
          const rows = getFilteredSortedRows();
          rowCountEl.textContent = rows.length.toLocaleString() + " of " + state.rows.length.toLocaleString() + " rows";
          if (state.selected.size > 0) {
            selCountEl.textContent = state.selected.size.toLocaleString() + " selected";
            selCountEl.style.display = "";
            hideSelectedBtn.style.display = "";
          } else {
            selCountEl.style.display = "none";
            hideSelectedBtn.style.display = "none";
          }
          if (state.hiddenRows.size > 0) {
            hiddenCountEl.textContent = state.hiddenRows.size.toLocaleString() + " hidden";
            hiddenCountEl.style.display = "";
            unhideBtn.style.display = "";
          } else {
            hiddenCountEl.style.display = "none";
            unhideBtn.style.display = "none";
          }
        }

        function confirmExportScope(onSelected, onAll) {
          if (!state.selected.size) { onAll(); return; }
          const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000003;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
          const box = el("div", { style: "background:#fff;width:400px;border-radius:12px;padding:22px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
          box.appendChild(el("div", { style: "font-size:14px;font-weight:700;color:#111827;margin-bottom:8px;" }, "Export Options"));
          box.appendChild(el("div", { style: "font-size:13px;color:#374151;margin-bottom:18px;" },
            `You have ${state.selected.size.toLocaleString()} item${state.selected.size !== 1 ? "s" : ""} selected. Would you like to export just the selected items or the entire dataset?`
          ));
          const btnRow = el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;" });
          const selBtn = el("button", { style: "flex:1;padding:9px;border-radius:8px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:13px;font-weight:600;cursor:pointer;" }, "Export Selected");
          const allBtn = el("button", { style: "flex:1;padding:9px;border-radius:8px;border:0;background:#f9fafb;border:1px solid #d1d5db;color:#111827;font-size:13px;cursor:pointer;" }, "Export All");
          const cancelBtn = el("button", { style: "width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:13px;cursor:pointer;color:#6b7280;" }, "Cancel");
          selBtn.onclick = () => { overlay.remove(); onSelected(); };
          allBtn.onclick = () => { overlay.remove(); onAll(); };
          cancelBtn.onclick = () => overlay.remove();
          btnRow.appendChild(selBtn);
          btnRow.appendChild(allBtn);
          box.appendChild(btnRow);
          box.appendChild(cancelBtn);
          overlay.appendChild(box);
          document.body.appendChild(overlay);
        }

        async function fetchAdHocColumn(storageName, displayName) {
          if (state.adHocPending) { alert("A column fetch is already in progress."); return; }
          if (state.fields.includes(storageName)) { alert("That column is already in the grid."); return; }
          state.adHocPending = true;
          adHocBtn.disabled = true;
          adHocBtn.innerHTML = "";
          const spinEl = document.createElement("span");
          spinEl.textContent = "Adding column";
          const dotEl = document.createElement("span");
          dotEl.style.cssText = "display:inline-block;width:18px;text-align:left;";
          adHocBtn.appendChild(spinEl);
          adHocBtn.appendChild(dotEl);
          let dotCount = 0;
          const dotInterval = setInterval(() => {
            dotCount = (dotCount + 1) % 4;
            dotEl.textContent = ".".repeat(dotCount);
          }, 400);
          try {
            const smids = state.rows.map((item) => getSourceMediaId(item)).filter(Boolean);
            if (!smids.length) throw new Error("No sourceMediaId values found.");
            const payload = {
              from: 0, to: smids.length,
              fields: ["sourceMediaId", storageName],
              query: {
                operator: "AND", invertOperator: false,
                filters: [{ operator: "AND", invertOperator: false, filterType: "interactions", filters: [{ operator: "IN", type: "KEYWORD", parameterName: "sourceMediaId", value: smids }] }]
              }
            };
            const res = await fetch(BASE_SEARCH_URL, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            if (!res.ok) throw new Error("API returned " + res.status);
            const json = await res.json();
            const results = Array.isArray(json.results) ? json.results : [];
            const valueMap = new Map();
            for (const r of results) {
              const smid = String(r.sourceMediaId || "").trim();
              if (smid) valueMap.set(smid, getFieldValue(r, storageName));
            }
            for (const item of state.rows) {
              const smid = String(getSourceMediaId(item) || "").trim();
              const r = item.row || item;
              r[storageName] = valueMap.get(smid) || "";
            }
            state.fields.push(storageName);
            state.headers.push(displayName);
            state.visible.add(storageName);
            rebuildColumnPanel();
            renderSortBadges();
            renderTable();
          } catch (err) {
            console.error(err);
            alert("Column fetch failed: " + (err.message || err));
          } finally {
            clearInterval(dotInterval);
            state.adHocPending = false;
            adHocBtn.disabled = false;
            adHocBtn.textContent = "+ Add Column";
          }
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
          overlay.appendChild(box);
          document.body.appendChild(overlay);
          setTimeout(() => input.focus(), 50);
        }

        function openColumnFilterPopover(field, anchorEl) {
          document.querySelectorAll("[data-col-filter-popover]").forEach((p) => p.remove());
          const existing = state.columnFilters[field] || { op: "contains", value: "" };
          const rect = anchorEl.getBoundingClientRect();
          const pop = el("div", {
            style: ["position:fixed", "top:" + (rect.bottom + 4) + "px", "left:" + rect.left + "px", "width:240px", "background:#fff", "border:1px solid #e5e7eb", "border-radius:10px", "padding:12px", "box-shadow:0 6px 20px rgba(0,0,0,.18)", "z-index:1000002", "font-family:Segoe UI,Arial,sans-serif"].join(";")
          });
          pop.setAttribute("data-col-filter-popover", "1");
          const opSelect = el("select", { style: "width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;margin-bottom:8px;box-sizing:border-box;" });
          [["hideempty", "Hide Empty"], ["showempty", "Show Empty Only"], ["contains", "Contains"], ["notcontains", "Does Not Contain"], ["exact", "Exact Match"], ["gt", "Greater Than"], ["lt", "Less Than"], ["eq", "Equal To"]].forEach(([val, label]) => {
            const opt = el("option", { value: val }, label);
            if (val === existing.op) opt.selected = true;
            opSelect.appendChild(opt);
          });
          const valInput = el("input", { type: "text", placeholder: "Filter value...", value: existing.value || "", style: "width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;box-sizing:border-box;margin-bottom:8px;" });
          const noValueOps = ["hideempty", "showempty"];
          function syncInputVis() { valInput.style.display = noValueOps.includes(opSelect.value) ? "none" : ""; }
          syncInputVis();
          opSelect.onchange = syncInputVis;
          const btnRow = el("div", { style: "display:flex;gap:6px;" });
          const applyBtn = el("button", { style: "flex:1;padding:6px;border-radius:6px;border:0;background:#3b82f6;color:#fff;font-size:12px;cursor:pointer;font-weight:600;" }, "Apply");
          applyBtn.onclick = () => {
            const op = opSelect.value;
            if (noValueOps.includes(op)) { state.columnFilters[field] = { op: op, value: "" }; }
            else { state.columnFilters[field] = { op: op, value: valInput.value }; }
            pop.remove(); renderTable(); rebuildColumnPanel();
          };
          const clearBtn = el("button", { style: "flex:1;padding:6px;border-radius:6px;border:1px solid #e5e7eb;background:#f9fafb;font-size:12px;cursor:pointer;" }, "Clear");
          clearBtn.onclick = () => { delete state.columnFilters[field]; pop.remove(); renderTable(); rebuildColumnPanel(); };
          btnRow.appendChild(applyBtn); btnRow.appendChild(clearBtn);
          pop.appendChild(opSelect); pop.appendChild(valInput); pop.appendChild(btnRow);
          document.body.appendChild(pop);
          setTimeout(() => { if (valInput.style.display !== "none") valInput.focus(); }, 30);
          function onOutside(e) { if (!pop.contains(e.target) && e.target !== anchorEl) { pop.remove(); document.removeEventListener("mousedown", onOutside); } }
          setTimeout(() => document.addEventListener("mousedown", onOutside), 100);
        }

        function doExcelExport(rows) {
          if (!xls) { alert("Export builder not loaded."); return; }
          const hasOffsets = rows.some((item) => item.__phraseOffsets__ && item.__phraseOffsets__.length);
          const visibleFieldList = state.fields.filter((f) => state.visible.has(f));
          const visibleHeaderList = state.fields
            .map((f, i) => ({ f, h: state.headers[i] }))
            .filter(({ f }) => state.visible.has(f))
            .map(({ h }) => h);

          let exportFields = visibleFieldList;
          let exportHeaders = visibleHeaderList;
          if (hasOffsets) {
            exportFields = [...visibleFieldList, "__PHRASE_OFFSETS__"];
            exportHeaders = [...visibleHeaderList, "PhraseOffsets"];
          }

          if (!rows.length) { alert("No rows to export."); return; }
          const html = xls.buildExcelHtml(exportHeaders, exportFields, rows, hasOffsets ? ["PhraseOffsets"] : []);
          const stamp = new Date().toISOString().replace(/[:]/g, "-").replace(/\..+$/, "");
          xls.downloadExcelFile("nexidia_grid_export_" + stamp + ".xls", html);
        }

        function exportToExcel() {
          confirmExportScope(
            () => doExcelExport(getSelectedItems()),
            () => doExcelExport(getFilteredSortedRows())
          );
        }

        function doTranscriptExport(rows) {
          const smids = rows.map((item) => getSourceMediaId(item)).filter(Boolean);
          const transIds = rows.map((item) => getCellValue(item, "UDFVarchar110")).filter((v) => v && v !== "0");
          if (!smids.length && !transIds.length) { alert("No valid IDs found in selected rows."); return; }
          const ids = transIds.length ? transIds : smids;
          api.setShared("batchBuilderPreload", ids.join("\n"));
          const tool = api.listTools().find((t) => t.id === "transcriptBatchBuilder");
          if (tool) tool.open();
          else alert("Transcript Batch Builder not loaded. Check manifest.");
        }

        function exportTranscripts() {
          confirmExportScope(
            () => doTranscriptExport(getSelectedItems()),
            () => doTranscriptExport(getFilteredSortedRows())
          );
        }

        function resetGrid() {
          state.sorts = [];
          state.columnFilters = {};
          state.globalFilter = "";
          state.visible = new Set([...phraseFields, ...allFields]);
          state.selected.clear();
          state.hiddenRows.clear();
          globalSearchBox.value = "";
          rebuildColumnPanel();
          renderSortBadges();
          renderTable();
          updateToolbarCounts();
        }

        const modal = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
        const stickyClose = el("button", { style: "position:fixed;top:20px;right:20px;z-index:1000000;border:0;background:rgba(30,30,30,.75);color:#fff;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4);" }, "X");
        const card = el("div", { style: "background:#fff;width:1280px;max-width:97vw;max-height:92vh;overflow:hidden;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.35);display:flex;flex-direction:column;" });

        const toolbar = el("div", { style: "padding:12px 16px 8px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:8px;flex-wrap:wrap;" });
        const titleEl = el("div", { style: "font-size:15px;font-weight:700;color:#111827;flex-shrink:0;" }, "Results Grid");

        const backToSearchBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #94a3b8;background:#fff;color:#475569;cursor:pointer;font-size:12px;flex-shrink:0;display:flex;align-items:center;gap:5px;" });
        backToSearchBtn.appendChild(el("span", { style: "font-size:14px;" }, "\u2190"));
        backToSearchBtn.appendChild(document.createTextNode("Back to Search"));

        const rowCountEl = el("div", { style: "font-size:12px;color:#6b7280;flex-shrink:0;" }, "");
        const selCountEl = el("div", { style: "font-size:12px;color:#2563eb;font-weight:600;flex-shrink:0;display:none;" }, "");
        const hiddenCountEl = el("div", { style: "font-size:12px;color:#f59e0b;font-weight:600;flex-shrink:0;display:none;" }, "");
        const unhideBtn = el("button", { style: "padding:4px 8px;border-radius:6px;border:1px solid #f59e0b;background:#fff;color:#b45309;cursor:pointer;font-size:11px;flex-shrink:0;display:none;" }, "Unhide All");
        unhideBtn.onclick = () => { state.hiddenRows.clear(); renderTable(); updateToolbarCounts(); };
        const globalSearchBox = el("input", { type: "text", placeholder: "Search all visible columns...", style: "margin-left:auto;width:240px;max-width:30vw;padding:6px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;" });
        globalSearchBox.oninput = () => { state.globalFilter = globalSearchBox.value || ""; renderTable(); };
        const columnsBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #d1d5db;background:#f9fafb;cursor:pointer;font-size:14px;flex-shrink:0;", title: "Show / Hide Columns" }, "\u2630");
        const adHocBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #6366f1;background:#fff;color:#6366f1;cursor:pointer;font-size:12px;flex-shrink:0;" }, "+ Add Column");
        adHocBtn.onclick = () => openAdHocPicker();
        const hideSelectedBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #9ca3af;background:#fff;color:#374151;cursor:pointer;font-size:12px;flex-shrink:0;display:none;" }, "Hide Selected");
        hideSelectedBtn.onclick = () => {
          const rows = getFilteredSortedRows();
          for (const i of state.selected) {
            const item = rows[i];
            if (!item) continue;
            const origIdx = state.rows.indexOf(item);
            if (origIdx !== -1) state.hiddenRows.add(origIdx);
          }
          state.selected.clear();
          renderTable();
          updateToolbarCounts();
        };
        const exportExcelBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #22c55e;background:#fff;color:#16a34a;cursor:pointer;font-size:12px;flex-shrink:0;" }, "Export to Excel");
        exportExcelBtn.onclick = () => exportToExcel();
        const exportTranscriptsBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #6366f1;background:#fff;color:#4f46e5;cursor:pointer;font-size:12px;flex-shrink:0;" }, "Export Transcripts");
        exportTranscriptsBtn.onclick = () => exportTranscripts();
        const resetBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #f59e0b;background:#fff;color:#b45309;cursor:pointer;font-size:12px;flex-shrink:0;" }, "Reset");
        resetBtn.onclick = () => resetGrid();

        toolbar.appendChild(titleEl);
        toolbar.appendChild(backToSearchBtn);
        toolbar.appendChild(rowCountEl);
        toolbar.appendChild(selCountEl);
        toolbar.appendChild(hiddenCountEl);
        toolbar.appendChild(unhideBtn);
        toolbar.appendChild(columnsBtn);
        toolbar.appendChild(adHocBtn);
        toolbar.appendChild(hideSelectedBtn);
        toolbar.appendChild(exportExcelBtn);
        toolbar.appendChild(exportTranscriptsBtn);
        const queryEnrichBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #8b5cf6;background:#fff;color:#7c3aed;cursor:pointer;font-size:12px;flex-shrink:0;" }, "Queries");
        queryEnrichBtn.onclick = () => openQueryEnrichment();
        toolbar.appendChild(queryEnrichBtn);
        toolbar.appendChild(resetBtn);
        const saveSearchGridBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #22c55e;background:#fff;color:#16a34a;cursor:pointer;font-size:12px;flex-shrink:0;" }, "\uD83D\uDCBE Save Search");
        saveSearchGridBtn.onclick = () => { const fn = api.getShared("openGlobalSavePrompt"); if (fn) fn(); else alert("Save function not available."); };
        toolbar.appendChild(saveSearchGridBtn);
        toolbar.appendChild(globalSearchBox);

        const sortBar = el("div", { style: "padding:4px 16px;min-height:32px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;border-bottom:1px solid #f1f5f9;background:#fafafa;" });

        function renderSortBadges() {
          sortBar.innerHTML = "";
          if (!state.sorts.length) {
            sortBar.appendChild(el("div", { style: "font-size:11px;color:#9ca3af;" }, "No active sorts \u2014 click a column header to sort."));
            return;
          }
          const tierColors = ["#1d4ed8", "#0369a1", "#0f766e"];
          for (let i = 0; i < state.sorts.length; i++) {
            const { field, dir } = state.sorts[i];
            const headerIdx = state.fields.indexOf(field);
            const label = headerIdx >= 0 ? (state.headers[headerIdx] || field) : field;
            const color = tierColors[i] || "#374151";
            const badge = el("div", {
              draggable: true,
              style: ["display:inline-flex", "align-items:center", "gap:4px", "padding:4px 8px 4px 6px", "border-radius:999px", "background:" + color, "color:#fff", "font-size:11px", "font-weight:600", "cursor:grab", "user-select:none", "transition:opacity 0.15s"].join(";"),
              title: "Tier " + (i + 1) + " \u2014 drag to reorder, click to reverse, \u2715 to remove"
            });
            const tierNum = el("span", { style: "opacity:0.7;font-size:10px;" }, (i + 1) + ".");
            const labelEl = el("span", {}, label);
            const dirEl = el("span", {}, dir === 1 ? " \u2191" : " \u2193");
            const removeEl = el("span", { style: "margin-left:5px;opacity:0.75;font-size:11px;cursor:pointer;", title: "Remove sort tier" }, "\u2715");
            badge.appendChild(tierNum); badge.appendChild(labelEl); badge.appendChild(dirEl); badge.appendChild(removeEl);
            badge.onclick = (e) => { if (e.target === removeEl) { removeSortTier(i); return; } state.sorts[i].dir *= -1; renderSortBadges(); renderTable(); };
            badge.addEventListener("dragstart", (e) => { dragSrcIndex = i; e.dataTransfer.effectAllowed = "move"; setTimeout(() => { badge.style.opacity = "0.4"; }, 0); });
            badge.addEventListener("dragend", () => { badge.style.opacity = "1"; dragSrcIndex = null; });
            badge.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
            badge.addEventListener("drop", (e) => { e.preventDefault(); if (dragSrcIndex === null || dragSrcIndex === i) return; const moved = state.sorts.splice(dragSrcIndex, 1)[0]; state.sorts.splice(i, 0, moved); renderSortBadges(); renderTable(); });
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
            const f = state.fields[i];
            const h = state.headers[i] || f;
            const hasFilter = state.columnFilters[f] && state.columnFilters[f].op;
            const rowEl = el("div", { style: "display:flex;align-items:center;gap:6px;margin:4px 0;" });
            const cb = el("input", { type: "checkbox" });
            cb.checked = state.visible.has(f);
            cb.onchange = () => { if (cb.checked) state.visible.add(f); else state.visible.delete(f); renderTable(); };
            const labelEl = el("span", {
              style: "font-size:11px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;" + (hasFilter ? "color:#2563eb;font-weight:600;" : "color:#111827;"),
              title: h + (hasFilter ? " (filtered)" : "")
            }, h + (hasFilter ? " (filtered)" : ""));
            labelEl.onclick = () => openColumnFilterPopover(f, labelEl);
            rowEl.appendChild(cb); rowEl.appendChild(labelEl);
            colList.appendChild(rowEl);
          }
        }

        columnsBtn.onclick = () => { colPanel.style.display = colPanel.style.display !== "none" ? "none" : "block"; };

        const gridWrap = el("div", { style: "flex:1;min-width:0;display:flex;flex-direction:column;" });
        const tableWrap = el("div", { style: "flex:1;min-height:0;overflow:auto;" });
        const table = el("table", { style: "border-collapse:separate;border-spacing:0;width:100%;" });
        const thead = el("thead", {});
        const tbody = el("tbody", {});
        table.appendChild(thead);
        table.appendChild(tbody);
        tableWrap.appendChild(table);
        gridWrap.appendChild(tableWrap);

        function triggerPlay(item) {
          const smid = getSourceMediaId(item);
          if (!smid) return;
          const label = getRowLabel(item);
          if (!playerCtrl) {
            const playerTool = api.listTools().find((t) => t.id === "mediaPlayer");
            if (!playerTool || !playerTool._openPlayerPane) {
              window.open(PLAYER_URL(smid), "_blank");
              return;
            }
            playerCtrl = playerTool._openPlayerPane(card, (registerStop) => { stopPlayer = registerStop; });
          }
          activeSmid = smid;
          playerCtrl.loadCall(smid, label, undefined, searchQuery);
          renderTable();
        }

        function renderTable() {
          const visibleFieldList = state.fields.filter((f) => state.visible.has(f));
          const visibleHeaderList = state.fields
            .map((f, i) => ({ f, h: state.headers[i] }))
            .filter(({ f }) => state.visible.has(f))
            .map(({ h }) => h);

          thead.innerHTML = "";
          const trh = el("tr", {});
          const thSel = el("th", { style: "position:sticky;top:0;z-index:5;background:#f9fafb;border-bottom:2px solid #e5e7eb;padding:6px 8px;width:28px;" });
          const selectAllCb = el("input", { type: "checkbox", title: "Select all" });
          selectAllCb.onchange = () => {
            const rows = getFilteredSortedRows();
            if (selectAllCb.checked) { rows.forEach((_, i) => state.selected.add(i)); }
            else { state.selected.clear(); }
            renderTable();
            updateToolbarCounts();
          };
          thSel.appendChild(selectAllCb);
          trh.appendChild(thSel);
          trh.appendChild(el("th", { style: "position:sticky;top:0;z-index:5;background:#f9fafb;border-bottom:2px solid #e5e7eb;padding:8px 4px;font-size:11px;width:24px;" }, ""));
          for (let i = 0; i < visibleFieldList.length; i++) {
            const field = visibleFieldList[i];
            const headerText = visibleHeaderList[i] || field;
            const sortIdx = state.sorts.findIndex((s) => s.field === field);
            const hasFilter = state.columnFilters[field] && state.columnFilters[field].op;
            const tierColors = ["#1d4ed8", "#0369a1", "#0f766e"];
            const sortColor = sortIdx >= 0 ? (tierColors[sortIdx] || "#374151") : null;
            let sortLabel = headerText;
            if (sortIdx >= 0) sortLabel += state.sorts[sortIdx].dir === 1 ? " \u2191" : " \u2193";
            const th = el("th", {
              style: ["position:sticky", "top:0", "z-index:5", "background:" + (sortColor ? "#dbeafe" : "#f9fafb"), "border-bottom:2px solid " + (sortColor || "#e5e7eb"), "padding:8px 10px", "font-size:11px", "text-align:left", "white-space:nowrap", "cursor:pointer", "user-select:none", "transition:border-color 0.15s", sortColor ? "color:" + sortColor + ";font-weight:700;" : "color:#374151;"].join(";"),
              title: "Click to sort, drag to reorder"
            });
            const thLabel = el("span", {}, sortLabel);
            const filterIcon = el("span", {
              style: "font-size:11px;cursor:pointer;margin-left:4px;color:" + (hasFilter ? "#3b82f6" : "#d1d5db") + ";transition:color 0.15s;"
            }, "\u25BE");
            filterIcon.onclick = (e) => { e.stopPropagation(); openColumnFilterPopover(field, filterIcon); };
            filterIcon.onmouseenter = () => { if (!hasFilter) filterIcon.style.color = "#9ca3af"; };
            filterIcon.onmouseleave = () => { filterIcon.style.color = hasFilter ? "#3b82f6" : "#d1d5db"; };
            th.appendChild(thLabel);
            th.appendChild(filterIcon);
            th.setAttribute("data-col-idx", i);
            th.draggable = true;

            th.addEventListener("dragstart", (e) => {
              dragColIndex = i;
              e.dataTransfer.effectAllowed = "move";
              const ghost = createDragGhost(headerText);
              e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
              setTimeout(() => { th.style.opacity = "0.3"; }, 0);
            });

            th.addEventListener("dragend", () => {
              th.style.opacity = "1";
              dragColIndex = null;
              removeDragGhost();
              clearDropIndicators();
            });

            th.addEventListener("dragover", (e) => {
              if (dragColIndex === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              clearDropIndicators();
              const myIdx = parseInt(th.getAttribute("data-col-idx"));
              if (myIdx === dragColIndex) return;
              if (dragColIndex < myIdx) {
                th.style.borderRight = "3px solid #3b82f6";
              } else {
                th.style.borderLeft = "3px solid #3b82f6";
              }
            });

            th.addEventListener("dragleave", () => {
              th.style.borderLeft = "";
              th.style.borderRight = "";
            });

            th.addEventListener("drop", (e) => {
              e.preventDefault();
              clearDropIndicators();
              removeDragGhost();
              if (dragColIndex === null || dragColIndex === i) return;
              const srcField = visibleFieldList[dragColIndex];
              const dstField = visibleFieldList[i];
              const srcGlobal = state.fields.indexOf(srcField);
              const dstGlobal = state.fields.indexOf(dstField);
              if (srcGlobal === -1 || dstGlobal === -1) return;
              const [movedField] = state.fields.splice(srcGlobal, 1);
              const [movedHeader] = state.headers.splice(srcGlobal, 1);
              const newDst = state.fields.indexOf(dstField);
              state.fields.splice(newDst, 0, movedField);
              state.headers.splice(newDst, 0, movedHeader);
              dragColIndex = null;
              rebuildColumnPanel();
              renderTable();
            });

            th.onclick = (e) => {
              if (dragColIndex !== null) return;
              handleHeaderClick(field);
            };

            trh.appendChild(th);
          }
          thead.appendChild(trh);

          const rows = getFilteredSortedRows();
          updateToolbarCounts();
          selectAllCb.checked = rows.length > 0 && rows.every((_, i) => state.selected.has(i));
          selectAllCb.indeterminate = state.selected.size > 0 && !selectAllCb.checked;

          tbody.innerHTML = "";
          const maxRender = rows.length;
          for (let ri = 0; ri < maxRender; ri++) {
            const item = rows[ri];
            const smid = getSourceMediaId(item);
            const isActive = smid && smid == activeSmid;
            const isChecked = state.selected.has(ri);
            const tr = el("tr", {
              style: isActive
                ? "background:#eff6ff;outline:2px solid #3b82f6;outline-offset:-2px;cursor:pointer;"
                : (isChecked ? "background:#eff6ff;cursor:pointer;" : (ri % 2 ? "background:#f8fafc;cursor:pointer;" : "background:#fff;cursor:pointer;"))
            });

            const tdSel = el("td", { style: "padding:4px 6px;border-bottom:1px solid #f1f5f9;white-space:nowrap;vertical-align:middle;" });
            const rowCb = el("input", { type: "checkbox" });
            rowCb.checked = isChecked;
            rowCb.onclick = (e) => { e.stopPropagation(); };
            rowCb.onchange = () => {
              if (rowCb.checked) state.selected.add(ri);
              else state.selected.delete(ri);
              updateToolbarCounts();
              arrowWrap.style.display = rowCb.checked ? "flex" : "none";
              tr.style.background = rowCb.checked ? "#eff6ff" : (ri % 2 ? "#f8fafc" : "#fff");
            };
            const arrowWrap = el("div", { style: "display:" + (isChecked ? "flex" : "none") + ";flex-direction:column;align-items:center;margin-right:2px;" });
            const upArrow = el("span", { style: "font-size:14px;cursor:pointer;color:#9ca3af;line-height:1;padding:3px 5px;border-radius:4px;transition:background 0.15s,color 0.15s;", title: "Select all above" }, "\u25B2");
            upArrow.onmouseenter = () => { upArrow.style.background = "#dbeafe"; upArrow.style.color = "#2563eb"; };
            upArrow.onmouseleave = () => { upArrow.style.background = "transparent"; upArrow.style.color = "#9ca3af"; };
            upArrow.onclick = (e) => { e.stopPropagation(); for (let j = 0; j < ri; j++) state.selected.add(j); renderTable(); updateToolbarCounts(); };
            const downArrow = el("span", { style: "font-size:14px;cursor:pointer;color:#9ca3af;line-height:1;padding:3px 5px;border-radius:4px;transition:background 0.15s,color 0.15s;", title: "Select all below" }, "\u25BC");
            downArrow.onmouseenter = () => { downArrow.style.background = "#dbeafe"; downArrow.style.color = "#2563eb"; };
            downArrow.onmouseleave = () => { downArrow.style.background = "transparent"; downArrow.style.color = "#9ca3af"; };
            downArrow.onclick = (e) => { e.stopPropagation(); for (let j = ri + 1; j < rows.length; j++) state.selected.add(j); renderTable(); updateToolbarCounts(); };
            arrowWrap.appendChild(upArrow);
            arrowWrap.appendChild(downArrow);
            tdSel.appendChild(arrowWrap);
            tdSel.appendChild(rowCb);
            tr.appendChild(tdSel);

            const tdHide = el("td", { style: "padding:5px 4px;border-bottom:1px solid #f1f5f9;white-space:nowrap;" });
            const hideBtn = el("span", { style: "font-size:11px;cursor:pointer;color:#d1d5db;", title: "Hide this row" }, "\u00BB");
            hideBtn.onmouseenter = () => { hideBtn.style.color = "#6b7280"; };
            hideBtn.onmouseleave = () => { hideBtn.style.color = "#d1d5db"; };
            hideBtn.onclick = (e) => {
              e.stopPropagation();
              const origIdx = state.rows.indexOf(item);
              if (origIdx !== -1) state.hiddenRows.add(origIdx);
              state.selected.delete(ri);
              renderTable();
              updateToolbarCounts();
            };
            tdHide.appendChild(hideBtn);
            tr.appendChild(tdHide);

            for (const field of visibleFieldList) {
              const display = getCellDisplay(item, field);
              const td = el("td", {
                style: "padding:5px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#111827;white-space:nowrap;max-width:320px;overflow:hidden;text-overflow:ellipsis;",
                title: display
              }, display);
              tr.appendChild(td);
            }

            tr.addEventListener("click", (e) => {
              if (e.target === rowCb || tdSel.contains(e.target) || tdHide.contains(e.target)) return;
              triggerPlay(item);
            });

            tbody.appendChild(tr);
          }

          if (rows.length > maxRender) {
            const tr = el("tr", {});
            const td = el("td", { colSpan: visibleFieldList.length + 2, style: "padding:10px;color:#6b7280;font-size:11px;text-align:center;" },
              "Showing first " + maxRender.toLocaleString() + " rows. Refine filters to narrow results.");
            tr.appendChild(td);
            tbody.appendChild(tr);
          }
        }

        async function openQueryEnrichment() {
          let queryCatalog = [];
          try {
            const res = await fetch("https://apug01.nxondemand.com/NxIA/api/queries", { credentials: "include" });
            if (res.ok) {
              var raw = await res.json();
              queryCatalog = Array.isArray(raw) ? raw : (Array.isArray(raw.data) ? raw.data : []);
            }
          } catch (_) {}
          if (!queryCatalog.length) { alert("Could not load query catalog."); return; }

          const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000003;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
          const box = el("div", { style: "background:#fff;width:480px;max-height:80vh;overflow:auto;border-radius:12px;padding:22px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
          box.appendChild(el("div", { style: "font-size:15px;font-weight:700;color:#111827;margin-bottom:4px;" }, "Query Search"));
          box.appendChild(el("div", { style: "font-size:11px;color:#6b7280;line-height:1.4;margin-bottom:14px;" }, "Select one or more queries to check which calls matched. Each adds a score column."));

          const searchInput = el("input", { type: "text", placeholder: "Search queries...", style: "width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;margin-bottom:8px;" });
          box.appendChild(searchInput);

          const listWrap = el("div", { style: "max-height:220px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:14px;" });
          let queryQueue = [];

          const queueWrap = el("div", { style: "display:none;flex-wrap:wrap;gap:6px;padding:8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:14px;" });

          const runBtn = el("button", { style: "width:100%;padding:10px;border-radius:10px;border:0;background:linear-gradient(135deg,#6d28d9,#8b5cf6);color:#fff;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(139,92,246,0.35);margin-bottom:8px;opacity:0.5;pointer-events:none;" }, "Search Query");

          function renderQueue() {
            queueWrap.innerHTML = "";
            if (!queryQueue.length) {
              queueWrap.style.display = "none";
              runBtn.textContent = "Search Query";
              runBtn.style.opacity = "0.5";
              runBtn.style.pointerEvents = "none";
              return;
            }
            queueWrap.style.display = "flex";
            runBtn.textContent = queryQueue.length === 1 ? "Search Query" : "Search Queries";
            runBtn.style.opacity = "1";
            runBtn.style.pointerEvents = "auto";
            for (let qi = 0; qi < queryQueue.length; qi++) {
              const q = queryQueue[qi];
              const chip = el("div", { style: "display:inline-flex;align-items:center;gap:5px;background:#eff6ff;border:1px solid #93c5fd;border-radius:999px;padding:4px 10px;font-size:11px;color:#1d4ed8;font-weight:600;" });
              chip.appendChild(el("span", {}, q.name));
              const removeX = el("span", { style: "cursor:pointer;font-size:13px;color:#6b7280;line-height:1;" }, "\u00D7");
              (function(query) {
                removeX.onclick = function() {
                  queryQueue = queryQueue.filter(function(qq) { return qq.id !== query.id; });
                  renderQueue();
                  renderList(searchInput.value);
                };
              })(q);
              chip.appendChild(removeX);
              queueWrap.appendChild(chip);
            }
          }

          function renderList(filter) {
            listWrap.innerHTML = "";
            const fl = (filter || "").toLowerCase().trim();
            const matches = queryCatalog.filter((q) => !fl || (q.name || "").toLowerCase().includes(fl));
            if (!matches.length) { listWrap.appendChild(el("div", { style: "padding:10px;font-size:12px;color:#6b7280;" }, "No queries found.")); return; }
            for (let qi = 0; qi < matches.length; qi++) {
              const q = matches[qi];
              const sp = (q.speaker || "Either").toLowerCase();
              const spLabel = sp === "agent" ? "Agent" : sp === "customer" ? "Customer" : "Either";
              const inQueue = queryQueue.some(function(qq) { return qq.id === q.id; });
              const row = el("div", { style: "display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:12px;color:#111827;" + (inQueue ? "background:#eff6ff;" : "") });
              row.appendChild(el("div", { style: "flex:1;" }, q.name));
              row.appendChild(el("div", { style: "font-size:10px;color:#6b7280;flex-shrink:0;" }, spLabel));
              (function(query, rowEl) {
                rowEl.onmouseenter = function() { if (!queryQueue.some(function(qq) { return qq.id === query.id; })) rowEl.style.background = "#e8f0fe"; };
                rowEl.onmouseleave = function() { rowEl.style.background = queryQueue.some(function(qq) { return qq.id === query.id; }) ? "#eff6ff" : ""; };
                rowEl.onclick = function() {
                  const idx = queryQueue.findIndex(function(qq) { return qq.id === query.id; });
                  if (idx >= 0) { queryQueue.splice(idx, 1); }
                  else { queryQueue.push(query); }
                  renderQueue();
                  renderList(searchInput.value);
                };
              })(q, row);
              listWrap.appendChild(row);
            }
          }

          searchInput.addEventListener("input", function() { renderList(searchInput.value); });
          renderList("");

          box.appendChild(listWrap);
          box.appendChild(queueWrap);

          runBtn.onclick = async function() {
            if (!queryQueue.length) { alert("Select at least one query."); return; }
            var toRun = queryQueue.slice();
            overlay.remove();
            await runQueryEnrichment(toRun);
          };
          const cancelBtn = el("button", { style: "width:100%;padding:8px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;cursor:pointer;font-size:13px;color:#6b7280;" }, "Cancel");
          cancelBtn.onclick = function() { overlay.remove(); };
          box.appendChild(runBtn);
          box.appendChild(cancelBtn);
          overlay.appendChild(box);
          document.body.appendChild(overlay);
          setTimeout(function() { searchInput.focus(); }, 50);
        }

        async function runQueryEnrichment(queries) {
          if (!Array.isArray(queries)) queries = [queries];
          var HITS_URL = function(smid) { return "https://apug01.nxondemand.com/NxIA/api/hits/fetch/" + smid; };
          var BATCH = 50;
          var smids = [];
          for (var si = 0; si < state.rows.length; si++) {
            var smid = getSourceMediaId(state.rows[si]);
            if (smid) smids.push({ idx: si, smid: String(smid) });
          }
          if (!smids.length) { alert("No SMIDs found in results."); return; }

          var scoreMaps = new Map();
          for (var qmi = 0; qmi < queries.length; qmi++) { scoreMaps.set(queries[qmi].id, new Map()); }

          var progOverlay = el("div", { style: "position:fixed;top:16px;right:16px;z-index:1000010;width:360px;background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:10px;padding:12px;font-family:Segoe UI,Arial,sans-serif;box-shadow:0 12px 28px rgba(0,0,0,.35);" });
          var progTitle = el("div", { style: "font-weight:700;font-size:13px;color:#c4b5fd;margin-bottom:6px;" }, "Searching " + queries.length + " quer" + (queries.length === 1 ? "y" : "ies"));
          var progStatus = el("div", { style: "font-size:12px;margin-bottom:6px;" }, "Starting...");
          var progBarOuter = el("div", { style: "height:8px;background:#1f2937;border-radius:999px;overflow:hidden;border:1px solid #374151;" });
          var progBarInner = el("div", { style: "height:100%;width:0%;background:#8b5cf6;transition:width 0.3s;" });
          progBarOuter.appendChild(progBarInner);
          var progCancel = el("div", { style: "margin-top:6px;font-size:11px;color:#f87171;cursor:pointer;text-decoration:underline;" }, "Cancel");
          var cancelled = false;
          progCancel.onclick = function() { cancelled = true; };
          progOverlay.appendChild(progTitle);
          progOverlay.appendChild(progStatus);
          progOverlay.appendChild(progBarOuter);
          progOverlay.appendChild(progCancel);
          document.body.appendChild(progOverlay);

          var done = 0;
          for (var bi = 0; bi < smids.length; bi += BATCH) {
            if (cancelled) break;
            var batch = smids.slice(bi, bi + BATCH);
            var promises = batch.map(function(entry) {
              return fetch(HITS_URL(entry.smid), { credentials: "include" })
                .then(function(r) { return r.ok ? r.json() : []; })
                .then(function(hits) {
                  var arr = Array.isArray(hits) ? hits : (hits && Array.isArray(hits.data) ? hits.data : []);
                  for (var qi = 0; qi < queries.length; qi++) {
                    var query = queries[qi];
                    var matches = arr.filter(function(h) { return h.id === query.id || h.name === query.name; });
                    var best = 0;
                    for (var mi = 0; mi < matches.length; mi++) { if ((matches[mi].score || 0) > best) best = matches[mi].score; }
                    scoreMaps.get(query.id).set(entry.smid, best);
                  }
                })
                .catch(function() {
                  for (var qi = 0; qi < queries.length; qi++) { scoreMaps.get(queries[qi].id).set(entry.smid, 0); }
                });
            });
            await Promise.all(promises);
            done += batch.length;
            var pct = Math.round((done / smids.length) * 100);
            progStatus.textContent = done + " / " + smids.length + " calls checked";
            progBarInner.style.width = pct + "%";
            if (bi + BATCH < smids.length && !cancelled) await new Promise(function(r) { setTimeout(r, 100); });
          }
          progOverlay.remove();
          if (cancelled) return;

          for (var qi = 0; qi < queries.length; qi++) {
            var query = queries[qi];
            var colName = "__QUERY_" + query.id + "__";
            var colHeader = query.name;
            var qScoreMap = scoreMaps.get(query.id);
            for (var ri = 0; ri < state.rows.length; ri++) {
              var item = state.rows[ri];
              var rowSmid = String(getSourceMediaId(item) || "");
              var r = item.row || item;
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
          renderTable();
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
        renderTable();
      } catch (e) {
        console.error(e);
        alert("Failed to open grid. Check console for details.");
      }
    })();
  }

  api.registerTool({ id: "resultsGrid", label: "Results Grid", hidden: true, open: openResultsGrid });
})();
