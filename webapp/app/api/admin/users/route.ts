/**
 * GET /api/admin/users?q=email@example.com
 * Search users by email prefix or username. Returns up to 20 results.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, supabaseAdmin } from '../_lib';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ users: [] });

  // Search Supabase auth users by email
  const { data: authList, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200, // fetch in bulk then filter — Auth API doesn't support email search directly
  });
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });

  const matched = (authList?.users ?? [])
    .filter((u) => u.email?.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 20);

  if (!matched.length) return NextResponse.json({ users: [] });

  const ids = matched.map((u) => u.id);

  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, username, is_pro, is_gifted_pro, gifted_pro_expires_at, gifted_by_note, is_affiliate, affiliate_code, commission_rate')
    .in('id', ids);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const users = matched.map((u) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    ...profileMap.get(u.id),
  }));

  return NextResponse.json({ users });
}
