/**
 * Install CTAs point at the real Chrome Web Store *listing*, from one source.
 *
 * Every "Add to Chrome" / "Get the extension" button used to hardcode
 * `https://chrome.google.com/webstore` — the store *root*, which is a generic
 * search page, not ClipMark. Every visitor who clicked install, including anyone
 * arriving from organic search, landed somewhere they had to search again.
 * That was fixed by routing all of them through `CHROME_STORE_URL`, but nothing
 * stopped the next hand-written `<a href="https://chrome.google.com/webstore">`
 * from reintroducing it — this file is that guard.
 *
 * Source-text assertions rather than rendered-DOM ones on purpose: the point is
 * that no *author* writes the bare URL again, in a component or a doc-adjacent
 * string, whether or not that component happens to render in a given test.
 *
 * Run: npm --prefix webapp run test:unit
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHROME_STORE_URL } from '../../app/lib/constants';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app');

/** The permanent Chrome Web Store item id for ClipMark. */
const ITEM_ID = 'iboippnihpcnnglgboaiedaiimbiolgg';

/** Walk `app/` collecting every .ts/.tsx source file. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('CHROME_STORE_URL', () => {
  it('is the real listing URL, not the store root', () => {
    assert.match(
      CHROME_STORE_URL,
      /^https:\/\/chromewebstore\.google\.com\/detail\/[^/]+\/[a-p]{32}$/,
      `expected a /detail/<slug>/<item-id> listing URL, got: ${CHROME_STORE_URL}`,
    );
    assert.ok(
      CHROME_STORE_URL.endsWith(ITEM_ID),
      `expected the canonical ClipMark item id ${ITEM_ID}`,
    );
  });

  it('is not a placeholder', () => {
    assert.doesNotMatch(CHROME_STORE_URL, /TODO|PLACEHOLDER|example\.com|REPLACE/i);
  });
});

describe('install CTAs', () => {
  it('never link to the Chrome Web Store root', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(APP_DIR)) {
      // The constants module documents the store-root URL in a comment
      // explaining what not to do; that mention is the point, so skip it.
      if (file.endsWith(path.join('app', 'lib', 'constants.ts'))) continue;

      const src = readFileSync(file, 'utf8');
      // Matches the legacy root link in any quoting style, but NOT the
      // `chromewebstore.google.com/detail/...` listing host.
      if (/chrome\.google\.com\/webstore(?!\/devconsole)/.test(src)) {
        offenders.push(path.relative(APP_DIR, file));
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `these files link to the Chrome Web Store root instead of importing ` +
        `CHROME_STORE_URL from app/lib/constants:\n  ${offenders.join('\n  ')}`,
    );
  });

  it('routes every store link through the shared constant', () => {
    // Any file that names the item id directly has bypassed the constant.
    const hardcoded: string[] = [];

    for (const file of sourceFiles(APP_DIR)) {
      if (file.endsWith(path.join('app', 'lib', 'constants.ts'))) continue;
      if (readFileSync(file, 'utf8').includes(ITEM_ID)) {
        hardcoded.push(path.relative(APP_DIR, file));
      }
    }

    assert.deepEqual(
      hardcoded,
      [],
      `these files hardcode the Chrome Web Store item id instead of importing ` +
        `CHROME_STORE_URL:\n  ${hardcoded.join('\n  ')}`,
    );
  });
});
