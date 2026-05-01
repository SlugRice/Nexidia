(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;

  const SEARCH_URL = "https://apug01.nxondemand.com/NxIA/api-gateway/explore/api/v1.0/search";

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
    const parts = str.trim().split(":");
    if (parts.length === 2) return (parseInt(parts[0]) * 60 + parseInt(parts[1])) * 1000;
    if (parts.length === 3) return (parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2])) * 1000;
    return 0;
  }

  function parseInput(raw, timestampMode) {
    const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);
    const map = new Map();
    for (const line of lines) {
      if (timestampMode) {
        const cols = line.split("\t");
        const key = (cols[0] || "").trim();
        if (!key) continue;
        const tsRaw = (cols[1] || "").trim();
        const timestamps = [];
        if (tsRaw) {
          for (const entry of tsRaw.split(";")) {
            const at = entry.lastIndexOf("@");
            if (at > 0) {
              const label = entry.substring(0, at).trim();
              const ms = parseTimestampStr(entry.substring(at + 1));
              if (label) timestamps.push({ label, ms });
            }
          }
        }
        if (map.has(key)) { map.get(key).timestamps.push(...timestamps); }
        else { map.set(key, { key, timestamps }); }
      } else {
        const parts = line.split(/[,\t]/).map(s => s.trim()).filter(Boolean);
        for (const p of parts) {
          if (!map.has(p)) map.set(p, { key: p, timestamps: [] });
        }
      }
    }
    return [...map.values()];
  }

  function openFieldPicker(titleText, currentStorage, onSelect) {
    const metaFields = api.getShared("metadataFields") || [];
    const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000003;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
    const box = el("div", { style: "background:#fff;width:380px;border-radius:12px;padding:18px;box-shadow:0 8px 24px rgba(0,0,0,.3);" });
    box.appendChild(el("div", { style: "font-size:14px;font-weight:700;margin-bottom:10px;color:#111827;" }, titleText));
    const input = el("input", { type: "text", placeholder: "Search fields...", style: "width:100%;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;margin-bottom:8px;" });
    const list = el("div", { style: "max-height:240px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:6px;" });
    const allFields = metaFields.filter(f => f.isEnabled !== false);
    function renderList(q) {
      list.innerHTML = "";
      const ql = q.toLowerCase().trim();
      const matches = allFields.filter(f => !ql || f.displayName.toLowerCase().includes(ql) || f.storageName.toLowerCase().includes(ql));
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
    let keyFieldStorage = "UDFVarchar110";
    let keyFieldDisplay = "Trans_Id";
    let displayFieldStorage = "UDFVarchar110";
    let displayFieldDisplay = "Trans_Id";
    let timestampMode = false;

    const modal = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial,sans-serif;" });
    const card = el("div", { style: "background:#fff;width:560px;border-radius:14px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.35);position:relative;" });

    const titleRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:4px;" });
    const backBtn = el("button", { style: "padding:6px 10px;border-radius:8px;border:1px solid #94a3b8;background:#fff;color:#475569;cursor:pointer;font-size:12px;" }, "\u2190 Back");
    backBtn.onclick = () => modal.remove();
    titleRow.appendChild(backBtn);
    titleRow.appendChild(el("div", { style: "font-size:16px;font-weight:700;color:#111827;" }, "Playlist Player"));
    const closeBtn = el("button", { style: "position:absolute;top:14px;right:16px;border:0;background:#f3f4f6;color:#6b7280;width:26px;height:26px;border-radius:50%;font-size:13px;cursor:pointer;" }, "\u2715");
    closeBtn.onclick = () => modal.remove();
    card.appendChild(titleRow); card.appendChild(closeBtn);

    const keyRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin:14px 0 6px;" });
    keyRow.appendChild(el("span", { style: "font-size:12px;color:#374151;font-weight:600;" }, "Key Field:"));
    const keyLabel = el("span", { style: "font-size:12px;color:#111827;" }, keyFieldDisplay);
    keyRow.appendChild(keyLabel);
    const changeKeyBtn = el("button", { style: "padding:4px 10px;border-radius:6px;border:1px solid #3b82f6;background:#fff;color:#3b82f6;font-size:11px;cursor:pointer;" }, "Change Key");
    changeKeyBtn.onclick = () => openFieldPicker("Select Key Field", keyFieldStorage, (s, d) => { keyFieldStorage = s; keyFieldDisplay = d; keyLabel.textContent = d; });
    keyRow.appendChild(changeKeyBtn);
    card.appendChild(keyRow);

    const dispRow = el("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:10px;" });
    dispRow.appendChild(el("span", { style: "font-size:12px;color:#374151;font-weight:600;" }, "Display As:"));
    const dispLabel = el("span", { style: "font-size:12px;color:#111827;" }, displayFieldDisplay);
    dispRow.appendChild(dispLabel);
    const changeDispBtn = el("button", { style: "padding:4px 10px;border-radius:6px;border:1px solid #6366f1;background:#fff;color:#6366f1;font-size:11px;cursor:pointer;" }, "Change Display");
    changeDispBtn.onclick = () => openFieldPicker("Select Display Field", displayFieldStorage, (s, d) => { displayFieldStorage = s; displayFieldDisplay = d; dispLabel.textContent = d; });
    dispRow.appendChild(changeDispBtn);
    card.appendChild(dispRow);

    card.appendChild(el("div", { style: "height:1px;background:#e5e7eb;margin:10px 0;" }));
    const descEl = el("div", { style: "font-size:12px;color:#6b7280;margin-bottom:8px;" }, "Paste values below. Comma or line break separated. You can paste directly from Excel.");
    card.appendChild(descEl);
    const textarea = el("textarea", { rows: 8, placeholder: "Paste keys here...", style: "width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:12px;font-family:ui-monospace,Consolas,monospace;box-sizing:border-box;resize:vertical;margin-bottom:10px;" });
    card.appendChild(textarea);

    const bottomRow = el("div", { style: "display:flex;align-items:center;gap:8px;" });
    const tsToggle = el("button", { style: "padding:7px 14px;border-radius:8px;border:1px solid #d1d5db;background:#f9fafb;color:#374151;font-size:12px;cursor:pointer;font-weight:600;" }, "Include Timestamps");
    tsToggle.onclick = () => {
      timestampMode = !timestampMode;
      tsToggle.style.background = timestampMode ? "#3b82f6" : "#f9fafb";
      tsToggle.style.color = timestampMode ? "#fff" : "#374151";
      tsToggle.style.borderColor = timestampMode ? "#3b82f6" : "#d1d5db";
      descEl.textContent = timestampMode
        ? "Paste two columns from Excel: Col A = key, Col B = timestamps (Label@MM:SS;Label@MM:SS)."
        : "Paste values below. Comma or line break separated. You can paste directly from Excel.";
    };
    bottomRow.appendChild(tsToggle);
    const okBtn = el("button", { style: "flex:1;padding:9px 14px;border-radius:8px;border:0;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;font-size:13px;font-weight:600;cursor:pointer;" }, "Load Playlist");
    bottomRow.appendChild(okBtn);
    card.appendChild(bottomRow);
    modal.appendChild(card);
    document.body.appendChild(modal);

    okBtn.onclick = async () => {
      const raw = textarea.value.trim();
      if (!raw) { alert("Paste some values first."); return; }
      const parsed = parseInput(raw, timestampMode);
      if (!parsed.length) { alert("No valid keys detected."); return; }

      okBtn.disabled = true; okBtn.textContent = "Resolving...";
      const fields = ["sourceMediaId", keyFieldStorage];
      if (displayFieldStorage !== keyFieldStorage) fields.push(displayFieldStorage);
      let results;
      try {
        const payload = {
          from: 0, to: 10000, fields,
          query: { operator: "AND", filters: [{ filterType: "interactions", filters: [{ operator: "IN", type: "KEYWORD", parameterName: keyFieldStorage, value: parsed.map(p => p.key) }] }] }
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
            timestamps: i === 0 ? p.timestamps : []
          });
        }
      }

      if (notFound.length) console.warn("Playlist: keys not found:", notFound);
      if (!playlistItems.length) { alert("No calls resolved from the provided keys."); okBtn.disabled = false; okBtn.textContent = "Load Playlist"; return; }
      modal.remove();

      api.setShared("playlistState", {
        keyFieldStorage, keyFieldDisplay,
        displayFieldStorage, displayFieldName: displayFieldDisplay,
        items: playlistItems
      });

      const container = el("div", { style: "position:fixed;bottom:0;left:0;right:0;z-index:999998;display:flex;flex-direction:column;" });
      document.body.appendChild(container);

      const mpTool = api.listTools().find(t => t.id === "mediaPlayer");
      if (!mpTool || !mpTool._openPlayerPane) { alert("Media Player not loaded."); container.remove(); return; }

      const player = mpTool._openPlayerPane(container, (cleanupFn) => { container._cleanup = cleanupFn; });

      const plCloseBtn = el("button", { style: "border:0;background:#dc2626;color:#fff;padding:3px 8px;border-radius:6px;font-size:11px;cursor:pointer;flex-shrink:0;margin-left:4px;" }, "Close Playlist");
      plCloseBtn.onclick = () => {
        if (container._cleanup) container._cleanup();
        player.stopAudio();
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

  api.registerTool({ id: "playlistPlayer", label: "Playlist Player", open: openPlaylistTool });
})();
