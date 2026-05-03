(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;

  const LOG = (msg, ...args) => console.log('[FS] ' + msg, ...args);
  const WARN = (msg, ...args) => console.warn('[FS] ' + msg, ...args);
  const ERR = (msg, ...args) => console.error('[FS] ' + msg, ...args);

  class ForensicSearchService {
    constructor() {
      this.appInstanceId = null;
      this.baseUrl = '/NxIA/Search/';
      this.paramFields = null;
      this.searchFields = null;
      this.ready = false;
    }

    getSessionId() {
      const entries = performance.getEntriesByType('resource');
      const match = entries.find(e => e.name.includes('AppInstanceID='));
      if (!match) {
        WARN('getSessionId: No resource entry contains AppInstanceID');
        return null;
      }
      LOG('getSessionId: Matched resource URL:', match.name);
      const m = match.name.match(/AppInstanceID=([^-&]+)/);
      if (!m) {
        WARN('getSessionId: Regex failed to extract session from URL');
        return null;
      }
      LOG('getSessionId: Extracted session:', m[1]);
      return m[1];
    }

    isAvailable() {
      return !!this.getSessionId();
    }

    mintAppInstanceId() {
      const sid = this.getSessionId();
      if (!sid) return null;
      const minted = sid + '-' + crypto.randomUUID();
      LOG('mintAppInstanceId:', minted);
      return minted;
    }

    async initialize(options = {}) {
      LOG('=== INITIALIZE START ===');
      LOG('Options:', JSON.stringify(options));

      const tempId = this.mintAppInstanceId();
      if (!tempId) throw new Error('No Nexidia session');

      const frameUrl = this.buildUrl('ForensicSearch.aspx', tempId);
      LOG('Fetching frame:', frameUrl);
      const frameResp = await fetch(frameUrl);
      LOG('Frame response: status=' + frameResp.status + ' size=' + frameResp.headers.get('content-length'));
      const frameHtml = await frameResp.text();
      LOG('Frame HTML length:', frameHtml.length);

      const m = frameHtml.match(/"appInstanceId":"([^"]+)"/);
      if (!m) {
        ERR('Frame HTML did not contain appInstanceId. First 500 chars:', frameHtml.substring(0, 500));
        throw new Error('Could not extract server AppInstanceId');
      }
      this.appInstanceId = m[1];
      LOG('Server AppInstanceId:', this.appInstanceId);

      const paramUrl = this.buildUrl('ParameterSelector.aspx');
      LOG('Fetching ParameterSelector:', paramUrl);
      const paramResp = await fetch(paramUrl);
      const paramHtml = await paramResp.text();
      this.paramFields = this.parseFormFields(paramHtml);
      LOG('ParameterSelector: status=' + paramResp.status + ' HTML=' + paramHtml.length + ' chars, fields=' + Object.keys(this.paramFields).length);
      LOG('Has __VIEWSTATE:', !!this.paramFields['__VIEWSTATE']);
      LOG('Has __EVENTVALIDATION:', !!this.paramFields['__EVENTVALIDATION']);

      const searchUrl = this.buildUrl('SearchBuilder.aspx');
      LOG('Fetching SearchBuilder:', searchUrl);
      const searchResp = await fetch(searchUrl);
      const searchHtml = await searchResp.text();
      this.searchFields = this.parseFormFields(searchHtml);
      LOG('SearchBuilder: status=' + searchResp.status + ' HTML=' + searchHtml.length + ' chars, fields=' + Object.keys(this.searchFields).length);
      LOG('Has __VIEWSTATE:', !!this.searchFields['__VIEWSTATE']);
      LOG('Has __EVENTVALIDATION:', !!this.searchFields['__EVENTVALIDATION']);

      if (options.startDate) {
        this.paramFields['StartDate$NXDateBox_StartDate'] = options.startDate;
        LOG('Set startDate:', options.startDate);
      }
      if (options.endDate) {
        this.paramFields['EndDate$NXDateBox_EndDate'] = options.endDate;
        LOG('Set endDate:', options.endDate);
      }
      if (options.sessionKeys) {
        this.paramFields['NXHiddenSelected_IngestSessionKey'] = options.sessionKeys;
        LOG('Set sessionKeys:', options.sessionKeys);
      }

      this.ready = true;
      LOG('=== INITIALIZE COMPLETE ===');
      return this.appInstanceId;
    }

    async search(phrase, options = {}) {
      if (!this.ready) throw new Error('Not initialized');
      LOG('=== SEARCH START ===');
      LOG('Phrase:', phrase);
      LOG('Options:', JSON.stringify(options));

      const status = options.onStatus || (() => {});

      status('Submitting filters...');
      LOG('POSTing ParameterSelector with', Object.keys(this.paramFields).length, 'fields');
      const paramPostUrl = this.buildUrl('ParameterSelector.aspx');
      LOG('Param POST URL:', paramPostUrl);
      const paramBody = this.encode(this.paramFields);
      LOG('Param POST body length:', paramBody.length);
      const paramResp = await fetch(paramPostUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: paramBody
      });
      const paramRespText = await paramResp.text();
      LOG('Param POST response: status=' + paramResp.status + ' size=' + paramRespText.length);
      this.paramFields = this.parseFormFields(paramRespText);
      LOG('Param POST parsed fields:', Object.keys(this.paramFields).length);

      status('Submitting phrase search...');
      const fields = { ...this.searchFields };

      delete fields['CancelSearchButton'];
      delete fields['viewFilesButton'];
      delete fields['ClearButton'];
      delete fields['BuildQueryButton'];

      fields['SearchExpressionBuilder$SearchTermTextBox_0'] = phrase;

      if (options.threshold) fields['SearchExpressionBuilder$ThresholdTextBox_0'] = options.threshold;
      if (options.operator) fields['uiDropDownListFindFiles'] = options.operator;
      if (options.speaker) fields['DropDownListSpeakerRole'] = options.speaker;
      if (options.timeBasis) fields['DropDownListTimeBasis'] = options.timeBasis;
      if (options.thresholdMode) fields['DropDownListCustomThreshold'] = options.thresholdMode;

      this.setMediaTypes(fields, options);

      LOG('Search fields being submitted:');
      LOG('  Phrase:', fields['SearchExpressionBuilder$SearchTermTextBox_0']);
      LOG('  Threshold:', fields['SearchExpressionBuilder$ThresholdTextBox_0']);
      LOG('  Operator:', fields['uiDropDownListFindFiles']);
      LOG('  Speaker:', fields['DropDownListSpeakerRole']);
      LOG('  TimeBasis:', fields['DropDownListTimeBasis']);
      LOG('  ThresholdMode:', fields['DropDownListCustomThreshold']);
      LOG('  Total field count:', Object.keys(fields).length);
      LOG('  Has __VIEWSTATE:', !!fields['__VIEWSTATE']);
      LOG('  Has __EVENTVALIDATION:', !!fields['__EVENTVALIDATION']);

      const searchPostUrl = this.buildUrl('SearchBuilder.aspx');
      LOG('Search POST URL:', searchPostUrl);
      const searchBody = this.encode(fields);
      LOG('Search POST body length:', searchBody.length);
      const searchResp = await fetch(searchPostUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: searchBody
      });
      const searchRespText = await searchResp.text();
      LOG('Search POST response: status=' + searchResp.status + ' size=' + searchRespText.length);

      if (searchResp.status !== 200) {
        ERR('Search POST failed. Response body:', searchRespText.substring(0, 500));
        throw new Error('Search POST returned ' + searchResp.status);
      }

      this.searchFields = this.parseFormFields(searchRespText);
      LOG('Search POST parsed fields:', Object.keys(this.searchFields).length);

      status('Waiting for results...');
      LOG('=== POLLING START ===');
      return await this.harvestResults(options, status);
    }

    setMediaTypes(fields, options) {
      const map = {
        'SearchExpressionBuilder$MediaTypeCheckBox_audio0': [options.audio !== false, '1'],
        'SearchExpressionBuilder$MediaTypeCheckBox_chat0': [!!options.chat, '4'],
        'SearchExpressionBuilder$MediaTypeCheckBox_email0': [!!options.email, '2'],
        'SearchExpressionBuilder$MediaTypeCheckBox_text0': [!!options.text, '8']
      };
      for (const [key, [on, val]] of Object.entries(map)) {
        if (on) fields[key] = val;
        else delete fields[key];
      }
      LOG('Media types: audio=' + (options.audio !== false) + ' chat=' + !!options.chat + ' email=' + !!options.email + ' text=' + !!options.text);
    }

    async harvestResults(options, status) {
      const maxWait = options.maxWait || 600000;
      const interval = options.pollInterval || 5000;
      const start = Date.now();
      let pollCount = 0;

      while (Date.now() - start < maxWait) {
        pollCount++;
        try {
          const data = await this.fetchResultsPage(1);
          const audio = data.TotalAudioResults || 0;
          const chat = data.TotalChatResults || 0;
          const email = data.TotalEmailResults || 0;
          const text = data.TotalTextResults || 0;
          const total = audio + chat + email + text;
          const rows = data.SearchResultRows ? data.SearchResultRows.length : 0;

          LOG('Poll #' + pollCount + ': pages=' + data.PageCount + ' rows=' + rows + ' total=' + total + ' (audio=' + audio + ' chat=' + chat + ' email=' + email + ' text=' + text + ') checked=' + data.CheckedResults);

          if (data && data.PageCount > 0 && data.SearchResultRows && data.SearchResultRows.length > 0) {
            status('Harvesting ' + total + ' results across ' + data.PageCount + ' pages...');
            LOG('=== RESULTS FOUND, HARVESTING ===');
            return await this.fetchAllPages(data, total);
          }
        } catch (e) {
          WARN('Poll #' + pollCount + ' error:', e.message);
        }
        const elapsed = Math.round((Date.now() - start) / 1000);
        status('Searching... (' + elapsed + 's)');
        await new Promise(r => setTimeout(r, interval));
      }
      ERR('Search timed out after ' + pollCount + ' polls / ' + (maxWait / 1000) + 's');
      throw new Error('Search timed out after ' + (maxWait / 1000) + 's');
    }

    async fetchResultsPage(page) {
      const url = this.baseUrl + 'ClientServices/SearchResultsService.svc/GetSearchResults/'
        + '?appInstanceID=' + this.appInstanceId
        + '&page=' + page
        + '&mediaTypes=15'
        + '&sortColumn=none'
        + '&sortOrder=default'
        + '&_=' + Date.now();
      const resp = await fetch(url, {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/json'
        }
      });
      const json = await resp.json();
      if (page === 1) {
        LOG('Results URL:', url);
        LOG('Results status:', resp.status);
      }
      return json;
    }

    async fetchAllPages(firstPage, total) {
      const rows = [...firstPage.SearchResultRows];
      const pages = firstPage.PageCount;
      for (let p = 2; p <= pages; p++) {
        LOG('Fetching page ' + p + '/' + pages);
        const data = await this.fetchResultsPage(p);
        if (data.SearchResultRows) rows.push(...data.SearchResultRows);
      }
      LOG('=== HARVEST COMPLETE: ' + rows.length + ' rows from ' + pages + ' pages ===');
      return { total: total || rows.length, pages, rows };
    }

    buildUrl(page, overrideId) {
      const id = overrideId || this.appInstanceId;
      return this.baseUrl + page + '?AppInstanceID=' + id + '&CurrentUICulture=en';
    }

    parseFormFields(html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const fields = {};
      doc.querySelectorAll('input').forEach(el => {
        if (!el.name) return;
        if (el.type === 'checkbox' && !el.checked) return;
        if (el.type === 'radio' && !el.checked) return;
        fields[el.name] = el.value || '';
      });
      doc.querySelectorAll('select').forEach(el => {
        if (!el.name) return;
        const opt = el.querySelector('option[selected]');
        fields[el.name] = opt ? opt.value : '';
      });
      return fields;
    }

    encode(fields) {
      return Object.entries(fields)
        .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
        .join('&');
    }
  }

  api.forensicSearch = new ForensicSearchService();
})();
