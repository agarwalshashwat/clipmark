/**
 * Admin authorization integration (audit #5) — real GoTrue token validation +
 * real DB grant. requireAdmin's server client is injected to validate a real
 * user JWT (via anon auth.getUser(token)); the grant runs against the real DB.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { NextResponse } from 'next/server';
import { requireAdmin } from '../../app/api/admin/_lib.js';
import { handleGrantPro } from '../../app/api/admin/grant-pro/handler.js';
import { adminClient, anonClient } from './fixtures/supabase.js';
import { createTestUser, type TestUser } from './fixtures/seed.js';
import { makeRequest } from '../unit/fixtures/fakes.js';

const admin = adminClient();

// A server-client factory whose auth.getUser() validates a real JWT via GoTrue.
const serverForToken = (token: string) =>
  (async () => ({ auth: { getUser: () => anonClient().auth.getUser(token) } })) as never;

const grantReq = (userId: string) =>
  makeRequest({ url: 'http://localhost/api/admin/grant-pro', body: JSON.stringify({ userId, note: 'test' }) });

async function isPro(id: string) {
  const { data } = await admin.from('profiles').select('is_pro, is_gifted_pro').eq('id', id).single();
  return data as { is_pro: boolean; is_gifted_pro: boolean };
}

describe('admin grant-pro authorization (#5, integration)', () => {
  let adminUser: TestUser;
  let nonAdmin: TestUser;
  before(async () => {
    adminUser = await createTestUser('admin-real@example.test');
    nonAdmin = await createTestUser('nonadmin-real@example.test');
    process.env.ADMIN_USER_IDS = adminUser.id; // only this user is an admin
  });

  it('an admin can grant gifted Pro to a target user', async () => {
    const target = await createTestUser('grant-target@example.test');
    const res = await handleGrantPro(grantReq(target.id), {
      admin,
      requireAdmin: () => requireAdmin(serverForToken(adminUser.accessToken)),
    });
    assert.equal(res.status, 200);
    const p = await isPro(target.id);
    assert.equal(p.is_pro, true);
    assert.equal(p.is_gifted_pro, true);
  });

  it('a non-admin is rejected (403) and the target is unchanged', async () => {
    const target = await createTestUser('grant-target-2@example.test');
    const res = await handleGrantPro(grantReq(target.id), {
      admin,
      requireAdmin: () => requireAdmin(serverForToken(nonAdmin.accessToken)),
    });
    assert.equal(res.status, 403);
    assert.equal((await isPro(target.id)).is_pro, false, 'target must not be granted Pro');
  });

  it('an unauthenticated caller is rejected (401)', async () => {
    const target = await createTestUser('grant-target-3@example.test');
    const res = await handleGrantPro(grantReq(target.id), {
      admin,
      // no valid session
      requireAdmin: () => requireAdmin((async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } })) as never),
    });
    assert.ok(res instanceof NextResponse);
    assert.equal(res.status, 401);
    assert.equal((await isPro(target.id)).is_pro, false);
  });
});
