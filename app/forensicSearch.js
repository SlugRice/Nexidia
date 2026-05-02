(() => {
    const api = window.NEXIDIA_TOOLS;
    if (!api) return;

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
            if (!match) return null;
            const m = match.name.match(/AppInstanceID=([^-&]+)/);
            return m ? m[1] : null;
        }

        isAvailable() {
            return !!this.getSessionId();
        }

        mintAppInstanceId() {
            const sid = this.getSessionId();
            if (!sid) return null;
            return sid + '-' + crypto.randomUUID();
        }

        async initialize(options = {}) {
            const tempId = this.mintAppInstanceId();
            if (!tempId) throw new Error('No Nexidia session');

            const frameHtml = await fetch(this.buildUrl('ForensicSearch.aspx', tempId)).then(r => r.text());
            const m = frameHtml.match(/"appInstanceId":"([^"]+)"/);
            if (!m) throw new Error('Could not extract server AppInstanceId');
            this.appInstanceId = m[1];

            const paramHtml = await fetch(this.buildUrl('ParameterSelector.aspx')).then(r => r.text());
            this.paramFields = this.parseFormFields(paramHtml);

            const searchHtml = await fetch(this.buildUrl('SearchBuilder.aspx')).then(r => r.text());
            this.searchFields = this.parseFormFields(searchHtml);

            if (options.startDate) this.paramFields['StartDate$NXDateBox_StartDate'] = options.startDate;
            if (options.endDate) this.paramFields['EndDate$NXDateBox_EndDate'] = options.endDate;
            if (options.sessionKeys) this.paramFields['NXHiddenSelected_IngestSessionKey'] = options.sessionKeys;

            this.ready = true;
            return this.appInstanceId;
        }

        async search(phrase, options = {}) {
            if (!this.ready) throw new Error('Not initialized');
            const status = options.onStatus || (() => {});

            status('Submitting filters...');
            const paramResp = await fetch(this.buildUrl('ParameterSelector.aspx'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: this.encode(this.paramFields)
            });
            this.paramFields = this.parseFormFields(await paramResp.text());

            status('Submitting phrase search...');
            const fields = { ...this.searchFields };
            fields['SearchExpressionBuilder$SearchTermTextBox_0'] = phrase;
            fields['SearchExpressionBuilder$ThresholdTextBox_0'] = options.threshold || '70';
            fields['SearchButton'] = 'Search';
            fields['uiDropDownListFindFiles'] = options.operator || 'do|any';
            fields['DropDownListSpeakerRole'] = options.speaker || 'Either';
            fields['DropDownListTimeBasis'] = options.timeBasis || 'Anywhere';
            fields['DropDownListCustomThreshold'] = options.thresholdMode || 'Automatic';
            this.setMediaTypes(fields, options);

            const searchResp = await fetch(this.buildUrl('SearchBuilder.aspx'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: this.encode(fields)
            });
            this.searchFields = this.parseFormFields(await searchResp.text());

            status('Waiting for results...');
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
        }

        async harvestResults(options, status) {
            const maxWait = options.maxWait || 600000;
            const interval = options.pollInterval || 5000;
            const start = Date.now();

            while (Date.now() - start < maxWait) {
                try {
                    const data = await this.fetchResultsPage(1);
                    if (data && data.PageCount > 0 && data.SearchResultRows && data.SearchResultRows.length > 0) {
                        const total = data.TotalAudioResults + data.TotalChatResults + data.TotalEmailResults + data.TotalTextResults;
                        status('Harvesting ' + total + ' results across ' + data.PageCount + ' pages...');
                        return await this.fetchAllPages(data, total);
                    }
                } catch (e) {}
                const elapsed = Math.round((Date.now() - start) / 1000);
                status('Searching... (' + elapsed + 's)');
                await new Promise(r => setTimeout(r, interval));
            }
            throw new Error('Search timed out after ' + (maxWait / 1000) + 's');
        }

        async fetchResultsPage(page) {
            const url = this.baseUrl + 'ClientServices/SearchResultsService.svc/GetSearchResults'
                + '?appInstanceID=' + this.appInstanceId
                + '&page=' + page
                + '&mediaTypes=15'
                + '&sortColumn=none'
                + '&sortOrder=default';
            const resp = await fetch(url);
            return await resp.json();
        }

        async fetchAllPages(firstPage, total) {
            const rows = [...firstPage.SearchResultRows];
            const pages = firstPage.PageCount;

            for (let p = 2; p <= pages; p++) {
                const data = await this.fetchResultsPage(p);
                if (data.SearchResultRows) rows.push(...data.SearchResultRows);
            }

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
