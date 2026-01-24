import { addDictionaryEntry } from './utils.js';
import type { Dictionary, DictionaryEntry } from '../../src/types.js';

function isCommentOrEmpty(line: string): boolean {
  return !line || line.startsWith('#') || line.trim().length === 0;
}

function parseDefinitions(definitionsStr: string): string[] {
  return definitionsStr.split('/').filter(d => d.trim().length > 0);
}

function createEntry(traditional: string, simplified: string, pinyin: string, jyutping: string, definitions: string[]): DictionaryEntry {
  return {
    traditional,
    simplified,
    romanisation: jyutping || pinyin || '',
    definitions: definitions.filter(d => d && String(d).trim().length > 0)
  };
}

function parseLineWithDefinitionsAndJyutping(line: string): DictionaryEntry | null {
  const match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\{([^}]+)\}\s+\/(.+)\//);
  if (!match) return null;
  
  const [, traditional, simplified, pinyin, jyutping, definitions] = match;
  const defs = parseDefinitions(definitions);
  return createEntry(traditional, simplified, pinyin, jyutping, defs);
}

function parseLineWithDefinitionsOnly(line: string): DictionaryEntry | null {
  const match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\//);
  if (!match) return null;
  
  const [, traditional, simplified, pinyin, definitions] = match;
  const defs = parseDefinitions(definitions);
  return createEntry(traditional, simplified, pinyin, '', defs);
}

function parseLineWithJyutpingOnly(line: string): DictionaryEntry | null {
  const match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\{([^}]+)\}$/);
  if (!match) return null;
  
  const [, traditional, simplified, pinyin, jyutping] = match;
  return createEntry(traditional, simplified, pinyin, jyutping, []);
}

export function parseCedictFormat(text: string): Dictionary {
  const dict: Dictionary = {};
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (isCommentOrEmpty(line)) {
      continue;
    }
    
    const entry = parseLineWithDefinitionsAndJyutping(line) ||
                  parseLineWithDefinitionsOnly(line) ||
                  parseLineWithJyutpingOnly(line);
    
    if (entry) {
      addDictionaryEntry(dict, entry);
    }
  }
  
  return dict;
}
