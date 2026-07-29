# ClipMark — Deployments & Environments

Plain-English runbook for shipping ClipMark safely on the **Supabase Free plan
(one project)**. If you only read one thing: **code deploys automatically on
merge; database migrations do NOT — you run those by hand against production,
after testing locally and taking a backup.**

---

## 1. Your environments (free-tier reality)

You have **one hosted Supabase project = production**. You do **not** run a
second hosted "staging" database (Supabase Branching is a paid feature, and a
second free project would pause on inactivity and be extra to manage).

Instead:

| Role | What it is |
|---|---|
| **Dev / "staging"** | **Local Supabase** (`supabase start`) on your machine — free, isolated, disposable. This is where you test every DB change and every checkout before it touches production. |
| **Production** | Your one hosted Supabase Free project + Dodo **LIVE**. Real users, real data. |
| **Vercel Preview** | Auto-built per PR. Use it **only to eyeball UI/marketing**. It points at your prod Supabase, so **do not do database or payments testing on it** — do that locally. |

**Golden rule:** treat local Supabase as your pre-production. Nothing hits the
hosted (production) DB until you've verified it locally and taken a backup.

---

## 2. The everyday flow

```
branch  →  PR  →  Vercel Preview (UI check only)  →  merge to main  →  Vercel deploys Production
```

1. `git checkout -b my-change` off `main`.
2. Push, open a PR. Vercel builds a Preview — check the pages look right.
3. Merge → `main` → Vercel deploys Production automatically (build is just
   `next build`; it does **not** touch the database).
4. **If the change needs a DB migration, run it yourself (section 3) — the deploy
   won't.**

---

## 3. Database migrations (deliberate, local-first)

Migrations are files in `webapp/migrations/` named `NNN_description.sql`, applied
in order and tracked in `public.schema_migrations` (each runs once per DB). The
build does **not** run them (`webapp build` = `next build`).

### The safe sequence — always local first, then prod (with a backup)

```bash
cd webapp

# 1) LOCAL: test the migration on a throwaway local DB
supabase start
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' npm run db:bootstrap  # local-only grant fix
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' npm run db:migrate
#   → run the app locally, confirm it works

# 2) BACKUP production first (Free tier has NO automatic backups!)
#    Supabase dashboard → SQL editor, or:
#    pg_dump '<prod DATABASE_URL>' > backup_$(date +%F).sql

# 3) PRODUCTION: apply deliberately, only after local looks good + backup exists
DATABASE_URL='<prod DATABASE_URL>' npm run db:migrate
```

- `db:bootstrap` is a **local-only** helper (hosted Supabase already has the
  grants it adds); don't run it against prod.
- Get the prod `DATABASE_URL` from Supabase dashboard → **Settings → Database →
  Connection string → URI** (Session pooler, port 5432). Note: your `.env` may
  only have the Supabase **API** keys, not this direct Postgres string — you may
  need to copy it from the dashboard.

### Golden rules

- **Never edit a migration that's already been applied** to any database — write a
  new higher-numbered file instead.
- **Numbered in order, no gaps, no duplicate numbers.**
- **Local first, then prod.** Never run untested SQL on the hosted DB.
- **Back up prod before every migration** (no auto-backups on Free).
- The build must **never** migrate. Keep `webapp build` = `next build`.

### Rolling back

No automatic "down" migrations. To reverse:
- **Preferred:** write a new migration that undoes the change (e.g.
  `015_revert_foo.sql`) and apply it locally → prod.
- **Emergency:** restore the backup you took (step 2 above), or run the inverse SQL
  in the Supabase SQL editor, then fix the migration files to match reality.

---

## 4. Migration hygiene — the `012` / `013` situation (read before your next migrate)

Full detail in `webapp/migrations/README.md`. Short version:

- Your prod `schema_migrations` recorded a **`012_db_helpers.sql` that isn't in the
  repo**. You still need to recover it into the repo (find it in history, or export
  the DDL from the live DB) — **don't fabricate an empty file**. See the README.
- The launch-hardening migration is **`013_rls_hardening.sql`** (renumbered from
  012 to avoid the clash). It is **not applied to prod yet** — it closes the
  self-grant-Pro hole, adds `profiles.pro_payment_id`, and enables RLS on
  `schema_migrations` (the CRITICAL Supabase advisor item). Apply it via section 3.

---

## 5. Environment variables

You only really need **one hosted scope: Production**. Local dev reads
`webapp/.env`.

| Variable | Production (Vercel) | Local `.env` (dev) | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod project URL | local (`http://127.0.0.1:54321`) or prod | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key | matching anon key | public-safe |
| `SUPABASE_SERVICE_ROLE_KEY` | prod service_role | matching service_role | **secret**, server only |
| `DODO_PAYMENTS_API_KEY` | **LIVE** key | **TEST** key | see §6 |
| `DODO_*_PRODUCT_ID` (×3) | live product ids | test product ids | match the mode |
| `DODO_PAYMENTS_WEBHOOK_SECRET` | live endpoint secret | test endpoint secret | per-mode |
| `NEXT_PUBLIC_APP_URL` | `https://clipmark.mithahara.com` | `http://localhost:3000` | checkout `return_url` |
| `ADMIN_USER_IDS` | your prod admin UUID(s) | your local/prod admin UUID | comma-separated |
| `YOUTUBE_API_KEY`, `REVALIDATE_SECRET` | set | set | |
| `DATABASE_URL` | **not needed in Vercel** | not needed | only passed by hand to `db:migrate` |

- `DATABASE_URL` is intentionally **not** required in Vercel — the build doesn't
  migrate. Keep it out and pass it manually when you migrate.
- Vercel Preview inherits Production env by default. Since Preview shares the prod
  Supabase, keep to **UI review** on Preview.

---

## 6. Payments testing — do it locally (no code change needed)

The Dodo client runs in **`test_mode`** whenever `NODE_ENV` isn't `production` —
i.e. **`npm run dev` locally is already test mode**. So you can run the full,
money-free checkout + webhook flow locally with Dodo **test** keys + a tunnel to
`/api/webhooks/dodo` (see the owner checklist). No production charges.

> Note: because the mode keys off `NODE_ENV`, a Vercel build (Production **and**
> Preview) runs `live_mode`. That's why checkout testing stays **local** and you
> don't run test checkouts on the Vercel Preview. (If you ever move to a paid
> plan with a real staging deploy, switch the Dodo mode to an explicit env var
> then — not needed now.)

---

## 6b. Env var: `ENABLE_PASSWORD_LOGIN`

`/signin` is Google-only for real users. Setting `ENABLE_PASSWORD_LOGIN=true`
adds a test-only email+password form (it's also on automatically in local dev,
where `NODE_ENV !== 'production'`). **Leave it unset in Vercel Production** —
it exists so the seeded test accounts can be reached through the browser, not as
a product feature. The server action guards on the same flag, so hiding the form
isn't the only control. See the owner checklist §H for how to use it, and
`webapp/scripts/simulate-plan.ts` for flipping an account between billing states.

## 7. Quick reference

```bash
# deploy code: merge to main (Vercel auto-deploys; no DB touched)
# test a migration locally:
supabase start
cd webapp && DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' npm run db:bootstrap && \
             DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' npm run db:migrate
# apply to prod (after backup):
cd webapp && DATABASE_URL='<prod URI>' npm run db:migrate
# build locally (no DB needed):
cd webapp && npm run build
```
