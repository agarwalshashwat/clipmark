/**
 * Integration smoke test (audit enabler a).
 *
 * Proves the local Supabase foundation is wired correctly before the real
 * must-have suites (#1–#5) build on it:
 *   - migrations have been applied (core tables exist),
 *   - the anon/authenticated RLS harness works (a user cannot self-grant Pro).
 *
 * Requires a running `supabase start` + applied migrations + env set.
 * Run: npm run test:integration
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { adminClient } from './fixtures/supabase.js';
import { createTestUser, type TestUser } from './fixtures/seed.js';
import { userClient } from './fixtures/supabase.js';

describe('integration smoke: local Supabase foundation', () => {
  it('migrated core tables are queryable via the service role', async () => {
    const admin = adminClient();
    for (const table of ['profiles', 'collections', 'user_bookmarks']) {
      const { error } = await admin.from(table).select('*', { head: true, count: 'exact' });
      assert.equal(error, null, `expected table "${table}" to exist after migrations`);
    }
  });

  describe('RLS harness: a user cannot self-grant Pro (mini #1)', () => {
    let user: TestUser;

    before(async () => {
      user = await createTestUser('smoke-user@example.test');
    });

    it('authenticated user UPDATE of is_pro does not take effect', async () => {
      const asUser = userClient(user.accessToken);
      // The column-level grant (migration 012) should block this; either the
      // call errors or it silently affects no columns — in both cases is_pro
      // must remain false.
      await asUser.from('profiles').update({ is_pro: true }).eq('id', user.id);

      const { data } = await adminClient()
        .from('profiles')
        .select('is_pro')
        .eq('id', user.id)
        .single();
      assert.equal(data?.is_pro, false, 'is_pro must remain false after a self-grant attempt');
    });
  });
});
