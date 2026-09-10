// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { bandForRank } from '../frequency.js';
import { createFrequencyBadge } from '../frequency-badge.js';

describe('bandForRank', () => {
  it('bands the commonest words as core vocabulary', () => {
    expect(bandForRank(1)).toBe('core');
    expect(bandForRank(1000)).toBe('core');
  });

  it('bands the next two thousand as common', () => {
    expect(bandForRank(1001)).toBe('common');
    expect(bandForRank(3000)).toBe('common');
  });

  it('bands up to ten thousand as frequent', () => {
    expect(bandForRank(3001)).toBe('frequent');
    expect(bandForRank(10000)).toBe('frequent');
  });

  it('bands everything ranked beyond that as uncommon', () => {
    expect(bandForRank(10001)).toBe('uncommon');
    expect(bandForRank(500000)).toBe('uncommon');
  });

  it('treats an unranked word as rare, not as an error', () => {
    expect(bandForRank(undefined)).toBe('rare');
    expect(bandForRank(0)).toBe('rare');
  });
});

describe('createFrequencyBadge', () => {
  it('shows the band and the rank', () => {
    const el = createFrequencyBadge({ rank: 42, band: 'core' });

    expect(el.className).toBe('frequency-badge frequency-badge--core');
    expect(el.querySelector('.frequency-badge-label')?.textContent).toBe('Core 1000');
    expect(el.querySelector('.frequency-badge-rank')?.textContent).toBe('#42');
  });

  it('groups digits so a large rank stays readable', () => {
    const el = createFrequencyBadge({ rank: 14882, band: 'uncommon' });
    expect(el.querySelector('.frequency-badge-rank')?.textContent).toBe('#14,882');
  });

  it('falls back to rare with no rank when the word is unranked', () => {
    const el = createFrequencyBadge(undefined);

    expect(el.className).toBe('frequency-badge frequency-badge--rare');
    expect(el.querySelector('.frequency-badge-label')?.textContent).toBe('Rare');
    expect(el.querySelector('.frequency-badge-rank')).toBeNull();
  });

  it('explains the band on hover', () => {
    const el = createFrequencyBadge({ rank: 5, band: 'core' });
    expect(el.getAttribute('title')).toContain('1000 commonest');
  });
});
