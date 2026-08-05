# ClipMark Test Strategy

Comprehensive test strategy across the extension, webapp, their integration surface, and
non-functional/release concerns. This is a **plan**, grounded in the repo as of 2026-08-05 —
no test code is added by this document.

Related, narrower docs this supersedes/complements:
- [`docs/TEST_PLAN_launch.md`](TEST_PLAN_launch.md) — the original launch-blocker test plan
  (RLS self-grant-Pro, Dodo webhook, `/api/share`, cloud-sync isolation, admin auth). **Its
  proposals have shipped** — `webapp/tests/unit/`, `webapp/tests/integration/`, the DI refactor
  (`webapp/lib/clients.ts`), and the `ci-integration` job all exist in the form it proposed. Treat
  it as historical design rationale, not a live gap list. Its two open follow-ups (`webhook_events`
  idempotency table; a stale `#11` cross-reference in `tests/unit/logic.test.mjs`'s header comment)
  are carried forward into this doc (§Non-functional, §Highest-risk gaps).
- `CHECKLIST.md` — manual pre-release QA checklist. Not automated; out of scope here except where
  a phase below proposes automating part of it.

## A note on the brief's example test cases

The request that prompted this doc named two example risk areas to anchor test cases on: "the
Pro-gating that had a live RLS bypass" and "the `groups.position` migration." The first is real and
is covered in depth below (§Security/CSP, §API and database sync). **The second does not exist in
the current repo** — there is no `position` column on `groups` or `group_collections`
(`webapp/migrations/005_groups.sql`), no reorder/drag-and-drop logic in `dashboard.js`'s group
functions, and no migration matching that description across `webapp/migrations/001`–`014`. Rather
than invent a feature to test, §Web app dashboard covers the *actual* groups feature
(create/rename/delete/toggle-video-in-group, cascade behavior) as it exists today. If group
reordering is planned, note it here and this doc can be extended when it lands.

## Current state snapshot (verified, not estimated)

| Layer | Files | Cases | Runs in CI? |
|---|---|---|---|
| `tests/unit/*.test.mjs` (extension logic, `node:test`) | 8 | 197 | ✅ `ci-unit` |
| `webapp/tests/unit/*.test.ts` (webapp logic, `node:test`+`tsx`) | 9 | 70 | ❌ **not wired into any job** |
| `webapp/tests/integration/*.test.ts` (local Supabase) | 10 | 46 | ✅ `ci-integration` |
| `tests/*.spec.ts` (Playwright, extension project, headed) | 10 | 69 | ✅ `ci-extension-smoke` (1 smoke spec only, full 69 not gated) |
| `tests/ci/*.spec.ts` (Playwright smoke) | 2 | 2 (×2 projects, see below) | ✅ both smoke jobs |
| `tests/visual/*.spec.ts` (Playwright, webapp project, headless) | 4 | 5 | ✅ `ci-webapp-visual-smoke` (1 smoke spec only) |

**389 test cases exist across 43 files.** Only a subset actually gates merges today — see
§Highest-risk gaps, #1.

## Guiding principles

1. **Reuse what's already here.** `node --test` (+ `tsx` for TS) is the only test runner in the
   repo and handles both extension and webapp logic tests fine — no Jest/Vitest migration needed.
   Playwright is already configured for both headed-extension and headless-webapp use. New tooling
   is named only where a real capability gap exists (chrome-API mocking, manifest linting,
   multi-browser matrix) — flagged explicitly per section below.
2. **Solo, pre-launch context drives sequencing.** Effort estimates are solo-developer days, not
   team-sprints. Phase 0 is deliberately tiny and highest-leverage: it's a CI config fix, not new
   test code.
3. **Twin-file discipline extends to tests.** Anywhere new pure logic is extracted from a
   classic-script global (`background.js`, `content.js`, `side-panel.js`, `dashboard.js`) for
   testability, follow the existing `.module.js` twin convention
   (`constants.js`/`constants.module.js`, `recall.js`/`recall.module.js`) so the content-script
   build stays correct and `content-globals-guard.mjs` keeps protecting it.
4. **Don't duplicate coverage across layers.** Playwright already exercises `background.js` /
   `content.js` / `side-panel.js` / `dashboard.js` end-to-end in a real browser — this is real,
   valuable coverage, not a placeholder. New unit tests target *pure logic* and *fast feedback*,
   not a wholesale replacement of E2E.

---

## Chrome extension

### 1. Content script testing

**What to test:**
- Bookmark creation/dedup logic in `content.js`: `Math.floor(timestamp)` duplicate rejection,
  `reviewSchedule` stamping, description auto-fill ("Bookmark at M:SS").
- Marker rendering/clustering: `clusterBookmarks`, `updateBookmarkMarkers` — given a set of
  timestamps close together on the progress bar, assert cluster grouping thresholds and that marker
  count doesn't grow unbounded across re-renders.
- `initializeMessageListener` (content.js:722) — all ~15 `request.action` branches (`ping`,
  `getCurrentTime`, `getBookmarkData`, `getVideoTitle`, `getCurrentChapter`,
  `getTranscriptSnippet`, `showToast`, `showSaveFlash`, `getTimestamp`, `seekTo`, `setTimestamp`,
  `bookmarkUpdated`, `startRevision`, `exitRevision`, `getTranscriptCachedAtTimestamp`,
  `getTranscriptAtTimestamp`) — each should return the right shape and not throw for malformed
  input (unknown action, missing fields).
- Active Recall revision-mode state machine: `startRevisionMode` → `showRecallPrompt` →
  `showRecallGrade` → `handleRecallGrade` → `gradeAndPersistBookmark` — grading writes back the
  right `reviewSchedule` update, and exiting mid-flow (`exitRevision`) leaves no dangling DOM/state.
- SPA navigation handling: `yt-navigate-finish` / `yt-page-data-updated` listeners
  (content.js:1813, 1825) and the two `MutationObserver`s that re-inject markers — verify that
  repeated navigation doesn't accumulate duplicate listeners/observers (see §Performance below;
  this is the same code path, tested from two angles).
- Tag parsing/coloring (`parseTags`, `getTagColor`, `stringToColor`) — already has decent coverage
  via `logic.test.mjs`; verify it stays exercised against the real source, not just the inlined
  copy (see the fixture-drift gap below).

**Tool/framework:** `node:test`, no new dependency, **for the pure-logic slice**. `content.js` is a
1856-line classic script that mutates the real YouTube DOM heavily (progress bar injection,
`MutationObserver`s) — that DOM-dependent behavior is already covered by Playwright
(`tests/marker-interactions.spec.ts`, `tests/youtube-selectors.spec.ts`,
`tests/extension-injection.spec.ts`) against real YouTube pages, which is more faithful than a
jsdom simulation of YouTube's DOM. **Do not add jsdom here** — it would duplicate Playwright's
existing E2E coverage at lower fidelity for a heavily-DOM-coupled file. Instead:
- Extract more pure logic (clustering math, dedup/description-fill rules, message-branch response
  shaping) into a `content-logic.module.js` twin, following the existing pattern, and unit-test
  the module directly.
- Retire the **hand-inlined copies** in `tests/unit/logic.test.mjs` once the real functions are
  importable — the file's own header comment already flags this as a maintained fork with drift
  risk ("keep the remaining inlined copies in sync with their source files"). This closes the
  dangling `docs/TEST_PLAN_launch.md (#11)` cross-reference (that item doesn't exist in the plan;
  it should point at this doc instead).

**Where tests live:** `tests/unit/content-logic.test.mjs` (new, alongside the existing 8 files);
DOM-dependent behavior stays in `tests/*.spec.ts` (existing).

**Fixtures/mocks needed:** none new for the pure-logic slice (plain function imports). No chrome-API
mock needed here since the target functions don't touch `chrome.*`.

### 2. Background (service worker) script testing

**What to test:**
- `chrome.runtime.onMessageExternal` handler (background.js:397) — `isTrustedExternalSender` origin
  check (accept `https://clipmark.mithahara.com`, reject everything else including a spoofed
  `sender.url` without matching `sender.origin`); `AUTH_SUCCESS` stores `bmUser` and calls
  `scheduleReminderAlarms()`; `START_RECALL` validates the 11-char videoId regex and rejects
  malformed IDs *before* calling `startRecallFromWebapp`.
- `chrome.runtime.onMessage` handler (background.js:440) — `CLIPMARK_REPORT_ERROR` only forwards
  when `isOwnScript(source)` passes; a message claiming to be from another extension is dropped.
- `chrome.commands.onCommand` (`quick_save`/`silent_save`) — reads current tab via
  `chrome.tabs.sendMessage({action:'getBookmarkData'})`, and the two downstream sends
  (`bookmarkUpdated`, `showToast`) fire with the right payload on save success *and* on failure
  (e.g. tab has no active video).
- `scheduleReminderAlarms()` — given a fetched reminder list, schedules the right `chrome.alarms`
  and the daily 9AM `reminder_sync`; verify it doesn't schedule duplicate alarms on repeated calls
  (idempotency — ties into §Performance/memory).
- `chrome.notifications.onButtonClicked` — "Revisit now" opens the right tab/side panel state,
  "Mark Done" writes the expected storage update.
- `keepalive` alarm registration exists and fires on schedule (thin smoke check, not a timing test).

**Tool/framework:** `node:test` + a **new, hand-rolled `chrome` global mock** — this is the one
new piece of test infra genuinely needed here, since **zero unit tests currently touch
`background.js` directly** (confirmed: no test file imports it, no `chrome` stub exists anywhere in
the repo). Recommend building it in the same style as `webapp/tests/unit/fixtures/fakes.ts`'s
chainable Supabase mock rather than adding `sinon-chrome` as a new dependency — the surface actually
used (`chrome.runtime.onMessage/onMessageExternal.addListener`, `chrome.tabs.sendMessage`,
`chrome.storage.sync.get/set`, `chrome.alarms.create`, `chrome.notifications.create`) is small and
well-known, and a hand-rolled mock keeps the "no new deps unless truly needed" convention while
giving full control over triggering listeners in tests (`chrome.runtime.onMessage.trigger(msg,
sender, sendResponse)`-style helper).

**Where tests live:** `tests/unit/background.test.mjs` (new); mock at
`tests/unit/fixtures/chrome-mock.mjs` (new, reused by side-panel/dashboard tests below).

**Fixtures/mocks needed:** `chrome-mock.mjs` — chainable, listener-capturing mock covering
`runtime`, `tabs`, `storage.sync`/`storage.local`, `alarms`, `notifications`, `contextMenus`,
`commands`, `action`. Needs a way to install itself on `globalThis.chrome` before `background.js`
is `import()`ed (classic script, registers via side effect) and reset between tests.

### 3. UI testing (side panel + dashboard)

**What to test:**
- `side-panel.js` — `sendMessageToTab` helper (line 364) and its `chrome.runtime.onMessage`
  listener (line 1614); token handling (`getValidToken`, `refreshEntitlement`) against expired vs.
  valid vs. missing tokens; rendering of bookmark list/groups from `chrome.storage.sync` state.
- `dashboard.js` — group CRUD (`createGroup`, `deleteGroup`, `renameGroup`,
  `toggleVideoInGroup`, lines ~1154–1184): deleting a group removes its `group_collections`-style
  local associations without orphaning video entries; renaming preserves membership; toggling a
  video in/out of a group is idempotent (toggling twice returns to original state).
- Free-tier usage caps surfaced in the UI (`usage-caps.js`/`usage-caps.module.js`) — cap-reached
  state disables the right action and shows the right upsell copy.
- Fetches to the webapp API (`getValidToken`-gated) — loading/error/empty states render correctly
  when the fetch fails or returns an empty list.

**Tool/framework:** Primarily **Playwright** (existing `tests/*.spec.ts`, extension project) since
the side panel and dashboard are real extension pages loaded in a real browser context — this is
already how `extension-behavior.spec.ts` and `recall-packaged.spec.ts` work today, and is the
highest-fidelity option for vanilla-DOM, no-framework UI code. For the **pure logic** underneath
the DOM (group CRUD state transitions, cap-reached decisions), reuse the same `chrome-mock.mjs`
from §2 plus `node:test` — these are storage-state-in, storage-state-out functions that don't need
a real browser.

Do **not** introduce React Testing Library or a component-testing framework here: `side-panel.js`
and `dashboard.js` are vanilla DOM manipulation, not components — there's no component boundary to
render-test, and Playwright already drives the real thing.

**Where tests live:** `tests/unit/side-panel-logic.test.mjs`, `tests/unit/dashboard-logic.test.mjs`
(new, pure-logic slices); `tests/side-panel-ui.spec.ts` (new Playwright spec covering
open/close/token-refresh/group-CRUD flows — extends the existing extension-project pattern).

**Fixtures/mocks needed:** `chrome-mock.mjs` (shared with §2); a small fixture of pre-populated
`chrome.storage.sync` state (bookmarks + groups) for deterministic UI-logic tests.

### 4. API mocking

**What to test:** Every extension→webapp `fetch()` call site (`getValidToken`, `refreshEntitlement`,
`scheduleReminderAlarms`'s `/api/reminders` fetch, side-panel/dashboard data fetches) against:
success, 401 (expired token → re-auth prompt), 403 (Pro-gated feature on a free account), 500/network
failure (offline handling, retry or graceful degradation), and malformed JSON response.

**Tool/framework:** No new dependency needed. Node 18+'s global `fetch` can be stubbed directly
(`globalThis.fetch = mock`) in `node:test` files the same way `chrome` is stubbed — this is simpler
than pulling in `nock`/`msw` for a handful of call sites. For webapp-side API mocking (already
solved), keep using the existing `makeFakeSupabase`/`fakeDodo` pattern in
`webapp/tests/unit/fixtures/fakes.ts` — no changes needed there.

**Where tests live:** Folded into the `background.test.mjs`/`side-panel-logic.test.mjs`/
`dashboard-logic.test.mjs` files above (API mocking isn't a separate test category in practice here
— it's a fixture used by the background/UI tests).

**Fixtures/mocks needed:** `tests/unit/fixtures/fetch-mock.mjs` (new, small) — a `globalThis.fetch`
stub returning configurable `{status, json}` per call, modeled on `fakes.ts`'s configurability.

### 5. Manifest validation

**Current state is solid** — `tests/unit/manifest.test.mjs` already statically asserts the
security-relevant shape (no `tabs` permission, `web_accessible_resources` not `<all_urls>`,
`externally_connectable` has no localhost, version parity with `package.json`, service worker
`type:module`, content-script load order) and two build-time guards
(`content-globals-guard.mjs`, `api-base-guard.mjs`) catch tree-shaking and prod-config regressions
that static JSON assertions can't.

**What to add:** MV3-spec conformance that hand-written assertions don't cover well — deprecated
API usage, invalid permission combinations, icon/size requirements, CSP syntax if one is ever
added. This is exactly what a real manifest linter is for, rather than growing
`manifest.test.mjs` into an ad-hoc linter.

**Tool/framework:** **`web-ext lint`** (new devDependency, justified — this is the standard MV2/MV3
manifest linter and isn't reinventing anything the repo already has). Run as `web-ext lint --source-dir
extension/dist` **after** `make ext-build`, so it lints the shipped artifact (same "test the built
thing, not the source tree" lesson the packaging bug already taught this repo — see
`launch-readiness-findings` memory, packaging blocker #1).

**Where it lives:** new `make ext-lint` target (`web-ext lint --source-dir extension/dist
--no-input`), invoked in CI after `make ext-build`. Keep `manifest.test.mjs`'s hand-written
assertions — they encode this repo's *specific* security decisions (no `tabs`, no localhost in
`externally_connectable`) that a generic linter won't know to check.

**Fixtures/mocks needed:** none — operates on the built `extension/dist/`.

---

## Web app dashboard

### 6. State management testing

**Verified current architecture:** there is **no** Context/SWR/React Query anywhere under
`webapp/app/dashboard` or `webapp/lib` — `dashboard/page.tsx` is an async Server Component that
fetches via Supabase directly and passes props to a `'use client'` `DashboardContent.tsx`, which
holds all interactive state in local `useState`/`useEffect`/`useTransition`, syncs view state to the
URL via `useSearchParams`/`useRouter`, and calls Server Actions (`dashboard/actions.ts`:
`deleteBookmark`, `bulkDeleteBookmarks`, `importBookmarks`) for mutations. The same
server-page/client-component/local-state pattern repeats for `groups/`, `queue/`, `videos/`,
`analytics/`.

**What to test:**
- `DashboardContent.tsx` state transitions: selecting bookmarks for bulk delete → confirming →
  optimistic UI update vs. server-action result reconciliation; filter/search state changes without
  a full page reload; view-mode toggle (cards/timeline) persists across the `useSearchParams` sync.
- `GroupsContent.tsx`: create/rename/delete group updates the visible list without a stale-state
  flash; toggling group membership for a video reflects immediately.
- `RemindersContent.tsx` (queue): marking a reminder done removes it from the due list client-side
  in sync with the server action.
- Server Actions themselves (`actions.ts`) — these are plain async functions callable directly in
  `node:test` without rendering anything: `bulkDeleteBookmarks` with a partial-failure input (one
  valid id, one belonging to another user) only deletes the valid one and reports the failure;
  `importBookmarks` dedupes against existing timestamps per the `Math.floor(timestamp)` rule shared
  with the extension.

**Tool/framework:** Split by what's actually being tested:
- **Server Actions** (`actions.ts`) — plain **`node:test`** + the existing `fakes.ts`
  Supabase mock, same pattern as the API-route unit tests. No new dependency; these are just async
  functions.
- **Client component interaction/state** — reuse **Playwright** (webapp project, already
  headless-configured against a running `next dev` server) rather than introducing React Testing
  Library + jsdom as a second, parallel rendering stack. Given this is a solo pre-launch product,
  one browser-driving tool (Playwright) covering both E2E and component-level interaction is lower
  maintenance than owning two. RTL is worth reconsidering only if/when a genuine reducer or custom
  hook with complex branching emerges that's painful to reach through the DOM — none does today.

**Where tests live:** `webapp/tests/unit/dashboard-actions.test.ts` (new, Server Actions);
`tests/dashboard-interactions.spec.ts` (new Playwright spec, webapp project — bulk select/delete,
filter, group CRUD, mark-reminder-done).

**Fixtures/mocks needed:** extend `webapp/tests/unit/fixtures/fakes.ts` usage to `actions.ts` tests
(no new fixture code, same mock); Playwright spec needs a seeded dashboard state — reuse the
integration harness's `seed.ts` pattern to seed a known bookmark/group set before the spec runs, or
seed via the UI itself at spec start (simpler, avoids a second DB dependency in the webapp Playwright
project which currently has none).

### 7. Responsive design testing

**What to test:** Dashboard layouts (cards/timeline/groups/videos/analytics) and marketing pages at
mobile (375px), tablet (768px), and desktop (1280px+) widths — no horizontal scroll, side panel/nav
collapses appropriately, touch targets are reasonable on mobile widths.

**Tool/framework:** **Playwright**, extending the existing `tests/visual/*.spec.ts` snapshot
pattern (already headless, already has committed `-snapshots/*-linux.png` baselines) with
`test.use({ viewport })` per breakpoint, rather than a new visual-regression tool. This is a
straightforward extension of infrastructure that already exists and already regenerates baselines
locally per the repo's gitignored-baseline convention.

**Where tests live:** extend existing files in `tests/visual/` with viewport variants (e.g.
`home.spec.ts` gets `home-mobile`, `home-tablet` snapshot names) rather than new files, to keep
baseline management in one place.

**Fixtures/mocks needed:** none new.

### 8. Cross-browser testing

**Current gap:** the `webapp` Playwright project only runs Chromium (implicit default) — no
Firefox/WebKit project exists in `playwright.config.ts`.

**What to test:** Core webapp flows (marketing pages, signin, dashboard load, share page, embed
widget) render and function correctly in Chromium, Firefox, and WebKit. Extension-side testing is
**not** cross-browser by nature (MV3/CRXJS targets Chrome-family only — Firefox would need a
separate manifest and packaging path, out of scope unless the product actually ships a Firefox
build per `ROADMAP.md` Phase 12).

**Tool/framework:** **Playwright's built-in multi-browser projects** — no new dependency, just
config. Add `firefox` and `webkit` project entries to `playwright.config.ts` scoped to the same
`webapp` testMatch (visual + a curated subset of functional specs, not the full extension suite
which is Chrome-only by definition).

**Where tests live:** `playwright.config.ts` config change only; existing `tests/visual/*.spec.ts`
and any new `tests/dashboard-interactions.spec.ts` run against the new projects for free once added.
Keep visual-snapshot assertions Chromium-only (cross-browser pixel differences are expected and not
a real signal) — use the new projects for **functional** assertions (page loads, forms submit,
no console errors) rather than pixel snapshots.

**Fixtures/mocks needed:** none new; note in CI config that `webkit`/`firefox` browsers need
`playwright install --with-deps` to include them (currently only chromium is installed per the
`ci-extension-smoke` job step — the webapp jobs don't even call `playwright install` yet, see
Phase 2).

---

## Integration & communication

### 9. Cross-context messaging (extension ↔ content ↔ background ↔ side panel)

**What to test:** Every message type identified in the grounding pass, both directions:

| Direction | Message/action | Sender:line | Receiver |
|---|---|---|---|
| background → content (tab) | `getTimestamp`, `getBookmarkData`, `bookmarkUpdated`, `showToast`, `getTranscriptSnippet`, `startRevision` | `background.js:127,148,194,229,272,287,303,329,330,383` | `content.js:722` listener |
| content → background | `ping`, `contentScriptReady`, `ytVideoChanged` | `content.js:968,1807,1818` | `background.js` (implicit ack) |
| content → background | `CLIPMARK_REPORT_ERROR` | `error-report-bridge.js:28` | `background.js:440` |
| side panel → content (tab) | via `sendMessageToTab` helper | `side-panel.js:364` | `content.js:722` listener |
| background → side panel | (state push, e.g. after `AUTH_SUCCESS`) | `background.js` | `side-panel.js:1614` listener |

Concrete cases: a message sent to a tab with no content script loaded yet (page still navigating)
doesn't crash the sender and is retried or dropped gracefully; an unknown `action` string hits the
listener's default branch without throwing; `ping`/`contentScriptReady` round-trip correctly across
a `yt-navigate-finish` SPA transition (content script survives navigation without a full reload,
per the architecture note in `CLAUDE.md`).

**Tool/framework:** Two tiers, matching the existing split:
- **Unit**: `chrome-mock.mjs` (§2/§3) triggers each listener directly with a crafted message and
  asserts the response/side-effect — fast, exercises the ~20 branches exhaustively including edge
  cases hard to hit reliably in a real browser (e.g. "tab has no content script").
- **E2E**: existing `tests/content-messaging.spec.ts` already covers the happy path in a real
  browser — keep it, it's the ground-truth check that real Chrome message-passing semantics (async
  responses, `sendResponse` timing) actually hold, which a mock can't fully verify.

**Where tests live:** `tests/unit/messaging.test.mjs` (new, unit); `tests/content-messaging.spec.ts`
(existing, extend if new message types are added).

**Fixtures/mocks needed:** `chrome-mock.mjs` (shared, §2).

### 10. External web app communication (extension ↔ webapp bridge)

**What to test:** The concrete two-message bridge:
- **OAuth handoff:** `webapp/app/auth/extension-success/page.tsx` reads
  `extensionId/access_token/refresh_token/user_id/user_email/is_pro` from `useSearchParams()` and
  sends `{type:'AUTH_SUCCESS', ...}` via `window.chrome.runtime.sendMessage(extensionId, ...)`.
  Test: missing/malformed query params (e.g. no `access_token`) don't send a partially-populated
  auth message; the extension-id format is validated against `EXTENSION_ID_RE = /^[a-p]{32}$/`
  before use (a malformed stored id should fail closed, not throw an uncaught error mid-page-load).
- **Active Recall trigger:** `webapp/app/dashboard/_utils/extension.ts`'s
  `startRecallInExtension(videoId, bookmarkIds)` sends `{type:'START_RECALL', ...}` with a 5s
  timeout. Test: extension not installed / not responding → the 5s timeout fires and the caller
  gets a clear "extension not found" result rather than hanging; a response arriving after timeout
  is ignored (no stale-callback double-fire).
- **Trust boundary, both directions:** `isTrustedExternalSender` (background.js:348) rejects a
  sender whose `origin` doesn't start with `https://clipmark.mithahara.com` even if the manifest's
  `externally_connectable` were ever loosened — this is defense-in-depth and deserves its own test
  independent of the manifest assertion in §5, since it's runtime logic, not static config.
  Symmetrically, confirm the webapp side never sends the bridge messages to a hardcoded/guessed
  extension ID pulled from anywhere other than `getExtensionId()`'s own storage/env resolution.

**Tool/framework:** **Unit** (webapp side) — already well-covered by
`webapp/tests/unit/extension-bridge.test.ts` (158 lines, id resolution + `startRecallInExtension`).
**Unit** (extension side, `isTrustedExternalSender` + `AUTH_SUCCESS`/`START_RECALL` handling) — new,
via `chrome-mock.mjs` (§2), since this currently has zero unit coverage despite being the most
security-relevant message path in the extension. **E2E** — `tests/recall-bridge.spec.ts` already
exists and exercises this in a real browser; keep as the ground-truth cross-process check (a unit
mock can assert the extension's listener logic, but not that Chrome's actual
`onMessageExternal`/`externally_connectable` origin-matching behaves as assumed).

**Where tests live:** extend `tests/unit/background.test.mjs` (§2) with `AUTH_SUCCESS`/
`START_RECALL`/`isTrustedExternalSender` cases; existing `webapp/tests/unit/extension-bridge.test.ts`
and `tests/recall-bridge.spec.ts` need no structural change, just keep them current as the bridge
evolves.

**Fixtures/mocks needed:** `chrome-mock.mjs` (§2) needs to support `onMessageExternal` with a
configurable `sender.origin`/`sender.url` to test the trust-boundary rejection cases.

### 11. API and database sync

**What to test (concrete, tied to real files):**
- **Cloud sync round-trip** (`/api/bookmarks`, `webapp/app/api/bookmarks/handler.ts`): already
  covered by `bookmarks-guard.test.ts` (unit, auth/Pro-gate/400s) and `bookmarks-sync.test.ts`
  (integration, cross-user RLS isolation, upsert round-trip). **Keep these as permanent regression
  tests** — this is the paid-tier data-isolation guarantee.
  - Add: a **local-first-vs-cloud conflict** case — extension writes to `chrome.storage.sync`
    while offline, then syncs; if the same video's bookmarks changed on another device in the
    meantime, verify the upsert behavior (last-write-wins per current schema — confirm this is the
    intended behavior, not an accidental data-loss path, and document the answer either in this doc
    or inline in the handler).
- **Groups feature** (`webapp/migrations/005_groups.sql`: `groups`, `group_collections` — no
  `position` column, see the note at the top of this doc): create/rename/delete a group and
  toggle membership, verified against real Postgres — deleting a group cascades to
  `group_collections` rows without orphaning `collections`; renaming doesn't affect membership;
  toggling the same video into a group twice doesn't create duplicate `group_collections` rows.
  **This has no integration test today** — flagged in §Highest-risk gaps.
- **Reminders/queue flow**: `reminders-entitlement.test.ts` (integration) covers Pro-gating on the
  reminders API. Add: the extension's `scheduleReminderAlarms()` (background.js) consuming
  `/api/reminders`'s actual response shape — a **contract test** ensuring the webapp response shape
  and the extension's parsing of it stay in sync (currently only implicitly verified by both sides
  independently; a shape-mismatch would only surface at runtime in production). This is a good
  candidate for a small shared JSON-schema fixture rather than a full contract-testing framework.
- **Migration idempotency**: `webapp/migrations/*.sql` are documented as "numbered, idempotent" in
  `CLAUDE.md` but this isn't verified anywhere. Add a test that replays `001`–`014` against a fresh
  DB **twice** and asserts the second pass is a no-op (no errors, `schema_migrations` unchanged) —
  this directly protects the "migrations are never edited, always additive" convention.

**Tool/framework:** `node:test` + `tsx` against local Supabase, exactly the existing integration
pattern (`webapp/tests/integration/fixtures/{supabase,seed,db-admin}.ts`) — no new tooling.

**Where tests live:** `webapp/tests/integration/groups.test.ts` (new); extend
`webapp/tests/integration/reminders-entitlement.test.ts` or add
`webapp/tests/integration/reminders-contract.test.ts`; `webapp/tests/integration/migrations-idempotency.test.ts`
(new, runs `scripts/migrate.ts` twice against a scratch DB — heavier/slower, candidate for its own
CI step rather than the main `ci-integration` run, see Phase 2).

**Fixtures/mocks needed:** none beyond the existing integration fixtures; the migration-idempotency
test needs its own scratch database or a `supabase db reset`-style teardown between the two passes
to avoid interfering with other integration tests' seeded state.

### 12. Authentication flow

**What to test end-to-end:**
1. Google OAuth sign-in on the webapp → Supabase session established → redirect to
   `extension-success` page → `AUTH_SUCCESS` message sent to the extension → extension stores
   `bmUser` in `chrome.storage.sync` → side panel reflects "signed in" state and shows the right
   Pro/free tier.
2. Token expiry/refresh: `getValidToken`/`refreshEntitlement` (side-panel.js) correctly refresh an
   expired token rather than silently failing bookmark sync.
3. Sign-out: extension clears `bmUser` and any cached entitlement state; subsequent API calls from
   the extension correctly get 401s and fall back to local-only mode (no cloud sync).
4. Admin auth: `requireAdmin()` (`webapp/app/api/admin/_lib.ts`) — already covered by
   `admin-auth.test.ts` including the meta-test that every `admin/*/route.ts` calls it first.
   **Confirmed gap:** `webapp/app/api/admin/revoke-pro/route.ts` has no `handler.ts` split and zero
   test coverage (its siblings `grant-pro`/`set-affiliate`/`users` all do) — despite calling
   `requireAdmin()` correctly per manual read. Close this specific gap rather than treating admin
   auth as "done" — see §Highest-risk gaps.

**Tool/framework:** The full sign-in → bridge → side-panel-state chain is inherently
cross-process/cross-context, so it belongs in **Playwright** (`tests/recall-bridge.spec.ts` and
`tests/extension-behavior.spec.ts` already exercise pieces of this — verify/extend rather than
duplicate). Token-refresh logic and sign-out state clearing are pure-enough to unit-test with
`chrome-mock.mjs` + `fetch-mock.mjs` (§2/§4). Admin auth stays `node:test` + `fakes.ts`, matching
its siblings.

**Where tests live:** extend `tests/extension-behavior.spec.ts` if the full OAuth→bridge chain
isn't already asserted end-to-end (verify during Phase 1, don't assume); `tests/unit/side-panel-logic.test.mjs`
(§3) gets the token-refresh/sign-out cases; new `webapp/app/api/admin/revoke-pro/handler.ts` split
+ `webapp/tests/unit/admin-revoke-pro.test.ts` (new, mirrors `grant-pro`'s existing test shape).

**Fixtures/mocks needed:** `chrome-mock.mjs`, `fetch-mock.mjs` (both §2/§4, reused).

---

## Non-functional & release

### 13. Performance and memory-leak testing

**What to test (concrete, tied to real risk):**
- **Content script SPA-navigation leak:** YouTube's `yt-navigate-finish`/`yt-page-data-updated`
  handling (content.js:1813,1825) plus two `MutationObserver`s re-inject markers on every
  navigation. Test: drive a Playwright session through N (e.g. 20) sequential video navigations on
  a single tab and assert (a) marker/listener count doesn't grow unboundedly (query DOM node count
  for marker elements after each nav, assert it matches the current video's bookmark count, not an
  accumulating total), and (b) no duplicate `MutationObserver`s are registered (can be asserted
  indirectly via a counter injected into a test build, or directly via
  `chrome.debugger`/CDP `Runtime.getHeapUsage` sampling in Playwright's CDP session).
- **Service worker keepalive:** the `keepalive` alarm (0.4 min period) exists specifically to
  survive MV3's ~5 min idle shutdown. Test: after an idle period exceeding the shutdown window,
  the SW's in-memory state that matters (none should be relied upon — MV3 SWs are expected to
  restart) is correctly reconstructed from `chrome.storage` on wake, not lost. This is more a
  correctness-under-restart test than a classic leak test.
- **Reminder alarm accumulation:** `scheduleReminderAlarms()` called repeatedly (e.g. on every
  `AUTH_SUCCESS`, or on the daily `reminder_sync`) must not create duplicate `chrome.alarms` for the
  same reminder — verify via `chrome-mock.mjs`'s alarm registry (§2) that re-scheduling clears prior
  alarms for the same key first.
- **Webapp dashboard with a large bookmark set:** load the dashboard for a user with, say, 500+
  bookmarks across 20+ groups and assert render time / no dropped frames on scroll — a basic budget
  check, not full profiling. Lower priority for a pre-launch product with no users yet at that scale,
  but worth a smoke check before any "import your bookmarks" growth push.

**Tool/framework:** **Playwright** for the content-script navigation-leak test (needs a real
browser + real YouTube DOM) — extend `tests/marker-interactions.spec.ts` or add a dedicated
`tests/navigation-leak.spec.ts`. For the alarm-accumulation and SW-restart cases, `chrome-mock.mjs`
(§2) unit tests are sufficient and much faster than a real timing-dependent browser test. For the
dashboard-at-scale check, a simple Playwright timing assertion (`performance.now()` around a render)
is enough — **do not** add Lighthouse CI or a dedicated perf-budget tool yet; revisit if/when real
usage data shows this matters (see Phase 3, explicitly deferred).

**Where tests live:** `tests/navigation-leak.spec.ts` (new); alarm/SW cases folded into
`tests/unit/background.test.mjs` (§2).

**Fixtures/mocks needed:** `chrome-mock.mjs` (§2) needs an alarm registry that tracks
create/clear calls by name, not just a fire-and-forget stub.

### 14. Security and CSP testing

**What to test:**
- **RLS/column-grant regression pack (highest-value security tests in the repo):**
  `rls-profiles.test.ts` and `rls-collections.test.ts` already assert `is_pro`/`is_affiliate`/
  `commission_rate` stay unwritable by `anon`/`authenticated` after migrations `013_rls_hardening.sql`
  and `014_profiles_insert_grant_hardening.sql` (the latter closing the **INSERT**-side of the same
  hole that `013`'s UPDATE-only fix left open — a real historical near-miss, worth a comment in the
  test file itself explaining why both migrations are tested, not just the "final" one). **Never
  let these regress or get skipped** — this is the test suite's answer to a previously-live
  privilege-escalation bug (see `launch-readiness-findings` memory, item #2).
- **Webapp security headers:** `next.config.mjs`'s `headers()` sets `X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Referrer-Policy` globally, with an
  intentional override for `/embed/:path*` (`X-Frame-Options: ALLOWALL` + a permissive
  `frame-ancestors *` CSP, since shared collections must be embeddable). Test: a header-assertion
  check (extend `tests/ci/webapp-smoke.spec.ts` or add a small dedicated spec) that (a) normal pages
  keep `X-Frame-Options: DENY`, (b) only `/embed/*` gets the relaxed policy — a regression here
  would either break embedding or reopen clickjacking on the main app.
- **CORS wildcard scope:** `/api/:path*` sets `Access-Control-Allow-Origin: *` by design (extension
  background requests don't send an `Origin` header the same way browsers do). Test: this wildcard
  doesn't itself leak anything sensitive — every route that returns user data must still enforce
  its own auth check regardless of `Origin` (this is really a meta-property of §11's per-route auth
  tests, but worth a comment/assertion that **new** routes added under `/api/` can't accidentally
  rely on CORS restriction as a security boundary, since there isn't one).
- **Extension manifest CSP:** no explicit `content_security_policy` key exists (relies on MV3's
  implicit default `script-src 'self'; object-src 'self'`). This is a **correct, intentional
  absence**, not a gap — MV3's default is already stricter than most MV2 configs. `manifest.test.mjs`
  should add one assertion confirming no override was accidentally introduced (an explicit,
  looser `content_security_policy` would be worth flagging in review).
- **Admin route authorization:** `admin-auth.test.ts`'s meta-test (every `admin/*/route.ts` calls
  `requireAdmin()` first) is a strong pattern — keep it, and close the `revoke-pro` gap (§12) so the
  meta-test's guarantee is actually complete across all admin routes, not just the ones with a
  `handler.ts`.
- **Dependency vulnerabilities:** no `npm audit`/Dependabot signal currently verified in CI.
  Recommend a lightweight `npm audit --omit=dev --audit-level=high` step (root + `webapp/`) as a
  non-blocking CI check initially (soak before making it required, matching this repo's existing
  pattern for `ci-integration`).

**Tool/framework:** All of the above reuse existing tooling — `node:test`/`tsx` for header/CORS/RLS
assertions (extend existing integration tests or add a thin webapp-unit test hitting `next.config`'s
resolved headers), Playwright for the live-server header check in `tests/ci/webapp-smoke.spec.ts`.
`npm audit` is a built-in npm subcommand, not a new dependency.

**Where tests live:** extend `webapp/tests/integration/rls-profiles.test.ts`/`rls-collections.test.ts`
with an explicit comment tying assertions to migrations 013 *and* 014; new
`tests/ci/security-headers.spec.ts` (or extend `webapp-smoke.spec.ts`); `manifest.test.mjs` gets one
new assertion (no `content_security_policy` override); new `.github/workflows` step for `npm audit`.

**Fixtures/mocks needed:** none new.

### 15. Upgrade / migration testing

**What to test:**
- **Extension storage migration:** the one-time `chrome.storage.local` → `chrome.storage.sync`
  migration (sets `syncMigrated: true`, per `bookmark-data-model` memory) — test with a fixture of
  pre-migration `local` storage state that migration copies all `bm_{videoId}` keys correctly, sets
  the flag, and **running it twice is a no-op** (idempotency — critical since this runs on every
  extension load until the flag is set, and a bug here is silent data loss for existing users
  upgrading).
- **Extension version upgrade:** `chrome.runtime.onInstalled` with `reason: 'update'` — verify no
  destructive re-migration or re-initialization runs on a normal version bump (only `reason:
  'install'` should trigger first-run setup); context menus aren't duplicated on update (currently
  created unconditionally in `onInstalled` — verify Chrome's own dedup-by-id behavior is relied on
  correctly, or add an explicit remove-then-create if not).
- **SQL migration idempotency** (see also §11): replay `001`–`014` twice against a fresh DB, assert
  the second pass no-ops cleanly. This is the automated version of the manual discipline `CLAUDE.md`
  already documents ("migrations are never edited, always additive, applied by hand") — automating
  the *idempotency* check doesn't remove the manual apply-by-hand discipline, just verifies each
  migration honors its own contract.
- **Backward-compatible API responses across a webapp deploy:** since `NEXT_PUBLIC_*` env vars are
  inlined at build time and a running extension might be talking to a webapp mid-deploy, verify
  that adding a new optional field to an API response (e.g. `/api/reminders`) doesn't break an
  older-cached extension bundle's parsing (extension bundles aren't auto-updated the instant a
  webapp deploy lands — Chrome Web Store review lag is real). This is more a **contract-testing
  discipline** than a specific automated test: prefer additive, optional fields in API responses
  and document this convention here rather than trying to test every possible extension-version ×
  webapp-version pairing.

**Tool/framework:** `chrome-mock.mjs` (§2) for the storage-migration and `onInstalled` cases;
existing integration-test tooling for SQL migration idempotency (§11's proposed
`migrations-idempotency.test.ts` covers this — don't build it twice).

**Where tests live:** `tests/unit/storage-migration.test.mjs` (new); `webapp/tests/integration/migrations-idempotency.test.ts`
(new, shared with §11).

**Fixtures/mocks needed:** `chrome-mock.mjs` with a way to pre-seed `chrome.storage.local` state
before triggering the migration function.

---

## Highest-risk gaps (ranked)

1. **`webapp/tests/unit/*.test.ts` (70 cases, including the 413-line Dodo webhook money-path
   tests) never run in CI.** Root `package.json`'s `test:unit` only globs `tests/unit/*.test.mjs`
   (extension); `test:unit:webapp` exists as a script but nothing in
   `.github/workflows/ci-launch-gates.yml` calls it, and `test:integration`'s glob doesn't cover it
   either. **A broken webhook signature check, a broken admin-auth guard, or a broken share-auth
   spoof check could merge to `main` today with zero CI signal.** This is a config fix, not new
   test-writing — highest ROI in the entire plan (Phase 0).
2. **Zero direct unit coverage of `background.js`, `content.js`, `side-panel.js`, `dashboard.js`.**
   The only coverage is (a) Playwright E2E — real but slow, serial, and headed, so feedback loop is
   minutes not milliseconds — and (b) `logic.test.mjs`'s hand-maintained *inlined copies* of pure
   helpers, which is a documented, self-acknowledged drift risk (the file's own header comment says
   so) and references a nonexistent `#11` follow-up item. This is the extension's biggest structural
   testing gap (Phase 1).
3. **No chrome-API mock exists anywhere in the repo.** This is the specific missing piece blocking
   #2 — every extension-side unit test proposed in this doc (§2, §3, §9, §10, §13, §15) depends on
   building `chrome-mock.mjs` once, well, as shared infrastructure.
4. **`revoke-pro` admin route has no `handler.ts` split and zero test coverage**, unlike its three
   siblings (`grant-pro`, `set-affiliate`, `users`). A confirmed, specific, and easy-to-fix gap (§12,
   §14).
5. **No groups CRUD integration test.** The Pro-gating/RLS/webhook money paths are well-tested; the
   groups feature (real, shipped, per `roadmap-launch-state` memory) has none (§11).
6. **Webhook idempotency (`webhook_events` dedup table) is a known, documented, still-open gap**
   carried forward from `docs/TEST_PLAN_launch.md`'s "known gap to also cover once implemented"
   note — redelivery of the same Dodo `webhook-id` isn't deduped. Not purely a test gap (needs a
   schema change first) but worth tracking here since it'll need its own integration test the day
   it's implemented.
7. **`playwright.config.ts`'s `extension` project unscoped-regex testMatch (`/.*\.spec\.ts/`) also
   matches `tests/ci/*.spec.ts`**, so the two CI smoke specs run under both the `extension` and
   `webapp` projects (confirmed via `playwright test --list`: 78 total vs. the ~76 expected from
   naive file-based counting). Harmless today (they're fast, project-agnostic smoke checks) but a
   config smell worth a one-line `testIgnore`/`testMatch` tightening in Phase 0 alongside item #1,
   since both are "fix the config, not the tests" quick wins.
8. **Two stale docs actively describe an out-of-date test surface:** `AGENTS.md` (mentions only
   `tests/unit/`+`tests/*.spec.ts`/`visual/`, nothing about `webapp/tests/`) and
   `ROADMAP.md`/`ClipMark-ROADMAP.md` ("75 unit tests" vs. the current 267 unit cases across both
   layers). Not a test-coverage risk, but a contributor-trust risk — worth a docs pass alongside
   Phase 0/1 so the next person (or agent) reading these docs isn't misled the way this doc's
   *own* brief was about the nonexistent `groups.position` migration.

---

## Phased roadmap

Effort estimates are solo-developer days. Each phase lists what it buys in risk reduction and how it
slots into `.github/workflows/ci-launch-gates.yml`.

### Phase 0 — CI config fixes (no new test code) — ~0.5 day

- Wire `test:unit:webapp` into the `ci-unit` job (or add a sibling `ci-unit-webapp` job) so the
  existing 70 webapp unit cases actually gate merges. **Do this first, before writing anything
  else in this doc** — it's the single highest-leverage change available and takes under an hour.
- Tighten `playwright.config.ts`'s `extension` project `testMatch`/`testIgnore` so
  `tests/ci/*.spec.ts` runs once per intended project, not twice by accident.
- Update `AGENTS.md` and `ROADMAP.md`/`ClipMark-ROADMAP.md`'s stale test-count/test-surface
  descriptions.
- **CI slot:** modifies `ci-launch-gates.yml`'s existing `unit` job (or adds one job); no new
  infrastructure.

### Phase 1 — Extension unit-test foundation (highest risk-reduction net-new work) — ~4–5 days

- Build `chrome-mock.mjs` (§2) and `fetch-mock.mjs` (§4) — shared infra everything else depends on.
- `tests/unit/background.test.mjs` — onMessageExternal (`AUTH_SUCCESS`/`START_RECALL`/
  `isTrustedExternalSender`), onMessage (`CLIPMARK_REPORT_ERROR`), alarm scheduling/dedup,
  notification button handling.
- `tests/unit/messaging.test.mjs` — the full cross-context message-branch matrix (§9).
- Extract pure logic from `content.js`/`side-panel.js`/`dashboard.js` into `.module.js` twins where
  it doesn't touch the DOM; retire the corresponding inlined copies in `logic.test.mjs`.
- Close the `revoke-pro` handler-split + test gap (§12/§14, small, bundle into this phase).
- **CI slot:** these all run under the existing fast `ci-unit` job (no DB, no browser) — biggest
  bang-per-CI-minute of any phase.

### Phase 2 — Webapp breadth + cross-browser/responsive — ~3–4 days

- `webapp/tests/integration/groups.test.ts` (§11) — closes the groups CRUD gap.
- `webapp/tests/integration/migrations-idempotency.test.ts` (§11/§15).
- `webapp/tests/unit/dashboard-actions.test.ts` (§6, Server Actions).
- `tests/dashboard-interactions.spec.ts` (§6, Playwright) — bulk delete, filter, group CRUD, mark-
  reminder-done.
- Add `firefox`/`webkit` Playwright projects for the webapp (§8); extend `tests/visual/*.spec.ts`
  with mobile/tablet viewports (§7).
- **CI slot:** groups/migrations tests join the existing `ci-integration` job (already has local
  Supabase up). Dashboard-interaction and cross-browser specs join `ci-webapp-visual-smoke`'s lineage
  — but note the multi-browser matrix roughly triples that job's runtime, so gate it as a separate,
  initially non-blocking job (`ci-webapp-cross-browser`) until proven stable, matching this repo's
  existing soak-then-require pattern for `ci-integration`.

### Phase 3 — Manifest linting, security hardening, non-functional — ~2–3 days

- Add `web-ext lint` + `make ext-lint` (§5), wired into CI after `make ext-build`.
- `tests/navigation-leak.spec.ts` (§13) — SPA-navigation marker/listener accumulation check.
- `tests/unit/storage-migration.test.mjs` (§15).
- Security-header assertions (§14) — extend `webapp-smoke.spec.ts`; add the "no CSP override"
  manifest assertion.
- `npm audit` non-blocking CI step (§14).
- **CI slot:** `ext-lint` joins the extension-build path (fast, no browser). Navigation-leak and
  storage-migration tests join `ci-unit`/`ci-extension-smoke` respectively. `npm audit` is a new
  standalone job, non-blocking initially.

### Phase 4 — Ongoing / explicitly deferred

- Dashboard-at-scale performance budget (§13) — revisit once there's real usage data suggesting it
  matters; not worth building against synthetic data for a pre-launch product.
- `webhook_events` idempotency table + its test (§Highest-risk gaps #6) — blocked on a schema
  decision, not a testing decision; track separately from this doc once scoped.
- Full contract-testing framework for extension↔webapp API shape drift (§15) — the documented
  "additive, optional fields" convention is sufficient for now; only worth tooling if drift
  incidents actually start happening.

**Total estimated effort: Phase 0–3 ≈ 10–12.5 solo-developer days** to go from "389 tests, ~half
silently not gating merges, zero direct extension-script unit coverage" to "every existing test
actually gates CI, the extension's four core scripts have real unit coverage via a reusable chrome
mock, cross-browser/responsive coverage exists for the webapp, and the two confirmed specific gaps
(`revoke-pro`, groups CRUD) are closed." Phase 0 alone (half a day) closes the single biggest gap.
