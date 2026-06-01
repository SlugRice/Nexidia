//[Last Update: 10:05 AM 6/1/2026]
//[Please confirm this timestamp in your response any time it was formed using this document!]
(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;

  const REPO_BASE = "https://raw.githubusercontent.com/SlugRice/Nexidia/main/";
  const REPORTS_CATALOG_URL = REPO_BASE + "reports.json";
  const BASE = "https://apug01.nxondemand.com";
  const SEARCH_URL = BASE + "/NxIA/api-gateway/explore/api/v1.0/search";
  const METADATA_URL = BASE + "/NxIA/api-gateway/explore/api/v1.0/metadata/fields/names";
  const PAGE_SIZE = 1000;
  const MAX_ROWS = 50000;
  const CONCURRENCY = 50;
  const DELAY_MS = 20;
  const FETCH_RETRIES = 3;
  const RETRY_BACKOFF = 600;

  const DEFAULT_FILTER_STORAGES = [
    "UDFVarchar10", "siteName", "DNIS", "UDFVarchar110"
  ];

  //##> Report modules register themselves here at load time.
  //##> The hub lazy-loads modules from the repo; once eval'd they call register().
  const reportDefs = {};
  const reportRegistry = {
    register(def) { reportDefs[def.id] = def; },
    get(id) { return reportDefs[id] || null; }
  };
  api.setShared("reportRegistry", reportRegistry);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  function hr() {
    return el("div", { style: "height:1px;background:#e5e7eb;margin:14px 0;" });
  }

  async function apiFetch(url, init) {
    const res = await fetch(url, init || { credentials: "include" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(res.status + " " + res.statusText + " :: " + body.slice(0, 200));
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) return res.json();
    const t = await res.text();
    try { return JSON.parse(t); } catch { return { raw: t }; }
  }

  async function getTranscriptBySmid(smid) {
    const apiUrl = BASE + "/NxIA/api/transcript/" + smid;
    const svcUrl = BASE + "/NxIA/Search/ClientServices/TranscriptService.svc/Transcripts/?SourceMediaId=" + smid + "&_=" + Date.now();
    try { return await apiFetch(apiUrl, { credentials: "include" }); }
    catch { return await apiFetch(svcUrl, { credentials: "include" }); }
  }

  function getTranscriptRows(payload) {
    return payload?.TranscriptRows || payload?.rows || payload?.transcriptRows || [];
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

  function splitValues(raw) {
    return String(raw || "")
      .replace(/\r\n/g, "\n")
      .replace(/\t/g, "\n")
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function makeFieldPicker(metadataFields, defaultSn) {
    const wrapper = el("div", { style: "position:relative;flex:1;min-width:160px;" });
    const input = el("input", {
      type: "text", placeholder: "Search fields...",
      style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;"
    });
    const dropdown = el("div", {
      style: "display:none;position:absolute;top:100%;left:0;right:0;max-height:200px;overflow-y:auto;background:#fff;border:1px solid #ccc;border-top:none;border-radius:0 0 6px 6px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,.15);"
    });
    let hi = -1, vis = [];
    function render(q) {
      dropdown.innerHTML = ""; vis = []; hi = -1;
      const ql = q.toLowerCase().trim();
      const cur = input.dataset.storageName || "";
      const matches = metadataFields.filter((f) => {
        if (f.storageName === cur) return true;
        return ql ? f.displayName.toLowerCase().includes(ql) : true;
      });
      if (!matches.length) { dropdown.style.display = "none"; return; }
      for (let i = 0; i < Math.min(matches.length, 80); i++) {
        const f = matches[i];
        const item = el("div", { style: "padding:6px 10px;cursor:pointer;font-size:13px;border-bottom:1px solid #f0f0f0;" }, f.displayName);
        ((fi) => {
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
    if (defaultSn) {
      const f = metadataFields.find((x) => x.storageName === defaultSn);
      if (f) pick(f); else { input.value = defaultSn; input.dataset.storageName = defaultSn; }
    }
    return {
      wrapper, input,
      getStorageName: () => input.dataset.storageName || "",
      getDisplayName: () => input.value
    };
  }

  function makeProgressUI(title) {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;top:20px;right:20px;z-index:999999;background:#0b1225;color:#e5e7eb;font-family:ui-monospace,Consolas,monospace;padding:14px 14px 12px;border-radius:10px;min-width:360px;max-width:520px;box-shadow:0 10px 30px rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.12);";
    const titleEl = document.createElement("div");
    titleEl.textContent = title || "Reports";
    titleEl.style.cssText = "font-size:14px;font-weight:700;color:#7dd3fc;margin-bottom:10px;";
    const closeBtn = document.createElement("div");
    closeBtn.textContent = "\u2715";
    closeBtn.style.cssText = "position:absolute;top:10px;right:12px;cursor:pointer;color:#94a3b8;font-size:16px;";
    closeBtn.onclick = () => overlay.remove();
    const status = document.createElement("div");
    status.style.cssText = "font-size:12px;margin-bottom:6px;";
    const detail = document.createElement("div");
    detail.style.cssText = "font-size:11px;color:#94a3b8;white-space:pre-wrap;margin-bottom:10px;";
    const barWrap = document.createElement("div");
    barWrap.style.cssText = "height:10px;background:#070b14;border:1px solid rgba(255,255,255,0.10);border-radius:999px;overflow:hidden;";
    const bar = document.createElement("div");
    bar.style.cssText = "height:100%;width:0%;background:linear-gradient(90deg,#38bdf8,#a78bfa);transition:width 0.3s;";
    barWrap.appendChild(bar);
    overlay.appendChild(closeBtn);
    overlay.appendChild(titleEl);
    overlay.appendChild(status);
    overlay.appendChild(detail);
    overlay.appendChild(barWrap);
    document.body.appendChild(overlay);
    return {
      set(pct, msg, det) {
        bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
        if (msg !== undefined) status.textContent = msg;
        if (det !== undefined) detail.textContent = det;
      },
      remove() { try { overlay.remove(); } catch (_) {} }
    };
  }

  function openReports() {
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

        let metadataFields = [];
        try {
          const res = await fetch(METADATA_URL, { credentials: "include", cache: "no-store" });
          if (res.ok) {
            const json = await res.json();
            metadataFields = Array.isArray(json) ? json.filter((f) => f.isEnabled !== false) : [];
          }
        } catch (_) {}

        let catalog = [];
        try {
          const mRes = await fetch(REPORTS_CATALOG_URL + "?v=" + Date.now(), { credentials: "omit", cache: "no-store" });
          if (mRes.ok) {
            const mJson = await mRes.json();
            catalog = Array.isArray(mJson.reports) ? mJson.reports : [];
          }
        } catch (_) {}

        let activeReport = null;
        let configGetter = null;
        const filterRows = [];

        const modal = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
        const card = el("div", { style: "background:#f8fafc;width:720px;max-height:90vh;overflow-y:auto;border-radius:14px;padding:22px 24px;box-shadow:0 10px 30px rgba(0,0,0,.35);position:relative;" });

        const closeBtn = el("button", { style: "position:absolute;top:14px;right:16px;border:0;background:#f3f4f6;color:#6b7280;width:26px;height:26px;border-radius:50%;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;" }, "\u2715");
        closeBtn.onclick = () => modal.remove();
        card.appendChild(closeBtn);

        card.appendChild(el("div", { style: "font-size:18px;font-weight:700;color:#111827;margin-bottom:14px;" }, "Reports"));
        card.appendChild(hr());

        const selectWrap = el("div", { style: "margin-bottom:10px;" });
        selectWrap.appendChild(el("div", { style: "font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;" }, "Select a report"));
        const select = el("select", { style: "width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;background:#fff;cursor:pointer;" });
        const defaultOpt = el("option", { value: "" }, "\u2014 Choose a report \u2014");
        select.appendChild(defaultOpt);
        for (const entry of catalog) {
          select.appendChild(el("option", { value: entry.id }, entry.label));
        }
        selectWrap.appendChild(select);
        card.appendChild(selectWrap);

        const descArea = el("div", { style: "font-size:12px;color:#6b7280;line-height:1.5;margin-bottom:10px;min-height:18px;" });
        card.appendChild(descArea);

        const configArea = el("div", {});
        card.appendChild(configArea);

        card.appendChild(hr());

        card.appendChild(el("div", { style: "font-size:15px;font-weight:600;margin:10px 0;" }, "Date Range"));
        const dateRow = el("div", { style: "display:flex;gap:10px;align-items:flex-end;margin:8px 0;flex-wrap:wrap;" });
        const today = new Date();
        const monthAgo = new Date(today);
        monthAgo.setMonth(today.getMonth() - 1);
        const fromWrap = el("div", { style: "flex:1;min-width:200px;" });
        fromWrap.appendChild(el("div", { style: "font-size:12px;color:#444;margin-bottom:4px;" }, "From"));
        const fromInput = el("input", { type: "date", style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;" });
        fromInput.valueAsDate = monthAgo;
        fromWrap.appendChild(fromInput);
        const toWrap = el("div", { style: "flex:1;min-width:200px;" });
        toWrap.appendChild(el("div", { style: "font-size:12px;color:#444;margin-bottom:4px;" }, "To"));
        const toInput = el("input", { type: "date", style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;" });
        toInput.valueAsDate = today;
        toWrap.appendChild(toInput);
        dateRow.appendChild(fromWrap);
        dateRow.appendChild(toWrap);
        card.appendChild(dateRow);

        card.appendChild(hr());

        card.appendChild(el("div", { style: "font-size:15px;font-weight:600;margin:10px 0;" }, "Filters"));
        const filtersContainer = el("div", {});
        card.appendChild(filtersContainer);

        function addFilterRow(storageName) {
          const row = { picker: null, valueInput: null, rowEl: null };
          const removeBtn = el("button", { style: "width:22px;height:22px;border-radius:50%;border:1px solid #e5e7eb;background:#fff;color:#aaa;cursor:pointer;font-size:11px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;" }, "X");
          const picker = makeFieldPicker(metadataFields, storageName || "");
          const valueInput = el("input", {
            type: "text",
            placeholder: "Values (comma or line separated)",
            style: "flex:1;min-width:0;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;"
          });
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
          const fieldLabel = el("div", {
            style: "flex:0 0 180px;padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;background:#f3f4f6;font-size:13px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;cursor:pointer;"
          });
          if (storageName) {
            const f = metadataFields.find((x) => x.storageName === storageName);
            fieldLabel.textContent = f ? f.displayName : storageName;
            fieldLabel.title = fieldLabel.textContent;
            picker.wrapper.style.display = "none";
          } else {
            fieldLabel.style.display = "none";
          }
          fieldLabel.onclick = () => {
            fieldLabel.style.display = "none";
            picker.wrapper.style.display = "block";
            picker.input.focus();
          };
          picker.input.addEventListener("blur", () => {
            setTimeout(() => {
              if (picker.getStorageName()) {
                const f = metadataFields.find((x) => x.storageName === picker.getStorageName());
                fieldLabel.textContent = f ? f.displayName : picker.getDisplayName();
                fieldLabel.title = fieldLabel.textContent;
                fieldLabel.style.display = "block";
                picker.wrapper.style.display = "none";
              }
            }, 160);
          });
          const rowEl = el("div", { style: "display:flex;gap:8px;align-items:center;margin:6px 0;" });
          rowEl.appendChild(removeBtn);
          rowEl.appendChild(fieldLabel);
          rowEl.appendChild(picker.wrapper);
          rowEl.appendChild(valueInput);
          row.picker = picker;
          row.valueInput = valueInput;
          row.rowEl = rowEl;
          filterRows.push(row);
          filtersContainer.appendChild(rowEl);
          removeBtn.onclick = () => {
            rowEl.remove();
            const idx = filterRows.indexOf(row);
            if (idx !== -1) filterRows.splice(idx, 1);
          };
          return row;
        }

        for (const sn of DEFAULT_FILTER_STORAGES) {
          addFilterRow(sn);
        }

        const addFilterBtn = el("button", { style: "margin-top:8px;padding:6px 12px;border-radius:8px;border:1px solid #3b82f6;background:#fff;color:#3b82f6;cursor:pointer;font-size:12px;" }, "+ Add Filter");
        addFilterBtn.onclick = () => { addFilterRow(""); };
        card.appendChild(addFilterBtn);

        card.appendChild(hr());

        const runBtn = el("button", {
          style: "width:100%;padding:12px;border-radius:12px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(59,130,246,0.4);letter-spacing:0.5px;"
        }, "Run Report");
        card.appendChild(runBtn);

        const resultsArea = el("div", { style: "margin-top:14px;" });
        card.appendChild(resultsArea);

        modal.appendChild(card);
        document.body.appendChild(modal);

        select.onchange = async () => {
          const id = select.value;
          configArea.innerHTML = "";
          descArea.textContent = "";
          resultsArea.innerHTML = "";
          activeReport = null;
          configGetter = null;
          if (!id) return;

          const entry = catalog.find((c) => c.id === id);
          if (entry) descArea.textContent = entry.description || "";

          if (!reportDefs[id] && entry && entry.file) {
            descArea.textContent = "Loading report module...";
            try {
              const fileUrl = REPO_BASE + entry.file + "?v=" + Date.now();
              const res = await fetch(fileUrl, { credentials: "omit", cache: "no-store" });
              if (!res.ok) throw new Error("HTTP " + res.status);
              const code = await res.text();
              (0, eval)(code);
            } catch (e) {
              descArea.textContent = "Failed to load report module: " + e.message;
              return;
            }
            descArea.textContent = entry.description || "";
          }

          const def = reportDefs[id];
          if (!def) {
            descArea.textContent = "Report module not found for id: " + id;
            return;
          }
          activeReport = def;
          if (def.buildConfig) {
            configGetter = def.buildConfig(configArea, { el });
          }
        };

        runBtn.onclick = async () => {
          if (!activeReport) { alert("Please select a report before running."); return; }
          const fromVal = fromInput.value;
          const toVal = toInput.value;
          if (!fromVal || !toVal) { alert("Please select both From and To dates."); return; }

          const config = configGetter ? configGetter.getConfig() : {};
          modal.remove();
          const progress = makeProgressUI(activeReport.label);
          progress.set(5, "Building search...", "");

          const interactionFilters = [];
          interactionFilters.push({
            parameterName: "recordedDateTime",
            operator: "BETWEEN",
            type: "DATE",
            value: { firstValue: fromVal + "T00:00:00Z", secondValue: toVal + "T23:59:59Z" }
          });

          const searchFields = ["sourceMediaId", "recordeddate", "UDFVarchar110", "UDFVarchar1", "recordedDateTime"];

          for (const fr of filterRows) {
            const sn = fr.picker.getStorageName();
            const raw = fr.valueInput.value.trim();
            if (!sn || !raw) continue;
            const vals = [...new Set(splitValues(raw))];
            if (!vals.length) continue;
            interactionFilters.push({ operator: "IN", type: "KEYWORD", parameterName: sn, value: vals });
            if (!searchFields.includes(sn)) searchFields.push(sn);
          }

          progress.set(8, "Searching...", "");
          const allResults = [];
          let from = 0;
          while (true) {
            const payload = {
              from, to: from + PAGE_SIZE,
              fields: searchFields,
              query: { operator: "AND", filters: [{ filterType: "interactions", filters: interactionFilters }] }
            };
            let res;
            try {
              res = await fetch(SEARCH_URL, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
              });
            } catch (err) {
              alert("Search request failed: " + err.message);
              progress.remove();
              return;
            }
            if (!res.ok) {
              const body = await res.text().catch(() => "");
              alert("Search failed: HTTP " + res.status + "\n" + body.slice(0, 200));
              progress.remove();
              return;
            }
            const json = await res.json();
            const rows = Array.isArray(json.results) ? json.results : [];
            for (const r of rows) allResults.push(r);
            const pct = Math.min(28, 8 + Math.floor((allResults.length / Math.max(1, MAX_ROWS)) * 20));
            progress.set(pct, "Searching...", "Rows: " + allResults.length);
            if (rows.length < PAGE_SIZE || allResults.length >= MAX_ROWS) break;
            from += PAGE_SIZE;
            await sleep(250);
          }

          if (!allResults.length) {
            alert("No results returned from search.");
            progress.remove();
            return;
          }

          progress.set(30, "Fetching transcripts...", "0 / " + allResults.length);
          const transcripts = new Array(allResults.length);
          let cursor = 0;
          let failCount = 0;

          async function worker() {
            while (cursor < allResults.length) {
              const i = cursor++;
              await sleep(DELAY_MS);
              const smid = allResults[i].sourceMediaId;
              if (!smid) { transcripts[i] = null; continue; }
              let payload = null;
              for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
                try {
                  payload = await getTranscriptBySmid(smid);
                  break;
                } catch (e) {
                  if (attempt === FETCH_RETRIES) { failCount++; }
                  else { await sleep(RETRY_BACKOFF * attempt); }
                }
              }
              transcripts[i] = payload;
              const done = i + 1;
              if (done % 50 === 0 || done === allResults.length) {
                const pct = 30 + Math.floor((done / allResults.length) * 50);
                progress.set(pct, "Fetching transcripts...", done + " / " + allResults.length + "\nFailed: " + failCount);
              }
            }
          }

          await Promise.all(Array.from({ length: Math.min(CONCURRENCY, allResults.length) }, () => worker()));

          progress.set(82, "Analyzing transcripts...", "");
          const matches = [];
          for (let i = 0; i < allResults.length; i++) {
            if (!transcripts[i]) continue;
            const result = activeReport.analyze(transcripts[i], config);
            if (result && result.match) {
              matches.push({ row: allResults[i], data: result.data });
            }
          }

          progress.remove();

          if (!matches.length) {
            alert("No qualifying calls found.\n\nSearched: " + allResults.length + "\nFetch failures: " + failCount);
            return;
          }

          showResults(activeReport, matches, allResults.length, metadataFields, searchFields);
        };

        function showResults(report, matches, totalSearched, metaFields, searchFields) {
          const rModal = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
          const rCard = el("div", { style: "background:#fff;width:900px;max-height:90vh;overflow-y:auto;border-radius:14px;padding:22px 24px;box-shadow:0 10px 30px rgba(0,0,0,.35);position:relative;" });
          const rClose = el("button", { style: "position:absolute;top:14px;right:16px;border:0;background:#f3f4f6;color:#6b7280;width:26px;height:26px;border-radius:50%;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;" }, "\u2715");
          rClose.onclick = () => rModal.remove();
          rCard.appendChild(rClose);

          rCard.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#111827;margin-bottom:6px;" }, report.label + " \u2014 Results"));
          rCard.appendChild(el("div", { style: "font-size:13px;color:#6b7280;margin-bottom:14px;" },
            matches.length + " qualifying calls out of " + totalSearched + " searched"));

          const btnRow = el("div", { style: "display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;" });
          const dispatchBtn = el("button", { style: "padding:8px 16px;border-radius:8px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:13px;font-weight:600;cursor:pointer;" }, "Send to Dispatcher");
          dispatchBtn.onclick = () => {
            const formatted = matches.map((m) => ({ row: m.row, phrases: [] }));
            const colPrefs = api.getShared("columnPrefs") || { fields: [], headers: [] };
            const fields = colPrefs.fields.includes("sourceMediaId") ? colPrefs.fields : colPrefs.fields.concat(["sourceMediaId"]);
            api.setShared("lastSearchResult", {
              rows: formatted, fields, headers: colPrefs.headers,
              maxPhraseCols: 1, includePhraseCol: false
            });
            rModal.remove();
            const dispatcher = api.listTools().find((t) => t.id === "dispatcher");
            if (dispatcher) { dispatcher.open(); }
            else { alert("Dispatcher not loaded."); }
          };
          btnRow.appendChild(dispatchBtn);

          const csvBtn = el("button", { style: "padding:8px 16px;border-radius:8px;border:1px solid #22c55e;background:#fff;color:#16a34a;font-size:13px;font-weight:600;cursor:pointer;" }, "Export CSV");
          csvBtn.onclick = () => {
            const cols = report.columns || [];
            let csv = "Trans_Id,Recorded Date";
            for (const c of cols) csv += "," + c.label;
            csv += "\n";
            for (const m of matches) {
              const tid = getFieldValue(m.row, "UDFVarchar110").replace(/,/g, " ");
              const rd = getFieldValue(m.row, "recordeddate").replace(/,/g, " ");
              csv += tid + "," + rd;
              for (const c of cols) csv += "," + (m.data[c.key] || "").toString().replace(/,/g, " ");
              csv += "\n";
            }
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url;
            a.download = report.id + "_results.csv";
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
          };
          btnRow.appendChild(csvBtn);
          rCard.appendChild(btnRow);

          const tableWrap = el("div", { style: "max-height:500px;overflow:auto;border:1px solid #e5e7eb;border-radius:8px;" });
          const table = el("table", { style: "width:100%;border-collapse:collapse;font-size:12px;" });
          const thead = el("thead", {});
          const headerRow = el("tr", { style: "background:#f1f5f9;position:sticky;top:0;z-index:1;" });
          headerRow.appendChild(el("th", { style: "padding:8px 10px;text-align:left;font-weight:700;border-bottom:2px solid #e5e7eb;" }, "#"));
          headerRow.appendChild(el("th", { style: "padding:8px 10px;text-align:left;font-weight:700;border-bottom:2px solid #e5e7eb;" }, "Trans_Id"));
          headerRow.appendChild(el("th", { style: "padding:8px 10px;text-align:left;font-weight:700;border-bottom:2px solid #e5e7eb;" }, "Recorded Date"));
          const cols = report.columns || [];
          for (const c of cols) {
            headerRow.appendChild(el("th", { style: "padding:8px 10px;text-align:left;font-weight:700;border-bottom:2px solid #e5e7eb;" }, c.label));
          }
          thead.appendChild(headerRow);
          table.appendChild(thead);
          const tbody = el("tbody", {});
          for (let i = 0; i < matches.length; i++) {
            const m = matches[i];
            const bg = i % 2 === 0 ? "#fff" : "#f8fafc";
            const tr = el("tr", { style: "background:" + bg + ";" });
            tr.appendChild(el("td", { style: "padding:6px 10px;border-bottom:1px solid #f0f0f0;" }, String(i + 1)));
            tr.appendChild(el("td", { style: "padding:6px 10px;border-bottom:1px solid #f0f0f0;" }, getFieldValue(m.row, "UDFVarchar110")));
            tr.appendChild(el("td", { style: "padding:6px 10px;border-bottom:1px solid #f0f0f0;" }, getFieldValue(m.row, "recordeddate")));
            for (const c of cols) {
              tr.appendChild(el("td", { style: "padding:6px 10px;border-bottom:1px solid #f0f0f0;font-weight:600;color:#1d4ed8;" }, (m.data[c.key] || "").toString()));
            }
            tbody.appendChild(tr);
          }
          table.appendChild(tbody);
          tableWrap.appendChild(table);
          rCard.appendChild(tableWrap);

          rModal.appendChild(rCard);
          document.body.appendChild(rModal);
        }

      } catch (e) {
        console.error(e);
        alert("Failed to open Reports. Make sure you're running this from an active Nexidia session.");
      }
    })();
  }

  api.registerTool({ id: "reports", label: "Reports", open: openReports });
})();
