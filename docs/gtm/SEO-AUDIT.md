# Clipmark — SEO Audit

**Date:** 2026-08-06
**Scope:** `webapp/` (Next.js 14 App Router marketing site + app) at `clipmark.mithahara.com`, grounded in repo source (`webapp/app/**`) cross-checked against the live site.
**Status:** Audit and recommendations only — no site code, metadata, or content was changed as part of this task.

> **✅ Update (2026-08-06):** two of the issues below have since been fixed and deployed to production in [PR #82](https://github.com/agarwalshashwat/clipmark/pull/82) — the **per-page canonical bug** (§1.1) and the **fabricated `aggregateRating`** (§1.4). Both are verified fixed on the live site and are annotated inline below. **Everything else in this audit still stands as written**, including §1.2 (missing titles/descriptions) and the `og:url` half of §1.1, which #82 did not address. Findings are otherwise preserved as originally written for the record.

## Executive summary

The technical foundation is better than it looks at a glance — there's a real sitemap, robots.txt, per-page metadata on most pages, and genuinely good `HowTo` + `FAQPage` JSON-LD on the homepage with copy that matches what's visibly on the page. That's not the norm for a pre-launch product and it's worth preserving.

But three concrete bugs are actively suppressing indexation and one is a real risk (**items 1 and 2 have since been fixed by PR #82** — see the update note above; item 3 remains open):

1. ~~**Every non-homepage page's canonical tag points at the homepage**~~ — **✅ Resolved by PR #82 (merged, deployed).** As originally found: confirmed live on `/signin`, `/upgrade`, `/affiliate`, `/privacy`, `/terms`, telling Google those pages were duplicates and to index the homepage instead, leaving the affiliate program page effectively invisible to search. Each page now sets its own canonical; see §1.1. (The related `og:url` inheritance on `/affiliate`, also described in §1.1, is **still open**.)
2. ~~**The homepage ships a hardcoded `aggregateRating` of 4.9★ / 1,250 reviews**~~ — **✅ Resolved by PR #82 (merged, deployed).** As originally found: shipped in the `SoftwareApplication` structured data on every single page, with no visible review count anywhere on the site and no launched review base yet — a sitewide structured-data risk, not a one-page cosmetic issue. The `aggregateRating` object has been removed outright; see §1.4.
3. **Zero content anywhere on the site targets the USMLE/IMG "revise & remember" wedge** that Clipmark's own go-to-market docs (`docs/gtm/chrome-web-store-listing.md`) name as the beachhead. Meanwhile at least three direct competitors (RemNote, FlashRecall, StudyCards AI) are actively running blog/landing-page content against exactly those search terms today.

Overall assessment: **needs work, not broken** — the fixes in priority 1–2 are small, targeted, and would very plausibly move the needle by themselves before any content investment.

---

## 1. Technical SEO

### What exists (source-grounded)

| Item | Status | Where |
|---|---|---|
| `robots.txt` | ✅ present, generated | [webapp/app/robots.ts](../../webapp/app/robots.ts) |
| `sitemap.xml` | ✅ present, dynamic (DB-backed) | [webapp/app/sitemap.ts](../../webapp/app/sitemap.ts) |
| Per-page `<title>`/description | ⚠️ partial — 3 of 7 public pages have none | see §1.2 |
| Canonical tags | ✅ **fixed by PR #82** (was: ❌ broken on 5 of 6 non-homepage pages) | see §1.1 |
| Open Graph / Twitter cards | ⚠️ present but stale/generic on homepage | see §1.3 |
| JSON-LD structured data | ✅ `HowTo` + `FAQPage` are strong; `SoftwareApplication` rating risk **fixed by PR #82** | see §1.4 |
| Heading hierarchy | ✅ single H1 → H2 → H3 on homepage | [webapp/app/(marketing)/page.tsx](../../webapp/app/(marketing)/page.tsx) |
| Image alt text | ✅ present and descriptive on the two product screenshots | page.tsx:401 |
| HTTPS / security headers | ✅ HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options | [webapp/next.config.mjs](../../webapp/next.config.mjs) |
| Google Search Console verification | ✅ `google-site-verification` meta present and live | webapp/app/layout.tsx:44 |
| CSP | ❌ none on main routes (see §1.5) | next.config.mjs |

### 1.1 Canonical tags point every page at the homepage (Critical) — ✅ Resolved by PR #82

> **✅ Resolved by [PR #82](https://github.com/agarwalshashwat/clipmark/pull/82) (merged, deployed).** Each affected page now sets its own `alternates.canonical`, and the root layout's blanket `canonical: '/'` was removed. Verified live: `/signin`, `/upgrade`, `/affiliate`, `/privacy`, and `/terms` each return their own self-referential canonical. `/affiliate/terms` and `/embed/[shareId]` were fixed in the same PR.
>
> **⚠️ Still open from this section:** the `og:url` inheritance described below. `/affiliate` continues to emit `og:url` = the homepage, because #82 added `alternates.canonical` but no `openGraph` override. The original finding below is preserved as written.

`webapp/app/layout.tsx:40-42` sets:

```ts
alternates: { canonical: '/' },
```

on the **root** layout. None of `privacy/page.tsx`, `terms/page.tsx`, `signin/page.tsx`, `upgrade/page.tsx`, or `affiliate/page.tsx` override `alternates.canonical` in their own `metadata` exports, so Next.js metadata resolution falls back to the root value on every one of them. Confirmed live via direct fetch:

```
/signin    → <link rel="canonical" href="https://clipmark.mithahara.com"/>
/upgrade   → <link rel="canonical" href="https://clipmark.mithahara.com"/>
/affiliate → <link rel="canonical" href="https://clipmark.mithahara.com"/>
/privacy   → <link rel="canonical" href="https://clipmark.mithahara.com"/>
/terms     → <link rel="canonical" href="https://clipmark.mithahara.com"/>
```

`/affiliate` also inherits `og:url` = the homepage for the same reason (root layout's `openGraph.url`, [webapp/app/layout.tsx:50](../../webapp/app/layout.tsx), isn't overridden in [affiliate/page.tsx](../../webapp/app/(marketing)/affiliate/page.tsx)).

**Effect:** Google is being explicitly told these 5 pages are duplicates of the homepage and to consolidate ranking signals there instead. In practice this means `/affiliate` — a page built specifically to attract inbound links from creators — is telling search engines to ignore it. This is very likely why none of these pages show up independently in search today.

**Fix:** each page's `metadata` export needs its own `alternates: { canonical: '/affiliate' }` (etc.), matching what [webapp/app/(marketing)/v/[shareId]/page.tsx:77](<../../webapp/app/(marketing)/v/[shareId]/page.tsx>) already does correctly for shared collections. That file is the reference implementation to copy from.

### 1.2 Two real pages have no unique title or description

`app/(marketing)/signin/page.tsx` and `app/(marketing)/upgrade/page.tsx` have **no `metadata` export at all**, so both silently inherit the root layout's fallback and render, verbatim:

```
<title>Clipmark — YouTube Timestamp Bookmarks</title>
<meta name="description" content="Bookmark YouTube moments, get AI summaries, and revisit key insights — free Chrome extension for students, developers, and creators."/>
```

`/upgrade` is the pricing page — "clipmark pricing" / "clipmark cost" is a real commercial-intent query with no page on the site actually targeting it (compounded by §1.6 below, since `/upgrade` is also disallowed in `robots.txt`). `/signin` doesn't need to rank, but shipping a duplicate title tag site-wide is still worth closing off.

### 1.3 Homepage `<title>` and its own Open Graph tags tell different stories

The homepage's page-level metadata ([page.tsx:12-20](<../../webapp/app/(marketing)/page.tsx>)) sets a strong, on-wedge title/description:

```
<title>Clipmark — Turn YouTube Into Video Flashcards You Remember</title>
<meta name="description" content="Bookmark the moments that matter, then let Active Recall quiz you on them before replaying the clip. Spaced review, local AI notes, and one-click export to Anki."/>
```

But because the homepage doesn't set its own `openGraph`/`twitter` blocks, Next.js metadata merging leaves those inherited from the root layout ([layout.tsx:46-66](../../webapp/app/layout.tsx)) unchanged. Confirmed live — the actual rendered tags are:

```
<meta property="og:title" content="Clipmark — YouTube Timestamp Bookmarks"/>
<meta property="og:description" content="Bookmark YouTube moments, get AI summaries, and revisit key insights. Free Chrome extension."/>
<meta name="twitter:title" content="Clipmark — YouTube Timestamp Bookmarks"/>
```

Anyone who shares the homepage link on Twitter, Slack, or LinkedIn sees the generic, weaker copy — not the sharper "video flashcards" / "Active Recall" / "Anki export" positioning that's actually in the `<title>` and ranks in search. Every social share of the homepage link is under-selling the product relative to what Google itself sees.

### 1.4 Structured data: two strong wins, one real risk

**Strong (keep and build on):**
- `HowTo` JSON-LD ([page.tsx:86-108](<../../webapp/app/(marketing)/page.tsx>)) — 3-step "Curator's Journey," matches visible content.
- `FAQPage` JSON-LD ([page.tsx:118-129](<../../webapp/app/(marketing)/page.tsx>), data at [page.tsx:22-51](<../../webapp/app/(marketing)/page.tsx>)) — 7 real, substantive FAQs, including "Does Clipmark replace Anki?" which is exactly the disambiguating question a med-student searcher has. This is a legitimate asset.
- `/v/[shareId]` collection pages have their own dynamic per-page metadata, canonical, and a real dynamic OG image via [webapp/app/api/og/route.tsx](../../webapp/app/api/og/route.tsx) — this is well built and a good pattern to reuse.

**Risk — `aggregateRating` in the sitewide `SoftwareApplication` schema — ✅ Resolved by PR #82:**

> **✅ Resolved by [PR #82](https://github.com/agarwalshashwat/clipmark/pull/82) (merged, deployed).** The entire `aggregateRating` object was removed from the `SoftwareApplication` JSON-LD in `webapp/app/layout.tsx`. Verified live: the homepage no longer emits `aggregateRating` in any form. The `HowTo` and `FAQPage` JSON-LD were left intact, as recommended. The original finding is preserved below for the record.

[webapp/app/layout.tsx:78-94](../../webapp/app/layout.tsx) shipped this on **every page** of the site (since removed):

```json
{
  "@type": "SoftwareApplication",
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.9", "reviewCount": "1250" }
}
```

Confirmed shipped as-is on the live homepage. The live page itself shows exactly one testimonial quote and no visible rating widget, star count, or review total anywhere. Per project context, Clipmark is pre-launch with no review base yet — a hardcoded `reviewCount: 1250` cannot correspond to real, verifiable reviews.

Google's [structured data guidelines for review snippets](https://developers.google.com/search/docs/appearance/structured-data/review-snippet) require ratings to be genuine, sourced from actual users, and **visible on the page they're marked up on**. Shipping fabricated/placeholder numbers in a sitewide script tag is the kind of thing that draws a manual action suppressing rich results — and because it's sitewide, a penalty here doesn't cost one page, it costs all of them. This is disproportionate risk for one hardcoded object and should be treated as higher priority than any other item in this audit.

### 1.5 CSP gap — noted per the existing internal test-strategy flag

`docs/TEST-STRATEGY.md:436-459` already flags that the main webapp ships no `Content-Security-Policy`; only `/embed/*` gets an intentionally permissive `frame-ancestors *` override so shared collections can be iframed elsewhere ([next.config.mjs:36-40](../../webapp/next.config.mjs)). This isn't a ranking factor directly, but it's SEO-adjacent in two ways worth naming since it was raised in scope:
- A missing CSP is the classic enabler for injected hidden-link/cloaking spam via XSS — which is exactly what triggers a Search Console **Security Issues** manual action (distinct from, and worse than, a quality one).
- If any injected content ever trips Safe Browsing, the resulting browser interstitial warning kills 100% of organic click-through overnight, independent of rankings.

Not urgent while traffic is near zero pre-launch, but this is worth doing before there's real backlink equity and traffic worth protecting. (No code change is being made here — see `docs/TEST-STRATEGY.md` §4.2 for the existing recommendation to roll out `Content-Security-Policy-Report-Only` first.)

### 1.6 Sitemap / robots coverage gaps

- `sitemap.ts` lists only 10 URLs total: homepage, `/signin`, `/privacy`, `/terms`, and 6 `/v/{uuid}` shared-collection pages. **`/affiliate` is missing** despite having its own real content and metadata — it should be added as a static entry alongside `/signin`/`/privacy`/`/terms`.
- `/upgrade` (pricing) is deliberately `Disallow`'d in [robots.ts:11](../../webapp/app/robots.ts) — reasonable if it's meant to stay unindexed in favor of the homepage's `#pricing` section, but combine that with §1.1/§1.2 and there is currently **no independently indexable page serving "clipmark pricing"** at all; the homepage's embedded pricing section is the only indexed pricing content.
- The generated `Sitemap:` line in the live `robots.txt` has a **double slash**: `https://clipmark.mithahara.com//sitemap.xml`. Same root cause shows up in the live `og:image`/`twitter:image` URLs: `https://clipmark.mithahara.com//clipmark-logo.png`. `APP_URL` in [webapp/app/lib/constants.ts:2](../../webapp/app/lib/constants.ts) has no trailing slash by default, and neither does `.env.example:21`, so the production `NEXT_PUBLIC_APP_URL` env var on Vercel almost certainly has a trailing slash that the local defaults don't. Most crawlers normalize double slashes, but some social link-preview scrapers don't, silently breaking the share-card image. **Two fixes, one owner action:** strip the trailing slash from the Vercel env var (owner action, needs a redeploy per the `NEXT_PUBLIC_*` build-time-inlining behavior noted in `CLAUDE.md`), and defensively normalize `APP_URL` in `constants.ts` so this class of bug can't recur regardless of the env var's value.
- `/embed/[shareId]` pages are not `Disallow`'d and are not noindex'd, but they're also not linked from anywhere public and duplicate `/v/[shareId]`'s content for iframe use — low priority, but worth a `Disallow: /embed/` line to avoid thin/duplicate-content dilution once the site has more pages competing for crawl budget.
- Unrelated to SEO directly but discovered during live checks: `/embed/{validId}` currently returns **HTTP 500** for a collection ID that resolves fine at the corresponding `/v/{validId}` (both query the same `collections` table by ID in [embed/[shareId]/page.tsx](<../../webapp/app/embed/[shareId]/page.tsx>) and [v/[shareId]/page.tsx](<../../webapp/app/(marketing)/v/[shareId]/page.tsx>) respectively). Flagging for engineering — 5xx responses that Search Console discovers (e.g., via referrer headers from wherever a collection is embedded) still hurt crawl-health signals even on unlinked pages.

---

## 2. On-page / content audit

| Page | Title tag | Meta description | H1 | Assessment |
|---|---|---|---|---|
| `/` (homepage) | "Clipmark — Turn YouTube Into Video Flashcards You Remember" | Active Recall / spaced review / Anki export, on-wedge | "Stop Forgetting What You Watch — Your YouTube Second Brain." | Good page-level copy, but H1 pivots to generic "second brain" framing that doesn't reinforce the title's "flashcards"/"Active Recall" keywords — see below. |
| `/affiliate` | "Affiliate Program — Clipmark" | Clear, has a real hook (30% revenue share) | present | Solid page, was undermined by the canonical bug (§1.1) suppressing it from search entirely — ✅ that bug is fixed by PR #82. |
| `/privacy`, `/terms` | Present, correct, low-priority by design | — | present | Fine as-is; these don't need SEO investment. |
| `/signin` | **Inherited/duplicate** (§1.2) | **Inherited/duplicate** | present | No SEO value expected here regardless — low priority to fix beyond the shared root-cause fix. |
| `/upgrade` | **Inherited/duplicate** (§1.2) | **Inherited/duplicate** | present | The one page where this actually matters — it's the pricing page and currently has zero unique targeting, on top of being `robots.txt`-disallowed. |

### Keyword-focus mismatch on the homepage

The `<title>`/meta description target "video flashcards," "Active Recall," "Anki export" — strong, differentiated terms. The **H1** and hero subhead instead lead with "Second Brain for YouTube," and the three audience cards further down are labeled "For the Builder / For the Founder / For the Serious Learner" ([page.tsx:521-551](<../../webapp/app/(marketing)/page.tsx>)) — broad productivity-persona language with **zero mention of USMLE, Step 1, medical school, IMG, or the specific named resources this audience already trusts and searches around** (AnKing, Boards and Beyond, Sketchy, Pathoma). "Serious Learner" is the closest hook to the documented med/exam beachhead, but it's generic enough to mean anyone.

This matters because `docs/gtm/chrome-web-store-listing.md` explicitly names "Revise & remember... beachhead is USMLE/IMG med students" as the intended positioning for the Chrome Web Store listing copy — but **that positioning has not made it onto the actual website** in any form. Right now the site's on-page content and the product's own stated GTM wedge are two different products.

### What's genuinely working
- The FAQ content ([page.tsx:22-51](<../../webapp/app/(marketing)/page.tsx>)) is specific and well-written, especially "Does Clipmark replace Anki?" — directly answers the #1 objection a spaced-repetition-literate searcher would have, and it's marked up as `FAQPage` schema so it's eligible for a rich result.
- The two product screenshots have genuinely descriptive, keyword-relevant alt text (page.tsx:401) — not generic "screenshot.png" alt text, which is a common failure mode this site avoids.
- Internal linking from `Navigation.tsx` and `Footer.tsx` is clean and consistent (`/upgrade`, `/affiliate`, `/privacy`, `/terms` all linked from both) — the crawl graph itself is fine; it was the canonical tags undermining it (✅ fixed by PR #82).

### Adjacent, non-SEO issue worth flagging since it touches organic conversion — ✅ Resolved

> **✅ Resolved.** The Chrome Web Store listing now exists, and every install CTA points at it via a single `CHROME_STORE_URL` constant in `webapp/app/lib/constants.ts` (nav, footer, both homepage CTAs, the shared-collection page, plus the dashboard empty state). The `SoftwareApplication` JSON-LD also gained an `installUrl`. The original finding is preserved below for the record.

Every "Get the extension" CTA — [Navigation.tsx:54](../../webapp/app/components/Navigation.tsx), homepage ([page.tsx:204](<../../webapp/app/(marketing)/page.tsx>), [:819](<../../webapp/app/(marketing)/page.tsx>)), and the shared-collection page ([v/[shareId]/page.tsx:310](<../../webapp/app/(marketing)/v/[shareId]/page.tsx>)) — link to the generic `https://chrome.google.com/webstore`, not a real listing (there isn't one yet — the extension isn't published on the Chrome Web Store per `docs/gtm/chrome-web-store-listing.md`). Once the listing goes live, all five of these need the real `chromewebstore.google.com/detail/...` URL — otherwise every visitor who clicks "Get the extension," including anyone arriving from organic search, lands on an unrelated generic search page. **Owner action once the CWS listing is approved**, not a code issue today.

---

## 3. Keyword opportunity (MED/USMLE wedge + adjacent)

No SEO tool (Ahrefs/Semrush/GSC) is connected in this session, so difficulty/intent below is qualitative, informed by web research into who's already competing for these terms (§4) — not fabricated volume numbers. Where a term already has dedicated competitor content built against it, that's treated as a real signal of demand (nobody builds a landing page for a query with zero search interest).

| Keyword / phrase | Intent | Est. difficulty | Signal | Recommended content |
|---|---|---|---|---|
| "youtube to anki flashcards" / "anki export from youtube" | Transactional | Moderate | RemNote has a dedicated `/youtube_to_cards` landing page; FlashRecall has a blog post targeting this exact phrase | Dedicated landing page, not just a homepage feature bullet |
| "active recall youtube" | Commercial | Low–moderate | Clipmark's own product name for this is already unique/ownable; low existing competition specifically on "youtube" | Own this via the existing homepage section, but give it a dedicated URL/anchor with its own H2 and internal link |
| "spaced repetition youtube" | Informational/commercial | Low–moderate | Adjacent to well-established "spaced repetition" search volume (Anki, SuperMemo ecosystem); little youtube-specific content exists yet | Blog/guide: "How spaced repetition works for video, not just cards" |
| "usmle step 1 flashcards" | Commercial | High | Actively contested — FlashRecall, Mindomax, and StudyCards AI all run dedicated posts/pages on this exact phrase | Hard to rank head-on quickly; better as a supporting page linking into a narrower wedge below |
| "anki alternatives" / "remnote alternatives" | Commercial/comparison | High | FlashRecall and StudyCards AI both run comparison-page networks here (`/blog/anki-similar-apps`, `/alternatives/remnote-alternatives`, `/blog/remnote-vs-anki`) | A "Clipmark vs Anki" / "Clipmark + Anki" page — position as *additive*, not a replacement, matching the FAQ's existing "Does Clipmark replace Anki?" answer |
| "boards and beyond anki cards" / "sketchy pharm timestamps" / "pathoma anki" | Informational, high specificity | Low (long-tail, unclaimed) | These named-resource searches appeared organically in med-student workflow discussions and are **not owned by any of the competitors found** | Highest-leverage long-tail opportunity — see §4 |
| "img usmle study workflow" | Informational | Low–moderate | One small niche site (imghelpinghands.com) serves this; no major player has claimed it | Directly matches Clipmark's own documented IMG beachhead |
| "convert lecture video to flashcards" | Commercial | Moderate | Generic enough to be broadly contested but not med-specific — bridges the med wedge to a wider audience (any lecture-based learner) | Good mid-funnel page bridging homepage's general audience to the med-specific ones above |
| "how to study for usmle with youtube" | Informational | Moderate | Adjacent to a large "usmle study workflow" content cluster (UWorld/AMBOSS/AnKing ecosystem) already well served by prep-company content, but the *YouTube-specific* angle is thin | Blog post — realistic ranking target is "featured in the cluster," not #1 |
| "youtube notes app" | Commercial | Moderate | Broad, already used in Clipmark's own keyword metadata; genuinely competitive but on-brand | Keep as a supporting/secondary term on the homepage, not a page to build around |
| "clipmark pricing" / "clipmark cost" | Navigational | Low (branded) | Zero competition by definition — but see §1.2/§1.6, there's currently no page that can rank for this | Fix is technical (canonical + metadata), not content |

---

## 4. Content gaps vs. competitors

Three real, currently-operating competitors were found running content specifically against this wedge — none of this is hypothetical:

- **[RemNote](https://www.remnote.com/youtube_to_cards)** — a dedicated feature landing page built around literally "YouTube to cards." Direct proof the exact core mechanic Clipmark ships is considered worth a standalone SEO page by a funded competitor.
- **[FlashRecall](https://flashrecall.app/blog)** — the most aggressive of the three: a blog network explicitly targeting `usmle-step-1-flashcards`, `flashcards-from-youtube`, `anki-usmle-step-1-reddit`, `remnote-vs-anki`, and multiple "Anki alternatives" variants. This is a comparison/alternatives content funnel executed at volume, aimed at exactly the audience Clipmark's GTM docs name as the beachhead.
- **[StudyCards AI](https://studycardsai.com)** — same playbook: `/blog/how-to-use-anki-for-step-1`, `/blog/anki-deck-for-usmle-step-1`, `/alternatives/remnote-alternatives`.
- A smaller, IMG-specific niche site (**imghelpinghands.com**, "How to Use Anki for USMLE Step 1 | AnKing Guide for IMGs") shows the IMG-specific sub-niche is real and already being served, but only by a small independent site — not one of the three funded competitors above. That's a genuine opening given Clipmark's IMG focus is explicit and documented, while none of the bigger players are IMG-specific.

**The recurring theme in every med-student workflow discussion found (Reddit-style threads, forum guides):** the actual workflow is *watch a named lecture source (Boards and Beyond, Sketchy, Pathoma) → unsuspend the matching cards in a named deck (AnKing)*. None of the three competitor content programs above have built pages around these specific named resources — they write about "USMLE flashcards" generically. **This is the openable long-tail wedge**: "Boards and Beyond + Clipmark timestamp workflow," "Turn Sketchy Pharm into an AnKing-linked Clipmark deck," etc. Narrow, unclaimed, and directly matches what Clipmark's Active Recall → Anki export flow already does.

**Case-study tie-in (Kortex/NotebookLM):** independently confirmed — Kortex has grown to roughly $500K in cumulative gross volume in under 3 years at ~180% YoY by building content (blog posts, LinkedIn threads, newsletters) around NotebookLM, an adjacent tool with its own large, distinct search surface, rather than trying to out-content NotebookLM itself. The direct analogy for Clipmark isn't NotebookLM — it's **Anki and the AnKing deck ecosystem**: Anki already has enormous, well-established search volume and community presence (Reddit, deck-sharing forums) that Clipmark is positioned to be *additive* to (per the FAQ's own "Does Clipmark replace Anki? No — it feeds it" framing). A content program riding the Anki/AnKing/named-med-resource search surface — rather than competing head-on for "USMLE flashcards" against FlashRecall and StudyCards AI — is the more defensible version of the Kortex play here.

**Structural gap:** the site has zero blog, zero comparison ("vs"/"alternatives") pages, and zero `/how-it-works` — every marketing page today is transactional or legal. All three real competitors above are winning exactly this kind of content, and Clipmark currently has none of it.

---

## 5. Prioritized action plan

### Quick wins (do this week — all under a few hours each)

| # | Action | File(s) / route(s) | Impact | Effort |
|---|---|---|---|---|
| 1 | ✅ **DONE — PR #82** ~~Add `alternates: { canonical: '/<path>' }` to the `metadata` export of `privacy`, `terms`, `signin`, `upgrade`, `affiliate` pages~~ | `app/(marketing)/{privacy,terms,signin,upgrade,affiliate}/page.tsx` | High — fixes active de-indexation of 5 pages | Low |
| 2 | ✅ **DONE — PR #82** ~~Remove or replace the hardcoded `aggregateRating` in the sitewide `SoftwareApplication` JSON-LD until there's a real, visible review count to back it~~ | `webapp/app/layout.tsx:78-94` | High — removes a sitewide structured-data policy risk | Low |
| 3 | Give `/signin` and `/upgrade` their own `metadata` export (unique title + description) | `app/(marketing)/signin/page.tsx`, `app/(marketing)/upgrade/page.tsx` | Medium | Low |
| 4 | Add `openGraph`/`twitter` blocks to the homepage's own metadata so social shares match the `<title>`/description instead of the generic root fallback | `app/(marketing)/page.tsx` metadata export | Medium | Low |
| 5 | Add `/affiliate` as a static entry in `sitemap.ts` | `webapp/app/sitemap.ts` | Medium | Low |
| 6 | Normalize `APP_URL` to strip a trailing slash defensively in code, **and** fix the `NEXT_PUBLIC_APP_URL` Vercel env var (owner action — requires a redeploy per `NEXT_PUBLIC_*` build-time inlining) | `webapp/app/lib/constants.ts`; Vercel dashboard | Low–medium (fixes broken sitemap/OG-image URLs) | Low (code) / owner action (env var + redeploy) |
| 7 | Add `Disallow: /embed/` to `robots.txt` | `webapp/app/robots.ts` | Low | Low |

### Strategic investments (plan for this quarter)

| # | Action | Impact | Effort | Dependencies |
|---|---|---|---|---|
| 1 | Build the named-resource long-tail content cluster ("Boards and Beyond timestamps," "Sketchy Anki workflow," "AnKing + Clipmark") identified in §4 — this is the one gap none of the three real competitors have claimed | High | Substantial (multi-week content program) | None — can start once quick wins land |
| 2 | Add a "Clipmark vs. Anki" / "Clipmark + Anki" comparison page, extending the FAQ's existing "does it replace Anki" answer into a full page | Medium–high | Moderate | Quick win #1 (needs correct canonical infra in place) |
| 3 | Stand up a `/blog` or `/guides` section — currently the site has none, while all three real competitors found are winning long-tail traffic through exactly this | High (compounds over time) | Substantial | Content/editorial resourcing |
| 4 | Bring the MED/USMLE/IMG positioning already documented internally (`docs/gtm/chrome-web-store-listing.md`) onto the actual homepage — at minimum, rename "For the Serious Learner" into something that names the audience, or add a fourth persona card | Medium–high | Moderate | Product/marketing sign-off on public-facing med-specific claims (the CWS doc notes deliberate scoping to "usable for any serious YouTube learner" — decide before shipping) |
| 5 | Roll out `Content-Security-Policy-Report-Only` per `docs/TEST-STRATEGY.md` §4.2's existing recommendation, ahead of enforcing a real CSP | Low direct SEO impact today; protects future backlink/traffic equity | Moderate | Engineering time, not blocked on anything above |
| 6 | ~~Once the Chrome Web Store listing is live, update all 5 "Get the extension" CTA links to the real listing URL~~ — **✅ Resolved**; all CTAs now read from `CHROME_STORE_URL` | Indirect — protects organic conversion, not ranking | Low | — |
| 7 | Consider Search Console verification of performance/coverage data (already verified per §1) to track whether the canonical fix in quick-win #1 actually restores indexation of `/affiliate` et al. — a concrete before/after check | Confirms whether fixes worked | Low | Quick win #1 shipped first |

### Needs owner action (not a dev task)
- ~~Chrome Web Store listing approval, so the real extension URL can replace the generic `chrome.google.com/webstore` link in 5 places (§2, strategic #6).~~ — **✅ Resolved**: the listing is live and all CTAs now point at it.
- `NEXT_PUBLIC_APP_URL` Vercel production env var — confirm/fix the trailing slash (§1.6, quick win #6) and trigger a redeploy.
- A product/marketing decision on how explicitly to surface the USMLE/IMG wedge on the public site vs. keeping copy broad (strategic #4) — this is a positioning call, not something to default on unilaterally.
- Google Search Console already appears verified (site-verification meta present); worth confirming someone on the team actually has account access, and pulling real Coverage/Performance data once quick wins ship to validate impact.
