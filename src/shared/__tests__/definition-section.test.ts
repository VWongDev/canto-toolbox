// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import {
  createDefinitionElement,
  createMandarinSection,
  createCantoneseSection,
  findScriptVariant,
} from '../definition-section.js';
import { createDefinitionTextElement, MAX_VISIBLE_DEFINITIONS } from '../definition-list.js';
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

  it('returns a bare list when there are at most MAX_VISIBLE_DEFINITIONS senses', () => {
    const defs = ['a', 'b', 'c'];
    expect(defs.length).toBe(MAX_VISIBLE_DEFINITIONS);
    const el = createDefinitionTextElement(defs);
    expect(el.tagName).toBe('UL');
    expect(el.classList.contains('definition-senses')).toBe(false);
    expect(el.querySelector('.definition-more')).toBeNull();
    expect(el.querySelectorAll('.definition-sense--overflow').length).toBe(0);
  });

  it('wraps longer lists and hides overflow until expanded', () => {
    const el = createDefinitionTextElement(['a', 'b', 'c', 'd', 'e']);
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
});

describe('createMandarin/CantoneseSection', () => {
  it('labels the sections', () => {
    const def = makeDefinition();
    expect(createMandarinSection(def.mandarin).querySelector('.definition-label')?.textContent).toBe('Mandarin');
    expect(createCantoneseSection(def.cantonese).querySelector('.definition-label')?.textContent).toBe('Cantonese');
  });

  it('holds the Mandarin column open with a placeholder but not the Cantonese one', () => {
    const empty = { entries: [] };
    expect(createMandarinSection(empty).querySelector('.definition-text')).toBeNull();
    expect(createCantoneseSection(empty).querySelector('.definition-text')).toBeNull();

    const noSenses = { entries: [{ traditional: '字', simplified: '字', romanisation: 'zi6', definitions: [] }] };
    expect(createMandarinSection(noSenses).querySelector('.definition-text')?.textContent).toBe('Not found');
    expect(createCantoneseSection(noSenses).querySelector('.definition-text')).toBeNull();
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

describe('findScriptVariant', () => {
  const varied = (word: string): DefinitionResult => ({
    word,
    mandarin: {
      entries: [
        { traditional: '廣東話', simplified: '广东话', romanisation: 'Guang3dong1 hua4', definitions: ['Cantonese'] },
      ],
    },
    cantonese: { entries: [] },
  });

  it('offers the simplified form when reading traditional', () => {
    expect(findScriptVariant(varied('廣東話'))).toEqual({ label: 'Simplified', form: '广东话' });
  });

  it('offers the traditional form when reading simplified', () => {
    expect(findScriptVariant(varied('广东话'))).toEqual({ label: 'Traditional', form: '廣東話' });
  });

  it('offers nothing when the two scripts agree', () => {
    expect(findScriptVariant(makeDefinition())).toBeNull();
  });

  it('offers nothing for a word matching no entry', () => {
    expect(findScriptVariant(varied('別的'))).toBeNull();
  });

  it('finds the variant from the Cantonese entries too', () => {
    const definition: DefinitionResult = {
      word: '廣東話',
      mandarin: { entries: [] },
      cantonese: {
        entries: [
          { traditional: '廣東話', simplified: '广东话', romanisation: 'gwong2 dung1 waa2', definitions: ['Cantonese'] },
        ],
      },
    };

    expect(findScriptVariant(definition)).toEqual({ label: 'Simplified', form: '广东话' });
  });

  it('renders the counterpart above the readings', () => {
    const el = createDefinitionElement('廣東話', varied('廣東話'));
    expect(el.querySelector('.definition-variant-label')?.textContent).toBe('Simplified');
    expect(el.querySelector('.definition-variant-form')?.textContent).toBe('广东话');
  });

  it('renders no variant row when the scripts agree', () => {
    const el = createDefinitionElement('你好', makeDefinition());
    expect(el.querySelector('.definition-variant')).toBeNull();
  });
});
