# AGENTS.md — working protocol

Canonical instructions for **any** agent or tool working in this repo (Claude Code, Codex,
Cursor, Copilot, a human — it doesn't matter which).

## The protocol

1. **Read [CONTEXT.md](CONTEXT.md) first.** It holds what the project is, the guardrails, the
   current status, and why past decisions were made. Don't start work without it.
2. **Follow CONTEXT.md §2 guardrails.** If the request conflicts with one, **flag it explicitly
   to the user** — name the guardrail and say what you'd do instead. Never silently comply and
   never silently refuse.
3. **Do the work.** Prefer small, targeted diffs over rewrites; reuse existing utilities; don't
   add dependencies or assume undocumented APIs. Before building a feature, decide its correct
   home — background service worker (lifecycle/messaging), content script (YouTube DOM), or
   popup/side-panel/dashboard UI — and say which, and why, before writing code.
4. **Before stopping or handing off, update CONTEXT.md**: §3 status and the ➡ NEXT marker, §4
   decisions log (append-only, *what + why*), §6 open questions. See CONTEXT.md §7.
5. **Commit with a clear message and open a PR.** `main` is protected — PR with all six CI
   gates green, never a direct push, regardless of whether admin credentials would allow it.

---

## Repository guidelines

### Structure

- `extension/` — Chrome extension source: `src/content/`, `src/background/`, `src/popup/`, `src/pages/`.
- `webapp/` — Next.js app: routes under `app/`, SQL in `migrations/`, helpers in `lib/`.
- `packages/design-system/` — shared CSS tokens used by both surfaces.
- `tests/` — Playwright E2E specs and Node unit tests. `webapp/tests/` holds the webapp's own.

Full tree with per-folder purpose: CONTEXT.md §5.

### Commands

Root `Makefile` wraps the common workflows (`make help` lists them):

```bash
make dev            # webapp dev server (next dev)
make build          # next build — does NOT run migrations
make start          # next start
make db-migrate     # apply pending SQL migrations (see the migration rules below)
make ext-dev        # extension Vite dev server, auto-reload
make ext-build      # build the extension into extension/dist/
make ext-zip        # ext-build + zip dist/ for the Web Store (never zip the repo root)
make ext-open       # open chrome://extensions
make sync-tokens    # copy packages/design-system/tokens.css into extension/ and webapp/
make design-audit   # run scripts/design-audit.mjs
```

### Testing — four independent layers

Know which layer a change needs:

```bash
npm run test:unit          # extension/shared logic — node:test, tests/unit/*.test.mjs, no browser
npm run test:unit:webapp   # webapp logic — node --test, webapp/tests/unit/*.test.ts
npm run test:integration   # webapp/tests/integration — needs local Supabase
npm run test:yt            # Playwright + extension via launchPersistentContext — non-headless, workers=1
npm run test:visual        # Playwright webapp visual snapshots (baselines gitignored, regenerate locally)
npm run test:all           # test:unit + test:yt + test:visual
```

Run a single file directly rather than through the npm wrapper:

```bash
node --test tests/unit/recall.test.mjs
npx playwright test tests/bookmark-lifecycle.spec.ts --project=extension
cd webapp && node --import ./tests/unit/fixtures/env-setup.mjs --import tsx --test tests/unit/webhook-dodo.test.ts
cd webapp && npx tsc --noEmit
```

Add or update tests near the behavior you change — especially storage schema, bookmark
lifecycle, and UI injection flows.

`npm run test:integration` needs a local Supabase stack: `supabase start` plus
`npm --prefix webapp run db:bootstrap`. That bootstrap step is not optional — see the grants
note under *Migrations*.

### CI

`.github/workflows/ci-launch-gates.yml` gates every PR on six jobs: `ci-unit`,
`ci-design-conformance`, `ci-extension-smoke`, `ci-webapp-build`, `ci-webapp-visual-smoke`,
`ci-integration`. Reproducing `ci-extension-smoke` and `ci-integration` locally needs
`xvfb-run` and a local Supabase stack respectively.

**A green PR does not mean everything ran.** CI gates 4 of ~20 Playwright specs. None of the
`*-packaged.spec.ts` specs — the ones that exercise the shipped `dist/` — run in CI. Run those
locally before a release cut.

### Style

- 2-space indent; semicolons where the file already uses them.
- Clear descriptive names; route folders lowercase, brackets only where Next.js requires them
  (`app/v/[shareId]/`).
- Keep shared design values in `packages/design-system/tokens.css` — never duplicate colors or
  spacing. Edit tokens only there, then `make sync-tokens` to propagate.
- No repo-wide linter or formatter. Match the surrounding file and keep edits minimal.

### Commits & PRs

Short conventional prefixes (`feat:`, `fix:`, `refactor:`, `chore:`), imperative subject, one
change per commit. In the PR: what changed and why, linked issues, screenshots for UI changes,
and the relevant test commands run before review.

### Security & configuration

Never commit secrets. Webapp config lives in `webapp/.env.local`; local extension API targets
may need `API_BASE` changed in `extension/src/config.js`. **This repo is public** — don't commit
docs narrating exploit mechanics or sensitive operational detail; correct or redact instead.

---

## Engineering rules that are not obvious

These cost real production incidents. Read them before touching the areas they cover.

### The twin-file pattern (extension)

Content scripts run in an **isolated world sharing one global scope**, and Vite/Rollup
tree-shakes unused exports. That combination once shipped a production `ReferenceError` —
constants were tree-shaken into an empty chunk while `content.js` referenced them as bare
globals. Dev loads and source-based E2E were unaffected; only the built artifact broke.

The fix is a twin-file convention:

- `constants.js` / `recall.js` / `loop.js` — classic scripts that register onto `globalThis`,
  loaded directly by the content script via `manifest.json`'s `content_scripts`.
- `constants.module.js` / `recall.module.js` / `loop.module.js` — ESM equivalents, used by the
  side panel, dashboard, and unit tests.

**Edit both twins together.** `webapp/tests/unit/{recall,anki}-parity.test.ts` assert the
webapp's own copies haven't drifted, and there is no other enforcement.

Build-time guards, both Vite `closeBundle` hooks:

- `extension/scripts/content-globals-guard.mjs` fails the build if a required content-script
  global goes missing from the shipped chunks. **Add any new bare global to its list.**
- `extension/scripts/api-base-guard.mjs` fails a production `vite build` (not `vite dev`) if
  `extension/src/config.js` points at localhost. `config.js` is committed as the production
  default; `config.example.js` documents it.

### Migrations

`webapp/migrations/*.sql` are numbered, idempotent, applied by `webapp/scripts/migrate.ts`
against `DATABASE_URL`, and tracked in `public.schema_migrations`.

- **The build never runs migrations** (`make build` is `next build` only). Apply by hand with
  `make db-migrate`, locally first, with a production backup. Production application is the
  **owner's** job, not an agent's (CONTEXT.md §2 G3).
- **A migration already applied anywhere is never edited.** Write a new higher-numbered file.
- **Verify objects, not the ledger row.** 018's `schema_migrations` row was once inserted
  *without* the migration body, leaving a ledger claiming a table that didn't exist. Check with
  `SELECT to_regclass('public.<table>')`.
- Applying by hand in the Supabase SQL editor means **you** own the ledger row. Paste this in
  the *same* transaction as the migration, or the next `db-migrate` re-runs the file:

  ```sql
  INSERT INTO public.schema_migrations (version) VALUES ('NNN_name.sql') ON CONFLICT (version) DO NOTHING;
  ```

- These migrations don't `GRANT` table privileges explicitly — they assume hosted Supabase's
  default schema-level grants and layer `REVOKE`/column-`GRANT` on top. A bare local
  `supabase start` lacks those defaults, which is why the integration harness runs
  `npm --prefix webapp run db:bootstrap` before migrating.

Taking a production backup: this machine has **no `pg_dump`**, and Ubuntu's default
`postgresql-client` is PG 16 — too old for the PG 17 hosted server. Dump through Docker
instead (reads the URI from `webapp/.env`, so no credentials on the command line):

```bash
cd webapp && URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" && docker run --rm postgres:17 pg_dump -n public -n auth --no-owner --no-privileges "$URL" > ~/clipmark_backup_$(date +%F).sql
```

`--no-owner --no-privileges` keeps the dump restorable without superuser but omits every
`GRANT`/`REVOKE` — schema, data, RLS flags and policies are all included, so after a restore
re-run the grant-hardening migrations (`013`, `014`).

### Webapp

- All routes under `webapp/app/` (App Router); `(marketing)` is the public route group.
- `webapp/lib/supabase.ts` and `webapp/lib/clients.ts` — Supabase/API client helpers.
- Payments are **Dodo Payments** (Merchant of Record). Dodo's `test_mode` keys off `NODE_ENV`,
  and **every Vercel build — including Preview — runs in `live_mode`**. Keep checkout testing
  local. Vercel Preview also points at the **production** Supabase project, so it is UI-review
  only, never a safe integration-test target.
- `NEXT_PUBLIC_*` env vars are inlined by Next at **build time**, including in server bundles —
  changing one requires a redeploy, not a restart.

### Extension runtime

- The service worker (`background.js`) uses a `keepalive` alarm to survive MV3's ~5 min idle shutdown.
- Extension ↔ webapp messaging goes through `chrome.runtime.onMessageExternal` (OAuth token
  handoff) and `fetch` against `API_BASE` (`extension/src/config.js`).
- YouTube is an SPA — the content script listens for `yt-navigate-finish` to reset markers and
  reload bookmarks without a full page reload.

### Storage schema (`chrome.storage.sync`)

Bookmarks keyed `bm_{videoId}`, reminders `rem_{videoId}`, groups under `vgroups`, auth under
`bmUser`. A bookmark `id` is `Date.now()` — it doubles as unique ID and sort key. Duplicates are
rejected if `Math.floor(timestamp)` already exists for that video. Tags are parsed from `#word`
in the description; known tags map to fixed colors, unknown tags get a deterministic hash-based
HSL color.

### Releases

Extension releases ride the biweekly train with a narrow hotfix lane —
**[docs/RELEASE-PROCESS.md](docs/RELEASE-PROCESS.md)** owns the policy,
[docs/RELEASE-RUNBOOK.md](docs/RELEASE-RUNBOOK.md) the mechanics. Cut with
`scripts/cut-release.sh` (it bumps `manifest.json` and `extension/package.json` together —
never hand-edit either). The Chrome Web Store upload is **manual and owner-only, always**.
