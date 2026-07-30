import DodoPayments from 'dodopayments';
import { NextRequest } from 'next/server';
import { requireAdmin, getSupabaseAdmin } from '../_lib';
import { handleSetAffiliate } from './handler';

const dodo = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  environment: process.env.NODE_ENV === 'production' ? 'live_mode' : 'test_mode',
});

// Next.js route entrypoint — unchanged contract, production default deps.
// The testable handler core lives in ./handler.ts.
export async function POST(request: NextRequest) {
  return handleSetAffiliate(request, { admin: getSupabaseAdmin(), requireAdmin, dodo });
}
