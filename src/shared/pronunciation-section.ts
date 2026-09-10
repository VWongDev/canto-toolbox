import type { DefinitionResult } from './types.js';
import { createElement } from './dom-element.js';
import { createDefinitionTextElement } from './definition-list.js';
import { toSyllables } from './pinyin.js';
import { canSpeak, speak, type Reading } from './speech.js';

export interface PronunciationSectionOptions {
  /**
   * Render the "Not found" placeholder for a reading that has no senses,
   * instead of omitting the list entirely. The stats and flashcard surfaces
   * use it on the Mandarin section so the two columns stay aligned; the popup
   * simply shows nothing.
   */
  showPlaceholderWhenEmpty?: boolean;
  /** The word to pronounce. Without it the section renders no audio button. */
  word?: string;
}

/** Speaker glyph, drawn as SVG so it inherits colour and scales cleanly. */
const SPEAKER_SVG =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
  '<path d="M8 2.5 4.5 5.5H2v5h2.5L8 13.5v-11Z" fill="currentColor"/>' +
  '<path d="M10.5 5.8a3 3 0 0 1 0 4.4M12.6 3.7a6 6 0 0 1 0 8.6" stroke="currentColor" ' +
  'stroke-width="1.4" stroke-linecap="round"/></svg>';

function createSpeakButton(word: string, reading: Reading, label: string): HTMLElement {
  const button = createElement({
    tag: 'button',
    className: 'pronunciation-speak',
    attributes: {
      type: 'button',
      'aria-label': `Play ${label} pronunciation of ${word}`,
      title: `Play ${label} pronunciation`,
    },
    listeners: {
      click: (event: Event) => {
        // Surfaces wrap this in clickable rows; playing audio must not also
        // collapse the entry it sits in.
        event.stopPropagation();
        event.preventDefault();
        speak(word, reading);
      },
    },
  });

  button.innerHTML = SPEAKER_SVG;
  return button;
}

/** Each syllable is coloured by tone; the mark or digit still carries it too. */
function createRomanisationElement(
  romanisation: string,
  reading: Reading,
): HTMLElement {
  const children = toSyllables(romanisation, reading).map(syllable =>
    createElement({
      tag: 'span',
      className: syllable.tone
        ? `romanisation-syllable tone-${reading}-${syllable.tone}`
        : 'romanisation-syllable',
      textContent: syllable.text,
    })
  );

  return createElement({
    className: `definition-${reading}`,
    children,
  });
}

export function createPronunciationSection(
  data: DefinitionResult['mandarin'] | DefinitionResult['cantonese'],
  label: string,
  pronunciationKey: Reading,
  { showPlaceholderWhenEmpty = false, word }: PronunciationSectionOptions = {}
): HTMLElement {
  const grouped = groupEntriesByRomanisation(data?.entries || []);

  const pronunciationGroups = Object.entries(grouped).map(([pronunciation, defs]) => {
    const groupChildren: HTMLElement[] = [
      createRomanisationElement(pronunciation, pronunciationKey),
    ];

    if (defs.length > 0 || showPlaceholderWhenEmpty) {
      groupChildren.push(createDefinitionTextElement(defs));
    }

    return createElement({ className: 'pronunciation-group', children: groupChildren });
  });

  const heading: HTMLElement[] = [
    createElement({ className: 'definition-label', textContent: label }),
  ];

  // No audio for a reading this browser has no voice for — a Mandarin voice
  // reading Jyutping would teach the wrong pronunciation.
  if (word && pronunciationGroups.length > 0 && canSpeak(pronunciationKey)) {
    heading.push(createSpeakButton(word, pronunciationKey, label));
  }

  return createElement({
    className: 'definition-section',
    children: [
      createElement({ className: 'definition-heading', children: heading }),
      ...pronunciationGroups
    ]
  });
}

function groupEntriesByRomanisation(entries: Array<{ romanisation?: string; definitions?: string[] }>): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const entry of entries) {
    const romanisation = entry.romanisation || '';
    if (!grouped[romanisation]) {
      grouped[romanisation] = [];
    }
    const defs = entry.definitions || [];
    grouped[romanisation].push(...defs.filter(d => d && String(d).trim().length > 0));
  }
  return grouped;
}
