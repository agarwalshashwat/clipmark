import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Mints the extension a session in its OWN refresh-token family, independent
 * of the website's cookie session.
 *
 * /auth/callback used to hand the extension the exact same `refresh_token` the
 * website had just put in its cookies — one refresh-token chain, two unrelated
 * holders. Supabase rotates that token on every use and, once the previous
 * token's short reuse window has passed, treats a second use of it as replay
 * and revokes the *whole family*. So whichever surface refreshed second lost:
 * the middleware refreshing on a page load invalidated the token the extension
 * was still holding (next `POST /api/refresh` → 401 → signed out of the
 * extension), and the extension's background alarm refreshing did the same to
 * the website's cookie session. Access tokens last an hour, so this fired
 * roughly every hour on whichever surface was touched second — reported as
 * "frequently signed out" on both.
 *
 * The fix is to give the extension a session in a family of its own, so a
 * refresh on either surface never observes the other's rotation. There's no
 * public API to fork a session — refreshing one always shares the same
 * lineage — so this mints an unrelated one server-side, using the same
 * mechanism email-link sign-in uses: the service-role `admin.generateLink`
 * issues a one-time token for the already-authenticated user, and an ordinary
 * (anon-key) `verifyOtp` redeems it into a brand-new session, in a family
 * `/auth/callback`'s own code exchange never touched.
 */
export interface MintedExtensionSession {
  accessToken: string;
  refreshToken: string;
}

export async function mintExtensionSession(
  admin: SupabaseClient,
  anon: SupabaseClient,
  email: string,
): Promise<MintedExtensionSession | null> {
  if (!email) return null;

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const hashedToken = linkData?.properties?.hashed_token;
  if (linkError || !hashedToken) return null;

  const { data: verifyData, error: verifyError } = await anon.auth.verifyOtp({
    type: 'magiclink',
    token_hash: hashedToken,
  });
  if (verifyError || !verifyData.session) return null;

  return {
    accessToken: verifyData.session.access_token,
    refreshToken: verifyData.session.refresh_token,
  };
}
