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

  const existingRef = _request.cookies.get('clipmark_ref')?.value;
  if (existingRef !== code) {
    await supabaseAdmin.from('affiliate_clicks').insert({ affiliate_code: code });
  }

  const response = NextResponse.redirect(new URL(`/?ref=${encodeURIComponent(code)}`, appUrl));
  response.cookies.set('clipmark_ref', code, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === 'production',
  });

  return response;
}
