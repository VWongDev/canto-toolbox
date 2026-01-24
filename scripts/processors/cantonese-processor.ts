import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCedictFormat } from './cedict-parser.js';
import { getRootDir } from './utils.js';
import type { Dictionary } from '../types.js';

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
 */
function mergeReadings(mainDict: Dictionary, readingsDict: Dictionary): void {
  for (const [word, readingEntries] of Object.entries(readingsDict)) {
    const readingEntryArray = Array.isArray(readingEntries) ? readingEntries : [readingEntries];
    const mainEntries = mainDict[word];
    const mainEntryArray = Array.isArray(mainEntries) ? mainEntries : (mainEntries ? [mainEntries] : []);
    
    if (mainEntryArray.length > 0) {
      // Entry exists in main dict, add romanisation if missing
      for (const readingEntry of readingEntryArray) {
        for (const mainEntry of mainEntryArray) {
          if (!mainEntry.romanisation || (readingEntry.romanisation && !mainEntry.romanisation)) {
            mainEntry.romanisation = readingEntry.romanisation;
          }
        }
      }
      mainDict[word] = mainEntryArray;
    } else {
      // Entry only in readings dict, add it to main dict
      mainDict[word] = readingEntryArray;
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
