/**
 * Embed-specific 404.
 *
 * Next resolves notFound() to the nearest not-found.tsx, so without this file a
 * deleted collection rendered the full-height marketing 404 inside whatever
 * iframe an embedder had put us in — complete with nav links that would have
 * navigated *their* iframe to our pricing page. This is the quiet version: it
 * states what happened, fits a short frame, and doesn't try to steer.
 */
export default function EmbedNotFound() {
  return (
    <div
      style={{
        // 100vh inside an iframe is the iframe's own height, so this centres in
        // whatever box the embedder gave us instead of in a collapsed parent.
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        textAlign: 'center',
        color: 'var(--text-sub)',
        fontFamily: 'var(--font)',
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      <div>
        <span
          className="material-symbols-outlined"
          aria-hidden="true"
          style={{ fontSize: 24, color: 'var(--text-faint)', display: 'block', marginBottom: 8 }}
        >
          link_off
        </span>
        This ClipMark collection is no longer available.
      </div>
    </div>
  );
}
