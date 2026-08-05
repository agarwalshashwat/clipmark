/**
 * Dodo webhook unit tests (audit #2) — branch coverage with injected fakes.
 * No DB/network. Entitlement correctness against a real DB is covered in
 * tests/integration/webhook-entitlements.test.ts.
 *
 * Placeholder env is set by the --import preload in the test:unit script.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleDodoWebhook } from '../../app/api/webhooks/dodo/handler.js';
import { makeFakeSupabase, fakeDodo, makeRequest, type FakeCtx, type FakeRpcCtx, type FakeResult } from './fixtures/fakes.js';

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

  it('revokes Pro on subscription.expired', async () => {
    const event = { type: 'subscription.expired', data: { metadata: { user_id: 'u1' }, subscription_id: 'sub_1' } };
    const { client, calls } = makeFakeSupabase(() => ({ error: null }));
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event }), admin: client });
    assert.equal(res.status, 200);
    const update = calls.find((c) => c.table === 'profiles' && c.op === 'update');
    assert.equal((update!.payload as { is_pro?: boolean }).is_pro, false);
    assert.equal((update!.payload as { subscription_id?: null }).subscription_id, null);
  });

  it('extends the billing period on subscription.renewed without touching conversion tracking', async () => {
    const event = {
      type: 'subscription.renewed',
      data: { metadata: { user_id: 'u1' }, subscription_id: 'sub_1', next_billing_date: '2026-09-01' },
    };
    const { client, calls } = makeFakeSupabase(() => ({ error: null }));
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event }), admin: client });
    assert.equal(res.status, 200);
    const update = calls.find((c) => c.table === 'profiles' && c.op === 'update');
    assert.ok(update, 'expected a profiles UPDATE');
    const payload = update!.payload as Record<string, unknown>;
    assert.equal(payload.is_pro, true);
    assert.equal(payload.subscription_period_end, '2026-09-01');
    assert.equal(payload.cancel_at_period_end, false);
    assert.equal(calls.filter((c) => c.table === 'affiliate_conversions' || c.table === 'referrals').length, 0,
      'renewal is not a new conversion — no affiliate/referral bookkeeping');
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

describe('Dodo may redeliver the same event — handler must not double-apply it', () => {
  // Mutable state shared across both deliveries within a single test, so the
  // second call sees exactly what the first call actually wrote — the same
  // condition a real Dodo redelivery of the same webhook-id produces.
  it('redelivering payment.succeeded grants Pro once and records exactly one affiliate conversion', async () => {
    const event = {
      type: 'payment.succeeded',
      data: { metadata: { user_id: 'u1', affiliate_code: 'aff1' }, payment_id: 'pay_1', total_amount: 1000 },
    };
    const state = { isPro: false, conversions: 0 };
    const responder = (ctx: FakeCtx) => {
      if (ctx.table === 'profiles' && ctx.filters.some((f) => f[1] === 'affiliate_code')) {
        return { data: { id: 'aff_owner', commission_rate: 0.3 } };
      }
      if (ctx.table === 'profiles' && ctx.op === 'select') return { data: { is_pro: state.isPro } };
      if (ctx.table === 'profiles' && ctx.op === 'update') {
        state.isPro = true;
        return { error: null };
      }
      if (ctx.table === 'affiliate_conversions' && ctx.op === 'select') return { count: state.conversions };
      if (ctx.table === 'affiliate_conversions' && ctx.op === 'insert') {
        state.conversions += 1;
        return { error: null };
      }
      return { error: null };
    };
    const { client, calls } = makeFakeSupabase(responder);

    const first = await handleDodoWebhook(req(), { dodo: fakeDodo({ event }), admin: client });
    assert.equal(first.status, 200);
    const second = await handleDodoWebhook(req(), { dodo: fakeDodo({ event }), admin: client });
    assert.equal(second.status, 200);

    assert.equal(state.conversions, 1, 'redelivery must not double-record the affiliate conversion');
    const grantUpdates = calls.filter((c) => c.table === 'profiles' && c.op === 'update');
    assert.equal(grantUpdates.length, 2, 'both deliveries write, but idempotently — same is_pro:true both times');
    for (const u of grantUpdates) assert.equal((u.payload as { is_pro?: boolean }).is_pro, true);
  });

  it('redelivering subscription.cancelled revokes Pro both times without erroring', async () => {
    const event = { type: 'subscription.cancelled', data: { metadata: { user_id: 'u1' }, subscription_id: 'sub_1' } };
    const { client, calls } = makeFakeSupabase(() => ({ error: null }));

    const first = await handleDodoWebhook(req(), { dodo: fakeDodo({ event }), admin: client });
    const second = await handleDodoWebhook(req(), { dodo: fakeDodo({ event }), admin: client });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);

    const updates = calls.filter((c) => c.table === 'profiles' && c.op === 'update');
    assert.equal(updates.length, 2);
    for (const u of updates) assert.equal((u.payload as { is_pro?: boolean }).is_pro, false);
  });
});

describe('referral credit grants gifted Pro immediately (fixes the dead ledger-balance bug)', () => {
  const referralEvent = {
    type: 'payment.succeeded',
    data: { metadata: { user_id: 'payer1', user_referral_code: 'ref123' }, payment_id: 'pay_1', total_amount: 0 },
  };

  function referrerLookup(referrer: Record<string, unknown>) {
    return (ctx: FakeCtx): { data?: unknown; error?: null; count?: number } => {
      if (ctx.table === 'profiles' && ctx.filters.some((f) => f[1] === 'referral_code')) {
        return { data: referrer };
      }
      if (ctx.table === 'profiles' && ctx.op === 'select') return { data: { is_pro: false } }; // payer's pre-update read
      if (ctx.table === 'referrals' && ctx.op === 'select') return { count: 0 };
      return { error: null };
    };
  }

  function referrerUpdateCall(calls: FakeCtx[], referrerId: string) {
    return calls.find(
      (c) => c.table === 'profiles' && c.op === 'update' && c.filters.some((f) => f[2] === referrerId),
    );
  }

  it('grants the referrer is_pro + a gifted-Pro window on a referred first purchase', async () => {
    const referrer = {
      id: 'referrer1', referral_months_credit: 0,
      is_pro: false, is_gifted_pro: false, gifted_pro_expires_at: null,
    };
    const { client, calls } = makeFakeSupabase(referrerLookup(referrer));
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event: referralEvent }), admin: client });
    assert.equal(res.status, 200);

    const update = referrerUpdateCall(calls, 'referrer1');
    assert.ok(update, 'expected a profiles UPDATE for the referrer');
    const payload = update!.payload as Record<string, unknown>;
    assert.equal(payload.is_pro, true);
    assert.equal(payload.is_gifted_pro, true);
    assert.equal(payload.referral_months_credit, 3);
    assert.equal(typeof payload.gifted_pro_expires_at, 'string');

    const referralInsert = calls.find((c) => c.table === 'referrals' && c.op === 'insert');
    assert.ok(referralInsert, 'expected a referrals insert');
    assert.equal((referralInsert!.payload as { status?: string }).status, 'rewarded');
  });

  it('stacks the reward on top of an existing active gift window instead of resetting it', async () => {
    const futureExpiry = new Date(Date.now() + 10 * 86_400_000).toISOString(); // 10 days out
    const referrer = {
      id: 'referrer1', referral_months_credit: 3,
      is_pro: true, is_gifted_pro: true, gifted_pro_expires_at: futureExpiry,
    };
    const { client, calls } = makeFakeSupabase(referrerLookup(referrer));
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event: referralEvent }), admin: client });
    assert.equal(res.status, 200);

    const payload = referrerUpdateCall(calls, 'referrer1')!.payload as Record<string, unknown>;
    assert.equal(payload.referral_months_credit, 6);
    const expected = new Date(futureExpiry);
    expected.setMonth(expected.getMonth() + 3);
    assert.equal(payload.gifted_pro_expires_at, expected.toISOString());
    assert.ok(!('is_pro' in payload), 'already Pro — is_pro need not be rewritten');
  });

  it('leaves a permanent (non-expiring) gift untouched', async () => {
    const referrer = {
      id: 'referrer1', referral_months_credit: 3,
      is_pro: true, is_gifted_pro: true, gifted_pro_expires_at: null,
    };
    const { client, calls } = makeFakeSupabase(referrerLookup(referrer));
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event: referralEvent }), admin: client });
    assert.equal(res.status, 200);

    const payload = referrerUpdateCall(calls, 'referrer1')!.payload as Record<string, unknown>;
    assert.equal(payload.referral_months_credit, 6, 'audit counter still increments');
    assert.ok(!('gifted_pro_expires_at' in payload), 'a permanent gift is never given an expiry');
    assert.ok(!('is_gifted_pro' in payload));
    assert.ok(!('is_pro' in payload));
  });
});

describe('gift-aware revocation (referral/gifted Pro survives an unrelated subscription cancel or refund)', () => {
  it('subscription.cancelled keeps is_pro true when an active gift window is still running', async () => {
    const event = { type: 'subscription.cancelled', data: { metadata: { user_id: 'u1' }, subscription_id: 'sub_1' } };
    const futureExpiry = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const responder = (ctx: FakeCtx) => {
      if (ctx.table === 'profiles' && ctx.op === 'select') {
        return { data: { is_gifted_pro: true, gifted_pro_expires_at: futureExpiry } };
      }
      return { error: null };
    };
    const { client, calls } = makeFakeSupabase(responder);
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event }), admin: client });
    assert.equal(res.status, 200);
    const update = calls.find((c) => c.table === 'profiles' && c.op === 'update');
    assert.equal((update!.payload as { is_pro?: boolean }).is_pro, true, 'gift keeps them Pro after subscription cancel');
  });

  it('subscription.cancelled revokes Pro when a gift has already expired', async () => {
    const event = { type: 'subscription.cancelled', data: { metadata: { user_id: 'u1' }, subscription_id: 'sub_1' } };
    const pastExpiry = new Date(Date.now() - 86_400_000).toISOString();
    const responder = (ctx: FakeCtx) => {
      if (ctx.table === 'profiles' && ctx.op === 'select') {
        return { data: { is_gifted_pro: true, gifted_pro_expires_at: pastExpiry } };
      }
      return { error: null };
    };
    const { client, calls } = makeFakeSupabase(responder);
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event }), admin: client });
    assert.equal(res.status, 200);
    const update = calls.find((c) => c.table === 'profiles' && c.op === 'update');
    assert.equal((update!.payload as { is_pro?: boolean }).is_pro, false);
  });

  it('refund.succeeded keeps is_pro true when an unrelated active gift window is still running', async () => {
    const event = { type: 'refund.succeeded', data: { payment_id: 'pay_1' } };
    const futureExpiry = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const responder = (ctx: FakeCtx) => {
      if (ctx.table === 'affiliate_conversions') return { error: null };
      if (ctx.table === 'profiles' && ctx.op === 'select') {
        return { data: { id: 'u1', is_gifted_pro: true, gifted_pro_expires_at: futureExpiry } };
      }
      return { error: null };
    };
    const { client, calls } = makeFakeSupabase(responder);
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event }), admin: client });
    assert.equal(res.status, 200);
    const update = calls.find((c) => c.table === 'profiles' && c.op === 'update');
    assert.equal((update!.payload as { is_pro?: boolean }).is_pro, true);
  });
});

describe('referral reward reversal on refund (security PR — closes the pay-then-refund free-Pro loophole)', () => {
  const REFERRAL_REFUND_EVENT = { type: 'refund.succeeded', data: { payment_id: 'pay_ref' } };

  function hasFilter(ctx: FakeCtx, col: string, val: unknown) {
    return ctx.filters.some((f) => f[1] === col && f[2] === val);
  }

  // Shared plumbing every case needs: cancel the pending affiliate conversion,
  // find + revoke the refunded payer's own Pro. Cases override the referral
  // lookup / referrer profile / referrer update branches.
  function baseResponder(overrides: (ctx: FakeCtx) => FakeResult | undefined) {
    return (ctx: FakeCtx) => {
      if (ctx.table === 'affiliate_conversions') return { error: null };
      if (ctx.table === 'profiles' && ctx.op === 'select' && hasFilter(ctx, 'pro_payment_id', 'pay_ref')) {
        return { data: { id: 'payer1', is_gifted_pro: false, gifted_pro_expires_at: null } };
      }
      if (ctx.table === 'profiles' && ctx.op === 'update' && hasFilter(ctx, 'id', 'payer1')) {
        return { error: null }; // revoke refunded payer's own Pro
      }
      return overrides(ctx) ?? { error: null };
    };
  }

  function referrerUpdate(calls: FakeCtx[]) {
    return calls.find((c) => c.table === 'profiles' && c.op === 'update' && hasFilter(c, 'id', 'referrer1'));
  }

  it('decrements the referrer credit, rewinds the gift window, and cancels the referral row', async () => {
    // 6 calendar months out (two stacked 3-month rewards) so rewinding this
    // one 3-month reward leaves an unambiguous ~3 months remaining — using a
    // day-count approximation (e.g. 90 days) here is flaky since it isn't
    // exactly 3 calendar months, and can land right on the active/expired
    // boundary depending on which months elapse.
    const futureExpiryDate = new Date();
    futureExpiryDate.setMonth(futureExpiryDate.getMonth() + 6);
    const futureExpiry = futureExpiryDate.toISOString();
    const responder = baseResponder((ctx) => {
      if (ctx.table === 'referrals' && ctx.op === 'select') {
        return { data: { id: 'ref1', referrer_id: 'referrer1', reward_months: 3 } };
      }
      if (ctx.table === 'profiles' && ctx.op === 'select' && hasFilter(ctx, 'id', 'referrer1')) {
        return {
          data: {
            id: 'referrer1', is_gifted_pro: true, gifted_pro_expires_at: futureExpiry,
            subscription_id: null, pro_payment_id: null,
          },
        };
      }
      if (ctx.table === 'profiles' && ctx.op === 'update' && hasFilter(ctx, 'id', 'referrer1')) return { error: null };
      if (ctx.table === 'referrals' && ctx.op === 'update') return { error: null };
    });

    let decrementArgs: Record<string, unknown> | undefined;
    const { client, calls } = makeFakeSupabase(responder, (ctx: FakeRpcCtx) => {
      decrementArgs = ctx.args;
      return { error: null };
    });
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event: REFERRAL_REFUND_EVENT }), admin: client });
    assert.equal(res.status, 200);

    assert.deepEqual(decrementArgs, { p_user_id: 'referrer1', p_months: 3 });

    const giftUpdate = referrerUpdate(calls);
    assert.ok(giftUpdate, 'expected a profiles update for the referrer');
    const payload = giftUpdate!.payload as Record<string, unknown>;
    const expectedExpiry = new Date(futureExpiry);
    expectedExpiry.setMonth(expectedExpiry.getMonth() - 3);
    assert.equal(payload.gifted_pro_expires_at, expectedExpiry.toISOString());

    const referralCancel = calls.find((c) => c.table === 'referrals' && c.op === 'update');
    assert.ok(referralCancel, 'expected the referrals row to be cancelled');
    assert.equal((referralCancel!.payload as { status?: string }).status, 'cancelled');
  });

  it('fully revokes is_gifted_pro (and is_pro) when rewinding empties the window and the referrer has no other Pro', async () => {
    const nearExpiry = new Date(Date.now() + 5 * 86_400_000).toISOString(); // only 5 days left — rewinding 3mo goes negative
    const responder = baseResponder((ctx) => {
      if (ctx.table === 'referrals' && ctx.op === 'select') {
        return { data: { id: 'ref1', referrer_id: 'referrer1', reward_months: 3 } };
      }
      if (ctx.table === 'profiles' && ctx.op === 'select' && hasFilter(ctx, 'id', 'referrer1')) {
        return {
          data: {
            id: 'referrer1', is_gifted_pro: true, gifted_pro_expires_at: nearExpiry,
            subscription_id: null, pro_payment_id: null,
          },
        };
      }
      if (ctx.table === 'profiles' && ctx.op === 'update' && hasFilter(ctx, 'id', 'referrer1')) return { error: null };
      if (ctx.table === 'referrals' && ctx.op === 'update') return { error: null };
    });
    const { client, calls } = makeFakeSupabase(responder);
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event: REFERRAL_REFUND_EVENT }), admin: client });
    assert.equal(res.status, 200);

    const payload = referrerUpdate(calls)!.payload as Record<string, unknown>;
    assert.equal(payload.is_gifted_pro, false);
    assert.equal(payload.gifted_pro_expires_at, null);
    assert.equal(payload.is_pro, false, 'no subscription/own payment of their own — is_pro must be revoked');
  });

  it('keeps is_pro true if the referrer has their own active subscription once the gift window empties', async () => {
    const nearExpiry = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const responder = baseResponder((ctx) => {
      if (ctx.table === 'referrals' && ctx.op === 'select') {
        return { data: { id: 'ref1', referrer_id: 'referrer1', reward_months: 3 } };
      }
      if (ctx.table === 'profiles' && ctx.op === 'select' && hasFilter(ctx, 'id', 'referrer1')) {
        return {
          data: {
            id: 'referrer1', is_gifted_pro: true, gifted_pro_expires_at: nearExpiry,
            subscription_id: 'sub_own', pro_payment_id: null,
          },
        };
      }
      if (ctx.table === 'profiles' && ctx.op === 'update' && hasFilter(ctx, 'id', 'referrer1')) return { error: null };
      if (ctx.table === 'referrals' && ctx.op === 'update') return { error: null };
    });
    const { client, calls } = makeFakeSupabase(responder);
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event: REFERRAL_REFUND_EVENT }), admin: client });
    assert.equal(res.status, 200);

    const payload = referrerUpdate(calls)!.payload as Record<string, unknown>;
    assert.equal(payload.is_gifted_pro, false);
    assert.equal(payload.is_pro, true, 'referrer keeps Pro via their own subscription');
  });

  it('never touches a permanent (non-expiring) gift window, but still decrements the audit counter', async () => {
    const responder = baseResponder((ctx) => {
      if (ctx.table === 'referrals' && ctx.op === 'select') {
        return { data: { id: 'ref1', referrer_id: 'referrer1', reward_months: 3 } };
      }
      if (ctx.table === 'profiles' && ctx.op === 'select' && hasFilter(ctx, 'id', 'referrer1')) {
        return {
          data: {
            id: 'referrer1', is_gifted_pro: true, gifted_pro_expires_at: null,
            subscription_id: null, pro_payment_id: null,
          },
        };
      }
      if (ctx.table === 'referrals' && ctx.op === 'update') return { error: null };
    });
    let decremented = false;
    const { client, calls } = makeFakeSupabase(responder, () => {
      decremented = true;
      return { error: null };
    });
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event: REFERRAL_REFUND_EVENT }), admin: client });
    assert.equal(res.status, 200);
    assert.ok(decremented, 'the lifetime-earned audit counter is still decremented');
    assert.equal(referrerUpdate(calls), undefined, 'a permanent gift window must never be touched');
  });

  it('does nothing when the refunded purchase was never referred', async () => {
    const responder = baseResponder((ctx) => {
      if (ctx.table === 'referrals' && ctx.op === 'select') return { data: null }; // no referral found
    });
    const { client, calls } = makeFakeSupabase(responder);
    const res = await handleDodoWebhook(req(), { dodo: fakeDodo({ event: REFERRAL_REFUND_EVENT }), admin: client });
    assert.equal(res.status, 200);
    assert.equal(calls.filter((c) => c.table === 'referrals' && c.op === 'update').length, 0);
  });
});
