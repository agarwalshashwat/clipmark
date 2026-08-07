/**
 * Response-header posture (next.config.mjs → lib/security-headers.mjs).
 *
 * The rule worth guarding is the /embed/* override: embed pages are meant to be
 * iframed by third parties (X-Frame-Options: ALLOWALL + frame-ancestors *), and
 * nothing today would catch that permissiveness widening to cover the dashboard,
 * the share pages, or the marketing site. These assertions run without a server.
 *
 * Note what is deliberately NOT asserted: that the app ships a real
 * Content-Security-Policy. It currently doesn't (Sentry, YouTube embeds and
 * Dodo's checkout all load third-party), and adding one is a product decision
 * flagged in docs/TEST-STRATEGY.md §4.2, not something to smuggle in via a test.
 * What IS asserted is that the only CSP present stays scoped to /embed.
 *
 * Run: npm --prefix webapp run test:unit
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  securityHeaders,
  headersForPath,
  matchesSource,
  EMBED_SOURCE,
} from '../../lib/security-headers.mjs';

/** Routes that must all get the strict, non-embeddable posture. */
const NON_EMBED_PATHS = [
  '/',
  '/pricing',
  '/dashboard',
  '/dashboard/groups',
  '/v/abc123',
  '/auth/extension-success',
  '/api/bookmarks',
  '/embedded-not-embed', // shares a prefix with /embed but is a different route
];

const EMBED_PATHS = ['/embed/abc123', '/embed/abc123/deep'];

describe('security headers: global posture', () => {
  for (const path of NON_EMBED_PATHS) {
    it(`applies the baseline security headers to ${path}`, () => {
      const h = headersForPath(path);
      assert.equal(h['X-Content-Type-Options'], 'nosniff');
      assert.equal(h['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');
      assert.equal(h['Referrer-Policy'], 'strict-origin-when-cross-origin');
    });
  }

  it('applies the baseline to embed routes too', () => {
    // /embed only overrides framing — it must not drop nosniff or HSTS.
    for (const path of EMBED_PATHS) {
      const h = headersForPath(path);
      assert.equal(h['X-Content-Type-Options'], 'nosniff');
      assert.equal(h['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');
    }
  });
});

describe('security headers: framing is denied everywhere but /embed', () => {
  for (const path of NON_EMBED_PATHS) {
    it(`denies framing on ${path}`, () => {
      const h = headersForPath(path);
      assert.equal(h['X-Frame-Options'], 'DENY', `${path} must not be iframeable`);
      assert.equal(h['Content-Security-Policy'], undefined, `${path} must not inherit the embed CSP`);
    });
  }

  for (const path of EMBED_PATHS) {
    it(`allows third-party framing on ${path}`, () => {
      const h = headersForPath(path);
      assert.equal(h['X-Frame-Options'], 'ALLOWALL');
      assert.equal(h['Content-Security-Policy'], 'frame-ancestors *');
    });
  }

  it('keeps every framing-permissive rule scoped under /embed', () => {
    // The regression this whole file exists for: a rule that relaxes framing
    // must never be attached to a broader source pattern.
    for (const rule of securityHeaders()) {
      const relaxesFraming = rule.headers.some(
        (h: { key: string; value: string }) =>
          (h.key === 'X-Frame-Options' && h.value.toUpperCase() !== 'DENY') ||
          (h.key === 'Content-Security-Policy' && /frame-ancestors\s+\*/.test(h.value)),
      );
      if (!relaxesFraming) continue;
      assert.equal(
        rule.source,
        EMBED_SOURCE,
        `framing-permissive headers must stay on ${EMBED_SOURCE}, found on ${rule.source}`,
      );
    }
  });

  it('has exactly one framing-permissive rule', () => {
    const permissive = securityHeaders().filter((r) =>
      r.headers.some((h: { key: string }) => h.key === 'Content-Security-Policy'),
    );
    assert.equal(permissive.length, 1, 'only /embed should carry a Content-Security-Policy today');
  });
});

describe('security headers: CORS stays on /api', () => {
  it('sends the extension-compatible CORS headers on /api routes', () => {
    // The wildcard is intentional: the extension's worker sends no Origin.
    const h = headersForPath('/api/bookmarks');
    assert.equal(h['Access-Control-Allow-Origin'], '*');
    assert.equal(h['Access-Control-Allow-Methods'], 'GET, POST, PUT, DELETE, OPTIONS');
    assert.equal(h['Access-Control-Allow-Headers'], 'Content-Type, Authorization');
  });

  it('does not send CORS headers on page routes', () => {
    for (const path of ['/', '/dashboard', '/v/abc123', '/embed/abc123', '/apiary']) {
      assert.equal(
        headersForPath(path)['Access-Control-Allow-Origin'],
        undefined,
        `${path} must not advertise a wildcard CORS origin`,
      );
    }
  });
});

describe('security headers: source matching', () => {
  it('matches prefixes on a path-segment boundary', () => {
    assert.equal(matchesSource('/api/:path*', '/api/bookmarks'), true);
    assert.equal(matchesSource('/api/:path*', '/api'), true);
    assert.equal(matchesSource('/api/:path*', '/apiary'), false);
    assert.equal(matchesSource('/:path*', '/anything/at/all'), true);
  });

  it('refuses a pattern style it was not written to handle', () => {
    // Forces a new source shape in next.config to come with a matcher update,
    // instead of silently being treated as "matches nothing".
    assert.throws(() => matchesSource('/exact-path', '/exact-path'), /unsupported header source/);
  });
});
