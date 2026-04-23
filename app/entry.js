(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;

  if (window.__NEXIDIA_LAUNCHER_OPEN__) return;
  window.__NEXIDIA_LAUNCHER_OPEN__ = true;

  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    Object.assign(node, props);
    for (const ch of children) node.appendChild(typeof ch === "string" ? document.createTextNode(ch) : ch);
    return node;
  };

  const modal = el("div", { style: `
    position:fixed; inset:0; background:rgba(0,0,0,.55);
    z-index:999999; display:flex; align-items:center; justify-content:center;
    font-family:Segoe UI, Arial, sans-serif;
  `});

  const card = el("div", { style: `
    background:#fff; width:520px; max-height:80vh; overflow:auto;
    border-radius:10px; padding:16px;
    box-shadow:0 10px 30px rgba(0,0,0,.35);
  `});

  const header = el("div", { style: "display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;" },
    el("div", { style: "font-size:16px;font-weight:600;" }, "Nexidia Tools"),
    el("button", { style: "border:0;background:#eee;padding:6px 10px;border-radius:6px;cursor:pointer;" }, "✕")
  );

  const close = () => { modal.remove(); window.__NEXIDIA_LAUNCHER_OPEN__ = false; };
  header.lastChild.onclick = close;

  const body = el("div", {});

  const render = () => {
    body.innerHTML = "";
    const tools = api.listTools();
    if (!tools.length) {
      body.appendChild(el("div", { style: "font-size:13px;color:#444;" }, "No tools registered yet."));
      return;
    }
    for (const t of tools) {
      const btn = el("button", { style: `
        width:100%; text-align:left; margin:6px 0; padding:10px 12px;
        border-radius:8px; border:1px solid #0a66c2; background:#fff; color:#0a66c2;
        cursor:pointer; font-size:14px;
      `}, t.label);
      btn.onclick = () => {
        try { close(); t.open(); }
        catch (e) { console.error(e); alert("Tool failed to open."); }
      };
      body.appendChild(btn);
    }
  };

  card.appendChild(header);
  card.appendChild(body);
  modal.appendChild(card);
  document.body.appendChild(modal);

  setTimeout(render, 50);
})();
