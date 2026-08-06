# ClipMark Design System

> **Status: PROPOSAL — awaiting Ash's sign-off.**
> Nothing in this document is wired into any component yet. It codifies the brand
> that the three surfaces are *already reaching for*, picks one canonical value
> everywhere they disagree, and cleans up the drift. The companion documents are
> [DESIGN-AUDIT.md](./DESIGN-AUDIT.md) (what's broken today, prioritised) and
> [`packages/design-system/ADOPTION.md`](../packages/design-system/ADOPTION.md)
> (how each surface would adopt the tokens).

The three surfaces this governs:

| Surface | Code | Entry point |
| --- | --- | --- |
| **Website** | `webapp/` (Next.js 14, App Router) | `clipmark.mithahara.com` |
| **Side panel** | `extension/src/pages/side-panel.html` + `extension/styles/side-panel.css` | Chrome side panel, ~320–400px rail |
| **Dashboard** | `extension/src/pages/dashboard.html` + `extension/styles/dashboard.css` | `chrome-extension://<id>/src/pages/dashboard.html`, full tab |

Design tokens live in `packages/design-system/`. That is the only place token
values are ever edited; `make sync-tokens` copies them into the two consuming
projects.

---

## 1. Brand wordmark

### The name is **ClipMark**

Capital **C**, capital **M**, one word, no space, no hyphen. The internal capital
is load-bearing: it reads the product as *Clip* + *Mark*, which is the whole
proposition (mark a clip). Lowercasing the M loses that and reads as a
misspelling of an unrelated word.

| | |
| --- | --- |
| ✅ Correct | `ClipMark` |
| ✅ Correct | `ClipMark Pro` |
| ❌ Wrong | `Clipmark` — lowercase M, currently used **131×** across `webapp/app/` |
| ❌ Wrong | `clipmark` in prose |
| ❌ Wrong | `CLIPMARK`, `Clip Mark`, `Clip-Mark`, `ClipMark™`, `Clipmark.com` |

**Lowercase `clipmark` is correct — and only correct — in machine contexts**,
where casing is not brand expression:

- domains and URLs — `clipmark.mithahara.com`, `/clipmark-logo.png`
- file names, package names, CSS class prefixes, storage keys, env var stems
- code identifiers (`clipmark-api-base-guard`, `cm-` class prefix)

Everything a human reads as a name — page titles, headings, body copy, OG
metadata, JSON-LD `name`, the Chrome Web Store listing, toast text, email — is
`ClipMark`.

**Current state:** the extension is already 100% correct (`ClipMark`, 18
occurrences, including `manifest.json` `name`/`short_name`, which is what the
Chrome Web Store actually displays). The webapp is 100% wrong (`Clipmark`, 131
occurrences, 0 correct) — including `<title>`, OpenGraph, Twitter card, and
JSON-LD. **The store listing and the website currently spell the product
differently.** See AUDIT §W-1.

### Wordmark rendering

| Context | Treatment |
| --- | --- |
| Website nav | `--font-display` / 800 / 24px / `--color-text` / `-0.03em` tracking, solid |
| Extension dashboard header | `--font-display` / 800 / 20px / `--color-primary-deep`, solid |
| Extension side panel header | `--font-display` / 700 / 15px / `--color-primary-deep`, solid |

**The wordmark is never a gradient.** It is a solid colour in every surface. See
§5.3 for why, and AUDIT §D-2 for the bug this rule fixes.

---

## 2. Logo

The mark is a rounded-square teal tile containing a white play triangle fused
with a bookmark ribbon. Ships as `extension/assets/icons/icon-{16,48,128}.png`
and `webapp/public/clipmark-logo.png`.

**Usage**

- Minimum size 16px. Below 24px only the tile + play shape stays legible; do not
  attempt to render the ribbon notch smaller.
- Clear space on all sides ≥ 25% of the mark's width.
- Lockup with the wordmark is **horizontal only**, mark on the left, gap = 25%
  of mark width (8px at a 34px mark, 7–8px at a 22–24px mark).
- Never recolour the tile, never place the mark on a teal background, never
  apply a drop shadow, never rotate or skew it, never outline it.
- The tile already carries its own corner radius — do not add `border-radius` to
  the `<img>`.

**Gap:** there is no SVG version. Every surface renders a raster PNG, so the
website nav ships a 154KB image for a 34px slot. Producing an SVG is a
prerequisite for any real logo cleanup (AUDIT §X-3).

---

## 3. Colour

### 3.1 Primary — teal

The brand ramp is Tailwind's `teal`, which is where `#14B8A6` (the existing
`--accent`) already sits. Anchoring to a real ramp gives us tints and shades that
are guaranteed to harmonise, instead of the ad-hoc off-ramp values in use today.

| Token | Hex | Ramp | Use |
| --- | --- | --- | --- |
| `--color-primary-50` | `#f0fdfa` | teal-50 | page-level tinted washes |
| `--color-primary-100` | `#ccfbf1` | teal-100 | badge / pill backgrounds |
| `--color-primary-200` | `#99f6e4` | teal-200 | borders on tinted surfaces |
| `--color-primary-300` | `#5eead4` | teal-300 | **dark-mode** accent text |
| `--color-primary-400` | `#2dd4bf` | teal-400 | dark-mode hover |
| **`--color-primary`** | **`#14b8a6`** | teal-500 | **the brand colour** — fills, icons, focus rings |
| `--color-primary-hover` | `#0d9488` | teal-600 | hover/active on primary fills |
| `--color-primary-deep` | `#0f766e` | teal-700 | teal *text* on light backgrounds (AA on white) |
| `--color-primary-800` | `#115e59` | teal-800 | gradient tails, dense fills |
| `--color-primary-900` | `#134e4a` | teal-900 | dark surfaces with a teal cast |

`--color-primary-tint` = `rgba(20, 184, 166, 0.12)` — the standard translucent
teal background (replaces `--accent-light`).

**Canonical decision — retire `#006b5f`.** It is used **52× in the webapp** and
**20× in the extension dashboard**, and it is not on the teal ramp: it is a
leftover from an earlier Material-You-derived palette. It is *nearly* teal-700
but not it, so surfaces that use it are a half-step off from surfaces that use
`--primary-deep`. Everywhere it appears it becomes **`#0f766e`**
(`--color-primary-deep`). This is the single highest-volume colour change in the
proposal.

Also retired: `#4db8a8`, `#4fdbc8`, `#0d5f57`, `#9b4ff4`, `#6ee7b7`.

### 3.2 Neutrals — slate

> **This is the decision that needs Ash's explicit yes.** It is the one change
> with real blast radius, and there is a defensible alternative.

There are currently **three** neutral ramps live at once:

| Ramp | Where | Sample |
| --- | --- | --- |
| Tailwind **gray** | `packages/design-system/tokens.css` (the "official" tokens) | `#111827`, `#6b7280`, `#9ca3af`, `#e5e7eb`, `#f9fafb` |
| Tailwind **slate** | `webapp/` inline styles, ~290 hardcoded uses | `#0f172a` (68×), `#64748b` (61×), `#f1f5f9` (52×), `#94a3b8` (40×), `#e2e8f0`, `#1e293b`, `#f8fafc` |
| Ad-hoc / Material-You | `extension/styles/*`, and leaking into the webapp | `#1a1c1d` (49× webapp), `#545f6c` (46× webapp, 12× dashboard), `#6c7a77`, `#888`, `#aaa`, `#f3f3f4`, `#f9f9fa` |

**Recommendation: slate.** Reasons: (a) the website — the surface the brand is
actually judged on — already uses it almost exclusively, so this ratifies the
most-recent, most-considered work rather than reverting it; (b) slate's cool
cast sits with teal, while gray's neutral cast makes teal look slightly
oversaturated next to it; (c) the extension surfaces mostly consume neutrals
through `var(--text)` / `var(--bg)` tokens, so they migrate by changing token
values rather than by touching hundreds of call sites.

*(Alternative if Ash prefers minimum churn: keep **gray**, since it's what
`tokens.css` already declares. That's a legitimate choice — it makes the
extension a no-op and pushes all the work onto the webapp's ~290 hardcoded
slate values. Recommend slate; will implement either.)*

| Token | Hex | Ramp |
| --- | --- | --- |
| `--color-neutral-0` | `#ffffff` | white |
| `--color-neutral-50` | `#f8fafc` | slate-50 |
| `--color-neutral-100` | `#f1f5f9` | slate-100 |
| `--color-neutral-200` | `#e2e8f0` | slate-200 |
| `--color-neutral-300` | `#cbd5e1` | slate-300 |
| `--color-neutral-400` | `#94a3b8` | slate-400 |
| `--color-neutral-500` | `#64748b` | slate-500 |
| `--color-neutral-600` | `#475569` | slate-600 |
| `--color-neutral-700` | `#334155` | slate-700 |
| `--color-neutral-800` | `#1e293b` | slate-800 |
| `--color-neutral-900` | `#0f172a` | slate-900 |
| `--color-neutral-950` | `#020617` | slate-950 |

Retired: `#1a1a1a`, `#1a1c1d`, `#2a2a2a`, `#3a3f3d`, `#3c4947`, `#545f6c`,
`#6c7a77`, `#8a8f8d`, `#888`, `#aaa`, `#ccc`, `#111`, `#c4cac8`, `#bbcac6`,
`#f0f0f0`, `#f0f0f1`, `#f3f3f4`, `#f3f3f5`, `#f8f9fa`, `#f9f9fa`, `#fcfcfd`,
`#edeeef`, `#e0e0e0`, `#e4e4e7`, `#e8e8e9`.

### 3.3 Semantic

| Role | Token | Light | Deep (text) | Tint (bg) | Notes |
| --- | --- | --- | --- | --- | --- |
| Success | `--color-success` | `#22c55e` | `#15803d` | `#f0fdf4` | keeps existing `--cta` |
| Danger | `--color-danger` | `#ef4444` | `#b91c1c` | `#fef2f2` | retires `#ba1a1a`, `#dc2626`, `#e53e3e`, `#f87171` |
| Warning | `--color-warning` | `#f59e0b` | `#b45309` | `#fffbeb` | |
| Info / AI | `--color-ai` | `#8b5cf6` | `#6d28d9` | `#f5f3ff` | retires `#732ee4` (13× dashboard, 5× webapp), `#9b4ff4` |

Purple is reserved for **AI features only** (Gemini Nano insights, summaries).
It is not a general-purpose accent.

### 3.4 Semantic surface aliases

These are what components actually reference. They flip under
`[data-theme="dark"]`; the ramp tokens above never do.

| Token | Light | Dark |
| --- | --- | --- |
| `--color-bg` | `--color-neutral-50` | `--color-neutral-950` |
| `--color-surface` | `--color-neutral-0` | `--color-neutral-900` |
| `--color-surface-raised` | `--color-neutral-0` | `--color-neutral-800` |
| `--color-surface-sunken` | `--color-neutral-100` | `--color-neutral-900` |
| `--color-border` | `--color-neutral-200` | `--color-neutral-800` |
| `--color-border-strong` | `--color-neutral-300` | `--color-neutral-700` |
| `--color-text` | `--color-neutral-900` | `--color-neutral-50` |
| `--color-text-secondary` | `--color-neutral-500` | `--color-neutral-400` |
| `--color-text-muted` | `--color-neutral-400` | `--color-neutral-500` |
| `--color-text-on-primary` | `#ffffff` | `#ffffff` |
| `--color-accent-text` | `--color-primary-deep` | `--color-primary-300` |

`--color-accent-text` exists because `#14b8a6` on white is **2.49:1** — it fails
WCAG AA for text at any size, including the 3:1 large-text bar. Teal *text* must
always be `--color-primary-deep` (`#0f766e` = **5.47:1**) in light mode and
`--color-primary-300` (`#5eead4` on slate-900 = **12.07:1**) in dark.

Contrast is symmetric, so **white on `#14b8a6` is also 2.49:1** — a primary
button filled with `--color-primary` and white text fails AA at every size.
White on `--color-primary-hover` (`#0d9488`) is 3.74:1, which passes the
large-text bar only. See AUDIT §X-2 — this needs a deliberate decision, and the
`--shadow-brand` CTA in §9.1 is the affected component.

`--color-text-muted` (slate-400 on slate-50 = **2.45:1**) is likewise not a text
colour. Use it for icons, dividers and decorative glyphs only; anything a user
must read uses `--color-text-secondary` (slate-500 = 4.55:1).

### 3.5 Gradients

Six different teal gradients ship today. **Two survive.**

```css
/* Surfaces, badges, avatar tiles, brand fills. Always 135deg, always light→dark. */
--gradient-brand: linear-gradient(135deg, #14b8a6 0%, #0f766e 100%);

/* Gradient TEXT only. Dark→light so the leading glyph has contrast on white. */
--gradient-brand-text: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);

/* Large neutral display headings only. Never below 32px. */
--gradient-heading: linear-gradient(135deg, var(--color-text) 0%, var(--color-text-secondary) 100%);
```

Retired: `135deg #006b5f→#14b8a6`, `135deg #14b8a6→#006b5f`, `135deg
#14B8A6→#006B5F`, `135deg #14B8A6→#0D9488` (wrong direction for text),
`135deg #14B8A6→#5865f2` (Discord blurple — off-brand), `135deg
#e8dcc8→#c9b99a` (beige, no palette basis).

**Gradient text always declares a solid `color` first**, so a surface where
`background-clip: text` fails renders readable text instead of nothing:

```css
.thing {
  color: var(--color-primary-deep);           /* fallback FIRST */
  background: var(--gradient-brand-text);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

---

## 4. Typography

### 4.1 Families

| Token | Family | Role |
| --- | --- | --- |
| `--font-display` | Plus Jakarta Sans | all headings, the wordmark, buttons, nav labels |
| `--font-body` | Inter | all body copy, form controls, tables |
| `--font-mono` | JetBrains Mono | timestamps, video IDs, code, export previews |

All three fall back to `system-ui, sans-serif` / `monospace`.

**Canonical: self-host, everywhere.** The webapp already does (`next/font/google`
→ inlined + preloaded). The two extension pages instead `<link>` to
`fonts.googleapis.com` at runtime — which (a) sends every side-panel open to
Google, (b) renders in the fallback face offline, and (c) is the kind of remote
resource Chrome Web Store review flags. They also request *different* axis sets
from each other (`JetBrains+Mono:wght@400;700` vs bare `JetBrains+Mono`;
different Material Symbols axes), so the two extension surfaces literally do not
have the same fonts available. See AUDIT §X-1.

### 4.2 Type scale

Root 16px. Sizes in px because every surface here uses px today and mixing units
across three codebases is how drift starts.

| Token | Size | Line-height | Weight | Tracking | Use |
| --- | --- | --- | --- | --- | --- |
| `--text-display` | `clamp(44px, 7.5vw, 88px)` | 0.95 | 800 | −0.05em | marketing hero `h1` — **one per site** |
| `--text-h1` | 36px | 1.15 | 800 | −0.03em | page title |
| `--text-h2` | 28px | 1.2 | 800 | −0.02em | section title |
| `--text-h3` | 20px | 1.3 | 700 | −0.01em | card / subsection title |
| `--text-h4` | 17px | 1.35 | 700 | 0 | small heading, list-item title |
| `--text-body-lg` | 17px | 1.6 | 400 | 0 | marketing lead paragraph |
| `--text-body` | 15px | 1.55 | 400 | 0 | **default body** — website + dashboard |
| `--text-body-sm` | 14px | 1.5 | 400 | 0 | dense body, side-panel default |
| `--text-label` | 13px | 1.4 | 600 | 0 | UI labels, buttons, nav items |
| `--text-caption` | 12px | 1.4 | 500 | 0 | metadata, timestamps, helper text |
| `--text-overline` | 11px | 1.3 | 700 | 0.12em | uppercase eyebrows, section labels |

**Hard floor: 11px. Nothing below 11px ships.**

Today the extension dashboard has **21 declarations at 10px**, one at 9px and
one at 8px, and uses 13px as its *body* size. That is the "poor dashboard
typography" Ash called out: a full-tab desktop page reading at side-panel
density. Moving dashboard body from 13px → 15px and its metadata from 10px →
12px is the single highest-impact typography fix in this proposal.

**Side-panel exception.** The side panel is a ~320–400px rail, so it may step the
scale down one notch — body `--text-body-sm` (14px), labels 13px, captions 12px,
overlines 11px. It may **not** go below 11px. It currently runs 13px body with 17
declarations at 10px and 4 at 9px.

### 4.3 Heading vs body

- **Headings** are always `--font-display`, weight 700–800, negative tracking
  that tightens as size grows, line-height 0.95–1.35.
- **Body** is always `--font-body`, weight 400 (450 for lead paragraphs), zero
  tracking, line-height ≥ 1.5 (1.6–1.75 for long-form marketing copy).
- Never set a heading in the body face or vice versa. Never use `font-family:
  inherit` on a heading — it appears **16×** in the extension CSS and is why some
  dashboard headings silently render in Inter.
- Uppercase is reserved for `--text-overline`. Uppercase body copy never ships.

### 4.4 Title colouring rules

1. **Default: solid `--color-text`.** Every heading, on every surface, unless a
   rule below says otherwise.
2. **Gradient text is allowed on at most one element per page**, only on the
   marketing site, only inside the hero, and only using `--gradient-brand-text`.
   It exists to emphasise a single phrase, not to decorate headings generally.
3. **App chrome never uses gradient headings.** Dashboard page titles, side-panel
   section titles and modal titles are solid.
4. **The wordmark is never a gradient** (§1). Solid `--color-text` on the
   website, solid `--color-primary-deep` in extension chrome.
5. **Teal heading text uses `--color-accent-text`**, never raw `--color-primary`
   (§3.4 — contrast).
6. **Gradient text always declares a solid `color` fallback first** (§3.5).
7. Section eyebrows use `--text-overline` + `--color-accent-text` on
   `--color-primary-tint`, never a gradient.

---

## 5. Spacing

4px base scale. Nothing off-scale.

| Token | px | | Token | px |
| --- | --- | --- | --- | --- |
| `--space-1` | 4 | | `--space-8` | 32 |
| `--space-2` | 8 | | `--space-10` | 40 |
| `--space-3` | 12 | | `--space-12` | 48 |
| `--space-4` | 16 | | `--space-16` | 64 |
| `--space-5` | 20 | | `--space-20` | 80 |
| `--space-6` | 24 | | `--space-24` | 96 |

Layout constants:

| Token | Value | Note |
| --- | --- | --- |
| `--layout-max-width` | 1240px | marketing content column |
| `--layout-gutter` | 24px (16px < 768px, 12px < 480px) | |
| `--layout-nav-height` | 64px | **canonical** — website nav is 80px today, extension dashboard header is 64px |
| `--layout-side-nav-width` | 256px | matches extension dashboard + webapp dashboard |

Off-scale values to retire (extension): 7px gaps, 9px/9px-pill paddings,
`6px 9px`, `10px 14px`, `padding: 2px 7px`.

---

## 6. Border radius

Twelve distinct radii ship today across the extension alone (4, 5, 6, 7, 8, 9,
10, 12, 14, 16, 18, 20, 24, 50%, 99px, 999px, 9999px). Six survive.

| Token | px | Use |
| --- | --- | --- |
| `--radius-xs` | 4 | inline chips, tag badges, progress bars |
| `--radius-sm` | 8 | inputs, small buttons, icon buttons |
| `--radius-md` | 12 | buttons, app-chrome cards, popovers |
| `--radius-lg` | 16 | marketing cards, modals |
| `--radius-xl` | 24 | hero panels, feature blocks |
| `--radius-full` | 9999 | pills, avatars, toggles |

Circles use `--radius-full`, not `50%`.

**Note:** the existing token names collide with different values —
`--radius: 10px`, `--radius-sm: 6px`, `--radius-lg: 16px`. The proposal keeps the
*names* `--radius-sm` / `--radius-lg` but changes `--radius-sm` 6→8 and adds
`-xs`/`-md`/`-xl`; `--radius` (10px) is deprecated in favour of `--radius-md`
(12px). Mapping table in `ADOPTION.md`.

---

## 7. Elevation

Shadows tint toward `--color-neutral-900` (slate) rather than the current
`rgba(26,28,29,…)`, which is an orphan of the retired palette.

| Token | Value | Use |
| --- | --- | --- |
| `--shadow-xs` | `0 1px 2px rgba(15,23,42,0.06)` | resting inputs, subtle separation |
| `--shadow-sm` | `0 1px 3px rgba(15,23,42,0.08)` | list rows, chips |
| `--shadow-md` | `0 4px 12px rgba(15,23,42,0.08)` | cards at rest |
| `--shadow-lg` | `0 12px 32px rgba(15,23,42,0.10)` | cards on hover, popovers |
| `--shadow-xl` | `0 24px 48px rgba(15,23,42,0.14)` | modals, dialogs |
| `--shadow-brand` | `0 8px 24px rgba(20,184,166,0.28)` | primary CTA only |

Dark mode multiplies the alpha by ~3 (declared in the token file).

Rules: at most **one** elevation step change on hover; glass headers use
`--shadow-sm` plus `backdrop-filter: blur(20px)`, never a large shadow (the
extension dashboard header currently uses `0 12px 40px`, which reads as a
floating card rather than a header).

---

## 8. Motion

| Token | Value | Use |
| --- | --- | --- |
| `--ease` | `cubic-bezier(0.4, 0, 0.2, 1)` | everything |
| `--duration-fast` | 120ms | hover, focus, colour |
| `--duration-base` | 200ms | transforms, popovers |
| `--duration-slow` | 400ms | page/scroll reveals |

Every transform-based effect must be wrapped in a
`@media (prefers-reduced-motion: reduce)` opt-out. The webapp already does this
for `.cm-card` and `.cm-reveal`; the extension does it for `scroll-behavior`
only, and its hover transforms (`scale(1.1) rotate(20deg)` on the theme toggle,
card lifts) are not guarded.

---

## 9. Component patterns

### 9.1 Buttons

Shared: `--font-display`, weight 700, `--radius-md`, `--duration-fast` transition,
`transform: translateY(-1px)` on hover, `scale(0.97)` on active, visible
`:focus-visible` ring (`0 0 0 3px var(--color-primary-tint)`).

| Variant | Background | Text | Border | Shadow |
| --- | --- | --- | --- | --- |
| Primary | `--color-primary` → `--color-primary-hover` | `--color-text-on-primary` | none | `--shadow-brand` |
| Secondary | `--color-surface-sunken` | `--color-text` | `1px --color-border` | none |
| Ghost | transparent | `--color-text-secondary` → `--color-text` | none | none |
| Outline | transparent | `--color-accent-text` | `1px --color-primary` | none |
| Danger | `--color-danger` | `#fff` | none | none |

| Size | Height | Padding | Type |
| --- | --- | --- | --- |
| sm | 32px | `0 --space-3` | `--text-caption` |
| md | 40px | `0 --space-4` | `--text-label` |
| lg | 48px | `0 --space-6` | `--text-body` |

Disabled: `opacity: 0.5`, `cursor: default`, no shadow, no transform. (Today the
webapp's `.primary-btn:disabled` hardcodes `#e8e8e9` / `#bbcac6`, two retired
neutrals.)

### 9.2 Cards

- Background `--color-surface`, border `1px --color-border`, `--shadow-md`.
- Radius: `--radius-lg` on marketing, `--radius-md` in app chrome.
- Padding: `--space-8` (32px) marketing, `--space-5` (20px) app chrome,
  `--space-4` (16px) side panel.
- Hover (marketing only): `translateY(-4px)` + `--shadow-lg` + border →
  `--color-primary-200`. The current `-8px` lift is too much for a 20px-radius
  card and causes visible reflow on dense grids.
- Never nest a card inside a card. Use `--color-surface-sunken` for the inner
  region instead.

### 9.3 Navigation

**Top bar** (all three surfaces): height `--layout-nav-height` (64px), background
`--color-surface` at 85% alpha + `backdrop-filter: blur(20px)`, bottom border
`1px --color-border`, `--shadow-sm`, `z-index: 50`. Logo lockup left, actions
right.

**Side nav** (dashboard + webapp dashboard): width `--layout-side-nav-width`
(256px), `position: fixed`, `padding-top: calc(var(--layout-nav-height) +
--space-4)`, `z-index: 40` (below the top bar). Items are 40px tall (not 64px),
`--radius-md`, `--text-label`, icon 20px, gap `--space-3`. Active state:
`--color-primary-tint` background + `--color-accent-text` text + 600→700 weight.
Section labels use `--text-overline` + `--color-text-muted`.

**A surface has one primary nav.** The extension dashboard currently renders a
horizontal header nav *and* a side nav simultaneously above 768px, with
overlapping items (`All Bookmarks`, `Reminders`) that maintain separate active
states. Pick the side nav; drop the header nav (AUDIT §D-3).

**Mobile bottom nav**: height 56px + safe-area inset, 4 items max, icon 22px +
`--text-overline` label.

### 9.4 Inputs

- Height 40px (32px for the side panel), padding `0 --space-3`,
  `--radius-sm`, `1px --color-border`, background `--color-surface`,
  `--text-body-sm`, `--font-body`.
- Placeholder `--color-text-muted`.
- Focus: border `--color-primary` + ring `0 0 0 3px --color-primary-tint`. Never
  `outline: none` without a replacement ring — the extension does this on
  `.header-search-input` and `.toolbar-search`.
- Search inputs use `--radius-full` and a leading 18px icon at
  `--color-text-muted`.

### 9.5 Badges & pills

`--radius-full`, `--text-overline`, padding `4px --space-3`, uppercase.

| Kind | Background | Text |
| --- | --- | --- |
| Brand / section eyebrow | `--color-primary-tint` | `--color-accent-text` |
| Pro | `--gradient-brand` | `#fff` |
| AI | `rgba(139,92,246,0.12)` | `--color-ai-deep` |
| Neutral / count | `--color-surface-sunken` | `--color-text-secondary` |
| Tag | deterministic HSL (see `constants.js` `getTagColor`) | — unchanged |

Tag colours are generated, not palette-managed; that system stays as-is.

---

## 10. Accessibility floor

- Body text ≥ 4.5:1, large text (≥18px/700) ≥ 3:1 against its background.
- Teal text always `--color-accent-text` (§3.4).
- Never remove focus outlines without an equivalent `:focus-visible` ring.
- Every interactive target ≥ 32×32px (44×44px on touch surfaces).
- Every transform/opacity animation honours `prefers-reduced-motion`.
- Icon-only buttons carry `aria-label` or `title`.

---

## 11. Change process

1. Edit `packages/design-system/` only.
2. `make sync-tokens` to propagate into `extension/styles/` and `webapp/app/`.
3. Update this document in the same PR when a canonical value changes.
4. `npm run test:visual` to regenerate webapp snapshots locally.

Never edit `extension/styles/design-tokens.css` or `webapp/app/design-tokens.css`
directly — both are generated copies.
