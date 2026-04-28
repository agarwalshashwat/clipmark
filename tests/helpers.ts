/**
 * Shared test helpers for ClipMark extension E2E tests.
 *
 * Provides storage seeding / reading / clearing via the extension's
 * background service worker, plus a factory for synthetic bookmarks.
 */
import { BrowserContext, Worker } from '@playwright/test';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Bookmark {
  id: number;
  videoId: string;
  timestamp: number;
  description: string;
  tags: string[];
  color: string;
  createdAt: string;
  videoTitle: string | null;
  reviewSchedule: number[];
  lastReviewed: string | null;
}

// ─── Storage key helpers ───────────────────────────────────────────────────

export function bmKey(videoId: string): string {
  return `bm_${videoId}`;
}

// ─── Bookmark factory ──────────────────────────────────────────────────────

export function makeBookmark(
  videoId: string,
  timestamp: number,
  overrides: Partial<Bookmark> = {},
): Bookmark {
  const m = Math.floor(timestamp / 60);
  const s = String(Math.floor(timestamp % 60)).padStart(2, '0');
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    videoId,
    timestamp,
    description: `Test bookmark at ${m}:${s}`,
    tags: [],
    color: '#4da1ee',
    createdAt: new Date().toISOString(),
    videoTitle: 'Test Video',
    reviewSchedule: [1, 3, 7],
    lastReviewed: null,
    ...overrides,
  };
}

// ─── Service-worker helper ─────────────────────────────────────────────────

/**
 * Returns the extension background service worker, waiting for it if it has
 * not yet registered (MV3 service workers start lazily).
 */
async function getServiceWorker(context: BrowserContext): Promise<Worker> {
  const existing = context.serviceWorkers();
  if (existing.length > 0) return existing[0];
  return context.waitForEvent('serviceworker', { timeout: 20_000 });
}

// ─── Storage helpers ───────────────────────────────────────────────────────

/** Write a set of bookmarks for the given videoId into chrome.storage.sync. */
export async function seedBookmarks(
  context: BrowserContext,
  videoId: string,
  bookmarks: Bookmark[],
): Promise<void> {
  const sw = await getServiceWorker(context);
  await sw.evaluate(
    ({ key, data }: { key: string; data: Bookmark[] }) =>
      new Promise<void>(resolve => chrome.storage.sync.set({ [key]: data }, () => resolve())),
    { key: bmKey(videoId), data: bookmarks },
  );
}

/** Read back the stored bookmarks for the given videoId. */
export async function getStoredBookmarks(
  context: BrowserContext,
  videoId: string,
): Promise<Bookmark[]> {
  const sw = await getServiceWorker(context);
  return sw.evaluate(
    ({ key }: { key: string }) =>
      new Promise<Bookmark[]>(resolve =>
        chrome.storage.sync.get({ [key]: [] as Bookmark[] }, r => resolve((r as Record<string, Bookmark[]>)[key])),
      ),
    { key: bmKey(videoId) },
  );
}

/** Remove all stored bookmarks for the given videoId. */
export async function clearStoredBookmarks(
  context: BrowserContext,
  videoId: string,
): Promise<void> {
  const sw = await getServiceWorker(context);
  await sw.evaluate(
    (key: string) => new Promise<void>(resolve => chrome.storage.sync.remove(key, () => resolve())),
    bmKey(videoId),
  );
}

/** Clear ALL bookmarks and auth data (full reset for a test run). */
export async function clearAllStorage(context: BrowserContext): Promise<void> {
  const sw = await getServiceWorker(context);
  await sw.evaluate(
    () => new Promise<void>(resolve => chrome.storage.sync.clear(() => resolve())),
  );
}

/** Read a raw key from chrome.storage.sync and return the value (or the defaultValue). */
export async function getSyncStorage<T>(
  context: BrowserContext,
  key: string,
  defaultValue: T,
): Promise<T> {
  const sw = await getServiceWorker(context);
  return sw.evaluate(
    ({ k, def }: { k: string; def: T }) =>
      new Promise<T>(resolve =>
        chrome.storage.sync.get({ [k]: def }, r => resolve((r as Record<string, T>)[k])),
      ),
    { k: key, def: defaultValue },
  );
}

/**
 * Send a message to the content script running in the YouTube page and return
 * the response. Uses the service worker to call chrome.tabs.sendMessage so
 * that the call originates from a trusted extension context.
 */
export async function sendToContentScript(
  context: BrowserContext,
  tabUrl: string,
  message: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const sw = await getServiceWorker(context);
  return sw.evaluate(
    ({ url, msg }: { url: string; msg: Record<string, unknown> }) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        chrome.tabs.query({ url }, tabs => {
          if (!tabs[0]?.id) { reject(new Error('No matching YouTube tab found')); return; }
          chrome.tabs.sendMessage(tabs[0].id, msg, (resp: Record<string, unknown>) => {
            if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
            resolve(resp ?? {});
          });
        });
      }),
    { url: tabUrl, msg: message },
  );
}
