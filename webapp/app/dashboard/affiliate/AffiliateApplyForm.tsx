'use client';

import { useState } from 'react';

interface Props {
  isPro: boolean;
  accountOldEnough: boolean;
}

export default function AffiliateApplyForm({ isPro, accountOldEnough }: Props) {
  const [channelUrl, setChannelUrl] = useState('');
  const [reason, setReason]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [done, setDone]             = useState(false);

  const eligible = isPro && accountOldEnough;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!eligible) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/affiliate/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_url: channelUrl, reason }),
      });
      const json = await res.json();

      if (!res.ok) {
        const messages: Record<string, string> = {
          NOT_PRO:          'You need an active Pro subscription to join.',
          ACCOUNT_TOO_NEW:  'Your account must be at least 30 days old.',
          ALREADY_APPLIED:  'You have already submitted an application.',
          ALREADY_AFFILIATE:'You are already an affiliate.',
        };
        setError(messages[json.error] ?? json.message ?? 'Something went wrong. Please try again.');
      } else {
        setDone(true);
        // Reload so the page switches to the affiliate dashboard view
        window.location.reload();
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#14B8A6', display: 'block', marginBottom: 16 }}>
          check_circle
        </span>
        <p style={{ fontSize: 18, fontWeight: 700, color: '#1A1C1D' }}>You&apos;re in! Refreshing your dashboard…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Eligibility indicators */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <EligibilityBadge met={isPro}            label="Pro subscriber" />
        <EligibilityBadge met={accountOldEnough} label="Account ≥ 30 days" />
      </div>

      {!eligible && (
        <div style={{
          padding: '14px 18px', borderRadius: 10,
          background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.35)',
          fontSize: 14, color: '#92400e',
        }}>
          {!isPro
            ? <>You need an active <a href="/upgrade" style={{ color: '#006b5f', fontWeight: 700 }}>Pro subscription</a> to apply.</>
            : 'Your account must be at least 30 days old before you can apply.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
          Your channel or website URL <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <input
          type="url"
          required
          value={channelUrl}
          onChange={(e) => setChannelUrl(e.target.value)}
          placeholder="https://youtube.com/@yourchannel"
          disabled={!eligible}
          style={{
            padding: '11px 14px', borderRadius: 10, border: '1px solid #d1d5db',
            fontSize: 14, color: '#1A1C1D', outline: 'none',
            background: eligible ? 'white' : '#f9fafb',
            opacity: eligible ? 1 : 0.6,
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
          Why do you want to join? <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <textarea
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Tell us about your audience and how you plan to promote Clipmark…"
          rows={4}
          disabled={!eligible}
          style={{
            padding: '11px 14px', borderRadius: 10, border: '1px solid #d1d5db',
            fontSize: 14, color: '#1A1C1D', resize: 'vertical', outline: 'none',
            background: eligible ? 'white' : '#f9fafb',
            opacity: eligible ? 1 : 0.6,
          }}
        />
      </div>

      {error && (
        <p style={{
          padding: '12px 16px', borderRadius: 10, fontSize: 14,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#b91c1c',
        }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!eligible || loading}
        style={{
          padding: '13px 28px', borderRadius: 12, border: 'none',
          background: eligible
            ? 'linear-gradient(135deg, #14B8A6 0%, #006B5F 100%)'
            : '#e5e7eb',
          color: eligible ? 'white' : '#9ca3af',
          fontWeight: 700, fontSize: 15, cursor: eligible ? 'pointer' : 'not-allowed',
          alignSelf: 'flex-start',
        }}
      >
        {loading ? 'Submitting…' : 'Apply Now'}
      </button>
    </form>
  );
}

function EligibilityBadge({ met, label }: { met: boolean; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 12px', borderRadius: 9999, fontSize: 13, fontWeight: 600,
      background: met ? 'rgba(20,184,166,0.1)' : 'rgba(156,163,175,0.15)',
      color: met ? '#006b5f' : '#6b7280',
      border: `1px solid ${met ? 'rgba(20,184,166,0.3)' : 'rgba(156,163,175,0.3)'}`,
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
        {met ? 'check_circle' : 'cancel'}
      </span>
      {label}
    </span>
  );
}
