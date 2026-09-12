import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import { CONSENT_COOKIE, rawConsentAllows } from '@/app/lib/consent';
import {
  AFFILIATE_REF_COOKIE,
  USER_REF_COOKIE,
  attributionCookieOptions,
  isValidRefCodeShape,
} from '@/app/lib/attribution';

/**
 * The consent side of affiliate/referral attribution.
 *
 * `/r/<code>` and `/ref/<code>` run BEFORE the visitor has ever seen the banner,
 * so they cannot set a non-essential cookie — they redirect carrying the code in
 * the URL and set nothing. This endpoint is the other end of that: if the
 * visitor then accepts, the banner posts the code here and the cookie is set
 * with consent already on record.
 *
 *   POST   claim  — set the attribution cookie(s), consent permitting
 *   DELETE revoke — clear them, because they are httpOnly and the banner cannot
 *
 * Nothing here trusts the caller. The consent cookie is re-read server-side on
 * every claim (a POST from a page that never showed a banner is refused), the
 * code is re-validated against the database, and first-click attribution is
 * re-enforced — this endpoint must not become a way to overwrite an existing
 * referrer that /r/[code] would have protected.
 *
 * Handler core lives here with deps injected, matching
 * app/api/uninstall-feedback/handler.ts, so the refusal paths are unit-testable
 * without a database.
 */

export interface AttributionDeps {
  admin: Pick<SupabaseClient, 'from'>;
}

interface ClaimBody {
  affiliate?: unknown;
  user?: unknown;
}

export async function handleClaimAttribution(
  request: NextRequest,
  deps: AttributionDeps,
): Promise<NextResponse> {
  // 1. Consent, re-read from the request rather than taken on the client's word.
  if (!rawConsentAllows(request.cookies.get(CONSENT_COOKIE)?.value, 'attribution')) {
    return NextResponse.json(
      { error: 'attribution cookies require consent' },
      { status: 403 },
    );
  }

  let body: ClaimBody;
  try {
    body = (await request.json()) as ClaimBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  // Collected first and written once at the end: `claimed` has to be in the
  // JSON body, and copying Set-Cookie between two NextResponse objects is
  // exactly the kind of thing that works until a runtime flattens the header.
  const toSet: { name: string; value: string }[] = [];
  const claimed: string[] = [];

  // 2. Affiliate code — must resolve to an approved affiliate, exactly the check
  //    /r/[code] does. An unknown or unapproved code is silently ignored rather
  //    than 400'd: the visitor did nothing wrong and the banner has no useful
  //    way to report it.
  if (
    isValidRefCodeShape(body.affiliate) &&
    !request.cookies.get(AFFILIATE_REF_COOKIE)   // first-click attribution stands
  ) {
    const { data } = await deps.admin
      .from('profiles')
      .select('id')
      .eq('affiliate_code', body.affiliate)
      .eq('is_affiliate', true)
      .single();
    if (data) {
      toSet.push({ name: AFFILIATE_REF_COOKIE, value: body.affiliate });
      claimed.push('affiliate');
    }
  }

  // 3. User-to-user referral code — same shape, different column.
  if (
    isValidRefCodeShape(body.user) &&
    !request.cookies.get(USER_REF_COOKIE)
  ) {
    const { data } = await deps.admin
      .from('profiles')
      .select('id')
      .eq('referral_code', body.user)
      .single();
    if (data) {
      toSet.push({ name: USER_REF_COOKIE, value: body.user });
      claimed.push('user');
    }
  }

  const response = NextResponse.json({ ok: true, claimed });
  for (const { name, value } of toSet) {
    response.cookies.set(name, value, attributionCookieOptions());
  }
  return response;
}

/**
 * Clear both attribution cookies.
 *
 * No consent check, deliberately: withdrawing is always permitted, and a
 * rejection that failed because the record looked malformed would be the one
 * failure mode with actual legal weight. Deleting a cookie that was never set
 * is a no-op, so this is safe to call unconditionally on every reject.
 */
export function handleRevokeAttribution(): NextResponse {
  const response = NextResponse.json({ ok: true, cleared: true });
  for (const name of [AFFILIATE_REF_COOKIE, USER_REF_COOKIE]) {
    // Expire rather than just drop: the browser only forgets a cookie it is
    // told to forget, on the same path it was set with.
    response.cookies.set(name, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return response;
}
