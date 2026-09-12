export interface ProductPrices {
    monthly: string;
    annual: string;
    lifetime: string;
}

export const PRICE_DEFAULTS: ProductPrices = {
    monthly: '7.99',
    annual: '59.99',
    lifetime: '99.99',
};

/**
 * The one currency ClipMark sells in.
 *
 * Pricing is USD for every region — there is no per-region conversion, and none
 * should be added. Dodo is the Merchant of Record and is configured
 * tax-EXCLUSIVE: the customer is charged this USD amount wherever they are, and
 * their local tax is added on top at checkout. The listed number is therefore the
 * price, NOT the final total — see components/GuaranteeLine.tsx, which is the one
 * place that says so to the buyer.
 *
 * It is a constant rather than a value read back from the Dodo product because
 * threading a currency through the UI would imply the site can render prices in
 * other currencies, which it deliberately cannot. If the Dodo products are ever
 * repriced in another currency, change this one line — and the guarantee copy.
 */
export const PRICE_CURRENCY = 'USD';

/**
 * A price with its currency spelled out — `$7.99 USD`.
 *
 * The bare "$" was the actual defect: a UK or Australian visitor reading "$7.99"
 * has no way to tell USD from GBP/AUD, and both are markets ClipMark targets.
 */
export function formatPrice(amount: string): string {
    return `${formatAmount(amount)} ${PRICE_CURRENCY}`;
}

/**
 * Just the amount — `$7.99`, no currency code.
 *
 * The pricing cards render this at display size with the code beside it at label
 * size; concatenated into one string, "USD" wrapped onto its own line at 48px on
 * a phone.
 */
export function formatAmount(amount: string): string {
    return `$${amount}`;
}
