/**
 * /api/comments rate-limit unit tests (security PR).
 *
 * This route is intentionally unauthenticated, which previously made it an
 * open proxy for the server's own YOUTUBE_API_KEY quota. No YOUTUBE_API_KEY is
 * set in the unit-test env (see fixtures/env-setup.mjs), so a request that
 * gets PAST the rate limiter always lands on the 503 "not configured" branch —
 * that's how these tests prove a request reached (or didn't reach) the real
 * proxied call without ever hitting the network.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../../app/api/comments/route.js';
import { makeRequest } from './fixtures/fakes.js';

function reqFrom(ip: string, videoId = 'aircAruvnKk') {
  return makeRequest({
    url: `http://localhost/api/comments?videoId=${videoId}`,
    method: 'GET',
    headers: { 'x-forwarded-for': ip },
  });
}

describe('/api/comments rate limiting (security PR)', () => {
  it('a fresh IP is not rate-limited — falls through to the config check', async () => {
    const res = await GET(reqFrom('rl-fresh-ip'));
    assert.equal(res.status, 503, 'no YOUTUBE_API_KEY in test env — proves we got past the limiter');
  });

  it('the 20th request in the window still gets through, the 21st is rate-limited', async () => {
    const ip = 'rl-boundary-ip';
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      statuses.push((await GET(reqFrom(ip))).status);
    }
    assert.equal(statuses[19], 503, '20th request reaches the config check');
    assert.equal(statuses[20], 429, '21st request is rate-limited');
    assert.deepEqual(await (await GET(reqFrom(ip))).json(), { error: 'Too many requests' });
  });

  it('tracks separate IPs independently', async () => {
    const ipA = 'rl-multi-ip-a';
    const ipB = 'rl-multi-ip-b';
    for (let i = 0; i < 21; i++) await GET(reqFrom(ipA));
    assert.equal((await GET(reqFrom(ipA))).status, 429, 'ipA is now limited');
    assert.equal((await GET(reqFrom(ipB))).status, 503, 'a fresh ipB is unaffected by ipA\'s traffic');
  });

  it('parses the client IP from the first entry of a multi-hop x-forwarded-for chain', async () => {
    const chainIp = 'rl-chain-ip, 10.0.0.1, 10.0.0.2';
    const res = await GET(reqFrom(chainIp));
    assert.equal(res.status, 503, 'the header was parsed and the request reached the config check normally');
  });
});
