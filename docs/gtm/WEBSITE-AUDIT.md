# ClipMark website audit — claims, dark mode, UX, a11y

**Date:** 2026-08-16 · **Baseline:** `origin/main` @ `a795d01` · **Scope:** all 15 static marketing routes + the Chrome Web Store listing copy
**Method:** every route rendered headlessly (Playwright/Chromium, sandbox — not a real browser profile) at **1280×900** and **375×812**, in **light and dark**, from a production `next build` served out of an isolated worktree. Every advertised claim was treated as a **hypothesis** and traced to shipping, user-reachable code.

> **AUDIT ONLY.** No product code was changed. Everything below is a finding plus a proposed fix.

---

## Verdict

Two of the four surfaces are excellent. **`/faq` and the Chrome Web Store listing are accurate** — they correctly say on-device AI is free, refuse to call a CSV an integration, and label frame capture as unshipped. `/upgrade` is also correct, including `coming-soon` markers for genuinely unbuilt features.

The failures are concentrated in **the homepage AI section, the privacy policy, and the terms of service** — and they are the same two bugs repeated across surfaces:

1. **A feature that does not exist is advertised in 8 places**, including JSON-LD, the privacy policy and the terms.
2. **On-device AI is sold as Pro in 5 places** when it is free for everyone — contradicted by `/upgrade`, `/faq`, the store listing, *and* a comment in the shipping code.

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

**Suggested order:** D1 + A2 + A3 (about an hour, all CSS) → C1 + C2 + C3 (copy, but touches legal documents, so review carefully) → D2 gate extension → the rest.

---

## Appendix — reproduction

Rendered from a production build (`next build` + `next start`) served out of an isolated worktree at `a795d01`, cwd-verified. Dark mode was reached through `prefers-color-scheme` (Playwright `colorScheme: 'dark'`), which is now the real user path since #134 wired OS detection plus a mounted toggle — dark-mode defects are **user-visible today**, not latent as they were at the previous audit.

The dark-surface detector diffs per-element computed styles between the two themes using a structural DOM path as the key, then computes each element's luminance-contrast separation from its nearest opaque ancestor. An element is flagged when it separates in light (background, border or shadow) and resolves to **separation < 1.06 with no visible border and no shadow** in dark.

Screenshots in [`docs/gtm/website-audit/`](./website-audit/).
