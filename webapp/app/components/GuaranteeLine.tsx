/**
 * Risk-reversal line shown directly under checkout CTAs.
 *
 * "taxes included" is accurate and should NOT be weakened: Dodo is the Merchant
 * of Record, the customer is charged the listed USD amount in every region, and
 * Dodo remits local tax out of that amount rather than adding it at checkout
 * (owner-verified, audit #140 M2). The "listed USD price" wording is there
 * because the same sentence is the only place the two facts meet — the price is
 * USD everywhere, and it is the whole price.
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
        color: 'var(--text-muted)',
        marginTop: 12,
        ...style,
      }}
    >
      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 15, color: 'var(--brand-ink)' }}>
        verified_user
      </span>
      {refundDays ? `${refundDays}-day money-back guarantee` : 'Money-back guarantee'} · taxes
      included — you pay the listed USD price · no hidden fees · cancel anytime — your
      clips stay yours.
    </p>
  );
}
