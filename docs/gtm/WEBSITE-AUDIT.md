# ClipMark website audit — claims, dark mode, UX, a11y, target-market fit

**Date:** 2026-08-16 · **Baseline:** `origin/main` @ `a795d01` · **Scope:** all 15 static marketing routes + the Chrome Web Store listing copy · **Target market:** US / UK / AU (globally available, deliberately Tier-1 targeted)
**Method:** every route rendered headlessly (Playwright/Chromium, sandbox — not a real browser profile) at **1280×900** and **375×812**, in **light and dark**, from a production `next build` served out of an isolated worktree. Every advertised claim was treated as a **hypothesis** and traced to shipping, user-reachable code.

> **AUDIT ONLY.** No product code was changed. Everything below is a finding plus a proposed fix.

---

## Verdict

Two of the four surfaces are excellent. **`/faq` and the Chrome Web Store listing are accurate** — they correctly say on-device AI is free, refuse to call a CSV an integration, and label frame capture as unshipped. `/upgrade` is also correct, including `coming-soon` markers for genuinely unbuilt features.

The failures are concentrated in **the homepage AI section, the privacy policy, and the terms of service** — and they are the same two bugs repeated across surfaces:

1. **A feature that does not exist is advertised in 8 places**, including JSON-LD, the privacy policy and the terms.
2. **On-device AI is sold as Pro in 5 places** when it is free for everyone — contradicted by `/upgrade`, `/faq`, the store listing, *and* a comment in the shipping code.

A fourth lens — **target-market fit for US/UK/AU** — is added at the end. The short version: pricing renders a bare `$` with no currency anywhere on the site, the student discount is `.edu`-only so it excludes UK and AU students by construction, the privacy policy covers "EU/EEA" but not UK GDPR, and a 30-day affiliate cookie is set with no disclosure and no consent path.

Dark mode is in far better shape than at my last audit — **zero AA contrast failures in both themes across all 15 routes**. But Ash's report was right: **two controls render with no background and no border at all.** Confirmed, root-caused, and reproduced below.

---

# SEVERITY 1 — Truthfulness: claims vs. code

## C1 · "Auto Tagging" is advertised in 8 places and does not ship 🔴

**Evidence — the function has no production caller.** Exhaustive repo-wide trace of `localSuggestTags`:

```
extension/src/ai/local-ai.js:62    async function localSuggestTags(...)   ← definition
extension/src/ai/local-ai.js:190   globalThis.localSuggestTags = ...      ← global registration
extension/src/ai/local-ai.js:199   export { localSuggestTags }            ← ESM export
extension/src/ai/local-ai.js:208   module.exports = { ... }               ← CJS export
tests/local-ai.spec.ts:72          return await localSuggestTags(...)     ← ONLY invocation
```

The single call site is a **Playwright test**. No content script, side panel, dashboard or background path invokes it.

**The UI shell is dead too.** `extension/src/pages/side-panel.html:103` declares `<div id="tag-suggestions" class="tag-suggestions" style="display:none;">`. Its only JavaScript reference is `extension/src/popup/side-panel.js:633`, which *hides* it:

```js
document.getElementById('tag-suggestions').style.display = 'none';
```

Nothing anywhere populates or shows it.

**There is no shipped equivalent.** `parseTags` (`extension/src/constants.js:12-16`) is a regex over `#(\w+)` — it extracts tags the user *typed*. The dashboard's `autoTagGroups` (`webapp/app/dashboard/groups/page.tsx:87`) groups collections by tags that already exist. Neither is AI suggestion.

**All 8 advertised instances:**

| # | Location | Claim |
|---|---|---|
| 1 | `webapp/app/(marketing)/page.tsx:665` | `✦ Auto Tagging` — "Suggests tags for each clip from what it's actually about." |
| 2 | `webapp/app/(marketing)/page.tsx:41` | Homepage FAQ: "…then **suggests tags** based on what the clip is about." |
| 3 | `webapp/app/(marketing)/page.tsx:112` | **JSON-LD `HowTo` step** — "drafts a note … and **suggests tags for every clip**" |
| 4 | `webapp/app/(marketing)/page.tsx:766` | How It Works step 02: "drafts a note … and **suggests tags**" |
| 5 | `webapp/app/(marketing)/page.tsx:707` | "drafts the note **and tags**" — ⚠️ **this line is mine**, introduced in PR #131 |
| 6 | `webapp/app/(marketing)/privacy/page.tsx:114` | Privacy policy: "AI features like summarization and **tag suggestions**" |
| 7 | `webapp/app/(marketing)/terms/page.tsx:82` | Terms: "generate summaries **and tags**" |
| 8 | `docs/gtm/chrome-web-store-listing.md:125` | Promo video script: "AI drafts the note, **tag auto-applied**" |

**Why it matters:** #3 is structured data — Google may surface "suggests tags for every clip" as a rich result for a capability that cannot be exercised. #6 and #7 are the privacy policy and the terms of service: describing AI processing of a feature that does not run is a consumer-protection problem, not a copy problem. #8 would ship into the store listing's video.

**Fix:** delete the `Auto Tagging` card (#1) and strike the tag half of the sentence from #2–#8. Either that, or wire `localSuggestTags` into the save flow and populate `#tag-suggestions` — but until it ships, the claim must come out of the legal documents first.

> **On #5:** I wrote that line during PR #131 while "fixing claim honesty," and I read it for tone rather than tracing it. That is precisely the failure mode this audit was commissioned to correct, and it is the strongest argument for the trace-don't-read rule.

---

## C2 · On-device AI is sold as Pro in 5 places — it is free for everyone 🔴

**Evidence — no Pro gate exists on any AI path.** The complete inventory of `checkPro()` / `showUpgradeModal()` call sites in `extension/src` contains **no AI feature**. The three reachable AI entry points are ungated:

| Entry point | Caller | Gate |
|---|---|---|
| `localSummarizeSnippet` (Alt+B silent save) | `extension/src/content/content.js:615` | none |
| `localSummarizeSnippet` (side-panel AutoFill) | `extension/src/popup/side-panel.js:1871` | none |
| `localSummarizeBookmarks` (Summarize button) | `extension/src/popup/side-panel.js:811` | none |
| `localGeneratePost` (Post Insights) | `extension/src/popup/side-panel.js:896` via `generateSocialPost` | none |

And the shipping code says so out loud — `extension/src/popup/side-panel.js:807`:

```js
// Local AI (Gemini Nano) — free for everyone, on-device, zero cost to us.
```

**All 5 mislabelled instances:**

| # | Location | Claim |
|---|---|---|
| 1 | `webapp/app/(marketing)/page.tsx:694` | `Pro Features` eyebrow badge on the AI section |
| 2 | `webapp/app/(marketing)/page.tsx:717` | "Explore Pro Features →" CTA closing that section |
| 3 | `webapp/app/(marketing)/terms/page.tsx:82` | "Use AI-powered features **(Pro tier)**" |
| 4 | `webapp/app/(marketing)/terms/page.tsx:110` | "a paid Pro tier that **unlocks AI features**…" |
| 5 | `webapp/app/(marketing)/privacy/page.tsx:129` | "To provide AI-powered features **(Pro tier only)**." |

**Three surfaces already contradict them** — this is an internal inconsistency, not a judgement call:

| Correct source | Says |
|---|---|
| `webapp/app/(marketing)/upgrade/page.tsx:32` | `{ label: 'Smart AI Synthesis (Local-only)', free: true, pro: true }` |
| `webapp/app/(marketing)/faq/page.tsx:50` | "Free gives you … **on-device AI note drafting** …" |
| `docs/gtm/chrome-web-store-listing.md:59` | "let ClipMark's on-device AI draft one for you … **(free, runs entirely in…)**" |

**Why it matters:** this is the inverse of the Active Recall bug fixed in #131 — it hides a free feature behind a perceived paywall, suppressing the free tier's appeal at the exact moment a visitor is evaluating it. It also makes the site argue with itself: a visitor who reads the homepage then the pricing page gets two different answers.

**Fix:** re-label the homepage section from `Pro Features` to `On-device AI · Free` and point its CTA somewhere other than `/upgrade`. Strike "(Pro tier)" / "(Pro tier only)" from the terms and privacy policy.

---

## C3 · Terms claims Pro "unlocks … spaced revisit" — revisit mode is free 🟠

**Location:** `webapp/app/(marketing)/terms/page.tsx:110`

**Evidence:** the revisit entry point (`extension/src/popup/side-panel.js:1911`) has no `checkPro()`. Its only gate is the shared free-tier review cap:

```js
document.getElementById('revisit-mode-btn').addEventListener('click', async () => {
  if (await isRecallBlockedForFreeTier()) { showUpgradeModal({ feature: 'More reviews this month', … }); return; }
```

Pro removes the **30-reviews-a-month cap**; it does not unlock the mode. `/faq:50` and `/upgrade` both state this correctly.

**Fix:** "Pro removes the free-tier caps (reviews, Anki exports, shared collections) and adds cloud sync, review reminders and Obsidian/Notion export."

---

## C4 · Three genuinely Pro-gated features are never advertised 🟡

Under-claiming, not deception — but it is lost upsell and it makes the `/upgrade` table look thinner than the product.

| Feature | Gate in code | On `/upgrade`? |
|---|---|---|
| Extended Notes | `extension/src/popup/dashboard.js:845-848` | ✗ |
| Saved Filters | `extension/src/popup/dashboard.js:2444-2445` | ✗ |
| Reading List export | `extension/src/popup/dashboard.js:1072-1073` | ✗ |

**Fix:** add all three to the `FEATURES` table in `webapp/app/(marketing)/upgrade/page.tsx`.

---

## C5 · Stale scaffold comment invites a wrong "fix" 🟡

**Location:** `webapp/app/components/GuaranteeLine.tsx:5-7`

> "the exact window is still undecided (Terms says 7 days, **code treats 14** — decision D1) … we ship a truthful, number-free line"

Both halves are now obsolete: the code enforces **7** (`upgrade/page.tsx:125` `daysSinceStart <= 7`; `upgrade/actions.ts:111` "Within the 7-day money-back window"), the terms say 7 (`terms/page.tsx:115`), and both call sites now pass `refundDays={7}`. There is no 14 anywhere.

**Why it matters:** an agent reading this comment would "resolve D1" against a discrepancy that no longer exists. **Fix:** delete the scaffold note.

---

## ✅ Claims that traced clean

Verified against code, not read for tone — worth protecting:

| Claim | Verified against |
|---|---|
| 25 recall cards · 30 reviews/mo · 1 Anki export/mo | `extension/src/usage-caps.js:22-25` |
| 10 free shared collections | `webapp/app/api/share/handler.ts:5` `FREE_SHARE_LIMIT = 10` |
| Review ladder 1/3/7 → doubling → capped at 60 | `extension/src/recall.js:8,13,63` |
| "Two hosts, that's the whole permission list" | `manifest.json` `host_permissions: ["*://www.youtube.com/*","https://clipmark.mithahara.com/*"]` |
| Cloud sync is Pro | `webapp/app/api/bookmarks/handler.ts:18` `isProUser` |
| Review reminders are Pro | `webapp/app/api/reminders/route.ts:9` `isProUser` |
| Anki/Obsidian/Notion/Reading-List export gating | `extension/src/popup/dashboard.js:1005,1028,1048,1072` |
| 7-day refund window | `upgrade/page.tsx:125`, `upgrade/actions.ts:111`, `terms:115` — all agree |
| Deep Search & Transcript Archiving marked `coming-soon` | `upgrade/page.tsx:30-31` — correctly not sold as shipped |
| "Post Insights" | `localGeneratePost` → `generateSocialPost`, wired at `side-panel.js:1951` |
| "Smart Summary" | `localSummarizeSnippet` / `localSummarizeBookmarks`, 3 reachable callers |
| Store listing "Smart tags" | manual `#tag` parsing + hash colouring — shipped, and correctly *not* described as AI |

---

# SEVERITY 1 — Dark mode: surfaces with no background or border

Rendered all 15 routes in dark and diffed **per-element computed styles against light**, plus measured each element's separation from whatever is behind it.

## D1 · ⭐ THE TWO CULPRITS: the plan CTA buttons are completely invisible 🔴

**These are the elements Ash saw.** Both render as bare floating text — no background, no border, no shadow.

| Element | Route(s) | Measured |
|---|---|---|
| `button.ctaBtn` — **"Go Pro Monthly"** | `/upgrade`, `/` (pricing preview) | bg `rgb(17,24,39)` on parent `rgb(17,24,39)` → **separation 1.000**, `border: 0px`, no shadow |
| `a.ctaBtn` — **"Get Lifetime Pro"** | `/upgrade`, `/` (pricing preview) | identical — **separation 1.000** |

→ 2 distinct controls × 2 routes = **4 rendered instances**.

**Source — `webapp/app/(marketing)/upgrade/upgrade.module.css:184-196`:**

```css
.ctaBtn {
  background: var(--gray-900);   /* line 188 */
  color: white;
  border: none;                  /* line 191 */
}
```

**Root cause.** `--gray-900` is a **raw ramp token**, defined once at `webapp/app/design-tokens.css:85` as `#111827` with **no dark override** — it is identical in both themes by design. But dark mode maps `--surface: var(--gray-900)` (`design-tokens.css:240`). So in dark the button's background becomes *exactly* the card surface behind it, and with `border: none` and no shadow there is nothing left to draw a button shape.

Only the middle plan survives because it uses `.ctaBtnPro` (`upgrade.module.css:203`) with `background: var(--accent-strong)` — teal, genuinely theme-aware. That is why **2 of 3** buttons vanish, matching the report exactly.

**Evidence:** [`PROOF-ctaBtn-dark.png`](./website-audit/PROOF-ctaBtn-dark.png) vs [`PROOF-ctaBtn-light.png`](./website-audit/PROOF-ctaBtn-light.png).

**Why it matters:** these are the **primary purchase controls**. In dark mode two of the three plans have no visible button — on the pricing page *and* on the homepage pricing preview. A dark-mode visitor cannot tell they are clickable.

**Fix:** in `upgrade.module.css:188`, replace `background: var(--gray-900)` with a theme-aware pairing — `var(--btn-secondary-bg)` already exists (`design-tokens.css:254`) and resolves to `--gray-800` in dark — or give `.ctaBtn` `border: 1px solid var(--border)`. Same for the `:hover` at line 199. **Effort: XS.**

## D2 · The same bug class elsewhere — full sweep 🟠

Every background that reaches for a raw ramp token, and so cannot respond to theme:

| File:line | Rule | Risk |
|---|---|---|
| `(marketing)/upgrade/upgrade.module.css:188,199` | `.ctaBtn`, `.ctaBtn:hover` | 🔴 **D1 — confirmed invisible** |
| `(marketing)/v/[shareId]/page.module.css:318,331` | share-page surfaces | 🟠 same pattern, unverified (dynamic route, not crawled) |
| `(marketing)/page.tsx:301,466,553,596,657` | deliberate dark slabs | 🟡 separation only **1.16** vs page in dark — very subtle, likely unintended |
| `(marketing)/affiliate/page.tsx:173,393` | dark panels | 🟡 same |
| `dashboard/**` (12 rules) | out of scope here | — flag for the dashboard owner |

**Fix:** extend `scripts/design-audit.mjs` with a rule that fails on `background: var(--gray-800|900)` outside a `[data-theme]` block. R1 ("one gray ramp") permits it and R9 ("dark completeness") only checks that theme-*sensitive* tokens have overrides — so a ramp token used as a background falls through both, which is exactly how D1 shipped past a 10/10 gate.

## D3 · Section banding collapses in dark 🟡

On `/faq`, `/switch-from-videosegments`, `/youtube-to-anki`, `/active-recall-youtube` and others, alternating `<section>` bands measure **separation 1.000** in dark — `rgb(10,10,15)` on `rgb(10,10,15)` — because the light-mode alternation (`#fff` vs `--gray-50`) maps to the same dark value. Tinted sections fare little better at **1.113**.

Not a defect, but the page rhythm that structures these long pages in light mode simply disappears in dark. **Fix:** give the alternate band a distinct dark step (`--surface` vs `--bg`), or add a hairline `--border` divider.

---

# SEVERITY 2 — Accessibility (WCAG 2.1 AA)

Measured across all 15 routes, both themes, both viewports.

| Criterion | Result |
|---|---|
| **1.4.3 Contrast** | ✅ **0 failures in light AND dark**, all 15 routes. The #128/#129/#134 sweeps worked. |
| **1.1.1 Alt text** | ✅ No `<img>` missing an `alt` attribute on any route. |
| **2.4.4 / links** | ✅ No dead in-page anchors; all internal links return 200. |
| **1.3.1 Heading order** | ⚠️ No skipped levels anywhere, but **3 routes have no `<h1>` at all** (below). |
| **2.5.5 Target size** | ⚠️ 3 nav controls under 44px on every route (below). |

## A1 · Three routes render no `<h1>` 🟠

`/affiliate`, `/feedback`, `/uninstall` — measured `h1count = 0`. Breaks the document outline for screen-reader users and wastes the primary on-page ranking signal. **Fix:** promote each page's visual title to `<h1>`.

## A2 · The new theme toggle is 42×30 — under the 44px minimum 🟠

**Location:** `webapp/app/components/ThemeToggle.tsx:17-19` — `padding: '6px 10px', fontSize: 16`.
Measured **42×30** on every route at 375px. Introduced by the dark-mode PR (#134). **Fix:** `min-width: 44px; min-height: 44px`.

## A3 · The mobile account icon is silently shrunk to 35.7px 🟠

**Location:** `webapp/app/globals.css:131-137` declares `width: 44px; height: 44px`, but computed style reports `width: 35.67px`, `flex-shrink: 1`.

It is a flex child of the nav row and gets compressed. Declared ≠ rendered — the rule looks correct in review and fails in the browser. **Fix:** add `flex-shrink: 0`. *(This is my control from #131; the declaration was right, the flex context defeated it.)*

## A4 · Standalone arrow links ~19–20px tall 🟡

`See what else Pro unlocks` (228×20), `Explore Pro Features` (192×20), `Compare all plans` (158×19), `Read the full FAQ` (151×19) on `/`; `← Affiliate Program` (130×16) on `/affiliate/terms`. These are standalone controls, not inline prose links, so the 2.5.5 inline exception does not apply. **Fix:** `padding: 12px 0`.

---

# SEVERITY 2 — UX, conversion, consistency

## U1 · The AI section sends warm traffic to a paywall for a free feature 🟠
Compounding C2: the section's only CTA (`page.tsx:717`) is "Explore Pro Features → `/upgrade`". A reader who just learned about on-device AI — free, and a genuine differentiator — is routed to a price. **Fix:** point it at the install CTA, and say "free".

## U2 · "Post Insights" and "Smart Summary" are dimmed 🟡
`page.tsx:665-667` renders two of three AI cards with `active: false` (5% opacity difference, muted text). Both ship and are reachable. The styling reads as "coming soon" for features that exist today. **Fix:** drop `active` once `Auto Tagging` is removed — the remaining two are both live.

## U3 · Social proof still absent sitewide 🟡
Carried over from `HOMEPAGE-AUDIT.md` F7 and unchanged: the founder quote at `page.tsx:969` is still anonymous ("— Creator of ClipMark"). Store listing has ~0 reviews. **Fix:** sign it with a real name and link.

## U4 · Cross-surface consistency ledger

| Claim | Homepage | `/upgrade` | `/faq` | Privacy | Terms | Store | Code |
|---|---|---|---|---|---|---|---|
| On-device AI is free | ❌ Pro | ✅ | ✅ | ❌ Pro | ❌ Pro | ✅ | **free** |
| AI suggests tags | ❌ claims | — | — | ❌ claims | ❌ claims | ⚠️ video script | **unshipped** |
| Active Recall free caps | ✅ | ✅ | ✅ | — | — | ✅ | ✅ |
| Notion/Obsidian = export, not integration | ✅ | ✅ | ✅ | — | — | ✅ | ✅ |
| Refund window | ✅ 7d | ✅ 7d | — | — | ✅ 7d | — | ✅ 7d |

---

# SEVERITY 2 — Target-market fit (US / UK / AU)

ClipMark stays globally available; the deliberate target is the Tier-1 English-speaking markets. Assessed against that. Several gaps here are cheap to close and one is a genuine compliance exposure for UK buyers.

## M1 · Prices render a bare `$` with no currency anywhere on the site 🟠

**Evidence.** The price type carries no currency at all — `(marketing)/upgrade/pricing.ts`:

```ts
export interface ProductPrices { monthly: string; annual: string; lifetime: string; }
```

Dodo returns a currency, but `extractCentPrice` (`upgrade/actions.ts:34`) reads only the number and `centsToDisplay` (`:38`) divides by 100 into a variable literally named `dollars`. The symbol is then hardcoded in JSX:

| Location | Renders |
|---|---|
| `upgrade/PlanCards.tsx:129` | `<span className={styles.amount}>${prices[plan.priceKey]}</span>` |
| `upgrade/PlanCards.tsx:134` | "lock in lifetime access at `${prices.lifetime}`" |
| `(marketing)/page.tsx:873` | "from **`${prices.monthly}`/mo**" |
| `affiliate/page.tsx:128-130` | `$${prices.monthly} / mo` etc. |

**A grep for `USD`/`GBP`/`AUD`/`EUR` across the entire marketing tree returns exactly one hit** — and it is not on a pricing page:

```
(marketing)/affiliate/terms/page.tsx:134   "A minimum balance of $25 USD …"
```

So the site is explicit about currency when paying *affiliates*, and silent about it when charging *customers*.

**Why it matters:** `$7.99` is unambiguous to nobody outside the US. An Australian reader defaults to AUD (a ~35% real-price difference); a UK reader knows it is foreign but not what they will be charged. Currency ambiguity at the price is a well-known checkout drop-off point, and it is the first number a Tier-1 buyer evaluates.

**Fix (XS):** render `$7.99 USD` — add a `currency` field to `ProductPrices`, populate it from the Dodo price object instead of discarding it, and render `{price} {currency}`. One line of JSX per call site.

## M2 · "taxes included" needs verifying against UK VAT and AU GST 🟠

**Location:** `webapp/app/components/GuaranteeLine.tsx:32`, shown directly under the checkout CTAs on `/` and `/upgrade`:

> "7-day money-back guarantee · **taxes included** · no hidden fees · cancel anytime"

**What is verifiable from code:** the checkout session (`upgrade/actions.ts:270-287`) passes `product_cart`, `customer`, an optional `discount_code`, `metadata` and `return_url` — **no `billing_currency`, no country, no tax flag.** Dodo is the Merchant of Record, so it determines tax presentation on its side.

**What I could not verify, and did not test:** whether Dodo presents UK VAT (20%) and AU GST (10%) as *inclusive* of the displayed price or *added at checkout*. Confirming it means completing a live checkout, which I did not do.

**Why it matters:** if Dodo adds tax on top, a UK buyer sees `$7.99`, is promised "taxes included", and is then charged ~`$9.59`. That is the single highest-risk claim on the site for these markets — it sits under the buy button and it is a price promise.

**Fix:** check the Dodo dashboard's tax configuration for GB and AU. If tax is added at checkout, change the line to "taxes calculated at checkout". **Do not leave it unverified before launch.**

## M3 · Mixed US and UK spelling, including inside single pages 🟡

Swept the **rendered prose** of all 15 routes (not source, to avoid CSS `color` noise):

| Word | UK form used at | US form used at |
|---|---|---|
| summarise/summarize | `faq:10, 57, 58` ("summariser"), `active-recall-youtube:156`, `youtube-flashcards:141` | `faq:14` (own SEO keywords: "clipmark vs **summarizer**") |
| organise/organize | `faq:41` | `page.tsx:102, 111, 765`, `terms:81` |
| licence/license | `affiliate/terms:212` | `affiliate/terms:111`, `terms:127` |
| colour/color | `faq:42`, `spaced-repetition-youtube:95` | — |
| personalise | `affiliate:90`, `affiliate/terms:90` | — |
| cancelled | `affiliate:76, 304`, `affiliate/terms:145` | — |

Two of these conflict **within one file**: `/faq` says "summariser" in its visible answers and "summarizer" in its own keyword list, and `/affiliate/terms` uses "licence" (:212) and "license" (:111) in the same legal document.

**Why it matters:** less about correctness than about signalling. The US is the largest of the three markets and US readers read `-ise` as foreign; mixed spelling in a legal page reads unpolished. The `/faq` case is also a search problem — US and AU searchers type "summarizer".

**Fix (S):** pick **US English** as the house standard (largest market, and it matches the store listing and the `.edu` discount already in place), normalise the ~10 occurrences above, and note the choice in `CLAUDE.md` conventions so it stops drifting.

## M4 · The student discount is US-only by construction 🟠

**Location:** `webapp/app/(marketing)/page.tsx:57`

> "Yes! We support students and educators. Contact our support team with your **.edu** email for a special discount code."

`.edu` is a US-restricted TLD. UK universities issue `.ac.uk`; Australian ones `.edu.au`. A grep across the marketing tree finds **`.edu` and no `.ac.uk` or `.edu.au` anywhere**.

So a student at Manchester or Melbourne — squarely in the target market, and exactly the retention/exam audience the product is built for — reads the offer, checks their address, and concludes it is not for them.

**Fix (XS):** "…with your university email address (`.edu`, `.ac.uk`, `.edu.au` or equivalent)". Purely a copy change; the discount is issued by hand anyway.

## M5 · The store listing has a targeted beachhead; the website does not 🟠

`docs/gtm/chrome-web-store-listing.md:4` states the positioning explicitly:

> "beachhead is **USMLE/IMG med students** … but copy stays usable for any serious YouTube learner"

and `:100` names "USMLE Step 1/Step 2 students and IMGs".

The **website names an audience exactly twice**: the `.edu` discount (`page.tsx:57`) and one clause in the Serious Learner card — "so what you study actually sticks **by exam day**" (`page.tsx:631`). The homepage personas are *Builder / Founder / Serious Learner* — occupational and region-neutral.

**Why it matters:** the acquisition surface (store listing) is aimed at a concrete, high-intent, high-purchasing-power US segment, and the conversion surface (website) is not aimed at anyone in particular. A visitor arriving from that listing lands on generic productivity framing. No page names a course, exam, credential or education system in any of the three markets.

**Fix (M):** carry one concrete anchor per market into the Serious Learner card and the retention pages — US: USMLE / MCAT / AP; UK: A-levels, undergraduate lecture capture; AU: ATAR / university lectures. One clause each is enough; it does not require new pages and does not narrow the product.

## M6 · UK GDPR is not covered — the policy addresses "EU/EEA" only 🟠

**Location:** `webapp/app/(marketing)/privacy/page.tsx:152`

> "If you are located in the **EU/EEA**, you also have rights under the GDPR, including the right to data portability and to lodge a complaint with a supervisory authority."

Post-Brexit the UK is neither EU nor EEA, and UK GDPR is a separate regime with its own regulator. A UK reader — one of the three target markets — finds no statement that covers them. Verified absent from the policy: **"UK GDPR", "ICO", "data controller", "legal basis", "legitimate interest", "international transfer", "Standard Contractual Clauses"**.

*(I initially miscounted "ICO" as present — that was substring noise from the word "icon". It does not appear.)*

The rights list (`:140-150`) offers Access, Delete, Export and Correction. GDPR/UK GDPR also require **object**, **restrict processing**, and **withdraw consent**.

Also material for these markets: account data sits with Supabase and Vercel, and payments with Dodo, so UK/EU personal data leaves the UK/EEA. The policy names the processors (`:114-117`) but states **no transfer mechanism**.

**Fix (S):** extend `:152` to "If you are in the UK, EU or EEA…", name the ICO alongside EU supervisory authorities, add object/restrict/withdraw to the rights list, name the data controller with a contact, and add one line on international transfers. All disclosure, no engineering.

## M7 · The affiliate cookie is undisclosed and has no consent path 🟠

**Evidence.** `webapp/app/r/[code]/route.ts:38-44` sets a **30-day marketing attribution cookie**:

```ts
response.cookies.set('clipmark_ref', code, {
  httpOnly: true, sameSite: 'lax', path: '/',
  maxAge: 60 * 60 * 24 * 30,          // 30 days
  secure: process.env.NODE_ENV === 'production',
});
```

It is documented in `/affiliate/terms:94` and `:200` — for *affiliates*. It is **not mentioned in the privacy policy at all**. The policy's only cookie statement (`privacy/page.tsx:117`) covers Vercel Analytics and concludes:

> "It sets no cookies … so there is **nothing here to consent to or opt out of**."

That is accurate for Vercel Analytics (`SiteAnalytics.tsx:6` reasons the same way, correctly), but the conclusion does not extend to `clipmark_ref`, and no consent banner exists anywhere in `webapp/app`.

**Why it matters:** the cookie is set on a redirect *before* the visitor sees any page, and attribution/marketing cookies are not "strictly necessary" under UK PECR / EU ePrivacy — they need prior consent, independent of GDPR. Every UK visitor arriving through an affiliate link is currently in that position. The implementation itself is careful (httpOnly, SameSite=Lax, Secure, first-click only); the gap is disclosure and consent, not engineering.

**Fix (S):** disclose `clipmark_ref` in the privacy policy — purpose, 30-day lifetime, how to clear it — and gate the `set` in `r/[code]/route.ts` behind a lightweight consent interstitial for UK/EU traffic, or drop the cookie in favour of a server-side attribution parameter. Worth a lawyer's five minutes, given affiliates are an intended acquisition channel.

## M8 · No legal entity, address or named jurisdiction 🟡

**Location:** `webapp/app/(marketing)/terms/page.tsx:186`

> "These Terms are governed by the laws of **the jurisdiction in which ClipMark is incorporated**"

The jurisdiction is never named, and no entity name or trading address appears anywhere on the site.

**Why it matters:** UK and EU consumer law requires a trader's identity and geographic address to be given before a distance contract; GDPR separately requires the controller's identity. Beyond compliance it is a plain trust signal — a US or UK buyer entering card details on a new product looks for who they are contracting with.

**Fix (XS):** name the entity and jurisdiction in the terms and the footer.

## M9 · California (CCPA/CPRA) — not currently required, cheap to pre-empt 🟢

Verified absent: **"CCPA", "CPRA", "California"**. The policy does say, at `:135`:

> "We do not sell your data to third parties. We do not use your data for advertising."

**Being accurate rather than alarmist:** CCPA/CPRA applies above thresholds (roughly $25M revenue, 100k+ California consumers, or 50%+ revenue from selling personal information). A pre-launch product meets none of them, so **this is not a present violation and I am not flagging it as one.** The statement above is also the substantive thing CCPA cares about, and it is already true.

**Fix (XS, optional):** a short "Your California privacy rights" paragraph restating no-sale/no-share plus the deletion route. It costs nothing, reads as competence to US buyers, and removes the work later.

## M10 · No trust signal that reads as local to any of the three markets 🟡

Extending U3 with the regional lens. The site carries: no named founder (`page.tsx:969` — "— Creator of ClipMark"), no company entity (M8), no currency (M1), no jurisdiction, no support-hours or timezone expectation, and — per the brief — ~0 store reviews. Support is a bare `mailto:`.

For a first-time Tier-1 buyer the page offers nothing that anchors the product to a real, reachable operator.

**Fix (S), all honest and available pre-launch:** sign the founder quote with a real name and link; name the entity and jurisdiction; state currency; state a support response expectation ("we reply within one business day"); keep the free-tier numbers prominent — they are already the strongest trust asset on the site.

---

### Target-market summary

| # | Gap | Market hit hardest | Severity | Effort |
|---|---|---|---|---|
| **M1** | Bare `$`, no currency anywhere | AU, UK | 🟠 | XS |
| **M2** | "taxes included" unverified vs VAT/GST | UK, AU | 🟠 | XS + verify |
| **M4** | `.edu`-only student discount | UK, AU | 🟠 | XS |
| **M5** | Website has no audience anchor; listing does | all three | 🟠 | M |
| **M6** | UK GDPR uncovered; policy says "EU/EEA" | UK | 🟠 | S |
| **M7** | Affiliate cookie undisclosed, no consent | UK | 🟠 | S |
| **M3** | Mixed US/UK spelling, incl. within one page | US | 🟡 | S |
| **M8** | No entity, address or named jurisdiction | all three | 🟡 | XS |
| **M10** | No locally-legible trust signal | all three | 🟡 | S |
| **M9** | No California section (not yet required) | US | 🟢 | XS |

**Cheapest high-value cut:** M1 + M4 + M8 are all copy, under an hour together, and they remove the three most concrete "this isn't for me / who am I buying from" objections. M2 needs a Dodo dashboard check before launch. M6 + M7 are worth a lawyer's brief review since they concern a live acquisition channel.

---

# Checked and clean (non-findings)

Recording these so nobody re-spends the time:

- **Metadata/OG** — all 15 routes have title, description, `og:title`, `og:image`, canonical; no title over 62 chars.
- **Contrast** — 0 AA failures in either theme.
- **Broken links** — none; all internal links 200, no dead anchors. External links resolve to the real CWS listing and legitimate policy pages.
- **Horizontal overflow** — none at 375px on any route.
- **`/_vercel/insights/script.js` 404** in the local console is a **local-only artifact** — production returns **200**. Not a bug.
- **`--gray-900` in `dashboard/**`** — 12 more rules share D1's pattern, but the dashboard is outside this audit's scope.

---

# Priority summary

| # | Finding | Severity | Effort |
|---|---|---|---|
| **C1** | "Auto Tagging" advertised in 8 places, zero production callers | 🔴 | S |
| **C2** | On-device AI sold as Pro in 5 places; it is free | 🔴 | S |
| **D1** | Two plan CTA buttons invisible in dark (4 instances) | 🔴 | XS |
| **C3** | Terms claims Pro unlocks "spaced revisit" — it is free | 🟠 | XS |
| **D2** | Raw-ramp backgrounds elsewhere + audit-gate blind spot | 🟠 | S |
| **A1** | 3 routes with no `<h1>` | 🟠 | XS |
| **A2** | Theme toggle 42×30 | 🟠 | XS |
| **A3** | Account icon shrunk to 35.7px by flex | 🟠 | XS |
| **U1** | AI section CTA routes to paywall for a free feature | 🟠 | XS |
| **C4** | 3 Pro features never advertised | 🟡 | XS |
| **C5** | Stale `GuaranteeLine` scaffold comment | 🟡 | XS |
| **D3** | Section banding collapses in dark | 🟡 | S |
| **A4** | Standalone arrow links ~19px | 🟡 | XS |
| **U2** | Shipped AI features styled as inactive | 🟡 | XS |
| **U3** | Anonymous founder quote, no social proof | 🟡 | S |
| **M1** | Prices show a bare `$` — no currency anywhere | 🟠 | XS |
| **M2** | "taxes included" unverified against UK VAT / AU GST | 🟠 | XS + verify |
| **M4** | Student discount is `.edu`-only (excludes UK/AU) | 🟠 | XS |
| **M5** | Website has no audience anchor; store listing does | 🟠 | M |
| **M6** | UK GDPR uncovered — policy addresses "EU/EEA" only | 🟠 | S |
| **M7** | Affiliate cookie undisclosed, no consent path (UK) | 🟠 | S |
| **M3** | Mixed US/UK spelling, incl. within single pages | 🟡 | S |
| **M8** | No legal entity, address or named jurisdiction | 🟡 | XS |
| **M10** | No locally-legible trust signal for the three markets | 🟡 | S |
| **M9** | No California section (not yet legally required) | 🟢 | XS |

**Suggested order:** D1 + A2 + A3 (about an hour, all CSS) → C1 + C2 + C3 (copy, but touches legal documents, so review carefully) → D2 gate extension → the rest.

---

## Appendix — reproduction

Rendered from a production build (`next build` + `next start`) served out of an isolated worktree at `a795d01`, cwd-verified. Dark mode was reached through `prefers-color-scheme` (Playwright `colorScheme: 'dark'`), which is now the real user path since #134 wired OS detection plus a mounted toggle — dark-mode defects are **user-visible today**, not latent as they were at the previous audit.

The dark-surface detector diffs per-element computed styles between the two themes using a structural DOM path as the key, then computes each element's luminance-contrast separation from its nearest opaque ancestor. An element is flagged when it separates in light (background, border or shadow) and resolves to **separation < 1.06 with no visible border and no shadow** in dark.

Screenshots in [`docs/gtm/website-audit/`](./website-audit/).
