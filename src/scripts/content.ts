// content.ts - Content script for detecting Chinese words on hover

import type { DefinitionResult } from '../types';

// Chinese character regex pattern
const CHINESE_REGEX = /[\u4e00-\u9fff]+/g;

// Debounce timer
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null; // Timer for hiding popup
let lastHoveredWord: string | null = null;
let lastHoveredOffset = -1; // Track last cursor offset for horizontal movement detection
let currentPopup: HTMLElement | null = null;
interface SelectionData {
  rect: DOMRect;
}
let currentSelection: SelectionData | null = null; // Track current selection for popup
let selectionPopupTimer: ReturnType<typeof setTimeout> | null = null;
let isHoveringChinese = false; // Track if currently hovering over Chinese text
let lastHoveredElement: Node | null = null; // Track last element we were hovering over
let mousemoveThrottle: number | null = null; // Throttle mousemove handler
let lastMouseMoveTime = 0; // Track last mousemove execution time
let cachedSelection: boolean | null = null; // Cache selection check
let cachedPopupElement: HTMLElement | null = null; // Cache popup element reference

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init(): void {
  // Inject CSS styles
  injectStyles();
  
  // Use mousemove as primary detection method (like Zhongwen)
  // This allows real-time checking of character under cursor
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  
  // Add selection listener for multi-word searches
  document.addEventListener('mouseup', handleSelection, true);
  
  // Debug: log initialization
  console.log('Chinese Word Hover extension initialized');
}

/**
 * Inject CSS styles into the page
 */
function injectStyles(): void {
  if (document.getElementById('chinese-hover-styles')) {
    return; // Already injected
  }

  const style = document.createElement('style');
  style.id = 'chinese-hover-styles';
  style.textContent = `
    .chinese-hover-popup {
      position: fixed;
      z-index: 999999;
      background: #ffffff;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 12px;
      min-width: 400px;
      max-width: 600px;
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
      gap: 16px;
      align-items: flex-start;
    }
    .popup-word {
      font-size: 24px;
      font-weight: bold;
      color: #1a1a1a;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 2px solid #e0e0e0;
      text-align: center;
    }
    .popup-section {
      flex: 1;
      min-width: 0;
      flex-shrink: 0;
    }
    .popup-pronunciation-group {
      margin-bottom: 8px;
    }
    .popup-pronunciation-group:last-child {
      margin-bottom: 0;
    }
    .popup-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: #666;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
    }
    .popup-pinyin,
    .popup-jyutping {
      font-size: 16px;
      color: #0066cc;
      font-weight: 500;
      margin-bottom: 4px;
      font-family: 'Arial', sans-serif;
    }
    .popup-definition {
      font-size: 13px;
      color: #555;
      line-height: 1.5;
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

/**
 * Get the Chinese character/word at the exact cursor position
 * Inspired by Zhongwen's approach: check character first, then extract word
 * Returns {word, textNode, offset} or null if not over Chinese text
 */
function getChineseWordAtCursor(event: MouseEvent): CursorResult | null {
  // Get the text node at cursor position using the most reliable method
  let textNode: Text | null = null;
  let offset = -1;
  
  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(event.clientX, event.clientY);
    if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
      textNode = range.startContainer as Text;
      offset = range.startOffset;
    }
  } else if ((document as any).caretPositionFromPoint) {
    const pos = (document as any).caretPositionFromPoint(event.clientX, event.clientY);
    if (pos && pos.offsetNode.nodeType === Node.TEXT_NODE) {
      textNode = pos.offsetNode as Text;
      offset = pos.offset;
    }
  }
  
  // Must have a valid text node with valid offset
  if (!textNode || offset < 0 || !textNode.textContent) {
    return null;
  }
  
  const text = textNode.textContent;
  
  // CRITICAL: Check the exact character at cursor position FIRST
  // This is the key - we must verify the character is Chinese before doing anything else
  const charAtOffset = text.charAt(offset);
  
  // Only proceed if the character at the exact cursor position is Chinese
  if (!/[\u4e00-\u9fff]/.test(charAtOffset)) {
    return null;
  }
  
  // Find the Chinese character sequence containing this position
  const chineseRegex = /[\u4e00-\u9fff]+/g;
  let match;
  while ((match = chineseRegex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    
    // Check if cursor is within this Chinese sequence
    if (offset >= start && offset < end) {
      // Extract up to 4 characters starting from cursor position
      const relativeOffset = offset - start;
      const maxLength = Math.min(4, match[0].length - relativeOffset);
      const word = match[0].substring(relativeOffset, relativeOffset + maxLength);
      
      return {
        word: word,
        textNode: textNode,
        offset: offset
      };
    }
    
    // Early exit optimization: if we've passed the cursor position, no need to continue
    if (start > offset) {
      break;
    }
  }
  
  return null;
}


/**
 * Handle text selection for multi-word searches
 * Preserves default highlight behavior and shows popup
 */
function handleSelection(event: MouseEvent): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  
  const selectedText = selection.toString().trim();
  cachedSelection = selectedText.length > 0; // Update cache
  
  if (!selectedText || selectedText.length === 0) {
    // Selection cleared - hide popup if it was from selection
    cachedSelection = false; // Update cache
    if (currentSelection) {
      currentSelection = null;
      // Don't hide immediately, wait to see if user is moving to popup
      if (selectionPopupTimer) {
        clearTimeout(selectionPopupTimer);
      }
      selectionPopupTimer = setTimeout(() => {
        if (!currentSelection) {
          hidePopup();
        }
      }, 200);
    }
    return;
  }

  // Check if selection contains Chinese characters
  if (!/[\u4e00-\u9fff]/.test(selectedText)) {
    return;
  }

  // Extract Chinese words from selection
  const chineseRegex = /[\u4e00-\u9fff]+/g;
  const matches = selectedText.match(chineseRegex);
  
  if (!matches || matches.length === 0) {
    return;
  }

  // Use the first Chinese word sequence found in selection
  // Or combine all if they form a phrase
  const word = matches.length === 1 ? matches[0] : matches.join('');
  
  // Get selection position for popup placement
  if (selection.rangeCount === 0) {
    return;
  }
  
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  
  // Store selection info for tracking
  currentSelection = {
    rect: rect
  };
  
  // Lookup and show popup
  lookupAndShowWord(word, rect.left + rect.width / 2, rect.top - 10);
}

/**
 * Handle mouse movement - primary detection method (like Zhongwen)
 * Throttled for performance
 */
function handleMouseMove(event: MouseEvent): void {
  // Throttle mousemove handler to max 60fps (16ms intervals)
  const now = Date.now();
  if (now - lastMouseMoveTime < 16) {
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

function handleMouseMoveThrottled(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (!target) {
    return;
  }
  
  // Handle selection tracking
  if (currentSelection) {
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    const rect = currentSelection.rect;
    
    if (!cachedPopupElement) {
      cachedPopupElement = document.getElementById('chinese-hover-popup');
    }
    const popup = cachedPopupElement;
    
    const padding = 10;
    const isOverSelection = mouseX >= rect.left - padding && 
                           mouseX <= rect.right + padding &&
                           mouseY >= rect.top - padding && 
                           mouseY <= rect.bottom + padding;
    
    const isOverPopup = popup && (
      mouseX >= popup.offsetLeft && 
      mouseX <= popup.offsetLeft + popup.offsetWidth &&
      mouseY >= popup.offsetTop && 
      mouseY <= popup.offsetTop + popup.offsetHeight
    );
    
    if (!isOverSelection && !isOverPopup) {
      if (selectionPopupTimer) {
        clearTimeout(selectionPopupTimer);
      }
      selectionPopupTimer = setTimeout(() => {
        if (cachedSelection === null) {
          const selection = window.getSelection();
          cachedSelection = selection ? selection.toString().trim().length > 0 : false;
        }
        if (!cachedSelection || (!isOverSelection && !isOverPopup)) {
          currentSelection = null;
          hidePopup();
        }
      }, 300);
    } else {
      if (selectionPopupTimer) {
        clearTimeout(selectionPopupTimer);
      }
    }
    return;
  }
  
  // Skip if hovering over popup
  if (target.closest('#chinese-hover-popup')) {
    if (hideTimer) {
      clearTimeout(hideTimer);
    }
    isHoveringChinese = true;
    return;
  }
  
  // Skip if there's a text selection
  if (cachedSelection === null) {
    const selection = window.getSelection();
    cachedSelection = selection ? selection.toString().trim().length > 0 : false;
  }
  if (cachedSelection) {
    return;
  }
  
  // Skip script, style, and other non-text elements
  if (target.tagName === 'SCRIPT' || target.tagName === 'STYLE' || target.tagName === 'NOSCRIPT') {
    // Not over text - hide popup
    if (isHoveringChinese) {
      isHoveringChinese = false;
      if (hideTimer) {
        clearTimeout(hideTimer);
      }
      hidePopup();
      lastHoveredElement = null;
      lastHoveredOffset = -1;
    }
    return;
  }
  
  // Get Chinese word at current cursor position (primary detection)
  const result = getChineseWordAtCursor(event);
  
  if (!result) {
    // Not over Chinese text - hide popup immediately
    if (isHoveringChinese || currentPopup) {
      isHoveringChinese = false;
      if (hideTimer) {
        clearTimeout(hideTimer);
      }
      hidePopup();
      lastHoveredElement = null;
      lastHoveredOffset = -1;
    }
    return;
  }
  
  const { word, textNode, offset } = result;
  
  // We're hovering over Chinese text
  isHoveringChinese = true;
  if (hideTimer) {
    clearTimeout(hideTimer);
  }
  cachedSelection = false;
  
  // Check if we moved to a different character/word
  const isSameTextNode = textNode === lastHoveredElement;
  const offsetDiff = isSameTextNode ? Math.abs(offset - lastHoveredOffset) : 1;
  const isDifferentChar = !isSameTextNode || offsetDiff >= 0.5;
  
  // Update tracking
  lastHoveredElement = textNode;
  lastHoveredOffset = offset;
  
  // Update popup if word or character changed
  if (word !== lastHoveredWord || isDifferentChar) {
    lastHoveredWord = word;
    if (hoverTimer) {
      clearTimeout(hoverTimer);
    }
    const isDifferentWord = lastHoveredWord && lastHoveredWord !== word;
    if (isDifferentWord || isDifferentChar) {
      // Different word/character - update immediately
      lookupAndShowWord(word, event.clientX, event.clientY);
    } else {
      // First word - small debounce
      hoverTimer = setTimeout(() => {
        lookupAndShowWord(word, event.clientX, event.clientY);
      }, 50);
    }
  }
}

/**
 * Handle mouseout events
 */
function handleMouseOut(event: MouseEvent): void {
  // Don't hide popup if it's from a selection (handleMouseMove handles that)
  if (currentSelection) {
    return;
  }
  
  // Check if moving to popup
  const relatedTarget = event.relatedTarget as HTMLElement | null;
  if (relatedTarget && relatedTarget.closest('#chinese-hover-popup')) {
    // Moving to popup - don't hide
    if (hideTimer) {
      clearTimeout(hideTimer);
    }
    return;
  }
  
  // Hide popup immediately when moving away from Chinese text
  if (hideTimer) {
    clearTimeout(hideTimer);
  }
  if (!isHoveringChinese && currentPopup) {
    // Use cached popup element if available
    const popup = cachedPopupElement || document.getElementById('chinese-hover-popup');
    if (!popup || !popup.matches(':hover')) {
      hidePopup();
      lastHoveredWord = null; // Reset so we can show popup again if hovering same word
      lastHoveredElement = null;
      lastHoveredOffset = -1;
    }
  }
}

/**
 * Get text content and cursor position at the mouse point
 * Returns {text, offset} where offset is the character position in the text
 * Optimized for performance
 */
function getTextAtPoint(element, event) {
  // Try to get text from text nodes using caretRangeFromPoint
  let range = null;
  
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(event.clientX, event.clientY);
  } else if ((document as any).caretPositionFromPoint) {
    const pos = (document as any).caretPositionFromPoint(event.clientX, event.clientY);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.setEnd(pos.offsetNode, pos.offset);
    }
  }
  
  if (range) {
    const textNode = range.startContainer;
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      const text = textNode.textContent;
      // Calculate offset in the text node
      const textOffset = range.startOffset;
      return { text, offset: textOffset };
    }
    // If we have a range, try to get the parent element's text
    // Optimize: only walk tree if we have a valid container
    const container = range.commonAncestorContainer;
    if (container) {
      const actualContainer = container.nodeType === Node.TEXT_NODE 
        ? container.parentElement 
        : container;
      if (actualContainer && actualContainer.nodeType === Node.ELEMENT_NODE) {
        const text = actualContainer.textContent || '';
        // Optimize: only walk tree if startContainer is not the text node itself
        if (range.startContainer.nodeType === Node.TEXT_NODE) {
          // Fast path: calculate offset by walking only if necessary
          let offset = 0;
          const walker = document.createTreeWalker(
            actualContainer,
            NodeFilter.SHOW_TEXT,
            null
          );
          let node: Node | null;
          while ((node = walker.nextNode())) {
            if (node === range.startContainer) {
              offset += range.startOffset;
              break;
            }
            offset += (node.textContent?.length || 0);
          }
          return { text, offset };
        }
      }
    }
  }

  // Fallback: get text from element (no precise offset)
  const text = element.textContent || element.innerText || '';
  return { text, offset: -1 };
}

/**
 * Extract Chinese word at cursor position with lookahead
 * For hover: tries up to 4 characters ahead from cursor position
 * Returns the longest possible substring (up to 4 chars) starting from cursor
 * Background script will check for exact matches
 */
function extractSingleChineseWord(text: string, cursorOffset: number, event: MouseEvent): string | null {
  if (!text) return null;

  // If we don't have a precise cursor offset, fall back to simple extraction
  if (cursorOffset < 0) {
    return extractChineseWordSimple(text);
  }

  // Find the Chinese character sequence containing the cursor position
  // Optimize: use lastIndex to avoid re-scanning from start
  const regex = /[\u4e00-\u9fff]+/g;
  let match;
  let containingSequence = null;
  let sequenceStart = -1;
  
  // Reset regex lastIndex for fresh search
  regex.lastIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    
    if (cursorOffset >= start && cursorOffset < end) {
      containingSequence = match[0];
      sequenceStart = start;
      break;
    }
    // Early exit if we've passed the cursor position
    if (start > cursorOffset) {
      break;
    }
  }

  if (!containingSequence) {
    return null;
  }

  // Calculate relative position within the Chinese sequence
  const relativeOffset = cursorOffset - sequenceStart;

  // Extract up to 4 characters starting from the cursor position
  // The background script will try to find the longest exact match
  const maxLength = Math.min(4, containingSequence.length - relativeOffset);
  return containingSequence.substring(relativeOffset, relativeOffset + maxLength);
}

/**
 * Simple Chinese word extraction (fallback when cursor position is unknown)
 */
function extractChineseWordSimple(text: string): string | null {
  if (!text) return null;

  const regex = /[\u4e00-\u9fff]+/g;
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[0]);
  }
  
  if (matches.length === 0) return null;

  // Prefer 2-4 character words (common Chinese word lengths)
  const preferredWords = matches.filter(word => word.length >= 2 && word.length <= 4);
  if (preferredWords.length > 0) {
    return preferredWords[0];
  }

  // Fallback: return the longest word
  return matches.reduce((longest, word) => 
    word.length > longest.length ? word : longest, 
    matches[0]
  );
}

/**
 * Lookup word and show popup
 */
function lookupAndShowWord(word: string, x: number, y: number): void {
  // Don't lookup if we're already showing this word (unless forced)
  if (currentPopup && currentPopup.dataset.word === word) {
    // Same word already showing, just update position
    positionPopup(currentPopup, x, y);
    // Still track statistics even if popup is already showing
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
    return;
  }

  // Send message to background script
  chrome.runtime.sendMessage(
    { type: 'lookup_word', word: word },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('Extension error:', chrome.runtime.lastError);
        // Show error popup
        showErrorPopup(word, x, y, chrome.runtime.lastError.message);
        return;
      }

      if (response && response.success && 'definition' in response && response.definition) {
        // Use the matched word from definition if available, otherwise use original word
        const displayWord = response.definition.word || word;
        showPopup(displayWord, response.definition, x, y);
      } else {
        const errorMsg = response && 'error' in response ? response.error : 'Lookup failed';
        console.error('Lookup failed:', errorMsg);
        // Show error popup even on failure
        const errorDef: DefinitionResult = {
          word: word,
          mandarin: { definition: errorMsg || 'Lookup failed', pinyin: '' },
          cantonese: { definition: 'Not available', jyutping: '' }
        };
        showPopup(word, errorDef, x, y);
      }
    }
  );
}

/**
 * Show error popup
 */
function showErrorPopup(word: string, x: number, y: number, error: string): void {
  const errorDef = {
    mandarin: { definition: `Error: ${error}`, pinyin: '' },
    cantonese: { definition: 'Not available', jyutping: '' }
  };
  showPopup(word, errorDef, x, y);
}

/**
 * Show popup with word definition
 */
function showPopup(word: string, definition: DefinitionResult, x: number, y: number): void {
  // Remove existing popup
  hidePopup();
  
  // Clear any pending hide timer
  if (hideTimer) {
    clearTimeout(hideTimer);
  }

  // Use the matched word from definition if available (for accurate display)
  const displayWord = definition.word || word;

  // Create popup element
  const popup = document.createElement('div');
  popup.id = 'chinese-hover-popup';
  popup.className = 'chinese-hover-popup';
  popup.dataset.word = word; // Store original word for comparison
  
  // Add mouseenter/mouseleave to popup to keep it visible
  popup.addEventListener('mouseenter', () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
    }
    isHoveringChinese = true;
  });
  
  popup.addEventListener('mouseleave', () => {
    // When leaving popup, hide immediately if not over Chinese text
    if (!isHoveringChinese) {
      hidePopup();
    }
  });
  
  // Format definitions - split by semicolon and display each on a new line
  const formatDefinitions = (defText) => {
    if (!defText || defText === 'Not found' || defText === 'N/A') {
      return escapeHtml(defText || 'Not found');
    }
    // Split by semicolon and create separate lines
    const definitions = defText.split(';').map(d => d.trim()).filter(d => d.length > 0);
    if (definitions.length === 1) {
      return escapeHtml(definitions[0]);
    }
    // Multiple definitions - display each on a new line
    return definitions.map(def => `<div class="popup-definition-item">${escapeHtml(def)}</div>`).join('');
  };

  // Format Mandarin with multiple pronunciations
  const formatMandarin = (mandarinData) => {
    if (!mandarinData || !mandarinData.entries || mandarinData.entries.length <= 1) {
      // Single pronunciation or no entries
      return `
        <div class="popup-label">Mandarin</div>
        <div class="popup-pinyin">${escapeHtml(mandarinData?.pinyin || 'N/A')}</div>
        <div class="popup-definition">${formatDefinitions(mandarinData?.definition)}</div>
      `;
    }
    
    // Multiple pronunciations - display each separately
    const entries = mandarinData.entries;
    const byPinyin = {};
    for (const entry of entries) {
      const pinyin = entry.pinyin || '';
      if (!byPinyin[pinyin]) {
        byPinyin[pinyin] = [];
      }
      const defs = entry.definitions || (entry.definition ? [entry.definition] : []);
      byPinyin[pinyin].push(...defs.filter(d => d && String(d).trim().length > 0));
    }
    
    let html = '<div class="popup-label">Mandarin</div>';
    for (const [pinyin, defs] of Object.entries(byPinyin)) {
      const defsStr = defs.join('; ');
      html += `
        <div class="popup-pronunciation-group">
          <div class="popup-pinyin">${escapeHtml(pinyin)}</div>
          <div class="popup-definition">${formatDefinitions(defsStr)}</div>
        </div>
      `;
    }
    return html;
  };

  // Format Cantonese with multiple pronunciations
  const formatCantonese = (cantoneseData) => {
    if (!cantoneseData || !cantoneseData.entries || cantoneseData.entries.length <= 1) {
      // Single pronunciation or no entries
      return `
        <div class="popup-label">Cantonese</div>
        <div class="popup-jyutping">${escapeHtml(cantoneseData?.jyutping || 'N/A')}</div>
        <div class="popup-definition">${formatDefinitions(cantoneseData?.definition)}</div>
      `;
    }
    
    // Multiple pronunciations - display each separately
    const entries = cantoneseData.entries;
    const byJyutping = {};
    for (const entry of entries) {
      const jyutping = entry.jyutping || '';
      if (!byJyutping[jyutping]) {
        byJyutping[jyutping] = [];
      }
      const defs = entry.definitions || [];
      byJyutping[jyutping].push(...defs.filter(d => d && String(d).trim().length > 0));
    }
    
    let html = '<div class="popup-label">Cantonese</div>';
    for (const [jyutping, defs] of Object.entries(byJyutping)) {
      const defsStr = defs.join('; ');
      html += `
        <div class="popup-pronunciation-group">
          <div class="popup-jyutping">${escapeHtml(jyutping)}</div>
          <div class="popup-definition">${formatDefinitions(defsStr)}</div>
        </div>
      `;
    }
    return html;
  };

  // Build popup content with side-by-side layout
  popup.innerHTML = `
    <div class="popup-word">${escapeHtml(displayWord)}</div>
    <div class="popup-sections-container">
      <div class="popup-section">
        ${formatMandarin(definition.mandarin)}
      </div>
      <div class="popup-section">
        ${formatCantonese(definition.cantonese)}
      </div>
    </div>
  `;

  // Add popup to page
  document.body.appendChild(popup);
  currentPopup = popup;
  cachedPopupElement = popup; // Cache popup reference

  // Position popup near cursor
  positionPopup(popup, x, y);
}

/**
 * Position popup near cursor, ensuring it stays within viewport
 * Positioned above cursor by default to avoid blocking horizontal movement
 */
function positionPopup(popup: HTMLElement, x: number, y: number): void {
  const popupRect = popup.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const offset = 15; // Offset from cursor

  // Position horizontally - prefer right side, but adjust if needed
  let left = x + offset;
  if (left + popupRect.width > viewportWidth) {
    // If popup would go off right edge, position to the left of cursor
    left = x - popupRect.width - offset;
  }

  // Position vertically - always above cursor by default
  let top = y - popupRect.height - offset;

  // If popup would go off top edge, position below cursor instead
  if (top < 10) {
    top = y + offset;
    // If it still doesn't fit below, constrain to viewport
    if (top + popupRect.height > viewportHeight) {
      top = Math.max(10, viewportHeight - popupRect.height - 10);
    }
  }

  // Ensure popup doesn't go off left or right edges
  left = Math.max(10, Math.min(left, viewportWidth - popupRect.width - 10));

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

/**
 * Hide popup
 */
function hidePopup(): void {
  if (currentPopup) {
    currentPopup.remove();
    currentPopup = null;
    cachedPopupElement = null; // Clear cached reference
    lastHoveredWord = null;
    lastHoveredElement = null;
    lastHoveredOffset = -1;
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
