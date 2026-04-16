export interface CreateElementOptions {
  tag?: string;
  className?: string | string[];
  textContent?: string;
  dataset?: Record<string, string>;
  attributes?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration> | string;
  id?: string;
  children?: (HTMLElement | Node | string)[];
  listeners?: Record<string, EventListener>;
  appendChildren?: boolean;
}

function setElementId(element: HTMLElement, id: string): void {
  element.id = id;
}

function setElementClassName(element: HTMLElement, className: string | string[]): void {
  if (Array.isArray(className)) {
    element.className = className.join(' ');
  } else {
    element.className = className;
  }
}

function setElementTextContent(element: HTMLElement, textContent: string): void {
  element.textContent = textContent;
}

function setElementDataset(element: HTMLElement, dataset: Record<string, string>): void {
  for (const [key, value] of Object.entries(dataset)) {
    element.dataset[key] = value;
  }
}

function setElementAttributes(element: HTMLElement, attributes: Record<string, string>): void {
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
}

function setElementStyle(element: HTMLElement, style: Partial<CSSStyleDeclaration> | string): void {
  if (typeof style === 'string') {
    element.style.cssText = style;
  } else {
    Object.assign(element.style, style);
  }
}

function appendElementChildren(element: HTMLElement, children: (HTMLElement | Node | string)[]): void {
  for (const child of children) {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      element.appendChild(child);
    }
  }
}

function attachElementListeners(element: HTMLElement, listeners: Record<string, EventListener>): void {
  for (const [event, handler] of Object.entries(listeners)) {
    element.addEventListener(event, handler);
  }
}

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

  if (id) {
    setElementId(element, id);
  }

  if (className) {
    setElementClassName(element, className);
  }

  if (textContent !== undefined) {
    setElementTextContent(element, textContent);
  }

  if (dataset) {
    setElementDataset(element, dataset);
  }

  if (attributes) {
    setElementAttributes(element, attributes);
  }

  if (style) {
    setElementStyle(element, style);
  }

  if (appendChildren && children) {
    appendElementChildren(element, children);
  }

  if (listeners) {
    attachElementListeners(element, listeners);
  }

  return element;
}

export function clearElement(element: HTMLElement): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

export function createText(text: string): Text {
  return document.createTextNode(text);
}
