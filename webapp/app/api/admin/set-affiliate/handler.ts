/**
 * Handler core for POST /api/admin/set-affiliate (testable; the route wrapper is
 * in ./route.ts). Body: {
 *   userId: string,
 *   affiliateCode?: string,        // vanity code e.g. "mkbhd" → /r/mkbhd
 *   commissionRate?: number,       // 0–100 (percent). e.g. 50 = 50%
 *   discountPct?: number,          // 0–100 (percent). e.g. 10 = 10% off for referred users
 *   approve?: boolean,             // true = approve as affiliate if not already
 * }
 *
 * Lets admins set custom vanity codes and higher commission rates for big creator
 * partners — including non-Pro external creators who'd never clear the self-serve
 * 30-day-Pro gate in affiliate/apply/route.ts.
 */
import type DodoPayments from 'dodopayments';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Injectable dependencies so the handler can be unit/integration-tested with fakes
// or a real local Supabase instance without a live Dodo account.
export interface SetAffiliateDeps {
  admin: SupabaseClient;
  requireAdmin: () => Promise<{ userId: string } | NextResponse>;
  dodo: Pick<DodoPayments, 'discounts'>;
}

export async function handleSetAffiliate(
  request: NextRequest,
  { admin, requireAdmin: requireAdminFn, dodo }: SetAffiliateDeps,
) {
  const auth = await requireAdminFn();
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
    // is_affiliate is the sole "approved" gate everywhere it's read (/r/[code],
    // the Dodo webhook's commission recording, the dashboard) — there is no
    // separate status column on profiles.
    updates.is_affiliate = true;
  }

  if (affiliateCode !== undefined) {
    updates.affiliate_code = affiliateCode.toLowerCase();
  }

  if (typeof commissionRate === 'number') {
    if (commissionRate < 0 || commissionRate > 100) {
      return NextResponse.json({ error: 'commissionRate must be 0–100' }, { status: 400 });
    }
    // commission_rate is stored as a fraction (0.30 = 30%), matching the
    // self-serve default in affiliate/apply/route.ts and the webhook's
    // `amount * commission_rate` math — this route's own input is a 0–100 percent.
    updates.commission_rate = commissionRate / 100;
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
        name: `ClipMark affiliate ${affiliateCode ?? userId} ${effectiveDiscountPct}% off`,
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

  const { error } = await admin
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, applied: updates });
}
