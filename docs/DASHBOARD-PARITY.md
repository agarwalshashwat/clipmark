# Dashboard Feature Parity — Extension vs Web

Source of truth: the **extension dashboard** (`extension/src/popup/dashboard.js`,
`extension/src/pages/dashboard.html`, `extension/src/pages/dashboard.entry.js`,
`extension/styles/dashboard.css`). It is frozen (already submitted to the Chrome
Web Store) and read-only for this effort. All changes happen on the **web
dashboard** (`webapp/app/dashboard/**`).

Legend: ✅ full parity · 🟡 partial / different implementation · ❌ missing ·
➕ web-only extra (not in extension).

## 1. Views / navigation structure

| Capability | Extension | Web | Status |
|---|---|---|---|
| All Bookmarks (cards view) | ✅ `#subnav-all` | ✅ `/dashboard` | ✅ |
| Timeline view | ✅ alternating left/right entries, month headers | 🟡 single-column entries, month headers | 🟡 cosmetic layout difference only, same capability |
| Videos view | ✅ plain clickable grid → filters into cards view | 🟡 `/dashboard/videos`, richer (see §9) | 🟡 |
| Reminders (revisit queue) | ✅ `#subnav-revisit` | ✅ `/dashboard/queue` | 🟡 create form is broken, see §4 |
| Groups | ✅ `#subnav-groups-side` | ✅ `/dashboard/groups` | 🟡 missing rename/reorder, extra "smart tag" group type, see §7 |
| Analytics | ✅ Pro-gated | ✅ `/dashboard/analytics` — Pro-gated as of Iteration 3 | ✅ |
| Shared (read-only list) | ✅ `#subnav-shared-side`, list only | ✅ `/dashboard/shared` | ✅ |
| Referral ("Refer & Earn") | ❌ not present | ➕ `/dashboard/referral` | ➕ extra |
| Affiliate program | ❌ not present | ➕ `/dashboard/affiliate` | ➕ extra |
| Sidebar collapse (persisted) | ✅ | ✅ | ✅ |
| Mobile bottom nav (Bookmarks/Reminders/Groups/Pro) | ✅ | ✅ | ✅ |
| Header search box | ✅ synced w/ toolbar search, filters live | 🟡 fixed in Iteration 7 — submits on Enter to `/dashboard?q=...` rather than live-syncing (see Iteration Log for why) | 🟡 functional, not live-synced |
| Sign-in / sign-out / user chip / avatar | ✅ | ✅ (webapp uses real Supabase auth instead of extension OAuth handoff — expected difference) | ✅ |
| Upgrade CTA (header + sidebar) | ✅ | ✅ | ✅ |

## 2. Bookmark cards (fields & actions)

| Capability | Extension | Web | Status |
|---|---|---|---|
| Thumbnail, title, YouTube link | ✅ | ✅ | ✅ |
| Scrubber track w/ per-bookmark dots | ✅ | ✅ (simplified positions) | ✅ |
| Bookmark count / added-date meta | ✅ | ✅ | ✅ |
| Per-bookmark: timestamp badge, note, tags | ✅ | ✅ | ✅ |
| Per-bookmark: copy link | ✅ | ✅ | ✅ |
| Per-bookmark: jump/open at timestamp | ✅ | ✅ | ✅ |
| Per-bookmark: delete | ✅ | ✅ | ✅ |
| Per-bookmark: **Extended Notes (Pro)** — textarea, autosave, saved indicator | ✅ | ✅ added in Iteration 5 (`BookmarkNotes.tsx`) | ✅ |
| Bulk-select checkboxes + bulk delete | ✅ | ✅ | ✅ |
| Collapse/expand after N bookmarks | ✅ (3) | ✅ (4) | ✅ (threshold differs, not a capability gap) |
| Pill row of all timestamps | ✅ | ✅ | ✅ |
| "Group" button (add to group) | ✅ floating picker w/ multi-checkbox + inline create-new-group | 🟡 modal, single-select add only, no create-new-group inline, no remove/checkbox-toggle | 🟡 gap |
| "Recall" button (start Active Recall for this video, any time) | ✅ always visible on every card, Pro-gated w/ free-review-cap check | ✅ added in Iteration 7 (no free-review-cap — see §3 asymmetry note) | 🟡 present, cap asymmetry documented |
| Featured-card highlighting | ✅ (most-bookmarked video) | ❌ not present | 🟡 cosmetic, low priority |
| Card size toggle (L/M/S) | ✅ | ✅ | ✅ |

## 3. Active Recall / due queue

| Capability | Extension | Web | Status |
|---|---|---|---|
| Due-strip banner (count + per-video chips + start button) | ✅ | ✅ | ✅ |
| Start recall for a *due* video | ✅ opens YT tab w/ pendingRevision | ✅ via extension bridge (`_utils/extension.ts`) when available, else opens the video | ✅ |
| Start recall for *any* video (not just due) | ✅ per-card "Recall" button | ✅ added in Iteration 7 (see §2) | ✅ |
| Free-tier monthly review cap enforcement | ✅ enforced in `dashboard.js` before starting | ⚠️ **architectural gap, not fixable from web alone**: the bridge message handler `START_RECALL` in `extension/src/background/background.js` (frozen) does not check the cap at all, so a web-triggered recall session bypasses it entirely. Documented, not fixed — would require an extension-side change, which is out of scope. | ❌ noted asymmetry, out of scope |
| Recall grading / quiz UI | Extension only (by design — needs the YouTube player) | N/A (web correctly does not attempt this) | ✅ by design |

## 4. Reminders / Revisit

| Capability | Extension | Web | Status |
|---|---|---|---|
| List due + upcoming reminders | ✅ | ✅ | ✅ |
| Target type: specific video vs group | ✅ tabs | 🟡 single `<select>` w/ optgroups instead of tabs — acceptable UI variant | ✅ |
| Frequency: once/daily/weekly/biweekly/monthly | ✅ matches `revisit_reminders.frequency` enum | ❌ **`RemindersContent.tsx` sends a numeric `frequency_days` (1/3/7/30) that the server action never reads, and never sends `next_due_at`, which is `NOT NULL` in the schema** — submitting the form throws `Invalid fields`/`Missing required fields` in `queue/actions.ts::createReminder`. **The web "Schedule Reminder" button is currently non-functional.** | ❌ **P0 bug** |
| Start date picker | ✅ | ❌ (not present; see above) | ❌ gap |
| Optional label | ✅ | ❌ not present in create form (schema/API support it) | ❌ gap |
| Content preview panel (thumbnail/title/tags) | ✅ | ❌ not present | ❌ gap |
| Edit existing reminder in place | ✅ | ❌ only delete, no edit | ❌ gap |
| Mark due reminder "Done" (advances/deletes) | ✅ | ❌ not present (only delete) | ❌ gap |
| Pro-gating | Enforced server-side only (`/api/reminders`); dashboard UI itself has no client-side Pro check | ✅ `loadRemindersQueue` blocks non-Pro server-side, redirects to `/upgrade` | ✅ (web is arguably stricter/better UX here) |
| Due-count badge in nav | ✅ | ✅ | ✅ |

## 5. Exports

| Format | Extension | Web | Status |
|---|---|---|---|
| JSON | ✅ free | ✅ free | ✅ |
| CSV | ✅ free | ✅ free | ✅ |
| Markdown | ✅ free | ✅ free | ✅ |
| Anki (.txt TSV) | ✅ free-cap (1/mo) then Pro | ✅ free-cap (1/mo) then Pro — `_utils/usage-caps.ts` twin | ✅ |
| Obsidian (.md) | ✅ Pro | ✅ added in Iteration 4, notes included as of Iteration 5 | ✅ |
| Notion CSV | ✅ Pro | ✅ added in Iteration 4, notes included as of Iteration 5 | ✅ |
| Reading List (.txt) | ✅ Pro | ✅ added in Iteration 4, notes included as of Iteration 5 | ✅ |
| Import JSON | ✅ | ✅ | ✅ |

## 6. Analytics

| Capability | Extension | Web | Status |
|---|---|---|---|
| Pro gating | ✅ shows upgrade CTA for free users | ✅ fixed in Iteration 3 | ✅ |
| 14-day activity heatmap | ✅ | ✅ | ✅ |
| Tag breakdown (count + bar) | ✅ + video count per tag | ✅ fixed in Iteration 3 | ✅ |
| Empty state | ✅ | ✅ | ✅ |

## 7. Groups

| Capability | Extension | Web | Status |
|---|---|---|---|
| Manual named groups (create/add video/remove video/delete) | ✅ | ✅ | ✅ |
| Rename group | ✅ inline contentEditable | ❌ not present | ❌ gap |
| Reorder groups (move up/down, persisted) | ✅ | ❌ not present | ❌ gap |
| Auto Groups (read-only, derived from all tags incl. "untagged") | ✅ | ✅ ("All Tags" section, "Untagged" label) | ✅ |
| "Smart (Tag Based)" persisted group type, bound to one tag, listed under "My Groups" | ❌ not present — extension's only tag-based view is the read-only Auto Groups section | ➕ present (`groups.type = 'tag'`) | ➕ extra, **entangled with the core (shared component, shared DB table, shared actions) — not cleanly relocatable to the hold branch without a schema/behavior change to already-existing user data.** Judgment call: documented here rather than removed; see Iteration Log. |
| Floating group-picker w/ inline "+ new group" creation | ✅ | ❌ (`GroupPickerModal` only lists existing groups; must visit `/dashboard/groups` to create one) | ❌ gap |

## 8. Shared collections

| Capability | Extension | Web | Status |
|---|---|---|---|
| List already-shared collections (view count, bookmark count, copy link, open) | ✅ read-only | ✅ (`/dashboard/shared`) plus a "Private Collections" section listing not-yet-shared videos | ✅ (web's extra "Private Collections" section is a harmless read-only convenience over the same data, not a new capability) |
| Create a new share from the dashboard | ❌ not present (sharing is initiated from the extension's on-page popup, out of scope for this comparison) | ➕ `ShareCollectionButton` on `/dashboard/videos` | ➕ extra — **see §9, judgment call: kept** |

## 9. Videos view

| Capability | Extension | Web | Status |
|---|---|---|---|
| Grid of video cards (thumbnail, count, tags, relative time) | ✅ | ✅ | ✅ |
| Click card → filter into All Bookmarks | ✅ | 🟡 card links straight to YouTube instead; filtering by tag happens in-page instead | 🟡 different but equivalent-ish interaction model |
| Tag filter bar | ❌ | ➕ | ➕ extra |
| Sort select (recently updated / most bookmarks / oldest) | ❌ | ➕ | ➕ extra |
| Per-card Share button (creates a new share) | ❌ | ➕ (`ShareCollectionButton`) | ➕ extra |
| Per-card Copy Link button | ❌ | ➕ | ➕ extra |
| Per-card Add-to-Group dropdown | ❌ (grouping is done from the main cards view, not Videos view) | ➕ | ➕ extra, duplicates capability already available elsewhere |

**Judgment call on §8/§9 extras:** these are woven into the video-card component
and reuse the same `groups`/`collections` server actions and DB tables as the
core (parity) features. They are not cleanly separable into their own
directory the way `referral/` and `affiliate/` are, and removing them would
delete working, already-shipped functionality (sharing-from-Videos-page) with
no clean rollback path via `git checkout <branch> -- <paths>`. Per the task's
instruction to use judgment rather than force a narrow definition, these are
left in place and documented rather than relocated. `referral/` and
`affiliate/` — full standalone routes with their own dedicated DB tables,
zero overlap with bookmark/group/reminder data — are relocated (§10).

## 10. Web-only extras relocated to `feature/dashboard-extras-hold`

| Item | Path(s) | Reason |
|---|---|---|
| Referral program ("Refer & Earn") | `webapp/app/dashboard/referral/page.tsx`, sidebar link in `DashboardChrome.tsx` | Not present in extension; standalone route + own DB tables (`profiles.referral_code`, `referrals`) |
| Affiliate program | `webapp/app/dashboard/affiliate/page.tsx`, `affiliate/AffiliateApplyForm.tsx`, sidebar link in `DashboardChrome.tsx` | Not present in extension; standalone route + own DB tables (`profiles.is_affiliate`/`affiliate_code`, `affiliate_applications`, `affiliate_clicks`, `affiliate_conversions`) |

## 11. Settings

Extension has no dedicated "Settings" view/tab (account actions — sign
in/out, sync, upgrade — live in the header/sidebar, not a separate page). Web
has an orphaned `webapp/app/dashboard/_components/SettingsContent.module.css`
with **no corresponding component** — dead CSS, not a feature gap either way.
Left alone (out of scope: removing dead CSS is a candidate for a follow-up
cleanup, not a parity concern).

## 12. Empty states

| View | Extension | Web | Status |
|---|---|---|---|
| No bookmarks yet | ✅ | ✅ | ✅ |
| No search matches | ✅ | ✅ | ✅ |
| No groups yet | ✅ | ✅ | ✅ |
| No reminders yet | ✅ | ✅ (blocked-by-Pro redirect doubles as this) | ✅ |
| No shared collections yet | ✅ | ✅ | ✅ |
| No analytics data yet | ✅ | ✅ | ✅ |

## 13. Filters / Search

| Capability | Extension | Web | Status |
|---|---|---|---|
| Live text search over description/title/tags | ✅ (header + toolbar inputs, kept in sync) | ✅ (toolbar input) | ✅ |
| Header search box | ✅ synced w/ toolbar | 🟡 fixed in Iteration 7, see §1 | 🟡 functional, not live-synced |
| Sort (newest/oldest/by timestamp) | ✅ | ✅ | ✅ |
| Saved Searches / filters (Pro) — save current query+sort as a named, reusable pill | ✅ | ✅ added in Iteration 6 | ✅ |

---

## Iteration Log

### Iteration 0 (this document)
Read both dashboards in full (`dashboard.js` 2637 lines, `dashboard.html`,
`dashboard.entry.js`, skimmed `dashboard.css` section headers) and every file
under `webapp/app/dashboard/`. Built the matrix above. Key findings ranked by
severity:

1. **P0 bug**: the web Reminders "Schedule Reminder" form sends fields
   (`frequency_days`, no `next_due_at`) that don't match what
   `queue/actions.ts::createReminder` reads or what the `revisit_reminders`
   schema requires — the form is currently non-functional.
2. Analytics has no Pro gate on web (free feature parity regression /
   monetization gap vs. extension).
3. Missing Pro export formats: Obsidian, Notion CSV, Reading List.
4. Missing Extended Notes (Pro) per-bookmark feature entirely.
5. Missing Saved Searches/filters (Pro) entirely.
6. Missing a persistent, always-available "Recall" trigger per video card
   (web only surfaces recall for videos already due).
7. Header search input in `DashboardChrome` is inert (no state wiring).
8. Groups missing rename + reorder.
9. Referral and Affiliate are confirmed web-only extras with no extension
   equivalent — slated for relocation to `feature/dashboard-extras-hold`.
10. Videos-view extras (tag filter, sort, share/copy/group-add buttons) and
    the Groups "smart tag group" type are also web-only, but judged too
    entangled with core, already-shipped, data-bearing functionality to
    relocate safely — documented instead of removed (see §8/§9).

No code changes yet in this iteration beyond this document.

### Iteration 1 — relocate referral/affiliate extras
Confirmed (via `DashboardChrome.tsx`, the extension's `dashboard.html` Account
section, and both features' dedicated DB tables/API routes) that referral and
affiliate are genuinely web-only with zero extension equivalent.

- Branched `feature/dashboard-extras-hold` off `main`, copied
  `webapp/app/dashboard/referral/` and `webapp/app/dashboard/affiliate/`
  there unchanged (content was still identical to `main` at that point),
  and added `docs/DASHBOARD-EXTRAS-HOLD.md` documenting what's held and how
  to restore it.
- On `sync/dashboard-parity`: deleted `webapp/app/dashboard/referral/` and
  `webapp/app/dashboard/affiliate/`, removed their sidebar entries from
  `DashboardChrome.tsx`, and dropped the now-unused `isAffiliate` prop from
  `DashboardChrome`/`layout.tsx` (including the `profiles.is_affiliate`
  column from the layout's query) since it had no remaining consumer.
- **Known follow-up, intentionally not fixed here**: the public marketing
  page `app/(marketing)/affiliate/page.tsx` links to `/dashboard/affiliate`
  in two CTAs. That page is outside `webapp/app/dashboard/**` (out of this
  sync's scope) and still exists on `main`; once this branch merges those
  links 404 until the affiliate program is reintroduced from the hold
  branch. Flagged in the PR description rather than patched here to avoid
  an unrelated-file edit.
- Verified: `cd webapp && npx tsc --noEmit` clean, `npm run test:unit:webapp`
  96/96 passing (no test referenced the removed pages).

### Iteration 2 — fix the broken Reminders create/edit form (P0)
Rewrote `webapp/app/dashboard/queue/RemindersContent.tsx`:

- Fixed the field mismatch: the form now submits `frequency` (the
  `once|daily|weekly|biweekly|monthly` enum the schema/API actually expect,
  replacing the old numeric `frequency_days` that was silently dropped) and
  `next_due_at` (previously never sent at all, despite being `NOT NULL`).
  This is what made "Schedule Reminder" throw on every submit before this
  change.
- Added the two fields the extension's create form has and web's didn't:
  a Start Date picker and an optional Label input (both already
  supported by `queue/actions.ts::createReminder` and the
  `revisit_reminders` schema — only the UI was missing them).
- Added Edit-in-place (populates the form from an existing reminder;
  submitting deletes the old row and creates the new one, mirroring the
  extension's own edit flow in `dashboard.js`, since there's no dedicated
  update action) and wired up `markReminderDone` — it already existed in
  `queue/actions.ts` but had no caller anywhere in the UI.
- Fixed the reminder-card CSS classes to the ones actually defined in
  `page.module.css` (`cardTitle`/`cardMeta`/`freqText` — the old code
  referenced `targetName`/`meta`/`freq`, which don't exist in that module and
  silently rendered unstyled).
- Not done (still a gap vs. extension, lower priority): the extension's
  tabbed Target Type UI and the live content-preview panel that updates as
  the target-type tab changes. Kept the existing select+optgroup approach,
  which already correctly encodes target type per option.

Verified: `cd webapp && npx tsc --noEmit` clean, `npm run test:unit:webapp`
96/96 passing. Not visually verified in a browser — the dashboard is
auth-gated (redirects to `/signin` without a real Supabase session) and no
local Supabase project is configured in this environment; reasoned from
source and the schema/migration file instead.

### Iteration 3 — Pro-gate Analytics + per-tag video count
`webapp/app/dashboard/analytics/page.tsx` had no Pro check at all, unlike
`dashboard.js::renderAnalyticsView` which shows an upgrade CTA in place of the
view for free users — a real monetization-parity gap, not just cosmetic.

- Added a server-side `profiles.is_pro` check; free users now see an
  "Analytics — Pro Feature" card with an Upgrade to Pro CTA, matching the
  extension's copy and behavior, instead of the full analytics view.
- Added the per-tag video count the extension shows
  (`${vids} video${vids !== 1 ? 's' : ''}`) — `AnalyticsContent.tsx`'s tag
  rows previously showed only the bookmark count and a bar, no video count.
  Computed via a `Set<videoId>` per tag in `page.tsx`, threaded through a new
  `videoCount` field on `TagStat`, rendered via a new `.tagVideoCount` class
  in `page.module.css`.

Verified: `npx tsc --noEmit` clean, `npm run test:unit:webapp` 96/96 passing.
Not visually verified in a browser (same auth-gating caveat as Iteration 2).

### Iteration 4 — add missing Pro export formats
Added `exportObsidian`, `exportNotionCSV`, `exportReadingList` to
`DashboardContent.tsx`, porting the extension's exporters
(`dashboard.js::exportObsidian/exportNotionCSV/exportReadingList`) line for
line, adapted to operate on the web's `Collection[]` shape instead of the
extension's flat `allBookmarks` + `videoTitles` map. Wired three new buttons
into the export popover's existing "Pro" section, reusing the same
`exportBtn`/`exportProTag` classes the Anki button already uses. Unlike
Anki (1 free export/month), these three are Pro-only with no free
allowance, matching the extension's `checkPro()` gate with no usage cap —
free users get a toast ("... is available on Pro.") instead of a download.

**Known gap carried forward**: the extension's exporters also include each
bookmark's Extended Notes text (`b.notes`) in the Obsidian/Notion output.
The web side has no Extended Notes feature yet (see Iteration 5), so these
three new exporters currently emit an empty Notes column / omit the notes
blockquote. Once Extended Notes lands on web, these three functions need a
follow-up pass to include it — noted here so it isn't forgotten.

Verified: `npx tsc --noEmit` clean, `npm run test:unit:webapp` 96/96 passing.
Not visually verified in a browser (same auth-gating caveat).

### Iteration 5 — add Extended Notes (Pro)
The extension's per-bookmark Extended Notes (`.vc-notes-btn`/`.vc-notes-panel`
in `dashboard.js`) had no web equivalent at all. No schema change was
needed — bookmarks are stored as JSONB, so `notes` is just a new optional
key.

- Added `notes?: string` to the `Bookmark` interface in `lib/supabase.ts`.
- Added `updateBookmarkNotes(videoId, bookmarkId, notes)` to
  `dashboard/actions.ts`. The extension only gates notes client-side
  (chrome.storage.sync has no server round-trip to enforce against); since
  the webapp's version does go through a server action, it also re-checks
  `profiles.is_pro` server-side — consistent with how this codebase already
  treats other server-callable Pro features (e.g.
  `queue/data.ts::loadRemindersQueue`), so a free user can't bypass the
  UI gate by calling the action directly.
- New `_components/BookmarkNotes.tsx`: a small client component (button +
  collapsible textarea, 800ms debounced autosave, save-on-blur/Ctrl+Enter,
  Esc to close) reused across all three bookmark-row render sites in
  `DashboardContent.tsx` (library view's visible + collapsed/overflow
  rows, and the timeline view's clip rows) instead of tripling the logic.
  New `.notesBtn`/`.notesPanel`/`.notesTextarea`/`.notesHint` classes added
  to `toolbar.module.css`.
- Free users get the same upgrade-toast pattern already used for the
  Anki-cap and new Pro exports ("Extended Notes is available on Pro.")
  instead of the panel opening.
- Closed the gap flagged in Iteration 4: `exportCSV`, `exportMarkdown`,
  `exportObsidian`, `exportNotionCSV`, and `exportReadingList` now all
  include the notes text/column, matching the extension's exporters
  exactly (`b.notes` was previously only ever an empty placeholder in the
  three new Pro exporters, and entirely absent from CSV/Markdown).

**Found in passing, not fixed here (flagged as a separate background
task)**: `DashboardContent.tsx` references several `toolbarStyles.*` classes
(`actionBtn`, `actionBtnDanger`, `bookmarkActions`, `threadItemHover`,
`checkbox`, `bulkBar`, `copyToast`, etc.) that don't exist anywhere in
`toolbar.module.css` or any other stylesheet — confirmed via
`grep -rn "\.actionBtn\b" webapp/app/dashboard`, zero matches. CSS modules
silently resolve unknown keys to `undefined`, so these buttons/rows/toasts
render with no class at all in production today. This predates this sync
effort and is a styling bug, not a feature-parity gap, so it's out of scope
here — spawned as its own background task rather than folded into this PR.
The new `BookmarkNotes` component intentionally uses its own, properly
defined classes rather than the broken ones.

Verified: `npx tsc --noEmit` clean, `npm run test:unit:webapp` 96/96 passing.
Not visually verified in a browser (same auth-gating caveat).

### Iteration 6 — add Saved Searches / filters (Pro)
Ported the extension's Saved Searches (`dashboard.js`'s
`getSavedSearches`/`saveSavedSearch`/`deleteSavedSearch`/
`renderSavedFilterPills`, backed by `chrome.storage.sync`) to the web
dashboard. The webapp has no per-user `chrome.storage.sync` equivalent for
this kind of lightweight, device-local UI preference, so it uses
`localStorage` — the same trade-off already made for `dash_cardSize` in
`DashboardContent.tsx` and for the Anki export usage cap in `_utils/
usage-caps.ts`.

- New `_utils/savedSearches.ts`: `getSavedSearches`/`saveSavedSearch`/
  `deleteSavedSearch`, `localStorage`-backed, same shape as the extension's
  (`{ id, name, query, sort }`).
- `DashboardContent.tsx`: a "⊕ Save" button appears next to the search box
  whenever there's a query (matching the extension's
  `updateSaveFilterBtn`), Pro-gated via the same upgrade-toast pattern used
  for Extended Notes. Saved filters render as removable pills below the
  toolbar; clicking a pill restores its query + sort order, matching the
  extension's `renderSavedFilterPills` click handler exactly.
- Refactored the ad hoc "Extended Notes is available on Pro" toast from
  Iteration 5 into a small shared `showProToast(message)` helper, reused by
  both Extended Notes and Saved Searches instead of duplicating the
  set-then-timeout pattern a second time.
- New `.savedFiltersRow`/`.savedFilterPill`/`.savedFilterPillName`/
  `.savedFilterPillDel` classes in `toolbar.module.css`.

Verified: `npx tsc --noEmit` clean, `npm run test:unit:webapp` 96/96 passing.
Not visually verified in a browser (same auth-gating caveat).

### Iteration 7 — persistent per-card Recall button + fix the dead header search
Two independent fixes this round:

**Persistent "Recall" button.** The extension's video card always shows a
"Recall" button (Pro-gated, starts Active Recall over every bookmark on that
video, any time) — the web dashboard only ever surfaced recall for videos
already *due*, via the due-strip banner. Added a third button to each video
card's action row (alongside the existing Watch/Group buttons) that reuses
the existing `handleStartRecall`/`_utils/extension.ts` bridge plumbing the
due-strip already had, passing every bookmark id for that video (sorted by
timestamp) instead of just the due ones — matching
`dashboard.js`'s `.vc-revisit-btn` handler exactly. Free users get the same
upgrade-toast pattern as Extended Notes/Saved Searches.
**Deliberately not added**: a client-side free-tier review-count cap. The
extension's own cap only works because the review session *and* the
counter live in the same place (the extension); a web-side counter would
gate the button click but not the session itself, since
`background.js`'s `START_RECALL` handler (frozen, external-message path)
never checks any cap — already documented in §3 as an out-of-scope
asymmetry. Adding a cosmetic-only counter that doesn't actually limit
anything seemed worse than the status quo, so it was left out; noted here
for visibility rather than silently skipped.

**Header search.** `DashboardChrome`'s header search box rendered a bare
`<input>` with no `value`/`onChange` — inert, confirmed in Iteration 0.
True live sync with the toolbar search (like the extension's two synced
inputs) isn't feasible without either lifting `query` into the URL (which
would trigger a full server refetch of `collections` from Supabase on every
keystroke — the toolbar search is deliberately local React state to avoid
exactly that) or introducing a cross-tree client store, which would be an
unrelated architecture change. Instead: the header search is now a
real, working "jump to All Bookmarks filtered by this query" affordance —
controlled input, submits on Enter (`router.push('/dashboard?q=...')`),
picked up by `DashboardContent` as its initial query via a new
`initialQuery` prop threaded through `dashboard/page.tsx`'s `searchParams`.
No per-keystroke navigation, so no server round-trip cost.

Verified: `npx tsc --noEmit` clean, `npm run test:unit:webapp` 96/96
passing, and a full `cd webapp && npx next build` (with placeholder env
vars matching `tests/unit/fixtures/env-setup.mjs`, gitignored `.env.local`,
not committed) completed successfully end to end — confirms `/dashboard`,
`/dashboard/queue`, `/dashboard/groups`, `/dashboard/analytics`,
`/dashboard/videos`, `/dashboard/shared` all still build, and
`/dashboard/referral`/`/dashboard/affiliate` are correctly gone from the
route list. Still not visually verified in a running browser session
(would need a seeded local Supabase project for real auth).
