#!/usr/bin/env node
// check-bundle-size.ts - Checks dist/ bundle sizes against a committed baseline.
// Usage:
//   node check-bundle-size.js           # compare against baseline
//   node check-bundle-size.js --update  # write current sizes as new baseline

import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, __dirname.includes('dist') ? '../../..' : '../..');

const DIST_DIR = join(rootDir, 'dist');
const BASELINE_PATH = join(rootDir, 'perf/size-baseline.json');
// Fail if any tracked file grows by more than this fraction
const REGRESSION_THRESHOLD = 0.10;

type SizeMap = Record<string, number>;

function getFileSizes(dir: string): SizeMap {
  const sizes: SizeMap = {};
  function walk(d: string): void {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        sizes[relative(dir, full)] = statSync(full).size;
      }
    }
  }
  walk(dir);
  return sizes;
}

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function total(sizes: SizeMap): number {
  return Object.values(sizes).reduce((a, b) => a + b, 0);
}

async function main(): Promise<void> {
  const isUpdate = process.argv.includes('--update');

  if (!existsSync(DIST_DIR)) {
    console.error('[Size] dist/ not found. Run pnpm build first.');
    process.exit(1);
  }

  const current = getFileSizes(DIST_DIR);

  if (isUpdate) {
    const perfDir = join(rootDir, 'perf');
    if (!existsSync(perfDir)) mkdirSync(perfDir, { recursive: true });
    writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + '\n', 'utf-8');
    console.log(`[Size] Baseline updated: ${BASELINE_PATH}`);
    console.log(`[Size] Total: ${fmt(total(current))} across ${Object.keys(current).length} files`);
    return;
  }

  // Print current sizes sorted by size descending
  console.log('[Size] Current bundle:');
  for (const [file, size] of Object.entries(current).sort(([, a], [, b]) => b - a)) {
    console.log(`  ${fmt(size).padStart(8)}  ${file}`);
  }
  console.log(`  ${'Total:'.padStart(8)}  ${fmt(total(current))}\n`);

  if (!existsSync(BASELINE_PATH)) {
    console.log('[Size] No baseline found — run `pnpm size:update-baseline` after a clean build to create one.');
    return;
  }

  const baseline: SizeMap = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
  let hasRegression = false;

  console.log('[Size] Diff vs baseline:');
  for (const [file, baseSize] of Object.entries(baseline)) {
    const curSize = current[file];
    if (curSize === undefined) {
      console.log(`  ${'REMOVED'.padStart(8)}  ${file} (was ${fmt(baseSize)})`);
      continue;
    }
    const delta = curSize - baseSize;
    const pct = delta / baseSize;
    const sign = delta >= 0 ? '+' : '';
    const tag = pct > REGRESSION_THRESHOLD ? 'FAIL' : pct > 0.02 ? 'WARN' : 'ok  ';
    const line = `  [${tag}]  ${fmt(curSize).padStart(8)}  ${sign}${fmt(Math.abs(delta))} (${sign}${(pct * 100).toFixed(1)}%)  ${file}`;
    if (pct > REGRESSION_THRESHOLD) {
      console.error(line);
      hasRegression = true;
    } else {
      console.log(line);
    }
  }

  // New files not in baseline
  for (const [file, size] of Object.entries(current)) {
    if (!(file in baseline)) {
      console.log(`  [ new]  ${fmt(size).padStart(8)}  ${file}`);
    }
  }

  const baseTotal = total(baseline);
  const curTotal = total(current);
  const totalDelta = curTotal - baseTotal;
  const totalPct = totalDelta / baseTotal;
  const sign = totalDelta >= 0 ? '+' : '';
  console.log(`\n  Total: ${fmt(curTotal)} (${sign}${fmt(Math.abs(totalDelta))}, ${sign}${(totalPct * 100).toFixed(1)}%)`);

  if (hasRegression) {
    console.error(`\n[Size] FAIL: Files exceeded baseline by >${REGRESSION_THRESHOLD * 100}%.`);
    console.error('[Size] If intentional, run: pnpm size:update-baseline && git add perf/size-baseline.json');
    process.exit(1);
  }

  console.log('\n[Size] OK: No bundle size regressions.');
}

void main();
