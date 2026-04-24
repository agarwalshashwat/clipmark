import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(
  _request: NextRequest,
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
  const existingRef = _request.cookies.get('clipmark_ref')?.value;

  const response = NextResponse.redirect(new URL(`/?ref=${encodeURIComponent(code)}`, appUrl));

  if (!existingRef) {
    // No prior affiliate cookie — this is the first click, record it and claim attribution.
    await supabaseAdmin.from('affiliate_clicks').insert({ affiliate_code: code });
    response.cookies.set('clipmark_ref', code, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  // If a cookie already exists (same or different affiliate), don't overwrite it.
  // The homepage `?ref` param is used only for the referrer display (which already
  // validates it matches the cookie before showing a name).

  return response;
}
