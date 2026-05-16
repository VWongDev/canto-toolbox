import { sendMessage } from '../shared/message-manager.js';
import type { LookupResponse, TrackWordResponse, ErrorResponse } from '../shared/types.js';

export interface PopupClient {
  lookupWord(word: string, callback: (r: LookupResponse | ErrorResponse) => void): void;
  trackWord(word: string, callback: (r: TrackWordResponse | ErrorResponse) => void): void;
}

export class PopupMessageClient implements PopupClient {
  lookupWord(word: string, callback: (r: LookupResponse | ErrorResponse) => void): void {
    sendMessage({ type: 'lookup_word', word }, callback);
  }

  trackWord(word: string, callback: (r: TrackWordResponse | ErrorResponse) => void): void {
    sendMessage({ type: 'track_word', word }, callback);
  }
}

export const popupClient = new PopupMessageClient();
