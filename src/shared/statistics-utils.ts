import type { Statistics } from './types';

export function mergeStatistics(syncStats: Statistics, localStats: Statistics): Statistics {
  const merged: Statistics = { ...localStats, ...syncStats };

  for (const word in localStats) {
    const syncStat = syncStats[word];
    const localStat = localStats[word];
    if (syncStat && localStat) {
      merged[word] = {
        count: (syncStat.count ?? 0) + (localStat.count ?? 0),
        firstSeen: Math.min(syncStat.firstSeen ?? Date.now(), localStat.firstSeen ?? Date.now()),
        lastSeen: Math.max(syncStat.lastSeen ?? 0, localStat.lastSeen ?? 0)
      };
    }
  }

  return merged;
}
