# CONTEXT.md — read this first

**Every agent working in this repo must read this file before doing anything else, and must
update it before stopping or handing off.** It is the shared memory between sessions: what this
project is, what we will not do, where we are, and why past calls were made.

**Never delete history.** §4 (decisions) is append-only. §3 and §6 are the only sections that
shrink — prune stale lines there rather than letting the file grow past a two-minute read.

Working protocol (how to actually do a task here): **[AGENTS.md](AGENTS.md)**.
Fuller product north star: **[docs/LAUNCH-PRD.md](docs/LAUNCH-PRD.md)** — not duplicated here.

---

## 1. What this project is

**ClipMark is a retention tool for people who learn from YouTube.** Bookmark exact moments in a
lecture, define A–B loops over the parts that matter, and get drilled on them later by spaced
recall — so a 40-minute video becomes something you still know a week on. Anki export and
revisit reminders carry it outside the extension.

Two surfaces, one product: a **Manifest V3 Chrome extension** (capture, loops, recall, export)
and a **Next.js webapp** (cloud sync, sharing, dashboard, payments). Freemium; **Pro is sold
through Dodo Payments as Merchant of Record**, live today. Capture, loops, recall and Anki
export all work with **no account** — only sync and sharing need one.

Live at **clipmark.mithahara.com**; the GitHub repo is `agarwalshashwat/clipmark` and is **public** (G1).

Positioning, exact free-tier caps and the honest-claims register: `docs/LAUNCH-PRD.md` §1.
Quote the caps from there verbatim; rounding them is a claim we can't stand behind.

---

## 2. Operating ideology / guardrails

**If a future request conflicts with any guardrail below, FLAG it explicitly to the user rather
than silently complying or silently refusing.** Say which guardrail, why it conflicts, and what
you'd do instead. These are defaults with reasons, not a wall — but the owner overrides them
knowingly, never by accident.

| # | Guardrail | Since |
|---|---|---|
| **G1** | **This repo is PUBLIC.** Never commit secrets, credentials, or exploit mechanics. Correct or redact a security write-up; don't narrate how to reproduce it. | 2026-08-16 |
| **G2** | **No direct pushes to `main`.** Every change lands by PR with all six CI gates green: `ci-unit`, `ci-design-conformance`, `ci-extension-smoke`, `ci-webapp-visual-smoke`, `ci-webapp-build`, `ci-integration`. Holds even where admin credentials would let a push through. | 2026-08-16 |
| **G3** | **Production DB migrations are applied by hand, by the owner, with a backup taken first.** Never by an agent, never by the build. Verify the *objects* afterwards (`SELECT to_regclass(...)`), not the ledger row. | 2026-08-15 |
| **G4** | **Chrome Web Store uploads are owner-only and never automated.** Publishing is irreversible and force-updates every user. No store credential exists in this repo or its CI, by design. | 2026-08-15 |
| **G5** | **Honest product and marketing claims only.** Never claim a capability the *published* listing doesn't carry; never call the recall schedule SM-2 or FSRS (it's interval doubling with a 60-day ceiling); never call export "sync". | 2026-08-16 |
| **G6** | **Privacy posture is a feature, not overhead.** Narrow host permissions, on-device AI, anonymous insert-only tables (`feedback`, `uninstall_feedback`: INSERT for anon, no SELECT). Don't add a permission, a beacon, or a video-level identifier without flagging it. | 2026-08-16 |
| **G7** | **Extension releases ride a biweekly train** (every second Tuesday) with a narrow hotfix lane — security/privacy, data loss, dead core flow, payments, CWS policy. "It's a one-line fix" is not urgency. See `docs/RELEASE-PROCESS.md`. | 2026-08-15 |
| **G8** | **Never touch `feature/dashboard-extras-hold` or `sync/dashboard-parity`.** Held branches, out of scope. | 2026-08-16 |
| **G9** | **Edit both twins.** `constants.js`/`recall.js`/`loop.js` and their `.module.js` pairs must move together; a drift shipped a production `ReferenceError` once. Details in [AGENTS.md](AGENTS.md). | 2026-08-16 |

---

## 3. Current status

**Last updated: 2026-08-16 by Claude (Sonnet, Cowork Dispatch)** — verified against `origin/main` @ `e4d1845`.

**Phase:** extension live on the Chrome Web Store, webapp and live payments running. We are in
the **launch / marketing phase** — remaining work is mostly owner actions, not engineering.

**Done**

- Refunds: durable `pending_refunds` ledger; **migration 018 applied and verified in prod** (#110, #106, #116)
- Recall-gate paywall bug fixed — free tier no longer blocked at a fifth entry point (#111)
- Homepage fixes live: honest free/Pro claims, anchors, mobile fold, flashcard-wedge lead (#131, #132)
- Pre-launch web wins: analytics component, custom 404, OG card + favicon set (#120)
- Dark-mode surface sweep — footer, marketing, dashboard (#127, #128, #129)
- **Dark-mode toggle merged (#134) — system-synced dark mode is now live**
- Release train + `scripts/cut-release.sh` (#114) · Parked backlog (#108) · GTM kit (#109) · CI webapp build gate (#133)

**Pending**

| | Item | Owner |
|---|---|---|
| **➡ NEXT** | **Apply migration `019_uninstall_feedback.sql` to production** (backup first). v1.0.6 registers the uninstall URL, so the page 500s on every uninstall until this table exists — it must land *before* the store submission. | Owner |
| 2 | Submit **v1.0.6** to the Chrome Web Store (`main` is already at 1.0.6) | Owner |
| 3 | PR #107 sync engine — parked post-launch, needs a full rebase; its migration renumbers to **020** | — |
| 4 | Feature-usage analytics — **spec only** (`docs/analytics/FEATURE-ANALYTICS-SPEC.md`, #113), not built; blocked on D1/D2 in §6 | — |
| 5 | 2 known light-mode contrast misses, incl. `InstallCta` "Install the extension" at **2.26:1** (owner-reported; not yet recorded in a repo doc) | — |

---

## 4. Decisions log

Append-only. One line each: **what + why**. The *why* is the point — it's what stops a future
agent quietly undoing a call that looked arbitrary. **Never edit or delete an entry.**

| Date | Decision | Why |
|---|---|---|
| pre-2026-08-09 | **Freemium, with Pro sold via Dodo Payments as Merchant of Record** | Dodo carries global sales-tax and compliance liability that a solo owner cannot; MoR was worth the fee. |
| pre-2026-08-14 | **Anki export stays on the free tier** (1/month) | It's the study-wedge hook — the feature that makes a bookmarking tool a retention tool. Paywalling it hides the thing that differentiates us. |
| pre-2026-08-12 | **Affiliate commission 30%, one-time on first payment — not recurring** | Sustainable against real CAC, and honest to affiliates: a rate we can pay forever beats a headline we later cut. Stored as a fraction (`0.30`). |
| 2026-08-16 | **Dark-mode toggle stayed unmounted until every surface passed AA** (#127→#129 before #134) | A reachable toggle over broken surfaces is worse than no toggle — it invites users into a state we know is unreadable. |
| 2026-08-15 | **Biweekly release train + narrow hotfix lane** (#114) | 1.0.2→1.0.5 shipped in rapid succession, each a follow-up to the last, burning a Google review cycle and force-updating everyone. Batching stops the thrash; the lane keeps genuinely urgent fixes fast. |
| 2026-08-15 | **Owner applies prod migrations by hand, after a backup** (#115, #116) | Free-tier Supabase has no automatic backups, so a bad migration is unrecoverable. 018 also proved the failure mode: its ledger row was inserted without the body, so the ledger claimed a table that didn't exist. |
| pre-2026-08-16 | **Rejected: reusing a logged-in ChatGPT/Claude web session to power AI features** | Violates those providers' ToS — the realistic outcomes are user account bans and an extension takedown. It also contradicts the narrow-permissions / on-device positioning in G6, which is a selling point, not a constraint to route around. |

---

## 5. Folder structure

```
extension/          MV3 Chrome extension. Vite + CRXJS; dist/ is the shippable artifact
  src/content/      injected into YouTube — isolated world, shared globals (see G9)
  src/background/   service worker: alarms, notifications, messaging
  src/popup/        popup, side panel, dashboard UI
webapp/             Next.js 14 App Router + Supabase, auto-deployed to Vercel on merge
  app/              routes; (marketing) is the public group
  migrations/       numbered idempotent SQL — applied by hand, never by the build (G3)
  lib/              Supabase + API client helpers
packages/design-system/tokens.css   single source of truth for CSS custom properties
docs/               LAUNCH-PRD.md (north star) · RELEASE-PROCESS.md (train + hotfix)
                    RELEASE-RUNBOOK.md · TEST-STRATEGY.md · LAUNCH-GATES.md
  gtm/              PARKED-BACKLOG.md (34 post-launch items) + launch/posting/paid kits
  analytics/        FEATURE-ANALYTICS-SPEC.md (spec only, not built)
scripts/            cut-release.sh (extension cuts) · design-audit.mjs · sync-design-tokens.js
tests/              Playwright specs + unit/ (node:test). *-packaged.spec.ts are NOT in CI
.github/workflows/  ci-launch-gates.yml (the six gates) · release-train.yml (draft build)
DESIGN.md           design system rules, enforced by scripts/design-audit.mjs
```

---

## 6. Open questions / decisions needed

Remove a row once it's resolved (and append the resolution to §4).

| # | Question | Blocks |
|---|---|---|
| **Q1** | **Extension analytics: opt-in or opt-out, and which events ship in v1?** (D1/D2 in the PRD) | All signed-out activation/retention measurement. **Time-sensitive** — the launch cohort can't be backfilled. |
| **Q2** | **Build feature-usage analytics now, or after launch?** | Whether the launch is measurable at all. Today we can only see signed-in users — a minority, and the most engaged slice. |
| **Q3** | **PR #107 sync engine — rebase and land, or leave parked?** | Needs a full rebase; migration renumbers to 020. |
| **Q4** | **GTM open items: paid budget, posting voice, which accounts actually exist** (D3–D5) | Every line of the posting kit. Paid is also gated on social proof the listing doesn't have yet. |
| **Q5** | **The 2 light-mode contrast misses** — fix before the push, or accept? | Includes `InstallCta` at 2.26:1, which is the primary conversion CTA. |

---

## 7. How to update this file

1. **§3 Current status** — restate the phase in one line, move finished items into Done, and
   re-mark the **➡ NEXT** row. Update the "Last updated" line with the date, your model, and
   the commit you verified against.
2. **§4 Decisions log** — append one dated row per real call you made, *what + why*. Append only.
3. **§6 Open questions** — add what you hit and couldn't resolve; delete what got answered
   (and append the answer to §4).
4. **Never edit or delete** anything in §4, or any historical claim elsewhere. History is the
   asset; a rewritten log is worse than no log.
5. **Keep the whole file under a ~2-minute read.** If it's growing, prune stale §3 and §6 lines
   — do not add sections. Detail belongs in the owning doc in §5, linked from here.
6. Follow [AGENTS.md](AGENTS.md) and commit the update **on a PR branch** (G2).
