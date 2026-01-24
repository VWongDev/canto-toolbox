import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCedictFormat } from './cedict-parser.js';
import { getRootDir, addDictionaryEntry } from './utils.js';
import type { Dictionary, DictionaryEntry } from '../../src/types.js';

function loadCantoneseFiles(): { mainText: string; readingsText: string } {
  const rootDir = getRootDir();
  return {
    mainText: readFileSync(join(rootDir, 'dictionaries/cantonese/cccanto-webdist.txt'), 'utf-8'),
    readingsText: readFileSync(join(rootDir, 'dictionaries/cantonese/cccedict-canto-readings.txt'), 'utf-8')
  };
}

function normalizeToArray<T>(value: T | T[] | undefined): T[] {
  return value ? (Array.isArray(value) ? value : [value]) : [];
}

function mergeReadingEntry(mainDict: Dictionary, mainEntries: DictionaryEntry[], readingEntry: DictionaryEntry): void {
  const exactMatch = mainEntries.find(
    e => e.traditional === readingEntry.traditional &&
         e.simplified === readingEntry.simplified &&
         e.romanisation === readingEntry.romanisation
  );
  if (exactMatch) return;
  
  const sameChars = mainEntries.find(
    e => e.traditional === readingEntry.traditional &&
         e.simplified === readingEntry.simplified
  );
  
  if (sameChars) {
    const hasPron = readingEntry.romanisation?.trim();
    if (hasPron && readingEntry.romanisation !== sameChars.romanisation) {
      if (!mainEntries.some(e => e.romanisation === readingEntry.romanisation)) {
        addDictionaryEntry(mainDict, readingEntry);
      }
    } else if (!sameChars.romanisation?.trim() && hasPron) {
      sameChars.romanisation = readingEntry.romanisation;
    }
  } else if (readingEntry.definitions?.length || readingEntry.romanisation?.trim()) {
    addDictionaryEntry(mainDict, readingEntry);
  }
}

function mergeReadings(mainDict: Dictionary, readingsDict: Dictionary): void {
  for (const [word, readingEntries] of Object.entries(readingsDict)) {
    const readings = normalizeToArray(readingEntries);
    const mainEntries = normalizeToArray(mainDict[word]);
    
    if (mainEntries.length > 0) {
      readings.forEach(entry => mergeReadingEntry(mainDict, mainEntries, entry));
    } else {
      readings.forEach(entry => addDictionaryEntry(mainDict, entry));
    }
  }
}

export async function processCantoneseDict(): Promise<Dictionary> {
  const { mainText, readingsText } = loadCantoneseFiles();
  const cantoneseDict = parseCedictFormat(mainText);
  
  mergeReadings(cantoneseDict, parseCedictFormat(readingsText));

  console.log(`[Build] Loaded Cantonese dictionary: ${Object.keys(cantoneseDict).length} entries`);
  return cantoneseDict;
}
