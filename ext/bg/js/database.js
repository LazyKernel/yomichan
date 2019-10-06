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


class Database {
    constructor() {
        this.db = null;
        this.tagCache = {};
    }

    async prepare() {
        if (this.db) {
            throw 'Database already initialized';
        }

        this.db = new Dexie('dict');
        this.db.version(2).stores({
            terms:        '++id,dictionary,expression,reading',
            kanji:        '++,dictionary,character',
            tagMeta:      '++,dictionary',
            dictionaries: '++,title,version'
        });
        this.db.version(3).stores({
            termMeta:  '++,dictionary,expression',
            kanjiMeta: '++,dictionary,character',
            tagMeta:   '++,dictionary,name'
        });
        this.db.version(4).stores({
            terms: '++id,dictionary,expression,reading,sequence'
        });

        await this.db.open();
    }

    async purge() {
        if (!this.db) {
            throw 'Database not initialized';
        }

        this.db.close();
        await this.db.delete();
        this.db = null;
        this.tagCache = {};

        await this.prepare();
    }

    async findTerms(term, titles) {
        if (!this.db) {
            throw 'Database not initialized';
        }

        const results = [];
        await this.db.terms.where('expression').equals(term).or('reading').equals(term).each(row => {
            if (titles.includes(row.dictionary)) {
                results.push(Database.createTerm(row));
            }
        });

        return results;
    }

    async findTermsBulk(terms, titles) {
        const promises = [];
        const visited = {};
        const results = [];
        const createResult = Database.createTerm;
        const filter = (row) => titles.includes(row.dictionary);

        const db = this.db.backendDB();
        const dbTransaction = db.transaction(['terms'], 'readonly');
        const dbTerms = dbTransaction.objectStore('terms');
        const dbIndex1 = dbTerms.index('expression');
        const dbIndex2 = dbTerms.index('reading');

        for (let i = 0; i < terms.length; ++i) {
            const only = IDBKeyRange.only(terms[i]);
            promises.push(
                Database.getAll(dbIndex1, only, i, visited, filter, createResult, results),
                Database.getAll(dbIndex2, only, i, visited, filter, createResult, results)
            );
        }

        await Promise.all(promises);

        return results;
    }

    async findTermsExact(term, reading, titles) {
        if (!this.db) {
            throw 'Database not initialized';
        }

        const results = [];
        await this.db.terms.where('expression').equals(term).each(row => {
            if (row.reading === reading && titles.includes(row.dictionary)) {
                results.push(Database.createTerm(row));
            }
        });

        return results;
    }

    async findTermsBySequence(sequence, mainDictionary) {
        if (!this.db) {
            throw 'Database not initialized';
        }

        const results = [];
        await this.db.terms.where('sequence').equals(sequence).each(row => {
            if (row.dictionary === mainDictionary) {
                results.push(Database.createTerm(row));
            }
        });

        return results;
    }

    async findTermMeta(term, titles) {
        if (!this.db) {
            throw 'Database not initialized';
        }

        const results = [];
        await this.db.termMeta.where('expression').equals(term).each(row => {
            if (titles.includes(row.dictionary)) {
                results.push({
                    mode: row.mode,
                    data: row.data,
                    dictionary: row.dictionary
                });
            }
        });

        return results;
    }

    async findTermMetaBulk(terms, titles) {
        const promises = [];
        const visited = {};
        const results = [];
        const createResult = Database.createTermMeta;
        const filter = (row) => titles.includes(row.dictionary);

        const db = this.db.backendDB();
        const dbTransaction = db.transaction(['termMeta'], 'readonly');
        const dbTerms = dbTransaction.objectStore('termMeta');
        const dbIndex = dbTerms.index('expression');

        for (let i = 0; i < terms.length; ++i) {
            const only = IDBKeyRange.only(terms[i]);
            promises.push(Database.getAll(dbIndex, only, i, visited, filter, createResult, results));
        }

        await Promise.all(promises);

        return results;
    }

    async findKanji(kanji, titles) {
        if (!this.db) {
            throw 'Database not initialized';
        }

        const results = [];
        await this.db.kanji.where('character').equals(kanji).each(row => {
            if (titles.includes(row.dictionary)) {
                results.push({
                    character: row.character,
                    onyomi: dictFieldSplit(row.onyomi),
                    kunyomi: dictFieldSplit(row.kunyomi),
                    tags: dictFieldSplit(row.tags),
                    glossary: row.meanings,
                    stats: row.stats,
                    dictionary: row.dictionary
                });
            }
        });

        return results;
    }

    async findKanjiMeta(kanji, titles) {
        if (!this.db) {
            throw 'Database not initialized';
        }

        const results = [];
        await this.db.kanjiMeta.where('character').equals(kanji).each(row => {
            if (titles.includes(row.dictionary)) {
                results.push({
                    mode: row.mode,
                    data: row.data,
                    dictionary: row.dictionary
                });
            }
        });

        return results;
    }

    findTagForTitleCached(name, title) {
        if (this.tagCache.hasOwnProperty(title)) {
            const cache = this.tagCache[title];
            if (cache.hasOwnProperty(name)) {
                return cache[name];
            }
        }
    }

    async findTagForTitle(name, title) {
        if (!this.db) {
            throw 'Database not initialized';
        }

        const cache = (this.tagCache.hasOwnProperty(title) ? this.tagCache[title] : (this.tagCache[title] = {}));

        let result = null;
        await this.db.tagMeta.where('name').equals(name).each(row => {
            if (title === row.dictionary) {
                result = row;
            }
        });

        cache[name] = result;

        return result;
    }

    async summarize() {
        if (this.db) {
            return this.db.dictionaries.toArray();
        } else {
            throw 'Database not initialized';
        }
    }

    async importDictionary(archive, progressCallback, exceptions) {
        if (!this.db) {
            throw 'Database not initialized';
        }

        const maxTransactionLength = 1000;
        const bulkAdd = async (table, items, total, current) => {
            if (items.length < maxTransactionLength) {
                if (progressCallback) {
                    progressCallback(total, current);
                }

                try {
                    await table.bulkAdd(items);
                } catch (e) {
                    if (exceptions) {
                        exceptions.push(e);
                    } else {
                        throw e;
                    }
                }
            } else {
                for (let i = 0; i < items.length; i += maxTransactionLength) {
                    if (progressCallback) {
                        progressCallback(total, current + i / items.length);
                    }

                    let count = Math.min(maxTransactionLength, items.length - i);
                    try {
                        await table.bulkAdd(items.slice(i, i + count));
                    } catch (e) {
                        if (exceptions) {
                            exceptions.push(e);
                        } else {
                            throw e;
                        }
                    }
                }
            }
        };

        const indexDataLoaded = async summary => {
            if (summary.version > 3) {
                throw 'Unsupported dictionary version';
            }

            const count = await this.db.dictionaries.where('title').equals(summary.title).count();
            if (count > 0) {
                throw 'Dictionary is already imported';
            }

            await this.db.dictionaries.add(summary);
        };

        const termDataLoaded = async (summary, entries, total, current) => {
            const rows = [];
            if (summary.version === 1) {
                for (const [expression, reading, definitionTags, rules, score, ...glossary] of entries) {
                    rows.push({
                        expression,
                        reading,
                        definitionTags,
                        rules,
                        score,
                        glossary,
                        dictionary: summary.title
                    });
                }
            } else {
                for (const [expression, reading, definitionTags, rules, score, glossary, sequence, termTags] of entries) {
                    rows.push({
                        expression,
                        reading,
                        definitionTags,
                        rules,
                        score,
                        glossary,
                        sequence,
                        termTags,
                        dictionary: summary.title
                    });
                }
            }

            await bulkAdd(this.db.terms, rows, total, current);
        };

        const termMetaDataLoaded = async (summary, entries, total, current) => {
            const rows = [];
            for (const [expression, mode, data] of entries) {
                rows.push({
                    expression,
                    mode,
                    data,
                    dictionary: summary.title
                });
            }

            await bulkAdd(this.db.termMeta, rows, total, current);
        };

        const kanjiDataLoaded = async (summary, entries, total, current)  => {
            const rows = [];
            if (summary.version === 1) {
                for (const [character, onyomi, kunyomi, tags, ...meanings] of entries) {
                    rows.push({
                        character,
                        onyomi,
                        kunyomi,
                        tags,
                        meanings,
                        dictionary: summary.title
                    });
                }
            } else {
                for (const [character, onyomi, kunyomi, tags, meanings, stats] of entries) {
                    rows.push({
                        character,
                        onyomi,
                        kunyomi,
                        tags,
                        meanings,
                        stats,
                        dictionary: summary.title
                    });
                }
            }

            await bulkAdd(this.db.kanji, rows, total, current);
        };

        const kanjiMetaDataLoaded = async (summary, entries, total, current) => {
            const rows = [];
            for (const [character, mode, data] of entries) {
                rows.push({
                    character,
                    mode,
                    data,
                    dictionary: summary.title
                });
            }

            await bulkAdd(this.db.kanjiMeta, rows, total, current);
        };

        const tagDataLoaded = async (summary, entries, total, current) => {
            const rows = [];
            for (const [name, category, order, notes, score] of entries) {
                const row = dictTagSanitize({
                    name,
                    category,
                    order,
                    notes,
                    score,
                    dictionary: summary.title
                });

                rows.push(row);
            }

            await bulkAdd(this.db.tagMeta, rows, total, current);
        };

        return await Database.importDictionaryZip(
            archive,
            indexDataLoaded,
            termDataLoaded,
            termMetaDataLoaded,
            kanjiDataLoaded,
            kanjiMetaDataLoaded,
            tagDataLoaded
        );
    }

    static async importDictionaryZip(
        archive,
        indexDataLoaded,
        termDataLoaded,
        termMetaDataLoaded,
        kanjiDataLoaded,
        kanjiMetaDataLoaded,
        tagDataLoaded
    ) {
        const zip = await JSZip.loadAsync(archive);

        const indexFile = zip.files['index.json'];
        if (!indexFile) {
            throw 'No dictionary index found in archive';
        }

        const index = JSON.parse(await indexFile.async('string'));
        if (!index.title || !index.revision) {
            throw 'Unrecognized dictionary format';
        }

        const summary = {
            title: index.title,
            revision: index.revision,
            sequenced: index.sequenced,
            version: index.format || index.version
        };

        await indexDataLoaded(summary);

        const buildTermBankName      = index => `term_bank_${index + 1}.json`;
        const buildTermMetaBankName  = index => `term_meta_bank_${index + 1}.json`;
        const buildKanjiBankName     = index => `kanji_bank_${index + 1}.json`;
        const buildKanjiMetaBankName = index => `kanji_meta_bank_${index + 1}.json`;
        const buildTagBankName       = index => `tag_bank_${index + 1}.json`;

        const countBanks = namer => {
            let count = 0;
            while (zip.files[namer(count)]) {
                ++count;
            }

            return count;
        };

        const termBankCount      = countBanks(buildTermBankName);
        const termMetaBankCount  = countBanks(buildTermMetaBankName);
        const kanjiBankCount     = countBanks(buildKanjiBankName);
        const kanjiMetaBankCount = countBanks(buildKanjiMetaBankName);
        const tagBankCount       = countBanks(buildTagBankName);

        let bankLoadedCount = 0;
        let bankTotalCount =
            termBankCount +
            termMetaBankCount +
            kanjiBankCount +
            kanjiMetaBankCount +
            tagBankCount;

        if (tagDataLoaded && index.tagMeta) {
            const bank = [];
            for (const name in index.tagMeta) {
                const tag = index.tagMeta[name];
                bank.push([name, tag.category, tag.order, tag.notes, tag.score]);
            }

            tagDataLoaded(summary, bank, ++bankTotalCount, bankLoadedCount++);
        }

        const loadBank = async (summary, namer, count, callback) => {
            if (callback) {
                for (let i = 0; i < count; ++i) {
                    const bankFile = zip.files[namer(i)];
                    const bank = JSON.parse(await bankFile.async('string'));
                    await callback(summary, bank, bankTotalCount, bankLoadedCount++);
                }
            }
        };

        await loadBank(summary, buildTermBankName, termBankCount, termDataLoaded);
        await loadBank(summary, buildTermMetaBankName, termMetaBankCount, termMetaDataLoaded);
        await loadBank(summary, buildKanjiBankName, kanjiBankCount, kanjiDataLoaded);
        await loadBank(summary, buildKanjiMetaBankName, kanjiMetaBankCount, kanjiMetaDataLoaded);
        await loadBank(summary, buildTagBankName, tagBankCount, tagDataLoaded);

        return summary;
    }

    static createTerm(row, index) {
        return {
            index,
            expression: row.expression,
            reading: row.reading,
            definitionTags: dictFieldSplit(row.definitionTags || row.tags || ''),
            termTags: dictFieldSplit(row.termTags || ''),
            rules: dictFieldSplit(row.rules),
            glossary: row.glossary,
            score: row.score,
            dictionary: row.dictionary,
            id: row.id,
            sequence: typeof row.sequence === 'undefined' ? -1 : row.sequence
        };
    }

    static createTermMeta(row, index) {
        return {
            index,
            mode: row.mode,
            data: row.data,
            dictionary: row.dictionary
        };
    }

    static getAll(dbIndex, query, index, visited, filter, createResult, results) {
        const fn = typeof dbIndex.getAll === 'function' ? Database.getAllFast : Database.getAllUsingCursor;
        return fn(dbIndex, query, index, visited, filter, createResult, results);
    }

    static getAllFast(dbIndex, query, index, visited, filter, createResult, results) {
        return new Promise((resolve, reject) => {
            const request = dbIndex.getAll(query);
            request.onerror = (e) => reject(e);
            request.onsuccess = (e) => {
                for (const row of e.target.result) {
                    if (filter(row, index) && !visited.hasOwnProperty(row.id)) {
                        visited[row.id] = true;
                        results.push(createResult(row, index));
                    }
                }
                resolve();
            };
        });
    }

    static getAllUsingCursor(dbIndex, query, index, visited, filter, createResult, results) {
        return new Promise((resolve, reject) => {
            const request = dbIndex.openCursor(query, 'next');
            request.onerror = (e) => reject(e);
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    const row = cursor.value;
                    if (filter(row, index) && !visited.hasOwnProperty(row.id)) {
                        visited[row.id] = true;
                        results.push(createResult(row, index));
                    }
                    cursor.continue();
                } else {
                    resolve();
                }
            };
        });
    }
}
