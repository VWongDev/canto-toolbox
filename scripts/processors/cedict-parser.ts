/**
 * Parse CC-CEDICT format text file
 * Format: Traditional Simplified [pinyin] {jyutping} /def1/def2/
 */
import { addDictionaryEntry } from './utils.js';
import type { Dictionary, DictionaryEntry } from '../types.js';

export function parseCedictFormat(text: string): Dictionary {
  const dict: Dictionary = {};
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (!line || line.startsWith('#') || line.trim().length === 0) {
      continue;
    }
    
    // Try format with definitions: Traditional Simplified [pinyin] {jyutping} /def1/def2/
    let match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\{([^}]+)\}\s+\/(.+)\/$/);
    if (match) {
      const [, traditional, simplified, pinyin, jyutping, definitions] = match;
      const defs = definitions.split('/').filter(d => d.trim().length > 0);
      
      const entry: DictionaryEntry = {
        traditional,
        simplified,
        romanisation: jyutping || pinyin || '', // Prefer jyutping for Cantonese, fallback to pinyin
        definitions: defs.filter(d => d && String(d).trim().length > 0)
      };
      
      addDictionaryEntry(dict, entry);
      continue;
    }
    
    // Try format without jyutping: Traditional Simplified [pinyin] /def1/def2/
    match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/$/);
    if (match) {
      const [, traditional, simplified, pinyin, definitions] = match;
      const defs = definitions.split('/').filter(d => d.trim().length > 0);
      
      const entry: DictionaryEntry = {
        traditional,
        simplified,
        romanisation: pinyin || '', // For entries without jyutping, use pinyin
        definitions: defs.filter(d => d && String(d).trim().length > 0)
      };
      
      addDictionaryEntry(dict, entry);
      continue;
    }
    
    // Try format with jyutping but no definitions: Traditional Simplified [pinyin] {jyutping}
    match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\{([^}]+)\}$/);
    if (match) {
      const [, traditional, simplified, pinyin, jyutping] = match;
      
      const entry: DictionaryEntry = {
        traditional,
        simplified,
        romanisation: jyutping || pinyin || '', // Prefer jyutping for Cantonese, fallback to pinyin
        definitions: []
      };
      
      addDictionaryEntry(dict, entry);
    }
  }
  
  return dict;
}
