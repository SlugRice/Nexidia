//[Last Update: 8/4/2026]
//##> Standalone report. Population = the full NYCE call set, defined by three
//##> filters (Node contains NYCE, DNIS, Group number). Phrase tiering (v5):
//##>   Set A) strong, high-precision phrases, UNGATED (one hit qualifies at any
//##>          sentiment). Surface as Search columns.
//##>   Set B) weak, corroborating phrases, AND'd with a softer sentiment floor
//##>          (SENTIMENT_CORROB) so they cannot qualify a call by themselves.
//##>   Set C) sentimentScore BETWEEN floor and -1.2, no phrase required.
//##> Union by Trans_Id encodes the OR keep rule, so no client-side re-check is
//##> needed. Dead and boilerplate/agent-scripted phrases were removed from the keep
//##> path entirely (see Script Audit). Phrase matching is exact substring against
//##> the transcript, so a strong phrase like "Make a complaint" also trips the weak
//##> phrase "Complaint"; that shows as an extra Search-column label on an already
//##> kept row and never changes the keep decision. Each kept row is tagged with a
//##> Route showing why it survived. Rows sort ascending by sentiment; columns are
//##> ordered explicitly with blank placeholder columns interleaved.
(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;
  const registry = api.getShared("reportRegistry");
  if (!registry) return;

  const NODE_FIELD = "UDFVarchar120";
  const DNIS_FIELD = "DNIS";
  const GROUP_FIELD = "UDFVarchar10";
  const NODE_VALUE = "NYCE";
  const DNIS_VALUE = "8448495750";
  const GROUP_VALUE = "76417151";
  const SENTIMENT_FIELD = "sentimentScore";
  const SENTIMENT_FLOOR = -99;
  const SENTIMENT_THRESHOLD = -1.2;   //##> standalone keep (unchanged)
  const SENTIMENT_CORROB = -0.4;      //##> weak-phrase companion floor

  //##> Tier 1: high precision. UNGATED — one hit qualifies at any sentiment.
  const PHRASES_STRONG = [
    "Make a complaint", "Need a supervisor", "Not my problem", "Ridiculous",
    "Tired of", "Frustrated", "Disappointed"
  ];
  //##> Tier 2: corroborating only. AND'd with SENTIMENT_CORROB so these cannot
  //##> qualify a call by themselves. Re-audit periodically (see Script Audit).
  const PHRASES_WEAK = [
    "Unbelievable", "Unacceptable", "Impossible", "Annoyed",
    "Complaint", "Frustrating", "Absurd", "Getting nowhere"
  ];

  //##> Requested output columns after the Search columns. Real columns resolve to a
  //##> Nexidia storageName (by display name at runtime, then fallback). Fallbacks for
  //##> Calluuid/Member ID/NPI/User to User and the Contact Reason levels are confirmed
  //##> storage names since those display labels do not resolve through the metadata
  //##> endpoint.
  const REAL_COLUMNS = [
    { display: "Agent", fallback: "agentName" },
    { display: "Date/Time", fallback: "recordedDateTime" },
    { display: "Duration", fallback: "mediaFileDuration" },
    { display: "Hold Time", fallback: "udfint4" },
    { display: "Supervisor", fallback: "supervisorName" },
    { display: "Sentiment", fallback: SENTIMENT_FIELD },
    { display: "Contact Reason Level 1", fallback: "primaryIntentCategory" },
    { display: "Contact Reason Level 2", fallback: "primaryIntentTopic" },
    { display: "Contact Reason Level 3", fallback: "primaryIntentSubtopic" },
    { display: "Experience Id", fallback: "experienceId" },
    { display: "Calluuid", fallback: "UDFVarchar122" },
    { display: "Node", fallback: NODE_FIELD },
    { display: "Member ID", fallback: "UDFVarchar50" },
    { display: "Trans_Id", fallback: "UDFVarchar110" },
    { display: "Provider Tax ID", fallback: "UDFVarchar136" },
    { display: "NPI", fallback: "UDFVarchar41" },
    { display: "Orig ANI", fallback: "UDFVarchar115" },
    { display: "User to User", fallback: "UDFVarchar1" }
  ];
  const BLANK_AFTER_TRANS = ["Valid", "Issue", "Notes", "Repeat Caller", "Passcode", "Inquiry Limit"];
  const BLANK_TAIL = ["Caller Name", "Provider", "Callback Number", "DOS", "Billed Amount", "Claim Number", "Received", "Status", "Reference Number"];

  //##> Final display order after the Search columns. Route is a virtual column
  //##> (keep-reason attribution) mapped to _route in the fields build below.
  const DISPLAY_ORDER = [
    "Agent", "Date/Time", "Duration", "Hold Time", "Supervisor", "Sentiment", "Route",
    "Contact Reason Level 1", "Contact Reason Level 2", "Contact Reason Level 3",
    "Experience Id", "Calluuid", "Node", "Member ID", "Trans_Id",
    "Valid", "Issue", "Notes", "Repeat Caller", "Passcode", "Inquiry Limit",
    "Provider Tax ID", "NPI", "Orig ANI", "User to User",
    "Caller Name", "Provider", "Callback Number", "DOS", "Billed Amount", "Claim Number", "Received", "Status", "Reference Number"
  ];

  function blankKey(label) { return "_blank_" + label.replace(/[^a-zA-Z0-9]/g, "_"); }

  registry.register({
    id: "nyceFrustrated",
    label: "NYCE Frustrated",
    description: "Pulls the NYCE call population and keeps any call that hit a strong frustration phrase, hit a weak phrase while mildly negative, or scored at or below " + SENTIMENT_THRESHOLD + " sentiment. Each row is tagged with why it was kept.",

    async run(ctx) {
      const eng = ctx.services.searchEngine;
      const getFieldValue = ctx.helpers.getFieldValue;
      const resolve = ctx.helpers.resolveStorageByDisplay;

      //##> Resolve real columns; anything unresolved becomes a named blank column.
      const resolvedReal = {};
      const unresolved = [];
      for (const c of REAL_COLUMNS) {
        const sn = resolve(c.display) || c.fallback;
        if (sn) resolvedReal[c.display] = sn; else unresolved.push(c.display);
      }
      const sentimentSn = resolvedReal["Sentiment"] || SENTIMENT_FIELD;

      //##> Fields every search must return: resolved real columns + keys + sentiment.
      const searchFields = ["sourceMediaId", "UDFVarchar110"];
      for (const display of Object.keys(resolvedReal)) if (!searchFields.includes(resolvedReal[display])) searchFields.push(resolvedReal[display]);
      if (!searchFields.includes(sentimentSn)) searchFields.push(sentimentSn);

      //##> Population filters + phrase groups + numeric sentiment filters.
      const popFilters = [
        eng.buildKeywordFilter(NODE_FIELD, [NODE_VALUE], "CONTAINS"),
        eng.buildKeywordFilter(DNIS_FIELD, [DNIS_VALUE], "IN"),
        eng.buildKeywordFilter(GROUP_FIELD, [GROUP_VALUE], "IN")
      ];
      const strongGroups = PHRASES_STRONG.map((p) => ({ group: eng.buildTextFilter(p, "transcript"), display: '"' + p + '"' }));
      const weakGroups = PHRASES_WEAK.map((p) => ({ group: eng.buildTextFilter(p, "transcript"), display: '"' + p + '"' }));
      const sentimentFilter = eng.buildDecimalFilter(sentimentSn, SENTIMENT_FLOOR, SENTIMENT_THRESHOLD);
      const corrobFilter = eng.buildDecimalFilter(sentimentSn, SENTIMENT_FLOOR, SENTIMENT_CORROB);

      const runSets = [];
      for (const f of popFilters) {
        //##> Set A: strong phrases, ungated. Survives a passing sentiment score.
        runSets.push({ keywordGroup: { operator: "AND", invertOperator: false, filters: [f] }, phraseGroups: strongGroups });
        //##> Set B: weak phrases, gated on mild negativity. Needs corroboration.
        runSets.push({ keywordGroup: { operator: "AND", invertOperator: false, filters: [f, corrobFilter] }, phraseGroups: weakGroups });
        //##> Set C: sentiment-only fallback, no phrase required.
        runSets.push({ keywordGroup: { operator: "AND", invertOperator: false, filters: [f, sentimentFilter] }, phraseGroups: [] });
      }

      ctx.progress.set(10, "Searching NYCE (strong + weak phrases + low sentiment)...", (PHRASES_STRONG.length + PHRASES_WEAK.length) + " phrases + sentiment \u00d7 3 groups");
      const result = await ctx.runSearch(runSets, searchFields, {});
      if (result === null) return;
      if (!result.finalRows.length) { ctx.progress.remove(); alert("No NYCE calls qualified for this date range."); return; }

      //##> Union already encodes the OR keep rule; every returned row qualifies.
      const kept = result.finalRows.slice();

      //##> Route attribution: tag each row with why it was kept. Priority: strong
      //##> phrase, then standalone sentiment, then weak-corroborated.
      const STRONG_SET = new Set(PHRASES_STRONG.map((p) => p.toLowerCase()));
      const WEAK_SET = new Set(PHRASES_WEAK.map((p) => p.toLowerCase()));
      for (const entry of kept) {
        const sent = parseFloat(getFieldValue(entry.row, sentimentSn));
        const hits = (entry.phrases || []).map((p) => String(p).replace(/"/g, "").toLowerCase());
        const hasStrong = hits.some((h) => STRONG_SET.has(h));
        const hasWeak = hits.some((h) => WEAK_SET.has(h));
        const lowSent = isFinite(sent) && sent <= SENTIMENT_THRESHOLD;
        entry.row._route =
          hasStrong && lowSent ? "Phrase + Sentiment" :
          hasStrong ? "Phrase only" :
          lowSent ? "Sentiment only" :
          hasWeak ? "Weak corroborated" : "Unknown";
      }

      //##> Sort ascending by sentiment; blanks/NaN sink to the bottom.
      kept.sort((a, b) => {
        const va = parseFloat(getFieldValue(a.row, sentimentSn));
        const vb = parseFloat(getFieldValue(b.row, sentimentSn));
        const na = isFinite(va), nb = isFinite(vb);
        if (na && nb) return va - vb;
        if (na) return -1;
        if (nb) return 1;
        return 0;
      });

      //##> Populate empty values for every blank column so the cell exists per row.
      const blankLabels = DISPLAY_ORDER.filter((d) => BLANK_AFTER_TRANS.includes(d) || BLANK_TAIL.includes(d) || unresolved.includes(d));
      for (const entry of kept) for (const label of blankLabels) entry.row[blankKey(label)] = "";

      //##> Build the explicit ordered column list. Route -> _route, real ->
      //##> storageName, blank -> _blank_ key.
      const fields = [], headers = [];
      for (const display of DISPLAY_ORDER) {
        if (display === "Route") { fields.push("_route"); headers.push("Route"); }
        else if (resolvedReal[display]) { fields.push(resolvedReal[display]); headers.push(display); }
        else { fields.push(blankKey(display)); headers.push(display); }
      }

      ctx.progress.set(96, "Preparing results...", kept.length + " rows");
      ctx.dispatchToGrid(kept, {
        fields, headers,
        maxPhraseCols: result.maxPhraseCols,
        includePhraseCol: result.includePhraseCol
      });

      if (unresolved.length) {
        alert("NYCE Frustrated complete.\n\n" + kept.length.toLocaleString() + " call(s) kept.\n\nNote: these requested columns had no matching Nexidia field and were output as blank columns:\n  " + unresolved.join(", ") + "\n\nIf any should carry real data, send me their exact field/display name and I'll wire them in.");
      }
    }
  });
})();
