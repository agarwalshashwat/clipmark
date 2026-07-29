# Session handoff — state as of 2026-07-30

**Snapshot, not living truth.** This records what was built between **2026-07-18 and 2026-07-30**
(PRs **#32 → #48**) and what was deliberately left undone. If you're reading this weeks later,
verify anything load-bearing against the code before trusting it.

Written so a fresh session can be productive without re-deriving the constraints — §5 is the part
that saves the most time.

> **This repo is public.** Items that describe the *current* security or infrastructure posture of
> the live deployment live in `docs/SESSION_HANDOFF.local.md`, which is gitignored and stays on the
> maintainer's machine. Where this doc says "see the local companion", that's what it means — the
> detail was withheld deliberately, not lost.

---

## 1. Where the project stands

| | |
|---|---|
| `main` | `6e68044` — all of §2 merged **except** Sentry |
| Open PR | [#48 Sentry error monitoring](https://github.com/agarwalshashwat/clipmark/pull/48) — branch `feat/sentry-error-monitoring`, tests green, awaiting review/merge |
| Extension unit tests | **200 pass** (`npm run test:unit`) |
| Webapp unit tests | **67 pass** (`npm run test:unit:webapp`) |
| Typecheck + builds | clean, both packages |
| Roadmap position | through Phase 9; Phases 10–12 not started (`ROADMAP.md`) |
| Launch status | **not launched.** Blocking items in §4 |

⚠️ **The GitHub repo was renamed** to `agarwalshashwat/clipmark`. A local remote still pointing at
`youtube-vid-bookmarker` works only via GitHub's redirect:

```bash
git remote set-url origin git@github.com:agarwalshashwat/clipmark.git
```

---

## 2. What shipped

### 2a. Launch blockers — security, payments, packaging (#32, #33, #34)

Fixes for a pre-launch audit (2026-07-14). Five were rated critical:

| # | Problem | Fix |
|---|---|---|
| 1 | `make ext-zip` zipped all of `extension/` — dev manifest, `src/`, `node_modules` → **the shipped extension broke on install** | zip `extension/dist/` |
| 2 | Entitlement columns on `profiles` were writable by row-owners, and the `collections` UPDATE policy was unrestricted | sensitive columns restricted to service-role; view-count-only RPC |
| 3 | `/api/share` trusted a caller-supplied `userId` | require auth, derive `userId` from the token |
| 4 | `refund.succeeded` never set `is_pro = false` → **refunded users kept Pro** | revoke on refund |
| 5 | Supabase `{error}` never checked and the handler returned 200 → Dodo never retried. **User pays, gets nothing, nobody is alerted** | check errors, return 500 on entitlement-write failure |

Also hardened the manifest: dropped `localhost` from `externally_connectable`, re-scoped
`web_accessible_resources` off `<all_urls>`, removed the broad `tabs` permission
(`host_permissions` + `activeTab` cover the reads), and added a `vite build` guard that fails on a
localhost `API_BASE`. `tests/unit/manifest.test.mjs` pins all of this so it can't silently re-widen.

Plus migration hygiene (§4) and a rewrite of `docs/DEPLOYMENTS.md` for the free single-project model.

### 2b. Active Recall (#35, #37, #38, #39, #40, #41, #42)

Video flashcards: **recall → reveal → grade**, on a spaced schedule. Pro-gated.

- **Engine** — `extension/src/recall.module.js`: `isDueForRecall`, `gradeRecall`. SM-2-lite.
  Intervals double on each `got_it`, capped at `RECALL_MAX_INTERVAL_DAYS = 60`; `again` brings the
  card back tomorrow. Pure functions, no storage coupling.
- **Overlay** — in the content script, over the YouTube player.
- **Entry points** — side panel + dashboard, with upsell copy for free users.
- **Due queue** — a "due for recall" strip above the dashboard video grid.
- **Copy** — user-facing "Revisit" renamed to "Active Recall" throughout.
- **E2E** — `tests/recall-packaged-e2e` runs against the **packaged `dist` build**, not source,
  because of the bug below.

**#40 is the cautionary tale.** The packaged extension shipped a **ReferenceError**: `constants.js`
only *declares* things, so Vite tree-shook it to an empty chunk while the built `content.js` still
referenced those names as bare globals. Unpacked dev loads and the source-based E2E suite were fine —
only the artifact users install was broken. Fixed by `globalThis` registration blocks plus a build
guard, `extension/scripts/content-globals-guard.mjs`, that fails `vite build` when a required global
goes missing. **Adding a new bare content-script global means adding it to that list.**

### 2c. Anki export (#36, #43)

Pro-gated TSV export (`Front / Back / Tags`) from **both** the extension and the web dashboard.
Every card's Back carries a `▶ Replay the moment` deep link to the exact second — that link is the
whole point, so don't drop it in a refactor. `extension/src/export-anki.module.js` → `buildAnkiTsv`.

Positioning is **additive to Anki, not a replacement**. Say *export*, never *sync*.

### 2d. Webapp recall surface (#44, #45)

Due badges on the dashboard, and **starting an Active Recall session from the web app** via
`externally_connectable` → the extension. Also dropped a stale third due-check copy.

### 2e. Landing page (#46)

Added Active Recall + Anki sections with committed real screenshots
(`webapp/public/active-recall-{prompt,grade}.png`), both badged **PRO** — the page's main CTA is
"It's Free", so the hero feature must not read as free.

**Removed two false claims:** `✦ Auto Bookmark — AI detects key topic shifts` was never built (the
only occurrence in the whole repo was the marketing copy), and FAQ #2 claimed the AI extracts
"author, primary topic, and key tags" when it actually suggests tags and summarises a transcript
snippet. Replaced with shipped local-AI features. Metadata/JSON-LD updated for recall/flashcard/Anki
terms, which the page previously didn't contain at all.

### 2f. Test tooling (#47)

`ENABLE_PASSWORD_LOGIN` for reaching seeded accounts through the browser (`/signin` is Google-only
for real users — **leave this unset in production**), plus `webapp/scripts/simulate-plan.ts` for
flipping an account between billing states.

### 2g. Sentry — PR #48, open

Two projects under the `mithahara` org: `clipmark-web` and `clipmark-extension`. Split because the
content script runs inside youtube.com and will always see third-party noise; keeping it out of
`clipmark-web` keeps that issue stream and its alerts trustworthy. The 5k errors/month free quota is
**org-wide**, so the split is free.

- **Webapp** — `@sentry/nextjs` v10 via `instrumentation.ts` / `instrumentation-client.ts`, options
  shared through `webapp/lib/sentry-config.ts`. Added `app/global-error.tsx` because **there was no
  root error boundary at all** — client render errors showed a blank page and were never reported.
- **Extension** — no SDK; ~100 lines posting to Sentry's envelope API
  (`extension/src/error-reporting.js`). See §5 for why `@sentry/browser` is impossible here.
  The background worker is the only sender; the content script forwards via
  `error-report-bridge.js`. Reporting is off on unpacked installs, deduped, capped at 20
  events/session.

Deliberately **off**: tracing, session replay, profiling, logs, `sendDefaultPii`. Replay would
record the dashboard — i.e. users' private bookmark titles. Full runbook: `docs/DEPLOYMENTS.md` §6c.

**Unverified gap:** a real content-script error travelling bridge → background → Sentry was never
observed in a browser (isolated world, see §5). Worth one manual pass with
`globalThis.CLIPMARK_SENTRY_DEV = true`.

---

## 3. Verifying it's still green

```bash
npm run test:unit                      # 200 — extension, node:test, no browser
npm run test:unit:webapp               #  67 — webapp
cd webapp && npx tsc --noEmit && npm run build
make ext-build                         # runs the content-globals guard
npm run test:yt                        # Playwright, needs xvfb
npm run test:visual                    # baselines are gitignored — regenerate locally
```

CI gates only `ci-unit`, `ci-extension-smoke`, and `ci-webapp-visual-smoke`. **Visual baselines are
not a CI gate**, so a full-page snapshot change won't be caught for you.

---

## 4. Open items

### Blocking launch

1. **Database migration state needs reconciling before the next deploy.** Read
   `webapp/migrations/README.md` first, then `docs/DEPLOYMENTS.md` §3–§4. Related: production's
   `schema_migrations` records a `012_db_helpers.sql` that isn't in git — recover it from history or
   export the DDL from the live DB, and **do not fabricate an empty file**, which would desync every
   future migration. Remaining production-side security and infrastructure follow-ups are in the
   **local companion doc**, not here.
2. **Manual unpacked-extension smoke pass** before Web Store submission. `CHECKLIST.md` has the
   regression list. Pay attention to the `tabs`-permission removal (unit-tested and builds green,
   but **not runtime-verified**) and the Sentry content-script path.
3. **Merge PR #48**, then in Vercel set **`NEXT_PUBLIC_SENTRY_DSN` before a build** — Next inlines
   `NEXT_PUBLIC_*` at build time, so it needs a redeploy, not a restart. Optionally add
   `SENTRY_AUTH_TOKEN` or production stack traces stay minified.

### Known gaps, not yet assigned

- **Hardening backlog** (rate limiting, webhook idempotency, a billing edge case) — tracked in the
  **local companion doc**, since it describes live behaviour.
- `SocialProof` renders `null` — needs real testimonials / Web Store ratings. **Don't invent
  numbers.**
- `/upgrade` row "Spaced Repetition Reminders" conflates **two distinct systems**: Active Recall's
  per-bookmark client-side schedule, and the separate server-side revisit reminders
  (`revisit_reminders` table + `chrome.alarms`). Rename one.
- Dead code: `extension/src/popup/popup.js`; `escapeHtml` is duplicated in several files.
- Migrations rely on implicit grants — make them explicit if self-hosting matters.
- `docs/TEST_PLAN_launch.md` is **a plan with no tests written yet** for the launch-blocker
  security/payments paths.
- `ClipMark-MedExam-Strategy-Brief.md` sits untracked in the repo root — commit it or ignore it.

---

## 5. Traps that cost real time

Every one of these was learned the hard way in this session.

**The E2E suite loads the extension from raw source** (`tests/fixtures.ts`), and Chrome **cannot
resolve a bare npm specifier** in an unpacked load. So an npm dependency in extension code works in
`dist/` and breaks every source-loaded test. This is why Sentry is hand-rolled. `importScripts()`
throws in the module worker crxjs produces, and dynamic `import()` isn't available in classic
workers — neither is an escape hatch.

**`background.js` uses ES imports, so `manifest.background.type` must be `"module"`.** A manifest
test pins this.

**Content scripts share one global scope and are tree-shakable.** A helper that only declares things
compiles to an empty chunk and the built `content.js` throws — see §2b. Hence the twin-file pattern:
`recall.js` / `constants.js` (classic, `globalThis` registration) alongside `recall.module.js` /
`constants.module.js` (ESM, for the side panel and unit tests). **Both twins must be edited
together**; the file headers say so, and `webapp/tests/unit/{recall,anki}-parity.test.ts` assert the
webapp's own duplicates don't drift either.

**Content scripts run in an isolated world.** Playwright's `page.evaluate` runs in the main world
and cannot see their globals. A probe that reads them returns `undefined` for *everything*,
including globals that are definitely present — that's the harness being wrong, not a bug.

**Next inlines `NEXT_PUBLIC_*` at BUILD time, in server bundles too.** Overriding one at runtime
silently does nothing. `sentry-config.ts` therefore reads a non-prefixed `SENTRY_DSN` first so the
server can be repointed without a rebuild.

**Next treats `_`-prefixed app folders as private** and excludes them from routing — an
`app/api/_foo/` route returns 404. Route handlers are also prerendered at build time unless you set
`export const dynamic = 'force-dynamic'`, so a handler that throws will fail the build.

**Dodo's `test_mode` keys off `NODE_ENV`.** Every Vercel build — Preview included — runs
**`live_mode`**. Checkout testing stays local. Vercel Preview also points at the **production**
Supabase, so it's for UI review only.

**Don't `pkill -f "<pattern>"` for a dev server.** The pattern matches the invoking shell's own
command line and kills the process you're running from (silent exit 144, no output). Use
`fuser -k <port>/tcp`.

**The Sentry envelope format is hand-built and nothing validates it.** A malformed envelope is
**silently dropped** — monitoring would look fine while reporting nothing.
`tests/unit/error-reporting.test.mjs` pins the wire format. Don't delete it.

---

## 6. Doc map

| Doc | What it's for |
|---|---|
| `docs/DEPLOYMENTS.md` | **Start here.** Environments, migration procedure, env vars, payments-testing rules, Sentry (§6c) |
| `docs/OWNER_SETUP_CHECKLIST.md` | Owner-side setup steps |
| `docs/release/` | `LAUNCH_GO_NO_GO_CHECKLIST.md`, `LAUNCH_DAY_RUNBOOK.md`, `RELEASE_POLICY.md`, `LAUNCH_PLAN.md` |
| `CHECKLIST.md` | Manual regression list |
| `webapp/migrations/README.md` | The `012`/`013` situation — read before any migrate |
| `ROADMAP.md` | Phases; 10–12 are the unstarted ones |
| `.claude/CLAUDE.md` | Working conventions: minimal diffs, no unneeded deps, explain placement first |

**Two rules worth restating:** migrations are **never** run by the build — you apply them by hand,
locally first, with a production backup. And a migration that has been applied anywhere is
**never edited** — write a new higher-numbered file.
