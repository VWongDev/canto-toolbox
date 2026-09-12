import { sendMessage } from '../shared/message-manager.js';
import type { CaptureTabResponse, ErrorResponse, OcrImageResponse } from '../shared/types.js';

export interface OcrClient {
  readImage(src: string, callback: (r: OcrImageResponse | ErrorResponse) => void): void;
  captureTab(callback: (r: CaptureTabResponse | ErrorResponse) => void): void;
}

export class OcrMessageClient implements OcrClient {
  readImage(src: string, callback: (r: OcrImageResponse | ErrorResponse) => void): void {
    sendMessage({ type: 'ocr_image', src }, callback);
  }

  captureTab(callback: (r: CaptureTabResponse | ErrorResponse) => void): void {
    sendMessage({ type: 'capture_tab' }, callback);
  }
}

export const ocrClient = new OcrMessageClient();
