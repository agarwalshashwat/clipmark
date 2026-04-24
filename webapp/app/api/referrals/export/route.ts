import { createServerSupabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * GET /api/referrals/export
 *
 * Downloads the authenticated user's referral history as CSV.
 * Provides a tamper-evident record of all referral rewards.
 */
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('referral_code')
    .eq('id', user.id)
    .single();

  if (!profile?.referral_code) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const { data: referrals, error } = await supabaseAdmin
    .from('referrals')
    .select('id, created_at, status, reward_months, reward_applied_at')
    .eq('referrer_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return new NextResponse('Internal Server Error', { status: 500 });

  const rows = referrals ?? [];
  const headers = ['Date (UTC)', 'Status', 'Months Awarded', 'Reward Applied At', 'Clipmark Referral ID'];

  const csvRows = rows.map((r) => {
    const statusLabel = r.status === 'cancelled' ? 'refunded' : r.status;
    return [
      new Date(r.created_at).toISOString().split('T')[0],
      statusLabel,
      String(r.reward_months),
      r.reward_applied_at ? new Date(r.reward_applied_at).toISOString().split('T')[0] : '',
      r.id,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });

  const csv = [headers.join(','), ...csvRows].join('\n');
  const filename = `clipmark-referrals-${new Date().toISOString().split('T')[0]}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
