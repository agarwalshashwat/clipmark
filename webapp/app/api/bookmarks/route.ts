import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/clients';
import {
  handleGetBookmarks,
  handlePutBookmarks,
  getAuthenticatedUser,
  type BookmarksDeps,
} from './handler';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

// Next.js route entrypoints — unchanged contract, production default deps.
// The testable handler cores live in ./handler.ts.
const defaultBookmarksDeps = (): BookmarksDeps => ({
  admin: getSupabaseAdmin(),
  getAuthedUser: getAuthenticatedUser,
});

export async function GET(request: NextRequest) {
  return handleGetBookmarks(request, defaultBookmarksDeps());
}

export async function PUT(request: NextRequest) {
  return handlePutBookmarks(request, defaultBookmarksDeps());
}
