/**
 * 404 / error-boundary coverage for the routes that can legitimately miss.
 *
 * These are file-convention features: Next wires them up by PATH, so deleting or
 * renaming one silently reverts the route to the framework default — a 404 with
 * no styling and no way back — and nothing else in CI would notice. Type-checking
 * can't see it, and the visual snapshots don't cover these routes.
 *
 * The invariant asserted here is the one that matters: every segment that calls
 * notFound() resolves to one of OUR not-found boundaries, and every segment whose
 * render can throw on a remote read has an error boundary next to it.
 *
 * Run: npm --prefix webapp run test:unit
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEBAPP_DIR = fileURLToPath(new URL('../..', import.meta.url));
const APP_DIR = join(WEBAPP_DIR, 'app');

function pageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) out.push(...pageFiles(abs));
    else if (entry === 'page.tsx') out.push(abs);
  }
  return out;
}

/** Walk up from a segment to app/, returning the first existing boundary file. */
function nearestBoundary(segmentDir: string, filename: string): string | null {
  let dir = segmentDir;
  for (;;) {
    const candidate = join(dir, filename);
    if (existsSync(candidate)) return relative(WEBAPP_DIR, candidate);
    if (dir === APP_DIR) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const pagesCallingNotFound = pageFiles(APP_DIR).filter((abs) =>
  /\bnotFound\(\)/.test(readFileSync(abs, 'utf8')),
);

describe('404 boundaries', () => {
  it('the root 404 exists and is on-brand', () => {
    const root = join(APP_DIR, 'not-found.tsx');
    assert.ok(existsSync(root), 'app/not-found.tsx is missing — Next falls back to its default 404');

    const src = readFileSync(root, 'utf8');
    assert.match(src, /ClipMark/, 'the 404 should identify the site');
    assert.match(src, /href="\/"/, 'the 404 must offer a route back to the homepage');
    // Colours must be tokens, or the page ignores the theme toggle and trips
    // the R1 ramp check in scripts/design-audit.mjs.
    assert.ok(
      !/#[0-9a-fA-F]{6}\b/.test(src.replace(/#ffffff/gi, '')),
      'use var(--token) colours, not literal hex',
    );
  });

  it('every page that calls notFound() resolves to one of our boundaries', () => {
    assert.ok(pagesCallingNotFound.length >= 3, 'expected the share/profile/embed routes to be found');

    const unguarded = pagesCallingNotFound.filter(
      (abs) => nearestBoundary(dirname(abs), 'not-found.tsx') === null,
    );
    assert.deepEqual(unguarded.map((f) => relative(WEBAPP_DIR, f)), []);
  });

  it('the embed route keeps its own compact 404, not the full marketing page', () => {
    // A full-height 404 with nav links inside a third-party iframe would try to
    // steer the embedder's frame to our marketing pages.
    const embedNotFound = join(APP_DIR, 'embed/[shareId]/not-found.tsx');
    assert.ok(existsSync(embedNotFound), 'app/embed/[shareId]/not-found.tsx is missing');

    const src = readFileSync(embedNotFound, 'utf8');
    assert.ok(!/href=/.test(src), 'the embed 404 must not link out of the iframe');
  });
});

describe('error boundaries', () => {
  it('the share, profile and embed segments each have one', () => {
    for (const segment of [
      '(marketing)/v/[shareId]',
      '(marketing)/u/[username]',
      'embed/[shareId]',
    ]) {
      const file = join(APP_DIR, segment, 'error.tsx');
      assert.ok(existsSync(file), `app/${segment}/error.tsx is missing`);

      const src = readFileSync(file, 'utf8');
      assert.match(src, /^'use client';/m, 'error boundaries must be client components');
      assert.match(src, /export default function/, 'Next requires a default export');
    }
  });

  it('the shared error UI reports to Sentry and offers a retry', () => {
    const src = readFileSync(join(APP_DIR, 'components/RouteError.tsx'), 'utf8');
    assert.match(src, /captureException/, 'a swallowed route error is one we never hear about');
    assert.match(src, /onClick=\{reset\}/, 'reset() is the point of a segment boundary');
  });
});
