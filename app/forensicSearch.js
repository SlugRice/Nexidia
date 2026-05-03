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
      this.controllerFields = null;
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
      LOG('ParameterSelector: status=' + paramResp.status + ' fields=' + Object.keys(this.paramFields).length);

      const searchUrl = this.buildUrl('SearchBuilder.aspx');
      LOG('Fetching SearchBuilder:', searchUrl);
      const searchResp = await fetch(searchUrl);
      const searchHtml = await searchResp.text();
      this.searchFields = this.parseFormFields(searchHtml);
      LOG('SearchBuilder: status=' + searchResp.status + ' fields=' + Object.keys(this.searchFields).length);

      const controllerUrl = this.buildUrl('SearchController.aspx');
      LOG('Fetching SearchController:', controllerUrl);
      const controllerResp = await fetch(controllerUrl);
      const controllerHtml = await controllerResp.text();
      this.controllerFields = this.parseFormFields(controllerHtml);
      LOG('SearchController: status=' + controllerResp.status + ' fields=' + Object.keys(this.controllerFields).length);

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
      const paramBody = this.encode(this.paramFields);
      LOG('Param POST body length:', paramBody.length);
      const paramResp = await fetch(this.buildUrl('ParameterSelector.aspx'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: paramBody
      });
      const paramRespText = await paramResp.text();
      LOG('Param POST response: status=' + paramResp.status + ' size=' + paramRespText.length);
      this.paramFields = this.parseFormFields(paramRespText);

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

      LOG('Search fields: phrase=' + phrase + ' threshold=' + fields['SearchExpressionBuilder$ThresholdTextBox_0'] + ' operator=' + fields['uiDropDownListFindFiles'] + ' fields=' + Object.keys(fields).length);
      const searchBody = this.encode(fields);
      LOG('Search POST body length:', searchBody.length);
      const searchResp = await fetch(this.buildUrl('SearchBuilder.aspx'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: searchBody
      });
      const searchRespText = await searchResp.text();
      LOG('Search POST response: status=' + searchResp.status + ' size=' + searchRespText.length);
      if (searchResp.status !== 200) {
        ERR('Search POST failed:', searchRespText.substring(0, 500));
        throw new Error('Search POST returned ' + searchResp.status);
      }
      this.searchFields = this.parseFormFields(searchRespText);

      status('Binding filters to search...');
      const paramFields2 = { ...this.paramFields };
      paramFields2['hdnGetSourceMedia'] = 'GetSourceMedia';
      const paramBody2 = this.encode(paramFields2);
      LOG('GetSourceMedia POST body length:', paramBody2.length);
      const paramResp2 = await fetch(this.buildUrl('ParameterSelector.aspx'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: paramBody2
      });
      const paramRespText2 = await paramResp2.text();
      LOG('GetSourceMedia POST response: status=' + paramResp2.status + ' size=' + paramRespText2.length);
      this.paramFields = this.parseFormFields(paramRespText2);

      status('Starting search engine...');
      const ctrlFields = { ...this.controllerFields };
      delete ctrlFields['endSearchButton'];
      delete ctrlFields['getMetadataButton'];
      delete ctrlFields['loadButton'];
      delete ctrlFields['saveButton'];
      const ctrlBody = this.encode(ctrlFields);
      LOG('Controller POST body length:', ctrlBody.length);
      const ctrlResp = await fetch(this.buildUrl('SearchController.aspx'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: ctrlBody
      });
      const ctrlRespText = await ctrlResp.text();
      LOG('Controller POST response: status=' + ctrlResp.status + ' size=' + ctrlRespText.length);
      if (ctrlResp.status !== 200) {
        ERR('Controller POST failed:', ctrlRespText.substring(0, 500));
        throw new Error('Controller POST returned ' + ctrlResp.status);
      }
      if (ctrlRespText.includes('SearchError')) {
        ERR('Server returned SearchError');
        throw new Error('Search engine returned an error');
      }
      this.controllerFields = this.parseFormFields(ctrlRespText);
      LOG('Controller response OK');

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
      if (page === 1) {
        LOG('Results URL:', url);
        LOG('Results status:', resp.status);
      }
      return await resp.json();
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
