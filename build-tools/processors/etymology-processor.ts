import { readFileSync } from 'fs';
import { join } from 'path';
import { getRootDir } from './utils.js';
import type { EtymologyDictionary, CharacterEtymology, EtymologyType } from '../../src/shared/types.js';

interface RawEtymologyEntry {
  character: string;
  definition?: string;
  decomposition: string;
  radical: string;
  etymology?: {
    type: string;
    hint?: string;
    phonetic?: string;
    semantic?: string;
  };
}

function isValidEtymologyType(type: string): type is EtymologyType {
  return type === 'pictophonetic' || type === 'ideographic' || type === 'pictographic';
}

export async function processEtymologyDict(): Promise<EtymologyDictionary> {
  const dict: EtymologyDictionary = {};

  const filePath = join(getRootDir(), 'dictionaries/makemeahanzi/dictionary.txt');
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  for (const line of lines) {
    try {
      const raw = JSON.parse(line) as RawEtymologyEntry;

      // Skip entries without basic required fields
      if (!raw.character || !raw.decomposition || !raw.radical) {
        continue;
      }

      const entry: CharacterEtymology = {
        character: raw.character,
        decomposition: raw.decomposition,
        radical: raw.radical,
        ...(raw.definition ? { definition: raw.definition } : {})
      };

      // Add etymology fields if present and valid
      if (raw.etymology) {
        if (isValidEtymologyType(raw.etymology.type)) {
          entry.etymologyType = raw.etymology.type;
        }
        if (raw.etymology.hint) {
          entry.hint = raw.etymology.hint;
        }
        if (raw.etymology.phonetic) {
          entry.phonetic = raw.etymology.phonetic;
        }
        if (raw.etymology.semantic) {
          entry.semantic = raw.etymology.semantic;
        }
      }

      dict[raw.character] = entry;
    } catch (error) {
      console.warn('[Build] Skipping invalid etymology line:', error);
      continue;
    }
  }

  console.log(`[Build] Loaded Etymology dictionary: ${Object.keys(dict).length} entries`);
  return dict;
}
