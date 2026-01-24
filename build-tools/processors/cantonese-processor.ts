import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCedictFormat } from './cedict-parser.js';
import { getRootDir, addDictionaryEntry } from './utils.js';
import type { Dictionary, DictionaryEntry } from '../../src/types.js';

const rootDir = getRootDir();

/**
 * Load Cantonese dictionary file contents
 */
function loadCantoneseFiles(): { mainText: string; readingsText: string } {
  const mainPath = join(rootDir, 'dictionaries/cantonese/cccanto-webdist.txt');
  const readingsPath = join(rootDir, 'dictionaries/cantonese/cccedict-canto-readings.txt');

  const mainText = readFileSync(mainPath, 'utf-8');
  const readingsText = readFileSync(readingsPath, 'utf-8');

  return { mainText, readingsText };
}

/**
 * Merge readings dictionary into main dictionary
 * Matches entries by traditional + simplified, and adds romanisation if missing
 * If a reading entry has a different pronunciation than existing entries, adds it as a new entry
 * If a reading entry doesn't match any main entry, adds it as a new entry
 */
function mergeReadings(mainDict: Dictionary, readingsDict: Dictionary): void {
  for (const [word, readingEntries] of Object.entries(readingsDict)) {
    const readingEntryArray = Array.isArray(readingEntries) ? readingEntries : [readingEntries];
    const mainEntries = mainDict[word];
    const mainEntryArray = Array.isArray(mainEntries) ? mainEntries : (mainEntries ? [mainEntries] : []);
    
    if (mainEntryArray.length > 0) {
      // Entry exists in main dict - try to match and merge romanisation
      for (const readingEntry of readingEntryArray) {
        // Find matching main entry by traditional + simplified AND romanisation
        const matchingMainEntry = mainEntryArray.find(
          mainEntry => mainEntry.traditional === readingEntry.traditional &&
                       mainEntry.simplified === readingEntry.simplified &&
                       mainEntry.romanisation === readingEntry.romanisation
        );
        
        if (matchingMainEntry) {
          // Exact match found (same traditional, simplified, AND romanisation) - skip duplicate
          continue;
        }
        
        // Check if there's a matching entry with same traditional/simplified but different romanisation
        const matchingEntryDifferentPron = mainEntryArray.find(
          mainEntry => mainEntry.traditional === readingEntry.traditional &&
                       mainEntry.simplified === readingEntry.simplified
        );
        
        if (matchingEntryDifferentPron) {
          // Same word but different pronunciation - add as new entry if reading has romanisation
          if (readingEntry.romanisation && readingEntry.romanisation !== matchingEntryDifferentPron.romanisation) {
            // Check if this pronunciation already exists
            const pronunciationExists = mainEntryArray.some(
              e => e.traditional === readingEntry.traditional &&
                   e.simplified === readingEntry.simplified &&
                   e.romanisation === readingEntry.romanisation
            );
            if (!pronunciationExists) {
              addDictionaryEntry(mainDict, readingEntry);
            }
          } else if (!matchingEntryDifferentPron.romanisation && readingEntry.romanisation) {
            // Main entry missing romanisation - add it
            matchingEntryDifferentPron.romanisation = readingEntry.romanisation;
          }
        } else {
          // No match found - add reading entry as new entry (if it has definitions or romanisation)
          if (readingEntry.definitions && readingEntry.definitions.length > 0) {
            addDictionaryEntry(mainDict, readingEntry);
          } else if (readingEntry.romanisation) {
            // Even without definitions, add if it has a pronunciation (might be useful)
            addDictionaryEntry(mainDict, readingEntry);
          }
        }
      }
    } else {
      // Entry only in readings dict - add all reading entries
      for (const readingEntry of readingEntryArray) {
        addDictionaryEntry(mainDict, readingEntry);
      }
    }
  }
}

/**
 * Process Cantonese dictionary into unified format
 */
export async function processCantoneseDict(): Promise<Dictionary> {
  const { mainText, readingsText } = loadCantoneseFiles();
  
  const cantoneseDict = parseCedictFormat(mainText);
  const cantoneseReadingsDict = parseCedictFormat(readingsText);
  
  mergeReadings(cantoneseDict, cantoneseReadingsDict);

  console.log(`[Build] Loaded Cantonese dictionary: ${Object.keys(cantoneseDict).length} entries`);
  return cantoneseDict;
}
