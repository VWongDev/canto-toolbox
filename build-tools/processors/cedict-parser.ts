import { addDictionaryEntry } from './utils.js';
import type { Dictionary, DictionaryEntry } from '../../src/types.js';

function parseDefinitions(definitionsStr: string): string[] {
  return definitionsStr.split('/').filter(d => d.trim().length > 0);
}

function createEntry(traditional: string, simplified: string, pinyin: string, jyutping: string, definitions: string[]): DictionaryEntry {
  return {
    traditional,
    simplified,
    romanisation: jyutping || pinyin || '',
    definitions: definitions.filter(d => d?.trim())
  };
}

export function parseCedictFormat(text: string): Dictionary {
  const dict: Dictionary = {};
  
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#') || !line.trim()) continue;
    
    let entry: DictionaryEntry | null = null;
    
    const match1 = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\{([^}]+)\}\s+\/(.+)\//);
    if (match1) {
      entry = createEntry(match1[1], match1[2], match1[3], match1[4], parseDefinitions(match1[5]));
    } else {
      const match2 = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\//);
      if (match2) {
        entry = createEntry(match2[1], match2[2], match2[3], '', parseDefinitions(match2[4]));
      } else {
        const match3 = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\{([^}]+)\}$/);
        if (match3) {
          entry = createEntry(match3[1], match3[2], match3[3], match3[4], []);
        }
      }
    }
    
    if (entry) addDictionaryEntry(dict, entry);
  }
  
  return dict;
}
