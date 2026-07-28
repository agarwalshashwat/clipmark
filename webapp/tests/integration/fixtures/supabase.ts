/**
 * Supabase client factories for integration tests, bound to the local stack
 * started by `supabase start`. Reads connection details from env (set by the
 * CI job from `supabase status`, or exported locally). See docs/TEST_PLAN_launch.md.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    'Integration tests need NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY. ' +
      'Run `supabase start` and export them (see docs/TEST_PLAN_launch.md).',
  );
}

/** Anonymous client — exercises the `anon` Postgres role (unauthenticated). */
export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
}

/** Client carrying a user's JWT — exercises the `authenticated` role + RLS auth.uid(). */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Service-role client — bypasses RLS; used for setup/teardown and assertions. */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
