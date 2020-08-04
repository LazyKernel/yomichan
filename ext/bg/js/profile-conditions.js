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
 * Environment
 */

let profileConditionsDescriptor = null;

const profileConditionsDescriptorPromise = (async () => {
    function profileConditionTestDomain(urlDomain, domain) {
        return (
            urlDomain.endsWith(domain) &&
            (
                domain.length === urlDomain.length ||
                urlDomain[urlDomain.length - domain.length - 1] === '.'
            )
        );
    }

    function profileConditionTestDomainList(url, domainList) {
        const urlDomain = new URL(url).hostname.toLowerCase();
        for (const domain of domainList) {
            if (profileConditionTestDomain(urlDomain, domain)) {
                return true;
            }
        }
        return false;
    }

    const environment = new Environment();
    await environment.prepare();

    const modifiers = environment.getInfo().modifiers;
    const modifierSeparator = modifiers.separator;
    const modifierKeyValues = modifiers.keys.map(
        ({value, name}) => ({optionValue: value, name})
    );

    const modifierValueToName = new Map(
        modifierKeyValues.map(({optionValue, name}) => [optionValue, name])
    );

    const modifierNameToValue = new Map(
        modifierKeyValues.map(({optionValue, name}) => [name, optionValue])
    );

    profileConditionsDescriptor = {
        popupLevel: {
            name: 'Popup Level',
            description: 'Use profile depending on the level of the popup.',
            placeholder: 'Number',
            type: 'number',
            step: 1,
            defaultValue: 0,
            defaultOperator: 'equal',
            transform: (optionValue) => parseInt(optionValue, 10),
            transformReverse: (transformedOptionValue) => `${transformedOptionValue}`,
            validateTransformed: (transformedOptionValue) => Number.isFinite(transformedOptionValue),
            operators: {
                equal: {
                    name: '=',
                    test: ({depth}, optionValue) => (depth === optionValue)
                },
                notEqual: {
                    name: '\u2260',
                    test: ({depth}, optionValue) => (depth !== optionValue)
                },
                lessThan: {
                    name: '<',
                    test: ({depth}, optionValue) => (depth < optionValue)
                },
                greaterThan: {
                    name: '>',
                    test: ({depth}, optionValue) => (depth > optionValue)
                },
                lessThanOrEqual: {
                    name: '\u2264',
                    test: ({depth}, optionValue) => (depth <= optionValue)
                },
                greaterThanOrEqual: {
                    name: '\u2265',
                    test: ({depth}, optionValue) => (depth >= optionValue)
                }
            }
        },
        url: {
            name: 'URL',
            description: 'Use profile depending on the URL of the current website.',
            defaultOperator: 'matchDomain',
            operators: {
                matchDomain: {
                    name: 'Matches Domain',
                    placeholder: 'Comma separated list of domains',
                    defaultValue: 'example.com',
                    transformCache: {},
                    transform: (optionValue) => optionValue.split(/[,;\s]+/).map((v) => v.trim().toLowerCase()).filter((v) => v.length > 0),
                    transformReverse: (transformedOptionValue) => transformedOptionValue.join(', '),
                    validateTransformed: (transformedOptionValue) => (transformedOptionValue.length > 0),
                    test: ({url}, transformedOptionValue) => profileConditionTestDomainList(url, transformedOptionValue)
                },
                matchRegExp: {
                    name: 'Matches RegExp',
                    placeholder: 'Regular expression',
                    defaultValue: 'example\\.com',
                    transformCache: {},
                    transform: (optionValue) => new RegExp(optionValue, 'i'),
                    transformReverse: (transformedOptionValue) => transformedOptionValue.source,
                    test: ({url}, transformedOptionValue) => (transformedOptionValue !== null && transformedOptionValue.test(url))
                }
            }
        },
        modifierKeys: {
            name: 'Modifier Keys',
            description: 'Use profile depending on the active modifier keys.',
            values: modifierKeyValues,
            defaultOperator: 'are',
            operators: {
                are: {
                    name: 'are',
                    placeholder: 'Press one or more modifier keys here',
                    defaultValue: [],
                    type: 'keyMulti',
                    keySeparator: modifierSeparator,
                    transformInput: (optionValue) => optionValue
                        .split(modifierSeparator)
                        .filter((v) => v.length > 0)
                        .map((v) => modifierNameToValue.get(v)),
                    transformReverse: (transformedOptionValue) => transformedOptionValue
                        .map((v) => modifierValueToName.get(v))
                        .join(modifierSeparator),
                    test: ({modifierKeys}, optionValue) => areSetsEqual(new Set(modifierKeys), new Set(optionValue))
                },
                areNot: {
                    name: 'are not',
                    placeholder: 'Press one or more modifier keys here',
                    defaultValue: [],
                    type: 'keyMulti',
                    keySeparator: modifierSeparator,
                    transformInput: (optionValue) => optionValue
                        .split(modifierSeparator)
                        .filter((v) => v.length > 0)
                        .map((v) => modifierNameToValue.get(v)),
                    transformReverse: (transformedOptionValue) => transformedOptionValue
                        .map((v) => modifierValueToName.get(v))
                        .join(modifierSeparator),
                    test: ({modifierKeys}, optionValue) => !areSetsEqual(new Set(modifierKeys), new Set(optionValue))
                },
                include: {
                    name: 'include',
                    type: 'select',
                    defaultValue: 'alt',
                    test: ({modifierKeys}, optionValue) => modifierKeys.includes(optionValue)
                },
                notInclude: {
                    name: 'don\'t include',
                    type: 'select',
                    defaultValue: 'alt',
                    test: ({modifierKeys}, optionValue) => !modifierKeys.includes(optionValue)
                }
            }
        }
    };
})();
