# Guided Onboarding Tour — Spec

Status: **planning only, not implemented.** No code changes ship with this document.

## 1. Why

Activation — getting a new user to a "wow" moment inside their first session — is a stated
priority for ClipMark. Today a first-time user who installs the extension and lands on a
YouTube video has no in-product guidance: no indication that Alt+B saves a bookmark, that
saved moments show up on the scrubber, that a side panel exists, or that Active Recall turns
saved moments into review flashcards. This spec covers a spotlight/coach-mark tour to close
that gap, across every real surface ClipMark ships today:

1. The YouTube watch page (`extension/src/content/content.js`)
2. The extension side panel (`extension/src/popup/side-panel.js`)
3. The extension's own dashboard page (`extension/src/popup/dashboard.js`)
4. The webapp's cloud dashboard (`webapp/app/dashboard/`, Next.js/React)
5. The marketing site (`webapp/app/(marketing)/`)

Every step below is grounded in code that exists today. Nothing here describes a feature that
isn't shipped.

---

## 2. Library recommendation

| | **Driver.js** | Shepherd.js | Intro.js | react-joyride |
|---|---|---|---|---|
| Bundle (gzip) | ~5 KB | ~15–20 KB (+ Floating UI dep) | ~10 KB | ~30–40 KB (React + react-floater required) |
| Dependencies | none | Floating UI | none | React, react-floater, scroll utilities |
| License | MIT | MIT | **AGPL-3.0 / commercial dual license** | MIT |
| Framework | vanilla, works anywhere | vanilla | vanilla | **React-only** |
| Styling | plain CSS classes, fully overridable | plain CSS + some inline positioning | CSS + some inline styles | CSS-in-JS-ish, less direct control |
| MV3 fit | clean — no eval, no remote code, plain DOM/CSS | clean | clean | would require bundling React into a content script |

**Recommendation: Driver.js, used identically on every surface.**

- **Intro.js is disqualified on licensing grounds**, not just preference: its core license is
  AGPL-3.0 with a paid commercial tier for closed-source use. `CONTRIBUTING.md` states this
  repo is proprietary ("do not redistribute or publish forks"), which is incompatible with
  AGPL's copyleft terms without a paid license.
- **react-joyride is disqualified for the extension surfaces**: it's React-only. The extension
  is deliberately vanilla JS with zero runtime dependencies (`extension/package.json` has none
  beyond build tooling) and content scripts follow a "classic script sharing one global scope"
  convention (see the twin-file pattern in `CLAUDE.md`) that a React-based library doesn't fit.
  Using react-joyride only for the webapp dashboard and a *different* library for the extension
  would mean maintaining two coach-mark systems, two theming setups, and two mental models —
  worse than picking one library that works everywhere, even inside React (Driver.js is trivial
  to call imperatively from a `useEffect`).
- **Shepherd.js** is a reasonable second choice but has no advantage over Driver.js here and
  costs 3–4× the bundle size for features (its own popover positioning engine) this spec
  doesn't need, since every surface already has fixed reference elements to spotlight.
- **MV3 constraints Driver.js satisfies:** it does not use `eval`/`new Function`, does not load
  remote code (MV3 forbids remotely-hosted code entirely — the extension must bundle the
  library via npm, never a CDN `<script src>`), and only manipulates the DOM/injects a
  `<style>` tag — the same mechanism `content.js`'s own `injectStyles()` already uses.

**Packaging note (flagged for implementation, not solved here):** side-panel.js, dashboard.js,
and the webapp are all ES modules and can `import` Driver.js normally. `content.js` is a
*classic* script (loaded directly via `manifest.json`'s `content_scripts`, sharing one global
scope with `constants.js`/`recall.js`/`usage-caps.js` — see `CLAUDE.md`'s twin-file convention).
Driver.js ships a UMD/IIFE build that self-registers a global, so it can be added to the
`content_scripts.js` array the same way `local-ai.js` already is, without needing an ESM import
inside content.js. This is the recommended approach; the exact build wiring is an
implementation detail for whoever picks this up.

**Theming:** one shared CSS override file, sourced from `packages/design-system/tokens.css`
(the canonical token file — `extension/styles/` and `webapp/app/` receive synced copies via
`make sync-tokens`, never edited directly). Key tokens to reuse rather than hardcode new colors:

```css
--accent: #14B8A6;       /* teal — spotlight border / active step */
--accent-hover: #0d9488;
--text: #111827;         /* "ink" body text in popovers */
--bg: #f9fafb;           /* "cream" popover background (light mode) */
--radius: 10px;
```

`content.js` already uses `--accent` (`#14B8A6`) for its own toast/marker styling, so a tour
popover styled with the same token will look native to the rest of the extension rather than
bolted on.

---

## 3. Extension tour — YouTube watch page (highest impact)

This is really **two coordinated sub-tours**, not one continuous overlay, because of a hard
MV3 constraint: a content script can only spotlight elements inside the YouTube page's own DOM.
It **cannot** reach into the browser's toolbar (where the extension icon lives) or into the
side panel (a separate top-level document). Any step that needs to reference those has to be an
*instructional* callout (a popover with no live spotlight target, e.g. an arrow graphic pointing
off-page), not a true Driver.js "highlight this element" step. This changes the shape of the
tour but not its coverage — the user still sees all five things requested, just via two
scripted contexts that hand off to each other.

### Sub-tour A — on the YouTube page (`content.js`)

Triggers once, the first time the content script initializes on a `youtube.com/watch` page
after install (see Mechanics, §6).

1. **The player bookmark button.** Spotlight `.yt-bookmark-player-btn`, injected into
   `.ytp-right-controls` (`content.js:246-267`). Copy: *"Click to bookmark this exact moment."*
2. **The keyboard shortcut.** No new spotlight target (or re-highlight the same button); copy:
   *"Or just press **Alt+B** anywhere on the page — it saves silently, no need to open
   anything."* This maps to `handleKeyboardShortcut()`'s `event.altKey` + `'b'` branch
   (`content.js:701-703`), which calls `silentSaveBookmark()` directly.
   - **Known inconsistency to fix first:** the player button's own tooltip currently reads
     *"Bookmark this moment (Alt+S)"* (`content.js:254`), and Alt+S is wired to
     `chrome.runtime.sendMessage({ action: 'openPopup' })` (`content.js:706`) — a message with
     **no listener anywhere in `background.js`** (confirmed: no `'openPopup'` handler exists).
     Alt+S is a dead shortcut today; Alt+B is the one that actually saves. Several Playwright
     specs and a stale comment header (`content.js:535`) still say "Alt+S" too. **This tooltip
     (and ideally the tests) should be corrected to Alt+B before or alongside this tour ships**
     — a tour that says "Alt+B" while the button it's pointing at still says "Alt+S" undermines
     the tour's own credibility on the first thing it teaches.
3. **The scrubber markers.** Spotlight `.yt-bookmark-markers` inside `.ytp-progress-bar`
   (`content.js:192-197`) — only shown once the user has saved at least one bookmark this
   session (gate the step, don't spotlight an empty scrubber). Copy: *"Every bookmark shows up
   right on the scrubber. Hover to preview, click to jump straight to it."*
4. **Handoff to the side panel.** Non-spotlight instructional card (no live DOM target — the
   extension icon lives in the browser's toolbar, outside page reach): *"Open the ClipMark icon
   in your toolbar to see everything you've saved and try Active Recall."* On dismiss/finish,
   set a "pending" flag so that the *next* time the side panel opens, Sub-tour B auto-starts —
   this is what makes the two contexts feel like one continuous tour rather than two unrelated
   ones.

### Sub-tour B — inside the side panel (`side-panel.js`)

Triggers automatically the first time the side panel opens after Sub-tour A finishes (or
independently, the first time the side panel opens at all, if a user opens it before ever
visiting a YouTube page — same "seen" flag either way).

5. **Active Recall.** Spotlight `#revisit-mode-btn` (`side-panel.js:1402-1436`), which — after a
   free-tier review-cap check — sends `{ action: 'startRevision', bookmarks, recall: true }` to
   the content script, which renders the recall overlay back on the YouTube page. Copy:
   *"Once you've saved a few moments, Active Recall quizzes you before each clip plays —
   real retention, not just a replay."* Gate this step behind having ≥1 bookmark for the
   current video (there's nothing meaningful to recall otherwise); if the user has zero
   bookmarks when the side panel first opens, end the tour after a lighter *"Come back here
   once you've saved a moment or two"* card instead of forcing the step.
   - Optional secondary anchors in the same panel, if the tour is extended: `#add-bookmark`
     (manual save), `#auto-fill-btn` (transcript auto-fill), `#share-btn` (share a collection),
     `#dashboard-link` (open the full dashboard). Recommend keeping the *first-run* tour to the
     five things requested (button, shortcut, markers, side panel, Active Recall) and treating
     these as candidates for a later "tips" tour rather than bloating session one.

### MV3 / injection risk factors (apply to Sub-tour A)

- **SPA navigation.** YouTube never does a full page reload between videos; `content.js`
  already listens for `yt-navigate-finish` (`content.js:1818-1826`) to reset itself. A tour mid-
  step when the user navigates to a new video should **dismiss, not try to survive** — re-
  anchoring a coach-mark across a YouTube SPA transition is more fragile than it's worth for a
  one-time tour.
- **DOM churn / re-anchoring.** `content.js` runs two long-lived `MutationObserver`s
  (`content.js:167, 182`) just to detect YouTube tearing down and rebuilding the `<video>` and
  `.ytp-progress-bar` elements. Tour target lookups must go through the same observer-based
  pattern, not a one-time `querySelector` — a step whose target element gets replaced mid-tour
  will otherwise silently point at nothing.
- **z-index.** The existing UI stack tops out at `999999` (marker tooltip, revision overlay —
  `content.js:1062, 1188`). A tour spotlight/popover must render above that, and be tested
  against YouTube's own theater-mode and fullscreen chrome, which can carry very high z-index
  values of their own.
- **Trusted Types / CSP.** No existing Trusted Types policy was found in `content.js`, and it
  currently gets away with plain `innerHTML` (e.g. the marker tooltip). This should be
  explicitly re-verified in a current Chrome + YouTube session at implementation time rather
  than assumed safe by precedent — YouTube's own Trusted Types enforcement has changed before
  and could change again.
- **No remote code.** Whatever tour library is bundled must ship inside the extension's build
  (via `vite build`, `extension/dist/`) — MV3 flatly forbids fetching and executing remote
  script, so a CDN-hosted tour script is not an option regardless of library choice.

---

## 4. Dashboard tours

Two genuinely distinct, separately-shipped dashboards exist and both are worth a tour:

- **`extension/src/popup/dashboard.js`** — vanilla JS, served from a `chrome-extension://` page
  (`src/pages/dashboard.html`), reads/writes `chrome.storage.sync` directly.
- **`webapp/app/dashboard/`** — a full Next.js/React app at `clipmark.mithahara.com/dashboard`,
  Supabase-backed, with materially more surface area (Analytics, Groups, Affiliate, Referral).
  It only reaches into the extension for one action — starting a live Active Recall session on
  an actual YouTube tab, which only the extension can drive — and degrades gracefully to a
  plain link if the extension isn't installed (`webapp/app/dashboard/_utils/extension.ts`).

### 4a. Extension dashboard.js tour

1. **View switcher.** The dashboard renders in one of several `viewMode`s (cards, timeline,
   groups, analytics, revisit — see the `viewMode` state and `renderBookmarks()` branch in
   `dashboard.js`). Spotlight the view toggle control; copy: *"Switch between cards, a
   timeline, and grouped views of everything you've saved."*
2. **A bookmark card.** Spotlight one rendered card (`.vc-card`); copy: *"Jump to the moment,
   add notes, or copy a timestamped link."*
3. **Active Recall from the dashboard.** Spotlight a card's `.vc-revisit-btn` (confirmed at
   `dashboard.js` in `attachEventListeners()`), which Pro-gates and then opens the video with a
   pending recall session. Copy: *"Start an Active Recall session for any video, right from
   here."*
4. **Export.** Spotlight the export control; the real, confirmed export functions are
   `exportJSON`, `exportCSV`, `exportMarkdown`, `exportAnki` (Pro-gated with a free-tier monthly
   cap), `exportObsidian`, `exportNotionCSV`, and `exportReadingList`. Copy: *"Export to Anki,
   Notion, Obsidian, or plain files — your data always leaves with you."*

### 4b. Webapp dashboard tour

Grounded in `webapp/app/dashboard/_components/DashboardChrome.tsx` and `DashboardContent.tsx`:

1. **Sidebar navigation.** Spotlight the sidebar; copy: *"All Bookmarks, Videos, and Reminders
   live under Library; Analytics, Groups, and Shared collections are under Curations."*
2. **A bookmark card / the search box.** Spotlight the search input; copy: *"Search across every
   bookmark you've ever saved."*
3. **Due reviews.** Spotlight the recall "due" chip row (`styles.recallDueChip` in
   `DashboardContent.tsx`); copy: *"These are due for review — click one to start Active Recall
   right on YouTube."* (If the extension isn't installed, this already degrades to a plain
   link — the tour copy should not promise the in-page recall experience in that case.)
4. **Export, including Anki.** Spotlight the export menu (`buildAnkiTsvFromCollections`,
   kept in parity with the extension's own export logic per `_utils/anki.ts`'s explicit
   twin-file comment). Copy: *"Export your collection — including a one-click Anki deck."*
5. **Sharing.** Spotlight `ShareCollectionButton`; copy: *"Share a public, read-only link to any
   collection."*

The existing empty-state copy — *"No collections yet — Install the extension and bookmark
moments from YouTube videos to see them here"* (`DashboardContent.tsx`) — is the natural
fallback for a brand-new webapp-only user with nothing to spotlight yet; the tour should not
try to force steps 2–5 over an empty dashboard. Show step 1 (nav) plus the empty-state message,
and let the real tour resume once bookmarks exist.

---

## 5. Marketing site — two options, owner's call

A "How It Works" section **already exists** on the landing page — titled *"The Curator's
Journey"* (`webapp/app/(marketing)/page.tsx`, `id="how-it-works"`), a static 3-card layout
(Bookmark Instantly / Organize with AI / Recall It Until It Sticks) with a decorative connector
line. No coach-mark library, scroll-animation library, or interactive-tour pattern exists
anywhere on the marketing site today (`IntersectionObserver`, `framer-motion`, `AOS` — zero
hits across the whole webapp).

**Option A — recommended: lightweight scroll enhancement, no coach-marks.**
Enhance the existing static section with `IntersectionObserver`-based fade/slide-in reveals as
the user scrolls to each step — a continuous narrative, not a gated interaction. No new
dependency (a few dozen lines of vanilla JS). Rationale: marketing pages convert on scroll
momentum; forcing a visitor who hasn't installed anything yet through a "click next" coach-mark
tour (which implies a live product state that doesn't exist pre-install) reads as friction, not
delight, and forced-interaction UI on a still-evaluating visitor tends to raise bounce rate
rather than lower it.

**Option B — an interactive, self-guided product demo.**
Use Driver.js in an autoplaying/self-guided mode over a sandboxed, static mock (a fake video
player + a simulated Alt+B keypress and marker appearing) to *show* the exact in-product tour
rather than describe it. Stronger "wow" demonstration for skeptical visitors, but real build
cost (a mock player is new UI, not a rendering of anything that exists today) and introduces
Driver.js as a marketing-site dependency where zero animation/interaction libraries exist now.
Risk: a demo that's slightly off from the real product (timing, visuals) can undersell the real
thing more than a static section would.

**Recommendation: Option A.** Presenting both because the owner explicitly asked about a tour
on the website — this is a real decision point, not a foregone conclusion.

---

## 6. Mechanics

**Triggering — first-run only, per surface, never polled.** Each surface checks its own "seen"
flag once on load; if unset, launch; on completion *or* dismissal, set it. Never re-show
automatically.

| Surface | Flag storage | Rationale |
|---|---|---|
| YouTube page + side panel (Sub-tours A & B) | `chrome.storage.sync`, e.g. `tourState: { youtubeTour, sidePanelTour }` | Consistent with the existing `bmUser`/`vgroups` pattern already stored there; syncs across the user's own Chrome installs. Payload is trivially small relative to `chrome.storage.sync`'s 100 KB/8 KB-per-item quota. |
| Extension dashboard.js | Same `chrome.storage.sync.tourState` object, additional key | Same document/store as the panel; no reason to split it. |
| Webapp dashboard | **MVP: `localStorage`** (per-browser, zero migration). Upgrade path: a `profiles` table column (e.g. `tour_state jsonb`), added via a new numbered migration per `CLAUDE.md`'s migration conventions, applied by hand with `make db-migrate` — never automatically, never against prod without a backup. | Start cheap; only pay for cross-device consistency (a DB column) if it turns out to matter in practice. This mirrors how `isPro` is server-side truth but a tour "seen" flag is much lower stakes than entitlement. |

**Dismissible.** Every step shows a visible close control; dismissing at any point still sets
the "seen" flag (a user who closes the tour should never see it forced again). Driver.js's
overlay-click-to-dismiss should be disabled on step 1 of each sub-tour specifically, so an
accidental click doesn't kill the tour before it says anything.

**Replay affordance.** None of the four in-product surfaces (`side-panel.js`, extension
`dashboard.js`, webapp dashboard) currently have a help/settings menu item at all — this is new,
small UI in each:
- Side panel + extension dashboard: a small "?" affordance that clears the relevant
  `chrome.storage.sync.tourState` key(s) and re-triggers.
- Webapp dashboard: a "Replay tour" link, most naturally placed in the existing Settings
  surface (`SettingsContent.module.css` already exists as a settings surface to extend).

---

## 7. Effort estimate & recommended build order

Rough, solo/part-time-founder-paced estimates:

| Item | Estimate |
|---|---|
| Driver.js integration + shared theme (tokens-based CSS override, one time) | 0.5–1 day |
| Extension YouTube-page tour (Sub-tour A: button, shortcut, markers, handoff card; MutationObserver re-anchoring; SPA-nav dismissal; z-index/theater-mode QA) | 2–3 days |
| Alt+B/Alt+S tooltip + test correction (prerequisite, not part of the tour itself) | 0.5 day |
| Side-panel tour (Sub-tour B: Active Recall, handoff from A) | 1 day |
| Storage/mechanics (sync flags, dismiss behavior, replay affordance ×3 surfaces) | 1 day |
| Extension dashboard.js tour | 1–1.5 days |
| Webapp dashboard tour (React wrapper around Driver.js + steps) | 1.5–2 days |
| Website "how it works" scroll enhancement (Option A) | 0.5–1 day |
| *(Website Option B, if chosen instead/additionally)* | *3–5 days, separate decision* |

**Total core build (through the webapp dashboard tour, excluding the website):** roughly
7.5–9.5 days.

**Recommended build order** (highest activation leverage first, and each step's storage/replay
plumbing built once rather than three times):

1. Alt+B/Alt+S correction (quick, unblocks the tour from contradicting itself)
2. Driver.js platform + shared theme
3. Extension tour, Sub-tours A + B (this is the highest-impact surface — it's where first-
   session activation actually happens)
4. Mechanics/storage + replay affordance (needed for #3 anyway; build it generically enough to
   reuse for #5 and #6)
5. Extension dashboard.js tour
6. Webapp dashboard tour
7. Website "how it works" enhancement (lowest urgency — marketing-only, and the existing static
   section already covers the content; this is polish, not a gap)

---

## 8. Open decisions for the owner

- **Alt+B vs. Alt+S:** confirm Alt+B is in fact the intended shortcut going forward (it's the
  one that works today and the one the marketing landing page's own "Curator's Journey" section
  already cites), then fix the player-button tooltip and the Playwright specs to match. This is
  a small, separate fix but should land before/alongside the tour.
- **Website tour approach:** Option A (scroll-enhance the existing static section, recommended)
  vs. Option B (build an interactive self-guided demo). Real cost and risk trade-off, not a
  default — needs an explicit call.
- **Webapp "seen tour" flag:** start with `localStorage` (recommended MVP) or go straight to a
  DB column for cross-device consistency. Recommend starting cheap and upgrading only if it
  proves to matter.
