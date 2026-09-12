# Dodo LIVE Webhook — Launch Gate Checklist

Owner-only steps (Dodo dashboard + Vercel logins) to turn on real payments.
Everything that could be done in code has already been done in
[PR #80](https://github.com/agarwalshashwat/clipmark/pull/80) on branch
`feat/dodo-live-webhook-gate` — see "What changed in code" below. This doc
covers only what's left, which only Ash can do.

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
| `refund.succeeded` | Cancels any pending affiliate commission for that `payment_id`; revokes `is_pro` and clears `pro_payment_id` for the profile matched by `pro_payment_id`; reverses any referral reward it earned | Matches **subscriptions too** — see below. Does **not** clear `subscription_id` or cancel the subscription at Dodo. |

All six writes are idempotent against Dodo redelivery of the *same* event:
entitlement fields are overwritten with the same absolute values each time,
and the affiliate/referral side effects are gated by an existing-row check
rather than a blind insert. There is no `webhook_events`/`webhook-id`
dedup table (`docs/TEST_PLAN_launch.md` already flags this as a known,
lower-priority gap) — it isn't needed for correctness today because every
write above is naturally idempotent, but it remains a nice-to-have for a
future pass if new non-idempotent side effects are ever added to this handler.

### ✅ Resolved — the "subscription refund won't revoke Pro" gap was not real

This doc previously warned that `refund.succeeded` matches only `pro_payment_id`,
which was assumed to be set exclusively by the one-time/lifetime flow — so a
refunded **subscription** payment would find no profile and leave Pro granted.

**That assumption was wrong, verified against production on 2026-08-11.**
`payment.succeeded` also fires for a subscription's *initial charge*, and its
handler sets `pro_payment_id` unconditionally. A live Monthly purchase produced
all three events within 180ms:

```
subscription.renewed  → renewed subscription  user=<uuid> sub=sub_…
payment.succeeded     → granted pro           user=<uuid> payment=pay_…   ← sets pro_payment_id
subscription.active   → activated subscription user=<uuid> plan=monthly sub=sub_…
```

So refunding a subscription payment **does** revoke Pro: `refund.succeeded`
matches the profile by `pro_payment_id`, sets `is_pro=false`, clears
`pro_payment_id`, and reverses any affiliate commission and referral reward.

### 🚨 THE RULE: refunding a Pro customer is always TWO actions

> **A refund does not cancel anything. Every hand-issued refund for a
> subscriber must be paired with a cancellation, in the same sitting.**
>
> 1. **Refund** the payment in the Dodo dashboard (Live mode).
> 2. **Cancel the subscription** in the Dodo dashboard — a separate action.
>
> Do step 2 even if step 1 appears to have "closed" the subscription in the UI.
> If you only have time for one, do **step 2 first**: an uncancelled
> subscription charges the customer again, whereas an unpaid refund is at least
> recorded and recoverable (see the ledger below).

Why this is on you rather than on the code: `refund.succeeded` never touches
`subscription_id` and never cancels anything at Dodo. Refunding **without** also
cancelling leaves the subscription live, so the next `subscription.renewed` sets
`is_pro=true` again — the customer you just refunded silently goes back to being
a paying one, and nothing in the logs looks wrong.

The in-app "Cancel & Request Refund" flow already does both for you, and cancels
first precisely so this cannot happen. The rule above is for every refund issued
by hand from the dashboard for any other reason — support requests, chargeback
avoidance, goodwill, test purchases.

### Refunds need a funded wallet — expect to do them by hand at first

Dodo pays refunds from the merchant wallet's **available balance**, not by
reversing the original charge. Funds take ~21–25 days to settle and only pay out
above a **$50** threshold, so an early refund request fails with:

```
409 { code: "INSUFFICIENT_WALLET_FUNDS" }
```

This is normal for a young account, not an incident. `cancelSubscription` treats
it as recoverable: it **still cancels** the subscription (which needs no
balance), tells the customer their refund is being processed by hand, and records
the obligation in **two** places:

- a Sentry issue tagged `dodo_action: refund_needs_manual_processing`, carrying
  the `payment_id` in `extra` — the alert; and
- a row in **`public.pending_refunds`** — the ledger, which is what you should
  actually work from. Sentry issues get resolved, auto-archive after 30 days, or
  are simply missed; a row with `resolved_at IS NULL` doesn't.

**The standing query — run this periodically, not just when an alert fires.**
In the Supabase SQL editor (the table is service-role only, so the dashboard or
a service-role client is the only way in):

```sql
SELECT payment_id, user_id, amount_cents, reason, created_at
FROM public.pending_refunds
WHERE resolved_at IS NULL
ORDER BY created_at;
```

**Runbook for each row (or when the Sentry alert fires):**
1. Take the `payment_id`.
2. Refund it from the Dodo dashboard (Live mode). The subscription was already
   cancelled by the in-app flow, so **this is the one case where the two-action
   rule above is already half-done** — but confirm the subscription really is
   cancelled before you close it out.
3. No further action. When `refund.succeeded` lands, the webhook clears
   `pro_payment_id`, reverses affiliate/referral credit, **and stamps
   `resolved_at` on the ledger row** — so the row falls out of the query above
   on its own. If it doesn't, the refund never actually landed.

> **`pending_refunds` requires migration `018_pending_refunds.sql`**, which is
> authored but **not yet applied to production**. Until it's applied the code
> fails soft: the insert is skipped with a `[pending-refunds] table missing`
> warning in the Vercel logs and the Sentry alert is the only record, exactly as
> before. Apply it with `make db-migrate` (see `migrations/README.md`).

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
5. **Then cancel the subscription** — a separate action in the Dodo dashboard.
   This is not optional and not conditional on what the refund UI appears to
   have done: see "🚨 THE RULE" above. A refund alone leaves the subscription
   live, and the next `subscription.renewed` re-grants Pro to an account you
   just refunded.
6. If the refund fails with `INSUFFICIENT_WALLET_FUNDS`, that's expected on a
   young account — see the funded-wallet section above. Cancel anyway (step 5),
   and work the refund off `pending_refunds` once the wallet settles.

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

Check the *revoke* log line first — `refund.succeeded` matches subscriptions as
well as lifetime purchases (verified in production, see above), so you should
see:

```
[dodo-webhook] revoked pro user=<uuid> reason=refund payment=<pay_id> retained_via_gift=false
```

Work down these causes in order:

1. **`retained_via_gift=true`** — not a bug. An active gifted-Pro window
   (creator seed or referral reward) covers the account independently of the
   payment, so `is_pro` correctly stays `true`. Check
   `is_gifted_pro` / `gifted_pro_expires_at` on the profile.
2. **No `revoked pro … reason=refund` line at all** — the `payment_id` in the
   refund event matched no profile's `pro_payment_id`. Compare the two directly;
   the likeliest cause is that the account's `pro_payment_id` was cleared or
   overwritten by a later purchase.
3. **Revoked, then Pro came back** — you refunded without cancelling. Look for a
   later `renewed subscription` line: the live subscription billed again and
   re-granted Pro. This is the failure mode "🚨 THE RULE" exists to prevent.
   Cancel the subscription now.

**Immediate rollback (do this regardless of root cause):** manually set
`is_pro=false`, `subscription_id=null` for that one test account directly in
Supabase Table Editor. This is a single test account, not a real customer,
so a direct edit is safe here — do **not** do this for a real customer
dispute without separately confirming the refund was legitimate.

**If none of the three fit,** flag it back to engineering with the exact Dodo
event payload you saw (redact the card/buyer details, keep the event `type` and
ids) so the fix can be built against real Dodo semantics instead of guessed
ones.

---

## Rollback reference (any step)

| Situation | Rollback |
|---|---|
| Wrong secret pasted into Vercel (B) | Overwrite the env var with the correct value, redeploy. Old deployments already served will have used the wrong secret for their lifetime — no retroactive fix needed since a 401 is never retried by Dodo. |
| Webhook subscribed to the wrong events (A) | Edit the endpoint in Dodo, fix the event list. No redeploy needed — this is Dodo-side config. |
| Test purchase (C1) needs undoing | Refund from the Dodo dashboard (this is C2 anyway) — do this even if you're abandoning the test, so no live charge is left outstanding. |
| Refund didn't revoke Pro (C2) | Manually clear `is_pro`/`subscription_id` for that one test account in Supabase, per "If the refund doesn't revoke Pro" above. |
| Anything looks wrong and you want to fully back out | The webhook endpoint can be deleted/disabled from the Dodo dashboard at any time — new events simply won't be delivered until it's recreated. Existing Pro grants are unaffected either way (deleting the endpoint doesn't touch the database). |
