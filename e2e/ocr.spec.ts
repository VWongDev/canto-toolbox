import { test, expect, chromium, BrowserContext, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import sharp from 'sharp';
import type { AddressInfo } from 'net';

const EXTENSION_PATH = path.resolve(process.cwd(), 'dist');

const LINES = ['今天天气很好', '我想去图书馆看书', '谢谢你的帮助'];

/**
 * The image under test is drawn here rather than checked in, so the text it
 * holds and the text asserted below cannot drift apart.
 */
const IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="260">
  <rect width="640" height="260" fill="#ffffff"/>
  ${LINES.map((line, i) => `<text x="40" y="${90 + i * 75}" font-family="PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, sans-serif" font-size="44" fill="#111111">${line}</text>`).join('\n  ')}
</svg>`;

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>zh image</title></head>
<body style="padding:40px">
<img id="target" src="/sample.png" width="640" height="260">
</body></html>`;

let context: BrowserContext;
let tmpDataDir: string;
let server: http.Server;
let baseUrl: string;
let extensionId: string;

test.beforeAll(async () => {
  const png = await sharp(Buffer.from(IMAGE_SVG)).png().toBuffer();

  server = http.createServer((req, res) => {
    if (req.url === '/sample.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(png);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE_HTML);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

  tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-ocr-'));
  context = await chromium.launchPersistentContext(tmpDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });

  let [background] = context.serviceWorkers();
  if (!background) {
    background = await context.waitForEvent('serviceworker');
  }
  extensionId = background.url().split('/')[2]!;
});

test.afterAll(async () => {
  await context.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
  fs.rmSync(tmpDataDir, { recursive: true, force: true });
});

/** Hovers the image and reads it, leaving the overlay in place. */
async function readImage(page: Page): Promise<void> {
  await page.hover('#target');
  await expect(page.locator('.canto-ocr-badge')).toBeVisible({ timeout: 15000 });
  await page.click('.canto-ocr-badge');
  // The first read loads the model, so this waits longer than a lookup would.
  await expect(page.locator('.canto-ocr-line').first()).toBeAttached({ timeout: 60000 });
}

test('reading an image lays its text over it', async () => {
  const page = await context.newPage();
  await page.goto(baseUrl);

  await readImage(page);

  await expect(page.locator('.canto-ocr-line')).toHaveText(LINES);
  await page.close();
});

/**
 * The whole point of the overlay: recognised text is ordinary hoverable text,
 * so the popup, the statistics and the flashcards all reach it through the
 * path they already use, with nothing taught about images.
 */
test('hovering recognised text shows the definition popup and studies the word', async () => {
  const page = await context.newPage();
  await page.goto(baseUrl);

  await readImage(page);

  // The third character of the second line: 去 of 我想去图书馆看书.
  const target = await page.evaluate(() => {
    const line = document.querySelectorAll('.canto-ocr-line')[1]!;
    const range = document.createRange();
    range.setStart(line.firstChild!, 2);
    range.setEnd(line.firstChild!, 3);
    const rect = range.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });

  await page.mouse.move(target.x - 20, target.y - 20);
  await page.mouse.move(target.x, target.y);

  const popup = page.locator('#chinese-hover-popup');
  await expect(popup).toBeVisible({ timeout: 15000 });
  await expect(popup.locator('.popup-word')).toHaveText('去');
  await expect(popup.locator('.definition-section')).toHaveCount(2);

  // Dwelling records the word, with the recognised line as the sentence it
  // was met in — exactly as a word met in page text would be. chrome.storage
  // is only reachable from an extension page, not the page under test.
  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/src/stats/stats.html`);

  await expect
    .poll(() => readStatistics(extensionPage), { timeout: 15000 })
    .toMatchObject({ 去: { context: LINES[1] } });

  await extensionPage.close();
  await page.close();
});

function readStatistics(page: Page): Promise<Record<string, { context?: string }>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, { context?: string }>>(resolve => {
        chrome.storage.sync.get('wordStatistics', v => resolve(v.wordStatistics ?? {}));
      }),
  );
}
