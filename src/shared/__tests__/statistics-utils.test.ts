import { describe, it, expect } from 'vitest';
import { mergeStatistics } from '../statistics-utils.js';

describe('mergeStatistics', () => {
  it('returns empty object when both args are empty', () => {
    expect(mergeStatistics({}, {})).toEqual({});
  });

  it('returns sync-only stats when local is empty', () => {
    const result = mergeStatistics({ 好: { count: 3, firstSeen: 100, lastSeen: 200 } }, {});
    expect(result['好']!.count).toBe(3);
  });

  it('returns local-only stats when sync is empty', () => {
    const result = mergeStatistics({}, { 字: { count: 1, firstSeen: 50, lastSeen: 150 } });
    expect(result['字']!.count).toBe(1);
  });

  it('merges counts for a word present in both', () => {
    const result = mergeStatistics(
      { 好: { count: 3, firstSeen: 100, lastSeen: 200 } },
      { 好: { count: 2, firstSeen: 50, lastSeen: 150 } }
    );
    expect(result['好']!.count).toBe(5);
  });

  it('takes the earliest firstSeen when merging', () => {
    const result = mergeStatistics(
      { 好: { count: 1, firstSeen: 200, lastSeen: 200 } },
      { 好: { count: 1, firstSeen: 50, lastSeen: 100 } }
    );
    expect(result['好']!.firstSeen).toBe(50);
  });

  it('takes the latest lastSeen when merging', () => {
    const result = mergeStatistics(
      { 好: { count: 1, firstSeen: 100, lastSeen: 300 } },
      { 好: { count: 1, firstSeen: 100, lastSeen: 100 } }
    );
    expect(result['好']!.lastSeen).toBe(300);
  });
});
