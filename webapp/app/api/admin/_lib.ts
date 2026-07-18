/**
 * Admin helper — re-used by every admin API route.
 * Verifies the calling user is in ADMIN_USER_IDS.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/clients';
import { NextResponse } from 'next/server';

// Re-exported so admin routes keep a single import site; lazy so that importing
// an admin route in a unit test does not eagerly construct a real client.
export { getSupabaseAdmin };

/**
 * Returns the authed user if they are an admin, otherwise a 401/403 Response.
 * `getServerClient` is injectable so the check can be unit-tested with a fake
 * auth client; production defaults to the cookie-session server client.
 */
export async function requireAdmin(
  getServerClient: () => Promise<Pick<SupabaseClient, 'auth'>> = createServerSupabase,
): Promise<{ userId: string } | NextResponse> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminIds = (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (!adminIds.includes(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { userId: user.id };
}
