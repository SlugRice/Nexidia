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
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
          barInner.style.cssText = "height:100%;width:0%;background:#3b82f6;transition:width 0.3s;";
          barOuter.appendChild(barInner);
          const metrics = document.createElement("div");
          metrics.style.cssText = "margin-top:8px;font-size:12px;color:#cbd5e1;";
          const closeBtn = document.createElement("div");
          closeBtn.textContent = "✕";
          closeBtn.style.cssText = "position:absolute;top:10px;right:12px;cursor:pointer;color:#9ca3af;font-size:14px;";
          closeBtn.onclick = () => wrap.remove();
          wrap.appendChild(closeBtn); wrap.appendChild(title);
          wrap.appendChild(status); wrap.appendChild(barOuter); wrap.appendChild(metrics);
          return {
            show: () => document.body.appendChild(wrap),
            remove: () => { try { wrap.remove(); } catch (_) {} },
            set: (msg, pct = null, meta = "") => {
              status.textContent = msg || "";
              if (pct !== null) barInner.style.width = `${Math.max(0, Math.min(100, pct))}%`;
              metrics.textContent = meta || "";
            }
          };
        })();

        // ── DOM helpers ────────────────────────────────────────────────────────────
        const el = (tag, props = {}, ...children) => {
          const node = document.createElement(tag);
          Object.assign(node, props);
          for (const ch of children)
            node.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
          return node;
        };
        const hr = () => el("div", { style: "height:1px;background:#e5e7eb;margin:14px 0;" });
        const section = (text) => el("div", { style: "font-size:15px;font-weight:600;margin:10px 0;" }, text);

        const field = (label, type = "text") => {
          const input = el("input", { type, style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;" });
          const wrap = el("div", { style: "flex:1;min-width:200px;" },
            el("div", { style: "font-size:12px;color:#444;margin-bottom:4px;" }, label), input);
          return { wrap, input };
        };

        // ── FLIP animation helper ──────────────────────────────────────────────────
        // Animates an element visually from its current position to a destination rect.
        // The real element is inserted at destination immediately; a clone flies over it.
        function flipAnimate(realEl, destContainer, insertBefore = null, durationMs = 260) {
          const srcRect = realEl.getBoundingClientRect();
          if (insertBefore) destContainer.insertBefore(realEl, insertBefore);
          else destContainer.appendChild(realEl);
          const dstRect = realEl.getBoundingClientRect();
          const dx = srcRect.left - dstRect.left;
          const dy = srcRect.top - dstRect.top;
          if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
          const clone = realEl.cloneNode(true);
          clone.style.cssText += `
            position:fixed;top:${srcRect.top}px;left:${srcRect.left}px;
            width:${srcRect.width}px;height:${srcRect.height}px;
            margin:0;z-index:1000001;pointer-events:none;
            transition:transform ${durationMs}ms cubic-bezier(0.4,0,0.2,1),opacity ${durationMs}ms ease;
            transform:translate(0,0);opacity:1;box-sizing:border-box;
          `;
          document.body.appendChild(clone);
          realEl.style.opacity = "0";
          requestAnimationFrame(() => requestAnimationFrame(() => {
            clone.style.transform = `translate(${-dx}px,${-dy}px)`;
            clone.style.opacity = "0.15";
            setTimeout(() => {
              clone.remove();
              realEl.style.opacity = "1";
              realEl.style.transition = "opacity 0.12s ease";
              requestAnimationFrame(() => { realEl.style.opacity = "1"; });
            }, durationMs);
          }));
        }

        // ── Field picker ───────────────────────────────────────────────────────────
        const allRows = [];
        const getActiveStorageNames = (excludeEntry = null) =>
          new Set(allRows.filter(r => r !== excludeEntry && r.picker)
            .map(r => r.picker.getStorageName()).filter(Boolean));

        function makeFieldPicker(onSelect) {
          const wrapper = el("div", { style: "position:relative;flex:1;min-width:160px;" });
          const input = el("input", { type: "text", placeholder: "Search fields...",
            style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;" });
          const dropdown = el("div", { style: `display:none;position:absolute;top:100%;left:0;right:0;
            max-height:200px;overflow-y:auto;background:#fff;border:1px solid #ccc;border-top:none;
            border-radius:0 0 6px 6px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,.15);` });
          let hi = -1, vis = [];
          const render = (q) => {
            dropdown.innerHTML = ""; vis = []; hi = -1;
            const ql = q.toLowerCase().trim();
            const cur = input.dataset.storageName || "";
            const active = getActiveStorageNames();
            const matches = metadataFields.filter(f => {
              if (f.storageName === cur) return true;
              if (active.has(f.storageName)) return false;
              return ql ? f.displayName.toLowerCase().includes(ql) : true;
            });
            if (!matches.length) { dropdown.style.display = "none"; return; }
            for (const f of matches.slice(0, 80)) {
              const item = el("div", { style: "padding:6px 10px;cursor:pointer;font-size:13px;border-bottom:1px solid #f0f0f0;" }, f.displayName);
              item.onmouseenter = () => { vis.forEach((v, i) => v.style.background = i === vis.indexOf(item) ? "#e8f0fe" : ""); hi = vis.indexOf(item); };
              item.onmouseleave = () => { item.style.background = ""; };
              item.onmousedown = (e) => { e.preventDefault(); pick(f); };
              dropdown.appendChild(item); vis.push(item);
            }
            dropdown.style.display = "block";
          };
          const pick = (f) => {
            input.value = f.displayName; input.dataset.storageName = f.storageName;
            dropdown.style.display = "none"; hi = -1;
            if (onSelect) onSelect(f);
          };
          input.addEventListener("input", () => { delete input.dataset.storageName; render(input.value); });
          input.addEventListener("focus", () => render(input.value));
          input.addEventListener("blur", () => setTimeout(() => { dropdown.style.display = "none"; }, 150));
          input.addEventListener("keydown", (e) => {
            if (!vis.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); vis.forEach(v => v.style.background = ""); hi = Math.min(hi + 1, vis.length - 1); vis[hi].style.background = "#e8f0fe"; vis[hi].scrollIntoView({ block: "nearest" }); }
            else if (e.key === "ArrowUp") { e.preventDefault(); vis.forEach(v => v.style.background = ""); hi = Math.max(hi - 1, 0); vis[hi].style.background = "#e8f0fe"; vis[hi].scrollIntoView({ block: "nearest" }); }
            else if (e.key === "Enter") { e.preventDefault(); if (hi >= 0 && vis[hi]) vis[hi].onmousedown(e); }
            else if (e.key === "Escape") dropdown.style.display = "none";
          });
          wrapper.appendChild(input); wrapper.appendChild(dropdown);
          return {
            wrapper, input,
            getStorageName: () => input.dataset.storageName || "",
            getDisplayName: () => input.value,
            preselect: (sn) => {
              const f = metadataFields.find(x => x.storageName === sn);
              if (f) pick(f); else { input.value = sn; input.dataset.storageName = sn; }
            }
          };
        }

        // ── Slide toggle ───────────────────────────────────────────────────────────
        const FUNNEL_SVG = `<svg width="11" height="11" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 2h8L6 5.5V8.5L4 7.5V5.5L1 2z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" fill="none"/></svg>`;

        function makeSlideToggle(initialType, onChange) {
          const PW = 34, PH = 18, KN = 14;
          const wrap = el("div", { style: "display:flex;align-items:center;gap:5px;flex-shrink:0;cursor:pointer;user-select:none;" });
          const leftIcon = el("span", { style: "display:flex;align-items:center;flex-shrink:0;color:#3b82f6;", title: "Filter" });
          leftIcon.innerHTML = FUNNEL_SVG;
          const pill = el("div", { style: `position:relative;width:${PW}px;height:${PH}px;border-radius:999px;transition:background 0.22s;flex-shrink:0;` });
          const knob = el("div", { style: `position:absolute;top:${(PH - KN) / 2}px;width:${KN}px;height:${KN}px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.25);transition:left 0.22s;` });
          pill.appendChild(knob);
          const rightIcon = el("span", { style: "display:flex;align-items:center;flex-shrink:0;font-size:13px;line-height:1;", title: "Key" });
          rightIcon.textContent = "🔑";
          wrap.appendChild(leftIcon); wrap.appendChild(pill); wrap.appendChild(rightIcon);
          let cur = initialType || "filter", locked = false;
          const apply = () => {
            if (cur === "filter") { pill.style.background = locked ? "#93c5fd" : "#3b82f6"; knob.style.left = "2px"; leftIcon.style.opacity = "0.9"; rightIcon.style.opacity = "0.35"; }
            else { pill.style.background = locked ? "#fcd34d" : "#f59e0b"; knob.style.left = `${PW - KN - 2}px`; leftIcon.style.opacity = "0.35"; rightIcon.style.opacity = "1"; }
            wrap.style.cursor = locked ? "not-allowed" : "pointer";
            wrap.title = locked ? "Clear this field's value to change type" : cur === "filter" ? "Filter — click to switch to Key" : "Key — click to switch to Filter";
          };
          wrap.addEventListener("click", () => { if (locked) return; cur = cur === "filter" ? "key" : "filter"; apply(); if (onChange) onChange(cur); });
          apply();
          return { wrap, getType: () => cur, setType: (t) => { cur = t; apply(); }, lock: () => { locked = true; apply(); }, unlock: () => { locked = false; apply(); } };
        }

        // ── AND label ──────────────────────────────────────────────────────────────
        // Spacer: remove(22) + gap(8) + toggle(58) + gap(8) + fieldLabel(180) + gap(8) = 284px
        function makeAndLabel() {
          const wrap = el("div", { style: "display:flex;align-items:center;margin:0;height:16px;pointer-events:none;user-select:none;" });
          wrap.dataset.andLabel = "1";
          wrap.appendChild(el("div", { style: "flex:0 0 284px;" }));
          wrap.appendChild(el("div", { style: "flex:1;text-align:center;font-size:10px;font-weight:700;letter-spacing:2px;color:rgba(59,130,246,0.28);" }, "AND"));
          return wrap;
        }

        function removeAdjacentAndLabel(rowEl) {
          const prev = rowEl.previousSibling;
          if (prev && prev.dataset && prev.dataset.andLabel) { prev.remove(); return; }
          const next = rowEl.nextSibling;
          if (next && next.dataset && next.dataset.andLabel) next.remove();
        }

        // ── Pane state ─────────────────────────────────────────────────────────────
        const panes = [];
        let activePaneIndex = 0;
        let ghostPaneEl = null;
        let carouselTrack, dotsRow, carouselViewport;
        let keyRowsContainer, keySection;

        const PEEK = 80;
        const GAP = 14;

        const getPaneWidth = () => carouselViewport
          ? Math.max(200, carouselViewport.offsetWidth - PEEK - GAP)
          : 800;

        // ── Row entry builder ──────────────────────────────────────────────────────
        function buildRowEntry(storageName, initialType, isPhrase = false) {
          const entry = {
            rowEl: null, picker: null, valueInput: null, fieldLabelWrap: null,
            type: initialType, paneIndex: initialType === "key" ? -1 : 0,
            locked: false, toggle: null, isPhrase
          };

          const toggle = makeSlideToggle(initialType, (newType) => {
            entry.type = newType;
            entry.valueInput.value = "";
            entry.valueInput.placeholder = newType === "filter" ? FILTER_PLACEHOLDER : KEY_PLACEHOLDER;
            handleTypeChange(entry, newType);
          });
          entry.toggle = toggle;

          const removeBtn = el("button", {
            style: `width:22px;height:22px;border-radius:50%;border:1px solid #e5e7eb;background:#fff;
              color:#aaa;cursor:pointer;font-size:11px;flex-shrink:0;display:flex;align-items:center;
              justify-content:center;padding:0;align-self:center;`,
            title: "Remove"
          }, "✕");

          const fieldLabelWrap = el("div", {
            style: `flex:0 0 180px;padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;
              background:#f3f4f6;font-size:13px;color:#374151;white-space:nowrap;overflow:hidden;
              text-overflow:ellipsis;box-sizing:border-box;`
          });
          entry.fieldLabelWrap = fieldLabelWrap;

          let valueInput;
          if (isPhrase) {
            valueInput = el("textarea", {
              rows: 2,
              placeholder: initialType === "filter" ? FILTER_PLACEHOLDER : KEY_PLACEHOLDER,
              style: "flex:1;min-width:0;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;resize:vertical;font-family:Segoe UI,Arial,sans-serif;font-size:13px;"
            });
            valueInput.addEventListener("paste", (e) => {
              try {
                const text = (e.clipboardData || window.clipboardData).getData("text");
                if (typeof text !== "string") return;
                const norm = text.replace(/\r\n/g, "\n").replace(/\t/g, "\n");
                if (/\n/.test(norm)) {
                  e.preventDefault();
                  const s = valueInput.selectionStart ?? valueInput.value.length;
                  const en = valueInput.selectionEnd ?? valueInput.value.length;
                  valueInput.value = valueInput.value.slice(0, s) + norm + valueInput.value.slice(en);
                  valueInput.selectionStart = valueInput.selectionEnd = s + norm.length;
                }
              } catch (_) {}
            });
          } else {
            valueInput = el("input", {
              type: "text",
              placeholder: initialType === "filter" ? FILTER_PLACEHOLDER : KEY_PLACEHOLDER,
              style: "flex:1;min-width:0;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;"
            });
          }
          entry.valueInput = valueInput;

          const picker = isPhrase ? null : makeFieldPicker((f) => {
            fieldLabelWrap.textContent = f.displayName;
            fieldLabelWrap.title = f.displayName;
            syncFieldAcrossPanes(entry, f.storageName, f.displayName);
          });
          if (picker) { picker.wrapper.style.display = "none"; }
          entry.picker = picker;

          if (isPhrase) {
            fieldLabelWrap.textContent = "Phrase";
            fieldLabelWrap.title = "Phrase search — each line is a separate search";
            fieldLabelWrap.style.fontStyle = "italic";
            fieldLabelWrap.style.color = "#6b7280";
          }

          const checkLock = () => {
            const hasVal = valueInput.value.trim().length > 0;
            if (hasVal && panes.length > 1 && entry.type === "filter") {
              toggle.lock(); entry.locked = true;
            } else { toggle.unlock(); entry.locked = false; }
          };
          valueInput.addEventListener("input", checkLock);

          const rowEl = el("div", { style: "display:flex;gap:8px;align-items:center;margin:4px 0;" });
          rowEl.appendChild(removeBtn);
          rowEl.appendChild(toggle.wrap);
          rowEl.appendChild(fieldLabelWrap);
          rowEl.appendChild(valueInput);
          if (picker) rowEl.appendChild(picker.wrapper);
          entry.rowEl = rowEl;
          allRows.push(entry);

          removeBtn.onclick = () => {
            const prev = rowEl.previousSibling;
            if (prev && prev.dataset && prev.dataset.andLabel) prev.remove();
            else { const next = rowEl.nextSibling; if (next && next.dataset && next.dataset.andLabel) next.remove(); }
            rowEl.remove();
            const idx = allRows.indexOf(entry);
            if (idx !== -1) allRows.splice(idx, 1);
            for (const p of panes) { const pi = p.rows.indexOf(entry); if (pi !== -1) p.rows.splice(pi, 1); }
          };

          if (storageName && picker) {
            picker.preselect(storageName);
            const f = metadataFields.find(x => x.storageName === storageName);
            fieldLabelWrap.textContent = f ? f.displayName : storageName;
            fieldLabelWrap.title = f ? f.displayName : storageName;
          }

          return entry;
        }

        function syncFieldAcrossPanes(changedEntry, storageName, displayName) {
          if (changedEntry.type !== "filter" || changedEntry.isPhrase) return;
          const srcPane = panes.find(p => p.index === changedEntry.paneIndex);
          if (!srcPane) return;
          const rowIdx = srcPane.rows.indexOf(changedEntry);
          if (rowIdx === -1) return;
          for (const pane of panes) {
            if (pane.index === changedEntry.paneIndex) continue;
            const parallel = pane.rows[rowIdx];
            if (!parallel || parallel.isPhrase) continue;
            if (parallel.picker) { parallel.picker.preselect(storageName); }
            parallel.fieldLabelWrap.textContent = displayName;
            parallel.fieldLabelWrap.title = displayName;
          }
        }

        // ── FLIP-based type change ─────────────────────────────────────────────────
        function handleTypeChange(entry, newType) {
          if (newType === "key") {
            // Determine insert position in key zone: prepend (keys insert at top)
            const firstChild = keyRowsContainer.firstChild;
            removeAdjacentAndLabel(entry.rowEl);
            entry.rowEl.remove();
            for (const p of panes) { const pi = p.rows.indexOf(entry); if (pi !== -1) p.rows.splice(pi, 1); }
            entry.paneIndex = -1;
            flipAnimate(entry.rowEl, keyRowsContainer, firstChild, 260);
          } else {
            entry.rowEl.remove();
            entry.paneIndex = activePaneIndex;
            const targetPane = panes[activePaneIndex];
            if (targetPane) {
              const firstRow = targetPane.rowsContainer.firstChild;
              // Insert at top of filter list
              if (firstRow) {
                const andLbl = makeAndLabel();
                targetPane.rowsContainer.insertBefore(andLbl, firstRow);
                flipAnimate(entry.rowEl, targetPane.rowsContainer, andLbl, 260);
              } else {
                flipAnimate(entry.rowEl, targetPane.rowsContainer, null, 260);
              }
              targetPane.rows.unshift(entry);
              // Sync to other panes: insert same field at top
              for (const pane of panes) {
                if (pane.index === activePaneIndex) continue;
                const newEntry = buildRowEntry(entry.picker ? entry.picker.getStorageName() : "", "filter", entry.isPhrase);
                newEntry.paneIndex = pane.index;
                const pf = pane.rowsContainer.firstChild;
                if (pf) {
                  const al = makeAndLabel();
                  pane.rowsContainer.insertBefore(al, pf);
                  pane.rowsContainer.insertBefore(newEntry.rowEl, al);
                } else {
                  pane.rowsContainer.appendChild(newEntry.rowEl);
                }
                pane.rows.unshift(newEntry);
              }
            }
          }
        }

        // ── Pane builder ───────────────────────────────────────────────────────────
        function buildPaneEl(paneIndex) {
          const paneEl = el("div", {
            style: `background:#fff;border-radius:14px;border:1px solid rgba(59,130,246,0.18);
              padding:18px 20px 14px;box-sizing:border-box;flex-shrink:0;position:relative;
              box-shadow:0 2px 10px rgba(59,130,246,0.06);`
          });

          paneEl.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:14px;" }, "Search Filters"));

          const rowsContainer = el("div", {});
          paneEl.appendChild(rowsContainer);

          const addBtn = el("button", {
            style: "margin-top:12px;padding:6px 12px;border-radius:8px;border:1px solid #3b82f6;background:#fff;color:#3b82f6;cursor:pointer;font-size:12px;"
          }, "+ Add Filter");
          paneEl.appendChild(addBtn);

          // Add Phrase button
          const addPhraseBtn = el("button", {
            style: "margin-top:6px;margin-left:8px;padding:6px 12px;border-radius:8px;border:1px solid #6366f1;background:#fff;color:#6366f1;cursor:pointer;font-size:12px;"
          }, "+ Add Phrase");
          paneEl.appendChild(addPhraseBtn);

          // OR button — lives inside pane, slides with it
          const orBtn = el("button", {
            style: `position:absolute;right:-20px;top:50%;transform:translateY(-50%);z-index:20;
              padding:7px 15px;border-radius:20px;border:0;
              background:linear-gradient(135deg,#2563eb,#3b82f6);
              color:#fff;font-size:12px;font-weight:700;cursor:pointer;
              box-shadow:0 3px 12px rgba(59,130,246,0.5);letter-spacing:1px;transition:box-shadow 0.2s;`
          }, "OR");
          orBtn.onmouseenter = () => { orBtn.style.boxShadow = "0 5px 18px rgba(59,130,246,0.7)"; };
          orBtn.onmouseleave = () => { orBtn.style.boxShadow = "0 3px 12px rgba(59,130,246,0.5)"; };
          orBtn.onclick = () => {
            if (paneObj.index < panes.length - 1) slideTo(paneObj.index + 1);
            else activateNextPane();
          };
          paneEl.appendChild(orBtn);

          // Bottom row: Search label left, Search button centered-right
          const bottomRow = el("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-top:16px;" });
          const bottomLabel = el("div", {
            style: "font-size:11px;font-weight:600;color:#3b82f6;letter-spacing:1px;opacity:0.7;"
          }, `Search ${String.fromCharCode(65 + paneIndex)}`);
          const filterSearchBtn = el("button", {
            style: `padding:7px 22px;border-radius:20px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);
              color:#fff;font-size:13px;font-weight:600;cursor:pointer;
              box-shadow:0 2px 8px rgba(59,130,246,0.35);flex:1;margin:0 auto;max-width:160px;`
          }, "Search");
          bottomRow.appendChild(bottomLabel);
          bottomRow.appendChild(filterSearchBtn);
          bottomRow.appendChild(el("div", { style: "flex:0 0 80px;" }));
          paneEl.appendChild(bottomRow);

          const paneObj = { el: paneEl, rowsContainer, addBtn, addPhraseBtn, orBtn, filterSearchBtn, rows: [], index: paneIndex, bottomLabel };

          addBtn.onclick = () => {
            if (paneObj.rows.length > 0) rowsContainer.appendChild(makeAndLabel());
            const entry = buildRowEntry("", "filter");
            entry.paneIndex = paneObj.index;
            rowsContainer.appendChild(entry.rowEl);
            paneObj.rows.push(entry);
          };

          addPhraseBtn.onclick = () => {
            if (paneObj.rows.length > 0) rowsContainer.appendChild(makeAndLabel());
            const entry = buildRowEntry("", "filter", true);
            entry.paneIndex = paneObj.index;
            rowsContainer.appendChild(entry.rowEl);
            paneObj.rows.push(entry);
          };

          filterSearchBtn.onclick = () => runFilterSearch(paneObj);

          return paneObj;
        }

        function populatePaneDefaults(pane) {
          for (let i = 0; i < DEFAULT_FILTER_STORAGES.length; i++) {
            if (i > 0) pane.rowsContainer.appendChild(makeAndLabel());
            const entry = buildRowEntry(DEFAULT_FILTER_STORAGES[i], "filter");
            entry.paneIndex = pane.index;
            pane.rows.push(entry);
            pane.rowsContainer.appendChild(entry.rowEl);
          }
        }

        // ── Ghost pane ─────────────────────────────────────────────────────────────
        function buildGhostPane(paneIndex) {
          const ghost = el("div", {
            style: `background:#fff;border-radius:14px;border:1px solid rgba(59,130,246,0.10);
              padding:18px 20px 14px;box-sizing:border-box;flex-shrink:0;position:relative;
              box-shadow:0 2px 10px rgba(59,130,246,0.03);opacity:0.55;pointer-events:none;`
          });
          ghost.dataset.ghost = "1";
          ghost.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:14px;opacity:0.5;" }, "Search Filters"));
          for (let i = 0; i < 4; i++) {
            if (i > 0) { const al = makeAndLabel(); al.style.opacity = "0.3"; ghost.appendChild(al); }
            const skRow = el("div", { style: "display:flex;gap:8px;align-items:center;margin:4px 0;" });
            skRow.appendChild(el("div", { style: "width:22px;height:22px;border-radius:50%;background:#e5e7eb;" }));
            skRow.appendChild(el("div", { style: "width:58px;height:18px;border-radius:9px;background:#e5e7eb;" }));
            skRow.appendChild(el("div", { style: "flex:0 0 180px;height:32px;border-radius:6px;background:#f3f4f6;border:1px solid #e5e7eb;" }));
            skRow.appendChild(el("div", { style: "flex:1;height:32px;border-radius:6px;background:#f9fafb;border:1px solid #e5e7eb;" }));
            ghost.appendChild(skRow);
          }
          const ghostOr = el("button", {
            style: `position:absolute;right:-20px;top:50%;transform:translateY(-50%);z-index:20;
              padding:7px 15px;border-radius:20px;border:0;
              background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;font-size:12px;
              font-weight:700;cursor:pointer;box-shadow:0 3px 12px rgba(59,130,246,0.5);
              letter-spacing:1px;opacity:0.8;pointer-events:auto;`
          }, "OR");
          ghostOr.onclick = () => activateNextPane();
          ghost.appendChild(ghostOr);
          ghost.appendChild(el("div", {
            style: "text-align:center;font-size:11px;font-weight:600;color:#3b82f6;letter-spacing:1px;margin-top:16px;opacity:0.35;"
          }, `Search ${String.fromCharCode(65 + paneIndex)}`));
          return ghost;
        }

        function activateNextPane() {
          // Replace ghost with real pane
          const newIndex = panes.length;
          const newPane = buildPaneEl(newIndex);
          // Mirror filter rows from pane 0 (same field labels, empty values)
          const refPane = panes[0];
          for (let i = 0; i < refPane.rows.length; i++) {
            if (i > 0) newPane.rowsContainer.appendChild(makeAndLabel());
            const refEntry = refPane.rows[i];
            const sn = refEntry.picker ? refEntry.picker.getStorageName() : "";
            const entry = buildRowEntry(sn, "filter", refEntry.isPhrase);
            entry.paneIndex = newIndex;
            newPane.rows.push(entry);
            newPane.rowsContainer.appendChild(entry.rowEl);
          }
          panes.push(newPane);
          // Replace ghost in track
          if (ghostPaneEl && carouselTrack.contains(ghostPaneEl)) {
            carouselTrack.replaceChild(newPane.el, ghostPaneEl);
          } else {
            carouselTrack.appendChild(newPane.el);
          }
          // Append new ghost
          ghostPaneEl = buildGhostPane(newIndex + 1);
          carouselTrack.appendChild(ghostPaneEl);
          resizePanes();
          slideTo(newIndex);
          updateDots();
          // Lock filter rows with values
          allRows.forEach(r => {
            if (r.type === "filter" && r.valueInput.value.trim() && r.toggle) { r.toggle.lock(); r.locked = true; }
          });
        }

        // Deregister tail panes that are fully empty, working inward from the end
        function pruneEmptyTailPanes() {
          while (panes.length > 1) {
            const last = panes[panes.length - 1];
            if (last.index === activePaneIndex) break;
            const hasValue = last.rows.some(r => r.valueInput.value.trim().length > 0);
            if (hasValue) break;
            // Remove rows from allRows
            for (const r of last.rows) {
              const idx = allRows.indexOf(r);
              if (idx !== -1) allRows.splice(idx, 1);
            }
            // Remove pane element and ghost, rebuild ghost at new tail
            if (last.el.parentNode) last.el.parentNode.removeChild(last.el);
            panes.pop();
          }
          // Rebuild ghost at current tail
          if (ghostPaneEl && ghostPaneEl.parentNode) ghostPaneEl.parentNode.removeChild(ghostPaneEl);
          ghostPaneEl = buildGhostPane(panes.length);
          carouselTrack.appendChild(ghostPaneEl);
          resizePanes();
          updateDots();
          if (panes.length === 1) {
            allRows.forEach(r => { if (r.type === "filter" && r.toggle) { r.toggle.unlock(); r.locked = false; } });
          }
        }

        // ── Carousel ───────────────────────────────────────────────────────────────
        const resizePanes = () => {
          if (!carouselViewport) return;
          const pw = getPaneWidth();
          for (const p of panes) {
            p.el.style.width = `${pw}px`;
            p.el.style.minWidth = `${pw}px`;
            p.el.style.marginRight = `${GAP}px`;
          }
          if (ghostPaneEl) {
            ghostPaneEl.style.width = `${pw}px`;
            ghostPaneEl.style.minWidth = `${pw}px`;
            ghostPaneEl.style.marginRight = `${GAP}px`;
          }
          applySlideTransform(activePaneIndex, false);
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

        // Offset so that when pane index > 0, left peek is visible matching right peek
        // translateX = -(index * (paneW + GAP)) + (index > 0 ? PEEK/2 : 0)
        // This shifts track slightly right when not at pane 0, revealing left peek symmetrically
        const applySlideTransform = (index, animate = true) => {
          const pw = getPaneWidth();
          const leftOffset = index > 0 ? Math.floor(PEEK / 2) : 0;
          const tx = -(index * (pw + GAP)) + leftOffset;
          carouselTrack.style.transition = animate
            ? "transform 0.4s cubic-bezier(0.4,0,0.2,1)"
            : "none";
          carouselTrack.style.transform = `translateX(${tx}px)`;
        };

        const slideTo = (index) => {
          if (index < 0 || index >= panes.length) return;
          const prev = activePaneIndex;
          activePaneIndex = index;
          applySlideTransform(index, true);
          if (fadeMaskLeft) fadeMaskLeft.style.opacity = index > 0 ? "1" : "0";
          updateDots();
          if (index < prev) {
            // Navigated left — prune empty tail panes after animation
            setTimeout(() => pruneEmptyTailPanes(), 440);
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

        // ── Modal ──────────────────────────────────────────────────────────────────
        const modal = el("div", {
          style: `position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999999;
            display:flex;align-items:center;justify-content:center;
            font-family:Segoe UI,Arial,sans-serif;`
        });
        const stickyClose = el("button", {
          style: `position:fixed;top:20px;right:20px;z-index:1000000;border:0;
            background:rgba(30,30,30,.75);color:#fff;width:32px;height:32px;border-radius:50%;
            font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;
            box-shadow:0 2px 8px rgba(0,0,0,.4);`
        }, "✕");
        stickyClose.onclick = () => { modal.remove(); stickyClose.remove(); };

        const card = el("div", {
          style: `background:#f8fafc;width:1080px;max-height:90vh;overflow:auto;border-radius:14px;
            padding:18px 18px 22px;box-shadow:0 10px 30px rgba(0,0,0,.35);`
        });

        card.appendChild(el("div", { style: "font-size:18px;font-weight:600;margin-bottom:4px;" }, "Nexidia Search"));
        card.appendChild(hr());
        card.appendChild(section("Date Range"));

        const today = new Date(), monthAgo = new Date(today);
        monthAgo.setMonth(today.getMonth() - 1);
        const fromDate = field("From", "date");
        const toDate = field("To", "date");
        fromDate.input.valueAsDate = monthAgo;
        toDate.input.valueAsDate = today;
        card.appendChild(el("div", { style: "display:flex;gap:10px;align-items:flex-end;margin:8px 0;flex-wrap:wrap;" }, fromDate.wrap, toDate.wrap));
        card.appendChild(hr());

        // ── Carousel section ───────────────────────────────────────────────────────
        const carouselOuter = el("div", { style: "position:relative;" });
        carouselViewport = el("div", { style: "overflow:hidden;border-radius:14px;position:relative;" });

        let fadeMaskLeft = el("div", {
          style: `position:absolute;top:0;left:0;bottom:0;width:${PEEK}px;
            background:linear-gradient(to right,rgba(248,250,252,0.97),rgba(248,250,252,0));
            z-index:6;pointer-events:auto;cursor:pointer;opacity:0;transition:opacity 0.3s;`
        });
        fadeMaskLeft.onclick = () => { if (activePaneIndex > 0) slideTo(activePaneIndex - 1); };

        const fadeMaskRight = el("div", {
          style: `position:absolute;top:0;right:0;bottom:0;width:${PEEK}px;
            background:linear-gradient(to left,rgba(248,250,252,0.6),rgba(248,250,252,0));
            z-index:6;pointer-events:auto;cursor:pointer;`
        });
        fadeMaskRight.onclick = () => {
          if (activePaneIndex < panes.length - 1) slideTo(activePaneIndex + 1);
          else activateNextPane();
        };

        carouselTrack = el("div", { style: "display:flex;flex-direction:row;will-change:transform;" });
        carouselViewport.appendChild(fadeMaskLeft);
        carouselViewport.appendChild(fadeMaskRight);
        carouselViewport.appendChild(carouselTrack);
        carouselOuter.appendChild(carouselViewport);

        dotsRow = el("div", { style: "display:flex;justify-content:center;gap:6px;margin-top:10px;" });

        card.appendChild(carouselOuter);
        card.appendChild(dotsRow);
        card.appendChild(hr());

        // ── Key Fields section ─────────────────────────────────────────────────────
        keySection = el("div", {
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

        const keyBtnRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap;" });
        const addKeyBtn = el("button", {
          style: "padding:6px 12px;border-radius:8px;border:1px solid #22c55e;background:#fff;color:#22c55e;cursor:pointer;font-size:12px;"
        }, "+ Add Key Field");
        addKeyBtn.onclick = () => {
          const entry = buildRowEntry("", "key");
          entry.paneIndex = -1;
          keyRowsContainer.appendChild(entry.rowEl);
        };
        const addKeyPhraseBtn = el("button", {
          style: "padding:6px 12px;border-radius:8px;border:1px solid #6366f1;background:#fff;color:#6366f1;cursor:pointer;font-size:12px;"
        }, "+ Add Phrase");
        addKeyPhraseBtn.onclick = () => {
          const entry = buildRowEntry("", "key", true);
          entry.paneIndex = -1;
          keyRowsContainer.appendChild(entry.rowEl);
        };
        const keySearchBtn = el("button", {
          style: `padding:7px 22px;border-radius:20px;border:0;
            background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;font-size:13px;
            font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(34,197,94,0.35);margin-left:auto;`
        }, "Search");
        keySearchBtn.onclick = () => runKeySearch();

        keyBtnRow.appendChild(addKeyBtn);
        keyBtnRow.appendChild(addKeyPhraseBtn);
        keyBtnRow.appendChild(keySearchBtn);
        keySection.appendChild(keyBtnRow);
        card.appendChild(keySection);

        modal.appendChild(card);
        document.body.appendChild(modal);
        document.body.appendChild(stickyClose);

        // Build first pane
        const firstPane = buildPaneEl(0);
        populatePaneDefaults(firstPane);
        panes.push(firstPane);
        carouselTrack.appendChild(firstPane.el);
        ghostPaneEl = buildGhostPane(1);
        carouselTrack.appendChild(ghostPaneEl);

        requestAnimationFrame(() => {
          resizePanes();
          for (const sn of DEFAULT_KEY_LIST) {
            const entry = buildRowEntry(sn, "key");
            entry.paneIndex = -1;
            keyRowsContainer.appendChild(entry.rowEl);
          }
          updateDots();
        });
        window.addEventListener("resize", resizePanes);

        // ── Normalization helpers (unchanged) ──────────────────────────────────────
        const splitValues = (raw) =>
          String(raw || "").replace(/\r\n/g, "\n").replace(/\t/g, "\n")
            .split(/[\n,]+/).map(s => s.trim()).filter(Boolean);

        const isoStart = (d) => `${d}T00:00:00Z`;
        const isoEnd = (d) => `${d}T23:59:59Z`;

        const KEY_TRANSLATIONS = new Map([
          ["overallsentimentscore","sentimentScore"],["recordeddate","recordedDateTime"],
          ["mediafileduration","mediaFileDuration"],["udfint4","UDFInt4"],
          ["experienceid","experienceId"],["sitename","siteName"],["site","siteName"],
          ["supervisor","supervisorName"],["supervisorname","supervisorName"],
          ["primaryintentcategory","primaryIntentCategory"],["primaryintenttopic","primaryIntentTopic"],
          ["primaryintentropic","primaryIntentTopic"],["primaryintentsubtopic","primaryIntentSubtopic"],
          ["agentname","agentName"]
        ]);

        const normalizeFieldKeyForExplore = (k) => {
          const raw = String(k || "").trim(); if (!raw) return "";
          let out = raw.replace(/^UDFvarchar/i,"UDFVarchar").replace(/^UDFnumeric/i,"UDFNumeric").replace(/^UDFint/i,"UDFInt");
          const lower = out.toLowerCase();
          if (KEY_TRANSLATIONS.has(lower)) out = KEY_TRANSLATIONS.get(lower);
          return out;
        };

        const normalizeParamName = (p) => {
          if (!p) return p; const s = String(p).trim();
          if (s.toLowerCase() === "experienceid") return "ExperienceId";
          if (s.toLowerCase() === "site") return "Site";
          if (s.toLowerCase() === "dnis") return "DNIS";
          const m = s.match(/udfvarchar(\d+)/i); if (m) return `UDFVarchar${m[1]}`;
          return s;
        };

        const normalizeKeywordValues = (pn, vals) => {
          if (normalizeParamName(pn) === "UDFVarchar120") return vals.map(v => String(v).toLowerCase());
          return vals;
        };

        const buildKeywordFilter = (pn, vals) => ({
          operator: "IN", type: "KEYWORD",
          parameterName: normalizeParamName(pn),
          value: normalizeKeywordValues(pn, vals)
        });

        const buildTextFilter = (phrase) => ({
          operator: "IN", type: "TEXT", parameterName: "transcript",
          value: { phrases: [phrase], anotherPhrases: [], relevance: "Anywhere", position: "Begin" }
        });

        const safeRead = async (res) => {
          const ct = (res.headers.get("content-type") || "").toLowerCase();
          const text = await res.text();
          if (ct.includes("application/json")) { try { return { json: JSON.parse(text), text }; } catch { return { json: null, text }; } }
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

        const getFieldValue = (rowObj, key) => {
          if (!rowObj) return ""; const want = String(key || ""); if (!want) return "";
          if (rowObj[want] !== undefined && rowObj[want] !== null) return String(rowObj[want]);
          const lower = want.toLowerCase();
          for (const k of Object.keys(rowObj)) { if (k.toLowerCase() === lower && rowObj[k] !== null) return String(rowObj[k]); }
          for (const c of [rowObj.fields, rowObj.values, rowObj.data]) {
            if (!c || typeof c !== "object") continue;
            if (c[want] !== undefined && c[want] !== null) return String(c[want]);
            for (const k of Object.keys(c)) { if (k.toLowerCase() === lower && c[k] !== null) return String(c[k]); }
          }
          return "";
        };

        function getAppInstanceIdFromCurrentPageSource() {
          for (const s of document.querySelectorAll("script")) {
            const m = (s.textContent || "").match(/"appInstanceId"\s*:\s*"([^"]+)"/);
            if (m) return m[1];
          } return null;
        }
        async function getAppInstanceIdViaPageFetch() {
          const res = await fetch(location.href, { credentials: "include", cache: "no-store" });
          if (!res.ok) throw new Error("Page fetch failed: " + res.status);
          const m = (await res.text()).match(/"appInstanceId"\s*:\s*"([^"]+)"/);
          if (m) return m[1]; throw new Error("appInstanceId not found");
        }
        async function getAppInstanceIdViaForensicFetch() {
          const res = await fetch(LEGACY_FORMS_URL, { credentials: "include", cache: "no-store" });
          if (!res.ok) throw new Error("ForensicSearch fetch failed");
          const m = (await res.text()).match(/"appInstanceId"\s*:\s*"([^"]+)"/);
          if (m) return m[1]; throw new Error("appInstanceId not found in ForensicSearch");
        }
        async function getAppInstanceId() {
          const fp = getAppInstanceIdFromCurrentPageSource(); if (fp) return fp;
          try { return await getAppInstanceIdViaPageFetch(); } catch (_) {}
          try { return await getAppInstanceIdViaForensicFetch(); } catch (_) {}
          throw new Error("Could not determine appInstanceId.");
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
          const ctl10 = doc.querySelector('input[name="ctl10"]')?.getAttribute("value") || doc.querySelector('input[name="ctl10"]')?.value || "";
          if (!ctl10) throw new Error("ctl10 not found");
          const pairsRaw = ctl10.split(",").map(s => s.split("\n")).filter(p => p.length >= 2).map(([label, key]) => ({ label, key }));
          const fields = [], headers = [], seen = new Set();
          for (const p of pairsRaw) {
            const nk = normalizeFieldKeyForExplore(p.key.trim());
            if (!nk || seen.has(nk)) continue; seen.add(nk); fields.push(nk); headers.push(p.label);
          }
          return { fields, headers };
        }

        // ── Export helpers ─────────────────────────────────────────────────────────
        const escapeHtml = (s) => String(s ?? "")
          .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

        const normalizeCellText = (raw) => {
          let s = (raw === null || raw === undefined) ? "" : String(raw); s = s.trim();
          if (!s) return ""; return s;
        };

        const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

        const downloadExcelFile = (filename, html) => {
          const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url; a.download = filename;
          document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        };

        const estimateDisplayLen = (fieldKey, rawText) => {
          const lk = String(fieldKey || "").toLowerCase();
          if (lk === "recordeddatetime") return 18;
          if (lk === "mediafileduration") return 10;
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
              const raw = k.startsWith("__PHRASE_")
                ? normalizeCellText(phrases[parseInt(k.replace(/\D/g,""),10)-1] || "")
                : normalizeCellText(getFieldValue(rr.row, k));
              maxLens[c] = Math.max(maxLens[c] || 8, estimateDisplayLen(k, raw));
            }
          }
          return `<colgroup>${maxLens.map(len => `<col style="width:${clamp(Math.round(len*6.5+16),50,520)}px">`).join("")}</colgroup>`;
        };

        // Build clean Excel output — no formulas, no hidden sheets, plain text cells with minimal style
        const buildExcelHtml = (exportHeaders, exportFields, finalRows, phraseKeys) => {
          const css = `
            table{border-collapse:collapse}
            td,th{padding:4px 8px;font-family:"Aptos Narrow","Aptos",Calibri,Arial,sans-serif;font-size:10pt;text-align:left;vertical-align:bottom;white-space:nowrap;border:none}
            th{font-weight:700}
          `.trim();
          const colGroup = buildColGroup(exportHeaders, finalRows, exportFields);
          const headerCells = exportHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join("");
          const bodyRows = finalRows.map(({ row: r, phrases }) => {
            const tds = exportFields.map(k => {
              let val = "";
              if (k.startsWith("__PHRASE_")) {
                const idx = parseInt(k.replace(/\D/g,""),10) - 1;
                val = normalizeCellText(phrases && phrases[idx] ? phrases[idx] : "");
              } else {
                val = normalizeCellText(getFieldValue(r, k));
              }
              return `<td>${escapeHtml(val)}</td>`;
            }).join("");
            return `<tr>${tds}</tr>`;
          }).join("\n");
          return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"/><style>${css}</style></head><body><table>${colGroup}<tr>${headerCells}</tr>${bodyRows}</table></body></html>`;
        };

        // ── Column prefs loader ────────────────────────────────────────────────────
        async function loadColumnPrefs() {
          try {
            progressUI.set("Loading column preferences...", 10, "");
            const appInstanceId = await getAppInstanceId();
            const prefs = await getLegacyChosenColumns(appInstanceId);
            if (prefs.fields?.length) {
              const fields = [...prefs.fields];
              const headers = [...prefs.headers];
              if (!fields.includes("UDFVarchar110")) { fields.push("UDFVarchar110"); headers.push("Trans_Id"); }
              progressUI.set("Column preferences loaded.", 18, `Fields: ${fields.length}`);
              return { fields, headers };
            }
          } catch (e) { console.warn("Column prefs unavailable, using defaults.", e); }
          const fields = [
            "agentName","UDFVarchar10","recordedDateTime","mediaFileDuration","UDFInt4",
            "sentimentScore","experienceId","supervisorName","siteName",
            "primaryIntentCategory","primaryIntentTopic","primaryIntentSubtopic",
            "UDFVarchar8","MinimumSentimentScore","MaximumSentimentScore","UDFVarchar110"
          ];
          const headers = [
            "Agent","Group ID (Policy ID)","Date/Time","Duration","Hold Time","Sentiment",
            "Experience Id","Supervisor","Site","Contact Reason Level 1","Contact Reason Level 2",
            "Contact Reason Level 3","End Reason","Min Sentiment","Max Sentiment","Trans_Id"
          ];
          progressUI.set("Using default export fields.", 18, `Fields: ${fields.length}`);
          return { fields, headers };
        }

        // ── Core search executor ───────────────────────────────────────────────────
        async function executeSearch(runSets, baseFields, baseHeaders, dateFilter, labelPrefix) {
          const merged = new Map();
          const passthroughNoKey = [];
          let totalFetched = 0;
          const totalRuns = runSets.length;

          for (let si = 0; si < runSets.length; si++) {
            const { keywordGroup, phraseGroups, label } = runSets[si];
            // Expand phrase groups: one API call per phrase group; if none, one call with just keyword+date
            const phraseExpansions = phraseGroups.length > 0 ? phraseGroups : [{ group: null, display: label }];
            for (const { group: phraseGroup, display: phraseDisplay } of phraseExpansions) {
              progressUI.set(`Searching (${labelPrefix} ${si + 1}/${totalRuns})...`, 25, "");
              let from = 0;
              const setRows = [];
              while (true) {
                const interactionFilters = [
                  ...(keywordGroup ? [keywordGroup] : []),
                  ...(phraseGroup ? [phraseGroup] : []),
                  dateFilter
                ];
                const payload = {
                  languageFilter: { languages: [] }, namedSetId: null,
                  from, to: from + PAGE_SIZE, fields: baseFields,
                  query: { operator: "AND", invertOperator: false, filters: [{ operator: "AND", invertOperator: false, filterType: "interactions", filters: interactionFilters }] }
                };
                const res = await fetch(SEARCH_URL, {
                  method: "POST", credentials: "include",
                  headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
                });
                if (!res.ok) { const { text } = await safeRead(res); throw new Error(`Search failed: HTTP ${res.status}\n${text.slice(0,300)}`); }
                const { json } = await safeRead(res);
                const rows = pickRows(json);
                if (!rows.length) break;
                setRows.push(...rows); totalFetched += rows.length;
                progressUI.set(`Searching (${labelPrefix} ${si + 1}/${totalRuns})...`,
                  Math.min(80, 25 + Math.floor((si / Math.max(1, totalRuns)) * 55)),
                  `Set: ${setRows.length} | Total: ${totalFetched}`);
                if (setRows.length >= MAX_ROWS || rows.length < PAGE_SIZE) break;
                from += PAGE_SIZE; await sleep(250);
              }
              const rowLabel = phraseDisplay || label;
              for (const r of setRows) {
                const transId = normalizeCellText(getFieldValue(r, "UDFVarchar110"));
                if (!transId) { passthroughNoKey.push({ row: r, phrases: [rowLabel] }); continue; }
                const existing = merged.get(transId);
                if (!existing) { merged.set(transId, { row: r, phrases: [rowLabel] }); }
                else {
                  if (!existing.phrases.includes(rowLabel)) existing.phrases.push(rowLabel);
                  for (const k of baseFields) {
                    const cur = normalizeCellText(getFieldValue(existing.row, k));
                    if (cur) continue;
                    const nxt = normalizeCellText(getFieldValue(r, k));
                    if (nxt) existing.row[k] = nxt;
                  }
                }
              }
            }
          }
          const finalRows = [];
          let maxPhraseCols = 1;
          for (const [, v] of merged.entries()) { if (v.phrases.length > maxPhraseCols) maxPhraseCols = v.phrases.length; finalRows.push(v); }
          for (const p of passthroughNoKey) { if (p.phrases.length > maxPhraseCols) maxPhraseCols = p.phrases.length; finalRows.push(p); }
          return { finalRows, maxPhraseCols };
        }

        // ── Build phrase groups from a list of row entries ─────────────────────────
        function buildPhraseGroups(phraseEntries) {
          const groups = [];
          for (const entry of phraseEntries) {
            const lines = splitValues(entry.valueInput.value);
            for (const line of lines) {
              const f = buildTextFilter(line);
              groups.push({ group: f, display: `"${line}"` });
            }
          }
          return groups;
        }

        // ── Filter Search (blue button) ────────────────────────────────────────────
        async function runFilterSearch(triggerPane) {
          try {
            const fromVal = fromDate.input.value;
            const toVal = toDate.input.value;
            if (!fromVal || !toVal) { alert("Please select both From and To dates."); return; }

            const dateFilter = {
              parameterName: "recordedDateTime", operator: "BETWEEN", type: "DATE",
              value: { firstValue: isoStart(fromVal), secondValue: isoEnd(toVal) }
            };

            // Build run sets: one per OR pane
            const runSets = [];
            for (const pane of panes) {
              const filterEntries = allRows.filter(r => r.type === "filter" && !r.isPhrase && r.paneIndex === pane.index);
              const phraseEntries = allRows.filter(r => r.type === "filter" && r.isPhrase && r.paneIndex === pane.index);
              const kwFilters = [];
              for (const e of filterEntries) {
                const sn = e.picker ? e.picker.getStorageName() : "";
                const val = e.valueInput.value.trim();
                if (sn && val) kwFilters.push(buildKeywordFilter(sn, splitValues(val)));
              }
              const keywordGroup = kwFilters.length
                ? { operator: "AND", invertOperator: false, filters: kwFilters }
                : null;
              const phraseGroups = buildPhraseGroups(phraseEntries);
              const hasContent = kwFilters.length > 0 || phraseGroups.length > 0;
              if (!hasContent) continue;
              runSets.push({ keywordGroup, phraseGroups, label: `Search ${String.fromCharCode(65 + pane.index)}` });
            }

            if (!runSets.length) {
              const ok = confirm("No filter values entered. This will pull the entire date range. Continue?");
              if (!ok) return;
              runSets.push({ keywordGroup: null, phraseGroups: [], label: "All" });
            }

            modal.remove(); stickyClose.remove(); progressUI.show();
            progressUI.set("Loading column preferences...", 5, "");
            const { fields: baseFields, headers: baseHeaders } = await loadColumnPrefs();

            const { finalRows, maxPhraseCols } = await executeSearch(runSets, baseFields, baseHeaders, dateFilter, "Filter");

            if (!finalRows.length) { progressUI.set("No results returned.", 100, ""); alert("No results returned."); return; }
            progressUI.set("Building export...", 85, `Rows: ${finalRows.length}`);

            const phraseHeaders = [], phraseKeys = [];
            for (let i = 1; i <= maxPhraseCols; i++) {
              phraseHeaders.push(i === 1 ? "Search" : `Search${i}`);
              phraseKeys.push(`__PHRASE_${i}__`);
            }
            const exportHeaders = [...phraseHeaders, ...baseHeaders];
            const exportFields = [...phraseKeys, ...baseFields];
            const htmlOut = buildExcelHtml(exportHeaders, exportFields, finalRows, phraseKeys);
            const stamp = new Date().toISOString().replace(/[:]/g,"-").replace(/\..+$/,"");
            const filename = `nexidia_filter_search_${stamp}.xls`;
            progressUI.set("Downloading...", 95, filename);
            downloadExcelFile(filename, htmlOut);
            progressUI.set("Done.", 100, `Exported ${finalRows.length} rows`);
          } catch (err) {
            console.error(err);
            try { progressUI.remove(); } catch (_) {}
            alert("Search failed. Check console for details.");
          }
        }

        // ── Key Search (green button) ──────────────────────────────────────────────
        async function runKeySearch() {
          try {
            const fromVal = fromDate.input.value;
            const toVal = toDate.input.value;
            if (!fromVal || !toVal) { alert("Please select both From and To dates."); return; }

            const dateFilter = {
              parameterName: "recordedDateTime", operator: "BETWEEN", type: "DATE",
              value: { firstValue: isoStart(fromVal), secondValue: isoEnd(toVal) }
            };

            const keyEntries = allRows.filter(r => r.type === "key" && !r.isPhrase);
            const keyPhraseEntries = allRows.filter(r => r.type === "key" && r.isPhrase);

            const kwFilters = [];
            for (const e of keyEntries) {
              const sn = e.picker ? e.picker.getStorageName() : "";
              const val = e.valueInput.value.trim();
              if (sn && val) kwFilters.push(buildKeywordFilter(sn, splitValues(val)));
            }

            const phraseGroups = buildPhraseGroups(keyPhraseEntries);
            const keywordGroup = kwFilters.length
              ? { operator: "AND", invertOperator: false, filters: kwFilters }
              : null;

            if (!keywordGroup && !phraseGroups.length) {
              const ok = confirm("No key values entered. This will pull the entire date range. Continue?");
              if (!ok) return;
            }

            modal.remove(); stickyClose.remove(); progressUI.show();
            progressUI.set("Loading column preferences...", 5, "");
            const { fields: baseFields, headers: baseHeaders } = await loadColumnPrefs();

            const runSets = [{ keywordGroup, phraseGroups, label: "Key Search" }];
            const { finalRows, maxPhraseCols } = await executeSearch(runSets, baseFields, baseHeaders, dateFilter, "Key");

            if (!finalRows.length) { progressUI.set("No results returned.", 100, ""); alert("No results returned."); return; }
            progressUI.set("Building export...", 85, `Rows: ${finalRows.length}`);

            const phraseHeaders = [], phraseKeys = [];
            for (let i = 1; i <= maxPhraseCols; i++) {
              phraseHeaders.push(i === 1 ? "Search" : `Search${i}`);
              phraseKeys.push(`__PHRASE_${i}__`);
            }
            const exportHeaders = [...phraseHeaders, ...baseHeaders];
            const exportFields = [...phraseKeys, ...baseFields];
            const htmlOut = buildExcelHtml(exportHeaders, exportFields, finalRows, phraseKeys);
            const stamp = new Date().toISOString().replace(/[:]/g,"-").replace(/\..+$/,"");
            const filename = `nexidia_key_search_${stamp}.xls`;
            progressUI.set("Downloading...", 95, filename);
            downloadExcelFile(filename, htmlOut);
            progressUI.set("Done.", 100, `Exported ${finalRows.length} rows`);
          } catch (err) {
            console.error(err);
            try { progressUI.remove(); } catch (_) {}
            alert("Search failed. Check console for details.");
          }
        }

      } catch (err) {
        console.error(err);
        alert("Failed to run. Make sure you're running this from an active Nexidia session.");
      }
    })();
  }

  api.registerTool({ id: "searchExport", label: "Search + Export", open: openSearchExport });
})();
