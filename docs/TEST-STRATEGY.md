# ClipMark — Comprehensive Test Strategy

> Status: **plan only** — no test code in this document has been written yet. This is the
> follow-up to [`docs/TEST_PLAN_launch.md`](TEST_PLAN_launch.md), which scoped and (as of this
> writing) has been **fully implemented**: the five launch-blocker security/payments paths
> (RLS self-grant, `/api/share` auth, refund revocation, webhook write failures, admin
> authorization) all have unit + integration coverage under `webapp/tests/`, running in
> `ci-integration` against a local Supabase stack. That work is the floor, not the ceiling —
> this document covers everything else needed for a trustworthy pre-launch test suite: the
> extension's UI and background logic, the webapp's non-security behavior, the messaging that
> glues extension and webapp together, and the non-functional properties (perf, CSP, upgrades)
> nothing today exercises.
>
> Everything below is grounded in the actual repo as of this audit (~217 existing unit tests
> across `tests/unit/*.test.mjs` + `webapp/tests/unit/*.test.ts`, plus `webapp/tests/integration/`,
> the Playwright suites in `tests/*.spec.ts` and `tests/visual/*.spec.ts`, and two CI smoke jobs).
> File paths, line counts, and message names below were read from source, not assumed — flag it
> if anything here looks stale by the time it's implemented.

## 0. What already exists (don't rebuild this)

| Layer | Tool | Location | Runs via |
|---|---|---|---|
| Extension/shared pure logic | `node:test` | `tests/unit/*.test.mjs` (recall, usage-caps, anki-export, manifest, guards, error-reporting) | `npm run test:unit` |
| Webapp pure logic + route-handler cores | `node --test` + `tsx` | `webapp/tests/unit/*.test.ts` | `npm run test:unit:webapp` |
| Webapp API/RLS/webhook integration | `node --test` + `tsx`, local Supabase | `webapp/tests/integration/*.test.ts` | `npm run test:integration` (needs `supabase start` + `db:bootstrap`) |
| Extension E2E (real Chrome, real youtube.com) | Playwright, `launchPersistentContext`, serial | `tests/*.spec.ts` | `npm run test:yt` / `test:yt:smoke` |
| Webapp visual regression | Playwright, headless | `tests/visual/*.spec.ts` | `npm run test:visual` / `test:webapp:smoke` |
| CI | GitHub Actions | `.github/workflows/ci-launch-gates.yml` | 4 jobs: `ci-unit`, `ci-extension-smoke`, `ci-webapp-visual-smoke`, `ci-integration` |

Notable patterns already in place that new tests should **reuse, not reinvent**:
- **Twin-file convention** (`constants.js`/`constants.module.js`, `recall.js`/`recall.module.js`,
  `usage-caps.js`/`usage-caps.module.js`): classic-script globals for content scripts, ESM
  exports for everything else, unit-tested via the `.module.js` twin.
  `extension/scripts/content-globals-guard.mjs` fails the build if a global goes missing from
  the shipped chunk.
- **Extract-a-testable-core** pattern for Next.js routes: `handleX(req, deps)` in a sibling
  `handler.ts`/inline export, with production defaults wired via `webapp/lib/clients.ts`. Unit
  tests inject fakes from `webapp/tests/unit/fixtures/fakes.ts`; the exported `POST`/`GET` stays
  a thin wrapper (Next requires the exported names).
- **Pure-fn extraction for build guards**: `extension/scripts/api-base-guard.mjs` and
  `content-globals-guard.mjs` — logic lives in a plain function, the Vite plugin only calls it
  and surfaces errors. Same pattern should be used for new guards (see §4, §6).
- No test framework beyond `node:test` + `tsx` + Playwright exists anywhere in the repo. No
  `jsdom`, no React Testing Library, no Vitest. Recommendations below default to reusing these
  three; a new dependency is proposed only where genuinely nothing existing can do the job.

---

## 1. Chrome extension

### 1.1 Content script testing

**What to test:** `extension/src/content/content.js` (1856 lines) + `tour.js` handle YouTube DOM
injection, the `chrome.runtime.onMessage` listener (`ping`, `getCurrentTime`, `seekTo`,
`bookmarkUpdated`, `showToast` — confirmed at `content.js:722`), progress-bar marker rendering,
and `yt-navigate-finish` handling for YouTube's SPA navigation.

**Current coverage:** already substantial — `tests/content-messaging.spec.ts`,
`tests/marker-interactions.spec.ts`, `tests/youtube-selectors.spec.ts`,
`tests/extension-injection.spec.ts`, `tests/storage-schema.spec.ts` all drive the *real* content
script against *real* `youtube.com` via `launchPersistentContext`.

**Gap:** every one of those specs depends on live `youtube.com` rendering the same DOM structure
and video (`dQw4w9WgXcQ`) it does today. That's real coverage, but it's also the suite's single
biggest source of flakiness and the reason `test:yt` is serial and ~30 minutes — there is no
tier below it. Pure logic that content.js contains inline (marker-position math, tag-color
lookups) is *already* extracted to the twin `constants.js`/`.module.js` and unit-tested; what
isn't extracted is DOM-orchestration code, which can't move to a pure-fn tier without a real
DOM. Recommendation: don't add a parallel mocked-DOM stack (jsdom can't run a YouTube player);
instead close the gap the other two ways this doc covers — (a) extract any *new* pure logic that
lands in `content.js` into a twin module immediately, following the existing convention, rather
than letting it accrete as DOM-coupled code, and (b) reduce reliance on live YouTube specifically
for network-adjacent behavior via route interception (§1.4).

**Where new tests live:** `tests/*.spec.ts` (existing convention), `tests/unit/*.test.mjs` for
any newly-extracted pure logic.

### 1.2 Background (service worker) script testing

**What to test:** `extension/src/background/background.js` (584 lines):
- `chrome.runtime.onMessageExternal` listener (`background.js:397`) — `AUTH_SUCCESS` (writes
  `bmUser` to `chrome.storage.sync`, triggers `scheduleReminderAlarms()`) and `START_RECALL`
  (video-id regex validation, tab reuse/creation), both gated by `isTrustedExternalSender(sender)`.
- `chrome.runtime.onMessage` listener (`background.js:440`) for `CLIPMARK_REPORT_ERROR`, gated by
  `isOwnScript(source)`.
- `scheduleReminderAlarms()` (`background.js:464`) — fetches `/api/reminders`, clears/recreates
  `reminder_*` alarms within a 7-day horizon, and a daily `reminder_sync` alarm pinned to 9 AM
  local time.
- `chrome.alarms.onAlarm` handlers, `chrome.contextMenus.onClicked`, `chrome.commands.onCommand`
  (`silent_save` = Alt+B, `quick_save` = Ctrl/Cmd+Shift+S).

**Current coverage:** `tests/recall-bridge.spec.ts` already exercises `START_RECALL` end-to-end
against the **packaged** build (`extension/dist/`), including the `isTrustedExternalSender`
origin check — this is genuinely strong coverage of the hardest-to-fake path (it uses a real
`externally_connectable`-matched origin, not a stub). Keyboard shortcuts are covered indirectly
through `extension-behavior.spec.ts` / `storage-schema.spec.ts` (both drive `Alt+B`).

**Gap — the highest-risk one in this section:** `AUTH_SUCCESS` has **zero test coverage**
anywhere in the repo (confirmed: no match for `AUTH_SUCCESS` in `tests/` or `webapp/tests/`).
This is the single message that hands off every signed-in feature — Pro entitlement, cloud sync,
reminders — from the webapp to the extension. It's also read on the sending side by
`webapp/app/auth/extension-success/page.tsx`, which pulls `access_token`/`refresh_token`/`user_id`
out of URL query params and calls `chrome.runtime.sendMessage(extensionId, {type:'AUTH_SUCCESS',...})`.
Neither side is tested. A regression in either the query-param parsing or the background handler
silently breaks sign-in for every extension user with no CI signal.

Second gap: `scheduleReminderAlarms()`'s date/horizon math (the 7-day window, the "already
scheduled for today, roll to tomorrow" 9 AM logic, and the `frequencyLabel()` mapping) is pure
enough to unit-test but currently isn't extracted from the file — same shape of problem the
twin-file convention already solved for `recall.js`/`usage-caps.js`.

**Recommended tests (new):**
- `tests/recall-bridge.spec.ts`-style E2E addition (or a new `tests/auth-bridge.spec.ts`) that
  sends a real `AUTH_SUCCESS` message from a page at the real app origin (same route-interception
  trick already used for `START_RECALL`) and asserts `chrome.storage.sync.bmUser` is populated
  correctly, and that an untrusted origin is rejected.
- Extract the date-math in `scheduleReminderAlarms()` into a pure function (e.g.
  `extension/src/reminders.module.js` twin, following the existing pattern) and unit-test: 9 AM
  rollover when "now" is past 9 AM, horizon inclusion/exclusion boundaries, `frequencyLabel()`
  mapping table.
- Unit test for `isTrustedExternalSender` / `isOwnScript` as pure functions (they likely already
  are close to pure — verify and extract if not) covering the trusted-origin allow-list and
  rejection of everything else.

**Where:** `tests/*.spec.ts` for E2E; `tests/unit/*.test.mjs` for extracted pure logic.

### 1.3 UI testing (popup / side panel / dashboard)

**What to test:** `extension/src/popup/side-panel.js` (1623 lines) and
`extension/src/popup/dashboard.js` (2637 lines) — bookmark list rendering, inline edit,
tag-color display, group management, Active Recall entry points, `pro-gating.js` upsell gates,
`theme-loader.js`.

**Current coverage:** exclusively through Playwright E2E driving the real rendered UI
(`bookmark-lifecycle.spec.ts`, `extension-behavior.spec.ts`, `marker-interactions.spec.ts`) plus
manual coverage in `CHECKLIST.md` (side panel, dashboard, popup sections). There is **no**
unit-level coverage of either file's internal logic — at ~1.6–2.6k lines each, that means a large
fraction of the extension's actual UI behavior is only exercised through slow, serial,
network-dependent E2E, or manually.

**Gap:** this is a real coverage hole, but the fix is judgment-dependent, not mechanical. Both
files are vanilla-JS DOM manipulation, not components with isolated render functions — extracting
testable units means identifying the genuinely pure pieces (filter/sort predicates, formatting
helpers, tag/group derivation) and pulling them out module-by-module, the same way `recall.js` and
`usage-caps.js` already were. Recommend doing this incrementally as each file is next touched for
a feature change, rather than a big-bang refactor purely for testability (matches the "small,
targeted diffs" convention in `CLAUDE.md`).

**Recommended immediate step:** audit `dashboard.js` and `side-panel.js` for the highest-value
extraction candidates — sort/filter logic, group-membership derivation, Active Recall due-queue
filtering (distinct from `recall.module.js`'s spaced-repetition math, which *is* already tested)
— and land 2–3 extracted+tested modules per phase rather than attempting full coverage at once.

**Where:** new `.module.js` twins under `extension/src/popup/` or a new `extension/src/dashboard/`
subdirectory if extraction warrants it; unit tests in `tests/unit/*.test.mjs`.

### 1.4 API mocking

**What to test:** every `fetch()` call the extension makes to its own backend or third parties —
`scheduleReminderAlarms()` → `https://clipmark.mithahara.com/api/reminders`, cloud-sync PUT/GET
to `/api/bookmarks`, and (indirectly, via the webapp) the YouTube Data API used by
`/api/comments`.

**Current coverage:** effectively none at the network layer. The extension E2E suite talks to
real `youtube.com` for DOM/player behavior (unavoidable and already accepted), but background-worker
network calls to ClipMark's own API are **never exercised in CI at all** — `ci-extension-smoke`
runs with placeholder Supabase env and the smoke spec doesn't trigger reminder sync. Failure
branches (`scheduleReminderAlarms()`'s `catch { return }` on fetch rejection, and the `!res.ok`
early return) have zero coverage.

**Recommended approach:** Playwright's `context.route()` / `page.route()` (already a project
dependency, no new tooling) can intercept `fetch` issued from the extension's service worker
context in `launchPersistentContext` mode. Add:
- A spec that seeds a signed-in `bmUser`, routes `/api/reminders` to a canned JSON fixture, fires
  the `reminder_sync` alarm (or calls the exported function via the worker), and asserts alarms
  are created for due/upcoming reminders and skipped outside the horizon.
- A spec that routes `/api/reminders` to a 500 and asserts no alarms are (re)scheduled and no
  unhandled rejection is thrown in the worker (Playwright can assert on
  `context.serviceWorkers()[0]` console/error events).
- Reuse the `webapp/tests/unit/fixtures/fakes.ts` chainable-mock *pattern* (not the file itself —
  it's webapp-only, imports `next/server`) as the model for any fixture JSON the extension-side
  tests need.

**Where:** `tests/*.spec.ts` (new file, e.g. `tests/reminder-sync.spec.ts`), fixture JSON alongside.

### 1.5 Manifest validation

**Current coverage:** already strong — `tests/unit/manifest.test.mjs` asserts no `tabs`
permission, no `<all_urls>` in `web_accessible_resources`, `web_accessible_resources` origins
scoped to YouTube + the app, no localhost in `externally_connectable`, `externally_connectable`
limited to the exact production origin, minimal `host_permissions`, manifest/package.json version
parity, `background.type === 'module'`, and content-script load order (error bridge first). This
is genuinely comprehensive static validation and a good model for the guard pattern used elsewhere.

**Gaps to close (small, additive):**
- No regression test for the Chrome Web Store 132-character `description` limit — this broke
  once already (per recent commit history: "shorten manifest description under CWS 132-char
  limit"). One `assert.ok(manifest.description.length <= 132)` closes it permanently.
- No assertion that `manifest.json` doesn't declare a `content_security_policy` override — MV3's
  default extension-page CSP is already strict; locking in the *absence* of a weakening override
  is one line and prevents a future PR from silently loosening it.
- The built artifact isn't re-validated: `content-globals-guard.mjs` checks the shipped JS
  chunks, but nothing re-parses `extension/dist/manifest.json` post-build to confirm
  `web_accessible_resources` still lists `dashboard.html` (the exact class of bug fixed in the
  recent "bundle dashboard.html" commit). A post-`ext-build` assertion — unzip/read
  `extension/dist/manifest.json`, diff its `web_accessible_resources`/`content_scripts` against
  source `manifest.json` — would catch the next instance of this class of bug automatically
  instead of requiring another manual CWS-submission failure to notice it.

**Tool:** stays `node:test`, no new dependency — a manifest linter (e.g. `web-ext lint`) was
considered but the existing hand-written assertions are more precise for this repo's specific
hardening history than a generic linter's ruleset would be; only reach for `web-ext` if MV3
compliance issues beyond what's covered here start showing up.

**Where:** extend `tests/unit/manifest.test.mjs`; add a `tests/unit/manifest-dist.test.mjs` (or a
build-time guard in `vite.config.mjs` following the existing guard pattern) for the post-build check.

---

## 2. Web app dashboard

### 2.1 State management testing

**Current architecture:** no client-side global store (`grep` confirms no Redux/Zustand/Jotai/
React Query anywhere) — the dashboard is Next.js Server Components + Server Actions
(`'use server'` files: `dashboard/actions.ts`, `dashboard/groups/actions.ts`,
`dashboard/queue/actions.ts`) with local `useState`/`useTransition` for optimistic UI (confirmed
in `GroupsContent.tsx`: `startTransition(() => removeCollectionFromGroup(...))` before
`revalidatePath` lands). "State management testing" here means two distinct things:

1. **Server Action correctness** — already the domain of `webapp/tests/unit/*.test.ts` and
   `webapp/tests/integration/*.test.ts` for anything security/entitlement-relevant (already
   covered for bookmarks, share, admin, webhooks). Non-security actions like `createGroup`,
   `deleteGroup`, `addToGroup` in `groups/actions.ts` currently have **no** unit coverage —
   they're simple enough (auth check → validate → Supabase write → `revalidatePath`) to follow
   the same extracted-core pattern already used for the security-critical routes.
2. **Client-side optimistic-UI correctness** — does the UI reflect the pending state immediately
   (`isPending` from `useTransition`), and does it reconcile correctly if the Server Action
   fails? This has zero coverage today.

**Recommendation:** don't add a component-test stack (jsdom + React Testing Library) purely for
this — it would be the first new test-runner dependency in the repo, and Playwright already
proves interaction correctness against the real running app more faithfully than a mocked DOM
would for Server-Component-driven pages. Add interaction specs to the existing `webapp` Playwright
project instead: navigate to `/dashboard/groups`, click "remove from group," assert the item
disappears from the DOM *before* the network round-trip resolves (proves the `useTransition`
optimistic path), then reload and assert it's still gone (proves the Server Action actually
persisted, not just the optimistic UI). If isolated-unit-level state logic (not tied to a real
page) becomes common enough to justify jsdom+RTL, revisit — that's a real "new dependency"
decision the user should make explicitly, not a default.

**Where:** `webapp/tests/unit/*.test.ts` for extracted action logic; new
`tests/dashboard-interactions.spec.ts` (root `tests/`, `webapp` Playwright project) for
optimistic-UI specs.

### 2.2 Responsive design testing

**Current coverage:** `tests/visual/*.spec.ts` (home, affiliate, ai-summary, upgrade) snapshot
only the default `1280×800` desktop viewport configured in `playwright.config.ts`. The CSS itself
defines real breakpoints — `globals.css` and `dashboard/*.module.css` use `max-width: 639/767/768px`
and `min-width: 640/768/1024px` — none of which any visual test currently exercises.

**Gap:** zero automated coverage of mobile/tablet layouts. A regression in any of those media
queries (e.g., the dashboard's `pageTitle` font-size step at 768px, or the `entryInner`
flex-direction flip at 640px) would only surface manually.

**Recommended tests:** parametrize the existing visual specs (or add new ones for
`/dashboard`, `/dashboard/videos`, `/dashboard/groups`, `/v/[shareId]`, `/embed/[shareId]`) across
3–4 viewport sizes chosen to straddle the real breakpoints: `375×812` (mobile, below 640),
`768×1024` (tablet, the 768px boundary), `1440×900` (desktop). Playwright's `test.use({ viewport })`
or a `devices['iPhone 13']`/`devices['iPad']` preset covers this with zero new dependencies.
Keep `maxDiffPixelRatio` consistent with the existing `0.01` convention.

**Where:** extend `tests/visual/*.spec.ts` with a viewport matrix, or add
`tests/visual/dashboard-responsive.spec.ts`.

### 2.3 Cross-browser testing

**Current coverage:** `playwright.config.ts`'s `webapp` project only runs
`devices['Desktop Chrome']`, and CI (`ci-webapp-visual-smoke`) only installs `chromium`
(`npx playwright install --with-deps chromium`). Zero Firefox/WebKit coverage exists for
anything — including the public marketing pages, the `/v/[shareId]` share page, and the
`/embed/[shareId]` widget, all of which are consumed by end users on browsers ClipMark has no
control over (unlike the extension itself, which is inherently Chromium-only and doesn't need
this).

**Gap:** the embed widget in particular is the highest-risk piece here — it's designed to be
dropped into third-party pages (`next.config.js` explicitly sets `X-Frame-Options: ALLOWALL` and
`Content-Security-Policy: frame-ancestors *` for `/embed/*`) and is the one surface most likely to
be viewed in Safari or Firefox, neither of which is tested at all today.

**Recommended tests:** add `firefox` and `webkit` projects to the `webapp` entry in
`playwright.config.ts` (scoped to `webapp`, not `extension` — the extension project must stay
Chromium-only since it loads a real MV3 extension). Run the existing `test:webapp:smoke` spec
(and, once added, the responsive matrix from §2.2) across all three engines. Add a new CI job
`ci-webapp-crossbrowser` that installs `firefox`+`webkit` in addition to `chromium` and runs the
smoke spec on each — kept **non-blocking** initially (see roadmap) since introducing 2 new
browser engines to CI is exactly the kind of change that should soak before gating merges.

**Where:** `playwright.config.ts` (new projects); `.github/workflows/ci-launch-gates.yml` (new job).

---

## 3. Integration & communication

### 3.1 Cross-context messaging (extension ↔ content ↔ background ↔ side panel)

**What exists today, mapped to real listeners:**
| Path | Message(s) | Coverage |
|---|---|---|
| background → content | `ping`, `getCurrentTime`, `seekTo`, `bookmarkUpdated`, `showToast` (`content.js:722`) | `tests/content-messaging.spec.ts` — good |
| content → background | `contentScriptReady`, `ytVideoChanged` (`content.js:1807`, `:1818`) | Indirect only, via specs that rely on markers appearing after SPA nav |
| error-report-bridge → background | `CLIPMARK_REPORT_ERROR` (`background.js:440`), gated by `isOwnScript` | **No dedicated test** — `tests/unit/error-reporting.test.mjs` covers the payload-building pure functions, not the message round-trip or the `isOwnScript` gate |
| side panel ↔ storage | `chrome.storage.sync` change listeners in `side-panel.js` | Indirect only, via UI-level E2E |

**Gap:** the error-reporting bridge's *gate* (`isOwnScript`) is the security-relevant part — it's
what stops arbitrary page scripts on YouTube from spamming the extension's Sentry quota — and it
has no direct test. Side panel's storage-change reactivity is only ever verified as a side effect
of other specs, not as a first-class scenario (e.g., "bookmark added in another tab updates an
already-open side panel without a manual refresh").

**Recommended tests:**
- A spec that posts a `CLIPMARK_REPORT_ERROR` message with a spoofed/non-extension `source` and
  asserts the background rejects it (`{ok:false, error:'not_own_script'}`), plus one from a
  legitimate own-script source that asserts it's forwarded to the error reporter.
- A side-panel reactivity spec: open the side panel, save a bookmark via the popup/keyboard
  shortcut in a separate context action, assert the already-open side panel updates without
  reopening it.

**Where:** `tests/*.spec.ts`.

### 3.2 External web app communication (extension ↔ web dashboard bridge)

**Current coverage:** `START_RECALL` is well covered (`tests/recall-bridge.spec.ts`, packaged
build, real origin matching via route interception). `AUTH_SUCCESS` is not (see §1.2 — this is
the top gap in the whole document; not repeating the detail here, just cross-referencing since
it belongs to both this section and background-script testing).

**Where:** see §1.2's recommendation.

### 3.3 API and database sync

**Current coverage:** the webapp side of cloud sync (`/api/bookmarks` RLS isolation, Pro-gating,
upsert round-trip) is already covered by `webapp/tests/integration/bookmarks-sync.test.ts` per
`docs/TEST_PLAN_launch.md` item #4. What's *not* covered is the extension-initiated half of that
same round-trip — does the extension actually call `/api/bookmarks` with the right shape at the
right time (on save, on sign-in, on conflict), and does the merge/upsert behavior on the client
side match what the server expects?

**Recommended tests:** an E2E spec that signs in a Pro test account in the extension, saves a
bookmark locally, asserts (via `context.route()` interception or by polling the real local
Supabase stack if `ci-integration`'s stack is reachable from the extension test job) that a PUT
reaches `/api/bookmarks` with the expected payload, and that a second device's `GET` would see it.
This is the one integration test in this document that plausibly needs **both** the extension
Playwright harness and a live local Supabase stack in the same job — flag this as the one place
worth spiking early to confirm feasibility before committing to the approach (see roadmap phase 3).

**Where:** `tests/*.spec.ts`, gated behind whichever CI job ends up hosting the combined
extension+Supabase environment.

### 3.4 Authentication flow

**What to test:** Google OAuth via Supabase (`middleware.ts` session refresh + `/admin` guard,
already covered by unit tests per `docs/TEST_PLAN_launch.md` #5) → `/auth/callback` → redirect to
`/auth/extension-success?extensionId=...&access_token=...` → `rememberExtensionId()` +
`chrome.runtime.sendMessage(extensionId, {type:'AUTH_SUCCESS',...})` → background `AUTH_SUCCESS`
handler → `bmUser` written to `chrome.storage.sync`.

**Current coverage:** the *webapp-only* segments (middleware, admin guard) are tested. The
*bridge* segment — `extension-success/page.tsx`'s query-param parsing and its call into
`chrome.runtime.sendMessage` — has **zero coverage**, matching the gap already called out in
§1.2 and §3.2. This is the single most end-to-end-untested flow in the product: a break anywhere
in the callback → extension-success → AUTH_SUCCESS → storage chain fails silently (the page shows
a generic error state, per its own `status === 'error'` branch, but nothing distinguishes "no
extensionId param" from "extension rejected the message" from "extension not installed" in a way
tests currently verify).

**Recommended tests:**
- Unit test for `extension-success/page.tsx`'s param-parsing logic (extract the
  `extensionId`/`accessToken` presence check into a pure function if it isn't already easily
  testable in isolation) — missing/malformed params → `error` state, valid params → the message
  shape sent to `chrome.runtime.sendMessage` is exactly right (mirrors the existing
  `extension-bridge.test.ts` style already used for `dashboard/_utils/extension.ts`).
- E2E spec spanning both projects: drive the webapp to `/auth/extension-success` with real query
  params (route-intercepted origin, same trick as `recall-bridge.spec.ts`), assert the extension's
  `chrome.storage.sync.bmUser` ends up populated — this is the direct AUTH_SUCCESS test called
  out in §1.2, written once and counted for both sections.

**Where:** `webapp/tests/unit/*.test.ts` (new `extension-success.test.ts`); `tests/*.spec.ts`
(new `tests/auth-bridge.spec.ts`).

---

## 4. Non-functional & release

### 4.1 Performance and memory-leak testing

**Current coverage:** none. No perf or memory test exists anywhere in the repo.

**Concrete risk areas:**
- MV3 service worker `keepalive` alarm (background.js) exists specifically to survive Chrome's
  ~5-minute SW idle shutdown — nothing verifies the worker actually stays responsive across a
  long idle/wake cycle rather than silently dying and dropping messages.
- Content script re-injection on YouTube's SPA navigation (`yt-navigate-finish`) — if listeners
  or DOM observers aren't torn down on each navigation, a long browsing session (many videos in
  one tab) accumulates duplicate listeners/observers. Nothing currently simulates "watch 20 videos
  in one session" to check for this.
- `dashboard.js`/`side-panel.js` at 1.6–2.6k lines each render potentially large bookmark/group
  lists; no test establishes a baseline for render time or DOM node growth as data scales.

**Recommended approach (lightweight, matched to a solo pre-launch product's bandwidth):**
- A Playwright spec that navigates between several YouTube videos in a loop (reusing the existing
  `fixtures.ts` persistent context) and asserts, via
  `page.evaluate(() => performance.memory?.usedJSHeapSize)` (Chromium-only, which is fine — the
  extension is Chromium-only) or via CDP `Performance.getMetrics`, that heap usage after N
  navigations doesn't grow unboundedly relative to after 1 navigation. This is a coarse
  leak-detector, not a profiler — good enough to catch a regression, not to diagnose one.
- A service-worker-liveness spec: force the SW idle timeout path (or wait past the keepalive
  interval in a test with a shortened alarm for test purposes) and assert a message still gets a
  response afterward.
- Treat Lighthouse CI or a dedicated webapp performance budget as **explicitly out of scope for
  phase 1** — it's a new tool and a new category of flakiness for a product that doesn't yet have
  basic perf signal; revisit post-launch once traffic makes it worth the investment.

**Where:** `tests/*.spec.ts` (new `tests/memory-leak.spec.ts`, `tests/sw-liveness.spec.ts`).

### 4.2 Security and CSP testing

**Current coverage:** extensive on the *application-security* side already —
`webapp/tests/integration/rls-profiles.test.ts`, `rls-collections.test.ts`, `share.test.ts`,
`admin-grant.test.ts` etc. cover the column-level RLS hardening (migration `013_rls_hardening.sql`,
`014_profiles_insert_grant_hardening.sql`) that closed the Pro-entitlement and collection-defacement
issues found in the pre-launch audit. That is done and should not be re-litigated here.

**What's untested — headers/CSP specifically:** `webapp/next.config.js`'s `headers()` sets
`X-Content-Type-Options`, `X-Frame-Options: DENY`, HSTS, and `Referrer-Policy` for all routes,
plus a CORS wildcard for `/api/*` (documented as intentional, for the extension's
no-Origin-header requests) and an `X-Frame-Options: ALLOWALL` + `Content-Security-Policy:
frame-ancestors *` override for `/embed/*`. **There is currently no `Content-Security-Policy`
header at all on any non-embed route** — no test today would catch that regressing further
(e.g., someone accidentally weakening the embed override to apply site-wide) or catch it staying
absent if a future page introduces third-party scripts.

**Recommended tests:**
- Extract `next.config.js`'s `headers()` array (or the logic that builds it) into something
  directly importable/testable, following the same pure-fn-extraction pattern as
  `api-base-guard.mjs` — assert per-path-pattern: non-embed routes get `X-Frame-Options: DENY`
  and no `frame-ancestors *`; `/embed/*` gets the permissive override; `/api/*` gets the CORS
  headers. This catches header regressions without needing a running server.
- A decision to make explicitly (not implicitly via a passing test): should the main app ship an
  actual `Content-Security-Policy` (script-src/style-src allow-list), or is the current
  header set an accepted trade-off given Sentry, YouTube embeds, and Dodo's checkout script all
  need to load from third-party origins? Recommend adding a baseline report-only CSP
  (`Content-Security-Policy-Report-Only`) first to see what it would break before enforcing —
  that's a product decision this doc flags but doesn't make.
- Extension-side: lock in the *absence* of a `content_security_policy` override in
  `manifest.json` (§1.5) as the extension's CSP test — MV3's default is already strict, so the
  test is "don't let anyone weaken it," not "add a CSP."

**Where:** `webapp/tests/unit/*.test.ts` (new `headers.test.ts`); `tests/unit/manifest.test.mjs`
(extend, per §1.5).

### 4.3 Upgrade / migration testing

**Current state:** migrations are numbered, idempotent SQL files under `webapp/migrations/`
(currently `001`–`015`, with `015_groups_position.sql` adding the `groups.position` column
already live in prod), applied by `webapp/scripts/migrate.ts` and tracked in
`public.schema_migrations`; per `CLAUDE.md`, a migration already applied anywhere is never edited
— a new higher-numbered file is written instead. `ci-integration` already applies every migration
in sequence against a fresh local Supabase stack on every PR (`Apply migrations` step in
`ci-launch-gates.yml`), which is real, existing coverage of the forward-apply path — don't
undersell that.

**Gap:** what's *not* verified is true idempotency — that re-running `scripts/migrate.ts` a
second time against an already-migrated database is a safe no-op. Most migrations use
`CREATE TABLE IF NOT EXISTS` / `DO $$ BEGIN IF NOT EXISTS ... END $$` guards, which suggests this
was designed for idempotency, but nothing asserts it. This matters specifically because
`schema_migrations` tracking means `migrate.ts` should already skip applied files — but a bug in
that skip logic, or a migration written without the `IF NOT EXISTS` guard, would only surface the
first time it's *re*-run, which today never happens in CI.

There is also no test coverage of extension-side upgrade behavior (e.g., what happens to a user's
existing `chrome.storage.sync` data across an extension version bump) — this is worth tracking as
a category for future migrations that touch the storage schema, even though no such migration
exists in the current codebase to test today. Flagging this as a category to establish the
pattern for, not a specific gap to fill against nonexistent code.

**Recommended tests:**
- In `ci-integration` (or a new lightweight job), run `npx tsx scripts/migrate.ts` a **second**
  time immediately after the existing "Apply migrations" step, assert exit code 0 and that
  `schema_migrations` row count is unchanged — cheap, reuses the exact stack already booted for
  that job.
- A static check (unit test, no DB) that every file in `webapp/migrations/*.sql` uses one of the
  established idempotent guards (`IF NOT EXISTS`, `ON CONFLICT`, the `DO $$ ... IF NOT EXISTS`
  block for policies) — a lightweight regex/parse check, not a full SQL parser. This turns the
  "never edit an applied migration, always guard for idempotency" convention from a documented
  rule into an enforced one.
- Establish (don't yet need to write, since no case exists) the pattern for a future
  extension-storage-schema migration test: seed `chrome.storage.sync`/`local` with a prior schema
  shape, load the new background/content script version, assert the one-time migration produces
  the expected new shape and sets whatever "already migrated" flag it uses.

**Where:** `.github/workflows/ci-launch-gates.yml` (extend `ci-integration`); new
`tests/unit/migrations-idempotent.test.mjs` (root-level, no DB, no `tsx` needed — plain
`node:test` reading `webapp/migrations/*.sql` as text).

---

## 5. Highest-risk current coverage gaps (explicit call-out)

Ranked by risk-reduction-per-effort for a pre-launch solo product, most urgent first:

1. **Auth handoff (`AUTH_SUCCESS`) is completely untested** (§1.2, §3.2, §3.4) — the one message
   every paid/synced feature depends on, with no CI signal if it breaks.
2. **No `Content-Security-Policy` on the main webapp**, and no test would catch the `/embed`
   permissive override leaking to other routes (§4.2).
3. **Zero unit coverage of `side-panel.js`/`dashboard.js`** (4,260 combined lines) — only slow,
   serial, network-dependent E2E exercises this code at all (§1.3).
4. **No performance/memory-leak signal anywhere** — long-session SW/content-script behavior is
   unverified (§4.1).
5. **Cross-browser coverage is Chromium-only** for surfaces (marketing site, share pages, embed
   widget) that are explicitly designed to be viewed in any browser (§2.3).
6. **Reminder-alarm scheduling logic** (`scheduleReminderAlarms`) has no coverage — pure date math
   that's currently trapped inside a large, hard-to-test file (§1.2).
7. **Migration idempotency is assumed, not verified** — `ci-integration` proves the forward path
   works but never re-runs it to catch a broken idempotency guard (§4.3).
8. **No network-failure-path coverage** for the extension's own API calls — `scheduleReminderAlarms`'s
   error branches, and cloud-sync's client-side conflict handling, are untested (§1.4, §3.3).

---

## 6. Phased implementation roadmap

Ordered for maximum risk-reduction first, given a pre-launch solo product where the launch-blocker
security suite (`docs/TEST_PLAN_launch.md`) is already done. Each phase is independently
shippable and slots into CI incrementally rather than requiring one big-bang PR.

| Phase | Focus | Key items | Effort | New CI |
|---|---|---|---|---|
| **1** | Auth bridge + CSP lock-in | AUTH_SUCCESS unit + E2E test (§1.2/§3.4); extension-success param-parsing unit test; CSP header pure-fn extraction + test (§4.2); manifest CSP/description-length regression tests (§1.5) | **3–4 days** | Extends existing `ci-unit` + `ci-extension-smoke` — no new job |
| **2** | Background logic extraction + network mocking | Extract `scheduleReminderAlarms` date math to a testable twin + unit tests (§1.2); `context.route()`-based reminder-sync mocking specs, happy + failure paths (§1.4); `CLIPMARK_REPORT_ERROR` gate test (§3.1) | **4–5 days** | Extends `ci-unit` + `ci-extension-smoke` |
| **3** | Webapp responsiveness + cross-browser | Viewport matrix for existing visual specs (§2.2); add firefox/webkit Playwright projects for the `webapp` project only + new **non-blocking** `ci-webapp-crossbrowser` job (§2.3); dashboard optimistic-UI interaction specs (§2.1) | **1 week** | New job (non-blocking initially) |
| **4** | UI unit-coverage extraction (incremental) | Identify + extract 2–3 pure-logic modules from `dashboard.js`/`side-panel.js` per iteration (sort/filter, group derivation, due-queue filtering) with unit tests (§1.3) — ongoing, not a single PR | **Ongoing, ~2 days per extraction batch** | Extends `ci-unit` |
| **5** | Non-functional | Memory-leak Playwright spec (SPA-nav loop + heap sampling) + SW-liveness spec (§4.1); migration idempotency re-run step in `ci-integration` + static idempotency-guard check (§4.3) | **3–4 days** | Extends `ci-integration` + `ci-extension-smoke` |
| **Backlog** | Fast-follows flagged but not scheduled | Extension-initiated cloud-sync E2E spanning both Playwright + local Supabase (§3.3, feasibility-spike first); side-panel storage-reactivity spec (§3.1); report-only CSP rollout decision (§4.2); manifest post-`ext-build` re-validation (§1.5); Dodo webhook idempotency table + test (carried over from `docs/TEST_PLAN_launch.md`, still open) | Varies | — |

**Sequencing rationale:** Phase 1 buys the most risk-reduction per hour — it closes the single
untested path every paid user depends on, at unit-test cost. Phase 2 stays cheap (extraction +
mocking, no new infra) and closes the second-riskiest gap. Phase 3 is the first phase that adds
new CI surface area (two browser engines) — kept non-blocking until proven stable, mirroring how
`ci-integration` itself was soaked before (implicitly) becoming load-bearing. Phase 4 is
deliberately open-ended and incremental rather than a fixed scope, because retrofitting unit tests
onto two ~2,000-line UI files is a multi-week effort better absorbed alongside normal feature work
than done as a dedicated sprint. Phase 5 is last because it has the lowest probability of catching
an actual pre-launch bug (nothing currently suggests a live memory leak or migration-idempotency
break) but the highest cost of an undetected regression post-launch when nobody is watching as
closely.

**CI gating posture:** every phase above extends an *existing* required gate except Phase 3's
cross-browser job, which should stay non-blocking (same soak-then-promote approach used for
`ci-integration`) until it's run clean for ~1–2 weeks of PRs.
