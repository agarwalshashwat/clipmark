# ClipMark Cross-Surface Design Audit

> **Status: PROPOSAL — for Ash's sign-off.** Nothing here has been fixed. This is
> the evidence behind [DESIGN.md](./DESIGN.md) and the work-list a follow-up
> would execute. Canonical values referenced as *DESIGN §n*.

Audited at `origin/main` @ `221f106`. Surfaces:

- **W** — Website (`webapp/`)
- **D** — Extension dashboard (`extension/src/pages/dashboard.html` + `extension/styles/dashboard.css`, 4,285 lines)
- **S** — Extension side panel (`extension/src/pages/side-panel.html` + `extension/styles/side-panel.css`, 1,748 lines)
- **X** — Cross-surface

Severity: **P0** blocks/embarrasses (brand-wrong, broken, inaccessible) · **P1**
visible inconsistency a user would notice · **P2** internal drift that will cause
future inconsistency.

---

## Headline

The token layer is not the problem — `packages/design-system/tokens.css` is
byte-identical in all three surfaces (verified by checksum). **The problem is
that almost nothing uses it.** The webapp hardcodes ~290 slate values inline;
the extension dashboard hardcodes 67 `#14b8a6` and 20 `#006b5f`. Tokens exist,
sync correctly, and are bypassed.

Three findings dominate:

1. **The website spells the product name wrong, 131 times** (§W-1). The Chrome
   Web Store says `ClipMark`; the website says `Clipmark`, including in
   `<title>`, OpenGraph, and JSON-LD.
2. **The dashboard is typeset at side-panel density** (§D-1) — 13px body, 21
   declarations at 10px, one at 8px, on a full-width desktop tab.
3. **25 distinct colour systems are in use across the three surfaces** (§X-6) —
   including **five** separate neutral ramps (§X-4) and **four** teal/brand
   variants. 105 distinct colour values, 698 hardcoded occurrences.

---

## W — Website

### W-1 · P0 · Wordmark is `Clipmark` everywhere, `ClipMark` nowhere

| | |
| --- | --- |
| **Current** | `Clipmark` — **131 occurrences across ~30 files** in `webapp/app/`. Zero correct occurrences. |
| **Canonical** | `ClipMark` (DESIGN §1) |

Includes every high-visibility string:

- `layout.tsx` — `<title>`, `description`, `openGraph.title/siteName`,
  `twitter.title`, OG image `alt`, JSON-LD `name`
- `components/Navigation.tsx:18` — the nav wordmark itself, plus the logo `alt`
- `components/Footer.tsx`, `(marketing)/page.tsx` (body copy: "The Clipmark
  System (Pro)", "The Clipmark Way", "welcome to Clipmark!")
- `terms/`, `privacy/`, `affiliate/`, `upgrade/`, `embed/`, all `dashboard/`
  pages, and six API route handlers that emit it into user-facing payloads

The extension is already 100% correct (18 occurrences, including
`manifest.json`'s `name`/`short_name`, which is what the store renders). **The
store listing and the website currently disagree on the product's name.** It is
also in the indexed `<title>` and JSON-LD, so it's what search results show.

Fix: case-sensitive replace `Clipmark` → `ClipMark` across `webapp/app/`,
**excluding** URLs, file paths, and identifiers (`clipmark.mithahara.com`,
`/clipmark-logo.png`, `clipmark-*` slugs) which are correctly lowercase per
DESIGN §1. Roughly a 30-file mechanical diff. Independent of every other item
here — should not wait on token sign-off.

### W-2 · P1 · Hero heading gradient runs the wrong direction, and it's the only one

| | |
| --- | --- |
| **Current** | `(marketing)/page.tsx:191` — `linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)` on the `<em>` in the hero `h1`; four other places use `135deg, #14B8A6 → #0D9488`; two use `#14B8A6 → #006B5F` |
| **Canonical** | `--gradient-brand-text` for text (dark→light), `--gradient-brand` for fills (light→dark) — DESIGN §3.5 |

Six distinct teal gradients across the codebase, three of them differing only by
direction. The hero's direction is actually the *correct* one for text (the
leading glyph gets the darker stop, so it holds contrast on white) — but nothing
codifies that, so the other five went the other way. Ratify the hero's direction
as `--gradient-brand-text` and convert the rest.

The hero `<em>` does declare `color: '#0D9488'` before the clip properties, so
the fallback is present — it's the extension that's missing it (§D-2).

### W-3 · P1 · Nav is 80px tall; every other surface's header is 64px

| | |
| --- | --- |
| **Current** | `Navigation.tsx:15` — `height: 80`; extension dashboard header 64px; side panel header ~50px |
| **Canonical** | `--layout-nav-height: 64px` (DESIGN §5) |

Compounding: the nav wordmark is 24px/800 while the extension dashboard's is
20px/800 and the side panel's is 15px/700, and each uses a different colour
(`var(--text)` / teal gradient / flat `#0d9488`). Three headers, three heights,
three wordmark treatments (§X-2).

### W-4 · P1 · Heading sizes are 15 hand-rolled `clamp()`s with no scale

| | |
| --- | --- |
| **Current** | `clamp(44px,7.5vw,88px)`, `clamp(40px,8vw,64px)`, `clamp(32px,6vw,48px)`, `clamp(32px,5vw,48px)`, `clamp(32px,4.5vw,48px)`, `clamp(32px,4vw,44px)`, `clamp(28px,5vw,52px)`, `clamp(28px,4vw,48px)`, `clamp(28px,4vw,44px)`, `clamp(28px,4vw,42px)`, `clamp(28px,4vw,40px)` … |
| **Canonical** | one `--text-display` + `--text-h1`…`--text-h4` (DESIGN §4.2) |

Eleven distinct `clamp()` expressions for what are visually four heading levels.
Five of them differ only in their max (48/44/42/40). Section `h2`s that should be
identical render 4–8px apart depending on which page you're on.

Body sizes are similarly ad-hoc: 21, 18, 17, 16, 15, 14, 13, 12, 11, 10 — the
whole integer range, no scale.

### W-5 · P1 · Body copy colour is `#545f6c`, an orphan of the retired palette

| | |
| --- | --- |
| **Current** | `#545f6c` **46×**, `#1a1c1d` **49×**, `#6c7a77` **16×** in `webapp/app/` |
| **Canonical** | `--color-text-secondary` `#64748b`, `--color-text` `#0f172a` (DESIGN §3.2) |

These are Material-You-derived values from an earlier design pass. They sit
alongside the slate values (`#0f172a` 68×, `#64748b` 61×) doing the *same job* —
so the marketing page has two "body grey"s and two "heading near-black"s, chosen
apparently at random per section. `#1a1c1d` vs `#0f172a` is a visible warm/cool
difference on adjacent headings.

### W-6 · P2 · Styling is inline, so tokens structurally cannot reach it

Almost all webapp styling is React inline `style` objects. A token can't apply to
`color: '#545f6c'` typed into a JSX prop. `globals.css` already has the right
pattern (`.cm-card`, `.cm-section-label`, `.cm-icon-badge`, `.primary-btn`) —
it's just used for ~8 things out of hundreds.

This is the **adoption blocker for the whole design system on the website**.
Extracting repeated inline styles into `cm-` classes is a prerequisite for any
token rollout, not a cleanup afterwards.

### W-7 · P2 · Footer bypasses the tokens it sits next to

`globals.css:70–106` — `.footer` hardcodes `#f1f5f9` border and `#ffffff`
background, `.footer-logo` hardcodes `#0f172a`, `.footer-desc` hardcodes
`#64748b` — while `.footer-links-title` and `.footer-link` in the same block
correctly use `var(--text-muted)` / `var(--text-sub)`. Half the footer is
themed; half is not. **In dark mode the footer stays white.**

### W-8 · P2 · `--font-family-*` redefined in two places

`globals.css:13–17` re-declares `--font-family-display/body/mono`, which
`design-tokens.css` (imported on line 9) already defines. Same values today;
nothing keeps them that way.

### W-9 · P2 · Card radii: 12, 14, 16, 20, 24 with no rule

`.cm-card` 20px, `.faq-card` 12px, nav CTAs 14px, hero CTAs 16px, dashboard
cards 24px. `.cm-card`'s hover lift is `translateY(-8px)` — large enough to read
as a jump on a dense grid (DESIGN §9.2 sets `-4px`).

---

## D — Extension dashboard

### D-1 · P0 · Typography is sized for a 350px rail, not a full-width tab

This is the "poor dashboard typography" call-out. Measured across
`dashboard.css`:

| Size | Declarations | |
| --- | --- | --- |
| 13px | **43** | de-facto body size |
| 12px | 31 | |
| 11px | 22 | |
| 10px | **21** | metadata, labels, badges |
| 9px | 1 | |
| 8px | 1 | |

vs. 16 at 14px, 11 at 18px, 5 at 20px. **A desktop-width page whose most common
type size is 13px and whose second tier is 10px.** For comparison the website's
body copy runs 15–21px.

| | Current | Canonical (DESIGN §4.2) |
| --- | --- | --- |
| Body | 13px | **15px** `--text-body` |
| Metadata / labels | 10px | **12px** `--text-caption` |
| Section labels | 10px `.side-nav-section-label` | **11px** `--text-overline` |
| Page heading | 32px (40px ≥768px) | 36px `--text-h1` |
| Heading sub | 14px | 15px `--text-body` |
| Smallest permitted | 8px | **11px floor** |

Related: `font-family: inherit` appears **16×** across the extension CSS,
including on headings — so several dashboard headings silently render in Inter
instead of Plus Jakarta Sans. `.bm-heading-sub` hardcodes `#545f6c` (retired) and
needs a `[data-theme="dark"]` override to compensate, which it has — evidence
that hardcoding forced a second bug-fix rule.

This is the largest single item in the audit and the one Ash will see
immediately.

### D-2 · P0 · Wordmark is a gradient with no colour fallback

| | |
| --- | --- |
| **Current** | `dashboard.css:90–99` — `.page-title` sets `background: linear-gradient(135deg,#006b5f,#14b8a6)`, `background-clip: text`, `-webkit-text-fill-color: transparent` — **and never sets `color`** |
| **Canonical** | solid `--color-primary-deep`; the wordmark is never a gradient (DESIGN §1, §4.4) |

Two problems. (a) If `background-clip: text` doesn't apply, the wordmark renders
fully transparent — the brand name disappears. (b) The same wordmark is a teal
gradient here, flat `#0d9488` in the side panel (`.sp-logo-text`), and
`var(--text)` on the website. Three treatments of one wordmark, on adjacent
surfaces a user moves between in one session.

Also: `#006b5f` is not on the teal ramp (DESIGN §3.1).

### D-3 · P1 · Two primary navs render at once, with duplicated items

Above 768px `dashboard.css:3123–3147` shows **both** `.page-header-nav`
(horizontal tabs: All Bookmarks / Reminders / Shared ↗) **and** `.bm-side-nav`
(All Bookmarks / Videos / Reminders / Analytics / Groups / Shared / Upgrade).

`All Bookmarks` and `Reminders` exist in both, wired to *separate* handlers with
*separate* active states (`dashboard.js:2527` vs `:2537`, `:2547` vs `:2556`).
Clicking the sidebar's "All Bookmarks" leaves the header's tab looking inactive
and vice versa — confirmed in the live diagnostic below, where after clicking
sidebar items the header tab stayed stuck on `subnav-all`. The side nav is also
the only place Videos / Analytics / Groups exist, so the header nav is a strict
subset that adds nothing.

Canonical (DESIGN §9.3): one primary nav per surface. Keep the side nav, delete
`.page-header-nav`, keep the header for logo + search + account.

### D-4 · P1 · Side-nav items are 64px tall and locked behind `!important`

| | |
| --- | --- |
| **Current** | measured 64px per item (`.side-nav-link`, `dashboard.css:427`); **8 properties declared `!important`** including `font-size`, `color: #545f6c`, `padding`, `border-radius` |
| **Canonical** | 40px, `--text-label`, `--radius-md` (DESIGN §9.3) |

64px per nav item is roughly a list row's height — six items consume 384px of
vertical space. The `!important` block is worse than the values: **a token layer
cannot override this component.** Any restyle has to delete the `!important`s
first, which is why this is on the critical path rather than a cleanup.

### D-5 · P1 · Header shadow is a card shadow

`.page-header` uses `0 12px 40px rgba(26,28,29,0.06)` (and `0 12px 40px
rgba(0,0,0,0.3)` in dark). At 40px blur the fixed header reads as a floating
panel over the content rather than a chrome edge. Canonical `--shadow-sm` +
`backdrop-filter: blur(20px)` (DESIGN §7). `rgba(26,28,29,…)` is another orphan
of the retired palette.

### D-6 · P1 · Page background bypasses the theme token

`.bookmarks-page` hardcodes `background: #f9f9fa` in light and only falls back to
`var(--bg)` under `[data-theme="dark"]`. So light mode ignores the token entirely
(`#f9f9fa` vs the token's `#f9fafb` — a 1-value difference that exists for no
reason), and any future change to `--bg` silently applies to dark only.

### D-7 · P1 · Purple is `#732ee4`, not the token's `#8b5cf6`

13 occurrences in `dashboard.css`, 5 more in the webapp, plus one `#9b4ff4`.
`--secondary` (`#8B5CF6`) is defined and unused. Canonical `--color-ai` `#8b5cf6`
(DESIGN §3.3), scoped to AI features only.

### D-8 · P1 · Danger red is four different reds

`#ef4444` (9×), `#f87171` (5×), `#ba1a1a` (1×, Material-You error), plus
`#dc2626` / `#e53e3e` in the webapp. Canonical `--color-danger` `#ef4444` +
`--color-danger-deep` `#b91c1c` (DESIGN §3.3).

### D-9 · P2 · Twelve border radii

4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24, plus `50%`, `99px`, `999px`,
`9999px` for the same "pill/circle" intent. Only 5 of ~130 radius declarations
use a token. Canonical: six values (DESIGN §6).

### D-10 · P2 · `outline: none` with no replacement ring

Nine occurrences across the extension CSS (`dashboard.css:131, 680, 700, 1833,
2129, 3953`; `side-panel.css:377, 709, 1213`), including the header and toolbar
search inputs. Keyboard users lose the focus indicator entirely. DESIGN §9.4 /
§10.

### D-11 · P2 · Off-palette one-offs

`#e8dcc8`→`#c9b99a` (a beige gradient, no palette basis), `#f5f3ef`, `#c9b99a`,
`#4da1ee`, `#4db8a8`, `#4fdbc8`, `#c4cac8`. Each is a single-use value with no
token and no relationship to the ramp.

---

## S — Extension side panel

### S-1 · P1 · Type runs below the legibility floor

| Size | Declarations |
| --- | --- |
| 12px | 19 |
| 10px | **17** |
| 11px | 16 |
| 13px | 13 (body default) |
| 9px | **4** |

Narrower than the dashboard's problem — a 320–400px rail legitimately runs
denser — but 4 declarations at 9px (`.ai-insights-label`, `.tag-badge`,
`.sp-social-sup`, `.quick-tag-btn`) are below any reasonable floor. Canonical
(DESIGN §4.2, side-panel exception): body 14px, labels 13px, captions 12px,
overlines 11px, **nothing under 11px**.

### S-2 · P1 · Wordmark is flat `--accent-hover`, not `--primary-deep`

`.sp-logo-text` uses `color: var(--accent-hover)` (`#0d9488`). Canonical is
`--color-primary-deep` (`#0f766e`) — the AA-safe teal for text (DESIGN §3.4).
`#0d9488` on white is 3.74:1, below AA for 15px text, and it is a different teal
from both other surfaces' wordmarks (§D-2).

### S-3 · P1 · Glass header hardcodes both theme backgrounds

`.side-panel-header` uses `rgba(255,255,255,0.85)` with a `[data-theme="dark"]`
override of `rgba(15,16,17,0.85)`. The dashboard's equivalent uses
`rgba(10,10,15,0.85)` for dark, and the webapp nav uses `var(--nav-bg)`
(`rgba(10,10,15,0.85)`). So the two extension surfaces have *visibly different*
dark glass headers. Canonical: `--color-surface-glass`.

### S-4 · P2 · Discord blurple in the brand gradient

`linear-gradient(135deg, #14B8A6, #5865f2)` — a teal→Discord-blurple gradient.
Whatever it marks, it puts a third-party brand colour in a ClipMark gradient.
Canonical `--gradient-brand`.

### S-5 · P2 · Duplicated global reset

`side-panel.css:14–18` re-declares the `*, *::before, *::after` reset that
`design-tokens.css` (imported on line 5) already ships, as does
`dashboard.css`. Symptom of the token file carrying base styles it shouldn't —
see `ADOPTION.md` step 1.2.

---

## X — Cross-surface

### X-1 · P1 · The extension loads fonts from Google's CDN at runtime; the website self-hosts

`dashboard.html:7–10` and `side-panel.html:7–10` `<link>` to
`fonts.googleapis.com`. The webapp uses `next/font/google` (build-time, inlined,
preloaded).

Three consequences: every side-panel open is a request to Google from a
privacy-marketed extension; offline the extension renders in the fallback face;
and it's the sort of remote resource Chrome Web Store review flags.

The two extension pages also request **different axis sets from each other** —
`JetBrains+Mono:wght@400;700` (dashboard) vs bare `JetBrains+Mono` (side panel),
and different Material Symbols axes (`wght,FILL@100..700,0..1` vs
`opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200`). The two extension surfaces
do not have the same fonts available. Canonical: self-host, identical
declarations (DESIGN §4.1).

### X-2 · P1 · Teal fails WCAG AA as text *and* as a button fill

Measured against white:

| | Ratio | AA body (4.5:1) | AA large (3:1) |
| --- | --- | --- | --- |
| `#14b8a6` (`--accent`) | **2.49** | ✗ | ✗ |
| `#0d9488` (`--accent-hover`) | 3.74 | ✗ | ✓ |
| `#0f766e` (`--primary-deep`) | **5.47** | ✓ | ✓ |

Two separate problems:

1. **Teal as text.** `#14b8a6` is used as a text/icon colour in the dashboard
   theme-toggle hover, tag pills, and several webapp accents. Canonical is
   `--color-accent-text` (`#0f766e` light, `#5eead4` dark = 12.07:1) — DESIGN §3.4.
2. **Teal as a fill.** Contrast is symmetric, so **white on `#14b8a6` is also
   2.49:1**. The primary CTA — `.primary-btn` in `globals.css`, the nav
   "Get the extension" button, the hero CTA — fails AA at every size. This is not
   a sweep; it's a **product decision Ash should make**: darken primary fills to
   `#0d9488` (3.74:1, passes large-text only), darken to `#0f766e` (5.47:1,
   passes fully but reads much less bright), or accept the current button as-is.

Related: `--text-muted` (`#9ca3af` today, slate-400 `#94a3b8` proposed) is
**2.45:1** on the page background. It is used as a text colour in the footer
link titles, side-nav section labels, and dashboard metadata. It should be
icons-and-dividers only.

### X-3 · P2 · No SVG logo

Every surface renders a raster PNG. The website nav loads a **154KB**
`clipmark-logo.png` into a 34px slot. An SVG is a prerequisite for any real logo
work (DESIGN §2).

### X-4 · P1 · Five neutral ramps (this was undercounted as three)

| Ramp | Distinct values in use | Where |
| --- | --- | --- |
| Tailwind **gray** | 10 | `tokens.css` (the "official" tokens), webapp, dashboard |
| Tailwind **slate** | 10 | webapp inline styles (`#0f172a` 68×, `#64748b` 61×, `#f1f5f9` 52×) |
| **Material-You / "Curator"** | 17 | both extension stylesheets + leaking into webapp (`#1a1c1d` 49×, `#545f6c` 46×, `#6c7a77` 16×, plus a near-white tail `#f9f9fa` / `#f3f3f4` / `#f3f3f5` / `#f0f0f1` / `#edeeef` / `#f8f9fa` / `#fcfcfd` / `#e8e8e9`) |
| **CSS-shorthand greys** | 10 | dashboard (8) + webapp (5) — `#111`, `#1a1a1a`, `#2a2a2a`, `#444`, `#888`, `#aaa`, `#ccc`, `#e0e0e0`, `#f0f0f0` |
| **Cream / beige** | 4 | dashboard (3) + side panel (1) — `#e8dcc8`, `#c9b99a`, `#f5f3ef`, `#faf6ec` |
| *(stray)* Tailwind zinc | 1 | dashboard — `#e4e4e7` |

An earlier draft of this audit said "three neutral ramps". That collapsed the
CSS-shorthand greys into the Material-You bucket and missed the cream set
entirely. Verified count is **five ramps plus one stray value**, 52 distinct
neutral hexes total. See §X-6 for the full census.

DESIGN §3.2 picks slate and explains why, and flags gray as the legitimate
minimum-churn alternative. **This is the one decision that needs Ash's explicit
answer before any restyle starts** — it determines whether the first migration
PR touches the extension or the webapp.

### X-6 · P1 · Colour-system census — 25 systems, 105 values, 698 occurrences

Every hex literal in `webapp/app/**.{tsx,css}` (excluding the generated
`design-tokens.css`), `extension/styles/{dashboard,side-panel}.css`, and
`extension/src/popup/{dashboard,side-panel}.js`, normalised (3-digit expanded,
alpha dropped) and matched against the Tailwind ramps. Pure black/white excluded.

**105 distinct values** — 56 sit on a Tailwind ramp, **49 sit on no ramp at all**.
Occurrence volume: 373 inline hexes in the webapp + 325 in the two extension
stylesheets = **698 hardcoded colours**.

| Family | Systems | Systems in use |
| --- | --- | --- |
| Neutral | **5** (+1 stray) | slate · gray · Material-You/Curator · CSS-shorthand greys · cream/beige · *(stray zinc)* |
| Teal / brand | **4** | Tailwind teal · M3 off-ramp (`#006b5f`, `#0d5f57`) · ad-hoc (`#0ea5a0`, `#4db8a8`, `#4fdbc8`) · Tailwind emerald |
| Purple / AI | **3** | Tailwind violet · Tailwind purple · ad-hoc (`#732ee4`, `#9b4ff4`, `#b591ff`, `#d2bbff`) |
| Red / danger | **3** | Tailwind red · Tailwind rose · M3 error `#ba1a1a` + `#e53e3e` |
| Green / success | *(counted under teal)* | Tailwind green · Tailwind emerald |
| Other semantic | **5** | amber · orange · pink · Tailwind blue · ad-hoc blue `#4da1ee` |
| Third-party brand | **3** | Google (4 values) · Discord blurple · YouTube red — legitimate, keep |

Per surface (distinct systems present):

| | Website | Ext dashboard | Ext side panel |
| --- | --- | --- | --- |
| Systems in use | **19** | **16** | **7** |
| Distinct values | 79 | 46 | 14 |

Two details worth noting:

- **`--primary-deep` (`#0f766e`) is defined and effectively unused** — zero
  literal occurrences anywhere, and only 9 `var(--primary-deep)` references
  against 65 `var(--accent*)`. The AA-safe teal exists and nothing reaches for it
  (§X-2).
- **The extension side panel is the cleanest surface** at 7 systems / 14 values.
  The website is the worst at 19 / 79, driven by inline styling (§W-6).

Excluding the three legitimate third-party brand palettes, **ClipMark's own
design language is currently 22 competing colour systems where it should be 1.**

### X-5 · P2 · `packages/design-system/README.md` documents files that don't exist

It describes `colors.css`, `typography.css`, `spacing.css`, `shadows.css`,
`radius.css` as the package contents. None exist — there is only `tokens.css`. It
also states the primary typeface is Inter with no mention of Plus Jakarta Sans,
and gives `--font` as a native-stack value that hasn't been true since the
Next.js font work. Anyone onboarding gets a wrong picture of the system.

---

## N — Extension dashboard navigation bug (diagnosis only, no fix)

**Reported:** nav items on `chrome-extension://<id>/src/pages/dashboard.html`
don't navigate.

**Verdict: yes — this is the same class of bug as the earlier packaged-dashboard
bundling failure.** Same mechanism, same file, same missing artifact. It is not a
router or base-path problem; the dashboard has no router.

### Root cause

`extension/src/pages/dashboard.html` ends with:

```html
<script type="module" src="./dashboard.entry.js"></script>
```

`dashboard.entry.js` imports `../popup/dashboard.js`, and **every nav listener in
the dashboard is registered inside one `document.addEventListener('DOMContentLoaded', …)`
block** at `extension/src/popup/dashboard.js:2321`, with the nav wiring at lines
2527–2626. If that module never loads, no listener is ever attached — the buttons
render, are visible, are `pointer-events: auto`, and do nothing.

`dashboard.html` is only reachable via `web_accessible_resources`, not via the
manifest, so crxjs copies it **verbatim** instead of treating it as an HTML entry
— and never builds `dashboard.entry.js`. The `<script src>` then points at a file
that doesn't exist in `dist/`.

### Reproduced

Loading the current `extension/dist/` (v1.0.1, built 2026-08-05 00:50) unpacked in
Chrome and opening the dashboard:

```
[requestfailed] chrome-extension://<id>/src/pages/dashboard.entry.js
                :: net::ERR_FILE_NOT_FOUND
[requestfailed] chrome-extension://<id>/styles/design-tokens.css
                :: net::ERR_FILE_NOT_FOUND
```

Clicking each sidebar item — Videos, Groups, Reminders, Shared, All Bookmarks —
produced **no active-state change and no content change** on any of them. The
bookmark list stays on "Loading bookmarks…" forever. Every button on the page is
inert, not just nav: search, sort, export, import, sign-in, theme.

`ls extension/dist/src/pages/` → `dashboard.html`, `side-panel.html`. No
`dashboard.entry.js`. `ls extension/dist/assets/` → no `dashboard-*.js`, no
`dashboard-*.css`.

### The fix already exists in the repo — the local `dist/` predates it

`extension/vite.config.mjs:74–84` declares `rollupOptions.input.dashboard`
pointing at `src/pages/dashboard.html`, with a comment describing exactly this
failure. That fix works: the packaged **1.0.2** zip contains
`assets/dashboard-DqfMfiU9.js` (69KB) and its `dashboard.html` has the hoisted
`<script type="module" crossorigin src="/assets/dashboard-DqfMfiU9.js">` instead
of the dangling relative reference.

Running the same diagnostic against the unzipped 1.0.2 build: **all five sidebar
nav items switch active state and re-render the content region correctly**, with
a clean console (one info log).

So the current `extension/dist/` on disk is a **stale pre-fix build**. If Ash is
testing via "Load unpacked" against `extension/dist/`, that is the bug, and the
whole page — not only nav — is dead.

### Recommended fix (for the v1.0.2 session or a follow-up)

1. **Immediate:** `make ext-build` to regenerate `extension/dist/`, then reload
   the unpacked extension. Confirm `dist/assets/dashboard-*.js` exists before
   testing. Confirm which artifact Ash actually loaded — if it was the 1.0.2 zip
   and nav still fails, the diagnosis changes and needs the specific console
   output.
2. **Prevent recurrence — add a build guard.** `api-base-guard.mjs` and
   `content-globals-guard.mjs` already establish the pattern: a `closeBundle`
   hook that fails the build when the shipped artifact is wrong. Add a third that
   asserts every `<script src>` in each `dist/**/*.html` resolves to a file that
   exists in `dist/`. This bug has now shipped twice from the same root cause and
   is invisible to source-loaded E2E tests; a five-line guard closes the class.
3. **Add a packaged-dashboard smoke test.** `tests/recall-packaged.spec.ts`
   already loads `extension/dist` for exactly this reason ("Keep at least one
   spec pointed at dist"). Add a sibling that opens
   `chrome-extension://<id>/src/pages/dashboard.html`, asserts zero
   `requestfailed` events, and asserts one sidebar click changes
   `.subnav-link--active`.
4. **Secondary (P2), same root cause:** the packaged `styles/dashboard.css` still
   contains `@import url('./design-tokens.css')`, but `design-tokens.css` is not
   copied into `dist/styles/` — a second `ERR_FILE_NOT_FOUND` (visible in the
   trace above). Harmless on the dashboard page today because the bundled
   `assets/dashboard-*.css` has the tokens inlined, but `styles/dashboard.css` is
   a `web_accessible_resource`, so anything that loads it gets an unstyled sheet.
   Likewise `src/popup/dashboard.js` ships verbatim as a `web_accessible_resource`
   (113KB) while its `../constants.module.js` import chain is absent from
   `dist/` — dead weight that would 404 if anything loaded it. Both are stale
   `web_accessible_resources` entries left over from the pre-bundling layout.

**Not the cause** (ruled out): CSS hiding or overlaying nav items (all items
measured visible, `pointer-events: auto`, unobstructed at 1440px); a
media-query dead band (side nav ≥768px, mobile nav <768px, no gap); missing DOM
ids (all present); `dashboard.js` throwing before the listeners attach (in the
working build the init path completes cleanly).

---

## Prioritised fix list

### Quick wins — mechanical, low risk, no design decisions

| # | Item | Surface | Owner |
| --- | --- | --- | --- |
| 1 | `Clipmark` → `ClipMark`, 131 occurrences (§W-1) | W | website |
| 2 | Rebuild `extension/dist/`; verify `dist/assets/dashboard-*.js` (§N.1) | D | **v1.0.2** |
| 3 | Add `color:` fallback to `.page-title`, then make it solid (§D-2) | D | **v1.0.2** |
| 4 | `#006b5f` → `#0f766e` — 52× webapp, 20× dashboard (§D-2, DESIGN §3.1) | W + D | both |
| 5 | `#732ee4` → `#8b5cf6`; consolidate the four reds (§D-7, §D-8) | W + D | both |
| 6 | Delete the 9 `outline: none` or pair each with a focus ring (§D-10) | D + S | **v1.0.2** |
| 7 | Nav height 80px → 64px (§W-3) | W | website |
| 8 | Fix `README.md` in `packages/design-system` (§X-5) | X | either |
| 9 | Delete the duplicate `--font-family-*` block in `globals.css` (§W-8) | W | website |
| 10 | Theme the footer — it's white in dark mode (§W-7) | W | website |

### Larger restyles — need DESIGN.md signed off first

| # | Item | Surface | Owner |
| --- | --- | --- | --- |
| 11 | **Pick the neutral ramp** (§X-4) — gates everything below | X | **Ash** |
| 12 | Dashboard type re-scale: 13→15px body, 10→12px meta, 11px floor (§D-1) | D | **v1.0.2** |
| 13 | Side-panel type re-scale, 11px floor (§S-1) | S | **v1.0.2** |
| 14 | Delete `.page-header-nav`; side nav becomes the only nav (§D-3) | D | **v1.0.2** |
| 15 | Strip the 8 `!important`s from `.side-nav-link`; 64px → 40px (§D-4) | D | **v1.0.2** |
| 16 | Self-host extension fonts; unify the two font requests (§X-1) | D + S | **v1.0.2** |
| 17 | Adopt one type scale on the website; retire 11 `clamp()`s (§W-4) | W | website |
| 18 | Extract inline styles into `cm-` classes (§W-6) — **the adoption blocker** | W | website |
| 19 | Neutral sweep: `#545f6c`/`#1a1c1d`/`#6c7a77` → tokens (§W-5) | W | website |
| 20 | Radius consolidation to six values (§D-9, §W-9) | all | both |
| 21 | Teal-text contrast pass; decide on the primary-fill case (§X-2) | all | both |
| 22 | Produce an SVG logo (§X-3) | X | either |

### Build hardening — not visual, but this is where it belongs

| # | Item | Owner |
| --- | --- | --- |
| 23 | Vite guard: every `<script src>` in `dist/**/*.html` resolves (§N.2) | **v1.0.2** |
| 24 | Packaged-dashboard smoke test (§N.3) | **v1.0.2** |
| 25 | Clean up stale `web_accessible_resources` (§N.4) | **v1.0.2** |

### Split by owner

- **Fold into extension v1.0.2** (both files are already being edited there):
  2, 3, 6, 12, 13, 14, 15, 16, 23, 24, 25 — plus the extension half of 4, 5, 20.
- **Website** (coordinate with the in-flight CTA work): 1, 7, 9, 10, 17, 18, 19 —
  plus the webapp half of 4, 5, 20.
- **Ash**: 11 (neutral ramp), and sign-off on DESIGN.md generally.
- **Either**: 8, 21, 22.

Suggested order: quick wins 1–10 land independently and immediately. 11 unblocks
12–21. 18 is the true gate on the website side — until inline styles move into
classes, no amount of token work reaches the marketing pages.
