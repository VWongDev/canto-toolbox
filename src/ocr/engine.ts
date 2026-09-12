import * as ort from 'onnxruntime-web';
import { PaddleOcrService } from 'ppu-paddle-ocr/web';
import type { OcrItem, OcrResult } from '../shared/types.js';

/**
 * Recognised text shorter than this is noise — a speck of dust or a logo edge
 * that the detector boxed and the recogniser guessed at. Dropping it keeps the
 * overlay from scattering unhoverable slivers over the image.
 */
const MIN_CONFIDENCE = 0.5;

function assetUrl(path: string): string {
  return chrome.runtime.getURL(`ocr/${path}`);
}

/**
 * Everything the engine needs is packaged with the extension, so nothing is
 * fetched from a CDN at runtime — the extension stays as network-silent as the
 * dictionaries it already ships.
 *
 * This has to overwrite rather than fill in: ppu-paddle-ocr points `wasmPaths`
 * at jsDelivr from its own module body, which runs when it is imported, before
 * anything here does.
 */
function configureRuntime(): void {
  ort.env.wasm.wasmPaths = assetUrl('ort/');
  // Threads need SharedArrayBuffer, which an extension page does not get
  // without cross-origin isolation. Saying so up front stops the runtime
  // probing for a thread pool it cannot have.
  ort.env.wasm.numThreads = 1;
  ort.env.logLevel = 'error';
}

let service: Promise<PaddleOcrService> | null = null;

/**
 * The loaded engine, started on the first call and shared by every later one.
 * Loading costs several megabytes of model, so the offscreen document holds it
 * warm rather than paying that per image.
 */
function engine(): Promise<PaddleOcrService> {
  if (!service) {
    configureRuntime();
    const started = new PaddleOcrService({
      model: {
        detection: assetUrl('models/PP-OCRv6_tiny_det.ort'),
        recognition: assetUrl('models/PP-OCRv6_tiny_rec.ort'),
        charactersDictionary: assetUrl('models/ppocrv6_tiny_dict.txt'),
      },
      session: { executionProviders: ['wasm'] },
    });

    service = started.initialize().then(() => started).catch((error: unknown) => {
      // A failed load must not poison every later attempt.
      service = null;
      throw error;
    });
  }

  return service;
}

export async function recognise(src: string): Promise<OcrResult> {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Could not read the image (${response.status})`);
  }

  const bytes = await response.arrayBuffer();
  const bitmap = await createImageBitmap(new Blob([bytes]));
  const { width, height } = bitmap;
  bitmap.close();

  const ocr = await engine();
  const recognised = await ocr.recognize(bytes, { flatten: true });

  const items: OcrItem[] = recognised.results
    .filter((result) => result.confidence >= MIN_CONFIDENCE && result.text.trim().length > 0)
    .map((result) => ({ text: result.text, box: result.box }));

  return { width, height, items };
}
