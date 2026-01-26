import type { DefinitionResult, LookupResponse, ErrorResponse } from '../types';
import { createElement } from '../utils/dom-element';
import { messageManager, type MessageManager } from './background.js';
import popupStyles from '../css/popup.css?raw';
import { createPronunciationSection, type PronunciationSectionConfig } from '../utils/pronunciation-section.js';

const CHINESE_REGEX = /[\u4e00-\u9fff]+/g;
const MAX_WORD_LENGTH = 4;
const THROTTLE_INTERVAL_MS = 16;
const HOVER_DEBOUNCE_MS = 50;
const SELECTION_HIDE_DELAY_MS = 200;
const SELECTION_TRACKING_DELAY_MS = 300;
const POPUP_OFFSET_PX = 15;
const SELECTION_PADDING_PX = 10;
const VIEWPORT_MARGIN_PX = 10;

interface SelectionData {
  rect: DOMRect;
}

interface CursorResult {
  word: string;
  textNode: Text;
  offset: number;
}

export class ChineseHoverPopupManager {
  private readonly document: Document;
  private readonly messageManager: MessageManager;
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private selectionPopupTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHoveredWord: string | null = null;
  private lastHoveredOffset = -1;
  private currentPopup: HTMLElement | null = null;
  private currentSelection: SelectionData | null = null;
  private isHoveringChinese = false;
  private lastHoveredElement: Node | null = null;
  private mousemoveThrottle: number | null = null;
  private lastMouseMoveTime = 0;

  constructor(document: Document, messageManager: MessageManager) {
    this.document = document;
    this.messageManager = messageManager;
  }

  init(): void {
    this.injectStyles();
    this.document.addEventListener('mousemove', (e) => this.handleMouseMove(e), true);
    this.document.addEventListener('mouseout', (e) => this.handleMouseOut(e), true);
    this.document.addEventListener('mouseup', (e) => this.handleSelection(e), true);
  }

  private handleMouseMove(event: MouseEvent): void {
    const now = Date.now();
    if (now - this.lastMouseMoveTime < THROTTLE_INTERVAL_MS) {
      if (!this.mousemoveThrottle) {
        this.mousemoveThrottle = requestAnimationFrame(() => {
          this.handleMouseMoveThrottled(event);
          this.mousemoveThrottle = null;
          this.lastMouseMoveTime = Date.now();
        });
      }
      return;
    }
    this.lastMouseMoveTime = now;
    this.handleMouseMoveThrottled(event);
  }

  private handleSelection(event: MouseEvent): void {
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
    this.currentSelection = { rect };
    this.lookupAndShowWord(chineseWords.join(''), rect.left + rect.width / 2, rect.top - 10);
  }

  private handleMouseOut(event: MouseEvent): void {
    if (this.currentSelection) return;
    
    const relatedTarget = event.relatedTarget as HTMLElement | null;
    if (relatedTarget?.closest('#chinese-hover-popup')) {
      this.clearTimer('hide');
      return;
    }
    
    this.clearTimer('hide');
    if (!this.isHoveringChinese && this.currentPopup && !this.currentPopup.matches(':hover')) {
      this.hidePopup();
      this.resetHoverState();
    }
  }

  private handleMouseMoveThrottled(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    
    if (this.currentSelection) {
      this.handleSelectionTracking(event);
      return;
    }
    
    if (target.closest('#chinese-hover-popup')) {
      this.clearTimer('hide');
      this.isHoveringChinese = true;
      return;
    }
    
    if (hasActiveSelection()) return;
    
    const result = getChineseWordAtCursor(event);
    if (!result) {
      if (this.isHoveringChinese || this.currentPopup) {
        this.resetHoverState();
        this.clearTimer('hide');
        this.hidePopup();
      }
      return;
    }
    
    const { word, textNode, offset } = result;
    this.isHoveringChinese = true;
    this.clearTimer('hide');
    
    const characterChanged = textNode !== this.lastHoveredElement || 
                            Math.abs(offset - this.lastHoveredOffset) >= 0.5;
    this.lastHoveredElement = textNode;
    this.lastHoveredOffset = offset;
    
    if (word !== this.lastHoveredWord || characterChanged) {
      this.lastHoveredWord = word;
      this.clearTimer('hover');
      if (characterChanged) {
        this.lookupAndShowWord(word, event.clientX, event.clientY);
      } else {
        this.hoverTimer = setTimeout(() => {
          this.lookupAndShowWord(word, event.clientX, event.clientY);
        }, HOVER_DEBOUNCE_MS);
      }
    }
  }

  private handleSelectionTracking(event: MouseEvent): void {
    const { clientX: mouseX, clientY: mouseY } = event;
    const rect = this.currentSelection!.rect;
    const popup = this.currentPopup;
    
    const overSelection = isMouseOverSelection(mouseX, mouseY, rect);
    const overPopup = popup && isMouseOverPopup(mouseX, mouseY, popup);
    
    if (!overSelection && !overPopup) {
      this.clearTimer('selection');
      this.selectionPopupTimer = setTimeout(() => {
        if (!hasActiveSelection()) {
          this.currentSelection = null;
          this.hidePopup();
        }
      }, SELECTION_TRACKING_DELAY_MS);
    } else {
      this.clearTimer('selection');
    }
  }

  private lookupAndShowWord(word: string, x: number, y: number): void {
    if (this.currentPopup?.dataset.word === word) {
      positionPopup(this.currentPopup, x, y);
      this.messageManager.trackWord(word, () => {});
      return;
    }

    this.messageManager.lookupWord(word, (response: LookupResponse | ErrorResponse) => {
      if (response.success && 'definition' in response) {
        this.showPopup(response.definition.word || word, response.definition, x, y);
      } else {
        console.error('[Content] Lookup failed:', response.error);
      }
    });
  }

  private showPopup(word: string, definition: DefinitionResult, x: number, y: number): void {
    this.hidePopup();
    this.clearTimer('hide');

    const popup = createElement({
      tag: 'div',
      id: 'chinese-hover-popup',
      className: 'chinese-hover-popup',
      dataset: { word },
      listeners: {
        mouseenter: () => {
          this.clearTimer('hide');
          this.isHoveringChinese = true;
        },
        mouseleave: () => {
          if (!this.isHoveringChinese) this.hidePopup();
        }
      }
    });
    
    popup.appendChild(createElement({ className: 'popup-word', textContent: definition.word || word }));
    popup.appendChild(createElement({
      className: 'popup-sections-container',
      children: [
        createMandarinSection(definition.mandarin),
        createCantoneseSection(definition.cantonese)
      ]
    }));

    this.document.body.appendChild(popup);
    this.currentPopup = popup;
    positionPopup(popup, x, y);
  }

  private hidePopup(): void {
    if (this.currentPopup) {
      this.currentPopup.remove();
      this.currentPopup = null;
      this.lastHoveredWord = null;
      this.lastHoveredElement = null;
      this.lastHoveredOffset = -1;
    }
  }

  private clearTimer(type: 'hide' | 'hover' | 'selection'): void {
    const timer = type === 'hide' ? this.hideTimer : type === 'hover' ? this.hoverTimer : this.selectionPopupTimer;
    if (timer) {
      clearTimeout(timer);
      if (type === 'hide') this.hideTimer = null;
      else if (type === 'hover') this.hoverTimer = null;
      else this.selectionPopupTimer = null;
    }
  }

  private resetHoverState(): void {
    this.isHoveringChinese = false;
    this.lastHoveredElement = null;
    this.lastHoveredOffset = -1;
  }

  private scheduleSelectionHide(): void {
    this.clearTimer('selection');
    this.selectionPopupTimer = setTimeout(() => {
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

export const popupManager = new ChineseHoverPopupManager(document, messageManager);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => popupManager.init());
} else {
  popupManager.init();
}

function getTextNodeAtCursor(event: MouseEvent): { textNode: Text; offset: number } | null {
  const range = document.caretRangeFromPoint(event.clientX, event.clientY);
  if (range?.startContainer.nodeType === Node.TEXT_NODE) {
    return { textNode: range.startContainer as Text, offset: range.startOffset };
  }
  return null;
}

function extractChineseWordFromText(text: string, offset: number): string | null {
  const chineseRegex = /[\u4e00-\u9fff]+/g;
  let match;
  
  while ((match = chineseRegex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    
    if (offset >= start && offset < end) {
      const relativeOffset = offset - start;
      const maxLength = Math.min(MAX_WORD_LENGTH, match[0].length - relativeOffset);
      return match[0].substring(relativeOffset, relativeOffset + maxLength);
    }
    
    if (start > offset) break;
  }
  
  return null;
}

function getChineseWordAtCursor(event: MouseEvent): CursorResult | null {
  const cursorData = getTextNodeAtCursor(event);
  if (!cursorData?.textNode.textContent || cursorData.offset < 0) return null;
  
  const word = extractChineseWordFromText(cursorData.textNode.textContent, cursorData.offset);
  return word ? { word, textNode: cursorData.textNode, offset: cursorData.offset } : null;
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
  return mouseX >= popup.offsetLeft && 
         mouseX <= popup.offsetLeft + popup.offsetWidth &&
         mouseY >= popup.offsetTop && 
         mouseY <= popup.offsetTop + popup.offsetHeight;
}

function hasActiveSelection(): boolean {
  const selection = window.getSelection();
  return selection ? selection.toString().trim().length > 0 : false;
}

function createPopupDefinitionElement(definitions: string[]): HTMLElement {
  return createElement({
    className: 'popup-definition',
    children: definitions.map(def => 
      createElement({ className: 'popup-definition-item', textContent: def })
    )
  });
}

const popupPronunciationConfig: PronunciationSectionConfig = {
  sectionClassName: 'popup-section',
  labelClassName: 'popup-label',
  pronunciationClassName: (key) => key === 'pinyin' ? 'popup-pinyin' : 'popup-jyutping',
  groupClassName: 'popup-pronunciation-group',
  createDefinitionElement: createPopupDefinitionElement
};

function createPronunciationSectionForPopup(
  data: DefinitionResult['mandarin'] | DefinitionResult['cantonese'],
  label: string,
  pronunciationKey: 'pinyin' | 'jyutping'
): HTMLElement {
  return createPronunciationSection(data, label, pronunciationKey, popupPronunciationConfig);
}

function createMandarinSection(mandarinData: DefinitionResult['mandarin']): HTMLElement {
  return createPronunciationSectionForPopup(mandarinData, 'Mandarin', 'pinyin');
}

function createCantoneseSection(cantoneseData: DefinitionResult['cantonese']): HTMLElement {
  return createPronunciationSectionForPopup(cantoneseData, 'Cantonese', 'jyutping');
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
