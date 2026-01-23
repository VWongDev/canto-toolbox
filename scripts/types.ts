/**
 * Dictionary entry structure
 */
export interface DictionaryEntry {
  traditional: string;
  simplified: string;
  pinyin: string;
  jyutping: string;
  definitions: string[];
}

/**
 * Dictionary structure: word -> array of entries
 */
export type Dictionary = Record<string, DictionaryEntry[]>;
