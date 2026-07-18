import { NextRequest } from 'next/server';
import { getDodo, getSupabaseAdmin } from '@/lib/clients';
import { handleDodoWebhook } from './handler';

// Next.js route entrypoint — unchanged contract, production default deps.
// The testable handler core lives in ./handler.ts.
export async function POST(request: NextRequest) {
  return handleDodoWebhook(request, { dodo: getDodo(), admin: getSupabaseAdmin() });
}
