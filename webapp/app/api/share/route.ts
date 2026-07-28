import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/clients';
import { handleShare, getAuthenticatedUserId } from './handler';

// Handle preflight CORS requests from the extension
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

// Next.js route entrypoint — unchanged contract, production default deps.
// The testable handler core lives in ./handler.ts.
export async function POST(request: NextRequest) {
  return handleShare(request, { admin: getSupabaseAdmin(), getUserId: getAuthenticatedUserId });
}
