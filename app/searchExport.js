(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;

//##> METADATA FIELDS: Fetched once per tool session from the live Explore API. Used to
//##> populate the Add Filter dropdown with current display names and storage names.
//##> Filtered to isEnabled !== false. Capped at 80 results per dropdown render for
//##> performance. storageName from this API is used directly in search payloads — no
//##> translation needed for filter picker fields (only legacy column prefs need translation).

  function openSearchExport() {
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
        const SEARCH_URL = `${BASE}/NxIA/api-gateway/explore/api/v1.0/search`;
        const METADATA_URL = `${BASE}/NxIA/api-gateway/explore/api/v1.0/metadata/fields/names`;
        const LEGACY_FORMS_URL = `${BASE}/NxIA/Search/ForensicSearch.aspx`;
        const SETTINGS_URL = (id) =>
          `${BASE}/NxIA/Search/SettingsDialog.aspx?AppInstanceID=${encodeURIComponent(id)}`;

        const FILTER_PLACEHOLDER = "Enter one value for this filter.";
        const KEY_PLACEHOLDER = "Separate multiple values with commas or line breaks, or paste from Excel.";
        const PAGE_SIZE = 1000;
        const MAX_ROWS = 50000;
        const FIXED_DT_FORMAT = `m\\/d\\/yyyy\\ h:mm`;
        const FIXED_DURATION_FORMAT = `\\[h\\]\\:mm\\:ss`;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        // Fields that default to key type
        const DEFAULT_KEY_STORAGES = new Set([
          "UDFVarchar1", "UDFVarchar110", "UDFVarchar113", "UDFVarchar115",
          "UDFVarchar41", "UDFVarchar136", "experienceId", "UDFVarchar122"
        ]);

        const DEFAULT_FILTER_STORAGES = [
          "UDFVarchar10", "UDFVarchar126", "DNIS", "siteName", "UDFVarchar120"
        ];

        const DEFAULT_KEY_LIST = [
          "experienceId", "UDFVarchar122", "UDFVarchar41", "UDFVarchar115",
          "UDFVarchar1", "UDFVarchar110"
        ];

        let metadataFields = [];
        try {
          const res = await fetch(METADATA_URL, { credentials: "include", cache: "no-store" });
          if (res.ok) {
            const json = await res.json();
            metadataFields = Array.isArray(json) ? json.filter(f => f.isEnabled !== false) : [];
          }
        } catch (_) {}

        // ── Progress UI ────────────────────────────────────────────────────────────
        const progressUI = (() => {
          const wrap = document.createElement("div");
          wrap.style.cssText = `position:fixed;top:16px;right:16px;z-index:999999;width:420px;
            background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:10px;
            padding:12px 12px 10px;font-family:Segoe UI,Arial,sans-serif;
            box-shadow:0 12px 28px rgba(0,0,0,.35);`;
          const title = document.createElement("div");
          title.style.cssText = "font-weight:700;font-size:14px;margin-bottom:6px;color:#93c5fd;";
          title.textContent = "Nexidia Search";
          const status = document.createElement("div");
          status.style.cssText = "font-size:12px;line-height:1.3;margin-bottom:8px;";
          status.textContent = "Ready";
          const barOuter = document.createElement("div");
          barOuter.style.cssText = "height:10px;background:#1f2937;border-radius:999px;overflow:hidden;border:1px solid #374151;";
          const barInner = document.createElement("div");
          barInner.style.cssText = "height:100%;width:0%;background:#3b82f6;";
          barOuter.appendChild(barInner);
          const metrics = document.createElement("div");
          metrics.style.cssText = "margin-top:8px;font-size:12px;color:#cbd5e1;";
          const closeBtn = document.createElement("div");
          closeBtn.textContent = "✕";
          closeBtn.style.cssText = "position:absolute;top:10px;right:12px;cursor:pointer;color:#9ca3af;font-size:14px;";
          closeBtn.onclick = () => wrap.remove();
          wrap.appendChild(closeBtn);
          wrap.appendChild(title);
          wrap.appendChild(status);
          wrap.appendChild(barOuter);
          wrap.appendChild(metrics);
          return {
            show: () => document.body.appendChild(wrap),
            remove: () => wrap.remove(),
            set: (msg, pct = null, meta = "") => {
              status.textContent = msg || "";
              if (pct !== null) barInner.style.width = `${Math.max(0, Math.min(100, pct))}%`;
              metrics.textContent = meta || "";
            }
          };
        })();

        // ── DOM helper ─────────────────────────────────────────────────────────────
        const el = (tag, props = {}, ...children) => {
          const node = document.createElement(tag);
          Object.assign(node, props);
          for (const ch of children)
            node.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
          return node;
        };
        const hr = () => el("div", { style: "height:1px;background:#e5e7eb;margin:14px 0;" });
        const section = (text) => el("div", {
          style: "font-size:15px;font-weight:600;margin:10px 0 10px;"
        }, text);

        const field = (label, type = "text", placeholder = "") => {
          const input = el("input", {
            type, placeholder,
            style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;"
          });
          const wrap = el("div", { style: "flex:1;min-width:280px;" },
            el("div", { style: "font-size:12px;color:#444;margin-bottom:4px;" }, label),
            input
          );
          return { wrap, input };
        };

        const textareaField = (label, placeholder = "", rowsCount = 3) => {
          const ta = el("textarea", {
            rows: rowsCount, placeholder,
            style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;resize:vertical;font-family:Segoe UI,Arial,sans-serif;box-sizing:border-box;"
          });
          ta.addEventListener("paste", (e) => {
            try {
              const text = (e.clipboardData || window.clipboardData).getData("text");
              if (typeof text !== "string") return;
              const normalized = text.replace(/\r\n/g, "\n").replace(/\t/g, "\n");
              if (/\n/.test(normalized)) {
                e.preventDefault();
                const start = ta.selectionStart ?? ta.value.length;
                const end = ta.selectionEnd ?? ta.value.length;
                ta.value = ta.value.slice(0, start) + normalized + ta.value.slice(end);
                ta.selectionStart = ta.selectionEnd = start + normalized.length;
              }
            } catch (_) {}
          });
          const wrap = el("div", { style: "flex:1;min-width:280px;" },
            el("div", { style: "font-size:12px;color:#444;margin-bottom:4px;" }, label),
            ta
          );
          return { wrap, input: ta };
        };

        // ── Fade helpers ───────────────────────────────────────────────────────────
        const fadeOut = (node, ms = 180) => new Promise(resolve => {
          node.style.transition = `opacity ${ms}ms ease`;
          node.style.opacity = "0";
          setTimeout(resolve, ms);
        });

        const fadeIn = (node, ms = 180) => {
          node.style.opacity = "0";
          node.style.transition = `opacity ${ms}ms ease`;
          requestAnimationFrame(() => requestAnimationFrame(() => { node.style.opacity = "1"; }));
        };

        // ── Field registry ─────────────────────────────────────────────────────────
        // allRows: all active row entries across all zones
        const allRows = [];

        const getActiveStorageNames = (excludeEntry = null) =>
          new Set(allRows
            .filter(r => r !== excludeEntry)
            .map(r => r.picker ? r.picker.getStorageName() : "")
            .filter(Boolean));

        // ── Field picker ───────────────────────────────────────────────────────────
        function makeFieldPicker(onSelect) {
          const wrapper = el("div", { style: "position:relative;flex:1;min-width:180px;" });
          const input = el("input", {
            type: "text", placeholder: "Search fields...",
            style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;"
          });
          const dropdown = el("div", {
            style: `display:none;position:absolute;top:100%;left:0;right:0;max-height:200px;
              overflow-y:auto;background:#fff;border:1px solid #ccc;border-top:none;
              border-radius:0 0 6px 6px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,.15);`
          });
          let highlightIndex = -1;
          let visibleItems = [];

          const renderDropdown = (query) => {
            dropdown.innerHTML = "";
            visibleItems = [];
            highlightIndex = -1;
            const q = query.toLowerCase().trim();
            const currentStorage = input.dataset.storageName || "";
            const active = getActiveStorageNames();
            const matches = metadataFields.filter(f => {
              if (f.storageName === currentStorage) return true;
              if (active.has(f.storageName)) return false;
              return q ? f.displayName.toLowerCase().includes(q) : true;
            });
            if (!matches.length) { dropdown.style.display = "none"; return; }
            for (const f of matches.slice(0, 80)) {
              const item = el("div", {
                style: "padding:6px 10px;cursor:pointer;font-size:13px;border-bottom:1px solid #f0f0f0;"
              }, f.displayName);
              item.onmouseenter = () => {
                visibleItems.forEach((v, i) => v.style.background = visibleItems.indexOf(item) === i ? "#e8f0fe" : "");
                highlightIndex = visibleItems.indexOf(item);
              };
              item.onmouseleave = () => { item.style.background = ""; };
              item.onmousedown = (e) => { e.preventDefault(); selectItem(f); };
              dropdown.appendChild(item);
              visibleItems.push(item);
            }
            dropdown.style.display = "block";
          };

          const selectItem = (f) => {
            input.value = f.displayName;
            input.dataset.storageName = f.storageName;
            dropdown.style.display = "none";
            highlightIndex = -1;
            if (onSelect) onSelect(f);
          };

          const clearHighlight = () => visibleItems.forEach(i => i.style.background = "");

          input.addEventListener("input", () => { delete input.dataset.storageName; renderDropdown(input.value); });
          input.addEventListener("focus", () => renderDropdown(input.value));
          input.addEventListener("blur", () => setTimeout(() => { dropdown.style.display = "none"; }, 150));
          input.addEventListener("keydown", (e) => {
            if (!visibleItems.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault(); clearHighlight();
              highlightIndex = Math.min(highlightIndex + 1, visibleItems.length - 1);
              visibleItems[highlightIndex].style.background = "#e8f0fe";
              visibleItems[highlightIndex].scrollIntoView({ block: "nearest" });
            } else if (e.key === "ArrowUp") {
              e.preventDefault(); clearHighlight();
              highlightIndex = Math.max(highlightIndex - 1, 0);
              visibleItems[highlightIndex].style.background = "#e8f0fe";
              visibleItems[highlightIndex].scrollIntoView({ block: "nearest" });
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (highlightIndex >= 0 && visibleItems[highlightIndex])
                visibleItems[highlightIndex].onmousedown(e);
            } else if (e.key === "Escape") { dropdown.style.display = "none"; }
          });

          wrapper.appendChild(input);
          wrapper.appendChild(dropdown);

          return {
            wrapper,
            input,
            getStorageName: () => input.dataset.storageName || "",
            getDisplayName: () => input.value,
            preselect: (storageName) => {
              const f = metadataFields.find(x => x.storageName === storageName);
              if (f) { selectItem(f); }
              else { input.value = storageName; input.dataset.storageName = storageName; }
            }
          };
        }

        // ── Slide toggle ───────────────────────────────────────────────────────────
        const FUNNEL_SVG = `<svg width="11" height="11" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 2h8L6 5.5V8.5L4 7.5V5.5L1 2z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" fill="none"/></svg>`;

        function makeSlideToggle(initialType, onChange) {
          const PILL_W = 34, PILL_H = 18, KNOB = 14;
          const wrap = el("div", {
            style: "display:flex;align-items:center;gap:5px;flex-shrink:0;cursor:pointer;user-select:none;"
          });

          const leftIcon = el("span", {
            style: "display:flex;align-items:center;opacity:0.55;flex-shrink:0;color:#3b82f6;",
            title: "Filter"
          });
          leftIcon.innerHTML = FUNNEL_SVG;

          const pill = el("div", {
            style: `position:relative;width:${PILL_W}px;height:${PILL_H}px;border-radius:999px;transition:background 0.22s;flex-shrink:0;`
          });
          const knob = el("div", {
            style: `position:absolute;top:${(PILL_H - KNOB) / 2}px;width:${KNOB}px;height:${KNOB}px;
              border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.25);transition:left 0.22s;`
          });
          pill.appendChild(knob);

          // Gold key emoji for right side
          const rightIcon = el("span", {
            style: "display:flex;align-items:center;flex-shrink:0;font-size:13px;line-height:1;",
            title: "Key"
          });
          rightIcon.textContent = "🔑";

          wrap.appendChild(leftIcon);
          wrap.appendChild(pill);
          wrap.appendChild(rightIcon);

          let current = initialType || "filter";
          let locked = false;

          const applyState = () => {
            if (current === "filter") {
              pill.style.background = locked ? "#93c5fd" : "#3b82f6";
              knob.style.left = "2px";
              leftIcon.style.opacity = "0.9";
              rightIcon.style.opacity = "0.35";
            } else {
              pill.style.background = locked ? "#fcd34d" : "#f59e0b";
              knob.style.left = `${PILL_W - KNOB - 2}px`;
              leftIcon.style.opacity = "0.35";
              rightIcon.style.opacity = "1";
            }
            wrap.style.cursor = locked ? "not-allowed" : "pointer";
            wrap.title = locked
              ? "Clear this field's value to change type"
              : current === "filter" ? "Filter — click to switch to Key" : "Key — click to switch to Filter";
          };

          wrap.addEventListener("click", () => {
            if (locked) return;
            current = current === "filter" ? "key" : "filter";
            applyState();
            if (onChange) onChange(current);
          });

          applyState();

          return {
            wrap,
            getType: () => current,
            setType: (t) => { current = t; applyState(); },
            lock: () => { locked = true; applyState(); },
            unlock: () => { locked = false; applyState(); }
          };
        }

        // ── AND label ──────────────────────────────────────────────────────────────
        // Left spacer mirrors: remove(28) + gap(8) + toggle(58) + gap(8) + fieldLabel(180) + gap(8) = 290px
        // AND then centers over the remaining flex:1 value input
        function makeAndLabel() {
          const wrap = el("div", {
            style: "display:flex;align-items:center;margin:0;height:16px;pointer-events:none;user-select:none;"
          });
          wrap.dataset.andLabel = "1";
          wrap.appendChild(el("div", { style: "flex:0 0 290px;" }));
          wrap.appendChild(el("div", {
            style: "flex:1;text-align:center;font-size:10px;font-weight:700;letter-spacing:2px;color:rgba(59,130,246,0.28);"
          }, "AND"));
          return wrap;
        }

        // ── Remove AND label adjacent to a row element ─────────────────────────────
        // Removes the AND label immediately before a row, or if none before, the one after
        function removeAdjacentAndLabel(rowEl) {
          const prev = rowEl.previousSibling;
          if (prev && prev.dataset && prev.dataset.andLabel) { prev.remove(); return; }
          const next = rowEl.nextSibling;
          if (next && next.dataset && next.dataset.andLabel) next.remove();
        }

        // ── Pane / carousel state ──────────────────────────────────────────────────
        const panes = [];
        let activePaneIndex = 0;
        let ghostPaneExists = false; // tracks whether the right peek pane is a real pane or ghost
        let carouselTrack, dotsRow, carouselViewport;

        // ── Build a row entry object (shared between filter and key zones) ─────────
        // Returns the entry; does NOT append to any container
        function buildRowEntry(storageName, initialType) {
          const entryObj = {
            rowEl: null,
            picker: null,
            valueInput: null,
            fieldLabelWrap: null,
            type: initialType,
            paneIndex: initialType === "key" ? -1 : 0,
            locked: false,
            toggle: null
          };

          const toggle = makeSlideToggle(initialType, (newType) => {
            entryObj.type = newType;
            entryObj.valueInput.placeholder = newType === "filter" ? FILTER_PLACEHOLDER : KEY_PLACEHOLDER;
            entryObj.valueInput.value = "";
            handleTypeChange(entryObj, newType);
          });
          entryObj.toggle = toggle;

          const removeBtn = el("button", {
            style: `width:22px;height:22px;border-radius:50%;border:1px solid #e5e7eb;background:#fff;
              color:#aaa;cursor:pointer;font-size:11px;flex-shrink:0;display:flex;align-items:center;
              justify-content:center;padding:0;align-self:center;`,
            title: "Remove this field"
          }, "✕");

          const fieldLabelWrap = el("div", {
            style: `flex:0 0 180px;padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;
              background:#f3f4f6;font-size:13px;color:#374151;white-space:nowrap;overflow:hidden;
              text-overflow:ellipsis;box-sizing:border-box;`
          });
          entryObj.fieldLabelWrap = fieldLabelWrap;

          const valueInput = el("input", {
            type: "text",
            placeholder: initialType === "filter" ? FILTER_PLACEHOLDER : KEY_PLACEHOLDER,
            style: "flex:1;min-width:0;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;"
          });
          entryObj.valueInput = valueInput;

          const picker = makeFieldPicker((f) => {
            fieldLabelWrap.textContent = f.displayName;
            fieldLabelWrap.title = f.displayName;
            // When a field is changed, sync the same storageName to all parallel panes
            syncFieldAcrossPanes(entryObj, f.storageName, f.displayName);
          });
          picker.wrapper.style.display = "none";
          entryObj.picker = picker;

          const checkLock = () => {
            const hasVal = valueInput.value.trim().length > 0;
            if (hasVal && panes.length > 1 && entryObj.type === "filter") {
              toggle.lock(); entryObj.locked = true;
            } else {
              toggle.unlock(); entryObj.locked = false;
            }
          };
          valueInput.addEventListener("input", checkLock);

          const rowEl = el("div", {
            style: "display:flex;gap:8px;align-items:center;margin:4px 0;opacity:1;transition:opacity 0.18s ease;"
          });
          rowEl.appendChild(removeBtn);
          rowEl.appendChild(toggle.wrap);
          rowEl.appendChild(fieldLabelWrap);
          rowEl.appendChild(valueInput);
          rowEl.appendChild(picker.wrapper);
          entryObj.rowEl = rowEl;

          removeBtn.onclick = async () => {
            await fadeOut(rowEl, 160);
            removeAdjacentAndLabel(rowEl);
            rowEl.remove();
            const idx = allRows.indexOf(entryObj);
            if (idx !== -1) allRows.splice(idx, 1);
            // Remove from pane rows list if applicable
            for (const pane of panes) {
              const pi = pane.rows.indexOf(entryObj);
              if (pi !== -1) pane.rows.splice(pi, 1);
            }
          };

          if (storageName) {
            picker.preselect(storageName);
            const f = metadataFields.find(x => x.storageName === storageName);
            fieldLabelWrap.textContent = f ? f.displayName : storageName;
            fieldLabelWrap.title = f ? f.displayName : storageName;
          }

          return entryObj;
        }

        // ── Sync field label across all parallel pane rows at the same position ────
        function syncFieldAcrossPanes(changedEntry, storageName, displayName) {
          if (changedEntry.type !== "filter") return;
          const sourcePane = panes.find(p => p.index === changedEntry.paneIndex);
          if (!sourcePane) return;
          const rowIndex = sourcePane.rows.indexOf(changedEntry);
          if (rowIndex === -1) return;
          for (const pane of panes) {
            if (pane.index === changedEntry.paneIndex) continue;
            const parallel = pane.rows[rowIndex];
            if (!parallel) continue;
            parallel.picker.preselect(storageName);
            parallel.fieldLabelWrap.textContent = displayName;
            parallel.fieldLabelWrap.title = displayName;
          }
        }

        // ── Handle type toggle: move row between zones with fade ───────────────────
        async function handleTypeChange(entryObj, newType) {
          await fadeOut(entryObj.rowEl, 160);

          if (newType === "key") {
            // Remove from pane
            removeAdjacentAndLabel(entryObj.rowEl);
            entryObj.rowEl.remove();
            for (const pane of panes) {
              const pi = pane.rows.indexOf(entryObj);
              if (pi !== -1) pane.rows.splice(pi, 1);
            }
            entryObj.paneIndex = -1;
            // Also remove the parallel rows in other panes at the same position
            // (field is now global, parallel pane rows would be orphaned)
            // We leave parallel pane rows in place but clear their storageName to avoid
            // duplicate filter collisions — safest behavior is to leave them as empty slots

            // Append to key zone
            keyRowsContainer.appendChild(entryObj.rowEl);
            const idx = allRows.indexOf(entryObj);
            if (idx === -1) allRows.push(entryObj);
            fadeIn(entryObj.rowEl, 180);

          } else {
            // Remove from key zone
            entryObj.rowEl.remove();
            const idx = allRows.indexOf(entryObj);
            if (idx !== -1) allRows.splice(idx, 1);
            entryObj.paneIndex = activePaneIndex;

            // Append to active pane
            const targetPane = panes[activePaneIndex];
            if (targetPane) {
              if (targetPane.rows.length > 0) {
                targetPane.rowsContainer.appendChild(makeAndLabel());
              }
              targetPane.rowsContainer.appendChild(entryObj.rowEl);
              targetPane.rows.push(entryObj);
              allRows.push(entryObj);
            }
            fadeIn(entryObj.rowEl, 180);
          }
        }

        // ── Pane builder ───────────────────────────────────────────────────────────
        function buildPaneEl(paneIndex) {
          const paneEl = el("div", {
            style: `background:#fff;border-radius:14px;border:1px solid rgba(59,130,246,0.18);
              padding:18px 20px 14px;box-sizing:border-box;flex-shrink:0;position:relative;
              box-shadow:0 2px 10px rgba(59,130,246,0.06);`
          });

          paneEl.appendChild(el("div", {
            style: "font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:14px;"
          }, "Search Filters"));

          const rowsContainer = el("div", {});
          paneEl.appendChild(rowsContainer);

          const addBtn = el("button", {
            style: "margin-top:12px;padding:6px 12px;border-radius:8px;border:1px solid #3b82f6;background:#fff;color:#3b82f6;cursor:pointer;font-size:12px;"
          }, "+ Add Filter");
          paneEl.appendChild(addBtn);

          // OR button — lives inside pane, slides with it, positioned on the right edge
          const orBtn = el("button", {
            style: `position:absolute;right:-20px;top:50%;transform:translateY(-50%);z-index:20;
              padding:7px 15px;border-radius:20px;border:0;
              background:linear-gradient(135deg,#2563eb,#3b82f6);
              color:#fff;font-size:12px;font-weight:700;cursor:pointer;
              box-shadow:0 3px 12px rgba(59,130,246,0.5);letter-spacing:1px;
              transition:box-shadow 0.2s;`
          }, "OR");
          orBtn.onmouseenter = () => { orBtn.style.boxShadow = "0 5px 18px rgba(59,130,246,0.7)"; };
          orBtn.onmouseleave = () => { orBtn.style.boxShadow = "0 3px 12px rgba(59,130,246,0.5)"; };
          orBtn.onclick = () => {
            const thisIndex = paneObj.index;
            if (thisIndex < panes.length - 1) {
              slideTo(thisIndex + 1);
            } else {
              activateNextPane();
            }
          };
          paneEl.appendChild(orBtn);

          const bottomLabel = el("div", {
            style: "text-align:center;font-size:11px;font-weight:600;color:#3b82f6;letter-spacing:1px;margin-top:16px;opacity:0.7;"
          }, `Search ${String.fromCharCode(65 + paneIndex)}`);
          paneEl.appendChild(bottomLabel);

          const paneObj = { el: paneEl, rowsContainer, addBtn, orBtn, rows: [], index: paneIndex, bottomLabel };

          addBtn.onclick = () => {
            if (paneObj.rows.length > 0) {
              paneObj.rowsContainer.appendChild(makeAndLabel());
            }
            const entry = buildRowEntry("", "filter");
            entry.paneIndex = paneObj.index;
            paneObj.rowsContainer.appendChild(entry.rowEl);
            paneObj.rows.push(entry);
            allRows.push(entry);
            fadeIn(entry.rowEl, 160);
          };

          return paneObj;
        }

        // Populate default filter rows into a pane
        function populatePaneDefaults(pane) {
          for (let i = 0; i < DEFAULT_FILTER_STORAGES.length; i++) {
            if (i > 0) pane.rowsContainer.appendChild(makeAndLabel());
            const sn = DEFAULT_FILTER_STORAGES[i];
            const entry = buildRowEntry(sn, "filter");
            entry.paneIndex = pane.index;
            pane.rows.push(entry);
            pane.rowsContainer.appendChild(entry.rowEl);
            allRows.push(entry);
          }
        }

        // ── Ghost pane (right peek illusion before user navigates) ─────────────────
        // The ghost pane is a visual-only placeholder with the same structure but no
        // registered rows. It becomes real when the user slides to it.
        let ghostPaneEl = null;

        function buildGhostPane() {
          const ghost = el("div", {
            style: `background:#fff;border-radius:14px;border:1px solid rgba(59,130,246,0.12);
              padding:18px 20px 14px;box-sizing:border-box;flex-shrink:0;position:relative;
              box-shadow:0 2px 10px rgba(59,130,246,0.04);opacity:0.6;pointer-events:none;`
          });
          ghost.appendChild(el("div", {
            style: "font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:14px;opacity:0.5;"
          }, "Search Filters"));
          // Skeleton rows
          for (let i = 0; i < 4; i++) {
            if (i > 0) {
              const al = makeAndLabel();
              al.style.opacity = "0.4";
              ghost.appendChild(al);
            }
            const skRow = el("div", {
              style: "display:flex;gap:8px;align-items:center;margin:4px 0;"
            });
            skRow.appendChild(el("div", { style: "width:22px;height:22px;border-radius:50%;background:#e5e7eb;" }));
            skRow.appendChild(el("div", { style: "width:58px;height:18px;border-radius:9px;background:#e5e7eb;" }));
            skRow.appendChild(el("div", { style: "flex:0 0 180px;height:32px;border-radius:6px;background:#f3f4f6;border:1px solid #e5e7eb;" }));
            skRow.appendChild(el("div", { style: "flex:1;height:32px;border-radius:6px;background:#f9fafb;border:1px solid #e5e7eb;" }));
            ghost.appendChild(skRow);
          }
          // OR button on ghost (right edge)
          const ghostOr = el("button", {
            style: `position:absolute;right:-20px;top:50%;transform:translateY(-50%);z-index:20;
              padding:7px 15px;border-radius:20px;border:0;
              background:linear-gradient(135deg,#2563eb,#3b82f6);
              color:#fff;font-size:12px;font-weight:700;cursor:pointer;
              box-shadow:0 3px 12px rgba(59,130,246,0.5);letter-spacing:1px;opacity:0.7;`
          }, "OR");
          ghostOr.style.pointerEvents = "auto";
          ghostOr.onclick = () => activateNextPane();
          ghost.appendChild(ghostOr);
          ghost.appendChild(el("div", {
            style: "text-align:center;font-size:11px;font-weight:600;color:#3b82f6;letter-spacing:1px;margin-top:16px;opacity:0.4;"
          }, `Search B`));
          return ghost;
        }

        // Activate the next pane: convert ghost to real pane or add new pane
        function activateNextPane() {
          if (ghostPaneEl && ghostPaneExists) {
            // Replace ghost with real pane
            const newPane = buildPaneEl(panes.length);
            populatePaneDefaults(newPane);
            panes.push(newPane);
            carouselTrack.replaceChild(newPane.el, ghostPaneEl);
            ghostPaneEl = null;
            ghostPaneExists = false;
            resizePanes();
            slideTo(newPane.index);
            updateDots();
            // Lock filter rows with values
            allRows.forEach(r => {
              if (r.type === "filter" && r.valueInput.value.trim() && r.toggle) {
                r.toggle.lock(); r.locked = true;
              }
            });
          } else if (!ghostPaneExists) {
            // Shouldn't normally reach here, but add pane directly if no ghost
            const newPane = buildPaneEl(panes.length);
            populatePaneDefaults(newPane);
            panes.push(newPane);
            carouselTrack.appendChild(newPane.el);
            resizePanes();
            slideTo(newPane.index);
            updateDots();
          }
        }

        // Deregister last pane if empty and user navigates back
        function maybeDeregisterEmptyTailPane() {
          if (panes.length <= 1) return;
          const lastPane = panes[panes.length - 1];
          if (lastPane.index === activePaneIndex) return;
          const hasAnyValue = lastPane.rows.some(r => r.valueInput.value.trim().length > 0);
          if (hasAnyValue) return;
          // Remove rows from allRows
          for (const r of lastPane.rows) {
            const idx = allRows.indexOf(r);
            if (idx !== -1) allRows.splice(idx, 1);
          }
          // Replace with ghost
          ghostPaneEl = buildGhostPane();
          ghostPaneExists = true;
          carouselTrack.replaceChild(ghostPaneEl, lastPane.el);
          panes.splice(panes.length - 1, 1);
          resizePanes();
          updateDots();
          // Unlock filter rows since we're back to 1 real pane
          if (panes.length === 1) {
            allRows.forEach(r => {
              if (r.type === "filter" && r.toggle) { r.toggle.unlock(); r.locked = false; }
            });
          }
        }

        // ── Carousel sizing and slide ──────────────────────────────────────────────
        const PEEK = 80;  // px of adjacent pane visible
        const GAP = 14;

        const getPaneWidth = () => {
          if (!carouselViewport) return 900;
          return carouselViewport.offsetWidth - PEEK - GAP;
        };

        const resizePanes = () => {
          if (!carouselViewport) return;
          const paneW = getPaneWidth();
          // Size all real panes
          for (const p of panes) {
            p.el.style.width = `${paneW}px`;
            p.el.style.minWidth = `${paneW}px`;
            p.el.style.marginRight = `${GAP}px`;
          }
          // Size ghost if present
          if (ghostPaneEl) {
            ghostPaneEl.style.width = `${paneW}px`;
            ghostPaneEl.style.minWidth = `${paneW}px`;
            ghostPaneEl.style.marginRight = `${GAP}px`;
          }
          slideTo(activePaneIndex);
        };

        const updateDots = () => {
          if (!dotsRow) return;
          dotsRow.innerHTML = "";
          for (let i = 0; i < panes.length; i++) {
            const dot = el("div", {
              style: `width:8px;height:8px;border-radius:50%;cursor:pointer;
                background:${i === activePaneIndex ? "#3b82f6" : "#d1d5db"};transition:background 0.2s;`,
              title: `Search ${String.fromCharCode(65 + i)}`
            });
            dot.onclick = () => slideTo(i);
            dotsRow.appendChild(dot);
          }
        };

        const slideTo = (index) => {
          if (index < 0) return;
          const realMax = panes.length - 1;
          // Allow sliding to ghost position (realMax + 1 conceptually, but ghost is in track)
          const maxSlide = ghostPaneExists ? panes.length : realMax;
          if (index > maxSlide) return;

          const prevIndex = activePaneIndex;
          activePaneIndex = Math.min(index, realMax);

          const paneW = getPaneWidth();
          carouselTrack.style.transform = `translateX(-${index * (paneW + GAP)}px)`;

          // Left fade visibility
          if (fadeMaskLeft) fadeMaskLeft.style.opacity = index > 0 ? "1" : "0";

          updateDots();

          // If user slid back and last real pane is now off-screen and empty, deregister it
          if (index < prevIndex) {
            setTimeout(() => maybeDeregisterEmptyTailPane(), 420);
          }

          // Recheck locks
          allRows.forEach(r => {
            if (r.type === "filter" && r.toggle) {
              const hasVal = r.valueInput.value.trim().length > 0;
              if (hasVal && panes.length > 1) { r.toggle.lock(); r.locked = true; }
              else { r.toggle.unlock(); r.locked = false; }
            }
          });
        };

        // ── Key zone container (declared here, populated later) ────────────────────
        let keyRowsContainer;

        function makeKeyRow(storageName) {
          const entry = buildRowEntry(storageName, "key");
          entry.paneIndex = -1;
          keyRowsContainer.appendChild(entry.rowEl);
          allRows.push(entry);
          return entry;
        }

        // ── Modal construction ─────────────────────────────────────────────────────
        const modal = el("div", {
          style: `position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999999;
            display:flex;align-items:center;justify-content:center;
            font-family:Segoe UI,Arial,sans-serif;`
        });

        const stickyClose = el("button", {
          style: `position:fixed;top:20px;right:20px;z-index:1000000;border:0;
            background:rgba(30,30,30,.75);color:#fff;width:32px;height:32px;
            border-radius:50%;font-size:16px;cursor:pointer;display:flex;
            align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4);`
        }, "✕");
        stickyClose.onclick = () => { modal.remove(); stickyClose.remove(); };

        const card = el("div", {
          style: `background:#f8fafc;width:1080px;max-height:90vh;overflow:auto;
            border-radius:14px;padding:18px 18px 22px;box-shadow:0 10px 30px rgba(0,0,0,.35);`
        });

        card.appendChild(el("div", { style: "font-size:18px;font-weight:600;margin-bottom:4px;" }, "Nexidia Search"));
        card.appendChild(hr());
        card.appendChild(section("Date Range"));

        const today = new Date();
        const monthAgo = new Date(today);
        monthAgo.setMonth(today.getMonth() - 1);
        const fromDate = field("From", "date", "");
        const toDate = field("To", "date", "");
        fromDate.input.valueAsDate = monthAgo;
        toDate.input.valueAsDate = today;
        card.appendChild(
          el("div", { style: "display:flex;gap:10px;align-items:flex-end;margin:8px 0;flex-wrap:wrap;" },
            fromDate.wrap, toDate.wrap)
        );
        card.appendChild(hr());

        // ── Carousel section ───────────────────────────────────────────────────────
        const carouselSection = el("div", { style: "margin:0;" });
        const carouselOuter = el("div", { style: "position:relative;" });

        carouselViewport = el("div", { style: "overflow:hidden;border-radius:14px;position:relative;" });

        let fadeMaskLeft = el("div", {
          style: `position:absolute;top:0;left:0;bottom:0;width:55px;
            background:linear-gradient(to right,rgba(248,250,252,0.97),rgba(248,250,252,0));
            z-index:6;pointer-events:none;opacity:0;transition:opacity 0.3s;`
        });

        const fadeMaskRight = el("div", {
          style: `position:absolute;top:0;right:0;bottom:0;width:${PEEK + 10}px;
            background:linear-gradient(to left,rgba(248,250,252,0.55),rgba(248,250,252,0));
            z-index:6;pointer-events:auto;cursor:pointer;`
        });
        fadeMaskRight.onclick = () => {
          if (activePaneIndex < panes.length - 1) slideTo(activePaneIndex + 1);
          else activateNextPane();
        };

        fadeMaskLeft.style.pointerEvents = "auto";
        fadeMaskLeft.style.cursor = "pointer";
        fadeMaskLeft.onclick = () => { if (activePaneIndex > 0) slideTo(activePaneIndex - 1); };

        carouselTrack = el("div", {
          style: "display:flex;flex-direction:row;transition:transform 0.4s cubic-bezier(0.4,0,0.2,1);will-change:transform;"
        });

        carouselViewport.appendChild(fadeMaskLeft);
        carouselViewport.appendChild(fadeMaskRight);
        carouselViewport.appendChild(carouselTrack);
        carouselOuter.appendChild(carouselViewport);

        dotsRow = el("div", { style: "display:flex;justify-content:center;gap:6px;margin-top:10px;" });

        carouselSection.appendChild(carouselOuter);
        carouselSection.appendChild(dotsRow);
        card.appendChild(carouselSection);

        // Build first real pane
        const firstPane = buildPaneEl(0);
        populatePaneDefaults(firstPane);
        panes.push(firstPane);
        carouselTrack.appendChild(firstPane.el);

        // Append ghost pane for right peek illusion
        ghostPaneEl = buildGhostPane();
        ghostPaneExists = true;
        carouselTrack.appendChild(ghostPaneEl);

        card.appendChild(hr());

        // ── Key Fields section ─────────────────────────────────────────────────────
        const keySection = el("div", {
          style: `background:rgba(240,253,244,0.85);border:1px solid rgba(34,197,94,0.22);
            border-radius:14px;padding:16px 20px 14px;margin-bottom:14px;`
        });

        const keyHeaderRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:6px;" });
        keyHeaderRow.appendChild(el("span", { style: "font-size:16px;" }, "🔑"));
        keyHeaderRow.appendChild(el("span", { style: "font-size:16px;font-weight:700;color:#1e3a5f;" }, "Search Keys"));
        keyHeaderRow.appendChild(el("span", { style: "font-size:12px;color:#6b7280;font-style:italic;" }, "Multiple values accepted in any field."));
        keySection.appendChild(keyHeaderRow);

        keyRowsContainer = el("div", {});
        keySection.appendChild(keyRowsContainer);

        const addKeyBtn = el("button", {
          style: "margin-top:10px;padding:6px 12px;border-radius:8px;border:1px solid #22c55e;background:#fff;color:#22c55e;cursor:pointer;font-size:12px;"
        }, "+ Add Key Field");
        addKeyBtn.onclick = () => { const e = makeKeyRow(""); fadeIn(e.rowEl, 160); };
        keySection.appendChild(addKeyBtn);

        card.appendChild(keySection);
        card.appendChild(hr());

        // ── Phrase Search ──────────────────────────────────────────────────────────
        card.appendChild(section("Phrase Search (Each line = separate search)"));
        const searchesWrap = el("div", {});
        card.appendChild(searchesWrap);
        const searches = [];

        const createSearchBlock = (n) => {
          const box = el("div", {
            style: "border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin:10px 0;background:#fafafa;"
          });
          box.appendChild(el("div", { style: "font-weight:600;margin-bottom:8px;" }, `Search ${n}`));
          const p1 = textareaField("Phrase(s) — each line runs as its own search", KEY_PLACEHOLDER, 4);
          const a2 = textareaField("AND Phrase 2 (optional)", KEY_PLACEHOLDER, 2);
          const a3 = textareaField("AND Phrase 3 (optional)", KEY_PLACEHOLDER, 2);
          box.appendChild(el("div", { style: "display:flex;gap:10px;align-items:flex-end;margin:8px 0;flex-wrap:wrap;" }, p1.wrap));
          box.appendChild(el("div", { style: "display:flex;gap:10px;align-items:flex-end;margin:8px 0;flex-wrap:wrap;" }, a2.wrap, a3.wrap));
          return { box, p1, a2, a3 };
        };

        const addSearchBtn = el("button", {
          style: "margin-top:6px;padding:8px 12px;border-radius:8px;border:1px solid #0a66c2;background:#fff;color:#0a66c2;cursor:pointer;"
        }, "Add Another Search");
        addSearchBtn.onclick = () => {
          if (searches.length >= 20) return alert("Max 20 search blocks.");
          const b = createSearchBlock(searches.length + 1);
          searches.push(b);
          searchesWrap.appendChild(b.box);
        };

        const firstSearch = createSearchBlock(1);
        searches.push(firstSearch);
        searchesWrap.appendChild(firstSearch.box);
        card.appendChild(addSearchBtn);
        card.appendChild(hr());

        const runBtn = el("button", {
          style: "padding:10px 16px;border-radius:8px;border:0;background:#0a66c2;color:#fff;font-size:15px;cursor:pointer;"
        }, "Run");
        const cancelBtn = el("button", {
          style: "padding:10px 16px;border-radius:8px;border:1px solid #bbb;background:#fff;color:#333;font-size:15px;cursor:pointer;"
        }, "Cancel");
        cancelBtn.onclick = () => { modal.remove(); stickyClose.remove(); };
        card.appendChild(
          el("div", { style: "display:flex;gap:10px;align-items:flex-end;margin:8px 0;flex-wrap:wrap;" },
            runBtn, cancelBtn)
        );

        modal.appendChild(card);
        document.body.appendChild(modal);
        document.body.appendChild(stickyClose);

        // Init after DOM insertion
        requestAnimationFrame(() => {
          resizePanes();
          for (const sn of DEFAULT_KEY_LIST) makeKeyRow(sn);
          updateDots();
        });

        window.addEventListener("resize", resizePanes);

        // ── Normalization helpers (unchanged) ──────────────────────────────────────
        const splitValues = (raw) =>
          String(raw || "")
            .replace(/\r\n/g, "\n").replace(/\t/g, "\n")
            .split(/[\n,]+/).map(s => s.trim()).filter(Boolean);

        const isoStart = (d) => `${d}T00:00:00Z`;
        const isoEnd = (d) => `${d}T23:59:59Z`;

        const KEY_TRANSLATIONS = new Map([
          ["overallsentimentscore", "sentimentScore"],
          ["recordeddate", "recordedDateTime"],
          ["mediafileduration", "mediaFileDuration"],
          ["udfint4", "UDFInt4"],
          ["experienceid", "experienceId"],
          ["sitename", "siteName"],
          ["site", "siteName"],
          ["supervisor", "supervisorName"],
          ["supervisorname", "supervisorName"],
          ["primaryintentcategory", "primaryIntentCategory"],
          ["primaryintenttopic", "primaryIntentTopic"],
          ["primaryintentropic", "primaryIntentTopic"],
          ["primaryintentsubtopic", "primaryIntentSubtopic"],
          ["agentname", "agentName"]
        ]);

        const normalizeFieldKeyForExplore = (k) => {
          const raw = String(k || "").trim();
          if (!raw) return "";
          let out = raw
            .replace(/^UDFvarchar/i, "UDFVarchar")
            .replace(/^UDFnumeric/i, "UDFNumeric")
            .replace(/^UDFint/i, "UDFInt");
          const lower = out.toLowerCase();
          if (KEY_TRANSLATIONS.has(lower)) out = KEY_TRANSLATIONS.get(lower);
          return out;
        };

        const normalizeParamName = (p) => {
          if (!p) return p;
          const s = String(p).trim();
          if (s.toLowerCase() === "experienceid") return "ExperienceId";
          if (s.toLowerCase() === "site") return "Site";
          if (s.toLowerCase() === "dnis") return "DNIS";
          const m = s.match(/udfvarchar(\d+)/i);
          if (m) return `UDFVarchar${m[1]}`;
          return s;
        };

        const normalizeKeywordValues = (paramName, values) => {
          const pn = normalizeParamName(paramName);
          if (pn === "UDFVarchar120") return values.map(v => String(v).toLowerCase());
          return values;
        };

        const buildKeywordFilter = (paramName, values) => ({
          operator: "IN", type: "KEYWORD",
          parameterName: normalizeParamName(paramName),
          value: normalizeKeywordValues(paramName, values)
        });

        const buildTextFilter = (phrase) => ({
          operator: "IN", type: "TEXT", parameterName: "transcript",
          value: { phrases: [phrase], anotherPhrases: [], relevance: "Anywhere", position: "Begin" }
        });

        const safeRead = async (res) => {
          const ct = (res.headers.get("content-type") || "").toLowerCase();
          const text = await res.text();
          if (ct.includes("application/json")) {
            try { return { json: JSON.parse(text), text }; } catch { return { json: null, text }; }
          }
          return { json: null, text };
        };

        const pickRows = (json) => {
          if (!json) return [];
          if (Array.isArray(json.results)) return json.results;
          if (Array.isArray(json.items)) return json.items;
          if (Array.isArray(json.rows)) return json.rows;
          if (Array.isArray(json.data)) return json.data;
          if (json.result && Array.isArray(json.result.results)) return json.result.results;
          return [];
        };

        const buildRowKeyIndex = (rowObj) => {
          const idx = Object.create(null);
          if (!rowObj || typeof rowObj !== "object") return idx;
          for (const k of Object.keys(rowObj)) idx[k.toLowerCase()] = k;
          return idx;
        };

        const getFieldValue = (rowObj, key) => {
          if (!rowObj) return "";
          const want = String(key || "");
          if (!want) return "";
          if (rowObj[want] !== undefined && rowObj[want] !== null) return String(rowObj[want]);
          const idx = buildRowKeyIndex(rowObj);
          const actual = idx[want.toLowerCase()];
          if (actual && rowObj[actual] !== undefined && rowObj[actual] !== null) return String(rowObj[actual]);
          const containers = [rowObj.fields, rowObj.values, rowObj.data];
          for (const c of containers) {
            if (!c || typeof c !== "object") continue;
            if (c[want] !== undefined && c[want] !== null) return String(c[want]);
            const cidx = buildRowKeyIndex(c);
            const cactual = cidx[want.toLowerCase()];
            if (cactual && c[cactual] !== undefined && c[cactual] !== null) return String(c[cactual]);
          }
          return "";
        };

        function getAppInstanceIdFromCurrentPageSource() {
          const scripts = document.querySelectorAll("script");
          for (let i = 0; i < scripts.length; i++) {
            const t = scripts[i].textContent || "";
            const m = t.match(/"appInstanceId"\s*:\s*"([^"]+)"/);
            if (m) return m[1];
          }
          return null;
        }

        async function getAppInstanceIdViaPageFetch() {
          const res = await fetch(location.href, { credentials: "include", cache: "no-store" });
          if (!res.ok) throw new Error("Page fetch failed: " + res.status);
          const html = await res.text();
          const m = html.match(/"appInstanceId"\s*:\s*"([^"]+)"/);
          if (m) return m[1];
          throw new Error("appInstanceId not found in page HTML");
        }

        async function getAppInstanceIdViaForensicFetch() {
          const res = await fetch(LEGACY_FORMS_URL, { credentials: "include", cache: "no-store" });
          if (!res.ok) throw new Error("ForensicSearch fetch failed: " + res.status);
          const html = await res.text();
          const m = html.match(/"appInstanceId"\s*:\s*"([^"]+)"/);
          if (m) return m[1];
          throw new Error("appInstanceId not found in ForensicSearch HTML");
        }

        async function getAppInstanceId() {
          const fromPage = getAppInstanceIdFromCurrentPageSource();
          if (fromPage) return fromPage;
          try { return await getAppInstanceIdViaPageFetch(); } catch (_) {}
          try { return await getAppInstanceIdViaForensicFetch(); } catch (_) {}
          throw new Error("Could not determine appInstanceId from any source.");
        }

//##> LEGACY COLUMN PREFERENCES: This function fetches the user's saved column layout from
//##> the Nexidia legacy UI via SettingsDialog.aspx and a hidden input (ctl10). This is
//##> intentionally separate from the Explore API and metadata endpoint used everywhere else.
//##> The legacy system uses different field key names that require translation via
//##> KEY_TRANSLATIONS and normalizeFieldKeyForExplore before they can be used in Explore
//##> API calls. This feature exists so that each user's output matches their own saved column
//##> format without any manual configuration. This behavior must survive all future changes.
//##> The appInstanceId retrieval, KEY_TRANSLATIONS map, and normalizeFieldKeyForExplore
//##> function are all load-bearing for this feature and must not be removed or simplified.
        async function getLegacyChosenColumns(appInstanceId) {
          const res = await fetch(SETTINGS_URL(appInstanceId), { credentials: "include" });
          if (!res.ok) throw new Error("SettingsDialog fetch failed");
          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, "text/html");
          const ctl10 =
            doc.querySelector('input[name="ctl10"]')?.getAttribute("value") ||
            doc.querySelector('input[name="ctl10"]')?.value || "";
          if (!ctl10) throw new Error("ctl10 not found in SettingsDialog response.");
          const pairsRaw = ctl10.split(",")
            .map(s => s.split("\n")).filter(p => p.length >= 2)
            .map(([label, key]) => ({ label, key }));
          const fields = [], headers = [];
          const seen = new Set();
          for (const p of pairsRaw) {
            const nk = normalizeFieldKeyForExplore(p.key.trim());
            if (!nk || seen.has(nk)) continue;
            seen.add(nk);
            fields.push(nk);
            headers.push(p.label);
          }
          return { fields, headers };
        }

        const quote = (s) => `"${String(s).replace(/"/g, '""')}"`;
        const buildPhraseDisplay = (basePhrase, andPhrases) => {
          const parts = [quote(basePhrase)];
          for (const p of (andPhrases || [])) {
            const t = String(p || "").trim();
            if (t) parts.push(quote(t));
          }
          return parts.join(" AND ");
        };

        const escapeHtml = (s) => String(s ?? "")
          .replace(/&/g, "&amp;").replace(/</g, "&lt;")
          .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

        const excelSerialFromDate = (d) => {
          if (!(d instanceof Date) || isNaN(d.getTime())) return null;
          return (d.getTime() / 86400000) + 25569;
        };

        const toNumberOrNull = (raw) => {
          const s = String(raw ?? "").trim();
          if (!s) return null;
          const n = Number(s);
          return isFinite(n) ? n : null;
        };

        const secondsFromMillisish = (raw) => {
          const n = toNumberOrNull(raw);
          if (n === null) return null;
          if (n >= 1000 && n % 1000 === 0) return n / 1000;
          if (n > 86400 * 1000) return Math.round(n / 1000);
          return n;
        };

        const excelSerialFromSeconds = (sec) => {
          const n = Number(sec);
          return isFinite(n) ? n / 86400 : null;
        };

        const downloadExcelFile = (filename, html) => {
          const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = filename;
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
        };

        const normalizeCellText = (raw) => {
          let s = (raw === null || raw === undefined) ? "" : String(raw);
          s = s.trim();
          if (!s || s.includes("*") || /^0+$/.test(s)) return "0";
          return s;
        };

        const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

        const estimateDisplayLen = (fieldKey, rawText) => {
          const lk = String(fieldKey || "").toLowerCase();
          if (lk === "recordeddatetime") return 16;
          if (lk === "mediafileduration") return 8;
          if (lk === "udfint4") return 6;
          if (lk === "sentimentscore" || lk === "overallsentimentscore") return 6;
          return clamp(String(rawText ?? "").length, 1, 60);
        };

        const buildColGroup = (headers, rows, exportFields) => {
          const maxLens = headers.map(h => String(h ?? "").length);
          for (const rr of rows) {
            const phrases = rr.phrases || [];
            for (let c = 0; c < exportFields.length; c++) {
              const k = exportFields[c];
              const rawText = k.startsWith("__PHRASE_")
                ? normalizeCellText(phrases[parseInt(k.replace(/\D/g, ""), 10) - 1] || "0")
                : normalizeCellText(getFieldValue(rr.row, k));
              maxLens[c] = Math.max(maxLens[c] || 10, estimateDisplayLen(k, rawText));
            }
          }
          return `<colgroup>${maxLens.map(len =>
            `<col style="width:${clamp(Math.round(len * 6.2 + 18), 50, 520)}px">`
          ).join("")}</colgroup>`;
        };

        // ── Run ────────────────────────────────────────────────────────────────────
        runBtn.onclick = async () => {
          try {
            const fromVal = fromDate.input.value;
            const toVal = toDate.input.value;
            if (!fromVal || !toVal) { alert("Please select both From and To dates."); return; }

            // Global key filters
            const globalKeyFilters = [];
            for (const entry of allRows) {
              if (entry.type !== "key") continue;
              const sn = entry.picker.getStorageName();
              const val = entry.valueInput.value.trim();
              if (!sn || !val) continue;
              globalKeyFilters.push(buildKeywordFilter(sn, splitValues(val)));
            }

            // Per-pane filter sets
            const paneFilterSets = panes.map(pane => {
              const filters = [];
              for (const entry of allRows) {
                if (entry.type !== "filter" || entry.paneIndex !== pane.index) continue;
                const sn = entry.picker.getStorageName();
                const val = entry.valueInput.value.trim();
                if (!sn || !val) continue;
                filters.push(buildKeywordFilter(sn, splitValues(val)));
              }
              return filters;
            });

            const anyFilters = paneFilterSets.some(f => f.length > 0) || globalKeyFilters.length > 0;
            if (!anyFilters) {
              const ok = confirm("No filters added. Data will be pulled from the entire UMR dataset. Do you want to proceed?");
              if (!ok) return;
            }

            // Phrase expansion (optional)
            const expandedSearches = [];
            for (const s of searches) {
              const baseLines = splitValues(s.p1.input.value);
              if (!baseLines.length) continue;
              const and2 = splitValues(s.a2.input.value)[0] || "";
              const and3 = splitValues(s.a3.input.value)[0] || "";
              const andPhrases = [and2, and3].filter(Boolean);
              for (const basePhrase of baseLines) {
                const phraseDisplay = buildPhraseDisplay(basePhrase, andPhrases);
                const phraseFilters = [buildTextFilter(basePhrase), ...andPhrases.map(buildTextFilter)];
                expandedSearches.push({
                  phraseDisplay,
                  phraseGroup: phraseFilters.length === 1
                    ? phraseFilters[0]
                    : { operator: "AND", invertOperator: false, filters: phraseFilters }
                });
              }
            }

            const dateFilter = {
              parameterName: "recordedDateTime", operator: "BETWEEN", type: "DATE",
              value: { firstValue: isoStart(fromVal), secondValue: isoEnd(toVal) }
            };

            modal.remove();
            stickyClose.remove();
            progressUI.show();
            progressUI.set("Preparing export fields...", 5, "");

            let baseHeaders = ["Trans_Id"];
            let baseFields = ["UDFVarchar110"];
            try {
              progressUI.set("Loading column preferences...", 10, "Scanning page for appInstanceId");
              const appInstanceId = await getAppInstanceId();
              const prefs = await getLegacyChosenColumns(appInstanceId);
              if (prefs.fields?.length) {
                baseFields = [...prefs.fields];
                baseHeaders = [...prefs.headers];
                if (!baseFields.includes("UDFVarchar110")) {
                  baseFields.push("UDFVarchar110");
                  baseHeaders.push("Trans_Id");
                }
              }
              progressUI.set("Column preferences loaded.", 18, `Fields: ${baseFields.length}`);
            } catch (e) {
              console.warn("Column preferences unavailable, using defaults.", e);
              baseFields = [
                "agentName", "UDFVarchar10", "recordedDateTime", "mediaFileDuration",
                "UDFInt4", "sentimentScore", "experienceId", "supervisorName", "siteName",
                "primaryIntentCategory", "primaryIntentTopic", "primaryIntentSubtopic",
                "UDFVarchar8", "MinimumSentimentScore", "MaximumSentimentScore", "UDFVarchar110"
              ];
              baseHeaders = [
                "Agent", "Group ID (Policy ID)", "Date/Time", "Duration", "Hold Time",
                "Sentiment", "Experience Id", "Supervisor", "Site",
                "Contact Reason Level 1", "Contact Reason Level 2", "Contact Reason Level 3",
                "End Reason", "Min Sentiment", "Max Sentiment", "Trans_Id"
              ];
              progressUI.set("Using default export fields.", 18, `Fields: ${baseFields.length}`);
            }

            // Build run sets: per pane x per phrase (phrases optional)
            const runSets = [];
            for (let pi = 0; pi < panes.length; pi++) {
              const combined = [...paneFilterSets[pi], ...globalKeyFilters];
              const keywordGroup = combined.length
                ? { operator: "AND", invertOperator: false, filters: combined }
                : null;
              if (expandedSearches.length > 0) {
                for (const es of expandedSearches) {
                  runSets.push({ paneIndex: pi, keywordGroup, phraseDisplay: es.phraseDisplay, phraseGroup: es.phraseGroup });
                }
              } else {
                runSets.push({ paneIndex: pi, keywordGroup, phraseDisplay: null, phraseGroup: null });
              }
            }

            const totalRuns = runSets.length;
            const merged = new Map();
            const passthroughNoKey = [];
            let totalFetched = 0;

            for (let si = 0; si < runSets.length; si++) {
              const { paneIndex, keywordGroup, phraseDisplay, phraseGroup } = runSets[si];
              const runLabel = panes.length > 1
                ? `Pane ${paneIndex + 1}, run ${si + 1}/${totalRuns}`
                : `Run ${si + 1}/${totalRuns}`;
              progressUI.set(`Searching (${runLabel})...`, 25, "Starting");

              const setRows = [];
              let from = 0;
              while (true) {
                const interactionFilters = [
                  ...(keywordGroup ? [keywordGroup] : []),
                  ...(phraseGroup ? [phraseGroup] : []),
                  dateFilter
                ];
                const payload = {
                  languageFilter: { languages: [] },
                  namedSetId: null,
                  from, to: from + PAGE_SIZE,
                  fields: baseFields,
                  query: {
                    operator: "AND", invertOperator: false,
                    filters: [{
                      operator: "AND", invertOperator: false,
                      filterType: "interactions",
                      filters: interactionFilters
                    }]
                  }
                };
                const res = await fetch(SEARCH_URL, {
                  method: "POST", credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload)
                });
                if (!res.ok) {
                  const { text } = await safeRead(res);
                  const err = new Error(`Search failed: HTTP ${res.status}`);
                  err.__httpStatus = res.status; err.__body = text;
                  throw err;
                }
                const { json } = await safeRead(res);
                const rows = pickRows(json);
                if (!rows.length) break;
                setRows.push(...rows);
                totalFetched += rows.length;
                progressUI.set(
                  `Searching (${runLabel})...`,
                  Math.min(80, 25 + Math.floor((si / Math.max(1, totalRuns)) * 55)),
                  `Set: ${setRows.length} | Total: ${totalFetched}`
                );
                if (setRows.length >= MAX_ROWS || rows.length < PAGE_SIZE) break;
                from += PAGE_SIZE;
                await sleep(250);
              }

              const label = phraseDisplay || `Search ${String.fromCharCode(65 + paneIndex)}`;
              for (const r of setRows) {
                const transId = normalizeCellText(getFieldValue(r, "UDFVarchar110"));
                if (!transId || transId === "0") {
                  passthroughNoKey.push({ row: r, phrases: [label] });
                  continue;
                }
                const existing = merged.get(transId);
                if (!existing) {
                  merged.set(transId, { row: r, phrases: [label] });
                } else {
                  if (!existing.phrases.includes(label)) existing.phrases.push(label);
                  for (const k of baseFields) {
                    const cur = normalizeCellText(getFieldValue(existing.row, k));
                    if (cur && cur !== "0") continue;
                    const nxt = normalizeCellText(getFieldValue(r, k));
                    if (!nxt || nxt === "0") continue;
                    existing.row[k] = nxt;
                  }
                }
              }
            }

            const finalRows = [];
            let maxPhraseCols = 1;
            for (const [, v] of merged.entries()) {
              if (v.phrases.length > maxPhraseCols) maxPhraseCols = v.phrases.length;
              finalRows.push(v);
            }
            for (const p of passthroughNoKey) {
              if (p.phrases.length > maxPhraseCols) maxPhraseCols = p.phrases.length;
              finalRows.push(p);
            }

            if (!finalRows.length) {
              progressUI.set("No results returned.", 100, "");
              alert("No results returned.");
              return;
            }

            progressUI.set("Building Excel export...", 85, `Rows: ${finalRows.length}`);

            const phraseHeaders = [];
            const phraseKeys = [];
            for (let i = 1; i <= maxPhraseCols; i++) {
              phraseHeaders.push(i === 1 ? "Phrase Search" : `Phrase Search${i}`);
              phraseKeys.push(`__PHRASE_${i}__`);
            }

            const exportHeaders = [...phraseHeaders, ...baseHeaders];
            const exportFields = [...phraseKeys, ...baseFields];

            const isDateTimeField = (k) => String(k || "").toLowerCase() === "recordeddatetime";
            const isDurationField = (k) => String(k || "").toLowerCase() === "mediafileduration";
            const isHoldField = (k) => String(k || "").toLowerCase() === "udfint4";
            const isSentimentField = (k) => String(k || "").toLowerCase() === "sentimentscore";

            const css = `
              table{border-collapse:collapse}
              td,th{border:none;padding:4px 6px;font-family:"Aptos Narrow","Aptos",Calibri,Arial,sans-serif;
                font-size:10pt;text-align:left;vertical-align:bottom;white-space:nowrap;mso-number-format:"\\@"}
              th{font-weight:700;background:transparent}
              .txt{mso-number-format:"\\@"}
              .dt{mso-number-format:"${FIXED_DT_FORMAT}"}
              .dur{mso-number-format:"${FIXED_DURATION_FORMAT}"}
              .int{mso-number-format:"0"}
              .dec2{mso-number-format:"0.00"}
            `.trim();

            const colGroup = buildColGroup(exportHeaders, finalRows, exportFields);
            const headerCells = exportHeaders.map(h => `<th class="txt">${escapeHtml(h)}</th>`).join("");

            const bodyRows = finalRows.map(({ row: r, phrases }) => {
              const tds = exportFields.map(k => {
                if (k.startsWith("__PHRASE_")) {
                  const idx = parseInt(k.replace(/\D/g, ""), 10) - 1;
                  const val = normalizeCellText(phrases && phrases[idx] ? phrases[idx] : "0");
                  return `<td class="txt" x:str="${escapeHtml(val)}">${escapeHtml(val)}</td>`;
                }
                const raw = normalizeCellText(getFieldValue(r, k));
                if (isDateTimeField(k)) {
                  if (raw === "0") return `<td class="dt" x:num="0">0</td>`;
                  const serial = excelSerialFromDate(new Date(raw));
                  if (serial === null) return `<td class="txt" x:str="${escapeHtml(raw)}">${escapeHtml(raw)}</td>`;
                  return `<td class="dt" x:num="${serial}">${serial}</td>`;
                }
                if (isDurationField(k)) {
                  if (raw === "0") return `<td class="dur" x:num="0">0</td>`;
                  const sec = secondsFromMillisish(raw);
                  const serial = sec === null ? null : excelSerialFromSeconds(sec);
                  if (serial === null) return `<td class="txt" x:str="${escapeHtml(raw)}">${escapeHtml(raw)}</td>`;
                  return `<td class="dur" x:num="${serial}">${serial}</td>`;
                }
                if (isHoldField(k)) {
                  if (raw === "0") return `<td class="int" x:num="0">0</td>`;
                  const sec = secondsFromMillisish(raw);
                  if (sec === null) return `<td class="int" x:num="0">0</td>`;
                  const n = String(Math.round(sec));
                  return `<td class="int" x:num="${n}">${n}</td>`;
                }
                if (isSentimentField(k)) {
                  if (raw === "0") return `<td class="dec2" x:num="0">0</td>`;
                  const n0 = toNumberOrNull(raw);
                  if (n0 === null) return `<td class="txt" x:str="${escapeHtml(raw)}">${escapeHtml(raw)}</td>`;
                  return `<td class="dec2" x:num="${n0}">${n0}</td>`;
                }
                const n0 = toNumberOrNull(raw);
                if (n0 !== null && raw !== "0" && /^[+-]?\d+(\.\d+)?$/.test(raw)) {
                  if (Number.isInteger(n0)) return `<td class="int" x:num="${n0}">${n0}</td>`;
                  return `<td class="dec2" x:num="${n0}">${n0}</td>`;
                }
                return `<td class="txt" x:str="${escapeHtml(raw)}">${escapeHtml(raw)}</td>`;
              }).join("");
              return `<tr>${tds}</tr>`;
            }).join("\n");

            const htmlOut = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:x="urn:schemas-microsoft-com:office:excel"
              xmlns="http://www.w3.org/TR/REC-html40">
              <head><meta charset="utf-8"/><style>${css}</style></head>
              <body><table>${colGroup}<tr>${headerCells}</tr>${bodyRows}</table></body>
              </html>`;

            const stamp = new Date().toISOString().replace(/[:]/g, "-").replace(/\..+$/, "");
            const filename = `nexidia_search_export_${stamp}.xls`;
            progressUI.set("Downloading...", 95, filename);
            downloadExcelFile(filename, htmlOut);
            progressUI.set("Done.", 100, `Exported ${finalRows.length} rows`);

          } catch (err) {
            console.error(err);
            try { progressUI.remove(); } catch (_) {}
            alert("Failed to run. Make sure you're running this from an active Nexidia session.");
          }
        };

      } catch (err) {
        console.error(err);
        alert("Failed to run. Make sure you're running this from an active Nexidia session.");
      }
    })();
  }

  api.registerTool({
    id: "searchExport",
    label: "Search + Export",
    open: openSearchExport
  });
})();
