import type { Statistics } from './types';

export function mergeStatistics(syncStats: Statistics, localStats: Statistics): Statistics {
  const merged: Statistics = { ...localStats, ...syncStats };

  for (const word in localStats) {
    const syncStat = syncStats[word];
    const localStat = localStats[word];
    if (syncStat && localStat) {
      merged[word] = {
        count: syncStat.count + localStat.count,
        firstSeen: Math.min(syncStat.firstSeen, localStat.firstSeen),
        lastSeen: Math.max(syncStat.lastSeen, localStat.lastSeen)
      };
    }
  }

  return merged;
}
