import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/clients';
import { createServerSupabase } from '@/lib/supabase';
import { handlePostFeedback, type FeedbackDeps } from './handler';

// Next.js route entrypoint — production default deps only. The testable handler
// core lives in ./handler.ts.
const defaultFeedbackDeps = (): FeedbackDeps => ({
  admin: getSupabaseAdmin(),
  getOptionalUserId: async () => {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  },
});

export async function POST(request: NextRequest) {
  return handlePostFeedback(request, defaultFeedbackDeps());
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
