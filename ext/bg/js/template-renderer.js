/*
 * Copyright (C) 2016-2020  Yomichan Authors
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
 * Handlebars
 * jp
 */

class TemplateRenderer {
    constructor() {
        this._cache = new Map();
        this._cacheMaxSize = 5;
        this._helpersRegistered = false;
    }

    async render(template, data) {
        if (!this._helpersRegistered) {
            this._registerHelpers();
            this._helpersRegistered = true;
        }

        const cache = this._cache;
        let instance = cache.get(template);
        if (typeof instance === 'undefined') {
            this._updateCacheSize(this._cacheMaxSize - 1);
            instance = Handlebars.compile(template);
            cache.set(template, instance);
        }

        return instance(data).trim();
    }

    // Private

    _updateCacheSize(maxSize) {
        const cache = this._cache;
        let removeCount = cache.size - maxSize;
        if (removeCount <= 0) { return; }

        for (const key of cache.keys()) {
            cache.delete(key);
            if (--removeCount <= 0) { break; }
        }
    }

    _registerHelpers() {
        Handlebars.partials = Handlebars.templates;

        const helpers = [
            ['dumpObject',       this._dumpObject.bind(this)],
            ['furigana',         this._furigana.bind(this)],
            ['furiganaPlain',    this._furiganaPlain.bind(this)],
            ['kanjiLinks',       this._kanjiLinks.bind(this)],
            ['multiLine',        this._multiLine.bind(this)],
            ['sanitizeCssClass', this._sanitizeCssClass.bind(this)],
            ['regexReplace',     this._regexReplace.bind(this)],
            ['regexMatch',       this._regexMatch.bind(this)],
            ['mergeTags',        this._mergeTags.bind(this)]
        ];

        for (const [name, helper] of helpers) {
            this._registerHelper(name, helper);
        }
    }

    _registerHelper(name, helper) {
        function wrapper(...args) {
            return helper(this, ...args);
        }
        Handlebars.registerHelper(name, wrapper);
    }

    _escape(text) {
        return Handlebars.Utils.escapeExpression(text);
    }

    _dumpObject(context, options) {
        const dump = JSON.stringify(options.fn(context), null, 4);
        return this._escape(dump);
    }

    _furigana(context, options) {
        const definition = options.fn(context);
        const segs = jp.distributeFurigana(definition.expression, definition.reading);

        let result = '';
        for (const seg of segs) {
            if (seg.furigana) {
                result += `<ruby>${seg.text}<rt>${seg.furigana}</rt></ruby>`;
            } else {
                result += seg.text;
            }
        }

        return result;
    }

    _furiganaPlain(context, options) {
        const definition = options.fn(context);
        const segs = jp.distributeFurigana(definition.expression, definition.reading);

        let result = '';
        for (const seg of segs) {
            if (seg.furigana) {
                result += ` ${seg.text}[${seg.furigana}]`;
            } else {
                result += seg.text;
            }
        }

        return result.trimLeft();
    }

    _kanjiLinks(context, options) {
        let result = '';
        for (const c of options.fn(context)) {
            if (jp.isCodePointKanji(c.codePointAt(0))) {
                result += `<a href="#" class="kanji-link">${c}</a>`;
            } else {
                result += c;
            }
        }

        return result;
    }

    _multiLine(context, options) {
        return options.fn(context).split('\n').join('<br>');
    }

    _sanitizeCssClass(context, options) {
        return options.fn(context).replace(/[^_a-z0-9\u00a0-\uffff]/ig, '_');
    }

    _regexReplace(context, ...args) {
        // Usage:
        // {{#regexReplace regex string [flags]}}content{{/regexReplace}}
        // regex: regular expression string
        // string: string to replace
        // flags: optional flags for regular expression
        //   e.g. "i" for case-insensitive, "g" for replace all
        let value = args[args.length - 1].fn(context);
        if (args.length >= 3) {
            try {
                const flags = args.length > 3 ? args[2] : 'g';
                const regex = new RegExp(args[0], flags);
                value = value.replace(regex, args[1]);
            } catch (e) {
                return `${e}`;
            }
        }
        return value;
    }

    _regexMatch(context, ...args) {
        // Usage:
        // {{#regexMatch regex [flags]}}content{{/regexMatch}}
        // regex: regular expression string
        // flags: optional flags for regular expression
        //   e.g. "i" for case-insensitive, "g" for match all
        let value = args[args.length - 1].fn(context);
        if (args.length >= 2) {
            try {
                const flags = args.length > 2 ? args[1] : '';
                const regex = new RegExp(args[0], flags);
                const parts = [];
                value.replace(regex, (g0) => parts.push(g0));
                value = parts.join('');
            } catch (e) {
                return `${e}`;
            }
        }
        return value;
    }

    _mergeTags(context, object, isGroupMode, isMergeMode) {
        const tagSources = [];
        if (isGroupMode || isMergeMode) {
            for (const definition of object.definitions) {
                tagSources.push(definition.definitionTags);
            }
        } else {
            tagSources.push(object.definitionTags);
        }

        const tags = new Set();
        for (const tagSource of tagSources) {
            for (const tag of tagSource) {
                tags.add(tag.name);
            }
        }

        return [...tags].join(', ');
    }
}
