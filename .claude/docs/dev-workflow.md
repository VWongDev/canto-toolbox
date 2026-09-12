# Dev Workflow

## Prerequisites

The repo includes a `flake.nix`. With Nix installed, run:

```sh
nix develop
```

This drops you into a shell with the correct Node.js and pnpm versions already available. No manual version management needed.

Without Nix, install manually:
- Node.js >= 22 (`engines` floor); the dev shell pins `nodejs_24` and CI uses 24
- pnpm >= 8 (use `pnpm@8.15.0` as specified in `packageManager`)

Either way, initialize submodules before building:

```sh
git submodule update --init --recursive
```

## Build

The build is a two-phase pipeline:

```
build:scripts → build:dict → vite build
```

### Full build

```sh
pnpm build
```

This runs:
1. `tsc -p build-tools/tsconfig.json` — compiles build-tool scripts to `build-tools/dist/`
2. `node build-tools/dist/build-tools/build-dictionaries.js` — processes raw dictionary submodule data into `public/data/{mandarin,cantonese,etymology,frequency}.json`
3. `vite build` — bundles the extension into `dist/` (requires `--max-old-space-size=8192` due to large dictionary imports)

Output goes to `dist/`. This directory is the unpacked Chrome extension.

### Incremental builds

If you only changed extension source (`src/`), skip dictionary processing:

```sh
NODE_OPTIONS=--max-old-space-size=8192 vite build
```

If you changed `build-tools/` but not dictionaries:

```sh
pnpm build:scripts && NODE_OPTIONS=--max-old-space-size=8192 vite build
```

### Clean

```sh
pnpm clean
```

Removes `dist/`, the generated JSON in `public/data/`, and `build-tools/dist/`.

## Loading the Extension in Chrome

1. Run `pnpm build`
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** → select the `dist/` directory
5. The extension is now active — hover over Chinese text on any webpage to test

After code changes, rebuild and click the **reload** button on the extension card in `chrome://extensions`.

## Linting

```sh
pnpm lint
```

Runs ESLint (flat config in `eslint.config.js`, `typescript-eslint`) across
`src/` and `build-tools/`. Use `_`-prefixed parameter names to suppress
unused-arg warnings (e.g. `_event`).

## Type Checking

Run type checking without a full build:

```sh
pnpm typecheck
```

This runs `tsc --noEmit` against all source files in `src/` and `build-tools/`. Use this to verify changes quickly before committing — it's much faster than `pnpm build`.

## Testing

The extension has automated coverage. See @.claude/docs/testing.md for the full
guide.

```sh
pnpm test       # Vitest unit/integration suite
pnpm test:e2e   # Playwright end-to-end (build the extension first)
```

Unit tests live in `__tests__/` directories beside their source. E2E specs are
in `e2e/`. CI runs both. Manual verification in Chrome is an optional sanity
check for UI-heavy changes (load the unpacked `dist/`, hover Chinese text, open
the Stats page).

## Commit Hooks

Husky installs two hooks (via the `prepare` script):

- **`pre-commit`** — runs `pnpm lint && pnpm typecheck && pnpm test`. It first
  checks that `pnpm` is on `PATH`, so committing from outside the Nix dev shell
  fails with a pointer to `nix develop` rather than a confusing error.
- **`commit-msg`** — validates the message against `type(domain): Description`.
  See @.claude/docs/git-conventions.md.

## Benchmarking

```sh
pnpm bench
```

Compiles the build tools and runs `build-tools/benchmark.ts` against the
generated `public/data/*.json`, failing if p99 lookup time exceeds its
threshold. CI runs this as a separate `perf` job, so an algorithmic regression
in the lookup path is caught on every push.

### Screenshot generation

Used for release assets, not for testing:

```sh
pnpm screenshots
```

Requires a full build first and uses Puppeteer to capture the extension UI. The
release workflow runs it under `xvfb` when cutting a version.

## Key Build Gotchas

- **Dictionary submodules must be initialized** before `pnpm build:dict` will work. If `public/data/` holds only `radicals.json`, run `git submodule update --init --recursive`.
- **Memory limit is required** for the Vite build step because dictionary JSON files are large. The `pnpm build` script sets this automatically; manual `vite build` calls need `NODE_OPTIONS=--max-old-space-size=8192`.
- **`public/data/` is generated** — do not manually edit `mandarin.json`, `cantonese.json`, `etymology.json` or `frequency.json`. Changes belong in `build-tools/processors/`.
- **`build-tools/dist/` is also generated** — if build tool scripts behave unexpectedly, run `pnpm clean` and rebuild from scratch.
