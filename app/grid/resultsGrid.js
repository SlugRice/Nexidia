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

        const BASE_SEARCH_URL = "https://apug01.nxondemand.com/NxIA/api-gateway/explore/api/v1.0/search";
        const PLAYER_URL = (smid) => `https://apug01.nxondemand.com/NxIA/ui/explore/(search//player:player/${encodeURIComponent(smid)})`;

        // ── Helpers ──────────────────────────────────────────────────────────
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
          let s = (raw === null || raw === undefined) ? "" : String(raw);
          return s.trim();
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
          if (field.startsWith("__PHRASE_")) {
            const idx = parseInt(field.replace(/\D/g, ""), 10) - 1;
            return (item.phrases && item.phrases[idx]) ? item.phrases[idx] : "";
          }
          const r = item.row || item;
          return normalizeCellText(getFieldValue(r, field));
        }

        function getCellDisplay(item, field) {
          if (field.startsWith("__PHRASE_")) return getCellValue(item, field);
          const r = item.row || item;
          const raw = normalizeCellText(getFieldValue(r, field));
          return formatDisplay(field, raw);
        }

        // ── State ────────────────────────────────────────────────────────────
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
          adHocPending: false
        };

        // ── Sort ─────────────────────────────────────────────────────────────
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

        // ── Filters ──────────────────────────────────────────────────────────
        function applyColumnFilters(rows) {
          const active = Object.entries(state.columnFilters).filter(([, f]) => f && f.value && f.value.trim());
          if (!active.length) return rows;
          return rows.filter((item) => {
            for (const [field, filter] of active) {
              const cell = getCellValue(item, field).toLowerCase();
              const val = filter.value.trim().toLowerCase();
              if (filter.op === "contains" && !cell.includes(val)) return false;
              if (filter.op === "notcontains" && cell.includes(val)) return false;
              if (filter.op === "exact" && cell !== val) return false;
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

        function getFilteredSortedRows() {
          let rows = state.rows.slice();
          rows = applyColumnFilters(rows);
          rows = applyGlobalFilter(rows);
          rows = applySort(rows);
          return rows;
        }

        // ── Ad hoc column fetch ───────────────────────────────────────────────
        async function fetchAdHocColumn(storageName, displayName) {
          if (state.adHocPending) { alert("A column fetch is already in progress."); return; }
          if (state.fields.includes(storageName)) { alert("That column is already in the grid."); return; }
          state.adHocPending = true;
          adHocBtn.disabled = true;
          adHocBtn.textContent = "Fetching...";
          try {
            const smids = state.rows.map((item) => getSourceMediaId(item)).filter(Boolean);
            if (!smids.length) throw new Error("No sourceMediaId values found in current results.");
            const payload = {
              from: 0, to: smids.length,
              fields: ["sourceMediaId", storageName],
              query: {
                operator: "AND", invertOperator: false,
                filters: [{
                  operator: "AND", invertOperator: false, filterType: "interactions",
                  filters: [{ operator: "IN", type: "KEYWORD", parameterName: "sourceMediaId", value: smids }]
                }]
              }
            };
            const res = await fetch(BASE_SEARCH_URL, {
              method: "POST", credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });
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
            state.adHocPending = false;
            adHocBtn.disabled = false;
            adHocBtn.textContent = "+ Add Column";
          }
        }

        // ── Ad hoc picker ─────────────────────────────────────────────────────
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
          box.appendChild(input);
          box.appendChild(list);
          box.appendChild(cancelBtn);
          overlay.appendChild(box);
          document.body.appendChild(overlay);
          setTimeout(() => input.focus(), 50);
        }

        // ── Column filter popover ─────────────────────────────────────────────
        function openColumnFilterPopover(field, anchorEl) {
          document.querySelectorAll("[data-col-filter-popover]").forEach((p) => p.remove());
          const existing = state.columnFilters[field] || { op: "contains", value: "" };
          const rect = anchorEl.getBoundingClientRect();
          const pop = el("div", {
            style: [
              "position:fixed",
              "top:" + (rect.bottom + 4) + "px",
              "left:" + rect.left + "px",
              "width:240px",
              "background:#fff",
              "border:1px solid #e5e7eb",
              "border-radius:10px",
              "padding:12px",
              "box-shadow:0 6px 20px rgba(0,0,0,.18)",
              "z-index:1000002",
              "font-family:Segoe UI,Arial,sans-serif"
            ].join(";")
          });
          pop.setAttribute("data-col-filter-popover", "1");
          const opSelect = el("select", { style: "width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;margin-bottom:8px;box-sizing:border-box;" });
          [["contains","Contains"],["notcontains","Does not contain"],["exact","Exact match"]].forEach(([val, label]) => {
            const opt = el("option", { value: val }, label);
            if (val === existing.op) opt.selected = true;
            opSelect.appendChild(opt);
          });
          const valInput = el("input", { type: "text", placeholder: "Filter value...", value: existing.value, style: "width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px;box-sizing:border-box;margin-bottom:8px;" });
          const btnRow = el("div", { style: "display:flex;gap:6px;" });
          const applyBtn = el("button", { style: "flex:1;padding:6px;border-radius:6px;border:0;background:#3b82f6;color:#fff;font-size:12px;cursor:pointer;font-weight:600;" }, "Apply");
          applyBtn.onclick = () => { state.columnFilters[field] = { op: opSelect.value, value: valInput.value }; pop.remove(); renderTable(); rebuildColumnPanel(); };
          const clearBtn = el("button", { style: "flex:1;padding:6px;border-radius:6px;border:1px solid #e5e7eb;background:#f9fafb;font-size:12px;cursor:pointer;" }, "Clear");
          clearBtn.onclick = () => { delete state.columnFilters[field]; pop.remove(); renderTable(); rebuildColumnPanel(); };
          btnRow.appendChild(applyBtn);
          btnRow.appendChild(clearBtn);
          pop.appendChild(opSelect);
          pop.appendChild(valInput);
          pop.appendChild(btnRow);
          document.body.appendChild(pop);
          setTimeout(() => valInput.focus(), 30);
          function onOutside(e) {
            if (!pop.contains(e.target) && e.target !== anchorEl) { pop.remove(); document.removeEventListener("mousedown", onOutside); }
          }
          setTimeout(() => document.addEventListener("mousedown", onOutside), 100);
        }

        // ── Export current view as XLS ────────────────────────────────────────
        function exportCurrentView() {
          if (!xls) { alert("Export builder not loaded."); return; }
          const visibleFieldList = state.fields.filter((f) => state.visible.has(f));
          const visibleHeaderList = state.fields
            .map((f, i) => ({ f, h: state.headers[i] }))
            .filter(({ f }) => state.visible.has(f))
            .map(({ h }) => h);
          const rows = getFilteredSortedRows();
          if (!rows.length) { alert("No rows to export."); return; }
          const html = xls.buildExcelHtml(visibleHeaderList, visibleFieldList, rows, []);
          const stamp = new Date().toISOString().replace(/[:]/g, "-").replace(/\..+$/, "");
          xls.downloadExcelFile("nexidia_grid_export_" + stamp + ".xls", html);
        }

        // ── Reset ─────────────────────────────────────────────────────────────
        function resetGrid() {
          state.sorts = [];
          state.columnFilters = {};
          state.globalFilter = "";
          state.visible = new Set([...phraseFields, ...allFields]);
          globalSearchBox.value = "";
          rebuildColumnPanel();
          renderSortBadges();
          renderTable();
        }

        // ── Modal shell ───────────────────────────────────────────────────────
        const modal = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
        const stickyClose = el("button", { style: "position:fixed;top:20px;right:20px;z-index:1000000;border:0;background:rgba(30,30,30,.75);color:#fff;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4);" }, "X");
        const card = el("div", { style: "background:#fff;width:1280px;max-width:97vw;max-height:92vh;overflow:hidden;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.35);display:flex;flex-direction:column;" });

        // ── Toolbar ───────────────────────────────────────────────────────────
        const toolbar = el("div", { style: "padding:12px 16px 8px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:8px;flex-wrap:wrap;" });
        const titleEl = el("div", { style: "font-size:15px;font-weight:700;color:#111827;flex-shrink:0;" }, "Results Grid");
        const rowCountEl = el("div", { style: "font-size:12px;color:#6b7280;flex-shrink:0;" }, "");
        const globalSearchBox = el("input", { type: "text", placeholder: "Search all visible columns...", style: "margin-left:auto;width:240px;max-width:30vw;padding:6px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;" });
        globalSearchBox.oninput = () => { state.globalFilter = globalSearchBox.value || ""; renderTable(); };

        const columnsBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #d1d5db;background:#f9fafb;cursor:pointer;font-size:14px;flex-shrink:0;", title: "Show / Hide Columns" }, "☰");
        const adHocBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #6366f1;background:#fff;color:#6366f1;cursor:pointer;font-size:12px;flex-shrink:0;" }, "+ Add Column");
        adHocBtn.onclick = () => openAdHocPicker();
        const exportBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #22c55e;background:#fff;color:#16a34a;cursor:pointer;font-size:12px;flex-shrink:0;" }, "Export View");
        exportBtn.onclick = () => exportCurrentView();
        const resetBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #f59e0b;background:#fff;color:#b45309;cursor:pointer;font-size:12px;flex-shrink:0;" }, "Reset");
        resetBtn.onclick = () => resetGrid();

        toolbar.appendChild(titleEl);
        toolbar.appendChild(rowCountEl);
        toolbar.appendChild(columnsBtn);
        toolbar.appendChild(adHocBtn);
        toolbar.appendChild(exportBtn);
        toolbar.appendChild(resetBtn);
        toolbar.appendChild(globalSearchBox);

        // ── Sort badge bar with drag-to-reorder ───────────────────────────────
        const sortBar = el("div", { style: "padding:4px 16px;min-height:32px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;border-bottom:1px solid #f1f5f9;background:#fafafa;" });

        let dragSrcIndex = null;

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
              style: [
                "display:inline-flex", "align-items:center", "gap:4px",
                "padding:4px 8px 4px 6px",
                "border-radius:999px",
                "background:" + color,
                "color:#fff",
                "font-size:11px",
                "font-weight:600",
                "cursor:grab",
                "user-select:none",
                "transition:opacity 0.15s"
              ].join(";"),
              title: "Tier " + (i + 1) + " \u2014 drag to reorder, click to reverse, \u2715 to remove"
            });

            const tierNum = el("span", { style: "opacity:0.7;font-size:10px;" }, (i + 1) + ".");
            const labelEl = el("span", {}, label);
            const dirEl = el("span", {}, dir === 1 ? " \u2191" : " \u2193");
            const removeEl = el("span", {
              style: "margin-left:5px;opacity:0.75;font-size:11px;cursor:pointer;",
              title: "Remove sort tier"
            }, "\u2715");

            badge.appendChild(tierNum);
            badge.appendChild(labelEl);
            badge.appendChild(dirEl);
            badge.appendChild(removeEl);

            // Click = flip direction (unless clicking remove)
            badge.onclick = (e) => {
              if (e.target === removeEl) { removeSortTier(i); return; }
              state.sorts[i].dir *= -1;
              renderSortBadges();
              renderTable();
            };

            // Drag to reorder
            badge.addEventListener("dragstart", (e) => {
              dragSrcIndex = i;
              e.dataTransfer.effectAllowed = "move";
              setTimeout(() => { badge.style.opacity = "0.4"; }, 0);
            });
            badge.addEventListener("dragend", () => { badge.style.opacity = "1"; dragSrcIndex = null; });
            badge.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
            badge.addEventListener("drop", (e) => {
              e.preventDefault();
              if (dragSrcIndex === null || dragSrcIndex === i) return;
              const moved = state.sorts.splice(dragSrcIndex, 1)[0];
              state.sorts.splice(i, 0, moved);
              renderSortBadges();
              renderTable();
            });

            sortBar.appendChild(badge);
          }
        }

        // ── Body layout ───────────────────────────────────────────────────────
        const body = el("div", { style: "display:flex;flex:1;min-height:0;" });

        // ── Column panel ──────────────────────────────────────────────────────
        const colPanel = el("div", { style: "width:220px;border-right:1px solid #e5e7eb;padding:10px;overflow-y:auto;display:none;flex-shrink:0;" });
        colPanel.appendChild(el("div", { style: "font-size:12px;font-weight:700;margin-bottom:8px;color:#111827;" }, "Show / Hide Columns"));
        const colList = el("div", {});
        colPanel.appendChild(colList);

        function rebuildColumnPanel() {
          colList.innerHTML = "";
          for (let i = 0; i < state.fields.length; i++) {
            const f = state.fields[i];
            const h = state.headers[i] || f;
            const hasFilter = state.columnFilters[f] && state.columnFilters[f].value;
            const rowEl = el("div", { style: "display:flex;align-items:center;gap:6px;margin:4px 0;" });
            const cb = el("input", { type: "checkbox" });
            cb.checked = state.visible.has(f);
            cb.onchange = () => { if (cb.checked) state.visible.add(f); else state.visible.delete(f); renderTable(); };
            const labelEl = el("span", {
              style: "font-size:11px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;" + (hasFilter ? "color:#2563eb;font-weight:600;" : "color:#111827;"),
              title: h + (hasFilter ? " (filtered)" : "")
            }, h + (hasFilter ? " \uD83D\uDD3D" : ""));
            labelEl.onclick = () => openColumnFilterPopover(f, labelEl);
            rowEl.appendChild(cb);
            rowEl.appendChild(labelEl);
            colList.appendChild(rowEl);
          }
        }

        columnsBtn.onclick = () => {
          colPanel.style.display = colPanel.style.display !== "none" ? "none" : "block";
        };

        // ── Table ─────────────────────────────────────────────────────────────
        const gridWrap = el("div", { style: "flex:1;min-width:0;display:flex;flex-direction:column;" });
        const tableWrap = el("div", { style: "flex:1;min-height:0;overflow:auto;" });
        const table = el("table", { style: "border-collapse:separate;border-spacing:0;width:100%;" });
        const thead = el("thead", {});
        const tbody = el("tbody", {});
        table.appendChild(thead);
        table.appendChild(tbody);
        tableWrap.appendChild(table);
        gridWrap.appendChild(tableWrap);

        function renderTable() {
          const visibleFieldList = state.fields.filter((f) => state.visible.has(f));
          const visibleHeaderList = state.fields
            .map((f, i) => ({ f, h: state.headers[i] }))
            .filter(({ f }) => state.visible.has(f))
            .map(({ h }) => h);

          // Header
          thead.innerHTML = "";
          const trh = el("tr", {});
          trh.appendChild(el("th", { style: "position:sticky;top:0;z-index:5;background:#f9fafb;border-bottom:2px solid #e5e7eb;padding:8px 10px;font-size:11px;width:44px;" }, ""));

          for (let i = 0; i < visibleFieldList.length; i++) {
            const field = visibleFieldList[i];
            const headerText = visibleHeaderList[i] || field;
            const sortIdx = state.sorts.findIndex((s) => s.field === field);
            const hasFilter = state.columnFilters[field] && state.columnFilters[field].value;
            const tierColors = ["#1d4ed8", "#0369a1", "#0f766e"];
            const sortColor = sortIdx >= 0 ? (tierColors[sortIdx] || "#374151") : null;

            let label = headerText;
            if (sortIdx >= 0) label += state.sorts[sortIdx].dir === 1 ? " \u2191" : " \u2193";
            if (hasFilter) label += " \uD83D\uDD3D";

            const th = el("th", {
              style: [
                "position:sticky", "top:0", "z-index:5",
                "background:" + (sortColor ? "rgba(59,130,246,0.07)" : "#f9fafb"),
                "border-bottom:2px solid " + (sortColor || "#e5e7eb"),
                "padding:8px 10px",
                "font-size:11px",
                "text-align:left",
                "white-space:nowrap",
                "cursor:pointer",
                "user-select:none",
                sortColor ? "color:" + sortColor + ";font-weight:700;" : "color:#374151;"
              ].join(";"),
              title: "Click to sort"
            }, label);

            th.onclick = () => handleHeaderClick(field);
            trh.appendChild(th);
          }
          thead.appendChild(trh);

          // Rows
          const rows = getFilteredSortedRows();
          rowCountEl.textContent = rows.length.toLocaleString() + " of " + state.rows.length.toLocaleString() + " rows";
          tbody.innerHTML = "";
          const maxRender = Math.min(rows.length, 3000);

          for (let ri = 0; ri < maxRender; ri++) {
            const item = rows[ri];
            const tr = el("tr", { style: ri % 2 ? "background:#f8fafc;" : "background:#fff;" });

            // Play cell
            const tdPlay = el("td", { style: "padding:5px 8px;border-bottom:1px solid #f1f5f9;white-space:nowrap;" });
            const playBtn = el("button", {
              style: "border:1px solid #d1d5db;background:#fff;border-radius:8px;padding:3px 8px;cursor:pointer;font-size:11px;",
              title: "Open in Nexidia player"
            }, "\u25B6");
            playBtn.onclick = () => {
              const smid = getSourceMediaId(item);
              if (!smid) { alert("sourceMediaId not available for this row."); return; }
              window.open(PLAYER_URL(smid), "_blank");
            };
            tdPlay.appendChild(playBtn);
            tr.appendChild(tdPlay);

            // Data cells — use getCellDisplay for formatted values
            for (const field of visibleFieldList) {
              const display = getCellDisplay(item, field);
              const raw = getCellValue(item, field);
              const td = el("td", {
                style: "padding:5px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#111827;white-space:nowrap;max-width:320px;overflow:hidden;text-overflow:ellipsis;",
                title: display
              }, display);
              tr.appendChild(td);
            }
            tbody.appendChild(tr);
          }

          if (rows.length > maxRender) {
            const tr = el("tr", {});
            const td = el("td", {
              colSpan: visibleFieldList.length + 1,
              style: "padding:10px;color:#6b7280;font-size:11px;text-align:center;"
            }, "Showing first " + maxRender.toLocaleString() + " rows. Refine filters to narrow results.");
            tr.appendChild(td);
            tbody.appendChild(tr);
          }
        }

        // ── Assemble ──────────────────────────────────────────────────────────
        body.appendChild(colPanel);
        body.appendChild(gridWrap);
        card.appendChild(toolbar);
        card.appendChild(sortBar);
        card.appendChild(body);
        modal.appendChild(card);
        document.body.appendChild(modal);
        document.body.appendChild(stickyClose);

        function close() {
          try { modal.remove(); } catch (_) {}
          try { stickyClose.remove(); } catch (_) {}
          document.querySelectorAll("[data-col-filter-popover]").forEach((p) => p.remove());
        }
        stickyClose.onclick = close;

        // Cache metadata fields for ad hoc picker
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
