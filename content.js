// content.js - Content script for detecting Chinese words on hover

// Chinese character regex pattern
const CHINESE_REGEX = /[\u4e00-\u9fff]+/g;

// Debounce timer
let hoverTimer = null;
let lastHoveredWord = null;
let currentPopup = null;
let currentSelection = null; // Track current selection for popup
let selectionPopupTimer = null;

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  // Inject CSS styles
  injectStyles();
  
  // Add mouseover listener to document (for single word hover)
  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  
  // Add selection listener for multi-word searches
  document.addEventListener('mouseup', handleSelection, true);
  // Track mouse movement to hide popup when cursor moves away from selection
  document.addEventListener('mousemove', handleMouseMove, true);
  
  // Debug: log initialization
  console.log('Chinese Word Hover extension initialized');
}

/**
 * Inject CSS styles into the page
 */
function injectStyles() {
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
      padding: 16px;
      min-width: 280px;
      max-width: 400px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #333;
      pointer-events: auto;
    }
    .popup-word {
      font-size: 24px;
      font-weight: bold;
      color: #1a1a1a;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e0e0e0;
      text-align: center;
    }
    .popup-section {
      margin-bottom: 12px;
    }
    .popup-section:last-child {
      margin-bottom: 0;
    }
    .popup-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: #666;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .popup-pinyin,
    .popup-jyutping {
      font-size: 16px;
      color: #0066cc;
      font-weight: 500;
      margin-bottom: 6px;
      font-family: 'Arial', sans-serif;
    }
    .popup-definition {
      font-size: 13px;
      color: #555;
      line-height: 1.6;
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
    }
  `;
  document.head.appendChild(style);
}

/**
 * Handle mouseover events to detect single Chinese words
 * Only detects individual words/characters, not multi-word phrases
 */
function handleMouseOver(event) {
  const target = event.target;
  
  // Skip if hovering over our popup
  if (target.closest('#chinese-hover-popup')) {
    return;
  }

  // Skip if there's a text selection (user is highlighting)
  if (window.getSelection().toString().trim().length > 0) {
    return;
  }

  // Skip script, style, and other non-text elements
  if (target.tagName === 'SCRIPT' || target.tagName === 'STYLE' || target.tagName === 'NOSCRIPT') {
    return;
  }

  // Get text content and cursor position from the element
  const { text, offset } = getTextAtPoint(target, event);
  if (!text || text.trim().length === 0) return;

  // Find single Chinese word/character at cursor position
  const word = extractSingleChineseWord(text, offset, event);
  if (!word) return;

  // If it's the same word, don't do anything (already showing)
  if (word === lastHoveredWord) return;

  // Check if this is a different word from the previous one
  const isDifferentWord = lastHoveredWord && lastHoveredWord !== word;

  // Debug logging
  console.log('Found Chinese word:', word, '(previous:', lastHoveredWord, ')');

  // Update last hovered word immediately
  lastHoveredWord = word;

  // Clear any pending hover timer
  clearTimeout(hoverTimer);

  // If moving to a different word, update immediately (no debounce for word changes)
  // Only debounce for the first word or rapid movements
  if (isDifferentWord) {
    // Different word - update immediately for smooth transitions
    lookupAndShowWord(word, event.clientX, event.clientY);
  } else {
    // First word - use small debounce
    hoverTimer = setTimeout(() => {
      lookupAndShowWord(word, event.clientX, event.clientY);
    }, 150); // Reduced delay for faster response
  }
}

/**
 * Handle text selection for multi-word searches
 * Preserves default highlight behavior and shows popup
 */
function handleSelection(event) {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();
  
  if (!selectedText || selectedText.length === 0) {
    // Selection cleared - hide popup if it was from selection
    if (currentSelection) {
      currentSelection = null;
      // Don't hide immediately, wait to see if user is moving to popup
      clearTimeout(selectionPopupTimer);
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
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  
  // Store selection info for tracking
  currentSelection = {
    word: word,
    range: range.cloneRange(), // Clone range to preserve it
    rect: {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    }
  };
  
  console.log('Found selected Chinese text:', word);
  
  // Lookup and show popup
  lookupAndShowWord(word, rect.left + rect.width / 2, rect.top - 10);
}

/**
 * Handle mouse movement to track when cursor leaves selection area
 */
function handleMouseMove(event) {
  if (!currentSelection) {
    return;
  }
  
  // Check if mouse is still over the selection area or popup
  const mouseX = event.clientX;
  const mouseY = event.clientY;
  const rect = currentSelection.rect;
  const popup = document.getElementById('chinese-hover-popup');
  
  // Check if mouse is over selection area (with some padding)
  const padding = 10;
  const isOverSelection = mouseX >= rect.left - padding && 
                         mouseX <= rect.right + padding &&
                         mouseY >= rect.top - padding && 
                         mouseY <= rect.bottom + padding;
  
  // Check if mouse is over popup
  const isOverPopup = popup && (
    mouseX >= popup.offsetLeft && 
    mouseX <= popup.offsetLeft + popup.offsetWidth &&
    mouseY >= popup.offsetTop && 
    mouseY <= popup.offsetTop + popup.offsetHeight
  );
  
  // If mouse is not over selection or popup, hide popup after delay
  if (!isOverSelection && !isOverPopup) {
    clearTimeout(selectionPopupTimer);
    selectionPopupTimer = setTimeout(() => {
      // Double-check selection still exists and mouse is still away
      const selection = window.getSelection();
      if (!selection.toString().trim() || 
          (!isOverSelection && !isOverPopup)) {
        currentSelection = null;
        hidePopup();
      }
    }, 300); // Small delay to allow moving to popup
  } else {
    // Mouse is over selection or popup, cancel any pending hide
    clearTimeout(selectionPopupTimer);
  }
}

/**
 * Handle mouseout events
 */
function handleMouseOut(event) {
  // Clear hover timer
  clearTimeout(hoverTimer);
  
  // Don't hide popup if it's from a selection (handleMouseMove handles that)
  if (currentSelection) {
    return;
  }
  
  // Hide popup if mouse leaves the word area (for hover, not selection)
  if (!event.relatedTarget || !event.relatedTarget.closest('#chinese-hover-popup')) {
    // Don't hide immediately, give a small delay
    setTimeout(() => {
      if (currentPopup && !currentPopup.matches(':hover') && !document.querySelector('#chinese-hover-popup:hover')) {
        hidePopup();
      }
    }, 100);
  }
}

/**
 * Get text content and cursor position at the mouse point
 * Returns {text, offset} where offset is the character position in the text
 */
function getTextAtPoint(element, event) {
  // Try to get text from text nodes using caretRangeFromPoint
  let range = null;
  let textOffset = 0;
  
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(event.clientX, event.clientY);
  } else if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(event.clientX, event.clientY);
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
      textOffset = range.startOffset;
      return { text, offset: textOffset };
    }
    // If we have a range, try to get the parent element's text
    if (range.commonAncestorContainer) {
      const container = range.commonAncestorContainer.nodeType === Node.TEXT_NODE 
        ? range.commonAncestorContainer.parentElement 
        : range.commonAncestorContainer;
      if (container) {
        const text = container.textContent || container.innerText || '';
        // Calculate offset in the full text
        const walker = document.createTreeWalker(
          container,
          NodeFilter.SHOW_TEXT,
          null
        );
        let node;
        let offset = 0;
        while ((node = walker.nextNode())) {
          if (node === range.startContainer) {
            offset += range.startOffset;
            break;
          }
          offset += node.textContent.length;
        }
        return { text, offset };
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
function extractSingleChineseWord(text, cursorOffset, event) {
  if (!text) return null;

  // If we don't have a precise cursor offset, fall back to simple extraction
  if (cursorOffset < 0) {
    return extractChineseWordSimple(text);
  }

  // Find the Chinese character sequence containing the cursor position
  const regex = /[\u4e00-\u9fff]+/g;
  let match;
  let containingSequence = null;
  let sequenceStart = -1;

  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    
    if (cursorOffset >= start && cursorOffset < end) {
      containingSequence = match[0];
      sequenceStart = start;
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
function extractChineseWordSimple(text) {
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
function lookupAndShowWord(word, x, y) {
  // Don't lookup if we're already showing this word (unless forced)
  if (currentPopup && currentPopup.dataset.word === word) {
    // Same word already showing, just update position
    positionPopup(currentPopup, x, y);
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

      if (response && response.success && response.definition) {
        showPopup(word, response.definition, x, y);
      } else {
        console.error('Lookup failed:', response?.error);
        // Show error popup even on failure
        const errorDef = {
          mandarin: { definition: response?.error || 'Lookup failed', pinyin: '' },
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
function showErrorPopup(word, x, y, error) {
  const errorDef = {
    mandarin: { definition: `Error: ${error}`, pinyin: '' },
    cantonese: { definition: 'Not available', jyutping: '' }
  };
  showPopup(word, errorDef, x, y);
}

/**
 * Show popup with word definition
 */
function showPopup(word, definition, x, y) {
  // Remove existing popup
  hidePopup();

  // Create popup element
  const popup = document.createElement('div');
  popup.id = 'chinese-hover-popup';
  popup.className = 'chinese-hover-popup';
  popup.dataset.word = word; // Store word for comparison
  
  // Build popup content
  popup.innerHTML = `
    <div class="popup-word">${escapeHtml(word)}</div>
    <div class="popup-section">
      <div class="popup-label">Mandarin</div>
      <div class="popup-pinyin">${escapeHtml(definition.mandarin.pinyin || 'N/A')}</div>
      <div class="popup-definition">${escapeHtml(definition.mandarin.definition || 'Not found')}</div>
    </div>
    <div class="popup-section">
      <div class="popup-label">Cantonese</div>
      <div class="popup-jyutping">${escapeHtml(definition.cantonese.jyutping || 'N/A')}</div>
      <div class="popup-definition">${escapeHtml(definition.cantonese.definition || 'Not found')}</div>
    </div>
  `;

  // Add popup to page
  document.body.appendChild(popup);
  currentPopup = popup;

  // Position popup near cursor
  positionPopup(popup, x, y);

  // Add event listeners to keep popup visible when hovering over it
  popup.addEventListener('mouseenter', () => {
    clearTimeout(hoverTimer);
  });

  popup.addEventListener('mouseleave', () => {
    setTimeout(() => hidePopup(), 200);
  });
}

/**
 * Position popup near cursor, ensuring it stays within viewport
 */
function positionPopup(popup, x, y) {
  const popupRect = popup.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const offset = 15; // Offset from cursor

  let left = x + offset;
  let top = y + offset;

  // Adjust if popup would go off right edge
  if (left + popupRect.width > viewportWidth) {
    left = x - popupRect.width - offset;
  }

  // Adjust if popup would go off bottom edge
  if (top + popupRect.height > viewportHeight) {
    top = y - popupRect.height - offset;
  }

  // Ensure popup doesn't go off left or top edges
  left = Math.max(10, left);
  top = Math.max(10, top);

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

/**
 * Hide popup
 */
function hidePopup() {
  if (currentPopup) {
    currentPopup.remove();
    currentPopup = null;
    lastHoveredWord = null;
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
