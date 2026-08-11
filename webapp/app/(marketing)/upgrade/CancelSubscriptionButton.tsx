'use client';

import { useState, useTransition } from 'react';
import { cancelSubscription } from './actions';
import { SUPPORT_EMAIL } from '@/app/lib/constants';
import { useRouter } from 'next/navigation';

export default function CancelSubscriptionButton({ isRefundEligible }: { isRefundEligible: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const router = useRouter();

  const label = isRefundEligible ? 'Cancel & Request Refund' : 'Cancel Subscription';

  const handleCancel = () => {
    startTransition(async () => {
      try {
        // Read the returned result rather than relying on a thrown message:
        // Next redacts Server Action errors in production, so anything thrown
        // reached this catch as a generic string with the real reason stripped.
        const result = await cancelSubscription();
        if (!result.ok) {
          setError(result.message);
          setConfirming(false);
          return;
        }
        if (result.refund === 'manual') {
          // Cancelled, but the customer is still owed money. Refreshing here
          // would swap this card for the free-plan view and the fact that a
          // refund is outstanding would vanish with it, so hold the notice on
          // screen instead and let them navigate away themselves.
          setNotice(
            `Your subscription is cancelled. Your refund has to be processed by hand, so it isn't instant — we've been alerted and will issue it shortly. If you haven't seen it within a few days, email ${SUPPORT_EMAIL} and quote this page.`,
          );
          setConfirming(false);
          return;
        }
        router.refresh();
      } catch {
        // Genuinely unexpected (network drop, redacted crash) — the action
        // returns its known failures instead of throwing them.
        setError('Something went wrong. Please try again.');
        setConfirming(false);
      }
    });
  };

  // Terminal state: cancelled, refund outstanding. Deliberately not dismissible
  // and rendered in place of the button — the user has money owed to them and
  // nothing else on the page says so.
  if (notice) {
    return (
      <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
        {notice}
      </p>
    );
  }

  if (confirming) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
          {isRefundEligible
            ? 'Are you sure? Your Pro access will be revoked immediately and a refund will be processed.'
            : 'Are you sure? Your Pro access will continue until the billing period ends, after which AI features and shared collections will be deactivated.'}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleCancel}
            disabled={isPending}
            style={{
              padding: '8px 20px', borderRadius: 8, border: '1px solid var(--danger)',
              background: 'transparent', color: 'var(--danger)', fontWeight: 600,
              fontSize: 13, cursor: isPending ? 'default' : 'pointer', opacity: isPending ? 0.6 : 1,
              fontFamily: 'inherit',
            }}
          >
            {isPending ? 'Processing…' : 'Yes, cancel'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={isPending}
            style={{
              padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(17, 24, 39,0.15)',
              background: 'transparent', color: 'var(--text-muted)', fontWeight: 600,
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Keep Pro
          </button>
        </div>
        {error && <p style={{ fontSize: 13, color: 'var(--danger)', margin: 0 }}>{error}</p>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      style={{
        padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(17, 24, 39,0.15)',
        background: 'transparent', color: 'var(--text-muted)', fontWeight: 600,
        fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}
