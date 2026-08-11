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
import { test, expect, BrowserContext, Page, Worker } from '@playwright/test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'path';
import { PAGE_AUDIT } from './helpers/page-audit';
import { launchExtensionContext, TEST_VIDEO_ID } from './fixtures';

const DIST = path.resolve(__dirname, '../extension/dist');
const VIDEO_ID = TEST_VIDEO_ID;

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
    context = await launchExtensionContext(DIST);
    const worker = await extensionServiceWorker(context);
    extensionId = new URL(worker.url()).host;
    await worker.evaluate(
      ([key, bookmarks]) =>
        new Promise<void>((resolve) =>
            // @ts-expect-error — chrome is the extension's own global here
          chrome.storage.sync.set({
            [key as string]: bookmarks,
            // A fresh profile runs the first-run guided tour, whose driver.js
            // overlay is fixed at z-index 1000010 and sits over everything.
            // These tests assert steady-state styling, so start past it.
            tourState: { youtubeTour: true, sidePanelTour: true, recallCoachMark: true },
          }, () => resolve())
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

  test('a saved loop shows its A-B range, matching the web dashboard', async () => {
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 400, height: 900 });
    await panel.goto(`chrome-extension://${extensionId}/src/pages/side-panel.html`);
    await panel.locator('.sp-logo-text').waitFor();

    // Opened standalone there is no active YouTube tab, so the panel shows its
    // off-YouTube clip cards — the surface #87 added, and the one a user sees
    // most often. The seed carries one loop (140 -> 168) and two point
    // bookmarks; the card used to render all three as single timecodes because
    // the moment projection dropped the loop field entirely.
    const loopChip = panel.locator('.sp-clip-moment-time--loop');
    await loopChip.first().waitFor({ timeout: 15_000 });
    await expect(loopChip).toHaveCount(1);
    await expect(loopChip.first()).toContainText('2:20 → 2:48');

    // Point bookmarks keep their single timecode.
    const plain = panel.locator('.sp-clip-moment-time:not(.sp-clip-moment-time--loop)');
    await expect(plain).toHaveCount(2);
    await expect(plain.first()).not.toContainText('→');

    await panel.close();
  });

  test('the wordmark stays visible in the off-YouTube idle state', async () => {
    // The idle screen used to be `inset: 0; z-index: 1000` against the whole
    // panel, so it covered the header — the panel's MOST COMMON state showed no
    // wordmark. It now covers only .side-panel-body.
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 420, height: 920 });
    await panel.goto(`chrome-extension://${extensionId}/src/pages/side-panel.html`);
    const mark = panel.locator('.sp-logo-text');
    await mark.waitFor({ timeout: 15_000 });

    // The idle screen really is showing — otherwise this proves nothing.
    await expect(panel.locator('#sp-unsupported-screen')).toBeVisible();

    for (const theme of ['light', 'dark'] as const) {
      await panel.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await settle(panel);

      await expect(mark, `wordmark hidden in ${theme}`).toBeVisible();
      await expect(mark).toHaveText('ClipMark');

      // Visible to Playwright is not enough — assert nothing is painted on top.
      const onTop = await mark.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
      });
      expect(onTop, `something is painted over the wordmark in ${theme}`).toBe(true);

      // And it is still the brand ink, not washed out by an overlay.
      const color = await mark.evaluate((el) => getComputedStyle(el).color);
      expect(color).toBe(theme === 'dark' ? 'rgb(45, 212, 191)' : 'rgb(15, 118, 110)');
    }

    await panel.close();
  });

  test('the extension dashboard shows loop ranges too', async () => {
    // Third surface with the same bug: the extension dashboard had no loop
    // awareness at all, so a saved loop rendered as its A point while the web
    // dashboard showed the range.
    const dash = await context.newPage();
    await dash.setViewportSize({ width: 1280, height: 900 });
    await dash.goto(`chrome-extension://${extensionId}/src/pages/dashboard.html`);
    await dash.locator('.vc-vt-time').first().waitFor({ timeout: 15_000 });

    const loopChip = dash.locator('.vc-vt-time--loop');
    await expect(loopChip).toHaveCount(1);
    await expect(loopChip.first()).toContainText('2:20 → 2:48');

    const plain = dash.locator('.vc-vt-time:not(.vc-vt-time--loop)');
    await expect(plain).toHaveCount(2);
    await expect(plain.first()).not.toContainText('→');

    await dash.close();
  });

  test('the bookmark action row does not collide with the PRO badge or its tooltip', async () => {
    // The row packs a Pro-gated notes button, three icon buttons, and (on hover)
    // a tooltip. At gap:2px with a PRO badge ~36px wide sitting on a 28px button,
    // the badge painted 4px over the copy-link button and the native `title`
    // tooltip landed wherever the cursor was — the row read as broken.
    const dash = await context.newPage();
    await dash.setViewportSize({ width: 1360, height: 940 });
    await dash.goto(`chrome-extension://${extensionId}/src/pages/dashboard.html`);
    await dash.locator('.vc-chapter').first().waitFor({ timeout: 20_000 });

    // Sign the profile in as a FREE user so the PRO badges actually render.
    await dash.evaluate(() => document.body.classList.add('cm-free-tier'));

    const measure = (theme: string, view: string) =>
      dash.evaluate(({ theme, view }) => {
        document.documentElement.setAttribute('data-theme', theme);
        const rows = [...document.querySelectorAll('.vc-actions, .tl-actions')];
        const problems: string[] = [];
        let rowsSeen = 0;
        let badgesSeen = 0;

        for (const row of rows) {
          // The row only paints on hover; force it so geometry is measurable.
          (row as HTMLElement).style.opacity = '1';
          const btns = [...row.querySelectorAll('.vc-action-btn')];
          if (!btns.length) continue;
          rowsSeen += 1;

          const boxes = btns.map((b) => ({ el: b, r: b.getBoundingClientRect() }));

          // Hit targets.
          for (const { el, r } of boxes) {
            if (r.width < 30 || r.height < 30) {
              problems.push(`${view}/${theme}: ${(el.className as string).split(' ')[1]} is ${r.width}x${r.height}, below the 30px minimum`);
            }
          }

          // Buttons must not overlap each other.
          for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i].r, b = boxes[j].r;
              const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              if (ox > 0 && oy > 0) problems.push(`${view}/${theme}: buttons ${i} and ${j} overlap by ${ox.toFixed(1)}px`);
            }
          }

          // The PRO badge is an ::after on the gated button; derive its box and
          // make sure it lands on no sibling.
          const gated = row.querySelector('.cm-pro-gated');
          if (gated) {
            badgesSeen += 1;
            const gr = gated.getBoundingClientRect();
            const a = getComputedStyle(gated, '::after');
            const bw = parseFloat(a.width) || 0;
            const right = parseFloat(a.right) || 0;
            const bLeft = gr.right - right - bw;
            const bRight = bLeft + bw;
            for (const { el, r } of boxes) {
              if (el === gated) continue;
              const ox = Math.min(bRight, r.right) - Math.max(bLeft, r.left);
              if (ox > 0) problems.push(`${view}/${theme}: PRO badge covers ${(el.className as string).split(' ')[1]} by ${ox.toFixed(1)}px`);
            }
          }

          // Neither the tooltip nor the PRO badge may cover the row's own
          // buttons OR the note text and tag pills above it. The first pass
          // only checked buttons, and the tooltip promptly landed on the tags.
          // Scope to the whole card, not just this bookmark's own block: a
          // tooltip that renders below the row is adjacent to the NEXT
          // bookmark's timestamp chip, and covering that is just as wrong.
          const neighbours = [...(row.closest('.vc-card, .tl-card, .vc-body')?.querySelectorAll(
            '.vc-tags, .vc-vt-note, .vc-vt-time, .vc-vt-type, .tl-desc, .tl-ts, .tag-badge') ?? [])]
            .map((n) => ({ n, r: n.getBoundingClientRect() }))
            .filter(({ r }) => r.width > 0 && r.height > 0);

          const hits = (a: DOMRect | { top: number; bottom: number; left: number; right: number }) =>
            neighbours.filter(({ r }) =>
              Math.min(a.right, r.right) - Math.max(a.left, r.left) > 1 &&
              Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top) > 1);

          for (const { el, r } of boxes) {
            const tip = getComputedStyle(el, '::before');
            if (!tip.content || tip.content === 'none') continue;
            const tw = parseFloat(tip.width) || 0;
            const th = parseFloat(tip.height) || 0;
            if (!tw || !th) continue;
            // Derive the pseudo-element's painted box. getComputedStyle returns
            // USED values for a positioned element, so `top`/`left` are already
            // px relative to the button's padding box — and `bottom` is resolved
            // too, which is why keying off "is bottom auto?" got this wrong the
            // first time. Prefer `top`/`left`, and apply the transform's own
            // translation rather than assuming translateX(-50%).
            const tx = (() => {
              const m = /matrix\(([^)]+)\)/.exec(tip.transform || '');
              return m ? parseFloat(m[1].split(',')[4]) || 0 : 0;
            })();
            const top = tip.top !== 'auto'
              ? r.top + parseFloat(tip.top)
              : r.bottom - parseFloat(tip.bottom) - th;
            const left = tip.left !== 'auto'
              ? r.left + parseFloat(tip.left) + tx
              : r.right - parseFloat(tip.right) - tw + tx;
            const box = { top, bottom: top + th, left, right: left + tw };
            const name = (el.className as string).split(' ')[1];
            for (const { el: b, r: br } of boxes) {
              if (Math.min(box.right, br.right) - Math.max(box.left, br.left) > 1 &&
                  Math.min(box.bottom, br.bottom) - Math.max(box.top, br.top) > 1) {
                problems.push(`${view}/${theme}: tooltip on ${name} covers ${(b.className as string).split(' ')[1]}`);
              }
            }
            for (const h of hits(box)) {
              problems.push(`${view}/${theme}: tooltip on ${name} covers "${(h.n.textContent ?? '').trim().slice(0, 24)}"`);
            }
          }

          if (gated) {
            const gr2 = gated.getBoundingClientRect();
            const a2 = getComputedStyle(gated, '::after');
            const bw2 = parseFloat(a2.width) || 0;
            const bh2 = parseFloat(a2.height) || 0;
            const right2 = parseFloat(a2.right) || 0;
            const top2 = parseFloat(a2.top) || 0;
            const bbox = { left: gr2.right - right2 - bw2, right: gr2.right - right2,
                           top: gr2.top + top2, bottom: gr2.top + top2 + bh2 };
            for (const h of hits(bbox)) {
              problems.push(`${view}/${theme}: PRO badge covers "${(h.n.textContent ?? '').trim().slice(0, 24)}"`);
            }
          }
        }
        return { problems, rowsSeen, badgesSeen };
      }, { theme, view });

    const all: string[] = [];
    let totalRows = 0;
    let totalBadges = 0;
    for (const theme of ['light', 'dark']) {
      const res = await measure(theme, 'grid');
      all.push(...res.problems);
      totalRows += res.rowsSeen;
      totalBadges += res.badgesSeen;
    }

    // Timeline view exercises .tl-actions, a separate row.
    await dash.locator('#view-timeline').click();
    await dash.waitForTimeout(700);
    for (const theme of ['light', 'dark']) {
      const res = await measure(theme, 'timeline');
      all.push(...res.problems);
      totalRows += res.rowsSeen;
    }

    if (all.length) console.log(`\n[action-row] findings:\n    ${all.join('\n    ')}\n`);
    expect(totalRows, 'no action rows were measured').toBeGreaterThan(0);
    expect(totalBadges, 'no PRO badge was rendered — the collision case was not exercised').toBeGreaterThan(0);
    expect(all, 'bookmark action row layout collisions').toEqual([]);

    await dash.close();
  });

  test('the loop range on the scrubber is teal and actually visible', async () => {
    // Looping is not an AI feature, so it may not use the AI violet; and the
    // saved band was 0.18 alpha on a ~6px bar, competing with YouTube's red
    // progress line. Assert both the hue family and a usable opacity.
    const css = readFileSync(`${DIST}/assets/${
      readdirSync(`${DIST}/assets`).find((f) => f.startsWith('content.js-') && f.endsWith('.js'))
    }`, 'utf8');

    const saved = css.match(/\.yt-loop-range--saved\s*\{\s*background:\s*rgba\(([^)]+)\)/);
    expect(saved, '.yt-loop-range--saved not found in the packaged content script').not.toBeNull();
    const [r, g, b, a] = saved![1].split(',').map((n) => parseFloat(n));

    // Teal, not violet: green is the dominant channel and red is the weakest.
    expect(g, 'the saved loop range should be teal, not violet').toBeGreaterThan(r);
    expect(b, 'the saved loop range should be teal, not violet').toBeGreaterThan(r);
    expect(a, 'the saved loop range is too faint to see on the progress bar')
      .toBeGreaterThanOrEqual(0.35);

    // And it must not be confined to the bar's own height, where the red
    // progress line wins.
    expect(css, 'the range should extend past the progress bar so the red line stays legible')
      .toMatch(/\.yt-loop-range\s*\{[^}]*height:\s*calc\(100% \+/);

    // No violet anywhere in the shipped content script.
    expect(css, 'AI violet leaked into the on-YouTube surfaces').not.toMatch(/139,\s*92,\s*246|#8b5cf6/i);
  });

  test('dark mode holds the same rules — side panel', async () => {
    // The dark audit used to cover only the dashboard, which is how a hardcoded
    // white clip-card body survived: its title uses the theme-aware --text, so
    // in dark mode it rendered gray-50 on white.
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 420, height: 920 });
    await panel.goto(`chrome-extension://${extensionId}/src/pages/side-panel.html`);
    await panel.locator('.sp-clip-moment-time--loop').first().waitFor({ timeout: 15_000 });
    await panel.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await settle(panel);
    await auditPage(panel, 'side-panel (dark)');
    await panel.close();
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


/* ─────────────────────────────────────────────────────────────────────────────
   THEME RESOLUTION — the behaviour added in v1.0.4's dark-mode work.

   The block above proves the dark RULES hold; it gets there by setting
   `data-theme` by hand. Nothing proved the extension ever sets that attribute
   itself, which was the actual bug: a near-complete dark palette and 88 dark CSS
   rules that were unreachable because all three theme switches were commented
   out and `theme-loader.js` read chrome.storage asynchronously.

   This context runs with the OS set to dark (`colorScheme: 'dark'`), so the
   assertions below are about resolution, live updates, the stored override and
   the pre-paint contract — none of which the hand-set audits can see.
   ───────────────────────────────────────────────────────────────────────────── */
test.describe('theme resolution on the rendered surfaces', () => {
  test.skip(!existsSync(DIST), 'extension/dist missing — run `make ext-build` first');

  let context: BrowserContext;
  let extensionId: string;

  const PANEL = () => `chrome-extension://${extensionId}/src/pages/side-panel.html`;
  const DASH = () => `chrome-extension://${extensionId}/src/pages/dashboard.html`;

  /** Records what `data-theme` was at the first animation frame — which fires
   *  BEFORE the first paint — and counts any correction made after it. A
   *  resolver that reads storage asynchronously scores 'UNSET' here; that is the
   *  flash. */
  const firstPaintProbe = () => {
    const w = window as any;
    w.__firstPaintTheme = 'UNSET';
    w.__correctionsAfterPaint = 0;
    let painted = false;
    requestAnimationFrame(() => {
      painted = true;
      w.__firstPaintTheme = document.documentElement.getAttribute('data-theme') ?? 'MISSING';
    });
    const observe = () => {
      if (!document.documentElement) return;
      new MutationObserver(() => { if (painted) w.__correctionsAfterPaint++; })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    };
    observe();
  };

  async function themeOf(page: Page) {
    return page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  }

  /** Clear any stored override so each test starts from the 'system' default. */
  async function resetPreference(worker: Worker) {
    await worker.evaluate(() => new Promise<void>((resolve) => {
      // @ts-expect-error — chrome is the extension's own global here
      chrome.storage.sync.remove('theme', () => chrome.storage.local.remove('theme', () => resolve()));
    }));
  }

  test.beforeAll(async () => {
    context = await launchExtensionContext(DIST, { colorScheme: 'dark' });
    const worker = await extensionServiceWorker(context);
    extensionId = new URL(worker.url()).host;
    await worker.evaluate(
      ([key, bookmarks]) => new Promise<void>((resolve) =>
        // @ts-expect-error — chrome is the extension's own global here
        chrome.storage.sync.set({
          [key as string]: bookmarks,
          tourState: { youtubeTour: true, sidePanelTour: true, recallCoachMark: true },
        }, () => resolve())
      ),
      [`bm_${VIDEO_ID}`, seedBookmarks()] as const
    );
  });

  test.afterAll(async () => { await context?.close(); });

  test('a dark OS resolves both surfaces to dark with nothing stored', async () => {
    const worker = await extensionServiceWorker(context);
    await resetPreference(worker);

    for (const [name, url] of [['side panel', PANEL()], ['dashboard', DASH()]] as const) {
      const page = await context.newPage();
      await page.goto(url);
      await page.waitForLoadState('domcontentloaded');
      expect(await themeOf(page), `${name}: a dark OS must resolve to dark with no stored preference`)
        .toBe('dark');
      // And the canvas actually paints dark — the attribute is only useful if
      // the token block responds to it in the PACKAGED stylesheet.
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const [r, g, b] = bg.match(/\d+/g)!.map(Number);
      expect((r + g + b) / 3, `${name}: body still painted light (${bg})`).toBeLessThan(60);
      await page.close();
    }
  });

  test('the theme is correct at first paint, and never corrected after it', async () => {
    const worker = await extensionServiceWorker(context);
    await resetPreference(worker);

    for (const [name, url] of [['side panel', PANEL()], ['dashboard', DASH()]] as const) {
      const page = await context.newPage();
      await page.addInitScript(firstPaintProbe);
      await page.goto(url);
      await page.waitForLoadState('load');
      const probe = await page.evaluate(() => ({
        atFirstPaint: (window as any).__firstPaintTheme,
        corrections: (window as any).__correctionsAfterPaint,
      }));
      expect(probe.atFirstPaint,
        `${name}: data-theme was not set before the first paint — that is a flash`).toBe('dark');
      expect(probe.corrections,
        `${name}: data-theme was rewritten after the first paint — the correction is visible`).toBe(0);
      await page.close();
    }
  });

  test('an OS theme change flips both surfaces live, with no reload', async () => {
    const worker = await extensionServiceWorker(context);
    await resetPreference(worker);

    for (const [name, url] of [['side panel', PANEL()], ['dashboard', DASH()]] as const) {
      const page = await context.newPage();
      await page.goto(url);
      expect(await themeOf(page), `${name}: should start dark`).toBe('dark');
      await page.emulateMedia({ colorScheme: 'light' });
      await expect.poll(() => themeOf(page),
        { message: `${name}: did not follow the OS to light without a reload` }).toBe('light');
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect.poll(() => themeOf(page),
        { message: `${name}: did not follow the OS back to dark` }).toBe('dark');
      await page.close();
    }
  });

  test('an explicit override beats the OS, and survives an OS change', async () => {
    const worker = await extensionServiceWorker(context);
    await resetPreference(worker);
    await worker.evaluate(() => new Promise<void>((resolve) => {
      // @ts-expect-error — chrome is the extension's own global here
      chrome.storage.sync.set({ theme: 'light' }, () => resolve());
    }));

    const page = await context.newPage();
    await page.goto(PANEL());
    // The override lives in chrome.storage.sync, which cannot be read pre-paint,
    // so the first frame is the system theme and the resolver corrects it. That
    // is the one documented exception to the no-flash rule; the localStorage
    // mirror closes it from the SECOND open onward, which is asserted below.
    await expect.poll(() => themeOf(page),
      { message: 'the stored light override did not beat the dark OS' }).toBe('light');
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await themeOf(page), 'an explicit override must ignore the OS').toBe('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await themeOf(page), 'an explicit override must ignore the OS').toBe('light');
    await page.close();

    // Second open: the mirror is warm, so the override is now correct at the
    // first paint too.
    const again = await context.newPage();
    await again.addInitScript(firstPaintProbe);
    await again.goto(PANEL());
    await again.waitForLoadState('load');
    expect(await again.evaluate(() => (window as any).__firstPaintTheme),
      'the localStorage mirror should pre-paint the override on a later open').toBe('light');
    await again.close();

    // …and clearing the override must actually return to following the OS.
    // The mirror is a CACHE of chrome.storage.sync, not a second source of
    // truth: the first cut of the resolver kept honouring a stale mirror after
    // the stored pick was removed, which pinned the surface to an override the
    // user no longer had.
    await resetPreference(worker);
    const cleared = await context.newPage();
    await cleared.goto(PANEL());
    await expect.poll(() => themeOf(cleared),
      { message: 'a cleared override must fall back to the OS, not to the stale mirror' })
      .toBe('dark');
    await cleared.close();
  });

  test('"either-is-dark": the panel matches a dark YouTube, the dashboard does not', async () => {
    const worker = await extensionServiceWorker(context);
    await resetPreference(worker);

    // A LIGHT OS is the whole point of this rule: the user darkened only
    // YouTube, and a light panel docked beside that dark page is the eye-strain
    // case the feature exists to fix.
    const panel = await context.newPage();
    await panel.emulateMedia({ colorScheme: 'light' });
    await panel.goto(PANEL());
    await expect.poll(() => themeOf(panel),
      { message: 'a light OS with no stored preference should be light' }).toBe('light');

    expect(await panel.evaluate(() => (globalThis as any).ClipMarkTheme.followsYouTube()),
      'the side panel must opt into the YouTube signal').toBe(true);

    await panel.evaluate(() => (globalThis as any).ClipMarkTheme.setYouTubeDark(true));
    expect(await themeOf(panel),
      'a dark YouTube on a light OS must still darken the panel').toBe('dark');

    // …and releasing it falls back to the system theme, not to a sticky dark.
    await panel.evaluate(() => (globalThis as any).ClipMarkTheme.setYouTubeDark(false));
    expect(await themeOf(panel),
      'the panel should fall back to the OS theme once YouTube is light again').toBe('light');
    await panel.close();

    // The dashboard has no page to match, so the signal must not reach it.
    const dash = await context.newPage();
    await dash.emulateMedia({ colorScheme: 'light' });
    await dash.goto(DASH());
    expect(await dash.evaluate(() => (globalThis as any).ClipMarkTheme.followsYouTube()),
      'the dashboard must NOT follow YouTube').toBe(false);
    await dash.evaluate(() => (globalThis as any).ClipMarkTheme.setYouTubeDark(true));
    expect(await themeOf(dash),
      'YouTube\'s theme must not reach the dashboard').toBe('light');
    await dash.close();
  });

  test('the toggle button cycles System → Light → Dark and persists the pick', async () => {
    const worker = await extensionServiceWorker(context);
    await resetPreference(worker);

    const dash = await context.newPage();
    await dash.goto(DASH());
    await dash.locator('#theme-toggle').waitFor();

    const pref = () => dash.evaluate(() => (globalThis as any).ClipMarkTheme.getPreference());
    const icon = () => dash.locator('#theme-toggle .theme-icon').innerText();

    expect(await pref(), 'the default must be "system"').toBe('system');
    expect((await icon()).trim(), 'the default icon should read as automatic').toBe('brightness_auto');

    // system → light (on a dark OS, so this is a visible override)
    await dash.locator('#theme-toggle').click();
    await expect.poll(pref).toBe('light');
    expect(await themeOf(dash), 'picking Light on a dark OS must paint light').toBe('light');
    expect((await icon()).trim()).toBe('light_mode');

    // light → dark
    await dash.locator('#theme-toggle').click();
    await expect.poll(pref).toBe('dark');
    expect(await themeOf(dash)).toBe('dark');
    expect((await icon()).trim()).toBe('dark_mode');

    // dark → back to system
    await dash.locator('#theme-toggle').click();
    await expect.poll(pref).toBe('system');
    expect((await icon()).trim()).toBe('brightness_auto');

    // A pick must reach chrome.storage.sync, and a surface open at the time must
    // follow it without a reload — that is the storage.onChanged path.
    const panel = await context.newPage();
    await panel.goto(PANEL());
    expect(await themeOf(panel)).toBe('dark');
    await dash.locator('#theme-toggle').click();               // → light
    await expect.poll(() => themeOf(panel),
      { message: 'a pick made on the dashboard did not reach the open side panel' }).toBe('light');
    const stored = await worker.evaluate(() => new Promise<any>((resolve) => {
      // @ts-expect-error — chrome is the extension's own global here
      chrome.storage.sync.get(['theme'], (s) => resolve(s.theme));
    }));
    expect(stored, 'the pick was not persisted to chrome.storage.sync').toBe('light');

    await panel.close();
    await dash.close();
    await resetPreference(worker);
  });

  test('an explicit override migrates from storage.local to storage.sync', async () => {
    const worker = await extensionServiceWorker(context);
    await resetPreference(worker);
    // The shape a pre-1.0.4 profile would have: the old switch wrote local.
    await worker.evaluate(() => new Promise<void>((resolve) => {
      // @ts-expect-error — chrome is the extension's own global here
      chrome.storage.local.set({ theme: 'light' }, () => resolve());
    }));

    const page = await context.newPage();
    await page.goto(PANEL());
    await expect.poll(() => themeOf(page),
      { message: 'the legacy storage.local pick was not honoured' }).toBe('light');

    const after = await worker.evaluate(() => new Promise<any>((resolve) => {
      // @ts-expect-error — chrome is the extension's own global here
      chrome.storage.sync.get(['theme'], (s) => chrome.storage.local.get(['theme'], (l) =>
        resolve({ sync: s.theme, local: l.theme })));
    }));
    expect(after.sync, 'the pick should have been migrated into storage.sync').toBe('light');
    expect(after.local, 'the legacy storage.local key should have been cleared').toBeUndefined();

    await page.close();
    await resetPreference(worker);
  });

  test('the resolver-driven dark panel passes the same rendered audit', async () => {
    const worker = await extensionServiceWorker(context);
    await resetPreference(worker);
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 420, height: 920 });
    await panel.goto(PANEL());
    await panel.locator('.sp-clip-moment-time--loop').first().waitFor({ timeout: 15_000 });
    expect(await themeOf(panel)).toBe('dark');
    // Demand all THREE faces, then let layout settle, exactly as auditPage()
    // does for the sibling audits. Measuring before the display face has landed
    // changes which elements have a non-zero box, so the audit judges a
    // different (and partly mid-layout) set of elements — this test skipped both
    // barriers and was correspondingly flaky under load.
    await panel.evaluate(() =>
      Promise.all([
        (document as any).fonts.load("400 20px 'Material Symbols Outlined'"),
        (document as any).fonts.load("700 16px 'Plus Jakarta Sans'"),
        (document as any).fonts.load("400 14px 'Inter'"),
      ]).then(() => (document as any).fonts.ready).then(() => undefined)
    );
    await panel.waitForFunction(() => new Promise<boolean>((resolve) => {
      const read = () => getComputedStyle(document.body).backgroundColor;
      const first = read();
      setTimeout(() => resolve(read() === first), 120);
    }), null, { timeout: 5_000 });
    const res = await panel.evaluate(PAGE_AUDIT);
    const byRule = (r: string) => res.findings.filter((f: any) => f.rule === r);
    for (const r of ['R2', 'R3', 'R6']) {
      if (byRule(r).length) {
        console.log(`\n[side panel (system dark)] ${r}:\n` +
          byRule(r).map((f: any) => `    ${f.el} — ${f.detail}`).join('\n'));
      }
    }
    expect(byRule('R6'), 'icon ligatures failed to resolve in system dark').toEqual([]);
    expect(byRule('R3'), 'text below the 11px floor in system dark').toEqual([]);
    expect(byRule('R2'), 'computed contrast below AA in system dark').toEqual([]);
    await panel.close();
  });
});
