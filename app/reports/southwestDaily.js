(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;
  const registry = api.getShared("reportRegistry");
  if (!registry) return;

  const NODE = "UDFVarchar120";
  const GROUP_ID = "UDFVarchar10";
  const DURATION = "mediaFileDuration";
  const TRANS = "UDFVarchar110";
  const RECORDED = "recordedDateTime";
  const OPEN_MAX_MS = 24 * 60 * 60 * 1000;
  const WARN_MAX_MS = 3 * 60 * 1000;
  const WARN_MIN_MS = 60 * 60 * 1000;

  const G1_NODE = "VQ_UHC_EI_UMR_SAN_SWA_PlanAdvisor_PG_Domestic";
  const G2_NODE = "VQ_UHC_EI_UMR_SAN_SWA_Provider_Domestic";
  const DEFAULT_GROUP_ID = "76417701";

  const SEARCH_FIELDS = [
    "agentName", "UDFVarchar10", "UDFVarchar111", "UDFVarchar47", "UDFVarchar50",
    "recordedDateTime", "mediaFileDuration", "UDFInt4", "supervisorName", "sentimentScore",
    "experienceId", "UDFVarchar122", "UDFVarchar104", "UDFVarchar105", "siteName",
    "UDFVarchar126", "DNIS", "UDFVarchar141", "UDFVarchar120", "UDFVarchar110", "sourceMediaId"
  ];

  //##> All Calls sheet: standard metadata only, no workup/manual columns.
  const POP_FIELDS = [
    "agentName", "UDFVarchar10", "UDFVarchar111", "UDFVarchar47", "UDFVarchar50",
    "recordedDateTime", "mediaFileDuration", "UDFInt4", "supervisorName", "sentimentScore",
    "experienceId", "UDFVarchar122", "UDFVarchar104", "UDFVarchar105", "siteName",
    "UDFVarchar126", "DNIS", "UDFVarchar141", "UDFVarchar120", "UDFVarchar110"
  ];
  const POP_HEADERS = [
    "Agent", "Group ID (Policy ID)", "Provider Flag", "Caller Type", "Member ID",
    "Date/Time", "Duration", "Hold Time", "Supervisor", "Sentiment",
    "Experience Id", "Calluuid", "Member First Name", "Member Last Name", "Site",
    "Employee ID", "DNIS", "Actual Site", "Node", "Trans_Id"
  ];

  //##> SWA Daily sheet: full workup layout including the blank manual columns.
  const SEL_FIELDS = [
    "agentName", "UDFVarchar10", "UDFVarchar111", "UDFVarchar47", "UDFVarchar50",
    "recordedDateTime", "mediaFileDuration", "UDFInt4", "supervisorName", "sentimentScore",
    "_blank_Score", "experienceId", "UDFVarchar122", "UDFVarchar104", "UDFVarchar105",
    "siteName", "UDFVarchar126", "DNIS", "UDFVarchar141", "UDFVarchar120", "UDFVarchar110",
    "_blank_Tags", "_blank_SubTags", "_blank_Notes", "_blank_BA", "_blank_Date_Completed"
  ];
  const SEL_HEADERS = [
    "Agent", "Group ID (Policy ID)", "Provider Flag", "Caller Type", "Member ID",
    "Date/Time", "Duration", "Hold Time", "Supervisor", "Sentiment",
    "Score", "Experience Id", "Calluuid", "Member First Name", "Member Last Name",
    "Site", "Employee ID", "DNIS", "Actual Site", "Node", "Trans_Id",
    "Tags", "SubTags", "Notes", "BA", "Date Completed"
  ];

  const SPECIAL_LABEL = { calls: "Calls per day to select", durmin: "Duration Minimum", durmax: "Duration Maximum" };
  const SPECIAL_KINDS = ["calls", "durmin", "durmax"];

  function splitValues(raw) {
    return [...new Set(String(raw || "").replace(/\r\n/g, "\n").replace(/\t/g, "\n").split(/[\n,]+/).map((s) => s.trim()).filter(Boolean))];
  }

  function friendlyDuration(ms) {
    const min = ms / 60000;
    if (min >= 60 && min % 60 === 0) { const h = min / 60; return h + " " + (h === 1 ? "hour" : "hours"); }
    const m = Number.isInteger(min) ? String(min) : String(Math.round(min * 10) / 10);
    return m + " " + (min === 1 ? "minute" : "minutes");
  }

  function pickRandom(arr, n) {
    const copy = arr.slice();
    const count = Math.max(0, Math.min(n, copy.length));
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (copy.length - i));
      const tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy.slice(0, count);
  }

  registry.register({
    id: "southwestDaily",
    label: "Southwest Daily",
    description: "Pulls SWA Plan Advisor and Provider calls by node, group, and duration. The full population and the random per-day sample export as two tabs of one workbook.",

    buildConfig(container, helpers) {
      const el = helpers.el;
      const metadataFields = helpers.metadataFields;
      const makeFieldPicker = helpers.makeFieldPicker;
      const savedGroups = helpers && helpers.savedConfig && Array.isArray(helpers.savedConfig.groups) ? helpers.savedConfig.groups : null;

      const groupsWrap = el("div", {});
      container.appendChild(groupsWrap);
      const groupObjs = [];

      function specialPresent(group, kind) {
        for (const r of group.rows) if (r.kind === kind) return true;
        return false;
      }

      function makeRow(group, kind, opts) {
        opts = opts || {};
        const row = { kind, rowEl: null, picker: null, valueInput: null, input: null };
        const removeBtn = el("button", { style: "width:22px;height:22px;border-radius:50%;border:1px solid #e5e7eb;background:#fff;color:#aaa;cursor:pointer;font-size:12px;flex-shrink:0;", title: "Remove" }, "\u00d7");
        const rowEl = el("div", { style: "display:flex;gap:8px;align-items:center;margin:6px 0;" });
        rowEl.appendChild(removeBtn);

        if (kind === "field") {
          const picker = makeFieldPicker(metadataFields, opts.storageName || "");
          const valueInput = el("input", { type: "text", value: opts.value || "", placeholder: "Values (comma or line separated)", style: "flex:1;min-width:0;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;" });
          row.picker = picker; row.valueInput = valueInput;
          rowEl.appendChild(picker.wrapper);
          rowEl.appendChild(valueInput);
        } else if (kind === "calls") {
          const label = el("div", { style: "display:flex;align-items:center;gap:6px;flex:0 0 220px;font-size:13px;color:#374151;" });
          label.appendChild(el("span", {}, "Calls per day to select:"));
          label.appendChild(el("span", { title: "Amount of qualifying calls to set aside per day for the report.", style: "display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:#e5e7eb;color:#374151;font-size:11px;font-style:italic;cursor:help;" }, "i"));
          const input = el("input", { type: "number", min: "0", value: opts.value != null ? String(opts.value) : "0", style: "width:90px;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;" });
          row.input = input;
          rowEl.appendChild(label);
          rowEl.appendChild(input);
        } else {
          const label = el("div", { style: "flex:0 0 220px;font-size:13px;color:#374151;" }, SPECIAL_LABEL[kind]);
          const input = el("input", { type: "number", min: "0", step: "0.5", value: opts.value != null ? String(opts.value) : "0", style: "width:90px;padding:7px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;" });
          row.input = input;
          rowEl.appendChild(label);
          rowEl.appendChild(input);
          rowEl.appendChild(el("span", { style: "font-size:12px;color:#6b7280;" }, "minutes"));
        }

        row.rowEl = rowEl;
        removeBtn.onclick = () => {
          const idx = group.rows.indexOf(row);
          if (idx !== -1) group.rows.splice(idx, 1);
          rowEl.remove();
        };
        return row;
      }

      function addRow(group, kind, opts) {
        const row = makeRow(group, kind, opts);
        group.rows.push(row);
        group.rowsContainer.appendChild(row.rowEl);
        return row;
      }

      function openAddMenu(group, anchorBtn) {
        const wrap = el("div", { style: "position:relative;display:inline-block;" });
        anchorBtn.parentNode.insertBefore(wrap, anchorBtn.nextSibling);
        const menu = el("div", { style: "position:absolute;top:4px;left:0;z-index:30;background:#fff;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.15);padding:4px;min-width:190px;" });
        const options = [{ kind: "field", label: "Nexidia field" }];
        for (const s of SPECIAL_KINDS) if (!specialPresent(group, s)) options.push({ kind: s, label: SPECIAL_LABEL[s] });
        function cleanup() { document.removeEventListener("mousedown", onDoc, true); try { wrap.remove(); } catch (_) {} }
        function onDoc(e) { if (!wrap.contains(e.target) && e.target !== anchorBtn) cleanup(); }
        for (const o of options) {
          const item = el("div", { style: "padding:7px 10px;font-size:13px;cursor:pointer;border-radius:6px;" }, o.label);
          item.onmouseenter = () => { item.style.background = "#eff6ff"; };
          item.onmouseleave = () => { item.style.background = ""; };
          item.onclick = () => {
            if (o.kind === "field") addRow(group, "field", {});
            else if (o.kind === "calls") addRow(group, "calls", { value: 0 });
            else if (o.kind === "durmin") addRow(group, "durmin", { value: 10 });
            else if (o.kind === "durmax") addRow(group, "durmax", { value: 60 });
            cleanup();
          };
          menu.appendChild(item);
        }
        wrap.appendChild(menu);
        setTimeout(() => document.addEventListener("mousedown", onDoc, true), 0);
      }

      function renumberGroups() {
        for (let i = 0; i < groupObjs.length; i++) groupObjs[i].titleEl.textContent = "Group " + (i + 1);
      }

      function makeGroupShell() {
        const group = { rows: [], rowsContainer: null, el: null, titleEl: null };
        const groupEl = el("div", { style: "border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-bottom:12px;background:#fff;" });
        const header = el("div", { style: "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;" });
        const title = el("div", { style: "font-size:14px;font-weight:700;color:#111827;" }, "Group");
        const removeGroupBtn = el("button", { style: "padding:4px 10px;border-radius:7px;border:1px solid #ef4444;background:#fff;color:#ef4444;font-size:11px;cursor:pointer;" }, "Remove group");
        header.appendChild(title);
        header.appendChild(removeGroupBtn);
        groupEl.appendChild(header);
        const rowsContainer = el("div", {});
        groupEl.appendChild(rowsContainer);
        const addBtn = el("button", { style: "margin-top:8px;padding:6px 12px;border-radius:8px;border:1px solid #3b82f6;background:#fff;color:#3b82f6;cursor:pointer;font-size:12px;" }, "+ Add field");
        addBtn.onclick = () => openAddMenu(group, addBtn);
        groupEl.appendChild(addBtn);
        group.rowsContainer = rowsContainer;
        group.el = groupEl;
        group.titleEl = title;
        removeGroupBtn.onclick = () => {
          if (groupObjs.length <= 1) { alert("At least one group is required."); return; }
          const idx = groupObjs.indexOf(group);
          if (idx !== -1) groupObjs.splice(idx, 1);
          groupEl.remove();
          renumberGroups();
        };
        return group;
      }

      function mountGroup(group) {
        groupObjs.push(group);
        groupsWrap.appendChild(group.el);
        renumberGroups();
        return group;
      }

      function addDefaultGroup(prefill) {
        const group = makeGroupShell();
        addRow(group, "field", { storageName: NODE, value: prefill.node });
        addRow(group, "field", { storageName: GROUP_ID, value: DEFAULT_GROUP_ID });
        addRow(group, "calls", { value: prefill.calls });
        addRow(group, "durmin", { value: 10 });
        addRow(group, "durmax", { value: 60 });
        return mountGroup(group);
      }

      function addGroupFromSpec(spec) {
        const group = makeGroupShell();
        const fields = Array.isArray(spec.fields) ? spec.fields : [];
        for (const f of fields) addRow(group, "field", { storageName: f.storageName, value: (f.values || []).join(", ") });
        if (spec.callsToSelect != null) addRow(group, "calls", { value: spec.callsToSelect });
        if (spec.durMinMs != null) addRow(group, "durmin", { value: spec.durMinMs / 60000 });
        if (spec.durMaxMs != null) addRow(group, "durmax", { value: spec.durMaxMs / 60000 });
        return mountGroup(group);
      }

      if (savedGroups && savedGroups.length) {
        for (const spec of savedGroups) addGroupFromSpec(spec);
      } else {
        addDefaultGroup({ node: G1_NODE, calls: 18 });
        addDefaultGroup({ node: G2_NODE, calls: 8 });
      }

      const addGroupBtn = el("button", { style: "padding:6px 14px;border-radius:8px;border:1px dashed #6b7280;background:#fff;color:#374151;cursor:pointer;font-size:12px;" }, "+ Add group");
      addGroupBtn.onclick = () => addDefaultGroup({ node: "", calls: 0 });
      container.appendChild(addGroupBtn);

      return {
        getConfig() {
          const groups = groupObjs.map((g) => {
            const fields = [];
            let callsToSelect = null, durMinMs = null, durMaxMs = null;
            for (const row of g.rows) {
              if (row.kind === "field") {
                const storageName = row.picker.getStorageName();
                const values = splitValues(row.valueInput.value);
                if (storageName && values.length) fields.push({ storageName, values });
              } else if (row.kind === "calls") {
                const n = parseInt(row.input.value, 10);
                callsToSelect = isNaN(n) ? null : Math.max(0, n);
              } else if (row.kind === "durmin") {
                const mins = parseFloat(row.input.value);
                durMinMs = (isNaN(mins) || mins <= 0) ? null : Math.round(mins * 60000);
              } else if (row.kind === "durmax") {
                const mins = parseFloat(row.input.value);
                durMaxMs = (isNaN(mins) || mins <= 0) ? null : Math.round(mins * 60000);
              }
            }
            return { fields, callsToSelect, durMinMs, durMaxMs };
          });
          return { groups };
        }
      };
    },

    validateConfig(config) {
      const groups = (config && config.groups) || [];
      let anyFilter = false;
      for (const g of groups) if (g.fields && g.fields.length) anyFilter = true;
      if (!anyFilter) { alert("All search parameters have been removed. Please go back and enter some search parameters."); return false; }
      for (const g of groups) {
        if (g.durMinMs != null && g.durMaxMs != null && g.durMinMs > g.durMaxMs) {
          alert("Joe. What are you doing? You set the minimum higher than the maximum! Go get some coffee and try it again.");
          return false;
        }
      }
      for (const g of groups) {
        if (g.durMaxMs != null && g.durMaxMs < WARN_MAX_MS) {
          if (!confirm("This will only show you calls that are under " + friendlyDuration(g.durMaxMs) + ". Did you want to proceed?")) return false;
        }
        if (g.durMinMs != null && g.durMinMs > WARN_MIN_MS) {
          const mins = Math.round(g.durMinMs / 60000);
          if (!confirm("This will only show you calls that are over " + mins + " minutes long. Did you want to proceed?")) return false;
        }
      }
      return true;
    },

    async run(ctx) {
      const B = ctx.builders;
      const H = ctx.helpers;
      const groups = (ctx.config && ctx.config.groups) || [];

      //##> Save the launch state so the grid's Back to Report can restore the form.
      try { api.setShared("reportReturnState", { reportId: "southwestDaily", config: ctx.config, fromVal: ctx.fromVal, toVal: ctx.toVal }); } catch (_) {}

      function dayKey(row) {
        const s = String(H.getFieldValue(row, RECORDED) || "");
        const m = s.match(/^\d{4}-\d{2}-\d{2}/);
        if (m) return m[0];
        const d = new Date(s);
        return isNaN(d) ? "unknown" : d.toISOString().slice(0, 10);
      }
      function nodeVal(item) { return H.getFieldValue(item.row, NODE).toLowerCase(); }

      const groupPools = [];
      const skipped = [];
      let searchedAny = false;

      for (let gi = 0; gi < groups.length; gi++) {
        if (ctx.isCancelled()) return;
        const g = groups[gi];
        if (!g.fields || !g.fields.length) { skipped.push(gi + 1); groupPools[gi] = []; continue; }

        const kwFilters = g.fields.map((f) => B.buildKeywordFilter(f.storageName, f.values, "IN"));
        if (g.durMinMs != null || g.durMaxMs != null) {
          const low = g.durMinMs != null ? g.durMinMs : 0;
          const high = g.durMaxMs != null ? g.durMaxMs : OPEN_MAX_MS;
          kwFilters.push(B.buildDecimalFilter(DURATION, low, high));
        }
        const keywordGroup = { operator: "AND", invertOperator: false, filters: kwFilters };
        ctx.progress.set(10 + Math.floor((gi / Math.max(1, groups.length)) * 70), "Searching Group " + (gi + 1) + " of " + groups.length + "...", "");
        const result = await ctx.runSearch([{ keywordGroup, phraseGroups: [] }], SEARCH_FIELDS, {});
        if (!result) return;
        searchedAny = true;
        groupPools[gi] = result.finalRows || [];
      }

      if (!searchedAny) { ctx.progress.remove(); alert("No searchable groups. Please add at least one field filter."); return; }

      //##> Per-day sampling: pick each group's "calls per day" at random from that
      //##> group's calls on each day. Selected rows are ordered by date, then group.
      const dayset = new Set();
      for (let gi = 0; gi < groupPools.length; gi++) for (const r of groupPools[gi]) dayset.add(dayKey(r.row));
      const days = [...dayset].sort();

      const used = new Set();
      const selectedRows = [];
      const shortfalls = [];

      for (const day of days) {
        for (let gi = 0; gi < groups.length; gi++) {
          const g = groups[gi];
          const n = g.callsToSelect == null ? 0 : g.callsToSelect;
          if (n <= 0 || !groupPools[gi] || !groupPools[gi].length) continue;
          const dayRows = groupPools[gi].filter((r) => dayKey(r.row) === day && (() => { const t = H.getFieldValue(r.row, TRANS); return !t || !used.has(t); })());
          if (dayRows.length < n) shortfalls.push({ group: gi + 1, day, requested: n, got: dayRows.length });
          const picks = pickRandom(dayRows, n);
          for (const p of picks) { selectedRows.push(p); const t = H.getFieldValue(p.row, TRANS); if (t) used.add(t); }
        }
      }

      //##> All Calls: full deduped union of all groups, sorted by node.
      const popSeen = new Set();
      const populationRows = [];
      for (let gi = 0; gi < groupPools.length; gi++) {
        for (const r of groupPools[gi]) {
          const t = H.getFieldValue(r.row, TRANS);
          if (t) { if (popSeen.has(t)) continue; popSeen.add(t); }
          populationRows.push(r);
        }
      }
      populationRows.sort((a, b) => { const na = nodeVal(a), nb = nodeVal(b); return na < nb ? -1 : na > nb ? 1 : 0; });

      //##> Fallback rows for a grid without the session hook: selected on top, a
      //##> three-row gap, then the remaining population sorted by node.
      const restRows = populationRows.filter((r) => { const t = H.getFieldValue(r.row, TRANS); return !t || !used.has(t); });
      const gap = [{ row: {}, phrases: [] }, { row: {}, phrases: [] }, { row: {}, phrases: [] }];
      const fallbackRows = selectedRows.concat(gap, restRows);

      const gridSession = {
        title: "Southwest Daily",
        exportBaseName: "SWA Daily",
        back: { toolId: "reports" },
        sheets: [
          { id: "population", name: "All Calls", export: true, rows: populationRows, fields: POP_FIELDS, headers: POP_HEADERS },
          { id: "selected", name: "SWA Daily", export: true, rows: selectedRows, fields: SEL_FIELDS, headers: SEL_HEADERS }
        ]
      };
      try { api.setShared("gridSession", gridSession); } catch (_) {}

      const msgs = [];
      if (shortfalls.length) {
        const lines = shortfalls.map((s) => s.requested + " calls requested from Group " + s.group + " for " + s.day + ", but only " + s.got + " qualifying calls were found. All of them were placed on top.");
        msgs.push(lines.join("\n") + "\n\nIf more are required, try broadening the filters or the date range.");
      }
      if (skipped.length) {
        msgs.push("Group" + (skipped.length > 1 ? "s " : " ") + skipped.join(", ") + " had no field filters and " + (skipped.length > 1 ? "were" : "was") + " skipped.");
      }
      if (msgs.length) alert(msgs.join("\n\n"));

      ctx.dispatchToGrid(fallbackRows, { fields: SEL_FIELDS, headers: SEL_HEADERS });
    }
  });
})();
