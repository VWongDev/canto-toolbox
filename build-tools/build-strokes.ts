#!/usr/bin/env node
// build-strokes.ts - Split makemeahanzi stroke graphics into per-character files

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, __dirname.includes('dist') ? '../../..' : '../..');

const GRAPHICS_FILE = 'dictionaries/makemeahanzi/graphics.txt';
const OUTPUT_DIR = 'public/strokes';

/**
 * graphics.txt is 30 MB across 9,574 characters, and a review session reads
 * one of them. Splitting it per character means the flashcards page fetches
 * ~3 KB for the card in front of the reader instead of parsing the whole
 * corpus into memory, which is what the dictionaries do and what makes them
 * worth an offscreen document to hold.
 */
export interface StrokeRecord {
  character: string;
  /** SVG path data per stroke, in stroke order. */
  strokes: string[];
  /** The centre line of each stroke, used to grade what the reader drew. */
  medians: number[][][];
}

/**
 * The file a character's strokes are written to. Hex codepoints keep the
 * package ASCII-named — makemeahanzi's own svgs/ use decimal, but hex is what
 * the runtime gets from `codePointAt` without a conversion.
 */
export function strokeFileName(character: string): string {
  return `${character.codePointAt(0)?.toString(16)}.json`;
}

/** One line of graphics.txt, or null if it carries no usable graphics. */
export function parseGraphicsLine(line: string): StrokeRecord | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let parsed: Partial<StrokeRecord>;
  try {
    parsed = JSON.parse(trimmed) as Partial<StrokeRecord>;
  } catch {
    return null;
  }

  const { character, strokes, medians } = parsed;
  if (!character || !Array.isArray(strokes) || !Array.isArray(medians)) return null;

  // A stroke with no median cannot be graded, so a mismatched pair is as
  // useless as a missing one.
  if (strokes.length === 0 || strokes.length !== medians.length) return null;

  return { character, strokes, medians };
}

function countLines(bytes: Buffer): number {
  let lines = 0;
  for (const byte of bytes) {
    if (byte === 0x0a) lines++;
  }
  return lines;
}

/**
 * Whether the last run already covers this graphics.txt. Nothing here is
 * fetched, so there are no digests to check as the OCR assets do — but the
 * count moving means the submodule moved, and a rebuild is cheap enough to
 * pay whenever it does.
 */
function isUpToDate(indexPath: string, expected: number): boolean {
  if (!existsSync(indexPath)) return false;

  try {
    const characters = JSON.parse(readFileSync(indexPath, 'utf-8')) as string;
    return [...characters].length === expected;
  } catch {
    return false;
  }
}

export function buildStrokes(): void {
  const graphicsPath = join(rootDir, GRAPHICS_FILE);
  if (!existsSync(graphicsPath)) {
    throw new Error(
      `${GRAPHICS_FILE} is missing — run 'git submodule update --init --recursive' first`,
    );
  }

  const outputDir = join(rootDir, OUTPUT_DIR);
  const indexPath = join(outputDir, 'index.json');

  const bytes = readFileSync(graphicsPath);
  if (isUpToDate(indexPath, countLines(bytes))) {
    console.log('[Strokes] Already built.');
    return;
  }

  // A partial directory from an interrupted run would leave characters the
  // index promises but no file backs.
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  const characters: string[] = [];
  for (const line of bytes.toString('utf-8').split('\n')) {
    const record = parseGraphicsLine(line);
    if (!record) continue;

    const { character, strokes, medians } = record;
    writeFileSync(join(outputDir, strokeFileName(character)), JSON.stringify({ strokes, medians }));
    characters.push(character);
  }

  // Sorted, so a rebuild of the same submodule commit is byte-identical.
  characters.sort();
  writeFileSync(indexPath, JSON.stringify(characters.join('')));

  // graphics.txt is Arphic Public Licensed, not LGPL like the rest of the
  // submodule, and the licence requires its text to travel with the data.
  copyFileSync(
    join(rootDir, 'dictionaries/makemeahanzi/APL/english/ARPHICPL.TXT'),
    join(outputDir, 'ARPHICPL.TXT'),
  );

  console.log(`[Strokes] Wrote ${characters.length} characters to ${OUTPUT_DIR}/`);
}

// Only when run as a script, so the tests can import the parser without
// rewriting 30 MB of output.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildStrokes();
}
