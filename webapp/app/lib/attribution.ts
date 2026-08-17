/**
 * The two NON-ESSENTIAL attribution cookies, and the one place their names and
 * options are written down.
 *
 * Both are marketing cookies under UK PECR reg. 6 — they exist to credit
 * whoever sent a visitor, not to deliver anything the visitor asked for — so
 * neither may be set without consent (`ConsentCategory: 'attribution'`).
 * Everything the product does works identically without them.
 *
 * Three call sites share this module and must not drift apart:
 *   • app/r/[code]/route.ts               affiliate link  → clipmark_ref
 *   • app/ref/[code]/route.ts             user referral   → clipmark_user_ref
 *   • app/api/consent/attribution/        set on accept, cleared on reject
 */

export const AFFILIATE_REF_COOKIE = 'clipmark_ref';
export const USER_REF_COOKIE = 'clipmark_user_ref';

/** The attribution window both cookies advertise, in seconds (30 days). */
export const ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** httpOnly so page scripts cannot read who referred a visitor; Lax so it is
 *  never sent from another site's context. */
export function attributionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: ATTRIBUTION_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  };
}

/**
 * Referral codes are user-chosen strings that end up in a URL and in a cookie.
 * Validate before either — a code that reaches `Set-Cookie` unchecked is a
 * header-injection surface, and a code that reaches the URL unchecked is an
 * open door for junk query strings.
 */
export function isValidRefCodeShape(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(code);
}
