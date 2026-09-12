/**
 * Install-CTA single source of truth (app/lib/constants.ts → CHROME_STORE_URL).
 *
 * Every "Add to Chrome" button on the site has to point at the real Chrome Web
 * Store listing. Before PR #88 all five of them linked to the store ROOT
 * (`https://chrome.google.com/webstore`), which drops the visitor on a generic
 * search page — the single worst place to send someone who just clicked Install.
 * That was invisible to every existing gate: it renders fine, type-checks fine,
 * and the visual snapshots only compare pixels, not hrefs.
 *
 * So the assertion that matters is not "the constant has the right value" but
 * "no call site went back to inlining its own URL". The scan below is what keeps
 * the refactor from decaying one new CTA at a time.
 *
 * Run: npm --prefix webapp run test:unit
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// tsx transpiles this to CJS, where import.meta.dirname is undefined — resolve
// from import.meta.url instead so the paths hold whatever the cwd is.
const WEBAPP_DIR = fileURLToPath(new URL('../..', import.meta.url));
const APP_DIR = join(WEBAPP_DIR, 'app');
const CONSTANTS = 'app/lib/constants.ts';

/** The permanent Chrome Web Store item id for the ClipMark listing. */
const ITEM_ID = 'iboippnihpcnnglgboaiedaiimbiolgg';

/**
 * constants.ts reads process.env at MODULE scope, and the usual
 * `import('…?t=' + Math.random())` cache-bust doesn't help: tsx transpiles these
 * tests to CJS, where the query string is not part of the module cache key. Only
 * a fresh process actually re-evaluates the module, so resolve the value in one.
 */
function resolveStoreUrl(override?: string): string {
  const env = { ...process.env };
  if (override === undefined) delete env.NEXT_PUBLIC_CHROME_STORE_URL;
  else env.NEXT_PUBLIC_CHROME_STORE_URL = override;

  return execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '-e',
      // tsx hands back a CJS namespace here, so the named exports arrive under
      // `default` — read both shapes rather than depending on which one it is.
      'import("./app/lib/constants.js").then(m => process.stdout.write((m.CHROME_STORE_URL ?? m.default.CHROME_STORE_URL)))',
    ],
    { cwd: WEBAPP_DIR, env, encoding: 'utf8' },
  ).trim();
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) out.push(...sourceFiles(abs));
    else if (/\.(tsx?|jsx?)$/.test(entry)) out.push(abs);
  }
  return out;
}

describe('install CTA: CHROME_STORE_URL', () => {
  it('defaults to the real listing, not the store root', () => {
    const url = resolveStoreUrl();

    assert.ok(
      url.includes(ITEM_ID),
      `expected the real item id in the default URL, got ${url}`,
    );
    assert.ok(
      url.startsWith('https://chromewebstore.google.com/detail/'),
      `must be a /detail/ listing URL on the current store host, got ${url}`,
    );
  });

  it('honours NEXT_PUBLIC_CHROME_STORE_URL when set', () => {
    const override =
      'https://chromewebstore.google.com/detail/clipmark-staging/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    assert.equal(resolveStoreUrl(override), override);
  });

  // Clearing the value in the Vercel UI leaves the variable defined but empty.
  // Under `??` that would ship href="" on every install button.
  it('falls back when the env var is set but blank', () => {
    for (const blank of ['', '   ']) {
      assert.ok(
        resolveStoreUrl(blank).includes(ITEM_ID),
        `a blank override (${JSON.stringify(blank)}) must fall back to the real listing`,
      );
    }
  });
});

describe('install CTA: no inlined store URLs', () => {
  const files = sourceFiles(APP_DIR);

  it('finds source files to scan (guards against a broken glob)', () => {
    assert.ok(files.length > 20, `expected to scan the app tree, saw ${files.length} files`);
  });

  it('no file outside constants.ts hardcodes a Chrome Web Store URL', () => {
    const offenders: string[] = [];

    for (const abs of files) {
      const rel = relative(WEBAPP_DIR, abs);
      if (rel === CONSTANTS) continue;

      const src = readFileSync(abs, 'utf8');
      src.split('\n').forEach((line, i) => {
        // Comments may legitimately mention the store; only real URLs in code count.
        if (/^\s*(\/\/|\*)/.test(line)) return;
        if (/https?:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/.test(line)) {
          offenders.push(`${rel}:${i + 1}`);
        }
      });
    }

    assert.deepEqual(
      offenders,
      [],
      `these files inline a store URL instead of importing CHROME_STORE_URL:\n  ${offenders.join('\n  ')}`,
    );
  });

  it('the store ROOT never appears anywhere in the app tree', () => {
    const offenders = files.filter((abs) =>
      /chrome\.google\.com\/webstore(?!\/detail)/.test(readFileSync(abs, 'utf8')),
    );

    assert.deepEqual(
      offenders.map((f) => relative(WEBAPP_DIR, f)),
      [],
      'the bare store root sends installers to a generic search page',
    );
  });
});
