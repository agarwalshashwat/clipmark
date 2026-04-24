import { createServerSupabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import styles from '../page.module.css';

export const metadata = { title: 'Refer & Earn — Clipmark' };

const REWARD_MONTHS = 3;

export default async function ReferralPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch profile including referral fields (service role to ensure we get all columns)
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('referral_code, referral_months_credit, is_pro')
    .eq('id', user.id)
    .single();

  const referralCode   = (profile?.referral_code as string | null) ?? '';
  const creditMonths   = Number(profile?.referral_months_credit ?? 0);
  const isPro          = profile?.is_pro === true;
  const referralLink   = `${process.env.NEXT_PUBLIC_APP_URL}/ref/${referralCode}`;

  // Fetch referral history
  const { data: referrals } = await supabaseAdmin
    .from('referrals')
    .select('id, status, reward_months, reward_applied_at, created_at')
    .eq('referrer_id', user.id)
    .order('created_at', { ascending: false });

  const referralList    = referrals ?? [];
  const successfulCount = referralList.filter(r => r.status === 'rewarded').length;

  const STAT_CARDS = [
    { label: 'Friends Referred',   value: String(successfulCount),     icon: 'group_add'          },
    { label: 'Months Earned',      value: `${creditMonths} mo`,         icon: 'calendar_month'     },
    { label: 'Reward per Referral', value: `${REWARD_MONTHS} months`,   icon: 'redeem'             },
    { label: 'Attribution Window', value: '30 days',                    icon: 'timelapse'          },
  ];

  return (
    <div className={styles.pageWrap}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: 26, fontWeight: 800, color: '#1A1C1D', marginBottom: 6,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>
          Refer &amp; Earn
        </h1>
        <p style={{ fontSize: 15, color: '#545f6c', lineHeight: 1.6 }}>
          Invite a friend to Clipmark Pro. When they upgrade, you both win —
          you get <strong>{REWARD_MONTHS} free months</strong> of Pro added to your account.
          No limits on referrals.
        </p>
      </div>

      {/* ── Referral link card ── */}
      <div style={{
        background: 'white', borderRadius: 16, border: '1px solid #e8e8e9',
        padding: '20px 24px', marginBottom: 28,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#14B8A6', flexShrink: 0 }}>link</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Your Referral Link
          </p>
          <p style={{
            fontSize: 15, color: '#1A1C1D', fontFamily: "'JetBrains Mono', monospace",
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {referralLink}
          </p>
        </div>
        <button
          data-copy={referralLink}
          id="copy-referral-link"
          style={{
            padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(20,184,166,0.4)',
            background: 'rgba(20,184,166,0.08)', color: '#006b5f',
            fontWeight: 600, fontSize: 14, cursor: 'pointer', flexShrink: 0,
          }}
        >
          Copy Link
        </button>
      </div>

      {/* ── Stats ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16, marginBottom: 36,
      }}>
        {STAT_CARDS.map((card) => (
          <div key={card.label} style={{
            background: 'white', borderRadius: 14, border: '1px solid #e8e8e9',
            padding: '20px 22px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#14B8A6' }}>{card.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {card.label}
              </span>
            </div>
            <p style={{ fontSize: 28, fontWeight: 800, color: '#1A1C1D', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Credit balance / redemption ── */}
      {creditMonths > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(20,184,166,0.10) 0%, rgba(139,92,246,0.08) 100%)',
          border: '1px solid rgba(20,184,166,0.3)', borderRadius: 14,
          padding: '20px 24px', marginBottom: 36,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#14B8A6', flexShrink: 0 }}>
              redeem
            </span>
            <div>
              <p style={{
                fontWeight: 700, fontSize: 16, color: '#1A1C1D', marginBottom: 6,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>
                You have <span style={{ color: '#006b5f' }}>{creditMonths} free month{creditMonths !== 1 ? 's' : ''}</span> of Pro credit
              </p>
              {isPro ? (
                <p style={{ fontSize: 14, color: '#545f6c', lineHeight: 1.6 }}>
                  You&apos;re already on Pro. Email{' '}
                  <a href="mailto:hello@clipmark.mithahara.com" style={{ color: '#14B8A6', textDecoration: 'none', fontWeight: 600 }}>
                    hello@clipmark.mithahara.com
                  </a>{' '}
                  with the subject <strong>&quot;Referral credit — {user.email}&quot;</strong> and we&apos;ll
                  extend your subscription by {creditMonths} month{creditMonths !== 1 ? 's' : ''} manually.
                  We aim to apply credits within 24 hours.
                </p>
              ) : (
                <p style={{ fontSize: 14, color: '#545f6c', lineHeight: 1.6 }}>
                  Your credit is automatically applied when you upgrade.{' '}
                  <a href="/upgrade" style={{ color: '#14B8A6', textDecoration: 'none', fontWeight: 600 }}>
                    Upgrade to Pro →
                  </a>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── How it works ── */}
      <div style={{
        background: 'white', borderRadius: 16, border: '1px solid #e8e8e9',
        padding: '24px 28px', marginBottom: 36,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1A1C1D', marginBottom: 20 }}>How it works</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { n: '1', title: 'Share your link', body: 'Copy your unique link above and share it with a friend, in a group chat, or on social media.' },
            { n: '2', title: 'Friend upgrades', body: `When they click your link and upgrade to Clipmark Pro within 30 days, the referral is recorded automatically.` },
            { n: '3', title: `You get ${REWARD_MONTHS} months free`, body: `Your account is credited ${REWARD_MONTHS} free months of Pro — with no limits on how many friends you can refer.` },
          ].map((step) => (
            <div key={step.n} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(20,184,166,0.12)', color: '#006b5f',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>
                {step.n}
              </div>
              <div>
                <p style={{ fontWeight: 700, color: '#1A1C1D', marginBottom: 2, fontSize: 14 }}>{step.title}</p>
                <p style={{ fontSize: 14, color: '#545f6c', lineHeight: 1.6 }}>{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Referral history ── */}
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e8e8e9', overflow: 'hidden' }}>
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #e8e8e9',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1A1C1D', margin: 0 }}>Referral History</h2>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>
              Every row is recorded when your referred friend's payment is confirmed by Dodo Payments.
            </p>
          </div>
          {referralList.length > 0 && (
            <a
              href="/api/referrals/export"
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

        {referralList.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
            No referrals yet. Share your link to start earning free months!
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f9f9fa' }}>
                  {['Date', 'Status', 'Months Awarded', 'Applied At'].map((h) => (
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
                {referralList.map((r: {
                  id: string;
                  created_at: string;
                  status: string;
                  reward_months: number;
                  reward_applied_at: string | null;
                }) => {
                  const statusStyles: Record<string, { bg: string; color: string; label: string }> = {
                    rewarded:  { bg: 'rgba(20,184,166,0.15)',  color: '#006b5f', label: 'Rewarded'  },
                    pending:   { bg: 'rgba(251,191,36,0.15)',  color: '#b45309', label: 'Pending'   },
                    cancelled: { bg: 'rgba(239,68,68,0.12)',   color: '#b91c1c', label: 'Refunded'  },
                  };
                  const s = statusStyles[r.status] ?? statusStyles.pending;
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '14px 20px', color: '#545f6c', whiteSpace: 'nowrap' }}>
                        {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{
                          padding: '3px 10px', borderRadius: 9999, fontSize: 12, fontWeight: 600,
                          background: s.bg, color: s.color,
                        }}>
                          {s.label}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', fontWeight: 700, color: '#006b5f' }}>
                        +{r.reward_months} month{r.reward_months !== 1 ? 's' : ''}
                      </td>
                      <td style={{ padding: '14px 20px', color: '#545f6c', fontSize: 13 }}>
                        {r.reward_applied_at
                          ? new Date(r.reward_applied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Terms note ── */}
      <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 28 }}>
        Referral rewards are subject to Clipmark&apos;s{' '}
        <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#14B8A6', textDecoration: 'none' }}>Terms of Service</a>.
        Credits are non-transferable. Rewards are reversed if the referred user refunds within 30 days.
        Questions? Email{' '}
        <a href="mailto:hello@clipmark.mithahara.com" style={{ color: '#14B8A6', textDecoration: 'none' }}>hello@clipmark.mithahara.com</a>.
      </p>

      {/* Copy-to-clipboard script */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          var btn = document.getElementById('copy-referral-link');
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
