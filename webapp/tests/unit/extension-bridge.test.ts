/**
 * Web → extension bridge (Active Recall hand-off).
 *
 * Covers id resolution, availability detection, and — most importantly — that
 * every failure path degrades to a resolved {ok:false} rather than hanging or
 * throwing, because the dashboard falls back to a plain link on failure.
 *
 * Run: npm --prefix webapp run test:unit
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const VALID_ID = 'abcdefghijklmnopabcdefghijklmnop'; // 32 chars, a–p
const OTHER_ID = 'ponmlkjihgfedcbaponmlkjihgfedcba';

// Minimal localStorage + window stubs so the module can run under node:test.
function installWindow(opts: { runtime?: unknown } = {}) {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
    chrome: opts.runtime ? { runtime: opts.runtime } : undefined,
    open: () => null,
  };
  return store;
}

function clearWindow() {
  delete (globalThis as Record<string, unknown>).window;
  delete process.env.NEXT_PUBLIC_EXTENSION_ID;
}

// Fresh module instance per test (module-level env reads).
async function load() {
  return import(`../../app/dashboard/_utils/extension.js?t=${Math.random()}`);
}

describe('extension bridge: id resolution', () => {
  beforeEach(() => clearWindow());
  afterEach(() => clearWindow());

  it('returns null when nothing is known', async () => {
    installWindow();
    const m = await load();
    assert.equal(m.getExtensionId(), null);
    assert.equal(m.isExtensionBridgeAvailable(), false);
  });

  it('remembers a valid id and reads it back', async () => {
    installWindow();
    const m = await load();
    m.rememberExtensionId(VALID_ID);
    assert.equal(m.getExtensionId(), VALID_ID);
  });

  it('ignores malformed ids (wrong length / illegal chars)', async () => {
    installWindow();
    const m = await load();
    m.rememberExtensionId('tooshort');
    m.rememberExtensionId('ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP'); // uppercase
    m.rememberExtensionId('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'); // z is out of a–p
    assert.equal(m.getExtensionId(), null);
  });

  it('NEXT_PUBLIC_EXTENSION_ID takes precedence over the stored id', async () => {
    installWindow();
    process.env.NEXT_PUBLIC_EXTENSION_ID = OTHER_ID;
    const m = await load();
    m.rememberExtensionId(VALID_ID);
    assert.equal(m.getExtensionId(), OTHER_ID);
  });

  it('needs BOTH chrome.runtime and an id to report available', async () => {
    installWindow({ runtime: { sendMessage: () => {} } });
    const m = await load();
    assert.equal(m.isExtensionBridgeAvailable(), false, 'id still missing');
    m.rememberExtensionId(VALID_ID);
    assert.equal(m.isExtensionBridgeAvailable(), true);
  });
});

describe('extension bridge: startRecallInExtension', () => {
  beforeEach(() => clearWindow());
  afterEach(() => clearWindow());

  it('fails cleanly when the extension is not reachable', async () => {
    installWindow(); // no chrome.runtime
    const m = await load();
    m.rememberExtensionId(VALID_ID);
    assert.deepEqual(await m.startRecallInExtension('aircAruvnKk', [1]), {
      ok: false, error: 'extension_unavailable',
    });
  });

  it('passes videoId + bookmarkIds through and returns the response', async () => {
    let seen: any = null;
    installWindow({
      runtime: {
        sendMessage: (id: string, msg: unknown, cb: (r: unknown) => void) => {
          seen = { id, msg };
          cb({ ok: true, count: 3 });
        },
      },
    });
    const m = await load();
    m.rememberExtensionId(VALID_ID);
    const res = await m.startRecallInExtension('aircAruvnKk', [7, 8]);
    assert.deepEqual(res, { ok: true, count: 3 });
    assert.equal(seen.id, VALID_ID);
    assert.deepEqual(seen.msg, { type: 'START_RECALL', videoId: 'aircAruvnKk', bookmarkIds: [7, 8] });
  });

  it('surfaces chrome.runtime.lastError (extension uninstalled)', async () => {
    installWindow({
      runtime: {
        sendMessage: (_i: string, _m: unknown, cb: (r?: unknown) => void) => cb(undefined),
        lastError: { message: 'Could not establish connection.' },
      },
    });
    const m = await load();
    m.rememberExtensionId(VALID_ID);
    const res = await m.startRecallInExtension('aircAruvnKk');
    assert.equal(res.ok, false);
    assert.match((res as { error: string }).error, /Could not establish connection/);
  });

  it('maps an error response from the background worker', async () => {
    installWindow({
      runtime: { sendMessage: (_i: string, _m: unknown, cb: (r: unknown) => void) => cb({ ok: false, error: 'no_bookmarks' }) },
    });
    const m = await load();
    m.rememberExtensionId(VALID_ID);
    assert.deepEqual(await m.startRecallInExtension('aircAruvnKk'), { ok: false, error: 'no_bookmarks' });
  });

  it('treats a missing response as a failure rather than success', async () => {
    installWindow({
      runtime: { sendMessage: (_i: string, _m: unknown, cb: (r?: unknown) => void) => cb(undefined) },
    });
    const m = await load();
    m.rememberExtensionId(VALID_ID);
    assert.deepEqual(await m.startRecallInExtension('aircAruvnKk'), { ok: false, error: 'no_response' });
  });

  it('does not reject when sendMessage throws', async () => {
    installWindow({
      runtime: { sendMessage: () => { throw new Error('boom'); } },
    });
    const m = await load();
    m.rememberExtensionId(VALID_ID);
    const res = await m.startRecallInExtension('aircAruvnKk');
    assert.equal(res.ok, false);
    assert.match((res as { error: string }).error, /boom/);
  });
});

// ─── Bridge contract vs. saved A–B loops ─────────────────────────────────────
// Loops sync through /api/bookmarks (Pro-gated server-side), NOT through this
// bridge. These assertions pin that down: the bridge must stay a recall
// hand-off with no write surface, so it can never become a way for a non-Pro
// client to persist a loop.
describe('bridge exposes no loop-persistence surface', () => {
  const BACKGROUND = new URL('../../../extension/src/background/background.js', import.meta.url);

  it('the background listener accepts exactly AUTH_SUCCESS and START_RECALL', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(BACKGROUND, 'utf8');
    const external = source.slice(source.indexOf('onMessageExternal'));
    // Plain exec loop: matchAll spread needs downlevelIteration under this tsconfig.
    const accepted: string[] = [];
    const re = /message\.type === '([A-Z_]+)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(external)) !== null) accepted.push(m[1]);
    assert.deepEqual(
      accepted.sort(),
      ['AUTH_SUCCESS', 'START_RECALL'],
      'a new externally-callable message type is a new trust boundary — gate it deliberately',
    );
  });

  it('no externally-reachable handler writes a loop into storage', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(BACKGROUND, 'utf8');
    const external = source.slice(source.indexOf('onMessageExternal'));
    assert.ok(!/loop/i.test(external), 'the external bridge must not touch loop data');
  });

  it('START_RECALL still carries only a videoId and bookmarkIds', async () => {
    installWindow({
      runtime: {
        sendMessage: (_id: string, message: Record<string, unknown>, cb: (r: unknown) => void) => {
          assert.deepEqual(Object.keys(message).sort(), ['bookmarkIds', 'type', 'videoId']);
          assert.equal(message.type, 'START_RECALL');
          cb({ ok: true, count: 1 });
        },
      },
    });
    process.env.NEXT_PUBLIC_EXTENSION_ID = VALID_ID;
    const mod = await load();
    const res = await mod.startRecallInExtension('dQw4w9WgXcQ', [1, 2]);
    assert.deepEqual(res, { ok: true, count: 1 });
    clearWindow();
  });
});
