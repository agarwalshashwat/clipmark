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