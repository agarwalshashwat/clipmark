# Homepage audit — clipmark.mithahara.com

**Date:** 2026-08-16 · **Audited commit:** `9ca89fd` (`origin/main`) · **Surface:** `webapp/app/(marketing)/page.tsx` + `Navigation.tsx`, `WhyClipMark.tsx`, `globals.css`, `design-tokens.css`
**Frameworks:** `design:design-critique` (usability / hierarchy / consistency), `design:accessibility-review` (WCAG 2.1 AA), `design:ux-copy` (messaging + claim honesty)
**Out of scope:** SEO (already audited in `SEO-AUDIT.md` — not re-litigated here), dashboard, extension UI, pricing page.

> **This is an audit. No homepage code was changed.** Every recommendation below is a proposal.

---

## Method

Rendered the **live** homepage headlessly (Playwright/Chromium, no user profile) at desktop **1280×900** and mobile **375×812**, in **light and dark**, with animations frozen. Contrast was computed programmatically over every visible text node against its nearest opaque ancestor background; tap targets, heading outline, focus states, anchor offsets, and the CTA inventory were extracted from the live DOM.

Screenshots: [`docs/gtm/homepage-audit/`](./homepage-audit/). Capture script is reproducible — see [Appendix C](#appendix-c--reproducing-the-capture).

> ⚠️ **Baseline note for whoever acts on this.** The homepage on `feat/ab-multi-segment-loops` is **stale** relative to `main` — it lacks `CHROME_STORE_URL`, `WhyClipMark`, `buildPageMetadata`, and ~415 lines of `globals.css`. Auditing that branch produces false findings (e.g. "install CTAs point at the generic Web Store"— true on the branch, **not** true on `main` or in production). All findings below are baselined against `origin/main`.

---

## Verdict

The page is **well-built and unusually honest** — `WhyClipMark` is some of the best pre-launch trust copy I've seen on an indie extension site, and the Active Recall section shows real product UI instead of stock illustration. The problems are not craft problems. They are **positioning and sequencing** problems:

1. **The above-the-fold copy sells a bookmarker, not a retention tool.** The `<title>` tag is dramatically stronger than the `<h1>`.
2. **The page sells Pro to people who haven't installed the free thing yet** — 9 upgrade CTAs vs 3 install CTAs, and an 11,767px stretch (89% of the page) containing zero install CTAs.
3. **It contradicts itself about whether the headline feature is free.**
4. **Dark mode is comprehensively broken** — currently unreachable by real visitors, so it is a latent trap rather than a live fire, but it must not ship as-is.

Top three fixes, in order: **F1** (Active Recall PRO badge), **F2** (above-the-fold rewrite), **F3** (mid-page install CTA). Together they are under a day of work.

---

# High-impact / quick wins

## F1 · The page tells visitors Active Recall is Pro-only. It isn't. 🔴

**Effort: XS (~15 min)** · `page.tsx:386–391`

The Active Recall section header renders a gradient **`PRO`** badge beside the section label.

Active Recall is **not** Pro-only. The free tier includes 25 enrolled moments and 30 reviews/month — gated by `isRecallStartBlocked()` in `extension/src/usage-caps.js`, not by `checkPro()`.

The page **contradicts itself about this, twice, below the fold**:

| Location | Says |
|---|---|
| `page.tsx:386` (Active Recall section) | `PRO` badge |
| `WhyClipMark.tsx` (~75% scroll, same page) | "Free means … **25 Active Recall cards, 30 reviews a month**" |
| `/faq` | "25 moments enrolled in Active Recall at a time, 30 reviews a month" |

**Why it matters:** Active Recall is the *only* thing that separates ClipMark from every other YouTube bookmarker — `WhyClipMark` says so explicitly ("no other YouTube bookmarker does"). Badging it `PRO` tells a cold visitor the differentiator is behind a paywall, at the exact moment you're asking them to install a free extension. It converts your strongest asset into a friction point, and it's factually wrong.

**Recommendation:** Delete the `PRO` badge from `#active-recall`. Replace it with a free-tier affordance: **`FREE — 30 reviews/month`**. That turns the contradiction into a proof point and puts the honest number above the fold-line of that section rather than 6,000px lower.

> Keep the `PRO` badge on `#anki` — Anki export *is* Pro-gated (1 export/month free, unlimited on Pro). Consider softening it to `1/mo free · unlimited on Pro` for the same reason.

---

## F2 · A first-time visitor cannot tell this from a generic bookmarker in 5 seconds 🔴

**Effort: S (~1–2h, copy only)** · `page.tsx:186–219`

Everything above the fold today:

| Element | Current copy |
|---|---|
| Badge | The Second Brain for YouTube **Professionals** |
| H1 | Stop Forgetting What You Watch — *Your YouTube Second Brain.* |
| Subhead | Quit wasting time rewatching tutorials or losing gems in your watch history. Build a personal knowledge system that remembers exactly where the value is. |
| CTA | Master YouTube Now — It's Free |

**Nothing above the fold says quiz, flashcard, spaced repetition, review, or Anki.** The words "second brain" appear twice in three elements. "Second brain" is a saturated category term — Notion, Obsidian, Readwise, Mem and a hundred Chrome extensions all claim it — so it *positions ClipMark inside a crowded category rather than differentiating it from that category*.

The sharpest asset here is one you already wrote — the `<title>`:

> **"Turn YouTube Into Video Flashcards You Remember"**

That is specific, category-defining, and unique to ClipMark. It is currently visible only in a browser tab and on Google. The `<h1>` is the weaker of the two.

Three further problems:

- **"Professionals"** in the badge conflicts with the study/retention wedge, with the `#features` personas, and with the `.edu` discount in the FAQ. Pick one audience.
- The subhead is entirely **problem-restatement** — it spends 26 words describing pain and zero describing mechanism. A visitor still doesn't know *what the product does*.
- **Claim check:** "remembers exactly where the value is" implies ClipMark finds the valuable moments automatically. It doesn't — *you* mark them with Alt+B. The claim overshoots into a capability the product doesn't have.

**Recommendation** — promote the title tag, state the mechanism, name the audience:

| Slot | Proposed |
|---|---|
| Badge | `Active recall for what you watch` *(drop "Professionals")* |
| H1 | **Turn YouTube into flashcards you actually remember.** |
| Subhead | Hit `Alt+B` on the moment that matters. ClipMark brings it back on a spaced schedule, hides your note, and asks you to recall it — *before* it replays the clip. Free, on-device, exports to Anki. |
| Primary CTA | **Add to Chrome — Free** |
| Secondary CTA | **See how a review works** → `#active-recall` |

Rationale: the subhead now carries the *mechanism* (mark → schedule → hide → recall → replay) in one sentence, which is the thing no competitor does. Every noun in it is checkable against shipped code.

**Alternates for the H1**, if you want to A/B:

| | H1 | Best for |
|---|---|---|
| A | Turn YouTube into flashcards you actually remember. | Study/retention wedge (recommended — matches title tag) |
| B | You watched it. Now prove you remember it. | Sharper, more provocative; narrower |
| C | The YouTube bookmarker that quizzes you back. | Most explicit differentiation vs. category |

---

## F3 · Every mid-page CTA sells Pro. None of them installs the free extension. 🔴

**Effort: S (~1h)** · measured on the live page

Live CTA inventory:

| | Install CTAs | Pricing/upgrade CTAs |
|---|---|---|
| Count | **3** | **9** |
| Desktop positions | y=20 (nav), y=766 (hero), y=**12,533** (final) | y=765, 4136, 5786, 9240×3, 9406 + 2 nav |

Between the hero CTA (y=766) and the final CTA (y=12,533) lies **11,767px — 89% of the desktop page — with no install CTA in the body at all.** On mobile the dead zone is 20,050px of a 21,907px page.

What *does* appear in that stretch: "See what else Pro unlocks", "Explore Pro Features", three "Go Pro" plan buttons, "Compare all plans". A visitor who scrolls to the Active Recall section, gets convinced, and looks for the next step is offered **a paid upgrade** — for a product they have never used.

The fixed nav does keep "Get the extension — Free" persistently on screen, which softens this. But nav CTAs convert far worse than in-context ones, and the body is actively routing warm traffic to a paywall.

**Recommendation:**
1. Add an install CTA immediately after `#active-recall` — the highest-intent moment on the page, right after the product actually demonstrates itself. Copy: **"Add to Chrome — free, 30 reviews a month"**.
2. Add a second after `WhyClipMark`.
3. Demote `See what else Pro unlocks` / `Explore Pro Features` to plain text links (they already are — keep them quiet) and let the pricing section carry the Pro pitch.
4. Reconsider the nav **`✦ Go Pro`** button entirely for logged-out visitors. It sells an upgrade to someone with nothing to upgrade *from*, and it competes visually with the install CTA 8px away.

---

## F4 · Every in-page anchor lands underneath the fixed nav 🟡

**Effort: XS (one CSS rule)** · measured live

The nav is `position: fixed`, 81px tall. Section `scroll-margin-top` is `0px`. Measured after fragment navigation:

| Anchor | Section top | Result |
|---|---|---|
| `#pricing` | 0px | **obscured** (81px hidden) |
| `#features` | −32px | **obscured** |
| `#active-recall` | 0px | **obscured** |
| `#anki` | 0px | **obscured** |
| `#how-it-works` | 0px | **obscured** |

This is hit by the **hero's own secondary CTA** (`See Pricing` → `#pricing`), the nav's `Features` link, and the three `Learn more` links. Every one lands with its heading sliced off — visible in `evidence-active-recall-pro.png`, where "Don't just rewatch it." is cut in half by the nav.

**Recommendation:** one rule in `globals.css`:

```css
main > section[id], [id] { scroll-margin-top: 96px; }
```

---

## F5 · Mobile: no complete CTA above the fold, and the install button is under the tap-target minimum 🟡

**Effort: S (~1–2h)** · WCAG 2.5.5

At 375×812 the fold contains: badge (2 lines) → H1 (**5 lines**) → subhead (**6 lines**) → primary CTA **clipped by the viewport edge**. See `mobile-light-fold.png`.

The only fully-tappable install control above the fold is the nav button, measured at **120×36px** — below the 44×44 minimum (WCAG 2.5.5).

Contributing bug: `globals.css` defines mobile overrides `.hero-h1 { font-size: 44px }` and `.hero-sub { font-size: 16px }`, but **the hero `<h1>` and subhead in `page.tsx` carry no `className`** — they're inline-styled only. Those rules are dead code and never apply, which is why the subhead renders at 21px and consumes six lines.

**Recommendation:**
- Apply the existing `.hero-h1` / `.hero-sub` classes to the elements (the CSS is already written and unused).
- Tighten the mobile subhead to ~2 lines — the F2 rewrite should be length-budgeted for 375px specifically.
- Raise `.nav-cta` mobile padding to clear 44px height.

---

## F6 · Mobile visitors cannot log in 🟡

**Effort: S (~2h)** · `globals.css:73–91`, `Navigation.tsx`

Below 640px, `globals.css` sets `display: none !important` on `.nav-links` (Features / Pricing / Join Affiliate), `.nav-login` (**Log In**), and `.nav-gopro`. **There is no hamburger menu.** The mobile nav is logo + install button, full stop.

The in-code comment justifies this — "Pro is still reachable from the pricing section and footer" — and that's true for Pro. It isn't true for **Log In**: the footer link list contains Pricing, Affiliate, Chrome Extension, the four retention pages, FAQ, VideoSegments, Privacy, Terms, feedback and support — **no sign-in link anywhere**.

So a returning mobile user who wants their dashboard has no path from the homepage short of typing `/signin`.

**Recommendation:** add a `Log In` link to the footer (XS, unblocks the case immediately), and consider a minimal mobile menu for the nav links (S).

---

## F7 · Zero social proof until 90% scroll depth, and it's anonymous 🟡

**Effort: S–M** · `page.tsx:866–876`

The only trust signal on the page is the founder quote at y≈12,100 (desktop) / y≈20,400 (mobile) — **beneath the FAQ**, attributed to "**— Creator of ClipMark**". An anonymous founder quote is weaker than no quote: it reads as filler, and the placeholder `person` icon reinforces that.

The store listing has ~0 reviews, so **do not fake or imply social proof.** But "no reviews yet" is not the same as "no credibility", and the page is leaving real, honest trust signals unused.

**Recommendation** — pre-launch trust that doesn't require users:

1. **Sign the founder quote.** Real name + photo + a link to X/GitHub. Move it directly beneath the hero. A named indie founder is a *stronger* pre-launch signal than "1,000+ users" — it's verifiable.
2. **Promote `WhyClipMark` above `#features`** (see F9). "Two hosts. That's the whole permission list" is a trust argument that needs no users at all, and permission anxiety is the #1 reason people abandon a Chrome extension install.
3. **Add the verifiable install facts** near the hero CTA: `Works on Chrome, Edge, Brave · No account required to start · 2 site permissions`. All checkable, none inflated.
4. **Say the quiet part out loud.** A short line — *"ClipMark is new. Here's exactly what the free tier gives you, in numbers, so you can judge it before installing."* — converts the absence of reviews into evidence of the honesty you're already practising.
5. Once reviews exist, wire a live count into the hero. Until then, leave the slot empty rather than filling it with badges.

---

# Bigger bets

## F8 · Dark mode is comprehensively broken — latent today, but do not ship the toggle 🔴 (latent)

**Effort: M (~half day)** · `design-tokens.css:188+`, `page.tsx` (7 hardcoded backgrounds)

Measured contrast failures on the live page:

| View | Failures |
|---|---|
| desktop-light | 8 *(all decorative `aria-hidden` icons — exempt from 1.4.3)* |
| **desktop-dark** | **68** |
| mobile-light | 8 *(same, exempt)* |
| **mobile-dark** | **68** |

Worst offenders:

| Element | fg / bg | Ratio | Need |
|---|---|---|---|
| `h1` "Stop Forgetting What You Watch —" | `#111827` on `#0a0a0f` | **1.11:1** | 3.0 |
| `h2` "Keep your deck. Add the moment." | `#111827` on `#0a0a0f` | **1.11:1** | 3.0 |
| `h2` "Curated For Your Workflow" | `#111827` on `#0a0a0f` | **1.11:1** | 3.0 |
| `h2` "Ready to Build Your Second Brain?" | `#111827` on `#0a0a0f` | **1.11:1** | 3.0 |
| 4× Anki bullet items | `#111827` on `#0a0a0f` | **1.11:1** | 4.5 |
| `h4` "Passive Consumption (Bad)" | `#f9fafb` on `#ffffff` | **1.05:1** | 4.5 |
| `h2` "How remembering actually works here" | `#f9fafb` on `#ffffff` | **1.05:1** | 3.0 |
| `#EXECUTION` tag | `var(--success)` on `#dcfce7` | **1.59:1** | 4.5 |

See `desktop-dark-fold.png` (H1 all but gone), `evidence-dark-anki-section.png` (heading + all four bullets illegible), `evidence-dark-features-section.png` (heading gone; cards glare as white islands).

**Two root causes:**

1. **`--gray-900` and `--gray-50` are raw palette tokens that are never remapped under `[data-theme="dark"]`.** Dark mode redefines the *semantic* tokens (`--text`, `--bg`, `--surface`, `--border`) correctly, but the homepage bypasses them — it uses `color: var(--gray-900)` on ~20 headings, which stays near-black in dark mode. Conversely `--text` resolves to `--gray-50` (near-white) and lands on hardcoded white section backgrounds.
2. **Seven sections hardcode `background: 'white'` / `'#ffffff'` / `var(--gray-50)`** (`page.tsx:299, 436, 646, 767, 803, 828, 866`), producing blinding white islands in an otherwise dark page.

**Why this is *not* a live P0:** the theme bootstrap in `layout.tsx:88–92` honors `localStorage.theme === 'dark'` only — it **never reads `prefers-color-scheme`** — and `ThemeToggle.tsx` **is not mounted anywhere in the app** (`grep` finds no usage outside its own file). No real visitor can currently reach dark mode. I set `localStorage` directly to surface this.

**Why it still matters:** `ThemeToggle` exists and is clearly intended to ship. The moment it is mounted — or the moment anyone adds `prefers-color-scheme` support, which is the obvious next step — the homepage becomes unusable for every dark-mode user in one commit, with no test covering it.

**Recommendation:**
1. Replace `var(--gray-900)` → `var(--text)` and `var(--gray-600)`/`var(--gray-300)` → `var(--text-muted)` throughout `page.tsx`.
2. Replace the seven hardcoded section backgrounds with `var(--surface)` / `var(--bg)`.
3. Fix the `#EXECUTION` / `#REACT` / `#STRATEGY` tag pills — some use tokens, some hardcode hex; make them consistent.
4. Add a rendered-DOM dark-mode contrast assertion to the visual suite so this can't regress silently.
5. **Gate:** don't mount `ThemeToggle` or add `prefers-color-scheme` until 1–3 land.

---

## F9 · Information architecture: 13 sections, and the best content is at 75% depth

**Effort: M (~half day, mostly reordering)**

The page is **13,179px on desktop and 21,907px on mobile** — roughly 27 phone screens. Current order:

```
Hero → Problem/Solution → Active Recall → Anki → Features(personas)
→ AI/Pro → How It Works → Compatibility → WhyClipMark → Pricing
→ FAQ → Retention links → Founder quote + Final CTA
```

Problems with this sequence:

- **`WhyClipMark` is 9th.** It is the most persuasive, most honest, most differentiated content on the page — permissions, real free-tier numbers, "no other YouTube bookmarker quizzes you". It's buried below three softer sections.
- **`How It Works` is 7th** — *after* Active Recall, Anki, personas and the AI section have all already assumed the reader knows what the product does. The explanation arrives long after the elaboration.
- **`Features` (personas), `AI/Pro` and `Compatibility` are three consecutive low-density sections** that mostly restate what's above.
- **Two "which audience?" sections** (`Features` personas and `Curated For Your Workflow`) dilute rather than target.

**Recommended order:**

```
Hero → How It Works (3 steps) → Active Recall (the differentiator, with demo)
→ WhyClipMark (trust: permissions + real free numbers) → Anki → Pricing
→ FAQ → Retention links → Final CTA
```

That's problem → mechanism → proof → trust → price. It also **cuts 3 sections** (personas, AI/Pro, Compatibility — fold their content into How It Works and WhyClipMark), which should take roughly 4,000px off the page.

---

## F10 · The before/after chart argues against you

**Effort: S (~1h)** · `page.tsx:362–375`

The bar chart in the Problem/Solution section plots two bars:

- `120m` — grey, **100% height** — labelled **"Mental Fatigue"**
- `6m` — teal, **5% height** — labelled **"Knowledge Retained"**

Two different quantities share one axis, and the axis is time — but the labels are *fatigue* and *retention*, which aren't measured in minutes. Read literally, the chart says ClipMark leaves you with **5% as much knowledge retained**. The visual encoding directly contradicts the message.

It also implies a **measured 120m → 6m result that ClipMark has never measured**, which is the least honest element on an otherwise scrupulous page — and it sits ~1,500px above `WhyClipMark`, which is built entirely on not doing this.

**Recommendation:** cut the chart. The adjacent before/after panel already carries the point without inventing numbers. If you want a visual there, use the real 1/3/7→60-day interval ladder — it's a genuine product mechanic, it's already documented in the FAQ, and it's more interesting than a fake bar chart.

---

## F11 · Claim honesty: four overreaches on a page whose whole pitch is honesty

**Effort: S (~1h, copy only)**

`WhyClipMark`'s file header explicitly commits to "checkable against shipped code rather than asserted." These four break that:

| # | Claim | Problem | Fix |
|---|---|---|---|
| 1 | "**Our AI engine** analyzes transcripts in real-time to surface the gold nuggets" (`:629`) | It is **Chrome's** on-device Gemini Nano, not ClipMark's engine — the honest footnote *directly below* says so, contradicting the sentence above it. Also "surface the gold nuggets" implies automatic discovery; the product drafts a note at a timestamp **you** chose. | "Chrome's on-device AI drafts your note from the transcript around the moment you saved." |
| 2 | "**Notion & Obsidian**" under **"Built for Your Ecosystem"** (`:749`) | Reads as an integration. `/faq` says the opposite, deliberately: *"There is no live two-way Notion sync today, and we would rather say that plainly than call a CSV an integration."* The homepage undoes the FAQ's honesty. Also omits that it's Pro-only. | Relabel `Notion / Obsidian export (CSV · Pro)`. |
| 3 | "Build a searchable library of **100+ tutorials** you actually understand" (`:543`) | Arbitrary number implying a benchmark that doesn't exist. | Drop "100+". |
| 4 | "Extract insights from 3-hour podcasts **in seconds**" (`:558`) | Overshoots — you still watch and mark manually. | "Pull the three moments that mattered out of a 3-hour podcast — and actually retain them." |

Also: **"The ClipMark System (Pro)"** (`:323`) labels the *desired outcome* of the problem/solution comparison as Pro. Same defect as F1 — the good half of your before/after is tagged as paid. Drop `(Pro)`.

---

# Accessibility summary (WCAG 2.1 AA)

| Criterion | Status | Detail |
|---|---|---|
| **1.4.3** Contrast (light) | ✅ Pass | 8 flagged items are all decorative `aria-hidden="true"` Material icons paired with visible text labels — exempt. Body text and headings pass comfortably. |
| **1.4.3** Contrast (dark) | ❌ **68 failures** | See F8. Worst 1.05:1. |
| **1.3.1** Info & relationships | ⚠️ Minor | Heading levels skip `h2 → h4` twice: Problem/Solution ("Passive Consumption (Bad)", "The ClipMark System (Pro)") and How It Works (the three step cards). Should be `h3`. **Effort: XS.** |
| **2.4.7** Focus visible | ✅ Pass | All 12 sampled interactive elements take a visible UA focus ring. Consider a branded `:focus-visible` ring for polish, but this is compliant. |
| **2.5.5** Target size | ⚠️ 20 under 44px | Nav install CTA 120×**36** (mobile); 10 footer links at 327×**16**; inline arrow links ("Compare all plans", "Read the full FAQ", "See what else Pro unlocks") at ~19px tall. **Effort: S.** |
| **1.1.1** Non-text content | ✅ Pass | The two Active Recall product screenshots have genuinely descriptive `alt`; decorative icons correctly `aria-hidden`. Notably good. |
| **2.4.4** Link purpose | ⚠️ Minor | Three separate `Learn more` links all point to the same `#faq` anchor. `aria-label` disambiguates them for AT, but sighted users get three identical links to one generic destination. Point each at its relevant retention page. **Effort: XS.** |
| **4.1.2** Name/role/value | ✅ Pass | No custom widgets; semantic `<a>`/`<nav>`/`<section>`/`<figure>` throughout. |
| Console errors | ✅ None | Clean in all four render combinations. |

---

# What works well

Worth protecting through any rewrite:

- **`WhyClipMark` is genuinely excellent** — specific, falsifiable, and it leads with permissions, which is the real objection for a Chrome extension install. Its source comment ("checkable against shipped code rather than asserted") should be the standard for the whole page.
- **Real product UI in the Active Recall section**, with accurate alt text, instead of stock illustration. Rare and credible.
- **The FAQ is unusually straight** — "Does ClipMark replace Anki? No — it feeds it" is a great answer, and the refusal to call a CSV an integration is a real differentiator.
- **Free-tier numbers are printed, not hedged.** No "generous free tier" weasel wording.
- **Light mode is clean.** No real contrast failures, sensible spacing rhythm, and the type scale holds up from 375px to 1280px.
- **`CHROME_STORE_URL` is centralised** with a well-reasoned `||`-vs-`??` guard — no inlined store URLs to drift.

---

# Priority summary

| # | Finding | Impact | Effort |
|---|---|---|---|
| **F1** | Active Recall badged `PRO` — it's free, page contradicts itself twice | 🔴 High | XS |
| **F2** | Above-the-fold doesn't state the wedge; `<title>` beats the `<h1>` | 🔴 High | S |
| **F3** | 9 upgrade CTAs vs 3 install; 89% of page has no install CTA | 🔴 High | S |
| **F4** | Every in-page anchor lands under the fixed nav | 🟡 Med | XS |
| **F5** | Mobile fold clips the CTA; nav button 36px (< 44px); dead `.hero-*` CSS | 🟡 Med | S |
| **F6** | No Log In on mobile — nav hidden, no hamburger, no footer link | 🟡 Med | S |
| **F7** | No social proof until 90% depth; founder quote anonymous | 🟡 Med | S–M |
| **F8** | Dark mode: 68 contrast failures (latent — gate the toggle) | 🔴 High* | M |
| **F9** | IA: 13 sections, best content at 75% depth | 🟡 Med | M |
| **F10** | Before/after chart argues the opposite of its point | 🟡 Med | S |
| **F11** | Four claim overreaches on an honesty-led page | 🟡 Med | S |

\* latent, not currently user-visible — see F8.

**Suggested launch-day cut:** F1 + F4 + F11 (~2h, all copy/CSS) → F2 + F3 + F5 + F6 (~1 day) → gate F8 → F7/F9/F10 post-launch.

---

## Appendix A — screenshots

| File | What it shows |
|---|---|
| [`desktop-light-fold.png`](./homepage-audit/desktop-light-fold.png) | 1280×900 light — current above-the-fold |
| [`desktop-dark-fold.png`](./homepage-audit/desktop-dark-fold.png) | 1280×900 dark — **H1 first line all but invisible** (F8) |
| [`mobile-light-fold.png`](./homepage-audit/mobile-light-fold.png) | 375×812 light — **primary CTA clipped by the fold** (F5) |
| [`mobile-dark-fold.png`](./homepage-audit/mobile-dark-fold.png) | 375×812 dark |
| [`evidence-dark-anki-section.png`](./homepage-audit/evidence-dark-anki-section.png) | Heading + all four bullets illegible at 1.11:1 (F8) |
| [`evidence-dark-features-section.png`](./homepage-audit/evidence-dark-features-section.png) | Heading invisible; cards glare as white islands (F8) |

## Appendix B — measured data

- Desktop page height **13,179px**; mobile **21,907px**; **13** `<section>` elements.
- Install CTAs **3**; pricing/upgrade CTAs **9**.
- Largest gap without an install CTA: **11,767px** desktop / **20,050px** mobile.
- Contrast failures: light **8** (all exempt decorative icons) / dark **68**.
- Tap targets below 44px: **20**.
- Console errors: **0** across all four render combinations.

## Appendix C — reproducing the capture

Rendered with Playwright/Chromium headless against the live site, `deviceScaleFactor: 1`, animations frozen via an injected `animation-play-state: paused` rule. Dark mode was forced by seeding `localStorage.theme = 'dark'` in an init script **because the site exposes no way to reach it** (see F8). No browser profile, cookies, or logged-in session was involved — the page renders its logged-out state, which is what a launch-day visitor sees.
