// Type declarations for generated dictionary data files.
// These files are created by `pnpm build:dict` and are not committed to the
// repository. These declarations let `pnpm typecheck` succeed in CI without
// running the full build first.

declare module '*/data/mandarin.json' {
  import type { Dictionary } from '../shared/types';
  const value: Dictionary;
  export default value;
}

declare module '*/data/cantonese.json' {
  import type { Dictionary } from '../shared/types';
  const value: Dictionary;
  export default value;
}

declare module '*/data/etymology.json' {
  import type { EtymologyDictionary } from '../shared/types';
  const value: EtymologyDictionary;
  export default value;
}
