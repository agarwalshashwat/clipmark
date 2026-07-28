import { NextRequest } from 'next/server';
import { requireAdmin, getSupabaseAdmin } from '../_lib';
import { handleGrantPro } from './handler';

// Next.js route entrypoint — unchanged contract, production default deps.
// The testable handler core lives in ./handler.ts.
export async function POST(request: NextRequest) {
  return handleGrantPro(request, { admin: getSupabaseAdmin(), requireAdmin });
}
