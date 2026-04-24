/**
 * POST /api/admin/revoke-pro
 * Body: { userId: string }
 *
 * Revokes gifted Pro. Does NOT revoke paid subscriptions —
 * only clears the gifted flags. If they have a real Dodo subscription,
 * that will re-set is_pro on the next webhook event.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, supabaseAdmin } from '../_lib';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { userId } = body;
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  // Check whether they have a real paid subscription before revoking is_pro
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('subscription_id, is_gifted_pro')
    .eq('id', userId)
    .single();

  const hasPaidSub = !!profile?.subscription_id;

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      // Keep is_pro true if they have a real paid subscription
      is_pro: hasPaidSub ? true : false,
      is_gifted_pro: false,
      gifted_pro_expires_at: null,
      gifted_by_note: null,
    })
    .eq('id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, hadPaidSub: hasPaidSub });
}
