import { sendMessage } from '../shared/message-manager.js';
import type {
  HoverSegment,
  LookupResponse,
  TrackWordResponse,
  ErrorResponse,
} from '../shared/types.js';

export interface PopupClient {
  lookupWord(
    word: string,
    callback: (r: LookupResponse | ErrorResponse) => void,
    segment?: HoverSegment,
  ): void;
  trackWord(
    word: string,
    callback: (r: TrackWordResponse | ErrorResponse) => void,
    context?: string,
  ): void;
  /** Track the word and add it to the deck outright, skipping the exposure gate. */
  pinWord(
    word: string,
    callback: (r: TrackWordResponse | ErrorResponse) => void,
    context?: string,
  ): void;
}

export class PopupMessageClient implements PopupClient {
  lookupWord(
    word: string,
    callback: (r: LookupResponse | ErrorResponse) => void,
    segment?: HoverSegment,
  ): void {
    sendMessage({ type: 'lookup_word', word, ...(segment && { segment }) }, callback);
  }

  trackWord(
    word: string,
    callback: (r: TrackWordResponse | ErrorResponse) => void,
    context?: string,
  ): void {
    sendMessage({ type: 'track_word', word, ...(context && { context }) }, callback);
  }

  pinWord(
    word: string,
    callback: (r: TrackWordResponse | ErrorResponse) => void,
    context?: string,
  ): void {
    sendMessage({ type: 'track_word', word, pin: true, ...(context && { context }) }, callback);
  }
}

export const popupClient = new PopupMessageClient();
