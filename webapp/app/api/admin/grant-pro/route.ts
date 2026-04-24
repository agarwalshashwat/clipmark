/**
 * POST /api/admin/grant-pro
 * Body: { userId: string, expiresAt?: string | null, note?: string }
 *
 * Grants gifted Pro to a user — no Dodo payment needed.
 * expiresAt: ISO string or null (permanent).
 * Sets is_pro = true AND is_gifted_pro = true so RLS-based Pro checks still work.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, supabaseAdmin } from '../_lib';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: { userId?: string; expiresAt?: string | null; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { userId, expiresAt = null, note = '' } = body;
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      is_pro: true,
      is_gifted_pro: true,
      gifted_pro_expires_at: expiresAt ?? null,
      gifted_by_note: note.trim() || null,
    })
    .eq('id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
