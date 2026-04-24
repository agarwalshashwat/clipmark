import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * GET /ref/[code]
 *
 * User-to-user referral link handler — distinct from /r/[code] (affiliate program).
 * Records the click, sets a `clipmark_user_ref` cookie (30-day first-click attribution),
 * then redirects to the upgrade page so the intent is clear.
 *
 * Fraud guards:
 * - Validates the code belongs to a real user.
 * - First-click attribution: cookie is never overwritten once set.
 * - Logged-in users who click their own link will be blocked at the webhook level.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  const { data: referrer } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('referral_code', code)
    .single();

  if (!referrer) {
    // Unknown code — redirect to homepage silently
    return NextResponse.redirect(new URL('/', appUrl));
  }

  const existingRef = request.cookies.get('clipmark_user_ref')?.value;

  // Redirect to upgrade page to maximise conversion
  const response = NextResponse.redirect(new URL('/upgrade', appUrl));

  if (!existingRef) {
    // First click — claim attribution
    response.cookies.set('clipmark_user_ref', code, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,   // 30-day window
      secure: process.env.NODE_ENV === 'production',
    });
  }

  return response;
}
