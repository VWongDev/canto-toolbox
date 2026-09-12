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

/** Word → its rank in the SUBTLEX-CH corpus, 1 being the commonest. */
export type FrequencyRanks = Record<string, number>;

export type FrequencyBand = 'core' | 'common' | 'frequent' | 'uncommon' | 'rare';

export type FlashcardRating = 'again' | 'hard' | 'good' | 'easy';
export type FlashcardStage = 'new' | 'learning' | 'familiar' | 'mastered';

/**
 * What a card asks for. Recognition (word → meaning) is what reading trains on
 * its own; production and components are the two things reading never tests,
 * so each carries its own schedule rather than riding on the recognition card.
 */
export type ReviewDirection = 'recognition' | 'production' | 'components';

/**
 * Compact projection of an FSRS card. Dates are epoch milliseconds and reals
 * are rounded, because every tracked word's progress shares one storage item.
 */
export interface SrsState {
  /** Epoch ms at which the word is next due for review. */
  due: number;
  /** Days the memory is expected to last from the last review. */
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  lapses: number;
  /** FSRS `State`: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: number;
}

export interface FlashcardProgress {
  reviews: number;
  /** Reviews answered Good or Easy, for the accuracy the stats page reports. */
  correct?: number;
  consecutiveCorrect: number;
  lastRating?: FlashcardRating;
  lastReviewed?: number;
  /** Absent until the word's first review. */
  srs?: SrsState;
}

export interface WordStatistics {
  count: number;
  firstSeen: number;
  lastSeen: number;
  /** Recognition progress. The original single-card key, kept for stored data. */
  flashcard?: FlashcardProgress;
  /** Meaning → word. Unlocked once recognition leaves its learning steps. */
  production?: FlashcardProgress;
  /** Character → its parts. Only for single characters the etymology covers. */
  components?: FlashcardProgress;
  /**
   * A snippet of the sentence the word was first met in. The strongest memory
   * hook available and free to capture, so it is kept for recall — one per
   * word, since every tracked word shares a single storage item.
   */
  context?: string;
  /** SUBTLEX-CH rank recorded at track time, so study order can follow it. */
  rank?: number;
  /** True once the character has parts worth drilling, decided at track time. */
  decomposable?: boolean;
  /** Retired by the reader, or buried automatically as a leech. */
  suppressed?: boolean;
  /** Added deliberately, so it skips the exposure gate new words wait behind. */
  pinned?: boolean;
}

export interface Statistics {
  [word: string]: WordStatistics;
}

export interface WordFrequency {
  /** 1 is the commonest word in the corpus. */
  rank: number;
  band: FrequencyBand;
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
  /** Absent when the word is rarer than the corpus cap. */
  frequency?: WordFrequency;
}

/**
 * The run of Chinese text under the cursor and the hovered index within it.
 * Segmentation needs the dictionary, which lives in the service worker, so the
 * content script sends the raw run and lets the lookup pick the word.
 */
export interface HoverSegment {
  run: string;
  offset: number;
}

export interface LookupMessage {
  type: 'lookup_word';
  word: string;
  segment?: HoverSegment;
}

export interface TrackWordMessage {
  type: 'track_word';
  word: string;
  /** Sentence the word was met in, recorded the first time it is studied. */
  context?: string;
  /** Set when the reader asked for the word outright rather than dwelling on it. */
  pin?: boolean;
}

/** Retire a word from review, or put a retired one back. */
export interface SetWordStatusMessage {
  type: 'set_word_status';
  word: string;
  suppressed?: boolean;
  pinned?: boolean;
}

export interface GetStatisticsMessage {
  type: 'get_statistics';
}

export interface UpdateFlashcardMessage {
  type: 'update_flashcard';
  word: string;
  rating: FlashcardRating;
  /** Omitted by older callers, which only ever rated the recognition card. */
  direction?: ReviewDirection;
}

export type BackgroundMessage =
  | LookupMessage
  | TrackWordMessage
  | GetStatisticsMessage
  | UpdateFlashcardMessage
  | SetWordStatusMessage;

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

export interface UpdateFlashcardResponse {
  success: true;
  type: 'update_flashcard';
}

export interface SetWordStatusResponse {
  success: true;
  type: 'set_word_status';
}

export type BackgroundResponse =
  | LookupResponse
  | ErrorResponse
  | StatisticsResponse
  | TrackWordResponse
  | UpdateFlashcardResponse
  | SetWordStatusResponse;

// Every non-error response carries a `type` that matches its request, so the
// success response for a given message is derivable from the union — no
// hand-written per-call validator needed.
export type SuccessResponse = Exclude<BackgroundResponse, ErrorResponse>;
export type ResponseFor<M extends BackgroundMessage> = Extract<SuccessResponse, { type: M['type'] }>;
