import type { Dictionary } from '../../src/shared/types.js';

export interface DictionaryProcessor {
  process(): Dictionary;
}
