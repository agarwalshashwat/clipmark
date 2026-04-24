import DodoPayments from 'dodopayments';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const dodo = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  environment: process.env.NODE_ENV === 'production' ? 'live_mode' : 'test_mode',
});

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { channel_url?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const channelUrl = (body.channel_url ?? '').trim();
  const reason     = (body.reason ?? '').trim();

  if (!channelUrl || !reason) {
    return NextResponse.json({ error: 'channel_url and reason are required' }, { status: 400 });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, username, is_pro, is_affiliate, affiliate_code, created_at')
    .eq('id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  if (profile.is_affiliate && profile.affiliate_code) {
    return NextResponse.json({ error: 'ALREADY_AFFILIATE' }, { status: 409 });
  }

  if (!profile.is_pro) {
    return NextResponse.json({
      error: 'NOT_PRO',
      message: 'A Pro subscription is required to join the affiliate program.',
    }, { status: 403 });
  }

  const createdAt     = new Date(profile.created_at);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (createdAt > thirtyDaysAgo) {
    return NextResponse.json({
      error: 'ACCOUNT_TOO_NEW',
      message: 'Your account must be at least 30 days old to apply.',
    }, { status: 403 });
  }

  const { data: existingApp } = await supabaseAdmin
    .from('affiliate_applications')
    .select('id, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingApp) {
    return NextResponse.json({ error: 'ALREADY_APPLIED', status: existingApp.status }, { status: 409 });
  }

  // Generate unique affiliate code from username, handle collisions
  let affiliateCode = profile.username as string;
  let suffix = 2;
  for (;;) {
    const { data: collision } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('affiliate_code', affiliateCode)
      .maybeSingle();
    if (!collision) break;
    affiliateCode = `${profile.username}_${suffix++}`;
  }

  await supabaseAdmin.from('affiliate_applications').insert({
    user_id:     user.id,
    channel_url: channelUrl,
    reason,
    status:      'approved',
    reviewed_at: new Date().toISOString(),
  });

  // Create a Dodo discount code for this affiliate (10% = 1000 basis points).
  // The code is stored so it can be applied automatically at checkout for referred users.
  let dodoDiscountCode: string | null = null;
  try {
    const discount = await dodo.discounts.create({
      type: 'percentage',
      amount: 1000, // 1000 basis points = 10%
      name: `Clipmark Affiliate — ${profile.username}`,
      usage_limit: null,  // unlimited
      expires_at:  null,  // never expires
    });
    dodoDiscountCode = discount.code;
  } catch (err) {
    // Non-fatal: affiliate is still approved even if discount creation fails.
    console.error('[affiliate/apply] Failed to create Dodo discount code:', err);
  }

  await supabaseAdmin.from('profiles').update({
    is_affiliate:          true,
    affiliate_code:        affiliateCode,
    commission_rate:       0.30,
    affiliate_discount_pct: 10,
    dodo_discount_code:    dodoDiscountCode,
  }).eq('id', user.id);

  return NextResponse.json({ success: true, affiliate_code: affiliateCode });
}
