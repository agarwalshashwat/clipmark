/**
 * pending_refunds ledger unit tests — the durable record of a refund we owe but
 * couldn't pay automatically (migrations/018_pending_refunds.sql).
 *
 * No DB/network: the injected fake from fixtures/fakes.ts records what the
 * helper tried to do. The behaviour that matters most here is the fail-soft
 * contract — this code ships BEFORE migration 018 is applied to production, so
 * "table doesn't exist" must be a warning and a `false`, never a throw.
 *
 * Placeholder env is set by the --import preload in the test:unit script.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recordPendingRefund, resolvePendingRefund } from '../../app/lib/pending-refunds.js';
import { makeFakeSupabase, type FakeCtx } from './fixtures/fakes.js';

const INPUT = {
  paymentId: 'pay_1',
  userId: 'u1',
  reason: 'insufficient_wallet_funds',
};

describe('recordPendingRefund', () => {
  it('inserts the owed refund and reports success', async () => {
    const { client, calls } = makeFakeSupabase(() => ({ error: null }));
    const ok = await recordPendingRefund(client, INPUT);

    assert.equal(ok, true);
    const insert = calls.find((c) => c.table === 'pending_refunds' && c.op === 'insert');
    assert.ok(insert, 'expected an INSERT into pending_refunds');
    assert.deepEqual(insert!.payload, {
      payment_id: 'pay_1',
      user_id: 'u1',
      reason: 'insufficient_wallet_funds',
      amount_cents: null,
      currency: null,
    });
  });

  it('carries the amount through when a caller knows it', async () => {
    const { client, calls } = makeFakeSupabase(() => ({ error: null }));
    await recordPendingRefund(client, { ...INPUT, amountCents: 900, currency: 'USD' });

    const insert = calls.find((c) => c.op === 'insert');
    const payload = insert!.payload as { amount_cents?: number; currency?: string };
    assert.equal(payload.amount_cents, 900);
    assert.equal(payload.currency, 'USD');
  });

  it('treats a duplicate payment_id as already recorded, not a failure', async () => {
    // A customer retrying a failed cancellation must not stack duplicate
    // obligations — the UNIQUE constraint absorbs it and this still reports true.
    const { client } = makeFakeSupabase(() => ({ error: { code: '23505', message: 'duplicate key' } }));
    assert.equal(await recordPendingRefund(client, INPUT), true);
  });

  it('fails soft when the table is missing (migration 018 not applied yet)', async () => {
    for (const code of ['42P01', 'PGRST205']) {
      const { client } = makeFakeSupabase(() => ({ error: { code, message: 'no such table' } }));
      assert.equal(await recordPendingRefund(client, INPUT), false, `code ${code} should not throw`);
    }
  });

  it('fails soft on an unexpected DB error', async () => {
    const { client } = makeFakeSupabase(() => ({ error: { code: '08006', message: 'connection failure' } }));
    assert.equal(await recordPendingRefund(client, INPUT), false);
  });

  it('fails soft when the client itself throws', async () => {
    const throwing = {
      from() {
        throw new Error('network down');
      },
    } as never;
    assert.equal(await recordPendingRefund(throwing, INPUT), false);
  });
});

describe('resolvePendingRefund', () => {
  it('stamps resolved_at for that payment, only on the unresolved row', async () => {
    const { client, calls } = makeFakeSupabase(() => ({ error: null }));
    const ok = await resolvePendingRefund(client, 'pay_1');

    assert.equal(ok, true);
    const update = calls.find((c) => c.table === 'pending_refunds' && c.op === 'update');
    assert.ok(update, 'expected an UPDATE on pending_refunds');
    const payload = update!.payload as { resolved_at?: string };
    assert.ok(payload.resolved_at, 'expected resolved_at to be stamped');
    assert.ok(!Number.isNaN(Date.parse(payload.resolved_at!)), 'resolved_at should be an ISO timestamp');
    // Re-resolving an already-settled row would overwrite the original
    // settlement time, so the `is null` guard is part of the contract.
    assert.deepEqual(update!.filters, [
      ['eq', 'payment_id', 'pay_1'],
      ['is', 'resolved_at', null],
    ]);
  });

  it('fails soft when the table is missing', async () => {
    const { client } = makeFakeSupabase(() => ({ error: { code: '42P01', message: 'no such table' } }));
    assert.equal(await resolvePendingRefund(client, 'pay_1'), false);
  });

  it('fails soft when the client itself throws', async () => {
    const throwing = {
      from() {
        throw new Error('network down');
      },
    } as never;
    assert.equal(await resolvePendingRefund(throwing, 'pay_1'), false);
  });

  it('reports success when nothing matched — most refunds were never owed', async () => {
    const { client } = makeFakeSupabase((ctx: FakeCtx) =>
      ctx.table === 'pending_refunds' ? { error: null, data: [] } : { error: null },
    );
    assert.equal(await resolvePendingRefund(client, 'pay_never_owed'), true);
  });
});
