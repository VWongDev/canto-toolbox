// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { FlashcardManager } from '../flashcards.js';
import type { FlashcardClient } from '../flashcard-client.js';
import type { DefinitionResult, Statistics } from '../../shared/types.js';

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
    updateFlashcard: vi.fn((_word, _rating, _direction, cb) =>
      cb({ success: true, type: 'update_flashcard' })
    ),
    setWordStatus: vi.fn((_word, _status, cb) => cb({ success: true, type: 'set_word_status' })),
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

    expect(client.updateFlashcard).toHaveBeenCalledWith(
      word,
      'easy',
      'recognition',
      expect.any(Function)
    );
  });

  it('rates Good on Space once the answer is visible', () => {
    start();
    const word = currentWord();

    press(' ');
    press(' ');

    expect(client.updateFlashcard).toHaveBeenCalledWith(
      word,
      'good',
      'recognition',
      expect.any(Function)
    );
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

describe('FlashcardManager retiring a word', () => {
  let document: Document;
  let client: FlashcardClient;

  function press(key: string): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }

  beforeEach(() => {
    document = new DOMParser().parseFromString(HTML, 'text/html');
    client = createClient();
    new FlashcardManager(document, client).init();
  });

  it('retires the word on screen and moves on', () => {
    const first = document.getElementById('card')!.dataset.currentWord;

    press('k');

    expect(client.setWordStatus).toHaveBeenCalledWith(
      first,
      { suppressed: true },
      expect.any(Function)
    );
    expect(document.getElementById('card')!.dataset.currentWord).not.toBe(first);
  });

  it('shrinks the session rather than leaving a card unanswered', () => {
    press('k');
    expect(document.getElementById('counter')!.textContent).toBe('Card 1 of 1');
  });

  it('does not bring a retired word back when the session restarts', () => {
    const first = document.getElementById('card')!.dataset.currentWord;
    press('k');
    press(' ');
    press('3');

    expect(document.getElementById('finished')!.style.display).not.toBe('none');
    press('Enter');

    expect(document.getElementById('card')!.dataset.currentWord).not.toBe(first);
  });

  it('does not send the retired card to the scheduler', () => {
    press('k');
    expect(client.updateFlashcard).not.toHaveBeenCalled();
  });
});

describe('FlashcardManager production cards', () => {
  let document: Document;
  let client: FlashcardClient;

  /** A word whose recognition card has graduated, so production is what is owed. */
  const GRADUATED: Statistics = {
    你好: {
      count: 5,
      firstSeen: 1,
      lastSeen: 2,
      context: '你好嗎',
      flashcard: {
        reviews: 3,
        consecutiveCorrect: 3,
        lastReviewed: 1,
        srs: {
          due: Date.now() + 86_400_000,
          stability: 10,
          difficulty: 5,
          scheduledDays: 10,
          learningSteps: 0,
          lapses: 0,
          state: 2,
        },
      },
    },
  };

  function start(): void {
    client = createClient({
      getStatistics: vi.fn(cb =>
        cb({ success: true, type: 'get_statistics', statistics: GRADUATED })
      ),
    });
    new FlashcardManager(document, client).init();
  }

  beforeEach(() => {
    document = new DOMParser().parseFromString(HTML, 'text/html');
  });

  it('asks for the word from its meaning', () => {
    start();
    const front = document.getElementById('card-front')!;

    expect(document.getElementById('card')!.dataset.currentDirection).toBe('production');
    expect(front.querySelector('.card-gloss')?.textContent).toBe('hello');
  });

  it('keeps the word itself off the production front', () => {
    start();
    expect(document.getElementById('card-front')!.textContent).not.toContain('你好');
  });

  it('prompts with the context sentence blanked out', () => {
    start();
    const blank = document.getElementById('card-front')!.querySelector('.context-blank');

    expect(blank?.textContent).toHaveLength(2);
  });

  it('reveals the word on the answer', () => {
    start();
    document.getElementById('show-answer-btn')!.dispatchEvent(new Event('click', { bubbles: true }));

    const back = document.getElementById('card-back')!;
    expect(back.querySelector('.definition-word')?.textContent).toBe('你好');
  });

  it('rates the production card rather than the recognition one', () => {
    start();
    document.getElementById('show-answer-btn')!.dispatchEvent(new Event('click', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));

    expect(client.updateFlashcard).toHaveBeenCalledWith(
      '你好',
      'good',
      'production',
      expect.any(Function)
    );
  });

  it('looks the word up once for both the question and the answer', () => {
    start();
    document.getElementById('show-answer-btn')!.dispatchEvent(new Event('click', { bubbles: true }));

    expect(client.lookupWord).toHaveBeenCalledTimes(1);
  });
});
