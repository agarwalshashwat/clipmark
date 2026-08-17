import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { CONSENT_COOKIE, rawConsentAllows } from '@/app/lib/consent';
import { AFFILIATE_REF_COOKIE, attributionCookieOptions } from '@/app/lib/attribution';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * GET /r/[code] — affiliate link handler.
 *
 * ── Consent, and the timing problem it creates ───────────────────────────────
 * `clipmark_ref` is a marketing cookie: it credits an affiliate, it is not
 * needed to deliver anything the visitor asked for, and so under UK PECR reg. 6
 * it needs consent. But this route runs on the very first request of the very
 * first visit — before any banner has rendered, let alone been answered.
 *
 * The approach taken: set NOTHING until consent exists. No cookie, and no
 * "pending" placeholder either — a placeholder is still storage on the
 * visitor's device for a non-essential purpose, which is the thing consent is
 * supposed to authorise, so it would move the problem rather than solve it.
 *
 * The code instead rides the redirect in `?ref=`, where it already went for the
 * referrer display. The banner reads it from the URL, holds it in memory, and
 * POSTs it to /api/consent/attribution if the visitor accepts (see
 * components/ConsentProvider.tsx).
 *
 * The cost is real and worth stating: a visitor who arrives via an affiliate
 * link and leaves without answering the banner is not attributed. That is what
 * asking first costs.
 *
 * The click itself is still recorded on every first arrival regardless of the
 * answer. It is a row containing an affiliate code and a timestamp, written on
 * our server — nothing is stored on or read from the visitor's device, so PECR
 * does not reach it, and it carries no identifier for the visitor. Affiliates
 * therefore keep an accurate click count; what consent changes is whether a
 * later purchase can be traced back to it.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  const { data: affiliate } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('affiliate_code', code)
    .eq('is_affiliate', true)
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (!affiliate) {
    return NextResponse.redirect(new URL('/', appUrl));
  }

  // First-click attribution: only record the click and set the cookie if no
  // affiliate cookie already exists. This prevents later affiliate links from
  // stealing attribution that belongs to whoever drove the first click.
  const existingRef = request.cookies.get(AFFILIATE_REF_COOKIE)?.value;

  const response = NextResponse.redirect(new URL(`/?ref=${encodeURIComponent(code)}`, appUrl));

  if (!existingRef) {
    // No prior affiliate cookie — this is the first click, so record it.
    await supabaseAdmin.from('affiliate_clicks').insert({ affiliate_code: code });

    // …but only claim attribution if optional cookies have already been
    // accepted. Otherwise the code travels in `?ref=` and the banner claims it
    // on accept; a visitor who rejects, or never answers, gets no cookie at all.
    if (rawConsentAllows(request.cookies.get(CONSENT_COOKIE)?.value, 'attribution')) {
      response.cookies.set(AFFILIATE_REF_COOKIE, code, attributionCookieOptions());
    }
  }
  // If a cookie already exists (same or different affiliate), don't overwrite it.
  // The homepage `?ref` param is used only for the referrer display (which already
  // validates it matches the cookie before showing a name).

  return response;
}
