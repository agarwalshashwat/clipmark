# CONTEXT.md — read this first

**Every agent must read this file before doing anything else, and update it before stopping or
handing off.** It is the shared memory between sessions. **Never delete history** — §4 is
append-only. Only §3 and §6 shrink: prune stale lines there to keep this a two-minute read.

Working protocol → **[AGENTS.md](AGENTS.md)**. Fuller north star → **[docs/LAUNCH-PRD.md](docs/LAUNCH-PRD.md)** (not duplicated here).

---

## 1. What this project is

**ClipMark is a retention tool for people who learn from YouTube.** Bookmark exact moments,
define A–B loops over the parts that matter, get drilled on them later by spaced recall — so a
40-minute lecture becomes something you still know a week on. Anki export and revisit reminders
carry it beyond the extension.

Two surfaces: a **MV3 Chrome extension** (capture, loops, recall, export) and a **Next.js
webapp** (sync, sharing, dashboard, payments). Freemium; **Pro sells through Dodo Payments as
Merchant of Record**, live today. Capture, loops, recall and Anki export need **no account** —
only sync and sharing do.

Live at **clipmark.mithahara.com**; repo `agarwalshashwat/clipmark`, **public** (G1). Exact
free-tier caps and the honest-claims register: LAUNCH-PRD §1 — quote them verbatim.

---

## 2. Operating ideology / guardrails

**If a request conflicts with a guardrail below, FLAG it explicitly** — name the guardrail, say
what you'd do instead. Never silently comply, never silently refuse. The owner overrides these
knowingly, not by accident.

| # | Guardrail | Since |
|---|---|---|
| **G1** | **Repo is PUBLIC.** No secrets, no exploit mechanics. Redact security detail; don't narrate reproduction. | 2026-08-16 |
| **G2** | **No direct pushes to `main`.** PR only, with all six gates green: `ci-unit`, `ci-design-conformance`, `ci-extension-smoke`, `ci-webapp-visual-smoke`, `ci-webapp-build`, `ci-integration`. Applies even where admin rights would allow the push. | 2026-08-16 |
| **G3** | **Prod migrations: owner-applied by hand, backup first.** Never an agent, never the build. Verify objects (`SELECT to_regclass(...)`), not the ledger row. | 2026-08-15 |
| **G4** | **Chrome Web Store uploads are owner-only, never automated.** Publishing is irreversible and force-updates everyone; no store credential exists here, by design. | 2026-08-15 |
| **G5** | **Honest claims only.** Never claim what the *published* listing lacks. The recall schedule is interval-doubling with a 60-day ceiling — not SM-2, not FSRS. Export is not "sync". | 2026-08-16 |
| **G6** | **Privacy is a feature.** Narrow host permissions, on-device AI, anonymous insert-only tables. Flag any new permission, beacon, or video-level identifier. | 2026-08-16 |
| **G7** | **Extension ships on a biweekly train** (second Tuesday) with a narrow hotfix lane — security/privacy, data loss, dead core flow, payments, CWS policy. "One-line fix" is not urgency. `docs/RELEASE-PROCESS.md`. | 2026-08-15 |
| **G8** | **Never touch `feature/dashboard-extras-hold` or `sync/dashboard-parity`.** Held, out of scope. | 2026-08-16 |
| **G9** | **Edit both twins.** `constants/recall/loop.js` and their `.module.js` pairs move together — a drift once shipped a production `ReferenceError`. Detail in AGENTS.md. | 2026-08-16 |
| **G11** | **Every shipped extension build is tagged `vX.Y.Z` at its build commit** — an immutable rollback anchor, with the zip's sha256 in the annotated tag message. Created at release-cut / upload time by `scripts/cut-release.sh`, never before. Never move or reuse a release tag. | 2026-08-16 |
| **G10** | **Primary paying target: US / UK / Australia** — Tier-1, high-purchasing-power, English-speaking (Canada/NZ likely similar). The product stays **globally available**; the lens is for decisions. Weigh features, copy, pricing/currency, positioning, SEO and compliance for **US/UK/AU fit** rather than treating them as generic-global. | 2026-08-16 |

---

## 3. Current status

**Last updated: 2026-08-16 by Claude (Cowork Dispatch)** — against `origin/main` @ `0208463`.

**Phase:** webapp and live payments running; **launch / marketing phase**. Every remaining
critical-path item is an owner action, not a coding problem. **v1.0.6 is the published Web Store
build** (owner-reported), anchored at tag `v1.0.6`. `main` is at **1.0.7**, being rebuilt with a
tour fix — it gets its tag at that build, per G11.

**Done** — migrations 018 + 019 applied and verified in prod; the `/uninstall` survey is live end
to end · refunds ledger (#110, #106, #116) · recall-gate paywall fixed (#111) · website
launch-ready: wedge-led homepage, pre-launch wins, system-synced dark mode (#120, #131, #132,
#134) · process and docs: release train (#114), parked backlog (#108), GTM kit (#109), CI build
gate (#133), LAUNCH-PRD refresh (#136), docs prune (#138), release tagging (G11).

**Pending**

| | Item | Owner |
|---|---|---|
| **➡ NEXT** | **Cut and submit v1.0.7** once the tour fix lands. `cut-release.sh` tags it automatically (G11); the upload stays manual and owner-only (G4). | Owner |
| 2 | PR #107 sync engine — parked post-launch, needs a full rebase; its migration renumbers to **020** | — |
| 3 | Feature-usage analytics — **spec only** (`docs/analytics/FEATURE-ANALYTICS-SPEC.md`, #113), not built; blocked on Q1 | — |
| 4 | 2 light-mode contrast misses, incl. `InstallCta` at **2.26:1** (owner-reported, not yet in a repo doc) | — |

---

## 4. Decisions log

Append-only, dated, **what + why**. The *why* is the point — it stops a future agent undoing a
call that looked arbitrary. **Never edit or delete an entry.**

| Date | Decision | Why |
|---|---|---|
| pre-2026-08-09 | **Freemium; Pro via Dodo as Merchant of Record** | Dodo carries global sales-tax and compliance liability a solo owner can't. Worth the fee. |
| pre-2026-08-14 | **Anki export stays free** (10/mo) | It's the study-wedge hook — the thing that makes this a retention tool, not a bookmarker. Paywalling it hides the differentiator. |
| pre-2026-08-12 | **Affiliate 30%, one-time on first payment, not recurring** | Sustainable against real CAC and honest to affiliates: a rate we can pay forever beats a headline we later cut. Stored as a fraction (`0.30`). |
| 2026-08-15 | **Owner applies prod migrations by hand, after a backup** (#115, #116) | Free-tier Supabase has no auto-backups, so a bad migration is unrecoverable. 018 proved the failure mode — its ledger row landed without the body, so the ledger claimed a table that didn't exist. |
| 2026-08-15 | **Biweekly release train + narrow hotfix lane** (#114) | 1.0.2→1.0.5 shipped back-to-back, each a follow-up to the last, burning a review cycle and force-updating everyone. Batching stops the thrash; the lane keeps real emergencies fast. |
| 2026-08-16 | **Dark-mode toggle stayed unmounted until every surface passed AA** (#127–#129 before #134) | A reachable toggle over broken surfaces is worse than no toggle — it invites users into a state we know is unreadable. |
| pre-2026-08-16 | **Rejected: reusing a logged-in ChatGPT/Claude web session for AI** | Violates provider ToS; realistic outcomes are user bans and an extension takedown. Also contradicts the narrow-permissions / on-device posture in G6, which is a selling point. |
| 2026-08-16 | **Migration 019 applied to prod** via the `db:migrate` runner after a `pg_dump` backup | Enables uninstall-feedback capture. Owner-authorized and done with a backup, per G3. |
| 2026-08-16 | **Release tagging: `vX.Y.Z` at the build commit, automated in `cut-release.sh`** (G11) | `main` merges many branches, so after the fact you cannot tell which commit a version was built from — v1.0.6 took a 14-commit, 3-tree forensic reconstruction to anchor, and its zip sha256 is gone for good. A per-version immutable tag is the only reliable rollback point. |
| 2026-08-16 | **Primary target market set to US/UK/AU** (G10) | That's where the purchasing power for a Pro subscription is. The product stays global; decisions get weighed through that lens rather than an averaged-global one. |
| 2026-08-16 | **Docs prune: 8 archived, 4 merged, 1 deleted, `docs/release/` removed** | Stale docs were causing real false work — a parity audit generating false P1s, two specs saying "not implemented" for shipped features, a policy stub listing 3 of 6 CI gates. Consolidated to the canonical set so there is one place to trust per question. Nothing lost: archived under `docs/archive/`, deletions recoverable from git. |

---

## 5. Folder structure

```
extension/          MV3 extension (Vite + CRXJS). dist/ is the shippable artifact
  src/content/      injected into YouTube — isolated world, shared globals (G9)
  src/background/   service worker: alarms, notifications, messaging
  src/popup/        popup, side panel, dashboard UI
webapp/             Next.js 14 App Router + Supabase, auto-deploys to Vercel on merge
  app/              routes; (marketing) is the public group
  migrations/       numbered idempotent SQL — applied by hand, never by the build (G3)
  lib/              Supabase + API client helpers
packages/design-system/tokens.css   single source of truth for CSS custom properties
docs/               LAUNCH-PRD.md (north star) · RELEASE-PROCESS.md (train + hotfix)
                    RELEASE-RUNBOOK.md · TEST-STRATEGY.md · LAUNCH-GATES.md
  gtm/              PARKED-BACKLOG.md (34 post-launch items) + launch/posting/paid kits
  analytics/        FEATURE-ANALYTICS-SPEC.md (spec only, not built)
  archive/          superseded point-in-time docs — historical only, do NOT trust as
                    current state; read its README first
scripts/            cut-release.sh · design-audit.mjs · sync-design-tokens.js
tests/              Playwright specs + unit/ (node:test). *-packaged.spec.ts are NOT in CI
.github/workflows/  ci-launch-gates.yml (the six gates) · release-train.yml (draft build)
DESIGN.md           design system rules, enforced by scripts/design-audit.mjs
```

---

## 6. Open questions / decisions needed

Delete a row once resolved, and append the resolution to §4.

| # | Question | Blocks |
|---|---|---|
| **Q1** | **Extension analytics: opt-in or opt-out, and which events in v1?** | All signed-out activation/retention measurement. **Time-sensitive** — the launch cohort can't be backfilled. |
| **Q2** | **Build feature-usage analytics now or post-launch?** | Whether the launch is measurable. Today we see only signed-in users — a minority, and the most engaged slice. |
| **Q3** | **PR #107 sync engine: rebase and land, or leave parked?** | Needs a full rebase; migration renumbers to 020. |
| **Q4** | **GTM: paid budget, posting voice, which accounts exist?** | Every line of the posting kit. Paid is also gated on social proof the listing doesn't have yet. |
| **Q5** | **The 2 light-mode contrast misses — fix before the push, or accept?** | Includes `InstallCta` at 2.26:1, the primary conversion CTA. |

---

## 7. How to update this file

1. **§3** — restate the phase in one line, move finished work into Done, re-mark **➡ NEXT**, and
   update the "Last updated" line with date, model, and the commit you verified against.
2. **§4** — append one dated row per real call: *what + why*. Append only.
3. **§6** — add what you hit and couldn't resolve; delete what got answered (resolution → §4).
4. **Never edit or delete** §4 or any historical claim. A rewritten log is worse than no log.
5. **Keep it under a ~2-minute read.** Growing? Prune stale §3 and §6 lines — don't add sections.
   Detail belongs in the owning doc from §5, linked rather than restated.
6. Follow [AGENTS.md](AGENTS.md); commit the update **on a PR branch** (G2).
