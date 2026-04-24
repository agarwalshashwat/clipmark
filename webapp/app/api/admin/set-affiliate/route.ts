/**
 * POST /api/admin/set-affiliate
 * Body: {
 *   userId: string,
 *   affiliateCode?: string,        // vanity code e.g. "mkbhd" → /r/mkbhd
 *   commissionRate?: number,       // 0–100 (percent). e.g. 50 = 50%
 *   discountPct?: number,          // 0–100 (percent). e.g. 10 = 10% off for referred users
 *   approve?: boolean,             // true = approve as affiliate if not already
 * }
 *
 * Lets admins set custom vanity codes and higher commission rates for big creator partners.
 */
import DodoPayments from 'dodopayments';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, supabaseAdmin } from '../_lib';

const dodo = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  environment: process.env.NODE_ENV === 'production' ? 'live_mode' : 'test_mode',
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: {
    userId?: string;
    affiliateCode?: string;
    commissionRate?: number;
    discountPct?: number;
    approve?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { userId, affiliateCode, commissionRate, discountPct, approve } = body;
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  // Validate affiliate code — alphanumeric + hyphens/underscores only
  if (affiliateCode !== undefined) {
    if (!/^[a-z0-9_-]{2,40}$/i.test(affiliateCode)) {
      return NextResponse.json(
        { error: 'Affiliate code must be 2–40 characters, letters/numbers/hyphens/underscores only' },
        { status: 400 }
      );
    }
  }

  const updates: Record<string, unknown> = {};

  if (approve) {
    updates.is_affiliate = true;
    updates.affiliate_status = 'approved';
  }

  if (affiliateCode !== undefined) {
    updates.affiliate_code = affiliateCode.toLowerCase();
  }

  if (typeof commissionRate === 'number') {
    if (commissionRate < 0 || commissionRate > 100) {
      return NextResponse.json({ error: 'commissionRate must be 0–100' }, { status: 400 });
    }
    updates.affiliate_commission_rate = commissionRate;
  }

  const effectiveDiscountPct =
    typeof discountPct === 'number' ? discountPct : 10; // default 10%

  // Create a Dodo discount code for the new discount percentage
  if (typeof discountPct === 'number' || approve) {
    try {
      const discount = await dodo.discounts.create({
        type: 'percentage',
        // Dodo expects basis points: 10% = 1000, 20% = 2000
        amount: effectiveDiscountPct * 100,
        name: `Clipmark affiliate ${affiliateCode ?? userId} ${effectiveDiscountPct}% off`,
        restricted_to: [],
        usage_limit: null,
        expires_at: null,
      } as Parameters<typeof dodo.discounts.create>[0]);
      updates.dodo_discount_code = (discount as { discount_id: string }).discount_id;
    } catch (err) {
      console.error('[admin/set-affiliate] Dodo discount creation failed:', err);
      // Non-fatal — proceed without discount code
    }
    updates.affiliate_discount_pct = effectiveDiscountPct;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, applied: updates });
}
