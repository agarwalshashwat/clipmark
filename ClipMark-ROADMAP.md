# ClipMark Master Roadmap

**Date:** 2026-07-30
**Owner decision this doc reflects:** ClipMark is **launch-first, distribution-first**. The feature build-out below (transcript search, real Notion/Obsidian sync, advanced stats, etc.) is a **post-launch backlog** to pull from based on real user demand — not a pre-launch checklist. Unbuilt pricing claims get relabeled "Coming soon" in the interim, handled as its own small fix, not blocking launch.

This is the one place everything discussed across security hardening, pricing, distribution, and feature planning lives. Each item links back to its source doc/commit/PR so nothing here is un-traceable.

---

## SHIPPED (done + live on `main`)

### Security / entitlement hardening
- **RLS hardening on `profiles`** — column-level `REVOKE`/`GRANT` so only service-role can write entitlement columns (`is_pro`, `is_affiliate`, `commission_rate`, etc.). Migration `013_rls_hardening.sql` (PR #34/earlier) + `014_profiles_insert_grant_hardening.sql` (PR #51, `8e77727`).
- **Referral gifted-Pro reward now reverses on refund** — `reverseReferralReward()` claws back gifted-Pro months and decrements referral credit when a referred purchase is refunded. Commit `8c684dd`, PR #55.
- **`/api/reminders` and `/api/reminders/[id]/done` now enforce Pro server-side** — previously relied on a client-side check only. Commit `cffddc9`, PR #55.
- **`/api/comments` (unauthenticated YouTube proxy) now rate-limited** — commit `070e98c`, PR #55.
- **Admin affiliate route fixed** (`/api/admin/set-affiliate`) — was writing two non-existent columns (`affiliate_status`, `affiliate_commission_rate`) and had a commission-rate unit bug, now corrected. Commit `1370a68`, PR #52. Full diagnosis: [ClipMark-Affiliate-Fix-Spec.md](ClipMark-Affiliate-Fix-Spec.md).
- **`profiles` INSERT hardening** — restricted to non-entitlement columns. PR #51 (`chore/profiles-insert-grant-hardening`).
- **Referral credit now actually grants Pro**, not just a counter — commit `9fc8299`.
- **`/dashboard/queue` now enforces Pro entitlement server-side** — the page previously queried reminder data directly without the same `is_pro` check `/api/reminders` enforces. PR #71 (`fix/dashboard-queue-pro-gate`).

### Pricing
- **New tax-inclusive pricing: $7.99/mo, $59.99/yr, $99.99 founding lifetime** — `PRICE_DEFAULTS` in `webapp/app/(marketing)/upgrade/pricing.ts`. PR #54 (`fix/pricing-update-799-5999-9999`): `36caa67` (price update), `4201100` (removed stale lifetime strikethrough, reframed as founding price), `fffcd0f` (tax-inclusive microcopy on the guarantee line), `2201c1d` (labeled Free vs Pro columns in the comparison table).
- **Stale Pro-only marketing copy corrected** — commit `cead2cc`.
- **Free shared-collections limit raised 5 → 10** — commit `7caed7d`, matches the recommendation in [ClipMark-UsageCaps-Spec.md](ClipMark-UsageCaps-Spec.md) §2 (viral-mechanic reasoning tied to the distribution plan).

### Free-tier usage caps (med/exam pivot)
- **Free-tier usage-caps module** (`extension/src/usage-caps.js`) — commit `796347f`, PR #53.
- **Active Recall/Anki caps enforced, hard recall wall loosened to taste-then-wall** — commit `d7171fb`, PR #53. Matches [ClipMark-UsageCaps-Spec.md](ClipMark-UsageCaps-Spec.md): 25 standing Active-Recall-enrolled segments, 30 reviews/month, 1 Anki export/month, AI Synthesis explicitly free (was a dead gate).

### Core product (Active Recall / SM-2 build-out — pre-dates this planning pass)
- SM-2-lite recall scheduling engine (`recall.js`/`recall.module.js` twin, PR #39).
- Active Recall content-script overlay (PR #38), dashboard due-queue strip (PR #37), Pro-gated Anki export (PR #36), entry points/upsell copy (PR #35).
- Web dashboard: Anki export on the web (PR #43), "due for recall" badge (PR #44), start-Active-Recall-from-dashboard bridge via `externally_connectable` (PR #45), landing-page placement (PR #46).
- Revisit → Active Recall copy sweep (PR #42); packaged-extension e2e test coverage (PR #41); fixed a real prod-only `ReferenceError` from a tree-shaken constants chunk (PR #40 — see the twin-file convention note in CLAUDE.md).

### Infra / observability
- **Sentry error monitoring wired for webapp + extension** — PR #48 (`1b649d9`), env vars documented for the Vercel handoff (`7c43e74`).
- **Migration hygiene**: recovered `012_db_helpers.sql`, renumbered `012→013`, locked down `schema_migrations` RLS, corrected deployment docs to reflect that `013_rls_hardening` is actually applied to prod. PRs #50, #34.
- Password sign-in for seeded test accounts + a plan-state simulator for QA (PR #47).

### UI polish
- **Pricing card CTA buttons bottom-aligned across cards** — commit `341fc85`. *(Technically the tip of PR #56 — see IN PROGRESS below; the commit is landed on the branch, PR not yet merged to `main`.)*

### Launch-blocker sweep (pre-dates this session's granular PRs)
- PR #32 `fix/launch-blockers` — packaging, security/RLS + payments hardening, test harness, conversion pass. PR #31 — security headers + CORS fix. PR #30 — launch gates, smoke checks, release runbooks.

---

## IN PROGRESS / PENDING MERGE

| # | What | Branch | Status |
|---|---|---|---|
| **#56** | Bottom-align pricing card CTA buttons across cards | `fix/pricing-cta-alignment` | **OPEN** |
| — | **"Coming soon" relabel of unbuilt pricing claims** — uncommitted work-in-progress on `fix/pricing-claims-honesty` (no PR yet): adds a `ComingSoon` badge to Deep Transcript Search, Lifetime Cloud Archiving, and Early access to all labs in `PlanCards.tsx`; softens "Sync to Notion & Obsidian" → "Export to Notion & Obsidian" (matches the actual one-off export capability) and "Daily Review Dashboard" → "Review Reminders" / "Advanced Learning Stats" → "Learning Stats" (matches what's actually shipped, no overpromise). **Not yet done**: the comparison-table rows in `page.tsx` ("Permanent Transcript Archiving", "Deep Search (inside transcripts)") still need the same `ComingSoon` treatment, and the "Spaced Repetition Logic" copy fix (§A above — reframe as "unlimited," not Pro-exclusive) hasn't been touched yet. Per [ClipMark-Claims-Buildout-Plan.md](ClipMark-Claims-Buildout-Plan.md) interim section for the full target list. |

---

## PLANNED — PRODUCT

### A. Pricing-claim feature build-out (post-launch backlog, pull based on demand)

Full detail, effort, architecture, and risk for each of these is in **[ClipMark-Claims-Buildout-Plan.md](ClipMark-Claims-Buildout-Plan.md)**. Summary:

| Feature | Effort | Complexity/Risk | One-line plan |
|---|---|---|---|
| Deep Transcript Search | **XL** (3–4 wk) | **High** — new persistent store + FTS, real legal/ToS question on storing YouTube caption text server-side | Persist transcripts globally by `video_id` (Pro users' bookmarked videos only), Postgres FTS v1, semantic/embeddings as a real v2 |
| Real Notion sync | M–L (2–3 wk) | Medium | Notion OAuth integration, sync-on-save to a user-chosen database |
| Real Obsidian sync | M (2–3 wk) | Medium | No cloud API exists for Obsidian — only honest path is a companion Obsidian community plugin (external review-queue lead time, outside our control) |
| Advanced Learning Stats | S–M (1–1.5 wk) | Low | New retention/streak/mastery metrics over data already in `user_bookmarks` JSONB; keep basic heatmap free, gate only the new sections Pro |
| Daily Review Dashboard | S–M (1–1.5 wk) | Low | Merge the existing due-reminders page + recall-due strip into one unified, properly Pro-gated page |
| Lifetime Cloud Archiving | S (days) | Low, but **fully gated on Deep Transcript Search landing first** | No-deletion policy + a downloadable full-account-archive endpoint |
| Early access to labs | S–M (~1 wk) | Low | Lightweight flag table + `/dashboard/labs` page — infra is cheap, but the claim isn't concretely true until ≥1 real experimental feature exists behind it |
| Spaced Repetition (claim accuracy, not a build) | Trivial | None | Already built, already free (capped) — fix the copy to sell "unlimited" as the Pro differentiator instead of claiming SR itself is Pro-exclusive |

**Recommended pull order when picked back up:** copy fixes → Daily Review Dashboard + Advanced Learning Stats + Labs infra (quick, low-risk, no schema surprises) → Notion sync (Obsidian plugin can run in parallel, different codebase) → Deep Transcript Search + Lifetime Archiving (heaviest, needs a legal pass first).

### B. User Feature-Request System

**Full spec: [ClipMark-FeatureRequests-Spec.md](ClipMark-FeatureRequests-Spec.md).** Owner wants this **native, with voting** — flagging explicitly per the ask so it doesn't get missed:

- **v1 (recommended starting point, ~3–4 days):** private submission (Pro-only, matching every other Pro-gated route's server-side check) + admin triage view (status: `open → planned → in_progress → shipped/declined`). No voting, no public board yet.
- **v2 (~5–6 additional days, only once v1 has real submission volume):** public board — **submission stays Pro-only, but viewing and voting are open to all signed-in users** (explicitly called out in the spec as the recommended visibility split — a locked board has no social-proof value, and open voting is a soft upsell surface without diluting the actual differentiator). Adds a `feature_request_votes` join table (proper per-user dedup, not a bare RPC counter) and, only after that, a public read-only roadmap page.
- New migration would be `015_feature_requests.sql` (next available number as of this writing).

### C. PPP / Regional Pricing

**Full detail: [ClipMark-MedExam-Strategy-Brief.md](ClipMark-MedExam-Strategy-Brief.md) §10–16 (Part II — Global Strategy).**

- Product-level behavior (free English YouTube medical lectures + a global IMG/MBBS audience) is genuinely global; GTM should stay niche-first (USMLE/IMG English beachhead) while the **product** is built global-ready now.
- **Two-tier pricing plan:** Tier A (US/UK/CA/AU/Gulf/W. Europe) at $60/yr [now $59.99, see Shipped]; Tier B (India/SEA/Africa/LatAm/E. Europe, PPP ~0.3–0.4) at ~$22/yr. Founding-lifetime: $99 Tier A / ~$39 Tier B, time-boxed.
- Blended math: ~45% Tier A / 55% Tier B → ~$39/yr blended ARPU → **~2,560 payers to hit $100K run-rate** (vs. ~1,700 at a flat Tier-A-only price) — more payers needed, each far cheaper to win, larger reachable pool.
- **Payment rails are the hard dependency**: PPP is close to worthless in India/emerging markets without local rails — the brief specifically calls out **Dodo Payments' UPI support** (Paddle/Lemon Squeezy don't have it) as decisive for Indian subscription renewals. ClipMark already uses Dodo as MoR, so this is a config/product change, not a new payments-provider integration.
- **Sequencing per the brief:** win the USMLE/IMG English beachhead at flat Tier-A pricing first, then flip on PPP + Dodo/UPI when deliberately opening step 2 (global undergrad MBBS) — "build PPP in from the start so step 2 is a switch-flip, not a rebuild."
- **Abuse guard:** verify region via card/payment-method country, not IP alone (VPN abuse risk called out explicitly).

---

## PLANNED — DISTRIBUTION / GTM

**Full detail: [ClipMark-Distribution-Plan.md](ClipMark-Distribution-Plan.md).** Companion to the strategy brief above; pulls two prerequisites in first (both now shipped — see above): the admin-affiliate-route fix and the referral/payout-copy honesty gap.

**Channel priority, in order, and why:**
1. **Reddit / Discord / SDN communities** (r/medicalschoolanki ~175K, r/step1, r/step2, r/usmle, r/medicalschool, SDN) — highest-intent, free, and the credibility prerequisite everything else depends on. **Do not post a product link in week 1** — 2–3 weeks as a genuinely useful member first, then a "resource, not a pitch" framing for the first post.
2. **Creator/affiliate partnerships** — the actual reach engine for a founder with zero audience. Target **micro study-workflow creators (5K–50K subs) first**, not the big lecture brands (Boards & Beyond, Sketchy) — easier to reach, tool-fit needs no explaining, reachable later once there's proof. Founding-partner rate: bump first 3–5 signed creators to 35–40% commission + a bigger personal discount code (both just config now that the admin route works).
3. **Chrome Web Store listing + reviews** — passive, always-on; trigger the review prompt at a real activation moment (first completed Active Recall session or first Anki export), not at install. Never buy reviews.
4. **Owned email capture** — post-install opt-in, not a pre-launch waitlist gate; a Google Form/free ESP tier is enough for months 1–2.
5. **Content/SEO** — 2–3 guide posts as dual-purpose link targets (less spammy in a Reddit post than a product link) and long-tail SEO bait.
6. **Campus/cohort ambassadors** — not a month-1 move; revisit month 2–3 once retention is proven, converting the best design partners rather than cold-recruiting.
7. **Product Hunt** — a moment, not a channel; sequence at week 12–13 timed to a real dedicated-study-season ramp, with 10–20 primed advocates ready same-day. A PH launch with zero warm audience gets buried and rarely recovers.

**Sequenced timeline (from the plan):**
- **Week 0 (prerequisite):** admin-affiliate-route fix (✅ shipped), payout/refund-copy honesty decision, wire the CWS review-prompt trigger.
- **Weeks 1–3:** 15–25 design partners recruited via direct DMs; first community post live; email capture live.
- **Weeks 4–7:** 2–3 SEO posts published; CWS listing optimized, first 20–30 reviews; design partners → public testimonials.
- **Weeks 8–11:** 3–5 micro-creators signed on founding terms, ≥1 integration video live; one outreach attempt at a mid/large lecture brand.
- **Weeks 12–13:** Product Hunt + coordinated community/creator wave.
- **Realistic targets** (the strategy brief's own numbers, restated as distribution outcomes): M1 ≈ design cohort + a few hundred installs, ~50 payers. M2 ≈ 10–15K installs, ~300 payers. M3 ≈ 25–35K installs, ~600–800 payers. The ~1,700–2,560 payer / $100K range is a 2–3-quarter compounding outcome, not a month-3 one.

**What makes or breaks it (the plan's own honest read):** (1) whether any single creator with a real audience actually posts — highest-variance factor in the whole plan; (2) community goodwill — one mishandled Reddit post can get a founder shadowbanned from the community the entire beachhead depends on; (3) activation, not installs — every borrowed-audience channel is a one-time trust withdrawal that only pays off if users actually hit "capture → recall → it stuck" quickly.

---

## Document Index

| Doc | What it covers |
|---|---|
| [ClipMark-ROADMAP.md](ClipMark-ROADMAP.md) | **This file** — the single consolidated view of shipped, in-progress, and planned work |
| [ClipMark-Claims-Buildout-Plan.md](ClipMark-Claims-Buildout-Plan.md) | Per-feature build spec (architecture, DB/migration needs, effort, risk) for the 7 pricing-page claims, plus the "Coming soon" interim labeling recommendation |
| [ClipMark-FeatureRequests-Spec.md](ClipMark-FeatureRequests-Spec.md) | Native user feature-request system spec — data model, API routes, v1/v2 scope split, effort estimate |
| [ClipMark-MedExam-Strategy-Brief.md](ClipMark-MedExam-Strategy-Brief.md) | Med/exam niche thesis (USMLE/IMG beachhead), competitor gaps, pricing rationale, global/PPP strategy (Part II) |
| [ClipMark-Distribution-Plan.md](ClipMark-Distribution-Plan.md) | Cold-start GTM channel plan executing the strategy brief — community, creator/affiliate, CWS, email, SEO, ambassadors, Product Hunt |
| [ClipMark-UsageCaps-Spec.md](ClipMark-UsageCaps-Spec.md) | Free/Pro gating audit (what's actually enforced vs. just marketed) + the free-tier usage-cap design that shipped in PR #53 |
| [ClipMark-Affiliate-Fix-Spec.md](ClipMark-Affiliate-Fix-Spec.md) | Diagnosis + fix spec for the admin-affiliate-route bug that shipped in PR #52 |
