import { sendMessage } from '../shared/message-manager.js';
import type { StatisticsResponse, LookupResponse, ErrorResponse, FlashcardRating, UpdateFlashcardResponse } from '../shared/types.js';

export interface FlashcardClient {
  getStatistics(callback: (r: StatisticsResponse | ErrorResponse) => void): void;
  lookupWord(word: string, callback: (r: LookupResponse | ErrorResponse) => void): void;
  updateFlashcard(word: string, rating: FlashcardRating, callback: (r: UpdateFlashcardResponse | ErrorResponse) => void): void;
}

export class FlashcardMessageClient implements FlashcardClient {
  getStatistics(callback: (r: StatisticsResponse | ErrorResponse) => void): void {
    sendMessage({ type: 'get_statistics' }, callback);
  }

  lookupWord(word: string, callback: (r: LookupResponse | ErrorResponse) => void): void {
    sendMessage({ type: 'lookup_word', word }, callback);
  }

  updateFlashcard(word: string, rating: FlashcardRating, callback: (r: UpdateFlashcardResponse | ErrorResponse) => void): void {
    sendMessage({ type: 'update_flashcard', word, rating }, callback);
  }
}

export const flashcardClient = new FlashcardMessageClient();
