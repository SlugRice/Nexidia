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
        const SEARCH_URL = BASE + "/NxIA/api-gateway/explore/api/v1.0/search";
        const METADATA_URL = BASE + "/NxIA/api-gateway/explore/api/v1.0/metadata/fields/names";
        const LEGACY_FORMS_URL = BASE + "/NxIA/Search/ForensicSearch.aspx";
        const SETTINGS_URL = function(id) { return BASE + "/NxIA/Search/SettingsDialog.aspx?AppInstanceID=" + encodeURIComponent(id); };

        const FILTER_PLACEHOLDER = "Enter one value for this filter.";
        const KEY_PLACEHOLDER = "Separate multiple values with commas or line breaks, or paste from Excel.";
        const PAGE_SIZE = 1000;
        const MAX_ROWS = 50000;
        const sleep = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };

        const FORCE_TEXT_FIELDS = new Set(["UDFVarchar1","UDFVarchar122","UDFVarchar110","UDFVarchar41","UDFVarchar115","UDFVarchar136","UDFVarchar50","UDFVarchar104","UDFVarchar105"]);

        const DEFAULT_FILTER_STORAGES = ["UDFVarchar10", "UDFVarchar126", "DNIS", "siteName", "UDFVarchar120"];
        const DEFAULT_KEY_LIST = ["experienceId", "UDFVarchar122", "UDFVarchar41", "UDFVarchar115", "UDFVarchar1", "UDFVarchar110"];

        let metadataFields = [];
        try {
          const res = await fetch(METADATA_URL, { credentials: "include", cache: "no-store" });
          if (res.ok) {
            const json = await res.json();
            metadataFields = Array.isArray(json) ? json.filter(function(f) { return f.isEnabled !== false; }) : [];
          }
        } catch (_) {}

        // ── Progress UI ────────────────────────────────────────────────────────────
        const progressUI = (function() {
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
          const closeBtn = document.createElement("div");
          closeBtn.textContent = "✕";
          closeBtn.style.cssText = "position:absolute;top:10px;right:12px;cursor:pointer;color:#9ca3af;font-size:14px;";
          closeBtn.onclick = function() { wrap.remove(); };
          wrap.appendChild(closeBtn);
          wrap.appendChild(title);
          wrap.appendChild(status);
          wrap.appendChild(barOuter);
          wrap.appendChild(metrics);
          return {
            show: function() { document.body.appendChild(wrap); },
            remove: function() { try { wrap.remove(); } catch (_) {} },
            set: function(msg, pct, meta) {
              status.textContent = msg || "";
              if (pct !== null && pct !== undefined) {
                barInner.style.width = Math.max(0, Math.min(100, pct)) + "%";
              }
              metrics.textContent = meta || "";
            }
          };
        })();

        // ── DOM helpers ────────────────────────────────────────────────────────────
        function el(tag, props) {
          props = props || {};
          const node = document.createElement(tag);
          Object.assign(node, props);
          for (let i = 2; i < arguments.length; i++) {
            const ch = arguments[i];
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
          return { wrap: wrap, input: input };
        }

        // ── FLIP animation ─────────────────────────────────────────────────────────
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
          requestAnimationFrame(function() {
            requestAnimationFrame(function() {
              clone.style.transform = "translate(" + (-dx) + "px," + (-dy) + "px)";
              clone.style.opacity = "0.15";
              setTimeout(function() {
                clone.remove();
                realEl.style.opacity = "1";
                realEl.style.transition = "opacity 0.12s ease";
              }, durationMs);
            });
          });
        }

        // ── Date focus animation ───────────────────────────────────────────────────
        // Dims everything outside the date section, gold border slams down over it.
        // dateSectionEl: the element spanning from "Date Range" heading through the input row.
        // Returns a dismiss() function so it can be replayed on demand.
        function runDateFocusAnimation(card, dateSectionEl, onDismiss) {
          // Remove any existing animation overlays first
          const existing = card.querySelectorAll("[data-date-overlay]");
          for (let i = 0; i < existing.length; i++) existing[i].remove();

          card.style.position = "relative";
          card.style.overflow = "hidden";

          // Full-card dim overlay
          const overlay = document.createElement("div");
          overlay.setAttribute("data-date-overlay", "1");
          overlay.style.cssText = "position:absolute;inset:0;background:rgba(
