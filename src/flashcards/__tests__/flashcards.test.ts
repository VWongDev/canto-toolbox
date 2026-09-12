// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { FlashcardManager } from '../flashcards.js';
import type { FlashcardClient } from '../flashcard-client.js';
import type { DefinitionResult } from '../../shared/types.js';

// The real page markup, minus the asset references happy-dom would try to fetch.
const HTML = readFileSync('src/flashcards/flashcards.html', 'utf-8')
  .replace(/<link\b[^>]*>/g, '')
  .replace(/<script\b[\s\S]*?<\/script>/g, '');

const DEFINITION: DefinitionResult = {
  word: '你好',
  mandarin: {
    entries: [
      { traditional: '你好', simplified: '你好', romanisation: 'ni3 hao3', definitions: ['hello'] }
    ]
  },
  cantonese: {
    entries: [
      { traditional: '你好', simplified: '你好', romanisation: 'nei5 hou2', definitions: ['hello'] }
    ]
  }
};

function createClient(overrides: Partial<FlashcardClient> = {}): FlashcardClient {
  return {
    getStatistics: vi.fn(cb =>
      cb({
        success: true,
        type: 'get_statistics',
        statistics: {
          你好: { count: 5, firstSeen: 1, lastSeen: 2, context: '你好嗎' },
          再见: { count: 3, firstSeen: 1, lastSeen: 2 }
        }
      })
    ),
    lookupWord: vi.fn((_word, cb) =>
      cb({ success: true, type: 'lookup_word', definition: DEFINITION })
    ),
    updateFlashcard: vi.fn((_word, _rating, cb) => cb({ success: true, type: 'update_flashcard' })),
    ...overrides
  };
}

describe('FlashcardManager keyboard shortcuts', () => {
  let document: Document;
  let client: FlashcardClient;

  function start(overrides: Partial<FlashcardClient> = {}): void {
    client = createClient(overrides);
    new FlashcardManager(document, client).init();
  }

  function press(key: string, init: KeyboardEventInit = {}): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  }

  function isVisible(id: string): boolean {
    return document.getElementById(id)!.style.display !== 'none';
  }

  function currentWord(): string | undefined {
    return document.getElementById('card')!.dataset.currentWord;
  }

  beforeEach(() => {
    document = new DOMParser().parseFromString(HTML, 'text/html');
  });

  it('reveals the answer on Space', () => {
    start();
    const word = currentWord();

    press(' ');

    expect(client.lookupWord).toHaveBeenCalledWith(word, expect.any(Function));
    expect(isVisible('rating-btns')).toBe(true);
  });

  it('ignores a second reveal while the lookup is in flight', () => {
    start({ lookupWord: vi.fn() });

    press(' ');
    press(' ');

    expect(client.lookupWord).toHaveBeenCalledTimes(1);
  });

  it('rates with the number keys once the answer is visible', () => {
    start();
    const word = currentWord();

    press(' ');
    press('4');

    expect(client.updateFlashcard).toHaveBeenCalledWith(word, 'easy', expect.any(Function));
  });

  it('rates Good on Space once the answer is visible', () => {
    start();
    const word = currentWord();

    press(' ');
    press(' ');

    expect(client.updateFlashcard).toHaveBeenCalledWith(word, 'good', expect.any(Function));
  });

  it('does not rate before the answer is revealed', () => {
    start();

    press('3');

    expect(client.updateFlashcard).not.toHaveBeenCalled();
  });

  it('ignores shortcuts when a modifier is held', () => {
    start();

    press(' ', { metaKey: true });

    expect(client.lookupWord).not.toHaveBeenCalled();
  });

  it('requeues a card rated Again with the 1 key', () => {
    start();
    const first = currentWord();

    press(' ');
    press('1');
    expect(currentWord()).not.toBe(first);

    press(' ');
    press('3');
    expect(isVisible('review')).toBe(true);
    expect(currentWord()).toBe(first);

    press(' ');
    press('3');
    expect(isVisible('finished')).toBe(true);
    expect(document.getElementById('result-summary')!.textContent).toBe('2 / 2 correct');
  });

  it('shows the sentence the word was met in on the answer', () => {
    start();
    press(' ');

    const context = document.getElementById('card-back')!.querySelector('.context');
    expect(context?.querySelector('.context-sentence')?.textContent).toBe('你好嗎');
  });

  it('omits the sentence for a word that has none', () => {
    start();
    press(' ');
    press('3');
    press(' ');

    expect(document.getElementById('card-back')!.querySelector('.context')).toBeNull();
  });

  it('sends a requeued card to the scheduler only on its first answer', () => {
    start();
    const first = currentWord();

    press(' ');
    press('1');
    press(' ');
    press('3');

    const rated = (client.updateFlashcard as ReturnType<typeof vi.fn>).mock.calls
      .filter(call => call[0] === first);
    expect(rated).toHaveLength(1);
    expect(rated[0]![1]).toBe('again');
  });

  it('does not re-rate the same cards when the session is restarted', () => {
    start();
    for (let i = 0; i < 2; i++) {
      press(' ');
      press('3');
    }
    expect(client.updateFlashcard).toHaveBeenCalledTimes(2);

    press('Enter');
    for (let i = 0; i < 2; i++) {
      press(' ');
      press('3');
    }

    expect(client.updateFlashcard).toHaveBeenCalledTimes(2);
  });

  it('restarts the session on Enter from the finished screen', () => {
    start();
    for (let i = 0; i < 2; i++) {
      press(' ');
      press('3');
    }
    expect(isVisible('finished')).toBe(true);

    press('Enter');

    expect(isVisible('review')).toBe(true);
    expect(document.getElementById('counter')!.textContent).toBe('Card 1 of 2');
  });
});
