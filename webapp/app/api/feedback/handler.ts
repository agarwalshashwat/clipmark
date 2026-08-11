import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validateFeedback } from '@/app/lib/feedback';

/**
 * POST /api/feedback — the write side of the public /feedback page.
 *
 * The handler core lives here (not in route.ts) with its dependencies injected,
 * the same split as app/api/bookmarks/handler.ts, so the failure paths are
 * unit-testable without a database — see webapp/tests/unit/feedback-submit.test.ts.
 * The validation rules themselves live in app/lib/feedback.ts because the form
 * shares them.
 *
 * Three properties this route is responsible for:
 *   1. `user_id` is stamped from the verified session and never read from the
 *      body. The form posts no identity at all; a submission claiming to be
 *      someone else is not something a client gets to say.
 *   2. Submissions are rate-limited per IP before anything is parsed.
 *   3. The insert runs as the service role. Migration 017 also grants anon
 *      INSERT (the table is genuinely public-writable by design), but going
 *      through the service role here is what lets the route own the rate limit
 *      and the user_id stamp.
 */

// ── Rate limiting ────────────────────────────────────────────────────────────
// Same in-memory fixed window as /api/comments, with the same caveat: it resets
// on cold start and is per-instance under scale-out, so it stops the trivial
// single-client hammering case rather than a distributed abuser. The bound on
// direct-to-database abuse is the WITH CHECK in migration 017.
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const submissionTimestamps = new Map<string, number[]>();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (submissionTimestamps.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  submissionTimestamps.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

/** Test seam: the rate-limit window is process-global state. */
export function resetRateLimit() {
  submissionTimestamps.clear();
}

// ── Handler ──────────────────────────────────────────────────────────────────
export interface FeedbackDeps {
  /** Service-role client — the table has no read path for the API roles. */
  admin: SupabaseClient;
  /** Resolves the signed-in user, or null. Never fails the request. */
  getOptionalUserId: () => Promise<string | null>;
}

export async function handlePostFeedback(request: NextRequest, deps: FeedbackDeps) {
  // Checked before parsing so a flood costs as little as possible.
  if (isRateLimited(getClientIp(request))) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'That is a lot of feedback at once — try again in a few minutes.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json', message: 'Expected JSON.' }, { status: 400 });
  }

  const parsed = validateFeedback(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, message: parsed.message }, { status: 400 });
  }

  // Best-effort: a broken or absent session must not block an anonymous submission.
  let userId: string | null = null;
  try {
    userId = await deps.getOptionalUserId();
  } catch {
    userId = null;
  }

  const { error } = await deps.admin.from('feedback').insert({ ...parsed.value, user_id: userId });

  if (error) {
    console.error('[api/feedback] insert failed:', error);
    return NextResponse.json(
      { error: 'save_failed', message: 'We could not save that. Please try again.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
