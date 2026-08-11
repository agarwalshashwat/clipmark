# Cloud Sync Engine — Design & Decisions on Record

**Status:** Phase 10a **implemented** on this branch — the sync half of ROADMAP
Phase 10. The analytics half (`video_analytics`, `/dashboard/insights`,
heatmaps) is deliberately untouched; see §8.
**Scope of this doc:** the defects the old sync had, the design that replaced
it, every decision with the alternatives it beat, and the contracts a future
reader must not "helpfully" undo.

The old cloud sync worked for exactly one device. Three separate copies of
push/pull logic lived in the side panel and extension dashboard, deletions
resurrected on every pull, concurrent edits silently dropped whichever device
lost the race, offline writes vanished, and none of it was visible to the user.
This branch replaces all of it with one engine in the background service
worker.

---

## 1. The defects this fixes

1. **Deletions resurrected.** The pull path unioned any cloud bookmark whose
   `id` was missing locally back *into* local state. Deleting on device A meant
   the bookmark came back on A's next read and never left device B. Nothing in
   the data model could say "this was deleted."
2. **`updated_at` was fetched and ignored.** "Server timestamp wins" was
   documented and implemented nowhere; the last PUT won, whole-array.
3. **Failed writes were discarded.** A PUT that failed (offline, expired
   token, blip) was caught and dropped — the edit never reached the server.
4. **Three drifting copies of the logic**, none in the worker — so nothing
   synced while a panel wasn't open, and context-menu / keyboard-shortcut
   saves (which happen *in* the worker) never synced at all.
5. **No backfill** — bookmarks predating a Pro upgrade never uploaded.
6. **No visibility** — no surface reported synced/pending/failing.

---

## 2. The data model

### 2.1 Wire format: the per-video JSONB array, extended

`public.user_bookmarks` keeps its shape: one row per (user, video), one JSONB
array per row. Two extensions, both inside the JSON:

- Live bookmarks may carry **`updatedAt`** (ISO string) — stamped by whichever
  side last mutated the entry.
- **Tombstones**: `{ id, deleted: true, deletedAt }`, nothing else — no
  `timestamp`, no `loop` (the PUT handler 400s a tombstone carrying either).
  A deletion is an event; the tombstone is how other devices learn it
  happened instead of resurrecting the bookmark.

One schema change (migration `018_user_bookmarks_revision.sql`): a
**`revision BIGINT NOT NULL DEFAULT 1`** column, bumped by one on every write,
used for optimistic concurrency (§4). Existing rows backfill to 1 via the
default and keep working untouched.

**Rejected: per-bookmark rows.** A `user_bookmark_items` table is the
textbook shape, but migrating would have rewritten the 016 RLS policies, the
loop-field validation, `/api/share`'s payload handling, and the webapp
dashboard's reads — all of which assume the blob — while the blob plus
per-bookmark LWW already yields correct convergence. The migration cost bought
nothing this phase needs. §8 notes what was left room for.

**Rejected: a separate change-log / oplog table.** Correct but heavy: new
table, new RLS (with the same lapsed-user reasoning re-derived), compaction
policy, and a second source of truth to reconcile. Tombstones-in-blob get the
same convergence with zero new attack surface.

**Rejected: per-video monotonic revision as the *merge* unit.** A revision
alone can detect conflict but not resolve it below whole-array granularity —
it would have re-created defect #2 one level up. Revision is used for
*concurrency control* only; *resolution* is per-bookmark (§4).

### 2.2 Local model: tombstones never enter the UI's data

Locally, `bm_<videoId>` in `chrome.storage.sync` holds **live bookmarks
only**. The engine keeps its own per-video tombstone ledger (plus the outbox
and per-video revision bookkeeping) under `clipmarkSync` in
`chrome.storage.local`. Wire ↔ local conversion happens only at the sync
boundary (`toWire`/`splitWire` in `sync-core.module.js`).

This is load-bearing, not cosmetic: every renderer, counter, recall queue,
Anki export and marker painter iterates `bm_*` arrays. Tombstones inside them
would have required a `liveBookmarks()` filter at every site — including a new
content-script bare global and therefore a new twin file pair. Keeping the
ledger out of `bm_*` means **no UI surface needed to change and none can
regress by forgetting a filter**. `chrome.storage.local` is also the right
durability class: the ledger is device-local state about what *this device*
knows, and local storage doesn't ride Chrome's own profile sync or its 8 KB
per-item quota.

Consequence to keep in mind: the webapp dashboard reads the JSONB directly, so
*its* read sites do filter (`webapp/lib/bookmarks.ts` → `liveBookmarks()`),
and its write actions must tombstone rather than drop (§5).

### 2.3 Tombstone GC

Tombstones older than **30 days** (`TOMBSTONE_TTL_MS`) are dropped from
outgoing wire arrays and from the ledger. By then every device that syncs at
all has seen the deletion; a device offline longer than that re-uploads at
worst a bookmark the user deleted a month ago, which merge then propagates as
a (re-)deletion the next time any device that knew about it syncs — and if
none do, the cost is one stale bookmark, not corrupted state.

---

## 3. Conflict resolution contract

**Per-bookmark last-write-wins.** Identity is `id` (which is `Date.now()` at
creation — it doubles as the sort key, which is why identity and mutable
content had to be separated in the first place). Freshness is
`updatedAt || deletedAt || createdAt || id` — the fallbacks mean pre-sync-v2
data with no stamps still orders correctly, because the id itself is a
millisecond timestamp.

Ties break deterministically: **tombstone beats live** (deletion wins), then a
stable-stringify comparison. Merge is therefore commutative — two devices
merging in either order converge on identical arrays (unit-tested property).

Two consequences that are *contract*, not accident:

- **An edit newer than a deletion resurrects the bookmark.** Device A deletes
  at t₁, device B edits the same bookmark at t₂ > t₁ → the edit wins
  everywhere. Most-recent-intent-wins is the only rule a user can predict.
- **"Server timestamp wins" (the roadmap's line) is implemented as
  server-arbitrated revisions, not wall clocks.** Only stamps *within* a
  bookmark compare against each other; whole-state conflicts are decided by
  the revision CAS (§4), which no client clock can skew.

## 4. Optimistic concurrency (the revision CAS)

`PUT /api/bookmarks` carries `baseRevision` — the revision the client last
saw. The handler updates with `... AND revision = baseRevision`; a stale write
matches zero rows and gets **409** with the server's current wire array and
revision. The engine merges that into local state and retries from the new
base (bounded, then back to the outbox). `baseRevision: 0` means "creating
this row"; a duplicate-key race also 409s. So a write can only ever land on
top of state its writer actually saw — defect #2 is structurally gone, not
patched.

Why a counter instead of comparing `updated_at`: integer equality survives the
Postgres → PostgREST → JSON → client round-trip exactly; timestamptz
microsecond formatting does not reliably.

**Legacy path kept on purpose:** a PUT *without* `baseRevision` (shipped
clients ≤ 1.0.4) still blind-upserts, but bumps the revision so engine clients
detect the write. Symmetrically, GET hides tombstones unless
`includeDeleted=1` (only the engine asks), because legacy clients union
whatever they receive into local state and would render tombstones as broken
bookmarks. Do not remove either until the Web Store fleet has moved past
1.0.4.

---

## 5. Who writes, and what every writer owes

The invariant all writers keep: **deletion writes a tombstone (the row is
kept even when only tombstones remain), mutation stamps `updatedAt`, and
every server write bumps `revision`.**

- **Extension surfaces** (side panel, dashboard, content script, worker's own
  context-menu/keyboard saves): owe nothing. They write plain live arrays to
  `chrome.storage.sync` exactly as before; the engine observes the write,
  diffs old → new, stamps changed entries, converts vanished ids into ledger
  tombstones, and enqueues the push. This is why the observer design was
  chosen over "each write site calls the engine": write sites (including
  future ones) cannot forget to participate. The engine recognises its own
  writes echoing back through `storage.onChanged` by recording a hash of every
  array it writes (`videos[vid].appliedHash`, persisted so it survives worker
  restarts).
- **Webapp server actions** (`dashboard/actions.ts`: delete, bulk delete,
  notes, import): write the table directly, so they carry the invariant
  themselves — tombstone instead of drop, keep the row, stamp `updatedAt` on
  edits, `revision + 1` on every write. The old "delete the row when the last
  bookmark goes" branch is gone *because* it erased the deletion record.
- **`/api/bookmarks` PUT**: validates tombstone shape, keeps loop validation,
  bumps revision on all paths.

## 6. The engine

`extension/src/sync/sync-engine.js`, initialised at worker evaluation
(`initSyncEngine()` in `background.js` — MV3 requires listener registration
synchronously at startup). All merge/queue/status *decisions* are pure
functions in `sync-core.module.js` (unit-tested, no `chrome.*`); the engine is
plumbing. There is deliberately **no classic-script twin**: no content script
consumes sync logic as a bare global, so the twin-file convention doesn't
apply (the content script never talks to the network — the engine observes
its storage writes like everyone else's).

- **Outbox** (`clipmarkSync.queue`, `chrome.storage.local`): per-video entries
  `{attempts, nextAttemptAt}` — durable across the MV3 ~5-min worker
  eviction that in-memory queues do not survive. Whole-array-per-video pushes
  make coalescing free: N edits to one video are one queue entry.
- **Backoff**: 30s → 1m → 2m → 5m → 15m → 30m cap, scheduled with
  `chrome.alarms` (respects the 30s alarm floor). A network-class failure
  stops the current drain pass; auth failures wait for the next trigger.
- **Cadence — hybrid, not the roadmap's 30s poll.** Pushes are event-driven
  (storage change → debounced drain). Pulls happen on worker startup when
  stale, on sign-in, on panel-opens-a-video (`SYNC_PULL_VIDEO`), on the manual
  button (`SYNC_NOW`), and on a 5-minute alarm. A 30s poll would wake the
  worker ~2,880×/day to usually discover nothing, for a product whose
  cross-device staleness tolerance is minutes; every high-intent moment
  already triggers a pull. If real-time ever matters, the upgrade path is
  server push (Supabase Realtime), not a faster poll.
- **First contact rule:** a video with no locally-known revision is always
  pulled-and-merged before its first push. This is what makes the **backfill**
  (and every "new device" case) non-destructive and idempotent: backfill is
  nothing but "enqueue every local video through the normal path", once per
  account (`backfillDoneFor`, storage.local — the flag marks *scheduled*; the
  durable outbox guarantees completion).
- **403 handling**: any `pro_required` flips the cached `bmUser.isPro` to
  false (same behaviour the panels had); the queue is kept, not dropped — a
  lapsed-then-renewed subscriber's offline edits still land.

### 6.1 Messaging contract (worker ↔ UI surfaces)

| Message | Direction | Payload → response |
|---|---|---|
| `SYNC_STATUS_GET` | page → worker | → `{state, pendingCount, lastSyncAt, lastError}` |
| `SYNC_NOW` | page → worker | full pull + drain → `{ok, changedCount, status}` |
| `SYNC_PULL_VIDEO` | page → worker | `{videoId}` → `{ok, changed}` |
| `SYNC_STATUS_CHANGED` | worker → all pages | broadcast `{status}` on every state change |

`state` is one of `synced / pending / offline / error / disabled`
(`deriveSyncStatus`) — `disabled` = signed out or free plan, and the side
panel chip hides entirely rather than showing a guess. The chip renders
exclusively from these messages; it holds no logic of its own.

## 7. What a future reader must not undo

- **Don't "simplify" dashboard actions back to `filter()` + row-delete.**
  Dropping an entry (or the row) erases the deletion record; devices holding
  the bookmark will resurrect it. This was defect #1.
- **Don't make GET return tombstones by default** (legacy clients render
  them) and **don't strip the legacy PUT path** until the fleet is past 1.0.4.
- **Don't add fetch calls to `/api/bookmarks` in any UI surface.** Three
  drifting copies is how the old system rotted. The engine is the only
  network owner; surfaces write storage and send messages.
- **Don't weaken SELECT/DELETE RLS to Pro-gated, and don't Pro-gate them "for
  consistency".** A lapsed subscriber must always be able to read and delete
  their own data (016's header explains; `rls-user-bookmarks.test.ts` enforces
  — including that a lapsed user's UPDATE stays a 0-row no-op).
- **Don't skip the revision bump in any new server-side writer.** A write
  that doesn't bump lets a syncing device CAS over it silently.
- **Don't move the tombstone ledger into `bm_*` arrays or storage.sync** —
  quota, Chrome-profile-sync interference, and every UI surface would
  suddenly need filtering.
- **Don't null out `appliedHash` bookkeeping.** Without echo detection the
  engine re-stamps its own merge writes and ping-pongs pushes.

## 8. Out of scope, and room left for it

The analytics half of Phase 10 (`video_analytics`, `user_video_sessions`,
`/dashboard/insights`, heatmaps, tag co-occurrence) is not built and nothing
here blocks it. Deliberate room: `revision` gives analytics a cheap change
cursor ("what changed since I last aggregated"); per-bookmark `updatedAt`
gives real mutation recency (the row-level `updated_at` was always
whole-array); tombstones let usage analysis distinguish "deleted" from "never
existed". `webapp/app/dashboard/analytics/` was left untouched per the phase
decree.

A **two-profile cross-device Playwright spec was considered and not
committed**: it needs two persistent Chrome contexts, a running local webapp,
the local Supabase stack and minted Pro sessions in one job, and Playwright
cannot intercept service-worker fetches without experimental flags — every
deterministic version found was a flaky version. The cross-device semantics
are instead pinned where they're deterministic: merge convergence at the unit
layer, CAS/tombstone round-trips at the integration layer, and the packaged
artifact exercised end-to-end (engine wiring, stamping, tombstoning, offline
queue + backoff, status chip) via a scripted `extension/dist` run under
Playwright. If a cross-device E2E is attempted later, start from the §6
first-contact rule and mock at the local-webapp layer, not the SW fetch layer.

## 9. Where everything lives

| Piece | Path |
|---|---|
| Pure sync core (merge/tombstones/backoff/status) | `extension/src/sync/sync-core.module.js` |
| Engine (worker plumbing) | `extension/src/sync/sync-engine.js` |
| Shared token refresh | `extension/src/auth-token.module.js` |
| Status chip | `side-panel.html` / `side-panel.css` / `side-panel.js` (`initSyncStatus`) |
| Server handler (CAS, tombstone validation, includeDeleted) | `webapp/app/api/bookmarks/handler.ts` |
| Webapp tombstone helpers | `webapp/lib/bookmarks.ts` |
| Migration | `webapp/migrations/018_user_bookmarks_revision.sql` |
| Unit tests | `tests/unit/sync-core.test.mjs`, `webapp/tests/unit/bookmarks-revision.test.ts`, `bookmarks-live-filter.test.ts` |
| Integration tests | `webapp/tests/integration/sync-revision.test.ts`, `rls-user-bookmarks.test.ts` |
