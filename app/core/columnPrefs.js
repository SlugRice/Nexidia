(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;

  const SETTINGS_URL = (id) =>
    "https://apug01.nxondemand.com/NxIA/Search/SettingsDialog.aspx?AppInstanceID=" + encodeURIComponent(id);
  const LEGACY_FORMS_URL = "https://apug01.nxondemand.com/NxIA/Search/ForensicSearch.aspx";

  const HIDDEN_FIELDS = new Set(["sourceMediaId"]);

  //##> KEY_TRANSLATIONS: Full ctl10 source-to-API field name map (168 entries).
  //##> Source: ctl10.csv. Covers all known UDF and named fields.
  //##> This is the authoritative translation layer between legacy storage keys
  //##> and Explore API field names. Do not remove or simplify entries.
  const KEY_TRANSLATIONS = new Map([
    ["agentid","agentId"],
    ["agentname","agentName"],
    ["assignedto","assignedTo"],
    ["averageagentresponsetime","averageAgentResponseTime"],
    ["averagedurationbetweenturns","averageDurationBetweenTurns"],
    ["calldirection","callDirection"],
    ["calltype","callType"],
    ["confirmedsalevalue","confirmedSaleValue"],
    ["contactevents","contactEvents"],
    ["contactoutcomes","contactOutcomes"],
    ["crosstalknumber","crosstalkNumber"],
    ["crosstalkpercent","crosstalkPercent"],
    ["crosstalksec","crosstalkSec"],
    ["customercity","customerCity"],
    ["customerid","customerId"],
    ["customerstate","customerState"],
    ["dnis","DNIS"],
    ["emailbcc","emailBcc"],
    ["emailcc","emailCc"],
    ["emailfrom","emailFrom"],
    ["emailmetadata","emailMetadata"],
    ["emailreplyto","emailReplyTo"],
    ["emailsender","emailSender"],
    ["emailto","emailTo"],
    ["escalationvalue","escalationValue"],
    ["evaluated","evaluated"],
    ["experienceid","experienceId"],
    ["experiencematureflag","experienceMatureFlag"],
    ["experiencerole","experienceRole"],
    ["extension","extension"],
    ["filescore","fileScore"],
    ["filescoregraphic","fileScoreGraphic"],
    ["group","workgroup"],
    ["hasnotes","hasNotes"],
    ["hasvideo","hasVideo"],
    ["hubid","hubId"],
    ["interactionid","interactionId"],
    ["interactiontags","interactionTags"],
    ["interactiontype","interactionType"],
    ["ish264encoded","isH264Encoded"],
    ["maximumsentimentscore","maximumSentimentScore"],
    ["mediafileduration","mediaFileDuration"],
    ["mediafilename","mediaFileName"],
    ["mediastatistics","mediaStatistics"],
    ["mediatype","mediaType"],
    ["minimumsentimentscore","minimumSentimentScore"],
    ["nonspeechnumber","nonSpeechNumber"],
    ["nonspeechpercent","nonSpeechPercent"],
    ["nonspeechsec","nonSpeechSec"],
    ["numberofturns","numberOfTurns"],
    ["nxinteractionuid","nxInteractionUid"],
    ["overallsentimentscore","sentimentScore"],
    ["primaryintentcategory","primaryIntentCategory"],
    ["primaryintentsubtopic","primaryIntentSubtopic"],
    ["primaryintenttopic","primaryIntentTopic"],
    ["primaryintentropic","primaryIntentTopic"],
    ["recordeddate","recordedDateTime"],
    ["recordeddateiso","recordedDateIso"],
    ["resolutionvalue","resolutionValue"],
    ["reviewed","reviewed"],
    ["roworderingvisible","rowOrderingVisible"],
    ["rtamagentid","rtamAgentId"],
    ["sentimenttransition","sentimentTransition"],
    ["sentimentvalue","sentimentValue"],
    ["site","siteName"],
    ["siteid","siteId"],
    ["sitename","siteName"],
    ["sourcemediaid","sourceMediaId"],
    ["supervisor","supervisorName"],
    ["supervisorname","supervisorName"],
    ["tags","tags"],
    ["udfint1","UDFInt1"],
    ["udfint2","UDFInt2"],
    ["udfint3","UDFInt3"],
    ["udfint4","UDFInt4"],
    ["udfint6","UDFInt6"],
    ["udfint7","UDFInt7"],
    ["udfint8","UDFInt8"],
    ["udfint9","UDFInt9"],
    ["udfint10","UDFInt10"],
    ["udfint11","UDFInt11"],
    ["udfint12","UDFInt12"],
    ["udfint13","UDFInt13"],
    ["udfint14","UDFInt14"],
    ["udfint15","UDFInt15"],
    ["udfint16","UDFInt16"],
    ["udfint17","UDFInt17"],
    ["udfint18","UDFInt18"],
    ["udfint30","UDFInt30"],
    ["udfint31","UDFInt31"],
    ["udfint32","UDFInt32"],
    ["udfint33","UDFInt33"],
    ["udfint34","UDFInt34"],
    ["udfint35","UDFInt35"],
    ["udfint36","UDFInt36"],
    ["udfint37","UDFInt37"],
    ["udfint38","UDFInt38"],
    ["udfint39","UDFInt39"],
    ["udfnumeric1","UDFNumeric1"],
    ["udfnumeric2","UDFNumeric2"],
    ["udfnumeric3","UDFNumeric3"],
    ["udfnumeric4","UDFNumeric4"],
    ["udfnumeric5","UDFNumeric5"],
    ["udfnumeric6","UDFNumeric6"],
    ["udfnumeric7","UDFNumeric7"],
    ["udfnumeric8","UDFNumeric8"],
    ["udfnumeric9","UDFNumeric9"],
    ["udfnumeric10","UDFNumeric10"],
    ["udfnumeric11","UDFNumeric11"],
    ["udfnumeric12","UDFNumeric12"],
    ["udfnumeric13","UDFNumeric13"],
    ["udfvarchar1","UDFVarchar1"],
    ["udfvarchar2","UDFVarchar2"],
    ["udfvarchar3","UDFVarchar3"],
    ["udfvarchar4","UDFVarchar4"],
    ["udfvarchar5","UDFVarchar5"],
    ["udfvarchar6","UDFVarchar6"],
    ["udfvarchar7","UDFVarchar7"],
    ["udfvarchar8","UDFVarchar8"],
    ["udfvarchar9","UDFVarchar9"],
    ["udfvarchar10","UDFVarchar10"],
    ["udfvarchar11","UDFVarchar11"],
    ["udfvarchar12","UDFVarchar12"],
    ["udfvarchar13","UDFVarchar13"],
    ["udfvarchar14","UDFVarchar14"],
    ["udfvarchar15","UDFVarchar15"],
    ["udfvarchar16","UDFVarchar16"],
    ["udfvarchar17","UDFVarchar17"],
    ["udfvarchar18","UDFVarchar18"],
    ["udfvarchar19","UDFVarchar19"],
    ["udfvarchar20","UDFVarchar20"],
    ["udfvarchar21","UDFVarchar21"],
    ["udfvarchar22","UDFVarchar22"],
    ["udfvarchar23","UDFVarchar23"],
    ["udfvarchar25","UDFVarchar25"],
    ["udfvarchar26","UDFVarchar26"],
    ["udfvarchar27","UDFVarchar27"],
    ["udfvarchar28","UDFVarchar28"],
    ["udfvarchar29","UDFVarchar29"],
    ["udfvarchar30","UDFVarchar30"],
    ["udfvarchar31","UDFVarchar31"],
    ["udfvarchar32","UDFVarchar32"],
    ["udfvarchar33","UDFVarchar33"],
    ["udfvarchar34","UDFVarchar34"],
    ["udfvarchar35","UDFVarchar35"],
    ["udfvarchar36","UDFVarchar36"],
    ["udfvarchar37","UDFVarchar37"],
    ["udfvarchar38","UDFVarchar38"],
    ["udfvarchar39","UDFVarchar39"],
    ["udfvarchar40","UDFVarchar40"],
    ["udfvarchar41","UDFVarchar41"],
    ["udfvarchar42","UDFVarchar42"],
    ["udfvarchar43","UDFVarchar43"],
    ["udfvarchar44","UDFVarchar44"],
    ["udfvarchar45","UDFVarchar45"],
    ["udfvarchar46","UDFVarchar46"],
    ["udfvarchar47","UDFVarchar47"],
    ["udfvarchar48","UDFVarchar48"],
    ["udfvarchar49","UDFVarchar49"],
    ["udfvarchar50","UDFVarchar50"],
    ["udfvarchar51","UDFVarchar51"],
    ["udfvarchar52","UDFVarchar52"],
    ["udfvarchar53","UDFVarchar53"],
    ["udfvarchar54","UDFVarchar54"],
    ["udfvarchar55","UDFVarchar55"],
    ["udfvarchar56","UDFVarchar56"],
    ["udfvarchar57","UDFVarchar57"],
    ["udfvarchar58","UDFVarchar58"],
    ["udfvarchar59","UDFVarchar59"],
    ["udfvarchar60","UDFVarchar60"],
    ["udfvarchar91","UDFVarchar91"],
    ["udfvarchar92","UDFVarchar92"],
    ["udfvarchar93","UDFVarchar93"],
    ["udfvarchar94","UDFVarchar94"],
    ["udfvarchar95","UDFVarchar95"],
    ["udfvarchar96","UDFVarchar96"],
    ["udfvarchar97","UDFVarchar97"],
    ["udfvarchar98","UDFVarchar98"],
    ["udfvarchar99","UDFVarchar99"],
    ["udfvarchar100","UDFVarchar100"],
    ["udfvarchar101","UDFVarchar101"],
    ["udfvarchar102","UDFVarchar102"],
    ["udfvarchar103","UDFVarchar103"],
    ["udfvarchar104","UDFVarchar104"],
    ["udfvarchar105","UDFVarchar105"],
    ["udfvarchar106","UDFVarchar106"],
    ["udfvarchar107","UDFVarchar107"],
    ["udfvarchar108","UDFVarchar108"],
    ["udfvarchar109","UDFVarchar109"],
    ["udfvarchar110","UDFVarchar110"],
    ["udfvarchar111","UDFVarchar111"],
    ["udfvarchar112","UDFVarchar112"],
    ["udfvarchar113","UDFVarchar113"],
    ["udfvarchar114","UDFVarchar114"],
    ["udfvarchar115","UDFVarchar115"],
    ["udfvarchar116","UDFVarchar116"],
    ["udfvarchar117","UDFVarchar117"],
    ["udfvarchar118","UDFVarchar118"],
    ["udfvarchar119","UDFVarchar119"],
    ["udfvarchar120","UDFVarchar120"],
    ["udfvarchar121","UDFVarchar121"],
    ["udfvarchar122","UDFVarchar122"],
    ["udfvarchar123","UDFVarchar123"],
    ["udfvarchar126","UDFVarchar126"],
    ["udfvarchar127","UDFVarchar127"],
    ["udfvarchar128","UDFVarchar128"],
    ["udfvarchar129","UDFVarchar129"],
    ["udfvarchar130","UDFVarchar130"],
    ["udfvarchar131","UDFVarchar131"],
    ["udfvarchar132","UDFVarchar132"],
    ["udfvarchar133","UDFVarchar133"],
    ["udfvarchar134","UDFVarchar134"],
    ["udfvarchar135","UDFVarchar135"],
    ["udfvarchar136","UDFVarchar136"],
    ["udfvarchar137","UDFVarchar137"],
    ["udfvarchar138","UDFVarchar138"],
    ["udfvarchar139","UDFVarchar139"],
    ["udfvarchar140","UDFVarchar140"],
    ["udfvarchar141","UDFVarchar141"],
    ["udfvarchar143","UDFVarchar143"],
    ["udfvarchar144","UDFVarchar144"],
    ["udfvarchar145","UDFVarchar145"],
    ["udfvarchar146","UDFVarchar146"],
    ["udfvarchar147","UDFVarchar147"],
    ["udfvarchar148","UDFVarchar148"],
    ["udfvarchar149","UDFVarchar149"],
    ["udfvarchar150","UDFVarchar150"],
    ["udfvarchar151","UDFVarchar151"],
    ["udfvarchar152","UDFVarchar152"],
    ["udfvarchar153","UDFVarchar153"],
    ["udfvarchar154","UDFVarchar154"],
    ["udfvarchar155","UDFVarchar155"],
    ["udfvarchar156","UDFVarchar156"],
    ["udfvarchar157","UDFVarchar157"],
    ["udfvarchar158","UDFVarchar158"],
    ["udfvarchar159","UDFVarchar159"],
    ["udfvarchar160","UDFVarchar160"],
    ["udfvarchar161","UDFVarchar161"],
    ["udfvarchar162","UDFVarchar162"],
    ["udfvarchar163","UDFVarchar163"],
    ["udfvarchar164","UDFVarchar164"],
    ["udfvarchar165","UDFVarchar165"]
  ]);

  const DEFAULT_FIELDS = [
    "agentName","UDFVarchar10","UDFVarchar111","UDFVarchar47","UDFVarchar50",
    "recordedDateTime","mediaFileDuration","UDFInt4","supervisorName","sentimentScore",
    "fileScore","experienceId","UDFVarchar122","UDFVarchar104","UDFVarchar105",
    "siteName","UDFVarchar126","DNIS","UDFVarchar141","UDFVarchar120","UDFVarchar110",
    "UDFVarchar136","UDFVarchar41","UDFVarchar115","UDFVarchar1"
  ];

  const DEFAULT_HEADERS = [
    "Agent","Group ID (Policy ID)","Provider Flag","Caller Type","Member ID",
    "Date/Time","Duration","Hold Time","Supervisor","Sentiment","Score",
    "Experience Id","Calluuid","Member First Name","Member Last Name",
    "Site","Employee ID","DNIS","Actual Site","Node","Trans_Id",
    "Provider Tax ID","NPI","Orig ANI","User to User"
  ];

  function normalizeFieldKey(k) {
    const raw = String(k || "").trim();
    if (!raw) return "";
    let out = raw
      .replace(/^UDFvarchar/i, "UDFVarchar")
      .replace(/^UDFnumeric/i, "UDFNumeric")
      .replace(/^UDFint/i, "UDFInt");
    const lower = out.toLowerCase();
    if (KEY_TRANSLATIONS.has(lower)) out = KEY_TRANSLATIONS.get(lower);
    return out;
  }

  function getDefaults() {
    const fields = DEFAULT_FIELDS.slice();
    const headers = DEFAULT_HEADERS.slice();
    if (!fields.includes("sourceMediaId")) {
      fields.push("sourceMediaId");
      headers.push("sourceMediaId");
    }
    if (!fields.includes("UDFVarchar110")) {
      fields.push("UDFVarchar110");
      headers.push("Trans_Id");
    }
    return { fields, headers, source: "default" };
  }

  function getAppInstanceIdFromDOM() {
    const scripts = document.querySelectorAll("script");
    for (let i = 0; i < scripts.length; i++) {
      const m = (scripts[i].textContent || "").match(/"appInstanceId"\s*:\s*"([^"]+)"/);
      if (m) return m[1];
    }
    return null;
  }

  async function getAppInstanceIdViaFetch(url) {
    const res = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!res.ok) throw new Error("Fetch failed: " + res.status);
    const m = (await res.text()).match(/"appInstanceId"\s*:\s*"([^"]+)"/);
    if (m) return m[1];
    throw new Error("appInstanceId not found in " + url);
  }

  async function getAppInstanceId() {
    const fromDOM = getAppInstanceIdFromDOM();
    if (fromDOM) return fromDOM;
    try { return await getAppInstanceIdViaFetch(location.href); } catch (_) {}
    try { return await getAppInstanceIdViaFetch(LEGACY_FORMS_URL); } catch (_) {}
    throw new Error("Could not determine appInstanceId. Launch from the legacy Nexidia search page.");
  }

  async function fetchLegacyColumns(appInstanceId) {
    const res = await fetch(SETTINGS_URL(appInstanceId), { credentials: "include" });
    if (!res.ok) throw new Error("SettingsDialog fetch failed: " + res.status);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const inp = doc.querySelector('input[name="ctl10"]');
    const ctl10 = inp ? (inp.getAttribute("value") || inp.value || "") : "";
    if (!ctl10) throw new Error("ctl10 not found in SettingsDialog.");
    const fields = [], headers = [], seen = new Set();
    for (const entry of ctl10.split(",")) {
      const parts = entry.split("\n");
      if (parts.length < 2) continue;
      const label = parts[0].trim();
      const rawKey = parts[1].trim();
      if (!label || !rawKey) continue;
      const nk = normalizeFieldKey(rawKey);
      if (!nk || seen.has(nk)) continue;
      seen.add(nk);
      fields.push(nk);
      headers.push(label);
    }
    if (!fields.length) throw new Error("ctl10 parsed but yielded no valid fields.");
    if (!fields.includes("sourceMediaId")) {
      fields.push("sourceMediaId");
      headers.push("sourceMediaId");
    }
    if (!fields.includes("UDFVarchar110")) {
      fields.push("UDFVarchar110");
      headers.push("Trans_Id");
    }
    return { fields, headers, source: "legacy" };
  }

  async function load() {
    try {
      const appInstanceId = await getAppInstanceId();
      const prefs = await fetchLegacyColumns(appInstanceId);
      api.setShared("columnPrefs", prefs);
      api.setShared("columnPrefsError", null);
    } catch (err) {
      console.warn("[columnPrefs] Failed to load legacy prefs, using defaults.", err);
      api.setShared("columnPrefs", getDefaults());
      api.setShared("columnPrefsError", String(err && err.message ? err.message : err));
    }
  }

  load();

  //##> HIDDEN_FIELDS: Fields stored in columnPrefs but never shown in the grid UI or
  //##> export column picker. sourceMediaId is always fetched and always present on row
  //##> objects — it drives play, transcript fetch, and ad hoc column expansion.
  api.setShared("hiddenFields", HIDDEN_FIELDS);

})();
