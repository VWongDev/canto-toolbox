// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import {
  createDefinitionTextElement,
  createDefinitionList,
  createDefinitionElement,
  createMandarinSection,
  createCantoneseSection,
  definitionPronunciationConfig,
  MAX_VISIBLE_DEFINITIONS,
} from '../definition-section.js';
import type { DefinitionResult } from '../types.js';

const makeDefinition = (overrides: Partial<DefinitionResult> = {}): DefinitionResult => ({
  word: '你好',
  mandarin: { entries: [{ traditional: '你好', simplified: '你好', romanisation: 'ni3 hao3', definitions: ['hello'] }] },
  cantonese: { entries: [{ traditional: '你好', simplified: '你好', romanisation: 'nei5 hou2', definitions: ['hi'] }] },
  ...overrides,
});

describe('createDefinitionTextElement', () => {
  it('renders one list item per definition', () => {
    const el = createDefinitionTextElement(['a', 'b']);
    expect(el.tagName).toBe('UL');
    expect(el.className).toBe('definition-text');
    expect(Array.from(el.querySelectorAll('.definition-item')).map(n => n.textContent)).toEqual(['a', 'b']);
  });

  it('falls back to "Not found" when empty or undefined', () => {
    expect(createDefinitionTextElement([]).textContent).toBe('Not found');
    expect(createDefinitionTextElement(undefined).textContent).toBe('Not found');
  });
});

describe('createDefinitionList', () => {
  it('returns a bare list when there are at most MAX_VISIBLE_DEFINITIONS senses', () => {
    const defs = ['a', 'b', 'c'];
    expect(defs.length).toBe(MAX_VISIBLE_DEFINITIONS);
    const el = createDefinitionList(defs, 'definition-text', 'definition-item');
    expect(el.tagName).toBe('UL');
    expect(el.classList.contains('definition-senses')).toBe(false);
    expect(el.querySelector('.definition-more')).toBeNull();
    expect(el.querySelectorAll('.definition-sense--overflow').length).toBe(0);
  });

  it('wraps longer lists and hides overflow until expanded', () => {
    const defs = ['a', 'b', 'c', 'd', 'e'];
    const el = createDefinitionList(defs, 'definition-text', 'definition-item');
    expect(el.className).toBe('definition-senses is-collapsed');
    expect(el.querySelectorAll('.definition-sense--overflow').length).toBe(2);

    const btn = el.querySelector('.definition-more') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe('2 more');
    expect(btn.getAttribute('aria-expanded')).toBe('false');

    btn.click();
    expect(el.classList.contains('is-collapsed')).toBe(false);
    expect(btn.textContent).toBe('Show less');
    expect(btn.getAttribute('aria-expanded')).toBe('true');

    btn.click();
    expect(el.classList.contains('is-collapsed')).toBe(true);
    expect(btn.textContent).toBe('2 more');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('uses the provided list and item class names', () => {
    const el = createDefinitionList(['only'], 'popup-definition', 'popup-definition-item');
    expect(el.className).toBe('popup-definition');
    expect(el.querySelector('.popup-definition-item')?.textContent).toBe('only');
  });
});

describe('createMandarin/CantoneseSection', () => {
  it('labels the sections', () => {
    const def = makeDefinition();
    expect(createMandarinSection(def.mandarin, definitionPronunciationConfig)
      .querySelector('.definition-label')?.textContent).toBe('Mandarin');
    expect(createCantoneseSection(def.cantonese, definitionPronunciationConfig)
      .querySelector('.definition-label')?.textContent).toBe('Cantonese');
  });
});

describe('createDefinitionElement', () => {
  it('builds the definition-container structure', () => {
    const el = createDefinitionElement('你好', makeDefinition());
    expect(el.className).toBe('definition-container');
    expect(el.querySelector('.definition-word')?.textContent).toBe('你好');
    expect(el.querySelectorAll('.definition-sections .definition-section')).toHaveLength(2);
    expect(el.querySelector('.character-etymology')).toBeNull();
  });

  it('prefers definition.word over the fallback word argument', () => {
    const el = createDefinitionElement('fallback', makeDefinition({ word: '漢字' }));
    expect(el.querySelector('.definition-word')?.textContent).toBe('漢字');
  });

  it('includes an etymology section only when etymology data is present', () => {
    const noEty = createDefinitionElement('字', makeDefinition());
    expect(noEty.children.length).toBe(2); // word + definition-sections

    const withEty = createDefinitionElement('字', makeDefinition({
      etymology: [{ character: '字', definition: 'character', decomposition: '⿱宀子', radical: '宀' }],
    }));
    // word + etymology + definition-sections
    expect(withEty.children.length).toBe(3);
  });
});
