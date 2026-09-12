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

describe('dwell tracking', () => {
  let client: PopupClient;
  let manager: ChineseHoverPopupManager;

  /**
   * Put the caret on `offset` of the page's only text node. The cursor helpers
   * read the global `document`, so the fixture has to live there too.
   */
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

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.replaceChildren(document.createTextNode('我寫好字。'));
    client = createClient();
    manager = new ChineseHoverPopupManager(document, client);
    manager.init();
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
  });

  it('shows the popup without recording a study', () => {
    hoverAt(2);

    expect(client.lookupWord).toHaveBeenCalled();
    expect(client.trackWord).not.toHaveBeenCalled();
  });

  it('records the study once the popup has been held', () => {
    hoverAt(2);
    vi.advanceTimersByTime(400);

    expect(client.trackWord).toHaveBeenCalledWith('好字', expect.any(Function), expect.any(String));
  });

  it('does not record a word the cursor passed straight over', () => {
    hoverAt(2);
    vi.advanceTimersByTime(100);
    manager.destroy();
    vi.advanceTimersByTime(1000);

    expect(client.trackWord).not.toHaveBeenCalled();
  });

  it('counts moving across one word as a single study', () => {
    hoverAt(2);
    vi.advanceTimersByTime(400);
    hoverAt(3);
    vi.advanceTimersByTime(400);

    expect(client.trackWord).toHaveBeenCalledTimes(1);
  });

  it('sends the sentence the word was met in', () => {
    hoverAt(2);
    vi.advanceTimersByTime(400);

    const context = vi.mocked(client.trackWord).mock.calls[0]![2];
    expect(context).toBe('我寫好字');
  });

  it('sends the hovered run and offset so the lookup can segment', () => {
    hoverAt(3);

    expect(vi.mocked(client.lookupWord).mock.calls[0]![2]).toEqual({ run: '我寫好字', offset: 3 });
  });
});
