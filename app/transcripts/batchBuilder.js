(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;

  function openTranscriptBatchBuilder() {
    (async () => {
      try {
        // ============================================================
        // Nexidia Batch Builder (Console) — UI + Explicit Download
        // UI tweaks:
        // - No "Copy Summary" button
        // - No digit-length/character notation shown to users
        // ============================================================

        const CFG = {
          targetTokens: 25000,
          charsPerToken: 3.5,
          gapThresholdSeconds: 60,
          concurrency: 10,
          delayMs: 60,
          fetchRetries: 3,
          retryBackoffMs: 600,
          searchTo: 10000,
          useApiFirst: true
        };

        const TARGET_CHARS = Math.floor(CFG.targetTokens * CFG.charsPerToken);

        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const enc = new TextEncoder();

        function nowStamp() {
          const d = new Date();
          const p = n => String(n).padStart(2, "0");
          return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
        }

        function uniq(arr) { return [...new Set(arr)]; }

        //##> ID DETECTION: UCIDs are always exactly 20 digits. Trans_Ids are 8-10 digits.
        //##> These length rules are load-bearing for auto-routing pasted IDs to the correct
        //##> search parameter (UDFVarchar1 vs UDFVarchar110). Do not change without verifying
        //##> against actual Nexidia data conventions.
        function parseMixed(raw) {
          const tokens = uniq(
            raw.split(/[\s,]+/g)
              .map(s => s.trim())
              .filter(Boolean)
              .map(s => s.replace(/[^\d]/g, ""))
              .filter(Boolean)
          );

          const userToUser = [];
          const transIds = [];
          const ignored = [];

          for (const t of tokens) {
            if (t.length === 20) userToUser.push(t);
            else if (t.length >= 8 && t.length <= 10) transIds.push(t);
            else ignored.push(t);
          }
          return { userToUser, transIds, ignored, total: tokens.length };
        }

        async function fetchJson(url, init) {
          const res = await fetch(url, init || { credentials: "include" });
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`${res.status} ${res.statusText} :: ${body.slice(0, 200)}`);
          }
          const ct = (res.headers.get("content-type") || "").toLowerCase();
          if (ct.includes("application/json")) return res.json();
          const t = await res.text();
          try { return JSON.parse(t); } catch { return { raw: t }; }
        }

        async function getTranscriptBySmid(smid) {
          const apiUrl = `https://apug01.nxondemand.com/NxIA/api/transcript/${smid}`;
          const svcUrl = `https://apug01.nxondemand.com/NxIA/Search/ClientServices/TranscriptService.svc/Transcripts/?SourceMediaId=${smid}&_=${Date.now()}`;

          if (CFG.useApiFirst) {
            try { return await fetchJson(apiUrl, { credentials: "include" }); }
            catch { return await fetchJson(svcUrl, { credentials: "include" }); }
          } else {
            try { return await fetchJson(svcUrl, { credentials: "include" }); }
            catch { return await fetchJson(apiUrl, { credentials: "include" }); }
          }
        }

        function gapFmt(sec) {
          sec = Math.max(0, Math.floor(sec));
          const m = Math.floor(sec / 60);
          const s = sec % 60;
          return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
        }

        function cleanTranscript(payload, gapSeconds) {
          const rows = payload?.TranscriptRows || payload?.rows || payload?.transcriptRows || [];
          const out = [];
          let lastTs = null;
          let lastSp = null;

          for (const r of rows) {
            const speakerRaw = (r.Speaker || r.speaker || "").toString().trim().toLowerCase();
            let text = (r.Text || r.text || "").toString();
            const ts = (typeof r.TotalSecondsFromStart === "number") ? r.TotalSecondsFromStart : null;

            text = text.replace(/<unk>/gi, "").trim();
            text = text.replace(/\s+/g, " ").trim();
            if (!text) { if (ts !== null) lastTs = ts; continue; }

            let sp = "";
            if (speakerRaw === "agent") sp = "S1";
            else if (speakerRaw === "customer") sp = "S2";
            else if (speakerRaw) sp = "S?";

            if (lastTs !== null && ts !== null) {
              const gap = ts - lastTs;
              if (gap >= gapSeconds) out.push(`[GAP ${gapFmt(gap)}]`);
            }

            if (out.length && sp && lastSp === sp && !out[out.length - 1].startsWith("[GAP")) {
              out[out.length - 1] = out[out.length - 1] + " " + text;
            } else {
              out.push(`${sp}: ${text}`);
              lastSp = sp || null;
            }

            if (ts !== null) lastTs = ts;
          }
          return out.join("\n");
        }

        // ZIP builder
        function crc32(buf) {
          let crc = ~0;
          for (let i = 0; i < buf.length; i++) {
            crc ^= buf[i];
            for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
          }
          return ~crc >>> 0;
        }
        const u16 = (n) => new Uint8Array([n & 255, (n >>> 8) & 255]);
        const u32 = (n) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
        const strBytes = (s) => enc.encode(s);

        function makeZip(files) {
          const localParts = [];
          const centralParts = [];
          let offset = 0;

          for (const f of files) {
            const nameBytes = strBytes(f.name);
            const dataBytes = strBytes(f.text);
            const crc = crc32(dataBytes);

            const localHeader = [
              u32(0x04034b50), u16(20), u16(0), u16(0),
              u16(0), u16(0),
              u32(crc), u32(dataBytes.length), u32(dataBytes.length),
              u16(nameBytes.length), u16(0)
            ];

            const localBlobParts = [...localHeader, nameBytes, dataBytes];
            const localSize = localBlobParts.reduce((a, p) => a + p.length, 0);
            localParts.push(...localBlobParts);

            const centralHeader = [
              u32(0x02014b50), u16(20), u16(20), u16(0), u16(0),
              u16(0), u16(0),
              u32(crc), u32(dataBytes.length), u32(dataBytes.length),
              u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
              u32(0), u32(offset)
            ];
            centralParts.push(...centralHeader, nameBytes);
            offset += localSize;
          }

          const centralSize = centralParts.reduce((a, p) => a + p.length, 0);
          const localSizeTotal = localParts.reduce((a, p) => a + p.length, 0);

          const eocd = [
            u32(0x06054b50),
            u16(0), u16(0),
            u16(files.length), u16(files.length),
            u32(centralSize),
            u32(localSizeTotal),
            u16(0)
          ];

          return new Blob([...localParts, ...centralParts, ...eocd], { type: "application/zip" });
        }

        // ---------- UI ----------
        function makeUI() {
          const overlay = document.createElement("div");
          overlay.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 999999;
            background: #0b1225; color: #e5e7eb; font-family: ui-monospace, Consolas, monospace;
            padding: 14px 14px 12px; border-radius: 10px; min-width: 360px; max-width: 520px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.12);
          `;

          const title = document.createElement("div");
          title.textContent = "Nexidia Batch Builder";
          title.style.cssText = "font-size: 14px; font-weight: 700; color: #7dd3fc; margin-bottom: 10px;";

          const close = document.createElement("div");
          close.textContent = "✕";
          close.style.cssText = "position:absolute; top:10px; right:12px; cursor:pointer; color:#94a3b8; font-size:16px;";
          close.onclick = () => overlay.remove();

          const status = document.createElement("div");
          status.textContent = "Ready.";
          status.style.cssText = "font-size: 12px; margin-bottom: 6px;";

          const detail = document.createElement("div");
          detail.textContent = "";
          detail.style.cssText = "font-size: 11px; color:#94a3b8; white-space: pre-wrap; margin-bottom: 10px;";

          const barWrap = document.createElement("div");
          barWrap.style.cssText = "height:10px; background:#070b14; border:1px solid rgba(255,255,255,0.10); border-radius:999px; overflow:hidden;";

          const bar = document.createElement("div");
          bar.style.cssText = "height:100%; width:0%; background: linear-gradient(90deg,#38bdf8,#a78bfa);";
          barWrap.appendChild(bar);

          const log = document.createElement("div");
          log.style.cssText = "margin-top:10px; max-height:160px; overflow:auto; font-size:11px; color:#cbd5e1; border-top:1px solid rgba(255,255,255,0.08); padding-top:8px; white-space:pre-wrap;";
          log.textContent = "";

          const btnRow = document.createElement("div");
          btnRow.style.cssText = "display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;";

          const btnDownload = document.createElement("button");
          btnDownload.textContent = "Download ZIP";
          btnDownload.disabled = true;
          btnDownload.style.cssText = `
            background:#22c55e; color:#06210f; border:0; padding:8px 10px; border-radius:8px;
            cursor:pointer; font-weight:700; opacity:0.6;
          `;

          btnRow.appendChild(btnDownload);

          overlay.appendChild(close);
          overlay.appendChild(title);
          overlay.appendChild(status);
          overlay.appendChild(detail);
          overlay.appendChild(barWrap);
          overlay.appendChild(btnRow);
          overlay.appendChild(log);
          document.body.appendChild(overlay);

          function setProgress(pct, msg, det) {
            bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
            if (msg !== undefined) status.textContent = msg;
            if (det !== undefined) detail.textContent = det;
          }
          function appendLog(line) {
            log.textContent += (log.textContent ? "\n" : "") + line;
            log.scrollTop = log.scrollHeight;
          }

          return { setProgress, appendLog, btnDownload };
        }

        const UI = makeUI();

        // ---------- RUN ----------
        const raw = prompt("Paste IDs:");
        if (!raw) { UI.setProgress(0, "Canceled.", ""); return; }

        const { userToUser, transIds, ignored, total } = parseMixed(raw);
        UI.appendLog(`Input values: ${total}`);
        UI.appendLog(`Matched IDs: ${userToUser.length + transIds.length}`);
        if (ignored.length) UI.appendLog(`Ignored values: ${ignored.length}`);

        if (!userToUser.length && !transIds.length) {
          UI.setProgress(0, "No valid IDs detected.", "Paste IDs and try again.");
          return;
        }

        // Resolve via Explore search (recordeddate)
        UI.setProgress(3, "Resolving IDs to calls...", "Running search");
        const filters = [];
        if (transIds.length) filters.push({ operator: "IN", type: "KEYWORD", parameterName: "UDFVarchar110", value: transIds });
        if (userToUser.length) filters.push({ operator: "IN", type: "KEYWORD", parameterName: "UDFVarchar1", value: userToUser });

        const searchPayload = {
          from: 0,
          to: CFG.searchTo,
          fields: ["sourceMediaId", "recordeddate", "UDFVarchar1", "UDFVarchar110"],
          query: { operator: "AND", filters: [{ filterType: "interactions", filters }] }
        };

        const searchData = await fetchJson("https://apug01.nxondemand.com/NxIA/api-gateway/explore/api/v1.0/search", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(searchPayload)
        });

        const results = Array.isArray(searchData.results) ? searchData.results : [];
        if (!results.length) {
          UI.setProgress(0, "No results returned.", "No calls matched.");
          return;
        }
        UI.appendLog(`Calls returned: ${results.length}`);

        // Group + build items
        const groups = new Map();
        for (const r of results) {
          const smid = r.sourceMediaId;
          if (!smid) continue;
          const u2u = (r.UDFVarchar1 || "").toString().trim();
          const tid = (r.UDFVarchar110 || "").toString().trim();
          const key = u2u || tid || `SMID_${smid}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(r);
        }

        const items = [];
        for (const [key, arr] of groups.entries()) {
          arr.sort((a, b) => ((a.recordeddate || "").toString()).localeCompare((b.recordeddate || "").toString()));
          const seen = new Set();
          const uniqArr = [];
          for (const r of arr) {
            if (!seen.has(r.sourceMediaId)) { seen.add(r.sourceMediaId); uniqArr.push(r); }
          }
          const isSet = uniqArr.length > 1;
          uniqArr.forEach((r, idx) => {
            items.push({
              groupKey: key,
              isSet,
              setKey: isSet ? key : null,
              sourceMediaId: r.sourceMediaId,
              recordeddate: (r.recordeddate || "").toString(),
              transId: (r.UDFVarchar110 || "").toString(),
              userToUser: (r.UDFVarchar1 || "").toString(),
              leg: isSet ? (idx + 1) : null
            });
          });
        }

        UI.appendLog(`Transcript pulls: ${items.length}`);
        UI.setProgress(8, "Fetching transcripts...", `0 / ${items.length}`);

        // Fetch with retries
        let cursor = 0;
        const out = new Array(items.length);
        const failed = [];

        async function fetchOne(it) {
          for (let attempt = 1; attempt <= CFG.fetchRetries; attempt++) {
            try {
              const payload = await getTranscriptBySmid(it.sourceMediaId);
              const text = cleanTranscript(payload, CFG.gapThresholdSeconds);
              return { ok: true, text: text && text.trim() ? text : `NO TRANSCRIPT ROWS\nSMID:${it.sourceMediaId}` };
            } catch (e) {
              if (attempt === CFG.fetchRetries) return { ok: false, error: String(e) };
              await sleep(CFG.retryBackoffMs * attempt);
            }
          }
        }

        async function worker() {
          while (cursor < items.length) {
            const i = cursor++;
            const it = items[i];
            await sleep(CFG.delayMs);

            const res = await fetchOne(it);
            if (res.ok) {
              out[i] = { ...it, text: res.text, charCount: res.text.length };
            } else {
              out[i] = { ...it, text: `FAILED TO FETCH TRANSCRIPT\nSMID:${it.sourceMediaId}\nERROR:${res.error}`, charCount: 0, failed: true };
              failed.push(it);
            }

            const done = i + 1;
            if (done % 10 === 0 || done === items.length) {
              const pct = 8 + Math.floor((done / items.length) * 52);
              UI.setProgress(pct, "Fetching transcripts...", `${done} / ${items.length}\nFailed: ${failed.length}`);
              UI.appendLog(`Fetched ${done}/${items.length}`);
            }
          }
        }

        await Promise.all(Array.from({ length: Math.min(CFG.concurrency, items.length) }, () => worker()));
        UI.appendLog(`Fetch complete. Failed: ${failed.length}`);

        // Batching
        UI.setProgress(62, "Batching...", "");
        const sets = new Map();
        const singles = [];

        for (const it of out) {
          if (it.isSet) {
            if (!sets.has(it.setKey)) sets.set(it.setKey, []);
            sets.get(it.setKey).push(it);
          } else {
            singles.push(it);
          }
        }

        const setUnits = [...sets.entries()].map(([k, v]) => {
          v.sort((a, b) => (a.recordeddate || "").localeCompare(b.recordeddate || ""));
          return { key: k, items: v, first: v[0]?.recordeddate || "", chars: v.reduce((a, x) => a + (x.charCount || 0), 0) };
        }).sort((a, b) => a.first.localeCompare(b.first));

        singles.sort((a, b) => (a.recordeddate || "").localeCompare(b.recordeddate || ""));
        let sIdx = 0;

        const batches = [];
        let curBatch = [];
        let curChars = 0;

        const flush = () => {
          if (curBatch.length) {
            batches.push(curBatch);
            curBatch = [];
            curChars = 0;
          }
        };

        const addSingleIfFits = () => {
          if (sIdx >= singles.length) return false;
          const it = singles[sIdx];
          if (curBatch.length && (curChars + it.charCount > TARGET_CHARS)) return false;
          curBatch.push(it);
          curChars += it.charCount;
          sIdx++;
          return true;
        };

        for (const set of setUnits) {
          if (curBatch.length && (curChars + set.chars > TARGET_CHARS)) {
            while (addSingleIfFits()) { }
            flush();
          }
          if (!curBatch.length && set.chars > TARGET_CHARS) {
            batches.push(set.items.slice());
            continue;
          }
          curBatch.push(...set.items);
          curChars += set.chars;
          while (addSingleIfFits()) { }
          flush();
        }

        while (sIdx < singles.length) {
          if (curBatch.length && (curChars + singles[sIdx].charCount > TARGET_CHARS)) flush();
          while (addSingleIfFits()) { }
          flush();
        }

        UI.appendLog(`Batches built: ${batches.length}`);

        // Build batch files
        UI.setProgress(78, "Writing batch files...", "");
        const batchFiles = [];
        let bn = 1;

//##> BATCHING CONFIG: targetTokens drives how transcripts are grouped into batch files
//##> for downstream LLM processing. charsPerToken is a heuristic (3.5 chars = 1 token).
//##> A UI for selecting batch size presets (Copilot Heavy/Medium/Light) is explicitly
//##> deferred per project roadmap - do not implement without discussion.
        
        for (const b of batches) {
          const outName = `batch-${String(bn).padStart(3, "0")}.txt`;
          const totalChars = b.reduce((a, x) => a + (x.charCount || 0), 0);
          const estTokens = Math.floor(totalChars / CFG.charsPerToken);

          let txt = "";
          txt += `===BATCH START===|BatchFile=${outName}|Created=${new Date().toISOString()}|TotalFiles=${b.length}|TotalChars=${totalChars}|EstimatedTokens=${estTokens}\n`;
          txt += `Notes: Cleaned (<unk> removed, speakers abbreviated). [GAP X:XX] marks silences of ${CFG.gapThresholdSeconds}+ seconds.\n\n`;

          let cn = 0;
          for (const it of b) {
            cn++;
            const callLabel = String(cn).padStart(2, "0");
            const tk = it.charCount ? Math.floor(it.charCount / CFG.charsPerToken) : 0;

            txt += `===BEGIN CALL===|CallNumber=${callLabel}|SourceMediaId=${it.sourceMediaId}|RecordedDate=${it.recordeddate}|Trans_Id=${it.transId}|UserToUser=${it.userToUser}|CharCount=${it.charCount}|EstimatedTokens=${tk}\n`;
            txt += (it.text || "").trim() + "\n";
            txt += `===END CALL===|CallNumber=${callLabel}|SourceMediaId=${it.sourceMediaId}\n\n`;
          }

          txt += `===BATCH END===|BatchFile=${outName}|TotalChars=${totalChars}|EstimatedTokens=${estTokens}\n`;
          batchFiles.push({ name: outName, text: txt });
          bn++;
        }

        // ZIP ready, explicit download
        UI.setProgress(90, "Creating ZIP...", `Files: ${batchFiles.length}`);
        const zip = makeZip(batchFiles);
        const zipName = `nexidia_batches_${nowStamp()}.zip`;
        const blobUrl = URL.createObjectURL(zip);

        UI.appendLog(`ZIP READY: ${zipName}`);
        UI.appendLog(`Click "Download ZIP"`);

        UI.btnDownload.disabled = false;
        UI.btnDownload.style.opacity = 1.0;

        UI.btnDownload.onclick = () => {
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = zipName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          UI.appendLog("Download triggered.");
          UI.setProgress(100, "Done.", `ZIP: ${zipName}\nFailed: ${failed.length}\nBatches: ${batches.length}`);
        };

        UI.setProgress(96, "ZIP ready.", `Click Download ZIP.\nFailed: ${failed.length}\nBatches: ${batches.length}`);

      } catch (e) {
        console.error(e);
        alert("Failed to run. Make sure you're running this from an active Nexidia session.");
      }
    })();
  }

  api.registerTool({
    id: "transcriptBatchBuilder",
    label: "Transcript Batch Builder",
    open: openTranscriptBatchBuilder
  });
})();
