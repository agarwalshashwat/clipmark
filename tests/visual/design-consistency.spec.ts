/**
 * DESIGN.md conformance for the WEBAPP, measured on rendered pages.
 *
 * Same rendered-DOM rules as tests/design-consistency.spec.ts applies to the two
 * extension surfaces (they share tests/helpers/page-audit.ts), so "the webapp is
 * consistent with the extension" is checked rather than asserted.
 *
 * Covers the public/marketing and SEO pages, which are the ones that ship
 * unauthenticated — the signed-in dashboard needs a Supabase session and is
 * covered by the integration suite instead.
 *
 * Runs against whatever baseURL the `webapp` project is pointed at. To audit the
 * PRODUCTION build rather than the dev server:
 *   cd webapp && npx next build && npx next start -p 3458
 *   DESIGN_AUDIT_URL=http://localhost:3458 npx playwright test \
 *     tests/visual/design-consistency.spec.ts --project=webapp
 */
import { test, expect, Page } from '@playwright/test';
import { PAGE_AUDIT, AuditResult } from '../helpers/page-audit';

const BASE = process.env.DESIGN_AUDIT_URL ?? '';

const PAGES = [
  ['home', '/'],
  ['upgrade', '/upgrade'],
  ['affiliate', '/affiliate'],
  ['signin', '/signin'],
  ['privacy', '/privacy'],
  ['terms', '/terms'],
  // noindex, but still a public page a real user is sent to — the audit is about
  // how it looks, not whether Google reads it.
  ['feedback', '/feedback'],
] as const;

async function settle(page: Page) {
  // html/body carry `transition: background 0.2s, color 0.2s` from tokens.css,
  // while custom properties switch instantly — auditing too early compares the
  // new foreground against the old background.
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const read = () => getComputedStyle(document.body).backgroundColor;
        const first = read();
        setTimeout(() => resolve(read() === first), 120);
      }),
    null,
    { timeout: 5_000 }
  );
}

async function audit(page: Page, name: string) {
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() =>
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
  await settle(page);
  const res = (await page.evaluate(PAGE_AUDIT)) as AuditResult;
  const byRule = (r: string) => res.findings.filter((f) => f.rule === r);
  const report = ['R3', 'R2', 'R6']
    .filter((r) => byRule(r).length)
    .map((r) => `  ${r} (${byRule(r).length}):\n` +
      byRule(r).map((f) => `    ${f.el} — ${f.detail}`).join('\n'))
    .join('\n');
  if (report) console.log(`\n[${name}] findings:\n${report}\n`);

  expect(byRule('R6'), `${name}: icon ligatures failed to resolve`).toEqual([]);
  expect(byRule('R3'), `${name}: text rendered below the 11px floor`).toEqual([]);
  expect(byRule('R2'), `${name}: computed contrast below WCAG AA`).toEqual([]);
}

test.describe('DESIGN.md conformance — webapp', () => {
  for (const [name, path] of PAGES) {
    test(`${name} conforms`, async ({ page }) => {
      await page.goto(`${BASE}${path}`);
      await audit(page, name);
    });
  }

  test('no font is fetched from a Google CDN, and the wordmark is solid teal', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      const u = r.url();
      if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(u)) external.push(u);
    });
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() =>
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

    expect(external, 'a font was fetched from a Google CDN at runtime').toEqual([]);

    // Every rendering of the wordmark: correct casing, solid, never gradient-clipped.
    const marks = await page.evaluate(() => {
      const out: { text: string; color: string; bg: string; fill: string }[] = [];
      for (const el of document.querySelectorAll('*')) {
        const own = [...el.childNodes].filter((n) => n.nodeType === 3)
          .map((n) => n.textContent ?? '').join('').trim();
        if (!/^ClipMark$/i.test(own)) continue;
        const cs = getComputedStyle(el);
        out.push({ text: own, color: cs.color, bg: cs.backgroundImage, fill: cs.webkitTextFillColor });
      }
      return out;
    });
    expect(marks.length, 'the wordmark was not found on the home page').toBeGreaterThan(0);
    for (const m of marks) {
      expect(m.text, 'wordmark casing must be exactly "ClipMark"').toBe('ClipMark');
      expect(m.bg, 'the wordmark must never be a gradient').toBe('none');
      expect(m.fill, 'the wordmark must be solid, not clipped to transparent')
        .not.toBe('rgba(0, 0, 0, 0)');
    }
  });

  test('mobile keeps the 11px floor', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/`);
    await audit(page, 'home @375px');
  });
});
