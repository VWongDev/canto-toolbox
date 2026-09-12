import { sendMessage } from '../shared/message-manager.js';
import type { StatisticsResponse, LookupResponse, ErrorResponse, FlashcardRating, ReviewDirection, SetWordStatusResponse, UpdateFlashcardResponse, WordStatus } from '../shared/types.js';

export interface FlashcardClient {
  getStatistics(callback: (r: StatisticsResponse | ErrorResponse) => void): void;
  lookupWord(word: string, callback: (r: LookupResponse | ErrorResponse) => void): void;
  updateFlashcard(
    word: string,
    rating: FlashcardRating,
    direction: ReviewDirection,
    callback: (r: UpdateFlashcardResponse | ErrorResponse) => void,
  ): void;
  setWordStatus(
    word: string,
    status: WordStatus,
    callback: (r: SetWordStatusResponse | ErrorResponse) => void,
  ): void;
}

export class FlashcardMessageClient implements FlashcardClient {
  getStatistics(callback: (r: StatisticsResponse | ErrorResponse) => void): void {
    sendMessage({ type: 'get_statistics' }, callback);
  }

  lookupWord(word: string, callback: (r: LookupResponse | ErrorResponse) => void): void {
    sendMessage({ type: 'lookup_word', word }, callback);
  }

  updateFlashcard(
    word: string,
    rating: FlashcardRating,
    direction: ReviewDirection,
    callback: (r: UpdateFlashcardResponse | ErrorResponse) => void,
  ): void {
    sendMessage({ type: 'update_flashcard', word, rating, direction }, callback);
  }

  setWordStatus(
    word: string,
    status: WordStatus,
    callback: (r: SetWordStatusResponse | ErrorResponse) => void,
  ): void {
    sendMessage({ type: 'set_word_status', word, ...status }, callback);
  }
}

export const flashcardClient = new FlashcardMessageClient();
