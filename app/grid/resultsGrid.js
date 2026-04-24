(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;

  function openResultsGrid() {
    (async () => {
      try {
        const data = api.getShared("lastSearchResult");
        if (!data || !Array.isArray(data.rows) || !Array.isArray(data.fields) || !Array.isArray(data.headers)) {
          alert("No search results found. Run a search first.");
          return;
        }

        const state = {
          rows: data.rows.slice(),
          fields: data.fields.slice(),
          headers: data.headers.slice(),
          visible: new Set(data.fields.slice()),
          sort: { field: null, dir: 1 },
          searchText: ""
        };

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

        const modal = el("div", {
          style: [
            "position:fixed", "inset:0", "background:rgba(0,0,0,.55)",
            "z-index:999999", "display:flex", "align-items:center", "justify-content:center",
            "font-family:Segoe UI, Arial, sans-serif"
          ].join(";")
        });

        const stickyClose = el("button", {
          style: [
            "position:fixed", "top:20px", "right:20px", "z-index:1000000",
            "border:0", "background:rgba(30,30,30,.75)", "color:#fff",
            "width:32px", "height:32px", "border-radius:50%",
            "font-size:16px", "cursor:pointer",
            "display:flex", "align-items:center", "justify-content:center",
            "box-shadow:0 2px 8px rgba(0,0,0,.4)"
          ].join(";")
        }, "X");

        const card = el("div", {
          style: [
            "background:#fff", "width:1180px", "max-width:96vw",
            "max-height:90vh", "overflow:hidden",
            "border-radius:14px", "box-shadow:0 10px 30px rgba(0,0,0,.35)",
            "display:flex", "flex-direction:column"
          ].join(";")
        });

        const header = el("div", {
          style: [
            "padding:14px 16px 10px",
            "border-bottom:1px solid #e5e7eb",
            "display:flex", "align-items:center", "gap:12px"
          ].join(";")
        });

        const title = el("div", { style: "font-size:16px;font-weight:700;color:#111827;" }, "Results Grid");
        const meta = el("div", { style: "font-size:12px;color:#6b7280;" }, `Rows: ${state.rows.length}`);

        const searchBox = el("input", {
          type: "text",
          placeholder: "Filter visible columns...",
          style: [
            "margin-left:auto",
            "width:280px", "max-width:40vw",
            "padding:7px 10px",
            "border:1px solid #d1d5db",
            "border-radius:10px",
            "font-size:13px"
          ].join(";")
        });

        const columnsBtn = el("button", {
          style: [
            "padding:7px 10px",
            "border-radius:10px",
            "border:1px solid #d1d5db",
            "background:#f9fafb",
            "cursor:pointer",
            "font-size:13px"
          ].join(";")
        }, "Columns");

        header.appendChild(title);
        header.appendChild(meta);
        header.appendChild(columnsBtn);
        header.appendChild(searchBox);

        const body = el("div", { style: "display:flex;flex:1;min-height:0;" });

        const colPanel = el("div", {
          style: [
            "width:260px",
            "border-right:1px solid #e5e7eb",
            "padding:12px",
            "overflow:auto",
            "display:none"
          ].join(";")
        });

        const colPanelTitle = el("div", { style: "font-size:13px;font-weight:700;margin-bottom:10px;color:#111827;" }, "Show Columns");
        colPanel.appendChild(colPanelTitle);

        const colList = el("div", {});
        colPanel.appendChild(colList);

        const gridWrap = el("div", { style: "flex:1;min-width:0;display:flex;flex-direction:column;" });

        const tableWrap = el("div", { style: "flex:1;min-height:0;overflow:auto;" });
        const table = el("table", { style: "border-collapse:separate;border-spacing:0;width:100%;" });
        const thead = el("thead", {});
        const tbody = el("tbody", {});
        table.appendChild(thead);
        table.appendChild(tbody);
        tableWrap.appendChild(table);
        gridWrap.appendChild(tableWrap);

        body.appendChild(colPanel);
        body.appendChild(gridWrap);

        card.appendChild(header);
        card.appendChild(body);
        modal.appendChild(card);
        document.body.appendChild(modal);
        document.body.appendChild(stickyClose);

        function close() {
          try { modal.remove(); } catch (_) {}
          try { stickyClose.remove(); } catch (_) {}
        }
        stickyClose.onclick = close;

        function normalizeCellText(raw) {
          let s = (raw === null || raw === undefined) ? "" : String(raw);
          s = s.trim();
          if (!s) return "";
          return s;
        }

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

        function getSourceMediaId(rowItem) {
          const r = rowItem && (rowItem.row || rowItem);
          if (!r) return null;
          const direct = r.sourceMediaId || r.SourceMediaId;
          if (direct) return direct;
          const nested = getFieldValue(r, "sourceMediaId") || getFieldValue(r, "SourceMediaId");
          return nested || null;
        }

        function openNativePlayer(sourceMediaId) {
          const smid = String(sourceMediaId || "").trim();
          if (!smid) return;
          const url = `https://apug01.nxondemand.com/NxIA/ui/explore/(search//player:player/${encodeURIComponent(smid)})`;
          window.open(url, "_blank");
        }

        function rebuildColumnsPanel() {
          colList.innerHTML = "";
          for (let i = 0; i < state.fields.length; i++) {
            const f = state.fields[i];
            const h = state.headers[i] || f;
            const row = el("label", { style: "display:flex;align-items:center;gap:8px;margin:6px 0;font-size:12px;color:#111827;cursor:pointer;" });
            const cb = el("input", { type: "checkbox" });
            cb.checked = state.visible.has(f);
            cb.onchange = () => {
              if (cb.checked) state.visible.add(f);
              else state.visible.delete(f);
              renderTable();
            };
            row.appendChild(cb);
            row.appendChild(el("span", { style: "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" }, h));
            colList.appendChild(row);
          }
        }

        function getVisibleFieldIndexes() {
          const idxs = [];
          for (let i = 0; i < state.fields.length; i++) {
            if (state.visible.has(state.fields[i])) idxs.push(i);
          }
          return idxs;
        }

        function applyFilter(rows) {
          const q = state.searchText.trim().toLowerCase();
          if (!q) return rows;
          const idxs = getVisibleFieldIndexes();
          return rows.filter(item => {
            const r = item.row || item;
            for (let i = 0; i < idxs.length; i++) {
              const k = state.fields[idxs[i]];
              const v = normalizeCellText(getFieldValue(r, k)).toLowerCase();
              if (v && v.includes(q)) return true;
            }
            return false;
          });
        }

        function applySort(rows) {
          if (!state.sort.field) return rows;
          const k = state.sort.field;
          const dir = state.sort.dir;
          return rows.slice().sort((a, b) => {
            const ra = a.row || a;
            const rb = b.row || b;
            const va = normalizeCellText(getFieldValue(ra, k));
            const vb = normalizeCellText(getFieldValue(rb, k));
            if (va === vb) return 0;
            return va < vb ? -1 * dir : 1 * dir;
          });
        }

        function renderTable() {
          const idxs = getVisibleFieldIndexes();

          thead.innerHTML = "";
          const trh = el("tr", {});
          const thPlay = el("th", {
            style: [
              "position:sticky", "top:0", "z-index:5",
              "background:#f9fafb",
              "border-bottom:1px solid #e5e7eb",
              "padding:8px 10px",
              "font-size:12px", "text-align:left",
              "white-space:nowrap"
            ].join(";")
          }, "");
          trh.appendChild(thPlay);

          for (let i = 0; i < idxs.length; i++) {
            const field = state.fields[idxs[i]];
            const headerText = state.headers[idxs[i]] || field;
            const th = el("th", {
              style: [
                "position:sticky", "top:0", "z-index:5",
                "background:#f9fafb",
                "border-bottom:1px solid #e5e7eb",
                "padding:8px 10px",
                "font-size:12px", "text-align:left",
                "white-space:nowrap",
                "cursor:pointer",
                "user-select:none"
              ].join(";"),
              title: "Click to sort"
            }, headerText);

            th.onclick = () => {
              if (state.sort.field === field) state.sort.dir = state.sort.dir * -1;
              else state.sort = { field, dir: 1 };
              renderTable();
            };

            trh.appendChild(th);
          }
          thead.appendChild(trh);

          let rows = applyFilter(state.rows);
          rows = applySort(rows);

          meta.textContent = `Rows: ${rows.length}`;

          tbody.innerHTML = "";
          const maxRender = Math.min(rows.length, 3000);
          for (let ri = 0; ri < maxRender; ri++) {
            const item = rows[ri];
            const r = item.row || item;
            const tr = el("tr", { style: ri % 2 ? "background:#fcfcfd;" : "background:#fff;" });

            const tdPlay = el("td", { style: "padding:6px 10px;border-bottom:1px solid #f1f5f9;white-space:nowrap;" });
            const playBtn = el("button", {
              style: [
                "border:1px solid #d1d5db",
                "background:#fff",
                "border-radius:10px",
                "padding:4px 8px",
                "cursor:pointer",
                "font-size:12px"
              ].join(";")
            }, "Play");
            playBtn.onclick = () => {
              const smid = getSourceMediaId(item);
              if (!smid) {
                alert("sourceMediaId is not present in these results. Add sourceMediaId to the fields returned for grid runs.");
                return;
              }
              openNativePlayer(smid);
            };
            tdPlay.appendChild(playBtn);
            tr.appendChild(tdPlay);

            for (let ci = 0; ci < idxs.length; ci++) {
              const k = state.fields[idxs[ci]];
              const v = normalizeCellText(getFieldValue(r, k));
              const td = el("td", {
                style: [
                  "padding:6px 10px",
                  "border-bottom:1px solid #f1f5f9",
                  "font-size:12px",
                  "color:#111827",
                  "white-space:nowrap",
                  "max-width:340px",
                  "overflow:hidden",
                  "text-overflow:ellipsis"
                ].join(";"),
                title: v
              }, v);
              tr.appendChild(td);
            }
            tbody.appendChild(tr);
          }

          if (rows.length > maxRender) {
            const tr = el("tr", {});
            const td = el("td", {
              colSpan: idxs.length + 1,
              style: "padding:10px;color:#6b7280;font-size:12px;"
            }, `Showing first ${maxRender} rows (performance cap). Refine search or filter.`);
            tr.appendChild(td);
            tbody.appendChild(tr);
          }
        }

        columnsBtn.onclick = () => {
          const showing = colPanel.style.display !== "none";
          colPanel.style.display = showing ? "none" : "block";
        };

        searchBox.oninput = () => {
          state.searchText = searchBox.value || "";
          renderTable();
        };

        rebuildColumnsPanel();
        renderTable();
      } catch (e) {
        console.error(e);
        alert("Failed to open grid. Check console for details.");
      }
    })();
  }

  api.registerTool({
    id: "resultsGrid",
    label: "Results Grid",
    open: openResultsGrid
  });
})();
