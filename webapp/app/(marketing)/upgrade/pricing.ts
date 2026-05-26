export interface ProductPrices {
    monthly: string;
    annual: string;
    lifetime: string;
}

export const PRICE_DEFAULTS: ProductPrices = {
    monthly: '1.99',
    annual: '19.99',
    lifetime: '39.99',
};