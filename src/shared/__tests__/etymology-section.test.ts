// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createEtymologySection } from '../etymology-section';
import type { CharacterEtymology } from '../types';

const makeEtymology = (overrides: Partial<CharacterEtymology> = {}): CharacterEtymology => ({
  character: '好',
  decomposition: '⿰女子',
  radical: '女',
  ...overrides,
});

describe('createEtymologySection', () => {
  it('renders the section label', () => {
    const el = createEtymologySection([makeEtymology()]);
    expect(el.querySelector('.popup-etymology-label')?.textContent).toBe('Character Breakdown');
  });

  it('renders one card per etymology entry', () => {
    const el = createEtymologySection([makeEtymology(), makeEtymology({ character: '字' })]);
    expect(el.querySelectorAll('.popup-etymology-character').length).toBe(2);
  });

  it('renders the character glyph', () => {
    const el = createEtymologySection([makeEtymology()]);
    expect(el.querySelector('.popup-etymology-char')?.textContent).toBe('好');
  });

  it('renders no type badge when etymologyType is absent', () => {
    const el = createEtymologySection([makeEtymology()]);
    expect(el.querySelector('.popup-etymology-type')).toBeNull();
  });

  it('renders Phonosemantic badge for pictophonetic type', () => {
    const el = createEtymologySection([makeEtymology({ etymologyType: 'pictophonetic' })]);
    expect(el.querySelector('.popup-etymology-type')?.textContent).toBe('Phonosemantic');
  });

  it('renders Ideographic badge for ideographic type', () => {
    const el = createEtymologySection([makeEtymology({ etymologyType: 'ideographic' })]);
    expect(el.querySelector('.popup-etymology-type')?.textContent).toBe('Ideographic');
  });

  it('renders Pictographic badge for pictographic type', () => {
    const el = createEtymologySection([makeEtymology({ etymologyType: 'pictographic' })]);
    expect(el.querySelector('.popup-etymology-type')?.textContent).toBe('Pictographic');
  });

  it('renders hint for ideographic', () => {
    const el = createEtymologySection([makeEtymology({ etymologyType: 'ideographic', hint: 'two trees' })]);
    expect(el.querySelector('.popup-etymology-hint')?.textContent).toBe('two trees');
  });

  it('renders hint for pictographic', () => {
    const el = createEtymologySection([makeEtymology({ etymologyType: 'pictographic', hint: 'sun' })]);
    expect(el.querySelector('.popup-etymology-hint')?.textContent).toBe('sun');
  });

  it('does not render hint for pictophonetic', () => {
    const el = createEtymologySection([makeEtymology({ etymologyType: 'pictophonetic', hint: 'person' })]);
    expect(el.querySelector('.popup-etymology-hint')).toBeNull();
  });

  it('renders semantic chip with meaning role for pictophonetic', () => {
    const el = createEtymologySection([makeEtymology({
      etymologyType: 'pictophonetic',
      semantic: '女',
      phonetic: '子',
    })]);
    const chips = el.querySelectorAll('.popup-etymology-component');
    expect(chips.length).toBe(2);
    const glyphs = Array.from(chips).map(c => c.querySelector('.popup-etymology-component-glyph')?.textContent);
    expect(glyphs).toContain('女');
    expect(glyphs).toContain('子');
    const roles = Array.from(chips).map(c => c.querySelector('[class*="component-role"]')?.textContent);
    expect(roles).toContain('meaning');
    expect(roles).toContain('sound');
  });

  it('renders only semantic chip when phonetic is absent', () => {
    const el = createEtymologySection([makeEtymology({
      etymologyType: 'pictophonetic',
      semantic: '女',
    })]);
    const chips = el.querySelectorAll('.popup-etymology-component');
    expect(chips.length).toBe(1);
    expect(chips[0]?.querySelector('.popup-etymology-component-glyph')?.textContent).toBe('女');
    expect(chips[0]?.querySelector('[class*="component-role--meaning"]')?.textContent).toBe('meaning');
  });

  it('renders decomposition components for ideographic type', () => {
    const el = createEtymologySection([makeEtymology({ etymologyType: 'ideographic' })]);
    const glyphs = Array.from(el.querySelectorAll('.popup-etymology-component-glyph')).map(e => e.textContent);
    expect(glyphs).toContain('女');
    expect(glyphs).toContain('子');
  });

  it('renders component definitions when provided', () => {
    const el = createEtymologySection([makeEtymology({
      etymologyType: 'pictophonetic',
      semantic: '女',
      phonetic: '子',
      componentDefinitions: { '女': 'woman', '子': 'child' },
    })]);
    const defs = Array.from(el.querySelectorAll('.popup-etymology-component-def')).map(e => e.textContent);
    expect(defs).toContain('woman');
    expect(defs).toContain('child');
  });

  it('renders no definition spans when componentDefinitions is absent', () => {
    const el = createEtymologySection([makeEtymology({
      etymologyType: 'pictophonetic',
      semantic: '女',
      phonetic: '子',
    })]);
    expect(el.querySelectorAll('.popup-etymology-component-def').length).toBe(0);
  });

  it('renders no components for pictophonetic with neither semantic nor phonetic', () => {
    const el = createEtymologySection([makeEtymology({ etymologyType: 'pictophonetic' })]);
    expect(el.querySelectorAll('.popup-etymology-component').length).toBe(0);
  });

  it('strips IDS operators from decomposition components', () => {
    const el = createEtymologySection([makeEtymology({ decomposition: '⿰女子' })]);
    const glyphs = Array.from(el.querySelectorAll('.popup-etymology-component-glyph')).map(e => e.textContent);
    expect(glyphs).not.toContain('⿰');
    expect(glyphs).toContain('女');
    expect(glyphs).toContain('子');
  });

  it('renders an empty characters container for an empty input array', () => {
    const el = createEtymologySection([]);
    expect(el.querySelectorAll('.popup-etymology-character').length).toBe(0);
  });
});
