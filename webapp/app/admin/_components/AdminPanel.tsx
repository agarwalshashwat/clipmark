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
  commission_rate?: number | null;
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
    background: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: '12px 16px',
    color: '#1e293b',
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: "'Inter', sans-serif",
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  };

  const btn = (variant: 'primary' | 'danger' | 'ghost' = 'primary'): React.CSSProperties => ({
    padding: '12px 24px',
    borderRadius: 12,
    border: variant === 'ghost' ? '1px solid #e2e8f0' : 'none',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 14,
    background: variant === 'primary' ? 'linear-gradient(135deg, #14B8A6 0%, #006B5F 100%)' : variant === 'danger' ? '#ef4444' : 'white',
    color: variant === 'ghost' ? '#64748b' : '#fff',
    transition: 'all 0.2s ease',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  });

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '60px 24px' }}>
      <header style={{ marginBottom: 48, textAlign: 'center' }}>
        <span className="cm-section-label">System Operations</span>
        <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 40, fontWeight: 800, color: '#1a1c1d', letterSpacing: '-1.5px', marginBottom: 12 }}>
          Admin Panel
        </h1>
        <p style={{ color: '#64748b', fontSize: 16, fontWeight: 500 }}>
          Manage user permissions, gifted access, and affiliate partnerships.
        </p>
      </header>

      {/* ── Search ── */}
      <div className="cm-card" style={{ padding: '32px', marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div className="cm-icon-badge" style={{ background: 'rgba(20, 184, 166, 0.1)', color: '#14B8A6' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>person_search</span>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>User Management</h2>
        </div>
        
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            style={inputStyle}
            placeholder="Search by email address…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
          <button style={{ ...btn('primary'), whiteSpace: 'nowrap' }} onClick={search}>
            {loading ? 'Searching…' : 'Find User'}
          </button>
        </div>

        {users.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 32 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '2px solid #f1f5f9' }}>
                  <th style={{ padding: '16px 12px', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.05em' }}>User</th>
                  <th style={{ padding: '16px 12px', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.05em' }}>Status</th>
                  <th style={{ padding: '16px 12px', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.05em' }}>Affiliate</th>
                  <th style={{ padding: '16px 12px', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.05em' }}>Code</th>
                  <th style={{ padding: '16px 12px' }}></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '16px 12px', fontWeight: 600, color: '#1e293b' }}>{u.email}</td>
                    <td style={{ padding: '16px 12px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {u.is_pro && (
                          <span style={{ background: '#ecfdf5', color: '#10b981', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 800 }}>PRO</span>
                        )}
                        {u.is_gifted_pro && (
                          <span style={{ background: '#f5f3ff', color: '#8B5CF6', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 800 }}>GIFTED</span>
                        )}
                        {!u.is_pro && (
                          <span style={{ background: '#f8fafc', color: '#94a3b8', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 800 }}>FREE</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '16px 12px' }}>
                      {u.is_affiliate ? (
                        <span style={{ color: '#14B8A6', fontWeight: 700, fontSize: 13 }}>{Math.round((u.commission_rate ?? 0) * 100)}%</span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '16px 12px', fontFamily: 'monospace', color: '#64748b', fontWeight: 600 }}>{u.affiliate_code ?? '—'}</td>
                    <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                      <button style={{ ...btn('ghost'), padding: '8px 16px' }} onClick={() => { setSelected(u); setAffCode(u.affiliate_code ?? ''); }}>
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Selected user actions ── */}
      {selected && (
        <div className="cm-card" style={{ padding: '40px', border: '2px solid #14B8A6', boxShadow: '0 20px 40px rgba(20, 184, 166, 0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="cm-icon-badge" style={{ background: '#14B8A6', color: 'white' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>account_circle</span>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {selected.email}
              </h2>
            </div>
            <button style={{ ...btn('ghost'), padding: '6px' }} onClick={() => setSelected(null)}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            {/* ── Grant Pro ── */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span className="material-symbols-outlined" style={{ color: '#8B5CF6', fontSize: 20 }}>card_membership</span>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Gifted Access</h3>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Gift Note</label>
                  <input
                    style={inputStyle}
                    placeholder="e.g. Creator Collaboration Deal"
                    value={grantNote}
                    onChange={(e) => setGrantNote(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Expiry Date</label>
                  <input
                    style={inputStyle}
                    type="date"
                    value={grantExpiry}
                    onChange={(e) => setGrantExpiry(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button style={{ ...btn('primary'), flex: 1 }} onClick={handleGrantPro}>
                    Grant Pro
                  </button>
                  {selected.is_gifted_pro && (
                    <button style={{ ...btn('danger') }} onClick={handleRevokePro}>
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* ── Affiliate setup ── */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span className="material-symbols-outlined" style={{ color: '#14B8A6', fontSize: 20 }}>share_reviews</span>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Partnership Setup</h3>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Partner Code</label>
                  <input
                    style={inputStyle}
                    placeholder="e.g. mkbhd"
                    value={affCode}
                    onChange={(e) => setAffCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Comm. %</label>
                    <input
                      style={inputStyle}
                      type="number"
                      value={affRate}
                      onChange={(e) => setAffRate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Discount %</label>
                    <input
                      style={inputStyle}
                      type="number"
                      value={affDiscount}
                      onChange={(e) => setAffDiscount(e.target.value)}
                    />
                  </div>
                </div>
                <button style={{ ...btn('primary'), marginTop: 8 }} onClick={handleSetAffiliate}>
                  {selected.is_affiliate ? 'Update Partner' : 'Approve Partner'}
                </button>
              </div>
            </section>
          </div>

          {statusMsg && (
            <div style={{ 
              marginTop: 32, 
              padding: '12px 20px', 
              borderRadius: 12, 
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: statusMsg.startsWith('✓') ? '#ecfdf5' : '#fef2f2',
              color: statusMsg.startsWith('✓') ? '#059669' : '#dc2626',
              fontWeight: 700,
              fontSize: 14,
              border: statusMsg.startsWith('✓') ? '1px solid #10b98133' : '1px solid #ef444433'
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                {statusMsg.startsWith('✓') ? 'check_circle' : 'error'}
              </span>
              {statusMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
