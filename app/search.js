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

        const FILTER_PLACEHOLDER = "Enter one value for this filter.";
        const KEY_PLACEHOLDER = "Separate multiple values with commas or line breaks, or paste from Excel.";
        const PAGE_SIZE = 1000;
        const MAX_ROWS = 50000;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        const FORCE_TEXT_FIELDS = new Set([
          "UDFVarchar1","UDFVarchar122","UDFVarchar110","UDFVarchar41",
          "UDFVarchar115","UDFVarchar136","UDFVarchar50","UDFVarchar104","UDFVarchar105"
        ]);

        const DEFAULT_FILTER_STORAGES = ["UDFVarchar10","UDFVarchar126","DNIS","siteName","UDFVarchar120","UDFVarchar41"];
        const DEFAULT_KEY_LIST = ["experienceId","UDFVarchar122","UDFVarchar1","UDFVarchar110"];

        // ── Session token ─────────────────────────────────────────────────────
        // Incremented on every new search run. Stale runs that complete after a
        // newer search has started will detect the mismatch and discard results
        // instead of surfacing them to the user.
        let currentToken = (api.getShared("searchSessionToken") || 0) + 1;
        api.setShared("searchSessionToken", currentToken);

        // ── Abort controller ──────────────────────────────────────────────────
        // One controller per search UI instance. Aborted when the user closes
        // the modal or a new search starts. Cancels all in-flight fetch calls.
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

        // ── Metadata fields ───────────────────────────────────────────────────
        let metadataFields = [];
        try {
          const res = await fetch(METADATA_URL, { credentials: "include", cache: "no-store", signal: abortController.signal });
          if (res.ok) {
            const json = await res.json();
            metadataFields = Array.isArray(json) ? json.filter((f) => f.isEnabled !== false) : [];
          }
        } catch (_) {}

        // ── Progress UI ───────────────────────────────────────────────────────
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
          cancelBtn.onclick = () => {
            abortController.abort();
            wrap.remove();
          };
          const closeBtn = document.createElement("div");
          closeBtn.textContent = "X";
          closeBtn.style.cssText = "position:absolute;top:10px;right:12px;cursor:pointer;color:#9ca3af;font-size:14px;";
          closeBtn.onclick = () => {
            abortController.abort();
            wrap.remove();
          };
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

        // ── DOM helpers ───────────────────────────────────────────────────────
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

        // ── FLIP animation ────────────────────────────────────────────────────
        function flipAnimate(realEl, destContainer, insertBefore, durationMs) {
          durationMs = durationMs || 260;
          const srcRect = realEl.getBoundingClientRect();
          if (insertBefore) destContainer.insertBefore(realEl, insertBefore);
          else destContainer.appendChild(realEl);
          const dstRect = realEl.getBoundingClientRect();
          const dx = srcRect.left - dstRect.left;
          const dy = srcRect.top - dstRect.top;
          if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
          const clone = realEl.cloneNode(true);
          clone.style.cssText += "position:fixed;top:" + srcRect.top + "px;left:" + srcRect.left + "px;width:" + srcRect.width + "px;height:" + srcRect.height + "px;margin:0;z-index:1000001;pointer-events:none;transition:transform " + durationMs + "ms cubic-bezier(0.4,0,0.2,1),opacity " + durationMs + "ms ease;transform:translate(0,0);opacity:1;box-sizing:border-box;";
          document.body.appendChild(clone);
          realEl.style.opacity = "0";
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              clone.style.transform = "translate(" + (-dx) + "px," + (-dy) + "px)";
              clone.style.opacity = "0.15";
              setTimeout(() => { clone.remove(); realEl.style.opacity = "1"; realEl.style.transition = "opacity 0.12s ease"; }, durationMs);
            });
          });
        }

        // ── Date focus animation ──────────────────────────────────────────────
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

        // ── Date tracking ─────────────────────────────────────────────────────
        var dateChanged = false;

        // ── Field registry ────────────────────────────────────────────────────
        const allRows = [];
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

        // ── Field picker ──────────────────────────────────────────────────────
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
              if (f) { pick(f); } else { input.value = sn; input.dataset.storageName = sn; }
            }
          };
        }

        // ── Slide toggle ──────────────────────────────────────────────────────
        const FUNNEL_SVG = '<svg width="11" height="11" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 2h8L6 5.5V8.5L4 7.5V5.5L1 2z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" fill="none"/></svg>';
        function makeSlideToggle(initialType, onChange) {
          const PW = 34, PH = 18, KN = 14;
          const wrap = el("div", { style: "display:flex;align-items:center;gap:5px;flex-shrink:0;cursor:pointer;user-select:none;" });
          const leftIcon = el("span", { style: "display:flex;align-items:center;flex-shrink:0;color:#3b82f6;", title: "Filter" });
          leftIcon.innerHTML = FUNNEL_SVG;
          const pill = el("div", { style: "position:relative;width:" + PW + "px;height:" + PH + "px;border-radius:999px;transition:background 0.22s;flex-shrink:0;" });
          const knob = el("div", { style: "position:absolute;top:" + ((PH - KN) / 2) + "px;width:" + KN + "px;height:" + KN + "px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.25);transition:left 0.22s;" });
          pill.appendChild(knob);
          const rightIcon = el("span", { style: "display:flex;align-items:center;flex-shrink:0;font-size:13px;line-height:1;", title: "Key" });
          rightIcon.textContent = "\uD83D\uDD11";
          wrap.appendChild(leftIcon); wrap.appendChild(pill); wrap.appendChild(rightIcon);
          let cur = initialType || "filter", locked = false;
          function apply() {
            if (cur === "filter") { pill.style.background = locked ? "#93c5fd" : "#3b82f6"; knob.style.left = "2px"; leftIcon.style.opacity = "0.9"; rightIcon.style.opacity = "0.35"; }
            else { pill.style.background = locked ? "#fcd34d" : "#f59e0b"; knob.style.left = (PW - KN - 2) + "px"; leftIcon.style.opacity = "0.35"; rightIcon.style.opacity = "1"; }
            wrap.style.cursor = locked ? "not-allowed" : "pointer";
            wrap.title = locked ? "Clear this field's value to change type" : (cur === "filter" ? "Filter - click to switch to Key" : "Key - click to switch to Filter");
          }
          wrap.addEventListener("click", () => { if (locked) return; cur = cur === "filter" ? "key" : "filter"; apply(); if (onChange) onChange(cur); });
          apply();
          return {
            wrap, getType: () => cur, setType: (t) => { cur = t; apply(); },
            lock: () => { locked = true; apply(); }, unlock: () => { locked = false; apply(); }
          };
        }

        // ── AND label ─────────────────────────────────────────────────────────
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

        // ── Pane / carousel state ─────────────────────────────────────────────
        const panes = [];
        let activePaneIndex = 0;
        let ghostPaneEl = null;
        let carouselTrack = null;
        let dotsRow = null;
        let carouselViewport = null;
        let keyRowsContainer = null;
        let fadeMaskLeft = null;
        const PEEK = 80, GAP = 14;
        function getPaneWidth() { return carouselViewport ? Math.max(200, carouselViewport.offsetWidth - PEEK - GAP) : 800; }

        // ── Row entry builder ─────────────────────────────────────────────────
        function buildRowEntry(storageName, initialType, isPhrase) {
          isPhrase = isPhrase || false;
          const entry = { rowEl: null, picker: null, valueInput: null, fieldLabelWrap: null, type: initialType, paneIndex: initialType === "key" ? -1 : 0, locked: false, toggle: null, isPhrase, exclude: false, speaker: "transcript", excludeToggle: null, speakerWrap: null, speakerRadios: null };
          const toggle = makeSlideToggle(initialType, (newType) => {
            entry.type = newType;
            entry.valueInput.value = "";
            entry.valueInput.placeholder = newType === "filter" ? FILTER_PLACEHOLDER : KEY_PLACEHOLDER;
            handleTypeChange(entry, newType);
          });
          entry.toggle = toggle;
          const removeBtn = el("button", { style: "width:22px;height:22px;border-radius:50%;border:1px solid #e5e7eb;background:#fff;color:#aaa;cursor:pointer;font-size:11px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;align-self:center;", title: "Remove" }, "X");
          const fieldLabelWrap = el("div", { style: "flex:0 0 180px;padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;background:#f3f4f6;font-size:13px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;" });
          entry.fieldLabelWrap = fieldLabelWrap;
          let valueInput;
          if (isPhrase) {
            valueInput = el("textarea", { rows: 2, placeholder: initialType === "filter" ? FILTER_PLACEHOLDER : KEY_PLACEHOLDER, style: "flex:1;min-width:0;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;resize:vertical;font-family:Segoe UI,Arial,sans-serif;font-size:13px;" });
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
            valueInput = el("input", { type: "text", placeholder: initialType === "filter" ? FILTER_PLACEHOLDER : KEY_PLACEHOLDER, style: "flex:1;min-width:0;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;" });
            valueInput.addEventListener("paste", (e) => {
              if (entry.type !== "key") return;
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
              pill.style.background = "#ef4444";
              knob.style.left = (PW - KN - 2) + "px";
              label.textContent = "EXCLUDE";
              label.style.color = "#ef4444";
              if (entry.rowEl) entry.rowEl.style.background = "rgba(239,68,68,0.06)";
            } else {
              pill.style.background = "#22c55e";
              knob.style.left = "2px";
              label.textContent = "INCLUDE";
              label.style.color = "#22c55e";
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
            syncFieldAcrossPanes(entry, f.storageName, f.displayName);
          });
          if (picker) picker.wrapper.style.display = "none";
          entry.picker = picker;
          if (isPhrase) {
            fieldLabelWrap.textContent = "Phrase";
            fieldLabelWrap.title = "Phrase search - each line is a separate search";
            fieldLabelWrap.style.fontStyle = "italic";
            fieldLabelWrap.style.color = "#6b7280";
          }
          function checkLock() {
            const hasVal = valueInput.value.trim().length > 0;
            if (hasVal && panes.length > 1 && entry.type === "filter") { toggle.lock(); entry.locked = true; }
            else { toggle.unlock(); entry.locked = false; }
          }
          valueInput.addEventListener("input", checkLock);
          const rowEl = el("div", { style: "display:flex;gap:8px;align-items:center;margin:4px 0;" });
          rowEl.appendChild(removeBtn); rowEl.appendChild(toggle.wrap); rowEl.appendChild(fieldLabelWrap); rowEl.appendChild(valueInput);
          if (picker) rowEl.appendChild(picker.wrapper);
          if (isPhrase) {
          const subRow = el("div", { style: "display:flex;align-items:center;gap:10px;margin:4px 0 2px 30px;" });
          subRow.appendChild(excludeToggle.wrap);
          if (speakerWrap) subRow.appendChild(speakerWrap);
          rowEl.style.flexWrap = "wrap";
          rowEl.appendChild(subRow);
        } else {
          rowEl.insertBefore(excludeToggle.wrap, toggle.wrap);
        }
          entry.rowEl = rowEl;
          allRows.push(entry);
          removeBtn.onclick = () => {
            removeAdjacentAndLabel(rowEl); rowEl.remove();
            const idx = allRows.indexOf(entry); if (idx !== -1) allRows.splice(idx, 1);
            for (let i = 0; i < panes.length; i++) { const pi = panes[i].rows.indexOf(entry); if (pi !== -1) panes[i].rows.splice(pi, 1); }
          };
          if (storageName && picker) {
            picker.preselect(storageName);
            const f = metadataFields.find((x) => x.storageName === storageName);
            fieldLabelWrap.textContent = f ? f.displayName : storageName;
            fieldLabelWrap.title = f ? f.displayName : storageName;
          }
          return entry;
        }

        function syncFieldAcrossPanes(changedEntry, storageName, displayName) {
          if (changedEntry.type !== "filter" || changedEntry.isPhrase) return;
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

        function handleTypeChange(entry, newType) {
          if (newType === "key") {
            const firstChild = keyRowsContainer.firstChild;
            removeAdjacentAndLabel(entry.rowEl); entry.rowEl.remove();
            for (let i = 0; i < panes.length; i++) { const pi = panes[i].rows.indexOf(entry); if (pi !== -1) panes[i].rows.splice(pi, 1); }
            entry.paneIndex = -1;
            flipAnimate(entry.rowEl, keyRowsContainer, firstChild, 260);
          } else {
            entry.rowEl.remove();
            entry.paneIndex = activePaneIndex;
            let targetPane = null;
            for (let i = 0; i < panes.length; i++) { if (panes[i].index === activePaneIndex) { targetPane = panes[i]; break; } }
            if (targetPane) {
              const firstRow = targetPane.rowsContainer.firstChild;
              if (firstRow) { const andLbl = makeAndLabel(); targetPane.rowsContainer.insertBefore(andLbl, firstRow); flipAnimate(entry.rowEl, targetPane.rowsContainer, andLbl, 260); }
              else { flipAnimate(entry.rowEl, targetPane.rowsContainer, null, 260); }
              targetPane.rows.unshift(entry);
              for (let i = 0; i < panes.length; i++) {
                const pane = panes[i];
                if (pane.index === activePaneIndex) continue;
                const newEntry = buildRowEntry(entry.picker ? entry.picker.getStorageName() : "", "filter", entry.isPhrase);
                newEntry.paneIndex = pane.index;
                const pf = pane.rowsContainer.firstChild;
                if (pf) { const al = makeAndLabel(); pane.rowsContainer.insertBefore(al, pf); pane.rowsContainer.insertBefore(newEntry.rowEl, al); }
                else { pane.rowsContainer.appendChild(newEntry.rowEl); }
                pane.rows.unshift(newEntry);
              }
            }
          }
        }

        // ── Pane builder ──────────────────────────────────────────────────────
        function buildPaneEl(paneIndex) {
          const paneEl = el("div", { style: "background:#fff;border-radius:14px;border:1px solid rgba(59,130,246,0.18);padding:18px 20px 14px;box-sizing:border-box;flex-shrink:0;position:relative;box-shadow:0 2px 10px rgba(59,130,246,0.06);" });
          paneEl.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:14px;" }, "Search Filters"));
          const rowsContainer = el("div", {});
          paneEl.appendChild(rowsContainer);
          const addBtn = el("button", { style: "margin-top:12px;padding:6px 12px;border-radius:8px;border:1px solid #3b82f6;background:#fff;color:#3b82f6;cursor:pointer;font-size:12px;" }, "+ Add Filter");
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
          addBtn.onclick = () => { if (paneObj.rows.length > 0) rowsContainer.appendChild(makeAndLabel()); const entry = buildRowEntry("", "filter", false); entry.paneIndex = paneObj.index; rowsContainer.appendChild(entry.rowEl); paneObj.rows.push(entry); };
          addPhraseBtn.onclick = () => { if (paneObj.rows.length > 0) rowsContainer.appendChild(makeAndLabel()); const entry = buildRowEntry("", "filter", true); entry.paneIndex = paneObj.index; rowsContainer.appendChild(entry.rowEl); paneObj.rows.push(entry); };
          return paneObj;
        }

        function populatePaneDefaults(pane) {
          for (let i = 0; i < DEFAULT_FILTER_STORAGES.length; i++) {
            if (i > 0) pane.rowsContainer.appendChild(makeAndLabel());
            const entry = buildRowEntry(DEFAULT_FILTER_STORAGES[i], "filter", false);
            entry.paneIndex = pane.index; pane.rows.push(entry); pane.rowsContainer.appendChild(entry.rowEl);
          }
        }

        // ── Ghost pane ────────────────────────────────────────────────────────
        function buildGhostPane(paneIndex) {
          const ghost = el("div", { style: "background:#fff;border-radius:14px;border:1px solid rgba(59,130,246,0.10);padding:18px 20px 14px;box-sizing:border-box;flex-shrink:0;position:relative;box-shadow:0 2px 10px rgba(59,130,246,0.03);opacity:0.55;pointer-events:none;" });
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
            const entry = buildRowEntry(sn, "filter", refEntry.isPhrase);
            entry.paneIndex = newIndex; newPane.rows.push(entry); newPane.rowsContainer.appendChild(entry.rowEl);
          }
          panes.push(newPane);
          if (ghostPaneEl && carouselTrack.contains(ghostPaneEl)) { carouselTrack.replaceChild(newPane.el, ghostPaneEl); }
          else { carouselTrack.appendChild(newPane.el); }
          ghostPaneEl = buildGhostPane(newIndex + 1);
          carouselTrack.appendChild(ghostPaneEl);
          resizePanes(); slideTo(newIndex); updateDots();
          allRows.forEach((r) => { if (r.type === "filter" && r.valueInput.value.trim() && r.toggle) { r.toggle.lock(); r.locked = true; } });
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
          if (panes.length === 1) { allRows.forEach((r) => { if (r.type === "filter" && r.toggle) { r.toggle.unlock(); r.locked = false; } }); }
        }

        // ── Carousel ──────────────────────────────────────────────────────────
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
          if (fadeMaskLeft) fadeMaskLeft.style.opacity = index > 0 ? "1" : "0";
        }
        function slideTo(index) {
          if (index < 0 || index >= panes.length) return;
          const prev = activePaneIndex; activePaneIndex = index;
          applySlideTransform(index, true); updateDots();
          if (index < prev) { setTimeout(() => { pruneEmptyTailPanes(); }, 440); }
          allRows.forEach((r) => {
            if (r.type === "filter" && r.toggle) {
              const hasVal = r.valueInput.value.trim().length > 0;
              if (hasVal && panes.length > 1) { r.toggle.lock(); r.locked = true; }
              else { r.toggle.unlock(); r.locked = false; }
            }
          });
        }

        // ── Modal ─────────────────────────────────────────────────────────────
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
        const headerRow = el("div", { style: "display:flex;align-items:center;gap:10px;margin-bottom:4px;" });
        headerRow.appendChild(el("div", { style: "font-size:18px;font-weight:600;flex:1;" }, "Nexidia Search"));
        const loadSearchBtn = el("button", { style: "padding:6px 12px;border-radius:8px;border:1px solid #6366f1;background:#fff;color:#6366f1;cursor:pointer;font-size:12px;" }, "\uD83D\uDCC2 Load");
        loadSearchBtn.onclick = () => { openLoadPanel(); };
        const saveSearchBtn = el("button", { style: "padding:6px 12px;border-radius:8px;border:1px solid #22c55e;background:#fff;color:#16a34a;cursor:pointer;font-size:12px;" }, "\uD83D\uDCBE Save");
        saveSearchBtn.onclick = () => { openSavePrompt(serializeSearch(), ""); };
        headerRow.appendChild(loadSearchBtn);
        headerRow.appendChild(saveSearchBtn);
        card.appendChild(headerRow);

        // ── Column prefs warning ──────────────────────────────────────────────
        const prefsError = api.getShared("columnPrefsError");
        if (prefsError) {
          const link = el("a", { href: "https://apug01.nxondemand.com/NxIA/Search/ForensicSearch.aspx", target: "_blank", style: "color:#92400e;font-weight:600;" }, "Open Nexidia Search");
          const warn = el("div", { style: "background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:8px 12px;font-size:12px;color:#92400e;margin-bottom:10px;display:flex;align-items:center;gap:6px;" },
            "\u26A0\uFE0F Column preferences could not be loaded. ");
          warn.appendChild(link);
          warn.appendChild(document.createTextNode(" and relaunch to use your saved column layout."));
          card.appendChild(warn);
        }

        card.appendChild(hr());

        // ── Date section ──────────────────────────────────────────────────────
        const dateSectionWrapper = el("div", { style: "margin-bottom:0;" });
        dateSectionWrapper.appendChild(section("Date Range"));
        const today = new Date();
        const monthAgo = new Date(today);
        monthAgo.setMonth(today.getMonth() - 1);
        const fromDate = mkField("From", "date");
        const toDate = mkField("To", "date");
        fromDate.input.valueAsDate = monthAgo;
        toDate.input.valueAsDate = today;
        fromDate.input.addEventListener("change", () => { dateChanged = true; });
        toDate.input.addEventListener("change", () => { dateChanged = true; });
        const dateRow = el("div", { style: "display:flex;gap:10px;align-items:flex-end;margin:8px 0;flex-wrap:wrap;" });
        dateRow.appendChild(fromDate.wrap); dateRow.appendChild(toDate.wrap);
        dateSectionWrapper.appendChild(dateRow);
        card.appendChild(dateSectionWrapper);
        card.appendChild(hr());

        // ── Carousel setup ────────────────────────────────────────────────────
        const carouselOuter = el("div", { style: "position:relative;" });
        carouselViewport = el("div", { style: "overflow:hidden;border-radius:14px;position:relative;" });
        fadeMaskLeft = el("div", { style: "position:absolute;top:0;left:0;bottom:0;width:" + PEEK + "px;background:linear-gradient(to right,rgba(248,250,252,0.97),rgba(248,250,252,0));z-index:6;pointer-events:auto;cursor:pointer;opacity:0;transition:opacity 0.3s;" });
        fadeMaskLeft.onclick = () => { if (activePaneIndex > 0) slideTo(activePaneIndex - 1); };
        const fadeMaskRight = el("div", { style: "position:absolute;top:0;right:0;bottom:0;width:" + PEEK + "px;background:linear-gradient(to left,rgba(248,250,252,0.6),rgba(248,250,252,0));z-index:6;pointer-events:auto;cursor:pointer;" });
        fadeMaskRight.onclick = () => { if (activePaneIndex < panes.length - 1) { slideTo(activePaneIndex + 1); } else { activateNextPane(); } };
        carouselTrack = el("div", { style: "display:flex;flex-direction:row;will-change:transform;" });
        carouselViewport.appendChild(fadeMaskLeft); carouselViewport.appendChild(fadeMaskRight); carouselViewport.appendChild(carouselTrack);
        carouselOuter.appendChild(carouselViewport);
        dotsRow = el("div", { style: "display:flex;justify-content:center;gap:6px;margin-top:10px;" });
        card.appendChild(carouselOuter); card.appendChild(dotsRow); card.appendChild(hr());

        // ── Key section ───────────────────────────────────────────────────────
        const keySection = el("div", { style: "background:rgba(240,253,244,0.85);border:1px solid rgba(34,197,94,0.22);border-radius:14px;padding:16px 20px 14px;margin-bottom:14px;" });
        const keyHeaderRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:6px;" });
        keyHeaderRow.appendChild(el("span", { style: "font-size:16px;" }, "\uD83D\uDD11"));
        keyHeaderRow.appendChild(el("span", { style: "font-size:16px;font-weight:700;color:#1e3a5f;" }, "Search Keys"));
        keyHeaderRow.appendChild(el("span", { style: "font-size:12px;color:#6b7280;font-style:italic;" }, "Multiple values accepted in any field."));
        keySection.appendChild(keyHeaderRow);
        keyRowsContainer = el("div", {});
        keySection.appendChild(keyRowsContainer);
        const keyBtnRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap;" });
        const addKeyBtn = el("button", { style: "padding:6px 12px;border-radius:8px;border:1px solid #22c55e;background:#fff;color:#22c55e;cursor:pointer;font-size:12px;" }, "+ Add Key Field");
        addKeyBtn.onclick = () => { const e = buildRowEntry("", "key", false); e.paneIndex = -1; keyRowsContainer.appendChild(e.rowEl); };
        const addKeyPhraseBtn = el("button", { style: "padding:6px 12px;border-radius:8px;border:1px solid #6366f1;background:#fff;color:#6366f1;cursor:pointer;font-size:12px;" }, "+ Add Phrase");
        addKeyPhraseBtn.onclick = () => { const e = buildRowEntry("", "key", true); e.paneIndex = -1; keyRowsContainer.appendChild(e.rowEl); };
        keyBtnRow.appendChild(addKeyBtn); keyBtnRow.appendChild(addKeyPhraseBtn);
        keySection.appendChild(keyBtnRow);
        card.appendChild(keySection);
        const searchBar = el("div", { style: "position:sticky;bottom:0;padding:16px 0 4px;background:linear-gradient(to bottom, rgba(248,250,252,0) 0%, #f8fafc 30%);display:flex;justify-content:center;z-index:10;" });
        const mainSearchBtn = el("button", { style: "padding:12px 72px;border-radius:24px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(59,130,246,0.4);letter-spacing:0.5px;transition:box-shadow 0.2s;" }, "Search");
        mainSearchBtn.onmouseenter = () => { mainSearchBtn.style.boxShadow = "0 6px 22px rgba(59,130,246,0.55)"; };
        mainSearchBtn.onmouseleave = () => { mainSearchBtn.style.boxShadow = "0 4px 16px rgba(59,130,246,0.4)"; };
        mainSearchBtn.onclick = () => { runSearch(); };
        searchBar.appendChild(mainSearchBtn);
        card.appendChild(searchBar);
        modal.appendChild(card);
        document.body.appendChild(modal);
        document.body.appendChild(stickyClose);

        // ── Build first pane ──────────────────────────────────────────────────
        const firstPane = buildPaneEl(0);
        populatePaneDefaults(firstPane);
        panes.push(firstPane);
        carouselTrack.appendChild(firstPane.el);
        ghostPaneEl = buildGhostPane(1);
        carouselTrack.appendChild(ghostPaneEl);

        var dismissDateAnim = null;
        requestAnimationFrame(() => {
          resizePanes();
          for (let i = 0; i < DEFAULT_KEY_LIST.length; i++) {
            const e = buildRowEntry(DEFAULT_KEY_LIST[i], "key", false);
            e.paneIndex = -1; keyRowsContainer.appendChild(e.rowEl);
          }
          updateDots();
          setTimeout(() => {
            dismissDateAnim = runDateFocusAnimation(card, dateSectionWrapper, () => { dismissDateAnim = null; });
          }, 120);
        });
        window.addEventListener("resize", resizePanes);

        // ── Date confirmation ─────────────────────────────────────────────────
        function formatDateDisplay(isoStr) {
          if (!isoStr) return isoStr;
          const parts = isoStr.split("-");
          if (parts.length !== 3) return isoStr;
          return parts[1] + "/" + parts[2] + "/" + parts[0];
        }
        function confirmDateRange(fromVal, toVal) {
          if (dateChanged) return true;
          const msg = "Date Range fields have not been updated.\n\nDid you want to search from " + formatDateDisplay(fromVal) + " to " + formatDateDisplay(toVal) + "?\n\nClick OK to proceed, or Cancel to go back and adjust.";
          const proceed = confirm(msg);
          if (!proceed) {
            if (dismissDateAnim) dismissDateAnim();
            setTimeout(() => { dismissDateAnim = runDateFocusAnimation(card, dateSectionWrapper, () => { dismissDateAnim = null; }); }, 80);
          }
          return proceed;
        }

        // ── Normalization ─────────────────────────────────────────────────────
        
        function splitValues(raw) {
            return String(raw || "").replace(/\r\n/g, "\n").replace(/\t/g, "\n").split(/[\n,]+/).map((s) => s.trim().replace(/^["']+|["']+$/g, "").trim()).filter(Boolean);
        }

        function isoStart(d) { return d + "T00:00:00Z"; }
        function isoEnd(d) { return d + "T23:59:59Z"; }

        function normalizeParamName(p) {
          if (!p) return p;
          const s = String(p).trim();
          if (s.toLowerCase() === "experienceid") return "ExperienceId";
          if (s.toLowerCase() === "site") return "Site";
          if (s.toLowerCase() === "dnis") return "DNIS";
          let m = s.match(/udfvarchar(\d+)/i); if (m) return "UDFVarchar" + m[1];
          m = s.match(/udfnumeric(\d+)/i); if (m) return "UDFNumeric" + m[1];
          m = s.match(/udfint(\d+)/i); if (m) return "UDFInt" + m[1];
          return s;
        }
        function normalizeKeywordValues(pn, vals) {
          if (normalizeParamName(pn) === "UDFVarchar120") return vals.map((v) => String(v).toLowerCase());
          return vals;
        }
        function buildKeywordFilter(pn, vals) {
          return { operator: "IN", type: "KEYWORD", parameterName: normalizeParamName(pn), value: normalizeKeywordValues(pn, vals) };
        }
        function buildTextFilter(phrase, paramName) {
          return { operator: "IN", type: "TEXT", parameterName: paramName || "transcript", value: { phrases: [phrase], anotherPhrases: [], relevance: "Anywhere", position: "Begin" } };
        }

        async function safeRead(res) {
          const ct = (res.headers.get("content-type") || "").toLowerCase();
          const text = await res.text();
          if (ct.includes("application/json")) { try { return { json: JSON.parse(text), text }; } catch (_) { return { json: null, text }; } }
          return { json: null, text };
        }
        function pickRows(json) {
          if (!json) return [];
          if (Array.isArray(json.results)) return json.results;
          if (Array.isArray(json.items)) return json.items;
          if (Array.isArray(json.rows)) return json.rows;
          if (Array.isArray(json.data)) return json.data;
          if (json.result && Array.isArray(json.result.results)) return json.result.results;
          return [];
        }
        function getFieldValue(rowObj, key) {
          if (!rowObj) return "";
          const want = String(key || "");
          if (!want) return "";
          if (rowObj[want] !== undefined && rowObj[want] !== null) return String(rowObj[want]);
          const lower = want.toLowerCase();
          const keys1 = Object.keys(rowObj);
          for (let i = 0; i < keys1.length; i++) { if (keys1[i].toLowerCase() === lower && rowObj[keys1[i]] !== null) return String(rowObj[keys1[i]]); }
          const containers = [rowObj.fields, rowObj.values, rowObj.data];
          for (let ci = 0; ci < containers.length; ci++) {
            const c = containers[ci];
            if (!c || typeof c !== "object") continue;
            if (c[want] !== undefined && c[want] !== null) return String(c[want]);
            const keys2 = Object.keys(c);
            for (let i = 0; i < keys2.length; i++) { if (keys2[i].toLowerCase() === lower && c[keys2[i]] !== null) return String(c[keys2[i]]); }
          }
          return "";
        }

        // ── Execute search ────────────────────────────────────────────────────
        async function executeSearch(runSets, baseFields, dateFilter, labelPrefix, sessionToken, excludeGroup) {
          const merged = new Map();
          const passthroughNoKey = [];
          let totalFetched = 0;
          const totalRuns = runSets.length;
          const distinctPhraseLabels = new Set();

          for (let si = 0; si < runSets.length; si++) {
            const runSet = runSets[si];
            const phraseExpansions = runSet.phraseGroups.length > 0 ? runSet.phraseGroups : [{ group: null, display: null }];

            for (let ei = 0; ei < phraseExpansions.length; ei++) {
              const expansion = phraseExpansions[ei];
              if (expansion.display !== null) distinctPhraseLabels.add(expansion.display);
              progressUI.set("Searching (" + labelPrefix + " " + (si + 1) + "/" + totalRuns + ")...", 25, "");
              let from = 0;
              const setRows = [];

              while (true) {
                // ── Session check before each page fetch ──────────────────────
                if (!isSessionCurrent(sessionToken)) return null;
                
                const interactionFilters = [];
                if (runSet.keywordGroup) interactionFilters.push(runSet.keywordGroup);
                if (expansion.group) interactionFilters.push(expansion.group);
                if (runSet.keyFilters) { for (let kfi = 0; kfi < runSet.keyFilters.length; kfi++) interactionFilters.push(runSet.keyFilters[kfi]); }
                if (excludeGroup) interactionFilters.push(excludeGroup);
                interactionFilters.push(dateFilter);

                const payload = {
                  languageFilter: { languages: [] }, namedSetId: null,
                  from, to: from + PAGE_SIZE, fields: baseFields,
                  query: { operator: "AND", invertOperator: false, filters: [{ operator: "AND", invertOperator: false, filterType: "interactions", filters: interactionFilters }] }
                };

                api.setShared("lastSearchQuery", payload);
                
                let res;
                try {
                  res = await fetch(SEARCH_URL, {
                    method: "POST", credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                    signal: abortController.signal
                  });
                } catch (err) {
                  if (err.name === "AbortError") return null;
                  throw err;
                }

                if (!res.ok) { const sr = await safeRead(res); throw new Error("Search failed: HTTP " + res.status + "\n" + sr.text.slice(0, 300)); }
                const sr = await safeRead(res);
                const rows = pickRows(sr.json);
                if (!rows.length) break;
                for (let ri = 0; ri < rows.length; ri++) setRows.push(rows[ri]);
                totalFetched += rows.length;
                progressUI.set(
                  "Searching (" + labelPrefix + " " + (si + 1) + "/" + totalRuns + ")...",
                  Math.min(80, 25 + Math.floor((si / Math.max(1, totalRuns)) * 55)),
                  "Set: " + setRows.length + " \u2022 Total: " + totalFetched
                );
                if (setRows.length >= MAX_ROWS || rows.length < PAGE_SIZE) break;
                from += PAGE_SIZE;
                await sleep(250);
              }

              const rowLabel = expansion.display !== null ? expansion.display : null;
              for (let ri = 0; ri < setRows.length; ri++) {
                const r = setRows[ri];
                const transId = getFieldValue(r, "UDFVarchar110");
                const normTransId = (transId && transId.trim() && transId !== "0") ? transId.trim() : null;
                if (!normTransId) {
                  passthroughNoKey.push({ row: r, phrases: rowLabel !== null ? [rowLabel] : [] });
                  continue;
                }
                const existing = merged.get(normTransId);
                if (!existing) {
                  merged.set(normTransId, { row: r, phrases: rowLabel !== null ? [rowLabel] : [] });
                } else {
                  if (rowLabel !== null && !existing.phrases.includes(rowLabel)) existing.phrases.push(rowLabel);
                  for (let fi = 0; fi < baseFields.length; fi++) {
                    const k = baseFields[fi];
                    const cur = getFieldValue(existing.row, k);
                    if (cur && cur !== "0") continue;
                    const nxt = getFieldValue(r, k);
                    if (nxt && nxt !== "0") existing.row[k] = nxt;
                  }
                }
              }
            }
          }

          if (!isSessionCurrent(sessionToken)) return null;

          const finalRows = [];
          let maxPhraseCols = 1;
          for (const v of merged.values()) { if (v.phrases.length > maxPhraseCols) maxPhraseCols = v.phrases.length; finalRows.push(v); }
          for (let i = 0; i < passthroughNoKey.length; i++) { if (passthroughNoKey[i].phrases.length > maxPhraseCols) maxPhraseCols = passthroughNoKey[i].phrases.length; finalRows.push(passthroughNoKey[i]); }
          return { finalRows, maxPhraseCols, includePhraseCol: distinctPhraseLabels.size >= 2 };
        }

        function buildPhraseGroups(phraseEntries) {
          const include = [];
          const exclude = [];
          for (let i = 0; i < phraseEntries.length; i++) {
            const pe = phraseEntries[i];
            const lines = splitValues(pe.valueInput.value);
            const speaker = pe.speaker || "transcript";
            const target = pe.exclude ? exclude : include;
            for (let j = 0; j < lines.length; j++) {
              target.push({ group: buildTextFilter(lines[j], speaker), display: '"' + lines[j] + '"' });
            }
          }
          return { include, exclude };
        }

        
        // ── Saved search engine ──────────────────────────────────────────────
const LS_KEY = "NEXIDIA_SAVED_SEARCHES";

function getSavedSearches() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (_) { return {}; }
}

function saveSearchToStorage(name, payload) {
  const all = getSavedSearches();
  all[name] = payload;
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

function deleteSearchFromStorage(name) {
  const all = getSavedSearches();
  delete all[name];
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

function exportSearchAsFile(name, payload) {
  const out = JSON.stringify({ name: name, dateFrom: payload.dateFrom, dateTo: payload.dateTo, panes: payload.panes, keys: payload.keys });
  const blob = new Blob([out], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[^a-zA-Z0-9_\- ]/g, "_") + ".txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function serializeSearch() {
  return {
    dateFrom: fromDate.input.value,
    dateTo: toDate.input.value,
    panes: panes.map(function(pane) {
      const filters = [];
      const phrases = [];
      for (let i = 0; i < pane.rows.length; i++) {
        const row = pane.rows[i];
        if (row.isPhrase) {
          phrases.push({ value: row.valueInput.value, exclude: row.exclude, speaker: row.speaker });
        } else {
          const sn = row.picker ? row.picker.getStorageName() : "";
          filters.push({ storageName: sn, value: row.valueInput.value, exclude: row.exclude });
        }
      }
      return { filters, phrases };
    }),
    keys: (function() {
      const keys = [];
      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];
        if (row.type !== "key") continue;
        if (row.isPhrase) {
          keys.push({ isPhrase: true, value: row.valueInput.value, exclude: row.exclude, speaker: row.speaker });
        } else {
          const sn = row.picker ? row.picker.getStorageName() : "";
          keys.push({ storageName: sn, value: row.valueInput.value, exclude: row.exclude });
        }
      }
      return keys;
    })()
  };
}

function deserializeSearch(payload) {
  if (payload.dateFrom) { fromDate.input.value = payload.dateFrom; dateChanged = true; }
  if (payload.dateTo) { toDate.input.value = payload.dateTo; dateChanged = true; }

  while (panes.length > 1) {
    const last = panes[panes.length - 1];
    for (let i = 0; i < last.rows.length; i++) {
      const idx = allRows.indexOf(last.rows[i]);
      if (idx !== -1) allRows.splice(idx, 1);
    }
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

  const keyEntries = allRows.filter((r) => r.type === "key");
  for (let i = keyEntries.length - 1; i >= 0; i--) {
    const row = keyEntries[i];
    const idx = allRows.indexOf(row);
    if (idx !== -1) allRows.splice(idx, 1);
    if (row.rowEl.parentNode) row.rowEl.parentNode.removeChild(row.rowEl);
  }
  keyRowsContainer.innerHTML = "";

  const paneList = payload.panes || [];
  for (let pi = 0; pi < paneList.length; pi++) {
    const pd = paneList[pi];
    let pane;
    if (pi === 0) {
      pane = fp;
    } else {
      pane = buildPaneEl(pi);
      panes.push(pane);
      if (ghostPaneEl && carouselTrack.contains(ghostPaneEl)) {
        carouselTrack.insertBefore(pane.el, ghostPaneEl);
      } else {
        carouselTrack.appendChild(pane.el);
      }
    }
    const filters = pd.filters || [];
    for (let fi = 0; fi < filters.length; fi++) {
      if (pane.rows.length > 0) pane.rowsContainer.appendChild(makeAndLabel());
      const entry = buildRowEntry(filters[fi].storageName || "", "filter", false);
      entry.paneIndex = pane.index;
      entry.valueInput.value = filters[fi].value || "";
      if (filters[fi].exclude) entry.excludeToggle.set(true);
      pane.rows.push(entry);
      pane.rowsContainer.appendChild(entry.rowEl);
    }
    const phrases = pd.phrases || [];
    for (let phi = 0; phi < phrases.length; phi++) {
      if (pane.rows.length > 0) pane.rowsContainer.appendChild(makeAndLabel());
      const entry = buildRowEntry("", "filter", true);
      entry.paneIndex = pane.index;
      const pd_phrase = typeof phrases[phi] === "string" ? { value: phrases[phi] } : phrases[phi];
      entry.valueInput.value = pd_phrase.value || "";
      if (pd_phrase.exclude) entry.excludeToggle.set(true);
      if (pd_phrase.speaker && entry.speakerRadios) {
        entry.speaker = pd_phrase.speaker;
        for (let sri = 0; sri < entry.speakerRadios.length; sri++) {
          entry.speakerRadios[sri].radio.checked = entry.speakerRadios[sri].value === pd_phrase.speaker;
        }
      }
      pane.rows.push(entry);
      pane.rowsContainer.appendChild(entry.rowEl);
    }
  }

  if (!paneList.length) populatePaneDefaults(fp);

  if (ghostPaneEl && ghostPaneEl.parentNode) ghostPaneEl.parentNode.removeChild(ghostPaneEl);
  ghostPaneEl = buildGhostPane(panes.length);
  carouselTrack.appendChild(ghostPaneEl);

  const keys = payload.keys || [];
  for (let ki = 0; ki < keys.length; ki++) {
    const kd = keys[ki];
    const isPhrase = kd.isPhrase || false;
    const entry = buildRowEntry(isPhrase ? "" : (kd.storageName || ""), "key", isPhrase);
    entry.paneIndex = -1;
    entry.valueInput.value = kd.value || "";
    if (kd.exclude) entry.excludeToggle.set(true);
    if (kd.speaker && entry.speakerRadios) {
      entry.speaker = kd.speaker;
      for (let sri = 0; sri < entry.speakerRadios.length; sri++) {
        entry.speakerRadios[sri].radio.checked = entry.speakerRadios[sri].value === kd.speaker;
      }
    }
    keyRowsContainer.appendChild(entry.rowEl);
  }

  if (!keys.length) {
    for (let i = 0; i < DEFAULT_KEY_LIST.length; i++) {
      const e = buildRowEntry(DEFAULT_KEY_LIST[i], "key", false);
      e.paneIndex = -1;
      keyRowsContainer.appendChild(e.rowEl);
    }
  }

  resizePanes();
  updateDots();
  slideTo(0);
}

function openSavePrompt(payload, suggestedName) {
  const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000003;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
  const box = el("div", { style: "background:#fff;width:380px;border-radius:12px;padding:22px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
  box.appendChild(el("div", { style: "font-size:14px;font-weight:700;color:#111827;margin-bottom:12px;" }, "Save Search"));
  box.appendChild(el("div", { style: "font-size:11px;color:#6b7280;line-height:1.5;margin-bottom:12px;" }, "Your search will be saved to this browser\u2019s local storage. Clearing cookies or browser data will erase saved searches. Use Save & Export to download a backup file you can reload later by uploading or pasting."));
  const nameInput = el("input", { type: "text", placeholder: "Name your search...", value: suggestedName || "", style: "width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;margin-bottom:14px;" });
  box.appendChild(nameInput);
  const btnRow = el("div", { style: "display:flex;gap:8px;" });
  const saveBtn = el("button", { style: "flex:1;padding:9px;border-radius:8px;border:0;background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;font-size:13px;font-weight:600;cursor:pointer;" }, "Save");
  const expBtn = el("button", { style: "flex:1;padding:9px;border-radius:8px;border:0;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;font-size:13px;font-weight:600;cursor:pointer;" }, "Save & Export");
  const cancelBtn = el("button", { style: "width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:13px;cursor:pointer;color:#6b7280;" }, "Cancel");
  saveBtn.onclick = () => { const n = nameInput.value.trim(); if (!n) { nameInput.style.borderColor = "#ef4444"; return; } saveSearchToStorage(n, payload); overlay.remove(); };
  expBtn.onclick = () => { const n = nameInput.value.trim(); if (!n) { nameInput.style.borderColor = "#ef4444"; return; } saveSearchToStorage(n, payload); exportSearchAsFile(n, payload); overlay.remove(); };
  cancelBtn.onclick = () => overlay.remove();
  btnRow.appendChild(saveBtn); btnRow.appendChild(expBtn);
  box.appendChild(btnRow); box.appendChild(cancelBtn);
  overlay.appendChild(box); document.body.appendChild(overlay);
  setTimeout(() => nameInput.focus(), 50);
}

function openLoadPanel() {
  const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000003;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
  const box = el("div", { style: "background:#fff;width:460px;max-height:80vh;overflow:auto;border-radius:12px;padding:22px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
  box.appendChild(el("div", { style: "font-size:14px;font-weight:700;color:#111827;margin-bottom:12px;" }, "Load Search"));
  const listWrap = el("div", { style: "margin-bottom:14px;" });

  function renderList() {
    listWrap.innerHTML = "";
    const saved = getSavedSearches();
    const names = Object.keys(saved);
    if (!names.length) {
      listWrap.appendChild(el("div", { style: "font-size:12px;color:#6b7280;padding:8px 0;" }, "No saved searches."));
      return;
    }
    for (let ni = 0; ni < names.length; ni++) {
      const name = names[ni];
      const row = el("div", { style: "display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px;" });
      row.appendChild(el("div", { style: "flex:1;font-size:13px;color:#111827;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" }, name));
      const loadBtn = el("button", { style: "padding:4px 10px;border-radius:6px;border:0;background:#3b82f6;color:#fff;font-size:11px;cursor:pointer;font-weight:600;" }, "Load");
      const dlBtn = el("button", { style: "padding:4px 10px;border-radius:6px;border:1px solid #6366f1;background:#fff;color:#6366f1;font-size:11px;cursor:pointer;" }, "Export");
      const delBtn = el("button", { style: "padding:4px 10px;border-radius:6px;border:1px solid #ef4444;background:#fff;color:#ef4444;font-size:11px;cursor:pointer;" }, "Del");
      (function(n) {
        loadBtn.onclick = () => { overlay.remove(); deserializeSearch(saved[n]); };
        dlBtn.onclick = () => { exportSearchAsFile(n, saved[n]); };
        delBtn.onclick = () => { if (confirm("Delete \"" + n + "\"?")) { deleteSearchFromStorage(n); renderList(); } };
      })(name);
      row.appendChild(loadBtn); row.appendChild(dlBtn); row.appendChild(delBtn);
      listWrap.appendChild(row);
    }
  }

  renderList();
  box.appendChild(listWrap);
  box.appendChild(el("div", { style: "height:1px;background:#e5e7eb;margin:14px 0;" }));
  box.appendChild(el("div", { style: "font-size:12px;font-weight:600;color:#374151;margin-bottom:8px;" }, "Import from file or paste"));
  const fileInput = el("input", { type: "file", accept: ".txt,.json", style: "font-size:12px;margin-bottom:8px;" });
  const pasteArea = el("textarea", { rows: 3, placeholder: "Paste exported search JSON here...", style: "width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:12px;font-family:monospace;margin-bottom:8px;resize:vertical;" });
  const importBtn = el("button", { style: "padding:7px 16px;border-radius:8px;border:0;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;font-size:13px;font-weight:600;cursor:pointer;" }, "Import & Load");
  const cancelBtn = el("button", { style: "width:100%;margin-top:8px;padding:8px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;cursor:pointer;font-size:13px;color:#6b7280;" }, "Cancel");

  function doImport(text) {
    try {
      const parsed = JSON.parse(text);
      if (!parsed.panes && !parsed.keys) throw new Error("Invalid");
      if (parsed.name) saveSearchToStorage(parsed.name, parsed);
      overlay.remove();
      deserializeSearch(parsed);
    } catch (e) { alert("Invalid search file. Paste the exact output from a previous export."); }
  }

  fileInput.onchange = () => { const f = fileInput.files && fileInput.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { doImport(r.result); }; r.readAsText(f); };
  importBtn.onclick = () => { const t = pasteArea.value.trim(); if (t) doImport(t); };
  cancelBtn.onclick = () => overlay.remove();
  box.appendChild(fileInput); box.appendChild(pasteArea); box.appendChild(importBtn); box.appendChild(cancelBtn);
  overlay.appendChild(box); document.body.appendChild(overlay);
}
        
        
        // ── Hand off to dispatcher ────────────────────────────────────────────
        function sendToDispatcher(result, colPrefs) {
          api.setShared("lastSearchResult", {
            rows: result.finalRows,
            fields: colPrefs.fields,
            headers: colPrefs.headers,
            maxPhraseCols: result.maxPhraseCols,
            includePhraseCol: result.includePhraseCol
          });
          progressUI.remove();
          const dispatcher = api.listTools().find((t) => t.id === "dispatcher");
          if (dispatcher) { dispatcher.open(); }
          else { alert("Dispatcher not loaded. Check manifest."); }
        }

async function runSearch() {
          try {
            const fromVal = fromDate.input.value;
            const toVal = toDate.input.value;
            if (!fromVal || !toVal) { alert("Please select both From and To dates."); return; }
            if (!confirmDateRange(fromVal, toVal)) return;
            resetSession();
            const myToken = api.getShared("searchSessionToken");
            const dateFilter = { parameterName: "recordedDateTime", operator: "BETWEEN", type: "DATE", value: { firstValue: isoStart(fromVal), secondValue: isoEnd(toVal) } };

            const runSets = [];
            const globalExcludes = [];
            for (let pi = 0; pi < panes.length; pi++) {
              const pane = panes[pi];
              const filterEntries = allRows.filter((r) => r.type === "filter" && !r.isPhrase && r.paneIndex === pane.index);
              const phraseEntries = allRows.filter((r) => r.type === "filter" && r.isPhrase && r.paneIndex === pane.index);
              const includeKw = [];
              const excludeKw = [];
              for (let i = 0; i < filterEntries.length; i++) {
                const e = filterEntries[i];
                const sn = e.picker ? e.picker.getStorageName() : "";
                const val = e.valueInput.value.trim();
                if (sn && val) {
                  (e.exclude ? excludeKw : includeKw).push(buildKeywordFilter(sn, splitValues(val)));
                }
              }
              const phraseResult = buildPhraseGroups(phraseEntries);
              for (let ei = 0; ei < excludeKw.length; ei++) globalExcludes.push(excludeKw[ei]);
              for (let ei = 0; ei < phraseResult.exclude.length; ei++) globalExcludes.push(phraseResult.exclude[ei].group);
              const keywordGroup = includeKw.length ? { operator: "AND", invertOperator: false, filters: includeKw } : null;
              const phraseGroups = phraseResult.include;
              if (!keywordGroup && !phraseGroups.length) continue;
              runSets.push({ keywordGroup, phraseGroups, keyFilters: [], label: "Search " + String.fromCharCode(65 + pane.index) });
            }

            const keyEntries = allRows.filter((r) => r.type === "key" && !r.isPhrase);
            const keyPhraseEntries = allRows.filter((r) => r.type === "key" && r.isPhrase);
            const keyIncludeKw = [];
            const keyExcludeKw = [];
            for (let i = 0; i < keyEntries.length; i++) {
              const e = keyEntries[i];
              const sn = e.picker ? e.picker.getStorageName() : "";
              const val = e.valueInput.value.trim();
              if (sn && val) {
                (e.exclude ? keyExcludeKw : keyIncludeKw).push(buildKeywordFilter(sn, splitValues(val)));
              }
            }
            const keyPhraseResult = buildPhraseGroups(keyPhraseEntries);
            for (let ei = 0; ei < keyExcludeKw.length; ei++) globalExcludes.push(keyExcludeKw[ei]);
            for (let ei = 0; ei < keyPhraseResult.exclude.length; ei++) globalExcludes.push(keyPhraseResult.exclude[ei].group);
            const keyAndFilters = [...keyIncludeKw, ...keyPhraseResult.include.map((p) => p.group)];

            if (runSets.length && keyAndFilters.length) {
              for (let i = 0; i < runSets.length; i++) runSets[i].keyFilters = keyAndFilters;
            } else if (!runSets.length && keyAndFilters.length) {
              runSets.push({ keywordGroup: null, phraseGroups: [], keyFilters: keyAndFilters, label: "Key Search" });
            }

            if (!runSets.length) {
              const ok = confirm("No search values entered. This will pull the entire date range. Continue?");
              if (!ok) return;
              runSets.push({ keywordGroup: null, phraseGroups: [], keyFilters: [], label: "All" });
            }

            api.setShared("lastSearchConfig", serializeSearch());
            modal.remove(); stickyClose.remove();
            progressUI.show();
            progressUI.set("Loading column preferences...", 5, "");
            const colPrefs = api.getShared("columnPrefs") || { fields: [], headers: [], source: "default" };
            const searchFields = colPrefs.fields.includes("sourceMediaId") ? colPrefs.fields : colPrefs.fields.concat(["sourceMediaId"]);
            progressUI.set("Searching...", 10, "");
            const excludeGroup = globalExcludes.length ? { operator: "OR", invertOperator: true, filters: globalExcludes } : null;
            const result = await executeSearch(runSets, searchFields, dateFilter, "Search", myToken, excludeGroup);
            if (result === null) { progressUI.remove(); return; }
            if (!result.finalRows.length) { progressUI.set("No results returned.", 100, ""); alert("No results returned."); return; }
            progressUI.set("Done.", 100, "Rows: " + result.finalRows.length);
            sendToDispatcher(result, colPrefs);
          } catch (err) {
            if (err.name === "AbortError") { progressUI.remove(); return; }
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

  function openGlobalSavePrompt() {
  const payload = api.getShared("lastSearchConfig");
  if (!payload) { alert("No search config available. Run a search first."); return; }
  const mk = (tag, props, ...ch) => { const n = document.createElement(tag); Object.assign(n, props || {}); for (const c of ch) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); return n; };
  const LS_G = "NEXIDIA_SAVED_SEARCHES";
  function getAll() { try { return JSON.parse(localStorage.getItem(LS_G)) || {}; } catch (_) { return {}; } }
  function saveIt(name, data) { const a = getAll(); a[name] = data; localStorage.setItem(LS_G, JSON.stringify(a)); }
  function exportIt(name, data) { const b = new Blob([JSON.stringify({ name: name, dateFrom: data.dateFrom, dateTo: data.dateTo, panes: data.panes, keys: data.keys })], { type: "text/plain" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = name.replace(/[^a-zA-Z0-9_\- ]/g, "_") + ".txt"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u); }
  const overlay = mk("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000003;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
  const box = mk("div", { style: "background:#fff;width:380px;border-radius:12px;padding:22px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
  box.appendChild(mk("div", { style: "font-size:14px;font-weight:700;color:#111827;margin-bottom:12px;" }, "Save Search"));
  box.appendChild(mk("div", { style: "font-size:11px;color:#6b7280;line-height:1.5;margin-bottom:12px;" }, "Your search will be saved to this browser\u2019s local storage. Clearing cookies or browser data will erase saved searches. Use Save & Export to download a backup file you can reload later by uploading or pasting."));
  const nameInput = mk("input", { type: "text", placeholder: "Name your search...", style: "width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;margin-bottom:14px;" });
  box.appendChild(nameInput);
  const btnRow = mk("div", { style: "display:flex;gap:8px;" });
  const saveBtn = mk("button", { style: "flex:1;padding:9px;border-radius:8px;border:0;background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;font-size:13px;font-weight:600;cursor:pointer;" }, "Save");
  const expBtn = mk("button", { style: "flex:1;padding:9px;border-radius:8px;border:0;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;font-size:13px;font-weight:600;cursor:pointer;" }, "Save & Export");
  const cancelBtn = mk("button", { style: "width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:13px;cursor:pointer;color:#6b7280;" }, "Cancel");
  saveBtn.onclick = () => { const n = nameInput.value.trim(); if (!n) { nameInput.style.borderColor = "#ef4444"; return; } saveIt(n, payload); overlay.remove(); };
  expBtn.onclick = () => { const n = nameInput.value.trim(); if (!n) { nameInput.style.borderColor = "#ef4444"; return; } saveIt(n, payload); exportIt(n, payload); overlay.remove(); };
  cancelBtn.onclick = () => overlay.remove();
  btnRow.appendChild(saveBtn); btnRow.appendChild(expBtn);
  box.appendChild(btnRow); box.appendChild(cancelBtn);
  overlay.appendChild(box); document.body.appendChild(overlay);
  setTimeout(() => nameInput.focus(), 50);
}
api.setShared("openGlobalSavePrompt", openGlobalSavePrompt);
  
  api.registerTool({ id: "search", label: "Search", open: openSearch });
})();
