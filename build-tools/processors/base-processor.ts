import type { Dictionary } from '../../src/types.js';

/**
 * Base interface for dictionary processors
 */
export interface DictionaryProcessor {
  process(): Dictionary;
}
