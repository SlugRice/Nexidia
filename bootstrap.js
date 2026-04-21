(async () => {
  const REPO_BASE = "https://raw.githubusercontent.com/SlugRice/Nexidia/main/";
  const MANIFEST_URL = REPO_BASE + "manifest.json";

  // Guard: don’t double-run
  if (window.__NEXIDIA_BOOTSTRAP_RUNNING__) return;
  window.__NEXIDIA_BOOTSTRAP_RUNNING__ = true;

  // Must be on Nexidia
  const isNexidiaPage =
    typeof location !== "undefined" &&
    /nxondemand\.com/i.test(location.hostname) &&
    /\/NxIA\//i.test(location.pathname);

  if (!isNexidiaPage) {
    alert("Failed to run. Make sure you're running this from an active Nexidia session.");
    window.__NEXIDIA_BOOTSTRAP_RUNNING__ = false;
    return;
  }

  // Tiny UI
  const ui = (() => {
    const wrap = document.createElement("div");
    wrap.style.cssText = [
      "position:fixed",
      "top:16px",
      "right:16px",
      "z-index:999999",
      "width:420px",
      "background:#111827",
      "color:#e5e7eb",
      "border:1px solid #374151",
      "border-radius:10px",
      "padding:12px 12px 10px",
      "font-family:Segoe UI, Arial, sans-serif",
      "box-shadow:0 12px 28px rgba(0,0,0,.35)"
    ].join(";");

    const title = document.createElement("div");
    title.style.cssText = "font-weight:700;font-size:14px;margin-bottom:6px;color:#93c5fd";
    title.textContent = "Nexidia Tools";

    const status = document.createElement("div");
    status.style.cssText = "font-size:12px;line-height:1.3;margin-bottom:8px";
    status.textContent = "Starting";

    const barOuter = document.createElement("div");
    barOuter.style.cssText = "height:10px;background:#1f2937;border-radius:999px;overflow:hidden;border:1px solid #374151";
    const barInner = document.createElement("div");
    barInner.style.cssText = "height:100%;width:0%;background:#3b82f6";
    barOuter.appendChild(barInner);

    const meta = document.createElement("div");
    meta.style.cssText = "margin-top:8px;font-size:12px;color:#cbd5e1";
    meta.textContent = "";

    const close = document.createElement("div");
    close.textContent = "✕";
    close.style.cssText = "position:absolute;top:10px;right:12px;cursor:pointer;color:#9ca3af;font-size:14px";
    close.onclick = () => wrap.remove();

    wrap.appendChild(close);
    wrap.appendChild(title);
    wrap.appendChild(status);
    wrap.appendChild(barOuter);
    wrap.appendChild(meta);

    const show = () => document.body.appendChild(wrap);
    const set = (msg, pct, extra) => {
      status.textContent = msg || "";
      if (pct !== null && pct !== undefined) {
        const clamped = Math.max(0, Math.min(100, pct));
        barInner.style.width = clamped + "%";
      }
      meta.textContent = extra || "";
    };

    return { show, set };
  })();

  ui.show();

  async function fetchText(url) {
    const res = await fetch(url, { credentials: "omit", cache: "no-store" });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      const e = new Error("Fetch failed: " + res.status + " " + url);
      e.__status = res.status;
      e.__body = t;
      throw e;
    }
    return await res.text();
  }

  async function fetchJson(url) {
    const txt = await fetchText(url);
    try {
      return JSON.parse(txt);
    } catch (e) {
      const err = new Error("Manifest JSON parse failed");
      err.__body = txt;
      throw err;
    }
  }

  async function loadAndEval(url) {
    const code = await fetchText(url);
    // Execute in page context (same method your working bookmarklet uses)
    (0, eval)(code);
  }

  try {
    ui.set("Loading manifest...", 5, "manifest.json");

    const manifest = await fetchJson(MANIFEST_URL + "?v=" + Date.now());
    const version = String(manifest.version || Date.now());
    const entry = Array.isArray(manifest.entry) ? manifest.entry : [];

    if (!entry.length) {
      throw new Error("Manifest has no entry files");
    }

    ui.set("Manifest loaded", 15, "Version: " + version);

    // Optional: expose version for quick support checks
    window.__NEXIDIA_TOOLS_VERSION__ = version;

    for (let i = 0; i < entry.length; i++) {
      const rel = entry[i];
      const full = REPO_BASE + rel + "?v=" + encodeURIComponent(version);

      const pct = 15 + Math.round(((i + 1) / entry.length) * 80);
      ui.set("Loading " + rel + "...", pct, full);

      await loadAndEval(full);
    }

    ui.set("Done", 100, "Loaded " + entry.length + " module(s) | v " + version);
  } catch (err) {
    console.error("Bootstrap failed", err);
    ui.set("Failed", 100, String(err && err.message ? err.message : err));
    alert("Failed to run. Make sure you're running this from an active Nexidia session.");
  } finally {
    window.__NEXIDIA_BOOTSTRAP_RUNNING__ = false;
  }
})();