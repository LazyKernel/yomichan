/*
 * Copyright (C) 2019-2020  Yomichan Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/* global
 * QueryParserGenerator
 * TextScanner
 * api
 * docSentenceExtract
 */

class QueryParser extends EventDispatcher {
    constructor({getOptionsContext, setSpinnerVisible}) {
        super();
        this._options = null;
        this._getOptionsContext = getOptionsContext;
        this._setSpinnerVisible = setSpinnerVisible;
        this._parseResults = [];
        this._queryParser = document.querySelector('#query-parser-content');
        this._queryParserSelect = document.querySelector('#query-parser-select-container');
        this._queryParserGenerator = new QueryParserGenerator();
        this._textScanner = new TextScanner({
            node: this._queryParser,
            ignoreElements: () => [],
            ignorePoint: null,
            search: this._search.bind(this)
        });
    }

    async prepare() {
        await this._queryParserGenerator.prepare();
        this._textScanner.prepare();
        this._queryParser.addEventListener('click', this._onClick.bind(this));
    }

    setOptions(options) {
        this._options = options;
        this._textScanner.setOptions(options);
        this._textScanner.setEnabled(true);
        this._queryParser.dataset.termSpacing = `${options.parsing.termSpacing}`;
    }

    async setText(text) {
        this._setSpinnerVisible(true);

        this._setPreview(text);

        this._parseResults = await api.textParse(text, this._getOptionsContext());
        this._refreshSelectedParser();

        this._renderParserSelect();
        this._renderParseResult();

        this._setSpinnerVisible(false);
    }

    // Private

    _onClick(e) {
        this._textScanner.searchAt(e.clientX, e.clientY, 'click');
    }

    async _search(textSource, cause) {
        if (textSource === null) { return null; }

        const {length: scanLength, layoutAwareScan} = this._options.scanning;
        const searchText = this._textScanner.getTextSourceContent(textSource, scanLength, layoutAwareScan);
        if (searchText.length === 0) { return null; }

        const optionsContext = this._getOptionsContext();
        const {definitions, length} = await api.termsFind(searchText, {}, optionsContext);
        if (definitions.length === 0) { return null; }

        const sentenceExtent = this._options.anki.sentenceExt;
        const sentence = docSentenceExtract(textSource, sentenceExtent, layoutAwareScan);

        textSource.setEndOffset(length, layoutAwareScan);

        this.trigger('searched', {
            type: 'terms',
            definitions,
            sentence,
            cause,
            textSource,
            optionsContext
        });

        return {definitions, type: 'terms'};
    }

    _onParserChange(e) {
        const value = e.target.value;
        api.modifySettings([{
            action: 'set',
            path: 'parsing.selectedParser',
            value,
            scope: 'profile',
            optionsContext: this._getOptionsContext()
        }], 'search');
    }

    _refreshSelectedParser() {
        if (this._parseResults.length > 0) {
            if (!this._getParseResult()) {
                const value = this._parseResults[0].id;
                api.modifySettings([{
                    action: 'set',
                    path: 'parsing.selectedParser',
                    value,
                    scope: 'profile',
                    optionsContext: this._getOptionsContext()
                }], 'search');
            }
        }
    }

    _getParseResult() {
        const {selectedParser} = this._options.parsing;
        return this._parseResults.find((r) => r.id === selectedParser);
    }

    _setPreview(text) {
        const previewTerms = [];
        for (let i = 0, ii = text.length; i < ii; i += 2) {
            const tempText = text.substring(i, i + 2);
            previewTerms.push([{text: tempText, reading: ''}]);
        }
        this._queryParser.textContent = '';
        this._queryParser.appendChild(this._queryParserGenerator.createParseResult(previewTerms, true));
    }

    _renderParserSelect() {
        this._queryParserSelect.textContent = '';
        if (this._parseResults.length > 1) {
            const {selectedParser} = this._options.parsing;
            const select = this._queryParserGenerator.createParserSelect(this._parseResults, selectedParser);
            select.addEventListener('change', this._onParserChange.bind(this));
            this._queryParserSelect.appendChild(select);
        }
    }

    _renderParseResult() {
        const parseResult = this._getParseResult();
        this._queryParser.textContent = '';
        if (!parseResult) { return; }
        this._queryParser.appendChild(this._queryParserGenerator.createParseResult(parseResult.content));
    }
}
