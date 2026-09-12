/**
 * The pending-refunds ledger: refunds we owe a customer but could not pay
 * automatically (see migrations/018_pending_refunds.sql).
 *
 * Both functions take the service-role client as an argument rather than
 * reaching for it themselves, so they can be unit-tested against the fake in
 * tests/unit/fixtures/fakes.ts without any DB.
 *
 * FAIL-SOFT BY CONTRACT — neither function ever throws or rejects. Both are
 * bookkeeping that runs alongside something more important: recording an owed
 * refund happens right after the cancellation the customer asked for, and
 * resolving one happens inside a webhook whose job is revoking entitlement. A
 * ledger write must never be the reason a cancellation reports failure or a
 * webhook returns 500 and gets redelivered. This also makes the code safe to
 * deploy BEFORE migration 018 is applied: the table simply isn't there yet,
 * the write is skipped with a warning, and the Sentry alert remains the
 * backstop it is today.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const TABLE = 'pending_refunds';

/**
 * Postgres/PostgREST codes that are expected rather than exceptional:
 *  - 42P01 / PGRST205: the table doesn't exist (migration 018 not applied yet).
 *    PostgREST answers from its schema cache, hence the second code.
 *  - 23505: unique violation on payment_id — the obligation is already
 *    recorded, which is success, not failure. A customer retrying a failed
 *    cancellation must not stack duplicate rows.
 */
const TABLE_MISSING = new Set(['42P01', 'PGRST205']);
const ALREADY_RECORDED = '23505';

const log = {
  warn: (msg: string, meta?: unknown) => console.warn(`[pending-refunds] ${msg}`, meta ?? ''),
  info: (msg: string) => console.info(`[pending-refunds] ${msg}`),
};

export interface PendingRefundInput {
  /** Dodo's opaque payment id. The handle used to issue the refund by hand. */
  paymentId: string;
  /** Who is owed. Nullable in the schema, but every caller today knows it. */
  userId: string | null;
  /** Machine-ish reason, e.g. 'insufficient_wallet_funds'. */
  reason: string;
  /** Optional — the cancellation path doesn't know the amount. See migration. */
  amountCents?: number | null;
  currency?: string | null;
}

/**
 * Record that `paymentId` is owed a refund. Returns true if the ledger now
 * holds the obligation (freshly inserted or already present), false if it
 * could not be written — in which case the caller's Sentry alert is the only
 * remaining trace, exactly as it was before this table existed.
 */
export async function recordPendingRefund(
  admin: SupabaseClient,
  input: PendingRefundInput,
): Promise<boolean> {
  try {
    const { error } = await admin.from(TABLE).insert({
      payment_id: input.paymentId,
      user_id: input.userId,
      reason: input.reason,
      amount_cents: input.amountCents ?? null,
      currency: input.currency ?? null,
    });

    if (!error) {
      log.info(`recorded owed refund payment=${input.paymentId} reason=${input.reason}`);
      return true;
    }
    if (error.code === ALREADY_RECORDED) {
      log.info(`owed refund already recorded payment=${input.paymentId}`);
      return true;
    }
    if (TABLE_MISSING.has(String(error.code))) {
      log.warn(`table missing — migration 018 not applied? payment=${input.paymentId}`, error.message);
      return false;
    }
    log.warn(`insert failed payment=${input.paymentId}`, error.message);
    return false;
  } catch (err) {
    // Network/client-level failure. Swallowed on purpose — see the file header.
    log.warn(`insert threw payment=${input.paymentId}`, (err as Error)?.message);
    return false;
  }
}

/**
 * Mark the obligation for `paymentId` settled, because a refund for it landed.
 * A no-op when no row matches, which is the common case: most refunds are paid
 * by Dodo on the first try and were never owed manually.
 *
 * Returns true when the update executed cleanly (whether or not it matched a
 * row), false when it could not run at all.
 */
export async function resolvePendingRefund(
  admin: SupabaseClient,
  paymentId: string,
): Promise<boolean> {
  try {
    const { error } = await admin
      .from(TABLE)
      .update({ resolved_at: new Date().toISOString() })
      .eq('payment_id', paymentId)
      .is('resolved_at', null);

    if (!error) return true;
    if (TABLE_MISSING.has(String(error.code))) {
      log.warn(`table missing — migration 018 not applied? payment=${paymentId}`, error.message);
      return false;
    }
    log.warn(`resolve failed payment=${paymentId}`, error.message);
    return false;
  } catch (err) {
    log.warn(`resolve threw payment=${paymentId}`, (err as Error)?.message);
    return false;
  }
}
