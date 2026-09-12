import type {
  FlashcardProgress,
  FlashcardStage,
  ReviewDirection,
  Statistics,
  WordStatistics,
} from './types';
import { isLearning, isMastered } from './scheduler.js';

/**
 * Staging reads the scheduler rather than a raw streak, so a word decays out
 * of `mastered` on its own once its recall probability drops — a streak from
 * six months ago is not mastery.
 */
export function getFlashcardStage(stat: WordStatistics, now: Date = new Date()): FlashcardStage {
  const fc = stat.flashcard;
  if (!fc || fc.reviews === 0) return 'new';
  if (isLearning(fc)) return 'learning';
  return isMastered(fc, now) ? 'mastered' : 'familiar';
}

/**
 * Where each direction's schedule is stored. Recognition keeps the original
 * `flashcard` key so decks recorded before there were other directions read
 * back unchanged.
 */
export const DIRECTION_FIELD: Readonly<Record<ReviewDirection, keyof WordStatistics>> = {
  recognition: 'flashcard',
  production: 'production',
  components: 'components',
};

/** Every schedule a word carries, in the order cards are introduced. */
export const DIRECTION_KEYS = ['flashcard', 'production', 'components'] as const;

export function progressFor(
  stat: WordStatistics,
  direction: ReviewDirection,
): FlashcardProgress | undefined {
  return stat[DIRECTION_FIELD[direction]] as FlashcardProgress | undefined;
}

/**
 * Every schedule the word actually carries. Four call sites used to walk the
 * direction fields themselves to take a minimum or a maximum of one property;
 * they differ only in which property and which way, so the walk lives here and
 * they keep the part that is theirs.
 */
export function* schedulesOf(stat: WordStatistics): Generator<FlashcardProgress> {
  for (const key of DIRECTION_KEYS) {
    const progress = stat[key];
    if (progress) yield progress;
  }
}

/** The extreme of one property across the word's schedules, or undefined if none has it. */
export function acrossSchedules(
  stat: WordStatistics,
  value: (progress: FlashcardProgress) => number | undefined,
  pick: (a: number, b: number) => number,
): number | undefined {
  let chosen: number | undefined;

  for (const progress of schedulesOf(stat)) {
    const candidate = value(progress);
    if (candidate === undefined) continue;
    chosen = chosen === undefined ? candidate : pick(chosen, candidate);
  }

  return chosen;
}

/** When any of the word's cards was last answered, or undefined if none was. */
export function lastReviewedAt(stat: WordStatistics): number | undefined {
  return acrossSchedules(stat, progress => progress.lastReviewed ?? 0, Math.max);
}

/** When the soonest of the word's cards is next due, or undefined if none is scheduled. */
export function nextDueAt(stat: WordStatistics): number | undefined {
  return acrossSchedules(stat, progress => progress.srs?.due, Math.min);
}

function mergeFlashcardProgress(
  sync: FlashcardProgress | undefined,
  local: FlashcardProgress | undefined,
): FlashcardProgress | undefined {
  if (!sync && !local) return undefined;
  if (!sync) return local;
  if (!local) return sync;
  return (sync.lastReviewed ?? 0) >= (local.lastReviewed ?? 0) ? sync : local;
}

/** The snippet from whichever area met the word first — context records a first sighting. */
function mergeContext(sync: WordStatistics, local: WordStatistics): string | undefined {
  if (!sync.context) return local.context;
  if (!local.context) return sync.context;
  return sync.firstSeen <= local.firstSeen ? sync.context : local.context;
}

function mergeWord(sync: WordStatistics, local: WordStatistics): WordStatistics {
  // Spreading both areas first carries every field the branches below do not
  // name, so anything recorded per word survives a merge by default instead of
  // being dropped the first time the word turns up in both areas.
  const merged: WordStatistics = {
    ...local,
    ...sync,
    count: sync.count + local.count,
    firstSeen: Math.min(sync.firstSeen, local.firstSeen),
    lastSeen: Math.max(sync.lastSeen, local.lastSeen),
  };

  for (const key of DIRECTION_KEYS) {
    const progress = mergeFlashcardProgress(sync[key], local[key]);
    if (progress) merged[key] = progress;
    else delete merged[key];
  }

  const context = mergeContext(sync, local);
  if (context) merged.context = context;
  else delete merged.context;

  // Retiring or choosing a word is a decision, not an observation: it stands
  // even when only one area recorded it.
  if (sync.suppressed || local.suppressed) merged.suppressed = true;
  if (sync.pinned || local.pinned) merged.pinned = true;

  return merged;
}

export function mergeStatistics(syncStats: Statistics, localStats: Statistics): Statistics {
  const merged: Statistics = { ...localStats, ...syncStats };

  for (const word in localStats) {
    const syncStat = syncStats[word];
    const localStat = localStats[word];
    if (syncStat && localStat) {
      merged[word] = mergeWord(syncStat, localStat);
    }
  }

  return merged;
}
