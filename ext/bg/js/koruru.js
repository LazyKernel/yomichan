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

class Koruru {
    async addNote(definition, context, options) {
        const token = options.koruru.decktoken;
        const params = {
            word_jp: this._parseFurigana(definition.furiganaSegments),
            word_en: this._parseDefinitions(definition.definitions),
            sentence_jp: definition.cloze.sentence,
            sentence_en: "",
            pitches: JSON.stringify(definition.pitches)
        }

        console.log('definition:', definition)
        console.log('context:', context)
        console.log('options:', options)
        console.log('params:', params)

        const response = await fetch(
            'https://koruru.org:3001/api/collab/operations/' + token,
            {
                method: 'POST',
                mode: 'cors',
                cache: 'default',
                credentials: 'omit',
                redirect: 'follow',
                referrerPolicy: 'no-referrer',
                body: JSON.stringify(params)
            }
        );
        const result = await response.json();
        if (isObject(result)) {
            const error = result.error;
            if (typeof error !== 'undefined') {
                throw new Error(`AnkiConnect error: ${error}`);
            }
        }
        return result;
    }

    _parseFurigana(furiganaSegments) {
        return furiganaSegments.reduce((p, c) => p + c.text + (c.furigana ? "[" + c.furigana + "]" : ""), "")
    }

    _parseDefinitions(definitions) {
        return definitions.map(e => e.join(', ')).join(', ')
    }
}