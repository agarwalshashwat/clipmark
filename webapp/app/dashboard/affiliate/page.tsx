import { createServerSupabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import styles from '../page.module.css';
import AffiliateApplyForm from './AffiliateApplyForm';

export const metadata = { title: 'Affiliate Program — Clipmark' };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function StatusPill({ status }: { status: string }) {
  const colorMap: Record<string, { bg: string; color: string; label: string }> = {
    pending:   { bg: 'rgba(251,191,36,0.15)',  color: '#b45309', label: 'Pending'  },
    approved:  { bg: 'rgba(20,184,166,0.15)',  color: '#006b5f', label: 'Approved' },
    paid:      { bg: 'rgba(139,92,246,0.15)',  color: '#6d28d9', label: 'Paid'     },
    cancelled: { bg: 'rgba(239,68,68,0.12)',   color: '#b91c1c', label: 'Refunded' },
  };
  const c = colorMap[status] ?? colorMap.pending;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 9999, fontSize: 12, fontWeight: 600,
      background: c.bg, color: c.color,
    }}>
      {c.label}
    </span>
  );
}

export default async function AffiliatePage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_affiliate, affiliate_code, commission_rate, is_pro, created_at')
    .eq('id', user.id)
    .single();

  const isAffiliate = profile?.is_affiliate === true && !!profile?.affiliate_code;

  if (!isAffiliate) {
    const { data: existingApp } = await supabaseAdmin
      .from('affiliate_applications')
      .select('status, reviewer_note')
      .eq('user_id', user.id)
      .maybeSingle();

    const isPro           = profile?.is_pro === true;
    const thirtyDaysAgo   = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const accountOldEnough = profile?.created_at
      ? new Date(profile.created_at) <= thirtyDaysAgo
      : false;

    return (
      <div className={styles.pageWrap}>
        <div style={{ maxWidth: 580, margin: '0 auto', padding: '40px 0' }}>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1A1C1D', marginBottom: 8, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Affiliate Program
            </h1>
            <p style={{ fontSize: 15, color: '#545f6c', lineHeight: 1.6 }}>
              Earn <strong>30% revenue share</strong> on every Pro upgrade you drive.
              Share your unique link with your audience — YouTube, newsletters, social media, anywhere.
            </p>
          </div>

          <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>
            By applying, you agree to the{' '}
            <a href="/affiliate/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#14B8A6', textDecoration: 'none', fontWeight: 600 }}>Affiliate Terms &amp; Conditions</a>.
            Not sure yet?{' '}
            <a href="/affiliate" target="_blank" rel="noopener noreferrer" style={{ color: '#14B8A6', textDecoration: 'none' }}>Learn about the program →</a>
          </p>

          {existingApp?.status === 'rejected' ? (
            <div style={{
              padding: '24px', borderRadius: 14,
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
            }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#b91c1c', flexShrink: 0 }}>cancel</span>
                <div>
                  <p style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 4 }}>Application not approved</p>
                  {existingApp.reviewer_note && (
                    <p style={{ fontSize: 14, color: '#545f6c' }}>{existingApp.reviewer_note}</p>
                  )}
                </div>
              </div>
              <p style={{ fontSize: 13, color: '#6b7280' }}>
                Questions? Email <a href="mailto:hello@clipmark.mithahara.com" style={{ color: '#006b5f' }}>hello@clipmark.mithahara.com</a>
              </p>
            </div>
          ) : (
            <div style={{
              background: 'white', borderRadius: 16, border: '1px solid #e8e8e9',
              padding: '28px 32px',
            }}>
              <AffiliateApplyForm isPro={isPro} accountOldEnough={accountOldEnough} />
            </div>
          )}
        </div>
      </div>
    );
  }

  const affiliateCode    = profile.affiliate_code as string;
  const commissionRate   = Number(profile.commission_rate) || 0.30;
  const commissionPct    = Math.round(commissionRate * 100);
  const affiliateLink    = `${process.env.NEXT_PUBLIC_APP_URL}/r/${affiliateCode}`;

  // Fetch stats using service role (to bypass RLS simply via the same user)
  const [{ count: totalClicks }, { data: conversions }] = await Promise.all([
    supabaseAdmin
      .from('affiliate_clicks')
      .select('*', { count: 'exact', head: true })
      .eq('affiliate_code', affiliateCode),
    supabaseAdmin
      .from('affiliate_conversions')
      .select('*')
      .eq('affiliate_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  const conversionList = conversions ?? [];
  // Exclude cancelled (refunded) conversions from all earnings totals
  const earnableConversions = conversionList.filter((c: { status: string }) => c.status !== 'cancelled');
  const totalEarned  = earnableConversions.reduce((s: number, c: { commission_usd: number }) => s + Number(c.commission_usd), 0);
  const totalPaid    = earnableConversions.filter((c: { status: string }) => c.status === 'paid')
    .reduce((s: number, c: { commission_usd: number }) => s + Number(c.commission_usd), 0);
  const totalPending = earnableConversions.filter((c: { status: string }) => c.status === 'pending')
    .reduce((s: number, c: { commission_usd: number }) => s + Number(c.commission_usd), 0);

  const statCards = [
    { label: 'Total Clicks',      value: String(totalClicks ?? 0),            icon: 'ads_click' },
    { label: 'Conversions',        value: String(conversionList.length),        icon: 'trending_up' },
    { label: 'Pending Earnings',   value: `$${totalPending.toFixed(2)}`,        icon: 'schedule' },
    { label: 'All-Time Paid Out',  value: `$${totalPaid.toFixed(2)}`,           icon: 'payments' },
  ];

  return (
    <div className={styles.pageWrap}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1A1C1D', marginBottom: 6, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Affiliate Program
        </h1>
        <p style={{ fontSize: 15, color: '#545f6c' }}>
          You earn <strong>{commissionPct}% revenue share</strong> on every Pro upgrade via your link.
        </p>
      </div>

      {/* Affiliate link card */}
      <div style={{
        background: 'white', borderRadius: 16, border: '1px solid #e8e8e9',
        padding: '20px 24px', marginBottom: 28,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#14B8A6', flexShrink: 0 }}>link</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Your Affiliate Link
          </p>
          <p style={{
            fontSize: 15, color: '#1A1C1D', fontFamily: "'JetBrains Mono', monospace",
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {affiliateLink}
          </p>
        </div>
        {/* Copy button — client interaction handled by inline script for simplicity */}
        <button
          onClick={undefined}
          data-copy={affiliateLink}
          id="copy-affiliate-link"
          style={{
            padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(20,184,166,0.4)',
            background: 'rgba(20,184,166,0.08)', color: '#006b5f',
            fontWeight: 600, fontSize: 14, cursor: 'pointer', flexShrink: 0,
          }}
        >
          Copy Link
        </button>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16, marginBottom: 36,
      }}>
        {statCards.map((card) => (
          <div key={card.label} style={{
            background: 'white', borderRadius: 14, border: '1px solid #e8e8e9',
            padding: '20px 22px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#14B8A6' }}>{card.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</span>
            </div>
            <p style={{ fontSize: 28, fontWeight: 800, color: '#1A1C1D', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* All-time earned summary */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(20,184,166,0.08) 0%, rgba(139,92,246,0.08) 100%)',
        border: '1px solid rgba(20,184,166,0.2)', borderRadius: 14,
        padding: '16px 24px', marginBottom: 36,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#14B8A6' }}>account_balance_wallet</span>
        <span style={{ fontSize: 15, color: '#1A1C1D' }}>
          All-time earnings: <strong style={{ color: '#006b5f' }}>${totalEarned.toFixed(2)}</strong>
          <span style={{ color: '#9ca3af', marginLeft: 8, fontSize: 13 }}>
            ({commissionPct}% of each sale)
          </span>
        </span>
      </div>

      {/* Conversions table */}
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e8e8e9', overflow: 'hidden' }}>
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #e8e8e9',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1A1C1D', margin: 0 }}>Conversions</h2>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0', lineHeight: 1.5 }}>
              Updated in real-time from Dodo Payments. Each row has a Reference ID you can verify
              directly with <a href="https://dodopayments.com" target="_blank" rel="noopener noreferrer"
              style={{ color: '#14B8A6', textDecoration: 'none' }}>Dodo</a> or{' '}
              <a href="mailto:affiliates@clipmark.app" style={{ color: '#14B8A6', textDecoration: 'none' }}>our team</a> if you have a dispute.
            </p>
          </div>
          {conversionList.length > 0 && (
            <a
              href="/api/affiliate/export"
              download
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: '1px solid #e8e8e9', color: '#545f6c', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                background: '#f9f9fa',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
              Export CSV
            </a>
          )}
        </div>

        {conversionList.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
            No conversions yet. Share your affiliate link to start earning!
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f9f9fa' }}>
                  {['Date', 'Plan', 'Sale Amount', 'Your Commission', 'Status', 'Reference ID', 'Payout Date'].map((h) => (
                    <th key={h} style={{
                      padding: '10px 20px', textAlign: 'left', fontSize: 12,
                      fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conversionList.map((c: {
                  id: string;
                  created_at: string;
                  plan: string;
                  amount_usd: number;
                  commission_usd: number;
                  status: string;
                  dodo_payment_id: string | null;
                }) => {
                  // Affiliates earn after a 30-day refund hold
                  const payoutEligibleAt = new Date(new Date(c.created_at).getTime() + 30 * 86400000);
                  const payoutFormatted  = payoutEligibleAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  // Reference ID: prefer Dodo payment/subscription ID; fall back to conversion UUID
                  const refId     = c.dodo_payment_id ?? c.id;
                  const refShort  = refId.length > 18 ? refId.slice(0, 16) + '…' : refId;
                  const refLabel  = c.dodo_payment_id ? '' : 'CLK-';
                  return (
                    <tr key={c.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '14px 20px', color: '#545f6c', whiteSpace: 'nowrap' }}>
                        {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ textTransform: 'capitalize', fontWeight: 600, color: '#1A1C1D' }}>{c.plan}</span>
                      </td>
                      <td style={{ padding: '14px 20px', color: '#1A1C1D' }}>
                        ${Number(c.amount_usd).toFixed(2)}
                      </td>
                      <td style={{ padding: '14px 20px', fontWeight: 700, color: '#006b5f' }}>
                        ${Number(c.commission_usd).toFixed(2)}
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <StatusPill status={c.status} />
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span
                          title={refId}
                          data-copy-ref={refId}
                          className="copy-ref-id"
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 12, color: '#545f6c',
                            cursor: 'pointer', borderBottom: '1px dashed #d1d5db',
                          }}
                        >
                          {refLabel}{refShort}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', color: '#545f6c', whiteSpace: 'nowrap', fontSize: 13 }}>
                        {c.status === 'pending'
                          ? payoutFormatted
                          : c.status === 'cancelled'
                          ? <span style={{ color: '#b91c1c', fontSize: 12 }}>Refunded — reversed</span>
                          : '—'
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* T&C reference */}
      <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 32 }}>
        Your participation is governed by the{' '}
        <a href="/affiliate/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#14B8A6', textDecoration: 'none' }}>Affiliate Terms &amp; Conditions</a>.
        Questions? Email{' '}
        <a href="mailto:affiliates@clipmark.app" style={{ color: '#14B8A6', textDecoration: 'none' }}>affiliates@clipmark.app</a>.
      </p>

      {/* Copy-to-clipboard client script */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          var btn = document.getElementById('copy-affiliate-link');
          if (btn) {
            btn.addEventListener('click', function() {
              var link = btn.getAttribute('data-copy');
              if (navigator.clipboard) {
                navigator.clipboard.writeText(link).then(function() {
                  btn.textContent = 'Copied!';
                  setTimeout(function() { btn.textContent = 'Copy Link'; }, 2000);
                });
              }
            });
          }

          // Copy reference IDs on click
          document.querySelectorAll('.copy-ref-id').forEach(function(el) {
            el.addEventListener('click', function() {
              var refId = el.getAttribute('data-copy-ref');
              if (navigator.clipboard && refId) {
                navigator.clipboard.writeText(refId).then(function() {
                  var orig = el.textContent;
                  el.textContent = 'Copied!';
                  setTimeout(function() { el.textContent = orig; }, 1500);
                });
              }
            });
          });
        })();
      `}} />
    </div>
  );
}
