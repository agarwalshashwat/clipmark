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
| Analytics | ✅ Pro-gated | 🟡 `/dashboard/analytics` — **not Pro-gated**, free for everyone | ❌ gap |
| Shared (read-only list) | ✅ `#subnav-shared-side`, list only | ✅ `/dashboard/shared` | ✅ |
| Referral ("Refer & Earn") | ❌ not present | ➕ `/dashboard/referral` | ➕ extra |
| Affiliate program | ❌ not present | ➕ `/dashboard/affiliate` | ➕ extra |
| Sidebar collapse (persisted) | ✅ | ✅ | ✅ |
| Mobile bottom nav (Bookmarks/Reminders/Groups/Pro) | ✅ | ✅ | ✅ |
| Header search box | ✅ synced w/ toolbar search, filters live | ❌ `DashboardChrome` renders an `<input>` with no `value`/`onChange` — does nothing | ❌ dead UI |
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
| Per-bookmark: **Extended Notes (Pro)** — textarea, autosave, saved indicator | ✅ | ❌ not present | ❌ gap |
| Bulk-select checkboxes + bulk delete | ✅ | ✅ | ✅ |
| Collapse/expand after N bookmarks | ✅ (3) | ✅ (4) | ✅ (threshold differs, not a capability gap) |
| Pill row of all timestamps | ✅ | ✅ | ✅ |
| "Group" button (add to group) | ✅ floating picker w/ multi-checkbox + inline create-new-group | 🟡 modal, single-select add only, no create-new-group inline, no remove/checkbox-toggle | 🟡 gap |
| "Recall" button (start Active Recall for this video, any time) | ✅ always visible on every card, Pro-gated w/ free-review-cap check | ❌ only surfaced for videos that are *already due*, in the due-strip banner — no always-available per-card trigger | ❌ gap |
| Featured-card highlighting | ✅ (most-bookmarked video) | ❌ not present | 🟡 cosmetic, low priority |
| Card size toggle (L/M/S) | ✅ | ✅ | ✅ |

## 3. Active Recall / due queue

| Capability | Extension | Web | Status |
|---|---|---|---|
| Due-strip banner (count + per-video chips + start button) | ✅ | ✅ | ✅ |
| Start recall for a *due* video | ✅ opens YT tab w/ pendingRevision | ✅ via extension bridge (`_utils/extension.ts`) when available, else opens the video | ✅ |
| Start recall for *any* video (not just due) | ✅ per-card "Recall" button | ❌ | ❌ gap (see §2) |
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
| Obsidian (.md) | ✅ Pro | ❌ not present | ❌ gap |
| Notion CSV | ✅ Pro | ❌ not present | ❌ gap |
| Reading List (.txt) | ✅ Pro | ❌ not present | ❌ gap |
| Import JSON | ✅ | ✅ | ✅ |

## 6. Analytics

| Capability | Extension | Web | Status |
|---|---|---|---|
| Pro gating | ✅ shows upgrade CTA for free users | ❌ **no gating at all — page is free for every signed-in user** | ❌ gap (also a monetization-integrity issue) |
| 14-day activity heatmap | ✅ | ✅ | ✅ |
| Tag breakdown (count + bar) | ✅ + video count per tag | 🟡 count + bar, no per-tag video count | 🟡 minor gap |
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
