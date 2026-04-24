import { createServerSupabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * GET /api/affiliate/export
 *
 * Returns the authenticated affiliate's full conversion history as a CSV file.
 * Each row includes the Dodo payment/subscription reference ID so the affiliate
 * can independently verify every conversion with Dodo Payments support.
 */
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify the user is actually an affiliate
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_affiliate, affiliate_code, commission_rate')
    .eq('id', user.id)
    .single();

  if (!profile?.is_affiliate || !profile?.affiliate_code) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const { data: conversions, error } = await supabaseAdmin
    .from('affiliate_conversions')
    .select('id, created_at, plan, amount_usd, commission_usd, commission_rate, status, dodo_payment_id')
    .eq('affiliate_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  const rows = conversions ?? [];

  const headers = [
    'Date (UTC)',
    'Plan',
    'Sale Amount (USD)',
    'Your Commission (USD)',
    'Commission Rate',
    'Status',
    'Dodo Reference ID',
    'Clipmark Conversion ID',
    'Payout Eligible After',
  ];

  const csvRows = rows.map((c) => {
    // Affiliates earn after a 30-day refund hold
    const payoutDate   = new Date(new Date(c.created_at).getTime() + 30 * 86400000);
    const payoutStr    = c.status === 'pending'
      ? payoutDate.toISOString().split('T')[0]
      : '';
    const statusLabel  = c.status === 'cancelled' ? 'refunded' : c.status;

    return [
      new Date(c.created_at).toISOString().split('T')[0],
      c.plan,
      Number(c.amount_usd).toFixed(2),
      Number(c.commission_usd).toFixed(2),
      `${Math.round(Number(c.commission_rate) * 100)}%`,
      statusLabel,
      c.dodo_payment_id ?? '',
      c.id,
      payoutStr,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });

  const csv = [headers.join(','), ...csvRows].join('\n');
  const filename = `clipmark-affiliate-conversions-${new Date().toISOString().split('T')[0]}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // No caching — always serve fresh data
      'Cache-Control': 'no-store',
    },
  });
}
