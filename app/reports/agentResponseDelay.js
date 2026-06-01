//[Last Update: 10:05 AM 6/1/2026]
//[Please confirm this timestamp in your response any time it was formed using this document!]
(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;
  const registry = api.getShared("reportRegistry");
  if (!registry) return;

  function getRows(payload) {
    return payload?.TranscriptRows || payload?.rows || payload?.transcriptRows || [];
  }

  registry.register({
    id: "agentResponseDelay",
    label: "Agent Response Delay",
    description: "Find calls where the agent does not speak within a configurable number of seconds from the start of the call.",
    presetFilters: [
      { operator: "IN", type: "KEYWORD", parameterName: "callDirection", value: ["Inbound"] }
    ],
    columns: [
      { key: "agentDelay", label: "Agent First Speech (s)" },
      { key: "customerDelay", label: "Customer First Speech (s)" }
    ],

    buildConfig(container, helpers) {
      const box = helpers.el("div", {
        style: "background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 16px;margin:10px 0;"
      });
      box.appendChild(helpers.el("div", { style: "font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:10px;" }, "Report Settings"));
      const row = helpers.el("div", { style: "display:flex;align-items:center;gap:8px;font-size:13px;color:#374151;" });
      row.appendChild(document.createTextNode("Agent must speak within"));
      const input = helpers.el("input", {
        type: "number", min: 1, max: 300, value: 10,
        style: "width:60px;padding:5px 7px;border:1px solid #93c5fd;border-radius:6px;font-size:13px;text-align:center;"
      });
      row.appendChild(input);
      row.appendChild(document.createTextNode("seconds of call start"));
      box.appendChild(row);
      container.appendChild(box);
      return {
        getConfig() {
          return { threshold: parseInt(input.value) || 10 };
        }
      };
    },

    analyze(transcriptPayload, config) {
      const rows = getRows(transcriptPayload);
      const threshold = (config && config.threshold) || 10;
      let firstAgentTs = null;
      let firstCustomerTs = null;

      for (const r of rows) {
        const speaker = (r.Speaker || r.speaker || "").toString().trim().toLowerCase();
        const tsRaw = r.TotalSecondsFromStart ?? r.totalSecondsFromStart;
        const ts = (typeof tsRaw === "number") ? tsRaw : (typeof tsRaw === "string") ? parseFloat(tsRaw) : NaN;
        if (isNaN(ts)) continue;
        const text = (r.Text || r.text || "").toString().replace(/<unk>/gi, "").trim();
        if (!text) continue;

        if (speaker === "agent" && firstAgentTs === null) {
          firstAgentTs = ts;
        }
        if (speaker === "customer" && firstCustomerTs === null) {
          firstCustomerTs = ts;
        }
        if (firstAgentTs !== null && firstCustomerTs !== null) break;
      }

      const agentDelayStr = firstAgentTs !== null ? firstAgentTs.toFixed(1) : "Never";
      const customerDelayStr = firstCustomerTs !== null ? firstCustomerTs.toFixed(1) : "Never";
      const match = firstAgentTs === null || firstAgentTs > threshold;

      return {
        match,
        data: {
          agentDelay: agentDelayStr,
          customerDelay: customerDelayStr
        }
      };
    }
  });
})();
