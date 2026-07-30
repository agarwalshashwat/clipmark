/**
 * Reminders entitlement integration tests (security PR — audit finding #2).
 *
 * /api/reminders and /api/reminders/[id]/done are marketed Pro-only
 * (spaced-repetition) but previously had no server-side is_pro check at all —
 * any authenticated free user (or a spoofed client calling the route directly,
 * bypassing the extension's client-side gate) could use the feature for free.
 * These tests exercise the real route handlers against the local Supabase DB.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET as remindersGet, POST as remindersPost } from '../../app/api/reminders/route.js';
import { POST as reminderDonePost } from '../../app/api/reminders/[id]/done/route.js';
import { createTestUser, makePro } from './fixtures/seed.js';
import { adminClient } from './fixtures/supabase.js';
import { makeRequest } from '../unit/fixtures/fakes.js';

const admin = adminClient();

function authedReq(token: string | null, opts: { url?: string; method?: string; body?: string } = {}) {
  return makeRequest({
    url: opts.url ?? 'http://localhost/api/reminders',
    method: opts.method ?? 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: opts.body,
  });
}

const reminderBody = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  target_type: 'collection',
  target_id: 'vidX',
  frequency: 'weekly',
  next_due_at: new Date(Date.now() + 86_400_000).toISOString(),
  ...overrides,
});

describe('reminders entitlement (security PR, integration)', () => {
  it('GET /api/reminders returns 401 for an invalid token', async () => {
    // A request with NO Authorization header falls through to the cookie-session
    // path (createServerSupabase → next/headers cookies()), which requires a
    // real Next.js request scope and isn't exercisable via a direct handler
    // import like this — so this uses a garbage Bearer token instead, which
    // exercises the same "auth fails" branch via supabase.auth.getUser().
    const res = await remindersGet(authedReq('not-a-real-token'));
    assert.equal(res.status, 401);
  });

  it('GET /api/reminders returns 403 for a non-Pro user', async () => {
    const free = await createTestUser('reminders-free-get@example.test');
    const res = await remindersGet(authedReq(free.accessToken));
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'pro_required');
  });

  it('POST /api/reminders returns 403 for a non-Pro user and creates no row', async () => {
    const free = await createTestUser('reminders-free-post@example.test');
    const res = await remindersPost(
      authedReq(free.accessToken, { method: 'POST', body: reminderBody() }),
    );
    assert.equal(res.status, 403);

    const { count } = await admin
      .from('revisit_reminders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', free.id);
    assert.equal(count, 0, 'free user must not be able to create a reminder row');
  });

  it('POST /api/reminders/[id]/done returns 403 for a non-Pro user', async () => {
    const free = await createTestUser('reminders-free-done@example.test');
    const res = await reminderDonePost(
      authedReq(free.accessToken, { method: 'POST', url: 'http://localhost/api/reminders/does-not-matter/done' }),
      { params: Promise.resolve({ id: 'does-not-matter' }) },
    );
    assert.equal(res.status, 403);
  });

  it('a Pro user can create, list, and mark a reminder done', async () => {
    const u = await createTestUser('reminders-pro@example.test');
    await makePro(u.id);

    const postRes = await remindersPost(
      authedReq(u.accessToken, { method: 'POST', body: reminderBody() }),
    );
    const created = await postRes.json();
    assert.equal(postRes.status, 201, JSON.stringify(created));
    assert.equal(created.user_id, u.id, 'the row is attributed to the authenticated caller');

    const getRes = await remindersGet(authedReq(u.accessToken));
    assert.equal(getRes.status, 200);
    const { due, upcoming } = await getRes.json();
    assert.ok([...due, ...upcoming].some((r: { id: string }) => r.id === created.id));

    const doneRes = await reminderDonePost(
      authedReq(u.accessToken, { method: 'POST', url: `http://localhost/api/reminders/${created.id}/done` }),
      { params: Promise.resolve({ id: created.id }) },
    );
    assert.equal(doneRes.status, 200);
  });

  it('a Pro user cannot mark another user\'s reminder done (RLS isolation)', async () => {
    const owner = await createTestUser('reminders-owner@example.test');
    await makePro(owner.id);
    const intruder = await createTestUser('reminders-intruder@example.test');
    await makePro(intruder.id);

    const postRes = await remindersPost(
      authedReq(owner.accessToken, { method: 'POST', body: reminderBody({ target_id: 'vidOwner' }) }),
    );
    const created = await postRes.json();

    // Intruder is Pro (passes the entitlement gate) but RLS must still scope
    // the row lookup to their own rows — done on someone else's id 404s.
    const res = await reminderDonePost(
      authedReq(intruder.accessToken, { method: 'POST', url: `http://localhost/api/reminders/${created.id}/done` }),
      { params: Promise.resolve({ id: created.id }) },
    );
    assert.equal(res.status, 404);
  });
});
