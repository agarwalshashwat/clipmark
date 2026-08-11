# System-Synced Dark Mode — Status & Remaining Work

**Status:** Phases 0–2 **shipped** in extension v1.0.4 (PR #103). Phase 3 — the
webapp — is the only substantial work left.
**Scope of this doc:** what shipped and why, the decisions that are settled, and
the remaining webapp work. Audited against `origin/main` @ `467ba44`.

The goal has not changed: all three ClipMark surfaces resolve their theme from the
user's OS setting, live-update when it changes, and never flash the wrong theme on
load, with a manual override that defaults to "follow system". Two of the three
surfaces now do this.

---

## 1. What shipped in v1.0.4

Dark mode was ~70% built and 0% reachable: a near-complete dark palette, ~88
hand-written dark CSS rules in the extension, and three theme switches all
commented out or hardcoded to light. #103 made it reachable.

**Tokens** (`packages/design-system/tokens.css`, then `make sync-tokens`):

- dark `--shadow-*` deepened — an 0.08-alpha black shadow is invisible on `#0a0a0f`
- `--secondary-hover` flips to `--ai-soft` in dark; it resolved to `--ai-strong`
  (`#7c3aed`), which measures **2.58:1** on the dark canvas
- new `--scrim`, `--on-primary`, `--focus-ring`, `--elevation-rim` in both themes
- dark `--accent-light` raised 12% → 18%; 12% teal over `#0a0a0f` is invisible
- the gray and teal ramps deliberately keep **no** dark override (R1)

**Resolution** (`extension/src/popup/theme-loader.js`, rewritten):
`matchMedia('(prefers-color-scheme: dark)')` is the source of truth; the stored
preference is a nullable override in `chrome.storage.sync` defaulting to `system`.
The pre-paint path is synchronous only — `matchMedia` plus a `localStorage` mirror
of the override. The previous file read `chrome.storage` asynchronously, so its
callback landed after first paint and it guaranteed the very flash its comment
promised to prevent. Live `matchMedia` and `chrome.storage.onChanged` listeners,
plus a `storage.local` → `sync` migration of any pre-existing pick. `storage.sync`
is authoritative over the mirror, so clearing the override returns to following the
OS rather than honouring a stale cached pick.

**Surfaces:** three-state System / Light / Dark toggle restored on the side panel
and dashboard, kept in step through `storage.sync` without a reload. The side
panel's one hardcoded light background (`.soft-paywall-btn`) also put
`--brand-ink` on white — teal-400 at ~1.9:1 in dark; it is now `--on-primary` over
`--accent-strong`, 5.47:1 in both themes. The dashboard's 17 hardcoded light
backgrounds were tokenized onto the token each one's own `[data-theme="dark"]`
override already used, so light is unchanged. The coach-mark
(`extension/src/tour-theme.css`) gained a literal-valued
`@media (prefers-color-scheme: dark)` block, gated behind `html:not([data-theme])`
so it cannot put a dark card inside a light panel.

**Packaging trap worth remembering:** Vite only bundles *module* scripts. It left
`<script src="../popup/theme-loader.js">` verbatim and emitted no file, so
`vite dev` worked and the packaged pages 404'd — the same dev-vs-dist trap the
twin-file convention exists for. A `closeBundle` plugin now ships the file and
fails the build if any classic page script does not resolve in `dist/`.

**Testing:** `scripts/design-audit.mjs` gained **R9** — every colour-bearing token
needs a `[data-theme="dark"]` override or an allowlist entry, dark-mode contrast
pairs are checked, and a lint asserts the pre-paint path stays synchronous. It
reproduces the `--secondary-hover` finding statically, in milliseconds.
`tests/design-consistency.spec.ts` gained 8 rendered tests against
`extension/dist`: system resolution, first-paint correctness with no post-paint
correction, live OS flips, override precedence and round-trip, the `storage.local`
migration, toggle cycling, and either-is-dark on both surfaces.

---

## 2. Decisions on record

**2.1 The panel follows "either-is-dark".** The side panel goes dark when the
system is dark **or** YouTube is dark, so a user who darkens only YouTube on a
light OS still gets a matching panel. The content script reports `<html dark>` on
request and pushes changes from a one-attribute `MutationObserver`; the panel
re-reads on tab switch and SPA navigation, and falls back to the system theme off
YouTube. Opted into declaratively via `data-theme-follow="youtube"` on
`side-panel.html`. The dashboard has no page to match and follows the OS alone.

This was chosen over the alternative — system-only with an explicit opt-in "Match
YouTube" — because the eye-strain complaint that motivated the work is precisely
the light-OS/dark-YouTube case, and requiring configuration to fix it leaves the
default broken for the people affected. The cost accepted: a light-OS user can see
a dark side panel beside a light ClipMark dashboard.

**2.2 The extension shipped without waiting for the webapp.** Phases 0–2 answer
the complaint on their own and went out as v1.0.4. Phase 3 ships independently to
Vercel. Keep them uncoupled.

**2.3 The 200ms load transition needs no gating.** `tokens.css` puts
`transition: background 0.2s, color 0.2s` on `html, body`, which would animate a
theme *correction* on load. It turns out to be moot: `data-theme` is correct at
first paint, so there is no correction to fade. The rendered suite asserts exactly
that ("the theme is correct at first paint, and never corrected after it"). Left
ungated deliberately.

**2.4 Our dark canvas deliberately does not match YouTube's.** ClipMark's dark
`--bg` is `#0a0a0f` (rgb 10,10,15 — blue-tinted). YouTube's dark page canvas is
`#0f0f0f` (rgb 15,15,15 — neutral grey), measured live from a watch page with
YouTube's own dark theme on. Decided 2026-08-11: **leave the mismatch.** The
5/255 gap on two channels is not visible in practice, and Chrome's own chrome
separates the docked panel from the page rather than butting them together —
verified by capturing both sides and zooming the boundary 10×.

Do not "fix" this by changing `--bg`: it is shared, so the dashboard and webapp
would inherit a colour chosen to match a page they never sit beside, and every
dark contrast ratio would need re-checking under R9. If it is ever revisited, the
surgical version is to override `--bg` in the side panel *only when dark was
resolved because of YouTube* — the resolver already knows
(`ClipMarkTheme.followsYouTube()` plus the YouTube signal), it just doesn't expose
the reason to CSS. A `data-theme-source="youtube"` attribute alongside
`data-theme` would carry it.

To reproduce a dark YouTube in a test: signed-out YouTube ignores
`prefers-color-scheme`, so set the `PREF=f6=400` cookie on `.youtube.com`.

---

## 3. Constraints that still bind

| | Where it runs | Tokens available? | Theme applied via |
|---|---|---|---|
| **Extension pages** (side panel, dashboard) | `chrome-extension://` page, own document | ✅ `design-tokens.css` imported | `data-theme` on `<html>` + pre-paint script |
| **Webapp** (Next.js) | `clipmark.mithahara.com`, own document | ✅ `@import './design-tokens.css'` | `data-theme` on `<html>` + inline pre-paint script |
| **On-YouTube injected UI** | inside `youtube.com`'s document | ❌ **our `:root` does not exist there** | *nothing* — literal values only |

That third row is why `tour-theme.css` and the content script's injected styles
carry literal ramp values by design, and why a `var()` there resolves to nothing.
`scripts/design-audit.mjs` encodes it as an audit class (`ON_YOUTUBE`).

**The on-YouTube injected UI needs no theme work.** `content.js`'s ~40 styled
selectors are all docked to or overlaid on the video player, whose chrome is black
in both YouTube themes, and its palette is already the dark-surface brand ink plus
white-alpha fills. The only on-YouTube element that sits on the *page* was the
coach-mark, and that shipped in #103.

**Ramps stay fixed.** `--teal-*` and `--gray-*` must not get dark overrides; R1
enforces it. **All token edits go in `packages/design-system/tokens.css` only**,
then `make sync-tokens` — the two synced copies must stay byte-identical or
`ci-design-conformance` fails.

---

## 4. Remaining work — Phase 3, the webapp

Dark mode is **not user-reachable on the web** today. Effort: ~3–5 days, almost
entirely mechanical literal-replacement, and it parallelises cleanly across files.

### 4.1 Resolution wiring

1. Drop `data-theme="light"` from `webapp/app/layout.tsx:93`. Ship `<html>` bare
   and let the pre-paint script stamp it.
2. Extend the inline pre-paint script (`layout.tsx:72-73`) with the system branch
   and the three-state preference. It is already correctly *synchronous* — it
   reads `localStorage` — but it only ever sets dark, so a first-time visitor is
   forced light regardless of OS. Keep it in `<head>`, before any stylesheet that
   paints.
3. Rewrite `webapp/app/components/ThemeProvider.tsx` to hold
   `'system' | 'light' | 'dark'` rather than `Theme`, and to initialise from the
   resolver instead of `useState<Theme>('light')` (`:13`) / `stored ?? 'light'`
   (`:17`). Add the `matchMedia` change listener. Guard against hydration
   mismatch: the server cannot know the theme, so read it in an effect or from the
   DOM attribute the pre-paint script already set, and never render
   theme-dependent markup on the server.
4. **Render `ThemeToggle`** — `webapp/app/components/ThemeToggle.tsx` exists,
   works, and is referenced nowhere but its own definition. Put it in
   `Navigation.tsx`, upgraded to three states.

Mirror the extension's contract (§1) rather than inventing a second one. Do **not**
try to share the preference between extension and webapp — separate origins,
separate stores; the OS setting is the shared signal and that is enough.

### 4.2 The sweep — 75 hardcoded light backgrounds

Re-counted on `467ba44`: **58** in 12 `.module.css` files, **17** inline in `.tsx`.
`#fff`/`white` → `--surface` or `--bg-card`; `#f9fafb`/`#f3f4f6` → `--bg` or
`--surface-alt`.

| File | Count |
|---|---|
| `dashboard/shell.module.css` | 13 |
| `dashboard/page.module.css` | 8 |
| `(marketing)/page.tsx` *(inline)* | 8 |
| `dashboard/groups/page.module.css` | 6 |
| `(marketing)/v/[shareId]/page.module.css` | 5 |
| `dashboard/_components/toolbar.module.css` | 5 |
| `(marketing)/u/[username]/page.module.css` | 4 |
| `dashboard/videos/page.module.css` | 4 |
| `dashboard/queue/page.module.css` | 4 |
| `(marketing)/upgrade/upgrade.module.css` | 3 |
| `dashboard/_components/SettingsContent.module.css` | 3 |
| `dashboard/shared/page.module.css` | 2 |
| `dashboard/analytics/page.module.css` | 1 |
| `(marketing)/signin/page.tsx` *(inline)* | 2 |
| `(marketing)/affiliate/page.tsx` *(inline)* | 2 |
| `dashboard/_components/GroupPickerModal.tsx` *(inline)* | 2 |
| `admin/_components/AdminPanel.tsx` *(inline)* | 2 |
| `embed/[shareId]/page.tsx` *(inline)* | 1 |

The inline `.tsx` ones have no cascade to lean on, so they need editing rather
than overriding. Note `webapp/app/globals.css` also paints `.footer`, `.faq-card`
and `.cm-card` light.

**Why the body looks light today** is *not* a layout bug: `tokens.css` does set
`html, body { background: var(--bg) }` and that resolves dark correctly. The
marketing page paints opaque white *over* it, section by section, in inline
styles. So the fix is this sweep, not a one-line layout change.

### 4.3 Leave literal on purpose

`webapp/app/api/og/route.tsx` — Satori OG images render server-side with no user
theme and must stay light-only and literal. It is already flagged `LITERAL_ONLY`
in `design-audit.mjs`; make sure the sweep does not "helpfully" tokenize it.

### 4.4 Port the tag-hue pattern

The pastel tag chips on the marketing page are hardcoded. The extension already
solves this: JS emits only a hue (`--tag-h`/`--tag-s`) and CSS picks lightness per
theme, so a theme flip re-colours pills rendered once. Copy that. Also the
`rgba(0,0,0,0.03)` hero grid vanishes on dark — use a `currentColor` alpha or a
token.

---

## 5. Testing to add for Phase 3

The rendered extension audit **is** gated as of PR #104 (`ci-extension-smoke` runs
`npm run test:design:rendered`). The webapp has no equivalent, and that is the
real remaining gap:

1. Run the `PAGE_AUDIT` contrast/ramp helper against the webapp in **both** themes,
   so a hardcoded `#fff` under `--text` fails loudly. More valuable than pixels.
2. Add dark visual baselines for the marketing home, `/upgrade` and the dashboard.
   Baselines are gitignored and regenerated locally.
3. Assert system resolution on the webapp with `colorScheme: 'dark'` and no stored
   preference, plus a live `emulateMedia` flip, mirroring the extension tests.
4. Extend R9's pre-paint lint to the webapp's inline script once it grows the
   system branch.

---

## 6. Follow-up: DESIGN.md has drifted behind the implementation

`DESIGN.md` is the canonical design reference and is machine-enforced by
`design-audit.mjs` (R0–R9) plus the rendered spec. #103 followed its rules — one
gray ramp, `--brand-ink`/`--ai-ink` instead of hand-picked ramp steps, literals
kept in the on-YouTube class — but **did not update the document itself**:

- `--scrim`, `--focus-ring` and `--elevation-rim` are new tokens that `DESIGN.md`
  does not mention at all. (`on-primary` was already specified there —
  `DESIGN.md:25` — and #103 implemented it.)
- The dark-mode *behaviour* is undocumented: system resolution, the three-state
  override, either-is-dark, and the pre-paint contract exist only in code, this
  doc, and R9.

Fold these into `DESIGN.md` so the knowledge base stays canonical — that is the
whole point of it being enforced. Cheap to do, and it should happen before Phase 3
starts adding webapp theme code against it.
