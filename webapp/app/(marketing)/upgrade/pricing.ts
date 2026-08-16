export interface ProductPrices {
    monthly: string;
    annual: string;
    lifetime: string;
    /**
     * ISO 4217 code for the amounts above, as reported by Dodo.
     *
     * Carried alongside the amounts because "$" on its own is ambiguous: a UK or
     * Australian visitor reading "$7.99" has no way to tell USD from AUD, and the
     * three markets ClipMark targets include both. Dodo returns this on every
     * product price; it used to be discarded in extractCentPrice().
     */
    currency: string;
}

export const PRICE_DEFAULTS: ProductPrices = {
    monthly: '7.99',
    annual: '59.99',
    lifetime: '99.99',
    currency: 'USD',
};

/**
 * A price with its currency made explicit — e.g. `$7.99 USD`.
 *
 * The symbol comes from Intl rather than a hardcoded "$", so if the Dodo product
 * is ever priced in another currency the glyph follows (£, A$ …) instead of
 * silently mislabelling the amount. The ISO code is appended regardless, because
 * the symbol alone does not disambiguate USD from AUD/CAD/NZD.
 *
 * Falls back to `<code> <amount>` if Intl rejects the code, so a bad currency
 * from the API degrades to something still unambiguous rather than throwing on a
 * pricing page.
 */
export function formatPrice(amount: string, currency: string): string {
    const symbol = formatAmount(amount, currency);
    return symbol.startsWith(currency) ? symbol : `${symbol} ${currency}`;
}

/**
 * Just the symbol-formatted amount — `$7.99`, no ISO code.
 *
 * The pricing cards render the amount at display size and the code beside it at
 * label size; concatenating them into one string made "USD" wrap onto its own
 * line at 48px on a phone.
 */
export function formatAmount(amount: string, currency: string): string {
    const value = Number(amount);
    if (!Number.isFinite(value)) return `${amount}`;

    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            // Amounts arrive pre-formatted ("7.99", "60"), so keep them as-is
            // rather than forcing 2dp onto a round number.
            minimumFractionDigits: amount.includes('.') ? 2 : 0,
            maximumFractionDigits: 2,
        }).format(value);
    } catch {
        return `${currency} ${amount}`;
    }
}
