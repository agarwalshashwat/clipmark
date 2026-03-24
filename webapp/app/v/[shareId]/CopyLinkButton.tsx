'use client';

export function CopyLinkButton({ url }: { url: string }) {
  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById('copy-link-btn');
      if (btn) {
        btn.textContent = '✓ Copied!';
        setTimeout(() => { btn.textContent = '🔗 Copy link'; }, 2000);
      }
    });
  }

  return (
    <button
      id="copy-link-btn"
      onClick={handleCopy}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderRadius: 8,
        background: '#f9f9fa', border: '1px solid rgba(26,28,29,0.08)',
        color: '#1a1c1d', cursor: 'pointer',
        fontSize: 13, fontWeight: 600, width: '100%',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      🔗 Copy link
    </button>
  );
}
