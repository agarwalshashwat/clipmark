import { test, expect } from '@playwright/test';

test.describe('Webapp smoke', () => {
  test('serves robots.txt', async ({ page }) => {
    const response = await page.goto('/robots.txt');
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator('body')).toContainText('User-Agent');
  });

  // Browsers request /favicon.ico whether or not a page links one, and it 404'd
  // until the icon set was added. Only an HTTP-level check can see this: the unit
  // tests can assert the file exists on disk, not that the route serves it.
  test('serves the favicon set and the web manifest', async ({ request }) => {
    for (const path of [
      '/favicon.ico',
      '/apple-touch-icon.png',
      '/icon-192.png',
      '/icon-512.png',
      '/manifest.webmanifest',
    ]) {
      const response = await request.get(path);
      expect(response.status(), `${path} should be served`).toBe(200);
    }

    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest.icons?.length ?? 0).toBeGreaterThan(0);
  });

  // The footer shipped a literal `background: #ffffff` and a --gray-100 border,
  // so in dark mode it rendered as a white slab with its text tokens flipped for
  // a dark background — links at 1.47:1. Nothing caught it: the design audit's R9
  // checks that TOKENS have dark values, not that a rule used one, and #ffffff is
  // explicitly allowed by the ramp rule. Only the rendered result shows it.
  test('the footer follows the theme and stays readable in dark mode', async ({ page }) => {
    const luminance = (css: string) => {
      const [r, g, b] = css.match(/\d+/g)!.slice(0, 3).map(Number);
      const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };

    // The inline theme script reads localStorage before first paint.
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await page.goto('/');

    const colours = await page.evaluate(() => {
      const read = (sel: string, prop: 'color' | 'backgroundColor') =>
        getComputedStyle(document.querySelector(sel)!)[prop];
      return {
        background: read('footer.footer', 'backgroundColor'),
        logo: read('.footer-logo', 'color'),
        link: read('.footer-link', 'color'),
        title: read('.footer-links-title', 'color'),
      };
    });

    // A dark surface, not a white slab.
    expect(luminance(colours.background)).toBeLessThan(0.2);

    // AA: 4.5:1 for body-size text, 3:1 for the 20px/800 wordmark.
    expect(contrast(colours.link, colours.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colours.title, colours.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colours.logo, colours.background)).toBeGreaterThanOrEqual(3);
  });

  // The footer was one symptom of a general problem: marketing surfaces were
  // built from raw ramp values (--gray-*, #ffffff, --accent-strong), which are
  // fixed across themes, so they stayed light under a dark page. This sweeps the
  // rendered result rather than the source — the source-level gates can't tell a
  // deliberate dark panel from a light-pinned one.
  test('no marketing surface stays light in dark mode', async ({ page }) => {
    const luminance = (css: string) => {
      const [r, g, b] = css.match(/\d+/g)!.slice(0, 3).map(Number);
      const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };

    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));

    for (const route of ['/', '/upgrade', '/privacy', '/terms', '/faq']) {
      await page.goto(route);

      const slabs = await page.evaluate(() => {
        const out: { sel: string; bg: string }[] = [];
        for (const el of Array.from(document.querySelectorAll('body *'))) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          // Only surfaces big enough to read as a panel.
          if (r.width < 120 || r.height < 60) continue;
          const m = cs.backgroundColor.match(/[\d.]+/g);
          if (!m) continue;
          const [red, green, blue, alpha] = m.map(Number);
          if (alpha !== undefined && alpha <= 0.5) continue;
          const lin = (c: number) => {
            const v = c / 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          };
          const lum = 0.2126 * lin(red) + 0.7152 * lin(green) + 0.0722 * lin(blue);
          if (lum > 0.5) {
            out.push({ sel: `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`, bg: cs.backgroundColor });
          }
        }
        return out;
      });

      expect(slabs, `${route} has light panel(s) in dark mode: ${JSON.stringify(slabs)}`).toEqual([]);
    }

    // Sanity: the same sweep in LIGHT mode must find plenty of light panels, or
    // the check above is passing because the selector matched nothing.
    await page.evaluate(() => localStorage.removeItem('theme'));
    await page.goto('/privacy');
    const lightPanels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.cm-card')).filter((el) => {
        const m = getComputedStyle(el).backgroundColor.match(/\d+/g)!;
        return Number(m[0]) > 200;
      }).length,
    );
    expect(lightPanels).toBeGreaterThan(0);
  });

  test('an unmatched URL returns a real 404 on our own page', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist');

    // A soft 404 — our page with a 200 — is worse than the default, because
    // Google indexes it and reports it as a site-wide quality problem.
    expect(response?.status()).toBe(404);

    await expect(page.locator('h1')).toContainText("This page isn't here");
    await expect(page.locator('a[href="/"]').first()).toBeVisible();
  });
});
