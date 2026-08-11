import { NextRequest } from 'next/server';
import { requireAdmin, getSupabaseAdmin } from '../_lib';
import { getDodo } from '@/lib/clients';
import { handleSetAffiliate } from './handler';

// Next.js route entrypoint — unchanged contract, production default deps.
// The testable handler core lives in ./handler.ts.
//
// getDodo() rather than a module-scope `new DodoPayments(...)`: constructing it
// eagerly threw "DODO_PAYMENTS_API_KEY is missing" during `next build`'s page-data
// collection, so the whole webapp build failed in any environment without the key
// — the exact failure the lazy getters in lib/clients.ts and the re-export comment
// in ../_lib exist to prevent. This was the last route still doing it.
export async function POST(request: NextRequest) {
  return handleSetAffiliate(request, { admin: getSupabaseAdmin(), requireAdmin, dodo: getDodo() });
}
