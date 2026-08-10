# System-Synced Dark Mode — Plan

**Status:** proposal, awaiting approval. No app code changes in this PR.
**Author:** audit + plan against `origin/main` @ `e6edca5`.
**Motivation (Ash):** a light side panel docked next to a dark YouTube page causes eye
strain. Everything should follow the system theme so the product reads as one thing.

**Goal:** all three ClipMark surfaces — extension side panel, extension dashboard, and
the webapp — resolve their theme from the user's OS setting
(`prefers-color-scheme`), live-update when it changes, and never flash the wrong
theme on load. A manual override exists but defaults to "follow system".

---

## 1. Audit — what exists today

The one-line summary: **dark mode is ~70% built and 0% reachable.** There is a
near-complete dark palette, 88 hand-written dark override rules in the extension
CSS, a dark-aware tag-hue system, and three separate theme-switching mechanisms —
and every one of the switches is commented out, orphaned, or hardcoded to light.
There is **no `prefers-color-scheme` or `matchMedia` usage anywhere in the repo.**

```
$ grep -rn "prefers-color-scheme" --include=*.{css,js,ts,tsx,mjs,html} .   # → 0 hits
$ grep -rn "matchMedia"           --include=*.{js,ts,tsx,mjs} .            # → 0 hits
```

### 1.1 Tokens — `packages/design-system/tokens.css`

A dark palette **already exists** and is genuinely good.
`packages/design-system/tokens.css:172-213` defines `[data-theme="dark"]` with 29
overrides covering surfaces, the inverted text ramp, semantic colors, brand/AI ink,
the glass nav chrome, secondary buttons and `<kbd>`:

| Role | Light (`:root`) | Dark (`[data-theme="dark"]`) |
|---|---|---|
| canvas | `--bg: gray-50` | `--bg: #0a0a0f` |
| surface | `--surface: #fff` | `--surface: gray-900` |
| inset | `--surface-alt: gray-100` | `--surface-alt: gray-800` |
| hairline | `--border: gray-200` | `--border: gray-800` |
| text ramp | `gray-900/700/600/400` | `gray-50/300/400/500` |
| brand ink | `--brand-ink: teal-700` | `--brand-ink: teal-400` |
| AI ink | `--ai-ink: ai-strong` | `--ai-ink: ai-soft` |
| semantics | `#dc2626 / #15803d / #b45309` | `#f87171 / #4ade80 / #fbbf24` |

The gray and teal ramps deliberately do **not** flip — `DESIGN.md:364` ("the **same
gray ramp** supplies both themes") and the contrast notes at `tokens.css:189-191`
confirm the dark text steps were contrast-checked against `--surface`/`--surface-alt`.
`DESIGN.md` already documents dark mode as a first-class concern:
`DESIGN.md:348` (soft teal as the dark-mode brand ink), `:364` (the dark canvas),
`:453` (header parity across both themes), `:486` (the CTA needs no theme variant),
`:589` (use `--brand-ink`/`--ai-ink`, not hand-picked ramp steps), `:603-605` (the
theme-flip traps).

Both synced copies are **in sync** with the source
(`webapp/app/design-tokens.css`, `extension/styles/design-tokens.css` — byte-identical).

**Missing dark tokens** (see §4 for the full list): the four `--shadow-*` tokens are
`rgba(0,0,0,…)` in both themes and go invisible on the dark canvas;
`--secondary-hover` resolves to `--ai-strong` (#7c3aed) which `DESIGN.md:589` itself
measures at **2.58:1** on the dark canvas; and there is no `--scrim`, `--on-primary`,
or `--focus-ring` token at all (`grep` → 0 hits each), so overlays and focus rings
are hand-rolled per file.

### 1.2 The `data-theme` mechanism — three switches, none live

**a) Extension pages — commented out.** The pre-paint script is disabled in *both*
HTML entry points:

- `extension/src/pages/side-panel.html:10` — `<!-- <script src="../popup/theme-loader.js"></script> -->`
- `extension/src/pages/dashboard.html:10` — same, commented

…as are the toggle buttons (`side-panel.html:33`, `dashboard.html:35`) and the
`initTheme()`/`toggleTheme()` implementations
(`extension/src/popup/side-panel.js:1630-1650`,
`extension/src/popup/dashboard.js:2331-2352`, both under a
`// Theme toggle (hidden)` banner). **The extension is hard-wired to light**, and its
88 dark CSS rules are unreachable dead code.

**b) `theme-loader.js` is also broken on its own terms.** All 7 lines of
`extension/src/popup/theme-loader.js`:

```js
// Theme loader - prevents flash of unstyled content
(function() {
  chrome.storage.local.get(['theme'], (result) => {
    const theme = result.theme || 'light';
    document.documentElement.setAttribute('data-theme', theme);
  });
})();
```

Three defects: (i) `chrome.storage.local.get` is **asynchronous**, so the callback
lands *after* first paint — the comment's promise is false and re-enabling it as-is
would ship a guaranteed light flash; (ii) it reads `storage.local`, not
`storage.sync`, so a preference would not follow the user across devices like every
other ClipMark preference does (`chrome.storage.sync` per `CLAUDE.md`); (iii) it has
no system-theme awareness, defaulting to the string `'light'`.

**c) Webapp — pinned light, toggle orphaned.**
`webapp/app/layout.tsx:93` hardcodes `<html … data-theme="light">`. The pre-paint
inline script at `layout.tsx:70-75` is correctly *synchronous* (good) but only reads
`localStorage` and only ever sets dark:

```js
var t = localStorage.getItem('theme');
if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
```

`webapp/app/components/ThemeProvider.tsx:13,17` then defaults `useState`/the stored
read to `'light'` and re-asserts it on mount — so a first-time visitor is forced
light regardless of OS. `webapp/app/components/ThemeToggle.tsx` exists, works, and is
**never rendered anywhere** (`grep -rn ThemeToggle webapp/app` → only its own file).
Dark mode is not user-reachable on the web today.

**d) Dead file.** `shared-styles.css` at the repo root carries its own
`[data-theme="dark"]` block (`:53`) and is referenced by nothing — safe to delete.

### 1.3 Confirming the two known gaps

**Coach-mark popover is light-only — CONFIRMED.**
`extension/src/tour-theme.css` (126 lines) contains no `[data-theme]` selector and no
media query. Every color is a hard light literal: `#f9fafb` canvas (`:10`), `#111827`
title (`:11,21,82`), `#374151` body (`:28,60`), `#6b7280` meta (`:38`), plus four
arrow `border-*-color: #f9fafb` rules (`:91,94,97,100`). This is *by design* per
`DESIGN.md:605` — see §1.4. Note it is imported into **two** contexts:
`extension/src/content/tour.js:14` (on YouTube) *and*
`extension/src/popup/side-panel.js:61` (`?sp`, inside the panel), so a dark variant
must work in a place where tokens exist and a place where they don't.

**Webapp body stays light — CONFIRMED, but the diagnosis needs correcting.** It is
not layout CSS and not the `<body>` rule. `tokens.css:216-223` does set
`html, body { background: var(--bg) }`, and that *does* resolve dark. The reason you
never see it is that the marketing page paints opaque white *over* it, section by
section, in inline styles:

- `webapp/app/(marketing)/page.tsx:288` — `background: '#ffffff'`
- `webapp/app/(marketing)/page.tsx:635` — `background: 'white'` (how-it-works)
- `webapp/app/(marketing)/page.tsx:756` — `background: 'white'` (pricing)
- `webapp/app/(marketing)/page.tsx:817` — `background: 'white'`
- plus cards at `:227, :425, :792, :855`, a `rgba(0,0,0,0.03)` hero grid (`:170`)
  that vanishes on dark, and hardcoded pastel tag chips at `:535, :550, :551, :566`
- `webapp/app/globals.css:98` (`.footer`), `:206` (`.faq-card`), `:267` (`.cm-card`)

`webapp/app/(marketing)/layout.tsx` is a `minHeight: 100vh` flex wrapper with **no**
background of its own — it is not the culprit. So the fix is a literal sweep, not a
one-line layout change.

### 1.4 The three surface *classes* (this is the load-bearing distinction)

| | Where it runs | Tokens available? | Theme applied via |
|---|---|---|---|
| **Extension pages** (side panel, dashboard) | `chrome-extension://` page, own document | ✅ `design-tokens.css` imported (`side-panel.css:6`, `dashboard.css:7`) | `data-theme` on `<html>` + pre-paint script |
| **Webapp** (Next.js) | `clipmark.mithahara.com`, own document | ✅ `@import './design-tokens.css'` (`globals.css:9`) | `data-theme` on `<html>` + inline pre-paint script |
| **On-YouTube injected UI** | inside `youtube.com`'s document | ❌ **our `:root` does not exist there** | *nothing* — literal values only |

That third row is the constraint the whole plan bends around, and `DESIGN.md:605`
states it explicitly: *don't* use `var()` in `tour-theme.css` or the content
script's injected styles, because a token there resolves to nothing. Those files
carry literal ramp values **by design**, and `scripts/design-audit.mjs:51` encodes it
as an audit class (`const ON_YOUTUBE = ['extension/src/tour-theme.css']`).

**And the good news:** the content script's injected UI is *already dark-native.* The
style block at `extension/src/content/content.js:1051-1650` styles ~40 selectors —
markers, the marker tooltip, the loop panel, player buttons, the toast, the recall
button — all of which are docked to or overlaid on the **video player**, whose chrome
is black in both YouTube themes. Its palette is accordingly `#2dd4bf` (teal-400, the
dark-surface brand ink) and white-alpha fills (`rgba(255,255,255,0.15)` ×5,
`rgba(255,255,255,0.08)` ×4, `rgba(255,255,255,0.85/0.70/0.50)`). **This surface
needs no theme work at all.** The only on-YouTube element that sits on the *page*
rather than the player is the coach-mark popover — which is exactly the one that's
light-only.

### 1.5 Visual debt inventory — where the work actually is

Hardcoded light backgrounds (`#fff`/`white`/`#f9fafb`/`#f3f4f6`) vs. authored dark rules:

| Surface | Hardcoded light bg | `[data-theme="dark"]` rules | Verdict |
|---|---|---|---|
| `extension/styles/side-panel.css` | **1** | 5 | token-clean; should mostly "just work" |
| `extension/styles/dashboard.css` | 17 | **83** | dark mode substantially authored already |
| `webapp/app/globals.css` | 3 | 0 | |
| `webapp/app/**/*.module.css` | **58** (13 files) | **0** | ← the bulk of the effort |
| `webapp/app/**/*.tsx` inline | **16** | 0 | ← inline styles, no cascade to lean on |

Worst webapp offenders: `dashboard/shell.module.css` (13),
`dashboard/page.module.css` (8), `dashboard/groups/page.module.css` (6),
`(marketing)/v/[shareId]/page.module.css` (5),
`dashboard/_components/toolbar.module.css` (5).

The extension already has a theme-aware pattern worth copying to the web: JS emits
only a hue (`--tag-h`/`--tag-s`) and CSS picks lightness per theme
(`extension/styles/dashboard.css:4302-4320`), so a theme flip re-colours pills
rendered once. `DESIGN.md:603` records the bug that motivated it.

---

## 2. Theme resolution

One shared resolution model, three transports. `matchMedia('(prefers-color-scheme:
dark)')` is the **source of truth**; the stored preference is a nullable *override*.

### 2.1 The contract

```
preference ∈ { null | "system" , "light" , "dark" }        default: system
resolved   = preference === "light" || preference === "dark"
               ? preference
               : (matchMedia('(prefers-color-scheme: dark)').matches ? "dark" : "light")
```

`resolved` is written to `document.documentElement.dataset.theme` on every surface.
Nothing else reads the preference; all CSS keys off `[data-theme="dark"]` exactly as
it does today, so **the existing 88 dark rules light up unchanged.**

### 2.2 Live updates

Attach `mql.addEventListener('change', …)` and re-resolve. If `preference` is an
explicit `light`/`dark`, the change is ignored (but still tracked, so switching back
to `system` is instant). This is the piece that does not exist anywhere today.

### 2.3 Flash-free pre-paint

The rule: **`data-theme` must be correct before the first paint, using only
synchronous APIs.** `matchMedia(...).matches` is synchronous — that is what makes
system-default *easier* to get flash-free than the current storage-based design.

- **Do not** ship `<html data-theme="light">` as a static default (today's
  `webapp/app/layout.tsx:93`). Ship it bare and let the pre-paint script stamp it.
- **Webapp:** `localStorage` is synchronous → the existing inline-script approach at
  `layout.tsx:70-75` is structurally right and just needs the system branch. Keep it
  in `<head>`, before any stylesheet that paints.
- **Extension pages:** `chrome.storage.sync` is **async** → cannot be read pre-paint.
  Resolution: pre-paint from `matchMedia` alone (correct for the ~100% of users on the
  default), then reconcile the override from `storage.sync` on the async callback. A
  user with an explicit override that *disagrees* with their OS sees one frame of the
  system theme; mirror the override into `localStorage` (synchronous, and available in
  extension pages) as a pre-paint cache to close even that gap.

`tokens.css:222` has `transition: background 0.2s, color 0.2s` on `html, body`. That
is right for a *live* toggle and wrong on load — it animates the correction. Gate it
behind a class added after first paint, or accept it (it is a 200ms fade, not a
flash). Worth a decision during Phase 1.

### 2.4 Storage

| Surface | Preference stored in | Why |
|---|---|---|
| Extension | `chrome.storage.sync`, key `theme` | matches every other ClipMark preference; follows the user across devices. **Migrate off `storage.local`** (`theme-loader.js:3`) — read `local` once, write `sync`, so nobody's existing pick is lost. |
| Webapp | `localStorage`, key `theme` | already there (`layout.tsx:72`); synchronous, so pre-paint works. |

**Cookie vs. localStorage for the web:** `localStorage` is the right call.
A cookie would let the *server* render the correct `data-theme` and remove the
pre-paint script entirely — but it costs a cookie on every request, an
`await cookies()` that opts routes out of static rendering, and consent-banner
questions on a marketing site. The inline script is 6 lines and already shipped.
Not worth it.

Do **not** attempt to share the preference between the extension and the webapp.
They are separate origins with separate stores; the OS setting is the shared signal,
and that is enough. Cross-syncing it would mean plumbing theme through the existing
`onMessageExternal` bridge for a cosmetic benefit.

---

## 3. Per-surface implementation

### 3.1 Extension side panel — *lowest effort, highest payoff*

This is the surface Ash's complaint is about, and it is the cheapest to fix: 1
hardcoded light background, and it inherits the token palette wholesale.

1. Replace `extension/src/popup/theme-loader.js` with a synchronous, system-first
   resolver (see §2.1–2.3) that also exports a `subscribe`/`applyTheme` pair.
2. **Uncomment** `side-panel.html:10`. It must stay a classic `<script>` in `<head>`
   before `side-panel.css` — not an ESM import from `side-panel.js`, which is
   deferred and would paint first. (This is the same isolated-world/load-order
   hazard the twin-file convention exists for; see `CLAUDE.md`.)
3. Wire the live `matchMedia` listener + a `chrome.storage.onChanged` listener so a
   change made in the dashboard reflects in the panel without a reload.
4. QA the 5 existing dark rules (`side-panel.css:949, 1935-1938`) and the one
   hardcoded light background; verify the glass header still matches the dashboard's
   (`DESIGN.md:453` — they have diverged in dark before: `#0a0a0f` vs `#0f1011`).
5. The tour popover renders here too (`side-panel.js:61`) — see §5.1.

### 3.2 Extension dashboard

Same resolver, same pre-paint wiring at `dashboard.html:10`. The 83 authored dark
rules mean most of this is **QA and fallout-fixing rather than authoring**: sweep the
17 hardcoded light backgrounds, then walk every screen in dark. Restore the toggle
button (`dashboard.html:35`) as a **three-state control** — System / Light / Dark —
rather than the old two-state boolean, since "System" must be expressible and must be
the default. The dashboard is the natural home for the control; the side panel is too
cramped and can inherit via `storage.sync`.

### 3.3 On-YouTube injected UI — *no work*

Per §1.4, `content.js`'s injected styles are already built for the dark player
chrome. Do not add `var()` tokens here (`DESIGN.md:605`) and do not add a theme
switch. The only change in this class is the coach-mark popover (§5.1).

If we later adopt YouTube-follow (§4), the content script gains one job: read
`document.documentElement.hasAttribute('dark')` and report it. Nothing about its own
styling changes.

### 3.4 Webapp — *the bulk of the work*

1. Drop `data-theme="light"` from `layout.tsx:93`.
2. Extend the inline pre-paint script (`layout.tsx:70-75`) with the system branch and
   the three-state preference.
3. Rewrite `ThemeProvider.tsx` to initialise from the same resolver instead of
   `useState<Theme>('light')` (`:13`) — and to hold `'system' | 'light' | 'dark'`,
   not just `Theme`. Add the `matchMedia` change listener. Guard against hydration
   mismatch: the server cannot know the theme, so the provider must read it in an
   effect (or from the DOM attribute the pre-paint script already set) and never
   render theme-dependent markup on the server.
4. **Render `ThemeToggle`** (currently orphaned) in `Navigation.tsx`, upgraded to
   three states.
5. **The sweep: 74 hardcoded light backgrounds across 13+ files** (§1.5) → tokens.
   `#fff`/`white` → `--surface` or `--bg-card`; `#f9fafb`/`#f3f4f6` → `--bg` /
   `--surface-alt`. Plus the pastel tag chips at `(marketing)/page.tsx:535-566` →
   port the extension's `--tag-h`/`--tag-s` hue pattern
   (`dashboard.css:4302-4320`), and the `rgba(0,0,0,0.03)` hero grid at `:170` →
   a `currentColor`-alpha or a token.
6. Audit `webapp/app/api/og/route.tsx` — Satori OG images must stay **light-only and
   literal**; they render server-side with no user theme. It is already flagged as
   `LITERAL_ONLY` at `scripts/design-audit.mjs:54`; make sure the sweep does not
   "helpfully" tokenize it.

---

## 4. Token work

The dark palette is largely done. What's missing:

**Must add to `[data-theme="dark"]`:**

| Token | Light | Problem on dark | Proposed dark value |
|---|---|---|---|
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,.08)` | invisible on `#0a0a0f` | `0 1px 3px rgba(0,0,0,.4)` |
| `--shadow` | `0 2px 8px rgba(0,0,0,.1)` | invisible | `0 2px 8px rgba(0,0,0,.5)` |
| `--shadow-lg` | `0 4px 16px rgba(0,0,0,.12)` | invisible | `0 4px 16px rgba(0,0,0,.6)` |
| `--shadow-hover` | `0 6px 20px rgba(0,0,0,.15)` | invisible | `0 6px 20px rgba(0,0,0,.7)` |
| `--secondary-hover` | `var(--ai-strong)` #7c3aed | **2.58:1** on the dark canvas per `DESIGN.md:589` | `var(--ai-soft)` #c4b5fd |

The extension CSS already hand-rolls the dark shadows it needs
(`dashboard.css:919, 1540, 1935` — `rgba(0,0,0,0.3/0.4)`), which is the tell that the
tokens are missing. Tokenizing lets those hand-rolls collapse.

**Should add to both themes** (absent entirely — `grep` → 0 hits each):

| Token | Purpose | Light | Dark |
|---|---|---|---|
| `--scrim` | modal/overlay backdrop, currently hand-rolled 8+ times (`dashboard.css:2370, 3298, 3399`, `side-panel.css:997` — and they disagree: .7/.72/.7/.45) | `rgba(17,24,39,.5)` | `rgba(0,0,0,.72)` |
| `--on-primary` | referenced by `DESIGN.md:486` but never defined in CSS | `#ffffff` | `#ffffff` |
| `--focus-ring` | keyboard focus, currently ad-hoc | `var(--accent-strong)` | `var(--accent-soft)` |
| `--elevation-rim` | dark-mode elevation reads better as a 1px top rim-light than a shadow | `transparent` | `rgba(255,255,255,.06)` |

**Review, don't necessarily change:**
- `--gradient-brand` / `--gradient-brand-soft` (teal-700→500, teal-500→400) have no
  dark variant. Probably fine as *fills*; verify any `background-clip: text` use
  still clears AA on the dark canvas, and that the mandatory solid fallback
  (`tokens.css:122-123`) resolves to a dark-safe color.
- Four dark overrides are **no-ops** — `--accent`, `--accent-strong`,
  `--accent-hover`, `--accent-light` restate their light values
  (`tokens.css:173-178`). Intentional and documented (`:174-175`: the CTA is 5.5:1
  either way), but `--accent-light` at 12% teal over `#0a0a0f` is very faint; consider
  raising it to ~18% for dark. Keep the redundant declarations — they document intent.

**Ramps stay fixed.** `--teal-*` and `--gray-*` must *not* get dark overrides:
`DESIGN.md:364` and `tokens.css:14` ("ONE gray neutral ramp") are explicit, and the
audit's R1 rule enforces it.

All edits go in `packages/design-system/tokens.css` **only**, then `make sync-tokens`.
Both copies are currently byte-identical to the source — keep it that way or
`ci-design-conformance` will catch the drift.

---

## 5. Known-gap fixes folded in

### 5.1 Coach-mark / tour popover dark variant

`extension/src/tour-theme.css` is light-only (§1.3) and has the **dual-context**
problem: it renders on YouTube (no tokens) *and* in the side panel (tokens
available). It cannot use `var()` (`DESIGN.md:605`), so:

> Add a `@media (prefers-color-scheme: dark)` block with **literal** dark ramp values
> — `#111827` canvas, `#f9fafb` title, `#d1d5db` body, `#9ca3af` meta, and the four
> matching `border-*-color` arrow rules (`:91,94,97,100`).

A media query is the right mechanism here precisely *because* it needs no tokens and
no JS, and it works identically in both contexts. Note the consequence: the popover
follows the **system** theme even in the side panel, so if we ever ship a manual
override the popover would not honour it — acceptable for a one-shot onboarding
element, and worth a one-line comment in the file saying so. If we later want it to
honour the override in-panel, add a `[data-theme="dark"] .cm-tour-…` block *in
addition* (harmless on YouTube, where the attribute never appears).

**Coordination:** v1.0.4 was expected to be doing this. As of `e6edca5` its branch
`fix/ext-v1.0.4-bugs` sits at origin/main with **no commits**, and its working tree
touches only `extension/src/loop.js` — so the coach-mark dark variant is **not yet in
flight**. Treat it as owned by this plan (Phase 4), and re-check before starting: if
v1.0.4 lands it first, drop it from scope rather than conflicting.

### 5.2 Webapp dark body background

Not a body/layout bug. It is the 74-literal sweep in §3.4 step 5 — the marketing
sections paint opaque white over a correctly-dark `<body>`. Diagnosis corrected in
§1.3; no separate work item.

### 5.3 `theme-loader.js`

Rewritten, not repaired — see §2.3 and §3.1 step 1. The current file's async read
cannot deliver its stated purpose. Also: migrate the `storage.local` → `storage.sync`
key, and delete the dead root `shared-styles.css` (§1.2d).

---

## 6. The friction nuance — should the on-YouTube surfaces follow *YouTube's* theme?

YouTube sets a bare `dark` attribute on `<html>` when its own dark theme is on,
independently of the OS. So a user with a **light OS and a manually-darkened
YouTube** — a very common combination, because YouTube's toggle is prominent and
sticky — gets a light side panel beside a dark page under a system-only policy.
That is *exactly* the eye-strain case in the motivation. Worth naming plainly:
**system-only does not fully close the complaint that prompted this work.**

**Recommendation: ship system-only as the default (Phases 1–3). Add "Match YouTube"
as an explicit opt-in fourth preference value, side-panel-only, in Phase 4. Do not
make YouTube-follow implicit.**

Why:

- **Consistency-within-ClipMark is what Ash actually asked for** — "everything should
  follow the system theme so it's consistent." An implicit `system-dark OR
  youtube-dark` rule gives a light-OS user a dark side panel *and* a light dashboard
  simultaneously. That is a new inconsistency, inside our own product, to fix an
  inconsistency with someone else's page.
- **The side panel is browser chrome, not page content.** It is docked to the window
  next to the tab, like DevTools — and DevTools follows the browser/OS theme, not the
  page's. That is the established platform convention users already have intuitions
  about.
- **The injected UI needs nothing either way** (§1.4/§3.3): it lives on the black
  player and is already dark-native. So "follow YouTube" only ever means "the side
  panel", which is one surface, not a class.
- **The plumbing is real.** The side panel cannot see YouTube's DOM. It needs the
  content script to read `documentElement.hasAttribute('dark')`, a `MutationObserver`
  for in-page toggles, a message hop to the panel, and a re-read on
  `yt-navigate-finish` (YouTube is an SPA — `CLAUDE.md`). Plus a defined fallback for
  when the panel is open on a non-YouTube tab, which the panel explicitly supports
  (there's a dedicated off-YouTube state). That is a day of work and a new failure
  mode on the critical path of a change whose default doesn't need it.
- **An opt-in gets the affected user to the same place in one click**, and makes the
  behaviour predictable because they chose it.

So the side-panel preference becomes: **System (default) · Match YouTube · Light ·
Dark**, with `Match YouTube` resolving to system when the active tab isn't YouTube.
The dashboard and webapp keep three states (no YouTube to match).

**This is the one decision in the plan that is genuinely Ash's call** — if the
priority is "kill the eye-strain for everyone with zero configuration," the
implicit-OR rule wins and §6 flips. Everything else in the plan is unaffected either
way; only Phase 4's shape changes.

---

## 7. Phased rollout & effort

Sequenced so each phase is independently shippable and the highest-payoff surface
lands first.

| Phase | Scope | Effort |
|---|---|---|
| **0 — Tokens** | Complete the dark palette (§4): 5 dark overrides, 4 new tokens, gradient review, `make sync-tokens`. No user-visible change. | **0.5 d** |
| **1 — Resolution** | Rewrite `theme-loader.js` as the shared system-first resolver; wire pre-paint + live `matchMedia` on both extension pages; `storage.local`→`sync` migration; delete `shared-styles.css`. | **1 d** |
| **2 — Extension surfaces** | Uncomment the switches; three-state toggle on the dashboard; sweep 18 hardcoded light backgrounds; QA every screen in dark; verify header parity (`DESIGN.md:453`). Side panel is near-free; the dashboard's 83 dark rules mean this is QA, not authoring. | **1.5–2 d** |
| **3 — Webapp** | Un-pin `data-theme`; extend the inline pre-paint script; rewrite `ThemeProvider`; render `ThemeToggle`; **sweep 74 literals across 13+ files**; port the tag-hue pattern; leave the OG route literal. | **3–5 d** |
| **4 — Known gaps + option** | Coach-mark dark variant via `@media` (§5.1); *if approved* the "Match YouTube" opt-in (§6). | **0.5 d** + **1 d** if YouTube-follow |
| **5 — Testing & CI** | Extend the rendered-DOM conformance to dark on all surfaces; add webapp dark visual baselines; gate it (§8). | **1 d** |

**Total: ~8–10 working days**, or ~7–9 without YouTube-follow. Phase 3 is the long
pole and is almost entirely mechanical literal-replacement — it parallelises cleanly
across files if more than one person is on it.

**Ship boundary:** Phases 0–2 are an extension release (v1.0.5+) and answer Ash's
complaint on their own. Phase 3 ships independently to Vercel. **Do not couple them**
— the extension fix should not wait on the webapp sweep.

### Coordination with in-flight work

- **The just-shipped restyle** (`670a0b2` "bring the dashboard, side panel and webapp
  onto the DESIGN.md tokens", `a565c43` "make DESIGN.md canonical") is what makes this
  plan cheap: it is why `side-panel.css` has only 1 hardcoded light background and why
  the token palette exists. This plan **completes** that work rather than redoing it.
  Nothing here contradicts a restyle decision; §4 only adds tokens the restyle
  didn't need while dark mode was unreachable.
- **v1.0.4** (`fix/ext-v1.0.4-bugs`) currently touches only `extension/src/loop.js`
  (§5.1). **Zero file overlap** with Phases 0–3. The only collision risk is
  `tour-theme.css` in Phase 4 — re-check that branch before starting Phase 4 and drop
  the item if v1.0.4 landed it. Land Phase 1 *after* v1.0.4 merges so the extension
  release train stays linear.
- **Other live branches** touching the same CSS (`feat/design-system-consistency`,
  `docs/dashboard-parity-refresh`, `sync/dashboard-parity`) all edit
  `extension/styles/dashboard.css` — the same file as Phase 2's sweep. Sequence Phase
  2 after those merge, or the 17-literal sweep will conflict repeatedly.

---

## 8. Testing

The existing harness is already most of the way there.

**What exists:** `tests/design-consistency.spec.ts` loads `extension/dist` in real
Chrome and audits `getComputedStyle`, and it **already covers dark** — it flips
`data-theme` by hand and re-runs the full audit for the dashboard (`:469-492`) and
the side panel (`:455-465`), with a comment recording the exact bug that motivated
side-panel coverage (`:456-458`: a hardcoded white card rendering gray-50 on white).
`scripts/design-audit.mjs` covers source and `--dist` bytes, with `ON_YOUTUBE` (`:51`)
and `LITERAL_ONLY` (`:54`) exemption classes already modelled.

**What to add:**

1. **System-theme resolution tests** (Playwright, `colorScheme: 'dark'` on the
   context). Assert `data-theme="dark"` with *no* stored preference, on all three
   surfaces. This is the actual new behaviour and nothing tests it today.
2. **Pre-paint / no-flash.** Screenshot at first paint, or assert
   `data-theme` is already set in a `document_start`-equivalent hook. Cheaper
   proxy: unit-test the resolver function's purity, and assert the pre-paint script
   contains no `await`/callback-only API — a lint-style check in `design-audit.mjs`
   would catch a regression back to the async `theme-loader.js` shape.
3. **Live update.** `emulateMedia({ colorScheme })` mid-test, assert `data-theme`
   flips without a reload; assert it does *not* flip when an explicit override is set.
4. **Override round-trip**, including the `storage.local` → `storage.sync` migration.
5. **Webapp dark coverage.** This is the real gap: `test:visual` has no dark
   baselines and there is no webapp equivalent of the rendered-DOM audit. Add dark
   snapshots for the marketing home, `/upgrade` and the dashboard (baselines are
   gitignored and regenerated locally per `CLAUDE.md`), and — more valuable than
   pixels — run the `PAGE_AUDIT` contrast/ramp helper against the webapp in both
   themes so a hardcoded `#fff` under `--text` fails loudly.
6. **Coach-mark in both themes**, in both its contexts (`tour.js` on YouTube and
   `?sp` in the panel) — `tests/tour-packaged.spec.ts` is the natural home.

**Should `ci-design-conformance` gate on dark?** **Yes — and it nearly does
already.** `.github/workflows/ci-launch-gates.yml:27-49` runs `design-audit.mjs`,
`design-audit.mjs --dist` and `ext:verify`; the *rendered* dark audit lives in
`design-consistency.spec.ts`, which runs under `ci-extension-smoke`. Concretely:

- Extend `design-audit.mjs` with a **dark-completeness rule**: every color-bearing
  token in `:root` either has a `[data-theme="dark"]` override or is on an explicit
  allowlist (the ramps, the documented no-ops). This is the rule that would have
  caught the missing `--shadow-*` and `--secondary-hover` in §4, statically, in
  milliseconds. Add it to the `RULES` list at `design-audit.mjs:498`.
- Extend the **contrast** rule to check dark-mode pairs, not just light.
- Keep the rendered dark audit in `ci-extension-smoke` (it needs a real browser and
  `xvfb-run`), but extend it to the webapp surfaces added in Phase 3.

Both are additive to gates that already run on every PR — no new CI job needed.

---

## 9. Open decisions for Ash

1. **§6 — system-only default with an opt-in "Match YouTube", or an implicit
   "dark if either the OS or YouTube is dark" for the side panel?** The plan
   recommends the former; the latter better serves the literal eye-strain complaint
   at the cost of ClipMark-internal consistency. This is the only decision that
   changes the shape of the work.
2. **Ship Phases 0–2 (extension) without waiting on Phase 3 (webapp)?** Recommended
   yes — the extension is where the complaint lives and it's ~3 days vs ~8.
3. **§2.3 — keep the 200ms `background`/`color` transition on load** (it fades the
   correction rather than flashing it) **or gate it behind a post-paint class?**
   Low stakes; recommend gating.
