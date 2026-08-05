# Dodo LIVE Webhook — Launch Gate Checklist

Owner-only steps (Dodo dashboard + Vercel logins) to turn on real payments.
Everything that could be done in code has already been done in
[PR TBD](#) on branch `feat/dodo-live-webhook-gate` — see "What changed in
code" below. This doc covers only what's left, which only Ash can do.

**Do not run any step here against production until the code PR has merged.**

---

## What changed in code (context, not owner action)

- `webapp/app/api/webhooks/dodo/handler.ts` now reports genuine failures
  (bad signature, DB write failure, any unhandled error) to Sentry via
  `Sentry.captureException`, tagged `webhook: 'dodo'` with the Dodo event
  type and the Dodo-side id (`payment_id`/`subscription_id`) attached as
  context — never the raw signature, webhook body, or a Supabase user id.
  Previously these failures only ever reached Vercel's function logs; this
  was flagged as a known gap in `docs/LAUNCH-GATES.md` §"Found while
  verifying" #1. **That caveat is now resolved** — Sentry will show these.
- HTTP status codes Dodo depends on for retry behavior are unchanged: **401**
  on bad signature (never retried), **500** on a failed entitlement write
  (Dodo redelivers), **200** otherwise. The Sentry call happens alongside the
  existing response, not instead of it.
- Added unit test coverage for `subscription.renewed`, `subscription.expired`,
  and two redelivery/idempotency cases (`tests/unit/webhook-dodo.test.ts`).
  `npx tsc --noEmit`, `npm run test:unit` (100/100), and `next build` all pass.

## Event → entitlement mapping (verified from source, this session)

| Dodo event | Effect on `profiles` | Notes |
|---|---|---|
| `payment.succeeded` | `is_pro=true`, `pro_payment_id=<payment_id>` | One-time/lifetime purchase. Records affiliate/referral credit once (guarded against redelivery by an existing-row count check). |
| `subscription.active` | `is_pro=true`, `subscription_id`, `subscription_started_at`, `subscription_period_end`, `cancel_at_period_end=false` | First activation of Monthly/Annual. Plan is inferred as `annual` only when `product_id === DODO_ANNUAL_PRODUCT_ID`; anything else maps to `monthly`. Records affiliate/referral credit once. |
| `subscription.renewed` | `is_pro=true`, `subscription_period_end`, `cancel_at_period_end=false` | No new affiliate/referral bookkeeping — this isn't a new conversion. |
| `subscription.cancelled` | `is_pro=false` unless an active gifted-Pro window covers the user, `subscription_id=null`, `subscription_period_end=null` | |
| `subscription.expired` | Same as `subscription.cancelled` | |
| `refund.succeeded` | Cancels any pending affiliate commission for that `payment_id`; revokes `is_pro` **only for a lifetime purchase matched by `pro_payment_id`**; reverses any referral reward it earned | See gap below — this branch does **not** look up subscriptions. |

All six writes are idempotent against Dodo redelivery of the *same* event:
entitlement fields are overwritten with the same absolute values each time,
and the affiliate/referral side effects are gated by an existing-row check
rather than a blind insert. There is no `webhook_events`/`webhook-id`
dedup table (`docs/TEST_PLAN_launch.md` already flags this as a known,
lower-priority gap) — it isn't needed for correctness today because every
write above is naturally idempotent, but it remains a nice-to-have for a
future pass if new non-idempotent side effects are ever added to this handler.

### ⚠️ Gap found — confirm during the E2E test below

`refund.succeeded` revokes Pro **only** by matching `pro_payment_id`, which is
set exclusively by `payment.succeeded` (the one-time/lifetime flow). If Ash
refunds a **Monthly or Annual subscription's payment** from the Dodo
dashboard, `refund.succeeded` fires but finds no matching profile — Pro stays
granted. The code comment in `handler.ts` says "subscription refunds are
handled by `subscription.cancelled`/`subscription.expired`", i.e. this
relies on Dodo *also* firing one of those two events when a subscription
payment is refunded.

**This is unverified — it depends on Dodo's own behavior, not this
codebase.** The E2E plan below (buy Monthly, refund it) is exactly the test
that proves or disproves it. If Pro is *not* revoked after the refund, this
is the first place to look — see "If the refund doesn't revoke Pro" at the
bottom of the E2E section.

---

## A. Create the LIVE webhook in Dodo

1. Dodo dashboard → switch the mode toggle to **Live** (top of the dashboard —
   confirm it says "Live", not "Test").
2. **Webhooks** → **Add endpoint**. URL:
   ```
   https://clipmark.mithahara.com/api/webhooks/dodo
   ```
3. Subscribe to **exactly these six events** — no more, no less (anything
   else is silently accepted with a 200 and ignored, which is fine, but
   subscribing to fewer than these six will leave a real gap in entitlement
   handling):
   - `payment.succeeded`
   - `subscription.active`
   - `subscription.renewed`
   - `subscription.cancelled`
   - `subscription.expired`
   - `refund.succeeded`
4. Save. Reveal/copy the **signing secret** (starts `whsec_`) — you'll need
   it in step B. Do not paste it anywhere outside the Vercel env var field in
   step B (not in Slack, not in a doc, not back to this session).

**PASS:** the endpoint shows status "Active" in the Dodo dashboard with all
six events checked.

---

## B. Set Vercel Production env vars

Vercel → `clipmark` project → **Settings** → **Environment Variables** →
scope: **Production** only (not Preview — Preview always runs in
`live_mode` per Dodo's SDK regardless of env, but still points at the
production Supabase project, so it's not a safe place to test against real
money; see `CLAUDE.md`).

| Variable | Value to set |
|---|---|
| `DODO_PAYMENTS_WEBHOOK_SECRET` | the live signing secret from step A4 |
| `DODO_PAYMENTS_API_KEY` | your **live** Dodo API key (confirm it's not the test key already there) |
| `DODO_MONTHLY_PRODUCT_ID` | the **live**-mode Monthly product id from Dodo → Products |
| `DODO_ANNUAL_PRODUCT_ID` | the **live**-mode Annual product id |
| `DODO_LIFETIME_PRODUCT_ID` | the **live**-mode Lifetime product id |

Names only, as requested — the actual secret/key/id values are Ash's to
paste directly into Vercel's UI. Nothing above should ever be typed into
this chat, a commit, or any file in this repo.

5. **Trigger a redeploy** after saving. Vercel snapshots env vars per
   deployment — `NEXT_PUBLIC_*` vars are inlined at build time regardless,
   and this project reads `DODO_PAYMENTS_WEBHOOK_SECRET` etc. via
   `lib/clients.ts`'s memoized getters, which still only see whatever was in
   the environment at the process's cold start. Either redeploy the current
   commit ("Redeploy" in the Vercel dashboard) or push a commit — a bare env
   var save alone will not reach a currently-running function instance.

**PASS:** the Vercel deployment for `main`/production shows a fresh build
timestamp after this step, and Settings → Environment Variables shows all
five rows under Production with no lingering test-mode values.

---

## C. End-to-end verification (buy → confirm grant → refund → confirm revoke)

Do this **after** the code PR is merged and deployed, and after steps A and
B above.

### C1 — Buy the Monthly plan with a real card

1. Go to `https://clipmark.mithahara.com/upgrade` signed in as a real test
   account (use an account you can freely grant/revoke Pro on — not a real
   customer's).
2. Purchase the **Monthly** plan with a real card (Dodo is the merchant of
   record; this is a real, refundable charge — use the smallest real amount
   available, i.e. Monthly, not Annual or Lifetime).
3. Complete checkout and return to the app.

**PASS — what to check:**
- **Dodo dashboard:** Payments (or Subscriptions) shows the new subscription
  as **Active**, live mode.
- **Vercel logs** (Project → Logs, or `vercel logs --prod`, filtered on
  `dodo-webhook`): a line like
  ```
  [dodo-webhook] received type=subscription.active webhook-id=<id>
  [dodo-webhook] activated subscription user=<uuid> plan=monthly sub=<sub_id>
  ```
- **Database:** in Supabase → Table Editor → `profiles`, the row for that
  user's `id` shows `is_pro=true`, `subscription_id=<sub_id>` (matches the
  Dodo dashboard's subscription id), `subscription_period_end` set ~1 month
  out, `cancel_at_period_end=false`.
- **UI:** the account's dashboard shows Pro status/features unlocked.
- **Sentry** (`clipmark-web` project, org `mithahara`): should show **no new
  issue** for this purchase. (It would only fire if the webhook 500'd or the
  signature check failed — neither should happen on a clean live purchase.)

**If it fails:** no `subscription.active` log line within ~30s of checkout
usually means the webhook endpoint URL or event subscription in step A is
wrong, or the signing secret in step B doesn't match what Dodo just issued —
check the Dodo dashboard's webhook delivery log for the actual HTTP status
Dodo received (401 = secret mismatch, 500 = check Sentry/Vercel logs for the
DB error, no delivery attempt at all = URL or event subscription wrong).
**Rollback:** refund the purchase from the Dodo dashboard (see C2) before
troubleshooting further — don't leave a live charge open while debugging.

### C2 — Refund it from the Dodo dashboard

4. In the Dodo dashboard (Live mode), find the subscription/payment from C1
   and issue a **refund**.
5. Also consider whether Dodo's refund flow additionally requires you to
   **cancel the subscription** as a separate action — Dodo's UI may or may
   not do this automatically as part of "refund". If there's a separate
   cancel action, do it too, since that's the mechanism this codebase relies
   on to revoke access for a subscription refund (see the gap noted above).

**PASS — what to check, within a few minutes of the refund:**
- **Vercel logs**, filtered on `dodo-webhook`: expect to see **both**
  ```
  [dodo-webhook] received type=refund.succeeded webhook-id=<id>
  ```
  **and**, if the subscription was also cancelled,
  ```
  [dodo-webhook] received type=subscription.cancelled webhook-id=<id>
  [dodo-webhook] revoked pro user=<uuid> reason=subscription.cancelled retained_via_gift=false
  ```
- **Database:** `profiles` row for that user now shows `is_pro=false`,
  `subscription_id=null`, `subscription_period_end=null`.
- **UI:** the account no longer shows Pro features.
- **Sentry:** no new issue (a clean refund shouldn't error).

### If the refund doesn't revoke Pro

If you see the `refund.succeeded` log line but `is_pro` stays `true` and no
`subscription.cancelled`/`subscription.expired` line ever appears — that
confirms the gap flagged above: Dodo refunded the payment but did not cancel
the subscription, and this handler's `refund.succeeded` branch only revokes
lifetime purchases (matched by `pro_payment_id`), not subscriptions.

**Immediate rollback (do this regardless of root cause):** manually set
`is_pro=false`, `subscription_id=null` for that one test account directly in
Supabase Table Editor. This is a single test account, not a real customer,
so a direct edit is safe here — do **not** do this for a real customer
dispute without separately confirming the refund was legitimate.

**Follow-up (code change, not this doc):** if this reproduces, the fix is to
also revoke Pro in the `refund.succeeded` branch when the refunded
`payment_id` matches an active subscription's underlying payment — the same
place is currently only being looked up by `pro_payment_id`. That's a real
code change for a follow-up PR, not something to patch live; flag it back to
engineering with the exact Dodo event payload you saw (redact the card/buyer
details, keep the event `type` and ids) so the fix can be built against real
Dodo semantics instead of guessed ones.

---

## Rollback reference (any step)

| Situation | Rollback |
|---|---|
| Wrong secret pasted into Vercel (B) | Overwrite the env var with the correct value, redeploy. Old deployments already served will have used the wrong secret for their lifetime — no retroactive fix needed since a 401 is never retried by Dodo. |
| Webhook subscribed to the wrong events (A) | Edit the endpoint in Dodo, fix the event list. No redeploy needed — this is Dodo-side config. |
| Test purchase (C1) needs undoing | Refund from the Dodo dashboard (this is C2 anyway) — do this even if you're abandoning the test, so no live charge is left outstanding. |
| Refund didn't revoke Pro (C2) | Manually clear `is_pro`/`subscription_id` for that one test account in Supabase, per "If the refund doesn't revoke Pro" above. |
| Anything looks wrong and you want to fully back out | The webhook endpoint can be deleted/disabled from the Dodo dashboard at any time — new events simply won't be delivered until it's recreated. Existing Pro grants are unaffected either way (deleting the endpoint doesn't touch the database). |
