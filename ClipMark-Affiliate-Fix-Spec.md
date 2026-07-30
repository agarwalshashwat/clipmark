# Week-0 Fix Spec: Admin Affiliate Bypass (`/api/admin/set-affiliate`)

Status: **diagnosis + spec only — no code changed, no migration applied, no DB touched.**

## 1. Diagnosis

### 1.1 What the route writes vs. what the schema has

[`webapp/app/api/admin/set-affiliate/route.ts`](webapp/app/api/admin/set-affiliate/route.ts) builds an `updates` object and does `supabaseAdmin.from('profiles').update(updates)`. Cross-checking every key it can write against `webapp/migrations/007_affiliate_program.sql` (adds `is_affiliate`, `affiliate_code`, `commission_rate`) and `009_affiliate_discounts.sql` (adds `affiliate_discount_pct`, `dodo_discount_code`):

| Route writes (`route.ts` line) | Exists in schema? | Actual column (if any) |
|---|---|---|
| `is_affiliate = true` (L56) | ✅ yes | `profiles.is_affiliate` (007) |
| `affiliate_status = 'approved'` (L57) | ❌ **no such column anywhere** | — |
| `affiliate_code = ...` (L61) | ✅ yes | `profiles.affiliate_code` (007) |
| `affiliate_commission_rate = commissionRate` (L68) | ❌ **no such column** | `profiles.commission_rate` (007) |
| `dodo_discount_code = ...` (L86) | ✅ yes | `profiles.dodo_discount_code` (009) |
| `affiliate_discount_pct = ...` (L91) | ✅ yes | `profiles.affiliate_discount_pct` (009) |

Any Postgres `UPDATE` naming an unknown column fails the whole statement — so today, **any admin call that sets `approve` or `commissionRate` 500s outright** (the other two fields, `affiliateCode`-only and `discountPct`-only, would currently succeed in isolation, but those aren't the calls that matter — approving a brand-new creator always needs `approve: true`).

### 1.2 Root cause — not a missing migration, two separate authoring bugs

This is **not** a "forgot to write the migration" situation. Grepping the full webapp for both bad identifiers shows the second one is a **wrong name for an existing column**, not a truly missing field, and the first is **dead on arrival** — nothing anywhere reads it:

```
affiliate_status         → 1 hit total: the write in set-affiliate/route.ts itself. No reader, no other writer, no migration ever defined it.
affiliate_commission_rate → 4 hits: this route's write, admin/users/route.ts's SELECT, and two spots in AdminPanel.tsx's display. All four are the *same* wrong name for profiles.commission_rate.
```

Migration `007_affiliate_program.sql`'s own header comment is explicit about the intended design: *"Admin enables affiliates by setting `is_affiliate=true` and `affiliate_code` on profiles."* There is no profile-level status enum anywhere in the program — `is_affiliate` (boolean) is the sole gate everywhere it's checked: `/r/[code]/route.ts` (code resolution), the Dodo webhook's `recordAffiliateConversion` (commission recording), `affiliate/apply/route.ts`, and the dashboard. `affiliate_status` was never real; whoever wrote this route appears to have assumed a richer status column existed (perhaps by analogy to `affiliate_applications.status`, which is a *different* table for the self-serve flow) and invented a second one for `profiles` that nothing was ever built to read.

**Root cause, precisely:**
1. **Dead field** — `affiliate_status` is written but has zero consumers and no schema backing. It's not a missing migration; it's a field that should never have been written at all.
2. **Column name mismatch** — `affiliate_commission_rate` should be `commission_rate` (the actual column from migration 007). This same wrong name is also baked into `admin/users/route.ts:33`'s `.select()` (which means `GET /api/admin/users` **also 500s today** — PostgREST rejects selects on unknown columns) and into `AdminPanel.tsx`'s type/display (lines 16, 190). This is a three-call-site bug, not a one-file bug.
3. **A third bug, only visible once #2 is fixed — unit mismatch.** `commission_rate` is a `DECIMAL(4,2)` storing a **fraction** (`0.30` = 30%, per 007's default and every existing reader: `affiliate/apply/route.ts:114` hardcodes `0.30`, the Dodo webhook handler does `amount * commissionRate` expecting a fraction, and the dashboard does `Math.round(commissionRate * 100)` to display a percent). But the route validates `commissionRate` as **0–100** (`if (commissionRate < 0 || commissionRate > 100)`) and `AdminPanel.tsx`'s form defaults to `'50'` — i.e. the whole admin UI is built around a 0–100 percent input. Writing that raw value into `commission_rate` would silently store `50` instead of `0.50`, and the webhook would then compute commission as `amount * 50` — a **5000%** commission on every sale from an admin-granted affiliate. This has to be divided by 100 at the write boundary, and it's the kind of bug that wouldn't surface until the first real referred sale pays out.

### 1.3 Scope check: does the "gates the whole creator-outreach engine" fix need a migration at all?

No. Every column the route needs to write already exists (`is_affiliate`, `affiliate_code`, `commission_rate`, `affiliate_discount_pct`, `dodo_discount_code`). The fix is **route-only**: delete the dead field, fix the name, fix the unit conversion, and fix the two other call sites that share the wrong name. Per this repo's conventions (no speculative schema, no unused columns), adding a migration to legitimize `affiliate_status` would just be enshrining dead schema for a field with no reader — not recommended unless there's a concrete future need for finer-grained affiliate states (e.g. `suspended`, `paused`) beyond the current boolean. That's a real possible future need, but it's out of scope for unblocking creator outreach this week — see §3.3 for it as an explicit, deferred option.

## 2. Recommended fix

**No new migration.** Three files change:

### 2.1 `webapp/app/api/admin/set-affiliate/route.ts`

- Drop the `updates.affiliate_status = 'approved'` line entirely — `updates.is_affiliate = true` is already the complete, correctly-read "approved" signal.
- Rename `affiliate_commission_rate` → `commission_rate`.
- Convert the percent input to the fraction the column actually stores: `updates.commission_rate = commissionRate / 100`.

Design-level diff (not applying yet):

```ts
if (approve) {
  updates.is_affiliate = true;
  // (affiliate_status removed — no such column; is_affiliate is the sole gate
  // read by /r/[code], the Dodo webhook, and the dashboard.)
}

if (typeof commissionRate === 'number') {
  if (commissionRate < 0 || commissionRate > 100) {
    return NextResponse.json({ error: 'commissionRate must be 0–100' }, { status: 400 });
  }
  // commission_rate is stored as a fraction (0.30 = 30%), matching the
  // self-serve default in affiliate/apply/route.ts and the webhook's
  // `amount * commission_rate` math — the route's own input is a 0–100 percent.
  updates.commission_rate = commissionRate / 100;
}
```

### 2.2 `webapp/app/api/admin/users/route.ts`

Line 33's `.select(...)` — rename `affiliate_commission_rate` to `commission_rate` in the column list, so the admin search endpoint stops 500ing and returns the real value.

### 2.3 `webapp/app/admin/_components/AdminPanel.tsx`

- Line 16: rename the `UserResult.affiliate_commission_rate` field to `commission_rate`.
- Line 190: display `Math.round((u.commission_rate ?? 0) * 100)}%` instead of the raw fraction, so a stored `0.5` renders as `50%` (today's raw display was already wrong in the opposite direction, since it was reading a field that never existed).
- Line 32-ish (`affRate` state, currently defaulted to `'50'`): keep the input as a 0–100 percent field — that's the natural admin-facing unit and matches the existing validation message — the `/ 100` conversion happens server-side in 2.1, not in the form.

No other call site needs to change: `apply/route.ts`, the Dodo webhook, `affiliate/export/route.ts`, and `dashboard/affiliate/page.tsx` already use the correct `commission_rate` name and the correct fractional convention.

### 2.4 End-to-end path this unblocks

1. Admin searches `GET /api/admin/users?q=<creator email>` → now returns real `is_affiliate`/`affiliate_code`/`commission_rate` (was 500ing).
2. Admin calls `POST /api/admin/set-affiliate` with `{ userId, affiliateCode: "mkbhd", commissionRate: 50, approve: true }` → writes `is_affiliate=true`, `affiliate_code='mkbhd'`, `commission_rate=0.50`, plus the existing (already-working) Dodo discount-code creation and `affiliate_discount_pct`.
3. `GET /r/mkbhd` resolves (`is_affiliate=true` + matching `affiliate_code` — already correct, untouched) → sets the `clipmark_ref` cookie.
4. A referred signup upgrades → `upgrade/actions.ts` reads the cookie, puts `affiliate_code` in the Dodo checkout metadata (already correct, untouched).
5. Dodo webhook (`payment.succeeded` / `subscription.active`) calls `recordAffiliateConversion`, looks up `profiles.commission_rate` for that code (already correct, untouched — this is exactly why the unit bug in §1.2.3 matters: it reads whatever the admin route wrote), and inserts an `affiliate_conversions` row with the right `commission_usd`.

Steps 3–5 already work correctly today for self-serve affiliates; they were never broken. The break is entirely upstream, in how the admin bypass writes to `profiles`.

## 3. Related trust-gap items (from the distribution plan) — in or out of scope?

The distribution plan flagged marketing copy at `webapp/app/(marketing)/affiliate/page.tsx` promising things that aren't automated. Re-verified against current code, the picture is more nuanced than "neither is implemented":

### 3.1 Refund reversal — already implemented, copy is accurate. **No action needed.**
`webapp/app/api/webhooks/dodo/handler.ts`'s `refund.succeeded` branch (L253–282) already sets `affiliate_conversions.status = 'cancelled'` for the refunded payment, and the dashboard (`dashboard/affiliate/page.tsx` L128, L326) already excludes cancelled rows from earnings and shows "Refunded — reversed". The marketing copy's claim ("*that conversion is cancelled and the corresponding commission is removed from your pending balance*") matches reality. This item can be struck from the trust-gap list.

### 3.2 Automatic monthly payout — genuinely not implemented. **Out of scope for week-0, flag as follow-up.**
Nothing in the codebase ever sets `affiliate_conversions.status = 'paid'` — no payout job, no Wise/PayPal/Dodo payout API call exists anywhere. The marketing page (`(marketing)/affiliate/page.tsx` L44, L312–315) promises "*paid out monthly via bank transfer or PayPal... triggered automatically once you reach $25*" — that's a real promise-vs-reality gap, but it's orthogonal to why the admin bypass is broken, and fixing it (building payout automation, or integrating a payout provider) is a materially bigger effort than this route fix. **Recommendation:** don't bundle it into week-0; track separately, and treat it as a hard blocker before the *first real commission check comes due* to an external creator (i.e., before any admin-granted affiliate's `pending` balance would need to convert to `paid`). Until then it can be paid manually and marked `paid` by hand (there's no UI for that either today — flag that too, but it's a small addition once payouts exist).

### 3.3 (New, surfaced by this diagnosis) Whether `profiles` needs a richer status than `is_affiliate` boolean. **Deferred, not needed for week-0.**
The dead `affiliate_status` field suggests someone once wanted more granularity (e.g. suspend an affiliate without losing their code/rate history) than the current boolean gives. Nothing today needs that — `is_affiliate=false` fully disables a code (checked via `.eq('is_affiliate', true)` at every read site). Only revisit this if/when there's a concrete product need (e.g., "pause without deleting").

### 3.4 Note: `decrement_referral_credit()` unused — different feature, not this bug.
The distribution plan also mentions `decrement_referral_credit()` being defined but never called (`webapp/migrations/012_db_helpers.sql`). That's part of the **user-to-user referral program** (migration 010, `referral_months_credit`), not the **affiliate program** (migration 007) this spec covers — don't conflate the two when scoping follow-up work.

## 4. Test plan

No test today exercises `set-affiliate` or `admin/users` at all (`webapp/tests/integration/` has `admin-grant.test.ts` for `grant-pro` but nothing for affiliate admin routes). Recommend following the exact pattern `admin-grant.test.ts` already uses: a real GoTrue-validated admin JWT + a real local Supabase DB, with `requireAdmin` and the Supabase client injected so the test hits real Postgres constraints (this is also how `webapp/app/api/webhooks/dodo/handler.ts` and `grant-pro` are structured — `route.ts` as a thin wrapper around a testable `handler.ts`; `set-affiliate/route.ts` isn't split that way today and would benefit from the same extraction to make this testable without mocking Supabase).

### 4.1 Local Supabase — unit/integration level
Run against `supabase start` + `npm --prefix webapp run db:bootstrap` (per `webapp/tests/integration` conventions):

1. **Schema sanity** — confirm the fix doesn't reference dead columns: `UPDATE profiles SET is_affiliate=true, affiliate_code='t1', commission_rate=0.5 WHERE id=<test user>` succeeds (this alone would have caught both original bugs — it 500s today with the unfixed field names).
2. **Admin search returns real data** — `GET /api/admin/users?q=<test email>` returns `commission_rate` (not `undefined`), confirming the `admin/users/route.ts` select fix.
3. **Admin grant, percent → fraction conversion** — call the fixed handler with `commissionRate: 50` → assert `profiles.commission_rate === 0.5` (not `50`). This is the regression test for the unit-mismatch bug — it's the one most likely to be silently reintroduced.
4. **Non-admin rejected** — same 403/401 checks as `admin-grant.test.ts` (`requireAdmin` gating), reused verbatim for `set-affiliate`.
5. **`affiliateCode`-only and `discountPct`-only calls still work** — these two already write to real columns today; a regression test guards against breaking them while fixing the other two.
6. **Idempotency / re-grant** — calling `set-affiliate` twice for the same creator (e.g. admin bumps their rate later) updates `commission_rate` without disturbing `affiliate_code` or accumulated `affiliate_conversions` rows.

### 4.2 End-to-end (manual or Playwright, local Supabase + Dodo test mode)
Walk the full funnel this route exists to unblock:

1. Create a test user via signup (non-Pro, brand-new account — the whole point is this bypasses the 30-day-Pro gate).
2. Admin calls the fixed `POST /api/admin/set-affiliate` with `{ userId, affiliateCode: 'testcreator', commissionRate: 40, approve: true }`.
3. Verify in DB: `is_affiliate=true`, `affiliate_code='testcreator'`, `commission_rate=0.40`, `dodo_discount_code` populated (Dodo test-mode discount actually created — non-fatal on failure per existing code, but confirm the happy path).
4. `GET /r/testcreator` → assert redirect to `/?ref=testcreator` and `clipmark_ref` cookie set.
5. As a *different* new user, load that URL, sign up, and complete a test-mode Dodo checkout for the Pro monthly plan.
6. Confirm the Dodo test-mode `payment.succeeded`/`subscription.active` webhook fires (or invoke the handler directly against a synthetic payload, matching `webhook-entitlements.test.ts`'s style) and:
   - `affiliate_conversions` gets a new row with `affiliate_id` = the creator's profile id, `commission_rate = 0.40`, `commission_usd = amount * 0.40` (not `amount * 40`).
   - `/dashboard/affiliate` (viewed as the creator) shows the conversion, correct commission amount, and correct 40% rate in the header.
7. Trigger a test-mode refund on that payment → confirm the `affiliate_conversions` row flips to `cancelled` and drops out of the creator's earnings total (already-working path from §3.1 — just confirm the admin-granted creator gets the same correct behavior as a self-serve affiliate).

---

## Summary

- **Root cause:** `webapp/app/api/admin/set-affiliate/route.ts` writes two things that don't match the schema — `affiliate_status` (a column that never existed and has no reader anywhere) and `affiliate_commission_rate` (should be `commission_rate`, per migration `007_affiliate_program.sql`). The same wrong name is also baked into `admin/users/route.ts`'s search endpoint and `AdminPanel.tsx`'s display — three call sites, one bug. A third, more dangerous bug rides along: once the name is fixed, the route's 0–100 percent input needs to be divided by 100 before being stored, since `commission_rate` is a 0–1 fraction everywhere else it's read (self-serve apply flow, the Dodo webhook's commission math, the dashboard display) — skipping that conversion would create ~50x commission overpayment on admin-granted affiliates' sales.
- **Recommended fix:** route-only, **no new migration** — every column already exists. Drop the dead `affiliate_status` write, rename `affiliate_commission_rate` → `commission_rate` in three files (`set-affiliate/route.ts`, `admin/users/route.ts`, `AdminPanel.tsx`), and add the `/ 100` conversion at the one write boundary. Once fixed, the full attribution chain (`/r/[code]` → checkout metadata → Dodo webhook → `affiliate_conversions`) needs no changes — it was never broken, only unreachable because the admin grant call was failing upstream.
- **Trust-gap items:** refund reversal is already correctly implemented and the marketing copy is accurate — strike it from the list. Automatic payout is genuinely unbuilt and the copy oversells it — real gap, but scoped as a separate follow-up, not a week-0 blocker (flag it as a hard blocker before the first real commission payout is owed, not before this fix ships).
