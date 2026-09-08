/**
 * Ideographic Description Characters (U+2FF0-U+2FFB) describe how a character's
 * parts are arranged; the full-width question mark marks an unknown part.
 * Neither is a component.
 */
const IDS_COMPONENT_RE = /[⿰-⿻？]/;

/** The component glyphs of a makemeahanzi decomposition string, layout marks dropped. */
export function parseComponents(decomposition: string): string[] {
  return [...decomposition].filter(ch => !IDS_COMPONENT_RE.test(ch));
}
