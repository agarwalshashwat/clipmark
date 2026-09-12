import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

// Deliberately NOT the shared `supabase` singleton from lib/supabase: auth-js
// de-duplicates concurrent refreshes per client instance (GoTrueClient's
// `refreshingDeferred`) and installs no lock off-browser, so two requests
// overlapping on one warm instance would collapse into a single upstream call
// and hand the second caller the FIRST caller's session — another account's
// tokens. Vercel Fluid serves concurrent invocations from one instance, and
// production logs show these arriving milliseconds apart. A per-request client
// has its own dedupe state, so each refresh is answered on its own merits.
function refreshClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}

// POST /api/refresh
// Body: { refresh_token: string }
// Returns: { access_token, refresh_token, expires_at }
export async function POST(request: NextRequest) {
  try {
    const { refresh_token } = await request.json() as { refresh_token: string };
    if (!refresh_token) {
      return NextResponse.json({ error: 'refresh_token is required' }, { status: 400 });
    }

    const { data, error } = await refreshClient().auth.refreshSession({ refresh_token });
    if (error || !data.session) {
      return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
    }

    return NextResponse.json({
      access_token:  data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at:    data.session.expires_at,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
