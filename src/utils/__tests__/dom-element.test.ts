// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { createElement, clearElement, createText } from '../dom-element';

describe('createElement', () => {
  it('creates a div by default', () => {
    expect(createElement().tagName).toBe('DIV');
  });

  it('creates an element with the specified tag', () => {
    expect(createElement({ tag: 'span' }).tagName).toBe('SPAN');
  });

  it('sets a single className', () => {
    expect(createElement({ className: 'foo' }).className).toBe('foo');
  });

  it('joins an array of classNames with a space', () => {
    expect(createElement({ className: ['foo', 'bar'] }).className).toBe('foo bar');
  });

  it('sets textContent', () => {
    expect(createElement({ textContent: 'hello' }).textContent).toBe('hello');
  });

  it('sets id', () => {
    expect(createElement({ id: 'my-id' }).id).toBe('my-id');
  });

  it('sets dataset attributes', () => {
    const el = createElement({ dataset: { word: '你好', count: '3' } });
    expect(el.dataset.word).toBe('你好');
    expect(el.dataset.count).toBe('3');
  });

  it('sets arbitrary HTML attributes', () => {
    const el = createElement({ attributes: { 'aria-label': 'test', role: 'button' } });
    expect(el.getAttribute('aria-label')).toBe('test');
    expect(el.getAttribute('role')).toBe('button');
  });

  it('applies style from an object', () => {
    const el = createElement({ style: { color: 'red' } });
    expect(el.style.color).toBe('red');
  });

  it('applies style from a cssText string', () => {
    const el = createElement({ style: 'color: blue;' });
    expect(el.style.cssText).toContain('blue');
  });

  it('appends string children as text nodes', () => {
    const el = createElement({ children: ['hello'] });
    expect(el.textContent).toBe('hello');
  });

  it('appends element children', () => {
    const child = document.createElement('span');
    const el = createElement({ children: [child] });
    expect(el.firstChild).toBe(child);
  });

  it('does not append children when appendChildren is false', () => {
    const child = document.createElement('span');
    const el = createElement({ children: [child], appendChildren: false });
    expect(el.childNodes.length).toBe(0);
  });

  it('attaches event listeners', () => {
    const handler = vi.fn();
    const el = createElement({ listeners: { click: handler } });
    el.dispatchEvent(new Event('click'));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('returns the correct generic type', () => {
    const el = createElement<HTMLButtonElement>({ tag: 'button' });
    expect(el.tagName).toBe('BUTTON');
  });
});

describe('clearElement', () => {
  it('removes all child nodes', () => {
    const el = document.createElement('div');
    el.appendChild(document.createElement('span'));
    el.appendChild(document.createElement('p'));
    clearElement(el);
    expect(el.childNodes.length).toBe(0);
  });

  it('is a no-op on an already-empty element', () => {
    const el = document.createElement('div');
    expect(() => clearElement(el)).not.toThrow();
    expect(el.childNodes.length).toBe(0);
  });
});

describe('createText', () => {
  it('creates a text node', () => {
    const node = createText('hello');
    expect(node.nodeType).toBe(Node.TEXT_NODE);
  });

  it('contains the provided text', () => {
    expect(createText('你好').textContent).toBe('你好');
  });
});
