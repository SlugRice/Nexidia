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
        const SETTINGS_URL = (appInstanceId) =>
          `${BASE}/NxIA/Search/SettingsDialog.aspx?AppInstanceID=${encodeURIComponent(appInstanceId)}`;

        const PLACEHOLDER = "Separate multiple values with commas or line breaks, or paste from Excel.";
        const PAGE_SIZE = 1000;
        const MAX_ROWS = 50000;
        const FIXED_DT_FORMAT = `m\\/d\\/yyyy\\ h:mm`;
        const FIXED_DURATION_FORMAT = `\\[h\\]\\:mm\\:ss`;

        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        let metadataFields = [];
        try {
          const res = await fetch(METADATA_URL, { credentials: "include", cache: "no-store" });
          if (res.ok) {
            const json = await res.json();
            metadataFields = Array.isArray(json) ? json.filter(f => f.isEnabled !== false) : [];
          }
        } catch (_) { }

        const progressUI = (() => {
          const wrap = document.createElement("div");
          wrap.style.cssText = `
            position:fixed; top:16px; right:16px; z-index:999999;
            width:420px; background:#111827; color:#e5e7eb; border:1px solid #374151;
            border-radius:10px; padding:12px 12px 10px; font-family:Segoe UI, Arial, sans-serif;
            box-shadow:0 12px 28px rgba(0,0,0,.35);
          `;
          const title = document.createElement("div");
          title.style.cssText = "font-weight:700; font-size:14px; margin-bottom:6px; color:#93c5fd;";
          title.textContent = "Nexidia Search";
          const status = document.createElement("div");
          status.style.cssText = "font-size:12px; line-height:1.3; margin-bottom:8px;";
          status.textContent = "Ready";
          const barOuter = document.createElement("div");
          barOuter.style.cssText = "height:10px; background:#1f2937; border-radius:999px; overflow:hidden; border:1px solid #374151;";
          const barInner = document.createElement("div");
          barInner.style.cssText = "height:100%; width:0%; background:#3b82f6;";
          barOuter.appendChild(barInner);
          const metrics = document.createElement("div");
          metrics.style.cssText = "margin-top:8px; font-size:12px; color:#cbd5e1;";
          metrics.textContent = "";
          const close = document.createElement("div");
          close.textContent = "✕";
          close.style.cssText = `position:absolute; top:10px; right:12px; cursor:pointer; color:#9ca3af; font-size:14px;`;
          close.onclick = () => wrap.remove();
          wrap.appendChild(close);
          wrap.appendChild(title);
          wrap.appendChild(status);
          wrap.appendChild(barOuter);
          wrap.appendChild(metrics);
          const set = (msg, pct = null, meta = "") => {
            status.textContent = msg || "";
            if (pct !== null && pct !== undefined) {
              barInner.style.width = `${Math.max(0, Math.min(100, pct))}%`;
            }
            metrics.textContent = meta || "";
          };
          const show = () => document.body.appendChild(wrap);
          const remove = () => wrap.remove();
          return { show, set, remove };
        })();

        const el = (tag, props = {}, ...children) => {
          const node = document.createElement(tag);
          Object.assign(node, props);
          for (const ch of children) node.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
          return node;
        };

        const row = (...nodes) =>
          el("div", { style: "display:flex; gap:10px; align-items:flex-end; margin:8px 0; flex-wrap:wrap;" }, ...nodes);

        const section = (title) =>
          el("div", {},
            el("div", { style: "font-size:15px; font-weight:600; margin:10px 0 10px;" }, title)
          );

        const hr = () => el("div", { style: "height:1px; background:#eee; margin:14px 0;" });

        const field = (label, type = "text", placeholder = PLACEHOLDER) => {
          const input = el("input", {
            type,
            placeholder,
            style: "width:100%; padding:7px 8px; border:1px solid #ccc; border-radius:6px;"
          });
          const wrap = el("div", { style: "flex:1; min-width:280px;" },
            el("div", { style: "font-size:12px; color:#444; margin-bottom:4px;" }, label),
            input
          );
          return { wrap, input };
        };

        const textareaField = (label, placeholder = PLACEHOLDER, rowsCount = 3) => {
          const ta = el("textarea", {
            rows: rowsCount,
            placeholder,
            style: "width:100%; padding:7px 8px; border:1px solid #ccc; border-radius:6px; resize:vertical; font-family:Segoe UI, Arial, sans-serif;"
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
                const caret = start + normalized.length;
                ta.selectionStart = ta.selectionEnd = caret;
              }
            } catch (_) { }
          });
          const wrap = el("div", { style: "flex:1; min-width:280px;" },
            el("div", { style: "font-size:12px; color:#444; margin-bottom:4px;" }, label),
            ta
          );
          return { wrap, input: ta };
        };

        // Returns the set of storageNames currently active across all filter rows
        const getActiveStorageNames = () =>
          new Set(filterRows.map(r => r.picker.getStorageName()).filter(Boolean));

        // Searchable field picker — shows display names only, excludes already-active fields
        //##> DUPLICATE FILTER PREVENTION: getActiveStorageNames() is called on every dropdown open
        //##> so the list always reflects current state. A row's own current selection is exempt from
        //##> exclusion so users can change their mind without the field disappearing.
        function makeFieldPicker(onSelect) {
          const wrapper = el("div", { style: "position:relative; flex:1; min-width:220px;" });

          const input = el("input", {
            type: "text",
            placeholder: "Search fields...",
            style: "width:100%; padding:7px 8px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box;"
          });

          const dropdown = el("div", {
            style: `
              display:none; position:absolute; top:100%; left:0; right:0;
              max-height:200px; overflow-y:auto; background:#fff;
              border:1px solid #ccc; border-top:none; border-radius:0 0 6px 6px;
              z-index:10000; box-shadow:0 4px 12px rgba(0,0,0,.15);
            `
          });

          let highlightIndex = -1;
          let visibleItems = [];

          const renderDropdown = (query) => {
            dropdown.innerHTML = "";
            visibleItems = [];
            highlightIndex = -1;

            const q = query.toLowerCase().trim();
            const active = getActiveStorageNames();
            const currentStorage = input.dataset.storageName || "";

            const matches = metadataFields.filter(f => {
              // Always show the currently selected field for this row
              if (f.storageName === currentStorage) return true;
              // Exclude fields active on other rows
              if (active.has(f.storageName)) return false;
              // Filter by query against display name only
              return q ? f.displayName.toLowerCase().includes(q) : true;
            });

            if (!matches.length) {
              dropdown.style.display = "none";
              return;
            }

            for (const f of matches.slice(0, 80)) {
              const item = el("div", {
                style: "padding:6px 10px; cursor:pointer; font-size:13px; border-bottom:1px solid #f0f0f0;"
              }, f.displayName);

              item.onmouseenter = () => {
                visibleItems.forEach((el, i) => el.style.background = i === visibleItems.indexOf(item) ? "#e8f0fe" : "");
                highlightIndex = visibleItems.indexOf(item);
              };
              item.onmouseleave = () => { item.style.background = ""; };
              item.onmousedown = (e) => {
                e.preventDefault();
                selectItem(f);
              };

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

          input.addEventListener("input", () => {
            delete input.dataset.storageName;
            renderDropdown(input.value);
          });

          input.addEventListener("focus", () => renderDropdown(input.value));
          input.addEventListener("blur", () => {
            setTimeout(() => { dropdown.style.display = "none"; }, 150);
          });

          input.addEventListener("keydown", (e) => {
            if (!visibleItems.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              clearHighlight();
              highlightIndex = Math.min(highlightIndex + 1, visibleItems.length - 1);
              visibleItems[highlightIndex].style.background = "#e8f0fe";
              visibleItems[highlightIndex].scrollIntoView({ block: "nearest" });
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              clearHighlight();
              highlightIndex = Math.max(highlightIndex - 1, 0);
              visibleItems[highlightIndex].style.background = "#e8f0fe";
              visibleItems[highlightIndex].scrollIntoView({ block: "nearest" });
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (highlightIndex >= 0 && visibleItems[highlightIndex]) {
                visibleItems[highlightIndex].onmousedown(e);
              }
            } else if (e.key === "Escape") {
              dropdown.style.display = "none";
            }
          });

          wrapper.appendChild(input);
          wrapper.appendChild(dropdown);

          const getStorageName = () => input.dataset.storageName || "";
          const getDisplayName = () => input.value;

          const preselect = (storageName) => {
            const f = metadataFields.find(x => x.storageName === storageName);
            if (f) {
              selectItem(f);
            } else {
              input.value = storageName;
              input.dataset.storageName = storageName;
            }
          };

          return { wrapper, input, getStorageName, getDisplayName, preselect };
        }

        const filterRows = [];

        function makeFilterRow(filtersContainer, defaultStorageName) {
          const rowEl = el("div", {
            style: "display:flex; gap:8px; align-items:flex-end; margin:6px 0; flex-wrap:wrap;"
          });

          const picker = makeFieldPicker();

          const valueWrap = el("div", { style: "flex:2; min-width:220px;" },
            el("div", { style: "font-size:12px; color:#444; margin-bottom:4px;" }, "Value(s)"),
            el("input", {
              type: "text",
              placeholder: PLACEHOLDER,
              style: "width:100%; padding:7px 8px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box;"
            })
          );
          const valueInput = valueWrap.lastChild;

          const removeBtn = el("button", {
            style: "padding:6px 10px; border-radius:6px; border:1px solid #ddd; background:#fff; color:#888; cursor:pointer; font-size:13px; white-space:nowrap; align-self:flex-end;"
          }, "✕ Remove");

          rowEl.appendChild(picker.wrapper);
          rowEl.appendChild(valueWrap);
          rowEl.appendChild(removeBtn);
          filtersContainer.appendChild(rowEl);

          const entry = { rowEl, picker, valueInput };
          filterRows.push(entry);

          removeBtn.onclick = () => {
            rowEl.remove();
            const idx = filterRows.indexOf(entry);
            if (idx !== -1) filterRows.splice(idx, 1);
          };

          if (defaultStorageName) picker.preselect(defaultStorageName);

          return entry;
        }

        const splitValues = (raw) =>
          String(raw || "")
            .replace(/\r\n/g, "\n")
            .replace(/\t/g, "\n")
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean);

        const isoStart = (yyyyMmDd) => `${yyyyMmDd}T00:00:00Z`;
        const isoEnd   = (yyyyMmDd) => `${yyyyMmDd}T23:59:59Z`;

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
          if (pn === "UDFVarchar120") return values.map((v) => String(v).toLowerCase());
          return values;
        };

        const buildKeywordFilter = (paramName, values) => ({
          operator: "IN",
          type: "KEYWORD",
          parameterName: normalizeParamName(paramName),
          value: normalizeKeywordValues(paramName, values)
        });

        const buildTextFilter = (phrase) => ({
          operator: "IN",
          type: "TEXT",
          parameterName: "transcript",
          value: {
            phrases: [phrase],
            anotherPhrases: [],
            relevance: "Anywhere",
            position: "Begin"
          }
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
          try { return await getAppInstanceIdViaPageFetch(); } catch (_) { }
          try { return await getAppInstanceIdViaForensicFetch(); } catch (_) { }
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
          const pairsRaw = ctl10
            .split(",")
            .map(s => s.split("|"))
            .filter(p => p.length >= 2)
            .map(([label, key]) => ({ label, key }));
          const fields = [];
          const headers = [];
          const seen = new Set();
          for (const p of pairsRaw) {
            const nk = normalizeFieldKeyForExplore(p.key.trim());
            if (!nk) continue;
            if (seen.has(nk)) continue;
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
            if (!t) continue;
            parts.push(quote(t));
          }
          return parts.join(" AND ");
        };

        const escapeHtml = (s) => String(s ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

        const excelSerialFromDate = (d) => {
          if (!(d instanceof Date) || isNaN(d.getTime())) return null;
          return (d.getTime() / 86400000) + 25569;
        };

        const toNumberOrNull = (raw) => {
          const s = String(raw ?? "").trim();
          if (!s) return null;
          const n = Number(s);
          if (!isFinite(n)) return null;
          return n;
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
          if (!isFinite(n)) return null;
          return n / 86400;
        };

        const downloadExcelFile = (filename, html) => {
          const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        };

        const normalizeCellText = (raw) => {
          let s = (raw === null || raw === undefined) ? "" : String(raw);
          s = s.trim();
          if (!s) return "0";
          if (s.includes("*")) return "0";
          if (/^0+$/.test(s)) return "0";
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
          const maxLens = new Array(headers.length).fill(10);
          for (let c = 0; c < headers.length; c++) {
            maxLens[c] = Math.max(maxLens[c], String(headers[c] ?? "").length);
          }
          for (const rr of rows) {
            const r = rr.row;
            const phrases = rr.phrases || [];
            for (let c = 0; c < exportFields.length; c++) {
              const k = exportFields[c];
              let rawText = "";
              if (k.startsWith("__PHRASE_")) {
                const idx = parseInt(k.replace(/\D/g, ""), 10) - 1;
                rawText = normalizeCellText(phrases[idx] ? phrases[idx] : "0");
              } else {
                rawText = normalizeCellText(getFieldValue(r, k));
              }
              maxLens[c] = Math.max(maxLens[c], estimateDisplayLen(k, rawText));
            }
          }
          const cols = maxLens.map((len) => {
            const px = clamp(Math.round(len * 6.2 + 18), 50, 520);
            return `<col style="width:${px}px">`;
          });
          return `<colgroup>${cols.join("")}</colgroup>`;
        };

        // --- Modal ---
        const modal = el("div", {
          style: `
            position:fixed; inset:0; background:rgba(0,0,0,.55);
            z-index:999999; display:flex; align-items:center; justify-content:center;
            font-family:Segoe UI, Arial, sans-serif;
          `
        });

        // Sticky close anchored to overlay, always visible regardless of scroll
        const stickyClose = el("button", {
          style: `
            position:fixed; top:20px; right:20px; z-index:1000000;
            border:0; background:rgba(30,30,30,.75); color:#fff;
            width:32px; height:32px; border-radius:50%; font-size:16px;
            cursor:pointer; display:flex; align-items:center; justify-content:center;
            box-shadow:0 2px 8px rgba(0,0,0,.4);
          `
        }, "✕");
        stickyClose.onclick = () => { modal.remove(); stickyClose.remove(); };

        const card = el("div", {
          style: `
            background:#fff; width:1080px; max-height:90vh; overflow:auto;
            border-radius:10px; padding:18px 18px 22px;
            box-shadow:0 10px 30px rgba(0,0,0,.35);
          `
        });

        const header = el("div", { style: "display:flex; align-items:center; justify-content:space-between; gap:10px;" },
          el("div", { style: "font-size:18px; font-weight:600;" }, "Nexidia Search")
        );

        modal.appendChild(card);
        card.appendChild(header);
        card.appendChild(hr());

        card.appendChild(section("Date Range"));
        const today = new Date();
        const monthAgo = new Date(today);
        monthAgo.setMonth(today.getMonth() - 1);
        const fromDate = field("From", "date", "");
        const toDate = field("To", "date", "");
        fromDate.input.valueAsDate = monthAgo;
        toDate.input.valueAsDate = today;
        card.appendChild(row(fromDate.wrap, toDate.wrap));

        card.appendChild(hr());
        card.appendChild(section("Search Filters"));

        const filtersContainer = el("div", {});
        card.appendChild(filtersContainer);

        const DEFAULT_FILTERS = [
          "UDFVarchar10", "experienceId", "UDFVarchar122", "siteName",
          "UDFVarchar126", "DNIS", "UDFVarchar120", "UDFVarchar136",
          "UDFVarchar41", "UDFVarchar115", "UDFVarchar1"
        ];

        for (const storageName of DEFAULT_FILTERS) {
          makeFilterRow(filtersContainer, storageName);
        }

        const addFilterBtn = el("button", {
          style: "margin-top:6px; padding:8px 12px; border-radius:8px; border:1px solid #0a66c2; background:#fff; color:#0a66c2; cursor:pointer; font-size:13px;"
        }, "+ Add Filter");

        addFilterBtn.onclick = () => makeFilterRow(filtersContainer, "");
        card.appendChild(addFilterBtn);

        card.appendChild(hr());
        card.appendChild(section("Phrase Search (Each line = separate search)"));

        const searchesWrap = el("div", {});
        card.appendChild(searchesWrap);
        const searches = [];

        const createSearchBlock = (n) => {
          const box = el("div", {
            style: "border:1px solid #e5e7eb; border-radius:10px; padding:12px; margin:10px 0; background:#fafafa;"
          });
          const titleEl = el("div", { style: "font-weight:600; margin-bottom:8px;" }, `Search ${n}`);
          box.appendChild(titleEl);
          const p1 = textareaField("Phrase(s) (each line runs as its own search)", PLACEHOLDER, 4);
          const a2 = textareaField("AND Phrase 2 (optional, single phrase)", PLACEHOLDER, 2);
          const a3 = textareaField("AND Phrase 3 (optional, single phrase)", PLACEHOLDER, 2);
          box.appendChild(row(p1.wrap));
          box.appendChild(row(a2.wrap, a3.wrap));
          return { box, p1, a2, a3 };
        };

        const addSearchBtn = el("button", {
          style: "margin-top:6px; padding:8px 12px; border-radius:8px; border:1px solid #0a66c2; background:#fff; color:#0a66c2; cursor:pointer;"
        }, "Add Another Search");

        addSearchBtn.onclick = () => {
          if (searches.length >= 20) return alert("Max 20 search blocks.");
          const b = createSearchBlock(searches.length + 1);
          searches.push(b);
          searchesWrap.appendChild(b.box);
        };

        const first = createSearchBlock(1);
        searches.push(first);
        searchesWrap.appendChild(first.box);
        card.appendChild(addSearchBtn);

        card.appendChild(hr());

        const runBtn = el("button", {
          style: "padding:10px 16px; border-radius:8px; border:0; background:#0a66c2; color:#fff; font-size:15px; cursor:pointer;"
        }, "Run");

        const cancelBtn = el("button", {
          style: "padding:10px 16px; border-radius:8px; border:1px solid #bbb; background:#fff; color:#333; font-size:15px; cursor:pointer;"
        }, "Cancel");

        cancelBtn.onclick = () => { modal.remove(); stickyClose.remove(); };
        card.appendChild(row(runBtn, cancelBtn));

        document.body.appendChild(modal);
        document.body.appendChild(stickyClose);

        // --- Run ---
        runBtn.onclick = async () => {
          try {
            const fromVal = fromDate.input.value;
            const toVal = toDate.input.value;
            if (!fromVal || !toVal) {
              alert("Please select both From and To dates.");
              return;
            }

            const metaFilters = [];
            for (const entry of filterRows) {
              const storageName = entry.picker.getStorageName();
              const val = entry.valueInput.value.trim();
              if (!storageName || !val) continue;
              metaFilters.push(buildKeywordFilter(storageName, splitValues(val)));
            }

            if (!metaFilters.length) {
              const ok = confirm("No filters added. Data will be pulled from the entire UMR dataset. Do you want to proceed?");
              if (!ok) return;
            }

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
                const phraseGroup = phraseFilters.length === 1
                  ? phraseFilters[0]
                  : { operator: "AND", invertOperator: false, filters: phraseFilters };
                expandedSearches.push({ phraseDisplay, phraseGroup });
              }
            }

            if (!expandedSearches.length) {
              alert("Please enter at least one phrase.");
              return;
            }

            const keywordGroup = metaFilters.length
              ? { operator: "AND", invertOperator: false, filters: metaFilters }
              : null;

            const dateFilter = {
              parameterName: "recordedDateTime",
              operator: "BETWEEN",
              type: "DATE",
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

            const totalRuns = expandedSearches.length;
            const merged = new Map();
            const passthroughNoKey = [];
            let totalFetched = 0;

            for (let si = 0; si < expandedSearches.length; si++) {
              const { phraseDisplay, phraseGroup } = expandedSearches[si];
              progressUI.set(`Searching (${si + 1}/${totalRuns})...`, 25, `Starting at 0`);

              const setRows = [];
              let from = 0;

              while (true) {
                const interactionFilters = [
                  ...(keywordGroup ? [keywordGroup] : []),
                  phraseGroup,
                  dateFilter
                ];

                const payload = {
                  languageFilter: { languages: [] },
                  namedSetId: null,
                  from,
                  to: from + PAGE_SIZE,
                  fields: baseFields,
                  query: {
                    operator: "AND",
                    invertOperator: false,
                    filters: [{
                      operator: "AND",
                      invertOperator: false,
                      filterType: "interactions",
                      filters: interactionFilters
                    }]
                  }
                };

                const res = await fetch(SEARCH_URL, {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload)
                });

                if (!res.ok) {
                  const { text } = await safeRead(res);
                  const err = new Error(`Search failed: HTTP ${res.status}`);
                  err.__httpStatus = res.status;
                  err.__body = text;
                  throw err;
                }

                const { json } = await safeRead(res);
                const rows = pickRows(json);
                if (!rows.length) break;

                setRows.push(...rows);
                totalFetched += rows.length;

                const basePct = 25 + Math.floor((si / Math.max(1, totalRuns)) * 55);
                const localPct = Math.min(55 / totalRuns, Math.floor((setRows.length / Math.max(1, MAX_ROWS)) * (55 / totalRuns)));
                progressUI.set(
                  `Searching (${si + 1}/${totalRuns})...`,
                  Math.min(80, basePct + localPct),
                  `Set fetched: ${setRows.length} (page ${from}) | Total fetched: ${totalFetched}`
                );

                if (setRows.length >= MAX_ROWS) break;
                if (rows.length < PAGE_SIZE) break;
                from += PAGE_SIZE;
                await sleep(250);
              }

              for (const r of setRows) {
                const transId = normalizeCellText(getFieldValue(r, "UDFVarchar110"));
                if (!transId || transId === "0") {
                  passthroughNoKey.push({ row: r, phrases: [phraseDisplay] });
                  continue;
                }
                const existing = merged.get(transId);
                if (!existing) {
                  merged.set(transId, { row: r, phrases: [phraseDisplay] });
                } else {
                  if (!existing.phrases.includes(phraseDisplay)) existing.phrases.push(phraseDisplay);
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

            progressUI.set("Building Excel export...", 85, `Rows: ${finalRows.length} | Phrase cols: ${maxPhraseCols}`);

            const phraseHeaders = [];
            const phraseKeys = [];
            for (let i = 1; i <= maxPhraseCols; i++) {
              phraseHeaders.push(i === 1 ? "Phrase Search" : `Phrase Search${i}`);
              phraseKeys.push(`__PHRASE_${i}__`);
            }

            const exportHeaders = [...phraseHeaders, ...baseHeaders];
            const exportFields  = [...phraseKeys,   ...baseFields];

            const isDateTimeField  = (key) => String(key || "").toLowerCase() === "recordeddatetime";
            const isDurationField  = (key) => String(key || "").toLowerCase() === "mediafileduration";
            const isHoldField      = (key) => String(key || "").toLowerCase() === "udfint4";
            const isSentimentField = (key) => String(key || "").toLowerCase() === "sentimentscore";

            const css = `
              table { border-collapse:collapse; }
              td, th {
                border:none; padding:4px 6px;
                font-family:"Aptos Narrow","Aptos",Calibri,Arial,sans-serif;
                font-size:10pt; text-align:left; vertical-align:bottom;
                white-space:nowrap; mso-number-format:"\\@";
              }
              th { font-weight:700; background:transparent; }
              .txt { mso-number-format:"\\@"; }
              .dt  { mso-number-format:"${FIXED_DT_FORMAT}"; }
              .dur { mso-number-format:"${FIXED_DURATION_FORMAT}"; }
              .int { mso-number-format:"0"; }
              .dec2 { mso-number-format:"0.00"; }
            `.trim();

            const colGroup = buildColGroup(exportHeaders, finalRows, exportFields);
            const headerCells = exportHeaders.map(h => `<th class="txt">${escapeHtml(h)}</th>`).join("");

            const bodyRows = finalRows.map(({ row: r, phrases }) => {
              const tds = exportFields.map((k) => {
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

            const html =
              `<html xmlns:o="urn:schemas-microsoft-com:office:office"
                     xmlns:x="urn:schemas-microsoft-com:office:excel"
                     xmlns="http://www.w3.org/TR/REC-html40">
                <head><meta charset="utf-8" /><style>${css}</style></head>
                <body><table>${colGroup}<tr>${headerCells}</tr>${bodyRows}</table></body>
              </html>`;

            const stamp = new Date().toISOString().replace(/[:]/g, "-").replace(/\..+$/, "");
            const filename = `nexidia_search_export_${stamp}.xls`;
            progressUI.set("Downloading...", 95, filename);
            downloadExcelFile(filename, html);
            progressUI.set("Done.", 100, `Exported ${finalRows.length} rows | Phrase cols: ${maxPhraseCols}`);

          } catch (err) {
            console.error(err);
            try { progressUI.remove(); } catch (_) { }
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
