import { join } from 'path';
import { pathToFileURL } from 'url';
import { getRootDir, addDictionaryEntry } from './utils.js';
import type { Dictionary, DictionaryEntry } from '../../src/types.js';

const rootDir = getRootDir();

type MandarinRawEntry = [string, string, string, string | string[], number[], number[]];

interface AllDataStructure {
  all: MandarinRawEntry[];
}

async function loadMandarinFiles(): Promise<MandarinRawEntry[]> {
  const filePath = join(rootDir, 'dictionaries/mandarin/data/all.js');
  const fileUrl = pathToFileURL(filePath).href;
  
  const module = await import(fileUrl);
  const data = module.default as AllDataStructure;
  
  if (!data || !Array.isArray(data.all)) {
    throw new Error('Invalid Mandarin dictionary structure: missing "all" array');
  }
  
  return data.all;
}

function normalizeDefinitions(definition: string | string[]): string[] {
  const definitions = Array.isArray(definition) ? definition : [definition];
  return definitions.filter(d => d && String(d).trim().length > 0).map(String);
}

function convertMandarinEntry(entry: MandarinRawEntry): DictionaryEntry | null {
  const [traditional, simplified, pinyin, definition] = entry;
  const definitions = normalizeDefinitions(definition);
  
  if (definitions.length === 0) {
    return null;
  }
  
  return {
    traditional: String(traditional),
    simplified: String(simplified),
    romanisation: String(pinyin || ''),
    definitions
  };
}

export async function processMandarinDict(): Promise<Dictionary> {
  const dataArray = await loadMandarinFiles();
  const mandarinDict: Dictionary = {};

  for (const entry of dataArray) {
    const dictEntry = convertMandarinEntry(entry);
    if (dictEntry) {
      addDictionaryEntry(mandarinDict, dictEntry);
    }
  }

  console.log(`[Build] Loaded Mandarin dictionary: ${Object.keys(mandarinDict).length} entries`);
  return mandarinDict;
}
