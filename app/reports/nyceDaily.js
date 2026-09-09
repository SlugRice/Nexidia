(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;
  const registry = api.getShared("reportRegistry");
  if (!registry) return;

  const DEFAULT_NODE_VALUE = "VQ_UHC_EI_UMR_NYCE_Provider_OGA";
  const DAY_MS = 24 * 60 * 60 * 1000;

  const COLUMN_DEFS = [
    { kind: "field", label: "Agent", display: "Agent", fallback: "agentName" },
    { kind: "field", label: "Group ID (Policy ID)", display: "Group ID (Policy ID)", fallback: "UDFVarchar10" },
    { kind: "field", label: "Provider Flag", display: "Provider Flag" },
    { kind: "field", label: "Caller Type", display: "Caller Type" },
    { kind: "field", label: "Date/Time", display: "Date/Time", fallback: "recordedDateTime" },
    { kind: "duration", label: "Duration" },
    { kind: "field", label: "Hold Time", display: "Hold Time", fallback: "UDFInt4" },
    { kind: "field", label: "Supervisor", display: "Supervisor", fallback: "supervisorName" },
    { kind: "field", label: "Sentiment", display: "Sentiment", fallback: "sentimentScore" },
    { kind: "blank", label: "Score" },
    { kind: "field", label: "Experience Id", display: "Experience Id", fallback: "experienceId" },
    { kind: "field", label: "Calluuid", display: "Calluuid", fallback: "UDFVarchar122" },
    { kind: "field", label: "Member First Name", display: "Member First Name" },
    { kind: "field", label: "Member Last Name", display: "Member Last Name" },
    { kind: "field", label: "Site", display: "Site" },
    { kind: "field", label: "Employee ID", display: "Employee ID" },
    { kind: "field", label: "DNIS", display: "DNIS", fallback: "DNIS" },
    { kind: "field", label: "Actual Site", display: "Actual Site" },
    { kind: "field", label: "Node", display: "Node", fallback: "UDFVarchar120" },
    { kind: "field", label: "Member ID", display: "Member ID", fallback: "UDFVarchar50" },
    { kind: "field", label: "Trans_Id", display: "Trans_Id", fallback: "UDFVarchar110" },
    { kind: "blank", label: "Tags" },
    { kind: "blank", label: "Notes" },
    { kind: "field", label: "Orig ANI", display: "Orig ANI", fallback: "UDFVarchar115" },
    { kind: "field", label: "NPI", display: "NPI", fallback: "UDFVarchar41" },
    { kind: "field", label: "TIN", display: "Provider Tax ID", fallback: "UDFVarchar136" },
    { kind: "blank", label: "Repeat Caller" },
    { kind: "blank", label: "Caller Name" },
    { kind: "blank", label: "DOS" },
    { kind: "blank", label: "Billed Amount" },
    { kind: "blank", label: "Claim Number" },
    { kind: "blank", label: "Received" },
    { kind: "blank", label: "Status" },
    { kind: "blank", label: "Reference Number" },
    { kind: "field", label: "User to User", display: "User to User", fallback: "UDFVarchar1" },
    { kind: "blank", label: "Special Notes" }
  ];

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  function formatDuration(ms) {
    const total = Math.round((Number(ms) || 0) / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return pad2(m) + ":" + pad2(s);
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
        const valueInput = el("input", {
          type: "text",
          value: (preset && preset.value) || "",
          placeholder: "Value",
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
            const value = r.valueInput.value.trim();
            if (!value) return;
            filters.push({
              storageName: r.picker.getStorageName(),
              display: r.picker.getDisplayName(),
              value
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
        if (def.kind === "field") {
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
        keywordFilters.push(b.buildKeywordFilter(sn, [f.value], "IN"));
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
        picks.forEach(entry => {
          entry.row._report_duration = formatDuration(h.getFieldValue(entry.row, durSn));
          output.push(entry);
        });
      });

      const fields = [];
      const headers = [];
      resolvedCols.forEach(rc => {
        const def = rc.def;
        if (def.kind === "duration") {
          fields.push("_report_duration"); headers.push("Duration");
        } else if (def.kind === "blank") {
          fields.push("_blank_" + def.label); headers.push(def.label);
        } else if (rc.storageName) {
          fields.push(rc.storageName); headers.push(def.label);
        } else {
          fields.push("_blank_" + def.label); headers.push(def.label);
        }
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
      ctx.dispatchToGrid(output, {
        fields,
        headers,
        maxPhraseCols: result.maxPhraseCols,
        includePhraseCol: result.includePhraseCol
      });
      ctx.progress.remove();

      if (shortDays.length) {
        const lines = shortDays.map(s => "  " + s.day + ": " + s.have + " of " + s.want);
        alert("Some days had fewer calls than requested. All available were pulled:\n" + lines.join("\n"));
      }
    }
  });
})();
