import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseCedictFormat } from './cedict-parser.js';
import type { Dictionary } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Compiled output is in scripts/dist/, so go up 3 levels to reach root
const rootDir = join(__dirname, '../../..');

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
 * Process Cantonese dictionary into unified format
 */
export function processCantoneseDict(): Dictionary {
  const { mainText, readingsText } = loadCantoneseFiles();
  
  console.log(`[Build] Processing Cantonese dictionary...`);
  let cantoneseDict = parseCedictFormat(mainText);
  console.log(`[Build] Loaded Cantonese dictionary: ${Object.keys(cantoneseDict).length} entries`);

  // Process readings-only dictionary and merge
  console.log(`[Build] Processing Cantonese readings...`);
  const cantoneseReadingsDict = parseCedictFormat(readingsText);
  console.log(`[Build] Loaded Cantonese readings: ${Object.keys(cantoneseReadingsDict).length} entries`);
  
  // Merge readings into main dictionary
  let mergedCount = 0;
  for (const [word, readingEntries] of Object.entries(cantoneseReadingsDict)) {
    const readingEntryArray = Array.isArray(readingEntries) ? readingEntries : [readingEntries];
    const mainEntries = cantoneseDict[word];
    const mainEntryArray = Array.isArray(mainEntries) ? mainEntries : (mainEntries ? [mainEntries] : []);
    
    if (mainEntryArray.length > 0) {
      // Entry exists in main dict, add jyutping if missing
      for (const readingEntry of readingEntryArray) {
        for (const mainEntry of mainEntryArray) {
          if (!mainEntry.jyutping && readingEntry.jyutping) {
            mainEntry.jyutping = readingEntry.jyutping;
            mergedCount++;
          }
        }
      }
      cantoneseDict[word] = mainEntryArray;
    } else {
      // Entry only in readings dict, add it to main dict
      cantoneseDict[word] = readingEntryArray;
      mergedCount += readingEntryArray.length;
    }
  }
  console.log(`[Build] Merged ${mergedCount} readings into Cantonese dictionary`);

  return cantoneseDict;
}
