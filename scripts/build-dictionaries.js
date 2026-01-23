#!/usr/bin/env node
// build-dictionaries.js - Pre-process dictionaries at build time into unified format

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { processMandarinDict } from './processors/mandarin-processor.js';
import { processCantoneseDict } from './processors/cantonese-processor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

/**
 * Main build function
 */
async function buildDictionaries() {
  console.log('[Build] Starting dictionary preprocessing...');
  
  // Dictionary configuration: name -> processor
  const dictionaries = {
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
      const dict = processor();
      
      const outputPath = join(outputDir, `${name}.json`);
      writeFileSync(outputPath, JSON.stringify(dict, null, 2), 'utf-8');
      console.log(`[Build] Wrote ${name.charAt(0).toUpperCase() + name.slice(1)} dictionary: ${outputPath} (${Object.keys(dict).length} entries)`);
    } catch (error) {
      console.error(`[Build] Failed to process ${name} dictionary:`, error.message);
      throw error;
    }
  }
  
  console.log('[Build] Dictionary preprocessing complete!');
}

buildDictionaries();

