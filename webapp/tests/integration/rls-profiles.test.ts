/**
 * RLS: self-grant-Pro prevention on profiles (audit #1, integration).
 *
 * The security-critical invariant: an authenticated user, using the public anon
 * key + their own JWT, cannot change entitlement columns on their own profile
 * row (migration 012's column-level grants). Asserted by reading the row back
 * via the service role and confirming it did NOT change.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { adminClient, userClient } from './fixtures/supabase.js';
import { createTestUser, type TestUser } from './fixtures/seed.js';

const admin = adminClient();

async function readProfile(id: string) {
  const { data } = await admin
    .from('profiles')
    .select('is_pro, is_affiliate, commission_rate, is_gifted_pro, pro_payment_id, username')
    .eq('id', id)
    .single();
  return data as Record<string, unknown>;
}

describe('RLS: profiles entitlement columns (#1)', () => {
  let user: TestUser;
  before(async () => {
    user = await createTestUser('rls-profile@example.test');
  });

  const sensitive: Array<[string, unknown]> = [
    ['is_pro', true],
    ['is_affiliate', true],
    ['commission_rate', 0.99],
    ['is_gifted_pro', true],
    ['pro_payment_id', 'pay_hacked'],
  ];

  for (const [col, val] of sensitive) {
    it(`authenticated user cannot self-set ${col}`, async () => {
      const asUser = userClient(user.accessToken);
      const before = (await readProfile(user.id))[col];
      // Attempt the forbidden write (column-level grant should block it).
      await asUser.from('profiles').update({ [col]: val }).eq('id', user.id);
      const after = (await readProfile(user.id))[col];
      assert.deepEqual(after, before, `${col} must be unchanged after a self-grant attempt`);
      assert.notDeepEqual(after, val, `${col} must not equal the attacker value`);
    });
  }

  it('authenticated user CAN update an allowed column (username)', async () => {
    const asUser = userClient(user.accessToken);
    const newName = 'renamed_ok';
    const { error } = await asUser.from('profiles').update({ username: newName }).eq('id', user.id);
    assert.equal(error, null);
    assert.equal((await readProfile(user.id)).username, newName);
  });

  it('a user cannot modify another user\'s profile row', async () => {
    const victim = await createTestUser('rls-profile-victim@example.test');
    await admin.from('profiles').update({ username: 'victim_orig' }).eq('id', victim.id);
    const asUser = userClient(user.accessToken);
    await asUser.from('profiles').update({ username: 'hijacked' }).eq('id', victim.id);
    assert.equal((await readProfile(victim.id)).username, 'victim_orig', 'victim row unchanged');
  });

  it('the service role CAN set is_pro (webhook/admin path still works)', async () => {
    const u = await createTestUser('rls-profile-svc@example.test');
    const { error } = await admin.from('profiles').update({ is_pro: true }).eq('id', u.id);
    assert.equal(error, null);
    assert.equal((await readProfile(u.id)).is_pro, true);
  });
});
