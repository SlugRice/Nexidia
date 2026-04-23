(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;

  function openSearchExport() {
    (async () => {
      try {

        // check: must be running from an active Nexidia session ----------
        const isNexidiaPage =
          typeof window !== "undefined" &&
          typeof location !== "undefined" &&
          /nxondemand\.com/i.test(location.hostname) &&
          /\/NxIA\//i.test(location.pathname);

        if (!isNexidiaPage) {
          alert("Failed to run. Make sure you're running this from an active Nexidia session.");
          return;
        }

        // Also catch cases where we are on Nexidia but not logged in / session missing
        const BASE = "https://apug01.nxondemand.com";
        const SEARCH_URL = `${BASE}/NxIA/api-gateway/explore/api/v1.0/search`;
        const LEGACY_FORMS_URL = `${BASE}/NxIA/Search/ForensicSearch.aspx`;
        const SETTINGS_URL = (appInstanceId) =>
          `${BASE}/NxIA/Search/SettingsDialog.aspx?AppInstanceID=${encodeURIComponent(appInstanceId)}`;

        const PLACEHOLDER = "Separate multiple values with commas or line breaks, or paste from Excel.";
        const PAGE_SIZE = 1000;
        const MAX_ROWS = 50000;

        const FIXED_DT_FORMAT = `m\\/d\\/yyyy\\ h:mm`;
        const FIXED_DURATION_FORMAT = `\\[h\\]\\:mm\\:ss`;

        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        // ----------------- Progress overlay -----------------
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
          close.style.cssText = `
            position:absolute; top:10px; right:12px; cursor:pointer;
            color:#9ca3af; font-size:14px;
          `;
          close.onclick = () => wrap.remove();

          wrap.appendChild(close);
          wrap.appendChild(title);
          wrap.appendChild(status);
          wrap.appendChild(barOuter);
          wrap.appendChild(metrics);

          const set = (msg, pct = null, meta = "") => {
            status.textContent = msg || "";
            if (pct !== null && pct !== undefined) {
              const clamped = Math.max(0, Math.min(100, pct));
              barInner.style.width = `${clamped}%`;
            }
            metrics.textContent = meta || "";
          };

          const show = () => document.body.appendChild(wrap);
          const remove = () => wrap.remove();

          return { show, set, remove };
        })();

        // ----------------- DOM helpers -----------------
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

        // ---------- EVERYTHING BELOW IS IDENTICAL ----------
        // (unchanged logic, UI, search, export, etc.)
        // ...
        // ⚠️ SNIPPED HERE FOR BREVITY IN CHAT ⚠️
        // In your actual file, KEEP EVERYTHING EXACTLY AS‑IS
        // until the final closing braces below.
        // ---------------------------------------------------

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
