import type { CharacterEtymology } from './types';
import { createElement } from './dom-element';

function formatEtymologyDescription(etymology: CharacterEtymology): string {
  if (!etymology.etymologyType) {
    return '';
  }

  switch (etymology.etymologyType) {
    case 'pictophonetic': {
      const parts: string[] = [];
      if (etymology.semantic) {
        parts.push(`${etymology.semantic} represents the meaning`);
      }
      if (etymology.phonetic) {
        parts.push(`${etymology.phonetic} represents the sound`);
      }
      if (parts.length > 0) {
        return `Phonosemantic compound. ${parts.join(' and ')}.`;
      }
      return 'Phonosemantic compound.';
    }
    case 'ideographic':
      return etymology.hint ? `Ideographic: ${etymology.hint}` : 'Ideographic compound.';
    case 'pictographic':
      return etymology.hint ? `Pictographic: ${etymology.hint}` : 'Pictographic character.';
    default:
      return '';
  }
}

function createCharacterCard(etymology: CharacterEtymology): HTMLElement {
  const description = formatEtymologyDescription(etymology);

  const children: HTMLElement[] = [
    createElement({
      className: 'popup-etymology-char',
      textContent: etymology.character
    }),
    createElement({
      className: 'popup-etymology-details',
      children: [
        createElement({
          className: 'popup-etymology-radical',
          textContent: `Radical: ${etymology.radical}`
        }),
        createElement({
          className: 'popup-etymology-decomposition',
          textContent: `Structure: ${etymology.decomposition}`
        })
      ]
    })
  ];

  if (description) {
    children.push(
      createElement({
        className: 'popup-etymology-description',
        textContent: description
      })
    );
  }

  return createElement({
    className: 'popup-etymology-character',
    children
  });
}

export function createEtymologySection(etymologies: CharacterEtymology[]): HTMLElement {
  return createElement({
    className: 'popup-etymology-section',
    children: [
      createElement({
        className: 'popup-etymology-label',
        textContent: 'Character Breakdown'
      }),
      createElement({
        className: 'popup-etymology-characters',
        children: etymologies.map(createCharacterCard)
      })
    ]
  });
}
