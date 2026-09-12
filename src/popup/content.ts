import type {
  DefinitionResult,
  HoverSegment,
  LookupResponse,
  ErrorResponse,
} from '../shared/types.js';
import { createElement } from '../shared/dom-element.js';
import { popupClient, type PopupClient } from './popup-client.js';
import popupStyles from './popup.scss?inline';
import { createEtymologySection } from '../shared/etymology-section.js';
import { createDefinitionSections } from '../shared/definition-section.js';

const CHINESE_REGEX = /[\u4e00-\u9fff]+/g;

/**
 * How long the popup must stay on a word before it counts as studied. The
 * popup follows the cursor, so without a dwell the statistics record every
 * word scrolled past rather than the ones actually read.
 */
const DWELL_MS = 400;

/** Longest sentence snippet sent along with a tracked word. */
const MAX_CONTEXT_CHARS = 60;

const STUDY_LABEL = '+ Study';
const STUDY_ADDED_LABEL = 'Added';

const SENTENCE_BOUNDARY = /[\u3002\uff01\uff1f\uff1b\uff1a\u3001\n.!?;]/;
const SELECTION_HIDE_DELAY_MS = 200;
const SELECTION_TRACKING_DELAY_MS = 300;
const POPUP_OFFSET_PX = 15;
const SELECTION_PADDING_PX = 10;
const VIEWPORT_MARGIN_PX = 10;

/** What each pending timer is waiting to do. */
type TimerName = 'selection' | 'track';

interface CursorResult {
  /** The contiguous run of Chinese characters under the cursor. */
  run: string;
  /** Index of the hovered character within `run`. */
  runOffset: number;
  textNode: Text;
  offset: number;
}

export class ChineseHoverPopupManager {
  private readonly document: Document;
  private readonly client: PopupClient;
  /**
   * The pending timers, keyed by what each one is waiting to do. One record
   * rather than a field apiece, so setting and clearing a timer are the same
   * two lines whichever timer it is.
   */
  private readonly timers: Record<TimerName, ReturnType<typeof setTimeout> | null> = {
    selection: null,
    track: null,
  };
  private lastHoveredWord: string | null = null;
  private lastHoveredOffset = -1;
  private currentPopup: HTMLElement | null = null;
  private currentSelection: DOMRect | null = null;
  private isHoveringChinese = false;
  private lastHoveredElement: Node | null = null;
  private mousemoveThrottle: number | null = null;
  /** The newest move seen since the frame was scheduled. */
  private pendingMouseMove: MouseEvent | null = null;
  private readonly boundMouseMove: (e: MouseEvent) => void;
  private readonly boundMouseOut: (e: MouseEvent) => void;
  private readonly boundMouseUp: (e: MouseEvent) => void;

  constructor(document: Document, client: PopupClient) {
    this.document = document;
    this.client = client;
    this.boundMouseMove = (e) => this.handleMouseMove(e);
    this.boundMouseOut = (e) => this.handleMouseOut(e);
    this.boundMouseUp = (e) => this.handleSelection(e);
  }

  init(): void {
    this.injectStyles();
    this.document.addEventListener('mousemove', this.boundMouseMove, true);
    this.document.addEventListener('mouseout', this.boundMouseOut, true);
    this.document.addEventListener('mouseup', this.boundMouseUp, true);
  }

  destroy(): void {
    this.document.removeEventListener('mousemove', this.boundMouseMove, true);
    this.document.removeEventListener('mouseout', this.boundMouseOut, true);
    this.document.removeEventListener('mouseup', this.boundMouseUp, true);
    if (this.mousemoveThrottle !== null) {
      cancelAnimationFrame(this.mousemoveThrottle);
      this.mousemoveThrottle = null;
    }
    this.pendingMouseMove = null;
    this.hidePopup();
  }

  /**
   * Act on the move at once, then coalesce the rest of the frame into a single
   * follow-up with the newest position. A frame is the finest resolution the
   * popup can act on, so this costs one caret lookup per frame however fast
   * the pointer moves — the previous pairing of a millisecond gate with a
   * frame callback was two mechanisms doing that one job.
   */
  private handleMouseMove(event: MouseEvent): void {
    if (this.mousemoveThrottle !== null) {
      this.pendingMouseMove = event;
      return;
    }

    this.handleMouseMoveThrottled(event);

    this.mousemoveThrottle = requestAnimationFrame(() => {
      this.mousemoveThrottle = null;
      const pending = this.pendingMouseMove;
      this.pendingMouseMove = null;
      if (pending) this.handleMouseMove(pending);
    });
  }

  private handleSelection(_event: MouseEvent): void {
    const selection = window.getSelection();
    if (!selection?.toString().trim()) {
      if (this.currentSelection) {
        this.currentSelection = null;
        this.scheduleSelectionHide();
      }
      return;
    }

    const chineseWords = extractChineseWordsFromText(selection.toString().trim());
    if (chineseWords.length === 0 || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    this.currentSelection = rect;

    const anchorText = selection.anchorNode?.textContent;
    const context = anchorText ? extractContext(anchorText, selection.anchorOffset) : undefined;

    this.lookupAndShowWord(
      chineseWords.join(''),
      rect.left + rect.width / 2,
      rect.top - 10,
      { ...(context && { context }) },
    );
  }

  private handleMouseOut(event: MouseEvent): void {
    if (this.currentSelection) return;

    const relatedTarget = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
    if (relatedTarget?.closest('#chinese-hover-popup')) return;

    if (!this.isHoveringChinese && this.currentPopup && !this.currentPopup.matches(':hover')) {
      this.hidePopup();
      this.resetHoverState();
    }
  }

  private handleMouseMoveThrottled(event: MouseEvent): void {
    const target = event.target;
    if (!target) return;

    if (this.currentSelection) {
      this.handleSelectionTracking(event);
      return;
    }

    const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
    if (element?.closest('#chinese-hover-popup')) {
      this.isHoveringChinese = true;
      return;
    }

    if (hasActiveSelection()) return;

    const result = getChineseWordAtCursor(this.document, event);
    if (!result) {
      if (this.isHoveringChinese || this.currentPopup) {
        this.resetHoverState();
        this.hidePopup();
      }
      return;
    }

    const { run, runOffset, textNode, offset } = result;
    this.isHoveringChinese = true;

    // Caret offsets are whole characters, so any difference at all is a move
    // to another character.
    const characterChanged = textNode !== this.lastHoveredElement ||
                            offset !== this.lastHoveredOffset;
    this.lastHoveredElement = textNode;
    this.lastHoveredOffset = offset;

    const key = `${run}@${runOffset}`;
    if (key !== this.lastHoveredWord || characterChanged) {
      this.lastHoveredWord = key;

      this.lookupAndShowWord(run, event.clientX, event.clientY, {
        segment: { run, offset: runOffset },
        context: extractContext(textNode.textContent ?? '', offset),
      });
    }
  }

  private handleSelectionTracking(event: MouseEvent): void {
    const { clientX: mouseX, clientY: mouseY } = event;
    const rect = this.currentSelection!;
    const popup = this.currentPopup;

    const overSelection = isMouseOverSelection(mouseX, mouseY, rect);
    const overPopup = popup && isMouseOverPopup(mouseX, mouseY, popup);

    if (!overSelection && !overPopup) {
      this.setTimer('selection', () => {
        if (!hasActiveSelection()) {
          this.currentSelection = null;
          this.hidePopup();
        }
      }, SELECTION_TRACKING_DELAY_MS);
    } else {
      this.clearTimer('selection');
    }
  }

  private lookupAndShowWord(
    word: string,
    x: number,
    y: number,
    { segment, context }: { segment?: HoverSegment; context?: string } = {},
  ): void {
    this.client.lookupWord(
      word,
      (response: LookupResponse | ErrorResponse) => {
        if (!response.success || !('definition' in response)) {
          console.error('[Content] Lookup failed:', response.error);
          return;
        }

        const matched = response.definition.word || word;
        if (this.currentPopup?.dataset.word === matched) {
          // Same word, new cursor position: reposition without restarting the
          // dwell, so moving across one word still counts as a single study.
          positionPopup(this.currentPopup, x, y);
          return;
        }

        this.showPopup(matched, response.definition, x, y, context);
        this.scheduleTracking(matched, context);
      },
      segment,
    );
  }

  /**
   * Statistics are written only once the popup has held on a word — a lookup
   * alone is as likely to be the cursor passing over text as it is a reader
   * stopping to read it.
   */
  private scheduleTracking(word: string, context?: string): void {
    this.setTimer('track', () => {
      this.client.trackWord(
        word,
        (response) => {
          if (!response.success) {
            console.error('[Content] Track word failed:', response.error);
          }
        },
        context,
      );
    }, DWELL_MS);
  }

  /**
   * Adds the word to the deck on the spot. Dwelling is a good guess at what a
   * reader is studying, but it is only a guess: a word met once and known to
   * matter should not have to be hovered twice more to be drilled.
   */
  private createStudyButton(word: string, context?: string): HTMLElement {
    return createElement<HTMLButtonElement>({
      tag: 'button',
      className: 'popup-study',
      textContent: STUDY_LABEL,
      attributes: { type: 'button', title: 'Add this word to your flashcards' },
      listeners: {
        click: (event: Event) => {
          event.stopPropagation();
          const button = event.currentTarget as HTMLButtonElement;
          button.textContent = STUDY_ADDED_LABEL;
          button.disabled = true;

          this.clearTimer('track');
          this.client.pinWord(
            word,
            (response) => {
              if (!response.success) console.error('[Content] Study word failed:', response.error);
            },
            context,
          );
        },
      },
    });
  }

  private showPopup(
    word: string,
    definition: DefinitionResult,
    x: number,
    y: number,
    context?: string,
  ): void {
    this.hidePopup();

    const popup = createElement({
      tag: 'div',
      id: 'chinese-hover-popup',
      className: 'chinese-hover-popup',
      dataset: { word },
      listeners: {
        mouseenter: () => {
          this.isHoveringChinese = true;
        },
        mouseleave: () => {
          if (!this.isHoveringChinese) this.hidePopup();
        }
      }
    });

    popup.appendChild(
      createElement({
        className: 'popup-header',
        children: [
          createElement({ className: 'popup-word', textContent: definition.word || word }),
          this.createStudyButton(word, context),
        ],
      }),
    );

    if (definition.etymology?.length) {
      popup.appendChild(createEtymologySection(definition.etymology));
    }

    popup.appendChild(createDefinitionSections(definition));

    this.document.body.appendChild(popup);
    this.currentPopup = popup;
    positionPopup(popup, x, y);
  }

  private hidePopup(): void {
    // A word the reader moved off before the dwell elapsed was never studied.
    this.clearTimer('track');

    if (this.currentPopup) {
      this.currentPopup.remove();
      this.currentPopup = null;
      this.lastHoveredWord = null;
      this.lastHoveredElement = null;
      this.lastHoveredOffset = -1;
    }
  }

  private clearTimer(name: TimerName): void {
    const pending = this.timers[name];
    if (pending !== null) clearTimeout(pending);
    this.timers[name] = null;
  }

  /** Replace whatever was pending for `name` with a fresh delay. */
  private setTimer(name: TimerName, run: () => void, delayMs: number): void {
    this.clearTimer(name);
    this.timers[name] = setTimeout(() => {
      this.timers[name] = null;
      run();
    }, delayMs);
  }

  private resetHoverState(): void {
    this.isHoveringChinese = false;
    this.lastHoveredElement = null;
    this.lastHoveredOffset = -1;
  }

  private scheduleSelectionHide(): void {
    this.setTimer('selection', () => {
      if (!this.currentSelection) this.hidePopup();
    }, SELECTION_HIDE_DELAY_MS);
  }

  private injectStyles(): void {
    if (this.document.getElementById('chinese-hover-styles')) return;

    const style = createElement<HTMLStyleElement>({ tag: 'style', id: 'chinese-hover-styles' });
    style.textContent = popupStyles;
    this.document.head.appendChild(style);
  }
}

export const popupManager = new ChineseHoverPopupManager(document, popupClient);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => popupManager.init());
} else {
  popupManager.init();
}

/**
 * The content script runs on arbitrary pages, where a caret can land in
 * another realm (a frame's document), and `instanceof Text` is false across
 * realms. `nodeType` is the check that survives that.
 */
function getTextNodeAtCursor(
  document: Document,
  event: MouseEvent,
): { textNode: Text; offset: number } | null {
  const range = document.caretRangeFromPoint(event.clientX, event.clientY);
  const container = range?.startContainer;

  if (container && container.nodeType === Node.TEXT_NODE) {
    return { textNode: container as Text, offset: range.startOffset };
  }
  return null;
}

/**
 * The whole run of Chinese under the cursor, plus where in it the cursor sits.
 * Which word that is depends on the dictionary, so the choice is deferred to
 * the service worker — hovering the middle of 中國人 should find 中國人 rather
 * than the 國人 a forward-only scan from the cursor would give.
 */
export function findChineseRunAt(
  text: string,
  offset: number,
): { run: string; runOffset: number } | null {
  CHINESE_REGEX.lastIndex = 0;
  let match;

  while ((match = CHINESE_REGEX.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    if (offset >= start && offset < end) {
      return { run: match[0], runOffset: offset - start };
    }

    if (start > offset) break;
  }

  return null;
}

/** The sentence around the cursor, windowed so a long one stays readable. */
export function extractContext(text: string, offset: number): string {
  let start = offset;
  while (start > 0 && !SENTENCE_BOUNDARY.test(text[start - 1]!)) start--;

  let end = offset;
  while (end < text.length && !SENTENCE_BOUNDARY.test(text[end]!)) end++;

  const sentence = text.slice(start, end).trim();
  if (sentence.length <= MAX_CONTEXT_CHARS) return sentence;

  // Centre the window on the hovered character so the word survives the trim.
  const within = offset - start;
  const from = Math.max(0, Math.min(within - MAX_CONTEXT_CHARS / 2, sentence.length - MAX_CONTEXT_CHARS));
  return sentence.slice(from, from + MAX_CONTEXT_CHARS).trim();
}

function getChineseWordAtCursor(document: Document, event: MouseEvent): CursorResult | null {
  const cursorData = getTextNodeAtCursor(document, event);
  if (!cursorData?.textNode.textContent || cursorData.offset < 0) return null;

  const found = findChineseRunAt(cursorData.textNode.textContent, cursorData.offset);
  if (!found) return null;

  return {
    run: found.run,
    runOffset: found.runOffset,
    textNode: cursorData.textNode,
    offset: cursorData.offset,
  };
}

function extractChineseWordsFromText(text: string): string[] {
  return text.match(CHINESE_REGEX) || [];
}

function isMouseOverSelection(mouseX: number, mouseY: number, rect: DOMRect): boolean {
  return mouseX >= rect.left - SELECTION_PADDING_PX &&
         mouseX <= rect.right + SELECTION_PADDING_PX &&
         mouseY >= rect.top - SELECTION_PADDING_PX &&
         mouseY <= rect.bottom + SELECTION_PADDING_PX;
}

function isMouseOverPopup(mouseX: number, mouseY: number, popup: HTMLElement): boolean {
  const rect = popup.getBoundingClientRect();
  return mouseX >= rect.left &&
         mouseX <= rect.right &&
         mouseY >= rect.top &&
         mouseY <= rect.bottom;
}

function hasActiveSelection(): boolean {
  const selection = window.getSelection();
  return selection ? selection.toString().trim().length > 0 : false;
}

function calculatePopupPosition(x: number, y: number, popupRect: DOMRect): { left: number; top: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = x + POPUP_OFFSET_PX;
  if (left + popupRect.width > viewportWidth) {
    left = x - popupRect.width - POPUP_OFFSET_PX;
  }

  let top = y - popupRect.height - POPUP_OFFSET_PX;
  if (top < VIEWPORT_MARGIN_PX) {
    top = y + POPUP_OFFSET_PX;
    if (top + popupRect.height > viewportHeight) {
      top = Math.max(VIEWPORT_MARGIN_PX, viewportHeight - popupRect.height - VIEWPORT_MARGIN_PX);
    }
  }

  left = Math.max(VIEWPORT_MARGIN_PX, Math.min(left, viewportWidth - popupRect.width - VIEWPORT_MARGIN_PX));
  return { left, top };
}

function positionPopup(popup: HTMLElement, x: number, y: number): void {
  const { left, top } = calculatePopupPosition(x, y, popup.getBoundingClientRect());
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}
