# Adopting `tokens.next.css`

> **Status: PROPOSAL.** `tokens.next.css` is not imported by anything. Nothing in
> this document has been executed. See [`docs/DESIGN.md`](../../docs/DESIGN.md)
> for the canonical values and [`docs/DESIGN-AUDIT.md`](../../docs/DESIGN-AUDIT.md)
> for the prioritised fix list.

## Why a second file instead of editing `tokens.css`

`tokens.css` is live in all three surfaces via `make sync-tokens`. Editing it
in place would silently restyle the extension and the website the moment the
branch merged, which is exactly what this proposal is *not* asking for.
`tokens.next.css` sits beside it, is imported by nothing, and can be reviewed on
its own. On sign-off it replaces `tokens.css` in a single follow-up commit.

## On Tailwind

The brief mentioned a Tailwind theme extension. **The webapp does not use
Tailwind** — there is no `tailwind.config`, no `tailwindcss` dependency, and no
`@tailwind` directives. It styles with React inline `style` objects plus a
~370-line `globals.css`. Authoring a Tailwind theme now would be designing for a
build step that doesn't exist.

The CSS-custom-property layer in `tokens.next.css` is the portable form: it works
in the extension's plain CSS, in the webapp's `globals.css`, and — if Tailwind is
ever introduced — becomes a `theme.extend` block mechanically, since every value
is already a named token. Worth noting that the webapp's inline-style habit is
the real adoption blocker: a token can't reach a value that's typed inline as
`color: '#545f6c'`. Moving repeated inline styles into `globals.css` classes is a
prerequisite, not a nice-to-have (see AUDIT §W-6).

---

## Migration mapping

Old token names that change meaning. Anything not listed keeps its name and
value.

| Old (`tokens.css`) | New (`tokens.next.css`) | Change |
| --- | --- | --- |
| `--accent` `#14B8A6` | `--color-primary` | renamed, same value |
| `--accent-hover` `#0d9488` | `--color-primary-hover` | renamed, same value |
| `--accent-light` `rgba(20,184,166,.12)` | `--color-primary-tint` | renamed, same value |
| `--primary-deep` `#0f766e` | `--color-primary-deep` | renamed, same value |
| `--secondary` `#8B5CF6` | `--color-ai` | renamed + scoped to AI features only |
| `--cta` `#22C55E` | `--color-success` | renamed, same value |
| `--text` `#111827` | `--color-text` `#0f172a` | **value change** — gray-900 → slate-900 |
| `--text-sub` `#6b7280` | `--color-text-secondary` `#64748b` | **value change** — gray-500 → slate-500 |
| `--text-muted` `#9ca3af` | `--color-text-muted` `#94a3b8` | **value change** — gray-400 → slate-400 |
| `--bg` `#f9fafb` | `--color-bg` `#f8fafc` | **value change** |
| `--bg-sub` / `--bg-card` / `--surface` | `--color-surface` `#ffffff` | three names collapse into one |
| `--surface-alt` `#f3f4f6` | `--color-surface-sunken` `#f1f5f9` | **value change** |
| `--border` `#e5e7eb` | `--color-border` `#e2e8f0` | **value change** |
| `--nav-bg` | `--color-surface-glass` | renamed |
| `--font` | `--font-body` | renamed |
| `--font-family-body` | `--font-body` | duplicate removed |
| `--font-family-display` | `--font-display` | duplicate removed |
| `--font-family-native` | *(removed)* | unused |
| `--radius` `10px` | `--radius-md` `12px` | **deprecated + value change** |
| `--radius-sm` `6px` | `--radius-sm` `8px` | **value change** |
| `--radius-lg` `16px` | `--radius-lg` `16px` | unchanged |
| — | `--radius-xs` `4px`, `--radius-xl` `24px` | new |
| `--shadow-sm` / `--shadow` / `--shadow-lg` / `--shadow-hover` | `--shadow-xs`…`--shadow-xl` | renamed, shadow colour → slate |
| `--btn-secondary-bg` / `--btn-secondary-text` | *(removed)* | components compose from semantic tokens |
| `--kbd-bg` / `--kbd-border` | *(removed)* | use `--color-surface-sunken` / `--color-border` |
| `--heading-gradient` | `--gradient-heading` | renamed |

A back-compat shim (`--accent: var(--color-primary);` etc.) can be shipped in
the first adoption commit so surfaces migrate call sites incrementally rather
than in one flag day. Recommended: ship the shim, migrate the extension and the
webapp in separate PRs, then delete the shim.

---

## How each surface adopts

### 1. Shared package — first

1. Replace `packages/design-system/tokens.css` with `tokens.next.css`, keeping
   the back-compat alias block at the bottom.
2. The current `tokens.css` also ships a global reset (`*, *::before, *::after`)
   and base `html/body/a/button` styles. Those are **not tokens** and do not
   belong in the token file — split them into
   `packages/design-system/base.css`, which surfaces import explicitly. Right
   now importing tokens silently rewrites `box-sizing` for the whole page, which
   is why `side-panel.css` and `dashboard.css` both re-declare the same reset.
3. Update `packages/design-system/README.md` — it currently documents
   `colors.css` / `typography.css` / `spacing.css` / `shadows.css` / `radius.css`
   as if they exist (they don't), and says the primary typeface is Inter with no
   mention of Plus Jakarta Sans.
4. `make sync-tokens`.

### 2. Extension — side panel + dashboard

Both stylesheets already `@import './design-tokens.css'`, so the sync script does
the plumbing. Per-surface work:

- **Self-host the fonts.** Both pages `<link>` to `fonts.googleapis.com` at
  runtime. Vendor the four families into `extension/assets/fonts/`, declare
  `@font-face` in a new `extension/styles/fonts.css`, and set
  `--font-plus-jakarta` / `--font-inter` / `--font-jetbrains` there. This is what
  lets the token file's family vars resolve, and it removes a remote request from
  every side-panel open.
- **Delete the duplicated resets** at the top of `side-panel.css` and
  `dashboard.css` once `base.css` exists.
- **Sweep the hardcoded hexes**: 67 `#14b8a6` and 20 `#006b5f` in
  `dashboard.css` alone. Mechanical find-and-replace against the mapping table.
- **Re-scale the type** — this is the substantive change, not a rename. See
  AUDIT §D-1.
- Fold into the **v1.0.2** extension work rather than landing separately; another
  session is already editing both files.

### 3. Webapp

- `webapp/app/globals.css` already `@import url('./design-tokens.css')`, so the
  token layer arrives for free.
- **Delete the typography remap block** at the top of `globals.css` — it
  redefines `--font-family-display/body/mono`, which the new token file already
  does. Two files defining the same three variables is how they drift.
- Keep `next/font` as-is; it defines `--font-plus-jakarta` / `--font-inter` /
  `--font-jetbrains`, which is exactly what the token file consumes.
- **Move repeated inline styles into `globals.css` classes.** The existing `cm-`
  classes (`.cm-card`, `.cm-section-label`, `.cm-icon-badge`) are the right
  pattern — extend it. Until a value lives in CSS, no token can reach it.
- Adopt `.cm-h1`…`.cm-caption` from the token file for headings, replacing the
  ~15 hand-rolled `clamp()` heading sizes.
- **Fix the wordmark casing first** (AUDIT §W-1) — it's independent of everything
  else here and shouldn't wait on token sign-off.

### 4. Verification

- `cd webapp && npx tsc --noEmit`
- `make build`
- `npm run test:visual` — baselines are gitignored; regenerate locally *before*
  the restyle to capture a before/after, since a token swap will move every
  snapshot.
- `npm run test:yt` for the extension surfaces.
- Manual: light **and** dark on all three surfaces. The dark theme currently gets
  far less exercise than light and is where a neutral-ramp swap is most likely to
  produce an unreadable pair.
