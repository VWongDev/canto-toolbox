import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Dictionary, DictionaryEntry } from '../../src/types.js';

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
