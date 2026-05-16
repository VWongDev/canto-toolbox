import { sendMessage } from '../shared/message-manager.js';
import type { StatisticsResponse, LookupResponse, ErrorResponse } from '../shared/types.js';

export interface StatsClient {
  getStatistics(callback: (r: StatisticsResponse | ErrorResponse) => void): void;
  lookupWord(word: string, callback: (r: LookupResponse | ErrorResponse) => void): void;
}

export class StatsMessageClient implements StatsClient {
  getStatistics(callback: (r: StatisticsResponse | ErrorResponse) => void): void {
    sendMessage({ type: 'get_statistics' }, callback);
  }

  lookupWord(word: string, callback: (r: LookupResponse | ErrorResponse) => void): void {
    sendMessage({ type: 'lookup_word', word }, callback);
  }
}

export const statsClient = new StatsMessageClient();
