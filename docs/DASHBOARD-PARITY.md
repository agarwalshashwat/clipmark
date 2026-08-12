# Dashboard Feature Parity — Web vs Extension

**Audited against `origin/main` @ `b4fb4db`** (post-#93 design-system restyle,
post-#88 A–B multi-segment loops). This supersedes the version written during
PR #76, which described a one-directional "sync the web dashboard up to the
frozen extension" effort. That framing no longer holds: both surfaces have
moved since, and each now leads the other in different places.

**Surfaces compared**

| | Web dashboard | Extension "local" dashboard |
|---|---|---|
| Entry | `clipmark.mithahara.com/dashboard` | `chrome-extension://…/src/pages/dashboard.html` |
| Code | [`webapp/app/dashboard/**`](../webapp/app/dashboard) | [`extension/src/popup/dashboard.js`](../extension/src/popup/dashboard.js) (2 639 lines), [`extension/src/pages/dashboard.html`](../extension/src/pages/dashboard.html), `extension/styles/dashboard.css` |
| Data source | Supabase (`user_bookmarks`, `groups`, `revisit_reminders`, `collections`) | `chrome.storage.sync` (`bm_*`, `vgroups`, `savedSearches`), with `/api/*` for reminders/shared/groups |

**Legend**

- ✅ **in sync** — same capability on both surfaces (implementation may differ).
- ⚠️ **intentional divergence** — deliberate, with a reason recorded.
- ❌ **real gap** — one surface can do something the other can't, and that
  wasn't a decision anyone made.

**Headline:** the two dashboards agree on the *shape* of the product — every
top-level view exists on both, and the whole export/notes/saved-search/groups
surface is genuinely at parity. Where they diverge, it clusters in three
places: **A–B loop rendering** (web only shows a loop's range in one of five
render sites), **Active Recall entitlement**, and **extension Reminders**,
whose create form threw before it rendered. Across 115 compared capabilities:
**63 ✅ · 32 ⚠️ · 20 ❌** — and 10 of the 20 gaps are the loop-rendering and
scrubber clusters, i.e. two fixes, not twenty.

> **⚠️ Staleness warning — read §13 before acting on any ❌ in this file.**
> The two runtime defects this pass called out (§13 items 1 and 2) were fixed
> by **#96 (`5410d51`)** and are no longer live; §8 and §13 have been corrected
> in place. Every other row still reflects `b4fb4db` and has **not** been
> re-verified since. This file is a point-in-time audit, not a live dashboard —
> re-check against source before filing anything from it. It has already
> produced two false P1 reports by being read as current.

---

## 1. Navigation & shell

| Capability | Web | Extension | Status |
|---|---|---|---|
| All Bookmarks | [`DashboardChrome.tsx:64`](../webapp/app/dashboard/_components/DashboardChrome.tsx#L64), [`:131`](../webapp/app/dashboard/_components/DashboardChrome.tsx#L131) | [`dashboard.html:22`](../extension/src/pages/dashboard.html#L22), [`:69`](../extension/src/pages/dashboard.html#L69); [`dashboard.js:2529`](../extension/src/popup/dashboard.js#L2529) | ✅ |
| Videos | [`DashboardChrome.tsx:135`](../webapp/app/dashboard/_components/DashboardChrome.tsx#L135) → `/dashboard/videos` | [`dashboard.html:73`](../extension/src/pages/dashboard.html#L73); [`renderVideosView` `dashboard.js:2015`](../extension/src/popup/dashboard.js#L2015) | ✅ |
| Reminders | [`DashboardChrome.tsx:67`](../webapp/app/dashboard/_components/DashboardChrome.tsx#L67), [`:139`](../webapp/app/dashboard/_components/DashboardChrome.tsx#L139) | [`dashboard.html:23`](../extension/src/pages/dashboard.html#L23), [`:77`](../extension/src/pages/dashboard.html#L77) | ✅ |
| Analytics | [`DashboardChrome.tsx:145`](../webapp/app/dashboard/_components/DashboardChrome.tsx#L145) | [`dashboard.html:83`](../extension/src/pages/dashboard.html#L83) | ✅ |
| Groups | [`DashboardChrome.tsx:149`](../webapp/app/dashboard/_components/DashboardChrome.tsx#L149) | [`dashboard.html:87`](../extension/src/pages/dashboard.html#L87) | ✅ |
| Shared | [`DashboardChrome.tsx:153`](../webapp/app/dashboard/_components/DashboardChrome.tsx#L153) → own route | [`dashboard.html:91`](../extension/src/pages/dashboard.html#L91) → inline [`renderSharedView:2084`](../extension/src/popup/dashboard.js#L2084); header link [`:27`](../extension/src/pages/dashboard.html#L27) goes to the website | ✅ |
| Sidebar collapse, persisted | [`DashboardChrome.tsx:44-54`](../webapp/app/dashboard/_components/DashboardChrome.tsx#L44) | [`dashboard.js:2368-2375`](../extension/src/popup/dashboard.js#L2368) | ✅ same `sidebarCollapsed` localStorage key |
| Mobile bottom nav (Bookmarks/Reminders/Groups/Pro) | [`DashboardChrome.tsx:185-203`](../webapp/app/dashboard/_components/DashboardChrome.tsx#L185) | [`dashboard.html:185-202`](../extension/src/pages/dashboard.html#L185) | ✅ |
| Due-reminder badge in nav | [`layout.tsx:17-22`](../webapp/app/dashboard/layout.tsx#L17) (direct count query) | [`dashboard.js:1463-1485`](../extension/src/popup/dashboard.js#L1463) (via `/api/reminders`) | ✅ |
| Upgrade CTA, header + sidebar | [`DashboardChrome.tsx:88-91`](../webapp/app/dashboard/_components/DashboardChrome.tsx#L88), [`:158-168`](../webapp/app/dashboard/_components/DashboardChrome.tsx#L158) | [`dashboard.html:49`](../extension/src/pages/dashboard.html#L49), [`:96`](../extension/src/pages/dashboard.html#L96); label flips at [`dashboard.js:2247-2251`](../extension/src/popup/dashboard.js#L2247) | ✅ both flip to "Manage Subscription"/"✦ Pro" for Pro |
| Header search box | [`DashboardChrome.tsx:77-87`](../webapp/app/dashboard/_components/DashboardChrome.tsx#L77) — submits on Enter to `/dashboard?q=…`, picked up as `initialQuery` ([`page.tsx:13`](../webapp/app/dashboard/page.tsx#L13), [`DashboardContent.tsx:234-239`](../webapp/app/dashboard/_components/DashboardContent.tsx#L234)) | [`dashboard.js:2425-2440`](../extension/src/popup/dashboard.js#L2425) — live two-way sync with the toolbar input | ⚠️ web's toolbar query is local React state on purpose; live URL sync would refetch `collections` from Supabase per keystroke |
| Sign in / sign out / identity | Real Supabase session; [`layout.tsx:9`](../webapp/app/dashboard/layout.tsx#L9) redirects to `/signin`, avatar + sign-out at [`DashboardChrome.tsx:93-104`](../webapp/app/dashboard/_components/DashboardChrome.tsx#L93) | OAuth handoff into `chrome.storage.sync.bmUser`; [`dashboard.js:2227-2270`](../extension/src/popup/dashboard.js#L2227) | ⚠️ different auth models by construction; both surface the same three affordances |
| Entitlement freshness | `is_pro` read server-side on every request ([`layout.tsx:13`](../webapp/app/dashboard/layout.tsx#L13)) | Cached in `bmUser.isPro`, re-checked against `/api/me` on focus, throttled 60 s ([`dashboard.js:106-135`](../extension/src/popup/dashboard.js#L106)) | ⚠️ consequence of local-first storage |
| Manual "sync with cloud" button | — (the web *is* the cloud) | [`dashboard.html:39`](../extension/src/pages/dashboard.html#L39); [`syncAllWithCloud:2272-2320`](../extension/src/popup/dashboard.js#L2272) | ⚠️ intentional |
| Referral ("Refer & Earn") | Not in `webapp/app/dashboard/**` — parked on `feature/dashboard-extras-hold` | Not present | ⚠️ intentional divergence, parked |
| Affiliate program | Dashboard route parked on `feature/dashboard-extras-hold`; public page still lives at `webapp/app/(marketing)/affiliate/` | Not present | ⚠️ intentional divergence, parked |

## 2. Bookmark library — cards / grid view

| Capability | Web | Extension | Status |
|---|---|---|---|
| Video-grouped cards | [`DashboardContent.tsx:798-1051`](../webapp/app/dashboard/_components/DashboardContent.tsx#L798) | [`dashboard.js:424-599`](../extension/src/popup/dashboard.js#L424) | ✅ |
| Thumbnail, title, YouTube link | [`:815-829`](../webapp/app/dashboard/_components/DashboardContent.tsx#L815) | [`:471-481`](../extension/src/popup/dashboard.js#L471) | ✅ |
| Bookmark count + added-date meta | [`:882-886`](../webapp/app/dashboard/_components/DashboardContent.tsx#L882) | [`:505-509`](../extension/src/popup/dashboard.js#L505) | ✅ |
| Stats bar (bookmarks / videos / tags / last saved) | [`:689-712`](../webapp/app/dashboard/_components/DashboardContent.tsx#L689) | [`renderStatsBar:304-333`](../extension/src/popup/dashboard.js#L304) | ✅ |
| Featured-card highlight (most bookmarks, >1 video) | [`:802-807`](../webapp/app/dashboard/_components/DashboardContent.tsx#L802) | [`:443-445`](../extension/src/popup/dashboard.js#L443) | ✅ |
| Card size toggle L/M/S, persisted | [`:368-373`](../webapp/app/dashboard/_components/DashboardContent.tsx#L368) (`dash_cardSize`) | [`:2491-2497`](../extension/src/popup/dashboard.js#L2491) (`bm_cardSize`) | ✅ |
| Collapse after N bookmarks | 4 ([`:890`](../webapp/app/dashboard/_components/DashboardContent.tsx#L890), [`:948`](../webapp/app/dashboard/_components/DashboardContent.tsx#L948)) | 3 (`COLLAPSE_AFTER`, [`:464`](../extension/src/popup/dashboard.js#L464)) | ✅ threshold only |
| Per-bookmark: copy link | [`:916-923`](../webapp/app/dashboard/_components/DashboardContent.tsx#L916) | [`:532`](../extension/src/popup/dashboard.js#L532), [`:811-819`](../extension/src/popup/dashboard.js#L811) | ✅ |
| Per-bookmark: open at timestamp | [`OpenAtTimestampLink:39-52`](../webapp/app/dashboard/_components/DashboardContent.tsx#L39) | [`:533`](../extension/src/popup/dashboard.js#L533), [`jumpToVideo:963`](../extension/src/popup/dashboard.js#L963) | ✅ |
| Per-bookmark: delete | [`:924-932`](../webapp/app/dashboard/_components/DashboardContent.tsx#L924) | [`:534`](../extension/src/popup/dashboard.js#L534), [`:833-852`](../extension/src/popup/dashboard.js#L833) | ✅ |
| Per-bookmark: tags with per-tag colour | [`:937-943`](../webapp/app/dashboard/_components/DashboardContent.tsx#L937) | [`:525-529`](../extension/src/popup/dashboard.js#L525) | ✅ |
| Extended Notes (Pro) | [`BookmarkNotes.tsx`](../webapp/app/dashboard/_components/BookmarkNotes.tsx) + server-side `is_pro` re-check in [`actions.ts:49-59`](../webapp/app/dashboard/actions.ts#L49) | [`:531`](../extension/src/popup/dashboard.js#L531), [`:855-943`](../extension/src/popup/dashboard.js#L855), client-side gate only | ✅ web is stricter, same UX (debounce, blur/Ctrl+Enter save, Esc) |
| "Group" button on card | [`:852-859`](../webapp/app/dashboard/_components/DashboardContent.tsx#L852) → [`GroupPickerModal`](../webapp/app/dashboard/_components/GroupPickerModal.tsx) | [`:493-495`](../extension/src/popup/dashboard.js#L493) → [`showGroupPicker:1187`](../extension/src/popup/dashboard.js#L1187) | ✅ button; see §7 for the picker's contents |
| "Recall" button on card | [`DashboardContent.tsx`](../webapp/app/dashboard/_components/DashboardContent.tsx) — no `isPro` block, by design | [`.vc-revisit-btn`](../extension/src/popup/dashboard.js) — shared `isRecallStartBlocked` gate | ✅ both cap-gated; see §8 |
| "Watch" button | [`:848-851`](../webapp/app/dashboard/_components/DashboardContent.tsx#L848) | — (the thumbnail is the link) | ⚠️ web extra, harmless |
| Upsell "Add more variety" card in the grid | [`:1039-1048`](../webapp/app/dashboard/_components/DashboardContent.tsx#L1039) | — | ⚠️ web extra |
| Scrubber with per-bookmark markers | [`:830-844`](../webapp/app/dashboard/_components/DashboardContent.tsx#L830) — markers spaced by **array index** (`(i / (n-1)) * 90 + 5`) | [`buildTimeline:336-343`](../extension/src/popup/dashboard.js#L336) — positioned by `timestamp / trackMax`, `trackMax` from stored `videoDurations` | ❌ the web scrubber conveys no real position; three clips at 0:05/0:07/58:00 render evenly spaced |
| Scrubber end labels (`00:00` … duration) | — | [`:484-487`](../extension/src/popup/dashboard.js#L484) | ❌ minor |
| Duration badge on the thumbnail | — | [`:476`](../extension/src/popup/dashboard.js#L476) | ❌ minor |
| Marker tooltip contents | timestamp only ([`:839`](../webapp/app/dashboard/_components/DashboardContent.tsx#L839)) | range/timestamp + note ([`:340`](../extension/src/popup/dashboard.js#L340)) | ❌ minor |
| "⋮ More options" button | — | [`:501-503`](../extension/src/popup/dashboard.js#L501) — rendered and styled, **no click handler anywhere** | ⚠️ dead control on the extension side |
| Bookmark-action buttons / bulk bar / toast are styled | ❌ see §12 | ✅ | ❌ web renders these unstyled in production |

## 3. Timeline view

| Capability | Web | Extension | Status |
|---|---|---|---|
| Timeline view exists | [`:1054-1127`](../webapp/app/dashboard/_components/DashboardContent.tsx#L1054) | [`renderTimelineView:682-758`](../extension/src/popup/dashboard.js#L682) | ✅ |
| Month grouping headers | [`:1059-1062`](../webapp/app/dashboard/_components/DashboardContent.tsx#L1059) | [`:712-716`](../extension/src/popup/dashboard.js#L712) | ✅ |
| Layout | single column, day marker + one card per (day × video), clips nested | alternating left/right entries, one card per bookmark | ⚠️ cosmetic; same information |
| Copy link / open / delete per clip | [`:1107-1116`](../webapp/app/dashboard/_components/DashboardContent.tsx#L1107) | [`:735-739`](../extension/src/popup/dashboard.js#L735) | ✅ |
| Extended Notes in timeline | [`:1115`](../webapp/app/dashboard/_components/DashboardContent.tsx#L1115) | — (only in cards view) | ⚠️ web extra |
| Bulk-select checkboxes in timeline | [`:1091-1097`](../webapp/app/dashboard/_components/DashboardContent.tsx#L1091) | — the delegate at [`:821-831`](../extension/src/popup/dashboard.js#L821) toggles `.tl-entry`, but [`:728-740`](../extension/src/popup/dashboard.js#L728) renders no checkbox | ⚠️ **web leads** |

## 4. A–B loop range display

Loops are created and driven only in the extension's content script (the web
can't touch the YouTube player) — that part is ⚠️ intentional. What both
dashboards *should* do identically is render a saved loop as its **range**
(`0:42 → 1:15`) rather than just its A point. The web has the helper
([`_utils/loop.ts`](../webapp/app/dashboard/_utils/loop.ts), twin-tested against
`extension/src/loop.module.js` by `webapp/tests/unit/loop-parity.test.ts`) and
calls it in exactly one of five places.

| Render site | Web | Extension | Status |
|---|---|---|---|
| Card thread rows (first N) | [`:907`](../webapp/app/dashboard/_components/DashboardContent.tsx#L907) `formatLoopRange(b) ?? …` | [`:522`](../extension/src/popup/dashboard.js#L522) | ✅ |
| Collapsed / overflow rows | [`:976`](../webapp/app/dashboard/_components/DashboardContent.tsx#L976) — plain `formatTimestamp` | [`:555`](../extension/src/popup/dashboard.js#L555) | ❌ |
| Timestamp pill row | [`:1031`](../webapp/app/dashboard/_components/DashboardContent.tsx#L1031) — plain `formatTimestamp` | [`:589`](../extension/src/popup/dashboard.js#L589) | ❌ |
| Timeline clip rows | [`:1104`](../webapp/app/dashboard/_components/DashboardContent.tsx#L1104) — plain `formatTimestamp` | [`:731`](../extension/src/popup/dashboard.js#L731) | ❌ |
| Scrubber marker tooltip | [`:839`](../webapp/app/dashboard/_components/DashboardContent.tsx#L839) — plain `formatTimestamp` | [`:340`](../extension/src/popup/dashboard.js#L340) | ❌ |
| "A–B Loop" type label | [`:910-912`](../webapp/app/dashboard/_components/DashboardContent.tsx#L910), first-N rows only; overflow rows at [`:979`](../webapp/app/dashboard/_components/DashboardContent.tsx#L979) fall back to "Annotated Bookmark"/"Quick Clip" | `vc-vt-time--loop` modifier applied in both row sets | ❌ |
| Loop creation / editing / playback | — | content script | ⚠️ intentional |

Net effect: a user who saves five loops on one video sees the first four as
ranges in the web card, the fifth as a bare A point, and all five as bare A
points in the pill row and in the timeline.

## 5. Search, sort & saved filters

| Capability | Web | Extension | Status |
|---|---|---|---|
| Live text search over title / note / tags | [`:476-487`](../webapp/app/dashboard/_components/DashboardContent.tsx#L476), [`:290-311`](../webapp/app/dashboard/_components/DashboardContent.tsx#L290) | [`:2434-2440`](../extension/src/popup/dashboard.js#L2434), [`applyFiltersAndSort:263-270`](../extension/src/popup/dashboard.js#L263) | ✅ |
| Clear-search button | [`:483-487`](../webapp/app/dashboard/_components/DashboardContent.tsx#L483) | — | ⚠️ web extra |
| Sort: newest / oldest / by timestamp | [`:499-507`](../webapp/app/dashboard/_components/DashboardContent.tsx#L499) | [`dashboard.html:125-129`](../extension/src/pages/dashboard.html#L125), [`:272-276`](../extension/src/popup/dashboard.js#L272) | ✅ |
| Save current query+sort as a named pill (Pro) | [`_utils/savedSearches.ts`](../webapp/app/dashboard/_utils/savedSearches.ts) (localStorage), UI at [`:266-286`](../webapp/app/dashboard/_components/DashboardContent.tsx#L266), [`:640-663`](../webapp/app/dashboard/_components/DashboardContent.tsx#L640) | [`:192-243`](../extension/src/popup/dashboard.js#L192) (`chrome.storage.sync`), UI at [`:2443-2451`](../extension/src/popup/dashboard.js#L2443) | ⚠️ same feature; extension's saved filters follow the user across devices, web's are per-browser |
| "⊕ Save" appears only when a query is active | [`:489-498`](../webapp/app/dashboard/_components/DashboardContent.tsx#L489) | [`updateSaveFilterBtn:772-775`](../extension/src/popup/dashboard.js#L772) | ✅ |
| Drill into a single video (filter the library to it) | ❌ — `/dashboard` reads only `view`/`success`/`q` ([`page.tsx:11`](../webapp/app/dashboard/page.tsx#L11)), yet Groups links to `/dashboard?v=…` ([`GroupsContent.tsx:188`](../webapp/app/dashboard/groups/GroupsContent.tsx#L188), [`:249`](../webapp/app/dashboard/groups/GroupsContent.tsx#L249)) | `filterVideoId` ([`:259-261`](../extension/src/popup/dashboard.js#L259)), set by clicking a Videos-view card ([`:2068-2075`](../extension/src/popup/dashboard.js#L2068)) | ❌ web has no per-video drilldown, and the Groups thumbnails link to a param nothing reads |

## 6. Reminders / revisit queue

| Capability | Web | Extension | Status |
|---|---|---|---|
| List due + upcoming | [`RemindersContent.tsx:231-281`](../webapp/app/dashboard/queue/RemindersContent.tsx#L231) — one merged "Active Queue" | [`:1988-2006`](../extension/src/popup/dashboard.js#L1988) — separate "Due Now" and "Active Schedule" sections | ⚠️ presentation |
| Target type: video vs group | `<select>` with optgroups ([`:144-161`](../webapp/app/dashboard/queue/RemindersContent.tsx#L144)) | two tabs ([`:1716-1727`](../extension/src/popup/dashboard.js#L1716)) | ⚠️ UI variant, same encoding |
| Frequency enum (once/daily/weekly/biweekly/monthly) | [`:35-41`](../webapp/app/dashboard/queue/RemindersContent.tsx#L35) | [`:1736-1742`](../extension/src/popup/dashboard.js#L1736) | ✅ |
| Start-date picker | [`:187-193`](../webapp/app/dashboard/queue/RemindersContent.tsx#L187) | [`:1746`](../extension/src/popup/dashboard.js#L1746) | ✅ both post 09:00 local |
| Optional label | [`:201-208`](../webapp/app/dashboard/queue/RemindersContent.tsx#L201) | [`:1750`](../extension/src/popup/dashboard.js#L1750) | ✅ |
| Content-preview panel | thumbnail + title ([`:110-133`](../webapp/app/dashboard/queue/RemindersContent.tsx#L110)) | thumbnail + title + **tags** + a distinct group-target preview ([`:1680-1707`](../extension/src/popup/dashboard.js#L1680), [`updatePreview:1618-1649`](../extension/src/popup/dashboard.js#L1618)) | ⚠️ web now has the panel (this row was stale in the old doc); tags still missing |
| Pre-fill from the active YouTube tab | — (no tab access) | [`:1805-1812`](../extension/src/popup/dashboard.js#L1805) | ⚠️ intentional |
| Edit in place | [`:98-104`](../webapp/app/dashboard/queue/RemindersContent.tsx#L98) | [`:1949-1971`](../extension/src/popup/dashboard.js#L1949) | ✅ both delete-then-recreate |
| Mark done | [`:94-96`](../webapp/app/dashboard/queue/RemindersContent.tsx#L94), [`:249-258`](../webapp/app/dashboard/queue/RemindersContent.tsx#L249) | [`markDone:1894-1906`](../extension/src/popup/dashboard.js#L1894) | ✅ |
| Delete | [`:267-274`](../webapp/app/dashboard/queue/RemindersContent.tsx#L267) | [`:1972-1984`](../extension/src/popup/dashboard.js#L1972) | ✅ |
| "Revisit ↗" straight to the video on a due card | — | [`:1941`](../extension/src/popup/dashboard.js#L1941) | ❌ the whole point of a due reminder is one click to the video |
| Thumbnail on the reminder card | — | [`:1925-1927`](../extension/src/popup/dashboard.js#L1925) | ❌ minor |
| Pro gating | Server-side: [`queue/data.ts:38`](../webapp/app/dashboard/queue/data.ts#L38) → redirect `/upgrade` before any row is read | None in the UI; the form renders for free users and `/api/reminders` 403s on submit ([`api/reminders/route.ts:47`](../webapp/app/api/reminders/route.ts#L47)) | ⚠️ **web leads** — same entitlement, better UX |
| **Create form renders at all** | ✅ | ❌ **broken** — [`dashboard.js:1657`](../extension/src/popup/dashboard.js#L1657) reads the bare global `TITLE_TRUNCATE_LENGTH`, which is only ever assigned by [`constants.js:134`](../extension/src/constants.js#L134), a script the manifest injects **only into youtube.com** ([`manifest.json` `content_scripts`](../extension/manifest.json)). The dashboard page loads `dashboard.entry.js` → `constants.module.js`, which doesn't export it, and `vite.config.mjs` has no `define`. Any user with ≥1 titled bookmark hits a `ReferenceError` inside `buildCreateForm()`, so the Reminders view stops after its header. | ❌ see §13 |

## 7. Groups

| Capability | Web | Extension | Status |
|---|---|---|---|
| Create a named group | [`GroupsContent.tsx:48-53`](../webapp/app/dashboard/groups/GroupsContent.tsx#L48), [`:86-129`](../webapp/app/dashboard/groups/GroupsContent.tsx#L86) | [`:1284-1289`](../extension/src/popup/dashboard.js#L1284) | ✅ |
| Rename | [`:63-67`](../webapp/app/dashboard/groups/GroupsContent.tsx#L63) (`prompt`) | [`:1347-1367`](../extension/src/popup/dashboard.js#L1347) (inline `contentEditable`) | ✅ |
| Delete | [`:55-58`](../webapp/app/dashboard/groups/GroupsContent.tsx#L55) | [`:1370-1374`](../extension/src/popup/dashboard.js#L1370) | ✅ |
| Reorder up / down, persisted | [`:69-71`](../webapp/app/dashboard/groups/GroupsContent.tsx#L69) → `reorderGroup`, needs `groups.position` | [`:1377-1392`](../extension/src/popup/dashboard.js#L1377) (array swap in `chrome.storage.sync`) | ⚠️ web depends on [`migrations/015_groups_position.sql`](../webapp/migrations/015_groups_position.sql); until it's applied, [`groups/page.tsx:45-52`](../webapp/app/dashboard/groups/page.tsx#L45) falls back to `created_at` order and reorder silently no-ops |
| Add a video to a group | [`:202-228`](../webapp/app/dashboard/groups/GroupsContent.tsx#L202) + [`GroupPickerModal`](../webapp/app/dashboard/_components/GroupPickerModal.tsx) | [`:1217-1221`](../extension/src/popup/dashboard.js#L1217) | ✅ |
| Remove a video from a group | [`:180-187`](../webapp/app/dashboard/groups/GroupsContent.tsx#L180) (custom groups only) | [`:1395-1400`](../extension/src/popup/dashboard.js#L1395), plus un-checking in the picker | ✅ |
| Inline "new group" inside the picker | [`GroupPickerModal.tsx:37-51`](../webapp/app/dashboard/_components/GroupPickerModal.tsx#L37) | [`:1223-1233`](../extension/src/popup/dashboard.js#L1223) | ✅ |
| Picker shows **which groups this video is already in**, toggleable | ❌ single-select "add to one group" ([`GroupPickerModal.tsx:88-107`](../webapp/app/dashboard/_components/GroupPickerModal.tsx#L88)) | ✅ checkboxes pre-checked from `videoIds` ([`:1200-1204`](../extension/src/popup/dashboard.js#L1200)) | ❌ web can't see or revoke membership from the card |
| Auto / tag-derived groups, read-only | "All Tags" incl. `Untagged` ([`page.tsx:73-87`](../webapp/app/dashboard/groups/page.tsx#L73)) | "Auto Groups" incl. `untagged` ([`:1405-1459`](../extension/src/popup/dashboard.js#L1405)) | ✅ |
| Persisted "Smart (Tag Based)" group type | [`GroupsContent.tsx:88-103`](../webapp/app/dashboard/groups/GroupsContent.tsx#L88), [`page.tsx:59-63`](../webapp/app/dashboard/groups/page.tsx#L59) | — | ⚠️ web-only; shares the `groups` table and existing user rows, kept deliberately (see PR #76) |
| Group video card click target | `/dashboard?v=…` ([`:188`](../webapp/app/dashboard/groups/GroupsContent.tsx#L188)) — param is never read | YouTube ([`:1322-1326`](../extension/src/popup/dashboard.js#L1322)) | ❌ dead link, see §5 |
| "No groups yet" empty state | — (only a "no bookmarks yet" state) | [`:1295-1304`](../extension/src/popup/dashboard.js#L1295) | ❌ minor |

## 8. Active Recall entry points

| Capability | Web | Extension | Status |
|---|---|---|---|
| Due-for-recall strip (count + per-video chips) | [`:717-764`](../webapp/app/dashboard/_components/DashboardContent.tsx#L717), fed by [`summariseRecallDue`](../webapp/app/dashboard/_utils/recall.ts) | [`renderRecallDueStrip:1512-1550`](../extension/src/popup/dashboard.js#L1512) | ✅ |
| Due-check logic | [`_utils/recall.ts:29`](../webapp/app/dashboard/_utils/recall.ts#L29) | `recall.module.js` | ✅ twin-tested (`recall-parity.test.ts`) |
| Start recall for a *due* video | [`:736`](../webapp/app/dashboard/_components/DashboardContent.tsx#L736) → [`startRecallInExtension`](../webapp/app/dashboard/_utils/extension.ts) → `START_RECALL` bridge; falls back to opening the video | [`startRecallForVideo:1491-1510`](../extension/src/popup/dashboard.js#L1491) | ✅ capability |
| — **Entitlement check on that path** | ✅ via the bridge: [`startRecallFromWebapp`](../extension/src/background/background.js) asks the shared gate before opening a tab or writing a handoff, and returns `review_cap_reached` | ✅ [`startRecallForVideo`](../extension/src/popup/dashboard.js) asks the same gate | ✅ fixed in #96 — one rule, `isRecallStartBlocked` |
| — Free monthly review cap | ✅ enforced in the extension's background worker (the only hop a caller can't skip); the dashboard renders the refusal as an upgrade prompt | ✅ same rule | ✅ |
| Start recall for *any* video, from the card | [`DashboardContent.tsx`](../webapp/app/dashboard/_components/DashboardContent.tsx) — no `isPro` block, by design | [`.vc-revisit-btn` handler](../extension/src/popup/dashboard.js) — shared gate | ✅ symmetric (both cap-gated, neither Pro-only) |
| Grading / quiz UI | — | content script, needs the player | ⚠️ intentional |

## 9. Analytics

| Capability | Web | Extension | Status |
|---|---|---|---|
| Pro gate with upgrade CTA | [`analytics/page.tsx:24-49`](../webapp/app/dashboard/analytics/page.tsx#L24) (server-side) | [`renderAnalyticsView:602-613`](../extension/src/popup/dashboard.js#L602) (client-side) | ✅ |
| 14-day activity heatmap | [`:78-91`](../webapp/app/dashboard/analytics/page.tsx#L78) | [`:629-649`](../extension/src/popup/dashboard.js#L629) | ✅ |
| Tag breakdown: count + bar + per-tag video count | [`:93-108`](../webapp/app/dashboard/analytics/page.tsx#L93) | [`:617-627`](../extension/src/popup/dashboard.js#L617), [`:662-675`](../extension/src/popup/dashboard.js#L662) | ✅ |
| Number of tags shown | top 20 (`.slice(0, 20)`, [`:108`](../webapp/app/dashboard/analytics/page.tsx#L108)) | all | ⚠️ minor |
| Empty state | whole-page "No data yet" ([`:62-76`](../webapp/app/dashboard/analytics/page.tsx#L62)) | tag-section-only note ([`:660`](../extension/src/popup/dashboard.js#L660)) | ✅ |

## 10. Exports & import

| Format | Web | Extension | Status |
|---|---|---|---|
| JSON (free) | [`:113-120`](../webapp/app/dashboard/_components/DashboardContent.tsx#L113) | [`:978-980`](../extension/src/popup/dashboard.js#L978) | ✅ |
| CSV (free) | [`:122-139`](../webapp/app/dashboard/_components/DashboardContent.tsx#L122) | [`:982-993`](../extension/src/popup/dashboard.js#L982) | ✅ same columns incl. Notes |
| Markdown (free) | [`:141-155`](../webapp/app/dashboard/_components/DashboardContent.tsx#L141) | [`:995-1015`](../extension/src/popup/dashboard.js#L995) | ✅ |
| Anki TSV, 1 free/month then Pro | [`:564-579`](../webapp/app/dashboard/_components/DashboardContent.tsx#L564) + [`_utils/usage-caps.ts`](../webapp/app/dashboard/_utils/usage-caps.ts) | [`exportAnki:1060-1082`](../extension/src/popup/dashboard.js#L1060) + `usage-caps.module.js` | ✅ twin-tested |
| Obsidian (Pro) | [`:164-178`](../webapp/app/dashboard/_components/DashboardContent.tsx#L164) | [`:1017-1038`](../extension/src/popup/dashboard.js#L1017) | ✅ |
| Notion CSV (Pro) | [`:181-197`](../webapp/app/dashboard/_components/DashboardContent.tsx#L181) | [`:1040-1058`](../extension/src/popup/dashboard.js#L1040) | ✅ |
| Reading List (Pro) | [`:200-212`](../webapp/app/dashboard/_components/DashboardContent.tsx#L200) | [`:1084-1102`](../extension/src/popup/dashboard.js#L1084) | ✅ |
| Extended Notes included in exports | ✅ | ✅ | ✅ |
| Pro-refusal UX | inline toast ([`:588-591`](../webapp/app/dashboard/_components/DashboardContent.tsx#L588)) | `showUpgradeModal` ([`:1019`](../extension/src/popup/dashboard.js#L1019)) | ⚠️ cosmetic |
| Import JSON | expects `[{ videoId, bookmarks: [...] }]` ([`:428-447`](../webapp/app/dashboard/_components/DashboardContent.tsx#L428)) | expects a **flat** `[bookmark, …]` array ([`importBookmarks:1105-1143`](../extension/src/popup/dashboard.js#L1105)) | ❌ **the two export formats aren't cross-importable** — each side round-trips itself, but an extension export dropped into the web importer yields "No valid bookmarks found", and a web export dropped into the extension is filtered out by its `b.timestamp != null` check and reports "No new bookmarks to import" |

## 11. Shared collections & Videos view

| Capability | Web | Extension | Status |
|---|---|---|---|
| List shared collections (title, views, bookmark count) | [`shared/page.tsx:48-86`](../webapp/app/dashboard/shared/page.tsx#L48) | [`renderSharedView:2084-2170`](../extension/src/popup/dashboard.js#L2084) | ✅ |
| Copy share link / open | [`:73-80`](../webapp/app/dashboard/shared/page.tsx#L73) | [`:2153-2154`](../extension/src/popup/dashboard.js#L2153) | ✅ |
| "Private Collections" (not yet shared) section | [`:88-124`](../webapp/app/dashboard/shared/page.tsx#L88) | — | ⚠️ web extra over the same data |
| Create a share from the dashboard | [`ShareCollectionButton`](../webapp/app/dashboard/videos/ShareCollectionButton.tsx) on `/dashboard/videos` | — (sharing starts from the on-page popup) | ⚠️ web extra |
| Videos grid: thumbnail, count, tags, relative time | [`VideosClient.tsx:61-116`](../webapp/app/dashboard/videos/VideosClient.tsx#L61) | [`:2043-2078`](../extension/src/popup/dashboard.js#L2043) | ✅ |
| Card click behaviour | opens YouTube ([`:64-69`](../webapp/app/dashboard/videos/VideosClient.tsx#L64)) | filters the library to that video ([`:2068-2075`](../extension/src/popup/dashboard.js#L2068)) | ⚠️ different model (and see §5 — web has no filtered view to go to) |
| Tag filter bar | [`:35-53`](../webapp/app/dashboard/videos/VideosClient.tsx#L35) | — | ⚠️ web extra |
| Sort select | [`VideosSortSelect`](../webapp/app/dashboard/videos/VideosSortSelect.tsx) | — | ⚠️ web extra |
| Per-card share / copy link / add-to-group | [`:101-111`](../webapp/app/dashboard/videos/VideosClient.tsx#L101) | — | ⚠️ web extra |
| Clip time-range on the card | [`page.tsx:65-67`](../webapp/app/dashboard/videos/page.tsx#L65) | — | ⚠️ web extra |

## 12. Styling defect on the web side

`DashboardContent.tsx` references fourteen `toolbarStyles.*` keys that are not
defined in [`toolbar.module.css`](../webapp/app/dashboard/_components/toolbar.module.css)
or anywhere else under `webapp/app`:

```
actionBtn  actionBtnDanger  bookmarkActions  threadItemHover  threadItemSelected
checkbox   bulkBar  bulkCount  bulkDeleteBtn  bulkCancelBtn
copyToast  pendingBar  entryCardHover  entrySelected
```

CSS Modules resolve unknown keys to `undefined`, so in production the
per-bookmark action row, the selection checkboxes, the bulk-delete bar, the
copy/upgrade toast and the pending indicator all render with **no class at
all**. This was first noted during PR #76 (Iteration 5) as out of scope and
survived the #93 restyle; it is the reason several rows in §2 read "❌" even
though the underlying behaviour is present. Counted once, here, rather than
per affected row. ❌

## 13. Biggest real gaps, ranked

1. ~~**Extension Reminders create form throws before rendering.**~~
   **FIXED in #96** (`5410d51`), before this doc's own audit base shipped —
   both items 1 and 2 below were repaired by that PR, and this section was left
   stale. Anyone re-auditing from this file rather than from source will
   re-report them; they are no longer live. For the record: `dashboard.js` read
   a bare `TITLE_TRUNCATE_LENGTH` that only the youtube.com content script
   defines. It now imports the value from `constants.module.js`, and
   `extension/scripts/page-globals-guard.mjs` — the page-script mirror of
   `content-globals-guard.mjs`, whose absence is what let this ship — fails the
   build if any page chunk reads a content-script-only global. That guard runs
   on every PR (`ci-design-conformance` and `ci-extension-smoke` both do a
   production `ext-build`), and `tests/dashboard-reminders-packaged.spec.ts`
   asserts the form renders against the packaged artifact.
2. ~~**Active Recall started from the web has no entitlement check.**~~
   **FIXED in #96.** Note the framing here was also wrong on the product rule:
   Active Recall is *not* Pro-only. The pricing page sells it as free up to 25
   enrolled cards and 30 reviews a month, unlimited on Pro, so the correct gate
   is the monthly review cap, not `is_pro` — and there is no server-side
   boundary to hang one on, because a recall session is a `chrome.runtime`
   message from the page to the extension and never touches an API route. The
   rule now lives in one function, `isRecallStartBlocked`
   (`usage-caps.module.js`), which `startRecallFromWebapp` asks before opening
   a tab or writing a handoff — the background worker being the only hop a
   caller cannot skip. `tests/recall-bridge.spec.ts` covers a capped free user
   (refused, no tab opened), a free user under the cap, and a Pro user past the
   counter. The web dashboard's per-card button correspondingly dropped its
   `isPro` block, which had been stricter than the extension.
   *A fifth entry point was missed by #96 and is fixed separately: the*
   *extension dashboard's own `.vc-revisit-btn` kept a bare `checkPro()`*
   *hard-block, paywalling a free-tier feature. `tests/unit/recall-gate-coverage.test.mjs`*
   *now asserts every recall-start site consults the shared gate.*
3. **A–B loop ranges only render in one of five web render sites** (§4). Loops
   are the newest headline feature; on the web they're mostly indistinguishable
   from ordinary bookmarks. The helper already exists and is twin-tested — this
   is four one-line changes. **Web needs to catch up.**
4. **The web scrubber is decorative.** Markers are spaced by array index
   ([`:833`](../webapp/app/dashboard/_components/DashboardContent.tsx#L833)),
   not by position in the video, so it silently misrepresents where clips sit.
   The extension positions by `timestamp / duration` and labels both ends.
   The web has no `videoDurations` equivalent, so closing this properly means
   persisting duration alongside bookmarks. **Web needs to catch up.**
5. **Fourteen undefined CSS-module classes on the web** (§12) leave the bulk
   bar, toasts and every per-bookmark action button unstyled in production.
   **Web needs to catch up.**
6. **Exports aren't cross-importable** (§10). Two different JSON shapes for the
   same "export/import your bookmarks" feature; a user moving between surfaces
   gets a confusing "no valid bookmarks" either way. **Either surface can
   lead** — the smaller change is teaching each importer to accept both shapes.
7. **Group membership is invisible from a web bookmark card** (§7). The
   extension's picker shows and toggles every group a video belongs to; the web
   modal only ever adds to one, and removal is only possible on
   `/dashboard/groups`. **Web needs to catch up.**
8. **`/dashboard?v=…` is a dead parameter** (§5, §7). The Groups page links
   every video thumbnail to it and nothing reads it, so the click lands on an
   unfiltered dashboard. Either implement the drilldown (restoring the
   extension's Videos-card behaviour) or point the links at YouTube.
   **Web needs to catch up.**
9. **No "Revisit ↗" on a due reminder card on the web** (§6) — the extension
   gives a due reminder a one-click path to the video; the web makes you find
   it. **Web needs to catch up.**

## 14. Deliberate divergences worth keeping (summary)

- **Auth model** — Supabase session vs. OAuth-handoff token in
  `chrome.storage.sync`; the extension additionally needs a manual cloud-sync
  button and a throttled `/api/me` entitlement refresh.
- **Header search** — web navigates on submit rather than live-syncing, to
  avoid a Supabase refetch per keystroke.
- **Saved searches storage** — `chrome.storage.sync` (cross-device) vs.
  `localStorage` (per-browser).
- **Player-bound features** — loop creation/playback and Active Recall grading
  live only in the content script; the web reports state and hands off.
- **Reminders Pro gating** — web blocks the page server-side, the extension
  lets the form render and fails at the API. Web's behaviour is better; this is
  a divergence, not a gap.
- **Referral / affiliate dashboard pages** — parked on
  `feature/dashboard-extras-hold`, absent from both surfaces. The public
  marketing page `webapp/app/(marketing)/affiliate/` still exists.
- **Web-only conveniences** — Videos-view tag filter and sort, per-card
  share/copy/add-to-group, share creation, the "Private Collections" section,
  the persisted "Smart (Tag Based)" group type, timeline bulk-select and
  timeline Extended Notes.

---

*Method: every row was read off the code on `b4fb4db` — the full 2 639 lines of
`extension/src/popup/dashboard.js` and `dashboard.html`, and every file under
`webapp/app/dashboard/`. No row was carried over from the PR #76 version
without re-checking; several ("content preview panel missing", "recall cap
asymmetry") were wrong by the time this pass ran. Nothing was verified in a
running browser — both dashboards are auth-gated and the extension one needs a
packaged build — so the two runtime claims (§13 items 1 and 2) are derived from
source and marked as such.*

*Addendum (2026-08-13): both of those source-derived claims were checked against
a running packaged build and are fixed — see the staleness warning at the top.
The lesson worth keeping is the one the method note half-anticipated: an
unverified source-derived claim in a dated audit reads as a live bug forever.
Both were re-reported as P1s from this file after they had been fixed. Rows
marked ❌ here are claims about `b4fb4db`, not about `main`.*
