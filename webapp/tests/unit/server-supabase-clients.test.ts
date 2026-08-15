/**
 * Server Supabase clients must be stateless.
 *
 * Regression cover for a production 401 storm on POST /api/refresh. The shared
 * anon client was built with auth-js's browser defaults, which off-browser mean:
 * the session lands in a module-scope in-memory store, and a 30s ticker starts
 * unconditionally and re-refreshes it ~90s before expiry. /api/refresh put a
 * real user's session in there, so the server silently rotated a refresh token
 * the extension still held — and the extension's next refresh 401'd and signed
 * the user out.
 *
 * The refresh route additionally must not share a client instance with anything
 * else: auth-js de-duplicates concurrent refreshes per instance and takes no
 * lock off-browser, so two overlapping requests on one warm Fluid instance would
 * collapse and hand the second caller the first caller's tokens.
 *
 * Placeholder env is set by the --import preload in the test:unit:webapp script.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { supabase } from '../../lib/supabase.js';
import { getSupabaseAdmin } from '../../lib/clients.js';

// The flags live on the GoTrueClient instance behind `.auth`; they are not part
// of the public typings, hence the cast.
const authFlags = (client: { auth: unknown }) =>
  client.auth as unknown as { persistSession: boolean; autoRefreshToken: boolean };

const repoFile = (relative: string) =>
  readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), 'utf8');

describe('shared anon client (lib/supabase)', () => {
  it('never persists a session into module memory', () => {
    assert.equal(authFlags(supabase).persistSession, false);
  });

  it('never starts the background auto-refresh ticker', () => {
    assert.equal(authFlags(supabase).autoRefreshToken, false);
  });
});

describe('memoized service-role client (lib/clients)', () => {
  it('is stateless too — memoized means it outlives the request that built it', () => {
    const flags = authFlags(getSupabaseAdmin());
    assert.equal(flags.persistSession, false);
    assert.equal(flags.autoRefreshToken, false);
  });
});

describe('POST /api/refresh', () => {
  const source = repoFile('app/api/refresh/route.ts');

  it('builds its own client instead of importing the shared singleton', () => {
    assert.doesNotMatch(
      source,
      /import\s*\{[^}]*\bsupabase\b[^}]*\}\s*from\s*'@\/lib\/supabase'/,
      'refreshSession on a shared instance can hand one caller another account’s tokens',
    );
    assert.match(source, /createClient\(/);
  });

  it('constructs that client with session state and auto-refresh off', () => {
    assert.match(source, /persistSession:\s*false/);
    assert.match(source, /autoRefreshToken:\s*false/);
  });
});
