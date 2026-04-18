#!/usr/bin/env node
// benchmark.ts - Benchmarks dictionary lookup performance

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Dictionary, DictionaryEntry } from '../src/shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, __dirname.includes('dist') ? '../../..' : '../..');

// Mirror of src/background/dictionary.ts
const CANTONESE_MARKER = '(cantonese)';
const MAX_WORD_LENGTH = 4;
// Fail CI if p99 lookup exceeds this threshold (catches algorithmic regressions)
const P99_LIMIT_MS = 10;

function loadDict<T>(name: string): T {
  const path = join(rootDir, `public/data/${name}.json`);
  if (!existsSync(path)) {
    throw new Error(`Dictionary not found: ${path}. Run pnpm build:dict first.`);
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function lookupInDict(dict: Dictionary, word: string): DictionaryEntry[] {
  const entries = dict[word];
  if (!entries) return [];
  return Array.isArray(entries) ? entries : [entries];
}

function filterCantonese(entries: DictionaryEntry[]): DictionaryEntry[] {
  return entries
    .map(e => ({
      ...e,
      definitions: e.definitions.filter(
        d => d.trim().length > 0 && !d.toLowerCase().includes(CANTONESE_MARKER)
      ),
    }))
    .filter(e => e.definitions.length > 0);
}

function isDefinitionValid(entries: DictionaryEntry[]): boolean {
  return entries.length > 0 && entries.some(e => e.definitions.some(d => d.trim().length > 0));
}

function findLongestMatch(mandarin: Dictionary, cantonese: Dictionary, word: string): string | null {
  for (let len = Math.min(word.length, MAX_WORD_LENGTH); len >= 1; len--) {
    const sub = word.substring(0, len);
    if (isDefinitionValid(filterCantonese(lookupInDict(mandarin, sub))) || isDefinitionValid(lookupInDict(cantonese, sub))) {
      return sub;
    }
  }
  return null;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

// Representative mix: single chars, 2-char words, 3-char, and 4-char for longest-match
const TEST_WORDS = [
  '你', '好', '中', '的', '是', '在', '有', '我', '他', '不',
  '你好', '中文', '日本', '電腦', '學習', '工作', '朋友', '今天', '香港', '廣州',
  '普通話', '廣東話', '圖書館',
  '中華人民', '電話號碼', '學習中文',
];

const ITERATIONS = 1000;

interface BenchResult {
  word: string;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

function benchWord(mandarin: Dictionary, cantonese: Dictionary, word: string): BenchResult {
  const times: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    findLongestMatch(mandarin, cantonese, word);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    word,
    mean: times.reduce((a, b) => a + b, 0) / times.length,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
  };
}

function ms(n: number): string {
  return `${n.toFixed(3)}ms`;
}

async function main(): Promise<void> {
  console.log('[Bench] Loading dictionaries...');
  const mandarin = loadDict<Dictionary>('mandarin');
  const cantonese = loadDict<Dictionary>('cantonese');
  console.log(`[Bench] Mandarin: ${Object.keys(mandarin).length} entries`);
  console.log(`[Bench] Cantonese: ${Object.keys(cantonese).length} entries`);
  console.log(`[Bench] ${ITERATIONS} iterations per word, ${TEST_WORDS.length} words\n`);

  // Warmup
  for (const word of TEST_WORDS) findLongestMatch(mandarin, cantonese, word);

  const results: BenchResult[] = [];
  for (const word of TEST_WORDS) {
    const r = benchWord(mandarin, cantonese, word);
    results.push(r);
    console.log(`  "${word}": mean=${ms(r.mean)}  p50=${ms(r.p50)}  p95=${ms(r.p95)}  p99=${ms(r.p99)}`);
  }

  const maxP99 = Math.max(...results.map(r => r.p99));
  const avgP99 = results.reduce((a, r) => a + r.p99, 0) / results.length;
  const worstWord = results.reduce((a, b) => (a.p99 > b.p99 ? a : b));

  console.log(`\n[Bench] Summary:`);
  console.log(`  Avg p99: ${ms(avgP99)}`);
  console.log(`  Max p99: ${ms(maxP99)} ("${worstWord.word}")`);
  console.log(`  Threshold: ${P99_LIMIT_MS}ms`);

  if (maxP99 > P99_LIMIT_MS) {
    console.error(`\n[Bench] FAIL: p99 lookup exceeded ${P99_LIMIT_MS}ms limit (${ms(maxP99)} for "${worstWord.word}")`);
    process.exit(1);
  }

  console.log(`\n[Bench] OK: All lookups within threshold.`);
}

void main();
