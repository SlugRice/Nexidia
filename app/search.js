//[Last Update: 1:47 PM 6/18/2026]
//[Please confirm this timestamp in your response any time it was formed using this document!]
(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;
  function openSearch() {
    (async () => {
      try {
        const isNexidiaPage =
          typeof window !== "undefined" &&
          typeof location !== "undefined" &&
          /nxondemand\.com/i.test(location.hostname) &&
          /\/NxIA\//i.test(location.pathname);
        if (!isNexidiaPage) {
          alert("Failed to run. Make sure you're running this from an active Nexidia session.");
          return;
        }
        const BASE = "https://apug01.nxondemand.com";
        const SEARCH_URL = BASE + "/NxIA/api-gateway/explore/api/v1.0/search";
        const METADATA_URL = BASE + "/NxIA/api-gateway/explore/api/v1.0/metadata/fields/names";
        const VALUE_PLACEHOLDER = "One or more values. Commas or line breaks for multiple.";
        const PHRASE_PLACEHOLDER = "Enter phrases, one per line.";
        const PAGE_SIZE = 1000;
        const MAX_ROWS = 50000;
        const CAP_LIMIT = 10000;
        const MAX_SPLIT_DEPTH = 8;
        const MAX_SEGMENTS = 64;
        const BIG_SEARCH_DEPTH = 5;
        const BOOST_WARN = 100;
        const BOOST_SEVERE = 150;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const FORCE_TEXT_FIELDS = new Set([
          "UDFVarchar1","UDFVarchar122","UDFVarchar110","UDFVarchar41",
          "UDFVarchar115","UDFVarchar136","UDFVarchar50","UDFVarchar104","UDFVarchar105"
        ]);
        const DEFAULT_FILTER_STORAGES = ["UDFVarchar10","UDFVarchar126","DNIS","siteName","UDFVarchar120","UDFVarchar41","UDFVarchar110","UDFVarchar122","UDFVarchar115","UDFVarchar136"];
        const DISPLAY_NAME_MAP = {
          "UDFVarchar10": "Group Number",
          "UDFVarchar110": "Transaction ID",
          "experienceId": "Experience ID",
          "siteName": "Site Name",
          "DNIS": "DNIS",
          "UDFVarchar126": "UDFVarchar126",
          "UDFVarchar120": "UDFVarchar120",
          "UDFVarchar41": "UDFVarchar41",
          "UDFVarchar122": "UDFVarchar122",
          "UDFVarchar1": "UDFVarchar1",
          "UDFVarchar115": "Orig ANI",
          "UDFVarchar136": "Provider Tax ID"
        };
        let currentToken = (api.getShared("searchSessionToken") || 0) + 1;
        api.setShared("searchSessionToken", currentToken);
        let abortController = new AbortController();
        function resetSession() {
          abortController.abort();
          abortController = new AbortController();
          currentToken = (api.getShared("searchSessionToken") || 0) + 1;
          api.setShared("searchSessionToken", currentToken);
        }
        function isSessionCurrent(token) {
          return token === api.getShared("searchSessionToken");
        }
        let metadataFields = [];
        try {
          const res = await fetch(METADATA_URL, { credentials: "include", cache: "no-store", signal: abortController.signal });
          if (res.ok) {
            const json = await res.json();
            metadataFields = Array.isArray(json) ? json.filter((f) => f.isEnabled !== false) : [];
          }
        } catch (_) {}
        function getDisplayName(sn) {
          if (!sn) return sn;
          const f = metadataFields.find((x) => x.storageName === sn);
          if (f) return f.displayName;
          return DISPLAY_NAME_MAP[sn] || sn;
        }
        const progressUI = (() => {
          const wrap = document.createElement("div");
          wrap.style.cssText = "position:fixed;top:16px;right:16px;z-index:999999;width:420px;background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:10px;padding:12px 12px 10px;font-family:Segoe UI,Arial,sans-serif;box-shadow:0 12px 28px rgba(0,0,0,.35);";
          const title = document.createElement("div");
          title.style.cssText = "font-weight:700;font-size:14px;margin-bottom:6px;color:#93c5fd;";
          title.textContent = "Nexidia Search";
          const status = document.createElement("div");
          status.style.cssText = "font-size:12px;line-height:1.3;margin-bottom:8px;";
          status.textContent = "Ready";
          const barOuter = document.createElement("div");
          barOuter.style.cssText = "height:10px;background:#1f2937;border-radius:999px;overflow:hidden;border:1px solid #374151;";
          const barInner = document.createElement("div");
          barInner.style.cssText = "height:100%;width:0%;background:#3b82f6;transition:width 0.3s;";
          barOuter.appendChild(barInner);
          const metrics = document.createElement("div");
          metrics.style.cssText = "margin-top:8px;font-size:12px;color:#cbd5e1;";
          const cancelBtn = document.createElement("div");
          cancelBtn.textContent = "Cancel";
          cancelBtn.style.cssText = "margin-top:8px;font-size:11px;color:#f87171;cursor:pointer;text-decoration:underline;";
          cancelBtn.onclick = () => { abortController.abort(); wrap.remove(); };
          const closeBtn = document.createElement("div");
          closeBtn.textContent = "X";
          closeBtn.style.cssText = "position:absolute;top:10px;right:12px;cursor:pointer;color:#9ca3af;font-size:14px;";
          closeBtn.onclick = () => { abortController.abort(); wrap.remove(); };
          wrap.appendChild(closeBtn);
          wrap.appendChild(title);
          wrap.appendChild(status);
          wrap.appendChild(barOuter);
          wrap.appendChild(metrics);
          wrap.appendChild(cancelBtn);
          return {
            show: () => document.body.appendChild(wrap),
            remove: () => { try { wrap.remove(); } catch (_) {} },
            set: (msg, pct, meta) => {
              status.textContent = msg || "";
              if (pct !== null && pct !== undefined)
                barInner.style.width = Math.max(0, Math.min(100, pct)) + "%";
              metrics.textContent = meta || "";
            }
          };
        })();
        function el(tag, props, ...children) {
          props = props || {};
          const node = document.createElement(tag);
          Object.assign(node, props);
          for (const ch of children) {
            if (ch === null || ch === undefined) continue;
            node.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
          }
          return node;
        }
        function hr() { return el("div", { style: "height:1px;background:#e5e7eb;margin:14px 0;" }); }
        function section(text) { return el("div", { style: "font-size:15px;font-weight:600;margin:10px 0;" }, text); }
        function mkField(label, type) {
          const input = el("input", { type: type || "text", style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;" });
          const wrap = el("div", { style: "flex:1;min-width:200px;" },
            el("div", { style: "font-size:12px;color:#444;margin-bottom:4px;" }, label), input);
          return { wrap, input };
        }
        function runDateFocusAnimation(card, dateSectionEl, onDismiss) {
          var existing = card.querySelectorAll("[data-date-overlay]");
          for (var ei = 0; ei < existing.length; ei++) existing[ei].remove();
          card.style.position = "relative";
          var overlay = document.createElement("div");
          overlay.setAttribute("data-date-overlay", "1");
          overlay.style.cssText = "position:absolute;inset:0;background:transparent;border-radius:14px;z-index:500;pointer-events:auto;transition:opacity 0.32s ease;opacity:0;";
          var overlayTop = document.createElement("div");
          overlayTop.setAttribute("data-date-overlay", "1");
          overlayTop.style.cssText = "position:absolute;left:0;right:0;top:0;background:rgba(15,23,42,0.42);z-index:500;pointer-events:none;transition:opacity 0.32s ease;";
          var overlayBottom = document.createElement("div");
          overlayBottom.setAttribute("data-date-overlay", "1");
          overlayBottom.style.cssText = "position:absolute;left:0;right:0;bottom:0;background:rgba(15,23,42,0.42);z-index:500;pointer-events:none;transition:opacity 0.32s ease;";
          card.appendChild(overlayTop);
          card.appendChild(overlayBottom);
          var highlight = document.createElement("div");
          highlight.setAttribute("data-date-overlay", "1");
          highlight.style.cssText = "position:absolute;z-index:501;pointer-events:none;box-sizing:border-box;border-radius:8px;border:3px solid #f59e0b;box-shadow:0 0 0 0 rgba(245,158,11,0);opacity:0;transition:box-shadow 0.22s ease,opacity 0.32s ease;";
          card.appendChild(overlay);
          card.appendChild(highlight);
          function position() {
            var cardRect = card.getBoundingClientRect();
            var secRect = dateSectionEl.getBoundingClientRect();
            var pad = 10;
            var topPx = secRect.top - cardRect.top + card.scrollTop - pad;
            var heightPx = secRect.height + pad * 2;
            highlight.style.top = topPx + "px";
            highlight.style.left = (secRect.left - cardRect.left - pad) + "px";
            highlight.style.width = (secRect.width + pad * 2) + "px";
            highlight.style.height = heightPx + "px";
            overlayTop.style.top = "0px";
            overlayTop.style.height = topPx + "px";
            overlayBottom.style.top = (topPx + heightPx) + "px";
            overlayBottom.style.height = "calc(100% - " + (topPx + heightPx) + "px)";
          }
          function dismiss() {
            overlay.style.opacity = "0";
            highlight.style.opacity = "0";
            overlayTop.style.opacity = "0";
            overlayBottom.style.opacity = "0";
            setTimeout(() => { try { overlay.remove(); } catch (_) {} try { highlight.remove(); } catch (_) {} }, 360);
            card.removeEventListener("mousedown", onCardClick);
            if (onDismiss) onDismiss();
          }
          function onCardClick(e) { if (e.target === overlay) dismiss(); }
          setTimeout(() => {
            position();
            overlay.style.opacity = "1";
            highlight.style.opacity = "1";
            setTimeout(() => { highlight.style.boxShadow = "0 0 22px 6px rgba(245,158,11,0.32)"; }, 60);
            setTimeout(() => { card.addEventListener("mousedown", onCardClick); }, 300);
          }, 80);
          return dismiss;
        }
        var dateChanged = false;
        let timeFilters = [];
        const allRows = [];
        const timeFilterPills = el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 2px;" });
        function renderTimeFilterPills() {
          timeFilterPills.innerHTML = "";
          for (var i = 0; i < timeFilters.length; i++) {
            (function(idx) {
              var tf = timeFilters[idx];
              var pill = el("div", { style: "display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:16px;background:#fef2f2;border:1px solid #fca5a5;font-size:12px;color:#991b1b;" });
              var label = el("span", {}, tf.start + " \u2013 " + tf.end);
              var x = el("span", { style: "cursor:pointer;color:#ef4444;font-weight:700;font-size:14px;line-height:1;" }, "\u00d7");
              x.onclick = function() {
                timeFilters.splice(idx, 1);
                renderTimeFilterPills();
              };
              pill.appendChild(label);
              pill.appendChild(x);
              timeFilterPills.appendChild(pill);
            })(i);
          }
        }
        function openTimeFilterPopup() {
          var overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000003;display:flex;align-items:center;justify-content:center;" });
          var card = el("div", { style: "background:#fff;border-radius:12px;padding:22px;width:380px;box-shadow:0 8px 30px rgba(0,0,0,.25);" });
          card.appendChild(el("div", { style: "font-size:14px;font-weight:700;margin-bottom:4px;" }, "Time Filter"));
          card.appendChild(el("div", { style: "font-size:11px;color:#6b7280;margin-bottom:12px;" }, "Add time windows to restrict results. Times are in CST to match Nexidia timestamps."));
          var inputRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:10px;" });
          inputRow.appendChild(el("span", { style: "font-size:12px;" }, "From"));
          var startInput = el("input", { type: "time", style: "padding:4px 6px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;" });
          inputRow.appendChild(startInput);
          inputRow.appendChild(el("span", { style: "font-size:12px;" }, "To"));
          var endInput = el("input", { type: "time", style: "padding:4px 6px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;" });
          inputRow.appendChild(endInput);
          var addBtn = el("button", { style: "padding:4px 12px;border-radius:6px;border:none;background:#3b82f6;color:#fff;cursor:pointer;font-size:12px;font-weight:700;" }, "Add");
          inputRow.appendChild(addBtn);
          card.appendChild(inputRow);
          var listWrap = el("div", { style: "margin-bottom:14px;min-height:28px;" });
          card.appendChild(listWrap);
          var localFilters = timeFilters.map(function(f) { return { start: f.start, end: f.end }; });
          function renderLocal() {
            listWrap.innerHTML = "";
            if (localFilters.length === 0) {
              listWrap.appendChild(el("div", { style: "font-size:11px;color:#9ca3af;padding:4px 0;" }, "No time windows added."));
              return;
            }
            for (var j = 0; j < localFilters.length; j++) {
              (function(jj) {
                var row = el("div", { style: "display:flex;align-items:center;justify-content:space-between;padding:4px 8px;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:4px;font-size:12px;" });
                row.appendChild(el("span", {}, localFilters[jj].start + " \u2013 " + localFilters[jj].end));
                var del = el("span", { style: "cursor:pointer;color:#ef4444;font-weight:700;font-size:14px;line-height:1;" }, "\u00d7");
                del.onclick = function() {
                  localFilters.splice(jj, 1);
                  renderLocal();
                };
                row.appendChild(del);
                listWrap.appendChild(row);
              })(j);
            }
          }
          renderLocal();
          addBtn.onclick = function() {
            if (!startInput.value || !endInput.value) { alert("Please select both a start and end time."); return; }
            if (startInput.value >= endInput.value) { alert("Start time must be before end time."); return; }
            localFilters.push({ start: startInput.value, end: endInput.value });
            startInput.value = "";
            endInput.value = "";
            renderLocal();
          };
          var btnRow = el("div", { style: "display:flex;justify-content:flex-end;gap:8px;" });
          var applyBtn = el("button", { style: "padding:6px 18px;border-radius:8px;border:none;background:linear-gradient(135deg,#6366f1,#818cf8);color:#fff;cursor:pointer;font-size:12px;font-weight:700;" }, "Apply");
          applyBtn.onclick = function() {
            timeFilters = localFilters;
            renderTimeFilterPills();
            overlay.remove();
          };
          var cancelBtn = el("button", { style: "padding:6px 18px;border-radius:8px;border:1px solid #d1d5db;background:#fff;color:#374151;cursor:pointer;font-size:12px;font-weight:600;" }, "Cancel");
          cancelBtn.onclick = function() { overlay.remove(); };
          btnRow.appendChild(cancelBtn);
          btnRow.appendChild(applyBtn);
          card.appendChild(btnRow);
          overlay.appendChild(card);
          document.body.appendChild(overlay);
        }
        function generateDateFilters(fromVal, toVal, activeTimeFilters) {
          return { parameterName: "recordedDateTime", operator: "BETWEEN", type: "DATE", value: { firstValue: isoStart(fromVal), secondValue: isoEnd(toVal) } };
        }
        function filterRowsByTimeWindows(rows, windows) {
          if (!windows || !windows.length) return rows;
          var parsed = [];
          for (var w = 0; w < windows.length; w++) {
            var sp = windows[w].start.split(":");
            var ep = windows[w].end.split(":");
            parsed.push({ startMin: parseInt(sp[0], 10) * 60 + parseInt(sp[1], 10), endMin: parseInt(ep[0], 10) * 60 + parseInt(ep[1], 10) });
          }
          var out = [];
          for (var i = 0; i < rows.length; i++) {
            var ts = getFieldValue(rows[i].row, "recordedDateTime");
            if (!ts) continue;
            var dt = new Date(ts);
            if (isNaN(dt.getTime())) continue;
            var totalMin = dt.getUTCHours() * 60 + dt.getUTCMinutes();
            for (var p = 0; p < parsed.length; p++) {
              if (totalMin >= parsed[p].startMin && totalMin < parsed[p].endMin) {
                out.push(rows[i]);
                break;
              }
            }
          }
          return out;
        }
        function getActiveStorageNames(excludeEntry) {
          const set = new Set();
          for (let i = 0; i < allRows.length; i++) {
            const r = allRows[i];
            if (r === excludeEntry || !r.picker) continue;
            const sn = r.picker.getStorageName();
            if (sn) set.add(sn);
          }
          return set;
        }
        function makeFieldPicker(onSelect) {
          const wrapper = el("div", { style: "position:relative;flex:1;min-width:160px;" });
          const input = el("input", { type: "text", placeholder: "Search fields...", style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;" });
          const dropdown = el("div", { style: "display:none;position:absolute;top:100%;left:0;right:0;max-height:200px;overflow-y:auto;background:#fff;border:1px solid #ccc;border-top:none;border-radius:0 0 6px 6px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,.15);" });
          let hi = -1, vis = [];
          function render(q) {
            dropdown.innerHTML = ""; vis = []; hi = -1;
            const ql = q.toLowerCase().trim();
            const cur = input.dataset.storageName || "";
            const active = getActiveStorageNames(null);
            const matches = metadataFields.filter((f) => {
              if (f.storageName === cur) return true;
              if (active.has(f.storageName)) return false;
              return ql ? f.displayName.toLowerCase().includes(ql) : true;
            });
            if (!matches.length) { dropdown.style.display = "none"; return; }
            for (let i = 0; i < Math.min(matches.length, 80); i++) {
              const f = matches[i];
              const item = el("div", { style: "padding:6px 10px;cursor:pointer;font-size:13px;border-bottom:1px solid #f0f0f0;" }, f.displayName);
              (function(fi) {
                item.onmouseenter = () => { for (let j = 0; j < vis.length; j++) vis[j].style.background = vis[j] === item ? "#e8f0fe" : ""; hi = vis.indexOf(item); };
                item.onmouseleave = () => { item.style.background = ""; };
                item.onmousedown = (e) => { e.preventDefault(); pick(fi); };
              })(f);
              dropdown.appendChild(item); vis.push(item);
            }
            dropdown.style.display = "block";
          }
          function pick(f) {
            input.value = f.displayName; input.dataset.storageName = f.storageName;
            dropdown.style.display = "none"; hi = -1;
            if (onSelect) onSelect(f);
          }
          input.addEventListener("input", () => { delete input.dataset.storageName; render(input.value); });
          input.addEventListener("focus", () => { render(input.value); });
          input.addEventListener("blur", () => { setTimeout(() => { dropdown.style.display = "none"; }, 150); });
          input.addEventListener("keydown", (e) => {
            if (!vis.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); for (let i = 0; i < vis.length; i++) vis[i].style.background = ""; hi = Math.min(hi + 1, vis.length - 1); vis[hi].style.background = "#e8f0fe"; vis[hi].scrollIntoView({ block: "nearest" }); }
            else if (e.key === "ArrowUp") { e.preventDefault(); for (let i = 0; i < vis.length; i++) vis[i].style.background = ""; hi = Math.max(hi - 1, 0); vis[hi].style.background = "#e8f0fe"; vis[hi].scrollIntoView({ block: "nearest" }); }
            else if (e.key === "Enter") { e.preventDefault(); if (hi >= 0 && vis[hi]) vis[hi].onmousedown(e); }
            else if (e.key === "Escape") { dropdown.style.display = "none"; }
          });
          wrapper.appendChild(input); wrapper.appendChild(dropdown);
          return {
            wrapper, input,
            getStorageName: () => input.dataset.storageName || "",
            getDisplayName: () => input.value,
            preselect(sn) {
              const f = metadataFields.find((x) => x.storageName === sn);
              if (f) { pick(f); } else { input.value = getDisplayName(sn); input.dataset.storageName = sn; }
            }
          };
        }
        function makeAndLabel() {
          const wrap = el("div", { style: "display:flex;align-items:center;margin:0;height:16px;pointer-events:none;user-select:none;" });
          wrap.dataset.andLabel = "1";
          wrap.appendChild(el("div", { style: "flex:0 0 210px;" }));
          wrap.appendChild(el("div", { style: "flex:1;text-align:center;font-size:10px;font-weight:700;letter-spacing:2px;color:rgba(59,130,246,0.28);" }, "AND"));
          return wrap;
        }
        function removeAdjacentAndLabel(rowEl) {
          let prev = rowEl.previousSibling;
          let next = rowEl.nextSibling;
          if (prev && !prev.dataset?.andLabel && prev.previousSibling) prev = prev.previousSibling;
          if (next && !next.dataset?.andLabel && next.nextSibling) next = next.nextSibling;
          if (prev?.dataset?.andLabel) prev.remove();
          else if (next?.dataset?.andLabel) next.remove();
        }
        const panes = [];
        let activePaneIndex = 0;
        let ghostPaneEl = null;
        let carouselTrack = null;
        let dotsRow = null;
        let carouselViewport = null;
        let fadeMaskLeft = null;
        let dragState = null;
        const PEEK = 80, GAP = 14;
        function getPaneWidth() { return carouselViewport ? Math.max(200, carouselViewport.offsetWidth - PEEK - GAP) : 800; }
        function getPaneForEntry(entry) {
          for (let i = 0; i < panes.length; i++) if (panes[i].index === entry.paneIndex) return panes[i];
          return null;
        }
        function rebuildAndLabels(pane) {
          const rc = pane.rowsContainer;
          const labels = rc.querySelectorAll("[data-and-label]");
          for (let i = 0; i < labels.length; i++) labels[i].remove();
          for (let i = 1; i < pane.rows.length; i++) {
            rc.insertBefore(makeAndLabel(), pane.rows[i].rowEl);
          }
        }
        function buildRowEntry(storageName, isPhrase) {
          isPhrase = isPhrase || false;
          const entry = { rowEl: null, picker: null, valueInput: null, fieldLabelWrap: null, paneIndex: 0, isPhrase, exclude: false, speaker: "transcript", excludeToggle: null, speakerWrap: null, speakerRadios: null };
          const removeBtn = el("button", { style: "width:22px;height:22px;border-radius:50%;border:1px solid #e5e7eb;background:#fff;color:#aaa;cursor:pointer;font-size:11px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;align-self:center;", title: "Remove" }, "X");
          const fieldLabelWrap = el("div", { style: "flex:0 0 180px;padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;background:#f3f4f6;font-size:13px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;cursor:pointer;" });
          fieldLabelWrap.onclick = () => {
            if (!entry.picker) return;
            fieldLabelWrap.style.display = "none";
            entry.picker.wrapper.style.display = "block";
            entry.picker.input.focus();
          };
          entry.fieldLabelWrap = fieldLabelWrap;
          let valueInput;
          if (isPhrase) {
            valueInput = el("textarea", { rows: 2, placeholder: PHRASE_PLACEHOLDER, style: "flex:1;min-width:0;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;resize:vertical;font-family:Segoe UI,Arial,sans-serif;font-size:13px;" });
            valueInput.addEventListener("paste", (e) => {
              try {
                const text = (e.clipboardData || window.clipboardData).getData("text");
                if (typeof text !== "string") return;
                const norm = text.replace(/\r\n/g, "\n").replace(/\t/g, "\n");
                if (/\n/.test(norm)) {
                  e.preventDefault();
                  const s = valueInput.selectionStart != null ? valueInput.selectionStart : valueInput.value.length;
                  const en = valueInput.selectionEnd != null ? valueInput.selectionEnd : valueInput.value.length;
                  valueInput.value = valueInput.value.slice(0, s) + norm + valueInput.value.slice(en);
                  valueInput.selectionStart = valueInput.selectionEnd = s + norm.length;
                }
              } catch (_) {}
            });
          } else {
            valueInput = el("input", { type: "text", placeholder: VALUE_PLACEHOLDER, style: "flex:1;min-width:0;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;" });
            valueInput.addEventListener("paste", (e) => {
              try {
                const text = (e.clipboardData || window.clipboardData).getData("text");
                if (typeof text !== "string") return;
                const norm = text.replace(/\r\n/g, ",").replace(/\n/g, ",").replace(/\t/g, ",");
                if (norm !== text) {
                  e.preventDefault();
                  const s = valueInput.selectionStart != null ? valueInput.selectionStart : valueInput.value.length;
                  const en = valueInput.selectionEnd != null ? valueInput.selectionEnd : valueInput.value.length;
                  valueInput.value = valueInput.value.slice(0, s) + norm + valueInput.value.slice(en);
                  valueInput.selectionStart = valueInput.selectionEnd = s + norm.length;
                }
              } catch (_) {}
            });
          }
          entry.valueInput = valueInput;
          const excludeToggle = (() => {
            const PW = 32, PH = 16, KN = 12;
            const wrap = el("div", { style: "display:flex;align-items:center;gap:4px;flex-shrink:0;cursor:pointer;user-select:none;" });
            const label = el("span", { style: "font-size:10px;font-weight:600;letter-spacing:0.5px;" });
            const pill = el("div", { style: "position:relative;width:" + PW + "px;height:" + PH + "px;border-radius:999px;transition:background 0.22s;flex-shrink:0;" });
            const knob = el("div", { style: "position:absolute;top:" + ((PH - KN) / 2) + "px;width:" + KN + "px;height:" + KN + "px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.25);transition:left 0.22s;" });
            pill.appendChild(knob);
            wrap.appendChild(label);
            wrap.appendChild(pill);
            let on = false;
            function apply() {
              if (on) {
                pill.style.background = "#ef4444"; knob.style.left = (PW - KN - 2) + "px";
                label.textContent = "EXCLUDE"; label.style.color = "#ef4444";
                if (entry.rowEl) entry.rowEl.style.background = "rgba(239,68,68,0.06)";
              } else {
                pill.style.background = "#22c55e"; knob.style.left = "2px";
                label.textContent = "INCLUDE"; label.style.color = "#22c55e";
                if (entry.rowEl) entry.rowEl.style.background = "";
              }
            }
            wrap.addEventListener("click", () => { on = !on; entry.exclude = on; apply(); });
            apply();
            return { wrap, get: () => on, set: (v) => { on = v; entry.exclude = v; apply(); } };
          })();
          entry.excludeToggle = excludeToggle;
          let speakerWrap = null;
          if (isPhrase) {
            speakerWrap = el("div", { style: "display:inline-flex;align-items:center;gap:2px;border:1px solid #e5e7eb;border-radius:6px;padding:2px 4px;background:#f9fafb;" });
            const speakers = [["transcript", "Either"], ["agentText", "Agent"], ["customerText", "Customer"]];
            const radios = [];
            for (let si = 0; si < speakers.length; si++) {
              const spVal = speakers[si][0];
              const spLabel = speakers[si][1];
              const radio = el("input", { type: "radio", name: "speaker_" + Math.random().toString(36).slice(2), style: "margin:0 2px 0 " + (si > 0 ? "6" : "0") + "px;" });
              if (si === 0) radio.checked = true;
              radio.onchange = () => { if (radio.checked) entry.speaker = spVal; };
              const lbl = el("label", { style: "font-size:10px;color:#374151;cursor:pointer;user-select:none;" }, spLabel);
              lbl.onclick = () => { radio.checked = true; entry.speaker = spVal; };
              speakerWrap.appendChild(radio);
              speakerWrap.appendChild(lbl);
              radios.push({ radio, value: spVal });
            }
            entry.speakerRadios = radios;
          }
          entry.speakerWrap = speakerWrap;
          const picker = isPhrase ? null : makeFieldPicker((f) => {
            fieldLabelWrap.textContent = f.displayName;
            fieldLabelWrap.title = f.displayName;
            fieldLabelWrap.style.display = "block";
            if (entry.picker) entry.picker.wrapper.style.display = "none";
            syncFieldAcrossPanes(entry, f.storageName, f.displayName);
          });
          if (picker) {
            if (storageName) { picker.wrapper.style.display = "none"; }
            else { fieldLabelWrap.style.display = "none"; }
          }
          entry.picker = picker;
          if (isPhrase) {
            fieldLabelWrap.textContent = "Phrase";
            fieldLabelWrap.title = "Phrase search - each line is a separate search";
            fieldLabelWrap.style.fontStyle = "italic";
            fieldLabelWrap.style.color = "#6b7280";
          }
          const rowEl = el("div", { style: "display:flex;gap:8px;align-items:center;margin:4px 0;" });
          rowEl.appendChild(removeBtn);
          rowEl.appendChild(excludeToggle.wrap);
          rowEl.appendChild(fieldLabelWrap);
          if (picker) rowEl.appendChild(picker.wrapper);
          rowEl.appendChild(valueInput);
          if (isPhrase) {
            const subRow = el("div", { style: "display:flex;align-items:center;gap:10px;margin:4px 0 2px 30px;" });
            if (speakerWrap) subRow.appendChild(speakerWrap);
            rowEl.style.flexWrap = "wrap";
            rowEl.appendChild(subRow);
          }
          entry.rowEl = rowEl;
          allRows.push(entry);
          rowEl.draggable = true;
          rowEl.style.cursor = "grab";
          rowEl.addEventListener("dragstart", (e) => {
            dragState = { entry };
            rowEl.style.opacity = "0.35";
            rowEl.style.cursor = "grabbing";
            e.dataTransfer.effectAllowed = "move";
          });
          rowEl.addEventListener("dragend", () => {
            rowEl.style.opacity = "1";
            rowEl.style.cursor = "grab";
            dragState = null;
          });
          rowEl.addEventListener("dragover", (e) => {
            if (!dragState || dragState.entry === entry) return;
            if (getPaneForEntry(dragState.entry) !== getPaneForEntry(entry)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            const rect = rowEl.getBoundingClientRect();
            const mid = rect.top + rect.height / 2;
            if (e.clientY < mid) {
              rowEl.style.boxShadow = "inset 0 2px 0 0 #3b82f6";
            } else {
              rowEl.style.boxShadow = "inset 0 -2px 0 0 #3b82f6";
            }
          });
          rowEl.addEventListener("dragleave", () => {
            rowEl.style.boxShadow = "";
          });
          rowEl.addEventListener("drop", (e) => {
            e.preventDefault();
            rowEl.style.boxShadow = "";
            if (!dragState || dragState.entry === entry) return;
            const pane = getPaneForEntry(entry);
            if (!pane || pane !== getPaneForEntry(dragState.entry)) return;
            const srcIdx = pane.rows.indexOf(dragState.entry);
            const dstIdx = pane.rows.indexOf(entry);
            if (srcIdx === -1 || dstIdx === -1) return;
            const rect = rowEl.getBoundingClientRect();
            const insertAfter = e.clientY >= rect.top + rect.height / 2;
            pane.rows.splice(srcIdx, 1);
            const newIdx = pane.rows.indexOf(entry);
            pane.rows.splice(insertAfter ? newIdx + 1 : newIdx, 0, dragState.entry);
            if (insertAfter) {
              const next = entry.rowEl.nextSibling;
              pane.rowsContainer.insertBefore(dragState.entry.rowEl, next);
            } else {
              pane.rowsContainer.insertBefore(dragState.entry.rowEl, entry.rowEl);
            }
            rebuildAndLabels(pane);
          });
          removeBtn.onclick = () => {
            removeAdjacentAndLabel(rowEl); rowEl.remove();
            const idx = allRows.indexOf(entry); if (idx !== -1) allRows.splice(idx, 1);
            for (let i = 0; i < panes.length; i++) { const pi = panes[i].rows.indexOf(entry); if (pi !== -1) panes[i].rows.splice(pi, 1); }
          };
          if (storageName && picker) {
            picker.preselect(storageName);
            fieldLabelWrap.textContent = getDisplayName(storageName);
            fieldLabelWrap.title = getDisplayName(storageName);
          }
          return entry;
        }
        function syncFieldAcrossPanes(changedEntry, storageName, displayName) {
          if (changedEntry.isPhrase) return;
          let srcPaneObj = null;
          for (let i = 0; i < panes.length; i++) { if (panes[i].index === changedEntry.paneIndex) { srcPaneObj = panes[i]; break; } }
          if (!srcPaneObj) return;
          const rowIdx = srcPaneObj.rows.indexOf(changedEntry);
          if (rowIdx === -1) return;
          for (let i = 0; i < panes.length; i++) {
            const pane = panes[i];
            if (pane.index === changedEntry.paneIndex) continue;
            const parallel = pane.rows[rowIdx];
            if (!parallel || parallel.isPhrase) continue;
            if (parallel.picker) parallel.picker.preselect(storageName);
            parallel.fieldLabelWrap.textContent = displayName;
            parallel.fieldLabelWrap.title = displayName;
          }
        }
        function buildPaneEl(paneIndex) {
          const paneEl = el("div", { style: "background:#fff;border-radius:14px;border:1px solid rgba(59,130,246,0.18);padding:18px 20px 14px;box-sizing:border-box;flex-shrink:0;position:relative;box-shadow:0 2px 10px rgba(59,130,246,0.06);" });
          paneEl.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:14px;" }, "Search Fields"));
          const rowsContainer = el("div", {});
          paneEl.appendChild(rowsContainer);
          const addBtn = el("button", { style: "margin-top:12px;padding:6px 12px;border-radius:8px;border:1px solid #3b82f6;background:#fff;color:#3b82f6;cursor:pointer;font-size:12px;" }, "+ Add Field");
          const addPhraseBtn = el("button", { style: "margin-top:6px;margin-left:8px;padding:6px 12px;border-radius:8px;border:1px solid #6366f1;background:#fff;color:#6366f1;cursor:pointer;font-size:12px;" }, "+ Add Phrase");
          paneEl.appendChild(addBtn); paneEl.appendChild(addPhraseBtn);
          const orBtn = el("button", { style: "position:absolute;right:-20px;top:50%;transform:translateY(-50%);z-index:20;padding:7px 15px;border-radius:20px;border:0;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 3px 12px rgba(59,130,246,0.5);letter-spacing:1px;transition:box-shadow 0.2s;" }, "OR");
          orBtn.onmouseenter = () => { orBtn.style.boxShadow = "0 5px 18px rgba(59,130,246,0.7)"; };
          orBtn.onmouseleave = () => { orBtn.style.boxShadow = "0 3px 12px rgba(59,130,246,0.5)"; };
          orBtn.onclick = () => { if (paneObj.index < panes.length - 1) { slideTo(paneObj.index + 1); } else { activateNextPane(); } };
          paneEl.appendChild(orBtn);
          const bottomRow = el("div", { style: "display:flex;align-items:center;margin-top:16px;" });
          const bottomLabel = el("div", { style: "font-size:11px;font-weight:600;color:#3b82f6;letter-spacing:1px;opacity:0.7;" }, "Search " + String.fromCharCode(65 + paneIndex));
          bottomRow.appendChild(bottomLabel);
          paneEl.appendChild(bottomRow);
          const paneObj = { el: paneEl, rowsContainer, addBtn, addPhraseBtn, orBtn, rows: [], index: paneIndex, bottomLabel };
          addBtn.onclick = () => { if (paneObj.rows.length > 0) rowsContainer.appendChild(makeAndLabel()); const entry = buildRowEntry("", false); entry.paneIndex = paneObj.index; rowsContainer.appendChild(entry.rowEl); paneObj.rows.push(entry); };
          addPhraseBtn.onclick = () => { if (paneObj.rows.length > 0) rowsContainer.appendChild(makeAndLabel()); const entry = buildRowEntry("", true); entry.paneIndex = paneObj.index; rowsContainer.appendChild(entry.rowEl); paneObj.rows.push(entry); };
          return paneObj;
        }
        function populatePaneDefaults(pane) {
          for (let i = 0; i < DEFAULT_FILTER_STORAGES.length; i++) {
            if (i > 0) pane.rowsContainer.appendChild(makeAndLabel());
            const entry = buildRowEntry(DEFAULT_FILTER_STORAGES[i], false);
            entry.paneIndex = pane.index; pane.rows.push(entry); pane.rowsContainer.appendChild(entry.rowEl);
          }
        }
        function buildGhostPane(paneIndex) {
          const ghost = el("div", { style: "background:#fff;border-radius:14px;border:1px solid rgba(59,130,246,0.10);padding:18px 20px 14px;box-sizing:border-box;flex-shrink:0;position:relative;box-shadow:0 2px 10px rgba(59,130,246,0.03);opacity:0.55;pointer-events:none;" });
          ghost.dataset.ghost = "1";
          ghost.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:14px;opacity:0.5;" }, "Search Fields"));
          for (let i = 0; i < 4; i++) {
            if (i > 0) { const al = makeAndLabel(); al.style.opacity = "0.3"; ghost.appendChild(al); }
            const skRow = el("div", { style: "display:flex;gap:8px;align-items:center;margin:4px 0;" });
            skRow.appendChild(el("div", { style: "width:22px;height:22px;border-radius:50%;background:#e5e7eb;" }));
            skRow.appendChild(el("div", { style: "flex:0 0 180px;height:32px;border-radius:6px;background:#f3f4f6;border:1px solid #e5e7eb;" }));
            skRow.appendChild(el("div", { style: "flex:1;height:32px;border-radius:6px;background:#f9fafb;border:1px solid #e5e7eb;" }));
            ghost.appendChild(skRow);
          }
          const ghostOr = el("button", { style: "position:absolute;right:-20px;top:50%;transform:translateY(-50%);z-index:20;padding:7px 15px;border-radius:20px;border:0;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 3px 12px rgba(59,130,246,0.5);letter-spacing:1px;opacity:0.8;pointer-events:auto;" }, "OR");
          ghostOr.onclick = () => { activateNextPane(); };
          ghost.appendChild(ghostOr);
          ghost.appendChild(el("div", { style: "text-align:center;font-size:11px;font-weight:600;color:#3b82f6;letter-spacing:1px;margin-top:16px;opacity:0.35;" }, "Search " + String.fromCharCode(65 + paneIndex)));
          return ghost;
        }
        function activateNextPane() {
          const newIndex = panes.length;
          const newPane = buildPaneEl(newIndex);
          const refPane = panes[0];
          for (let i = 0; i < refPane.rows.length; i++) {
            if (i > 0) newPane.rowsContainer.appendChild(makeAndLabel());
            const refEntry = refPane.rows[i];
            const sn = refEntry.picker ? refEntry.picker.getStorageName() : "";
            const entry = buildRowEntry(sn, refEntry.isPhrase);
            entry.paneIndex = newIndex; newPane.rows.push(entry); newPane.rowsContainer.appendChild(entry.rowEl);
          }
          panes.push(newPane);
          if (ghostPaneEl && carouselTrack.contains(ghostPaneEl)) { carouselTrack.replaceChild(newPane.el, ghostPaneEl); }
          else { carouselTrack.appendChild(newPane.el); }
          ghostPaneEl = buildGhostPane(newIndex + 1);
          carouselTrack.appendChild(ghostPaneEl);
          resizePanes(); slideTo(newIndex); updateDots();
        }
        function pruneEmptyTailPanes() {
          while (panes.length > 1) {
            const last = panes[panes.length - 1];
            if (last.index === activePaneIndex) break;
            let hasVal = false;
            for (let i = 0; i < last.rows.length; i++) { if (last.rows[i].valueInput.value.trim().length > 0) { hasVal = true; break; } }
            if (hasVal) break;
            for (let i = 0; i < last.rows.length; i++) { const idx = allRows.indexOf(last.rows[i]); if (idx !== -1) allRows.splice(idx, 1); }
            if (last.el.parentNode) last.el.parentNode.removeChild(last.el);
            panes.pop();
          }
          if (ghostPaneEl && ghostPaneEl.parentNode) ghostPaneEl.parentNode.removeChild(ghostPaneEl);
          ghostPaneEl = buildGhostPane(panes.length);
          carouselTrack.appendChild(ghostPaneEl);
          resizePanes(); updateDots();
        }
        function resizePanes() {
          if (!carouselViewport) return;
          const pw = getPaneWidth();
          for (let i = 0; i < panes.length; i++) { panes[i].el.style.width = pw + "px"; panes[i].el.style.minWidth = pw + "px"; panes[i].el.style.marginRight = GAP + "px"; }
          if (ghostPaneEl) { ghostPaneEl.style.width = pw + "px"; ghostPaneEl.style.minWidth = pw + "px"; ghostPaneEl.style.marginRight = GAP + "px"; }
          applySlideTransform(activePaneIndex, false);
        }
        function updateDots() {
          if (!dotsRow) return;
          dotsRow.innerHTML = "";
          for (let i = 0; i < panes.length; i++) {
            const dot = el("div", { style: "width:8px;height:8px;border-radius:50%;cursor:pointer;background:" + (i === activePaneIndex ? "#3b82f6" : "#d1d5db") + ";transition:background 0.2s;", title: "Search " + String.fromCharCode(65 + i) });
            dot.onclick = ((idx) => () => slideTo(idx))(i);
            dotsRow.appendChild(dot);
          }
        }
        function applySlideTransform(index, animate) {
          const pw = getPaneWidth();
          const leftPeekOffset = index > 0 ? Math.round(PEEK * 0.75) : 0;
          const tx = -(index * (pw + GAP)) + leftPeekOffset;
          carouselTrack.style.transition = animate ? "transform 0.4s cubic-bezier(0.4,0,0.2,1)" : "none";
          carouselTrack.style.transform = "translateX(" + tx + "px)";
          if (fadeMaskLeft) { fadeMaskLeft.style.opacity = index > 0 ? "1" : "0"; fadeMaskLeft.style.pointerEvents = index > 0 ? "auto" : "none"; }
        }
        function slideTo(index) {
          if (index < 0 || index >= panes.length) return;
          const prev = activePaneIndex; activePaneIndex = index;
          applySlideTransform(index, true); updateDots();
          if (index < prev) { setTimeout(() => { pruneEmptyTailPanes(); }, 440); }
        }
        const modal = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
        const stickyClose = el("button", { style: "position:fixed;top:20px;right:20px;z-index:1000000;border:0;background:rgba(30,30,30,.75);color:#fff;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4);" }, "X");
        function closeAll() {
          abortController.abort();
          api.setShared("lastSearchResult", null);
          api.setShared("dispatcherState", null);
          try { modal.remove(); } catch (_) {}
          try { stickyClose.remove(); } catch (_) {}
          window.removeEventListener("resize", resizePanes);
        }
        stickyClose.onclick = closeAll;
        const card = el("div", { style: "background:#f8fafc;width:1080px;max-height:90vh;overflow:auto;border-radius:14px;padding:18px 18px 22px;box-shadow:0 10px 30px rgba(0,0,0,.35);position:relative;" });
        function clearAllFields() {
          const newToday = new Date();
          const newMonthAgo = new Date(newToday);
          newMonthAgo.setMonth(newToday.getMonth() - 1);
          fromDate.input.valueAsDate = newMonthAgo;
          toDate.input.valueAsDate = newToday;
          dateChanged = false;
          timeFilters = [];
          renderTimeFilterPills();
          while (panes.length > 1) {
            const last = panes[panes.length - 1];
            for (let i = 0; i < last.rows.length; i++) { const idx = allRows.indexOf(last.rows[i]); if (idx !== -1) allRows.splice(idx, 1); }
            if (last.el.parentNode) last.el.parentNode.removeChild(last.el);
            panes.pop();
          }
          const fp = panes[0];
          while (fp.rows.length) {
            const row = fp.rows.pop();
            const idx = allRows.indexOf(row);
            if (idx !== -1) allRows.splice(idx, 1);
            if (row.rowEl.parentNode) row.rowEl.parentNode.removeChild(row.rowEl);
          }
          fp.rowsContainer.innerHTML = "";
          populatePaneDefaults(fp);
          if (ghostPaneEl && ghostPaneEl.parentNode) ghostPaneEl.parentNode.removeChild(ghostPaneEl);
          ghostPaneEl = buildGhostPane(1);
          carouselTrack.appendChild(ghostPaneEl);
          resizePanes(); updateDots(); slideTo(0);
        }
        const headerRow = el("div", { style: "display:flex;align-items:center;gap:10px;margin-bottom:4px;" });
        headerRow.appendChild(el("div", { style: "font-size:18px;font-weight:600;flex:1;" }, "Nexidia Search"));
        const loadSearchBtn = el("button", { style: "padding:6px 12px;border-radius:8px;border:1px solid #6366f1;background:#fff;color:#6366f1;cursor:pointer;font-size:12px;" }, "\uD83D\uDCC2 Load");
        loadSearchBtn.onclick = () => { openLoadPanel(); };
        const saveSearchBtn = el("button", { style: "padding:6px 12px;border-radius:8px;border:1px solid #22c55e;background:#fff;color:#16a34a;cursor:pointer;font-size:12px;" }, "\uD83D\uDCBE Save");
        saveSearchBtn.onclick = () => { openSavePrompt(serializeSearch(), ""); };
        headerRow.appendChild(loadSearchBtn);
        headerRow.appendChild(saveSearchBtn);
        const clearAllBtn = el("button", { style: "padding:6px 12px;border-radius:8px;border:1px solid #ef4444;background:#fff;color:#ef4444;cursor:pointer;font-size:12px;" }, "\uD83D\uDDD1 Clear All");
        clearAllBtn.addEventListener("mouseenter", () => { clearAllBtn.style.background = "#fef2f2"; });
        clearAllBtn.addEventListener("mouseleave", () => { clearAllBtn.style.background = "#fff"; });
        clearAllBtn.onclick = () => { clearAllFields(); };
        headerRow.appendChild(clearAllBtn);
        card.appendChild(headerRow);
        card.appendChild(hr());
        const dateSectionWrapper = el("div", { style: "margin-bottom:0;" });
        var dateHeaderRow = el("div", { style: "display:flex;align-items:center;gap:10px;margin:10px 0;" });
        dateHeaderRow.appendChild(el("div", { style: "font-size:15px;font-weight:600;" }, "Date Range"));
