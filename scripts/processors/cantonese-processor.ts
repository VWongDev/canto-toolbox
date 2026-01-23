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
  let mergedCount = 0;
  
  for (const [word, readingEntries] of Object.entries(readingsDict)) {
    const readingEntryArray = Array.isArray(readingEntries) ? readingEntries : [readingEntries];
    const mainEntries = mainDict[word];
    const mainEntryArray = Array.isArray(mainEntries) ? mainEntries : (mainEntries ? [mainEntries] : []);
    
    if (mainEntryArray.length > 0) {
      // Entry exists in main dict, add jyutping/romanisation if missing
      for (const readingEntry of readingEntryArray) {
        for (const mainEntry of mainEntryArray) {
          if (!mainEntry.jyutping && readingEntry.jyutping) {
            mainEntry.jyutping = readingEntry.jyutping;
            // Update romanisation to use jyutping (preferred for Cantonese)
            if (!mainEntry.romanisation || mainEntry.romanisation === mainEntry.pinyin) {
              mainEntry.romanisation = readingEntry.jyutping;
            }
            mergedCount++;
          }
        }
      }
      mainDict[word] = mainEntryArray;
    } else {
      // Entry only in readings dict, add it to main dict
      mainDict[word] = readingEntryArray;
      mergedCount += readingEntryArray.length;
    }
  }
  
  console.log(`[Build] Merged ${mergedCount} readings into Cantonese dictionary`);
}

/**
 * Process Cantonese dictionary into unified format
 */
export function processCantoneseDict(): Dictionary {
  const { mainText, readingsText } = loadCantoneseFiles();
  
  console.log(`[Build] Processing Cantonese dictionary...`);
  const cantoneseDict = parseCedictFormat(mainText);
  console.log(`[Build] Loaded Cantonese dictionary: ${Object.keys(cantoneseDict).length} entries`);

  // Process readings-only dictionary and merge
  console.log(`[Build] Processing Cantonese readings...`);
  const cantoneseReadingsDict = parseCedictFormat(readingsText);
  console.log(`[Build] Loaded Cantonese readings: ${Object.keys(cantoneseReadingsDict).length} entries`);
  
  mergeReadings(cantoneseDict, cantoneseReadingsDict);

  return cantoneseDict;
}
