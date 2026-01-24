import type { DefinitionResult, DictionaryEntry } from '../types';
import { createElement, clearElement } from './dom-utils';

const CHINESE_REGEX = /[\u4e00-\u9fff]+/g;
const MAX_WORD_LENGTH = 4;
const THROTTLE_INTERVAL_MS = 16;
const HOVER_DEBOUNCE_MS = 50;
const SELECTION_HIDE_DELAY_MS = 200;
const SELECTION_TRACKING_DELAY_MS = 300;
const POPUP_OFFSET_PX = 15;
const SELECTION_PADDING_PX = 10;
const VIEWPORT_MARGIN_PX = 10;

let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let lastHoveredWord: string | null = null;
let lastHoveredOffset = -1;
let currentPopup: HTMLElement | null = null;

interface SelectionData {
  rect: DOMRect;
}

let currentSelection: SelectionData | null = null;
let selectionPopupTimer: ReturnType<typeof setTimeout> | null = null;
let isHoveringChinese = false;
let lastHoveredElement: Node | null = null;
let mousemoveThrottle: number | null = null;
let lastMouseMoveTime = 0;
let cachedSelection: boolean | null = null;
let cachedPopupElement: HTMLElement | null = null;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init(): void {
  injectStyles();
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  document.addEventListener('mouseup', handleSelection, true);
}

function injectStyles(): void {
  if (document.getElementById('chinese-hover-styles')) {
    return;
  }

  const style = createElement<HTMLStyleElement>({
    tag: 'style',
    id: 'chinese-hover-styles'
  });
  style.textContent = `
    .chinese-hover-popup {
      position: fixed;
      z-index: 999999;
      background: #ffffff;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 12px;
      min-width: 500px;
      max-width: 900px;
      width: auto;
      height: auto;
      max-height: 80vh;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      color: #333;
      pointer-events: auto;
      box-sizing: border-box;
    }
    .popup-sections-container {
      display: flex;
      flex-direction: row;
      gap: 24px;
      align-items: flex-start;
      min-width: 0;
      width: 100%;
    }
    .popup-word {
      font-size: 24px;
      font-weight: bold;
      color: #1a1a1a;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 2px solid #e0e0e0;
      text-align: center;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    .popup-section {
      flex: 1;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      box-sizing: border-box;
    }
    .popup-pronunciations-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      max-width: 100%;
      width: 100%;
      box-sizing: border-box;
    }
    .popup-pronunciations-grid[data-count="1"] {
      grid-template-columns: minmax(0, 1fr);
    }
    .popup-pronunciations-grid[data-count="2"] {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    @media (max-width: 600px) {
      .popup-pronunciations-grid {
        grid-template-columns: 1fr;
      }
    }
    .popup-pronunciation-group {
      margin-bottom: 0;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      box-sizing: border-box;
    }
    .popup-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: #666;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
      overflow-wrap: break-word;
      word-wrap: break-word;
      max-width: 100%;
    }
    .popup-pinyin,
    .popup-jyutping {
      font-size: 16px;
      color: #0066cc;
      font-weight: 500;
      margin-bottom: 4px;
      font-family: 'Arial', sans-serif;
      overflow-wrap: break-word;
      word-wrap: break-word;
      word-break: break-word;
      max-width: 100%;
    }
    .popup-definition {
      font-size: 13px;
      color: #555;
      line-height: 1.5;
      overflow-wrap: break-word;
      word-wrap: break-word;
      word-break: break-word;
      max-width: 100%;
      hyphens: auto;
      box-sizing: border-box;
    }
    .popup-label {
      overflow-wrap: break-word;
      word-wrap: break-word;
      max-width: 100%;
    }
    .popup-definition-item {
      margin-bottom: 3px;
    }
    .popup-definition-item:last-child {
      margin-bottom: 0;
    }
    @media (prefers-color-scheme: dark) {
      .chinese-hover-popup {
        background: #2d2d2d;
        border-color: #444;
        color: #e0e0e0;
      }
      .popup-word {
        color: #ffffff;
        border-bottom-color: #444;
      }
      .popup-label {
        color: #aaa;
      }
      .popup-pinyin,
      .popup-jyutping {
        color: #4da6ff;
      }
      .popup-definition {
        color: #ccc;
      }
      .popup-definition-item {
        margin-bottom: 6px;
      }
      .popup-definition-item:last-child {
        margin-bottom: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

interface CursorResult {
  word: string;
  textNode: Text;
  offset: number;
}

function getTextNodeAtCursor(event: MouseEvent): { textNode: Text; offset: number } | null {
  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(event.clientX, event.clientY);
    if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
      return {
        textNode: range.startContainer as Text,
        offset: range.startOffset
      };
    }
  } else if ((document as any).caretPositionFromPoint) {
    const pos = (document as any).caretPositionFromPoint(event.clientX, event.clientY);
    if (pos && pos.offsetNode.nodeType === Node.TEXT_NODE) {
      return {
        textNode: pos.offsetNode as Text,
        offset: pos.offset
      };
    }
  }
  return null;
}

function isChineseCharacter(char: string): boolean {
  return /[\u4e00-\u9fff]/.test(char);
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
  const charAtOffset = text.charAt(cursorData.offset);
  
  if (!isChineseCharacter(charAtOffset)) {
    return null;
  }
  
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

function clearSelectionPopupTimer(): void {
  if (selectionPopupTimer) {
    clearTimeout(selectionPopupTimer);
    selectionPopupTimer = null;
  }
}

function scheduleSelectionHide(): void {
  clearSelectionPopupTimer();
  selectionPopupTimer = setTimeout(() => {
    if (!currentSelection) {
      hidePopup();
    }
  }, SELECTION_HIDE_DELAY_MS);
}

function handleSelection(event: MouseEvent): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  
  const selectedText = selection.toString().trim();
  cachedSelection = selectedText.length > 0;
  
  if (!selectedText || selectedText.length === 0) {
    cachedSelection = false;
    if (currentSelection) {
      currentSelection = null;
      scheduleSelectionHide();
    }
    return;
  }

  if (!isChineseCharacter(selectedText)) {
    return;
  }

  const chineseWords = extractChineseWordsFromText(selectedText);
  if (chineseWords.length === 0) {
    return;
  }

  const word = chineseWords.length === 1 ? chineseWords[0] : chineseWords.join('');
  
  if (selection.rangeCount === 0) {
    return;
  }
  
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  
  currentSelection = { rect };
  lookupAndShowWord(word, rect.left + rect.width / 2, rect.top - 10);
}

function handleMouseMove(event: MouseEvent): void {
  const now = Date.now();
  if (now - lastMouseMoveTime < THROTTLE_INTERVAL_MS) {
    if (!mousemoveThrottle) {
      mousemoveThrottle = requestAnimationFrame(() => {
        handleMouseMoveThrottled(event);
        mousemoveThrottle = null;
        lastMouseMoveTime = Date.now();
      });
    }
    return;
  }
  lastMouseMoveTime = now;
  handleMouseMoveThrottled(event);
}

function getCachedPopupElement(): HTMLElement | null {
  if (!cachedPopupElement) {
    cachedPopupElement = document.getElementById('chinese-hover-popup');
  }
  return cachedPopupElement;
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

function updateCachedSelection(): void {
  if (cachedSelection === null) {
    const selection = window.getSelection();
    cachedSelection = selection ? selection.toString().trim().length > 0 : false;
  }
}

function handleSelectionTracking(event: MouseEvent): void {
  const mouseX = event.clientX;
  const mouseY = event.clientY;
  const rect = currentSelection!.rect;
  const popup = getCachedPopupElement();
  
  const overSelection = isMouseOverSelection(mouseX, mouseY, rect);
  const overPopup = isMouseOverPopup(mouseX, mouseY, popup);
  
  if (!overSelection && !overPopup) {
    clearSelectionPopupTimer();
    selectionPopupTimer = setTimeout(() => {
      updateCachedSelection();
      if (!cachedSelection || (!overSelection && !overPopup)) {
        currentSelection = null;
        hidePopup();
      }
    }, SELECTION_TRACKING_DELAY_MS);
  } else {
    clearSelectionPopupTimer();
  }
}

function isNonTextElement(tagName: string): boolean {
  return tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'NOSCRIPT';
}

function clearHideTimer(): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function clearHoverTimer(): void {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
}

function resetHoverState(): void {
  isHoveringChinese = false;
  lastHoveredElement = null;
  lastHoveredOffset = -1;
}

function hasCharacterChanged(textNode: Node, offset: number): boolean {
  const isSameTextNode = textNode === lastHoveredElement;
  const offsetDiff = isSameTextNode ? Math.abs(offset - lastHoveredOffset) : 1;
  return !isSameTextNode || offsetDiff >= 0.5;
}

function handleMouseMoveThrottled(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (!target) {
    return;
  }
  
  if (currentSelection) {
    handleSelectionTracking(event);
    return;
  }
  
  if (target.closest('#chinese-hover-popup')) {
    clearHideTimer();
    isHoveringChinese = true;
    return;
  }
  
  updateCachedSelection();
  if (cachedSelection) {
    return;
  }
  
  if (isNonTextElement(target.tagName)) {
    if (isHoveringChinese) {
      resetHoverState();
      clearHideTimer();
      hidePopup();
    }
    return;
  }
  
  const result = getChineseWordAtCursor(event);
  
  if (!result) {
    if (isHoveringChinese || currentPopup) {
      resetHoverState();
      clearHideTimer();
      hidePopup();
    }
    return;
  }
  
  const { word, textNode, offset } = result;
  
  isHoveringChinese = true;
  clearHideTimer();
  cachedSelection = false;
  
  const characterChanged = hasCharacterChanged(textNode, offset);
  
  lastHoveredElement = textNode;
  lastHoveredOffset = offset;
  
  if (word !== lastHoveredWord || characterChanged) {
    lastHoveredWord = word;
    clearHoverTimer();
    const isDifferentWord = lastHoveredWord && lastHoveredWord !== word;
    if (isDifferentWord || characterChanged) {
      lookupAndShowWord(word, event.clientX, event.clientY);
    } else {
      hoverTimer = setTimeout(() => {
        lookupAndShowWord(word, event.clientX, event.clientY);
      }, HOVER_DEBOUNCE_MS);
    }
  }
}

function handleMouseOut(event: MouseEvent): void {
  if (currentSelection) {
    return;
  }
  
  const relatedTarget = event.relatedTarget as HTMLElement | null;
  if (relatedTarget && relatedTarget.closest('#chinese-hover-popup')) {
    clearHideTimer();
    return;
  }
  
  clearHideTimer();
  if (!isHoveringChinese && currentPopup) {
    const popup = cachedPopupElement || document.getElementById('chinese-hover-popup');
    if (!popup || !popup.matches(':hover')) {
      hidePopup();
      resetHoverState();
      lastHoveredWord = null;
    }
  }
}

function trackWordStatistics(word: string): void {
  chrome.runtime.sendMessage(
    { type: 'track_word', word: word },
    (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[Content] Statistics tracking error:', chrome.runtime.lastError);
      } else if (response && !response.success) {
        console.warn('[Content] Statistics tracking failed:', response.error);
      }
    }
  );
}

function lookupAndShowWord(word: string, x: number, y: number): void {
  if (currentPopup && currentPopup.dataset.word === word) {
    positionPopup(currentPopup, x, y);
    trackWordStatistics(word);
    return;
  }

  chrome.runtime.sendMessage(
    { type: 'lookup_word', word: word },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('Extension error:', chrome.runtime.lastError);
        const errorMessage = chrome.runtime.lastError.message || 'Unknown error';
        showErrorPopup(word, x, y, errorMessage);
        return;
      }

      if (response && response.success && 'definition' in response && response.definition) {
        const displayWord = response.definition.word || word;
        showPopup(displayWord, response.definition, x, y);
      } else {
        const errorMsg = response && 'error' in response ? response.error : 'Lookup failed';
        console.error('Lookup failed:', errorMsg);
        const errorDef: DefinitionResult = {
          word: word,
          mandarin: { entries: [{
            traditional: word,
            simplified: word,
            romanisation: '',
            definitions: [errorMsg || 'Lookup failed']
          }] },
          cantonese: { entries: [{
            traditional: word,
            simplified: word,
            romanisation: '',
            definitions: ['Not available']
          }] }
        };
        showPopup(word, errorDef, x, y);
      }
    }
  );
}

function showErrorPopup(word: string, x: number, y: number, error: string): void {
  const errorDef: DefinitionResult = {
    word: word,
    mandarin: { entries: [{
      traditional: word,
      simplified: word,
      romanisation: '',
      definitions: [`Error: ${error}`]
    }] },
    cantonese: { entries: [{
      traditional: word,
      simplified: word,
      romanisation: '',
      definitions: ['Not available']
    }] }
  };
  showPopup(word, errorDef, x, y);
}

function createDefinitionElement(definitions: string[] | undefined): HTMLElement {
  if (!definitions || definitions.length === 0) {
    return createElement({
      className: 'popup-definition',
      textContent: 'Not found'
    });
  }
  
  if (definitions.length === 1) {
    return createElement({
      className: 'popup-definition',
      textContent: definitions[0]
    });
  }
  
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

function getRomanisationFromEntries(entries: DictionaryEntry[]): string {
  if (entries.length === 0) return 'N/A';
  if (entries.length === 1) return entries[0].romanisation || 'N/A';
  
  const pronunciations = new Set<string>();
  for (const entry of entries) {
    if (entry.romanisation) {
      pronunciations.add(entry.romanisation);
    }
  }
  return Array.from(pronunciations).join(', ');
}

function getDefinitionsFromEntries(entries: DictionaryEntry[]): string[] {
  const allDefinitions: string[] = [];
  for (const entry of entries) {
    const defs = entry.definitions || [];
    allDefinitions.push(...defs.filter(d => d && String(d).trim().length > 0));
  }
  return allDefinitions;
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

function createMandarinSection(mandarinData: DefinitionResult['mandarin']): HTMLElement {
  if (!mandarinData || !mandarinData.entries || mandarinData.entries.length <= 1) {
    const entries = mandarinData?.entries || [];
    const romanisation = getRomanisationFromEntries(entries);
    const definitions = getDefinitionsFromEntries(entries);
    
    return createElement({
      className: 'popup-section',
      children: [
        createElement({
          className: 'popup-label',
          textContent: 'Mandarin'
        }),
        createElement({
          className: 'popup-pinyin',
          textContent: romanisation
        }),
        createDefinitionElement(definitions)
      ]
    });
  }
  
  const groupedByPinyin = groupEntriesByPronunciation(mandarinData.entries);
  const grid = createPronunciationGrid(groupedByPinyin, 'pinyin');
  
  return createElement({
    className: 'popup-section',
    children: [
      createElement({
        className: 'popup-label',
        textContent: 'Mandarin'
      }),
      grid
    ]
  });
}

function createCantoneseSection(cantoneseData: DefinitionResult['cantonese']): HTMLElement {
  if (!cantoneseData || !cantoneseData.entries || cantoneseData.entries.length <= 1) {
    const entries = cantoneseData?.entries || [];
    const romanisation = getRomanisationFromEntries(entries);
    const definitions = getDefinitionsFromEntries(entries);
    const hasDefinition = definitions.length > 0;
    
    const children: HTMLElement[] = [
      createElement({
        className: 'popup-label',
        textContent: 'Cantonese'
      }),
      createElement({
        className: 'popup-jyutping',
        textContent: romanisation
      })
    ];
    
    if (hasDefinition) {
      children.push(createDefinitionElement(definitions));
    }
    
    return createElement({
      className: 'popup-section',
      children
    });
  }
  
  const groupedByJyutping = groupEntriesByPronunciation(cantoneseData.entries);
  const grid = createPronunciationGrid(groupedByJyutping, 'jyutping');
  
  return createElement({
    className: 'popup-section',
    children: [
      createElement({
        className: 'popup-label',
        textContent: 'Cantonese'
      }),
      grid
    ]
  });
}

function showPopup(word: string, definition: DefinitionResult, x: number, y: number): void {
  hidePopup();
  clearHideTimer();

  const displayWord = definition.word || word;

  const popup = createElement({
    tag: 'div',
    id: 'chinese-hover-popup',
    className: 'chinese-hover-popup',
    dataset: { word },
    listeners: {
      mouseenter: () => {
        clearHideTimer();
        isHoveringChinese = true;
      },
      mouseleave: () => {
        if (!isHoveringChinese) {
          hidePopup();
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

  document.body.appendChild(popup);
  currentPopup = popup;
  cachedPopupElement = popup;

  positionPopup(popup, x, y);
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

function hidePopup(): void {
  if (currentPopup) {
    currentPopup.remove();
    currentPopup = null;
    cachedPopupElement = null;
    lastHoveredWord = null;
    lastHoveredElement = null;
    lastHoveredOffset = -1;
  }
}

