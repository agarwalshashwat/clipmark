// Preloaded via `node --import` before the unit-test module graph loads, so that
// modules which construct a Supabase client at import time (e.g. @/lib/supabase)
// don't throw on missing env. Unit tests inject fakes for all real calls; these
// are placeholders only. (ESM hoists imports above in-file statements, so this
// must run as a preload, not from inside a test file.)
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.DODO_ANNUAL_PRODUCT_ID ??= 'prod_annual_123';
