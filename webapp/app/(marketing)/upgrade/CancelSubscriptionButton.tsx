'use client';

import { useState, useTransition } from 'react';
import { cancelSubscription } from './actions';
import { useRouter } from 'next/navigation';

export default function CancelSubscriptionButton({ isRefundEligible }: { isRefundEligible: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
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
        router.refresh();
      } catch {
        // Genuinely unexpected (network drop, redacted crash) — the action
        // returns its known failures instead of throwing them.
        setError('Something went wrong. Please try again.');
        setConfirming(false);
      }
    });
  };

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
