// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createContextSentence, CLOZE_BLANK } from '../context-sentence.js';

describe('createContextSentence', () => {
  it('renders the sentence with the word marked', () => {
    const el = createContextSentence('謝謝', '真的很謝謝你');

    expect(el.querySelector('.context-word')?.textContent).toBe('謝謝');
    expect(el.querySelector('.context-sentence')?.textContent).toBe('真的很謝謝你');
  });

  it('labels the snippet', () => {
    const el = createContextSentence('謝謝', '真的很謝謝你');
    expect(el.querySelector('.context-label')?.textContent).toBe('Seen in');
  });

  it('marks every occurrence of the word', () => {
    const el = createContextSentence('好', '好好好');
    expect(el.querySelectorAll('.context-word')).toHaveLength(3);
  });

  it('hides the word behind a gap when blanked', () => {
    const el = createContextSentence('謝謝', '真的很謝謝你', { blank: true });

    expect(el.textContent).not.toContain('謝謝');
    expect(el.querySelector('.context-blank')?.textContent).toBe(CLOZE_BLANK.repeat(2));
  });

  it('sizes the gap to the hidden word', () => {
    const el = createContextSentence('中國人', '我是中國人', { blank: true });
    expect(el.querySelector('.context-blank')?.textContent).toHaveLength(3);
  });

  it('takes a caller-supplied label', () => {
    const el = createContextSentence('好', '你好', { label: 'Fill the gap' });
    expect(el.querySelector('.context-label')?.textContent).toBe('Fill the gap');
  });

  it('renders the sentence unchanged when the word does not occur in it', () => {
    const el = createContextSentence('謝謝', '你好嗎');

    expect(el.querySelector('.context-sentence')?.textContent).toBe('你好嗎');
    expect(el.querySelector('.context-word')).toBeNull();
  });
});
