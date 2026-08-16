import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { CONSENT_COOKIE, rawConsentAllows } from '@/app/lib/consent';
import { USER_REF_COOKIE, attributionCookieOptions } from '@/app/lib/attribution';

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
 *
 * Consent: `clipmark_user_ref` is the same class of non-essential marketing
 * cookie as `clipmark_ref`, and gets the same treatment — nothing is stored
 * until the visitor has accepted optional cookies. The code rides the redirect
 * in `?uref=` so the banner can claim it on accept. The reasoning is written out
 * once, in app/r/[code]/route.ts.
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

  const existingRef = request.cookies.get(USER_REF_COOKIE)?.value;

  // Redirect to upgrade page to maximise conversion. `?uref` carries the code
  // for the consent banner to claim; it is read by ConsentProvider and by
  // nothing else, and the upgrade page ignores it.
  const response = NextResponse.redirect(
    new URL(`/upgrade?uref=${encodeURIComponent(code)}`, appUrl),
  );

  if (!existingRef && rawConsentAllows(request.cookies.get(CONSENT_COOKIE)?.value, 'attribution')) {
    // First click, and optional cookies already accepted — claim attribution.
    response.cookies.set(USER_REF_COOKIE, code, attributionCookieOptions());
  }

  return response;
}
