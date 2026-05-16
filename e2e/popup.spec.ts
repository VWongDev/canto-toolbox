import { test, expect, chromium, BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import type { AddressInfo } from 'net';

const EXTENSION_PATH = path.resolve(process.cwd(), 'dist');

const PAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>zh</title></head>
<body style="font-size:48px;line-height:2;padding:80px">
<p id="zh">你好世界</p>
</body></html>`;

let context: BrowserContext;
let tmpDataDir: string;
let server: http.Server;
let baseUrl: string;

test.beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE_HTML);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

  tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-popup-'));
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
});

test.afterAll(async () => {
  await context.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
  fs.rmSync(tmpDataDir, { recursive: true, force: true });
});

test('hovering Chinese text shows the definition popup', async () => {
  const page = await context.newPage();
  await page.goto(baseUrl);

  const zh = page.locator('#zh');
  await expect(zh).toBeVisible();
  const box = (await zh.boundingBox())!;

  // Move over the first character; a second nudge guarantees a mousemove
  // with movement so the content script's caret detection fires.
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await page.mouse.move(box.x + 12, box.y + box.height / 2);

  const popup = page.locator('#chinese-hover-popup');
  await expect(popup).toBeVisible({ timeout: 15000 });
  await expect(popup.locator('.popup-word')).toHaveText(/你/);
  // Mandarin + Cantonese sections both render
  await expect(popup.locator('.popup-section')).toHaveCount(2);

  await page.close();
});

test('moving the mouse away hides the popup', async () => {
  const page = await context.newPage();
  await page.goto(baseUrl);

  const box = (await page.locator('#zh').boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await page.mouse.move(box.x + 12, box.y + box.height / 2);
  await expect(page.locator('#chinese-hover-popup')).toBeVisible({ timeout: 15000 });

  // Move far away from any Chinese text
  await page.mouse.move(5, 5);
  await page.mouse.move(6, 6);
  await expect(page.locator('#chinese-hover-popup')).toHaveCount(0, { timeout: 15000 });

  await page.close();
});
