# Owner Setup Checklist — Staging + Production

Click-by-click for the parts only you can do (Supabase, Vercel, Dodo, GitHub
dashboards). Do these once. Pair with `docs/DEPLOYMENTS.md`.

Legend: 🟢 = do now to get staging working · 🔵 = when you wire Dodo/Sentry.

---

## A. 🟢 Create a second Supabase project for **staging**

You currently have one Supabase project (production). Add a separate one for
Preview/staging so tests never touch real data.

1. Go to https://supabase.com/dashboard → **New project**.
2. Name it e.g. `clipmark-staging`. Choose the same region as prod. Set a DB
   password (save it in your password manager).
3. Wait for it to provision (~2 min).
4. **Apply the schema** to staging (it starts empty):
   ```bash
   cd webapp
   DATABASE_URL='<staging connection string, step A6>' npm run db:migrate
   ```
   This runs migrations `001…` in order on the fresh staging DB.
5. Copy these values from **Settings → API** (you'll paste them into Vercel in
   section B):
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key (click "reveal") → `SUPABASE_SERVICE_ROLE_KEY` *(secret)*
6. Copy the DB connection string from **Settings → Database → Connection string →
   URI** (Session pooler, port 5432) → this is `DATABASE_URL` (used only for
   `db:migrate`, not stored in Vercel unless you want to).
7. Create a staging admin user: **Authentication → Users → Add user** (tick
   *Auto Confirm User*), then copy that user's **UUID** → `ADMIN_USER_IDS`.

Do the same "copy keys" for your **production** project (Settings → API) — you'll
need the prod values for the Production scope in section B.

---

## B. 🟢 Set Vercel environment variables (scoped Production vs Preview)

Vercel → your `clipmark` project → **Settings → Environment Variables**. For each
variable below, click **Add**, enter the name + value, and **tick only the right
scope** (Production or Preview). Add each variable twice if the value differs per
environment (once ticked Production, once ticked Preview).

**Production scope** (values from your PROD Supabase + Dodo LIVE):
- `NEXT_PUBLIC_SUPABASE_URL` = prod project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = prod anon key
- `SUPABASE_SERVICE_ROLE_KEY` = prod service_role key
- `DODO_PAYMENTS_API_KEY` = Dodo **LIVE** key 🔵
- `DODO_MONTHLY_PRODUCT_ID` / `DODO_ANNUAL_PRODUCT_ID` / `DODO_LIFETIME_PRODUCT_ID` = **live** product ids 🔵
- `DODO_PAYMENTS_WEBHOOK_SECRET` = **live** webhook endpoint secret 🔵
- `NEXT_PUBLIC_APP_URL` = `https://clipmark.mithahara.com`
- `ADMIN_USER_IDS` = your prod admin UUID(s)
- `YOUTUBE_API_KEY`, `REVALIDATE_SECRET`

**Preview scope** (values from your STAGING Supabase + Dodo TEST):
- `NEXT_PUBLIC_SUPABASE_URL` = **staging** project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = staging anon key
- `SUPABASE_SERVICE_ROLE_KEY` = staging service_role key
- `DODO_PAYMENTS_API_KEY` = Dodo **TEST** key 🔵
- `DODO_*_PRODUCT_ID` = **test** product ids 🔵
- `DODO_PAYMENTS_WEBHOOK_SECRET` = **test** webhook endpoint secret 🔵
- `NEXT_PUBLIC_APP_URL` = your Preview/staging URL
- `ADMIN_USER_IDS` = your staging admin UUID(s)
- `YOUTUBE_API_KEY`, `REVALIDATE_SECRET`

Notes:
- **`DATABASE_URL` is intentionally NOT required in Vercel** anymore (the build
  doesn't migrate). You can leave it out entirely and pass it by hand when running
  `db:migrate`. If you do add it, scope each to the matching DB and know the build
  ignores it.
- Do **not** put `SUPABASE_SERVICE_ROLE_KEY` or Dodo keys anywhere client-side —
  they're server-only secrets. Vercel keeps them server-side by default (they lack
  the `NEXT_PUBLIC_` prefix).
- ⚠️ Because of the `NODE_ENV` Dodo-mode limitation (see DEPLOYMENTS §5), the Preview
  build runs Dodo in `live_mode` even with test keys — so don't rely on the Vercel
  Preview for real checkout testing yet; test checkout **locally**. Fix the switch to
  an explicit env var if you want Preview checkouts.

---

## C. 🔵 Dodo dashboard (when testing/enabling payments)

- **Test mode:** Dodo dashboard → toggle to **Test mode** → Settings → API Keys →
  copy the test key; Products → create/copy the three **test** product ids;
  Webhooks → create an endpoint (for local testing, point it at your tunnel URL,
  e.g. `https://<tunnel>/api/webhooks/dodo`) → copy its **signing secret**.
- **Live mode:** repeat in Live mode for the Production values.
- The webhook **signing secret differs per mode** — make sure the one you set in
  Vercel matches the endpoint's mode.

---

## D. 🟢 GitHub Actions — no secrets needed

The `ci-integration` job spins up a throwaway **local** Supabase stack
(`supabase start`) with well-known local demo keys and applies migrations to it.
It does **not** touch any real project and needs **no GitHub repository secrets**.
Nothing to configure here.

(If you later add a job that talks to a real service, add its secret under
GitHub → repo → Settings → Secrets and variables → Actions.)

---

## E. Values-to-where cheat sheet

| Value | Copy from | Paste into |
|---|---|---|
| Supabase URL / anon / service_role (×2 projects) | Supabase → Settings → API | Vercel env (Prod scope = prod project, Preview scope = staging project) |
| Supabase DB URI (×2) | Supabase → Settings → Database → Connection string (URI) | Your shell when running `npm run db:migrate` (not Vercel) |
| Admin UUID (×2) | Supabase → Authentication → Users | `ADMIN_USER_IDS` (matching scope) |
| Dodo LIVE key + live product ids + live webhook secret | Dodo (Live mode) | Vercel **Production** scope |
| Dodo TEST key + test product ids + test webhook secret | Dodo (Test mode) | Vercel **Preview** scope + your local `.env` |

Once A + B are done, open any PR and its Preview should build against staging.
Payments testing stays local until the Dodo `NODE_ENV` switch is addressed.
