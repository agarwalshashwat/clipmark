/**
 * Guard: no E2E spec may ever make sound.
 *
 * The Playwright suite loads real YouTube watch pages in a HEADED browser, so a
 * spec that launches Chromium without `--mute-audio` plays audio out of the
 * developer's speakers during an otherwise-background test run. That is easy to
 * reintroduce by accident — a new spec copies an old `args: [...]` array, or a
 * feature branch adds specs that never saw this change.
 *
 * This is a static check rather than a runtime one because the failure mode is
 * "a browser we never asserted on made noise": by the time a runtime assertion
 * could see it, the sound has already played.
 *
 * Two rules:
 *   1. tests/fixtures.ts must supply --mute-audio, and playwright.config.ts must
 *      set it for Playwright-managed browsers.
 *   2. No spec may call chromium.launchPersistentContext / chromium.launch
 *      directly — they must go through fixtures' launchExtensionContext().
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TESTS_DIR = path.join(ROOT, 'tests');

/** Every *.spec.ts under tests/, recursively. */
function specFiles(dir = TESTS_DIR, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) specFiles(full, acc);
    else if (entry.name.endsWith('.spec.ts')) acc.push(full);
  }
  return acc;
}

const rel = f => path.relative(ROOT, f);

test('tests/fixtures.ts passes --mute-audio to every extension browser', () => {
  const src = readFileSync(path.join(TESTS_DIR, 'fixtures.ts'), 'utf8');
  assert.match(src, /MUTE_AUDIO_ARG\s*=\s*'--mute-audio'/,
    'fixtures.ts must define MUTE_AUDIO_ARG as --mute-audio');
  // The flag has to be inside the shared argv builder, not merely defined.
  const builder = src.slice(src.indexOf('export function extensionLaunchArgs'));
  assert.ok(builder.includes('MUTE_AUDIO_ARG'),
    'extensionLaunchArgs() must include MUTE_AUDIO_ARG in the argv it returns');
});

test('playwright.config.ts mutes Playwright-managed browsers', () => {
  const src = readFileSync(path.join(ROOT, 'playwright.config.ts'), 'utf8');
  assert.match(src, /launchOptions:\s*\{\s*args:\s*\[[^\]]*'--mute-audio'/,
    'playwright.config.ts must set use.launchOptions.args = [..., "--mute-audio"]');
});

test('no spec launches Chromium directly — all go through fixtures', () => {
  const offenders = specFiles()
    .filter(f => /chromium\s*\.\s*launch(PersistentContext)?\s*\(/.test(readFileSync(f, 'utf8')))
    .map(rel);

  assert.deepEqual(offenders, [],
    'These specs call chromium.launch* directly and so bypass --mute-audio. ' +
    "Use launchExtensionContext(extensionPath) from './fixtures' instead:\n  " +
    offenders.join('\n  '));
});

test('no spec hardcodes a YouTube video id — all use tests/fixtures.ts', () => {
  // A watch URL or bare 11-char id written inline means a second source of
  // truth, and the next video swap will miss it.
  const offenders = [];
  for (const f of specFiles()) {
    const src = readFileSync(f, 'utf8');
    for (const [i, line] of src.split('\n').entries()) {
      if (/youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}/.test(line)) {
        offenders.push(`${rel(f)}:${i + 1}: ${line.trim()}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    'These specs hardcode a watch URL instead of importing TEST_VIDEO_URL / ' +
    'TEST_VIDEO_ID from ./fixtures:\n  ' + offenders.join('\n  '));
});

test('the Rickroll is gone from the test suite', () => {
  const offenders = specFiles()
    .filter(f => /dQw4w9WgXcQ/.test(readFileSync(f, 'utf8')))
    .map(rel);
  assert.deepEqual(offenders, [], `Rickroll video id still referenced in:\n  ${offenders.join('\n  ')}`);
});
