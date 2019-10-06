/*
 * Copyright (C) 2016-2017  Alex Yatskov <alex@foosoft.net>
 * Author: Alex Yatskov <alex@foosoft.net>
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
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


class Deinflector {
    constructor(reasons) {
        this.reasons = Deinflector.normalizeReasons(reasons);
    }

    deinflect(source) {
        const results = [{
            source,
            term: source,
            rules: 0,
            definitions: [],
            reasons: []
        }];
        for (let i = 0; i < results.length; ++i) {
            const {rules, term, reasons} = results[i];
            for (const [reason, variants] of this.reasons) {
                for (const [kanaIn, kanaOut, rulesIn, rulesOut] of variants) {
                    if (
                        (rules !== 0 && (rules & rulesIn) === 0) ||
                        !term.endsWith(kanaIn) ||
                        (term.length - kanaIn.length + kanaOut.length) <= 0
                    ) {
                        continue;
                    }

                    results.push({
                        source,
                        term: term.slice(0, -kanaIn.length) + kanaOut,
                        rules: rulesOut,
                        definitions: [],
                        reasons: [reason, ...reasons]
                    });
                }
            }
        }
        return results;
    }

    static normalizeReasons(reasons) {
        const normalizedReasons = [];
        for (const reason in reasons) {
            const variants = [];
            for (const {kanaIn, kanaOut, rulesIn, rulesOut} of reasons[reason]) {
                variants.push([
                    kanaIn,
                    kanaOut,
                    Deinflector.rulesToRuleFlags(rulesIn),
                    Deinflector.rulesToRuleFlags(rulesOut)
                ]);
            }
            normalizedReasons.push([reason, variants]);
        }
        return normalizedReasons;
    }

    static rulesToRuleFlags(rules) {
        const ruleTypes = Deinflector.ruleTypes;
        let value = 0;
        for (const rule of rules) {
            value |= ruleTypes[rule];
        }
        return value;
    }
}

Deinflector.ruleTypes = {
    'v1':    0b0000001, // Verb ichidan
    'v5':    0b0000010, // Verb godan
    'vs':    0b0000100, // Verb suru
    'vk':    0b0001000, // Verb kuru
    'adj-i': 0b0010000, // Adjective i
    'iru':   0b0100000, // Intermediate -iru endings for progressive or perfect tense
};
