import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseCedictFormat } from './cedict-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../..');

/**
 * Load Cantonese dictionary file contents
 */
function loadCantoneseFiles() {
  const mainPath = join(rootDir, 'dictionaries/cantonese/cccanto-webdist.txt');
  const readingsPath = join(rootDir, 'dictionaries/cantonese/cccedict-canto-readings.txt');

  let mainText = null;
  let readingsText = null;

  if (existsSync(mainPath)) {
    mainText = readFileSync(mainPath, 'utf-8');
  } else {
    console.warn(`[Build] Cantonese main dictionary file not found: ${mainPath}`);
  }

  if (existsSync(readingsPath)) {
    readingsText = readFileSync(readingsPath, 'utf-8');
  } else {
    console.warn(`[Build] Cantonese readings file not found: ${readingsPath}`);
  }

  if (!mainText && !readingsText) {
    throw new Error('No valid Cantonese dictionary files found');
  }

  return { mainText, readingsText };
}

/**
 * Process Cantonese dictionary into unified format
 * @returns {Object} Dictionary object keyed by word
 */
export function processCantoneseDict() {
  const { mainText, readingsText } = loadCantoneseFiles();
  let cantoneseDict = {};

  // Process main dictionary with definitions
  if (mainText) {
    console.log(`[Build] Processing Cantonese dictionary...`);
    cantoneseDict = parseCedictFormat(mainText);
    console.log(`[Build] Loaded Cantonese dictionary: ${Object.keys(cantoneseDict).length} entries`);
  }

  // Process readings-only dictionary and merge
  if (readingsText) {
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
  }

  return cantoneseDict;
}
