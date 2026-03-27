import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { supabase, createServerSupabase } from '@/lib/supabase';

async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    return { user, client: userClient };
  }
  const serverClient = await createServerSupabase();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return null;
  return { user, client: serverClient };
}

function advanceDate(date: Date, frequency: string): Date {
  const d = new Date(date);
  switch (frequency) {
    case 'daily':    d.setDate(d.getDate() + 1); break;
    case 'weekly':   d.setDate(d.getDate() + 7); break;
    case 'biweekly': d.setDate(d.getDate() + 14); break;
    case 'monthly':  d.setMonth(d.getMonth() + 1); break;
  }
  return d;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

// POST /api/reminders/[id]/done
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { client } = auth;

  const { data: reminder, error: fetchError } = await client
    .from('revisit_reminders')
    .select('frequency, next_due_at')
    .eq('id', id)
    .single();

  if (fetchError || !reminder) {
    return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
  }

  const now = new Date();

  if (reminder.frequency === 'once') {
    await client.from('revisit_reminders').delete().eq('id', id);
  } else {
    let nextDue = advanceDate(new Date(reminder.next_due_at), reminder.frequency);
    while (nextDue <= now) {
      nextDue = advanceDate(nextDue, reminder.frequency);
    }
    await client.from('revisit_reminders').update({
      last_done_at: now.toISOString(),
      next_due_at: nextDue.toISOString(),
    }).eq('id', id);
  }

  return NextResponse.json({ ok: true });
}
