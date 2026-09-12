import { sendMessage } from '../shared/message-manager.js';
import type { ErrorResponse, OcrImageResponse } from '../shared/types.js';

export interface OcrClient {
  readImage(src: string, callback: (r: OcrImageResponse | ErrorResponse) => void): void;
}

export class OcrMessageClient implements OcrClient {
  readImage(src: string, callback: (r: OcrImageResponse | ErrorResponse) => void): void {
    sendMessage({ type: 'ocr_image', src }, callback);
  }
}

export const ocrClient = new OcrMessageClient();
