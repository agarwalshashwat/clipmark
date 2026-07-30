/**
 * GET /api/admin/users?q=email@example.com
 * Search users by email prefix or username. Returns up to 20 results.
 */
import { NextRequest } from 'next/server';
import { requireAdmin, getSupabaseAdmin } from '../_lib';
import { handleAdminUsers } from './handler';

// Next.js route entrypoint — unchanged contract, production default deps.
// The testable handler core lives in ./handler.ts.
export async function GET(request: NextRequest) {
  return handleAdminUsers(request, { admin: getSupabaseAdmin(), requireAdmin });
}
