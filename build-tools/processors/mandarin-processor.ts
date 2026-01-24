import { join } from 'path';
import { pathToFileURL } from 'url';
import { getRootDir, addDictionaryEntry } from './utils.js';
import type { Dictionary, DictionaryEntry } from '../../src/types.js';

type MandarinRawEntry = [string, string, string, string | string[], number[], number[]];

async function loadMandarinFiles(): Promise<MandarinRawEntry[]> {
  const filePath = join(getRootDir(), 'dictionaries/mandarin/data/all.js');
  const module = await import(pathToFileURL(filePath).href);
  const data = module.default as { all: MandarinRawEntry[] };
  
  if (!data?.all) {
    throw new Error('Invalid Mandarin dictionary structure: missing "all" array');
  }
  
  return data.all;
}

export async function processMandarinDict(): Promise<Dictionary> {
  const dict: Dictionary = {};
  
  for (const [traditional, simplified, pinyin, definition] of await loadMandarinFiles()) {
    const definitions = (Array.isArray(definition) ? definition : [definition])
      .filter(d => d && String(d).trim().length > 0)
      .map(String);
    
    if (definitions.length > 0) {
      addDictionaryEntry(dict, {
        traditional: String(traditional),
        simplified: String(simplified),
        romanisation: String(pinyin || ''),
        definitions
      });
    }
  }

  console.log(`[Build] Loaded Mandarin dictionary: ${Object.keys(dict).length} entries`);
  return dict;
}
