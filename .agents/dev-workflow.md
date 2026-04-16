# Dev Workflow

## Prerequisites

The repo includes a `flake.nix`. With Nix installed, run:

```sh
nix develop
```

This drops you into a shell with the correct Node.js and pnpm versions already available. No manual version management needed.

Without Nix, install manually:
- Node.js >= 18
- pnpm >= 8 (use `pnpm@8.15.0` as specified in `packageManager`)

Either way, initialize git submodules before building:

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
2. `node build-tools/dist/build-tools/build-dictionaries.js` — processes raw dictionary submodule data into `src/data/mandarin.json` and `src/data/cantonese.json`
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

Removes `dist/`, `src/data/`, and `build-tools/dist/`.

## Loading the Extension in Chrome

1. Run `pnpm build`
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** → select the `dist/` directory
5. The extension is now active — hover over Chinese text on any webpage to test

After code changes, rebuild and click the **reload** button on the extension card in `chrome://extensions`.

## Type Checking

Run type checking without a full build:

```sh
pnpm typecheck
```

This runs `tsc --noEmit` against all source files in `src/` and `build-tools/`. Use this to verify changes quickly before committing — it's much faster than `pnpm build`.

## Testing

There are no automated tests for the extension itself. Verification is manual:

1. Build and load the extension (see above)
2. Navigate to a page with Chinese text
3. Hover over Chinese characters — a popup should appear with Mandarin/Cantonese definitions
4. Open the Stats page via the extension popup to verify statistics are being tracked

### Screenshot generation

Used for release assets, not for testing:

```sh
pnpm screenshots
```

Requires a full build first and uses Puppeteer to capture the extension UI.

## Key Build Gotchas

- **Dictionary submodules must be initialized** before `pnpm build:dict` will work. If `src/data/` is empty or missing, run `git submodule update --init --recursive`.
- **Memory limit is required** for the Vite build step because dictionary JSON files are large. The `pnpm build` script sets this automatically; manual `vite build` calls need `NODE_OPTIONS=--max-old-space-size=8192`.
- **`src/data/` is generated** — do not manually edit `mandarin.json` or `cantonese.json`. Changes belong in `build-tools/processors/`.
- **`build-tools/dist/` is also generated** — if build tool scripts behave unexpectedly, run `pnpm clean` and rebuild from scratch.
