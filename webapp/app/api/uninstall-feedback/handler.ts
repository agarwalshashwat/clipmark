import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validateUninstallFeedback } from '@/app/lib/uninstall-feedback';

/**
 * POST /api/uninstall-feedback — the write side of the public /uninstall page.
 *
 * The handler core lives here (not in route.ts) with its dependencies injected,
 * the same split as app/api/feedback/handler.ts, so the failure paths are
 * unit-testable without a database. The validation rules live in
 * app/lib/uninstall-feedback.ts because the form shares them.
 *
 * Differences from /api/feedback, all of them because of who is submitting:
 *   1. No user_id, and no session lookup at all. The submitter has just deleted
 *      the extension; asking who they are would be both useless and rude.
 *   2. A missing table is not an error the visitor should see — see below.
 */

// ── Rate limiting ────────────────────────────────────────────────────────────
// Same in-memory fixed window as /api/feedback, with the same caveat: it resets
// on cold start and is per-instance under scale-out, so it stops the trivial
// single-client hammering case rather than a distributed abuser. The bound on
// direct-to-database abuse is the WITH CHECK in migration 019.
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

/**
 * Postgres `undefined_table`, and the PostgREST schema-cache miss that fronts
 * it. Both mean the same thing here: migration 019 has not been applied yet.
 */
function isMissingTable(error: { code?: string | null; message?: string | null }): boolean {
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  const message = error.message ?? '';
  return /relation .* does not exist|could not find the table/i.test(message);
}

// ── Handler ──────────────────────────────────────────────────────────────────
export interface UninstallFeedbackDeps {
  /** Service-role client — the table has no read path for the API roles. */
  admin: SupabaseClient;
}

export async function handlePostUninstallFeedback(
  request: NextRequest,
  deps: UninstallFeedbackDeps,
) {
  // Checked before parsing so a flood costs as little as possible.
  if (isRateLimited(getClientIp(request))) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'That is a lot of submissions at once — try again in a few minutes.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json', message: 'Expected JSON.' }, { status: 400 });
  }

  const parsed = validateUninstallFeedback(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, message: parsed.message }, { status: 400 });
  }

  const { error } = await deps.admin.from('uninstall_feedback').insert(parsed.value);

  if (error) {
    // Fail SOFT when the table isn't there yet. This page ships before migration
    // 019 is applied, and the deploy order is deliberately webapp-first: the
    // extension's uninstall URL has to resolve to something the moment the Web
    // Store update rolls out. Someone who has just uninstalled and still took
    // the time to answer should not be shown an error because of our rollout
    // order — the response is lost, which is the correct thing to lose here, and
    // the log line is what tells us the migration is still pending.
    if (isMissingTable(error)) {
      console.error(
        '[api/uninstall-feedback] uninstall_feedback table missing — migration 019 not applied; response dropped:',
        error.message,
      );
      return NextResponse.json({ ok: true, stored: false });
    }

    console.error('[api/uninstall-feedback] insert failed:', error);
    return NextResponse.json(
      { error: 'save_failed', message: 'We could not save that. Please try again.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, stored: true });
}
