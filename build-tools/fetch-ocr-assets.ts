#!/usr/bin/env node
// fetch-ocr-assets.ts - Vendor the OCR models and ONNX runtime into public/ocr/

import { createHash } from 'crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

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
 * The only ONNX runtime artefact that has to sit on disk. `onnxruntime-web`'s
 * bundled entry inlines its own JavaScript glue but still loads this
 * separately, and the plain SIMD build is the one to ship: the jsep and
 * asyncify variants cost 12-14 MB more for a WebGPU path an extension page
 * cannot reach without cross-origin isolation.
 */
const ORT_WASM = 'ort-wasm-simd-threaded.wasm';

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fetchModel(url: string, expected: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = digest(bytes);
  if (expected && actual !== expected) {
    throw new Error(`${url} digest mismatch: expected ${expected}, got ${actual}`);
  }

  return bytes;
}

async function fetchOcrAssets(): Promise<void> {
  console.log('[OCR] Vendoring OCR assets...');

  const modelDir = join(rootDir, 'public/ocr/models');
  const runtimeDir = join(rootDir, 'public/ocr/ort');
  for (const dir of [modelDir, runtimeDir]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  const unpinned: string[] = [];

  await Promise.all(
    MODELS.map(async ({ file, url, sha256 }) => {
      const target = join(modelDir, file);
      if (existsSync(target) && (!sha256 || digest(readFileSync(target)) === sha256)) {
        console.log(`[OCR] Cached ${file}`);
        return;
      }

      const bytes = await fetchModel(url, sha256);
      writeFileSync(target, bytes);
      if (!sha256) unpinned.push(`  ${file}: '${digest(bytes)}'`);
      console.log(`[OCR] Fetched ${file} (${(bytes.length / 1e6).toFixed(2)} MB)`);
    }),
  );

  const wasmSource = join(rootDir, 'node_modules/onnxruntime-web/dist', ORT_WASM);
  if (!existsSync(wasmSource)) {
    throw new Error(`${ORT_WASM} is missing — run pnpm install first`);
  }
  copyFileSync(wasmSource, join(runtimeDir, ORT_WASM));
  console.log(`[OCR] Copied ${ORT_WASM}`);

  if (unpinned.length > 0) {
    console.warn(`[OCR] Unpinned downloads — add these digests to MODELS:\n${unpinned.join('\n')}`);
  }

  console.log('[OCR] OCR assets ready.');
}

void fetchOcrAssets();
