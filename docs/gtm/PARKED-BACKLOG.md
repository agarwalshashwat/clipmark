# Parked Backlog

**Living document.** Everything non-critical that got parked so ClipMark could ship
and the owner could pivot to marketing. Pull from here post-launch; edit in place
as items land or die.

> **Critical / refund work is NOT in this document.** The refund-wallet-funds
> handling and its migration are tracked in **PR #106**
> (`fix/refund-wallet-funds-handling`). Nothing about refunds, wallet funding or
> cancellation error surfacing belongs on this list — if you find it here, it's a
> mistake, delete it.

Audited against `origin/main` @ `7e1fc2e` (post-#94 `DASHBOARD-PARITY.md`) on
**2026-08-12**. Counts and line numbers were re-derived from the code, not carried
over from conversation — where a claim as-parked turned out to be stale, the
correction is marked **⚠ corrected**.

**Categories:** Feature · Minor fix · Infra · Cleanup · Future idea · Task
**Priority:** P1 soon · P2 later · P3 someday

---

## Summary

| Category | Count |
|---|---|
| Feature | 9 |
| Minor fix | 6 |
| Infra | 7 |
| Cleanup | 6 |
| Future idea | 5 |
| Task | 1 |
| **Total** | **34** |

By priority: **P1** 9 · **P2** 17 · **P3** 8

---

## P1 — soon

### 1. Extension Reminders create form throws before it renders
Bare global `TITLE_TRUNCATE_LENGTH` is only assigned by `constants.js` (injected as
a youtube.com content script); the dashboard page's ESM graph never defines it, so
the `.map()` callback throws for any user with at least one titled bookmark — i.e.
effectively every real user.
**Category:** Minor fix · **Priority:** P1
**Source:** `docs/DASHBOARD-PARITY.md` §13.1 → `extension/src/popup/dashboard.js:1657`, `extension/src/constants.js:134`
**Note:** reasoned from source in that audit, not reproduced against a packaged build. Confirm with a `dist/` load first. Same bug class the twin-file convention exists to prevent — see item 6.

### 2. Active Recall started from the web has no entitlement check
Neither the due-strip chip nor the extension's bridge handler checks `is_pro` or
touches the free monthly review counter, while the extension's own path does both.
A free user with the extension installed gets unlimited Active Recall by starting
it from the website. Revenue leak, not cosmetic.
**Category:** Minor fix · **Priority:** P1
**Source:** `docs/DASHBOARD-PARITY.md` §13.2 → `webapp/app/dashboard/_components/DashboardContent.tsx:736`, `extension/src/background/background.js:430`, cf. `extension/src/popup/dashboard.js:1491-1510`
**Note:** durable fix belongs in the bridge handler — single choke point for both surfaces.

### 3. Fourteen undefined CSS-module classes on the web dashboard
`DashboardContent.tsx` references fourteen `toolbarStyles.*` keys defined nowhere
under `webapp/app`. CSS Modules resolve unknown keys to `undefined`, so in
production the per-bookmark action row, selection checkboxes, bulk-delete bar,
copy/upgrade toast and pending indicator all render with no class at all.
**Category:** Minor fix · **Priority:** P1
**Source:** `docs/DASHBOARD-PARITY.md` §12 → `webapp/app/dashboard/_components/toolbar.module.css`
**Note:** first flagged in PR #76 as out of scope, survived the #93 restyle. It's why several §2 parity rows read ❌ even though the behaviour is present.

### 4. Webapp dark-mode Phase 3 — the hardcoded-light sweep
Dark mode shipped for side panel / extension dashboard / site in v1.0.4; the
webapp is the substantial remainder. **75 hardcoded light backgrounds**: 58 across
12 `.module.css` files, 17 inline in `.tsx`. Also needs the resolution wiring
(drop `data-theme="light"` from `layout.tsx:93`, rewrite `ThemeProvider.tsx`,
actually render the existing `ThemeToggle.tsx`).
**Category:** Minor fix · **Priority:** P1
**Source:** `docs/DARK-MODE-PLAN.md` §4.1–4.2 (per-file counts table there)
**⚠ corrected:** parked as "~74 inline white literals" — the real split is 58 in CSS modules + 17 inline, and the inline ones are the harder half (no cascade to override). `webapp/app/api/og/route.tsx` must stay light-only and literal (`LITERAL_ONLY` in `design-audit.mjs`) — don't let the sweep tokenize it.

### 5. `chrome.runtime.lastError` / "message port closed" unhandled-rejection noise
Real open bug, feeds Sentry via the four `unhandledrejection` listeners.
**Category:** Minor fix · **Priority:** P1
**Source:** conversation; verified in `extension/src/`
**⚠ corrected — scope is smaller than parked.** Parked as "~15 sendMessage sites in content.js/background.js/dashboard.js". Actual: **16 real call sites across 4 files**, and `extension/src/popup/dashboard.js` has **zero** — it doesn't use `sendMessage` at all. Most sites are already guarded (awaited inside `try`/`catch`, or an explicit `.catch()`, or a `lastError` read). The genuinely unguarded ones are **four**:

| Site | Problem |
|---|---|
| `background/background.js:370` | floating `chrome.tabs.sendMessage` (`showToast`), no `.catch()` — the enclosing `try` can't catch a non-awaited rejection |
| `background/background.js:412` | same, `bookmarkUpdated` |
| `background/background.js:413` | same, `showToast` |
| `content/content.js:2824` | callback form, never reads `chrome.runtime.lastError` → "Unchecked runtime.lastError" console noise |

`error-report-bridge.js:47` and `popup/side-panel.js:485` are already correct and
are the pattern to copy.

### 6. Extend the build-time globals guard to page scripts
`extension/scripts/content-globals-guard.mjs` covers content-script chunks only.
The same missing-global class of bug has now shipped from a **page** script
(item 1). Guard the page-script entry graphs too, or add a `define` shim in
`vite.config.mjs`.
**Category:** Infra · **Priority:** P1
**Source:** `docs/DASHBOARD-PARITY.md` §13.1; `.claude/CLAUDE.md` (twin-file convention)

### 7. Add `SENTRY_AUTH_TOKEN`
The DSN is write-only today, so Sentry can't be triaged from the API and source
maps aren't uploaded (`webapp/next.config.mjs:37` disables sourcemap upload when
the token is absent).
**Category:** Infra · **Priority:** P1
**Source:** `docs/DEPLOYMENTS.md:187` (already listed there as "no, but wanted")
**Note:** two different needs, two different scopes. Source-map upload wants `project:releases` — that's what `DEPLOYMENTS.md` documents. **Triage-via-API additionally needs read scopes** (`event:read` / `project:read`); a releases-only token won't do it. Decide whether that's one token or two.

### 8. `DESIGN.md` has drifted behind the implementation
`--scrim`, `--focus-ring` and `--elevation-rim` are new tokens `DESIGN.md` never
mentions, and the dark-mode behaviour (system resolution, three-state override,
either-is-dark, pre-paint contract) exists only in code, `DARK-MODE-PLAN.md` and
audit rule R9. `DESIGN.md` is machine-enforced, so drift undermines the point.
**Category:** Cleanup · **Priority:** P1
**Source:** `docs/DARK-MODE-PLAN.md` §6
**Note:** cheap, and should land **before** Phase 3 (item 4) starts writing webapp theme code against a stale spec.

### 9. Analyze friends-and-family feedback once it comes in
The form is shipped and live (`webapp/app/(marketing)/feedback/`,
`webapp/app/api/feedback/`, migration `017_feedback.sql`) — the parked half is the
analysis pass and turning it into roadmap input.
**Category:** Task · **Priority:** P1
**Source:** conversation
**Note:** gated on responses arriving, not on engineering. Cross-check against item 30 (feature-request board) — if volume is real, that spec moves up.

---

## P2 — later

### 10. Web ↔ extension dashboard parity gaps (umbrella)
Across 115 compared capabilities: **63 ✅ · 32 ⚠ intentional · 20 ❌ real gaps**.
Ten of the 20 cluster into the loop-rendering and scrubber fixes, so it's closer
to two fixes than twenty. Items 1, 2, 3, 11–15 below are the individually-tracked
children; this row is the parent.
**Category:** Feature · **Priority:** P2
**Source:** `docs/DASHBOARD-PARITY.md` (merged as PR #94), §13 ranks the gaps

### 11. A–B loop ranges render in only one of five web render sites
Loops are the newest headline feature and on the web they're mostly
indistinguishable from ordinary bookmarks. The helper already exists and is
twin-tested — four one-line changes.
**Category:** Feature · **Priority:** P2
**Source:** `docs/DASHBOARD-PARITY.md` §4, §13.3

### 12. The web scrubber is decorative
Markers are spaced by array index, not by position in the video, so it silently
misrepresents where clips sit. Closing this properly means persisting duration
alongside bookmarks (the web has no `videoDurations` equivalent).
**Category:** Feature · **Priority:** P2
**Source:** `docs/DASHBOARD-PARITY.md` §13.4 → `webapp/app/dashboard/_components/DashboardContent.tsx:833`

### 13. Exports aren't cross-importable between surfaces
Two different JSON shapes for the same feature; a user moving between surfaces
gets "no valid bookmarks" in either direction. Smaller change is teaching each
importer to accept both shapes.
**Category:** Feature · **Priority:** P2
**Source:** `docs/DASHBOARD-PARITY.md` §10, §13.6

### 14. Group membership is invisible from a web bookmark card
The extension's picker shows and toggles every group a video belongs to; the web
modal only ever adds to one, and removal is only possible on `/dashboard/groups`.
**Category:** Feature · **Priority:** P2
**Source:** `docs/DASHBOARD-PARITY.md` §7, §13.7

### 15. `/dashboard?v=…` is a dead parameter
The Groups page links every video thumbnail to it and nothing reads it, so the
click lands on an unfiltered dashboard. Either implement the drilldown (restoring
the extension's Videos-card behaviour) or point the links at YouTube.
**Category:** Feature · **Priority:** P2
**Source:** `docs/DASHBOARD-PARITY.md` §5, §7, §13.8

### 16. Retention analytics redesign
`/dashboard/analytics` ships the basics (14-day activity heatmap, tag frequency,
top videos, totals). The parked work is the retention/streak/mastery layer over
data already in `user_bookmarks` JSONB — keep the basic heatmap free, gate only
the new sections Pro.
**Category:** Feature · **Priority:** P2
**Source:** `ROADMAP.md` §8.4 (shipped baseline); `ClipMark-ROADMAP.md:70` "Advanced Learning Stats" (S–M, 1–1.5 wk, Low risk)
**Note:** `ClipMark-ROADMAP.md:76` puts this early in the recommended pull order — quick, low-risk, no schema surprises.

### 17. Affiliate payout automation
Conversions are tracked automatically with a `pending / approved / paid /
cancelled` lifecycle and a CSV export, but settlement is **manual by hand**, and
we say so publicly: *"We review eligible balances each month and settle them by
hand — payouts are not yet automated"* and *"there is no self-serve affiliate
dashboard yet"*. Fine at current volume; it's a standing monthly commitment.
**Category:** Feature / Infra · **Priority:** P2
**Source:** `webapp/app/(marketing)/affiliate/page.tsx:81,117,371`; `webapp/app/api/affiliate/export/route.ts`; `ROADMAP.md` §8.2
**Note:** the affiliate *dashboard* route is parked on `feature/dashboard-extras-hold` (do not touch that branch). Automating payouts and un-parking the dashboard are separable — the dashboard is the one users see.

### 18. Phase 10a cross-device sync engine — PR #107 (draft)
Real sync engine: tombstones, revision CAS, worker-owned queue. Still draft as of
2026-08-11. Largest parked item by surface area, and it has ordering constraints
for the production rollout.
**Category:** Infra · **Priority:** P2
**Source:** PR #107, `claude/clipmark-sync-engine-011e96`
**Note:** writer invariants are tombstone + stamp + revision bump, and migration order matters — read the PR before touching it. Don't resume it as a side quest.

### 19. Most Playwright specs aren't gated in CI
17 specs exist under `tests/`; CI (`.github/workflows/ci-launch-gates.yml`) runs
only `auth-bridge`, `design-consistency` (rendered) and the two `tests/ci/*`
smokes. **The packaged/dist-loading specs — `loop-packaged`, `loop-zip`,
`recall-packaged`, `tour-packaged`, `dashboard-reminders-packaged` — never run on
a PR.** A green PR is not evidence they pass. That's exactly the blind spot item 1
and item 6 live in.
**Category:** Infra · **Priority:** P2
**Source:** `.github/workflows/ci-launch-gates.yml`; `package.json` scripts
**Note:** they need `xvfb-run` and a built `dist/`, which is why they were left out. Gating even one packaged spec would have caught item 1.

### 20. Test-strategy backlog row — five flagged-but-unscheduled items
Extension-initiated cloud-sync E2E spanning Playwright + local Supabase
(feasibility spike first); side-panel storage-reactivity spec; report-only CSP
rollout decision; manifest re-validation after `ext-build`; Dodo webhook
idempotency table + test (carried over from `docs/TEST_PLAN_launch.md`, still
open).
**Category:** Infra · **Priority:** P2
**Source:** `docs/TEST-STRATEGY.md:551`
**Note:** the webhook idempotency one is the only member with money attached — worth splitting out if #106 touches that area.

### 21. Dark-mode test coverage for the webapp
The extension has a rendered design spec (`npm run test:design:rendered`); the
webapp has no equivalent, and per the plan that is the real remaining gap. Run the
`PAGE_AUDIT` contrast/ramp helper against the webapp in **both** themes, assert
system resolution with `colorScheme: 'dark'` and no stored preference, and extend
R9's pre-paint lint to the webapp's inline script.
**Category:** Infra · **Priority:** P2
**Source:** `docs/DARK-MODE-PLAN.md` §5
**Note:** pairs with item 4 — land the sweep and the coverage together or the sweep regresses.

### 22. Create `CHANGELOG.md`
The release runbook says to keep one at the repo root, created with the first
post-launch release, one section per release, newest first. It doesn't exist yet.
**Category:** Infra · **Priority:** P2
**Source:** `docs/RELEASE-RUNBOOK.md:42`

### 23. Prune stale local git branches
**29 local branches are fully merged into `origin/main`** and safe to delete.
**Category:** Cleanup · **Priority:** P2
**Source:** conversation; `git branch --merged origin/main`
**⚠ corrected:** parked as "~37 stale branches". 41 local branches exist; 29 are merged-and-prunable, 10 are unmerged (see below), plus `main` and this doc's own worktree branch.
**Do not delete** — active or explicitly held: `feature/dashboard-extras-hold` (unmerged, holds the referral + affiliate dashboard routes), `sync/dashboard-parity` (merged but hands-off per owner), `fix/refund-wallet-funds-handling` (**PR #106, shipping**), `claude/clipmark-sync-engine-011e96` (**PR #107 draft**, item 18), `docs/design-system-audit` (**PR #89 draft**, item 25).
**Unmerged and worth a decision each:** `chore/update-docs` (2026-05-01), `copilot/clip-and-download-youtube-videos` (2026-04-10), `docs/cws-listing-fields-handoff`, `docs/guided-onboarding-tour-spec`, `fix/parity-p0-bugs`, `fix/tour-shows-every-video`, `fix/refund-owed-durable-record`. The last three may be partly superseded — diff before deleting.

### 24. Broken relative links in roadmap and GTM docs
~20 broken relative links, in two distinct classes:

1. **Links to spec docs that were never committed** — `ClipMark-UsageCaps-Spec.md`
   (5 refs), `ClipMark-MedExam-Strategy-Brief.md` (6), `ClipMark-Distribution-Plan.md`
   (5), `ClipMark-Claims-Buildout-Plan.md` (4), `ClipMark-FeatureRequests-Spec.md`
   (2), `docs/gtm/case-study-kortex.md` (1). Only `ClipMark-ROADMAP.md` and
   `ClipMark-Affiliate-Fix-Spec.md` are actually tracked at the root. Every one of
   these is a 404 on GitHub for anyone but the owner.
2. **Unescaped parens in `docs/gtm/SEO-AUDIT.md`** — 13 links to
   `webapp/app/(marketing)/…` paths break markdown link parsing at the `)`.

**Category:** Cleanup · **Priority:** P2
**Source:** repo-wide relative-link scan of tracked `*.md`
**Note:** class 1 is a decision, not a typo fix — either commit those docs or delink them. The repo is public, so check each for anything not meant to ship before committing. Class 2 is a mechanical `%28`/`%29` (or angle-bracket) fix.

### 25. Decide the fate of PR #89 (draft, design-system audit)
`docs/design-system-audit` — +1655/-0, four new files: `docs/DESIGN.md`,
`docs/DESIGN-AUDIT.md`, `packages/design-system/tokens.next.css`,
`packages/design-system/ADOPTION.md`. Untouched since 2026-08-08.
**Category:** Cleanup · **Priority:** P2
**Source:** PR #89
**Recommendation: close it — nothing left to harvest.** Fully superseded, and
verified item by item against `7e1fc2e`:

- `DESIGN.md` now exists and is committed **at the repo root** (not `docs/`), and
  is machine-enforced by `scripts/design-audit.mjs` (R0–R9) plus a rendered spec.
- Its two headline "needs a decision" findings are both resolved **and now
  enforced**: the **wordmark** is `ClipMark` in all 244 occurrences under
  `webapp/app/` — zero lowercase-`m` remain, against #89's count of 131 wrong —
  and it's guarded by R4. The **primary-CTA contrast** finding is fixed too:
  filled CTAs resolve to `--teal-700`, and R2 asserts white-on-`--accent-strong`
  clears AA 4.5:1, so the 2.49:1 `#14b8a6` case can't come back.
- The `#14b8a6` / `#006b5f` consolidation and the type re-scale landed in
  #93/#103; the dashboard-navigation bug it diagnosed was fixed in v1.0.2.

What's still live from it is already tracked here as items 4 (the webapp's inline
styles) and 8 (token drift). Closing #89 loses nothing.

### 26. Stale "not yet done" note in `ClipMark-ROADMAP.md`
Line 55 says the pricing-claims honesty work is incomplete — that the
comparison-table rows still need `ComingSoon` treatment and the "Spaced
Repetition Logic" copy fix is untouched. **Both are done.**
`webapp/app/(marketing)/upgrade/page.tsx:51-52` marks "Permanent Transcript
Archiving" and "Deep Search (inside transcripts)" `coming-soon`;
`PlanCards.tsx:48-51` carries a `PRO_SOON` list with a "Coming soon" badge; and
the row now reads "Spaced Repetition Reminders". Delete or rewrite the note so it
stops reading as open work.
**Category:** Cleanup · **Priority:** P2
**Source:** `ClipMark-ROADMAP.md:55` vs. current `webapp/app/(marketing)/upgrade/`

---

## P3 — someday

### 27. Condense Mode / skip-silence for long videos
Auto-skip or fast-forward the dead-air stretches of multi-hour lectures and
workshops so a watch-through comes out shorter and denser. Transcript/caption-gap
based — **a Samsung-style waveform read is blocked by YouTube's DRM**, so Web
Audio is not the path. Reuses the existing A–B loop/segment and player-control
layer, so it's incremental rather than net-new. Strong fit for the
study/long-lecture wedge.
**Category:** Future idea · **Priority:** P2/P3
**Source:** `ClipMark-ROADMAP.md:97-105` §D (full item); `ROADMAP.md:343` (Backlog / Ideas, cross-referenced)
**Note:** already on the roadmap — this is a cross-reference, not a new entry. `ClipMark-ROADMAP.md` positions it P2/P3 and **wants a short feasibility spike first**: confirm Web Audio really is blocked on YouTube, and check whether caption timing granularity is precise enough to cut on. Adjacent to but distinct from Phase 11 "Smart Watching", which compresses by *engagement* rather than *speech vs. silence*.

### 28. Native feature-request board, v1
Private submission + admin triage. Specced in `ClipMark-FeatureRequests-Spec.md`
(uncommitted — see item 24). Flagged in `docs/PROGRESS.md` as a concrete
low-cost retention lever for a comparable solo-founder extension, with an open
question about pulling it forward to coincide with the design-partner cohort
rather than waiting for a general backlog pull.
**Category:** Future idea · **Priority:** P2/P3
**Source:** `docs/PROGRESS.md:172`; `ClipMark-ROADMAP.md`
**Note:** decide alongside item 9 — if feedback volume justifies it, this moves up. The spec needs committing either way.

### 29. Richer affiliate status than the `is_affiliate` boolean
`profiles.is_affiliate` is the sole gate everywhere. States like `suspended` /
`paused` are a real possible future need but have no reader today, and adding the
column now would enshrine dead schema against this repo's own conventions.
**Category:** Future idea · **Priority:** P3
**Source:** `ClipMark-Affiliate-Fix-Spec.md` §3.3 (explicitly deferred there)

### 30. `ROADMAP.md` "Backlog / Ideas" grab-bag
Small unscheduled polish and growth ideas, unchanged: empty-state illustrations;
confetti on first share; bookmark-streak badge; opt-in weekly digest email (Pro);
testimonial carousel on `/upgrade`; embeddable "Bookmarked with ClipMark" SVG
badge; cancel-subscription UI (refund-within-14-days vs. cancel-at-period-end).
**Category:** Future idea · **Priority:** P3
**Source:** `ROADMAP.md:333-345`
**Note:** the cancel-subscription UI row overlaps the refund/cancellation surface **PR #106** is changing. Re-read it after #106 lands rather than picking it up from this list.

### 31. Platform expansion
Vimeo; Coursera / Udemy (iframe-based players); podcast / audio bookmarking;
Firefox extension; React Native mobile companion for viewing and searching
bookmarks.
**Category:** Future idea · **Priority:** P3
**Source:** `ROADMAP.md:325-331`

### 32. "Revisit ↗" on a due reminder card on the web
The extension gives a due reminder a one-click path back to the video; the web
makes you find it.
**Category:** Feature · **Priority:** P3
**Source:** `docs/DASHBOARD-PARITY.md` §6, §13.9

### 33. Marketing-page theming leftovers
Pastel tag chips on the marketing page are hardcoded — port the extension's
hue-only pattern (JS emits `--tag-h`/`--tag-s`, CSS picks lightness per theme, so
a theme flip recolours pills rendered once). The `rgba(0,0,0,0.03)` hero grid
vanishes on dark; use a `currentColor` alpha or a token.
**Category:** Minor fix · **Priority:** P3
**Source:** `docs/DARK-MODE-PLAN.md` §4.4
**Note:** split out of item 4 because it's a different technique, not more of the same sweep.

### 34. Commit or delete the untracked local assets
`cws-screenshots/` and `videos/` sit untracked in the working tree. Decide
deliberately rather than letting them drift: the repo is public, and promo/store
imagery carries content-rights constraints that a blind `git add` would ignore.
**Category:** Cleanup · **Priority:** P3
**Source:** `git status` on the main checkout

---

## Provenance — `ROADMAP.md` was removed (2026-08-16)

This list is now the only forward-looking backlog. The root `ROADMAP.md` was deleted in the
docs prune, and **nothing was lost** — the twelve `**Source:** ROADMAP.md:NNN` citations above
already carried its whole future half into this file: Phase 12 → item 31, the Backlog/Ideas
grab-bag → item 30, Condense Mode → item 27, and Phase 10a sync → item 18 (PR #107).

Two pieces did **not** come across, deliberately:

- **Phases 1–9, all marked ✅ Done** — a shipped-work history. `docs/LAUNCH-PRD.md` §1–§2 covers
  what exists today, more accurately and against a stamped commit.
- **Phase 11 "Smart Watching"** (Q4 2026, compress a video by *engagement* rather than by
  speech-vs-silence) — a sketch, not a scoped item. Treated as adjacent to item 27; if it's ever
  picked up it needs its own spike, which item 27 already argues for.

`ROADMAP.md` also carried **stale pricing** ($5/mo, $40/yr) against the live
$7.99/$59.99/$99.99 — one of the reasons it went. Live pricing:
`webapp/app/(marketing)/upgrade/pricing.ts`, quoted in `docs/LAUNCH-PRD.md` §1. Those `Source:`
citations remain readable in git history (`git show a795d01:ROADMAP.md`).

---

## Notes on what was *not* found

Recorded so the next scan doesn't redo this work:

- **No real `TODO` / `FIXME` / `HACK` / `XXX` comments** anywhere in
  `extension/src/`, `webapp/app/`, `webapp/lib/` or `webapp/migrations/`. The only
  match repo-wide is the string `'#Important #TODO'` in a tag-parsing test
  fixture. Deferred work in this codebase lives in docs, not in code comments.
- **`docs/LAUNCH-GATES.md` has zero open checkboxes.**
- **Pricing-claims honesty is fully shipped** — see item 26.
- **The Dodo live webhook and live checkout both work.** They are not parked and
  not blockers; don't re-add them.
- **Only three PRs are open:** #106 (critical, excluded — see the banner), #107
  (item 18), #89 (item 25). Nothing else is waiting.
