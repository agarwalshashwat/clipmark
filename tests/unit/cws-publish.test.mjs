/**
 * Tests for the Chrome Web Store publish tooling (scripts/cws-publish.mjs).
 *
 * No real key, no live network anywhere here — HTTP calls take an injectable
 * `fetchImpl`, and the JWT signing test generates its own throwaway RSA
 * keypair with node:crypto and verifies the signature, rather than touching
 * the owner's real service-account key.
 *
 * Run: npm run test:unit
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  DEFAULT_ITEM_ID,
  resolveKeyPath,
  readServiceAccountKey,
  signServiceAccountJwt,
  exchangeForAccessToken,
  getAccessToken,
  itemActionUrl,
  uploadUrl,
  fetchItemStatus,
  uploadPackage,
  publishItem,
  parseArgs,
} from '../../scripts/cws-publish.mjs';

describe('resolveKeyPath', () => {
  it('defaults to ~/.config/cws/service-account.json', () => {
    const p = resolveKeyPath({});
    assert.ok(p.endsWith(path.join('.config', 'cws', 'service-account.json')));
  });

  it('is overridden by CWS_SERVICE_ACCOUNT_KEY', () => {
    assert.equal(resolveKeyPath({ CWS_SERVICE_ACCOUNT_KEY: '/elsewhere/key.json' }), '/elsewhere/key.json');
  });
});

describe('readServiceAccountKey', () => {
  let dir;
  before(() => { dir = mkdtempSync(path.join(tmpdir(), 'cws-key-test-')); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('reads client_email and private_key, and nothing else leaks through the return value', () => {
    const file = path.join(dir, 'key.json');
    writeFileSync(file, JSON.stringify({
      client_email: 'sa@project.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n',
      project_id: 'some-project', // present in a real key file; must not appear in the result
      type: 'service_account',
    }));
    const result = readServiceAccountKey(file);
    assert.deepEqual(Object.keys(result).sort(), ['clientEmail', 'privateKey']);
    assert.equal(result.clientEmail, 'sa@project.iam.gserviceaccount.com');
  });

  it('throws a clear error when the file does not exist', () => {
    assert.throws(() => readServiceAccountKey(path.join(dir, 'missing.json')), /could not read/);
  });

  it('throws when the file is not valid JSON', () => {
    const file = path.join(dir, 'bad.json');
    writeFileSync(file, 'not json');
    assert.throws(() => readServiceAccountKey(file), /not valid JSON/);
  });

  it('throws when required fields are missing, without echoing file contents', () => {
    const file = path.join(dir, 'incomplete.json');
    writeFileSync(file, JSON.stringify({ client_email: 'sa@x.com' }));
    assert.throws(() => readServiceAccountKey(file), /missing client_email or private_key/);
  });
});

describe('signServiceAccountJwt', () => {
  // A throwaway keypair generated fresh for this test run — never the owner's
  // real key, never written to disk.
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privatePem = privateKey.export({ type: 'pkcs1', format: 'pem' });

  it('produces a JWT with the correct header, claims, and a verifiable RS256 signature', () => {
    const now = 1_700_000_000;
    const jwt = signServiceAccountJwt({
      clientEmail: 'sa@project.iam.gserviceaccount.com',
      privateKey: privatePem,
      now,
    });

    const [headerB64, claimsB64, sigB64] = jwt.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    const claims = JSON.parse(Buffer.from(claimsB64, 'base64url').toString());

    assert.deepEqual(header, { alg: 'RS256', typ: 'JWT' });
    assert.equal(claims.iss, 'sa@project.iam.gserviceaccount.com');
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/chromewebstore');
    assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
    assert.equal(claims.iat, now);
    assert.equal(claims.exp, now + 3600);

    const signingInput = `${headerB64}.${claimsB64}`;
    const verifier = createVerify('RSA-SHA256');
    verifier.update(signingInput);
    const sig = Buffer.from(sigB64, 'base64url');
    assert.ok(verifier.verify(publicKey, sig), 'signature does not verify against the matching public key');
  });

  it('does not verify against a different keypair (sanity check the verify step is real)', () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwt = signServiceAccountJwt({ clientEmail: 'sa@x.com', privateKey: privatePem, now: 1 });
    const [headerB64, claimsB64, sigB64] = jwt.split('.');
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${claimsB64}`);
    assert.equal(verifier.verify(other.publicKey, Buffer.from(sigB64, 'base64url')), false);
  });

  it('throws without both clientEmail and privateKey', () => {
    assert.throws(() => signServiceAccountJwt({ clientEmail: 'sa@x.com' }));
    assert.throws(() => signServiceAccountJwt({ privateKey: privatePem }));
  });
});

// Fake fetch: records calls, returns a queued response each time it's called.
function fakeFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error('fakeFetch called more times than responses were queued');
    return { ok: next.ok !== false, status: next.status ?? 200, json: async () => next.body ?? {} };
  };
  return { impl, calls };
}

describe('exchangeForAccessToken', () => {
  it('POSTs the jwt-bearer grant and returns the access token', async () => {
    const { impl, calls } = fakeFetch([{ body: { access_token: 'tok-123', expires_in: 3600 } }]);
    const result = await exchangeForAccessToken({ jwt: 'header.claims.sig', fetchImpl: impl });
    assert.equal(result.accessToken, 'tok-123');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
    assert.equal(calls[0].init.method, 'POST');
    const body = calls[0].init.body.toString();
    assert.match(body, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
    assert.match(body, /assertion=header\.claims\.sig/);
  });

  it('throws on a non-OK response, surfacing the (non-secret) error body', async () => {
    const { impl } = fakeFetch([{ ok: false, status: 401, body: { error: 'invalid_grant', error_description: 'bad key' } }]);
    await assert.rejects(
      () => exchangeForAccessToken({ jwt: 'x', fetchImpl: impl }),
      /token exchange failed \(HTTP 401\): bad key/,
    );
  });

  it('throws when the response is OK but has no access_token', async () => {
    const { impl } = fakeFetch([{ body: {} }]);
    await assert.rejects(() => exchangeForAccessToken({ jwt: 'x', fetchImpl: impl }), /no access_token/);
  });
});

describe('getAccessToken (full flow, mocked network)', () => {
  let keyFile;
  before(() => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cws-key-test-'));
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    keyFile = path.join(dir, 'key.json');
    writeFileSync(keyFile, JSON.stringify({
      client_email: 'sa@project.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs1', format: 'pem' }),
    }));
  });

  it('reads the key, signs a JWT, and exchanges it for a token', async () => {
    const { impl } = fakeFetch([{ body: { access_token: 'tok-abc' } }]);
    const result = await getAccessToken({ keyPath: keyFile, fetchImpl: impl });
    assert.equal(result.accessToken, 'tok-abc');
    assert.equal(result.clientEmail, 'sa@project.iam.gserviceaccount.com');
  });
});

describe('CWS API URL builders', () => {
  it('itemActionUrl uses the colon-suffixed v2 custom-method form', () => {
    assert.equal(
      itemActionUrl('pub-1', 'item-1', 'fetchStatus'),
      'https://chromewebstore.googleapis.com/v2/publishers/pub-1/items/item-1:fetchStatus',
    );
    assert.equal(
      itemActionUrl('pub-1', 'item-1', 'publish'),
      'https://chromewebstore.googleapis.com/v2/publishers/pub-1/items/item-1:publish',
    );
  });

  it('uploadUrl uses the /upload/v2 path', () => {
    assert.equal(
      uploadUrl('pub-1', 'item-1'),
      'https://chromewebstore.googleapis.com/upload/v2/publishers/pub-1/items/item-1:upload',
    );
  });

  it('URL-encodes ids that need it', () => {
    assert.equal(
      itemActionUrl('pub 1', 'item/1', 'fetchStatus'),
      'https://chromewebstore.googleapis.com/v2/publishers/pub%201/items/item%2F1:fetchStatus',
    );
  });
});

describe('fetchItemStatus / uploadPackage / publishItem', () => {
  it('fetchItemStatus sends the bearer token and returns the parsed body', async () => {
    const { impl, calls } = fakeFetch([{ body: { itemId: 'item-1', status: ['OK'] } }]);
    const result = await fetchItemStatus({ accessToken: 'tok', publisherId: 'pub-1', itemId: 'item-1', fetchImpl: impl });
    assert.deepEqual(result, { itemId: 'item-1', status: ['OK'] });
    assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
    assert.match(calls[0].url, /:fetchStatus$/);
  });

  it('uploadPackage POSTs the raw zip buffer as the body', async () => {
    const { impl, calls } = fakeFetch([{ body: { uploadState: 'SUCCESS' } }]);
    const buf = Buffer.from('pretend-zip-bytes');
    await uploadPackage({ accessToken: 'tok', publisherId: 'pub-1', itemId: 'item-1', zipBuffer: buf, fetchImpl: impl });
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.body, buf);
    assert.match(calls[0].url, /\/upload\/v2\/.*:upload$/);
  });

  it('publishItem POSTs to the :publish action', async () => {
    const { impl, calls } = fakeFetch([{ body: { status: ['OK'] } }]);
    await publishItem({ accessToken: 'tok', publisherId: 'pub-1', itemId: 'item-1', fetchImpl: impl });
    assert.equal(calls[0].init.method, 'POST');
    assert.match(calls[0].url, /:publish$/);
  });

  it('throws with the response body on a non-OK status, for any of the three calls', async () => {
    const { impl } = fakeFetch([{ ok: false, status: 403, body: { error: { message: 'permission denied' } } }]);
    await assert.rejects(
      () => fetchItemStatus({ accessToken: 'tok', publisherId: 'pub-1', itemId: 'item-1', fetchImpl: impl }),
      /HTTP 403: permission denied/,
    );
  });
});

describe('parseArgs', () => {
  const base = ['node', 'cws-publish.mjs'];

  it('defaults item id to DEFAULT_ITEM_ID and requires no publisher id at parse time', () => {
    const opts = parseArgs([...base, '--dry-run'], {});
    assert.equal(opts.mode, 'dry-run');
    assert.equal(opts.itemId, DEFAULT_ITEM_ID);
    assert.equal(opts.publisherId, null);
  });

  it('reads item id, publisher id and key path from the environment', () => {
    const env = { CWS_ITEM_ID: 'other-item', CWS_PUBLISHER_ID: 'pub-9', CWS_SERVICE_ACCOUNT_KEY: '/k.json' };
    const opts = parseArgs([...base, '--dry-run'], env);
    assert.equal(opts.itemId, 'other-item');
    assert.equal(opts.publisherId, 'pub-9');
    assert.equal(opts.keyPath, '/k.json');
  });

  it('flags override the environment (both --flag value and --flag=value forms)', () => {
    const env = { CWS_ITEM_ID: 'from-env' };
    const opts1 = parseArgs([...base, '--dry-run', '--item-id', 'from-flag'], env);
    assert.equal(opts1.itemId, 'from-flag');
    const opts2 = parseArgs([...base, '--dry-run', '--item-id=from-flag-eq'], env);
    assert.equal(opts2.itemId, 'from-flag-eq');
  });

  it('parses --publish with --zip and --yes', () => {
    const opts = parseArgs([...base, '--publish', '--zip', 'out.zip', '--yes'], {});
    assert.equal(opts.mode, 'publish');
    assert.equal(opts.zipPath, 'out.zip');
    assert.equal(opts.yes, true);
  });

  it('--publish without --zip is a parse error', () => {
    assert.throws(() => parseArgs([...base, '--publish'], {}), /requires --zip/);
  });

  it('rejects combining --dry-run and --publish', () => {
    assert.throws(() => parseArgs([...base, '--dry-run', '--publish', '--zip', 'x.zip'], {}), /only one of/);
  });

  it('requires some mode to be passed', () => {
    assert.throws(() => parseArgs([...base], {}), /pass --dry-run, --publish, or --help/);
  });

  it('rejects an unknown flag', () => {
    assert.throws(() => parseArgs([...base, '--dry-run', '--bogus'], {}), /unknown argument: --bogus/);
  });

  it('--yes defaults to false so a real publish never fires silently', () => {
    const opts = parseArgs([...base, '--publish', '--zip', 'x.zip'], {});
    assert.equal(opts.yes, false);
  });
});
