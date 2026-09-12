import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/clients';
import { handlePostUninstallFeedback, type UninstallFeedbackDeps } from './handler';

// Next.js route entrypoint — production default deps only. The testable handler
// core lives in ./handler.ts.
const defaultDeps = (): UninstallFeedbackDeps => ({
  admin: getSupabaseAdmin(),
});

export async function POST(request: NextRequest) {
  return handlePostUninstallFeedback(request, defaultDeps());
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
