import type { FlashcardProgress, FlashcardStage, Statistics, WordStatistics } from './types';
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

  const directions = ['flashcard', 'production', 'components'] as const;
  for (const key of directions) {
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
