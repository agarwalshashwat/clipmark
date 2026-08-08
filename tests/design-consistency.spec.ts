/**
 * DESIGN.md conformance, measured on the RENDERED extension surfaces.
 *
 * scripts/design-audit.mjs reads source and the packaged bytes; it cannot see
 * what the browser actually computes. This spec loads `extension/dist` in a real
 * Chrome, seeds chrome.storage so the data-driven screens (clip cards, the A–B
 * loop range, the recall strip) actually paint, and then asserts on
 * getComputedStyle. It catches the things static analysis structurally can't:
 *
 *   - a self-hosted @font-face that 404s in the package (icons would render as
 *     the literal ligature text, e.g. "play_arrow", and static analysis is blind
 *     to it because the CSS is correct — the file is just missing)
 *   - text pushed below the 11px floor by a rule the audit didn't reach, e.g.
 *     JS-generated markup or a cascade winner
 *   - a filled control whose COMPUTED background/foreground pair fails WCAG AA,
 *     including pairs that only exist after the cascade resolves
 *   - the dashboard and side-panel headers computing to different chrome
 *
 * Requires `make ext-build` first (skips with a message otherwise).
 */
import { test, expect, chromium, BrowserContext, Page, Worker } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'path';
import { PAGE_AUDIT } from './helpers/page-audit';

const DIST = path.resolve(__dirname, '../extension/dist');
const VIDEO_ID = 'dQw4w9WgXcQ';

async function extensionServiceWorker(context: BrowserContext): Promise<Worker> {
  const found = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  if (found) return found;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const w = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    if (w.url().startsWith('chrome-extension://')) return w;
  }
}

/** Bookmarks that light up the clip card, the tag pills and a saved A–B loop. */
function seedBookmarks() {
  const base = {
    videoId: VIDEO_ID,
    videoTitle: 'How to Actually Remember What You Watch',
    tags: ['important', 'study'],
    color: '#14b8a6',
    createdAt: new Date('2026-08-01T10:00:00Z').toISOString(),
    reviewSchedule: [1, 3, 7],
    lastReviewed: null,
  };
  return [
    { ...base, id: 3001, timestamp: 30, description: 'The spacing effect #important' },
    { ...base, id: 3002, timestamp: 95, description: 'Interleaving beats blocking #study' },
    { ...base, id: 3003, timestamp: 140, description: 'Drill this bit', loop: { end: 168 } },
  ];
}


test.describe('DESIGN.md conformance on the rendered surfaces', () => {
  test.skip(!existsSync(DIST), 'extension/dist missing — run `make ext-build` first');

  let context: BrowserContext;
  let extensionId: string;

  test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
      headless: false, // Chrome extensions require non-headless
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--no-sandbox'],
    });
    const worker = await extensionServiceWorker(context);
    extensionId = new URL(worker.url()).host;
    await worker.evaluate(
      ([key, bookmarks]) =>
        new Promise<void>((resolve) =>
          // @ts-expect-error — chrome is the extension's own global here
          chrome.storage.sync.set({ [key as string]: bookmarks }, () => resolve())
        ),
      [`bm_${VIDEO_ID}`, seedBookmarks()] as const
    );
  });

  test.afterAll(async () => { await context?.close(); });

  async function settle(page: Page) {
    // html/body carry `transition: background 0.2s, color 0.2s`; custom
    // properties do not transition. Auditing before the transition finishes
    // compares the new foreground against the old background.
    await page.waitForFunction(() => new Promise<boolean>((resolve) => {
      const read = () => getComputedStyle(document.body).backgroundColor;
      const first = read();
      setTimeout(() => resolve(read() === first), 120);
    }), null, { timeout: 5_000 });
  }

  async function auditPage(page: Page, name: string) {
    await settle(page);
    const res = await page.evaluate(PAGE_AUDIT);
    const byRule = (r: string) => res.findings.filter((f: any) => f.rule === r);
    const fmt = (r: string) =>
      byRule(r).map((f: any) => `    ${f.el} — ${f.detail}`).join('\n');

    // Report every rule together so one run gives the whole picture.
    const report = ['R3', 'R2', 'R6']
      .filter((r) => byRule(r).length)
      .map((r) => `  ${r} (${byRule(r).length}):\n${fmt(r)}`)
      .join('\n');
    if (report) console.log(`\n[${name}] findings:\n${report}\n`);

    expect(res.iconsChecked, `${name}: no visible icons were rendered to check`).toBeGreaterThan(0);
    expect(byRule('R6'), `${name}: icon ligatures failed to resolve`).toEqual([]);
    expect(byRule('R3'), `${name}: text rendered below the 11px floor`).toEqual([]);
    expect(byRule('R2'), `${name}: computed contrast below WCAG AA`).toEqual([]);
    return res;
  }

  test('the dashboard conforms, and its chrome matches the side panel', async () => {
    const dash = await context.newPage();
    await dash.setViewportSize({ width: 1280, height: 900 });
    await dash.goto(`chrome-extension://${extensionId}/src/pages/dashboard.html`);
    await dash.locator('.page-title').waitFor();
    await dash.evaluate(() =>
        // `document.fonts.status === 'loaded'` can be true before a face has even
        // been REQUESTED — faces load lazily, and with font-display: block the
        // browser lays out with fallback metrics meanwhile. Measuring ligature
        // widths in that window reports every icon as broken. Demand the faces.
        Promise.all([
            (document as any).fonts.load("400 20px 'Material Symbols Outlined'"),
            (document as any).fonts.load("700 16px 'Plus Jakarta Sans'"),
            (document as any).fonts.load("400 14px 'Inter'"),
        ]).then(() => (document as any).fonts.ready).then(() => undefined)
    );

    // The wordmark is solid teal and never gradient-clipped.
    const wordmark = await dash.locator('.page-title').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { text: el.textContent, color: cs.color, backgroundImage: cs.backgroundImage,
               fill: cs.webkitTextFillColor };
    });
    expect(wordmark.text?.trim()).toBe('ClipMark');
    expect(wordmark.backgroundImage).toBe('none');
    expect(wordmark.color).toBe('rgb(15, 118, 110)');   // teal-700
    expect(wordmark.fill).toBe('rgb(15, 118, 110)');

    const dashRes = await auditPage(dash, 'dashboard');
    const dashHeader = await dash.locator('.page-header')
      .evaluate((el) => getComputedStyle(el).backgroundColor);

    // Side panel, opened as a page so it can be driven directly.
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 400, height: 900 });
    await panel.goto(`chrome-extension://${extensionId}/src/pages/side-panel.html`);
    await panel.locator('.sp-logo-text').waitFor();
    await panel.evaluate(() =>
        // `document.fonts.status === 'loaded'` can be true before a face has even
        // been REQUESTED — faces load lazily, and with font-display: block the
        // browser lays out with fallback metrics meanwhile. Measuring ligature
        // widths in that window reports every icon as broken. Demand the faces.
        Promise.all([
            (document as any).fonts.load("400 20px 'Material Symbols Outlined'"),
            (document as any).fonts.load("700 16px 'Plus Jakarta Sans'"),
            (document as any).fonts.load("400 14px 'Inter'"),
        ]).then(() => (document as any).fonts.ready).then(() => undefined)
    );

    const panelWordmark = await panel.locator('.sp-logo-text').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { text: el.textContent, color: cs.color, backgroundImage: cs.backgroundImage };
    });
    expect(panelWordmark.text?.trim()).toBe('ClipMark');
    expect(panelWordmark.backgroundImage).toBe('none');
    expect(panelWordmark.color).toBe(wordmark.color); // identical brand ink

    await auditPage(panel, 'side-panel');
    const panelHeader = await panel.locator('.side-panel-header')
      .evaluate((el) => getComputedStyle(el).backgroundColor);

    // R7 — one glass chrome across both surfaces.
    expect(panelHeader, 'side-panel header chrome must match the dashboard').toBe(dashHeader);
    expect(dashRes.navBg).not.toBe('');

    await panel.close();
    await dash.close();
  });

  test('dark mode holds the same rules', async () => {
    const dash = await context.newPage();
    await dash.setViewportSize({ width: 1280, height: 900 });
    await dash.goto(`chrome-extension://${extensionId}/src/pages/dashboard.html`);
    await dash.locator('.page-title').waitFor();
    await dash.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await dash.evaluate(() =>
        // `document.fonts.status === 'loaded'` can be true before a face has even
        // been REQUESTED — faces load lazily, and with font-display: block the
        // browser lays out with fallback metrics meanwhile. Measuring ligature
        // widths in that window reports every icon as broken. Demand the faces.
        Promise.all([
            (document as any).fonts.load("400 20px 'Material Symbols Outlined'"),
            (document as any).fonts.load("700 16px 'Plus Jakarta Sans'"),
            (document as any).fonts.load("400 14px 'Inter'"),
        ]).then(() => (document as any).fonts.ready).then(() => undefined)
    );
    await settle(dash);

    // Brand text switches to the light teal so it stays legible on the dark canvas.
    const color = await dash.locator('.page-title').evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe('rgb(45, 212, 191)'); // teal-400

    await auditPage(dash, 'dashboard (dark)');
    await dash.close();
  });
});

