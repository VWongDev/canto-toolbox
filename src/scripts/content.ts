import type { DefinitionResult, DictionaryEntry } from '../types';
import { createElement, clearElement } from './dom-utils';
import { MessageManager } from './background.js';
import popupStyles from '../css/popup.css?raw';

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

class ChineseHoverPopupManager {
  private readonly document: Document;
  private readonly messageManager: MessageManager;
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHoveredWord: string | null = null;
  private lastHoveredOffset = -1;
  private currentPopup: HTMLElement | null = null;
  private currentSelection: SelectionData | null = null;
  private selectionPopupTimer: ReturnType<typeof setTimeout> | null = null;
  private isHoveringChinese = false;
  private lastHoveredElement: Node | null = null;
  private mousemoveThrottle: number | null = null;
  private lastMouseMoveTime = 0;
  private cachedPopupElement: HTMLElement | null = null;

  constructor(document: Document, chromeRuntime: typeof chrome.runtime) {
    this.document = document;
    this.messageManager = new MessageManager(chromeRuntime);
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
    if (!selection) {
      return;
    }
    
    const selectedText = selection.toString().trim();
    
    if (!selectedText || selectedText.length === 0) {
      if (this.currentSelection) {
        this.currentSelection = null;
        this.scheduleSelectionHide();
      }
      return;
    }

    const chineseWords = extractChineseWordsFromText(selectedText);
    if (chineseWords.length === 0) {
      return;
    }

    const word = chineseWords.join('');
    
    if (selection.rangeCount === 0) {
      return;
    }
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    this.currentSelection = { rect };
    this.lookupAndShowWord(word, rect.left + rect.width / 2, rect.top - 10);
  }

  private handleMouseOut(event: MouseEvent): void {
    if (this.currentSelection) {
      return;
    }
    
    const relatedTarget = event.relatedTarget as HTMLElement | null;
    if (relatedTarget && relatedTarget.closest('#chinese-hover-popup')) {
      this.clearHideTimer();
      return;
    }
    
    this.clearHideTimer();
    if (!this.isHoveringChinese && this.currentPopup) {
      const popup = this.getCachedPopupElement();
      if (!popup || !popup.matches(':hover')) {
        this.hidePopup();
        this.resetHoverState();
        this.lastHoveredWord = null;
      }
    }
  }

  private handleMouseMoveThrottled(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }
    
    if (this.currentSelection) {
      this.handleSelectionTracking(event);
      return;
    }
    
    if (target.closest('#chinese-hover-popup')) {
      this.clearHideTimer();
      this.isHoveringChinese = true;
      return;
    }
    
    if (hasActiveSelection()) {
      return;
    }
    
    const result = getChineseWordAtCursor(event);
    
    if (!result) {
      if (this.isHoveringChinese || this.currentPopup) {
        this.resetHoverState();
        this.clearHideTimer();
        this.hidePopup();
      }
      return;
    }
    
    const { word, textNode, offset } = result;
    
    this.isHoveringChinese = true;
    this.clearHideTimer();
    
    const characterChanged = this.hasCharacterChanged(textNode, offset);
    
    this.lastHoveredElement = textNode;
    this.lastHoveredOffset = offset;
    
    if (word !== this.lastHoveredWord || characterChanged) {
      this.lastHoveredWord = word;
      this.clearHoverTimer();
      const isDifferentWord = this.lastHoveredWord && this.lastHoveredWord !== word;
      if (isDifferentWord || characterChanged) {
        this.lookupAndShowWord(word, event.clientX, event.clientY);
      } else {
        this.hoverTimer = setTimeout(() => {
          this.lookupAndShowWord(word, event.clientX, event.clientY);
        }, HOVER_DEBOUNCE_MS);
      }
    }
  }

  private handleSelectionTracking(event: MouseEvent): void {
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    const rect = this.currentSelection!.rect;
    const popup = this.getCachedPopupElement();
    
    const overSelection = isMouseOverSelection(mouseX, mouseY, rect);
    const overPopup = isMouseOverPopup(mouseX, mouseY, popup);
    
    if (!overSelection && !overPopup) {
      this.clearSelectionPopupTimer();
      this.selectionPopupTimer = setTimeout(() => {
        if (!hasActiveSelection()) {
          this.currentSelection = null;
          this.hidePopup();
        }
      }, SELECTION_TRACKING_DELAY_MS);
    } else {
      this.clearSelectionPopupTimer();
    }
  }

  private lookupAndShowWord(word: string, x: number, y: number): void {
    if (this.currentPopup && this.currentPopup.dataset.word === word) {
      positionPopup(this.currentPopup, x, y);
      trackWordStatistics(word, this.messageManager);
      return;
    }

    this.messageManager.lookupWord(word, (response) => {
      if (response.success && 'definition' in response) {
        const displayWord = response.definition.word || word;
        this.showPopup(displayWord, response.definition, x, y);
      } else {
        console.error('[Content] Lookup failed:', response.error);
      }
    });
  }

  private showPopup(word: string, definition: DefinitionResult, x: number, y: number): void {
    this.hidePopup();
    this.clearHideTimer();

    const displayWord = definition.word || word;

    const popup = createElement({
      tag: 'div',
      id: 'chinese-hover-popup',
      className: 'chinese-hover-popup',
      dataset: { word },
      listeners: {
        mouseenter: () => {
          this.clearHideTimer();
          this.isHoveringChinese = true;
        },
        mouseleave: () => {
          if (!this.isHoveringChinese) {
            this.hidePopup();
          }
        }
      }
    });
    
    const wordEl = createElement({
      className: 'popup-word',
      textContent: displayWord
    });
    
    const sectionsContainer = createElement({
      className: 'popup-sections-container',
      children: [
        createMandarinSection(definition.mandarin),
        createCantoneseSection(definition.cantonese)
      ]
    });
    
    popup.appendChild(wordEl);
    popup.appendChild(sectionsContainer);

    this.document.body.appendChild(popup);
    this.currentPopup = popup;
    this.cachedPopupElement = popup;

    positionPopup(popup, x, y);
  }

  private hidePopup(): void {
    if (this.currentPopup) {
      this.currentPopup.remove();
      this.currentPopup = null;
      this.cachedPopupElement = null;
      this.lastHoveredWord = null;
      this.lastHoveredElement = null;
      this.lastHoveredOffset = -1;
    }
  }

  private clearHideTimer(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private clearHoverTimer(): void {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
  }

  private resetHoverState(): void {
    this.isHoveringChinese = false;
    this.lastHoveredElement = null;
    this.lastHoveredOffset = -1;
  }

  private scheduleSelectionHide(): void {
    this.clearSelectionPopupTimer();
    this.selectionPopupTimer = setTimeout(() => {
      if (!this.currentSelection) {
        this.hidePopup();
      }
    }, SELECTION_HIDE_DELAY_MS);
  }

  private clearSelectionPopupTimer(): void {
    if (this.selectionPopupTimer) {
      clearTimeout(this.selectionPopupTimer);
      this.selectionPopupTimer = null;
    }
  }

  private getCachedPopupElement(): HTMLElement | null {
    if (!this.cachedPopupElement) {
      this.cachedPopupElement = this.document.getElementById('chinese-hover-popup');
    }
    return this.cachedPopupElement;
  }

  private hasCharacterChanged(textNode: Node, offset: number): boolean {
    const isSameTextNode = textNode === this.lastHoveredElement;
    const offsetDiff = isSameTextNode ? Math.abs(offset - this.lastHoveredOffset) : 1;
    return !isSameTextNode || offsetDiff >= 0.5;
  }

  private injectStyles(): void {
    if (this.document.getElementById('chinese-hover-styles')) {
      return;
    }

    const style = createElement<HTMLStyleElement>({
      tag: 'style',
      id: 'chinese-hover-styles'
    });
    style.textContent = popupStyles;
    this.document.head.appendChild(style);
  }
}

const popupManager = new ChineseHoverPopupManager(document, chrome.runtime);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => popupManager.init());
} else {
  popupManager.init();
}

function getTextNodeAtCursor(event: MouseEvent): { textNode: Text; offset: number } | null {
  const range = document.caretRangeFromPoint(event.clientX, event.clientY);
  if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
    return {
      textNode: range.startContainer as Text,
      offset: range.startOffset
    };
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
    
    if (start > offset) {
      break;
    }
  }
  
  return null;
}

function getChineseWordAtCursor(event: MouseEvent): CursorResult | null {
  const cursorData = getTextNodeAtCursor(event);
  if (!cursorData || cursorData.offset < 0 || !cursorData.textNode.textContent) {
    return null;
  }
  
  const text = cursorData.textNode.textContent;
  const word = extractChineseWordFromText(text, cursorData.offset);
  if (!word) {
    return null;
  }
  
  return {
    word,
    textNode: cursorData.textNode,
    offset: cursorData.offset
  };
}

function extractChineseWordsFromText(text: string): string[] {
  const matches = text.match(CHINESE_REGEX);
  return matches || [];
}

function isMouseOverSelection(mouseX: number, mouseY: number, rect: DOMRect): boolean {
  return mouseX >= rect.left - SELECTION_PADDING_PX && 
         mouseX <= rect.right + SELECTION_PADDING_PX &&
         mouseY >= rect.top - SELECTION_PADDING_PX && 
         mouseY <= rect.bottom + SELECTION_PADDING_PX;
}

function isMouseOverPopup(mouseX: number, mouseY: number, popup: HTMLElement | null): boolean {
  if (!popup) return false;
  return mouseX >= popup.offsetLeft && 
         mouseX <= popup.offsetLeft + popup.offsetWidth &&
         mouseY >= popup.offsetTop && 
         mouseY <= popup.offsetTop + popup.offsetHeight;
}

function hasActiveSelection(): boolean {
  const selection = window.getSelection();
  return selection ? selection.toString().trim().length > 0 : false;
}

function trackWordStatistics(word: string, messageManager: MessageManager): void {
  messageManager.trackWord(word, (response) => {
    if (!response.success) {
      console.warn('[Content] Statistics tracking failed:', response.error);
    }
  });
}

function createDefinitionElement(definitions: string[]): HTMLElement {
  return createElement({
    className: 'popup-definition',
    children: definitions.map(def => 
      createElement({
        className: 'popup-definition-item',
        textContent: def
      })
    )
  });
}

function groupEntriesByPronunciation(entries: Array<{ romanisation?: string; definitions?: string[] }>): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const entry of entries) {
    const pronunciation = entry.romanisation || '';
    if (!grouped[pronunciation]) {
      grouped[pronunciation] = [];
    }
    const defs = entry.definitions || [];
    grouped[pronunciation].push(...defs.filter(d => d && String(d).trim().length > 0));
  }
  return grouped;
}

function createPronunciationGrid(groupedPronunciations: Record<string, string[]>, pronunciationKey: 'pinyin' | 'jyutping'): HTMLElement {
  const pronunciationKeys = Object.keys(groupedPronunciations);
  const pronunciationCount = Math.min(pronunciationKeys.length, 2);
  const className = pronunciationKey === 'pinyin' ? 'popup-pinyin' : 'popup-jyutping';
  
  return createElement({
    className: 'popup-pronunciations-grid',
    dataset: { count: String(pronunciationCount) },
    children: Object.entries(groupedPronunciations).map(([pronunciation, defs]) => {
      const hasDefinition = defs && defs.length > 0;
      
      const groupChildren: HTMLElement[] = [
        createElement({
          className,
          textContent: pronunciation
        })
      ];
      
      if (hasDefinition) {
        groupChildren.push(createDefinitionElement(defs));
      }
      
      return createElement({
        className: 'popup-pronunciation-group',
        children: groupChildren
      });
    })
  });
}

function createPronunciationSection(
  data: DefinitionResult['mandarin'] | DefinitionResult['cantonese'],
  label: string,
  pronunciationKey: 'pinyin' | 'jyutping'
): HTMLElement {
  const entries = data?.entries || [];
  const grouped = groupEntriesByPronunciation(entries);
  const grid = createPronunciationGrid(grouped, pronunciationKey);
  
  return createElement({
    className: 'popup-section',
    children: [
      createElement({
        className: 'popup-label',
        textContent: label
      }),
      grid
    ]
  });
}

function createMandarinSection(mandarinData: DefinitionResult['mandarin']): HTMLElement {
  return createPronunciationSection(mandarinData, 'Mandarin', 'pinyin');
}

function createCantoneseSection(cantoneseData: DefinitionResult['cantonese']): HTMLElement {
  return createPronunciationSection(cantoneseData, 'Cantonese', 'jyutping');
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
  const popupRect = popup.getBoundingClientRect();
  const { left, top } = calculatePopupPosition(x, y, popupRect);
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}
