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
 * utilBackgroundIsolate
 */

class SettingsDictionaryListUI extends EventDispatcher {
    constructor(container, template, extraContainer, extraTemplate) {
        super();
        this.container = container;
        this.template = template;
        this.extraContainer = extraContainer;
        this.extraTemplate = extraTemplate;
        this.optionsDictionaries = null;
        this.dictionaries = null;
        this.dictionaryEntries = [];
        this.extra = null;

        document.querySelector('#dict-delete-confirm').addEventListener('click', this.onDictionaryConfirmDelete.bind(this), false);
    }

    setOptionsDictionaries(optionsDictionaries) {
        this.optionsDictionaries = optionsDictionaries;
        if (this.dictionaries !== null) {
            this.setDictionaries(this.dictionaries);
        }
    }

    setDictionaries(dictionaries) {
        for (const dictionaryEntry of this.dictionaryEntries) {
            dictionaryEntry.cleanup();
        }

        this.dictionaryEntries = [];
        this.dictionaries = toIterable(dictionaries);

        if (this.optionsDictionaries === null) {
            return;
        }

        let changed = false;
        for (const dictionaryInfo of this.dictionaries) {
            if (this.createEntry(dictionaryInfo)) {
                changed = true;
            }
        }

        this.updateDictionaryOrder();

        const titles = this.dictionaryEntries.map((e) => e.dictionaryInfo.title);
        const removeKeys = Object.keys(this.optionsDictionaries).filter((key) => titles.indexOf(key) < 0);
        if (removeKeys.length > 0) {
            for (const key of toIterable(removeKeys)) {
                delete this.optionsDictionaries[key];
            }
            changed = true;
        }

        if (changed) {
            this.save();
        }
    }

    createEntry(dictionaryInfo) {
        const title = dictionaryInfo.title;
        let changed = false;
        let optionsDictionary;
        const optionsDictionaries = this.optionsDictionaries;
        if (hasOwn(optionsDictionaries, title)) {
            optionsDictionary = optionsDictionaries[title];
        } else {
            optionsDictionary = SettingsDictionaryListUI.createDictionaryOptions();
            optionsDictionaries[title] = optionsDictionary;
            changed = true;
        }

        const content = document.importNode(this.template.content, true).firstChild;

        this.dictionaryEntries.push(new SettingsDictionaryEntryUI(this, dictionaryInfo, content, optionsDictionary));

        return changed;
    }

    static createDictionaryOptions() {
        return utilBackgroundIsolate({
            priority: 0,
            enabled: false,
            allowSecondarySearches: false
        });
    }

    createExtra(totalCounts, remainders, totalRemainder) {
        const content = document.importNode(this.extraTemplate.content, true).firstChild;
        this.extraContainer.appendChild(content);
        return new SettingsDictionaryExtraUI(this, totalCounts, remainders, totalRemainder, content);
    }

    setCounts(dictionaryCounts, totalCounts) {
        const remainders = Object.assign({}, totalCounts);
        const keys = Object.keys(remainders);

        for (let i = 0, ii = Math.min(this.dictionaryEntries.length, dictionaryCounts.length); i < ii; ++i) {
            const counts = dictionaryCounts[i];
            this.dictionaryEntries[i].setCounts(counts);

            for (const key of keys) {
                remainders[key] -= counts[key];
            }
        }

        let totalRemainder = 0;
        for (const key of keys) {
            totalRemainder += remainders[key];
        }

        if (this.extra !== null) {
            this.extra.cleanup();
            this.extra = null;
        }

        if (totalRemainder > 0) {
            this.extra = this.createExtra(totalCounts, remainders, totalRemainder);
        }
    }

    updateDictionaryOrder() {
        const sortInfo = this.dictionaryEntries.map((e, i) => [e, i]);
        sortInfo.sort((a, b) => {
            const i = b[0].optionsDictionary.priority - a[0].optionsDictionary.priority;
            return (i !== 0 ? i : a[1] - b[1]);
        });

        for (const [e] of sortInfo) {
            this.container.appendChild(e.content);
        }
    }

    save() {
        // Overwrite
    }

    preventPageExit() {
        // Overwrite
        return {end: () => {}};
    }

    onDictionaryConfirmDelete(e) {
        e.preventDefault();
        const n = document.querySelector('#dict-delete-modal');
        const title = n.dataset.dict;
        delete n.dataset.dict;
        $(n).modal('hide');

        const index = this.dictionaryEntries.findIndex((entry) => entry.dictionaryInfo.title === title);
        if (index >= 0) {
            this.dictionaryEntries[index].deleteDictionary();
        }
    }
}

class SettingsDictionaryEntryUI {
    constructor(parent, dictionaryInfo, content, optionsDictionary) {
        this.parent = parent;
        this.dictionaryInfo = dictionaryInfo;
        this.optionsDictionary = optionsDictionary;
        this.counts = null;
        this.eventListeners = new EventListenerCollection();
        this.isDeleting = false;

        this.content = content;
        this.enabledCheckbox = this.content.querySelector('.dict-enabled');
        this.allowSecondarySearchesCheckbox = this.content.querySelector('.dict-allow-secondary-searches');
        this.priorityInput = this.content.querySelector('.dict-priority');
        this.deleteButton = this.content.querySelector('.dict-delete-button');
        this.detailsToggleLink = this.content.querySelector('.dict-details-toggle-link');
        this.detailsContainer = this.content.querySelector('.dict-details');
        this.detailsTable = this.content.querySelector('.dict-details-table');

        if (this.dictionaryInfo.version < 3) {
            this.content.querySelector('.dict-outdated').hidden = false;
        }

        this.setupDetails(dictionaryInfo);

        this.content.querySelector('.dict-title').textContent = this.dictionaryInfo.title;
        this.content.querySelector('.dict-revision').textContent = `rev.${this.dictionaryInfo.revision}`;
        this.content.querySelector('.dict-prefix-wildcard-searches-supported').checked = !!this.dictionaryInfo.prefixWildcardsSupported;

        this.applyValues();

        this.eventListeners.addEventListener(this.enabledCheckbox, 'change', this.onEnabledChanged.bind(this), false);
        this.eventListeners.addEventListener(this.allowSecondarySearchesCheckbox, 'change', this.onAllowSecondarySearchesChanged.bind(this), false);
        this.eventListeners.addEventListener(this.priorityInput, 'change', this.onPriorityChanged.bind(this), false);
        this.eventListeners.addEventListener(this.deleteButton, 'click', this.onDeleteButtonClicked.bind(this), false);
        this.eventListeners.addEventListener(this.detailsToggleLink, 'click', this.onDetailsToggleLinkClicked.bind(this), false);
    }

    setupDetails(dictionaryInfo) {
        const targets = [
            ['Author', 'author'],
            ['URL', 'url'],
            ['Description', 'description'],
            ['Attribution', 'attribution']
        ];

        let count = 0;
        for (const [label, key] of targets) {
            const info = dictionaryInfo[key];
            if (typeof info !== 'string') { continue; }

            const n1 = document.createElement('div');
            n1.className = 'dict-details-entry';
            n1.dataset.type = key;

            const n2 = document.createElement('span');
            n2.className = 'dict-details-entry-label';
            n2.textContent = `${label}:`;
            n1.appendChild(n2);

            const n3 = document.createElement('span');
            n3.className = 'dict-details-entry-info';
            n3.textContent = info;
            n1.appendChild(n3);

            this.detailsTable.appendChild(n1);

            ++count;
        }

        if (count === 0) {
            this.detailsContainer.hidden = true;
            this.detailsToggleLink.hidden = true;
        }
    }

    cleanup() {
        if (this.content !== null) {
            if (this.content.parentNode !== null) {
                this.content.parentNode.removeChild(this.content);
            }
            this.content = null;
        }
        this.dictionaryInfo = null;
        this.eventListeners.removeAllEventListeners();
    }

    setCounts(counts) {
        this.counts = counts;
        const node = this.content.querySelector('.dict-counts');
        node.textContent = JSON.stringify({
            info: this.dictionaryInfo,
            counts
        }, null, 4);
        node.removeAttribute('hidden');
    }

    save() {
        this.parent.save();
    }

    applyValues() {
        this.enabledCheckbox.checked = this.optionsDictionary.enabled;
        this.allowSecondarySearchesCheckbox.checked = this.optionsDictionary.allowSecondarySearches;
        this.priorityInput.value = `${this.optionsDictionary.priority}`;
    }

    async deleteDictionary() {
        if (this.isDeleting) {
            return;
        }

        const progress = this.content.querySelector('.progress');
        progress.hidden = false;
        const progressBar = this.content.querySelector('.progress-bar');
        this.isDeleting = true;

        const prevention = this.parent.preventPageExit();
        try {
            const onProgress = ({processed, count, storeCount, storesProcesed}) => {
                let percent = 0.0;
                if (count > 0 && storesProcesed > 0) {
                    percent = (processed / count) * (storesProcesed / storeCount) * 100.0;
                }
                progressBar.style.width = `${percent}%`;
            };

            await api.deleteDictionary(this.dictionaryInfo.title, onProgress);
        } catch (e) {
            this.dictionaryErrorsShow([e]);
        } finally {
            prevention.end();
            this.isDeleting = false;
            progress.hidden = true;

            this.parent.trigger('databaseUpdated');
        }
    }

    onEnabledChanged(e) {
        this.optionsDictionary.enabled = !!e.target.checked;
        this.save();
    }

    onAllowSecondarySearchesChanged(e) {
        this.optionsDictionary.allowSecondarySearches = !!e.target.checked;
        this.save();
    }

    onPriorityChanged(e) {
        let value = Number.parseFloat(e.target.value);
        if (Number.isNaN(value)) {
            value = this.optionsDictionary.priority;
        } else {
            this.optionsDictionary.priority = value;
            this.save();
        }

        e.target.value = `${value}`;

        this.parent.updateDictionaryOrder();
    }

    onDeleteButtonClicked(e) {
        e.preventDefault();

        if (this.isDeleting) {
            return;
        }

        const title = this.dictionaryInfo.title;
        const n = document.querySelector('#dict-delete-modal');
        n.dataset.dict = title;
        document.querySelector('#dict-remove-modal-dict-name').textContent = title;
        $(n).modal('show');
    }

    onDetailsToggleLinkClicked(e) {
        e.preventDefault();

        this.detailsContainer.hidden = !this.detailsContainer.hidden;
    }
}

class SettingsDictionaryExtraUI {
    constructor(parent, totalCounts, remainders, totalRemainder, content) {
        this.parent = parent;
        this.content = content;

        this.content.querySelector('.dict-total-count').textContent = `${totalRemainder} item${totalRemainder !== 1 ? 's' : ''}`;

        const node = this.content.querySelector('.dict-counts');
        node.textContent = JSON.stringify({
            counts: totalCounts,
            remainders: remainders
        }, null, 4);
        node.removeAttribute('hidden');
    }

    cleanup() {
        if (this.content !== null) {
            if (this.content.parentNode !== null) {
                this.content.parentNode.removeChild(this.content);
            }
            this.content = null;
        }
    }
}

class DictionaryController {
    constructor(settingsController, storageController) {
        this._settingsController = settingsController;
        this._storageController = storageController;
        this._dictionaryUI = null;
        this._dictionaryErrorToStringOverrides = [
            [
                'A mutation operation was attempted on a database that did not allow mutations.',
                'Access to IndexedDB appears to be restricted. Firefox seems to require that the history preference is set to "Remember history" before IndexedDB use of any kind is allowed.'
            ],
            [
                'The operation failed for reasons unrelated to the database itself and not covered by any other error code.',
                'Unable to access IndexedDB due to a possibly corrupt user profile. Try using the "Refresh Firefox" feature to reset your user profile.'
            ],
            [
                'BulkError',
                'Unable to finish importing dictionary data into IndexedDB. This may indicate that you do not have sufficient disk space available to complete this operation.'
            ]
        ];
    }

    async prepare() {
        this._dictionaryUI = new SettingsDictionaryListUI(
            document.querySelector('#dict-groups'),
            document.querySelector('#dict-template'),
            document.querySelector('#dict-groups-extra'),
            document.querySelector('#dict-extra-template')
        );
        this._dictionaryUI.save = () => this._settingsController.save();
        this._dictionaryUI.preventPageExit = this._preventPageExit.bind(this);
        this._dictionaryUI.on('databaseUpdated', this._onDatabaseUpdated.bind(this));

        document.querySelector('#dict-purge-button').addEventListener('click', this._onPurgeButtonClick.bind(this), false);
        document.querySelector('#dict-purge-confirm').addEventListener('click', this._onPurgeConfirmButtonClick.bind(this), false);
        document.querySelector('#dict-file-button').addEventListener('click', this._onImportButtonClick.bind(this), false);
        document.querySelector('#dict-file').addEventListener('change', this._onImportFileChange.bind(this), false);
        document.querySelector('#dict-main').addEventListener('change', this._onDictionaryMainChanged.bind(this), false);
        document.querySelector('#database-enable-prefix-wildcard-searches').addEventListener('change', this._onDatabaseEnablePrefixWildcardSearchesChanged.bind(this), false);

        this._settingsController.on('optionsChanged', this._onOptionsChanged.bind(this));

        await this._onOptionsChanged();
        await this._onDatabaseUpdated();
    }

    // Private

    async _onOptionsChanged() {
        const options = await this._settingsController.getOptionsMutable();

        this._dictionaryUI.setOptionsDictionaries(options.dictionaries);

        const optionsFull = await this._settingsController.getOptionsFull();
        document.querySelector('#database-enable-prefix-wildcard-searches').checked = optionsFull.global.database.prefixWildcardsSupported;

        await this._updateMainDictionarySelectValue();
    }

    _updateMainDictionarySelectOptions(dictionaries) {
        const select = document.querySelector('#dict-main');
        select.textContent = ''; // Empty

        let option = document.createElement('option');
        option.className = 'text-muted';
        option.value = '';
        option.textContent = 'Not selected';
        select.appendChild(option);

        for (const {title, sequenced} of toIterable(dictionaries)) {
            if (!sequenced) { continue; }

            option = document.createElement('option');
            option.value = title;
            option.textContent = title;
            select.appendChild(option);
        }
    }

    async _updateMainDictionarySelectValue() {
        const options = await this._settingsController.getOptions();

        const value = options.general.mainDictionary;

        const select = document.querySelector('#dict-main');
        let selectValue = null;
        for (const child of select.children) {
            if (child.nodeName.toUpperCase() === 'OPTION' && child.value === value) {
                selectValue = value;
                break;
            }
        }

        let missingNodeOption = select.querySelector('option[data-not-installed=true]');
        if (selectValue === null) {
            if (missingNodeOption === null) {
                missingNodeOption = document.createElement('option');
                missingNodeOption.className = 'text-muted';
                missingNodeOption.value = value;
                missingNodeOption.textContent = `${value} (Not installed)`;
                missingNodeOption.dataset.notInstalled = 'true';
                select.appendChild(missingNodeOption);
            }
        } else {
            if (missingNodeOption !== null) {
                missingNodeOption.parentNode.removeChild(missingNodeOption);
            }
        }

        select.value = value;
    }

    _dictionaryErrorToString(error) {
        if (error.toString) {
            error = error.toString();
        } else {
            error = `${error}`;
        }

        for (const [match, subst] of this._dictionaryErrorToStringOverrides) {
            if (error.includes(match)) {
                error = subst;
                break;
            }
        }

        return error;
    }

    _dictionaryErrorsShow(errors) {
        const dialog = document.querySelector('#dict-error');
        dialog.textContent = '';

        if (errors !== null && errors.length > 0) {
            const uniqueErrors = new Map();
            for (let e of errors) {
                yomichan.logError(e);
                e = this._dictionaryErrorToString(e);
                let count = uniqueErrors.get(e);
                if (typeof count === 'undefined') {
                    count = 0;
                }
                uniqueErrors.set(e, count + 1);
            }

            for (const [e, count] of uniqueErrors.entries()) {
                const div = document.createElement('p');
                if (count > 1) {
                    div.textContent = `${e} `;
                    const em = document.createElement('em');
                    em.textContent = `(${count})`;
                    div.appendChild(em);
                } else {
                    div.textContent = `${e}`;
                }
                dialog.appendChild(div);
            }

            dialog.hidden = false;
        } else {
            dialog.hidden = true;
        }
    }

    _dictionarySpinnerShow(show) {
        const spinner = $('#dict-spinner');
        if (show) {
            spinner.show();
        } else {
            spinner.hide();
        }
    }

    _dictReadFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsBinaryString(file);
        });
    }

    async _onDatabaseUpdated() {
        try {
            const dictionaries = await api.getDictionaryInfo();
            this._dictionaryUI.setDictionaries(dictionaries);

            document.querySelector('#dict-warning').hidden = (dictionaries.length > 0);

            this._updateMainDictionarySelectOptions(dictionaries);
            await this._updateMainDictionarySelectValue();

            const {counts, total} = await api.getDictionaryCounts(dictionaries.map((v) => v.title), true);
            this._dictionaryUI.setCounts(counts, total);
        } catch (e) {
            this._dictionaryErrorsShow([e]);
        }
    }

    async _onDictionaryMainChanged(e) {
        const select = e.target;
        const value = select.value;

        const missingNodeOption = select.querySelector('option[data-not-installed=true]');
        if (missingNodeOption !== null && missingNodeOption.value !== value) {
            missingNodeOption.parentNode.removeChild(missingNodeOption);
        }

        const options = await this._settingsController.getOptionsMutable();
        options.general.mainDictionary = value;
        await this._settingsController.save();
    }

    _onImportButtonClick() {
        const dictFile = document.querySelector('#dict-file');
        dictFile.click();
    }

    _onPurgeButtonClick(e) {
        e.preventDefault();
        $('#dict-purge-modal').modal('show');
    }

    async _onPurgeConfirmButtonClick(e) {
        e.preventDefault();

        $('#dict-purge-modal').modal('hide');

        const dictControls = $('#dict-importer, #dict-groups, #dict-groups-extra, #dict-main-group').hide();
        const dictProgress = document.querySelector('#dict-purge');
        dictProgress.hidden = false;

        const prevention = this._preventPageExit();

        try {
            this._dictionaryErrorsShow(null);
            this._dictionarySpinnerShow(true);

            await api.purgeDatabase();
            const optionsFull = await this._settingsController.getOptionsFullMutable();
            for (const {options} of toIterable(optionsFull.profiles)) {
                options.dictionaries = utilBackgroundIsolate({});
                options.general.mainDictionary = '';
            }
            await this._settingsController.save();

            this._onDatabaseUpdated();
        } catch (err) {
            this._dictionaryErrorsShow([err]);
        } finally {
            prevention.end();

            this._dictionarySpinnerShow(false);

            dictControls.show();
            dictProgress.hidden = true;

            this._storageController.updateStats();
        }
    }

    async _onImportFileChange(e) {
        const files = [...e.target.files];
        e.target.value = null;

        const dictFile = $('#dict-file');
        const dictControls = $('#dict-importer').hide();
        const dictProgress = $('#dict-import-progress').show();
        const dictImportInfo = document.querySelector('#dict-import-info');

        const prevention = this._preventPageExit();

        try {
            this._dictionaryErrorsShow(null);
            this._dictionarySpinnerShow(true);

            const setProgress = (percent) => dictProgress.find('.progress-bar').css('width', `${percent}%`);
            const updateProgress = (total, current) => {
                setProgress(current / total * 100.0);
                this._storageController.updateStats();
            };

            const optionsFull = await this._settingsController.getOptionsFull();

            const importDetails = {
                prefixWildcardsSupported: optionsFull.global.database.prefixWildcardsSupported
            };

            for (let i = 0, ii = files.length; i < ii; ++i) {
                setProgress(0.0);
                if (ii > 1) {
                    dictImportInfo.hidden = false;
                    dictImportInfo.textContent = `(${i + 1} of ${ii})`;
                }

                const archiveContent = await this._dictReadFile(files[i]);
                const {result, errors} = await api.importDictionaryArchive(archiveContent, importDetails, updateProgress);
                const optionsFull2 = await this._settingsController.getOptionsFullMutable();
                for (const {options} of toIterable(optionsFull2.profiles)) {
                    const dictionaryOptions = SettingsDictionaryListUI.createDictionaryOptions();
                    dictionaryOptions.enabled = true;
                    options.dictionaries[result.title] = dictionaryOptions;
                    if (result.sequenced && options.general.mainDictionary === '') {
                        options.general.mainDictionary = result.title;
                    }
                }

                await this._settingsController.save();

                if (errors.length > 0) {
                    const errors2 = errors.map((error) => jsonToError(error));
                    errors2.push(`Dictionary may not have been imported properly: ${errors2.length} error${errors2.length === 1 ? '' : 's'} reported.`);
                    this._dictionaryErrorsShow(errors2);
                }

                this._onDatabaseUpdated();
            }
        } catch (err) {
            this._dictionaryErrorsShow([err]);
        } finally {
            prevention.end();
            this._dictionarySpinnerShow(false);

            dictImportInfo.hidden = false;
            dictImportInfo.textContent = '';
            dictFile.val('');
            dictControls.show();
            dictProgress.hide();
        }
    }

    async _onDatabaseEnablePrefixWildcardSearchesChanged(e) {
        const optionsFull = await this._settingsController.getOptionsFullMutable();
        const v = !!e.target.checked;
        if (optionsFull.global.database.prefixWildcardsSupported === v) { return; }
        optionsFull.global.database.prefixWildcardsSupported = !!e.target.checked;
        await this._settingsController.save();
    }

    _preventPageExit() {
        return this._settingsController.preventPageExit();
    }
}
