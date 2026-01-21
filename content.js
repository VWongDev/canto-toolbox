// content.js - Content script for detecting Chinese words on hover

// Chinese character regex pattern
const CHINESE_REGEX = /[\u4e00-\u9fff]+/g;

// Debounce timer
let hoverTimer = null;
let lastHoveredWord = null;
let currentPopup = null;

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  // Inject CSS styles
  injectStyles();
  
  // Add mouseover listener to document
  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  
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
 * Handle mouseover events to detect Chinese words
 */
function handleMouseOver(event) {
  const target = event.target;
  
  // Skip if hovering over our popup
  if (target.closest('#chinese-hover-popup')) {
    return;
  }

  // Skip script, style, and other non-text elements
  if (target.tagName === 'SCRIPT' || target.tagName === 'STYLE' || target.tagName === 'NOSCRIPT') {
    return;
  }

  // Get text content from the element
  const text = getTextAtPoint(target, event);
  if (!text || text.trim().length === 0) return;

  // Find Chinese word at cursor position
  const word = extractChineseWord(text, event);
  if (!word || word === lastHoveredWord) return;

  // Debug logging
  console.log('Found Chinese word:', word);

  lastHoveredWord = word;

  // Debounce hover events
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    lookupAndShowWord(word, event.clientX, event.clientY);
  }, 300); // 300ms delay
}

/**
 * Handle mouseout events
 */
function handleMouseOut(event) {
  // Clear hover timer
  clearTimeout(hoverTimer);
  
  // Hide popup if mouse leaves the word area
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
 * Get text content at the mouse point
 */
function getTextAtPoint(element, event) {
  // Try to get text from text nodes using caretRangeFromPoint
  let range = null;
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
      return textNode.textContent;
    }
    // If we have a range, try to get the parent element's text
    if (range.commonAncestorContainer) {
      const container = range.commonAncestorContainer.nodeType === Node.TEXT_NODE 
        ? range.commonAncestorContainer.parentElement 
        : range.commonAncestorContainer;
      if (container) {
        return container.textContent || container.innerText || '';
      }
    }
  }

  // Fallback: get text from element
  return element.textContent || element.innerText || '';
}

/**
 * Extract Chinese word at cursor position
 * Tries to find word boundaries intelligently
 */
function extractChineseWord(text, event) {
  if (!text) return null;

  // Create new regex instance to avoid state issues
  const regex = /[\u4e00-\u9fff]+/g;
  
  // Find all Chinese character sequences
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

  // Fallback: return the longest word (likely a compound word)
  return matches.reduce((longest, word) => 
    word.length > longest.length ? word : longest, 
    matches[0]
  );
}

/**
 * Lookup word and show popup
 */
function lookupAndShowWord(word, x, y) {
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
