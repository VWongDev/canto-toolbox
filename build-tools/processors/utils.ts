import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Dictionary, DictionaryEntry } from '../../src/types.js';

/**
 * Get the root directory of the project
 * Works for both source and compiled output locations
 */
export function getRootDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // Compiled output is in build-tools/dist/, so go up 3 levels to reach root
  // For source files in build-tools/processors/, go up 2 levels
  // This handles both cases
  if (__dirname.includes('dist')) {
    return join(__dirname, '../../..');
  }
  return join(__dirname, '../..');
}

/**
 * Helper to add entries to dictionary, indexing by both simplified and traditional
 */
export function addDictionaryEntry(
  dict: Dictionary,
  entry: DictionaryEntry
): void {
  if (entry.simplified) {
    if (!dict[entry.simplified]) {
      dict[entry.simplified] = [];
    }
    // Only add if not already present (avoid duplicates)
    // Check traditional, simplified, AND romanisation to allow multiple pronunciations
    const exists = dict[entry.simplified].some(
      e => e.traditional === entry.traditional && 
           e.simplified === entry.simplified && 
           e.romanisation === entry.romanisation
    );
    if (!exists) {
      dict[entry.simplified].push(entry);
    }
  }
  // Note: For entries where traditional === simplified, we only add once above
  // For entries where traditional !== simplified, we also add under traditional key
  if (entry.traditional && entry.traditional !== entry.simplified) {
    if (!dict[entry.traditional]) {
      dict[entry.traditional] = [];
    }
    const exists = dict[entry.traditional].some(
      e => e.traditional === entry.traditional && 
           e.simplified === entry.simplified && 
           e.romanisation === entry.romanisation
    );
    if (!exists) {
      dict[entry.traditional].push(entry);
    }
  }
}
