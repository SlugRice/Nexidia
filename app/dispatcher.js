(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;

  function openDispatcher() {
    try {
      const data = api.getShared("lastSearchResult");
      if (!data || !Array.isArray(data.rows) || !data.rows.length) {
        alert("No search results available. Run a search first.");
        return;
      }

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

      // ── State ───────────────────────────────────────────────────────────────
      const state = {
        grid: true,
        export: false,
        transcripts: false
      };

      // ── Modal backdrop ──────────────────────────────────────────────────────
      const modal = el("div", {
        style: [
          "position:fixed", "inset:0",
          "background:rgba(0,0,0,.55)",
          "z-index:999999",
          "display:flex", "align-items:center", "justify-content:center",
          "font-family:Segoe UI, Arial, sans-serif"
        ].join(";")
      });

      // ── Card ────────────────────────────────────────────────────────────────
      const card = el("div", {
        style: [
          "background:#fff",
          "width:460px",
          "border-radius:14px",
          "padding:24px 24px 20px",
          "box-shadow:0 10px 30px rgba(0,0,0,.35)",
          "position:relative"
        ].join(";")
      });

      // ── Header ──────────────────────────────────────────────────────────────
      const header = el("div", {
        style: "display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px;"
      });
      const titleBlock = el("div", {});
      titleBlock.appendChild(el("div", {
        style: "font-size:17px;font-weight:700;color:#111827;margin-bottom:2px;"
      }, "Results Ready"));
      titleBlock.appendChild(el("div", {
        style: "font-size:12px;color:#6b7280;"
      }, data.rows.length.toLocaleString() + " rows \u2022 Select outputs below"));
      const closeBtn = el("button", {
        style: [
          "border:0", "background:#f3f4f6", "color:#6b7280",
          "width:28px", "height:28px", "border-radius:50%",
          "font-size:14px", "cursor:pointer",
          "display:flex", "align-items:center", "justify-content:center",
          "flex-shrink:0"
        ].join(";")
      }, "\u2715");
      closeBtn.onclick = () => modal.remove();
      header.appendChild(titleBlock);
      header.appendChild(closeBtn);
      card.appendChild(header);

      // ── Divider ─────────────────────────────────────────────────────────────
      card.appendChild(el("div", { style: "height:1px;background:#e5e7eb;margin:14px 0;" }));

      // ── Toggle row builder ──────────────────────────────────────────────────
      function makeToggleRow(label, description, icon, stateKey) {
        const row = el("div", {
          style: [
            "display:flex", "align-items:center", "gap:14px",
            "padding:12px 14px",
            "border-radius:10px",
            "border:1px solid #e5e7eb",
            "margin-bottom:10px",
            "cursor:pointer",
            "transition:border-color 0.18s, background 0.18s",
            "user-select:none"
          ].join(";")
        });

        const iconEl = el("div", {
          style: "font-size:22px;flex-shrink:0;width:30px;text-align:center;"
        }, icon);

        const textBlock = el("div", { style: "flex:1;min-width:0;" });
        textBlock.appendChild(el("div", {
          style: "font-size:13px;font-weight:600;color:#111827;"
        }, label));
        textBlock.appendChild(el("div", {
          style: "font-size:11px;color:#6b7280;margin-top:2px;"
        }, description));

        // Pill toggle
        const PW = 40, PH = 22, KN = 16;
        const pill = el("div", {
          style: [
            "position:relative",
            "width:" + PW + "px",
            "height:" + PH + "px",
            "border-radius:999px",
            "flex-shrink:0",
            "transition:background 0.22s"
          ].join(";")
        });
        const knob = el("div", {
          style: [
            "position:absolute",
            "top:" + ((PH - KN) / 2) + "px",
            "width:" + KN + "px",
            "height:" + KN + "px",
            "border-radius:50%",
            "background:#fff",
            "box-shadow:0 1px 4px rgba(0,0,0,0.25)",
            "transition:left 0.22s"
          ].join(";")
        });
        pill.appendChild(knob);

        function applyVisual() {
          const on = state[stateKey];
          pill.style.background = on ? "#3b82f6" : "#d1d5db";
          knob.style.left = on ? (PW - KN - 3) + "px" : "3px";
          row.style.borderColor = on ? "#3b82f6" : "#e5e7eb";
          row.style.background = on ? "rgba(59,130,246,0.04)" : "#fff";
        }

        row.appendChild(iconEl);
        row.appendChild(textBlock);
        row.appendChild(pill);

        row.addEventListener("click", () => {
          state[stateKey] = !state[stateKey];
          applyVisual();
        });

        applyVisual();
        return row;
      }

      card.appendChild(makeToggleRow(
        "Results Grid",
        "Browse, sort, and filter results in an interactive table.",
        "\uD83D\uDCCA",
        "grid"
      ));
      card.appendChild(makeToggleRow(
        "Metadata Export",
        "Download results as an Excel file using your saved column layout.",
        "\uD83D\uDCBE",
        "export"
      ));
      card.appendChild(makeToggleRow(
        "Transcript Batches",
        "Fetch and package transcripts into batch files for review.",
        "\uD83D\uDCC4",
        "transcripts"
      ));

      // ── Divider ─────────────────────────────────────────────────────────────
      card.appendChild(el("div", { style: "height:1px;background:#e5e7eb;margin:14px 0;" }));

      const saveSearchBtn = el("button", {
      style: "width:100%;padding:9px;border-radius:10px;border:1px solid #22c55e;background:#fff;color:#16a34a;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:10px;"
      }, "\uD83D\uDCBE Save This Search");
      saveSearchBtn.onclick = () => {
        const fn = api.getShared("openGlobalSavePrompt");
        if (fn) fn();
        else alert("Save function not available.");
      };
      card.appendChild(saveSearchBtn);

      // ── Confirm button ──────────────────────────────────────────────────────
      const confirmBtn = el("button", {
        style: [
          "width:100%",
          "padding:10px",
          "border-radius:10px",
          "border:0",
          "background:linear-gradient(135deg,#1d4ed8,#3b82f6)",
          "color:#fff",
          "font-size:14px",
          "font-weight:600",
          "cursor:pointer",
          "box-shadow:0 2px 8px rgba(59,130,246,0.35)"
        ].join(";")
      }, "Confirm");

      confirmBtn.onclick = () => {
        if (!state.grid && !state.export && !state.transcripts) {
          alert("Select at least one output.");
          return;
        }
api.setShared("dispatcherState", { ...state });
modal.remove();
dispatch();
      };

      card.appendChild(confirmBtn);
      modal.appendChild(card);
      document.body.appendChild(modal);

    } catch (err) {
      console.error(err);
      alert("Dispatcher failed to open. Check console for details.");
    }
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────
  function dispatch() {
    const state = api.getShared("dispatcherState");
    if (!state) return;

    if (state.grid) {
      const tool = api.listTools().find((t) => t.id === "resultsGrid");
      if (tool) tool.open();
      else alert("Results Grid not loaded. Check manifest.");
    }

    if (state.export) {
      const tool = api.listTools().find((t) => t.id === "metadataExport");
      if (tool) tool.open();
      else alert("Metadata Export not loaded. Check manifest.");
    }

    if (state.transcripts) {
      const tool = api.listTools().find((t) => t.id === "transcriptBatchBuilder");
      if (tool) tool.open();
      else alert("Transcript Batch Builder not loaded. Check manifest.");
    }
  }

  api.registerTool({ id: "dispatcher", label: "Dispatcher", open: openDispatcher });
})();
