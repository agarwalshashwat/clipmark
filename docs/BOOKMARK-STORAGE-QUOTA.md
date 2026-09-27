# Bookmark storage quota — root cause and migration plan

**Status: PLAN ONLY. No extension code changed in this PR.**

I stopped short of implementing, per the standing instruction to report rather
than ship when the correct fix is architectural and interacts with Pro cloud
sync. Both conditions hold — see §4. Investigated against `origin/main` @
`0518936`, 2026-08-17.

---

## 1. Root cause, with numbers

Bookmarks live in `chrome.storage.sync` under `bm_{videoId}` keys, one key per
video holding an array. A typical bookmark serialises to **353 bytes**:

```json
{"id":1755300000000,"videoId":"aircAruvnKk","timestamp":754.312,
 "description":"Gradient descent intuition and the cost surface",
 "tags":["important","review"],"color":"#14b8a6",
 "createdAt":"2026-08-17T04:00:00.000Z",
 "videoTitle":"But what is a neural network? | Deep learning chapter 1",
 "reviewSchedule":[1,3,7],"lastReviewed":null}
```

`chrome.storage.sync` enforces two separate caps — `QUOTA_BYTES` = **102,400**
total and `QUOTA_BYTES_PER_ITEM` = **8,192** per key:

| Limit | Bites at | Notes |
|---|---|---|
| `QUOTA_BYTES_PER_ITEM` on **`videoTitles`** | **~113 distinct videos** | ⚠️ **the first cliff** |
| `QUOTA_BYTES_PER_ITEM` on one `bm_{videoId}` | ~23 bookmarks **on a single video** | a lecture binge hits this |
| `QUOTA_BYTES` total | ~290 bookmarks across all videos | later than both above |

### 1a. The first thing to break is not the bookmarks — it's `videoTitles`

This is the finding that changes the priority. `videoTitles` is a **single
key holding every video's title**, growing ~72 bytes per distinct video and
never pruned. It crosses the 8,192-per-item ceiling at roughly **113 distinct
videos** — well before the total quota, and well before most users would
consider themselves "heavy".

It is worse than an isolated failure, because of how saves are written.
`background.js:322` writes the bookmark array **and** the co-tenant maps in one
call:

```js
chrome.storage.sync.set({ [bmKey(videoId)]: bookmarks, videoDurations, videoTitles }, ...)
```

So once `videoTitles` alone exceeds the per-item cap, **that entire `set`
fails — and with it the bookmark save**, even though the bookmark array itself
is nowhere near any limit. A user who has merely *watched* ~113 videos loses the
ability to save a bookmark on video #114. `videoDurations` has the same shape
with a smaller per-entry cost.

**Consequence:** this is the same failed-write class as the tour bug, but with
real user data instead of a UI flag.

### 1b. There is no storage abstraction

`chrome.storage.sync` is called **directly from six files** —
`background/background.js`, `content/content.js`, `popup/side-panel.js`,
`popup/dashboard.js`, `idle-summary.js`, `content/tour.js`. There is no
`storage.js` seam. Any change of storage area is a six-file change, which is a
large part of why this is not a small fix.

---

## 2. The free/Pro contradiction (read before choosing an option)

The pricing page is explicit:

- `upgrade/page.tsx:17` — *"Free covers unlimited **local** bookmarks…; Pro adds **cloud sync**"*
- `upgrade/page.tsx:25` — `{ label: 'Cloud Sync across devices', free: false, pro: true }`
- `PlanCards.tsx:40` — "Cloud Sync across devices" listed as a Pro feature
- `page.tsx:850` — "Cloud sync (Pro)"

**But the implementation stores free users' bookmarks in `chrome.storage.sync`,
which Chrome replicates across every device signed into the same profile.** So
free users get de-facto cross-device bookmarks today — the exact capability sold
as Pro-only.

This cuts both ways and needs Ash's call:

- It means moving bookmarks to `chrome.storage.local` **is not a feature
  removal against what we advertise** — it makes the product match its own
  pricing page, and closes an unintended Pro leak.
- It is, however, a **behaviour change for existing free users** who may have
  come to rely on it, even though it was never promised.

---

## 3. Options weighed

### (a) Move to `chrome.storage.local`
**Quota:** `QUOTA_BYTES` = 10,485,760 (10 MB) → **~29,700 bookmarks**, a ~100×
headroom increase. **No `unlimitedStorage` permission needed**, so **no new
Chrome Web Store permission review** — a genuine risk reduction I expected to
have to trade away.
**Cost:** free users lose implicit cross-device sync (see §2). Six-file change.

### (b) Keep sync, handle quota gracefully
Detect `QUOTA_BYTES*` errors, surface a clear message, never loop.
**Verdict: necessary but not sufficient.** It converts silent data loss into an
honest error, which is strictly better — but the user still cannot save a
bookmark. It treats the symptom at a ceiling of ~113 videos.

### (c) Hybrid — `local` as primary store, cloud sync as the Pro layer ✅
Bookmarks live in `chrome.storage.local`; Pro users additionally sync through
the existing `/api/bookmarks` → Supabase `user_bookmarks` path, which is
**already how Pro cloud sync works** (`side-panel.js:250,273`) and is entirely
independent of `chrome.storage.sync`.

**Recommended.** It fixes the quota ceiling, matches the advertised free/Pro
split exactly, requires no new permission, and leaves the Pro sync path
untouched. Option (b)'s error handling should be folded in as a backstop.

---

## 4. Why I stopped instead of shipping

Two blockers, either of which alone justifies a plan-first approach:

**1. Head-on collision with the in-flight sync engine (PR #107).**
`origin/claude/clipmark-sync-engine-011e96` modifies
`background/background.js`, `popup/dashboard.js` and `popup/side-panel.js` —
**the same three files holding most bookmark storage calls** — and adds
`src/sync/sync-core.module.js` + `src/sync/sync-engine.js`. It is a 27-file open
draft that already needs a rebase. Landing a storage-area migration underneath
it would make that rebase substantially harder and put real user data in the
middle of the conflict.

**2. It redefines the free/Pro boundary.** §2 is a product decision, not an
engineering one.

Additionally: no storage seam exists (§1b), so this is a six-file change
touching the persistence of the product's primary user data.

---

## 5. Proposed sequencing

### Step 0 — stop the bleeding (small, safe, shippable now)
Cap the co-tenant maps, which is where the **first** failure occurs and which is
independent of the storage-area question:

- Prune `videoTitles` / `videoDurations` to the N most-recent videos that still
  have bookmarks, or move them to `chrome.storage.local` on their own (they are
  a cache, not user-authored data — losing one costs a re-fetch, not a bookmark).
- **Split the combined write** at `background.js:322` so a failing co-tenant map
  can never take the bookmark save down with it.
- Add explicit `QUOTA_BYTES*` error detection with an honest message (option b).

This alone moves the first cliff from ~113 videos to the real bookmark limits,
and is ~1 file, no product decision, no conflict with #107's shape.

### Step 1 — introduce a storage seam
Add `extension/src/storage.js` (+ `.module.js` twin, per the twin-file rule in
`.claude/CLAUDE.md`) wrapping get/set for bookmarks. **Pure refactor, no
behaviour change**, and it makes step 2 a one-file change. Best landed *after*
#107 to avoid the conflict.

### Step 2 — migrate to `chrome.storage.local` (option c)
Behind the seam. Migration with zero data loss:

1. On startup, if `migrations.bookmarksToLocal` is unset:
2. Read **all** `bm_*` keys from `sync` **and** any already in `local`.
3. Merge per video by bookmark `id` — union, never overwrite. `id` is
   `Date.now()` and duplicates are already rejected on `Math.floor(timestamp)`,
   so the merge is well-defined.
4. Write merged results to `local`; **verify by reading back** and comparing
   counts per key.
5. Only after a verified read-back, set `migrations.bookmarksToLocal = true`.
6. **Do not delete the `sync` copy** in v1.0.8 — leave it as a rollback safety
   net and remove it a release later once telemetry shows the migration landing
   cleanly. Sync data is small; keeping it one release costs nothing.

Idempotent and crash-safe: an interrupted migration re-runs and re-merges, and
because the merge is a union keyed by `id`, re-running cannot duplicate or lose
a bookmark.

### Step 3 — Pro cloud sync unchanged
`/api/bookmarks` continues to be the Pro path. No webapp or migration change.

---

## 6. Tests to write

- **Unit** (`tests/unit/`, runs in `ci-unit`): the merge function — union by
  `id`, no loss when both areas hold data, idempotent on re-run, correct when
  either side is empty.
- **Unit:** quota-error classification — `QUOTA_BYTES` vs `QUOTA_BYTES_PER_ITEM`
  vs unrelated errors.
- **Unit:** co-tenant pruning keeps titles for every video that still has
  bookmarks.
- **Packaged E2E** (`ci-extension-smoke`): save bookmarks, run the migration,
  assert every bookmark is readable from `local` afterwards and the count is
  unchanged. Note from the tour work: **Chrome does not enforce sync
  `QUOTA_BYTES` for an unsigned-in test profile** (verified — filling past
  102,000 bytes still accepted writes), so a *real* quota failure cannot be
  forced in the harness. Test the merge and the error path at unit level; test
  the migration end-to-end.

---

## 7. Release

Whichever steps land need an **extension rebuild and a version bump**. Manifest
is currently at **1.0.7 (never uploaded)** — per the standing decision, if
v1.0.7 still has not shipped when this lands, keep 1.0.7 and rebuild; otherwise
this is **v1.0.8**.

## 8. Decisions needed from Ash

1. **Free users lose implicit cross-device bookmarks.** Matches the pricing page
   (§2) but changes lived behaviour. Accept, or keep sync-for-free and cap it?
2. **Order vs PR #107.** Recommend landing #107 first, then the seam, then the
   migration. Confirm.
3. **Ship Step 0 now?** It is small, conflict-light and removes the ~113-video
   cliff without touching the product question. My recommendation is yes.
