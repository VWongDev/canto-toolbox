/**
 * Dictionary entry structure
 */
export interface DictionaryEntry {
  traditional: string;
  simplified: string;
  romanisation: string; // Pinyin for Mandarin, Jyutping for Cantonese
  definitions: string[];
  // Legacy fields for backward compatibility (deprecated, use romanisation instead)
  /** @deprecated Use romanisation instead */
  pinyin?: string;
  /** @deprecated Use romanisation instead */
  jyutping?: string;
}

/**
 * Dictionary structure: word -> array of entries
 */
export type Dictionary = Record<string, DictionaryEntry[]>;
