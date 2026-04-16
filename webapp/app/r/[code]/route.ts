import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Service role bypasses RLS for click inserts
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  // Validate affiliate code exists and is active
  const { data: affiliate } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('affiliate_code', code)
    .eq('is_affiliate', true)
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (!affiliate) {
    // Unknown code — redirect silently to home, no cookie set
    return NextResponse.redirect(new URL('/', appUrl));
  }

  // Record the click (no PII — just the code and timestamp)
  await supabaseAdmin.from('affiliate_clicks').insert({ affiliate_code: code });

  // Set a 30-day HttpOnly cookie so checkout can attribute the conversion
  const response = NextResponse.redirect(new URL(`/?ref=${encodeURIComponent(code)}`, appUrl));
  response.cookies.set('clipmark_ref', code, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    secure: process.env.NODE_ENV === 'production',
  });

  return response;
}
