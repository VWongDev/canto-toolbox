import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type {
  CompactDictionary,
  CompactDictionaryEntry,
  Dictionary,
  DictionaryEntry,
} from '../../src/shared/types.js';

export function getRootDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // When compiled: build-tools/dist/build-tools/processors -> go up 4 levels
  // When source: build-tools/processors -> go up 2 levels
  return join(__dirname, __dirname.includes('dist') ? '../../../../' : '../..');
}

function isDuplicate(existing: DictionaryEntry, newEntry: DictionaryEntry): boolean {
  return existing.traditional === newEntry.traditional && 
         existing.simplified === newEntry.simplified && 
         existing.romanisation === newEntry.romanisation;
}

function addEntryToDict(dict: Dictionary, key: string, entry: DictionaryEntry): void {
  if (!dict[key]) dict[key] = [];
  if (!dict[key].some(e => isDuplicate(e, entry))) {
    dict[key].push(entry);
  }
}

export function addDictionaryEntry(dict: Dictionary, entry: DictionaryEntry): void {
  if (entry.simplified) {
    addEntryToDict(dict, entry.simplified, entry);
  }
  if (entry.traditional && entry.traditional !== entry.simplified) {
    addEntryToDict(dict, entry.traditional, entry);
  }
}

function entryId(entry: DictionaryEntry): string {
  return `${entry.traditional}\0${entry.simplified}\0${entry.romanisation}`;
}

function addIndex(
  index: CompactDictionary['index'],
  word: string,
  row: number,
): void {
  const existing = index[word];
  if (existing === undefined) {
    index[word] = row;
    return;
  }
  if (typeof existing === 'number') {
    if (existing !== row) index[word] = [existing, row];
    return;
  }
  if (!existing.includes(row)) existing.push(row);
}

/**
 * Collapse a dual-keyed dictionary so each unique entry is stored once.
 * Both script forms still resolve: they share a row index rather than a
 * copied object. Walks keys in sorted order so repeated builds stay
 * byte-identical.
 */
export function compactDictionary(dict: Dictionary): CompactDictionary {
  const rows: CompactDictionaryEntry[] = [];
  const rowId = new Map<string, number>();
  const index: CompactDictionary['index'] = {};

  const byKey = Object.entries(dict).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [word, entries] of byKey) {
    for (const entry of entries) {
      const id = entryId(entry);
      let idx = rowId.get(id);
      if (idx === undefined) {
        idx = rows.length;
        rows.push([entry.traditional, entry.simplified, entry.romanisation, entry.definitions]);
        rowId.set(id, idx);
      }
      addIndex(index, word, idx);
    }
  }

  return { rows, index };
}
