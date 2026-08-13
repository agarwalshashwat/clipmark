# ClipMark — Launch PRD (north star)

**Purpose:** one place to answer *"are we going in the right direction?"* — positioning,
what's actually shipped, what "launched" means, what's left, and what only Ash can decide.

**This is a control tower, not an encyclopedia.** Every section points at the doc that owns
the detail. If a fact lives in another doc, this one links to it rather than restating it —
so there is exactly one place to fix when it changes.

> Verified against `origin/main` @ **`b316165`** on **2026-08-14**, from an isolated
> worktree. No production database, Web Store listing, or webhook config was touched.
> Rows marked **owner-reported** are things the repo cannot prove (Web Store review state,
> dashboards) — they come from Ash and are trusted as stated.
>
> Claims were then re-derived from source a **second** time, independently, on the same
> commit. Rows marked ⚠ are where that pass disagreed with the brief or with this doc's
> first draft — mostly claims that are *narrower than they sound* (the recall schedule,
> reminders, dark mode). Each ⚠ exists to stop a specific unhonest line reaching the
> posting kit; don't strip them without re-reading the code they cite.

**Update rule:** re-verify the [Current state](#2-current-state-snapshot) and
[Checklist](#4-pre-launch-checklist--live-tracker) sections against `main` whenever you touch
this file, and move the commit stamp above. A stale north star is worse than none —
see [Docs are dated snapshots](#appendix--how-to-keep-this-doc-honest).

---

## 1. Product one-liner + positioning

> **ClipMark is a retention tool for people who learn from YouTube — it turns long lectures
> and tutorials into moments you can find again, drill, and actually remember.**

Not a bookmarking utility that happens to work on YouTube. The bookmark is the *capture step*;
the product is what happens after.

### The wedge

| | |
|---|---|
| **Who** | Students, exam/med candidates, self-taught devs, anyone living in 40-minute-plus lectures |
| **Job** | "I watched it, I understood it, and a week later I have nothing." |
| **Against** | Generic video-bookmarker extensions (capture only, no retention loop) and note apps (no timeline, no player) |
| **Wedge sentence** | Every competitor helps you *find the moment again*. ClipMark makes you *know it without the video.* |

Full ICP breakdown, five ranked segments, four messaging pillars and the honest-claims
register live in **`docs/gtm/marketing-launch-plan.md` (PR #109)** — that doc owns positioning
detail; this section owns the one-liner only.

### What backs the claim (all shipped, verified in `main`)

| Capability | Where it lives |
|---|---|
| Bookmark exact moments, tag with `#word`, group by video | `extension/src/content/content.js`, `chrome.storage.sync` (`bm_{videoId}`) |
| **A–B multi-segment loops** — define A/B, loop in-session, save named loops that become recall cards | `extension/src/loop.js` (+ `.module.js` twin), shipped v1.0.3 |
| **Spaced recall that pauses the video and prompts you** | `extension/src/recall.js` (+ `.module.js` twin), scheduled on the bookmark itself. Interval is `min(lastInterval * 2, 60)` days, with an "again" reset. ⚠ **Do not call this SM-2, SM-2-lite or FSRS** — it is a doubling schedule with a 60-day ceiling, and #109's honest-claims register forbids the comparison. Say what it does instead; it's a good story on its own |
| **Anki export** | `extension/src/export-anki.module.js` + `extension/src/popup/dashboard.js`; webapp copy in `webapp/app/dashboard/_utils/anki.ts`. The two are kept in step by `webapp/tests/unit/anki-parity.test.ts` — **edit both or that test fails**, which is the only enforcement there is |
| Revisit reminders | `rem_{videoId}` in sync storage; `public.revisit_reminders` when signed in; `chrome.alarms` + `chrome.notifications` driven from `extension/src/background/background.js`. ⚠ **Scheduled review reminders are Pro** — the FAQ lists them under what Pro adds, so never pitch them as a free-tier feature |
| System-synced dark mode | `extension/src/popup/theme-loader.js` (`prefers-color-scheme`, resolved pre-paint; `system` also follows YouTube's own theme). ⚠ **Unclaimable until the *published* listing carries it** — see W0 in §4 |

### Business model — freemium, Pro via Dodo Payments (Merchant of Record)

**$7.99/mo · $59.99/yr · $99.99 lifetime** (`webapp/app/(marketing)/upgrade/pricing.ts`).

**Capture, loops, recall and Anki export all work with no ClipMark account.** Only cloud sync
and shared collections need one. Good for adoption — and, per §3, precisely why we cannot
currently measure most of our own users.

Free caps are the med/exam-pivot set in `extension/src/usage-caps.js`. **Quote these exactly** —
marketing copy that rounds them is a claim we can't stand behind:

| Free tier | Cap |
|---|---|
| *Bookmarks, notes, tags, groups, JSON/CSV/Markdown export* | **never capped** |
| Active Recall reviews | **30 / month** (warns at 24) |
| Active Recall enrolled segments | **25**, standing (not monthly) |
| Anki export | **1 / month** |
| Saved A–B loops | **3**, standing |
| *Defining and looping A–B in-session* | **never capped** — this is the acquisition hook |

Pro removes all four caps and adds cloud sync, scheduled review reminders, and
Obsidian/Notion **export** (never call it "sync"). **Active Recall is not Pro-only** — the free tier is the
30-reviews/month cap, and every entry point must gate through `isRecallStartBlocked(...)`,
never a bare `checkPro()`. That distinction is what PR #111 fixed; don't reintroduce it.

---

## 2. Current state snapshot

### Shipped and live

| Item | State | Evidence |
|---|---|---|
| Extension **v1.0.5** submitted to the Chrome Web Store | **In review** — auto-publishes on approval | `extension/manifest.json` = `1.0.5` on `main` (PR #112, `25f9f57`). Review state is **owner-reported** |
| Recall-gate paywall bug | **Fixed, merged** | PR #111 (`806050a`) — the per-card Recall button called `checkPro()` and paywalled free users at a fifth entry point |
| Refund handling — durable `pending_refunds` ledger | **Merged and applied to prod** | PR #110 + #106; migration `018_pending_refunds.sql` |
| Migration **018** applied & verified in production | **Applied, objects verified** | See the caveat below |
| Promo videos — **3 cuts** delivered | **Delivered, not in git** | `videos/clipmark-remember-{master-60s,cutdown-30s,vertical-15s}` (plus two earlier cuts: `clipmark-creator-promo`, `clipmark-recall-promo`) |
| Webapp | **Continuously deployed** — Vercel on merge to `main` | |
| Dodo LIVE webhook + live checkout | **Working** | Not a blocker; `docs/DODO-LIVE-GATE.md` |

> ⚠️ **Migration 018 — read this before trusting the file header.** The comment block in
> `webapp/migrations/018_pending_refunds.sql` on `main` still says *"NOT YET APPLIED TO
> PRODUCTION."* **That is stale.** It is applied, and the objects were verified directly against
> the database. The correction — plus the incident where 018's `schema_migrations` row was
> inserted *without* the migration body, leaving a ledger that claimed a table which did not
> exist — is written up in **PR #116 (open)**. The durable lesson: when you hand-apply a
> migration, **verify the objects, not the ledger row** (`SELECT to_regclass('public.<table>')`).
> Merging #116 clears this caveat.

### Pending / in flight

| Item | State |
|---|---|
| v1.0.5 Web Store approval | Waiting on Google. Nothing to do but watch |
| The 4 website pre-launch wins | 1 of 4 done — see [§4](#4-pre-launch-checklist--live-tracker) |
| GTM launch kit | Written, **held** — PR #109, Ash executes by hand |
| Release-train process | Written, **held** — PR #114 |
| Extension feature-usage analytics | Spec only, **held** on open decisions — PR #113 |
| Migration docs correction | **Open** — PR #116 |
| Phase 10a cross-device sync engine | **Draft, post-launch** — PR #107 |

### Not in scope for this launch

Everything in **`docs/gtm/PARKED-BACKLOG.md`** (34 items, merged via PR #108) — pull from
there *after* launch, not during. Also out: PR #107 sync engine, and the
`feature/dashboard-extras-hold` / `sync/dashboard-parity` branches.

---

## 3. Launch definition & success metrics

### What "launched" means

**Launch = v1.0.5 live on the Chrome Web Store + the 2-day GTM push executed from PR #109's
posting kit, against a website with working install CTAs.**

Webapp deploys continuously and is not a launch gate. The **extension listing is the gate** —
nothing gets posted publicly before the listing is live and the install CTA resolves to it.
Hour-by-hour sequencing for the 2 days lives in `docs/gtm/marketing-launch-plan.md` (PR #109);
go/no-go criteria in `docs/release/LAUNCH_GO_NO_GO_CHECKLIST.md`.

### Goals for the 2-day push

These are **direction-check targets, not commitments.** With zero install history, any number
here is a guess — their job is to make "is this working?" answerable on Day 3 instead of
argued about. Revise them once real data exists rather than defending them.

| # | Metric | Definition | 48h target | Day-7 target |
|---|---|---|---|---|
| **M1** | **Installs** | New installs, CWS dashboard | 100 | 300 |
| **M2** | **Activation — first bookmark** | Installs that save ≥1 bookmark | **40%** of installs | 45% |
| **M3** | **Activation — first loop or first recall** | Installs that save an A–B loop *or* complete ≥1 recall review | **15%** of installs | 20% |
| **M4** | **Sign-in rate** | Installs that create an account | 20% | 25% |
| **M5** | **Free → Pro conversion** | Paid conversions ÷ installs | **1%** | 2% |
| **M6** | **D1 retention** | Installs active (≥1 bookmark, loop or review) the next day | 25% | — |
| **M7** | **D7 retention** | Installs active in days 5–7 | — | **15%** |
| **M8** | **Crash/error rate** | Sentry issues per 100 installs | < 2 | < 2 |
| **M9** | **First listing reviews** | Count and average on the CWS listing | ≥ 3 at ≥ 4.0 | ≥ 5 |
| **M10** | **Listing conversion rate** | installs ÷ listing impressions, CWS dashboard | ≥ 8% | ≥ 8% |
| **M11** | **Uninstall rate** | uninstalls ÷ installs | — | **< 25%** by day 7 |

**M3 is the one that matters most.** M2 says the capture step works — any bookmarking
extension clears that bar. M3 says the *retention loop* — the actual wedge in §1 — got used.
If M2 is healthy and M3 is near zero, the product works and the positioning doesn't, and the
fix is onboarding/copy, not features.

**M9–M11 are worth their own line because they need no instrumentation we don't have.** They
read straight off the CWS dashboard and they're diagnostic in a way M1 isn't: a low **M10**
means traffic arrived and the *listing* lost it (assets and copy, not the push); a high **M11**
means the install happened and the *product* lost them (the pitch overpromised); and **M9** is
both a health signal and a hard gate on paid — the listing had **zero** reviews on 2026-08-12,
and paid spend into zero social proof is the most reliable way to waste it (see D4).

### Where to watch them — and the honest gap

| Signal | Instrument | Available now? |
|---|---|---|
| M1 installs, plus M9 reviews / M10 listing conversion / M11 uninstall rate | **Chrome Web Store developer dashboard** (M9 also on the public listing) | ✅ |
| M5 conversions, revenue, refunds | **Dodo Payments dashboard** + `public.profiles.is_pro` | ✅ |
| M4 sign-ins, and M2/M3/M6/M7 **for signed-in users only** | **Supabase SQL** — `profiles`, `user_bookmarks`, `collections`, `revisit_reminders` | ✅ |
| M8 crashes | **Sentry** — `clipmark-web` + `clipmark-extension` projects | ✅ |
| **Qualitative themes** — why people installed, what confused them, what they wanted | `public.feedback` (the `/feedback` page, PR #98) + support mailbox + listing reviews | ✅ |
| Website visitors, install-CTA click-through | *nothing* | ❌ — pre-launch win #2 |
| M2/M3/M6/M7 **for users who never sign in** | *nothing* | ❌ — extension analytics, PR #113, held |

> **The gap, stated plainly:** ClipMark works fully signed-out. Cloud tables only see
> signed-in users, so until PR #113 ships, activation and retention are measurable **only for
> the minority who create an account** (M4 targets 20%, but that figure is itself a guess) —
> not the whole base. **Do not read a signed-in cohort as the
> population; it is the most engaged slice and will flatter every number.** Until then, M2/M3/M6/M7
> are directional, and the sentence to use is *"of signed-in users,"* never *"of installs."*
>
> **Practical consequence:** if analytics matter for judging the launch, PR #113's open
> decisions ([D1–D3 below](#6-open-decisions-for-ash)) need answering **before** the push, not
> after. Deciding them post-launch means the launch cohort is permanently unmeasured — that
> data cannot be backfilled.

Sentry does **not** capture Dodo webhook signature or write failures (the handler catches its
own errors) — **Vercel function logs are the only place those appear.** See `docs/LAUNCH-GATES.md` §1.

**At 100 installs, the qualitative row above is likely to teach us more than every number in
the table.** Five people telling us what they expected and didn't get is more actionable than
a conversion rate with a denominator of 100. Target **≥ 5 substantive responses** and treat
reading them as a launch deliverable, not an afterthought.

---

## 4. Pre-launch checklist — live tracker

Legend: ✅ done · 🟡 in progress / partial · ⬜ not started · ⏳ waiting on someone else

| # | Item | Status | Owner | Notes |
|---|---|---|---|---|
| **W0** | **Read the *published* listing version off the CWS dashboard** | ⬜ **do this first** | Ash | A 60-second check that can invalidate copy. The live listing read **v1.0.3** on 2026-08-12 (#109 Day-0 gate item 0.1) while `main` was already ahead — whether 1.0.4 ever cleared review is not knowable from the repo. **Until the published version is ≥ 1.0.4, every dark-mode line in the posting kit is unpublishable**, and #109 tags each one. Doing this after the copy is scheduled is how an unhonest claim ships |
| **W1** | **Install CTAs → real listing URL** | ✅ **done** | — | Landed in `2f60a56`. `CHROME_STORE_URL` in `webapp/app/lib/constants.ts` is the single source of truth, consumed by `Navigation`, `Footer`, `DashboardContent`, `ContentPage`, the marketing landing page (×2), `/v/[shareId]`, and the JSON-LD `installUrl`. **Residual:** confirm the item id is the real one once the listing is public — see D1. One constant to change if it isn't |
| **W2** | **Website visitor analytics** | ⬜ **not started** | Eng | No analytics dependency or script in the webapp (`webapp/package.json` has none; no Plausible/Umami/GA/Vercel Analytics references). Needs a vendor decision. Distinct from W2's cousin, the *extension* analytics of PR #113 |
| **W3** | **Custom 404** | ⬜ **not started** | Eng | No `webapp/app/not-found.tsx`. Only `global-error.tsx` (a crash boundary, a different thing) — a bad inbound link during launch hits Next's stock 404 with no nav and no install CTA |
| **W4** | **Proper OG card + favicon** | 🟡 **partial** | Eng | `layout.tsx` uses the 512×512 `/clipmark-logo.png` for `og:image`, `twitter:image`, `icon`, `shortcut` *and* `apple` — a square logo in a `summary_large_image` slot crops badly on X/LinkedIn/Slack. Needs a 1200×630 card and a real icon set. Note `webapp/app/api/og/route.tsx` already renders dynamic OG images for share pages — the generator exists, the site-wide card doesn't use it |
| **W5** | **v1.0.5 Web Store approval** | ⏳ **waiting on Google** | Google | Submitted, auto-publishes on approval. **Blocks the whole push** — nothing posts before the listing is live |
| **W6** | **GTM kit ready to execute** | ✅ **written**, held | Ash | PR #109 — posting kit, launch plan, paid plan. Before anything goes out it needs **D4** (paid budget), **D5** (voice), **D6** (accounts) and **D7** (Reddit scope) answered, plus the W0 dark-mode check and the §8 honest-claims pass |

**Critical path: W0 → W5 → W1 residual → W6.** W2/W3/W4 are cheap, independent, and do not
block posting — but every hour of launch traffic that lands before W2 is traffic we can never
attribute. **Sequencing recommendation: land W2 before the push**, W3/W4 alongside it.

W0 sits first because it's free and it gates *copy*, not code: if the published listing is
behind `main`, the fix isn't engineering, it's deleting claims from the posting kit.

None of W1–W4 are in `docs/gtm/PARKED-BACKLOG.md` — they postdate that audit. This table is
their tracker.

---

## 5. Pointers — where everything else lives

| Topic | Doc / PR | State |
|---|---|---|
| **GTM launch kit** — launch plan, 2-day posting kit, paid plan | `docs/gtm/marketing-launch-plan.md`, `posting-kit.md`, `paid-plan.md` — **PR #109** | Open, **held** |
| **Release-train process** — cadence, hotfix criteria, `scripts/cut-release.sh` | `docs/RELEASE-PROCESS.md` — **PR #114** | Open, **held (draft)** |
| **Release runbook** (current, on `main`) | `docs/RELEASE-RUNBOOK.md` | Live |
| **Extension feature-usage analytics spec** | `docs/analytics/FEATURE-ANALYTICS-SPEC.md` — **PR #113** | Open, **held on D1–D3** |
| **Parked backlog** — 34 post-launch items | `docs/gtm/PARKED-BACKLOG.md` — PR #108 | ✅ Merged, living doc |
| Chrome Web Store listing copy + fields | `docs/gtm/chrome-web-store-listing{,-FIELDS}.md` | Live |
| Launch day runbook / go-no-go / policy | `docs/release/LAUNCH_DAY_RUNBOOK.md`, `LAUNCH_GO_NO_GO_CHECKLIST.md`, `RELEASE_POLICY.md` | Live |
| Owner-only setup gates (Dodo webhook, CWS) | `docs/LAUNCH-GATES.md`, `docs/OWNER_SETUP_CHECKLIST.md` | Live |
| Migration status + hand-apply rules | `webapp/migrations/README.md` — corrected by **PR #116** | Open |
| SEO audit | `docs/gtm/SEO-AUDIT.md` | Live |
| Creator outreach / community plans | `docs/gtm/creator-outreach-kit.md`, `community-engagement-plan.md` | Live |
| Test strategy across the four layers | `docs/TEST-STRATEGY.md`, `docs/TEST_PLAN_launch.md` | Live |
| Design system (single token source) | `DESIGN.md`, `packages/design-system/tokens.css` | Live |
| Post-launch sync engine | **PR #107** | Draft |

---

## 6. Open decisions for Ash

Nothing below can be decided from the repo. Each blocks something concrete.

| # | Decision | Blocks | Recommendation |
|---|---|---|---|
| **D1** | **The exact Chrome Web Store listing URL.** Code currently hardcodes item id `iboippnihpcnnglgboaiedaiimbiolgg`. Confirm this resolves to the public listing once v1.0.5 is approved | W1 residual, every install CTA, JSON-LD `installUrl`, posting kit links | Open the URL the moment the listing goes live. If wrong, it's a **one-constant fix** in `webapp/app/lib/constants.ts` + redeploy. Verify before posting anything — a dead install link on launch day costs the whole push |
| **D2** | **Extension analytics: opt-in or opt-out?** | PR #113 unblocks; all signed-out activation/retention measurement | Spec recommends **opt-out + honor DNT/GPC**. Opt-in yields a 5–20% enthusiast-skewed sample that is arguably worse than no data because it gets believed. EU/ePrivacy counterweight and a rotating-install-id middle ground are written up in the spec |
| **D3** | **Which events ship in v1?** | Same as D2 | Spec recommends **7 events**, no video-level dimension at all (a hashed `video_id` is not anonymisation — YouTube ids are an enumerable set, so a hash is a lookup table). Zero video data is also what keeps the CWS "Web history" box legitimately unchecked |
| **D4** | **Paid-ads budget** — or none at all for launch | PR #109's paid plan; which of the $10/$25/$50-a-day scenarios to run | **Read `paid-plan.md` §1 and §4 before deciding — it reaches an uncomfortable conclusion about its own subject.** At a ~$40 blended first payment against 2026 education-vertical CPCs of ~$4.81–$6.23, CAC misses the payback ceiling by roughly **10–30×**, and the doc says so rather than presenting a flattering model. Its recommendation: **$10/day as a keyword-and-message *learning* budget, not an acquisition channel** — plus two channels it thinks beat all three named ones, **YouTube in-stream placement targeting** (our audience is definitionally on YouTube, and the three cuts are already rendered) and **free CWS listing optimisation**. Also note paid is effectively gated on social proof, and the listing has **zero reviews** (§3, M9). Organic-only is a fully valid launch |
| **D5** | **Posting voice — founder or brand?** | Every line of the posting kit; PH maker comment, Show HN tone, X thread voice | **Founder.** Show HN and Product Hunt both reward a named human; a brand voice reads as astroturf on both |
| **D6** | **Which accounts actually exist?** X/Twitter, Product Hunt, LinkedIn, Reddit (with enough karma to post), IndieHackers, TikTok | The 2-day timeline — several channels have day-of account-age or karma gates | Audit today, not on launch morning. Reddit karma minimums and new-account filters cannot be fixed on the day. The site links `@clipmarkapp` on X — confirm that handle is ours and live |
| **D7** | **Reddit scope: accept the narrow 2-day window, or override it?** #109 §7.1 deliberately **excludes** r/medicalschoolanki, r/step1, r/step2, r/usmle, r/medicalschool, r/Mcat, r/productivity, r/GetStudying, r/studytips and all Discords | The Reddit half of the posting kit — which is also its highest-intent half | **Accept the narrow window.** Those excluded subs are the best-matched audience for the wedge, which is exactly why `community-engagement-plan.md` commits to weeks of genuine participation before posting there, and calls a ban the highest-severity GTM failure available. Treat them as a multi-week post-launch play, not launch inventory. Either way, the **mandatory 5-minute manual rules check per sub** still applies — no sub's rule text could be read when the kit was written (reddit.com was blocked in that environment), so every sub is tagged verified/unverified and the section is built as a decision tree, not an instruction |

**D2 and D3 are time-sensitive in a way the others aren't.** They gate PR #113, and the launch
cohort's behaviour is only capturable while it happens. Answering them after launch means the
first and most important cohort is permanently unmeasured.

---

## Appendix — how to keep this doc honest

Two failure modes have already bitten this repo, and both apply here:

1. **A doc that describes an old commit reads as describing `main`.** `DASHBOARD-PARITY.md`
   caused two false P1s that way, and `018`'s stale "NOT YET APPLIED" header is the same bug in
   a source file. Every status claim above is stamped to `b316165`. **Re-verify before
   trusting, and move the stamp when you edit.**
2. **A green PR does not mean everything ran.** CI (`.github/workflows/ci-launch-gates.yml`)
   gates exactly **four** Playwright specs — `tests/ci/extension-smoke`, `tests/auth-bridge`,
   `tests/design-consistency`, `tests/ci/webapp-smoke` — out of ~20 in the repo. **None of the
   five `*-packaged.spec.ts` specs run in CI**, which is precisely the layer that exercises the
   shipped `dist/`. CI green ≠ the packaged extension works; run those locally before a cut.

Not covered here on purpose: pricing strategy, the sync engine (PR #107), post-launch roadmap
(`docs/gtm/PARKED-BACKLOG.md`), and anything that already has an owning doc in §5.
