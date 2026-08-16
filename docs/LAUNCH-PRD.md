# ClipMark — Launch PRD (north star)

**Purpose:** one place to answer *"are we going in the right direction?"* — positioning,
what's actually shipped, what "launched" means, what's left, and what only Ash can decide.

**This is a control tower, not an encyclopedia.** Every section points at the doc that owns
the detail. If a fact lives in another doc, this one links to it rather than restating it —
so there is exactly one place to fix when it changes.

> **Verified against `origin/main` @ `f8c647f` on 2026-08-16**, from an isolated worktree.
> No production database, Web Store listing, Vercel setting or webhook config was touched.
> Items marked **owner-reported** are things the repo cannot prove — Web Store review state,
> dashboards, whether a migration has actually been run — and are trusted as stated.
>
> Rows marked ⚠ are claims that are **narrower than they sound**. Each one exists to stop a
> specific dishonest line reaching the posting kit (guardrail **G5**); don't strip one without
> re-reading the code it cites.

### This doc vs. CONTEXT.md

Since **[CONTEXT.md](../CONTEXT.md)** landed (#135) there are two files, and mixing them up is
how both go stale:

| | **CONTEXT.md** | **LAUNCH-PRD.md** (this file) |
|---|---|---|
| Answers | *"What is the state right now, and what's next?"* | *"Are we going in the right direction?"* |
| Contains | Live status, ➡ NEXT action, decisions log, guardrails | Positioning, what "launched" means, metrics, the reasoning behind open decisions |
| Changes | Every session | Rarely — when strategy moves, not when a PR lands |

**Live status lives in [CONTEXT.md §3](../CONTEXT.md#3-current-status) and is not repeated here.**
§2 and §4 below carry only what a *strategy* reader needs. Working protocol: **[AGENTS.md](../AGENTS.md)**.

**Update rule:** re-verify §2 and §4 against `main` whenever you touch this file, and move the
commit stamp above. A stale north star is worse than none — see the
[appendix](#appendix--how-to-keep-this-doc-honest).

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
register live in **`docs/gtm/marketing-launch-plan.md`** (#109, now on `main`) — that doc owns
positioning detail; this section owns the one-liner only.

**The homepage now leads with this wedge** (#131, #132). The H1 is *"Turn YouTube into
flashcards you actually remember."* — flashcards, not bookmarks, which is the §1 claim rendered
as copy. Three install CTAs run down the page, Active Recall is shown as **free** rather than
tagged Pro, and the invented two-bar retention chart was replaced by the **real review ladder**
read off `recall.js` (1 → 3 → 7 days, doubling to a 60-day cap). Nothing on that page now
asserts a number we can't source — the standing bar for marketing surfaces.

### What backs the claim (all shipped, verified in `main`)

| Capability | Where it lives |
|---|---|
| Bookmark exact moments, tag with `#word`, group by video | `extension/src/content/content.js`, `chrome.storage.sync` (`bm_{videoId}`) |
| **A–B multi-segment loops** — define A/B, loop in-session, save named loops that become recall cards | `extension/src/loop.js` (+ `.module.js` twin), shipped v1.0.3 |
| **Spaced recall that pauses the video and prompts you** | `extension/src/recall.js` (+ `.module.js` twin), scheduled on the bookmark itself. Interval is `min(lastInterval * 2, 60)` days, with an "again" reset. ⚠ **Do not call this SM-2, SM-2-lite or FSRS** — it is a doubling schedule with a 60-day ceiling, and #109's honest-claims register forbids the comparison. Say what it does instead; it's a good story on its own |
| **Anki export** | `extension/src/export-anki.module.js` + `extension/src/popup/dashboard.js`; webapp copy in `webapp/app/dashboard/_utils/anki.ts`. The two are kept in step by `webapp/tests/unit/anki-parity.test.ts` — **edit both or that test fails**, which is the only enforcement there is |
| Revisit reminders | `rem_{videoId}` in sync storage; `public.revisit_reminders` when signed in; `chrome.alarms` + `chrome.notifications` driven from `extension/src/background/background.js`. ⚠ **Scheduled review reminders are Pro** — the FAQ lists them under what Pro adds, so never pitch them as a free-tier feature |
| **System-synced dark mode** — **live on the website** | **Webapp: shipped and deployed** (#134). `app/lib/theme-script.ts` resolves `prefers-color-scheme` pre-paint, `app/components/ThemeProvider.tsx` tracks OS changes, and the toggle is mounted in `Navigation.tsx` + `DashboardChrome.tsx`. It stayed *unmounted* until every surface passed AA (#127–#129 first) — a reachable toggle over unreadable surfaces is worse than none. **Extension:** `extension/src/popup/theme-loader.js`, same approach, `system` also follows YouTube's own theme. ⚠ The *extension* half is claimable only once the **published listing** carries it — `main` is at 1.0.6 but the store is not (W0/W2) |

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

> **Live status is [CONTEXT.md §3](../CONTEXT.md#3-current-status)** — the ➡ NEXT action, the
> full Done list and every in-flight item. It is updated every session; this section is not.
> What follows is only the part that changes how you'd *judge direction*.

**Phase: engineering is essentially done; what's left is owner actions.** The product is built,
the webapp is deployed, payments are live. Nothing on the critical path to launch is now a
coding problem.

| The four that matter for direction | Where it stands |
|---|---|
| **Extension `main` is at v1.0.6** | ✅ in the repo (#126) — ⚠ **not uploaded to the Web Store.** The published listing is still an older build. Everything in §3/§4 that says "the listing" means the *published* one, not `main` |
| **The website is launch-ready** | ✅ Pre-launch wins all landed (#120), homepage rebuilt around the wedge (#131, #132), system-synced dark mode live (#134), production build gated in CI (#133) |
| **Payments work end to end** | ✅ Dodo LIVE webhook + live checkout, refunds ledger applied and verified in prod (#110, #106, #116). Not a blocker — `docs/DODO-LIVE-GATE.md` |
| **We still can't measure signed-out users** | ❌ Unchanged, and the one strategic gap left — see [§3](#3-launch-definition--success-metrics) |

**Migration `019_uninstall_feedback.sql` is the gating dependency, and it is ordered.** v1.0.6
registers an uninstall URL pointing at `/uninstall`, so **that page 500s on every uninstall
until the table exists**. Apply 019 to prod *before* submitting v1.0.6 — the reverse order ships
a broken page to everyone who leaves. Application status is **owner-reported**; agents never
touch prod (**G3**).

**Promo videos — 3 cuts delivered**, not in git: `videos/clipmark-remember-{master-60s,
cutdown-30s,vertical-15s}`, plus two earlier cuts.

### Not in scope for this launch

Everything in **`docs/gtm/PARKED-BACKLOG.md`** (34 items, #108) — pull from there *after*
launch, not during. Also out: the **#107 sync engine** (needs a full rebase; its migration
renumbers to 020), and the `feature/dashboard-extras-hold` / `sync/dashboard-parity` branches
(**G8**).

---

## 3. Launch definition & success metrics

### What "launched" means

**Launch = v1.0.6 live on the Chrome Web Store + the 2-day GTM push executed from the
`docs/gtm/` posting kit, against a website with working install CTAs.**

Webapp deploys continuously and is not a launch gate. The **extension listing is the gate** —
nothing gets posted publicly before the listing is live and the install CTA resolves to it.
Hour-by-hour sequencing lives in `docs/gtm/marketing-launch-plan.md`; go/no-go criteria in
`docs/release/LAUNCH_GO_NO_GO_CHECKLIST.md`.

**The submission order is fixed:** migration 019 → submit v1.0.6 → wait for approval → post.
Skipping the first step ships a 500 to every uninstaller; skipping the third posts traffic at a
listing that doesn't have the build the copy describes.

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
and paid spend into zero social proof is the most reliable way to waste it (see D3).

**M11 is the one metric that got materially better instrumented this cycle.** The uninstall
survey turns it from a bare rate into a *reason* — the difference between "25% left" and "25%
left because they expected it to work on mobile." That only pays off if 019 is applied before
v1.0.6 ships; otherwise every uninstaller hits a 500 and the rate stays a number with no story.

### Where to watch them — and the honest gap

| Signal | Instrument | Available now? |
|---|---|---|
| M1 installs, plus M9 reviews / M10 listing conversion / M11 uninstall rate | **Chrome Web Store developer dashboard** (M9 also on the public listing) | ✅ |
| M5 conversions, revenue, refunds | **Dodo Payments dashboard** + `public.profiles.is_pro` | ✅ |
| M4 sign-ins, and M2/M3/M6/M7 **for signed-in users only** | **Supabase SQL** — `profiles`, `user_bookmarks`, `collections`, `revisit_reminders` | ✅ |
| M8 crashes | **Sentry** — `clipmark-web` + `clipmark-extension` projects | ✅ |
| **Qualitative themes** — why people installed, what confused them, what they wanted | `public.feedback` (the `/feedback` page, #98) + support mailbox + listing reviews | ✅ |
| **M11 *why* — what made people uninstall** | **`/uninstall` survey** (#125, #126). v1.0.6 registers `chrome.runtime.setUninstallURL()`, so removing the extension opens the hosted page; answers land in `public.uninstall_feedback` | 🟡 — needs **migration 019** applied *and* v1.0.6 published. The URL carries the extension version and nothing else — no user id, no counts (**G6**) |
| Website visitors, install-CTA click-through | Vercel Web Analytics, on `main` via #120 | 🟡 — code landed; still needs the **Vercel dashboard toggle flipped** (Ash) before any data is collected |
| M2/M3/M6/M7 **for users who never sign in** | *nothing* | ❌ — extension analytics is **spec only** (#113), blocked on D1/D2 |

> **The gap, stated plainly:** ClipMark works fully signed-out. Cloud tables only see
> signed-in users, so until extension analytics ships, activation and retention are measurable **only for
> the minority who create an account** (M4 targets 20%, but that figure is itself a guess) —
> not the whole base. **Do not read a signed-in cohort as the
> population; it is the most engaged slice and will flatter every number.** Until then, M2/M3/M6/M7
> are directional, and the sentence to use is *"of signed-in users,"* never *"of installs."*
>
> **Practical consequence:** if analytics matter for judging the launch, the analytics spec's open
> decisions ([D1–D2 below](#6-open-decisions-for-ash)) need answering **before** the push, not
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
| **W0** | **Read the *published* listing version off the CWS dashboard** | ⬜ **do this first** | Ash | A 60-second check that can invalidate copy. The live listing read **v1.0.3** on 2026-08-12 while `main` was already ahead; `main` is now **1.0.6** and the gap is wider. **Every claim in the posting kit must be true of the *published* build, not `main`** (**G5**) — dark mode and the uninstall survey both ship in versions the store may not have yet. Doing this after the copy is scheduled is how a dishonest claim ships |
| **W1** | **Apply migration `019_uninstall_feedback.sql` to prod** | ⏳ **owner-reported in progress** | Ash | **Blocks W2.** Back up first (**G3**), then verify the object, not the ledger row: `SELECT to_regclass('public.uninstall_feedback')`. 018 already proved that failure mode — its ledger row landed without the body |
| **W2** | **Submit v1.0.6 to the Chrome Web Store** | ⬜ **not started** | Ash | `main` is at 1.0.6 (#126) but **nothing has been uploaded**. Owner-only, never automated (**G4**). Must follow W1 — v1.0.6 registers the uninstall URL, so submitting first means every uninstaller hits a 500. Then it's a review wait, and **the push waits on it** |
| **W3** | **Enable Vercel Web Analytics in the dashboard** | ⬜ **one click** | Ash | Code landed with #120; until the toggle is on the component mounts and **silently no-ops**, so launch-day traffic is unattributable. Cheapest item on this list and it expires — traffic that arrives before it is on can never be recovered |
| **W4** | **Website pre-launch wins** — install CTAs, analytics code, custom 404, OG card + favicons | ✅ **done** | — | #120 (with #118/#119 closed as superseded); install CTAs had already landed in `2f60a56`. `CHROME_STORE_URL` in `webapp/app/lib/constants.ts` remains the single source of truth for every install link |
| **W5** | **Homepage rebuilt around the wedge** | ✅ **done** | — | #131 + #132 — flashcard-led H1, 3 install CTAs, Active Recall shown free, honest review-ladder chart. See [§1](#1-product-one-liner--positioning) |
| **W6** | **System-synced dark mode** | ✅ **done, deployed** | — | #134, after #127–#129 brought every surface to AA. Extension half is claimable only once the published listing carries it (W0) |
| **W7** | **Production build gated in CI** | ✅ **done** | — | #133 added the `ci-webapp-build` job — `next build` now runs on every PR. Six gates total (**G2**); a type error or failed build can no longer reach `main` green |
| **W8** | **GTM kit ready to execute** | ✅ **written**, on `main` | Ash | `docs/gtm/` — posting kit, launch plan, paid plan. Before anything goes out it needs **D3** (paid budget), **D4** (voice), **D5** (accounts) and **D6** (Reddit scope) answered, plus the W0 check and the honest-claims pass |

**Critical path: W0 → W1 → W2 → (review wait) → W8.** Every remaining item is an **owner
action**; none is engineering. W3 is off the path but expires — do it now, not on launch day.

W0 sits first because it's free and it gates *copy*, not code: if the published listing is
behind `main`, the fix isn't engineering, it's deleting claims from the posting kit.

> **The process lesson worth keeping** (from the #118/#119/#120 episode, when three agents built
> the same four items in parallel inside twelve minutes, one of which was already done on
> `main`): **scope against `main`, and read the open-PR list before opening one.** Both the
> duplication and the wasted item traced to a stale baseline — the exact trap the
> [appendix](#appendix--how-to-keep-this-doc-honest) names. This is now guardrail territory;
> see [AGENTS.md](../AGENTS.md).

---

## 5. Pointers — where everything else lives

Everything below is **on `main`** unless marked otherwise — the held-PR era is over.

| Topic | Doc | Notes |
|---|---|---|
| **Live status, ➡ NEXT action, decisions log, guardrails** | **[CONTEXT.md](../CONTEXT.md)** | Read first, every session. Owns current state; this doc does not |
| **Working protocol for agents** | **[AGENTS.md](../AGENTS.md)** | How to branch, test, and hand off |
| **GTM launch kit** — launch plan, 2-day posting kit, paid plan | `docs/gtm/marketing-launch-plan.md`, `posting-kit.md`, `paid-plan.md` | Ash executes by hand; gated on D3–D6 |
| **Release-train process** — cadence, hotfix criteria, `scripts/cut-release.sh` | `docs/RELEASE-PROCESS.md` | Biweekly train + narrow hotfix lane (**G7**) |
| **Release runbook** | `docs/RELEASE-RUNBOOK.md` | |
| **Extension feature-usage analytics spec** | `docs/analytics/FEATURE-ANALYTICS-SPEC.md` | **Spec only, not built** — blocked on D1/D2 |
| **Parked backlog** — 34 post-launch items | `docs/gtm/PARKED-BACKLOG.md` | Living doc |
| Chrome Web Store listing copy + fields | `docs/gtm/chrome-web-store-listing{,-FIELDS}.md` | |
| Launch day runbook / go-no-go / policy | `docs/release/LAUNCH_DAY_RUNBOOK.md`, `LAUNCH_GO_NO_GO_CHECKLIST.md`, `RELEASE_POLICY.md` | |
| Owner-only setup gates (Dodo webhook, CWS) | `docs/LAUNCH-GATES.md`, `docs/OWNER_SETUP_CHECKLIST.md` | |
| Migration status + hand-apply rules | `webapp/migrations/README.md` | **G3** — read before touching prod |
| SEO audit · creator outreach · community plan | `docs/gtm/SEO-AUDIT.md`, `creator-outreach-kit.md`, `community-engagement-plan.md` | |
| Test strategy across the four layers | `docs/TEST-STRATEGY.md`, `docs/TEST_PLAN_launch.md` | |
| Design system (single token source) | `DESIGN.md`, `packages/design-system/tokens.css` | Enforced by `scripts/design-audit.mjs` |
| Post-launch sync engine | **PR #107** | **Draft, parked** — needs a full rebase; migration renumbers to 020 |

---

## 6. Open decisions for Ash

Nothing below can be decided from the repo. Each blocks something concrete.

> **[CONTEXT.md §6](../CONTEXT.md#6-open-questions--decisions-needed) carries the same open
> questions as a one-line live list** (Q1–Q5). This section is where the *reasoning and the
> recommendation* live. Resolve one → append it to CONTEXT.md's §4 decisions log and delete the
> Q row; strike it here. Rough mapping: **D1/D2 = Q1**, **D3–D6 = Q4**. Q2 (build analytics now
> or post-launch), Q3 (#107 sync engine) and Q5 (two light-mode contrast misses, including
> `InstallCta` at 2.26:1) are tracked there, not here.

| # | Decision | Blocks | Recommendation |
|---|---|---|---|
| **D1** | **Extension analytics: opt-in or opt-out?** | Unblocks the analytics spec; all signed-out activation/retention measurement | Spec recommends **opt-out + honor DNT/GPC**. Opt-in yields a 5–20% enthusiast-skewed sample that is arguably worse than no data because it gets believed. EU/ePrivacy counterweight and a rotating-install-id middle ground are written up in the spec |
| **D2** | **Which events ship in v1?** | Same as D1 | Spec recommends **7 events**, no video-level dimension at all (a hashed `video_id` is not anonymisation — YouTube ids are an enumerable set, so a hash is a lookup table). Zero video data is also what keeps the CWS "Web history" box legitimately unchecked |
| **D3** | **Paid-ads budget** — or none at all for launch | The paid plan in `docs/gtm/`; which of the $10/$25/$50-a-day scenarios to run | **Read `paid-plan.md` §1 and §4 before deciding — it reaches an uncomfortable conclusion about its own subject.** At a ~$40 blended first payment against 2026 education-vertical CPCs of ~$4.81–$6.23, CAC misses the payback ceiling by roughly **10–30×**, and the doc says so rather than presenting a flattering model. Its recommendation: **$10/day as a keyword-and-message *learning* budget, not an acquisition channel** — plus two channels it thinks beat all three named ones, **YouTube in-stream placement targeting** (our audience is definitionally on YouTube, and the three cuts are already rendered) and **free CWS listing optimisation**. Also note paid is effectively gated on social proof, and the listing has **zero reviews** (§3, M9). Organic-only is a fully valid launch |
| **D4** | **Posting voice — founder or brand?** | Every line of the posting kit; PH maker comment, Show HN tone, X thread voice | **Founder.** Show HN and Product Hunt both reward a named human; a brand voice reads as astroturf on both |
| **D5** | **Which accounts actually exist?** X/Twitter, Product Hunt, LinkedIn, Reddit (with enough karma to post), IndieHackers, TikTok | The 2-day timeline — several channels have day-of account-age or karma gates | Audit today, not on launch morning. Reddit karma minimums and new-account filters cannot be fixed on the day. The site links `@clipmarkapp` on X — confirm that handle is ours and live |
| **D6** | **Reddit scope: accept the narrow 2-day window, or override it?** The posting kit §7.1 deliberately **excludes** r/medicalschoolanki, r/step1, r/step2, r/usmle, r/medicalschool, r/Mcat, r/productivity, r/GetStudying, r/studytips and all Discords | The Reddit half of the posting kit — which is also its highest-intent half | **Accept the narrow window.** Those excluded subs are the best-matched audience for the wedge, which is exactly why `community-engagement-plan.md` commits to weeks of genuine participation before posting there, and calls a ban the highest-severity GTM failure available. Treat them as a multi-week post-launch play, not launch inventory. Either way, the **mandatory 5-minute manual rules check per sub** still applies — no sub's rule text could be read when the kit was written (reddit.com was blocked in that environment), so every sub is tagged verified/unverified and the section is built as a decision tree, not an instruction |

**D1 and D2 are time-sensitive in a way the others aren't.** They gate the analytics build, and the launch
cohort's behaviour is only capturable while it happens. Answering them after launch means the
first and most important cohort is permanently unmeasured.

---

## Appendix — how to keep this doc honest

Two failure modes have already bitten this repo, and both apply here:

1. **A doc that describes an old commit reads as describing `main`.** `DASHBOARD-PARITY.md`
   caused two false P1s that way, and `018`'s stale "NOT YET APPLIED" header is the same bug in
   a source file. Every status claim above is stamped to `f8c647f`. **Re-verify before
   trusting, and move the stamp when you edit.**
2. **A green PR does not mean everything ran.** CI (`.github/workflows/ci-launch-gates.yml`)
   runs **six gates** — `ci-unit`, `ci-design-conformance`, `ci-extension-smoke`,
   `ci-webapp-build`, `ci-webapp-visual-smoke`, `ci-integration` (**G2**) — but between them they
   gate exactly **four** Playwright specs: `tests/ci/extension-smoke`, `tests/auth-bridge`,
   `tests/design-consistency`, `tests/ci/webapp-smoke`, out of **26** in the repo. **None of the
   five `*-packaged.spec.ts` specs run in CI**, which is precisely the layer that exercises the
   shipped `dist/`. CI green ≠ the packaged extension works; run those locally before a cut.
   #133 closed the largest hole here — `next build` now runs on every PR — but the packaged
   layer is still unguarded.

Not covered here on purpose: live status (**CONTEXT.md §3**), pricing strategy, the #107 sync
engine, post-launch roadmap (`docs/gtm/PARKED-BACKLOG.md`), and anything with an owning doc in §5.
