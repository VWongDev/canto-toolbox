import type { DefinitionResult } from './types.js';
import { createElement } from './dom-element.js';
import { createDefinitionTextElement } from './definition-list.js';
import { toToneMarks } from './pinyin.js';

export interface PronunciationSectionOptions {
  /**
   * Render the "Not found" placeholder for a reading that has no senses,
   * instead of omitting the list entirely. The stats and flashcard surfaces
   * use it on the Mandarin section so the two columns stay aligned; the popup
   * simply shows nothing.
   */
  showPlaceholderWhenEmpty?: boolean;
}

export function createPronunciationSection(
  data: DefinitionResult['mandarin'] | DefinitionResult['cantonese'],
  label: string,
  pronunciationKey: 'pinyin' | 'jyutping',
  { showPlaceholderWhenEmpty = false }: PronunciationSectionOptions = {}
): HTMLElement {
  const grouped = groupEntriesByRomanisation(data?.entries || []);

  const pronunciationGroups = Object.entries(grouped).map(([pronunciation, defs]) => {
    // Jyutping keeps its trailing tone digits — that is how it is written.
    const displayPronunciation =
      pronunciationKey === 'pinyin' ? toToneMarks(pronunciation) : pronunciation;
    const groupChildren: HTMLElement[] = [
      createElement({
        className: `definition-${pronunciationKey}`,
        textContent: displayPronunciation
      })
    ];

    if (defs.length > 0 || showPlaceholderWhenEmpty) {
      groupChildren.push(createDefinitionTextElement(defs));
    }

    return createElement({ className: 'pronunciation-group', children: groupChildren });
  });

  return createElement({
    className: 'definition-section',
    children: [
      createElement({ className: 'definition-label', textContent: label }),
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
