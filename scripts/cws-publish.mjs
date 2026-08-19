#!/usr/bin/env node
/**
 * Chrome Web Store publish tooling — authenticate with a service account and
 * talk to the CWS API v2 (chromewebstore.googleapis.com/v2) directly. No
 * client library: the whole auth flow is Google's standard OAuth2
 * service-account JWT-bearer exchange (RS256, signed with node:crypto — no
 * dependency needed), and the three API calls are plain fetch() against
 * documented REST endpoints.
 *
 *   node scripts/cws-publish.mjs --dry-run [--item-id ID] [--publisher-id ID]
 *   node scripts/cws-publish.mjs --publish --zip PATH [--yes] [--item-id ID] [--publisher-id ID]
 *
 * --dry-run is strictly read-only: it authenticates and calls `fetchStatus` to
 * prove the key + item id + publisher id actually resolve to something. It
 * never uploads or publishes.
 *
 * --publish is the real, irreversible action (upload + submit for review). It
 * refuses to run without either a `--yes` flag or a live TTY confirmation —
 * see confirmPublish(). There is no default that fires it.
 *
 * Credential handling:
 *   - The service-account key is read ONLY from CWS_SERVICE_ACCOUNT_KEY (env)
 *     or, if unset, ~/.config/cws/service-account.json. Never from a repo path,
 *     never from an argument holding the key material itself.
 *   - Neither the private key, the signed JWT, nor the resulting access token
 *     is ever written to stdout/stderr, logged, or included in an error
 *     message. The service-account EMAIL is printed on success — it is an
 *     identifier, not a secret, and confirms which credential authenticated.
 *
 * Publisher id has no programmatic lookup (Google's docs: find it in the CWS
 * Developer Dashboard under Publisher > Settings) — it must be supplied via
 * CWS_PUBLISHER_ID or --publisher-id, and this refuses to guess one.
 *
 * Item id DOES have a per-repo default (DEFAULT_ITEM_ID below) since each repo
 * in the fleet publishes exactly one extension; override with --item-id or
 * CWS_ITEM_ID for a different one.
 */
import { createHash, createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const CWS_SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
export const CWS_API_BASE = 'https://chromewebstore.googleapis.com';

// ClipMark's own Chrome Web Store item id. Override via --item-id / CWS_ITEM_ID
// for any other extension this tooling is pointed at.
export const DEFAULT_ITEM_ID = 'iboippnihpcnnglgboaiedaiimbiolgg';

// ─── Key resolution + reading ────────────────────────────────────────────────

/** @param {NodeJS.ProcessEnv} env */
export function resolveKeyPath(env = process.env) {
  return env.CWS_SERVICE_ACCOUNT_KEY || path.join(homedir(), '.config', 'cws', 'service-account.json');
}

/**
 * Read + validate the service-account key. Returns only the two fields the
 * JWT flow needs — never the raw file contents — so a caller that only logs
 * what this returns still can't leak anything beyond the (non-secret) email.
 */
export function readServiceAccountKey(keyPath) {
  let raw;
  try {
    raw = readFileSync(keyPath, 'utf8');
  } catch (err) {
    throw new Error(`could not read the CWS service-account key at ${keyPath} (${err.code || err.message}).`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${keyPath} is not valid JSON — is this really a service-account key file?`);
  }
  const clientEmail = parsed.client_email;
  const privateKey = parsed.private_key;
  if (!clientEmail || !privateKey) {
    throw new Error(`${keyPath} is missing client_email or private_key — is this really a service-account key file?`);
  }
  return { clientEmail, privateKey };
}

// ─── Service-account JWT-bearer auth ─────────────────────────────────────────
// https://developers.google.com/identity/protocols/oauth2/service-account#httprest

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

/**
 * Build and RS256-sign the assertion. Pure and synchronous — no network, no
 * file I/O — with `now` injectable so tests are deterministic.
 */
export function signServiceAccountJwt({
  clientEmail,
  privateKey,
  scope = CWS_SCOPE,
  audience = TOKEN_URL,
  now = Math.floor(Date.now() / 1000),
} = {}) {
  if (!clientEmail || !privateKey) throw new Error('signServiceAccountJwt needs clientEmail and privateKey.');
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = { iss: clientEmail, scope, aud: audience, iat: now, exp: now + 3600 };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey, 'base64url');
  return `${signingInput}.${signature}`;
}

/**
 * Exchange a signed JWT for an access token. `fetchImpl` is injectable so
 * tests never touch the network.
 */
export async function exchangeForAccessToken({ jwt, fetchImpl = fetch, tokenUrl = TOKEN_URL } = {}) {
  const res = await fetchImpl(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    // Google's token-endpoint error bodies (error / error_description) carry no
    // secret material — safe to surface, and often the only signal that the
    // service account was never granted CWS API access in the dashboard.
    throw new Error(`token exchange failed (HTTP ${res.status}): ${body.error_description || body.error || 'no access_token in the response'}`);
  }
  return { accessToken: body.access_token, expiresIn: body.expires_in };
}

/** Full auth flow: key file -> signed JWT -> access token. */
export async function getAccessToken({ keyPath, fetchImpl = fetch } = {}) {
  const { clientEmail, privateKey } = readServiceAccountKey(keyPath);
  const jwt = signServiceAccountJwt({ clientEmail, privateKey });
  const { accessToken } = await exchangeForAccessToken({ jwt, fetchImpl });
  return { accessToken, clientEmail };
}

// ─── Chrome Web Store API v2 ─────────────────────────────────────────────────
// https://developer.chrome.com/docs/webstore/using-api — colon-suffixed custom
// methods, publisher id + item id both required in every path.

export function itemActionUrl(publisherId, itemId, action) {
  return `${CWS_API_BASE}/v2/publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(itemId)}:${action}`;
}

export function uploadUrl(publisherId, itemId) {
  return `${CWS_API_BASE}/upload/v2/publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(itemId)}:upload`;
}

async function callCwsApi(url, { accessToken, fetchImpl = fetch, ...init } = {}) {
  const res = await fetchImpl(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${url} -> HTTP ${res.status}: ${body.error?.message || JSON.stringify(body)}`);
  }
  return body;
}

/** Read-only. This is the whole of --dry-run's proof that auth + the item mapping work. */
export function fetchItemStatus({ accessToken, publisherId, itemId, fetchImpl } = {}) {
  return callCwsApi(itemActionUrl(publisherId, itemId, 'fetchStatus'), { accessToken, fetchImpl });
}

export function uploadPackage({ accessToken, publisherId, itemId, zipBuffer, fetchImpl } = {}) {
  return callCwsApi(uploadUrl(publisherId, itemId), { accessToken, fetchImpl, method: 'POST', body: zipBuffer });
}

export function publishItem({ accessToken, publisherId, itemId, fetchImpl } = {}) {
  return callCwsApi(itemActionUrl(publisherId, itemId, 'publish'), { accessToken, fetchImpl, method: 'POST' });
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

export function parseArgs(argv, env = process.env) {
  const args = argv.slice(2);
  const opts = {
    mode: null, // 'dry-run' | 'publish' | 'help'
    itemId: env.CWS_ITEM_ID || DEFAULT_ITEM_ID,
    publisherId: env.CWS_PUBLISHER_ID || null,
    zipPath: null,
    keyPath: resolveKeyPath(env),
    yes: false,
  };
  const setMode = (m) => {
    if (opts.mode) throw new Error(`pass only one of --dry-run, --publish, --help (got both ${opts.mode} and ${m})`);
    opts.mode = m;
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const eq = a.indexOf('=');
    const [flag, inlineValue] = eq === -1 ? [a, undefined] : [a.slice(0, eq), a.slice(eq + 1)];
    const takeValue = () => (inlineValue !== undefined ? inlineValue : args[++i]);
    switch (flag) {
      case '--dry-run': setMode('dry-run'); break;
      case '--publish': setMode('publish'); break;
      case '-h': case '--help': setMode('help'); break;
      case '--yes': case '-y': opts.yes = true; break;
      case '--item-id': opts.itemId = takeValue(); break;
      case '--publisher-id': opts.publisherId = takeValue(); break;
      case '--zip': opts.zipPath = takeValue(); break;
      case '--key': opts.keyPath = takeValue(); break;
      default: throw new Error(`unknown argument: ${a}`);
    }
  }
  if (!opts.mode) throw new Error('pass --dry-run, --publish, or --help');
  if (opts.mode === 'publish' && !opts.zipPath) throw new Error('--publish requires --zip <path-to-zip>');
  return opts;
}

const USAGE = `
Chrome Web Store publish tooling.

  node scripts/cws-publish.mjs --dry-run [--item-id ID] [--publisher-id ID] [--key PATH]
      Read-only: authenticates and fetches the item's current status.
      Never uploads, never publishes.

  node scripts/cws-publish.mjs --publish --zip PATH [--yes] [--item-id ID] [--publisher-id ID] [--key PATH]
      Uploads PATH and submits it for review. Irreversible once it passes
      review. Prompts for interactive confirmation unless --yes is passed.

Config, in precedence order (flag > env > repo default):
  --item-id / CWS_ITEM_ID           default: ${DEFAULT_ITEM_ID} (ClipMark)
  --publisher-id / CWS_PUBLISHER_ID no default — required, see CWS Developer
                                     Dashboard > Publisher > Settings
  --key / CWS_SERVICE_ACCOUNT_KEY   default: ~/.config/cws/service-account.json
`;

async function confirmPublish({ itemId, publisherId, zipPath, sha256 }) {
  if (!process.stdin.isTTY) {
    throw new Error('refusing to publish without --yes: stdin is not an interactive TTY, so there is no one to confirm.');
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question(
      `\nAbout to PUBLISH:\n  zip:       ${zipPath}\n  sha256:    ${sha256}\n  item:      ${itemId}\n  publisher: ${publisherId}\n\nThis uploads and submits for review. There is no unpublish once it passes.\nType "yes" to continue: `,
      resolve,
    );
  });
  rl.close();
  if (answer.trim().toLowerCase() !== 'yes') throw new Error('publish cancelled.');
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.mode === 'help') {
    console.log(USAGE);
    return;
  }
  if (!opts.publisherId) {
    throw new Error(
      'no publisher id given — pass --publisher-id or set CWS_PUBLISHER_ID. ' +
        'Find it in the CWS Developer Dashboard under Publisher > Settings; ' +
        "there is no API to look it up, and this tool won't guess one.",
    );
  }

  console.log(`→ reading the service-account key from ${opts.keyPath}`);
  const { accessToken, clientEmail } = await getAccessToken({ keyPath: opts.keyPath });
  console.log(`✓ authenticated as ${clientEmail}`); // the account email, not a secret

  if (opts.mode === 'dry-run') {
    console.log(`→ fetching status for item ${opts.itemId} (publisher ${opts.publisherId})`);
    const status = await fetchItemStatus({ accessToken, publisherId: opts.publisherId, itemId: opts.itemId });
    console.log(`✓ item is visible to this credential — nothing was uploaded or published.`);
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  // --publish
  const zipBuffer = readFileSync(opts.zipPath);
  const sha256 = createHash('sha256').update(zipBuffer).digest('hex');
  if (!opts.yes) {
    await confirmPublish({ itemId: opts.itemId, publisherId: opts.publisherId, zipPath: opts.zipPath, sha256 });
  }

  console.log(`→ uploading ${opts.zipPath} (${zipBuffer.length} bytes, sha256 ${sha256})`);
  await uploadPackage({ accessToken, publisherId: opts.publisherId, itemId: opts.itemId, zipBuffer });
  console.log('✓ uploaded');

  console.log('→ submitting for review');
  const result = await publishItem({ accessToken, publisherId: opts.publisherId, itemId: opts.itemId });
  console.log('✓ submitted for review');
  console.log(JSON.stringify(result, null, 2));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(`\n✗ ${err.message}\n`);
    process.exit(1);
  });
}
