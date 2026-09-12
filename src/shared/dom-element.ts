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
    listeners
  } = options;

  const element = document.createElement(tag) as T;

  if (id) element.id = id;

  if (className) {
    element.className = Array.isArray(className) ? className.join(' ') : className;
  }

  if (textContent !== undefined) element.textContent = textContent;

  if (dataset) {
    for (const [key, value] of Object.entries(dataset)) {
      element.dataset[key] = value;
    }
  }

  if (attributes) {
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }
  }

  if (style) {
    if (typeof style === 'string') element.style.cssText = style;
    else Object.assign(element.style, style);
  }

  if (children) {
    for (const child of children) {
      // A string is content rather than an element, and anything that is
      // neither is not appendable at all.
      if (typeof child === 'string') element.appendChild(document.createTextNode(child));
      else if (child instanceof Node) element.appendChild(child);
    }
  }

  if (listeners) {
    for (const [event, handler] of Object.entries(listeners)) {
      element.addEventListener(event, handler);
    }
  }

  return element;
}
