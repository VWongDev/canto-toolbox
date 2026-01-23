import type { Dictionary } from '../types.js';

/**
 * Base interface for dictionary processors
 */
export interface DictionaryProcessor {
  process(): Dictionary;
}
