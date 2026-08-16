# ClipMark — Market-fit gap analysis: US / UK / Australia

**Date:** 2026-08-16 · **Baseline:** `origin/main` @ `a795d01`
**Primary target:** US, UK, Australia. Canada and New Zealand behave similarly and are treated as follow-ons, not separate plans.
**Status:** strategy doc. Nothing here is implemented; every item is a proposal.

## What this extends, and what it deliberately does not repeat

This builds on work that already exists. Read those first; this document only adds the regional layer.

| Existing doc | What it already settles | What this doc adds |
|---|---|---|
| [`WEBSITE-AUDIT.md`](WEBSITE-AUDIT.md) § Target-market fit | M1–M10: the *surface* defects (bare `$`, `.edu`-only, UK GDPR, cookie consent) | Why they matter commercially, and what to do beyond fixing the copy |
| [`paid-plan.md`](paid-plan.md) §2, §3.6, §10 | Geo is **already decided**: "start with US, UK, Canada, Australia" (`:228`). No PPP campaigns until PPP pricing exists (`:423`). Target CAC ceiling **≈ $40** (`:26-44`) | What has to be true on-site before that spend converts |
| [`marketing-launch-plan.md`](marketing-launch-plan.md) §2, §3, A6 | Launch positioning is the **broad study/retention wedge**, explicitly *not* the med beachhead (A6) | How the two coexist per region instead of contradicting each other |
| [`community-engagement-plan.md`](community-engagement-plan.md) §1 | The USMLE/med beachhead, with named communities and a trust-first calendar | That this track is **US-shaped** and does not transfer to UK/AU as written |
| [`retention-seo-pages.md`](retention-seo-pages.md) | The retention search space is the chosen battleground; "youtube summarizer" is conceded | Where that mapping is region-blind |
| [`chrome-web-store-listing.md`](chrome-web-store-listing.md) §4 | Listing copy, free-tier numbers, honesty constraint | The listing/site positioning mismatch |

**There is no competitive brief in this repo.** The brief referenced by other docs (`ClipMark-MedExam-Strategy-Brief.md`, `ClipMark-Distribution-Plan.md`) does not exist at those paths — see §5, where I say plainly what I could and could not establish about competitors rather than inventing it.

## Evidence key

Every claim below is tagged. I have not fabricated market data.

- **`[VERIFIED]`** — traced to code, config, or an existing repo doc. Citation given.
- **`[ASSUMPTION]`** — a reasoned inference. Stated as such, with what would validate it.
- **`[NEEDS DATA]`** — requires an external source ClipMark does not have. Do not act on it as fact.

---

# 1 · Pricing and currency localization

## 1.1 What Dodo actually supports — this is not a platform limitation

`[VERIFIED]` The Dodo SDK vendored at `webapp/node_modules/dodopayments` supports a ~100-currency enum including **USD, GBP, AUD, CAD, NZD, EUR** (`resources/misc.d.ts`), and `checkoutSessions.create` accepts:

| Field | Location | Currently passed? |
|---|---|---|
| `billing_currency?: MiscAPI.Currency` | `resources/checkout-sessions.d.ts:127, 622` | ❌ no |
| `billing_address` (with `country`) | `:123, 618` | ❌ no |
| `allow_customer_editing_country?: boolean` | `:70` | ❌ no |
| `tax_id` (VAT number) | `:186` | ❌ no |

`[VERIFIED]` ClipMark's session (`webapp/app/(marketing)/upgrade/actions.ts:270-287`) passes only `product_cart`, `customer`, an optional `discount_code`, `metadata` and `return_url`.

**So local-currency checkout is a supported capability that is simply unused.** That reframes the recommendation: this is not "integrate multi-currency", it is "pass a field we already have the plumbing for."

## 1.2 The "taxes included" exposure — now cheaply checkable

The audit (M2) flagged that `GuaranteeLine.tsx:32` promises "taxes included" under the buy button while the code passes no tax or country signal, and I could not confirm Dodo's presentation without a live checkout.

`[VERIFIED]` **There is a cheaper way than a live checkout.** `tax_inclusive` is a readable boolean on the Dodo objects:

```
resources/checkout-sessions.d.ts:508      tax_inclusive: boolean;
resources/subscriptions.d.ts:271-273      "Indicates if the recurring_pre_tax_amount is tax inclusive"
```

**Action:** read `tax_inclusive` off the existing Dodo product/subscription objects. If it is `false`, UK buyers are shown `$7.99`, promised "taxes included", and charged VAT on top (20% in the UK, 10% GST in AU). That is a price promise under a buy button in two of the three target markets — resolve it before any paid spend, not after.

## 1.3 Should prices show local currency?

**Recommendation: two stages, and do not conflate them.**

**Stage 1 — label the currency (do this now).** `[VERIFIED]` Every price on the site renders a bare `$` (audit M1: `PlanCards.tsx:129,134`, `page.tsx:873`, `affiliate/page.tsx:128-130`), and `ProductPrices` has no currency field at all. Rendering `$7.99 USD` costs one field and one line per call site.

This alone fixes the worst of it. `[ASSUMPTION]` An Australian reader defaults to AUD on a bare `$`; discovering a different number at checkout is a classic abandonment point. *Validate with:* checkout drop-off by country once analytics has volume.

**Stage 2 — charge in local currency (a bigger bet, and not obviously right).** Passing `billing_currency` per geo is technically easy. The reasons to be cautious:

- `[VERIFIED]` `PRICE_DEFAULTS` is a single flat set (`upgrade/pricing.ts`). Multi-currency means either FX-converted prices (which produce ugly numbers like `£6.31`) or per-market price points, which is a **pricing decision**, not a localization one.
- `[ASSUMPTION]` Charm pricing matters more than currency familiarity at this price. `£5.99` and `A$11.99` read as considered; `£6.31` reads as a conversion artifact and signals a small foreign operator.
- `[NEEDS DATA]` Whether local-currency display measurably lifts conversion for a sub-$10 SaaS in these three markets. Widely asserted, but I have no ClipMark data and will not cite a number I cannot source.

**So:** ship Stage 1 now. Treat Stage 2 as a post-launch experiment with real per-market price points (`£5.99` / `A$11.99` / `$7.99`), not an FX conversion.

## 1.4 PPP across the three — largely a non-issue, and already decided

`[VERIFIED]` `paid-plan.md:228` already scopes paid geo to US/UK/CA/AU and defers PPP markets until PPP pricing exists (`:423`).

`[ASSUMPTION]` PPP adjustment is **not** a Tier-1 concern: all three are high-income markets where $7.99/mo is comfortably within discretionary spend for the target user. The pricing risk in these markets is *ambiguity and tax surprise*, not affordability. The audience-specific affordability question is students — which is what the discount in §3.1 is for, and a far cheaper lever than regional price tiers.

**Do not build PPP tiering for US/UK/AU.** It solves a problem these markets do not have, and `paid-plan.md` already parked it correctly.

## 1.5 Commercial linkage

`[VERIFIED]` `paid-plan.md:26-44` sets a target CAC ceiling of **≈ $40** against a blended first payment of ≈ $40 and 12-month LTV of ≈ $55-70 (all `[EST]` in that doc, honestly labelled).

At that ceiling there is no room for avoidable checkout friction. Currency ambiguity (M1) and a possible tax surprise (M2) both sit *after* the ad click and *before* the payment — they degrade the exact conversion step the CAC math depends on. **Fixing them is cheaper than buying more traffic.**

---

# 2 · Region-specific positioning and beachheads

## 2.1 The real problem: four surfaces already disagree

`[VERIFIED]` This is not "the site lacks a target" — it is that four documents pick different ones:

| Surface | Positioning |
|---|---|
| `chrome-web-store-listing.md:4, 100` | USMLE/IMG med students as the beachhead |
| `marketing-launch-plan.md` A6 | Explicitly **not** med — broad study/retention wedge for the launch window |
| `community-engagement-plan.md` §1 | The med beachhead as a **parallel long-game** track |
| The website (audit M5) | Region- and audience-neutral: Builder / Founder / Serious Learner |

Each is individually defensible. `marketing-launch-plan.md` A6 gives a good reason for the split (PH/HN/IH audiences are builders; med framing lands flat there). **The gap is that the website serves neither** — it is the one surface all traffic converges on, and it names an audience exactly twice (`page.tsx:57` `.edu` discount; `page.tsx:631` "by exam day").

**Recommendation:** keep the two-track split, and make the *website* carry both by segmenting one section rather than picking a side. The Serious Learner card is the natural home. This costs one section, not a rebuild, and it does not undo A6.

## 2.2 United States

`[VERIFIED]` The most developed track. `community-engagement-plan.md` §1 names sized communities (r/medicalschoolanki ~175K, r/step1, r/step2, r/usmle, r/medicalschool, r/Mcat) with per-community self-promo rules and a trust-first calendar.

- **Primary:** USMLE Step 1 / Step 2 and IMG candidates. `[VERIFIED]` as the documented beachhead.
- **Why it fits:** `[VERIFIED]` the audience studies from long YouTube lecture series (Boards & Beyond is named at `community-engagement-plan.md:55`), and Anki is the cultural default — which ClipMark feeds rather than replaces (`/youtube-to-anki` ships, export verified in the website audit).
- **Second wave:** MCAT/pre-med. `[VERIFIED]` `community-engagement-plan.md:19` already stages r/Mcat as "later-expansion, not month-1".
- **On SAT/GRE — I would not chase these.** `[ASSUMPTION]` Test-prep for SAT/GRE is dominated by paid course platforms with their own video, so the "I study from free YouTube lectures" premise is weaker than for USMLE/MCAT. *Validate before investing:* whether SAT/GRE study communities discuss YouTube lecture series the way med communities discuss B&B. Cheap to check by reading two subreddits for an hour.

## 2.3 United Kingdom — the biggest unaddressed opportunity, and the med track does not transfer

`[VERIFIED]` No UK-specific content exists anywhere in the repo. The med beachhead is USMLE-shaped; **USMLE is a US licensing exam.** UK medical students sit different assessments entirely, so the store listing's beachhead copy has no UK analogue as written.

`[ASSUMPTION]` The transferable insight is the *behaviour*, not the exam: UK universities run lecture-capture systems, and undergraduates revise from recorded lectures and YouTube supplements against a compressed exam period. That is the same "re-watch a 50-minute lecture to find one explanation" problem ClipMark solves.

- **Primary `[ASSUMPTION]`:** UK university students in lecture-heavy degrees (medicine, law, engineering, sciences) during revision season. *Validate with:* r/UniUK, r/6thForm, university subreddits — read before posting, per the `community-engagement-plan.md` §2 trust-first rule, which applies just as much here.
- **Secondary `[ASSUMPTION]`:** A-level students. Large, highly YouTube-dependent for revision.
- **`[NEEDS DATA]`** UK exam-body names and their current syllabus vocabulary. Do not write A-level or UK-medical copy from memory — get it from the exam boards' own sites, or it will read as an outsider guessing, which is worse than staying generic.
- **Timing `[ASSUMPTION]`:** UK revision demand concentrates ahead of summer exams. A campaign timed to that beats an evenly-spread one. *Validate with:* Search Console seasonality on the retention pages once there is a year of data.

## 2.4 Australia

`[VERIFIED]` Nothing region-specific exists. `[VERIFIED]` `paid-plan.md:228` already includes AU in the paid geo.

- **Primary `[ASSUMPTION]`:** university students, same lecture-capture behaviour as the UK. AU universities are heavy users of recorded lectures.
- **`[ASSUMPTION]`** Smallest of the three by population, so it does not warrant its own content track initially — it should ride UK-shaped content, which needs only spelling and terminology adjustments, not a rewrite.
- **Practical note `[VERIFIED]`:** the AUD ambiguity (§1.3) bites hardest here, because `$` is the local symbol. Australia is the one market where a bare `$` is not merely unclear but actively misread as local currency.

## 2.5 Reconciling listing and site — concrete

Replace the region-neutral Serious Learner card with a segmented block that names concrete situations without narrowing the product:

> **Studying for something specific?** ClipMark was built for people revising from lecture series — Step 1 candidates working through Boards & Beyond, undergraduates going back over recorded lectures before exams, anyone whose syllabus lives on YouTube.

`[ASSUMPTION]` Naming a concrete situation raises conversion for the people it names more than it loses from those it does not — the standard argument for specificity in positioning. *Validate with:* an A/B test on that section once traffic supports it.

---

# 3 · Feature and offer gaps

## 3.1 Student discount eligibility — the cheapest regional fix on the list

`[VERIFIED]` Audit M4: `page.tsx:57` asks for a `.edu` address. `.edu` is US-restricted; UK is `.ac.uk`, AU is `.edu.au`, and neither appears anywhere in the tree.

Two of three target markets are excluded **by the wording of the offer**, in the exact segment (students) most likely to convert on the study/retention wedge.

**Fix `[VERIFIED]` as trivial:** the discount is issued by hand via support, so this is a copy change only — "your university email (`.edu`, `.ac.uk`, `.edu.au`, or equivalent)". No code, no eligibility system.

## 3.2 Anki is the integration that matters — and the free cap may be the wrong lever

`[VERIFIED]` Anki export ships (`/youtube-to-anki`, dashboard + side panel), and `community-engagement-plan.md:14` states that in r/medicalschoolanki "Anki + resource workflow *is* the culture."

`[VERIFIED]` Free tier allows **1 Anki export per month** (`FREE_ANKI_EXPORTS_PER_MONTH = 1`, `extension/src/usage-caps.js`).

`[ASSUMPTION]` **This is the wrong cap for this audience.** For a med student, exporting to Anki *is* the workflow, not an occasional action — a monthly cap means the free tier does not demonstrate the product's central value to the exact beachhead the store listing targets. A weekly cap, or a lifetime-N-exports cap, would let the habit form before the paywall.

*Validate with:* export-attempt frequency among free users in the first month, and whether users who hit the cap convert or churn. This is instrumentable today and should be measured before changing the number.

**Flagging honestly:** this contradicts nothing in the docs — the caps are documented as deliberate — but it is the one free-tier number that looks mis-set for the named beachhead.

## 3.3 Exam and course templates — a bigger bet, and I would sequence it late

`[ASSUMPTION]` Pre-built tag/group templates ("Step 1 — Cardiology", "A-level Biology — Paper 1") would lower setup effort and make the product feel built-for-you per region.

`[VERIFIED]` Groups and tags already exist, so this is content, not engineering.

**But sequence it after §3.1 and §2.5.** `[ASSUMPTION]` Templates only pay off once there are enough users in a given exam cohort for the template to match their syllabus; getting it subtly wrong is worse than not shipping it, because a wrong syllabus signals the maker does not know the exam.

## 3.4 The friction a studier hits that nobody has named

`[VERIFIED]` `/faq:46` states plainly:

> "The one-line description captured at save time is **not editable in place** yet; today the workaround is to delete that moment and re-save it."

`[ASSUMPTION]` This is a real problem for the target use case specifically. A student capturing 30 moments in a lecture will mistype or want to reword some; "delete and re-save" loses the review schedule attached to that moment. For a product whose entire pitch is spaced review, losing scheduling state to fix a typo is a sharp edge in the core loop.

**This is a product gap, not a market gap** — but it hits the target audience harder than the generalist audience, and it is already honestly documented. Worth pricing into the roadmap before regional expansion.

## 3.5 What I checked and found *not* missing

Avoiding invented gaps:

- **Anki export** — ships, and correctly positioned as additive (`/youtube-to-anki`, FAQ "No — it feeds it").
- **Notion/Obsidian** — ships as CSV/Markdown export, and the docs are careful not to call it an integration. Correct for this audience; no one is asking for live Notion sync as a study workflow.
- **Spaced repetition scheduler** — ships (1/3/7 → doubling → 60-day cap, verified in the website audit).
- **Free tier generosity** — genuinely real (unlimited local bookmarks, 25 recall cards, 30 reviews/mo). Not a gap.

---

# 4 · Compliance needed to operate cleanly

Full evidence in [`WEBSITE-AUDIT.md`](WEBSITE-AUDIT.md) M6-M8; the commercial framing follows.

| Item | Status | Why it blocks these markets |
|---|---|---|
| **UK GDPR** | `[VERIFIED]` absent — `privacy/page.tsx:152` grants rights to "EU/EEA" only; "UK GDPR", "ICO", "data controller", "legal basis", "international transfer" all absent | Post-Brexit the UK is a separate regime. A UK buyer finds no statement covering them, on a site asking for card details |
| **Cookie consent** | `[VERIFIED]` `r/[code]/route.ts:38-44` sets a 30-day `clipmark_ref` marketing cookie; privacy policy never mentions it; no consent banner exists | Attribution cookies are not "strictly necessary" under UK PECR / EU ePrivacy. It fires on redirect, before any page renders — i.e. on **every affiliate click**, an intended acquisition channel |
| **Entity + jurisdiction** | `[VERIFIED]` `terms/page.tsx:186` says "the jurisdiction in which ClipMark is incorporated" without naming it; no entity or address anywhere | UK/EU consumer law requires trader identity and address before a distance contract. Also a plain trust signal for a new paid product |
| **CCPA/CPRA** | `[VERIFIED]` absent — and **not currently required** | Thresholds (~$25M revenue / 100k CA consumers) are plainly unmet. The policy already states the no-sale position CCPA cares about. Optional pre-emption only — I am not flagging this as a violation |

`[ASSUMPTION]` The affiliate-cookie gap is the one with live commercial exposure, because affiliates are a channel ClipMark is actively recruiting (`/affiliate` is a shipped, promoted page). Worth a lawyer's brief review rather than a self-serve fix.

**None of these blocks launching.** They are hygiene that gets more expensive to retrofit once there are paying UK customers and an affiliate roster.

---

# 5 · Competitive gaps in these regions — what I can and cannot establish

**Being straight about the evidence base:** there is no competitive brief in this repo. The docs that other files cite for competitor analysis (`ClipMark-MedExam-Strategy-Brief.md`, `ClipMark-Distribution-Plan.md`) **do not exist at the referenced paths**. I am not going to synthesise competitor market share, pricing or positioning from memory and present it as analysis.

## What is established from repo evidence

| Finding | Basis |
|---|---|
| The **retention search space is uncontested**; "youtube summarizer" is conceded to funded incumbents | `[VERIFIED]` `retention-seo-pages.md` — an explicit, reasoned strategic choice, and the four retention pages ship against it |
| At least one direct rival (**VideoSegments**) is unmaintained | `[VERIFIED]` a whole migration page exists (`/switch-from-videosegments`) and describes it as "unmaintained" |
| An **adjacent** category — A–B loop extensions — has real install volume | `[VERIFIED]` `paid-plan.md:85` cites "the ~400K-install looper" for Tier-2 loop/drill keywords. Note this is a *different* competitor set from VideoSegments, and a different job-to-be-done; do not treat it as evidence about the bookmarking category |
| **No competitor is known to combine timestamp capture with a spaced-review loop** | `[VERIFIED]` as a *claim ClipMark makes* — `WhyClipMark.tsx`: "It quizzes you — no other YouTube bookmarker does." Framed there as a product claim, not a market survey |
| Summarizer tools are a different job | `[VERIFIED]` `/faq:57-58` argues this well: "A summary is a shortcut past the video; Active Recall is repeated practice at remembering it" |

## What needs external data before it can be called a gap

`[NEEDS DATA]`, all of it:

- Whether rivals localize pricing for UK/AU (the obvious place to check whether §1.3 Stage 2 is table stakes or a differentiator).
- Whether any competitor targets UK/AU study audiences specifically — this is the actual question "where are rivals weak in these regions" turns on, and I cannot answer it from the repo.
- Install-base and review counts for the main YouTube-bookmarking extensions in each region's Chrome Web Store surface.
- Whether Anki-adjacent tools (AnkiConnect workflows, AnKing ecosystem) already solve the video-moment problem well enough that ClipMark is a nice-to-have there.

**Recommendation:** commission a proper competitive brief as its own artefact — an afternoon of structured Chrome Web Store and subreddit reading — rather than letting this section pretend to be one. The `design:competitive-brief` / `marketing:competitive-brief` skills exist for exactly this and would produce something citable.

**The honest summary:** ClipMark's differentiation claim (capture + spaced review + Anki export in one tool) is **verified against its own code** but **unverified against the market**. That distinction matters before it goes into ad copy, where an unsubstantiated comparative claim is a real risk.

---

# 6 · Prioritized: what to build or change to win US/UK/AU

Ordered by leverage per unit of effort. Effort: XS <1h · S 1-4h · M ~1 day · L multi-day.

## Quick wins

| # | Move | Region | Effort | Expected impact | Confidence |
|---|---|---|---|---|---|
| **Q1** | Label prices with an explicit currency (`$7.99 USD`) — add `currency` to `ProductPrices`, populate from the Dodo price object instead of discarding it | AU 🇦🇺 most, UK 🇬🇧 | XS | Removes the single clearest pre-checkout ambiguity; AU is where `$` is actively misread | `[VERIFIED]` gap · `[ASSUMPTION]` impact |
| **Q2** | Read `tax_inclusive` off Dodo and either honour or reword "taxes included" | UK 🇬🇧 AU 🇦🇺 | XS | Removes a price promise that may be false under the buy button in two of three markets | `[VERIFIED]` — field is readable |
| **Q3** | Widen student-discount eligibility to `.ac.uk`, `.edu.au`, "or equivalent" | UK 🇬🇧 AU 🇦🇺 | XS | Un-excludes two markets in the highest-intent segment. Copy-only; discount is manual | `[VERIFIED]` |
| **Q4** | Name the legal entity and jurisdiction in terms + footer | all | XS | Consumer-law requirement in UK/EU; trust signal everywhere | `[VERIFIED]` |
| **Q5** | Extend the privacy policy: UK GDPR + ICO, object/restrict/withdraw rights, controller identity, transfer mechanism | UK 🇬🇧 | S | Closes the regime gap for a target market | `[VERIFIED]` |
| **Q6** | Disclose `clipmark_ref` and add a consent path for UK/EU | UK 🇬🇧 | S | Closes exposure on an active acquisition channel | `[VERIFIED]` |
| **Q7** | Normalise to US English sitewide (~10 occurrences, incl. two same-file conflicts) | US 🇺🇸 | S | Removes an unpolished signal in the largest market; fixes "summariser" vs "summarizer" in `/faq`'s own keywords | `[VERIFIED]` |
| **Q8** | Segment the Serious Learner card to name concrete study situations (§2.5) | all | S | Gives converging traffic an audience anchor without undoing launch-plan A6 | `[ASSUMPTION]` |

## Bigger bets

| # | Move | Region | Effort | Expected impact | Confidence |
|---|---|---|---|---|---|
| **B1** | Commission a real competitive brief (§5) | all | M | Unblocks every "we're the only one that…" claim before it reaches ad copy | `[VERIFIED]` the gap exists |
| **B2** | Instrument free-tier cap behaviour, then revisit the 1/month Anki export cap | US 🇺🇸 (med) | M | The cap most likely mis-set for the named beachhead; measure before changing | `[ASSUMPTION]` |
| **B3** | Build the UK track: validate audience in-community first, then UK-specific retention content | UK 🇬🇧 | L | Largest wholly unaddressed target market | `[ASSUMPTION]` + `[NEEDS DATA]` on exam vocabulary |
| **B4** | Make the one-line description editable in place (§3.4) | all, target-weighted | M | Removes a sharp edge in the core loop; losing review state to fix a typo hits studiers hardest | `[VERIFIED]` gap · `[ASSUMPTION]` severity |
| **B5** | Per-market price points (`£5.99` / `A$11.99`), *not* FX conversion, via `billing_currency` | UK 🇬🇧 AU 🇦🇺 | M | Post-launch experiment. Plumbing exists; the pricing decision does not | `[VERIFIED]` capability · `[NEEDS DATA]` lift |
| **B6** | Exam/course templates | US 🇺🇸 then UK 🇬🇧 | L | Sequence after B3 — wrong syllabus is worse than none | `[ASSUMPTION]` |

## Explicitly not recommended

- **PPP pricing tiers for US/UK/AU.** All three are high-income; the barrier is ambiguity, not affordability. `paid-plan.md:423` already parked PPP correctly.
- **A separate AU content track initially.** `[ASSUMPTION]` AU can ride UK-shaped content with terminology adjustments; it does not justify its own program at this stage.
- **Chasing SAT/GRE.** `[ASSUMPTION]` weaker fit than USMLE/MCAT — validate cheaply before investing.
- **Region-specific landing pages before B3's validation.** Writing UK exam copy from memory produces something a UK student reads as an outsider guessing.

---

## Top 5 moves

1. **Q1 + Q2 together — currency label and the tax claim.** Both sit between the ad click and the payment, both are XS, and `paid-plan.md`'s ≈$40 CAC ceiling leaves no room for avoidable checkout friction.
2. **Q3 — student eligibility beyond `.edu`.** A copy change that stops excluding two of three target markets in the best-converting segment.
3. **Q5 + Q6 — UK GDPR and the affiliate cookie.** The only findings with live legal exposure, on a channel actively being recruited.
4. **Q8 — give the website an audience anchor.** The one surface all traffic converges on currently serves neither documented positioning.
5. **B1 — a real competitive brief.** ClipMark's central differentiation claim is verified against its own code and unverified against the market. That gap should close before the claim goes into paid copy.

---

*Nothing in this document is implemented. Items tagged `[ASSUMPTION]` or `[NEEDS DATA]` should not be treated as established fact — each names what would validate it.*
