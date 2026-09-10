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

export function mergeStatistics(syncStats: Statistics, localStats: Statistics): Statistics {
  const merged: Statistics = { ...localStats, ...syncStats };

  for (const word in localStats) {
    const syncStat = syncStats[word];
    const localStat = localStats[word];
    if (syncStat && localStat) {
      const flashcard = mergeFlashcardProgress(syncStat.flashcard, localStat.flashcard);
      merged[word] = {
        count: syncStat.count + localStat.count,
        firstSeen: Math.min(syncStat.firstSeen, localStat.firstSeen),
        lastSeen: Math.max(syncStat.lastSeen, localStat.lastSeen),
        ...(flashcard !== undefined && { flashcard }),
      };
    }
  }

  return merged;
}
