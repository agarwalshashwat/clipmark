/**
 * The install CTA has exactly one source of truth.
 *
 * Every "Get the extension" / "Add to Chrome" button on the site used to carry a
 * hardcoded `https://chrome.google.com/webstore` — the Web Store's generic
 * search page, not the ClipMark listing — in five separate files. PR #88
 * collapsed them onto `CHROME_STORE_URL`, but nothing stopped the sixth CTA from
 * reintroducing a literal, and the failure is invisible in review: the link
 * still opens a plausible-looking Chrome Web Store page, just not ours.
 *
 * So this asserts the shape of the constant and the absence of competing
 * literals, rather than counting call sites (a count goes stale every time a
 * page is added).
 *
 * Run: npm --prefix webapp run test:unit
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { CHROME_STORE_URL } from '../../app/lib/constants';

// `__dirname`, not `import.meta.dirname`: the test:unit script loads these files
// through tsx, which compiles them to CommonJS, leaving every `import.meta`
// field undefined. The guard below turns a future switch to real ESM into a
// readable failure instead of "path must be of type string".
const APP_DIR = join(__dirname, '..', '..', 'app');
const CONSTANTS_FILE = join(APP_DIR, 'lib', 'constants.ts');

if (!existsSync(CONSTANTS_FILE)) {
  throw new Error(`Could not locate webapp/app from ${__dirname} — resolved to ${APP_DIR}`);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

describe('CHROME_STORE_URL', () => {
  it('points at a specific listing, not the Web Store root', () => {
    // A 32-char a–p id is the Chrome extension id alphabet. Asserting the shape
    // catches a truncated or placeholder id; it cannot prove the listing is
    // published, which is a manual check against the live store page.
    assert.match(
      CHROME_STORE_URL,
      /^https:\/\/chromewebstore\.google\.com\/detail\/[a-z0-9-]+\/[a-p]{32}$/,
      `CHROME_STORE_URL must be a canonical listing URL, got: ${CHROME_STORE_URL}`,
    );
  });

  it('is the only place a Chrome Web Store URL is written down', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(APP_DIR)) {
      if (file === CONSTANTS_FILE) continue;
      const src = readFileSync(file, 'utf8');
      // Strip comments: the layout and the constants doc-comment legitimately
      // discuss the old URL, and prose is not a link.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
      if (/chrome\.google\.com\/webstore|chromewebstore\.google\.com/.test(code)) {
        offenders.push(relative(APP_DIR, file));
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `Hardcoded Chrome Web Store URL(s) found — import CHROME_STORE_URL instead:\n  ${offenders.join('\n  ')}`,
    );
  });
});
