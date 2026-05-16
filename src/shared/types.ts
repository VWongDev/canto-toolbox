// Type definitions for the extension

export type EtymologyType = 'pictophonetic' | 'ideographic' | 'pictographic';

export interface CharacterEtymology {
  character: string;
  definition?: string;
  decomposition: string;
  radical: string;
  etymologyType?: EtymologyType;
  hint?: string;
  phonetic?: string;
  semantic?: string;
  componentDefinitions?: Record<string, string>;
}

export type EtymologyDictionary = Record<string, CharacterEtymology>;

export interface DictionaryEntry {
  traditional: string;
  simplified: string;
  romanisation: string; // Pinyin for Mandarin, Jyutping for Cantonese
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
    entries: DictionaryEntry[];
  };
  cantonese: {
    entries: DictionaryEntry[];
  };
  etymology?: CharacterEtymology[];
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
  type: 'lookup_word';
  definition: DefinitionResult;
}

export interface ErrorResponse {
  success: false;
  error: string;
  errorName?: string;
}

export interface StatisticsResponse {
  success: true;
  type: 'get_statistics';
  statistics: Statistics;
}

export interface TrackWordResponse {
  success: true;
  type: 'track_word';
}

export type BackgroundResponse = LookupResponse | ErrorResponse | StatisticsResponse | TrackWordResponse;

// Every non-error response carries a `type` that matches its request, so the
// success response for a given message is derivable from the union — no
// hand-written per-call validator needed.
export type SuccessResponse = Exclude<BackgroundResponse, ErrorResponse>;
export type ResponseFor<M extends BackgroundMessage> = Extract<SuccessResponse, { type: M['type'] }>;
