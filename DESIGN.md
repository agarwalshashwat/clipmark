---
version: 1.0
name: ClipMark Design System
description: The canonical design language for ClipMark — a calm, study-desk product system built on a single gray neutral ramp, a confident teal brand ramp anchored on #14b8a6, and one violet accent reserved strictly for AI. Teal-700 carries every filled action and every piece of brand text so contrast always passes WCAG AA; the wordmark is always solid, never a gradient.

colors:
  # ── Brand: teal ramp, anchored on #14b8a6 ────────────────────────────────
  teal-50:  "#f0fdfa"
  teal-100: "#ccfbf1"
  teal-200: "#99f6e4"
  teal-300: "#5eead4"
  teal-400: "#2dd4bf"
  teal-500: "#14b8a6"
  teal-600: "#0d9488"
  teal-700: "#0f766e"
  teal-800: "#115e59"
  teal-900: "#134e4a"
  teal-950: "#042f2e"

  primary: "#14b8a6"          # brand anchor — identity, marks, borders, tints
  primary-strong: "#0f766e"   # teal-700 — ALL filled CTAs + all brand text
  primary-active: "#115e59"   # teal-800 — pressed state of a filled CTA
  primary-soft: "#2dd4bf"     # teal-400 — brand text/icons on dark surfaces
  primary-tint: "rgba(20, 184, 166, 0.12)"
  on-primary: "#ffffff"

  # ── Neutrals: ONE gray ramp. No slate. No warm gray. ─────────────────────
  gray-50:  "#f9fafb"
  gray-100: "#f3f4f6"
  gray-200: "#e5e7eb"
  gray-300: "#d1d5db"
  gray-400: "#9ca3af"
  gray-500: "#6b7280"
  gray-600: "#4b5563"
  gray-700: "#374151"
  gray-800: "#1f2937"
  gray-900: "#111827"
  gray-950: "#030712"

  canvas: "#f9fafb"
  canvas-soft: "#f3f4f6"
  surface: "#ffffff"
  ink: "#111827"
  ink-secondary: "#374151"
  ink-muted: "#4b5563"   # gray-600 — 6.9:1 on canvas-soft
  ink-faint: "#9ca3af"   # gray-400 — decorative/disabled ONLY, not AA
  hairline: "#e5e7eb"

  # ── AI accent: violet, AI features ONLY ──────────────────────────────────
  ai: "#8b5cf6"        # identity/tint only — 4.24:1 as text on white
  ai-strong: "#7c3aed" # AI text on a LIGHT surface — 5.7:1 on white
  ai-soft: "#c4b5fd"   # AI text on a DARK surface  — 9.6:1 on gray-900
  ai-tint: "rgba(139, 92, 246, 0.12)"

  # ── Semantic ─────────────────────────────────────────────────────────────
  danger: "#dc2626"
  danger-tint: "rgba(220, 38, 38, 0.10)"
  success: "#15803d"
  success-tint: "rgba(21, 128, 61, 0.10)"
  warning: "#b45309"
  warning-tint: "rgba(180, 83, 9, 0.10)"

gradients:
  # Exactly two. Each consumer MUST declare a solid `color`/`background`
  # fallback before any background-clip property.
  brand: "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)"
  brand-soft: "linear-gradient(135deg, #14b8a6 0%, #2dd4bf 100%)"

typography:
  # 11-step scale. HARD FLOOR: 11px. Nothing ships below step-1.
  display:
    fontFamily: PlusJakartaSans
    fontSize: 52px
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: -1.5px
  heading-1:
    fontFamily: PlusJakartaSans
    fontSize: 38px
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: -1px
  heading-2:
    fontFamily: PlusJakartaSans
    fontSize: 30px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.6px
  heading-3:
    fontFamily: PlusJakartaSans
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.4px
  heading-4:
    fontFamily: PlusJakartaSans
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.3px
  title:
    fontFamily: PlusJakartaSans
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: -0.2px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0
  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: 0
  micro:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.02em

rounded:
  xs: 4px
  sm: 6px
  md: 10px
  lg: 16px
  xl: 20px
  full: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px

components:
  nav-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    padding: 16px
  button-primary:
    backgroundColor: "{colors.primary-strong}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
  button-primary-pressed:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
  button-utility:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: 4px 14px
  button-icon-circular:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.full}"
  button-ai:
    backgroundColor: "{colors.ai-tint}"
    textColor: "{colors.ai-strong}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
  badge-pill:
    backgroundColor: "{colors.primary-tint}"
    textColor: "{colors.primary-strong}"
    typography: "{typography.micro}"
    rounded: "{rounded.full}"
    padding: 4px 8px
  feature-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
  feature-card-elevated:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 24px
  pricing-plan-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.lg}"
    padding: 24px
  pricing-plan-card-featured:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 24px
  text-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
  wordmark:
    textColor: "{colors.primary-strong}"
    typography: "{typography.heading-4}"
    gradient: never
  clip-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 12px
    borderColor: "{colors.hairline}"
  timestamp-chip:
    backgroundColor: "{colors.primary-tint}"
    textColor: "{colors.primary-strong}"
    typography: "{typography.micro}"
    rounded: "{rounded.full}"
    padding: 2px 8px
  loop-segment-bar:
    backgroundColor: "{colors.primary-tint}"
    activeIndicator: "{colors.primary}"
    rounded: "{rounded.full}"
  hero-band:
    backgroundColor: "{colors.gray-900}"
    textColor: "{colors.on-primary}"
    typography: "{typography.display}"
    padding: 32px
  footer:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body-sm}"
    padding: 32px

  # ─── Examples (illustrative) — auto-derived; resolve any TO_FILL markers below ───
  ex-pricing-tier:
    description: "Default Pricing tier card. Re-uses feature-card chrome with brand canvas-soft surface."
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  ex-pricing-tier-featured:
    description: "Featured/highlighted tier — polarity-flipped surface (dark fill + light text in light mode, light fill + dark text in dark mode)."
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  ex-product-selector:
    description: "What's Included summary card — re-purposed for SaaS / B2B verticals (NOT a literal product gallery)."
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  ex-cart-drawer:
    description: "Subscription summary — re-purposed for SaaS / B2B (line items per add-on, not literal cart)."
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
    item-divider: "{colors.hairline}"
  ex-app-shell-row:
    description: "Sidebar nav row inside the App Shell example. Active state uses brand primary as the indicator."
    backgroundColor: "{colors.canvas}"
    activeIndicator: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm} {spacing.lg}"
  ex-data-table-cell:
    description: "Default data-table th + td chrome. Header uses the micro caps eyebrow role; body uses body-sm."
    headerBackground: "{colors.canvas-soft}"
    headerTypography: "{typography.micro}"
    bodyTypography: "{typography.body-sm}"
    cellPadding: "{spacing.sm} {spacing.lg}"
    rowBorder: "{colors.hairline}"
  ex-auth-form-card:
    description: "Sign-in / sign-up card. Re-uses feature-card chrome with text-input primitives inside."
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  ex-modal-card:
    description: "Modal dialog surface — same chrome as feature-card with elevated shadow."
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  ex-empty-state-card:
    description: "Empty-state illustration frame."
    backgroundColor: "{colors.canvas-soft}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xxl}"
    captionTypography: "{typography.body}"
  ex-toast:
    description: "Toast notification surface — feature-card shape + medium shadow."
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "{spacing.md} {spacing.lg}"
    typography: "{typography.body-sm}"

---


## Overview

ClipMark looks like a tidy study desk under a good lamp. The dominant surface is a cool near-white — `{colors.canvas}` (#f9fafb) — with pure white `{colors.surface}` reserved for the things you actually act on: clip cards, panels, fields, modals. Type is set in **Plus Jakarta Sans** for headings and **Inter** for body, in near-black `{colors.ink}` (#111827), so a dense list of forty timestamps still reads as a document rather than a control panel. The whole system whispers in one gray ramp, then says exactly one thing in colour: teal.

The teal ramp is anchored on the brand `{colors.primary}` (#14b8a6) — the colour of the logo, the marker on the YouTube scrubber, the active tab indicator, the tint behind a timestamp chip. But #14b8a6 is a *identity* colour, not a *text* colour: white on it measures 2.49:1 and fails WCAG AA outright. So every filled action and every piece of brand text steps down to `{colors.primary-strong}` (#0f766e, teal-700), where white reaches **5.5:1** and passes AA for normal text. That split — bright teal to identify, deep teal to act — is the single most important rule in this system. There is no third teal in the CTA path; the old off-ramp #006b5f is retired.

Against that quiet chrome, ClipMark permits exactly one other hue: **violet `{colors.ai}` (#8b5cf6), scoped to AI features and nothing else** — AI summaries, auto-fill, suggested tags, insight cards. Violet is a wayfinding signal, not decoration: when a user sees it, something was generated rather than typed. Sharing, social, export and settings surfaces are teal or neutral, never violet.

Surfaces are defined by hairlines and soft layered shadows rather than heavy elevation. Cards round at 10–16px (`{rounded.md}`/`{rounded.lg}`), pills at `{rounded.full}`. Gradients are rationed to two teal ramps and are never load-bearing — a gradient may make a band prettier, but nothing is only legible because of it, and the wordmark never uses one.

**Key Characteristics:**
- One cool gray canvas `{colors.canvas}` with white `{colors.surface}` for actionable cards — no slate ramp, no warm-gray ramp, no third neutral
- Near-black `{colors.ink}` Plus Jakarta Sans headings over Inter body, both self-hosted, never fetched from a CDN at runtime
- A two-role teal: bright `{colors.primary}` identifies, deep `{colors.primary-strong}` acts — every filled CTA is teal-700 on white at 5.5:1
- Violet `{colors.ai}` restricted to AI features as a wayfinding signal, never a CTA and never decoration
- An 11-step type scale with a **hard 11px floor** — `{typography.micro}` is the smallest text that ships
- The "ClipMark" wordmark always solid `{colors.primary-strong}`, capital C and capital M, never a gradient
- Exactly two teal gradients, each with a mandatory solid fallback declared before any `background-clip`
- Elevation by hairline `{colors.hairline}` plus soft layered shadow, not heavy drop-shadows

## Colors

> Surfaces covered: the extension dashboard, the extension side panel, and the webapp (marketing + app). All three consume the same tokens from `packages/design-system/tokens.css`; a colour that is not in this document does not belong in any of them.

### Brand & Accent
- **ClipMark Teal** (`{colors.primary}` — #14b8a6): the brand anchor. Logo, YouTube scrubber markers, active-tab indicator, focus ring, chip tints, chart series. Identity and structure — **never a fill under white text.**
- **Deep Teal** (`{colors.primary-strong}` — #0f766e, teal-700): every filled CTA background, every piece of brand-coloured text and every brand icon on a light surface, and the wordmark. White on it is 5.5:1 — AA for normal text.
- **Pressed Teal** (`{colors.primary-active}` — #115e59, teal-800): the pressed/active state of a filled CTA.
- **Soft Teal** (`{colors.primary-soft}` — #2dd4bf, teal-400): the dark-mode substitute for brand text and icons, where teal-700 would sink into the background. 9.5:1 on `{colors.gray-900}`.
- **Teal Tint** (`{colors.primary-tint}` — teal at 12%): the fill behind timestamp chips, badges, selected rows and loop segments.

The full ramp — `{colors.teal-50}` through `{colors.teal-950}` — exists so tints, borders and hover states are drawn from one family instead of being invented per surface.

**AI Violet** is the only non-teal hue in the system:
- **AI Violet** (`{colors.ai}` — #8b5cf6): AI summary headers, the auto-fill button, suggested-tag chips, AI insight cards.
- **AI Violet Strong** (`{colors.ai-strong}` — #7c3aed): hover/pressed states of an AI control, and AI text on a light surface where the lighter violet would be too weak.
- **AI Tint** (`{colors.ai-tint}` — violet at 12%): the fill behind AI controls and chips.

### Surface
- **Canvas** (`{colors.canvas}` — #f9fafb, gray-50): the page background on every surface — dashboard, side panel, webapp.
- **Canvas Soft** (`{colors.canvas-soft}` — #f3f4f6, gray-100): search wells, secondary buttons, table headers, the footer band, inset regions.
- **Surface** (`{colors.surface}` — #ffffff): clip cards, panels, fields, modals, popovers — anything the user acts on.
- **Hairline** (`{colors.hairline}` — #e5e7eb, gray-200): 1px card borders and dividers.

In dark mode the canvas becomes `{colors.gray-950}`-adjacent (#0a0a0f), surfaces step to `{colors.gray-900}`, insets to `{colors.gray-800}`, and hairlines to `{colors.gray-800}`. The **same gray ramp** supplies both themes.

### Text
- **Ink** (`{colors.ink}` — #111827, gray-900): headings and primary body text.
- **Ink Secondary** (`{colors.ink-secondary}` — #374151, gray-700): secondary copy, secondary button labels.
- **Ink Muted** (`{colors.ink-muted}` — #4b5563, gray-600): supporting copy, metadata, inactive icons. 6.9:1 on `{colors.canvas-soft}`.
- **Ink Faint** (`{colors.ink-faint}` — #9ca3af, gray-400): **decorative and disabled affordances only.** It measures 2.4–2.5:1 on our light surfaces and does NOT clear AA — it must never carry text a user has to read. An earlier draft of this document allowed it for captions; measuring the rendered pages showed 20-odd labels failing because of that, so the rule is now absolute.

The ramp is deliberately chosen against `{colors.canvas}` and `{colors.canvas-soft}`, not against pure white. Most small text in this product sits on one of those two, and the previous ramp (sub = gray-500, muted = gray-400) measured 4.39:1 and 2.43:1 there — passing a white-background spot check while failing in situ.

### Semantic
- **Danger** (`{colors.danger}` — #dc2626): destructive actions, delete confirmations, error text. Replaces the previously ad-hoc #ba1a1a / #ef4444 / #e53e3e trio.
- **Success** (`{colors.success}` — #15803d): saved/synced confirmations, "got it" recall grades. Chosen over #22c55e so it passes AA as *text*, not just as a dot.
- **Warning** (`{colors.warning}` — #b45309): quota warnings, sync-conflict notices.

Each semantic colour has a matching `-tint` at 10% for chip and banner fills. Semantic colours never paint a primary CTA — a destructive confirm button is `{colors.danger}`, everything else affirmative is `{colors.primary-strong}`.

## Typography

### Font Family
Headings are set in **Plus Jakarta Sans** (700/800), body in **Inter** (400/500/600), code and timestamps in **JetBrains Mono**. All three are **self-hosted** — woff2 files served from the app's own origin via `@font-face`, never `fonts.googleapis.com` at runtime. This is not only a performance preference: the extension's dashboard and side panel run under the extension origin, where a runtime CDN font fetch is both a privacy leak and a CSP liability. The Material Symbols Outlined icon font is self-hosted on the same terms.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display}` | 52px | 800 | 1.05 | −1.5px | Marketing hero headline |
| `{typography.heading-1}` | 38px | 800 | 1.1 | −1px | Page titles, section headlines |
| `{typography.heading-2}` | 30px | 700 | 1.15 | −0.6px | Sub-section headings |
| `{typography.heading-3}` | 24px | 700 | 1.25 | −0.4px | Card group headings, modal titles |
| `{typography.heading-4}` | 20px | 700 | 1.3 | −0.3px | The wordmark, panel titles |
| `{typography.title}` | 18px | 600 | 1.4 | −0.2px | Clip titles, feature titles |
| `{typography.body-lg}` | 16px | 400 | 1.6 | 0 | Marketing body copy |
| `{typography.body}` | 14px | 400 | 1.55 | 0 | Default app body copy |
| `{typography.body-sm}` | 13px | 400 | 1.5 | 0 | Dense lists, side-panel body, table rows |
| `{typography.caption}` | 12px | 500 | 1.45 | 0 | Captions, helper text, nav labels |
| `{typography.micro}` | **11px** | 600 | 1.4 | +0.02em | Eyebrows, badges, timestamp chips, meta rows — **the floor** |

### Principles
The hard floor is the rule that matters most here. Both extension surfaces had drifted to 10px, 9px and even 8px meta text — legible on the author's display, unreadable on a 1440p laptop at arm's length, and below the threshold Chrome's own UI guidance recommends. **11px is the smallest size that ships anywhere**, and where 11px feels crowded the fix is weight (600) and letter-spacing, not a smaller size. Because the side panel is a narrow column, it sets its base at `{typography.body-sm}` (13px) rather than 14px, and drops to `{typography.micro}` for meta — it never invents an intermediate step.

Headlines lean on weight 700–800 with negative tracking that grows with size; body copy stays at 400 with generous 1.5–1.6 line-height so a page of clip notes reads comfortably. Uppercase is permitted only at `{typography.micro}` and `{typography.caption}`, always with positive tracking.

### Note on Font Substitutes
If the self-hosted files fail to load, the stack falls back to `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`. Every family token declares that fallback explicitly; no surface may rely on a webfont having arrived.

## Layout

### Spacing System
- **Base unit**: 4px.
- **Tokens (front matter)**: `{spacing.xxs}` 2px · `{spacing.xs}` 4px · `{spacing.sm}` 8px · `{spacing.md}` 12px · `{spacing.lg}` 16px · `{spacing.xl}` 24px · `{spacing.xxl}` 32px.
- Card interior padding lands at `{spacing.xl}` (24px) on the webapp and dashboard, tightening to `{spacing.md}` (12px) in the side panel's narrow column. Fields pad `8px 12px`. Section gaps stack the larger steps.

### Grid & Container
The webapp centres content in a max-width column (~1120px) with generous outer gutters; marketing sections alternate full-width text blocks with 2-up / 3-up card grids. The extension dashboard uses a fixed 64px header over a fluid card grid with a user-selectable card size. The side panel is a single ~300–420px column and never becomes multi-column.

### Whitespace Philosophy
Whitespace is the primary grouping device. Sections separate by vertical gap rather than rules; cards sit on the canvas with quiet hairlines rather than heavy frames. In the side panel, where whitespace is scarce, grouping falls back to hairline dividers and `{typography.micro}` section eyebrows.

### Responsive Strategy

#### Breakpoints
| Name | Width | Key Changes |
|---|---|---|
| Wide | 1440px+ | Widest container, full multi-column grids |
| Desktop | 1024–1440px | Standard centred container, 3-up card grids, inline header nav |
| Tablet | 768–1023px | Grids collapse to 2-up, header nav condenses |
| Mobile | ≤767px | Single-column stacks, hamburger nav, full-width CTAs |
| Panel | 300–420px | Side panel's own range — single column, 13px base |

#### Touch Targets
Filled and secondary buttons carry enough vertical padding for a 44×44px hit area on mobile. Extension icon buttons are 30–32px square, acceptable for a pointer-only surface, but no smaller.

#### Collapsing Strategy
The webapp nav condenses to a hamburger below tablet; card grids collapse to a single stacked column; the pricing table reflows from side-by-side columns into stacked cards. The dashboard header hides its inline nav and search below desktop and exposes them from a menu. **Type never shrinks below `{typography.micro}` at any breakpoint** — a responsive rule that would produce 10px text must reduce padding instead.

#### Image Behavior
Video thumbnails and product screenshots sit in `{rounded.md}` / `{rounded.lg}` frames at a 16:9 aspect ratio and scale fluidly within their grid cell. Thumbnails carry a `{colors.hairline}` edge and a `{colors.canvas-soft}` placeholder while loading.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 — Flat | Hairline border `{colors.hairline}`, no shadow | Default cards on the canvas |
| 1 — Soft | `0 1px 3px rgba(0,0,0,0.08)` | Raised cards, chips, floating buttons |
| 2 — Raised | `0 2px 8px rgba(0,0,0,0.10)` | Dropdowns, hovering clip cards |
| 3 — Elevated | `0 4px 16px rgba(0,0,0,0.12)` | Modals, popovers, the upgrade sheet |
| 4 — Overlay | `0 6px 20px rgba(0,0,0,0.15)` | Toasts, the on-YouTube overlay |

Both extension surfaces use one glass chrome treatment: a translucent canvas at 85% opacity with a 20px backdrop blur, sitting over a hairline. The dashboard header and the side-panel header must resolve to the **same** background token in both themes — they previously differed (#0a0a0f vs #0f1011 in dark), which read as two different products docked beside each other.

### Decorative Depth
Depth comes from thumbnails and hairlines, not from ornament. The one permitted flourish is a teal gradient band (`{gradients.brand}`) behind a marketing hero or an upgrade panel — used at most twice per page, never behind body copy, and never as the only thing distinguishing an element.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Inline tags, small chips, progress bars |
| `{rounded.sm}` | 6px | Icon buttons, menu items, list rows, fields |
| `{rounded.md}` | 10px | Buttons, clip cards, thumbnails, smaller panels |
| `{rounded.lg}` | 16px | Feature cards, modals, large containers |
| `{rounded.xl}` | 20px | Marketing wells, pricing tiers |
| `{rounded.full}` | 9999px | Pills, badges, timestamp chips, circular icon buttons |

### Photography Geometry
Video thumbnails are 16:9, framed at `{rounded.md}` with a hairline edge, and are never cropped to another aspect. Marketing screenshots use `{rounded.lg}`/`{rounded.xl}` wells. Avatars are `{rounded.full}`.

## Components

> Every spec below documents Default and Hover/Active states. Variants live as separate `components:` front-matter entries.

### Navigation

**`nav-bar`** — Top navigation (webapp) / glass header (dashboard, side panel)
- Translucent `{colors.canvas}` at 85% with a 20px backdrop blur, `{colors.ink}` link text at `{typography.body-sm}`, padding `{spacing.lg}`. Left: the `wordmark`. Centre: inline nav tabs (desktop only). Right: icon buttons plus one `button-primary`. The active tab is marked with a `{colors.primary}` indicator, not a colour change on the label.

### Buttons

**`button-primary`** — Primary CTA ("Install free", "Save clip", "Upgrade")
- Background `{colors.primary-strong}` (#0f766e), text `{colors.on-primary}`, `{typography.body-sm}`, `{rounded.md}`. **The only filled-CTA recipe in the system**, in both light and dark mode — white on teal-700 is 5.5:1 either way, so the CTA does not need a theme variant.
- Hover darkens toward `{colors.primary-active}`; pressed state is `button-primary-pressed`.

**`button-primary-pressed`**
- Background `{colors.primary-active}` (#115e59), text `{colors.on-primary}`.

**`button-secondary`** — Secondary action ("Cancel", "Learn more")
- `{colors.canvas-soft}` surface, `{colors.ink-secondary}` text, `{typography.body-sm}`, `{rounded.md}`. Hover steps the surface one gray closer to `{colors.hairline}`.

**`button-utility`** — Toolbar / nav utility button
- White `{colors.surface}`, `{colors.ink-secondary}` text, `{typography.caption}`, `{rounded.sm}`, padding `4px 14px`, 1px `{colors.hairline}` border.

**`button-icon-circular`** — Icon-only control
- 30–32px square (dashboard/side panel) or circular `{rounded.full}`, `{colors.canvas-soft}` fill, `{colors.ink-muted}` glyph stepping to `{colors.ink}` on hover.

**`button-ai`** — AI action (auto-fill, summarise, suggest tags)
- `{colors.ai-tint}` fill, `{colors.ai-strong}` glyph and label, `{typography.caption}`, `{rounded.sm}`. The **only** button family permitted to use violet, and it is deliberately a tinted button rather than a filled one so it never competes with the teal primary CTA.

### Cards & Containers

**`feature-card`** — Content / feature card
- White `{colors.surface}`, `{colors.ink}` text, `{typography.body}`, `{rounded.lg}`, padding `{spacing.xl}`. Flat by default (hairline only).

**`feature-card-elevated`** — Raised feature card
- Same chrome with Level-1 shadow, for cards that float above the canvas.

**`clip-card`** — Bookmarked clip (dashboard grid + side panel list)
- White `{colors.surface}`, `{rounded.md}`, padding `{spacing.md}`, 1px `{colors.hairline}`. A 16:9 thumbnail, a `{typography.title}` (dashboard) or `{typography.body-sm}` (side panel) clip title, a `timestamp-chip`, and a `{typography.micro}` meta row. Hover lifts to Level-2. This is the product's workhorse surface and must look like the same component on both extension surfaces.

**`pricing-plan-card`** / **`pricing-plan-card-featured`** — Pricing columns
- White `{colors.surface}` (featured: `{colors.canvas-soft}` to lift the recommended tier), `{colors.ink}` text, `{typography.body-sm}`, `{rounded.lg}`, padding `{spacing.xl}`. Distinguished by surface tint, not a coloured border.

### Inputs & Forms

**`text-input`** — Text / number field
- White `{colors.surface}`, `{colors.ink}` text, `{typography.body-sm}`, 1px `{colors.hairline}`, `{rounded.sm}`, padding `8px 12px`. Placeholder `{colors.ink-faint}`. Focus draws a 2px `{colors.primary}` ring — the one place bright teal touches an interactive edge.

### Signature Components

**`wordmark`** — The ClipMark wordmark
- The literal string **"ClipMark"** — capital C, capital M, one word, no space, no lowercase "clipmark", no all-caps "CLIPMARK" in user-facing copy. Set in `{typography.heading-4}` weight 700–800, **solid `{colors.primary-strong}`** in light mode and solid `{colors.primary-soft}` in dark, paired with the 22–24px logo mark. **Never a gradient**, on any surface: a gradient-clipped wordmark disappears entirely wherever `background-clip: text` is unsupported or a screenshot is taken at low contrast, and it made the dashboard and side panel read as two different brands.

**`timestamp-chip`** — A clip's timestamp
- `{colors.primary-tint}` fill, `{colors.primary-strong}` text, `{typography.micro}` in JetBrains Mono, `{rounded.full}`, padding `2px 8px`.

**`loop-segment-bar`** — A–B loop segment track
- A `{colors.primary-tint}` track with `{colors.primary}` segment fills and `{colors.primary-strong}` handles, `{rounded.full}`. Segment labels sit at `{typography.micro}`.

**`badge-pill`** — Eyebrow / category pill
- `{colors.primary-tint}` fill, `{colors.primary-strong}` text, `{typography.micro}`, `{rounded.full}`, padding `4px 8px`. Tag pills substitute the tag's own deterministic hue for the tint while keeping the shape and type role.

**`hero-band`** — Marketing hero
- Either the plain `{colors.canvas}` page or, at most once per page, the `{gradients.brand}` teal band with `{colors.on-primary}` `{typography.display}` copy. A gradient band must declare a solid `{colors.primary-strong}` background first.

**`footer`** — Site footer
- `{colors.canvas-soft}` band, `{colors.ink-secondary}` link text at `{typography.body-sm}`, padding `{spacing.xxl}`.

### Examples (illustrative)

> Kit-mirror demonstration surfaces. Each `ex-*` entry references brand-native primitives so downstream consumers (`/preview-design`, `/generate-kit`) re-skin the same 10 surfaces consistently.

**`ex-pricing-tier`** — Default Pricing tier card. Re-uses feature-card chrome with brand canvas-soft surface.
- Properties: `backgroundColor`, `textColor`, `borderColor`, `rounded`, `padding`

**`ex-pricing-tier-featured`** — Featured/highlighted tier — polarity-flipped surface (dark fill + light text in light mode, light fill + dark text in dark mode).
- Properties: `backgroundColor`, `textColor`, `rounded`, `padding`

**`ex-product-selector`** — What's Included summary card — re-purposed for SaaS / B2B verticals (NOT a literal product gallery).
- Properties: `backgroundColor`, `rounded`, `padding`

**`ex-cart-drawer`** — Subscription summary — re-purposed for SaaS / B2B (line items per add-on, not literal cart).
- Properties: `backgroundColor`, `rounded`, `padding`, `item-divider`

**`ex-app-shell-row`** — Sidebar nav row inside the App Shell example. Active state uses brand primary as the indicator.
- Properties: `backgroundColor`, `activeIndicator`, `rounded`, `padding`

**`ex-data-table-cell`** — Default data-table th + td chrome. Header uses the micro caps eyebrow role; body uses body-sm.
- Properties: `headerBackground`, `headerTypography`, `bodyTypography`, `cellPadding`, `rowBorder`

**`ex-auth-form-card`** — Sign-in / sign-up card. Re-uses feature-card chrome with text-input primitives inside.
- Properties: `backgroundColor`, `rounded`, `padding`

**`ex-modal-card`** — Modal dialog surface — same chrome as feature-card with elevated shadow.
- Properties: `backgroundColor`, `rounded`, `padding`

**`ex-empty-state-card`** — Empty-state illustration frame.
- Properties: `backgroundColor`, `rounded`, `padding`, `captionTypography`

**`ex-toast`** — Toast notification surface — feature-card shape + medium shadow.
- Properties: `backgroundColor`, `rounded`, `padding`, `typography`


## Do's and Don'ts

### Do
- Use `{colors.primary-strong}` (#0f766e) for **every** filled CTA and every piece of brand-coloured text; reserve `{colors.primary}` (#14b8a6) for identity, indicators, focus rings and tints.
- Draw every neutral from the single gray ramp `{colors.gray-50}`–`{colors.gray-950}`, in both light and dark mode.
- Keep the page on `{colors.canvas}` and put white `{colors.surface}` under anything the user acts on.
- Scope violet to AI features only, and only as a tinted control (`button-ai`) or an AI section eyebrow. Violet follows the same two-role split as teal: `{colors.ai}` identifies and tints, `{colors.ai-strong}` is the ink on light surfaces, `{colors.ai-soft}` the ink on dark ones. Commerce surfaces — Upgrade buttons, Pro badges, pricing eyebrows — are **teal**, not violet; they are not AI.
- Set the wordmark as solid teal "ClipMark" at `{typography.heading-4}` on every surface.
- Keep all text at `{typography.micro}` (11px) or larger — tighten padding, raise weight, or truncate before you shrink type.
- Define surfaces with `{colors.hairline}` plus the Level-1/2 shadows; give the dashboard and side-panel headers the identical glass token.
- Declare a solid `color`/`background` fallback *before* any `background-clip: text` or gradient background.
- Self-host every font file, including Material Symbols.

### Don't
- Don't put white text on `{colors.primary}` (#14b8a6) — it is 2.49:1 and fails AA. Step down to `{colors.primary-strong}`.
- Don't reintroduce #006b5f, #0d5f57, #4db8a8, #0ea5a0 or any other off-ramp teal; the ramp in this document is the whole ramp.
- Don't introduce a slate (#0f172a, #64748b, #94a3b8, #e2e8f0, #f1f5f9…) or warm-gray (#1a1c1d, #545f6c, #6c7a77, #f3f3f4, #f9f9fa…) neutral. One gray ramp, no exceptions.
- Don't paint a CTA, a share control, a settings surface or any decoration in violet — violet means AI.
- Don't ship a third gradient, and don't let a gradient be the only thing that makes an element legible.
- Don't render the wordmark as gradient text, in lowercase ("Clipmark"), or in all-caps in user-facing copy.
- Don't write a font-size below 11px, in any rule, at any breakpoint, on any surface.
- Don't bake a per-item hue (a tag colour, a clip's own colour) into a rendered string as both fill and text. JS emits the HUE as `--tag-h` / `--tag-s` and CSS picks the lightness per theme, so a theme flip re-colours pills that were rendered once. A baked-in ink measured 1.41:1 on the dark card.
- Don't use `var()` in `extension/src/tour-theme.css` or the content script's injected styles. Those render inside youtube.com, where our `:root` tokens do not exist, so a token resolves to nothing — those files carry literal ramp values by design.
- Don't fetch a font from `fonts.googleapis.com` at runtime — least of all from an extension page.
- Don't use `{colors.success}`'s brighter cousin #22c55e as text, and don't keep three different reds; use `{colors.danger}`.
