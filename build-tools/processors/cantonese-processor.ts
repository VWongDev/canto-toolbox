import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCedictFormat } from './cedict-parser.js';
import { getRootDir, addDictionaryEntry } from './utils.js';
import type { Dictionary, DictionaryEntry } from '../../src/types.js';

const rootDir = getRootDir();

function loadCantoneseFiles(): { mainText: string; readingsText: string } {
  const mainPath = join(rootDir, 'dictionaries/cantonese/cccanto-webdist.txt');
  const readingsPath = join(rootDir, 'dictionaries/cantonese/cccedict-canto-readings.txt');

  const mainText = readFileSync(mainPath, 'utf-8');
  const readingsText = readFileSync(readingsPath, 'utf-8');

  return { mainText, readingsText };
}

function normalizeToArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function findExactMatch(mainEntries: DictionaryEntry[], readingEntry: DictionaryEntry): DictionaryEntry | undefined {
  return mainEntries.find(
    mainEntry => mainEntry.traditional === readingEntry.traditional &&
                 mainEntry.simplified === readingEntry.simplified &&
                 mainEntry.romanisation === readingEntry.romanisation
  );
}

function findMatchWithSameCharacters(mainEntries: DictionaryEntry[], readingEntry: DictionaryEntry): DictionaryEntry | undefined {
  return mainEntries.find(
    mainEntry => mainEntry.traditional === readingEntry.traditional &&
                 mainEntry.simplified === readingEntry.simplified
  );
}

function hasPronunciation(entry: DictionaryEntry): boolean {
  return Boolean(entry.romanisation && entry.romanisation.trim().length > 0);
}

function pronunciationAlreadyExists(mainEntries: DictionaryEntry[], readingEntry: DictionaryEntry): boolean {
  return mainEntries.some(
    e => e.traditional === readingEntry.traditional &&
         e.simplified === readingEntry.simplified &&
         e.romanisation === readingEntry.romanisation
  );
}

function shouldAddReadingEntry(readingEntry: DictionaryEntry): boolean {
  const hasDefinitions = readingEntry.definitions && readingEntry.definitions.length > 0;
  return hasDefinitions || hasPronunciation(readingEntry);
}

function mergeReadingEntryIntoMain(mainDict: Dictionary, mainEntries: DictionaryEntry[], readingEntry: DictionaryEntry): void {
  const exactMatch = findExactMatch(mainEntries, readingEntry);
  if (exactMatch) {
    return;
  }
  
  const matchWithDifferentPron = findMatchWithSameCharacters(mainEntries, readingEntry);
  
  if (matchWithDifferentPron) {
    if (hasPronunciation(readingEntry) && readingEntry.romanisation !== matchWithDifferentPron.romanisation) {
      if (!pronunciationAlreadyExists(mainEntries, readingEntry)) {
        addDictionaryEntry(mainDict, readingEntry);
      }
    } else if (!hasPronunciation(matchWithDifferentPron) && hasPronunciation(readingEntry)) {
      matchWithDifferentPron.romanisation = readingEntry.romanisation;
    }
  } else if (shouldAddReadingEntry(readingEntry)) {
    addDictionaryEntry(mainDict, readingEntry);
  }
}

function mergeReadings(mainDict: Dictionary, readingsDict: Dictionary): void {
  for (const [word, readingEntries] of Object.entries(readingsDict)) {
    const readingEntryArray = normalizeToArray(readingEntries);
    const mainEntries = normalizeToArray(mainDict[word]);
    
    if (mainEntries.length > 0) {
      for (const readingEntry of readingEntryArray) {
        mergeReadingEntryIntoMain(mainDict, mainEntries, readingEntry);
      }
    } else {
      for (const readingEntry of readingEntryArray) {
        addDictionaryEntry(mainDict, readingEntry);
      }
    }
  }
}

export async function processCantoneseDict(): Promise<Dictionary> {
  const { mainText, readingsText } = loadCantoneseFiles();
  
  const cantoneseDict = parseCedictFormat(mainText);
  const cantoneseReadingsDict = parseCedictFormat(readingsText);
  
  mergeReadings(cantoneseDict, cantoneseReadingsDict);

  console.log(`[Build] Loaded Cantonese dictionary: ${Object.keys(cantoneseDict).length} entries`);
  return cantoneseDict;
}
