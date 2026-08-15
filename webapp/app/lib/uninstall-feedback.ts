/**
 * Validation for the /uninstall survey — the single source of truth, shared by
 * the client component and by /api/uninstall-feedback.
 *
 * Same split as app/lib/feedback.ts, for the same reason: the form imports it
 * too (a client component cannot pull in a module that touches `next/server`),
 * and duplicating the rules is how a client and server drift into disagreeing
 * about what a valid submission is. The route re-runs this on the parsed body —
 * the client copy only exists so the answer is instant.
 *
 * The bounds mirror the CHECK constraints in migrations/019_uninstall_feedback.sql,
 * kept slightly tighter on the free text (2000 vs 4000) so an over-long answer
 * produces a clean 400 rather than a constraint violation surfacing as a 500.
 */

export const LIMITS = {
  message: 2000,
  email: 254,
  version: 32,
} as const;

/**
 * The options the form offers, in display order.
 *
 * The `value`s are mirrored by the WITH CHECK allowlist in migration 019 — that
 * copy is what bounds a direct anonymous insert, this one is what the page
 * renders. Adding an option means touching both.
 *
 * Worth keeping the labels plain: someone who has just uninstalled is doing us a
 * favour by answering at all, and leading questions ("What went wrong?") would
 * make the answers less useful, not more.
 */
export const REASONS = [
  { value: 'expectations', label: "Didn't do what I expected" },
  { value: 'missing_feature', label: 'Missing a feature I needed' },
  { value: 'too_confusing', label: 'Too confusing to set up' },
  { value: 'better_tool', label: 'Found a better tool' },
  { value: 'just_trying', label: 'Just trying it out' },
  { value: 'other', label: 'Other' },
] as const;

export type ReasonValue = (typeof REASONS)[number]['value'];

const REASON_VALUES: readonly string[] = REASONS.map((r) => r.value);

export function isReason(value: unknown): value is ReasonValue {
  return typeof value === 'string' && REASON_VALUES.includes(value);
}

export interface UninstallFeedbackInput {
  reason: ReasonValue;
  message: string | null;
  email: string | null;
  extension_version: string | null;
}

export type UninstallErrorCode =
  | 'invalid_body'
  | 'invalid_reason'
  | 'message_too_long'
  | 'email_too_long'
  | 'invalid_email';

/** Which part of the form an error belongs to, so the UI can place it. */
export const ERROR_FIELD: Record<UninstallErrorCode, 'reason' | 'message' | 'email' | 'form'> = {
  invalid_body: 'form',
  invalid_reason: 'reason',
  message_too_long: 'message',
  email_too_long: 'email',
  invalid_email: 'email',
};

export type ValidationResult =
  | { ok: true; value: UninstallFeedbackInput }
  | { ok: false; error: UninstallErrorCode; message: string };

/** Trim, collapse an empty string to null, and reject anything over `max`. */
function text(raw: unknown, max: number): string | null | false {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? false : trimmed;
}

/**
 * Same permissive shape check as the /feedback form: this is a "can we reply to
 * you?" field, not an identity check. It rejects what is certainly a typo and
 * lets everything else through rather than bouncing a real address.
 */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}

/**
 * The extension appends ?v=<manifest version> to the uninstall URL. Anything
 * that is not version-shaped is dropped rather than stored.
 *
 * This is the whole defence against the query string becoming a side channel:
 * the uninstall URL is registered by the extension, but the page is public and
 * anyone can open it with any query they like. Storing only what matches
 * /^\d+(\.\d+){0,3}$/ means an id, an email or a token pasted into ?v= is
 * discarded instead of landing in the table.
 */
export function normaliseVersion(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > LIMITS.version) return null;
  return /^\d+(\.\d+){0,3}$/.test(trimmed) ? trimmed : null;
}

export function validateUninstallFeedback(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'invalid_body', message: 'Expected a JSON object.' };
  }
  const b = body as Record<string, unknown>;

  // The one required answer, and it is a single tap. Everything else is optional
  // on purpose — someone who has already uninstalled owes us nothing.
  if (!isReason(b.reason)) {
    return { ok: false, error: 'invalid_reason', message: 'Pick the closest reason.' };
  }

  const message = text(b.message, LIMITS.message);
  if (message === false) {
    return {
      ok: false,
      error: 'message_too_long',
      message: `Keep that to ${LIMITS.message} characters or fewer.`,
    };
  }

  const email = text(b.email, LIMITS.email);
  if (email === false) {
    return { ok: false, error: 'email_too_long', message: 'That email address is too long.' };
  }
  if (email && !looksLikeEmail(email)) {
    return { ok: false, error: 'invalid_email', message: 'That email address looks incomplete.' };
  }

  return {
    ok: true,
    value: {
      reason: b.reason,
      message,
      email,
      // Dropped rather than rejected: a junk ?v= must never be the reason
      // someone's answer is thrown away.
      extension_version: normaliseVersion(b.extension_version),
    },
  };
}
