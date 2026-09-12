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

    /**
     * Only the worker can screenshot a tab, and only for a frame the content
     * script was not allowed to draw itself. The visible tab is the right one
     * by construction: this is answering a badge the reader just clicked.
     */
    capture_tab: async () => {
      const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
      return { success: true, type: 'capture_tab', dataUrl };
    },
  });
}
