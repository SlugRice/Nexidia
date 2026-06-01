//[Last Update: 4:55 PM 6/1/2026]
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
  const RESULT_CAP = 10000;
  const CONCURRENCY = 50;
  const DELAY_MS = 20;
  const FETCH_RETRIES = 3;
  const RETRY_BACKOFF = 600;
  const PEEK = 80;
  const GAP = 14;

  const DEFAULT_FILTER_STORAGES = [
    "UDFVarchar10", "siteName", "DNIS", "UDFVarchar110"
  ];

  //##> Report modules register themselves here at load time.
  //##> The hub lazy-loads modules from the repo; once eval'd they call register().
  if (!window.__NEXIDIA_REPORT_DEFS__) window.__NEXIDIA_REPORT_DEFS__ = {};
  const reportDefs = window.__NEXIDIA_REPORT_DEFS__;
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
    closeBtn.textContent = "✕";
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
        const panes = [];
        let activePaneIndex = 0;
        let ghostPaneEl = null;
        let carouselTrack = null;
        let dotsRow = null;
        let carouselViewport = null;
        let fadeMaskLeft = null;
        let resizeHandler = null;

        const modal = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
        const card = el("div", { style: "background:#f8fafc;width:720px;max-height:90vh;overflow-y:auto;border-radius:14px;padding:22px 24px;box-shadow:0 10px 30px rgba(0,0,0,.35);position:relative;" });

        const closeBtn = el("button", { style: "position:absolute;top:14px;right:16px;border:0;background:#f3f4f6;color:#6b7280;width:26px;height:26px;border-radius:50%;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;" }, "✕");
        closeBtn.onclick = () => { if (resizeHandler) window.removeEventListener("resize", resizeHandler); modal.remove(); };
        card.appendChild(closeBtn);

        card.appendChild(el("div", { style: "font-size:18px;font-weight:700;color:#111827;margin-bottom:14px;" }, "Reports"));
        card.appendChild(hr());

        const selectWrap = el("div", { style: "margin-bottom:10px;" });
        selectWrap.appendChild(el("div", { style: "font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;" }, "Select a report"));
        const select = el("select", { style: "width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;background:#fff;cursor:pointer;" });
        const defaultOpt = el("option", { value: "" }, "— Choose a report —");
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

        function buildRowEntry(storageName) {
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
          removeBtn.onclick = () => {
            removeAdjacentAndLabel(rowEl);
            rowEl.remove();
            for (const p of panes) {
              const idx = p.rows.indexOf(row);
              if (idx !== -1) { p.rows.splice(idx, 1); break; }
            }
          };
          return row;
        }

        function makeAndLabel() {
          const wrap = el("div", { style: "display:flex;height:16px;pointer-events:none;align-items:center;" });
          const spacer = el("div", { style: "width:210px;flex-shrink:0;" });
          const label = el("div", { style: "flex:1;text-align:center;font-size:10px;font-weight:700;letter-spacing:2px;color:rgba(59,130,246,0.28);" }, "AND");
          wrap.appendChild(spacer);
          wrap.appendChild(label);
          wrap.dataset.andLabel = "1";
          return wrap;
        }

        function removeAdjacentAndLabel(rowEl) {
          const prev = rowEl.previousElementSibling;
          const next = rowEl.nextElementSibling;
          if (prev && prev.dataset.andLabel) { prev.remove(); return; }
          if (next && next.dataset.andLabel) { next.remove(); }
        }

        function buildPaneEl(paneIndex) {
          const paneEl = el("div", { style: "background:#fff;border-radius:14px;border:1px solid rgba(59,130,246,0.18);padding:18px 20px;flex-shrink:0;position:relative;box-shadow:0 1px 4px rgba(59,130,246,0.06);" });
          paneEl.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:14px;" }, "Search Fields"));
          const rowsContainer = el("div", {});
          paneEl.appendChild(rowsContainer);
          const addBtn = el("button", { style: "margin-top:12px;padding:6px 12px;border-radius:8px;border:1px solid #3b82f6;background:#fff;color:#3b82f6;cursor:pointer;font-size:12px;" }, "+ Add Filter");
          paneEl.appendChild(addBtn);
          const orBtn = el("button", { style: "position:absolute;right:-20px;top:50%;transform:translateY(-50%);z-index:20;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;border:none;border-radius:20px;padding:6px 14px;font-size:11px;font-weight:700;letter-spacing:1px;cursor:pointer;box-shadow:0 2px 8px rgba(59,130,246,0.35);" }, "OR");
          paneEl.appendChild(orBtn);
          const bottomLabel = el("div", { style: "font-size:11px;color:#3b82f6;letter-spacing:1px;opacity:0.7;text-align:center;margin-top:12px;font-weight:600;" }, "Search " + String.fromCharCode(65 + paneIndex));
          paneEl.appendChild(bottomLabel);
          const pane = { el: paneEl, rowsContainer, addBtn, orBtn, rows: [], index: paneIndex, bottomLabel };
          addBtn.onclick = () => {
            if (pane.rows.length) pane.rowsContainer.appendChild(makeAndLabel());
            const row = buildRowEntry("");
            pane.rows.push(row);
            pane.rowsContainer.appendChild(row.rowEl);
          };
          orBtn.onclick = () => {
            if (pane.index < panes.length - 1) slideTo(pane.index + 1);
            else activateNextPane();
          };
          return pane;
        }

        function populatePaneDefaults(pane) {
          for (const sn of DEFAULT_FILTER_STORAGES) {
            if (pane.rows.length) pane.rowsContainer.appendChild(makeAndLabel());
            const row = buildRowEntry(sn);
            pane.rows.push(row);
            pane.rowsContainer.appendChild(row.rowEl);
          }
        }

        function buildGhostPane(paneIndex) {
          const g = el("div", { style: "background:#fff;border-radius:14px;border:1px solid rgba(59,130,246,0.18);padding:18px 20px;flex-shrink:0;position:relative;box-shadow:0 1px 4px rgba(59,130,246,0.06);opacity:0.55;pointer-events:none;" });
          g.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:14px;opacity:0.5;" }, "Search Fields"));
          for (let i = 0; i < 3; i++) {
            if (i > 0) {
              const andEl = el("div", { style: "display:flex;height:16px;align-items:center;opacity:0.3;" });
              andEl.appendChild(el("div", { style: "width:210px;flex-shrink:0;" }));
              andEl.appendChild(el("div", { style: "flex:1;text-align:center;font-size:10px;font-weight:700;letter-spacing:2px;color:rgba(59,130,246,0.28);" }, "AND"));
              g.appendChild(andEl);
            }
            const sk = el("div", { style: "display:flex;gap:8px;align-items:center;margin:6px 0;" });
            sk.appendChild(el("div", { style: "width:22px;height:22px;border-radius:50%;background:#e5e7eb;" }));
            sk.appendChild(el("div", { style: "width:180px;height:32px;border-radius:6px;background:#f0f0f0;" }));
            sk.appendChild(el("div", { style: "flex:1;height:32px;border-radius:6px;background:#f0f0f0;" }));
            g.appendChild(sk);
          }
          const orBtn = el("button", { style: "position:absolute;right:-20px;top:50%;transform:translateY(-50%);z-index:20;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;border:none;border-radius:20px;padding:6px 14px;font-size:11px;font-weight:700;letter-spacing:1px;cursor:pointer;box-shadow:0 2px 8px rgba(59,130,246,0.35);opacity:0.8;pointer-events:auto;" }, "OR");
          orBtn.onclick = () => activateNextPane();
          g.appendChild(orBtn);
          g.appendChild(el("div", { style: "font-size:11px;color:#3b82f6;letter-spacing:1px;opacity:0.35;text-align:center;margin-top:12px;font-weight:600;" }, "Search " + String.fromCharCode(65 + paneIndex)));
          g.dataset.ghost = "1";
          return g;
        }

        function getPaneWidth() {
          return carouselViewport ? Math.max(200, carouselViewport.offsetWidth - PEEK - GAP) : 600;
        }

        function resizePanes() {
          if (!carouselViewport) return;
          const pw = getPaneWidth();
          for (const p of panes) { p.el.style.width = pw + "px"; p.el.style.minWidth = pw + "px"; p.el.style.marginRight = GAP + "px"; }
          if (ghostPaneEl) { ghostPaneEl.style.width = pw + "px"; ghostPaneEl.style.minWidth = pw + "px"; ghostPaneEl.style.marginRight = GAP + "px"; }
          applySlideTransform(activePaneIndex, false);
        }

        function updateDots() {
          if (!dotsRow) return;
          dotsRow.innerHTML = "";
          for (let i = 0; i < panes.length; i++) {
            const dot = el("div", { style: "width:8px;height:8px;border-radius:50%;cursor:pointer;background:" + (i === activePaneIndex ? "#3b82f6" : "#d1d5db") + ";", title: "Search " + String.fromCharCode(65 + i) });
            ((idx) => { dot.onclick = () => slideTo(idx); })(i);
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
          if (index < 0) index = 0;
          if (index >= panes.length) index = panes.length - 1;
          activePaneIndex = index;
          applySlideTransform(index, true);
          updateDots();
          if (index < panes.length - 1) setTimeout(pruneEmptyTailPanes, 440);
        }

        function activateNextPane() {
          const newPane = buildPaneEl(panes.length);
          for (const row of panes[0].rows) {
            const sn = row.picker ? row.picker.getStorageName() : "";
            if (!sn) continue;
            if (newPane.rows.length) newPane.rowsContainer.appendChild(makeAndLabel());
            const newRow = buildRowEntry(sn);
            newPane.rows.push(newRow);
            newPane.rowsContainer.appendChild(newRow.rowEl);
          }
          panes.push(newPane);
          if (ghostPaneEl) ghostPaneEl.remove();
          carouselTrack.appendChild(newPane.el);
          ghostPaneEl = buildGhostPane(panes.length);
          carouselTrack.appendChild(ghostPaneEl);
          resizePanes();
          slideTo(panes.length - 1);
          updateDots();
        }

        function pruneEmptyTailPanes() {
          while (panes.length > 1) {
            const last = panes[panes.length - 1];
            if (last.index === activePaneIndex) break;
            const hasValue = last.rows.some((r) => r.valueInput && r.valueInput.value.trim());
            if (hasValue) break;
            last.el.remove();
            panes.pop();
          }
          if (ghostPaneEl) ghostPaneEl.remove();
          ghostPaneEl = buildGhostPane(panes.length);
          carouselTrack.appendChild(ghostPaneEl);
          resizePanes();
          updateDots();
        }

        const carouselOuter = el("div", { style: "position:relative;" });
        carouselViewport = el("div", { style: "overflow:hidden;border-radius:14px;position:relative;" });
        fadeMaskLeft = el("div", { style: "position:absolute;left:0;top:0;bottom:0;width:60px;background:linear-gradient(90deg,rgba(248,250,252,0.95),transparent);z-index:6;pointer-events:auto;cursor:pointer;opacity:0;transition:opacity 0.3s;" });
        fadeMaskLeft.onclick = () => slideTo(activePaneIndex - 1);
        const fadeMaskRight = el("div", { style: "position:absolute;right:0;top:0;bottom:0;width:60px;background:linear-gradient(270deg,rgba(248,250,252,0.95),transparent);z-index:6;pointer-events:auto;cursor:pointer;" });
        fadeMaskRight.onclick = () => { if (activePaneIndex < panes.length - 1) slideTo(activePaneIndex + 1); else activateNextPane(); };
        carouselTrack = el("div", { style: "display:flex;will-change:transform;" });
        carouselViewport.appendChild(fadeMaskLeft);
        carouselViewport.appendChild(fadeMaskRight);
        carouselViewport.appendChild(carouselTrack);
        carouselOuter.appendChild(carouselViewport);
        dotsRow = el("div", { style: "display:flex;justify-content:center;gap:6px;margin-top:10px;" });
        card.appendChild(carouselOuter);
        card.appendChild(dotsRow);

        const firstPane = buildPaneEl(0);
        populatePaneDefaults(firstPane);
        panes.push(firstPane);
        carouselTrack.appendChild(firstPane.el);
        ghostPaneEl = buildGhostPane(1);
        carouselTrack.appendChild(ghostPaneEl);
        requestAnimationFrame(() => { resizePanes(); updateDots(); });
        resizeHandler = () => resizePanes();
        window.addEventListener("resize", resizeHandler);

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
          runBtn.disabled = true;
          runBtn.style.opacity = "0.5";
          const config = configGetter ? configGetter.getConfig() : {};
          if (resizeHandler) window.removeEventListener("resize", resizeHandler);
          modal.remove();
          const progress = makeProgressUI(activeReport.label);
          progress.set(5, "Building search...", "");

          const dateFilter = {
            parameterName: "recordedDateTime",
            operator: "BETWEEN",
            type: "DATE",
            value: { firstValue: fromVal + "T00:00:00Z", secondValue: toVal + "T23:59:59Z" }
          };

          const searchFields = ["sourceMediaId", "recordeddate", "UDFVarchar110", "UDFVarchar1", "recordedDateTime"];
          const merged = new Map();
          const cappedPanes = [];
          let totalFetched = 0;

          for (let pi = 0; pi < panes.length; pi++) {
            const pane = panes[pi];
            const paneLabel = "Search " + String.fromCharCode(65 + pi);
            const kwFilters = [];
            for (const row of pane.rows) {
              const sn = row.picker ? row.picker.getStorageName() : "";
              const raw = row.valueInput ? row.valueInput.value.trim() : "";
              if (!sn || !raw) continue;
              const vals = [...new Set(splitValues(raw))];
              if (!vals.length) continue;
              kwFilters.push({ operator: "IN", type: "KEYWORD", parameterName: sn, value: vals });
              if (!searchFields.includes(sn)) searchFields.push(sn);
            }
            if (!kwFilters.length && panes.length > 1) continue;
            const paneFilters = [dateFilter];
            for (const f of kwFilters) paneFilters.push(f);
            if (activeReport.presetFilters) { for (const pf of activeReport.presetFilters) paneFilters.push(pf); }

            const paneResults = [];
            let from = 0;
            while (true) {
              const payload = {
                from, to: from + PAGE_SIZE,
                fields: searchFields,
                query: { operator: "AND", filters: [{ filterType: "interactions", filters: paneFilters }] }
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
              for (const r of rows) paneResults.push(r);
              const panePct = Math.min(28, 8 + Math.floor(((pi + paneResults.length / Math.max(1, RESULT_CAP)) / panes.length) * 20));
              progress.set(panePct, "Searching " + paneLabel + "...", "Pane rows: " + paneResults.length);
              if (rows.length < PAGE_SIZE || paneResults.length >= MAX_ROWS) break;
              from += PAGE_SIZE;
              await sleep(250);
            }

            if (paneResults.length >= RESULT_CAP) {
              cappedPanes.push(paneLabel);
            }
            for (const r of paneResults) {
              const tid = getFieldValue(r, "UDFVarchar110").trim();
              const key = (tid && tid !== "0") ? tid : ("_smid_" + (r.sourceMediaId || ""));
              if (!merged.has(key)) merged.set(key, r);
            }
            totalFetched += paneResults.length;
            progress.set(Math.min(28, 8 + Math.floor(((pi + 1) / panes.length) * 20)), "Searching...", "Pane " + (pi + 1) + "/" + panes.length + " | Unique: " + merged.size + " | Total: " + totalFetched);
          }

          if (cappedPanes.length) {
            const proceed = confirm(
              "The following searches hit the " + RESULT_CAP.toLocaleString() + " result limit and may be incomplete:\n\n" +
              cappedPanes.join(", ") +
              "\n\nTry narrowing your date range or adding filters to get complete results.\n\nProceed with current results?"
            );
            if (!proceed) { progress.remove(); return; }
          }

          const allResults = [...merged.values()];
          if (!allResults.length) {
            alert("No results returned from search.");
            progress.remove();
            return;
          }

          progress.set(30, "Probing transcript endpoint...", "");
          const transcripts = new Array(allResults.length);
          let endpointMode = null;
          const probeSmid = allResults[0].sourceMediaId;
          if (probeSmid) {
            const apiUrl = BASE + "/NxIA/api/transcript/" + probeSmid;
            const svcUrl = BASE + "/NxIA/Search/ClientServices/TranscriptService.svc/Transcripts/?SourceMediaId=" + probeSmid + "&_=" + Date.now();
            try {
              transcripts[0] = await apiFetch(apiUrl, { credentials: "include" });
              endpointMode = "api";
            } catch {
              try {
                transcripts[0] = await apiFetch(svcUrl, { credentials: "include" });
                endpointMode = "svc";
              } catch {
                transcripts[0] = null;
                endpointMode = "api";
              }
            }
          } else {
            transcripts[0] = null;
            endpointMode = "api";
          }

          function fetchTranscript(smid) {
            const url = endpointMode === "svc"
              ? BASE + "/NxIA/Search/ClientServices/TranscriptService.svc/Transcripts/?SourceMediaId=" + smid + "&_=" + Date.now()
              : BASE + "/NxIA/api/transcript/" + smid;
            return apiFetch(url, { credentials: "include" });
          }

          progress.set(32, "Fetching transcripts...", "1 / " + allResults.length);
          let cursor = 1;
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
                  payload = await fetchTranscript(smid);
                  break;
                } catch (e) {
                  if (attempt === FETCH_RETRIES) { failCount++; }
                  else { await sleep(RETRY_BACKOFF * attempt); }
                }
              }
              transcripts[i] = payload;
              const done = i + 1;
              if (done % 50 === 0 || done === allResults.length) {
                const pct = 32 + Math.floor((done / allResults.length) * 48);
                progress.set(pct, "Fetching transcripts...", done + " / " + allResults.length + "\nFailed: " + failCount);
              }
            }
          }

          await Promise.all(Array.from({ length: Math.min(CONCURRENCY, allResults.length - 1) }, () => worker()));

          progress.set(82, "Analyzing transcripts...", "");
          const matches = [];
          for (let i = 0; i < allResults.length; i++) {
            if (!transcripts[i]) continue;
            const result = activeReport.analyze(transcripts[i], config);
            if (result && result.match) {
              matches.push({ row: allResults[i], data: result.data });
            }
          }

          if (!matches.length) {
            alert("No qualifying calls found.\n\nSearched: " + allResults.length + "\nFetch failures: " + failCount);
            progress.remove();
            return;
          }

          const reportDataMap = new Map();
          const qualifyingIds = [];
          for (const m of matches) {
            const tid = getFieldValue(m.row, "UDFVarchar110").trim();
            if (!tid || tid === "0") continue;
            if (!reportDataMap.has(tid)) {
              reportDataMap.set(tid, m.data);
              qualifyingIds.push(tid);
            }
          }

          if (!qualifyingIds.length) {
            alert("Qualifying calls found but no valid Trans_IDs to look up.\n\nMatches: " + matches.length);
            progress.remove();
            return;
          }

          progress.set(85, "Running detail search...", qualifyingIds.length + " Trans_IDs");
          const colPrefs = api.getShared("columnPrefs") || { fields: [], headers: [] };
          const detailFields = colPrefs.fields.includes("sourceMediaId") ? colPrefs.fields.slice() : colPrefs.fields.concat(["sourceMediaId"]);
          if (!detailFields.includes("UDFVarchar110")) detailFields.push("UDFVarchar110");

          const detailFilters = [
            dateFilter,
            { operator: "IN", type: "KEYWORD", parameterName: "UDFVarchar110", value: qualifyingIds }
          ];

          const detailResults = [];
          let detailFrom = 0;
          while (true) {
            const payload = {
              from: detailFrom, to: detailFrom + PAGE_SIZE,
              fields: detailFields,
              query: { operator: "AND", filters: [{ filterType: "interactions", filters: detailFilters }] }
            };
            let res;
            try {
              res = await fetch(SEARCH_URL, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
              });
            } catch (err) {
              alert("Detail search failed: " + err.message);
              progress.remove();
              return;
            }
            if (!res.ok) {
              const body = await res.text().catch(() => "");
              alert("Detail search failed: HTTP " + res.status + "\n" + body.slice(0, 200));
              progress.remove();
              return;
            }
            const json = await res.json();
            const rows = Array.isArray(json.results) ? json.results : [];
            for (const r of rows) detailResults.push(r);
            const pct = Math.min(95, 85 + Math.floor((detailResults.length / Math.max(1, qualifyingIds.length)) * 10));
            progress.set(pct, "Running detail search...", "Rows: " + detailResults.length);
            if (rows.length < PAGE_SIZE || detailResults.length >= MAX_ROWS) break;
            detailFrom += PAGE_SIZE;
            await sleep(250);
          }

          if (!detailResults.length) {
            alert("Detail search returned no results.");
            progress.remove();
            return;
          }

          progress.set(96, "Preparing results...", detailResults.length + " rows");
          const cols = activeReport.columns || [];
          for (const row of detailResults) {
            const tid = getFieldValue(row, "UDFVarchar110").trim();
            const data = reportDataMap.get(tid);
            if (data) {
              for (const c of cols) {
                row["_report_" + c.key] = (data[c.key] || "").toString();
              }
            }
          }

          const formatted = detailResults.map((row) => ({ row, phrases: [] }));
          const fields = detailFields.slice();
          const headers = colPrefs.headers.slice();
          for (const c of cols) {
            const key = "_report_" + c.key;
            if (!fields.includes(key)) { fields.push(key); headers.push(c.label); }
          }
          api.setShared("columnPrefs", { fields: fields.slice(), headers: headers.slice() });
          api.setShared("lastSearchResult", {
            rows: formatted, fields, headers,
            maxPhraseCols: 1, includePhraseCol: false
          });
          progress.remove();
          const dispatcher = api.listTools().find((t) => t.id === "dispatcher");
          if (dispatcher) { dispatcher.open(); }
          else { alert("Dispatcher not loaded. Check manifest."); }
        };

      } catch (e) {
        console.error(e);
        alert("Failed to open Reports. Make sure you're running this from an active Nexidia session.");
      }
    })();
  }

  api.registerTool({ id: "reports", label: "Reports", open: openReports });
})();
