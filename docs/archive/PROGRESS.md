# ClipMark — Progress Log (Single Source of Truth)

**Date compiled:** 2026-08-02
**Purpose:** a factual, point-in-time status log of everything shipped, in review, planned, and blocked on ClipMark — surveyed directly from `git log origin/main`, `gh pr list --state all`, the `docs/` tree, repo-root planning docs, and the `videos/` assets. This is a status log, not marketing copy — claims below are cited to specific PRs/commits/files rather than asserted.
**Repo:** `agarwalshashwat/youtube-vid-bookmarker` (public). Default branch: `main`.

---

## 1. Shipped & live (merged to `main`)

### Launch-blocker sweep (packaging, security/RLS, payments hardening, test harness)
- **PR #32** — `fix/launch-blockers`, merged 2026-07-18. The single largest pre-launch PR: extension packaging fixes, security/RLS hardening, payments hardening, a new test harness, and a conversion-copy pass, bundled as one launch-readiness sweep. This is the PR most of the `/api/share` auth, refund-handling, webhook, and manifest/config hardening work traces back to.
- **PR #31** — `prelaunch/security-headers-cors`, merged 2026-06-24 — security headers + CORS allowed-headers fix.
- **PR #30** — `feature/modernize-landing-and-ai-tests`, merged 2026-06-24 — CI launch gates, smoke checks, and the first release runbooks.
- **PR #40** — `fix/dist-content-script-globals`, merged 2026-07-28 — fixed a real production-only `ReferenceError`: the packaged extension's build tree-shook a constants chunk to empty while `content.js` still referenced it as a bare global (dev loads and source-based E2E were unaffected — only the built artifact broke). This is the origin of the twin-file convention (`constants.js`/`constants.module.js`, `recall.js`/`recall.module.js`) and the `content-globals-guard.mjs` Vite build-time guard documented in `.claude/CLAUDE.md`.

### RLS migrations 013 + 014 — applied to production
- **PR #34** — `chore/migration-hygiene-and-free-tier-docs`, merged 2026-07-28 — renumbered the RLS-hardening migration `012→013`, locked down `schema_migrations` itself.
- **PR #51** — `chore/profiles-insert-grant-hardening`, merged 2026-07-29 — migration `014_profiles_insert_grant_hardening.sql`, restricting `profiles` INSERT to non-entitlement columns. Closed a signup-time entitlement-write gap; no client input can set entitlement columns anymore.
- **PR #50** — `docs/recover-012-and-rls-status`, merged 2026-07-29 — recovered a previously-lost `012_db_helpers.sql` and corrected deployment docs to confirm `013_rls_hardening` really is applied to production (not just committed).

### Observability
- **PR #48** — `feat/sentry-error-monitoring`, merged 2026-07-29 — Sentry wired for both webapp and extension, plus a follow-up commit (`49b29f6`) dropping a stale `TODO(sentry)` block from `content.js`. Env vars documented for the Vercel handoff in the same PR's docs commit.
- **PR #61** — `fix/extension-context-invalidation-guards`, merged 2026-07-31 — guards `chrome.runtime`/`chrome.storage` calls against extension-context invalidation (the "extension was reloaded/updated while a content script was still running" failure mode), reducing Sentry noise from a known, non-actionable error class across all extension surfaces.

### Pricing overhaul
- **PR #54** — `fix/pricing-update-799-5999-9999`, merged 2026-07-30 — the actual price change: `PRICE_DEFAULTS` updated to **$7.99/mo, $59.99/yr, $99.99 founding lifetime**, all tax-inclusive; removed a stale lifetime strikethrough and reframed the lifetime tier as a "founding price" rather than a fake discount; added tax-inclusive microcopy to the shared guarantee line; labeled the Free vs. Pro columns in the comparison table.
- **PR #56** — `fix/pricing-cta-alignment`, merged 2026-07-30 — bottom-aligned the pricing card CTA buttons across cards (pure layout fix).
- **PR #57** — `fix/pricing-claims-honesty`, merged 2026-07-30 — made `/upgrade` pricing claims honest for launch, and tagged remaining not-yet-built comparison-table rows (Deep Transcript Search, Lifetime Cloud Archiving, "Early access to labs") **Coming soon** instead of implying they already ship.
- Related, narrower pricing-page fixes further back in history: **PR #13** (dynamic pricing countdown fix), **PR #25** (pricing fallback values corrected to match live Dodo prices) — these predate the Aug-2026 pricing overhaul but are the same subsystem.

### Free-tier usage caps (med/exam pivot)
- **PR #53** — `feat/usage-caps`, merged 2026-07-30 — added the free-tier usage-caps module (`extension/src/usage-caps.js`) and enforced it: **25 standing Active-Recall-enrolled segments, 30 reviews/month, 1 Anki export/month**; loosened Active Recall from a hard 0-access wall for free users to a real taste-then-wall. Matches the design in the (uncommitted, see §6) `ClipMark-UsageCaps-Spec.md`.
- **Commit `7caed7d`** (same PR) — raised the free shared-collections limit from 5 to 10.
- **Commit `cead2cc`** (same PR) — corrected stale Pro-only marketing copy that no longer matched the shipped caps.

### Affiliate program fixes
- **PR #52** — `fix/admin-affiliate-route`, merged 2026-07-30 — fixed `/api/admin/set-affiliate`, which was writing to two non-existent columns (`affiliate_status`, `affiliate_commission_rate` instead of the real `is_affiliate`/`commission_rate`) and had a commission-rate unit bug, now corrected. This is what makes it possible to grant a working affiliate code to a non-Pro external creator same-day. Full diagnosis in `ClipMark-Affiliate-Fix-Spec.md` (committed, at repo root).
- **Commit `9fc8299`** (same PR) — referral credit now actually grants Pro, not just incrementing a counter.

### Security fixes (Pro-entitlement hardening)
- **PR #55** — `security/pro-entitlement-hardening`, merged 2026-07-30 — three fixes bundled together:
  - `8c684dd` — referral gifted-Pro reward now reverses correctly (gifted months and referral credit are clawed back) when the referred purchase is refunded.
  - `cffddc9` — `/api/reminders` and `/api/reminders/[id]/done` now enforce Pro **server-side** (previously relied on a client-side check only).
  - `070e98c` — rate-limited the unauthenticated `/api/comments` YouTube-proxy endpoint.

### Entitlement refresh + Anki parity
- **PR #60** — `fix/entitlement-refresh-and-anki-parity`, merged 2026-07-31 — refreshes cached `isPro` on load/focus (closing the gap where upgrading on the web dashboard didn't unlock the side panel/extension dashboard until the next popup open) and aligns the webapp's Anki export to the same 1/month free cap as the extension.

### Dashboard hardening, context guards, popup.js removal
- **PR #62** — `chore/dashboard-hardening-remove-popup`, merged 2026-07-31 — guards dashboard entitlement refresh against context invalidation, and removes dead `popup.js` code.
- **PR #61** (see Observability above) — the broader context-invalidation guard work this PR builds on.

### Side-panel "home base" idle screen
- **PR #63** — `feature/side-panel-idle-screen`, merged 2026-07-31 — replaces the old "Zen Garden" interactive idle screen (originally added in PR #27) with a branded idle screen shown when the side panel is open on a non-YouTube page.

### Smaller extension fixes
- **PR #59** — `fix/dashboard-video-title`, merged 2026-07-30 — resolves video title live at bookmark-save time instead of only from a (possibly stale) cache.
- **PR #58** — `fix/clipmark-branding-casing`, merged 2026-07-30 — corrects "ClipMark" brand casing throughout the codebase, including `extension/manifest.json`'s `"name"` field (verified current on `main`: `"name": "ClipMark"`, correct casing already shipped in code — see §6 for what's still outstanding on the *Chrome Web Store listing itself*, which is a separate, unsynced surface).

### Landing page / marketing surface work
- **PR #46** — `feat/landing-active-recall-anki`, merged 2026-07-29 — put Active Recall and Anki export on the public landing page for the first time.
- **PR #35** — `feat/active-recall-entrypoints`, merged 2026-07-28 — Active Recall entry points and upsell copy; this is the origin of the `showUpgradeModal()` pattern reused by every Pro-gated feature added since.
- **PR #28** — `feature/improve-curators-journey`, merged 2026-05-26 — redesigned "The Curator's Journey" how-it-works section with modern cards/icons (the section PR #68, open, now adds scroll-reveal to).

### Active Recall / SM-2 core build-out (pre-dates the Aug-2026 planning pass, but foundational)
- **PR #39** — `feat/recall-engine`, merged 2026-07-28 — the SM-2-lite recall scheduling engine (`recall.js`/`recall.module.js` twin).
- **PR #38** — `feat/active-recall-overlay`, merged 2026-07-28 — the Active Recall content-script overlay (recall-before-reveal UI).
- **PR #37** — `feat/recall-due-queue`, merged 2026-07-28 — dashboard "due for recall" queue strip.
- **PR #36** — `feat/anki-export`, merged 2026-07-28 — Pro-gated Anki export (TSV with moment deep-links).
- **PR #43** — `feat/webapp-anki-export`, merged 2026-07-28 — Anki export on the web dashboard, plus a fix to a stale "Markdown paywall" claim.
- **PR #44** — `feat/webapp-recall-due-badge`, merged 2026-07-28 — "due for recall" badge on the webapp dashboard, dropping a third, redundant due-check implementation.
- **PR #45** — `feat/webapp-start-recall-bridge`, merged 2026-07-28 — start Active Recall from the web dashboard via an `externally_connectable` bridge into the extension.
- **PR #42** — `chore/active-recall-copy-sweep`, merged 2026-07-28 — renamed user-facing "Revisit" → "Active Recall" throughout.
- **PR #41** — `test/recall-packaged-e2e`, merged 2026-07-28 — Active Recall end-to-end test coverage against the actual packaged `dist/` build (not just source), which is what caught PR #40's tree-shaking bug class in the first place.

### Test suite growth + CI integration harness
No single PR owns this — it's a cross-cutting effort across the whole period:
- **PR #23** (`chore/update-docs`, merged 2026-04-26) established the first "comprehensive tests" baseline.
- **PR #30** added CI launch gates and smoke checks; **PR #32** added the launch-blocker test harness; **PR #41** added packaged-build E2E coverage; **PR #47** (`feat/test-login-and-plan-simulation`, merged 2026-07-29) added password sign-in for seeded test accounts plus a Pro/Free plan-state simulator for QA.
- **Current confirmed count: 217/217 unit tests passing** — directly cited from PR #67's own test-plan checklist (`npm run test:unit` — `217/217 passing`), run most recently 2026-07-31. The starting point of "~110" (per the task brief) isn't independently re-verified in this pass, but the trajectory across the PRs above is consistent with substantial, continuous growth over the period.
- CI gates on four jobs per `.github/workflows/`: `ci-unit`, `ci-extension-smoke`, `ci-webapp-visual-smoke`, `ci-integration` — all run on every PR.

### Release runbook + deployment/staging structure
- **PR #64** — `docs/release-runbook`, merged 2026-07-31 — `docs/RELEASE-RUNBOOK.md`, an ongoing release/update runbook covering webapp, extension, and migrations together.
- **PR #33** — `chore/staging-prod-setup`, merged 2026-07-28 — decoupled DB migrations from the build step and documented the staging/prod structure (`docs/DEPLOYMENTS.md`): one hosted Supabase Free-tier project as production, local Supabase as the dev/pre-production environment (Supabase Branching being a paid feature), Vercel Preview for UI-only eyeballing (points at prod Supabase, not safe for DB/payments testing).

### Docs consolidation
- **PR #69** — `docs/gtm-consolidation`, merged 2026-08-01 — landed `docs/gtm/chrome-web-store-listing-FIELDS.md`, `docs/gtm/community-engagement-plan.md`, `docs/gtm/creator-outreach-kit.md`, and `docs/guided-tour-spec.md` onto `main` in one sweep (these had been sitting uncommitted/stranded beforehand — see §6 for what's still in that state).

---

## 2. Open PRs (in review, not merged)

| PR | Title | Branch | Status |
|---|---|---|---|
| **#65** | `feat(marketing): embed real promo demo video in the hero` | `feature/landing-promo-video-embed` | **OPEN**, explicitly not merging yet — "holding for the owner to eyeball the actual landing-page look before it goes live." Two commits: the initial embed (native `<video controls>`, R2-hosted, `preload="none"`) and a follow-up custom hero video player removing native controls. Verified: `duration=56.6`, `1920×1080`, R2 public-read confirmed via HeadObject+GET before the PR. |
| **#66** | `fix(extension): make Alt+B the one consistent bookmark-save shortcut` | `fix/alt-b-shortcut-consistency` | **OPEN**. Flagged by PR #67 as a prerequisite — the guided tour teaches Alt+B and depends on the tooltip/shortcut being consistent everywhere first. |
| **#67** | `feat(extension): guided first-run tour with Driver.js` | `feature/guided-tour-extension` | **OPEN**. Two sub-tours (YouTube watch-page bookmarking flow; side-panel Active Recall entry point), first-run-gated, replayable via the side panel's "?" button. Explicitly needs a **manual smoke test before merge** — the PR's own test plan has an unchecked box: "Load unpacked (`extension/dist/`) in Chrome and walk through both sub-tours on a real YouTube video (I don't have a way to load an unpacked MV3 extension... from this sandboxed environment)." Unit tests pass (217/217); the manual walkthrough does not yet have a checked-off result. |
| **#68** | `feat(marketing): scroll-reveal the Curator's Journey how-it-works section` | `feature/guided-tour-website` | **OPEN**. |

---

## 3. Strategy & GTM docs produced

**Committed to `main`:**
- `ClipMark-ROADMAP.md` — the consolidated master roadmap (shipped/in-progress/planned), committed 2026-07-28, since amended by several of the fix PRs above.
- `ClipMark-Affiliate-Fix-Spec.md` — diagnosis + fix spec for the admin-affiliate-route bug (PR #52).
- [docs/gtm/chrome-web-store-listing.md](../gtm/chrome-web-store-listing.md) and [chrome-web-store-listing-FIELDS.md](../gtm/chrome-web-store-listing-FIELDS.md) — ready-to-paste CWS listing copy + a dashboard-fields handoff variant.
- [docs/gtm/community-engagement-plan.md](../gtm/community-engagement-plan.md) — named-community GTM plan for the USMLE/med beachhead.
- [docs/gtm/creator-outreach-kit.md](../gtm/creator-outreach-kit.md) — creator/affiliate outreach templates and verified program terms.
- `docs/guided-tour-spec.md` — the spec PR #67 implements.
- [docs/RELEASE-RUNBOOK.md](../RELEASE-RUNBOOK.md), [docs/DEPLOYMENTS.md](../DEPLOYMENTS.md), [docs/OWNER_SETUP_CHECKLIST.md](../OWNER_SETUP_CHECKLIST.md), `docs/CONVERSION_PLAN.md`, `docs/TEST_PLAN_launch.md`, `docs/release/LAUNCH_PLAN.md`, `docs/release/LAUNCH_DAY_RUNBOOK.md`, `docs/release/LAUNCH_GO_NO_GO_CHECKLIST.md`, `docs/release/RELEASE_POLICY.md` — operational runbooks and checklists, all committed.
- Root-level `ROADMAP.md` (no `ClipMark-` prefix) — an older, separate product roadmap predating the Aug-2026 planning pass ("Turn long YouTube videos into searchable, revisable knowledge") — still present, distinct from `ClipMark-ROADMAP.md`; worth the owner deciding whether it should be merged into or retired in favor of the newer one (see §6).

**NOT committed to any branch — exist only as local files in a working checkout, confirmed via `git log --all` across every branch:**
- `ClipMark-MedExam-Strategy-Brief.md` — the med/USMLE niche thesis + global/PPP strategy (Parts I & II).
- `ClipMark-Distribution-Plan.md` — the cold-start channel plan (community → creator/affiliate → CWS → email → SEO → ambassadors → Product Hunt).
- `ClipMark-UsageCaps-Spec.md` — the free/Pro gating audit and cap design that PR #53 actually implemented.
- `ClipMark-FeatureRequests-Spec.md` — native feature-request system spec (v1/v2 scope split), referenced from `ClipMark-ROADMAP.md` but never itself committed.
- `ClipMark-Claims-Buildout-Plan.md` — per-feature build spec for the 7 pricing-page claims (Deep Transcript Search, real Notion/Obsidian sync, etc.), also referenced from `ClipMark-ROADMAP.md` but never committed.
- `docs/gtm/case-study-kortex.md` — the Kortex growth-lessons case study (this session's other deliverable).

**This is a real gap, not a cosmetic one**: `ClipMark-ROADMAP.md`, which *is* committed and live on `main`, contains working-looking links to several of the files in the uncommitted list above (e.g. `ClipMark-MedExam-Strategy-Brief.md`, `ClipMark-Distribution-Plan.md`). Anyone reading the roadmap directly on GitHub today hits a 404 on those links, since the target files were never pushed. See §6.

---

## 4. Video assets

- **Student promo video** — ~56.6 seconds (verified via `loadedmetadata` in PR #65's own test notes: `duration=56.6`, `1920×1080`), served from Cloudflare R2's public CDN at `clipmark-media.mithahara.com` (`promo/clipmark-demo.mp4` + a poster frame extracted at ~2s), **not committed to the repo**. Embedded in the marketing hero via PR #65 (open, held for owner review — see §2), across two commits: the initial native-`<video controls>` embed, then a follow-up custom hero video player that drops native controls.
- **Creator-recruitment promo video** — per the owner, a second video aimed at creator/affiliate outreach is being reworked. No corresponding commit, PR, or file reference for it was found in this survey (not yet formalized in the repo in any way) — treat this as owner-side work in progress, not yet reflected in code or docs.
- **`videos/` directory**: present locally in at least one working checkout but **not tracked by git anywhere** — no commit in the repo's history has ever added a `videos/` path (consistent with the R2/CDN-hosting approach above: video binaries are deliberately kept out of the repo and served from R2 instead, not accidentally omitted).

---

## 5. Product direction

**Launch-first, distribution-first** (per `ClipMark-ROADMAP.md`'s own framing, committed and live): the remaining feature build-out (transcript search, real Notion/Obsidian sync, advanced stats, etc.) is treated as a **post-launch backlog** to pull from based on real user demand, not a pre-launch checklist. Unbuilt pricing-page claims get a "Coming soon" label as an interim honesty fix (PR #57) rather than blocking launch on building them.

**The chosen wedge**: reposition away from competing on generic YouTube summarization (a commodity fight against Eightify/Recapio-style tools) and toward **"revise & remember"** — Active Recall (spaced-repetition quiz-before-reveal) as the hero feature, positioned as *additive to Anki* via one-click export, not a replacement for it.

**The beachhead**: USMLE/IMG English-speaking med students, reached first through r/medicalschoolanki, r/step1/step2/usmle, Student Doctor Network, and USMLE study Discords — chosen because the target behavior (free YouTube lecture + Anki spaced repetition) already exists at scale in that community, with real USD willingness-to-pay, before any planned expansion to global undergrad MBBS (PPP pricing), then India/SEA/Africa, then UK/AU/CA.

**Current pricing**: $7.99/mo, $59.99/yr, $99.99 founding lifetime (tax-inclusive), against a real (not decorative) free tier — unlimited bookmarks, 25 standing Active Recall segments, 30 reviews/month, 1 Anki export/month, 10 shared collections.

---

## 6. Open decisions / blockers / owner action items

**Production credentials (owner-only, cannot be done from this environment):**
- **Dodo LIVE webhook config** — `docs/OWNER_SETUP_CHECKLIST.md` lists `DODO_PAYMENTS_API_KEY` (live key) and `DODO_PAYMENTS_WEBHOOK_SECRET` (live secret) as owner-supplied production env vars, plus `docs/release/LAUNCH_GO_NO_GO_CHECKLIST.md`'s unchecked item: "Dodo product IDs and webhook secret verified in production env." Not something any session can verify or set — needs the owner's own Dodo dashboard access.

**Chrome Web Store submission:**
- The owner's item ID for the existing CWS listing: `iboippnihpcnnglgboaiedaiimbiolgg`.
- **The code-level name-casing bug is already fixed** — `extension/manifest.json` currently ships `"name": "ClipMark"` (correct casing, landed in PR #58, verified directly on `main` in this survey). What's still outstanding is **re-uploading the built package to the CWS Developer Dashboard** so the live listing actually reflects that fix and every other change since the last submission — the manifest fix alone doesn't propagate to an already-submitted listing.

**Needs a manual step before merge:**
- **PR #67 (guided tour)** — unit tests pass, but the PR's own checklist has an unchecked manual smoke-test: load `extension/dist/` unpacked in Chrome and walk both sub-tours on a real YouTube video. No sandboxed environment so far has been able to do this — needs a human with a real Chrome profile.
- **PR #65 (hero video)** — explicitly held by its own author for the owner to "eyeball the actual landing-page look" before merging, independent of any test failure.
- Land **PR #66 before PR #67** if possible — #67's own PR body notes the guided tour teaches the Alt+B shortcut its prerequisite fix makes consistent; both should merge cleanly in either order, but #66 first avoids briefly teaching a shortcut that isn't yet fully consistent everywhere.

**Uncommitted planning docs (real gap, not cosmetic — see §3):**
- `ClipMark-MedExam-Strategy-Brief.md`, `ClipMark-Distribution-Plan.md`, `ClipMark-UsageCaps-Spec.md`, `ClipMark-FeatureRequests-Spec.md`, `ClipMark-Claims-Buildout-Plan.md`, and `docs/gtm/case-study-kortex.md` exist only in a local working checkout and have never been committed to any branch. `ClipMark-ROADMAP.md` on `main` already links to several of them as if they were live, so those links currently 404 for anyone reading the roadmap on GitHub. **Action: commit and land these** (a single docs-only PR would do it) so the roadmap's own cross-references resolve and the planning record isn't split between git history and someone's local disk.

**Stale/unclear branches to decide on:**
- `master` and `stage` both exist as remote branches alongside `main` (confirmed via `git ls-remote --heads origin`). `docs/DEPLOYMENTS.md` describes only a single hosted-production + local-dev model with no second hosted "staging" environment, so it's unclear what `stage` is currently used for, if anything — worth the owner clarifying or deleting it if it's a leftover.
- Branches whose PRs already merged but weren't deleted: `chore/update-docs` (PR #23), `feature/affiliate-marketing` (PR #21) — safe, pure cleanup.
- Branches whose PRs were **closed without merging** (abandoned work, still present on remote): `copilot/clip-and-download-youtube-videos` (PR #18), `copilot/fix-mobile-view-issues` (PR #24), `copilot/setup-documentation-repo-structure` (PR #19), `feature/extension-build-system` (PR #26) — owner call on whether any of this is worth reviving or should just be deleted.
- Branches with no matching PR found at all in `gh pr list --state all` (possibly experimental/WIP, never opened): `feat/clipper`, `feat/react-migration` — worth a quick owner check on whether these are still wanted.

**Idea flagged, not yet started:**
- **Pull the native feature-request system forward.** Per the Kortex case study (`docs/gtm/case-study-kortex.md`, uncommitted — see above), a public feedback/roadmap board was a concrete, low-cost retention lever for a comparable solo-founder extension. `ClipMark-FeatureRequests-Spec.md` already specs a v1 (private submission + admin triage) that's currently sitting in the post-launch backlog per `ClipMark-ROADMAP.md`'s own prioritization. Worth reconsidering whether v1 should move earlier, timed to the design-partner cohort (15-25 med students) the distribution plan is built around, rather than waiting for general post-launch backlog pull.
- Separately (unrelated to the above): a Pro-gating gap on the `/dashboard/queue` page, flagged as a background-task suggestion during an earlier pass — now fixed server-side in **PR #71** (`fix/dashboard-queue-pro-gate`, merged).
