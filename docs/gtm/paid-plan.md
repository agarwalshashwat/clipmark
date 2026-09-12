# ClipMark — Paid / Inorganic Plan

**Date:** 2026-08-12
**Companion docs:** [marketing-launch-plan.md](marketing-launch-plan.md), [posting-kit.md](posting-kit.md), [SEO-AUDIT.md](SEO-AUDIT.md)
**Hard constraint on this document:** nothing here has been set up, no account has been created, no campaign exists, and no money has been spent. Ash builds and starts everything himself.

> **Every number below that isn't ClipMark's own price or an externally cited benchmark is an ESTIMATE.** Estimates are tagged `[EST]`. ClipMark has essentially no funnel data yet — the listing had a near-zero install count and zero reviews on 2026-08-12 — so every conversion rate here is an assumption borrowed from industry benchmarks, not a measurement. Treat them as the input to a test, never as a forecast.

---

## 1. The headline conclusion, up front

**Paid search almost certainly cannot pay for itself at ClipMark's current price point and unmeasured funnel. Run it as a small budget that buys keyword and message intelligence, not customers.**

The arithmetic is in §4 and it is not close — the realistic gap between what a paid click costs and what a paid click is worth is roughly **10–30×** `[EST]`. No amount of ad-copy craft closes a gap that size. What *does* close it, eventually, is a funnel that converts several times better, and the only way to find out which words produce that funnel is to buy a small, deliberate sample of clicks and watch what they do.

So the recommendation is:

1. **Don't start paid during the 2-day launch window.** It contaminates the organic read. Start on Day 3 at the earliest.
2. **Start at $10/day, on branded + competitor + ultra-long-tail exact match only.** Never broad match, never Display, never Performance Max at this stage.
3. **Judge it on learning, not on CAC.** The deliverable from month one of paid is a ranked list of the exact phrases that produce installs and activations — which then goes into the SEO pages, the Chrome Web Store listing keywords, and the landing-page headline, where those words are free forever.
4. **Consider YouTube in-stream before Google Search** (§7). ClipMark's entire audience is, by definition, already watching YouTube. It's the one paid surface where the targeting is trivially obvious and the cost per view is one to two orders of magnitude below a search click.

---

## 2. What a customer is actually worth

Needed before any CAC number means anything.

**Real prices (verified in `webapp/app/(marketing)/upgrade/pricing.ts`):** $7.99/mo · $59.99/yr · $99.99 lifetime.

| Line | Value | Basis |
|---|---|---|
| Assumed plan mix | 50% monthly / 35% annual / 15% lifetime | `[EST]` — no data yet |
| Blended **first payment** | **≈ $40** | 0.50×$7.99 + 0.35×$59.99 + 0.15×$99.99 `[EST]` |
| Less Merchant-of-Record fees | ≈ −$2–3 | `[EST]` — Dodo is MoR; confirm actual rate against a real payout |
| Less affiliate commission on referred sales | 30% one-time, on referred conversions only | Verified — one-time, not recurring |
| **Net first-payment revenue** | **≈ $37** | `[EST]` |
| Assumed monthly-plan retention | 5 months average | `[EST]` — pure assumption, ClipMark has no cohort data |
| **Rough 12-month LTV, blended** | **≈ $55–70** | `[EST]` |

**Therefore:** a CAC above ~$37 doesn't pay back on the first transaction. A CAC above ~$60 doesn't pay back within a year. **Call ~$40 the target CAC ceiling** for anything intended to be an acquisition channel rather than a learning exercise.

---

## 3. Google Search Ads

### 3.1 Structure

Three campaigns, hard-separated so their economics never blend into one unreadable average. All **exact match `[…]`** and **phrase match `"…"`** only — no broad match at this budget, it will spend the whole thing on garbage in three days.

| Campaign | Purpose | Match | Priority |
|---|---|---|---|
| **C1 — Branded defence** | Own "clipmark" so a competitor can't buy it, and so the navigational searcher lands on the right page | Exact + phrase | **Highest.** Cheapest clicks and highest conversion rate you will ever see |
| **C2 — Intent / problem** | Catch people searching for the thing ClipMark does | Exact only | High |
| **C3 — Competitor** | Catch people evaluating alternatives | Exact only | Medium — small volume, watch the copy rules in §3.3 |

### 3.2 Keywords

**C1 — Branded** (from [SEO-AUDIT.md](SEO-AUDIT.md): `clipmark pricing`/`clipmark cost` have zero competition by definition)

```
[clipmark]
[clipmark extension]
[clipmark chrome]
[clipmark pricing]
[clipmark review]
"clipmark"
```

**C2 — Intent / problem.** Ranked by how specifically the searcher is asking for what ClipMark is. The top block is where the money should go.

```
# Tier 1 — highest intent, lowest volume, cheapest. Start here.
[youtube to anki]
[youtube to anki flashcards]
[anki cards from youtube]
[export youtube timestamps to anki]
[spaced repetition youtube]
[active recall youtube]
[youtube flashcards extension]
[flashcards from video]
[convert lecture video to flashcards]

# Tier 2 — the loop/drill behaviour. Real volume (see the ~400K-install looper).
[loop section of youtube video]
[youtube ab loop extension]
[loop part of youtube video chrome]
[repeat section of youtube video]
[practice loop youtube guitar]
[loop youtube video for language learning]

# Tier 3 — the capture behaviour. Broader, more contested, add only after Tier 1-2 have data.
[youtube timestamp bookmark extension]
[bookmark youtube moments]
[save timestamps in youtube videos]
[youtube notes extension timestamp]
[how to remember what you watch on youtube]
[stop rewatching lectures]
```

**C3 — Competitor.** Bidding on a competitor's brand *as a keyword* is permitted by Google Ads policy; the restriction is on ad **text** and display URLs (§3.3).

```
[looper for youtube]
[looper for youtube alternative]
[language reactor alternative]
[video speed controller alternative]
[remnote youtube]
[remnote alternative]
[videosegments alternative]
[flashrecall alternative]
[studycards ai alternative]
[anki alternative for video]
```

*Note:* `videosegments alternative` already has a matching landing page on the site (`/switch-from-videosegments`) — point the ad there, not at the homepage. That's the highest-converting configuration available today, because the page answers the exact question the searcher typed.

### 3.3 The one rule that gets accounts restricted

**You may bid on a competitor's trademark as a keyword. You may not put that trademark in the ad headline, description, or display URL.** Google's trademark policy applies to ad text and display URLs, not the keyword list, and Google does not police keyword targeting for trademarks. Since 2023, a trademark complaint restricts only the specific advertisers and ads named in it.

Practically: C3's ad copy must sell ClipMark on its own merits and never name the competitor. Write it as *"the one that quizzes you afterwards"*, not *"better than Looper."*

### 3.4 Sample ad copy

Google RSA limits: headlines **30 chars**, descriptions **90 chars**. Counts shown.

**C1 — Branded**

| Field | Copy | Chars |
|---|---|---|
| H1 | `ClipMark — Official Site` | 24 |
| H2 | `Spaced Repetition YouTube` | 25 |
| H3 | `Free Tier, No Card Needed` | 25 |
| D1 | `Bookmark the exact moment, loop the passage, get quizzed before you forget it.` | 77 |
| D2 | `Free tier with real limits, listed on the pricing page. Exports to Anki.` | 71 |

**C2 — Intent, the Anki-adjacent ad group**

| Field | Copy | Chars |
|---|---|---|
| H1 | `YouTube to Anki, One Click` | 26 |
| H2 | `Feeds Anki, Doesn't Fight It` | 28 |
| H3 | `Free Chrome Extension` | 21 |
| D1 | `Save the exact second, review it, then export note + timestamp + deep link to Anki.` | 82 |
| D2 | `Every card links to the real moment in the video — never an AI summary.` | 70 |

**C2 — Intent, the retention ad group**

| Field | Copy | Chars |
|---|---|---|
| H1 | `Stop Rewatching Lectures` | 24 |
| H2 | `Get Quizzed On What You Saw` | 27 |
| H3 | `Spaced Review For YouTube` | 25 |
| D1 | `The video pauses days later and asks what was in it — before it replays the clip.` | 80 |
| D2 | `Understanding it isn't learning it. Free Chrome extension, no account needed.` | 76 |

**C2 — Intent, the A–B loop ad group**

| Field | Copy | Chars |
|---|---|---|
| H1 | `Loop Any YouTube Passage` | 24 |
| H2 | `Mark A, Mark B, Drill It` | 24 |
| H3 | `Several Segments Per Video` | 26 |
| D1 | `Loop the passage until it sticks — then get quizzed on it days later, not just replay it.` | 88 |
| D2 | `Built for lectures. Used hardest by musicians and language learners.` | 68 |

**C3 — Competitor (no competitor name anywhere in the copy)**

| Field | Copy | Chars |
|---|---|---|
| H1 | `Looping Isn't Remembering` | 25 |
| H2 | `The One That Quizzes You` | 24 |
| H3 | `Free Chrome Extension` | 21 |
| D1 | `Most YouTube tools help you rewatch. This one asks what was in it days later.` | 76 |
| D2 | `A–B loops plus spaced review, with an Anki export. Free tier, real limits, no card.` | 82 |

**Sitelinks (all campaigns):** `Pricing` · `How Active Recall works` · `Anki export` · `Free vs Pro`
**Landing pages:** send Tier-1 Anki terms to `/youtube-to-anki`, spaced-repetition terms to `/spaced-repetition-youtube`, recall terms to `/active-recall-youtube`, flashcard terms to `/youtube-flashcards`, and `videosegments` to `/switch-from-videosegments`. These pages already exist — sending paid traffic to the generic homepage instead would waste the best asset in the account.

### 3.5 Negative keywords — add these before the first click, not after

The single biggest way a $10/day education-vertical account burns out is downloader and video-editor traffic. Add as **campaign-level negatives, phrase match**:

```
# Wrong job entirely — downloading, converting, editing
download          downloader        mp3               mp4
converter         convert to mp3    ringtone          trim
trimmer           cutter            clip maker        clipper
video editor      editing software  crop              merge
compress          screen recorder   thumbnail downloader
subtitle download  transcript download

# Piracy / free-as-in-stolen
crack             cracked           torrent           keygen
free download     apk               mod apk           premium free

# Wrong platform
netflix           spotify           tiktok downloader instagram
twitch            vimeo             udemy download    coursera download

# Wrong meaning of "bookmark"
browser bookmarks  bookmark manager  bookmark bar     import bookmarks
watch later        playlist manager  subscription manager

# Wrong meaning of "clip" / creator-side intent
clip for tiktok   make shorts       repurpose video   viral clips
podcast clips     highlight reel    stream clips

# Commercial mismatch
jobs              salary            internship        course
degree            certification     tutor near me     free tutor
template          worksheet         printable         pdf
for kids          for toddlers

# Competitor-support traffic (people fixing their existing tool, not switching)
not working       won't load        uninstall         refund
how to install    login             support
```

Then, weekly, run the search-terms report and negate everything irrelevant that actually spent. At this budget that report is the single highest-value 20 minutes in the account.

### 3.6 Settings that matter at this budget

- **Search Network only.** Turn **off** "Include Google Display Network" and "Include search partners" — both default on, both will eat the budget.
- **Manual CPC or Maximize Clicks with a CPC cap** to start. Smart bidding needs conversion volume that doesn't exist yet; give it a cap of ~$2.00 `[EST]` and raise only where a term proves out.
- **Geography:** start with US, UK, Canada, Australia. Add India/Brazil/Nigeria as a *separate* campaign later if PPP pricing is ever introduced — mixing them into one campaign makes both unreadable.
- **Ad schedule:** all hours. Don't optimise a signal you don't have.
- **Conversion tracking must be live before the first click** (§8). Running paid without it is spending money to learn nothing, which is worse than not spending it.

---

## 4. The CAC arithmetic, worked

This is the part that drives the §1 conclusion. Every rate is `[EST]`.

```
CAC per paying customer  =  CPC ÷ (LP→install rate × install→paid rate)
```

**Benchmark CPCs:** education-vertical Google Ads CPC benchmarks for 2026 sit around **$4.81** (one benchmark set) to **$6.23** (another, up ~40% YoY). ClipMark's Tier-1 long-tail exact-match terms should come in well below the vertical average — call it **$1.00–$3.00** `[EST]` — because they're narrow and lightly contested. Competitor terms similar. Branded, well under $1.

**Funnel assumptions `[EST]`:**

| Step | Pessimistic | Mid | Optimistic |
|---|---|---|---|
| Landing page → Chrome Web Store click | 15% | 25% | 35% |
| CWS listing → install | 25% | 40% | 55% |
| **Ad click → install** | **3.8%** | **10%** | **19%** |
| Install → paid Pro | 1% | 2.5% | 5% |
| **Ad click → paid** | **0.04%** | **0.25%** | **0.96%** |

**Resulting CAC `[EST]`:**

| CPC | Pessimistic | Mid | Optimistic |
|---|---|---|---|
| $1.00 | ~$2,600 | ~$400 | **~$104** |
| $2.00 | ~$5,300 | ~$800 | ~$208 |
| $4.81 *(education benchmark)* | ~$12,700 | ~$1,920 | ~$500 |

**Against a target CAC ceiling of ~$40 (§2):** even the optimistic column at the cheapest plausible CPC misses by **~2.6×**, and the mid case misses by **~10×**. The pessimistic case is not a business.

**What would have to be true for paid search to work:**
- CPC at or under **$1.00**, which means Tier-1 long-tail only, and
- ad click → paid at **2.5%+**, i.e. roughly 10× the mid-case estimate.

That second condition is the one worth taking seriously, because it isn't absurd for a *very* narrow term. Someone typing `[export youtube timestamps to anki]` is describing a ClipMark feature almost word for word; that click could plausibly convert an order of magnitude better than a generic one. **The entire case for spending anything on paid search rests on finding a handful of terms like that**, and a $10/day budget is a reasonable price for the answer.

Note also the honest caveat cutting the other way: the extension's public listing has **zero reviews**. Paid traffic arriving at a store page with no social proof will convert at the low end of the install range until that changes — which makes getting genuine early reviews a *prerequisite* for paid, not a nice-to-have.

---

## 5. Reddit Ads

Better matched to ClipMark than Google Search, because Reddit lets you buy the exact communities that [marketing-launch-plan.md](marketing-launch-plan.md) §7 says are too risky to post in organically. **Buying an ad in r/Anki is not a self-promotion violation** — that's the point of ads, and it sidesteps the entire ban risk.

**Platform facts:** minimum **$5/day** per campaign and **$25 lifetime**. Promoted-post CPC benchmarks run **$0.75–$2.50**, CPM **$3–$10**; overall Reddit CPC ranges $0.50–$3.50 with most campaigns at **$0.75–$2.00**. Under ~$20/day, delivery is often too thin for the system to optimise; sources recommend $50–100/day for a genuine test — which is above what's proposed here, so expect a slow, noisy read.

**Targeting — communities, not interests.** Interest targeting on Reddit is vague; community targeting is the product's real strength.

```
r/Anki  ·  r/medicalschoolanki  ·  r/languagelearning  ·  r/GetStudying
r/studytips  ·  r/premed  ·  r/step1  ·  r/MCAT  ·  r/guitarlessons
r/piano  ·  r/chrome_extensions  ·  r/ObsidianMD  ·  r/GetMotivated
```

**Creative:** a promoted **image or video post**, using the 15s vertical or a single clean still of the recall prompt mid-question. Reddit punishes ads that read like ads harder than any other platform — write it in the register of a comment, and **disclose that it's yours**.

```
Title: The video pauses days later and asks you what was in it, before it replays

Body: ClipMark saves the exact second of a YouTube video, loops an A–B passage,
and then quizzes you on it on a spaced schedule — note hidden, so you have to
actually recall it. Every review links back to the real moment, not a summary.
Exports to Anki; it's the step before the card, not a replacement.

Free tier, no account needed. Built by one person — happy to answer anything in
the comments.
```

**⚠️ You must monitor the comments on a Reddit ad.** Reddit ads have comment sections and they are merciless. An unattended ad in r/Anki turns into a public thread about how it's inferior to Anki. Answer it — that's the *"it feeds Anki"* pillar doing its job, in front of exactly the right audience.

**Reddit CAC `[EST]`:** at CPC ~$1.25 and a click→paid rate similar to §4's mid case (0.25%), CAC ≈ **$500**. Optimistic (0.96%): ≈ **$130**. Same conclusion as search — but the *targeting quality* is better, so Reddit is the more promising of the two if only one gets tested.

---

## 6. X Ads

**Platform facts:** self-serve starts around **$20/day**, though campaigns under ~$500/month rarely exit the learning phase. CPC benchmarks **$0.30–$2.50**, typically $0.50–$2.00. CPM $5–9 — roughly half Facebook's and a third of LinkedIn's.

**Honest read: X ads are the lowest-priority of the three.** Cheap impressions, weak intent, and follower-targeting on X mostly reaches people who follow productivity-tool accounts rather than people currently stuck rewatching a lecture. The one X spend that is clearly worth considering is **promoting the launch thread itself** — a $50–100 one-off behind an organic post that's already earning replies. That's amplifying a proven asset, not prospecting cold, and it's how X ads actually work for small accounts.

**If tested:** target followers of `@AnkiApp`-adjacent accounts, study-productivity accounts, and language-learning creators; use the 15s vertical; keep it to one campaign and a fixed total, not an ongoing daily budget.

---

## 7. The two channels that probably beat all three above

Worth stating plainly, because a paid plan that ignores them would be a worse plan.

### 7.1 YouTube in-stream ads

ClipMark's ICP is *definitionally* someone watching a long educational YouTube video right now. No other paid surface has targeting that clean.

- **Placement targeting** lets you buy in-stream ads on specific channels and videos — lecture channels, conference-talk channels, language-learning channels, instrument-tutorial channels.
- Cost is per-view, not per-click, and is one to two orders of magnitude below a search click.
- **The 15s vertical and 30s cutdown are already rendered**, so the creative cost is zero.
- The pitch writes itself: the ad plays on the exact kind of video the product is for, and says *"you will not remember this video."*

This is not costed here because it's outside the brief's named channels, but **if any paid budget exists, this is where I'd test first** — and I'd want a real estimate built before committing, not the back-of-envelope in §4.

### 7.2 Chrome Web Store listing optimisation — free

CWS search is a real acquisition channel and it costs nothing. Right now the listing is on v1.0.3 with zero reviews. Fixing the listing keywords, publishing v1.0.4, and earning genuine reviews will move installs more than $300 of Google Search spend `[EST]`. [chrome-web-store-listing-FIELDS.md](chrome-web-store-listing-FIELDS.md) already has the paste-ready copy. **Do this before spending anything.**

---

## 8. Budget scenarios

All CAC figures `[EST]`, derived from §4's mid case unless stated. All three assume conversion tracking is live and the CWS listing is on v1.0.4 with at least a few genuine reviews.

### Scenario A — $10/day (~$300/month) · **Recommended starting point**

| | |
|---|---|
| **Allocation** | Google Search only. C1 Branded ~$2/day, C2 Tier-1 intent ~$8/day. No C3, no Reddit, no X. |
| **Clicks/month** | ~100–300 `[EST]` (at $1–3 CPC) |
| **Expected installs** | ~10–30/month `[EST]` |
| **Expected paid conversions** | **0–1/month** `[EST]` |
| **Implied CAC** | Meaningless at this volume — a single conversion swings it from ∞ to $300 |
| **What this budget actually buys** | A ranked search-terms report. After 4–6 weeks you know which of the ~25 Tier-1 phrases real people type, which ones click, and which ones install. That list is worth more than the 0–1 conversions. |
| **Verdict** | The right first spend. Cheap enough that a null result costs $300, structured so the null result is still informative. |

### Scenario B — $25/day (~$750/month)

| | |
|---|---|
| **Allocation** | Google Search $15/day (C1 $2, C2 $10, C3 $3) + Reddit Ads $10/day across r/Anki, r/languagelearning, r/GetStudying |
| **Clicks/month** | ~250–600 `[EST]` |
| **Expected installs** | ~25–60/month `[EST]` |
| **Expected paid conversions** | **1–4/month** `[EST]` |
| **Implied CAC** | **~$190–750** `[EST]` — i.e. 5–19× the $40 ceiling |
| **What this budget actually buys** | The same keyword learning, plus a real read on whether Reddit's community targeting converts better than search intent. Enough volume that a 4-week result means something. |
| **Verdict** | The right budget **if** Scenario A surfaced two or three terms that clearly outperformed. Not a good first move. Note that $10/day on Reddit is below the level where Reddit's optimiser works well, so expect a noisy read. |

### Scenario C — $50/day (~$1,500/month)

| | |
|---|---|
| **Allocation** | Google Search $25/day, Reddit $20/day, X $5/day (or hold X back and put $150 one-off behind the launch thread) |
| **Clicks/month** | ~600–1,400 `[EST]` |
| **Expected installs** | ~60–140/month `[EST]` |
| **Expected paid conversions** | **2–10/month** `[EST]` |
| **Implied CAC** | **~$150–750** `[EST]` |
| **Verdict** | **Do not start here.** $1,500/month against a product with no measured funnel and an unreviewed store listing buys statistical significance on a question that a $300 test can answer directionally. The honest use of $1,500 at this stage is a YouTube in-stream test (§7.1) plus paying for the SEO content in [SEO-AUDIT.md](SEO-AUDIT.md) §5 — both of which have durable value after the spend stops, which paid clicks do not. |

### Recommendation

**Start at Scenario A for 4–6 weeks. Graduate to B only on evidence.** The gate to move from A to B is not "we can afford it" — it's *"at least two search terms produced installs at under $15 per install"* `[EST]`. If nothing clears that bar, the answer is that paid isn't the channel yet, and the $300 bought a genuinely useful answer.

---

## 9. What to measure

### 9.1 Instrument these before the first click

Without this, paid spend produces no information and the whole exercise is pointless.

- [ ] **Conversion tracking on the real money event** — Pro purchase, with value, imported into Google Ads. Dodo is Merchant-of-Record, so verify the purchase event actually fires back to the site.
- [ ] **A micro-conversion that fires often enough to optimise against** — the CWS listing click. Paid Pro conversions will be too rare to bid on for months.
- [ ] **UTMs on every paid destination**, distinct per campaign/ad group/keyword, and **separate from** the organic UTMs used in the launch. Do not let paid and launch traffic land in the same bucket.
- [ ] **The install attribution gap, acknowledged.** Google Ads cannot see a Chrome Web Store install; the store sits between your ad and the install. The CWS click is your proxy — be explicit that install numbers are modelled, not measured, and reconcile against the CWS dashboard's own install count weekly.
- [ ] **Activation event: first completed Active Recall cycle** (reveal → replay → grade). This is the number that predicts revenue. An install that never reaches it is worth nothing, and a paid channel that produces installs with no activations is a channel to switch off regardless of its install CPA.

### 9.2 The weekly review, 30 minutes

| Metric | Why |
|---|---|
| Search-terms report, every term that spent | Add negatives. The highest-value 20 minutes in the account. |
| Cost per CWS-listing click, by keyword | Your only high-frequency efficiency signal |
| Modelled cost per install, by keyword | Cross-check against the CWS dashboard |
| **Cost per activation** (first completed recall cycle) | The real quality signal |
| Cost per Pro conversion, by campaign | Will be near-empty for weeks. Don't over-read a single conversion. |
| Reddit ad comment threads | Unattended comments on a Reddit ad actively damage the brand |
| Impression share lost to budget, C1 branded only | If you're losing branded impressions to budget, fix that before anything else |

### 9.3 Kill criteria — decide these now, not later

- **Any keyword** that spends 20× its target CPA with zero CWS clicks → pause it. `[EST]`
- **Any campaign** at 4 weeks with zero installs → pause it.
- **All of paid** at 6 weeks with no term under ~$15/install → stop, and put the money into §7.1 and §7.2 instead. `[EST]`
- **Reddit** if comment sentiment on the ads turns hostile and can't be turned around by answering → stop. Brand damage in r/Anki costs more than the clicks are worth, and it's the same community the organic long-game plan depends on.

---

## 10. What this plan deliberately doesn't do

- **No Performance Max, no Display, no Demand Gen.** They need conversion volume ClipMark doesn't have; they'll spend a small budget in days with nothing learnable to show.
- **No broad match.** Not at $10/day.
- **No competitor names in ad copy.** Keywords yes, copy no (§3.3).
- **No paid during the launch window.** It makes the organic read unreliable, and the organic read is the more valuable of the two.
- **No PPP/India-specific campaigns** until PPP pricing actually exists — paying US-CPC-adjacent rates to send traffic at a $7.99 price point in a market that won't bear it is the fastest way to a bad CAC number.
- **No affiliate spend.** The affiliate program pays **one-time 30%** on a first Pro purchase with a 30-day cookie; it's a creator-partnership channel ([creator-outreach-kit.md](creator-outreach-kit.md)), not a paid-media lever, and it must never be described as recurring.

---

## Sources

- [Google Ads Benchmarks 2026 — WordStream](https://www.wordstream.com/blog/2026-google-ads-benchmarks) · [Google Ads Benchmarks for Education 2026 — Benchmarketing](https://www.benchmarketing.org/benchmarks/google-ads/education) · [Education & Instruction Google Ads CPC — PPC Chief](https://ppcchief.com/google-ads-benchmarks/education)
- [Bidding on competitor keywords: 2026 legal playbook — GrowLeads](https://growleads.io/blog/how-to-bid-on-competitor-brand-names-a-proven-google-ads-strategy/) · [Competitor brand keywords in Google Ads 2026 — Admapix](https://www.admapix.com/blog/best-practices/competitor-brand-keywords-google-ads) · [Can you use competitor names in Google Ads — Jonny Swift PPC](https://www.jonnyswiftppc.com/blog/can-you-use-competitor-names-in-google-ads)
- [Reddit Ads minimum budget requirements 2026 — Stackmatix](https://www.stackmatix.com/blog/reddit-ads-minimum-budget-requirements-2026) · [Reddit Ads cost: CPC, CPM & CPA by industry 2026 — Benly](https://benly.ai/learn/reddit-ads/reddit-ads-cost-benchmarks) · [Reddit Ads cost 2026 — Feedheat](https://feedheat.com/reddit-ads/cost)
- [How much does it cost to advertise on X in 2026 — WebFX](https://www.webfx.com/social-media/pricing/how-much-does-it-cost-to-advertise-on-twitter/) · [X advertising statistics 2026 — AutoTweet](https://www.autotweet.io/statistics/x-twitter-advertising-statistics) · [Twitter Ads guide 2026 — Improvado](https://improvado.io/blog/twitter-ads-guide)
- ClipMark prices verified in `webapp/app/(marketing)/upgrade/pricing.ts`; affiliate terms in `webapp/app/(marketing)/affiliate/page.tsx`.
