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
 * api
 */

class AnkiController {
    constructor(settingsController) {
        this._settingsController = settingsController;
    }

    async prepare() {
        for (const element of document.querySelectorAll('#anki-fields-container input,#anki-fields-container select')) {
            element.addEventListener('change', this._onFieldsChanged.bind(this), false);
        }

        for (const element of document.querySelectorAll('#anki-terms-model,#anki-kanji-model')) {
            element.addEventListener('change', this._onModelChanged.bind(this), false);
        }

        this._settingsController.on('optionsChanged', this._onOptionsChanged.bind(this));

        const options = await this._settingsController.getOptions();
        this._onOptionsChanged({options});
    }

    getFieldMarkers(type) {
        switch (type) {
            case 'terms':
                return [
                    'audio',
                    'cloze-body',
                    'cloze-prefix',
                    'cloze-suffix',
                    'dictionary',
                    'document-title',
                    'expression',
                    'furigana',
                    'furigana-plain',
                    'glossary',
                    'glossary-brief',
                    'pitch-accents',
                    'pitch-accent-graphs',
                    'pitch-accent-positions',
                    'reading',
                    'screenshot',
                    'sentence',
                    'tags',
                    'url'
                ];
            case 'kanji':
                return [
                    'character',
                    'cloze-body',
                    'cloze-prefix',
                    'cloze-suffix',
                    'dictionary',
                    'document-title',
                    'glossary',
                    'kunyomi',
                    'onyomi',
                    'screenshot',
                    'sentence',
                    'tags',
                    'url'
                ];
            default:
                return [];
        }
    }

    getFieldMarkersHtml(markers) {
        const template = document.querySelector('#anki-field-marker-template').content;
        const fragment = document.createDocumentFragment();
        for (const marker of markers) {
            const markerNode = document.importNode(template, true).firstChild;
            markerNode.querySelector('.marker-link').textContent = marker;
            fragment.appendChild(markerNode);
        }
        return fragment;
    }

    // Private

    async _onOptionsChanged({options}) {
        if (!options.anki.enable) {
            return;
        }

        await this._deckAndModelPopulate(options);
        await Promise.all([
            this._populateFields('terms', options.anki.terms.fields),
            this._populateFields('kanji', options.anki.kanji.fields)
        ]);
    }

    _fieldsToDict(elements) {
        const result = {};
        for (const element of elements) {
            result[element.dataset.field] = element.value;
        }
        return result;
    }

    _spinnerShow(show) {
        const spinner = document.querySelector('#anki-spinner');
        spinner.hidden = !show;
    }

    _setError(error) {
        const node = document.querySelector('#anki-error');
        const node2 = document.querySelector('#anki-invalid-response-error');
        if (error) {
            const errorString = `${error}`;
            if (node !== null) {
                node.hidden = false;
                node.textContent = errorString;
                this._setErrorData(node, error);
            }

            if (node2 !== null) {
                node2.hidden = (errorString.indexOf('Invalid response') < 0);
            }
        } else {
            if (node !== null) {
                node.hidden = true;
                node.textContent = '';
            }

            if (node2 !== null) {
                node2.hidden = true;
            }
        }
    }

    _setErrorData(node, error) {
        const data = error.data;
        let message = '';
        if (typeof data !== 'undefined') {
            message += `${JSON.stringify(data, null, 4)}\n\n`;
        }
        message += `${error.stack}`.trimRight();

        const button = document.createElement('a');
        button.className = 'error-data-show-button';

        const content = document.createElement('div');
        content.className = 'error-data-container';
        content.textContent = message;
        content.hidden = true;

        button.addEventListener('click', () => content.hidden = !content.hidden, false);

        node.appendChild(button);
        node.appendChild(content);
    }

    _setDropdownOptions(dropdown, optionValues) {
        const fragment = document.createDocumentFragment();
        for (const optionValue of optionValues) {
            const option = document.createElement('option');
            option.value = optionValue;
            option.textContent = optionValue;
            fragment.appendChild(option);
        }
        dropdown.textContent = '';
        dropdown.appendChild(fragment);
    }

    async _deckAndModelPopulate(options) {
        const termsDeck = {value: options.anki.terms.deck, selector: '#anki-terms-deck'};
        const kanjiDeck = {value: options.anki.kanji.deck, selector: '#anki-kanji-deck'};
        const termsModel = {value: options.anki.terms.model, selector: '#anki-terms-model'};
        const kanjiModel = {value: options.anki.kanji.model, selector: '#anki-kanji-model'};
        try {
            this._spinnerShow(true);
            const [deckNames, modelNames] = await Promise.all([api.getAnkiDeckNames(), api.getAnkiModelNames()]);
            deckNames.sort();
            modelNames.sort();
            termsDeck.values = deckNames;
            kanjiDeck.values = deckNames;
            termsModel.values = modelNames;
            kanjiModel.values = modelNames;
            this._setError(null);
        } catch (error) {
            this._setError(error);
        } finally {
            this._spinnerShow(false);
        }

        for (const {value, values, selector} of [termsDeck, kanjiDeck, termsModel, kanjiModel]) {
            const node = document.querySelector(selector);
            this._setDropdownOptions(node, Array.isArray(values) ? values : [value]);
            node.value = value;
        }
    }

    _createFieldTemplate(name, value, markers) {
        const template = document.querySelector('#anki-field-template').content;
        const content = document.importNode(template, true).firstChild;

        content.querySelector('.anki-field-name').textContent = name;

        const field = content.querySelector('.anki-field-value');
        field.dataset.field = name;
        field.value = value;

        content.querySelector('.anki-field-marker-list').appendChild(this.getFieldMarkersHtml(markers));

        return content;
    }

    async _populateFields(tabId, fields) {
        const tab = document.querySelector(`.tab-pane[data-anki-card-type=${tabId}]`);
        const container = tab.querySelector('tbody');
        const markers = this.getFieldMarkers(tabId);

        const fragment = document.createDocumentFragment();
        for (const [name, value] of Object.entries(fields)) {
            const html = this._createFieldTemplate(name, value, markers);
            fragment.appendChild(html);
        }

        container.textContent = '';
        container.appendChild(fragment);

        for (const node of container.querySelectorAll('.anki-field-value')) {
            node.addEventListener('change', this._onFieldsChanged.bind(this), false);
        }
        for (const node of container.querySelectorAll('.marker-link')) {
            node.addEventListener('click', this._onMarkerClicked.bind(this), false);
        }
    }

    _onMarkerClicked(e) {
        e.preventDefault();
        const link = e.currentTarget;
        const input = link.closest('.input-group').querySelector('.anki-field-value');
        input.value = `{${link.textContent}}`;
        input.dispatchEvent(new Event('change'));
    }

    async _onModelChanged(e) {
        const node = e.currentTarget;
        let fieldNames;
        try {
            const modelName = node.value;
            fieldNames = await api.getAnkiModelFieldNames(modelName);
            this._setError(null);
        } catch (error) {
            this._setError(error);
            return;
        } finally {
            this._spinnerShow(false);
        }

        const tabId = node.dataset.ankiCardType;
        if (tabId !== 'terms' && tabId !== 'kanji') { return; }

        const fields = {};
        for (const name of fieldNames) {
            fields[name] = '';
        }

        await this._settingsController.setProfileSetting(`anki["${tabId}"].fields`, fields);
        await this._populateFields(tabId, fields);
    }

    async _onFieldsChanged() {
        const termsDeck = document.querySelector('#anki-terms-deck').value;
        const termsModel = document.querySelector('#anki-terms-model').value;
        const termsFields = this._fieldsToDict(document.querySelectorAll('#terms .anki-field-value'));
        const kanjiDeck = document.querySelector('#anki-kanji-deck').value;
        const kanjiModel = document.querySelector('#anki-kanji-model').value;
        const kanjiFields = this._fieldsToDict(document.querySelectorAll('#kanji .anki-field-value'));

        const targets = [
            {action: 'set', path: 'anki.terms.deck',   value: termsDeck},
            {action: 'set', path: 'anki.terms.model',  value: termsModel},
            {action: 'set', path: 'anki.terms.fields', value: termsFields},
            {action: 'set', path: 'anki.kanji.deck',   value: kanjiDeck},
            {action: 'set', path: 'anki.kanji.model',  value: kanjiModel},
            {action: 'set', path: 'anki.kanji.fields', value: kanjiFields}
        ];

        await this._settingsController.modifyProfileSettings(targets);
    }
}
