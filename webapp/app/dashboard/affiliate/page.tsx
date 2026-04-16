import { createServerSupabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import styles from '../page.module.css';

export const metadata = { title: 'Affiliate Program — Clipmark' };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function StatusPill({ status }: { status: string }) {
  const colorMap: Record<string, { bg: string; color: string }> = {
    pending:  { bg: 'rgba(251,191,36,0.15)',  color: '#b45309' },
    approved: { bg: 'rgba(20,184,166,0.15)',  color: '#006b5f' },
    paid:     { bg: 'rgba(139,92,246,0.15)',  color: '#6d28d9' },
  };
  const c = colorMap[status] ?? colorMap.pending;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 9999, fontSize: 12, fontWeight: 600,
      background: c.bg, color: c.color, textTransform: 'capitalize',
    }}>
      {status}
    </span>
  );
}

export default async function AffiliatePage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_affiliate, affiliate_code, commission_rate')
    .eq('id', user.id)
    .single();

  const isAffiliate = profile?.is_affiliate === true && !!profile?.affiliate_code;

  // ── Not in the program ───────────────────────────────────────────────────
  if (!isAffiliate) {
    return (
      <div className={styles.pageWrap}>
        <div style={{ maxWidth: 540, margin: '80px auto', textAlign: 'center', padding: '0 24px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#14B8A6', marginBottom: 16, display: 'block' }}>
            campaign
          </span>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1A1C1D', marginBottom: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Affiliate Program
          </h1>
          <p style={{ fontSize: 16, color: '#545f6c', lineHeight: 1.7, marginBottom: 32 }}>
            You&apos;re not currently part of the Clipmark Affiliate Program.
            If you&apos;re a content creator or educator with an audience, we&apos;d love to work with you.
            Earn a <strong>30% revenue share</strong> on every Pro upgrade you drive.
          </p>
          <a
            href="mailto:hello@clipmark.mithahara.com?subject=Affiliate%20Program%20Application"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 32px', borderRadius: 12,
              background: 'linear-gradient(135deg, #14B8A6 0%, #006B5F 100%)',
              color: 'white', fontWeight: 700, fontSize: 15, textDecoration: 'none',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>mail</span>
            Apply to Join
          </a>
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
  const totalEarned  = conversionList.reduce((s: number, c: { commission_usd: number }) => s + Number(c.commission_usd), 0);
  const totalPaid    = conversionList.filter((c: { status: string }) => c.status === 'paid')
    .reduce((s: number, c: { commission_usd: number }) => s + Number(c.commission_usd), 0);
  const totalPending = conversionList.filter((c: { status: string }) => c.status === 'pending')
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
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e8e8e9' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1A1C1D', margin: 0 }}>Conversions</h2>
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
                  {['Date', 'Plan', 'Sale Amount', 'Your Commission', 'Status'].map((h) => (
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
                }) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Copy-to-clipboard client script */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          var btn = document.getElementById('copy-affiliate-link');
          if (!btn) return;
          btn.addEventListener('click', function() {
            var link = btn.getAttribute('data-copy');
            if (navigator.clipboard) {
              navigator.clipboard.writeText(link).then(function() {
                btn.textContent = 'Copied!';
                setTimeout(function() { btn.textContent = 'Copy Link'; }, 2000);
              });
            }
          });
        })();
      `}} />
    </div>
  );
}
