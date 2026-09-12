/**
 * /uninstall validation + POST /api/uninstall-feedback, with injected fakes
 * (no DB, no network).
 *
 * The form and the route share `validateUninstallFeedback`, so the rules are
 * asserted once here and both surfaces inherit them. The handler tests cover
 * what only the route can get wrong: the rate limit, the failure paths, and the
 * fail-soft behaviour while migration 019 is still unapplied.
 *
 * Placeholder env is set by the --import preload in the test:unit script.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateUninstallFeedback,
  normaliseVersion,
  isReason,
  REASONS,
  LIMITS,
  ERROR_FIELD,
} from '../../app/lib/uninstall-feedback.js';
import {
  handlePostUninstallFeedback,
  resetRateLimit,
  type UninstallFeedbackDeps,
} from '../../app/api/uninstall-feedback/handler.js';
import { makeFakeSupabase, makeRequest, type FakeCtx } from './fixtures/fakes.js';

const WEBAPP_DIR = fileURLToPath(new URL('../..', import.meta.url));

const valid = {
  reason: 'missing_feature',
  message: 'No way to export a whole group at once.',
  email: null,
  extension_version: '1.0.6',
};

// ── Validation (shared by the client form and the route) ─────────────────────
describe('validateUninstallFeedback', () => {
  it('accepts a reason on its own — everything else is optional', () => {
    const result = validateUninstallFeedback({ reason: 'just_trying' });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value.message, null);
    assert.equal(result.ok && result.value.email, null);
  });

  it('rejects a non-object body', () => {
    for (const body of [null, undefined, 'nope', 42, []]) {
      const result = validateUninstallFeedback(body);
      assert.equal(result.ok, false, `${JSON.stringify(body)} should be rejected`);
      assert.equal(!result.ok && result.error, 'invalid_body');
    }
  });

  it('requires a reason from the allowlist', () => {
    for (const reason of [undefined, null, '', 'whatever', 42, 'EXPECTATIONS']) {
      const result = validateUninstallFeedback({ ...valid, reason });
      assert.equal(result.ok, false, `reason ${String(reason)} should be rejected`);
      assert.equal(!result.ok && result.error, 'invalid_reason');
    }
    for (const { value } of REASONS) {
      assert.equal(validateUninstallFeedback({ reason: value }).ok, true, `${value} should be accepted`);
    }
  });

  it('trims free text and collapses whitespace-only to null', () => {
    const result = validateUninstallFeedback({ ...valid, message: '  \n  ' });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value.message, null);
  });

  it('rejects over-long free text', () => {
    const result = validateUninstallFeedback({ ...valid, message: 'x'.repeat(LIMITS.message + 1) });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error, 'message_too_long');
  });

  it('accepts a plausible email and rejects an obvious typo', () => {
    assert.equal(validateUninstallFeedback({ ...valid, email: 'a@b.co' }).ok, true);
    for (const email of ['nope', 'a@b', 'a b@c.com', '@b.com']) {
      const result = validateUninstallFeedback({ ...valid, email });
      assert.equal(result.ok, false, `${email} should be rejected`);
      assert.equal(!result.ok && result.error, 'invalid_email');
    }
  });

  it('maps every error code to a field the form can highlight', () => {
    for (const code of Object.keys(ERROR_FIELD)) {
      assert.ok(ERROR_FIELD[code as keyof typeof ERROR_FIELD], `${code} has no field`);
    }
  });
});

// ── The ?v= query param is the only thing that crosses from the URL ──────────
describe('normaliseVersion', () => {
  it('keeps version-shaped values', () => {
    for (const v of ['1', '1.0', '1.0.6', '1.0.6.2']) {
      assert.equal(normaliseVersion(v), v);
    }
    assert.equal(normaliseVersion('  1.0.6  '), '1.0.6');
  });

  // The uninstall URL is registered by the extension, but the page is public and
  // anyone can open it with any query they like. Dropping non-version values is
  // what stops ?v= becoming a way to write identifiers into the table.
  it('drops anything that is not a version, rather than storing it', () => {
    for (const v of [
      'user@example.com',
      'abc',
      '1.0.6; DROP TABLE',
      '<script>',
      'a'.repeat(64),
      '1.0.6-beta',
      '',
      '   ',
      null,
      undefined,
      42,
      {},
    ]) {
      assert.equal(normaliseVersion(v), null, `${JSON.stringify(v)} should be dropped`);
    }
  });

  it('is applied by the validator, not just available to it', () => {
    const result = validateUninstallFeedback({ reason: 'other', extension_version: 'user@example.com' });
    assert.equal(result.ok, true, 'a junk version must not fail the whole submission');
    assert.equal(result.ok && result.value.extension_version, null);
  });
});

// ── Route handler ────────────────────────────────────────────────────────────
const post = (body: unknown, ip = '203.0.113.1') =>
  makeRequest({
    url: 'http://localhost/api/uninstall-feedback',
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

function deps(insertError: { message?: string; code?: string } | null = null) {
  const fake = makeFakeSupabase((ctx: FakeCtx) =>
    ctx.table === 'uninstall_feedback' && insertError ? { error: insertError } : { error: null },
  );
  return { deps: { admin: fake.client } as UninstallFeedbackDeps, calls: fake.calls };
}

describe('POST /api/uninstall-feedback', () => {
  beforeEach(() => resetRateLimit());

  it('inserts the validated row and reports it stored', async () => {
    const { deps: d, calls } = deps();
    const response = await handlePostUninstallFeedback(post(valid), d);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, stored: true });
    assert.equal(calls[0].table, 'uninstall_feedback');
    assert.equal(calls[0].op, 'insert');
    assert.deepEqual(calls[0].payload, valid);
  });

  it('never writes a column the migration does not grant', async () => {
    const { deps: d, calls } = deps();
    // A client trying to smuggle extra fields past the validator.
    await handlePostUninstallFeedback(
      post({ ...valid, user_id: 'someone', id: 'chosen', created_at: '1999-01-01' }),
      d,
    );

    assert.deepEqual(
      Object.keys(calls[0].payload as object).sort(),
      ['email', 'extension_version', 'message', 'reason'],
    );
  });

  it('rejects an invalid body with a 400 and never touches the database', async () => {
    const { deps: d, calls } = deps();
    const response = await handlePostUninstallFeedback(post({ reason: 'nope' }), d);

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'invalid_reason');
    assert.equal(calls.length, 0);
  });

  it('returns 400 on malformed JSON', async () => {
    const { deps: d } = deps();
    const response = await handlePostUninstallFeedback(post('{not json'), d);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'invalid_json');
  });

  it('rate-limits per IP before parsing anything', async () => {
    const { deps: d } = deps();

    for (let i = 0; i < 5; i++) {
      const ok = await handlePostUninstallFeedback(post(valid, '203.0.113.9'), d);
      assert.equal(ok.status, 200, `submission ${i + 1} should be allowed`);
    }
    const blocked = await handlePostUninstallFeedback(post(valid, '203.0.113.9'), d);
    assert.equal(blocked.status, 429);

    // A different caller is unaffected.
    const other = await handlePostUninstallFeedback(post(valid, '198.51.100.4'), d);
    assert.equal(other.status, 200);
  });

  it('surfaces a real insert failure as a 500', async () => {
    const { deps: d } = deps({ message: 'connection reset', code: '08006' });
    const response = await handlePostUninstallFeedback(post(valid), d);

    assert.equal(response.status, 500);
    assert.equal((await response.json()).error, 'save_failed');
  });

  // The page ships before migration 019 is applied — deliberately, so the
  // extension's uninstall URL resolves to something the moment the Web Store
  // update rolls out. Someone who just uninstalled and still answered must not
  // be shown an error because of our rollout order.
  it('fails SOFT while migration 019 is unapplied', async () => {
    for (const error of [
      { code: '42P01', message: 'relation "public.uninstall_feedback" does not exist' },
      { code: 'PGRST205', message: "Could not find the table 'public.uninstall_feedback'" },
      { code: undefined, message: 'relation "public.uninstall_feedback" does not exist' },
    ]) {
      const { deps: d } = deps(error);
      const response = await handlePostUninstallFeedback(post(valid), d);

      assert.equal(response.status, 200, `${error.code} should not surface to the visitor`);
      assert.deepEqual(await response.json(), { ok: true, stored: false });
      resetRateLimit();
    }
  });
});

// ── The app allowlist and the migration's WITH CHECK must agree ─────────────
describe('migration 019 parity', () => {
  const sql = readFileSync(join(WEBAPP_DIR, 'migrations/019_uninstall_feedback.sql'), 'utf8');

  it('constrains reason to exactly the options the form offers', () => {
    // Drift here is silent and one-directional: a new option ships in the form,
    // the database rejects it, and the submission is lost as a 500.
    const block = sql.slice(sql.indexOf('reason IN ('), sql.indexOf('))', sql.indexOf('reason IN (')));
    // exec loop rather than [...matchAll()] — this tsconfig's target predates
    // iterating an iterator with spread.
    const inSql: string[] = [];
    const re = /'([a-z_]+)'/g;
    for (let m = re.exec(block); m !== null; m = re.exec(block)) inSql.push(m[1]);
    inSql.sort();
    const inApp = REASONS.map((r) => r.value).sort();

    assert.deepEqual(inSql, inApp);
    for (const value of inApp) assert.ok(isReason(value));
  });

  it('grants INSERT only, and not on id or created_at', () => {
    assert.match(sql, /REVOKE ALL ON public\.uninstall_feedback FROM anon, authenticated;/);
    assert.match(sql, /GRANT INSERT \(reason, message, email, extension_version\)/);
    assert.ok(!/GRANT (SELECT|UPDATE|DELETE)/.test(sql), 'the table must stay write-only for the API roles');
  });

  it('enables RLS and defines no read policy', () => {
    assert.match(sql, /ALTER TABLE public\.uninstall_feedback ENABLE ROW LEVEL SECURITY;/);
    assert.ok(!/FOR (SELECT|UPDATE|DELETE)/.test(sql), 'absence of a policy is the denial');
  });
});
