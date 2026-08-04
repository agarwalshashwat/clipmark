/**
 * Dashboard queue-page entitlement integration test (security fix).
 *
 * /api/reminders already enforces is_pro server-side (see
 * reminders-entitlement.test.ts), but /dashboard/queue's own server component
 * queried revisit_reminders directly and never checked is_pro at all — RLS
 * only scopes rows to their owner, not by Pro status, so any authenticated
 * free user could load the page and be served their reminder data for free.
 * These tests exercise the extracted loadRemindersQueue() data loader
 * against the real local Supabase DB.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadRemindersQueue } from '../../app/dashboard/queue/data.js';
import { createTestUser, makePro } from './fixtures/seed.js';
import { userClient } from './fixtures/supabase.js';

describe('dashboard queue page entitlement (security fix, integration)', () => {
  it('blocks a free user without ever querying reminder data', async () => {
    const free = await createTestUser('queue-free@example.test');
    const result = await loadRemindersQueue(userClient(free.accessToken), free.id);
    assert.equal(result.blocked, true);
    assert.ok(!('dueReminders' in result), 'a blocked result must not carry reminder data');
  });

  it('serves a Pro user their reminders', async () => {
    const pro = await createTestUser('queue-pro@example.test');
    await makePro(pro.id);

    const result = await loadRemindersQueue(userClient(pro.accessToken), pro.id);
    assert.equal(result.blocked, false);
    if (!result.blocked) {
      assert.ok(Array.isArray(result.dueReminders));
      assert.ok(Array.isArray(result.upcomingReminders));
      assert.ok(Array.isArray(result.collectionTargets));
      assert.ok(Array.isArray(result.groupTargets));
    }
  });
});
