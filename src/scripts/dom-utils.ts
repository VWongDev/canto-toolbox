// dom-utils.ts - DOM element creation utilities

/**
 * Options for creating DOM elements
 */
export interface CreateElementOptions {
  /** HTML tag name (default: 'div') */
  tag?: string;
  /** CSS class name(s) - can be string or array */
  className?: string | string[];
  /** Text content for the element */
  textContent?: string;
  /** Dataset attributes as an object */
  dataset?: Record<string, string>;
  /** HTML attributes as an object */
  attributes?: Record<string, string>;
  /** Inline styles as an object or string */
  style?: Partial<CSSStyleDeclaration> | string;
  /** Element ID */
  id?: string;
  /** Child elements to append */
  children?: (HTMLElement | Node | string)[];
  /** Event listeners to attach */
  listeners?: Record<string, EventListener>;
  /** Whether to append children (default: true) */
  appendChildren?: boolean;
}

/**
 * Create a DOM element with specified properties
 * 
 * @example
 * const el = createElement({
 *   tag: 'div',
 *   className: 'my-class',
 *   textContent: 'Hello',
 *   dataset: { id: '123' },
 *   children: [createElement({ tag: 'span', textContent: 'World' })]
 * });
 */
export function createElement<T extends HTMLElement = HTMLElement>(
  options: CreateElementOptions = {}
): T {
  const {
    tag = 'div',
    className,
    textContent,
    dataset,
    attributes,
    style,
    id,
    children,
    listeners,
    appendChildren = true
  } = options;

  const element = document.createElement(tag) as T;

  // Set ID
  if (id) {
    element.id = id;
  }

  // Set class name(s)
  if (className) {
    if (Array.isArray(className)) {
      element.className = className.join(' ');
    } else {
      element.className = className;
    }
  }

  // Set text content
  if (textContent !== undefined) {
    element.textContent = textContent;
  }

  // Set dataset attributes
  if (dataset) {
    for (const [key, value] of Object.entries(dataset)) {
      element.dataset[key] = value;
    }
  }

  // Set HTML attributes
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, value);
    }
  }

  // Set inline styles
  if (style) {
    if (typeof style === 'string') {
      element.style.cssText = style;
    } else {
      Object.assign(element.style, style);
    }
  }

  // Append children
  if (appendChildren && children) {
    for (const child of children) {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        element.appendChild(child);
      }
    }
  }

  // Attach event listeners
  if (listeners) {
    for (const [event, handler] of Object.entries(listeners)) {
      element.addEventListener(event, handler);
    }
  }

  return element;
}

/**
 * Clear all children from an element
 */
export function clearElement(element: HTMLElement): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * Helper to create a text node
 */
export function createText(text: string): Text {
  return document.createTextNode(text);
}

