#!/usr/bin/env node
// fetch-ocr-assets.ts - Vendor the OCR models and ONNX runtime into public/ocr/

import { createHash } from 'crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, __dirname.includes('dist') ? '../../..' : '../..');

const MODEL_BASE_URL = 'https://huggingface.co/snowfluke/ppu-paddle-ocr-models/resolve/main';

/**
 * PP-OCRv6 tiny. Its 6,174-character dictionary reads every one of the 5,000
 * commonest SUBTLEX-CH words and 99.86% of the 20,000 the frequency data is
 * capped at, so the small tier's extra 25 MB buys only the words the extension
 * already calls "rare".
 *
 * Digests are pinned: these are model weights fetched over the network at
 * build time, and a silent substitution upstream would ship as an extension
 * update nobody reviewed.
 */
const MODELS = [
  {
    file: 'PP-OCRv6_tiny_det.ort',
    url: `${MODEL_BASE_URL}/detection/ort/PP-OCRv6_tiny_det.ort`,
    sha256: '2816e82d26a09d6af722492f80f3059d458377c084eca88f34d84ddf9b385580',
  },
  {
    file: 'PP-OCRv6_tiny_rec.ort',
    url: `${MODEL_BASE_URL}/recognition/ort/PP-OCRv6_tiny_rec.ort`,
    sha256: 'efc46adf1bde1e05b58748268abb0e71791bfa8616c435676bbca13d1ea47767',
  },
  {
    file: 'ppocrv6_tiny_dict.txt',
    url: `${MODEL_BASE_URL}/recognition/ppocrv6_tiny_dict.txt`,
    sha256: '2f3717bbd530b681b6db3be35cc485e8a41a932b9558b833986bf0894eb21f2d',
  },
];

/**
 * The ONNX runtime artefacts that have to sit on disk. The build is aliased to
 * onnxruntime-web's extern-wasm entry (see vite.config.ts), which loads both of
 * these from `wasmPaths` at run time rather than having Rollup emit them. The
 * plain SIMD binary is the one to ship: the jsep and asyncify variants cost
 * 12-14 MB more for a WebGPU path this extension does not ask for.
 */
const ORT_RUNTIME = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'];

/**
 * Hugging Face rate-limits anonymous downloads per source address, and every
 * CI runner shares a pool of them — so a 429 here says nothing about this
 * build and everything about the neighbours. Retry it.
 */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
export const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 2000;

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** How long to wait before attempt `n`, preferring the server's own answer. */
export function backoffMs(attempt: number, retryAfter: string | null): number {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;

  // Exponential, with jitter so parallel builds do not retry in lockstep.
  return BACKOFF_BASE_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 1000);
}

export async function fetchModel(url: string, expected: string): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url);

    if (!response.ok) {
      const retryable = RETRYABLE_STATUSES.has(response.status);
      if (!retryable || attempt === MAX_ATTEMPTS) {
        throw new Error(`${url} returned ${response.status} ${response.statusText}`);
      }

      const wait = backoffMs(attempt, response.headers.get('retry-after'));
      console.warn(
        `[OCR] ${response.status} on ${url} — retrying in ${Math.round(wait / 1000)}s ` +
          `(attempt ${attempt} of ${MAX_ATTEMPTS})`,
      );
      await sleep(wait);
      continue;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const actual = digest(bytes);
    // A digest mismatch is never retried: the bytes arrived intact and are the
    // wrong bytes, which is the case this check exists to stop.
    if (expected && actual !== expected) {
      throw new Error(`${url} digest mismatch: expected ${expected}, got ${actual}`);
    }

    return bytes;
  }
}

async function fetchOcrAssets(): Promise<void> {
  console.log('[OCR] Vendoring OCR assets...');

  const modelDir = join(rootDir, 'public/ocr/models');
  const runtimeDir = join(rootDir, 'public/ocr/ort');
  for (const dir of [modelDir, runtimeDir]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  const unpinned: string[] = [];

  // One at a time. Three files is not worth parallelising, and three
  // simultaneous requests are what trips the rate limit in the first place.
  for (const { file, url, sha256 } of MODELS) {
    const target = join(modelDir, file);
    if (existsSync(target) && (!sha256 || digest(readFileSync(target)) === sha256)) {
      console.log(`[OCR] Cached ${file}`);
      continue;
    }

    const bytes = await fetchModel(url, sha256);
    writeFileSync(target, bytes);
    if (!sha256) unpinned.push(`  ${file}: '${digest(bytes)}'`);
    console.log(`[OCR] Fetched ${file} (${(bytes.length / 1e6).toFixed(2)} MB)`);
  }

  for (const file of ORT_RUNTIME) {
    const source = join(rootDir, 'node_modules/onnxruntime-web/dist', file);
    if (!existsSync(source)) {
      throw new Error(`${file} is missing — run pnpm install first`);
    }
    copyFileSync(source, join(runtimeDir, file));
    console.log(`[OCR] Copied ${file}`);
  }

  if (unpinned.length > 0) {
    console.warn(`[OCR] Unpinned downloads — add these digests to MODELS:\n${unpinned.join('\n')}`);
  }

  console.log('[OCR] OCR assets ready.');
}

// Only when run as a script. Importing it — as the tests do — must not start
// downloading several megabytes of model.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void fetchOcrAssets();
}
