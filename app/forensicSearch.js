(() => {
  const api = window.NEXIDIA_TOOLS;
  if (!api) return;

  const LOG = (msg, ...args) => console.log('[FS] ' + msg, ...args);
  const WARN = (msg, ...args) => console.warn('[FS] ' + msg, ...args);
  const ERR = (msg, ...args) => console.error('[FS] ' + msg, ...args);

  class ForensicSearchService {
    constructor() {
      this.frame = null;
      this.appInstanceId = null;
      this.ready = false;
    }

    getSessionId() {
      const entries = performance.getEntriesByType('resource');
      const match = entries.find(e => e.name.includes('AppInstanceID='));
      if (!match) return null;
      const m = match.name.match(/AppInstanceID=([^-&]+)/);
      return m ? m[1] : null;
    }

    isAvailable() {
      return !!this.getSessionId();
    }

    async initialize(options = {}) {
      LOG('=== INITIALIZE START ===');
      LOG('Options:', JSON.stringify(options));

      if (this.frame) {
        this.frame.remove();
        this.frame = null;
      }
      this.ready = false;

      const sid = this.getSessionId();
      if (!sid) throw new Error('No Nexidia session');
      const tempId = sid + '-' + crypto.randomUUID();
      LOG('Session:', sid);
      LOG('TempId:', tempId);

      this.frame = document.createElement('iframe');
      this.frame.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;';
      this.frame.src = '/NxIA/Search/ForensicSearch.aspx?AppInstanceID=' + tempId + '&CurrentUICulture=en';
      document.body.appendChild(this.frame);
      LOG('Hidden iframe created, loading ForensicSearch.aspx...');

      await new Promise(resolve => this.frame.addEventListener('load', resolve));
      LOG('ForensicSearch.aspx loaded');

      await this.waitForChildFrames();

      const win = this.getWin();
      try {
        this.appInstanceId = win.getAppInstanceId();
      } catch (e) {
        const m = win.document.documentElement.innerHTML.match(/"appInstanceId":"([^"]+)"/);
        this.appInstanceId = m ? m[1] : null;
      }
      LOG('AppInstanceId:', this.appInstanceId);
      if (!this.appInstanceId) throw new Error('Could not get AppInstanceId from frame');

      const psDoc = this.getParamDoc();
      if (options.startDate) {
        const el = psDoc.querySelector('[name="StartDate$NXDateBox_StartDate"]');
        if (el) { el.value = options.startDate; LOG('Set startDate:', options.startDate); }
        else WARN('StartDate field not found');
      }
      if (options.endDate) {
        const el = psDoc.querySelector('[name="EndDate$NXDateBox_EndDate"]');
        if (el) { el.value = options.endDate; LOG('Set endDate:', options.endDate); }
        else WARN('EndDate field not found');
      }
      if (options.filters) {
        for (const [name, value] of Object.entries(options.filters)) {
          const el = psDoc.querySelector('[name="' + name + '"]');
          if (el) { el.value = value; LOG('Set filter:', name, '=', value); }
          else WARN('Filter field not found:', name);
        }
      }

      this.ready = true;
      LOG('=== INITIALIZE COMPLETE ===');
      return this.appInstanceId;
    }

    getWin() {
      return this.frame.contentWindow;
    }

    getParamDoc() {
      return this.getWin().document.getElementById('iframeParameterSelector').contentWindow.document;
    }

    getSearchDoc() {
      return this.getWin().document.getElementById('iframeSearchBuilder').contentWindow.document;
    }

    async waitForChildFrames() {
      const maxWait = 30000;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        try {
          const win = this.getWin();
          const ps = win.document.getElementById('iframeParameterSelector');
          const sb = win.document.getElementById('iframeSearchBuilder');
          const sc = win.document.getElementById('iframeSearchController');

          const psReady = ps && ps.contentWindow && ps.contentWindow.document.readyState === 'complete'
            && ps.contentWindow.document.querySelector('[name="StartDate$NXDateBox_StartDate"]');
          const sbReady = sb && sb.contentWindow && sb.contentWindow.document.readyState === 'complete'
            && sb.contentWindow.document.getElementById('SearchButton');
          const scReady = !!win.SearchControllerLoaded;

          LOG('Waiting: PS=' + !!psReady + ' SB=' + !!sbReady + ' SC=' + scReady);

          if (psReady && sbReady && scReady) {
            LOG('All child frames loaded');
            return;
          }
        } catch (e) {
          LOG('Waiting: frames not accessible yet');
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      throw new Error('Child frames did not load in time');
    }

    async search(phrase, options = {}) {
      if (!this.ready) throw new Error('Not initialized');
      LOG('=== SEARCH START ===');
      LOG('Phrase:', phrase);

      const status = options.onStatus || (() => {});
      const win = this.getWin();
      const sbDoc = this.getSearchDoc();

      const phraseInput = sbDoc.querySelector('[name="SearchExpressionBuilder$SearchTermTextBox_0"]');
      if (!phraseInput) throw new Error('Phrase input not found');
      phraseInput.value = phrase;
      LOG('Phrase set');

      if (options.threshold) {
        const el = sbDoc.querySelector('[name="SearchExpressionBuilder$ThresholdTextBox_0"]');
        if (el) el.value = options.threshold;
      }
      if (options.speaker) {
        const el = sbDoc.querySelector('[name="DropDownListSpeakerRole"]');
        if (el) el.value = options.speaker;
      }
      if (options.operator) {
        const el = sbDoc.querySelector('[name="uiDropDownListFindFiles"]');
        if (el) el.value = options.operator;
      }

      status('Triggering search...');
      const searchBtn = sbDoc.getElementById('SearchButton');
      if (!searchBtn) throw new Error('Search button not found');
      searchBtn.click();
      LOG('Search button clicked');

      LOG('Waiting for search cascade to complete...');
      await new Promise(r => setTimeout(r, 10000));

      try {
        const notification = win.LastNotification;
        LOG('LastNotification:', notification);
      } catch (e) {}

      status('Waiting for results...');
      LOG('=== POLLING START ===');
      return await this.harvestResults(options, status);
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

          LOG('Poll #' + pollCount + ': pages=' + data.PageCount + ' rows=' + rows + ' total=' + total + ' checked=' + data.CheckedResults);

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
      const url = '/NxIA/Search/ClientServices/SearchResultsService.svc/GetSearchResults/'
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

    destroy() {
      if (this.frame) {
        this.frame.remove();
        this.frame = null;
      }
      this.ready = false;
      this.appInstanceId = null;
      LOG('Destroyed');
    }
  }

  api.forensicSearch = new ForensicSearchService();
})();
