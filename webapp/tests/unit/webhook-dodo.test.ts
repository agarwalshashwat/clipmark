/**
 * Dodo webhook unit tests (audit #2) — branch coverage with injected fakes.
 * No DB/network. Entitlement correctness against a real DB is covered in
 * tests/integration/webhook-entitlements.test.ts.
 */
// Placeholder env so importing @/lib/supabase (eager client) doesn't throw.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service';
process.env.DODO_ANNUAL_PRODUCT_ID ??= 'prod_annual_123';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleDodoWebhook } from '../../app/api/webhooks/dodo/handler.js';
import { makeFakeSupabase, fakeDodo, makeRequest, type FakeCtx } from './fixtures/fakes.js';

const HEADERS = {
  'webhook-id': 'wh_1',
  'webhook-signature': 'sig',
  'webhook-timestamp': '123',
};

function req(body: unknown = {}) {
  return makeRequest({ headers: HEADERS, body: JSON.stringify(body) });
}

describe('Dodo webhook handler (#2)', () => {
  it('returns 401 and touches no DB when signature verification fails', async () => {
    const { client, calls } = makeFakeSupabase(() => ({ error: null }));
    const res = await handleDodoWebhook(req(), {
      dodo: fakeDodo({ throwOnUnwrap: true }),
      admin: client,
    });
    assert.equal(res.status, 401);
    assert.equal(calls.length, 0, 'no DB calls on bad signature');
  });

  it('returns 500 when the entitlement write fails (so Dodo retries)', async () => {
    const event = { type: 'payment.succeeded', data: { metadata: { user_id: 'u1' }, payment_id: 'pay_1' } };
    const responder = (ctx: FakeCtx) => {
      if (ctx.op === 'select') return { data: { is_pro: false } }; // pre-update read
      if (ctx.op === 'update') return { error: { message: 'db down' } }; // grant write fails
      return { error: null };
    };
    const { client } = makeFakeSupabase(responder);
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event }), admin: client });
    assert.equal(res.status, 500);
  });

  it('grants Pro on payment.succeeded and returns 200', async () => {
    const event = { type: 'payment.succeeded', data: { metadata: { user_id: 'u1' }, payment_id: 'pay_1', total_amount: 0 } };
    const { client, calls } = makeFakeSupabase((ctx) =>
      ctx.op === 'select' ? { data: { is_pro: false } } : { error: null },
    );
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event }), admin: client });
    assert.equal(res.status, 200);
    const update = calls.find((c) => c.table === 'profiles' && c.op === 'update');
    assert.ok(update, 'expected a profiles UPDATE');
    assert.equal((update!.payload as { is_pro?: boolean }).is_pro, true);
    assert.equal((update!.payload as { pro_payment_id?: string }).pro_payment_id, 'pay_1');
    assert.deepEqual(update!.filters, [['eq', 'id', 'u1']]);
  });

  it('no-ops (200, no writes) when metadata has no user_id', async () => {
    const event = { type: 'payment.succeeded', data: { metadata: {}, payment_id: 'pay_1' } };
    const { client, calls } = makeFakeSupabase(() => ({ error: null }));
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event }), admin: client });
    assert.equal(res.status, 200);
    assert.equal(calls.filter((c) => c.op !== 'select').length, 0, 'no write calls');
  });

  it('revokes Pro on subscription.cancelled', async () => {
    const event = { type: 'subscription.cancelled', data: { metadata: { user_id: 'u1' }, subscription_id: 'sub_1' } };
    const { client, calls } = makeFakeSupabase(() => ({ error: null }));
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event }), admin: client });
    assert.equal(res.status, 200);
    const update = calls.find((c) => c.table === 'profiles' && c.op === 'update');
    assert.equal((update!.payload as { is_pro?: boolean }).is_pro, false);
  });

  it('returns 500 when the refund revoke write fails', async () => {
    const event = { type: 'refund.succeeded', data: { payment_id: 'pay_1' } };
    const responder = (ctx: FakeCtx) => {
      if (ctx.table === 'affiliate_conversions') return { error: null };
      if (ctx.table === 'profiles' && ctx.op === 'select') return { data: { id: 'u1' } }; // find refunded profile
      if (ctx.table === 'profiles' && ctx.op === 'update') return { error: { message: 'db down' } };
      return { error: null };
    };
    const { client } = makeFakeSupabase(responder);
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event }), admin: client });
    assert.equal(res.status, 500);
  });

  it('maps subscription.active product_id to the annual plan', async () => {
    const event = {
      type: 'subscription.active',
      data: {
        metadata: { user_id: 'u1', affiliate_code: 'aff1' },
        subscription_id: 'sub_1',
        product_id: process.env.DODO_ANNUAL_PRODUCT_ID,
        created_at: '2026-01-01',
        recurring_pre_tax_amount: 1000,
      },
    };
    const responder = (ctx: FakeCtx) => {
      // affiliate lookup (profiles select filtered by affiliate_code) — check first
      if (ctx.table === 'profiles' && ctx.filters.some((f) => f[1] === 'affiliate_code')) {
        return { data: { id: 'aff_owner', commission_rate: 0.3 } };
      }
      if (ctx.table === 'profiles' && ctx.op === 'select') return { data: { is_pro: false, subscription_id: null } };
      if (ctx.table === 'profiles' && ctx.op === 'update') return { error: null };
      if (ctx.table === 'affiliate_conversions' && ctx.op === 'select') return { count: 0 };
      return { error: null };
    };
    const { client, calls } = makeFakeSupabase(responder);
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event }), admin: client });
    assert.equal(res.status, 200);
    const convInsert = calls.find((c) => c.table === 'affiliate_conversions' && c.op === 'insert');
    assert.ok(convInsert, 'expected an affiliate_conversions insert');
    assert.equal((convInsert!.payload as { plan?: string }).plan, 'annual');
  });
});
