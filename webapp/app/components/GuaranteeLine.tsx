/**
 * Risk-reversal line shown directly under checkout CTAs.
 *
 * SCAFFOLD: a money-back guarantee genuinely exists, but the exact window is
 * still undecided (Terms says 7 days, code treats 14 — decision D1). Until that
 * is resolved we ship a truthful, number-free line. When D1 lands, pass
 * `refundDays` and the specific figure appears — no other changes needed.
 */
export function GuaranteeLine({
  refundDays,
  style,
}: {
  refundDays?: number;
  style?: React.CSSProperties;
}) {
  return (
    <p
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        fontSize: 12,
        color: '#64748b',
        marginTop: 12,
        ...style,
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#14B8A6' }}>
        verified_user
      </span>
      {refundDays ? `${refundDays}-day money-back guarantee` : 'Money-back guarantee'} · cancel
      anytime — your clips stay yours.
    </p>
  );
}
