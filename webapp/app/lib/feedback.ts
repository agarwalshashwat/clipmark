/**
 * Validation for the /feedback form — the single source of truth, shared by the
 * client component and by /api/feedback.
 *
 * It lives here rather than next to the route because the form imports it too:
 * a client component cannot pull in a module that touches `next/server`, and
 * duplicating the rules is how a client and server drift into disagreeing about
 * what a valid submission is. The route re-runs this on the parsed body — the
 * client copy only exists so the answer is instant.
 *
 * The bounds mirror the CHECK constraints in migrations/017_feedback.sql, kept
 * slightly tighter on the free-text fields (2000 vs 4000) so an over-long
 * answer produces a clean 400 rather than a constraint violation surfacing as a
 * 500.
 */

export const LIMITS = {
  answer: 2000,
  name: 120,
  email: 254,
  source: 120,
} as const;

export interface FeedbackInput {
  rating: number;
  liked: string | null;
  confusing: string | null;
  feature_request: string | null;
  name: string | null;
  email: string | null;
  source: string | null;
}

export type FeedbackErrorCode =
  | 'invalid_body'
  | 'invalid_rating'
  | 'answer_too_long'
  | 'no_answers'
  | 'name_too_long'
  | 'email_too_long'
  | 'invalid_email';

/** Which part of the form an error belongs to, so the UI can place it. */
export const ERROR_FIELD: Record<FeedbackErrorCode, 'rating' | 'answers' | 'name' | 'email' | 'form'> = {
  invalid_body: 'form',
  invalid_rating: 'rating',
  answer_too_long: 'answers',
  no_answers: 'answers',
  name_too_long: 'name',
  email_too_long: 'email',
  invalid_email: 'email',
};

export type ValidationResult =
  | { ok: true; value: FeedbackInput }
  | { ok: false; error: FeedbackErrorCode; message: string };

/** Trim, collapse an empty string to null, and reject anything over `max`. */
function text(raw: unknown, max: number): string | null | false {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? false : trimmed;
}

/**
 * Deliberately permissive: this is a "can I reply to you?" field, not an
 * identity check, and there is no confirmation step. It rejects the shapes that
 * are certainly typos (no @, no dot in the domain, whitespace) and lets
 * everything else through rather than bouncing a real address.
 */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}

export function validateFeedback(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'invalid_body', message: 'Expected a JSON object.' };
  }
  const b = body as Record<string, unknown>;

  const rating = b.rating;
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: 'invalid_rating', message: 'Pick a rating from 1 to 5 stars.' };
  }

  const liked = text(b.liked, LIMITS.answer);
  const confusing = text(b.confusing, LIMITS.answer);
  const featureRequest = text(b.feature_request, LIMITS.answer);
  if (liked === false || confusing === false || featureRequest === false) {
    return {
      ok: false,
      error: 'answer_too_long',
      message: `Each answer needs to be ${LIMITS.answer} characters or fewer.`,
    };
  }

  // A rating on its own is a mood, not something to act on, so at least one of
  // the three questions has to be answered.
  if (!liked && !confusing && !featureRequest) {
    return {
      ok: false,
      error: 'no_answers',
      message: 'Add a line to at least one of the three questions.',
    };
  }

  const name = text(b.name, LIMITS.name);
  if (name === false) {
    return { ok: false, error: 'name_too_long', message: 'That name is too long.' };
  }

  const email = text(b.email, LIMITS.email);
  if (email === false) {
    return { ok: false, error: 'email_too_long', message: 'That email address is too long.' };
  }
  if (email && !looksLikeEmail(email)) {
    return { ok: false, error: 'invalid_email', message: 'That email address looks incomplete.' };
  }

  // Truncated rather than rejected: `source` is our own provenance field, and a
  // long referrer must never be the reason someone's feedback is thrown away.
  const rawSource = typeof b.source === 'string' ? b.source.trim() : '';
  const source = rawSource ? rawSource.slice(0, LIMITS.source) : null;

  return {
    ok: true,
    value: { rating, liked, confusing, feature_request: featureRequest, name, email, source },
  };
}
