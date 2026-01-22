// Type definitions for the extension

export interface DictionaryEntry {
  traditional: string;
  simplified: string;
  pinyin: string;
  jyutping: string;
  definitions: string[];
}

export type Dictionary = Record<string, DictionaryEntry[]>;

export interface WordStatistics {
  count: number;
  firstSeen: number;
  lastSeen: number;
}

export interface Statistics {
  [word: string]: WordStatistics;
}

export interface DefinitionResult {
  word: string;
  mandarin: {
    definition: string;
    pinyin: string;
    entries?: DictionaryEntry[];
  };
  cantonese: {
    definition: string;
    jyutping: string;
    entries?: DictionaryEntry[];
  };
}

export interface LookupMessage {
  type: 'lookup_word';
  word: string;
}

export interface TrackWordMessage {
  type: 'track_word';
  word: string;
}

export interface GetStatisticsMessage {
  type: 'get_statistics';
}

export type BackgroundMessage = LookupMessage | TrackWordMessage | GetStatisticsMessage;

export interface LookupResponse {
  success: true;
  definition: DefinitionResult;
}

export interface ErrorResponse {
  success: false;
  error: string;
  errorName?: string;
}

export interface StatisticsResponse {
  success: true;
  statistics: Statistics;
}

export interface TrackWordResponse {
  success: true;
}

export type BackgroundResponse = LookupResponse | ErrorResponse | StatisticsResponse | TrackWordResponse;

