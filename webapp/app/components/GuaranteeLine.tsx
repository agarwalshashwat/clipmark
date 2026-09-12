/**
 * Risk-reversal line shown directly under checkout CTAs.
 *
 * The tax clause says tax is ADDED, not included. Dodo is configured
 * tax-exclusive: the sticker is USD and the buyer pays that plus their local
 * tax. An earlier revision of this file said "taxes included" — accurate under
 * the previous configuration, false under this one. If the pricing model changes
 * again, this line changes with it; do not let it drift back into a promise
 * about the final amount.
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
      {refundDays ? `${refundDays}-day money-back guarantee` : 'Money-back guarantee'} · prices in
      USD, local tax added at checkout where applicable · no hidden fees · cancel anytime —
      your clips stay yours.
    </p>
  );
}
