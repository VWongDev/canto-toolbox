import type { DefinitionResult } from '../types';
import { createElement } from './dom-element';

export interface PronunciationSectionConfig {
  sectionClassName: string;
  labelClassName: string;
  pronunciationClassName: (key: 'pinyin' | 'jyutping') => string;
  groupClassName: string;
  createDefinitionElement: (definitions: string[]) => HTMLElement;
  showDefinitionIfEmpty?: (pronunciationKey: 'pinyin' | 'jyutping') => boolean;
}

export function createPronunciationSection(
  data: DefinitionResult['mandarin'] | DefinitionResult['cantonese'],
  label: string,
  pronunciationKey: 'pinyin' | 'jyutping',
  config: PronunciationSectionConfig
): HTMLElement {
  const entries = data?.entries || [];
  const grouped = groupEntriesByRomanisation(entries);
  const pronunciationClassName = config.pronunciationClassName(pronunciationKey);

  const pronunciationGroups = Object.entries(grouped).map(([pronunciation, defs]) => {
    const hasDefinition = defs && defs.length > 0;
    const groupChildren: HTMLElement[] = [
      createElement({ className: pronunciationClassName, textContent: pronunciation })
    ];

    const shouldShowDefinition = hasDefinition ||
      (config.showDefinitionIfEmpty && config.showDefinitionIfEmpty(pronunciationKey));

    if (shouldShowDefinition) {
      groupChildren.push(config.createDefinitionElement(defs));
    }

    return createElement({ className: config.groupClassName, children: groupChildren });
  });

  const sectionClasses = [config.sectionClassName];
  if (pronunciationGroups.length === 1) {
    sectionClasses.push('single-pronunciation');
  }

  return createElement({
    className: sectionClasses.join(' '),
    children: [
      createElement({ className: config.labelClassName, textContent: label }),
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

