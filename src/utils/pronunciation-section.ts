import type { DefinitionResult } from '../types';
import { createElement } from '../scripts/dom-utils';
import { groupEntriesByRomanisation } from './dictionary';

export interface PronunciationSectionConfig {
  sectionClassName: string;
  labelClassName: string;
  pronunciationClassName: (key: 'pinyin' | 'jyutping') => string;
  groupClassName: string;
  useGrid?: boolean;
  gridClassName?: string;
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
  
  const createPronunciationGroups = () => {
    return Object.entries(grouped).map(([pronunciation, defs]) => {
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
  };
  
  if (config.useGrid) {
    const gridDataset = config.gridClassName ? { count: String(Math.min(Object.keys(grouped).length, 2)) } : undefined;
    return createElement({
      className: config.sectionClassName,
      children: [
        createElement({ className: config.labelClassName, textContent: label }),
        createElement({
          className: config.gridClassName!,
          dataset: gridDataset,
          children: createPronunciationGroups()
        })
      ]
    });
  }
  
  return createElement({
    className: config.sectionClassName,
    children: [
      createElement({ className: config.labelClassName, textContent: label }),
      ...createPronunciationGroups()
    ]
  });
}

