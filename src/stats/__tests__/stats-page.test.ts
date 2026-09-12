// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { StatsManager } from '../stats.js';
import type { StatsClient } from '../stats-client.js';
import type { StatsStorage } from '../stats-storage.js';
import { SORT_LABELS } from '../ordering.js';
import type { Statistics } from '../../shared/types.js';

// The real page markup, minus the asset references happy-dom would try to fetch.
const HTML = readFileSync('src/stats/stats.html', 'utf-8')
  .replace(/<link\b[^>]*>/g, '')
  .replace(/<script\b[\s\S]*?<\/script>/g, '');

const NOW = Date.now();
const HOUR_MS = 3_600_000;

const STATISTICS: Statistics = {
  常見: { count: 9, firstSeen: 1, lastSeen: 100, rank: 40 },
  少見: { count: 2, firstSeen: 1, lastSeen: 300, rank: 7000 },
  退休: { count: 5, firstSeen: 1, lastSeen: 200, rank: 500, suppressed: true },
  到期: {
    count: 1,
    firstSeen: 1,
    lastSeen: 50,
    rank: 2500,
    flashcard: {
      reviews: 2,
      correct: 1,
      consecutiveCorrect: 0,
      srs: {
        due: NOW - HOUR_MS,
        stability: 2,
        difficulty: 5,
        scheduledDays: 2,
        learningSteps: 0,
        lapses: 1,
        state: 2,
      },
    },
  },
};

function createClient(): StatsClient {
  return {
    getStatistics: vi.fn(cb =>
      cb({ success: true, type: 'get_statistics', statistics: STATISTICS })
    ),
    lookupWord: vi.fn(),
    setWordStatus: vi.fn((_word, _status, cb) => cb({ success: true, type: 'set_word_status' })),
  };
}

const storage: StatsStorage = {
  getStatistics: vi.fn(async () => STATISTICS),
  clearStatistics: vi.fn(async () => {}),
};

describe('StatsManager overview', () => {
  let document: Document;
  let client: StatsClient;

  function text(id: string): string | null {
    return document.getElementById(id)!.textContent;
  }

  function listedWords(): string[] {
    return Array.from(
      document.getElementById('stats-list')!.querySelectorAll('.stat-word'),
      el => el.textContent ?? ''
    );
  }

  beforeEach(() => {
    document = new DOMParser().parseFromString(HTML, 'text/html');
    client = createClient();
    new StatsManager(document, client, storage).init();
  });

  it('reports what the scheduler already owes', () => {
    expect(text('overview-due-now')).toBe('1');
  });

  it('reports accuracy across the reviews that counted answers', () => {
    expect(text('overview-accuracy')).toBe('50%');
  });

  it('reports how many words are retired', () => {
    expect(text('overview-retired')).toBe('1');
  });

  it('lists the words most studied first by default', () => {
    expect(listedWords()[0]).toBe('常見');
  });

  it('offers exactly the sorts the comparators implement', () => {
    const select = document.getElementById('sort-select') as HTMLSelectElement;
    const offered = Array.from(select.options, option => [option.value, option.text]);

    expect(offered).toEqual(Object.entries(SORT_LABELS));
  });

  it('reorders the list when a different sort is chosen', () => {
    const select = document.getElementById('sort-select') as HTMLSelectElement;
    select.value = 'recent';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(listedWords()[0]).toBe('少見');
  });

  it('narrows the list to a frequency band', () => {
    document
      .querySelector('[data-band="core"]')!
      .dispatchEvent(new Event('click', { bubbles: true }));

    expect(listedWords()).toEqual(['常見', '退休']);
  });

  it('counts the words in each band', () => {
    expect(text('count-core')).toBe('2');
    expect(text('count-frequent')).toBe('1');
  });
});
