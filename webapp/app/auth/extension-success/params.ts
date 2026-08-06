/**
 * Query-param parsing for the OAuth → extension handoff.
 *
 * `/auth/extension-success` is the one moment Chrome tells the web app which
 * extension it's talking to: the callback redirects here with the Supabase
 * session in the query string, and this page relays it to the extension's
 * background worker as an `AUTH_SUCCESS` message. Everything downstream of that
 * message — Pro entitlement, cloud sync, reminders — depends on the shape being
 * exactly right, so the parsing lives here as a pure function rather than
 * inline in the component's effect.
 *
 * Unit-tested by webapp/tests/unit/extension-success.test.ts; the receiving half
 * is extension/src/external-messaging.module.js.
 */

/** The message shape the background worker's AUTH_SUCCESS handler reads. */
export type ExtensionAuthMessage = {
  type: 'AUTH_SUCCESS';
  accessToken: string;
  refreshToken: string | null;
  userId: string | null;
  userEmail: string | null;
  isPro: boolean;
};

export type ParsedExtensionAuth =
  | { ok: true; extensionId: string; message: ExtensionAuthMessage }
  | { ok: false; reason: 'missing_extension_id' | 'missing_access_token' };

/** Just the slice of URLSearchParams / ReadonlyURLSearchParams this needs. */
type ParamsLike = { get(name: string): string | null };

/**
 * Turn the callback's query string into an extension id + AUTH_SUCCESS message.
 *
 * `extensionId` and `access_token` are the two params without which the handoff
 * cannot happen at all; everything else is relayed as-is (possibly null) because
 * the extension tolerates absent profile fields but not an absent token.
 */
export function parseExtensionAuthParams(params: ParamsLike): ParsedExtensionAuth {
  const extensionId = params.get('extensionId');
  const accessToken = params.get('access_token');

  if (!extensionId) return { ok: false, reason: 'missing_extension_id' };
  if (!accessToken) return { ok: false, reason: 'missing_access_token' };

  return {
    ok: true,
    extensionId,
    message: {
      type:         'AUTH_SUCCESS',
      accessToken,
      refreshToken: params.get('refresh_token'),
      userId:       params.get('user_id'),
      userEmail:    params.get('user_email'),
      isPro:        params.get('is_pro') === 'true',
    },
  };
}
