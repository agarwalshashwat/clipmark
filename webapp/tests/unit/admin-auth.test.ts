/**
 * Admin authorization unit tests (audit #5).
 * - requireAdmin with an injected server-auth client (401/403/allow)
 * - handleGrantPro honors requireAdmin's rejection + validates input
 * - meta-scan: every admin route.ts references requireAdmin (middleware guards
 *   /admin pages but NOT the /api/admin routes, so the in-route guard is the
 *   only server-side defense)
 *
 * Placeholder env is set by the --import preload in the test:unit script.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NextResponse } from 'next/server';
import { requireAdmin } from '../../app/api/admin/_lib.js';
import { handleGrantPro } from '../../app/api/admin/grant-pro/handler.js';
import { makeFakeSupabase, makeRequest, type FakeCtx } from './fixtures/fakes.js';

// A fake server client whose auth.getUser() returns the given user.
const serverWith = (user: unknown) =>
  (async () => ({ auth: { getUser: async () => ({ data: { user } }) } })) as never;

describe('requireAdmin (#5)', () => {
  it('returns 401 when there is no session', async () => {
    const res = await requireAdmin(serverWith(null));
    assert.ok(res instanceof NextResponse);
    assert.equal((res as NextResponse).status, 401);
  });

  it('returns 403 for an authenticated non-admin', async () => {
    process.env.ADMIN_USER_IDS = 'admin-a,admin-b';
    const res = await requireAdmin(serverWith({ id: 'someone-else' }));
    assert.ok(res instanceof NextResponse);
    assert.equal((res as NextResponse).status, 403);
  });

  it('allows a user listed in ADMIN_USER_IDS', async () => {
    process.env.ADMIN_USER_IDS = 'admin-a,admin-b';
    const res = await requireAdmin(serverWith({ id: 'admin-b' }));
    assert.deepEqual(res, { userId: 'admin-b' });
  });
});

describe('handleGrantPro (#5)', () => {
  const body = (b: unknown) =>
    makeRequest({ url: 'http://localhost/api/admin/grant-pro', body: JSON.stringify(b) });

  it('short-circuits with requireAdmin\'s response and writes nothing', async () => {
    const { client, calls } = makeFakeSupabase(() => ({ error: null }));
    const res = await handleGrantPro(body({ userId: 'target' }), {
      admin: client,
      requireAdmin: async () => NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    assert.equal(res.status, 403);
    assert.equal(calls.length, 0, 'no DB write when authorization fails');
  });

  it('grants gifted Pro when authorized', async () => {
    const { client, calls } = makeFakeSupabase(() => ({ error: null }));
    const res = await handleGrantPro(body({ userId: 'target', note: 'vip' }), {
      admin: client,
      requireAdmin: async () => ({ userId: 'admin-a' }),
    });
    assert.equal(res.status, 200);
    const upd = calls.find((c: FakeCtx) => c.table === 'profiles' && c.op === 'update');
    assert.ok(upd);
    assert.equal((upd!.payload as { is_pro?: boolean }).is_pro, true);
    assert.equal((upd!.payload as { is_gifted_pro?: boolean }).is_gifted_pro, true);
    assert.deepEqual(upd!.filters, [['eq', 'id', 'target']]);
  });

  it('returns 400 when userId is missing', async () => {
    const { client } = makeFakeSupabase(() => ({ error: null }));
    const res = await handleGrantPro(body({ note: 'x' }), {
      admin: client,
      requireAdmin: async () => ({ userId: 'admin-a' }),
    });
    assert.equal(res.status, 400);
  });

  it('returns 400 on invalid JSON', async () => {
    const { client } = makeFakeSupabase(() => ({ error: null }));
    const req = makeRequest({ url: 'http://localhost/api/admin/grant-pro', body: 'not-json' });
    const res = await handleGrantPro(req, { admin: client, requireAdmin: async () => ({ userId: 'admin-a' }) });
    assert.equal(res.status, 400);
  });
});

describe('every /api/admin route enforces requireAdmin (#5)', () => {
  it('each route.ts references requireAdmin', () => {
    const adminDir = fileURLToPath(new URL('../../app/api/admin/', import.meta.url));
    const routeFiles: string[] = [];
    for (const entry of readdirSync(adminDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        try {
          const p = `${adminDir}${entry.name}/route.ts`;
          readFileSync(p, 'utf8'); // throws if absent
          routeFiles.push(p);
        } catch {
          /* directory without a route.ts — skip */
        }
      }
    }
    assert.ok(routeFiles.length >= 4, `expected several admin routes, found ${routeFiles.length}`);
    for (const p of routeFiles) {
      assert.match(readFileSync(p, 'utf8'), /requireAdmin/, `${p} must enforce requireAdmin`);
    }
  });
});
