/**
 * Social-proof badge (Chrome Web Store rating / install count).
 *
 * SCAFFOLD: intentionally renders NOTHING until real, verified numbers are
 * supplied (decision D6). This wires the slot so the values drop in trivially
 * later without shipping any fabricated figure. Pass `rating`, `reviewCount`,
 * and/or `userCount` once confirmed.
 */
export function SocialProof({
  rating,
  reviewCount,
  userCount,
  style,
}: {
  rating?: number;
  reviewCount?: number;
  userCount?: number;
  style?: React.CSSProperties;
}) {
  const parts: string[] = [];
  if (rating) parts.push(`★ ${rating}`);
  if (reviewCount) parts.push(`${reviewCount.toLocaleString()} reviews`);
  if (userCount) parts.push(`${userCount.toLocaleString()} users`);

  // No verified data yet → render nothing (never ship an unverified number).
  if (parts.length === 0) return null;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px',
        borderRadius: 9999,
        background: 'rgba(20,184,166,0.10)',
        color: 'var(--teal-600)',
        fontWeight: 700,
        fontSize: 13,
        border: '1px solid rgba(20,184,166,0.15)',
        ...style,
      }}
    >
      {parts.join(' · ')}
    </div>
  );
}
