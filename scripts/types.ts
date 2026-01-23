/**
 * Dictionary entry structure
 */
export interface DictionaryEntry {
  traditional: string;
  simplified: string;
  romanisation: string; // Pinyin for Mandarin, Jyutping for Cantonese
  definitions: string[];
}

/**
 * Dictionary structure: word -> array of entries
 */
export type Dictionary = Record<string, DictionaryEntry[]>;
