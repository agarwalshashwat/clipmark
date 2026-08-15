# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Clipmark is a YouTube bookmarking product: a Manifest V3 Chrome extension (bookmark timestamps, revisit mode, Active Recall flashcards) paired with a Next.js webapp (cloud sync, sharing, payments, dashboard). Monorepo, developed together. Live at clipmark.mithahara.com; the GitHub repo is `agarwalshashwat/clipmark` and is **public**.

## Commands

Root `Makefile` wraps the common workflows (`make help` lists them):

```bash
# Webapp
make dev                     # cd webapp && next dev
make build                   # cd webapp && next build — does NOT run migrations
make start                   # cd webapp && next start
make db-migrate              # cd webapp && npm run db:migrate — applies pending SQL migrations

# Extension
make ext-dev                 # cd extension && vite (CRXJS dev server, auto-reload)
make ext-build                # cd extension && vite build → extension/dist/
make ext-zip                  # ext-build + zip extension/dist/ for Web Store (never zip the repo root)
make ext-open                  # open chrome://extensions

# Shared
make sync-tokens              # copy packages/design-system/tokens.css into extension/ and webapp/
```

Testing (four independent layers — know which one a change needs):

```bash
npm run test:unit             # extension/shared logic — node:test, tests/unit/*.test.mjs, no browser
npm run test:unit:webapp      # webapp logic — node --test, webapp/tests/unit/*.test.ts
npm run test:integration      # webapp/tests/integration — needs local Supabase (`supabase start` + `npm --prefix webapp run db:bootstrap`)
npm run test:yt                # Playwright, extension loaded via launchPersistentContext — non-headless, workers=1
npm run test:visual            # Playwright, webapp visual snapshots (baselines are gitignored, regenerate locally)
npm run test:all               # test:unit + test:yt + test:visual
```

Run a single test file directly rather than through the npm script wrapper:

```bash
node --test tests/unit/recall.test.mjs
cd webapp && node --import ./tests/unit/fixtures/env-setup.mjs --import tsx --test tests/unit/webhook-dodo.test.ts
npx playwright test tests/bookmark-lifecycle.spec.ts --project=extension
cd webapp && npx tsc --noEmit
```

CI (`.github/workflows/`) gates on `ci-unit`, `ci-extension-smoke`, `ci-webapp-visual-smoke`, `ci-integration` — all run on every PR. `ci-extension-smoke` and `ci-integration` need `xvfb-run` / a local Supabase stack respectively to reproduce locally.

## Architecture

### Monorepo layout

- `extension/` — Manifest V3 extension, built with Vite + `@crxjs/vite-plugin` (NOT a raw unpacked source tree — `extension/dist/` is the shippable artifact).
- `webapp/` — Next.js 14 App Router + TypeScript + Supabase, deployed to Vercel.
- `packages/design-system/tokens.css` — single source of truth for CSS custom properties. Edit only here, then `make sync-tokens` to propagate into `extension/styles/` and `webapp/app/`.
- `tests/` — root-level Playwright specs + extension/shared `node:test` unit tests.
- `webapp/tests/` — webapp-specific unit and integration tests (separate from root `tests/`).

### Extension build & the twin-file pattern

Content scripts (`extension/src/content/content.js` and its dependencies) run in an **isolated world sharing one global scope**, and Vite/Rollup tree-shakes unused exports. This previously shipped a `ReferenceError` in production (constants tree-shaken to an empty chunk while `content.js` referenced them as bare globals — dev loads and source-based E2E were unaffected, only the built artifact broke). The fix is a twin-file convention:

- `constants.js` / `recall.js` — classic scripts, register onto `globalThis`, loaded directly by the content script via `manifest.json`'s `content_scripts`.
- `constants.module.js` / `recall.module.js` — ESM equivalents, used by the side panel/dashboard and by unit tests.

**Edit both twins together** — `webapp/tests/unit/{recall,anki}-parity.test.ts` assert the webapp's own copies don't drift, and there's no other enforcement. `extension/scripts/content-globals-guard.mjs` runs as a Vite `closeBundle` hook and fails the build if a required global goes missing from the shipped chunks — add any new bare content-script global to that guard's list.

`extension/scripts/api-base-guard.mjs` similarly fails a production `vite build` (not `vite dev`) if `extension/src/config.js` points at localhost — `config.js` is committed as the production default; `config.example.js` documents it.

### Webapp

- All routes under `webapp/app/` (App Router). Route groups: `(marketing)` for public/marketing pages.
- `webapp/lib/supabase.ts` and `webapp/lib/clients.ts` — Supabase/API client helpers.
- `webapp/migrations/*.sql` — numbered, idempotent, applied by `webapp/scripts/migrate.ts` against `DATABASE_URL`, tracked in `public.schema_migrations`. **Migrations are never run by the build** (`make build` runs `next build` only) — apply by hand with `make db-migrate`, locally first, with a production backup (free-tier Supabase has no automatic backups). A migration already applied anywhere is never edited — write a new higher-numbered file instead.
- Taking that production backup: this machine has **no `pg_dump`**, and Ubuntu's default `postgresql-client` is PG 16 — too old to dump the PG 17 hosted server. Dump through Docker instead (reads the prod URI from `webapp/.env`, so no credentials on the command line):

  ```bash
  cd webapp && URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" && docker run --rm postgres:17 pg_dump -n public -n auth --no-owner --no-privileges "$URL" > ~/clipmark_backup_$(date +%F).sql
  ```

  `--no-owner --no-privileges` keeps the dump restorable without superuser but omits every `GRANT`/`REVOKE` — schema, data, RLS flags and policies are all included, so after a restore re-run the grant-hardening migrations (`013`, `014`) to get the column-level restrictions back.
- Applying a migration by hand in the Supabase SQL editor instead of via `make db-migrate` means **you** own the ledger row — `migrate.ts` decides what's pending purely from `public.schema_migrations`, so paste this in the *same* query as the migration (one transaction) or the next `db-migrate` re-runs the file:

  ```sql
  INSERT INTO public.schema_migrations (version) VALUES ('NNN_name.sql') ON CONFLICT (version) DO NOTHING;
  ```

  Re-running is survivable because every migration is idempotent, but an incomplete ledger makes the repo lie about what production has.
- These migrations do not `GRANT` table-level privileges explicitly — they assume hosted Supabase's default schema-level grants and layer `REVOKE`/column-`GRANT` on top. A bare local `supabase start` lacks those defaults, so the integration harness applies them first via `npm --prefix webapp run db:bootstrap` before migrating.
- Payments are Dodo Payments (Merchant of Record). Dodo's `test_mode` keys off `NODE_ENV`, and **every Vercel build — including Preview — runs in `live_mode`**; keep checkout testing local. Vercel Preview also points at the production Supabase project, so it's UI-review only, not a safe integration-test target.
- `NEXT_PUBLIC_*` env vars are inlined by Next at **build time**, including in server bundles — changing one requires a redeploy, not a restart.

### Extension runtime notes

- Service worker (`background.js`) uses a `keepalive` alarm to survive MV3's ~5 min idle shutdown.
- Extension ↔ webapp messaging goes through `chrome.runtime.onMessageExternal` (OAuth token handoff) and `fetch` against `API_BASE` (`extension/src/config.js`).
- YouTube is an SPA — the content script listens for `yt-navigate-finish` to reset markers/reload bookmarks without a full page reload.

### Storage schema (extension, `chrome.storage.sync`)

Bookmarks keyed `bm_{videoId}`, reminders `rem_{videoId}`, groups under `vgroups`, auth under `bmUser`. Bookmark `id` is `Date.now()` (doubles as unique ID and sort key); duplicates are rejected if `Math.floor(timestamp)` already exists for that video. Tags are parsed from `#word` in the description; known tags map to fixed colors, unknown tags get a deterministic hash-based HSL color.

## Conventions

- Prefer small, targeted diffs over rewrites; reuse existing utilities; don't introduce dependencies or assume undocumented APIs.
- Before implementing a feature, determine its correct home — background service worker (lifecycle/messaging), content script (YouTube DOM), or popup/side panel/dashboard UI — and say which, and why, before writing code.
- No repo-wide linter/formatter — match the surrounding file's style.
- `main` is protected on GitHub (PR + 1 review required). Land changes via a feature branch and PR, not a direct push to `main`, regardless of whether the push would technically succeed.
- This repo is public — avoid committing docs that narrate exploit mechanics, credentials, or other sensitive operational detail; correct/redact rather than describe.
