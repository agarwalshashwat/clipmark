/**
 * /feedback validation + POST /api/feedback, with injected fakes (no DB, no network).
 *
 * The form and the route share `validateFeedback`, so the rules are asserted
 * once here and both surfaces inherit them. The handler tests cover what only
 * the route can get wrong: the user_id stamp, the rate limit, and the failure
 * paths.
 *
 * Placeholder env is set by the --import preload in the test:unit script.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { validateFeedback, LIMITS, ERROR_FIELD } from '../../app/lib/feedback.js';
import { handlePostFeedback, resetRateLimit, type FeedbackDeps } from '../../app/api/feedback/handler.js';
import { makeFakeSupabase, makeRequest, type FakeCtx } from './fixtures/fakes.js';

const valid = {
  rating: 4,
  liked: 'The side panel is fast.',
  confusing: null,
  feature_request: null,
  name: null,
  email: null,
  source: 'site',
};

// ── Validation (shared by the client form and the route) ─────────────────────
describe('validateFeedback', () => {
  it('accepts a rating plus one answered question', () => {
    const result = validateFeedback(valid);
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value.rating, 4);
  });

  it('rejects a non-object body', () => {
    for (const body of [null, undefined, 'nope', 42, []]) {
      const result = validateFeedback(body);
      assert.equal(result.ok, false, `${JSON.stringify(body)} should be rejected`);
      assert.equal(!result.ok && result.error, 'invalid_body');
    }
  });

  it('requires an integer rating in 1..5', () => {
    for (const rating of [0, 6, -1, 3.5, '4', null, undefined, NaN]) {
      const result = validateFeedback({ ...valid, rating });
      assert.equal(result.ok, false, `rating ${String(rating)} should be rejected`);
      assert.equal(!result.ok && result.error, 'invalid_rating');
    }
    for (const rating of [1, 2, 3, 4, 5]) {
      assert.equal(validateFeedback({ ...valid, rating }).ok, true);
    }
  });

  it('requires at least one of the three questions to be answered', () => {
    const result = validateFeedback({ ...valid, liked: null, confusing: null, feature_request: null });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error, 'no_answers');

    // Whitespace is not an answer.
    const blank = validateFeedback({ ...valid, liked: '   \n  ' });
    assert.equal(blank.ok, false);
    assert.equal(!blank.ok && blank.error, 'no_answers');

    // Any one of the three is enough.
    assert.equal(validateFeedback({ ...valid, liked: null, confusing: 'Lost the panel.' }).ok, true);
    assert.equal(validateFeedback({ ...valid, liked: null, feature_request: 'Dark mode.' }).ok, true);
  });

  it('trims answers and collapses empty strings to null', () => {
    const result = validateFeedback({ ...valid, liked: '  it works  ', confusing: '' });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value.liked, 'it works');
    assert.equal(result.ok && result.value.confusing, null);
  });

  it('rejects an answer over the limit but accepts one exactly at it', () => {
    const tooLong = validateFeedback({ ...valid, liked: 'x'.repeat(LIMITS.answer + 1) });
    assert.equal(tooLong.ok, false);
    assert.equal(!tooLong.ok && tooLong.error, 'answer_too_long');

    assert.equal(validateFeedback({ ...valid, liked: 'x'.repeat(LIMITS.answer) }).ok, true);
  });

  it('rejects a non-string answer rather than coercing it', () => {
    const result = validateFeedback({ ...valid, confusing: { toString: () => 'nope' } });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error, 'answer_too_long');
  });

  it('accepts a blank email and a plausible one, rejects a malformed one', () => {
    assert.equal(validateFeedback({ ...valid, email: null }).ok, true);
    assert.equal(validateFeedback({ ...valid, email: '  ' }).ok, true);
    for (const email of ['ash@example.com', 'a.b+tag@sub.example.co.uk']) {
      assert.equal(validateFeedback({ ...valid, email }).ok, true, `${email} should be accepted`);
    }
    for (const email of ['ash', 'ash@', '@example.com', 'ash@example', 'a b@example.com']) {
      const result = validateFeedback({ ...valid, email });
      assert.equal(result.ok, false, `${email} should be rejected`);
      assert.equal(!result.ok && result.error, 'invalid_email');
    }
  });

  it('rejects an over-long name and email', () => {
    const name = validateFeedback({ ...valid, name: 'n'.repeat(LIMITS.name + 1) });
    assert.equal(!name.ok && name.error, 'name_too_long');

    const local = 'e'.repeat(LIMITS.email);
    const email = validateFeedback({ ...valid, email: `${local}@example.com` });
    assert.equal(!email.ok && email.error, 'email_too_long');
  });

  it('truncates an over-long source instead of failing the submission', () => {
    const result = validateFeedback({ ...valid, source: 'ref:' + 'x'.repeat(500) });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value.source?.length, LIMITS.source);
  });

  it('maps every error code to a field the form can render', () => {
    for (const code of Object.keys(ERROR_FIELD)) {
      assert.ok(ERROR_FIELD[code as keyof typeof ERROR_FIELD], `${code} has no field`);
    }
  });
});

// ── POST /api/feedback ───────────────────────────────────────────────────────
const post = (body: unknown, ip = '203.0.113.1') =>
  makeRequest({
    url: 'http://localhost/api/feedback',
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

function deps(opts: { userId?: string | null; insertFails?: boolean; throwOnAuth?: boolean } = {}) {
  const fake = makeFakeSupabase((ctx: FakeCtx) =>
    ctx.table === 'feedback' && opts.insertFails
      ? { error: { message: 'insert denied' } }
      : { error: null },
  );
  return {
    fake,
    deps: {
      admin: fake.client,
      getOptionalUserId: async () => {
        if (opts.throwOnAuth) throw new Error('session lookup exploded');
        return opts.userId ?? null;
      },
    } satisfies FeedbackDeps,
  };
}

describe('POST /api/feedback', () => {
  beforeEach(() => resetRateLimit());

  it('stores an anonymous submission with user_id null', async () => {
    const { fake, deps: d } = deps();
    const res = await handlePostFeedback(post(valid), d);

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });

    const insert = fake.calls.find((c) => c.table === 'feedback');
    assert.ok(insert, 'expected an insert into feedback');
    assert.equal(insert.op, 'insert');
    assert.deepEqual(insert.payload, { ...valid, user_id: null });
  });

  it('stamps user_id from the session, never from the body', async () => {
    const { fake, deps: d } = deps({ userId: 'real-user' });
    // A caller trying to attribute feedback to somebody else.
    const res = await handlePostFeedback(post({ ...valid, user_id: 'someone-else' }), d);

    assert.equal(res.status, 200);
    const payload = fake.calls.find((c) => c.table === 'feedback')?.payload as { user_id?: string };
    assert.equal(payload.user_id, 'real-user');
  });

  it('still stores the submission when the session lookup throws', async () => {
    const { fake, deps: d } = deps({ throwOnAuth: true });
    const res = await handlePostFeedback(post(valid), d);

    assert.equal(res.status, 200);
    const payload = fake.calls.find((c) => c.table === 'feedback')?.payload as { user_id?: string | null };
    assert.equal(payload.user_id, null);
  });

  it('rejects a malformed body with 400 and no insert', async () => {
    const { fake, deps: d } = deps();
    const res = await handlePostFeedback(post('{not json'), d);

    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'invalid_json');
    assert.equal(fake.calls.length, 0);
  });

  it('returns the validation error code and message, and does not insert', async () => {
    const { fake, deps: d } = deps();
    const res = await handlePostFeedback(post({ ...valid, rating: 9 }), d);

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'invalid_rating');
    assert.match(body.message, /1 to 5/);
    assert.equal(fake.calls.length, 0);
  });

  it('surfaces a failed insert as 500 rather than a silent success', async () => {
    const { deps: d } = deps({ insertFails: true });
    const res = await handlePostFeedback(post(valid), d);

    assert.equal(res.status, 500);
    assert.equal((await res.json()).error, 'save_failed');
  });

  it('rate-limits a hammering client after 5 submissions in the window', async () => {
    const { deps: d } = deps();
    for (let i = 0; i < 5; i++) {
      const ok = await handlePostFeedback(post(valid, '198.51.100.7'), d);
      assert.equal(ok.status, 200, `submission ${i + 1} should be accepted`);
    }
    const blocked = await handlePostFeedback(post(valid, '198.51.100.7'), d);
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).error, 'rate_limited');

    // The window is per-IP, so another visitor is unaffected.
    const other = await handlePostFeedback(post(valid, '198.51.100.8'), d);
    assert.equal(other.status, 200);
  });

  it('rate-limits before parsing, so a flood of garbage is cheap', async () => {
    const { fake, deps: d } = deps();
    for (let i = 0; i < 6; i++) await handlePostFeedback(post(valid, '192.0.2.9'), d);
    const res = await handlePostFeedback(post('{not json', '192.0.2.9'), d);
    assert.equal(res.status, 429);
    // 5 accepted inserts, and nothing after the limit kicked in.
    assert.equal(fake.calls.filter((c) => c.table === 'feedback').length, 5);
  });
});
