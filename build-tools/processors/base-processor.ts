import type { Dictionary } from '../../src/types.js';

export interface DictionaryProcessor {
  process(): Dictionary;
}
