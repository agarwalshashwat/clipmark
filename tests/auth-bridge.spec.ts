/**
 * Web → extension AUTH_SUCCESS handoff, against the PACKAGED build.
 *
 * This is the message that hands every signed-in feature — Pro entitlement,
 * cloud sync, reminders — from the web app to the extension, and until this
 * spec it had no coverage anywhere (docs/TEST-STRATEGY.md §1.2/§3.2/§3.4, the
 * top-ranked gap in the whole document). A break in it fails sign-in silently
 * for every extension user.
 *
 * Same shape as recall-bridge.spec.ts: the "web app" is a stand-in page served
 * AT THE REAL ORIGIN via route interception, so the origin Chrome matches
 * against `externally_connectable` is genuine and only the body is faked.
 *
 * Deliberately never loads youtube.com — unlike the rest of the extension
 * suite, this spec is entirely offline-deterministic, which is why it is safe
 * to run in CI ahead of the (network-flaky) YouTube smoke.
 *
 * Requires `make ext-build` (skips with a message otherwise).
 */
import { test, expect, BrowserContext, Worker, Page } from '@playwright/test';
import { launchExtensionContext } from './fixtures';
import { existsSync } from 'node:fs';
import path from 'path';

const DIST = path.resolve(__dirname, '../extension/dist');
const APP_ORIGIN = 'https://clipmark.mithahara.com';
const SUCCESS_URL = `${APP_ORIGIN}/auth/extension-success`;

type AuthMessage = {
  type: 'AUTH_SUCCESS';
  accessToken: string;
  refreshToken?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  isPro?: boolean;
};

/** Exactly what webapp/app/auth/extension-success/params.ts produces. */
const FULL_MESSAGE: AuthMessage = {
  type:         'AUTH_SUCCESS',
  accessToken:  'e2e-access-token',
  refreshToken: 'e2e-refresh-token',
  userId:       'e2e-user-id',
  userEmail:    'e2e@example.com',
  isPro:        true,
};

type StoredUser = {
  userId?: string;
  userEmail?: string;
  accessToken?: string;
  refreshToken?: string;
  isPro?: boolean;
} | null;

async function extensionServiceWorker(context: BrowserContext): Promise<Worker> {
  const found = context.serviceWorkers().find(w => w.url().startsWith('chrome-extension://'));
  if (found) return found;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const w = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    if (w.url().startsWith('chrome-extension://')) return w;
  }
}

async function launchPackaged(): Promise<BrowserContext> {
  const context = await launchExtensionContext(DIST);
  // A successful AUTH_SUCCESS kicks off scheduleReminderAlarms(), which fetches
  // the live reminders API. Stub it so the spec never depends on production
  // being up. (Mocking the worker's own network calls properly is §1.4/phase 2.)
  await context.route(`${APP_ORIGIN}/api/reminders*`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  return context;
}

/** A page whose origin really is the app's, with a stand-in body. */
async function openAppStandIn(context: BrowserContext, url = SUCCESS_URL): Promise<Page> {
  const page = await context.newPage();
  await page.route(`${APP_ORIGIN}/**`, route => {
    if (route.request().url().includes('/api/')) return route.fallback();
    return route.fulfill({
      status: 200, contentType: 'text/html',
      body: '<!doctype html><title>Clipmark</title><h1>stand-in</h1>',
    });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page;
}

function sendAuthSuccess(page: Page, extensionId: string, message: AuthMessage) {
  return page.evaluate(({ id, msg }) => new Promise(resolve => {
    const cr = (window as unknown as {
      chrome: {
        runtime: {
          sendMessage: (i: string, m: unknown, cb: (r: unknown) => void) => void;
          lastError?: { message?: string };
        };
      };
    }).chrome.runtime;
    cr.sendMessage(id, msg, r => resolve(r ?? { ok: false, error: cr.lastError?.message }));
  }), { id: extensionId, msg: message });
}

function readStoredUser(worker: Worker): Promise<StoredUser> {
  return worker.evaluate(() => new Promise<StoredUser>(resolve =>
    chrome.storage.sync.get({ bmUser: null }, (r: { bmUser: StoredUser }) => resolve(r.bmUser))));
}

test.describe('auth bridge: web app → extension AUTH_SUCCESS', () => {
  test.beforeEach(() => {
    test.skip(!existsSync(DIST), 'extension/dist missing — run `make ext-build` first');
  });

  test('stores the signed-in user in chrome.storage.sync', async () => {
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      const extensionId = new URL(worker.url()).host;

      expect(await readStoredUser(worker)).toBeNull(); // nothing carried in

      const app = await openAppStandIn(context);
      // Chrome exposes a limited chrome.runtime only to externally_connectable
      // origins — this is the gate the real handoff depends on.
      expect(await app.evaluate(() =>
        typeof (window as unknown as { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome?.runtime?.sendMessage === 'function',
      )).toBe(true);

      const res = await sendAuthSuccess(app, extensionId, FULL_MESSAGE) as { ok: boolean };
      expect(res.ok).toBe(true);

      // The worker responds from inside the storage.set callback, so the write
      // has landed by the time the page's callback resolves.
      expect(await readStoredUser(worker)).toEqual({
        userId:       'e2e-user-id',
        userEmail:    'e2e@example.com',
        accessToken:  'e2e-access-token',
        refreshToken: 'e2e-refresh-token',
        isPro:        true,
      });
    } finally {
      await context.close();
    }
  });

  test('defaults a missing entitlement to not-Pro and stores nothing extra', async () => {
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      const extensionId = new URL(worker.url()).host;
      const app = await openAppStandIn(context);

      const res = await sendAuthSuccess(app, extensionId, {
        type: 'AUTH_SUCCESS',
        accessToken: 'free-access-token',
        refreshToken: 'free-refresh-token',
        userId: 'free-user',
        userEmail: 'free@example.com',
        // isPro omitted — a free account, or an older webapp build
      }) as { ok: boolean };
      expect(res.ok).toBe(true);

      const stored = await readStoredUser(worker);
      expect(stored?.isPro).toBe(false);
      // `type` (and anything else the page sends) must not leak into storage.
      expect(Object.keys(stored ?? {}).sort()).toEqual(
        ['accessToken', 'isPro', 'refreshToken', 'userEmail', 'userId'],
      );
    } finally {
      await context.close();
    }
  });

  test('a later sign-in replaces the stored user rather than merging into it', async () => {
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      const extensionId = new URL(worker.url()).host;
      const app = await openAppStandIn(context);

      await sendAuthSuccess(app, extensionId, FULL_MESSAGE);
      // Signing in as a different, non-Pro account must not leave the previous
      // account's Pro entitlement or tokens behind.
      await sendAuthSuccess(app, extensionId, {
        type: 'AUTH_SUCCESS',
        accessToken: 'second-access-token',
        refreshToken: 'second-refresh-token',
        userId: 'second-user',
        userEmail: 'second@example.com',
        isPro: false,
      });

      expect(await readStoredUser(worker)).toEqual({
        userId:       'second-user',
        userEmail:    'second@example.com',
        accessToken:  'second-access-token',
        refreshToken: 'second-refresh-token',
        isPro:        false,
      });
    } finally {
      await context.close();
    }
  });

  test('another origin cannot plant credentials in the extension', async () => {
    const context = await launchPackaged();
    try {
      const worker = await extensionServiceWorker(context);
      const page = await context.newPage();
      await page.route('https://evil.example/**', r =>
        r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>x</title>' }));
      await page.goto('https://evil.example/', { waitUntil: 'domcontentloaded' });

      // Not in externally_connectable → Chrome never injects chrome.runtime, so
      // the AUTH_SUCCESS handler is unreachable from here. (The background's own
      // isTrustedExternalSender check behind it is unit-tested separately, in
      // tests/unit/external-messaging.test.mjs.)
      expect(await page.evaluate(() =>
        typeof (window as unknown as { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome?.runtime?.sendMessage === 'function',
      )).toBe(false);

      expect(await readStoredUser(worker)).toBeNull();
    } finally {
      await context.close();
    }
  });
});
