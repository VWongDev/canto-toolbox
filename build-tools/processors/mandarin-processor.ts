import { join } from 'path';
import { pathToFileURL } from 'url';
import { getRootDir, addDictionaryEntry } from './utils.js';
import type { Dictionary, DictionaryEntry } from '../../src/types.js';

const rootDir = getRootDir();

/**
 * Raw Mandarin dictionary entry tuple
 * [traditional, simplified, pinyin, definition, variantIndices, classifierIndices]
 */
type MandarinRawEntry = [string, string, string, string | string[], number[], number[]];

/**
 * Structure of all.js file from Mandarin dictionary
 */
interface AllDataStructure {
  all: MandarinRawEntry[];
}

/**
 * Load Mandarin dictionary file as a JavaScript module
 */
async function loadMandarinFiles(): Promise<MandarinRawEntry[]> {
  const filePath = join(rootDir, 'dictionaries/mandarin/data/all.js');
  // Use pathToFileURL for proper file:// URL conversion
  const fileUrl = pathToFileURL(filePath).href;
  
  const module = await import(fileUrl);
  const data = module.default as AllDataStructure;
  
  if (!data || !Array.isArray(data.all)) {
    throw new Error('Invalid Mandarin dictionary structure: missing "all" array');
  }
  
  return data.all;
}

/**
 * Convert Mandarin entry array to dictionary entry
 */
function convertMandarinEntry(entry: MandarinRawEntry): DictionaryEntry | null {
  const [traditional, simplified, pinyin, definition] = entry;
  const definitions = Array.isArray(definition) ? definition : [definition];
  
  return {
    traditional: String(traditional),
    simplified: String(simplified),
    romanisation: String(pinyin || ''),
    definitions: definitions.filter(d => d && String(d).trim().length > 0).map(String)
  };
}

/**
 * Process Mandarin dictionary into unified format
 */
export async function processMandarinDict(): Promise<Dictionary> {
  const dataArray = await loadMandarinFiles();
  const mandarinDict: Dictionary = {};

  // Convert to unified format
  for (const entry of dataArray) {
    const dictEntry = convertMandarinEntry(entry);
    if (dictEntry) {
      addDictionaryEntry(mandarinDict, dictEntry);
    }
  }

  console.log(`[Build] Loaded Mandarin dictionary: ${Object.keys(mandarinDict).length} entries`);
  return mandarinDict;
}
