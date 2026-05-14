import { sendMessage } from '../shared/message-manager.js';
import type { StatisticsResponse, LookupResponse, ErrorResponse } from '../shared/types.js';

export interface FlashcardClient {
  getStatistics(callback: (r: StatisticsResponse | ErrorResponse) => void): void;
  lookupWord(word: string, callback: (r: LookupResponse | ErrorResponse) => void): void;
}

export class FlashcardMessageClient implements FlashcardClient {
  getStatistics(callback: (r: StatisticsResponse | ErrorResponse) => void): void {
    sendMessage(
      { type: 'get_statistics' },
      (r) => (r as { type?: string } | undefined)?.type === 'get_statistics',
      'Failed to get statistics',
      callback
    );
  }

  lookupWord(word: string, callback: (r: LookupResponse | ErrorResponse) => void): void {
    sendMessage(
      { type: 'lookup_word', word },
      (r) => (r as { type?: string } | undefined)?.type === 'lookup_word',
      'Lookup failed',
      callback
    );
  }
}

export const flashcardClient = new FlashcardMessageClient();
