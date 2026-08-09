import { test as base, chromium, BrowserContext, LaunchOptions } from '@playwright/test';
import path from 'path';

const EXTENSION_PATH = path.resolve(__dirname, '../extension');

// ── Test video ────────────────────────────────────────────────────────────────
// Single source of truth. Every spec that loads a real watch page must build its
// URL from these — no hardcoded ids anywhere in tests/.
//
// 3Blue1Brown's "But what is a neural network?" (Oct 2017): a long-standing,
// chaptered, non-live lecture from one of the most-cited educational channels
// on the platform — about as removal-proof as YouTube gets — and exactly the
// kind of video Clipmark exists for, so the fixture data reads like real usage.
//
// DURATION MATTERS when changing this. Specs seed bookmarks at 0–120s and
// assert a marker click seeks to within 5s (marker-interactions.spec.ts). The
// progress bar is ~1200px, so seconds-per-pixel is duration/1200 and a 1–2px
// click error must stay inside that 5s budget. At 18m40s that is ~0.9s/px —
// comfortable. A multi-hour video is ~13s/px and fails the assertion outright.
// Keep any replacement well under ~50 minutes.
export const TEST_VIDEO_ID = 'aircAruvnKk';
export const TEST_VIDEO_TITLE = 'But what is a neural network? | Deep learning chapter 1';
export const TEST_VIDEO_URL = `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`;

// A second video for SPA navigation tests ("Me at the zoo" — the oldest video on
// the platform, and correspondingly unlikely to disappear).
export const TEST_VIDEO_ID_2 = 'jNQXAC9IVRw';
export const TEST_VIDEO_URL_2 = `https://www.youtube.com/watch?v=${TEST_VIDEO_ID_2}`;

// `RD<id>` is YouTube's auto-generated radio mix for a video — the list-style
// URLs reproduce what the address bar actually looks like when a user arrives
// from a mix, which is the shape that broke SPA title tracking.
const MIX = `RD${TEST_VIDEO_ID}`;
export const TEST_VIDEO_URL_LIST_STYLE = `${TEST_VIDEO_URL}&list=${MIX}&index=1&pp=8AUB`;
export const TEST_VIDEO_URL_2_LIST_STYLE = `${TEST_VIDEO_URL_2}&list=${MIX}&index=2&pp=8AUB`;
export const TEST_MOBILE_VIDEO_URL_LIST_STYLE = `https://m.youtube.com/watch?v=${TEST_VIDEO_ID}&list=${MIX}&index=1&pp=8AUB`;
export const TEST_MOBILE_VIDEO_URL_2_LIST_STYLE = `https://m.youtube.com/watch?v=${TEST_VIDEO_ID_2}&list=${MIX}&index=2&pp=8AUB`;

// ── Browser launch ────────────────────────────────────────────────────────────
/**
 * Silences the entire browser process at the audio-output layer.
 *
 * The E2E suite loads real YouTube watch pages in a headed browser, so without
 * this a test run plays whatever the test video is out of the speakers — often
 * while the developer is doing something else. Process-wide rather than
 * per-element on purpose: it covers every tab, iframe and ad the page opens,
 * and it cannot be undone by page-level script.
 *
 * Every `chromium.launchPersistentContext` in tests/ must go through
 * `extensionLaunchArgs()` / `launchExtensionContext()` below so this is
 * impossible to forget; tests/unit/test-audio-muted.test.mjs enforces that.
 */
export const MUTE_AUDIO_ARG = '--mute-audio';

/**
 * The full Chromium argv for an extension-loading test browser.
 * `extensionPath` is whichever tree the spec wants loaded — `extension/` for
 * source-based specs, `extension/dist/` for the packaged ones.
 */
export function extensionLaunchArgs(extensionPath: string, extra: string[] = []): string[] {
  return [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--no-sandbox',
    MUTE_AUDIO_ARG,
    ...extra,
  ];
}

/**
 * Launch a persistent context with an extension loaded and audio muted.
 * Prefer this over calling `chromium.launchPersistentContext` directly.
 */
export function launchExtensionContext(
  extensionPath: string,
  options: LaunchOptions & { args?: string[] } = {},
): Promise<BrowserContext> {
  const { args = [], ...rest } = options;
  return chromium.launchPersistentContext('', {
    headless: false, // Chrome extensions require non-headless
    ...rest,
    args: extensionLaunchArgs(extensionPath, args),
  });
}

export const test = base.extend<{ context: BrowserContext }>({
  context: async ({ }, use) => {
    const context = await launchExtensionContext(EXTENSION_PATH);
    await use(context);
    await context.close();
  },
});

export { expect } from '@playwright/test';
