import { registerHandlers } from '../shared/message-router.js';
import { sendMessage } from '../shared/message-manager.js';
import { ensureOffscreenDocument } from '../shared/offscreen-document.js';
import type { OcrResult } from '../shared/types.js';

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
