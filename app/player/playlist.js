//[Last Update: 9:02 PM 11/9/2026]
//[Please confirm this timestamp in your response any time it was formed using this document!]
(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;
  const SEARCH_URL = "https://apug01.nxondemand.com/NxIA/api-gateway/explore/api/v1.0/search";
  const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;
  const TAG_RE = /@\s*\d{1,2}:\d{2}(:\d{2})?/;
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
  async function fetchJson(url, init) {
    const res = await fetch(url, Object.assign({ credentials: "include" }, init || {}));
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) return res.json();
    const t = await res.text();
    try { return JSON.parse(t); } catch { return { raw: t }; }
  }
  function parseTimestampStr(str) {
    const s = String(str || "").trim();
    if (!TIME_RE.test(s)) return null;
    const parts = s.split(":").map((p) => parseInt(p, 10));
    if (parts.some((n) => isNaN(n))) return null;
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }
  function parseTags(raw) {
    const out = [];
    for (const entry of String(raw || "").split(";")) {
      const e = entry.trim();
      if (!e) continue;
      const at = e.lastIndexOf("@");
      if (at >= 0) {
        const ms = parseTimestampStr(e.substring(at + 1));
        if (ms === null) continue;
        out.push({ label: e.substring(0, at).trim() || "Timestamp", ms });
      } else {
        const ms = parseTimestampStr(e);
        if (ms !== null) out.push({ label: "Timestamp", ms });
      }
    }
    return out;
  }
  function looksLikeTags(cell) {
    const s = String(cell || "").trim();
    if (!s) return false;
    if (TAG_RE.test(s)) return true;
    return s.split(";").every((p) => TIME_RE.test(p.trim()));
  }
  function parseInput(raw) {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const map = new Map();
    const add = (key, timestamps) => {
      if (!map.has(key)) map.set(key, { key, timestamps: [] });
      const item = map.get(key);
      item.timestamps.push(...timestamps);
      item.timestamps.sort((a, b) => a.ms - b.ms);
    };
    for (const line of lines) {
      const cols = line.split("\t").map((c) => c.trim());
      const tagCols = cols.slice(1).filter(looksLikeTags);
      if (cols[0] && tagCols.length) {
        const timestamps = [];
        for (const c of tagCols) timestamps.push(...parseTags(c));
        add(cols[0], timestamps);
        continue;
      }
      for (const p of line.split(/[,\t]/).map((s) => s.trim()).filter(Boolean)) {
        if (looksLikeTags(p)) continue;
        add(p, []);
      }
    }
    return [...map.values()];
  }
  function infoIcon(tip) {
    const s = el("span", { style: "display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:#e0e7ff;color:#3730a3;font-size:10px;font-weight:700;cursor:help;flex-shrink:0;" }, "i");
    s.title = tip;
    return s;
  }
  function openFieldPicker(titleText, currentStorage, onSelect) {
    const metaFields = api.getShared("metadataFields") || [];
    const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000003;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
    const box = el("div", { style: "background:#fff;width:380px;border-radius:12px;padding:18px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
    box.appendChild(el("div", { style: "font-size:14px;font-weight:700;margin-bottom:10px;color:#111827;" }, titleText));
    const input = el("input", { type: "text", placeholder: "Search fields...", style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;margin-bottom:8px;" });
    const list = el("div", { style: "max-height:240px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px;" });
    const allFields = metaFields.filter((f) => f.isEnabled !== false);
    function renderList(q) {
      list.innerHTML = "";
      const ql = q.toLowerCase().trim();
      const matches = allFields.filter((f) => !ql || f.displayName.toLowerCase().includes(ql) || f.storageName.toLowerCase().includes(ql));
      if (!matches.length) { list.appendChild(el("div", { style: "padding:10px;font-size:12px;color:#6b7280;" }, "No fields found.")); return; }
      for (const f of matches.slice(0, 100)) {
        const isCurrent = f.storageName === currentStorage;
        const row = el("div", { style: `padding:8px 10px;font-size:12px;cursor:pointer;border-bottom:1px solid #f1f5f9;color:${isCurrent ? "#3b82f6" : "#111827"};font-weight:${isCurrent ? "700" : "400"};` }, f.displayName);
        row.onmouseenter = () => { row.style.background = "#e8f0fe"; };
        row.onmouseleave = () => { row.style.background = ""; };
        row.onclick = () => { overlay.remove(); onSelect(f.storageName, f.displayName); };
        list.appendChild(row);
      }
    }
    input.addEventListener("input", () => renderList(input.value));
    renderList("");
    const cancelBtn = el("button", { style: "margin-top:10px;width:100%;padding:8px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;cursor:pointer;font-size:13px;" }, "Cancel");
    cancelBtn.onclick = () => overlay.remove();
    box.appendChild(input); box.appendChild(list); box.appendChild(cancelBtn);
    overlay.appendChild(box); document.body.appendChild(overlay);
    setTimeout(() => input.focus(), 50);
  }
  function openPlaylistTool() {
    const mpTool = api.listTools().find((t) => t.id === "mediaPlayer") || null;
    const general = mpTool && mpTool.getGeneralSettings ? mpTool.getGeneralSettings() : null;
    let keyFieldStorage = "UDFVarchar110";
    let keyFieldDisplay = "Trans_Id";
    let displayFieldStorage = general && general.nameField ? general.nameField : "UDFVarchar110";
    let displayFieldDisplay = mpTool && mpTool.fieldName ? mpTool.fieldName(displayFieldStorage) : "Trans_Id";
    const modal = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
    const card = el("div", { style: "background:#fff;width:560px;border-radius:14px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.35);position:relative;" });
    const titleRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:4px;" });
    const backBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #94a3b8;background:#fff;color:#475569;cursor:pointer;font-size:12px;" }, "\u2190 Back");
    backBtn.onclick = () => modal.remove();
    titleRow.appendChild(backBtn);
    titleRow.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#111827;flex:1;" }, "Media Player"));
    const closeBtn = el("button", { style: "position:absolute;top:14px;right:16px;border:0;background:#f3f4f6;color:#6b7280;width:26px;height:26px;border-radius:50%;font-size:13px;cursor:pointer;" }, "\u2715");
    closeBtn.onclick = () => modal.remove();
    card.appendChild(titleRow); card.appendChild(closeBtn);
    const keyRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin:14px 0 6px;" });
    keyRow.appendChild(el("span", { style: "font-size:12px;color:#374151;font-weight:600;" }, "Key Field:"));
    keyRow.appendChild(infoIcon("How are you identifying the calls?"));
    const keyLabel = el("span", { style: "font-size:12px;color:#111827;" }, keyFieldDisplay);
    keyRow.appendChild(keyLabel);
    const changeKeyBtn = el("button", { style: "padding:4px 10px;border-radius:6px;border:1px solid #3b82f6;background:#fff;color:#3b82f6;font-size:11px;cursor:pointer;" }, "Change Key");
    keyRow.appendChild(changeKeyBtn);
    card.appendChild(keyRow);
    const dispRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:10px;" });
    dispRow.appendChild(el("span", { style: "font-size:12px;color:#374151;font-weight:600;" }, "Display As:"));
    dispRow.appendChild(infoIcon("How are you naming the calls?"));
    const dispLabel = el("span", { style: "font-size:12px;color:#111827;" }, displayFieldDisplay);
    dispRow.appendChild(dispLabel);
    const changeDispBtn = el("button", { style: "padding:4px 10px;border-radius:6px;border:1px solid #6366f1;background:#fff;color:#6366f1;font-size:11px;cursor:pointer;", title: "This also changes how calls are named in the Media Player from now on." }, "Change Display");
    changeDispBtn.onclick = () => openFieldPicker("Select Display Field", displayFieldStorage, (s, d) => {
      displayFieldStorage = s;
      displayFieldDisplay = d;
      dispLabel.textContent = d;
      if (mpTool && mpTool.saveGeneralSettings) mpTool.saveGeneralSettings({ nameField: s });
    });
    dispRow.appendChild(changeDispBtn);
    card.appendChild(dispRow);
    if (mpTool && mpTool.openSettings) {
      const setBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #0ea5e9;background:#fff;color:#0369a1;cursor:pointer;font-size:12px;margin-right:30px;", title: "Your default Media Player settings. These apply everywhere the player is used." }, "\u2699 Player Settings");
      setBtn.onclick = () => mpTool.openSettings(null, () => {
        const g = mpTool.getGeneralSettings();
        displayFieldStorage = g.nameField || "UDFVarchar110";
        displayFieldDisplay = mpTool.fieldName(displayFieldStorage);
        dispLabel.textContent = displayFieldDisplay;
      });
      titleRow.appendChild(setBtn);
    }
    card.appendChild(el("div", { style: "height:1px;background:#e5e7eb;margin:10px 0;" }));
    const descEl = el("div", { style: "font-size:12px;color:#6b7280;margin-bottom:8px;line-height:1.45;" });
    card.appendChild(descEl);
    const textarea = el("textarea", { rows: 8, style: "width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;font-family:ui-monospace,Consolas,monospace;box-sizing:border-box;resize:vertical;margin-bottom:6px;" });
    card.appendChild(textarea);
    const detectEl = el("div", { style: "font-size:11px;color:#6b7280;min-height:16px;margin-bottom:8px;" });
    card.appendChild(detectEl);
    function syncKeyText() {
      descEl.textContent = `Paste ${keyFieldDisplay} values below. Comma or line break separated. You can paste directly from Excel. To jump to timestamps, paste a second column next to each ${keyFieldDisplay} with tags like Label@MM:SS, separated by semicolons.`;
      textarea.placeholder = `Paste ${keyFieldDisplay} values here...`;
    }
    function syncDetect() {
      const raw = textarea.value.trim();
      if (!raw) { detectEl.textContent = ""; return; }
      const parsed = parseInput(raw);
      const tagged = parsed.filter((p) => p.timestamps.length).length;
      const tags = parsed.reduce((n, p) => n + p.timestamps.length, 0);
      detectEl.textContent = `${parsed.length.toLocaleString()} ${keyFieldDisplay} value${parsed.length === 1 ? "" : "s"} detected` + (tagged ? `, ${tagged.toLocaleString()} with timestamps (${tags.toLocaleString()} tag${tags === 1 ? "" : "s"}).` : ".");
    }
    changeKeyBtn.onclick = () => openFieldPicker("Select Key Field", keyFieldStorage, (s, d) => { keyFieldStorage = s; keyFieldDisplay = d; keyLabel.textContent = d; syncKeyText(); syncDetect(); });
    textarea.addEventListener("input", syncDetect);
    syncKeyText();
    const okBtn = el("button", { style: "width:100%;padding:9px 14px;border-radius:8px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:13px;font-weight:600;cursor:pointer;" }, "Load Playlist");
    card.appendChild(okBtn);
    modal.appendChild(card);
    document.body.appendChild(modal);
    setTimeout(() => textarea.focus(), 50);
    okBtn.onclick = async () => {
      const raw = textarea.value.trim();
      if (!raw) { alert(`Paste some ${keyFieldDisplay} values first.`); return; }
      const parsed = parseInput(raw);
      if (!parsed.length) { alert(`No ${keyFieldDisplay} values detected.`); return; }
      const hasTimestamps = parsed.some((p) => p.timestamps.length);
      okBtn.disabled = true; okBtn.textContent = "Resolving...";
      const extra = mpTool && mpTool.settingsFields ? mpTool.settingsFields(null) : [];
      const fields = [...new Set(["sourceMediaId", keyFieldStorage, displayFieldStorage].concat(extra))];
      let results;
      try {
        const payload = {
          from: 0, to: 10000, fields,
          query: { operator: "AND", filters: [{ filterType: "interactions", filters: [{ operator: "IN", type: "KEYWORD", parameterName: keyFieldStorage, value: parsed.map((p) => p.key) }] }] }
        };
        const data = await fetchJson(SEARCH_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        results = Array.isArray(data.results) ? data.results : [];
      } catch (e) {
        alert("Search failed: " + e.message); okBtn.disabled = false; okBtn.textContent = "Load Playlist"; return;
      }
      if (!results.length) { alert("No calls matched the provided keys."); okBtn.disabled = false; okBtn.textContent = "Load Playlist"; return; }
      const keyToResults = new Map();
      for (const r of results) {
        const kv = (r[keyFieldStorage] || "").toString().trim();
        if (!kv || !r.sourceMediaId) continue;
        if (!keyToResults.has(kv)) keyToResults.set(kv, []);
        keyToResults.get(kv).push(r);
      }
      const playlistItems = [];
      const notFound = [];
      for (const p of parsed) {
        const matches = keyToResults.get(p.key);
        if (!matches || !matches.length) { notFound.push(p.key); continue; }
        matches.sort((a, b) => ((a.recordeddate || "").toString()).localeCompare((b.recordeddate || "").toString()));
        for (let i = 0; i < matches.length; i++) {
          const r = matches[i];
          const displayVal = displayFieldStorage !== keyFieldStorage ? (r[displayFieldStorage] || "").toString().trim() : "";
          playlistItems.push({
            key: p.key,
            smid: r.sourceMediaId,
            displayLabel: displayVal || p.key,
            row: r,
            timestamps: i === 0 ? p.timestamps.map((t) => Object.assign({}, t)) : []
          });
        }
      }
      if (notFound.length) console.warn("Media Player: keys not found:", notFound);
      if (!playlistItems.length) { alert("No calls resolved from the provided keys."); okBtn.disabled = false; okBtn.textContent = "Load Playlist"; return; }
      modal.remove();
      api.setShared("playlistState", {
        mode: "standalone",
        keyFieldStorage, keyFieldDisplay,
        displayFieldStorage, displayFieldName: displayFieldDisplay,
        timestampsPrimary: hasTimestamps,
        items: playlistItems
      });
      const container = el("div", { style: "position:fixed;bottom:0;left:0;right:0;z-index:999998;display:flex;flex-direction:column;" });
      document.body.appendChild(container);
      if (!mpTool || !mpTool._openPlayerPane) { alert("Media Player not loaded."); container.remove(); return; }
      const player = mpTool._openPlayerPane(container, (cleanupFn) => { container._cleanup = cleanupFn; }, { onClosed: () => container.remove() });
      const plCloseBtn = el("button", { style: "border:0;background:#dc2626;color:#fff;padding:3px 8px;border-radius:6px;font-size:11px;cursor:pointer;flex-shrink:0;margin-left:4px;" }, "Close Player");
      plCloseBtn.onclick = () => {
        if (container._cleanup) container._cleanup();
        container.remove();
        api.setShared("playlistState", null);
      };
      player.els.hideBtn.parentNode.appendChild(plCloseBtn);
      player.setPlaylist(playlistItems);
      if (playlistItems.length) player.loadPlaylistIndex(0);
      if (notFound.length) {
        setTimeout(() => alert(notFound.length + " key(s) not found:\n" + notFound.slice(0, 20).join(", ") + (notFound.length > 20 ? "\n..." : "")), 300);
      }
    };
  }
  api.registerTool({ id: "playlistPlayer", label: "Media Player", open: openPlaylistTool });
})();
