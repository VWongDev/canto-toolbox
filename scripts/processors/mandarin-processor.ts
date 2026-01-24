import { readFileSync } from 'fs';
import { join } from 'path';
import { getRootDir, addDictionaryEntry } from './utils.js';
import type { Dictionary, DictionaryEntry } from '../types.js';

const rootDir = getRootDir();

/**
 * Load Mandarin dictionary file content
 */
function loadMandarinFiles(): string {
  const path = join(rootDir, 'dictionaries/mandarin/data/all.js');
  return readFileSync(path, 'utf-8');
}

/**
 * Parse Mandarin JS module format and extract data array
 */
function parseMandarinModule(fileContent: string): unknown[] {
  // Extract the data from the export default statement
  let dataText = fileContent.trim();
  if (dataText.startsWith('export default ')) {
    dataText = dataText.substring('export default '.length);
  }
  
  // Parse JSON
  let parsedData: unknown;
  try {
    parsedData = JSON.parse(dataText);
  } catch (jsonError) {
    // Try to extract just the JSON part
    const jsonMatch = dataText.match(/^(\{.*\}|\[.*\])/s);
    if (jsonMatch) {
      parsedData = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error(`Failed to parse Mandarin dictionary: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
    }
  }
  
  // Handle different structures
  if (parsedData && typeof parsedData === 'object') {
    if (Array.isArray(parsedData)) {
      return parsedData;
    } else if (typeof parsedData === 'object' && parsedData !== null) {
      const obj = parsedData as Record<string, unknown>;
      if (obj.all && Array.isArray(obj.all)) {
        return obj.all;
      } else if (obj.simplified && Array.isArray(obj.simplified)) {
        return obj.simplified;
      } else if (obj.traditional && Array.isArray(obj.traditional)) {
        return obj.traditional;
      }
    }
  }
  
  throw new Error('Could not find array data in Mandarin dictionary file');
}

/**
 * Convert Mandarin entry array to dictionary entry
 */
function convertMandarinEntry(entry: unknown): DictionaryEntry | null {
  if (!Array.isArray(entry) || entry.length < 4) {
    return null;
  }
  
  const [traditional, simplified, pinyin, definition] = entry as [string, string, string, string | string[]];
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
export function processMandarinDict(): Dictionary {
  const fileContent = loadMandarinFiles();
  const mandarinDict: Dictionary = {};
  const dataArray = parseMandarinModule(fileContent);

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
