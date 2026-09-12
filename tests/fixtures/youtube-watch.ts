/**
 * A deterministic stand-in for a YouTube watch page.
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 * `ci-extension-smoke` used to load live `youtube.com` in every one of its
 * ~12 extension tests. That made the gate a function of YouTube's uptime,
 * A/B-tested markup and the runner's bandwidth: the usual failure was
 * `.yt-bookmark-player-btn` never arriving inside a 40s `waitFor`, and one bad
 * YouTube window reddened the whole job (issue #84). Nothing about the tour or
 * the capture path is actually *about* YouTube's servers — they are about our
 * content script reacting to the player DOM appearing.
 *
 * ── How ──────────────────────────────────────────────────────────────────────
 * Same trick as tests/auth-bridge.spec.ts: the page is served AT THE REAL
 * ORIGIN via route interception, so only the bytes are ours. The URL really is
 * `https://www.youtube.com/watch?v=…`, which means
 *
 *   • Chrome matches `*://*.youtube.com/*` from manifest.json and injects the
 *     content scripts for real — no `executeScript`, no relaxed manifest, and
 *     the packaged `extension/dist/` build is what runs;
 *   • `new URLSearchParams(location.search).get('v')` and `isWatchPage()`
 *     resolve exactly as they do in production;
 *   • not a single byte leaves the machine — the catch-all route below fulfils
 *     every other youtube.com request (transcript fetches included) locally.
 *
 * ── What is deliberately real ────────────────────────────────────────────────
 * The player is built ASYNCHRONOUSLY, after `document_end`, because that is the
 * behaviour our code actually depends on: `initializeVideoObserver` /
 * `initializeProgressBar` are pure `MutationObserver`s with no synchronous
 * first pass, so a page that already contains the player at parse time would
 * never trigger them and the whole mount chain would silently not run. Building
 * it late keeps the test honest — the observers do the same work here as on
 * youtube.com.
 *
 * The `<video>` is a real 60s H.264 file (`clip.mp4`, 17KB, silent, generated
 * with ffmpeg), not a `<video>` with no source: `currentTime` is only settable
 * and `duration` only a number when there is decodable media, and both are what
 * the capture path stores. `.ytp-progress-bar` is laid out at a real width so
 * marker positioning is a genuine geometry calculation.
 *
 * ── What is deliberately NOT modelled ────────────────────────────────────────
 * Recommendations, comments, ads, the masthead. If a spec ever needs one, add
 * it here rather than reaching for the live site.
 */
import { BrowserContext, Page, Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'path';

// ── The fixture clip ─────────────────────────────────────────────────────────
// Regenerate with:
//   ffmpeg -y -f lavfi -i color=c=0x101018:s=320x180:r=10 -t 60 \
//     -c:v libx264 -preset veryslow -crf 51 -pix_fmt yuv420p -g 10 \
//     -movflags +faststart tests/fixtures/clip.mp4
// Silent and video-only on purpose — there is nothing to mute, on top of the
// process-wide `--mute-audio` every launch already carries (see fixtures.ts).
const CLIP_BYTES = readFileSync(path.resolve(__dirname, 'clip.mp4'));

/** Duration of `clip.mp4`, in seconds. Specs seed timestamps inside this. */
export const FIXTURE_DURATION = 60;

/** Where the fixture page asks for its media. Never hits the network. */
const CLIP_URL_PATH = '/clipmark-e2e-fixture/clip.mp4';

/** Rendered width of `.ytp-progress-bar`, in CSS px. */
export const FIXTURE_PROGRESS_BAR_WIDTH = 1200;

export interface WatchPageOptions {
  /** Text put in `.ytp-chapter-title-content`, which the capture path reads. */
  chapter?: string;
  /** Title for a given video id. Falls back to `Fixture video <id>`. */
  titles?: Record<string, string>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function titleFor(videoId: string, options: WatchPageOptions): string {
  return options.titles?.[videoId] || `Fixture video ${videoId}`;
}

/**
 * The watch-page document.
 *
 * Element names mirror the real page closely enough that every selector our
 * content script uses is exercised as written: `ytd-watch-metadata h1
 * yt-formatted-string` for the title, `#movie_player.html5-video-player` for
 * the save flash, `.ytp-progress-bar` for markers, `.ytp-right-controls` for
 * the injected buttons, `.ytp-chapter-title-content` for chapter capture.
 */
function watchPageHtml(videoId: string, options: WatchPageOptions): string {
  const title = titleFor(videoId, options);
  const chapter = options.chapter ?? '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} - YouTube</title>
<meta name="title" content="${escapeHtml(title)}">
<meta property="og:title" content="${escapeHtml(title)}">
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0f0f0f; color: #f1f1f1;
         font-family: Roboto, Arial, sans-serif; }
  #page-manager { padding: 24px; }
  /* The player box. Sized so the injected controls sit well inside the
     1280x800 viewport the repo-wide Playwright config uses — driver.js will
     not position a popover against an off-screen anchor. */
  #movie_player { position: relative; width: ${FIXTURE_PROGRESS_BAR_WIDTH}px;
                  height: 480px; background: #000; }
  #movie_player video { width: 100%; height: 100%; display: block;
                        background: #000; }
  .ytp-chrome-bottom { position: absolute; left: 12px; right: 12px; bottom: 8px; }
  .ytp-progress-bar-container { height: 5px; }
  /* Real width + position:relative — markers are absolutely positioned inside
     it and their left offset is a genuine duration-to-pixel calculation. */
  .ytp-progress-bar { position: relative; height: 5px; width: 100%;
                      background: rgba(255,255,255,.2); }
  .ytp-chrome-controls { display: flex; align-items: center; height: 48px; }
  .ytp-left-controls, .ytp-right-controls { display: flex; align-items: center; }
  .ytp-right-controls { margin-left: auto; }
  .ytp-button { width: 48px; height: 48px; background: none; border: none;
                color: #fff; cursor: pointer; padding: 0; }
  .ytp-chapter-title-content { font-size: 13px; color: #ddd; padding: 0 8px; }
  ytd-watch-metadata { display: block; margin-top: 16px; }
  ytd-watch-metadata h1 { font-size: 20px; margin: 0; }
</style>
</head>
<body>
<div id="page-manager">
  <!-- Filled in asynchronously below, exactly like the real page. -->
  <div id="player-host"></div>
  <ytd-watch-metadata>
    <h1><yt-formatted-string>${escapeHtml(title)}</yt-formatted-string></h1>
  </ytd-watch-metadata>
</div>
<script>
(() => {
  const CLIP = ${JSON.stringify(CLIP_URL_PATH)};

  function playerMarkup(chapter) {
    return [
      '<div id="movie_player" class="html5-video-player playing-mode">',
      '  <video src="' + CLIP + '" preload="auto" muted playsinline></video>',
      '  <div class="ytp-chrome-bottom">',
      '    <div class="ytp-progress-bar-container">',
      '      <div class="ytp-progress-bar" role="slider"></div>',
      '    </div>',
      '    <div class="ytp-chrome-controls">',
      '      <div class="ytp-left-controls">',
      '        <button class="ytp-button ytp-play-button"></button>',
      '        <span class="ytp-chapter-title-content">' + chapter + '</span>',
      '      </div>',
      '      <div class="ytp-right-controls">',
      '        <button class="ytp-button ytp-settings-button"></button>',
      '        <button class="ytp-button ytp-fullscreen-button"></button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('');
  }

  /**
   * Mount the player LATE and in one shot.
   *
   * Both of those matter. Late, because our content script discovers the video
   * and the progress bar only through MutationObservers installed at
   * document_end — a player present at parse time is a player they never see.
   * One shot, because that is the cheapest faithful stand-in for YouTube
   * swapping its player chrome in wholesale.
   */
  function mountPlayer(chapter) {
    const host = document.getElementById('player-host');
    host.innerHTML = playerMarkup(chapter);
    const video = host.querySelector('video');
    // Resolve once the media is decodable, so duration/currentTime are real
    // numbers by the time a spec touches them.
    return new Promise((resolve) => {
      if (video.readyState >= 1) { resolve(video); return; }
      video.addEventListener('loadedmetadata', () => resolve(video), { once: true });
    });
  }

  const state = {
    chapter: ${JSON.stringify(chapter)},
    ready: null,
  };

  /**
   * Test-facing control surface. Specs drive SPA navigation through this rather
   * than hand-dispatching events, so the DOM swap and the yt-navigate-finish
   * that our listeners key off stay in the right order.
   */
  window.__clipmarkFixture = {
    /** Resolves once the player DOM exists and its metadata has loaded. */
    ready: () => state.ready,

    /** Current chapter text, as the capture path would read it. */
    setChapter(text) {
      state.chapter = text;
      const el = document.querySelector('.ytp-chapter-title-content');
      if (el) el.textContent = text;
    },

    /**
     * A YouTube SPA navigation: URL first, then the page content, then the
     * event. Tears the player out and rebuilds it, which is what makes the
     * content script re-run its mount chain for the new video.
     */
    async navigateTo(nextVideoId, nextTitle) {
      history.pushState({}, '', '/watch?v=' + encodeURIComponent(nextVideoId));
      const heading = document.querySelector('ytd-watch-metadata h1 yt-formatted-string');
      if (heading) heading.textContent = nextTitle;
      document.title = nextTitle + ' - YouTube';
      const meta = document.querySelector('meta[name="title"]');
      if (meta) meta.setAttribute('content', nextTitle);

      document.getElementById('player-host').innerHTML = '';
      state.ready = mountPlayer(state.chapter);
      document.dispatchEvent(new CustomEvent('yt-navigate-finish'));
      document.dispatchEvent(new CustomEvent('yt-page-data-updated'));
      await state.ready;
    },
  };

  // ~200ms is the same ballpark as the real player's first paint, and safely
  // after the content script's document_end initialization.
  setTimeout(() => { state.ready = mountPlayer(state.chapter); }, 200);
})();
</script>
</body>
</html>`;
}

/**
 * Serve `clip.mp4` as a properly range-capable resource.
 *
 * This is not ceremony. A plain `200` with the whole body leaves Chromium's
 * media stack with `buffered.end(0) === 60` but `seekable.end(0) === 0` — the
 * bytes are all there, yet the element refuses to seek, so `currentTime = 12.5`
 * silently stays 0 and every timestamp a spec captures is zero. Answering the
 * `Range` request with a `206` and `Accept-Ranges` is what makes the resource
 * seekable, and therefore what makes capture assertions mean anything.
 */
async function fulfillClip(route: Route): Promise<void> {
  const total = CLIP_BYTES.length;
  const range = route.request().headers()['range'];
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;

  if (!match) {
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(total),
        'Accept-Ranges': 'bytes',
      },
      body: CLIP_BYTES,
    });
    return;
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
  const chunk = CLIP_BYTES.subarray(start, end + 1);

  await route.fulfill({
    status: 206,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(chunk.length),
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
    },
    body: chunk,
  });
}

/**
 * Serve the fixture for every youtube.com request in this context.
 *
 * Installed on the CONTEXT, not a page, so pages opened later in a spec (and
 * any popup) are covered without the spec having to remember. Anything on
 * youtube.com that is not the watch document or the clip is fulfilled as an
 * empty 200 rather than aborted — our transcript fetch treats a network error
 * and an empty body the same way, and a fulfilled request cannot be retried by
 * Chrome or show up as a real DNS lookup.
 */
export async function serveYouTubeFixture(
  context: BrowserContext,
  options: WatchPageOptions = {},
): Promise<void> {
  await context.route('**://*.youtube.com/**', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === CLIP_URL_PATH) {
      await fulfillClip(route);
      return;
    }

    if (url.pathname === '/watch') {
      const videoId = url.searchParams.get('v') || '';
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: watchPageHtml(videoId, options),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
}

/** The watch URL for a video id — the real one, since the origin is real. */
export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Open a fixture watch page and wait until the extension has mounted onto it.
 *
 * Waiting on `.yt-bookmark-player-btn` is the same signal the live-YouTube
 * specs used; the difference is that here it is bounded by our own 200ms mount
 * timer instead of youtube.com, so the generous 40s waits those specs needed
 * are no longer warranted.
 */
export async function openWatchPage(
  context: BrowserContext,
  videoId: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(watchUrl(videoId), { waitUntil: 'domcontentloaded' });
  await waitForExtensionMount(page);
  return page;
}

/** Wait for the content script's full mount chain on an already-open page. */
export async function waitForExtensionMount(page: Page, timeout = 15_000): Promise<void> {
  await page.locator('.yt-bookmark-player-btn').waitFor({ state: 'attached', timeout });
  await page.locator('.yt-bookmark-markers').waitFor({ state: 'attached', timeout });
  // Duration known AND the resource actually seekable — the two properties the
  // capture path reads. Asserting seekability here rather than at the point of
  // use means a spec can never quietly record a timestamp of 0.
  await page.waitForFunction(() => {
    const v = document.querySelector('video');
    return !!v && Number.isFinite(v.duration) && v.seekable.length > 0 && v.seekable.end(0) > 0;
  }, undefined, { timeout });
}

/** Park the clip at a known position, the way a watching user would. */
export async function seekTo(page: Page, seconds: number): Promise<void> {
  await page.evaluate(async (t) => {
    const v = document.querySelector('video') as HTMLVideoElement;
    v.currentTime = t;
    await new Promise<void>((resolve) => {
      if (Math.abs(v.currentTime - t) < 0.5) { resolve(); return; }
      v.addEventListener('seeked', () => resolve(), { once: true });
    });
  }, seconds);
}
