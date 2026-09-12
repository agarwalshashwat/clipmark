import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/clients';
import {
  handleClaimAttribution,
  handleRevokeAttribution,
  type AttributionDeps,
} from './handler';

// Next.js route entrypoint — production default deps only. The testable handler
// core lives in ./handler.ts.
const defaultDeps = (): AttributionDeps => ({
  admin: getSupabaseAdmin(),
});

/** Set the attribution cookie(s) after the visitor accepts optional cookies. */
export async function POST(request: NextRequest) {
  return handleClaimAttribution(request, defaultDeps());
}

/** Clear them again when the visitor rejects, or changes their mind later. */
export async function DELETE() {
  return handleRevokeAttribution();
}
