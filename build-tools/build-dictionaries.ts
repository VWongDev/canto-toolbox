#!/usr/bin/env node
// build-dictionaries.ts - Pre-process dictionaries at build time into unified format

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { processMandarinDict } from './processors/mandarin-processor.js';
import { processCantoneseDict } from './processors/cantonese-processor.js';
import type { Dictionary } from '../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Compiled output is in build-tools/dist/, so go up 2 levels to reach root
const rootDir = join(__dirname, '../..');

/**
 * Main build function
 */
async function buildDictionaries(): Promise<void> {
  console.log('[Build] Starting dictionary preprocessing...');
  
  // Dictionary configuration: name -> processor
  const dictionaries: Record<string, () => Promise<Dictionary>> = {
    mandarin: processMandarinDict,
    cantonese: processCantoneseDict
  };
  
  // Create output directory
  const outputDir = join(rootDir, 'src/data');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  
  // Process and write each dictionary
  for (const [name, processor] of Object.entries(dictionaries)) {
    try {
      const dict = await processor();
      
      const outputPath = join(outputDir, `${name}.json`);
      writeFileSync(outputPath, JSON.stringify(dict, null, 2), 'utf-8');
      console.log(`[Build] Wrote ${name.charAt(0).toUpperCase() + name.slice(1)} dictionary: ${outputPath} (${Object.keys(dict).length} entries)`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Build] Failed to process ${name} dictionary:`, errorMessage);
      throw error;
    }
  }
  
  console.log('[Build] Dictionary preprocessing complete!');
}

buildDictionaries();
