export function groupEntriesByRomanisation(entries: Array<{ romanisation?: string; definitions?: string[] }>): Record<string, string[]> {
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

