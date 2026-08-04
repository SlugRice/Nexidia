//##>[Last Update: 8/3/2026]
//##> Standalone report. Population = the full NYCE call set, defined by three
//##> filters (Node contains NYCE, DNIS, Group number). The OR keep rule is achieved
//##> with two scoped search sets, unioned by Trans_Id:
//##>   A) each population filter AND'd with the frustration phrase list -> phrase
//##>      matches (any sentiment). Phrase hits are scoped per pane and surface as
//##>      the Search columns.
//##>   B) each population filter AND'd with sentimentScore BETWEEN floor and -1.2
//##>      -> low-sentiment calls (no phrase needed).
//##> A row appears in the union iff it matched a phrase OR is low-sentiment, so the
//##> keep rule needs no client-side re-check. This avoids pulling the entire NYCE
//##> population just to inspect sentiment. Rows sort ascending by sentiment; columns
//##> are ordered explicitly with blank placeholder columns interleaved.
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
  const SENTIMENT_THRESHOLD = -1.2;

  const PHRASES = [
    "Supervisor", "Manager", "Escalate", "Escalation", "Complaint", "Grievance", "Upset", "Angry",
    "Annoyed", "Irritated", "Frustrating", "Frustrated", "Unacceptable", "Ridiculous", "Absurd",
    "Crazy", "Impossible", "Seriously", "Unbelievable", "Disappointed", "Disappointing", "Concern",
    "Unhappy", "Fed up", "Not fair", "Doesn't make sense", "I've called before", "Nobody helped",
    "No one helped", "Getting nowhere", "Need a supervisor", "Need a manager", "Tired of", "Sick of",
    "Make a complaint", "File a complaint", "Not my problem"
  ];

  //##> Requested output columns after the Search columns. Real columns resolve to a
  //##> Nexidia storageName (by display name at runtime, then fallback). Fallbacks for
  //##> Calluuid/Member ID/NPI/User to User are confirmed storage names since those
  //##> display labels do not resolve through the metadata endpoint.
  const REAL_COLUMNS = [
    { display: "Agent", fallback: "agentName" },
    { display: "Date/Time", fallback: "recordedDateTime" },
    { display: "Duration", fallback: "mediaFileDuration" },
    { display: "Hold Time", fallback: "udfint4" },
    { display: "Supervisor", fallback: "supervisorName" },
    { display: "Sentiment", fallback: SENTIMENT_FIELD },
    { display: "Experience Id", fallback: "experienceId" },
    { display: "Calluuid", fallback: "UDFVarchar122" },
    { display: "Node", fallback: NODE_FIELD },
    { display: "Member ID", fallback: "UDFVarchar50" },
    { display: "Trans_Id", fallback: "UDFVarchar110" },
    { display: "Provider Tax ID", fallback: "UDFVarchar136" },
    { display: "NPI", fallback: "UDFVarchar41" },
    { display: "Orig ANI", fallback: "UDFVarchar115" },
    { display: "Contact Reason Level 1", fallback: "primaryIntentCategory" },
    { display: "Contact Reason Level 2", fallback: "primaryIntentTopic" },
    { display: "Contact Reason Level 3", fallback: "primaryIntentSubtopic" },
    { display: "User to User", fallback: "UDFVarchar1" }
  ];
  const BLANK_AFTER_TRANS = ["Valid", "Issue", "Notes", "Repeat Caller", "Passcode", "Inquiry Limit"];
  const BLANK_TAIL = ["Caller Name", "Provider", "Callback Number", "DOS", "Billed Amount", "Claim Number", "Received", "Status", "Reference Number"];

  //##> Final display order after the Search columns, interleaving real and blanks.
  const DISPLAY_ORDER = [
    "Agent", "Date/Time", "Duration", "Hold Time", "Supervisor", "Sentiment", "Experience Id",
    "Calluuid", "Node", "Member ID", "Trans_Id",
    "Valid", "Issue", "Notes", "Repeat Caller", "Passcode", "Inquiry Limit",
    "Provider Tax ID", "NPI", "Orig ANI", "User to User",
    "Caller Name", "Provider", "Callback Number", "DOS", "Billed Amount", "Claim Number", "Received", "Status", "Reference Number", "Contact Reason Level 1", "Contact Reason Level 2", "Contact Reason Level 3"
  ];

  function blankKey(label) { return "_blank_" + label.replace(/[^a-zA-Z0-9]/g, "_"); }

  registry.register({
    id: "nyceFrustrated",
    label: "NYCE Frustrated",
    description: "Pulls the full NYCE call population, keeps any call that matched a frustration phrase or scored at or below " + SENTIMENT_THRESHOLD + " sentiment.",

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

      //##> Three population filters + phrase groups + the numeric sentiment filter.
      const popFilters = [
        eng.buildKeywordFilter(NODE_FIELD, [NODE_VALUE], "CONTAINS"),
        eng.buildKeywordFilter(DNIS_FIELD, [DNIS_VALUE], "IN"),
        eng.buildKeywordFilter(GROUP_FIELD, [GROUP_VALUE], "IN")
      ];
      const phraseGroups = PHRASES.map((p) => ({ group: eng.buildTextFilter(p, "transcript"), display: '"' + p + '"' }));
      const sentimentFilter = eng.buildDecimalFilter(sentimentSn, SENTIMENT_FLOOR, SENTIMENT_THRESHOLD);

      const runSets = [];
      //##> Set A: phrase matches per population pane (any sentiment).
      for (const f of popFilters) runSets.push({ keywordGroup: { operator: "AND", invertOperator: false, filters: [f] }, phraseGroups });
      //##> Set B: low-sentiment calls per population pane (no phrase).
      for (const f of popFilters) runSets.push({ keywordGroup: { operator: "AND", invertOperator: false, filters: [f, sentimentFilter] }, phraseGroups: [] });

      ctx.progress.set(10, "Searching NYCE (phrases + low sentiment)...", PHRASES.length + " phrases \u00d7 3 groups + 3 sentiment groups");
      const result = await ctx.runSearch(runSets, searchFields, {});
      if (result === null) return;
      if (!result.finalRows.length) { ctx.progress.remove(); alert("No NYCE calls matched a phrase or fell at/below " + SENTIMENT_THRESHOLD + " sentiment for this date range."); return; }

      //##> Union already encodes the OR keep rule; every returned row qualifies.
      const kept = result.finalRows.slice();

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

      //##> Build the explicit ordered column list. Real -> storageName, blank -> key.
      const fields = [], headers = [];
      for (const display of DISPLAY_ORDER) {
        if (resolvedReal[display]) { fields.push(resolvedReal[display]); headers.push(display); }
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
