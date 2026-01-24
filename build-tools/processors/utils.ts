import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Dictionary, DictionaryEntry } from '../../src/types.js';

function isCompiledOutput(dirname: string): boolean {
  return dirname.includes('dist');
}

export function getRootDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  
  if (isCompiledOutput(__dirname)) {
    return join(__dirname, '../../..');
  }
  return join(__dirname, '../..');
}

function isDuplicateEntry(existing: DictionaryEntry, newEntry: DictionaryEntry): boolean {
  return existing.traditional === newEntry.traditional && 
         existing.simplified === newEntry.simplified && 
         existing.romanisation === newEntry.romanisation;
}

function entryExistsInArray(entries: DictionaryEntry[], entry: DictionaryEntry): boolean {
  return entries.some(existing => isDuplicateEntry(existing, entry));
}

function addEntryToDictionary(dict: Dictionary, key: string, entry: DictionaryEntry): void {
  if (!dict[key]) {
    dict[key] = [];
  }
  
  if (!entryExistsInArray(dict[key], entry)) {
    dict[key].push(entry);
  }
}

export function addDictionaryEntry(
  dict: Dictionary,
  entry: DictionaryEntry
): void {
  if (entry.simplified) {
    addEntryToDictionary(dict, entry.simplified, entry);
  }
  
  if (entry.traditional && entry.traditional !== entry.simplified) {
    addEntryToDictionary(dict, entry.traditional, entry);
  }
}
