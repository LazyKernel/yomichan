/*
 * Copyright (C) 2020  Yomichan Authors
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


class Environment {
    constructor() {
        this._cachedEnvironmentInfo = null;
    }

    async prepare() {
        this._cachedEnvironmentInfo = await this._loadEnvironmentInfo();
    }

    getInfo() {
        if (this._cachedEnvironmentInfo === null) { throw new Error('Not prepared'); }
        return this._cachedEnvironmentInfo;
    }

    async _loadEnvironmentInfo() {
        const browser = await this._getBrowser();
        const os = await this._getOperatingSystem();
        const modifierInfo = this._getModifierInfo(browser, os);
        return {
            browser,
            platform: {os},
            modifiers: modifierInfo
        };
    }

    async _getOperatingSystem() {
        try {
            const {os} = await this._getPlatformInfo();
            if (typeof os === 'string') {
                return os;
            }
        } catch (e) {
            // NOP
        }
        return 'unknown';
    }

    _getPlatformInfo() {
        return new Promise((resolve, reject) => {
            chrome.runtime.getPlatformInfo((result) => {
                const error = chrome.runtime.lastError;
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        });
    }

    async _getBrowser() {
        try {
            if (chrome.runtime.getURL('/').startsWith('ms-browser-extension://')) {
                return 'edge-legacy';
            }
            if (/\bEdge?\//.test(navigator.userAgent)) {
                return 'edge';
            }
        } catch (e) {
            // NOP
        }
        if (typeof browser !== 'undefined') {
            try {
                const info = await browser.runtime.getBrowserInfo();
                if (info.name === 'Fennec') {
                    return 'firefox-mobile';
                }
            } catch (e) {
                // NOP
            }
            return 'firefox';
        } else {
            return 'chrome';
        }
    }

    _getModifierInfo(browser, os) {
        let osKeys;
        let separator;
        switch (os) {
            case 'win':
                separator = ' + ';
                osKeys = [
                    ['alt', 'Alt'],
                    ['ctrl', 'Ctrl'],
                    ['shift', 'Shift'],
                    ['meta', 'Windows']
                ];
                break;
            case 'mac':
                separator = '';
                osKeys = [
                    ['alt', '⌥'],
                    ['ctrl', '⌃'],
                    ['shift', '⇧'],
                    ['meta', '⌘']
                ];
                break;
            case 'linux':
            case 'openbsd':
            case 'cros':
            case 'android':
                separator = ' + ';
                osKeys = [
                    ['alt', 'Alt'],
                    ['ctrl', 'Ctrl'],
                    ['shift', 'Shift'],
                    ['meta', 'Super']
                ];
                break;
            default: // 'unknown', etc
                separator = ' + ';
                osKeys = [
                    ['alt', 'Alt'],
                    ['ctrl', 'Ctrl'],
                    ['shift', 'Shift'],
                    ['meta', 'Meta']
                ];
                break;
        }

        const isFirefox = (browser === 'firefox' || browser === 'firefox-mobile');
        const keys = [];

        for (const [value, name] of osKeys) {
            // Firefox doesn't support event.metaKey on platforms other than macOS
            if (value === 'meta' && isFirefox && os !== 'mac') { continue; }
            keys.push({value, name});
        }

        return {keys, separator};
    }
}
