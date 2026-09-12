import { registerHandlers } from '../shared/message-router.js';
import { sendMessage } from '../shared/message-manager.js';
import type { OcrResult } from '../shared/types.js';

const OFFSCREEN_PATH = 'src/ocr/offscreen.html';

/**
 * Chrome allows one offscreen document per extension and rejects a second
 * `createDocument`, so creation is funnelled through a single promise rather
 * than raced by two images clicked at once.
 */
let creating: Promise<void> | null = null;

async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)],
  });
  return contexts.length > 0;
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return;

  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Runs the WebAssembly OCR model that reads Chinese text in images.',
    })
    .finally(() => {
      creating = null;
    });

  await creating;
}

function runInOffscreen(src: string): Promise<OcrResult> {
  return new Promise((resolve, reject) => {
    sendMessage({ type: 'ocr_run', src }, (response) => {
      if (!response.success) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.result);
    });
  });
}

export function register(): void {
  registerHandlers({
    /**
     * The service worker cannot run the model itself — it has no DOM and is
     * torn down on idle, which would discard several megabytes of loaded
     * weights between one image and the next. It starts the offscreen document
     * that can, and forwards.
     */
    ocr_image: async (msg) => {
      await ensureOffscreenDocument();
      return { success: true, type: 'ocr_image', result: await runInOffscreen(msg.src) };
    },
  });
}
