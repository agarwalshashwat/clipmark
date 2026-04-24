'use client';

import { useState, useCallback } from 'react';

type UserResult = {
  id: string;
  email?: string;
  created_at?: string;
  username?: string;
  is_pro?: boolean;
  is_gifted_pro?: boolean;
  gifted_pro_expires_at?: string | null;
  gifted_by_note?: string | null;
  is_affiliate?: boolean;
  affiliate_code?: string | null;
  affiliate_commission_rate?: number | null;
};

export default function AdminPanel() {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<UserResult | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Grant pro form state
  const [grantNote, setGrantNote] = useState('');
  const [grantExpiry, setGrantExpiry] = useState('');

  // Affiliate form state
  const [affCode, setAffCode] = useState('');
  const [affRate, setAffRate] = useState('50');
  const [affDiscount, setAffDiscount] = useState('20');

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      setUsers(json.users ?? []);
    } finally {
      setLoading(false);
    }
  }, [query]);

  async function post(url: string, body: object) {
    setStatusMsg(null);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.ok) {
      setStatusMsg('✓ Done');
      // Refresh user list
      search();
      setSelected(null);
    } else {
      setStatusMsg(`✗ ${json.error ?? 'Unknown error'}`);
    }
  }

  async function handleGrantPro() {
    if (!selected) return;
    await post('/api/admin/grant-pro', {
      userId: selected.id,
      note: grantNote,
      expiresAt: grantExpiry || null,
    });
  }

  async function handleRevokePro() {
    if (!selected) return;
    if (!confirm(`Revoke gifted Pro for ${selected.email}?`)) return;
    await post('/api/admin/revoke-pro', { userId: selected.id });
  }

  async function handleSetAffiliate() {
    if (!selected) return;
    await post('/api/admin/set-affiliate', {
      userId: selected.id,
      affiliateCode: affCode || undefined,
      commissionRate: Number(affRate),
      discountPct: Number(affDiscount),
      approve: true,
    });
  }

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '20px 24px',
    marginBottom: 24,
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 12px',
    color: 'var(--text-primary)',
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
  };

  const btn = (variant: 'primary' | 'danger' | 'ghost' = 'primary'): React.CSSProperties => ({
    padding: '8px 16px',
    borderRadius: 8,
    border: variant === 'ghost' ? '1px solid var(--border)' : 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    background: variant === 'primary' ? 'var(--accent)' : variant === 'danger' ? '#ef4444' : 'var(--surface)',
    color: variant === 'ghost' ? 'var(--text-primary)' : '#fff',
  });

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 16px' }}>
      <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 28, marginBottom: 8 }}>
        Admin Panel
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
        Grant Pro access, manage affiliate partners, and configure creator deals.
      </p>

      {/* ── Search ── */}
      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Find a user</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={inputStyle}
            placeholder="Search by email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
          <button style={{ ...btn('primary'), whiteSpace: 'nowrap' }} onClick={search}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>

        {users.length > 0 && (
          <table style={{ width: '100%', marginTop: 16, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '6px 8px' }}>Email</th>
                <th style={{ padding: '6px 8px' }}>Pro</th>
                <th style={{ padding: '6px 8px' }}>Gifted</th>
                <th style={{ padding: '6px 8px' }}>Affiliate</th>
                <th style={{ padding: '6px 8px' }}>Code</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 8px' }}>{u.email}</td>
                  <td style={{ padding: '8px 8px' }}>{u.is_pro ? '✓' : '—'}</td>
                  <td style={{ padding: '8px 8px' }}>{u.is_gifted_pro ? '🎁' : '—'}</td>
                  <td style={{ padding: '8px 8px' }}>{u.is_affiliate ? '✓' : '—'}</td>
                  <td style={{ padding: '8px 8px', fontFamily: 'monospace' }}>{u.affiliate_code ?? '—'}</td>
                  <td style={{ padding: '8px 8px' }}>
                    <button style={btn('ghost')} onClick={() => { setSelected(u); setAffCode(u.affiliate_code ?? ''); }}>
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Selected user actions ── */}
      {selected && (
        <div style={{ ...card, borderColor: 'var(--accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>
              Managing: <span style={{ color: 'var(--accent)' }}>{selected.email}</span>
            </h2>
            <button style={btn('ghost')} onClick={() => setSelected(null)}>✕ Close</button>
          </div>

          {/* Current status */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {selected.is_pro && (
              <span style={{ background: '#22c55e22', color: '#22c55e', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                PRO
              </span>
            )}
            {selected.is_gifted_pro && (
              <span style={{ background: '#8b5cf622', color: '#8b5cf6', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                GIFTED
              </span>
            )}
            {selected.is_affiliate && (
              <span style={{ background: '#14b8a622', color: '#14b8a6', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                AFFILIATE {selected.affiliate_commission_rate ?? 30}%
              </span>
            )}
            {selected.gifted_by_note && (
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                Note: {selected.gifted_by_note}
              </span>
            )}
          </div>

          {/* ── Grant Pro ── */}
          <section style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🎁 Grant Gifted Pro</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              <input
                style={inputStyle}
                placeholder="Internal note — e.g. 'Ali Abdaal collab Q2 2026'"
                value={grantNote}
                onChange={(e) => setGrantNote(e.target.value)}
              />
              <input
                style={inputStyle}
                type="date"
                placeholder="Expiry date (leave blank = permanent)"
                value={grantExpiry}
                onChange={(e) => setGrantExpiry(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btn('primary')} onClick={handleGrantPro}>
                  Grant Pro
                </button>
                {selected.is_gifted_pro && (
                  <button style={btn('danger')} onClick={handleRevokePro}>
                    Revoke Gifted Pro
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* ── Affiliate setup ── */}
          <section>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🔗 Affiliate / Partner Setup</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              <input
                style={inputStyle}
                placeholder="Vanity code — e.g. mkbhd (→ clipmark.mithahara.com/r/mkbhd)"
                value={affCode}
                onChange={(e) => setAffCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    Commission % (e.g. 50 for big creators)
                  </label>
                  <input
                    style={inputStyle}
                    type="number"
                    min={0}
                    max={100}
                    value={affRate}
                    onChange={(e) => setAffRate(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    Referral discount % for their audience
                  </label>
                  <input
                    style={inputStyle}
                    type="number"
                    min={0}
                    max={100}
                    value={affDiscount}
                    onChange={(e) => setAffDiscount(e.target.value)}
                  />
                </div>
              </div>
              <button style={btn('primary')} onClick={handleSetAffiliate}>
                {selected.is_affiliate ? 'Update Affiliate Deal' : 'Approve as Affiliate + Set Deal'}
              </button>
            </div>
          </section>

          {statusMsg && (
            <p style={{ marginTop: 16, color: statusMsg.startsWith('✓') ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
              {statusMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
