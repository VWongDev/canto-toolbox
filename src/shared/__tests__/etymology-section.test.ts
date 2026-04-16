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

  it('renders the radical', () => {
    const el = createEtymologySection([makeEtymology()]);
    expect(el.querySelector('.popup-etymology-radical')?.textContent).toBe('Radical: 女');
  });

  it('renders the decomposition', () => {
    const el = createEtymologySection([makeEtymology()]);
    expect(el.querySelector('.popup-etymology-decomposition')?.textContent).toBe('Structure: ⿰女子');
  });

  it('renders no description element when etymologyType is absent', () => {
    const el = createEtymologySection([makeEtymology()]);
    expect(el.querySelector('.popup-etymology-description')).toBeNull();
  });

  it('renders pictophonetic description with semantic and phonetic', () => {
    const el = createEtymologySection([makeEtymology({
      etymologyType: 'pictophonetic',
      semantic: '女',
      phonetic: '子',
    })]);
    const desc = el.querySelector('.popup-etymology-description')?.textContent ?? '';
    expect(desc).toContain('Phonosemantic compound');
    expect(desc).toContain('女 represents the meaning');
    expect(desc).toContain('子 represents the sound');
  });

  it('renders pictophonetic description with semantic only', () => {
    const el = createEtymologySection([makeEtymology({
      etymologyType: 'pictophonetic',
      semantic: '女',
    })]);
    const desc = el.querySelector('.popup-etymology-description')?.textContent ?? '';
    expect(desc).toContain('Phonosemantic compound');
    expect(desc).toContain('女 represents the meaning');
    expect(desc).not.toContain('represents the sound');
  });

  it('renders pictophonetic with no parts as bare label', () => {
    const el = createEtymologySection([makeEtymology({ etymologyType: 'pictophonetic' })]);
    const desc = el.querySelector('.popup-etymology-description')?.textContent ?? '';
    expect(desc).toBe('Phonosemantic compound.');
  });

  it('renders ideographic description with hint', () => {
    const el = createEtymologySection([makeEtymology({ etymologyType: 'ideographic', hint: 'two trees' })]);
    expect(el.querySelector('.popup-etymology-description')?.textContent).toBe('Ideographic: two trees');
  });

  it('renders ideographic description without hint', () => {
    const el = createEtymologySection([makeEtymology({ etymologyType: 'ideographic' })]);
    expect(el.querySelector('.popup-etymology-description')?.textContent).toBe('Ideographic compound.');
  });

  it('renders pictographic description with hint', () => {
    const el = createEtymologySection([makeEtymology({ etymologyType: 'pictographic', hint: 'sun' })]);
    expect(el.querySelector('.popup-etymology-description')?.textContent).toBe('Pictographic: sun');
  });

  it('renders pictographic description without hint', () => {
    const el = createEtymologySection([makeEtymology({ etymologyType: 'pictographic' })]);
    expect(el.querySelector('.popup-etymology-description')?.textContent).toBe('Pictographic character.');
  });

  it('renders an empty characters container for an empty input array', () => {
    const el = createEtymologySection([]);
    expect(el.querySelectorAll('.popup-etymology-character').length).toBe(0);
  });
});
