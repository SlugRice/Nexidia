//[Last Update: 9:23 AM 11/10/2026]
//[Please confirm this timestamp in your response any time it was formed using this document!]
(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;
  const registry = api.getShared("reportRegistry");
  if (!registry) return;

  const DEFAULT_NODE_VALUE = "VQ_UHC_EI_UMR_NYCE_Provider_OGA, pqUHC_EI_UMR_NYCE_Prv_GLO";
  const DAY_MS = 24 * 60 * 60 * 1000;

  const COLUMN_DEFS = [
    { kind: "meta", label: "Agent", display: "Agent", fallback: "agentName" },
    { kind: "meta", label: "Group ID (Policy ID)", display: "Group ID (Policy ID)", fallback: "UDFVarchar10" },
    { kind: "meta", label: "Provider Flag", display: "Provider Flag" },
    { kind: "meta", label: "Caller Type", display: "Caller Type" },
    { kind: "meta", label: "Date/Time", display: "Date/Time", fallback: "recordedDateTime" },
    { kind: "meta", label: "Duration", display: "Duration", fallback: "mediaFileDuration" },
    { kind: "meta", label: "Hold Time", display: "Hold Time", fallback: "UDFInt4" },
    { kind: "meta", label: "Supervisor", display: "Supervisor", fallback: "supervisorName" },
    { kind: "meta", label: "Sentiment", display: "Sentiment", fallback: "sentimentScore" },
    { kind: "copilot", label: "Score", key: "Score" },
    { kind: "meta", label: "Experience Id", display: "Experience Id", fallback: "experienceId" },
    { kind: "meta", label: "Calluuid", display: "Calluuid", fallback: "UDFVarchar122" },
    { kind: "meta", label: "Member First Name", display: "Member First Name" },
    { kind: "meta", label: "Member Last Name", display: "Member Last Name" },
    { kind: "meta", label: "Site", display: "Site" },
    { kind: "meta", label: "Employee ID", display: "Employee ID" },
    { kind: "meta", label: "DNIS", display: "DNIS", fallback: "DNIS" },
    { kind: "meta", label: "Actual Site", display: "Actual Site" },
    { kind: "meta", label: "Node", display: "Node", fallback: "UDFVarchar120" },
    { kind: "meta", label: "Member ID", display: "Member ID", fallback: "UDFVarchar50", stack: ["Member_Id"] },
    { kind: "meta", label: "Trans_Id", display: "Trans_Id", fallback: "UDFVarchar110", stack: ["Trans_Id"] },
    { kind: "copilot", label: "Tags", key: "Tags" },
    { kind: "copilot", label: "Notes", key: "Summary" },
    { kind: "meta", label: "Orig ANI", display: "Orig ANI", fallback: "UDFVarchar115" },
    { kind: "meta", label: "NPI", display: "NPI", fallback: "UDFVarchar41", stack: ["NPI"] },
    { kind: "meta", label: "TIN", display: "Provider Tax ID", fallback: "UDFVarchar136", stack: ["TIN"] },
    { kind: "copilot", label: "Repeat Caller", key: "Repeat_Call", aliases: ["Repeat_Caller"] },
    { kind: "copilot", label: "Caller Name", key: "Caller_Name" },
    { kind: "copilot", label: "DOS", key: "DOS", dataType: "date", format: "M/D/YYYY", single: true },
    { kind: "copilot", label: "Billed Amount", key: "Billed_Amount", dataType: "currency", format: "$#,##0.00", single: true },
    { kind: "copilot", label: "Claim Number", key: "Claim_Number" },
    { kind: "copilot", label: "Received", key: "Received_Date", dataType: "date", format: "M/D/YYYY", single: true },
    { kind: "copilot", label: "Status", key: "Status", single: true },
    {
      kind: "copilot", label: "Reference Number", key: "Reference_Number",
      checks: [
        { type: "pattern", a: "(?!\\d{14}$).*", message: "Make sure to include the dash. Reference numbers look like YYMMDD-######## or YYYYMMDD-######." },
        { type: "pattern", a: "\\d{6}-\\d{8}|\\d{8}-\\d{6}|\\d{14}", message: "Reference numbers should look like YYMMDD-######## or YYYYMMDD-######." }
      ]
    },
    { kind: "meta", label: "User to User", display: "User to User", fallback: "UDFVarchar1" },
    { kind: "copilot", label: "Special Notes", key: "Special_Notes" },
    { kind: "copilot", label: "Timestamps", key: "Timestamps" }
  ];

  //##> UNPACK SETUP: What NYCE Daily hands Unpack besides its rows: the Instructions steps, the prompt the
  //##> Instructions button opens, and how the Timestamps column is used. Column extras (type, format, one
  //##> value only, checks) come from COLUMN_DEFS.
  const PROMPT_URL = "https://raw.githubusercontent.com/SlugRice/Nexidia/main/docs/NYCE_PPO_Daily_Prompt.txt";
  const PROMPT_LABEL = "NYCE Daily Prompt";
  const INSTRUCTIONS = [
    "Export Transcripts. The settings are already optimized for this report, so click Export Transcripts, then select Build Batches.",
    "Run your batches: send each transcript batch file with the NYCE PPO Daily prompt in its own fresh CoPilot chat. Set each chat to Temporary so the chats aren't saved.",
    "Check each response ends with a closing curly bracket }, copy it, and paste it into the box below. New information is added to the existing rows.",
    "Fields that were recognized but not complete on the transcript were given Timestamps. Click Play All Timestamps to load the calls with Timestamps. The media player jumps straight to the fields in question. Add missing data when it's available, and mark the Timestamps complete.",
    "When you're finished, click Export to Excel to save your work to an Excel sheet."
  ];
  const TIMESTAMP_USE = { Timestamps: "edit" };
  const COLUMN_EXTRAS = ["dataType", "format", "single", "unique", "checks"];
  function columnExtras(def) {
    const out = {};
    for (const k of COLUMN_EXTRAS) if (def[k] !== undefined) out[k] = def[k];
    return out;
  }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  function splitValues(raw) {
    return [...new Set(
      String(raw || "")
        .replace(/\r\n/g, "\n")
        .replace(/\t/g, "\n")
        .split(/[\n,;]+/)
        .map(s => s.trim())
        .filter(Boolean)
    )];
  }

  function nameVariants(names) {
    const out = [];
    for (const n of names) {
      const t = String(n == null ? "" : n).trim();
      if (!t) continue;
      for (const v of [t, t.replace(/_/g, " "), t.replace(/ /g, "_")]) {
        if (!out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
      }
    }
    return out;
  }

  function formatMdy(ymd) {
    const p = String(ymd || "").split("-");
    if (p.length !== 3) return String(ymd || "");
    return p[1] + "-" + p[2] + "-" + p[0];
  }

  function cleanFileName(name) {
    return String(name || "").replace(/[\\/:*?"<>|]/g, "-").replace(/\.+$/, "").trim();
  }

  function toYmd(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function previousWeekRange() {
    const now = new Date();
    const sinceMon = (now.getDay() + 6) % 7;
    const thisMon = new Date(now);
    thisMon.setDate(now.getDate() - sinceMon);
    const prevMon = new Date(thisMon);
    prevMon.setDate(thisMon.getDate() - 7);
    const prevFri = new Date(prevMon);
    prevFri.setDate(prevMon.getDate() + 4);
    return { from: toYmd(prevMon), to: toYmd(prevFri) };
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  registry.register({
    id: "nyceDaily",
    label: "NYCE Daily",
    description: "Pulls NYCE OGA provider calls by node and date, trims by call length, and takes a random daily sample with batched transcript export.",

    defaultDateRange() { return previousWeekRange(); },

    buildConfig(container, helpers) {
      const el = helpers.el;
      const saved = helpers.savedConfig || null;
      const nodeStorage = helpers.resolveStorageByDisplay("Node") || "UDFVarchar120";

      const rows = [];
      const rowsWrap = el("div", {});

      function addFilterRow(preset) {
        const picker = helpers.makeFieldPicker(helpers.metadataFields, (preset && preset.storageName) || "");
        const presetValue = preset
          ? (Array.isArray(preset.values) ? preset.values.join(", ") : (preset.value || ""))
          : "";
        const valueInput = el("input", {
          type: "text",
          value: presetValue,
          placeholder: "Values (comma or line separated)",
          style: "margin-left:8px;min-width:220px;"
        });
        const removeBtn = el("button", { type: "button", style: "margin-left:8px;" }, "Remove");
        const row = el("div", { style: "display:flex;align-items:center;margin-bottom:6px;" },
          picker.wrapper, valueInput, removeBtn);
        const entry = { picker, valueInput, row };
        removeBtn.onclick = () => {
          const i = rows.indexOf(entry);
          if (i >= 0) rows.splice(i, 1);
          row.remove();
        };
        rows.push(entry);
        rowsWrap.appendChild(row);
        return entry;
      }

      const infoStyle = "margin-left:6px;cursor:help;color:#666;font-weight:bold;";
      const numStyle = "width:120px;";

      const minInput = el("input", { type: "number", min: "0", step: "1", style: numStyle,
        value: saved && saved.durationMin != null ? String(saved.durationMin) : "120" });
      const maxInput = el("input", { type: "number", min: "0", step: "1", style: numStyle,
        value: saved && saved.durationMax != null ? String(saved.durationMax) : "0" });
      const perDayInput = el("input", { type: "number", min: "1", step: "1", style: numStyle,
        placeholder: "All", title: "Leave blank to pull all calls.",
        value: saved && saved.callsPerDay != null ? String(saved.callsPerDay) : "20" });

      const addBtn = el("button", { type: "button", style: "margin-top:4px;" }, "Add field");
      addBtn.onclick = () => addFilterRow(null);

      container.appendChild(el("div", { style: "font-weight:bold;margin-bottom:6px;" }, "Filters"));
      container.appendChild(rowsWrap);
      container.appendChild(addBtn);

      container.appendChild(el("div", { style: "margin-top:14px;font-weight:bold;" }, "Call length (seconds)"));
      container.appendChild(el("div", { style: "display:flex;align-items:center;margin-top:6px;" },
        el("label", { style: "margin-right:6px;" }, "Min"), minInput,
        el("span", { style: infoStyle, title: "Set to 0 to disable max/min" }, "\u24D8"),
        el("label", { style: "margin-left:16px;margin-right:6px;" }, "Max"), maxInput,
        el("span", { style: infoStyle, title: "Set to 0 to disable max/min" }, "\u24D8")
      ));

      container.appendChild(el("div", { style: "margin-top:14px;font-weight:bold;" }, "Calls Per Day"));
      container.appendChild(el("div", { style: "display:flex;align-items:center;margin-top:6px;" },
        perDayInput,
        el("span", { style: infoStyle, title: "Leave blank to pull all calls." }, "\u24D8")
      ));

      if (saved && Array.isArray(saved.filters) && saved.filters.length) {
        saved.filters.forEach(f => addFilterRow(f));
      } else {
        addFilterRow({ storageName: nodeStorage, value: DEFAULT_NODE_VALUE });
      }

      return {
        getConfig() {
          const filters = [];
          rows.forEach(r => {
            const values = splitValues(r.valueInput.value);
            if (!values.length) return;
            filters.push({
              storageName: r.picker.getStorageName(),
              display: r.picker.getDisplayName(),
              values
            });
          });
          const min = parseInt(minInput.value, 10);
          const max = parseInt(maxInput.value, 10);
          const perDayRaw = perDayInput.value.trim();
          const perDay = perDayRaw === "" ? null : parseInt(perDayRaw, 10);
          return {
            filters,
            durationMin: isNaN(min) ? 0 : min,
            durationMax: isNaN(max) ? 0 : max,
            callsPerDay: perDay == null || isNaN(perDay) ? null : perDay
          };
        }
      };
    },

    validateConfig(config) {
      const min = config && config.durationMin ? config.durationMin : 0;
      const max = config && config.durationMax ? config.durationMax : 0;
      if (min > 0 && max > 0 && min > max) {
        alert("Minimum call length cannot be higher than the maximum.");
        return false;
      }
      const active = (config && Array.isArray(config.filters)) ? config.filters.length : 0;
      if (active === 0) {
        alert("Add at least one filter before running.");
        return false;
      }
      if (config.callsPerDay != null && config.callsPerDay < 1) {
        alert("Calls Per Day must be blank or a number of at least 1.");
        return false;
      }
      return true;
    },

    async run(ctx) {
      const h = ctx.helpers;
      const b = ctx.builders;
      const config = ctx.config || { filters: [], durationMin: 0, durationMax: 0, callsPerDay: null };

      api.setShared("reportReturnState", {
        reportId: "nyceDaily",
        config: config,
        fromVal: ctx.fromVal,
        toVal: ctx.toVal
      });

      const durSn = h.resolveStorageByDisplay("Duration") || "mediaFileDuration";
      const dtSn = h.resolveStorageByDisplay("Date/Time") || "recordedDateTime";
      const transSn = h.resolveStorageByDisplay("Trans_Id") || "UDFVarchar110";

      const searchFields = new Set(["sourceMediaId", transSn, durSn, dtSn]);
      const resolvedCols = COLUMN_DEFS.map(def => {
        if (def.kind === "meta") {
          const sn = h.resolveStorageByDisplay(def.display) || def.fallback || null;
          if (sn) searchFields.add(sn);
          return { def, storageName: sn };
        }
        return { def, storageName: null };
      });

      const keywordFilters = [];
      config.filters.forEach(f => {
        const sn = h.resolveStorageByDisplay(f.display) || f.storageName || null;
        if (!sn) return;
        const values = Array.isArray(f.values) ? f.values : splitValues(f.value);
        if (!values.length) return;
        keywordFilters.push(b.buildKeywordFilter(sn, values, "IN"));
      });

      const min = config.durationMin || 0;
      const max = config.durationMax || 0;
      if (min > 0 || max > 0) {
        const low = min > 0 ? min * 1000 : 0;
        const high = max > 0 ? max * 1000 : DAY_MS;
        keywordFilters.push(b.buildDecimalFilter(durSn, low, high));
      }

      const runSets = [{
        keywordGroup: { operator: "AND", invertOperator: false, filters: keywordFilters },
        phraseGroups: []
      }];

      ctx.progress.set(5, "Searching calls...");
      const result = await ctx.runSearch(runSets, Array.from(searchFields), {});
      if (!result) { ctx.progress.remove(); return; }

      const finalRows = result.finalRows || [];

      const byDay = {};
      finalRows.forEach(entry => {
        const raw = h.getFieldValue(entry.row, dtSn) || "";
        const day = String(raw).slice(0, 10) || "unknown";
        (byDay[day] = byDay[day] || []).push(entry);
      });

      const days = Object.keys(byDay).sort();
      const output = [];
      const shortDays = [];

      days.forEach(day => {
        const list = byDay[day];
        let picks;
        if (config.callsPerDay == null) {
          picks = list.slice();
        } else {
          if (list.length < config.callsPerDay) {
            shortDays.push({ day, have: list.length, want: config.callsPerDay });
          }
          picks = shuffle(list).slice(0, config.callsPerDay);
        }
        picks.sort((a, b2) => {
          const av = String(h.getFieldValue(a.row, dtSn) || "");
          const bv = String(h.getFieldValue(b2.row, dtSn) || "");
          return av < bv ? -1 : av > bv ? 1 : 0;
        });
        picks.forEach(entry => output.push(entry));
      });

      const unpackColumns = [];
      const setupColumns = {};
      const fields = [];
      const headers = [];
      resolvedCols.forEach(rc => {
        const def = rc.def;
        const stack = def.stack || [];
        if (def.kind === "meta" && rc.storageName) {
          unpackColumns.push({ type: "meta", field: rc.storageName, header: def.label });
          stack.forEach(k => unpackColumns.push({ type: "copilot", key: k, header: k, aliases: nameVariants([k]), mergeInto: rc.storageName }));
          fields.push(rc.storageName); headers.push(def.label);
          return;
        }
        const key = def.key || stack[0] || def.label;
        const extras = columnExtras(def);
        unpackColumns.push(Object.assign({ type: "copilot", key, header: def.label, aliases: nameVariants([key, def.label].concat(def.aliases || [])) }, extras));
        if (Object.keys(extras).length) setupColumns[def.label] = extras;
        fields.push("_blank_" + def.label); headers.push(def.label);
      });

      const zipName = cleanFileName("NYCE Daily - " + formatMdy(ctx.fromVal) + " - " + formatMdy(ctx.toVal));
      api.setShared("reportBatchPreset", {
        exportTranscripts: true,
        transcriptMode: "batch",
        batchMode: "length",
        targetTokens: 18500,
        showTimestamps: true,
        autoDownload: false,
        zipFileName: zipName
      });

      ctx.progress.set(95, "Building results...");
      api.setShared("unpackReportSetup", {
        reportId: "nyceDaily",
        instructions: INSTRUCTIONS,
        promptUrl: PROMPT_URL,
        promptLabel: PROMPT_LABEL,
        timestampUse: TIMESTAMP_USE,
        columns: setupColumns
      });
      const sentToUnpack = typeof ctx.dispatchToUnpack === "function" && ctx.dispatchToUnpack(output, {
        columns: unpackColumns,
        primaryKey: "Trans_Id",
        keyField: transSn,
        sortField: dtSn,
        suppressMergePrompts: true,
        batchPreset: api.getShared("reportBatchPreset"),
        instructions: INSTRUCTIONS,
        promptUrl: PROMPT_URL,
        promptLabel: PROMPT_LABEL,
        timestampUse: TIMESTAMP_USE
      });
      if (!sentToUnpack) {
        api.setShared("unpackReportSetup", null);
        ctx.dispatchToGrid(output, {
          fields,
          headers,
          maxPhraseCols: result.maxPhraseCols,
          includePhraseCol: result.includePhraseCol
        });
      }
      ctx.progress.remove();

      if (shortDays.length) {
        const lines = shortDays.map(s => "  " + s.day + ": " + s.have + " of " + s.want);
        alert("Some days had fewer calls than requested. All available were pulled:\n" + lines.join("\n"));
      }
    }
  });
})();
