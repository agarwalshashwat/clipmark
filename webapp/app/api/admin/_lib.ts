/**
 * Admin helper — re-used by every admin API route.
 * Verifies the calling user is in ADMIN_USER_IDS.
 */
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Returns the authed user if they are an admin, otherwise returns a 401/403 Response. */
export async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const supabase = await createServerSupabase();
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
