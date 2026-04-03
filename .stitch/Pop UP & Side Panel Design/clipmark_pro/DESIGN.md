# High-End Editorial Design System: The Digital Curator

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Curator."** 

Moving away from the cluttered, utility-first appearance of standard Chrome extensions, this system treats user data as a high-end editorial collection. It balances "Pro-Tool" efficiency with a sophisticated, calm aesthetic. We reject the "boxed-in" template look. Instead, we embrace **intentional asymmetry**, high-contrast typographic scales, and layered depth to create an interface that feels less like a browser add-on and more like a bespoke productivity suite. 

The transition between the compact extension popup and the full-page dashboard is unified by a consistent use of whitespace and "Glassmorphism," ensuring the tool feels lightweight yet authoritative.

---

## 2. Colors
Our palette moves beyond simple primary/secondary roles, using color to denote status and structural hierarchy without the need for heavy visual anchors.

### Core Tones
- **Primary (`#006B5F` / `#14B8A6`):** Our signature Emerald. Use the deep `#006B5F` for high-contrast text and the vibrant `#14B8A6` for interactive focal points.
- **Tertiary (`#732EE4`):** Used exclusively for "AI" and "Pro" features to create a distinct psychological separation from standard manual tasks.
- **Surface Neutrals:** A range of slates from `surface-container-lowest` (`#FFFFFF`) to `surface-dim` (`#D9DADB`).

### The "No-Line" Rule
**Borders are a design failure.** To achieve a high-end feel, 1px solid borders for sectioning are strictly prohibited. Sectioning must be achieved through:
1. **Tonal Shifting:** A `surface-container-low` card placed on a `surface` background.
2. **Negative Space:** Using the Spacing Scale (specifically `spacing-8` or `spacing-12`) to define boundaries.

### The Glass & Gradient Rule
For the popup and floating dashboard elements, utilize **Glassmorphism**. Use a semi-transparent surface color with a `backdrop-blur` (12px–20px). This prevents the UI from feeling like a "sticker" on top of the web and makes it feel like an integrated lens. Apply a subtle linear gradient (Primary to Primary-Container) on main CTAs to add "soul" and depth that flat hex codes lack.

---

## 3. Typography
We use a high-contrast pairing: **Plus Jakarta Sans** for headlines (authoritative, modern) and **Inter** for utility (legible, efficient).

- **Display & Headline (Plus Jakarta Sans):** These are the "Editorial" anchors. Use `display-md` (2.75rem) in the dashboard for empty states or welcome headers to create a magazine-like feel.
- **Title & Body (Inter):** Reserved for data. Use `title-sm` (1rem) for bookmark titles and `body-sm` (0.75rem) for metadata like timestamps.
- **Hierarchy through Weight:** Use `font-weight: 600` for titles and `font-weight: 400` for body text. Metadata (timestamps) should use `label-md` with the `secondary` color token to recede visually.

---

## 4. Elevation & Depth
In "The Digital Curator," depth is physical, not digital. We use **Tonal Layering** to define importance.

- **The Layering Principle:** 
    - Base: `surface`
    - Main Content Area: `surface-container-low`
    - Interactive Cards: `surface-container-lowest` (White)
    This creates a "lift" through color brightness rather than artificial shadows.
- **Ambient Shadows:** When an element must float (e.g., a dropdown or the popup itself), use an extra-diffused shadow: `box-shadow: 0 12px 40px rgba(26, 28, 29, 0.06);`. The shadow should be a tinted version of the `on-surface` color.
- **The "Ghost Border" Fallback:** If accessibility requires a border, use the `outline-variant` token at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### Buttons
- **Primary:** Gradient fill (`primary` to `primary-container`), `roundness-md` (0.75rem). No border. White text.
- **Secondary (Ghost):** No background. `primary` text. On hover, apply a `surface-container-high` background shift.
- **Tertiary (AI):** Glassmorphic violet (`tertiary-container` at 20% opacity) with a subtle sparkle icon.

### Chips (Tagging)
Use the secondary accent palette with high-chroma text on a low-opacity background of the same color.
- **Example (#important):** Background: `error_container` (15% opacity), Text: `error`. 
- **Shape:** `roundness-full` for a pill shape, separating tags from square-ish content cards.

### Input Fields
Avoid the "boxed" input. Use a `surface-container-highest` bottom-only border (2px) or a subtle background fill. On focus, the bottom border transitions to `primary` with a soft `primary-container` glow.

### Cards & Lists
Cards must use `roundness-lg` (1rem). 
- **Constraint:** Forbid divider lines between list items. Use `spacing-4` padding and a `surface-container-low` hover state to define rows.

### Timeline/Progress Component
Specific to this tool: Use a vertical `primary` line with `0.5px` width. The markers should be `surface-container-lowest` circles with a `primary` stroke, creating a "threaded" editorial look.

---

## 6. Do's and Don'ts

### Do
- **Do** use asymmetric layouts in the dashboard (e.g., a wide main feed with a slim, non-bordered side panel).
- **Do** use `monospace` fonts for timestamps to lean into the "Pro-Tool" aesthetic.
- **Do** allow content to breathe. If in doubt, double the whitespace.
- **Do** use "Ambient Light" logic—elements higher in the hierarchy are lighter in color.

### Don't
- **Don't** use pure black `#000000` for text; use `on-surface` (`#1A1C1D`) for a premium, softer contrast.
- **Don't** use standard 4px corners. Stay within the `8px–16px` range to maintain the "friendly pro" balance.
- **Don't** use heavy "drop shadows." If the surface color doesn't provide enough lift, your background tonal contrast is too low.
- **Don't** use icons as standalone buttons without tooltips unless they are universally understood (e.g., Search, Settings).