// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChineseHoverPopupManager } from '../content.js';
import type { PopupClient } from '../popup-client.js';
import type { DefinitionResult } from '../../shared/types.js';

const DEFINITION: DefinitionResult = {
  word: '好字',
  mandarin: {
    entries: [
      { traditional: '好字', simplified: '好字', romanisation: 'hao3 zi4', definitions: ['good handwriting'] }
    ]
  },
  cantonese: { entries: [] }
};

function createClient(): PopupClient {
  return {
    lookupWord: vi.fn((_word, cb) => cb({ success: true, type: 'lookup_word', definition: DEFINITION })),
    trackWord: vi.fn((_word, cb) => cb({ success: true, type: 'track_word' })),
    pinWord: vi.fn((_word, cb) => cb({ success: true, type: 'track_word' })),
  };
}

describe('popup dismissal', () => {
  let client: PopupClient;
  let manager: ChineseHoverPopupManager;

  function popup(): HTMLElement | null {
    return document.getElementById('chinese-hover-popup');
  }

  /** Put the caret on `offset` of the page's only text node and move there. */
  function hoverAt(offset: number): void {
    const textNode = document.body.firstChild as Text;
    document.caretRangeFromPoint = vi.fn(() => ({
      startContainer: textNode,
      startOffset: offset,
    })) as unknown as Document['caretRangeFromPoint'];

    document.dispatchEvent(
      new MouseEvent('mousemove', { clientX: 10 + offset, clientY: 10, bubbles: true })
    );
  }

  function hoverPopup(): void {
    popup()!.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 40, bubbles: true }));
  }

  /**
   * Moves are coalesced onto the animation frame, so a second move only counts
   * once the frame the first scheduled has passed. Real timers throughout: the
   * grace period is measured against the same clock the frame runs on.
   */
  function nextFrame(): Promise<void> {
    return new Promise(resolve => {
      requestAnimationFrame(() => resolve());
    });
  }

  function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  beforeEach(async () => {
    document.body.replaceChildren(document.createTextNode('好字 abc'));
    client = createClient();
    manager = new ChineseHoverPopupManager(document, client);
    manager.init();
    hoverAt(0);
    await nextFrame();
  });

  afterEach(() => {
    manager.destroy();
  });

  it('holds the popup while the cursor crosses the gap to it', async () => {
    hoverAt(4);
    await wait(100);

    expect(popup()).not.toBeNull();
  });

  it('keeps the popup once the cursor reaches it', async () => {
    hoverAt(4);
    await nextFrame();
    hoverPopup();
    await wait(500);

    expect(popup()).not.toBeNull();
  });

  it('hides the popup when the cursor stays away', async () => {
    hoverAt(4);
    await wait(500);

    expect(popup()).toBeNull();
  });
});
