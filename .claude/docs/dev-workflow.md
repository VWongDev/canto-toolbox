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

The build is a three-phase pipeline:

```
build:scripts → build:dict → build:ocr → vite build
```

### Full build

```sh
pnpm build
```

This runs:
1. `tsc -p build-tools/tsconfig.json` — compiles build-tool scripts to `build-tools/dist/`
2. `node build-tools/dist/build-tools/build-dictionaries.js` — processes raw dictionary submodule data into `public/data/{mandarin,cantonese,etymology,frequency}.json`
3. `node build-tools/dist/build-tools/fetch-ocr-assets.js` — downloads the pinned PP-OCRv6 tiny model and copies the ONNX runtime into `public/ocr/`
4. `vite build` — bundles the extension into `dist/` (requires `--max-old-space-size=8192` due to large dictionary imports)

Output goes to `dist/`. This directory is the unpacked Chrome extension, about
78 MB — 58 MB of dictionaries and 20 MB of OCR assets.

### Incremental builds

If you only changed extension source (`src/`), skip dictionary and OCR asset
processing:

```sh
NODE_OPTIONS=--max-old-space-size=8192 vite build
```

The OCR assets only need re-fetching when `fetch-ocr-assets.ts` changes or
`public/ocr/` has been cleaned — `pnpm build:ocr` re-verifies the digests of
what is already there and downloads nothing otherwise.

If you changed `build-tools/` but not dictionaries:

```sh
pnpm build:scripts && NODE_OPTIONS=--max-old-space-size=8192 vite build
```

### Clean

```sh
pnpm clean
```

Removes `dist/`, the generated JSON in `public/data/`, `public/ocr/`, and
`build-tools/dist/`.

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
- **A raised memory limit may be needed** for the Vite build step, because the dictionary JSON files are large. `pnpm build` does *not* set it — CI passes `NODE_OPTIONS=--max-old-space-size=8192` explicitly, and so should a local build that runs out of heap.
- **`public/data/` is generated** — do not manually edit `mandarin.json`, `cantonese.json`, `etymology.json` or `frequency.json`. Changes belong in `build-tools/processors/`.
- **`public/ocr/` is generated too** — the models come from Hugging Face with pinned SHA-256 digests, so `pnpm build:ocr` needs network access the first time and fails loudly if a file has changed upstream. To move to a different model, update the URLs *and* the digests in `build-tools/fetch-ocr-assets.ts`.
- **`onnxruntime-web` is aliased in `vite.config.ts`** to its extern-wasm entry. Removing the alias makes Rollup emit two ORT binaries (14 MB and 28 MB) into `dist/assets/` alongside the copy in `public/ocr/`, and splits the runtime into two instances so `ort.env` settings stop reaching the one doing the work.
- **`build-tools/dist/` is also generated** — if build tool scripts behave unexpectedly, run `pnpm clean` and rebuild from scratch.
