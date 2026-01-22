#!/usr/bin/env node
// build-dictionaries.js - Pre-process dictionaries at build time into unified format

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

/**
 * Parse CC-CEDICT format text file
 * Format: Traditional Simplified [pinyin] {jyutping} /def1/def2/
 */
function parseCedictFormat(text) {
  const dict = {};
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (!line || line.startsWith('#') || line.trim().length === 0) {
      continue;
    }
    
    // Try format with definitions: Traditional Simplified [pinyin] {jyutping} /def1/def2/
    let match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\{([^}]+)\}\s+\/(.+)\/$/);
    if (match) {
      const [, traditional, simplified, pinyin, jyutping, definitions] = match;
      const defs = definitions.split('/').filter(d => d.trim().length > 0);
      
      const entry = {
        traditional,
        simplified,
        pinyin: pinyin || '',
        jyutping: jyutping || '',
        definitions: defs.filter(d => d && String(d).trim().length > 0)
      };
      
      // Store as arrays to support multiple pronunciations per word
      if (simplified) {
        if (!dict[simplified]) {
          dict[simplified] = [];
        }
        dict[simplified].push(entry);
      }
      if (traditional && traditional !== simplified) {
        if (!dict[traditional]) {
          dict[traditional] = [];
        }
        dict[traditional].push(entry);
      }
      continue;
    }
    
    // Try format without jyutping: Traditional Simplified [pinyin] /def1/def2/
    match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/$/);
    if (match) {
      const [, traditional, simplified, pinyin, definitions] = match;
      const defs = definitions.split('/').filter(d => d.trim().length > 0);
      
      const entry = {
        traditional,
        simplified,
        pinyin: pinyin || '',
        jyutping: '',
        definitions: defs.filter(d => d && String(d).trim().length > 0)
      };
      
      if (simplified) {
        if (!dict[simplified]) {
          dict[simplified] = [];
        }
        dict[simplified].push(entry);
      }
      if (traditional && traditional !== simplified) {
        if (!dict[traditional]) {
          dict[traditional] = [];
        }
        dict[traditional].push(entry);
      }
      continue;
    }
    
    // Try format with jyutping but no definitions: Traditional Simplified [pinyin] {jyutping}
    match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\{([^}]+)\}$/);
    if (match) {
      const [, traditional, simplified, pinyin, jyutping] = match;
      
      const entry = {
        traditional,
        simplified,
        pinyin: pinyin || '',
        jyutping: jyutping || '',
        definitions: []
      };
      
      if (simplified) {
        if (!dict[simplified]) {
          dict[simplified] = [];
        }
        dict[simplified].push(entry);
      }
      if (traditional && traditional !== simplified) {
        if (!dict[traditional]) {
          dict[traditional] = [];
        }
        dict[traditional].push(entry);
      }
    }
  }
  
  return dict;
}

/**
 * Process Mandarin dictionary from JS module format
 */
function processMandarinDict() {
  const mandarinPaths = [
    join(rootDir, 'dictionaries/mandarin/data/all.js'),
    join(rootDir, 'dictionaries/mandarin/data/simplified.js')
  ];

  let mandarinDict = {};

  for (const path of mandarinPaths) {
    if (!existsSync(path)) {
      console.warn(`[Build] Mandarin dictionary file not found: ${path}`);
      continue;
    }

    try {
      const text = readFileSync(path, 'utf-8');
      
      // Extract the data from the export default statement
      let dataText = text.trim();
      if (dataText.startsWith('export default ')) {
        dataText = dataText.substring('export default '.length);
      }
      
      // Parse JSON
      let parsedData;
      try {
        parsedData = JSON.parse(dataText);
      } catch (jsonError) {
        // Try to extract just the JSON part
        const jsonMatch = dataText.match(/^(\{.*\}|\[.*\])/s);
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[1]);
        } else {
          throw jsonError;
        }
      }
      
      // Handle different structures
      let dataArray = null;
      if (parsedData && typeof parsedData === 'object') {
        if (Array.isArray(parsedData)) {
          dataArray = parsedData;
        } else if (parsedData.all && Array.isArray(parsedData.all)) {
          dataArray = parsedData.all;
        } else if (parsedData.simplified && Array.isArray(parsedData.simplified)) {
          dataArray = parsedData.simplified;
        } else if (parsedData.traditional && Array.isArray(parsedData.traditional)) {
          dataArray = parsedData.traditional;
        }
      }
      
      if (!dataArray) {
        console.warn(`[Build] Could not find array data in ${path}`);
        continue;
      }
      
      console.log(`[Build] Processing ${dataArray.length} Mandarin entries from ${path}...`);
      
      // Convert to unified format
      for (const entry of dataArray) {
        if (Array.isArray(entry) && entry.length >= 4) {
          const [traditional, simplified, pinyin, definition] = entry;
          const definitions = Array.isArray(definition) ? definition : [definition];
          
          const dictEntry = {
            traditional,
            simplified,
            pinyin: pinyin || '',
            jyutping: '', // Mandarin doesn't have jyutping
            definitions: definitions.filter(d => d && String(d).trim().length > 0)
          };
          
          // Index by both simplified and traditional
          if (simplified) {
            if (!mandarinDict[simplified]) {
              mandarinDict[simplified] = [];
            }
            mandarinDict[simplified].push(dictEntry);
          }
          if (traditional && traditional !== simplified) {
            if (!mandarinDict[traditional]) {
              mandarinDict[traditional] = [];
            }
            mandarinDict[traditional].push(dictEntry);
          }
        }
      }
      
      console.log(`[Build] Loaded Mandarin dictionary: ${Object.keys(mandarinDict).length} entries`);
      break; // Use first successful load
    } catch (error) {
      console.error(`[Build] Failed to process Mandarin dictionary from ${path}:`, error.message);
      continue;
    }
  }

  return mandarinDict;
}

/**
 * Process Cantonese dictionary
 */
function processCantoneseDict() {
  const mainPath = join(rootDir, 'dictionaries/cantonese/cccanto-webdist.txt');
  const readingsPath = join(rootDir, 'dictionaries/cantonese/cccedict-canto-readings.txt');

  let cantoneseDict = {};
  let cantoneseReadingsDict = {};

  // Load main dictionary with definitions
  if (existsSync(mainPath)) {
    try {
      const text = readFileSync(mainPath, 'utf-8');
      console.log(`[Build] Processing Cantonese dictionary from ${mainPath}...`);
      cantoneseDict = parseCedictFormat(text);
      console.log(`[Build] Loaded Cantonese dictionary: ${Object.keys(cantoneseDict).length} entries`);
    } catch (error) {
      console.error(`[Build] Failed to load main Cantonese dictionary:`, error.message);
    }
  }

  // Load readings-only dictionary and merge
  if (existsSync(readingsPath)) {
    try {
      const text = readFileSync(readingsPath, 'utf-8');
      console.log(`[Build] Processing Cantonese readings from ${readingsPath}...`);
      cantoneseReadingsDict = parseCedictFormat(text);
      console.log(`[Build] Loaded Cantonese readings: ${Object.keys(cantoneseReadingsDict).length} entries`);
      
      // Merge readings into main dictionary
      let mergedCount = 0;
      for (const [word, readingEntries] of Object.entries(cantoneseReadingsDict)) {
        const readingEntryArray = Array.isArray(readingEntries) ? readingEntries : [readingEntries];
        const mainEntries = cantoneseDict[word];
        const mainEntryArray = Array.isArray(mainEntries) ? mainEntries : (mainEntries ? [mainEntries] : []);
        
        if (mainEntryArray.length > 0) {
          // Entry exists in main dict, add jyutping if missing
          for (const readingEntry of readingEntryArray) {
            for (const mainEntry of mainEntryArray) {
              if (!mainEntry.jyutping && readingEntry.jyutping) {
                mainEntry.jyutping = readingEntry.jyutping;
                mergedCount++;
              }
            }
          }
          cantoneseDict[word] = mainEntryArray;
        } else {
          // Entry only in readings dict, add it to main dict
          cantoneseDict[word] = readingEntryArray;
          mergedCount += readingEntryArray.length;
        }
      }
      console.log(`[Build] Merged ${mergedCount} readings into Cantonese dictionary`);
    } catch (error) {
      console.error(`[Build] Failed to load Cantonese readings:`, error.message);
    }
  }

  return cantoneseDict;
}

/**
 * Main build function
 */
async function buildDictionaries() {
  console.log('[Build] Starting dictionary preprocessing...');
  
  const mandarinDict = processMandarinDict();
  const cantoneseDict = processCantoneseDict();
  
  // Create output directory
  const outputDir = join(rootDir, 'src/data');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  
  // Write unified dictionaries
  const mandarinPath = join(outputDir, 'mandarin.json');
  const cantonesePath = join(outputDir, 'cantonese.json');
  
  writeFileSync(mandarinPath, JSON.stringify(mandarinDict, null, 2), 'utf-8');
  writeFileSync(cantonesePath, JSON.stringify(cantoneseDict, null, 2), 'utf-8');
  
  console.log(`[Build] Wrote Mandarin dictionary: ${mandarinPath} (${Object.keys(mandarinDict).length} entries)`);
  console.log(`[Build] Wrote Cantonese dictionary: ${cantonesePath} (${Object.keys(cantoneseDict).length} entries)`);
  console.log('[Build] Dictionary preprocessing complete!');
}

buildDictionaries();

