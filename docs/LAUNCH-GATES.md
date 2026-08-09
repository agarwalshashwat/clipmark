# Launch Gates — Owner Checklist

Two things stand between ClipMark and a live launch: the Dodo **LIVE** webhook
(so a real payment grants Pro) and the Chrome Web Store submission. Both
gates' final actions are dashboard clicks only the account owner can do —
this doc gives the exact values and steps so there's no guessing.

Verified against `main` @ `68b86e4` (2026-08-04) from an isolated worktree —
no production database or webhook config was touched.

---

## Gate 1 — Dodo LIVE webhook

### What the code actually does (verified from source)

- **Endpoint:** `POST /api/webhooks/dodo` → `https://clipmark.mithahara.com/api/webhooks/dodo`
  ([route.ts](../webapp/app/api/webhooks/dodo/route.ts) → [handler.ts](../webapp/app/api/webhooks/dodo/handler.ts))
- **Signature verification:** `dodo.webhooks.unwrap()` against the
  `webhook-id` / `webhook-signature` / `webhook-timestamp` headers, keyed by
  **`DODO_PAYMENTS_WEBHOOK_SECRET`** ([lib/clients.ts:29](../webapp/lib/clients.ts)).
  A bad/missing signature short-circuits before any event logic runs.
- **Events handled** (exactly these six `if/else if` branches — anything else
  is accepted with a 200 and silently ignored):
  | Event | Effect |
  |---|---|
  | `payment.succeeded` | Grants `is_pro`, stores `pro_payment_id`; records affiliate/referral conversion once |
  | `subscription.active` | Grants `is_pro`, stores `subscription_id` + billing dates; records affiliate/referral conversion once |
  | `subscription.renewed` | Extends `subscription_period_end` |
  | `subscription.cancelled` | Revokes `is_pro` (unless an active gifted-Pro window covers the user) |
  | `subscription.expired` | Same revoke as above |
  | `refund.succeeded` | Cancels pending affiliate commission, revokes `is_pro` for the refunded lifetime purchase, reverses any referral reward it earned |
- **Also reads at runtime:** `DODO_PAYMENTS_API_KEY` (live/test key),
  `DODO_MONTHLY_PRODUCT_ID`, `DODO_ANNUAL_PRODUCT_ID`, `DODO_LIFETIME_PRODUCT_ID`
  (plan-mapping in `subscription.active` only compares against
  `DODO_ANNUAL_PRODUCT_ID`; anything else is treated as `monthly`).
- **Retry behavior:** an entitlement DB write failure throws inside the
  handler → **500**, which makes Dodo redeliver. A signature failure returns
  **401** immediately and is never retried (that's correct — Dodo won't retry
  a bad signature either way).

### ⚠️ Found while verifying — read before testing

1. **Sentry will NOT show you a signature failure or a write failure from
   this webhook.** `sentry-config.ts` has no console-capture integration, and
   the handler's own `try/catch` returns a normal JSON response instead of
   rethrowing — so neither the 401 nor the 500 path ever reaches Sentry's
   automatic route-handler capture. **Vercel's function logs are the only
   place these show up.** Sentry (`clipmark-web` project) will only light up
   for a genuinely unhandled exception elsewhere in the request (e.g. a bug
   before the handler's try/catch engages) — don't rely on it for this test.
2. **A dashboard "send test event" won't prove entitlement grant.** Dodo's
   synthetic test events typically carry no real `metadata.user_id` matching
   a profile row, so you'll see the `received type=...` log line and a 200,
   but never `granted pro`. That's expected — it proves signature+delivery
   only. To prove the entitlement side, do one real **live** low-value
   purchase (or a test-mode purchase locally, which already works per
   `docs/OWNER_SETUP_CHECKLIST.md` §D).
3. ~~The extension's manifest/package version has never been bumped past
   `1.0.0`/`1.0`~~ — **fixed**: bumped to `1.0.1` and merged to `main` (see
   Gate 2 below). Flagged here because both gates are in this doc.

### Owner checklist

**A. Create the LIVE webhook in Dodo**
1. Dodo dashboard → switch the mode toggle to **Live**.
2. Webhooks → **Add endpoint**. URL:
   ```
   https://clipmark.mithahara.com/api/webhooks/dodo
   ```
3. Subscribe to exactly these six events (no more, no less):
   `payment.succeeded`, `subscription.active`, `subscription.renewed`,
   `subscription.cancelled`, `subscription.expired`, `refund.succeeded`.
4. Save, then reveal/copy the **signing secret** (`whsec_...`).

**B. Set Vercel Production env vars**
Vercel → `clipmark` project → Settings → Environment Variables → **Production** scope:

| Variable | Value |
|---|---|
| `DODO_PAYMENTS_WEBHOOK_SECRET` | the live signing secret from step A4 |
| `DODO_PAYMENTS_API_KEY` | confirm it's the **live** key (not test) |
| `DODO_MONTHLY_PRODUCT_ID` | confirm it's the **live** product id |
| `DODO_ANNUAL_PRODUCT_ID` | confirm it's the **live** product id |
| `DODO_LIFETIME_PRODUCT_ID` | confirm it's the **live** product id |

5. **Trigger a redeploy** after saving — Vercel snapshots env vars per
   deployment, so an existing running deployment won't pick up a changed
   secret without a fresh deploy (same rule `docs/OWNER_SETUP_CHECKLIST.md`
   §C2 calls out for the Sentry DSN).

**C. Test it**
6. From Dodo's dashboard, use **send test event** (or replay) against the new
   endpoint for at least `payment.succeeded` and one `subscription.*` event.
   Expect: Dodo dashboard shows delivery succeeded (2xx).
7. Confirm in Vercel: Project → **Logs** (or `vercel logs --prod`), filter/search
   `[dodo-webhook]`. Expect a line like:
   ```
   [dodo-webhook] received type=payment.succeeded webhook-id=<id>
   ```
   A bad secret instead produces:
   ```
   [dodo-webhook] signature verification failed webhook-id=<id>
   ```
   with an HTTP 401 in the Dodo dashboard's delivery log — if you see that,
   the secret in Vercel doesn't match the one Dodo just gave you (mode
   mismatch is the usual cause: live secret in Dodo vs. an old test secret in
   Vercel, or vice versa).
8. To prove real entitlement grant end-to-end, make one real live purchase
   (or use a local test-mode run per §D of `docs/OWNER_SETUP_CHECKLIST.md`)
   and confirm the log line `granted pro user=<id> payment=<id>` appears, and
   that the account shows Pro in the dashboard.
9. Check Sentry (`clipmark-web` project, org `mithahara`) only as a sanity
   check for *unexpected* errors during the test window — per the caveat
   above, it won't show the two error paths you're actually testing for.

---

## Gate 2 — Chrome Web Store submission

### What was verified

Built fresh from `main` @ `68b86e4` via `make ext-zip`:

- **Manifest name/short_name:** `"ClipMark"` — correct casing (fixed in
  [PR #58](https://github.com/agarwalshashwat/clipmark/pull/58), already on
  `main`).
- **Permissions:** `storage`, `activeTab`, `contextMenus`, `sidePanel`,
  `alarms`, `notifications` — no `tabs`, no `<all_urls>`.
- **Host permissions:** `*://www.youtube.com/*` and
  `https://clipmark.mithahara.com/*` only.
- **Content scripts / background / side panel:** all reference bundled,
  hashed `assets/*.js` files inside `dist/` — not raw `src/*.js` — confirming
  this is a real production build, not the dev source tree. The only
  `"localhost"` string in the built output is a runtime dev-mode string
  comparison (`API_BASE.includes("localhost")`); the actual baked-in
  `API_BASE` is `https://clipmark.mithahara.com`.
- **Result:** a valid, loadable MV3 build. `extension/scripts/api-base-guard.mjs`
  and `content-globals-guard.mjs` both ran as part of the build and didn't fail it.

### ⚠️ Found while verifying — one fixed, one still open

- **Version number — fixed.** `extension/manifest.json` and
  `extension/package.json` both said `"1.0.0"` and had never been bumped
  across the entire git history, through the Sentry wiring, the
  usage-caps/paywall work, the brand casing fix, and the guided tour. Owner
  confirmed the published beta is at `1.0.0`, so both files are now bumped to
  **`1.0.1`** and that bump is merged to `main` — the zip below already
  reflects it. (If a future re-upload also gets rejected for the same
  reason, it means something was uploaded at `1.0.1` outside this repo's
  history — check the dashboard's current published version before bumping
  again.)
- **No permission-justification / single-purpose text exists anywhere in the
  repo.** The CWS dashboard requires a written justification for
  `host_permissions` and a one-line "single purpose" description before it
  will accept a submission with host permissions. Paste-ready drafts, based
  on what the code actually does:

  | Field | Suggested text |
  |---|---|
  | Single purpose | "ClipMark lets users bookmark specific timestamps in YouTube videos, review them with spaced-repetition flashcards (Active Recall), and export to Anki." |
  | `*://www.youtube.com/*` justification | "Our content script runs on YouTube watch pages to add a bookmark button to the player, mark saved timestamps on the progress bar, and show the Active Recall review overlay. We don't access any other site." |
  | `https://clipmark.mithahara.com/*` justification | "Our own first-party backend (clipmark.mithahara.com) — used by the side panel/dashboard to sync bookmarks, sign in, and check Pro status." |
  | `activeTab` justification | "Used only when the user clicks the extension action or a keyboard shortcut, to read the current YouTube tab's video ID and playback time." |
  | Privacy policy URL | `https://clipmark.mithahara.com/privacy` (already live) |

### v1.0.2 — new `scripting` permission (affects the CWS submission)

Everything above describes the `1.0.1` submission. **`1.0.2` adds one new
permission, `scripting`**, so the re-upload needs a justification for it that
the `1.0.1` submission did not have. Host permissions are unchanged
(`*://www.youtube.com/*` and `https://clipmark.mithahara.com/*` only), and no
permission was removed.

Why it's needed: Chrome injects declared `content_scripts` on navigation only,
so every YouTube tab that was already open when the extension installed had no
content script and every feature that talks to it failed until the user
reloaded the tab by hand. The background worker now replays the manifest's own
`content_scripts` into those tabs on `chrome.runtime.onInstalled`, which
requires `chrome.scripting`.

| Field | Suggested text |
|---|---|
| `scripting` justification | "On install and update, Chrome does not inject our content script into YouTube tabs that are already open, so the extension appears broken in them until the user reloads the tab. We use chrome.scripting solely to inject the same content script the manifest already declares into those already-open YouTube tabs. It is never used on any other site — injection is limited to the manifest's own content_scripts match patterns, and we hold no host permissions beyond youtube.com and our own domain." |

Note this is an added permission, so the re-upload may draw a longer review
than a code-only update.

### Owner checklist

1. **Build the submission zip** from current `main` (already at version
   `1.0.1`):
   ```bash
   make ext-zip
   ```
   Produces `clipmark-extension.zip` at the repo root (~128 KB).
2. **Upload it** in the Web Store Developer Dashboard (item
   `iboippnihpcnnglgboaiedaiimbiolgg`) as a new package version.
3. **Fix the dashboard listing Title casing** — it currently reads `Clipmark`
   (lowercase "m"); replace with `ClipMark — Study Smarter with YouTube
   Flashcards` (see `docs/gtm/chrome-web-store-listing-FIELDS.md`, which is
   current and paste-ready — verified against the live usage-cap constants
   in code: 25 Active Recall segments / 30 reviews/mo / 1 Anki export/mo /
   10 shared collections all match `extension/src/usage-caps.js` and
   `webapp/app/api/share/handler.ts` exactly).
4. Paste the **Summary** and **Description** fields from that doc as-is.
5. Fill in the **single purpose** and **host permission justifications**
   using the drafts above (edit to taste — they're accurate but not
   contractually final).
6. Add the 5 screenshots per the shot checklist in the same doc (not
   something this session can capture — needs the real product UI).
7. Submit for review.

### Package built this session

`make ext-zip` from `main` post-bump — manifest reads `"name": "ClipMark"`,
`"version": "1.0.1"`:

- **Size:** 130,970 bytes (128 KB)
- **SHA-256:** `0e217ee3c20d073854deffab56ee6b0c20ed253fbac98f312e448b9bb801a5bd`

Handed off directly for this submission; going forward, `make ext-zip` from
`main` reproduces it (version bumps for future releases still need a manual
`extension/manifest.json` + `extension/package.json` edit first).

---

## Not covered here

- Actually creating the Dodo webhook, setting Vercel env vars, bumping the
  extension version, and clicking submit in the CWS dashboard are all
  owner-only actions this session cannot perform.
- `docs/OWNER_SETUP_CHECKLIST.md` and `docs/DEPLOYMENTS.md` remain the
  source of truth for the full production env var matrix; this doc only adds
  the Dodo-webhook-specific and CWS-specific steps layered on top.
