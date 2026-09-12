/**
 * Cookie-consent record — the single source of truth for whether we may set
 * NON-ESSENTIAL cookies (UK PECR reg. 6 / GDPR Art. 6(1)(a)).
 *
 * Pure and dependency-free on purpose: the same module is imported by the
 * client banner (components/ConsentProvider.tsx), by server route handlers
 * (app/r/[code], app/ref/[code], app/api/consent/attribution) and by the unit
 * tests. Nothing here touches `document` or `next/headers`.
 *
 * ── Why a category record and not a boolean ──────────────────────────────────
 * The banner asks one binary question, but the stored answer is per-category so
 * a future non-essential tracker (the extension's feature-usage analytics) can
 * be gated through this same choice instead of growing a second mechanism.
 *
 * The catch is that consent is only valid for what the user was actually TOLD
 * about. So a record carries the categories that were presented when it was
 * given, and `consentAllows` is a strict lookup: a category that did not exist
 * at the time is absent from `cats` and therefore reads as NOT consented — it
 * never inherits an older "accept". Adding a category means adding it to
 * PRESENTED_CATEGORIES and bumping CONSENT_VERSION, which makes every existing
 * record stale (see `needsPrompt`) and re-asks. That is the intended cost.
 */

/** First-party cookie holding the record. Readable by page scripts by design —
 *  the banner has to know whether to render, and it renders on static pages
 *  where the server never sees the request. */
export const CONSENT_COOKIE = 'clipmark_consent';

/** Bump whenever PRESENTED_CATEGORIES changes, or whenever what we tell users
 *  in the banner materially changes. Old records stop counting as an answer. */
export const CONSENT_VERSION = 1;

/** How long an answer stands before we ask again. The ICO does not fix a number;
 *  six months is the common "review periodically" reading and is short enough
 *  that a stale accept does not sit on a device for years. */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 182;

/**
 * Non-essential categories the banner currently presents.
 *
 * `attribution` — the 30-day `clipmark_ref` / `clipmark_user_ref` cookies that
 * credit an affiliate or a referring user. Marketing purpose, not needed to
 * deliver the site, so it needs consent.
 *
 * Strictly necessary cookies (Supabase auth) are deliberately NOT modelled
 * here: they are exempt, and giving them a category would imply they are
 * refusable when they are not.
 */
export const PRESENTED_CATEGORIES = ['attribution'] as const;

/** Every category the codebase knows about, including ones not yet presented.
 *  `product_analytics` is reserved for the extension's feature-usage
 *  instrumentation; it is absent from PRESENTED_CATEGORIES, so it reads as
 *  denied until it is added there and CONSENT_VERSION is bumped. */
export type ConsentCategory = (typeof PRESENTED_CATEGORIES)[number] | 'product_analytics';

export interface ConsentRecord {
  /** CONSENT_VERSION at the time the answer was given. */
  v: number;
  /** Epoch ms the answer was given — surfaced in the UI, and the basis for
   *  re-asking if we ever shorten the window below the cookie's own max-age. */
  ts: number;
  /** Only the categories that were presented. Absent ⇒ never consented to. */
  cats: Partial<Record<ConsentCategory, boolean>>;
}

/** Build the record for a single accept-all / reject-all answer. */
export function makeConsentRecord(granted: boolean, now: number): ConsentRecord {
  const cats: Partial<Record<ConsentCategory, boolean>> = {};
  for (const c of PRESENTED_CATEGORIES) cats[c] = granted;
  return { v: CONSENT_VERSION, ts: now, cats };
}

/** Cookie value for a record. URL-encoded so the JSON survives `document.cookie`
 *  and `Set-Cookie` byte-for-byte; `parseConsent` decodes tolerantly. */
export function serializeConsent(record: ConsentRecord): string {
  return encodeURIComponent(JSON.stringify(record));
}

/**
 * Parse a raw cookie value into a record, or null if it is not a usable answer.
 *
 * Tolerant of encoding on purpose: the value is written by `document.cookie`
 * (encoded) but read back through several APIs — `next/headers` cookies(),
 * NextRequest.cookies, a raw header split — which disagree about whether they
 * decode for you. Double-decoding an already-decoded JSON string is a no-op, so
 * trying both directions is strictly safer than assuming either.
 */
export function parseConsent(raw: string | undefined | null): ConsentRecord | null {
  if (!raw) return null;

  let parsed: unknown = null;
  for (const candidate of [raw, safeDecode(raw)]) {
    if (candidate === null) continue;
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch {
      /* try the other form */
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const rec = parsed as Partial<ConsentRecord>;
  if (typeof rec.v !== 'number' || typeof rec.ts !== 'number') return null;
  if (!rec.cats || typeof rec.cats !== 'object') return null;

  // Keep only real booleans, so a hand-edited cookie of {"attribution":"yes"}
  // cannot read as consent.
  const cats: Partial<Record<ConsentCategory, boolean>> = {};
  for (const [key, value] of Object.entries(rec.cats)) {
    if (typeof value === 'boolean') cats[key as ConsentCategory] = value;
  }

  return { v: rec.v, ts: rec.ts, cats };
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null; // a stray '%' makes decodeURIComponent throw
  }
}

/**
 * May we use `category`?
 *
 * Strict: only an explicit `true`, in a record of the CURRENT version, counts.
 * No record, a stale version, or an unlisted category all mean no — which is
 * the safe default in every direction, including the one where this function is
 * called before the banner has been answered.
 */
export function consentAllows(
  record: ConsentRecord | null | undefined,
  category: ConsentCategory,
): boolean {
  if (!record || record.v !== CONSENT_VERSION) return false;
  return record.cats[category] === true;
}

/** Convenience for route handlers: read straight from a raw cookie value. */
export function rawConsentAllows(raw: string | undefined | null, category: ConsentCategory): boolean {
  return consentAllows(parseConsent(raw), category);
}

/**
 * Should the banner be shown?
 *
 * True when there is no record, when the record predates the current version,
 * or when it does not cover every currently-presented category — the last case
 * being the backstop for adding a category and forgetting to bump the version.
 */
export function needsPrompt(record: ConsentRecord | null | undefined): boolean {
  if (!record) return true;
  if (record.v !== CONSENT_VERSION) return true;
  return PRESENTED_CATEGORIES.some((c) => typeof record.cats[c] !== 'boolean');
}
