/**
 * Lazy, memoized client factories for API route handlers.
 *
 * Route handlers used to construct these at module scope from env, which made
 * them impossible to substitute in unit tests and eagerly threw when env was
 * absent (e.g. when a test imports a route). Centralizing them here behind lazy
 * getters lets handlers inject fakes via a `deps` object while production keeps
 * the exact same construction. See docs/TEST_PLAN_launch.md (enabler b).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import DodoPayments from 'dodopayments';

let _admin: SupabaseClient | null = null;

/** Service-role Supabase client (bypasses RLS). Memoized. */
export function getSupabaseAdmin(): SupabaseClient {
  return (_admin ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    // Stateless, for the reasons spelled out over the anon singleton in
    // lib/supabase.ts — a memoized server client must never hold or
    // background-refresh session state.
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  ));
}

/**
 * A fresh, stateless anon-key client — NOT memoized, unlike the rest of this
 * file. Every caller needs its own instance: auth-js de-duplicates concurrent
 * auth calls (refresh, verifyOtp, …) per client instance and takes no lock
 * off-browser, so two callers sharing one would race and could observe each
 * other's result. See lib/supabase.ts for why session state must also stay
 * off entirely — a memoized/shared instance holding a real session and
 * background-refreshing it caused exactly that race in production.
 */
export function createStatelessAuthClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}

let _dodo: DodoPayments | null = null;

/** Dodo Payments client configured for webhook verification + API calls. Memoized. */
export function getDodo(): DodoPayments {
  return (_dodo ??= new DodoPayments({
    bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
    webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_SECRET!,
    environment: process.env.NODE_ENV === 'production' ? 'live_mode' : 'test_mode',
  }));
}
