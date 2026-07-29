# Owner Setup Checklist — Free tier (one project + local)

Click-by-click for the parts only you can do (Supabase, Vercel, Dodo, GitHub).
Built for the **Supabase Free plan with a single project**: your one hosted
project is **production**, and **local Supabase is your dev/staging**. Pair with
`docs/DEPLOYMENTS.md`.

Legend: 🟢 = do now · 🔵 = when you enable/test payments.

---

## A. 🟢 Local Supabase = your dev/staging (no second hosted project)

You do **not** need a second Supabase project. Use the local stack for all DB and
payments testing.

1. Install the Supabase CLI (https://supabase.com/docs/guides/cli) + Docker.
2. In the repo: `supabase start` (first run pulls images; ~2 min).
3. Apply the schema to the local DB:
   ```bash
   cd webapp
   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' npm run db:bootstrap
   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' npm run db:migrate
   ```
4. `supabase status` prints the local API URL + anon/service_role keys for your
   local `.env` if you want to run the app fully against local.

> A second **free** project as staging is possible but not recommended — free
> projects pause after ~1 week idle and it's more to keep in sync. Local is
> simpler and always available.

---

## B. 🟢 Production Supabase — copy these values

From your **production** project → **Settings → API**:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** key (reveal) → `SUPABASE_SERVICE_ROLE_KEY` *(secret)*

From **Settings → Database → Connection string → URI** (Session pooler, port
5432) → your prod **`DATABASE_URL`** (used only by `db:migrate`, by hand — not
stored in Vercel).

From **Authentication → Users** → your own user's **UUID** → `ADMIN_USER_IDS`.
(Free-tier note: no automatic backups — take a manual one before every migration.)

---

## C. 🟢 Vercel environment variables (Production scope)

Vercel → `clipmark` project → **Settings → Environment Variables**. Add each with
the **Production** scope (Preview inherits Production; that's fine since Preview is
only for UI review):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` — prod values from §B
- `DODO_PAYMENTS_API_KEY` = Dodo **LIVE** key 🔵
- `DODO_MONTHLY_PRODUCT_ID` / `DODO_ANNUAL_PRODUCT_ID` / `DODO_LIFETIME_PRODUCT_ID` = **live** ids 🔵
- `DODO_PAYMENTS_WEBHOOK_SECRET` = **live** webhook secret 🔵
- `NEXT_PUBLIC_APP_URL` = `https://clipmark.mithahara.com`
- `ADMIN_USER_IDS` = your prod admin UUID(s)
- `YOUTUBE_API_KEY`, `REVALIDATE_SECRET`

Do **not** add `DATABASE_URL` to Vercel — the build no longer migrates; you pass
it by hand when running `db:migrate`. Keep `SUPABASE_SERVICE_ROLE_KEY` + Dodo keys
server-side only (they lack the `NEXT_PUBLIC_` prefix, so Vercel keeps them
server-side).

### C2. Sentry error monitoring — set the DSN *before* the Sentry deploy ⚠️

Add these in the same place (**Production** scope; Preview inherits, which is
correct — preview events self-tag as `preview`). Only the first is required.

| # | Variable | Value / where to find it |
|---|---|---|
| 1 | `NEXT_PUBLIC_SENTRY_DSN` | Sentry → `clipmark-web` → **Settings → Client Keys (DSN)** → copy the DSN |
| 2 | `SENTRY_AUTH_TOKEN` | Sentry → **Settings → Auth Tokens → Create New Token**, scope `project:releases` |

**Order matters.** `NEXT_PUBLIC_*` values are baked into the JavaScript bundle at
`next build` — server bundles too. Set #1 **before** merging the Sentry PR, because
the merge triggers the production build immediately. Set it afterwards and you must
**redeploy**; a restart won't pick it up, and in the meantime the browser bundle
ships with no DSN and silently reports nothing at all.

#2 is optional and non-blocking: without it the build still succeeds, it just
uploads no source maps, so production stack traces stay minified. It's a **secret**
— server/build-side only, never `NEXT_PUBLIC_`.

Optional extras you almost certainly don't need in Vercel: `SENTRY_DSN` (same
value, read at runtime, takes precedence server-side — for repointing without a
rebuild), `NEXT_PUBLIC_SENTRY_ENV` (Vercel infers it), `NEXT_PUBLIC_SENTRY_DEV`,
`NEXT_PUBLIC_SENTRY_DEBUG`. All six are documented in `webapp/.env.example`.

There is **no `SENTRY_ORG` / `SENTRY_PROJECT`** — both are hardcoded in
`webapp/next.config.mjs`. The Chrome extension uses a **separate** Sentry project
whose DSN is committed in `extension/src/error-reporting.js`; nothing to add here
for it.

---

## D. 🔵 Local `.env` for payments testing (Dodo TEST)

For money-free checkout testing (all local — see DEPLOYMENTS §6):
- `DODO_PAYMENTS_API_KEY` = Dodo **TEST** key
- `DODO_*_PRODUCT_ID` = **test** product ids
- `DODO_PAYMENTS_WEBHOOK_SECRET` = **test** endpoint secret
- point a Dodo **test-mode** webhook at your tunnel: `https://<tunnel>/api/webhooks/dodo`
- run `npm run dev` (→ Dodo `test_mode` automatically) and pay with a Dodo **test
  card** (get current numbers from Dodo's docs).

Dodo dashboard: toggle **Test mode** for the test key/products/webhook; **Live
mode** for the production values in §C. The webhook signing secret differs per
mode — match it.

---

## E. 🟢 GitHub Actions — nothing to configure

`ci-integration` spins up a throwaway **local** Supabase in CI and needs **no
repository secrets**. Nothing to do.

---

## F. Applying the pending security migration to prod (when ready)

`013_rls_hardening.sql` is in the repo but **not applied to prod yet**. To apply
(this is the self-grant-Pro fix + the CRITICAL advisor item):
1. Test locally (§A step 3 on a fresh `supabase db reset`).
2. **Back up prod** (Supabase SQL editor export, or `pg_dump '<prod URI>'`).
3. `cd webapp && DATABASE_URL='<prod URI>' npm run db:migrate`
4. Also reconcile the missing `012_db_helpers.sql` per `webapp/migrations/README.md`.

## H. 🟢 Testing as a paid user (monthly / annual / lifetime)

Real sign-in is Google-only, so the seeded test accounts (email/password) need a
door — and a Google account can't be split into three users. Two tools cover it:

**1. Password sign-in (test only).** `/signin` shows an extra email+password form
when `ENABLE_PASSWORD_LOGIN=true`, and automatically in local dev. It is **off in
production** unless you set that variable, so it never adds a
credential-stuffing surface for real users. Seeded accounts:

| Account | Plan state |
|---|---|
| `test-monthly@clipmark.test` | active monthly subscription |
| `test-annual@clipmark.test` | active annual subscription |
| `test-lifetime@clipmark.test` | one-time lifetime purchase |

Password for all three: `Clipmark-Test-123!` (change it in Supabase → Authentication → Users if you like).

**2. Flip your own account between plan states** — no second login needed:

```bash
cd webapp
npx tsx scripts/simulate-plan.ts you@example.com monthly        # dry run, prints the diff
npx tsx scripts/simulate-plan.ts you@example.com monthly --yes  # apply
npx tsx scripts/simulate-plan.ts you@example.com free --yes     # restore
```

States: `free`, `monthly`, `annual`, `lifetime`, `cancelling`, `refundable`.
It is a **dry run unless you pass `--yes`**, because it writes to whichever
project your `.env` points at (usually production).

> Worth knowing: everything Pro-gated (Active Recall, Anki export, PRO badges)
> branches on `is_pro` alone, so it looks the same on every paid plan. The only
> plan-specific screen is `/upgrade` — and **monthly and annual render
> identically there apart from the next-billing date**, because the page never
> reads the plan type. `lifetime` is the visibly different one ("Lifetime
> Access — your Pro benefits never expire"), and `cancelling` / `refundable`
> show the cancel and refund variants.

## G. Cheat sheet

| Value | From | Used for |
|---|---|---|
| Supabase URL / anon / service_role | Supabase → Settings → API | Vercel Production env + local `.env` |
| Prod DB URI | Supabase → Settings → Database (URI) | `npm run db:migrate` by hand (not Vercel) |
| Your admin UUID | Supabase → Authentication → Users | `ADMIN_USER_IDS` |
| Dodo LIVE key/products/webhook | Dodo (Live mode) | Vercel Production |
| Dodo TEST key/products/webhook | Dodo (Test mode) | local `.env` only |
