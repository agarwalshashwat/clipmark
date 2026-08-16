# Feature-Usage Analytics — Spec

Status: **spec only. No extension or webapp code, and no migration file, ships with this
document.** Everything below describes work to be built after the open decisions in §0 are
signed off. This touches live users and their privacy, so taxonomy and consent are approved
first, code second.

Scope: privacy-first, self-built feature-usage analytics for the ClipMark Chrome extension,
stored in the Supabase project we already run. No third-party analytics vendor.

Non-goals: per-user behavioural profiles, funnels tied to identity, session replay, anything
that could answer "what did *this* person watch", A/B testing infrastructure, and revenue
attribution. Those are different products with a different privacy bar.

---

## 0. Open decisions for Ash

Nothing gets built until these are answered. Recommendations are mine; the call is Ash's.

| # | Decision | Options | My recommendation |
|---|---|---|---|
| **D1** | **Opt-out or opt-in?** | (a) Opt-out — collection on by default, toggle in settings. (b) Opt-in — off until the user agrees. | **(a) Opt-out**, with a stable install id, prominent disclosure, and DNT/GPC honored. Opt-in realistically yields a 5–20% sample skewed toward power users, which is worse than no data because it looks authoritative and isn't. See §4.3 for the EU caveat that argues the other way — this is a genuine risk trade, not a slam dunk. |
| **D2** | **Any video-level dimension?** | (a) None at all. (b) A coarse non-identifying flag (e.g. `video_duration_bucket`). (c) Hashed `video_id`. | **(a) None.** (c) is not anonymisation — see §1.4 for why hashing a YouTube video id fails. (b) is defensible but buys little for v1 and starts a precedent that the schema should not invite. |
| **D3** | **Which events make v1?** | The 8 events named in the brief, or the trimmed set in §1.2. | **Ship 7**, drop `dark_mode_toggled`, and **add two denominator events** (`install_created`, `session_start`). Feature counts with no denominator can't answer "what fraction of users use X" — the actual question. |
| **D4** | **Does the client ever hold the Supabase anon key?** | (a) No — the extension POSTs to `/api/events`, the route inserts as service role. (b) Yes — client writes straight to PostgREST with the anon key, mirroring 017's anon-INSERT grant. | **(a) No.** 017 grants anon INSERT because the `/feedback` *page* is genuinely public-writable. Analytics has no browser-side direct-write use case, so an anon INSERT grant here is attack surface we'd be adding for nothing. §2.3 gives both migration variants. |
| **D5** | **Table name** — the brief says `events`. | `public.events` or `public.feature_events`. | **`public.feature_events`.** `events` is a very generic name to claim in a shared `public` schema alongside Supabase's own objects. Trivially reversible; flagging rather than silently renaming. |
| **D6** | **Install-id lifetime** | (a) Stable forever. (b) Rotates monthly. | **(a) Stable**, given D1(a). (b) is the privacy-maximal hedge: it keeps feature counts and DAU intact but destroys retention and cohort analysis. Worth taking if D1 lands opt-out and we want to lower the EU risk without killing the sample. |

One sequencing correction to the requested plan, called out here because it's a privacy
matter rather than a preference: the brief orders the phases *instrument → consent+policy*.
Shipping instrumentation to the Web Store before the toggle and the policy update are live
would mean collecting from live users we haven't told. §6 keeps the phase numbering but holds
the kill-switch **default-off** until consent and policy land, so phases 1–3 go out in a
single Web Store release.

---

## 1. Event taxonomy

### 1.1 Design rules

1. **Small and deliberate.** Every event must map to a decision we would actually make
   (build more of this / cut this / fix this drop-off). If nobody can name the decision, the
   event doesn't ship.
2. **No free-form payload column.** There is deliberately **no `props jsonb`** in the
   schema. A JSON bag is the single most likely route by which a video title, a URL, or a
   bookmark description eventually leaks into analytics — someone adds one field in six
   months and no reviewer notices. Every dimension is an explicit, typed, `CHECK`-bounded
   column. Adding a dimension should cost a migration and a review. That friction is the
   feature.
3. **Counts, not content.** An event records *that* a feature was used, never *what* it was
   used on.
4. **Closed vocabulary.** `name` is constrained to an enum at the database level (§2), so an
   unknown event name is rejected rather than silently accumulating.

### 1.2 The v1 event set

**Tier 1 — ship in v1 (must have).** Each row names the decision it informs.

| Event | Fires when | Decision it informs |
|---|---|---|
| `install_created` | Once, on `chrome.runtime.onInstalled` (`reason === 'install'`) | Denominator for every "% of installs that…" question. Without it the other counts are uninterpretable. |
| `session_start` | Once per install per UTC day, first time any ClipMark surface becomes active | DAU/WAU denominator and the retention curve. One per day, not per page — this is not a pageview counter. |
| `bookmark_created` | A bookmark is committed to storage (all routes: Alt+B silent save, quick save, side panel, context menu) | The core action. If this is flat, nothing else matters. |
| `recall_started` | An Active Recall session begins | Is the flagship differentiator actually used? |
| `recall_completed` | A Recall session reaches its end rather than being abandoned | Paired with `recall_started` this is the one funnel we get: completion rate. A low rate means the session is too long or too hard. |
| `loop_created` | An A–B loop is saved as a bookmark | Was the loops feature (v1.0.3) worth building? Directly answers whether to invest further. |
| `anki_export` | An Anki TSV export completes | Free tier caps this at 10/month (`FREE_ANKI_EXPORTS_PER_MONTH`). Usage against the cap tells us whether the cap converts or just annoys. |

**Tier 2 — ship in v1 if the plumbing is already there (cheap).**

| Event | Fires when | Decision it informs |
|---|---|---|
| `loop_played` | A saved loop begins playing | Distinguishes "created a loop once" from "actually drills with loops". Meaningful only alongside `loop_created`. |
| `reminder_created` | A revisit reminder is set | Whether reminders earn their surface area. |

**Tier 3 — recommend deferring.**

| Event | Why not v1 |
|---|---|
| `dark_mode_toggled` | Two problems. First, the name is wrong for what the code does: `theme-loader.js` cycles **System → Light → Dark**, so this is a three-state theme picker, not a boolean toggle — the honest event is `theme_changed` with a `theme` value, which means a new dimension column and therefore a D2-shaped conversation. Second, and more importantly, no decision hangs on it. We are not going to remove theming. Defer until someone can name the decision. |

### 1.3 Event properties (the common envelope)

Every event carries exactly this, and nothing else:

| Property | Type | Source | Notes |
|---|---|---|---|
| `event_id` | UUID | `crypto.randomUUID()`, client-side | **Idempotency key.** Delivery is at-least-once (§3.4), so the table has a UNIQUE constraint on this and inserts use `ON CONFLICT DO NOTHING`. Without it, every retry inflates counts. |
| `name` | enum text | The call site | Closed vocabulary, enforced by `CHECK` (§2.2). |
| `occurred_at` | timestamptz | `Date.now()` client-side | When it actually happened. Needed because a queued event may be delivered hours later. **Untrusted** — clock skew and deliberate skew are both possible. |
| `received_at` | timestamptz | Server `DEFAULT NOW()` | The trustworthy timestamp. Analytics queries key off this unless specifically asking about client-side ordering. |
| `install_id` | UUID | Generated client-side on first run, stored in `chrome.storage.local` | Anonymous. Not derived from the user id, email, machine, or anything else — a fresh random UUID, so it cannot be reversed into an identity. See §1.5 for what it nonetheless *is*. |
| `app_version` | text | `chrome.runtime.getManifest().version` | Lets us attribute a metric change to a release. Bounded to 20 chars. |
| `is_pro` | boolean | The client's cached Pro state | **Client-asserted and therefore untrusted** — a modified client can send anything. Fine for splitting aggregate usage; must never be used for entitlement, billing, or any published number. |
| `surface` | enum text | The call site | `content` \| `side-panel` \| `dashboard` \| `background`. Mirrors `feedback.source`. Answers "do people bookmark from the page or the panel?", which is a real design question. |

**Explicitly not collected**, at any tier: no user id, email, name, or any `auth.users`
reference; no video id, title, URL, channel, or thumbnail; no bookmark description, tag,
note, or Recall question/answer text; no search queries; no IP address stored on the row; no
user agent, screen size, locale, or timezone; no free-form text of any kind.

On IP: the request necessarily *carries* one to Vercel, and we cannot prevent that. The
commitment is that `/api/events` never writes it to the row and never derives geo from it.
The existing per-IP rate limit (§3.3) holds IPs in memory only, exactly as
`/api/feedback` already does.

### 1.4 Why no video-level dimension (D2)

Recommendation: **collect nothing video-level, not even hashed.**

The tempting middle ground is a hash of `video_id`. It does not work as anonymisation. A
YouTube video id is an 11-character opaque string, but the space that *matters* is not the
theoretical keyspace — it's the set of videos that actually exist, which is enumerable at
roughly 10¹⁰ and publicly listable. Hashing a value drawn from a small, enumerable,
publicly-known set is a lookup table, not a one-way function: anyone with the table and our
hash function recovers the video id. A per-install salt doesn't rescue it either, since the
salt travels with the client. So a "hashed video id" column would be a plaintext video id
wearing a costume, and it would let us — or anyone who obtained a database dump — reconstruct
what an install watched. That is precisely the capability this spec exists to not have.

A coarse bucket (say `video_duration_bucket` ∈ {`<5m`, `5-20m`, `20-60m`, `>60m`}) is
genuinely non-identifying on its own and would tell us whether loops skew toward lectures or
music. But it is low-value for v1's questions, it is correlatable with other dimensions over
a long enough history, and adding it now establishes that video-level columns are
negotiable. Better to start at zero and make any future addition an explicit, reviewed
decision.

**Flagged for Ash as D2.** If the answer is (b), the bucket must be computed client-side from
the duration only, never from the id, and it should be added as a nullable typed column with
a `CHECK` on the allowed values — not as a JSON field.

### 1.5 Honest framing: anonymous, not unlinkable

The install id is not PII and cannot be reversed into a person. But `install_id` + timestamps
+ `is_pro` is a **pseudonymous behavioural record**: it can answer "this install used loops
41 times in July and then stopped", and under GDPR a persistent device-scoped identifier is
generally treated as personal data even without a name attached. The spec should not claim
more than it delivers. Two consequences:

- Disclosure copy (§4.2) says "anonymous usage data" but must not say "we cannot link
  events together" — we can, per install, by design.
- D6 (rotating install id) is the lever that would make that claim true, at the cost of
  retention analysis.

---

## 2. Supabase schema

Following the conventions of `webapp/migrations/017_feedback.sql`: idempotent, RLS enabled,
no read path for the API roles, `REVOKE` before any column-level `GRANT` (hosted Supabase
grants `ALL` on new public tables to `anon`/`authenticated` via schema-level defaults, so a
base grant must be revoked rather than merely not given).

Highest migration on `origin/main` today is **018** (`018_pending_refunds.sql`), so this is
**019**. Note that `main` also carries `017_feedback.sql`, and there is a *separate*
uncommitted `018_user_bookmarks_revision.sql` on the sync-engine branch — if that lands
first, this becomes 020. **Check `origin/main` at authoring time; do not trust this number.**

**The SQL below is authored here for review only. No file is created under
`webapp/migrations/` by this PR, and nothing is applied to any database.**

### 2.1 Recommended variant — service-role writes only (D4a)

```sql
-- Migration 019: anonymous feature-usage analytics (the extension's usage counters)
--
-- One row per product event, written only by POST /api/events as the service role.
-- Contains no PII: no user id, no video id or title, no bookmark content. See
-- docs/analytics/FEATURE-ANALYTICS-SPEC.md for the taxonomy and the consent model.
--
-- Structurally this follows 017_feedback.sql — RLS on, no SELECT/UPDATE/DELETE policy for
-- the API roles, reads are the service role's job — but it is deliberately STRICTER in one
-- respect: 017 grants anon INSERT because the public /feedback page is genuinely
-- browser-writable. Analytics has no such use case (the extension posts to our own route,
-- which inserts as the service role), so anon and authenticated get NO privileges at all.
-- An anonymous INSERT grant here would be unauthenticated write surface added for nothing.
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS), like every migration here.
-- NOT YET APPLIED TO PRODUCTION — see migrations/README.md.

CREATE TABLE IF NOT EXISTS public.feature_events (
  -- Client-generated, and the idempotency key: delivery is at-least-once because a queued
  -- batch is only dropped after a 2xx, so a response lost in flight WILL be retried.
  -- UNIQUE + ON CONFLICT DO NOTHING is what stops a retry from inflating every count.
  event_id     UUID        PRIMARY KEY,

  -- Closed vocabulary. An unrecognised name is rejected rather than silently accumulating
  -- in a table nobody queries. Extending the taxonomy costs a migration, on purpose.
  name         TEXT        NOT NULL CHECK (name IN (
                             'install_created',
                             'session_start',
                             'bookmark_created',
                             'recall_started',
                             'recall_completed',
                             'loop_created',
                             'loop_played',
                             'anki_export',
                             'reminder_created'
                           )),

  -- Client clock: when it happened. Untrusted (skew, and trivially forgeable) but needed
  -- because an event may sit in the local queue for hours before delivery.
  occurred_at  TIMESTAMPTZ NOT NULL,
  -- Server clock: the trustworthy one. Analytics queries key off this by default.
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Anonymous per-install UUID, generated client-side on first run. Not derived from the
  -- user, account, or machine — a fresh random value, so it maps to no identity. It is
  -- still a persistent pseudonymous identifier; see the spec's §1.5.
  install_id   UUID        NOT NULL,

  -- Extension version, for attributing a metric change to a release.
  app_version  TEXT        NOT NULL CHECK (char_length(app_version) <= 20),

  -- Client-asserted Pro state. Good enough to split aggregate usage; NEVER an entitlement
  -- signal — a modified client can send whatever it likes.
  is_pro       BOOLEAN     NOT NULL,

  -- Which ClipMark surface the action came from. Mirrors feedback.source in spirit.
  surface      TEXT        NOT NULL CHECK (surface IN (
                             'content', 'side-panel', 'dashboard', 'background'
                           ))

  -- Deliberately NO free-form jsonb column. A payload bag is the most likely route by which
  -- a video title or bookmark description eventually lands in analytics. Every dimension is
  -- an explicit typed column with a CHECK, so adding one requires a migration and a review.
);

-- ── Indexes: shaped for the four queries in the spec's §5 ────────────────────
-- Usage counts and trends are always "this event, over this window".
CREATE INDEX IF NOT EXISTS idx_feature_events_name_received
  ON public.feature_events (name, received_at DESC);
-- Plain time-window scans (totals, DAU) that don't filter by name.
CREATE INDEX IF NOT EXISTS idx_feature_events_received
  ON public.feature_events (received_at DESC);
-- DAU / retention / "how many distinct installs used X" — the per-install rollups.
CREATE INDEX IF NOT EXISTS idx_feature_events_install_received
  ON public.feature_events (install_id, received_at DESC);
-- Free-vs-Pro split, which is always sliced by event as well.
CREATE INDEX IF NOT EXISTS idx_feature_events_pro_name
  ON public.feature_events (is_pro, name);

ALTER TABLE public.feature_events ENABLE ROW LEVEL SECURITY;

-- ── Grants: none for the API roles ──────────────────────────────────────────
-- Hosted Supabase's schema-level default privileges grant ALL on new public tables to
-- anon/authenticated, so this REVOKE is load-bearing, not decorative.
REVOKE ALL ON public.feature_events FROM anon, authenticated;

-- ── RLS: no policy at all ───────────────────────────────────────────────────
-- With RLS enabled and no policy, every operation is denied for anon and authenticated.
-- The service role bypasses RLS and keeps full access — it is the only writer (via
-- /api/events) and the only reader (via the admin usage page and the SQL editor).
```

### 2.2 If Ash prefers strict 017 parity (D4b)

If the client should write directly to PostgREST with the anon key, replace the grants and
policy block above with the following. Everything else is unchanged.

```sql
-- ── Grants: INSERT only, and only on the columns a client owns ───────────────
-- received_at is excluded so a caller cannot backdate a row; it has a default.
REVOKE ALL ON public.feature_events FROM anon, authenticated;
GRANT INSERT (event_id, name, occurred_at, install_id, app_version, is_pro, surface)
  ON public.feature_events TO anon, authenticated;

-- ── RLS: anonymous INSERT, no read path ─────────────────────────────────────
DROP POLICY IF EXISTS "Clients may record usage events" ON public.feature_events;
CREATE POLICY "Clients may record usage events"
  ON public.feature_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- The column CHECKs already bound name/surface/app_version. The policy's job is to
    -- bound the timestamp, which is the one client-supplied field a CHECK can't sanely
    -- pin: reject anything implausibly old or in the future, so a forged batch cannot
    -- rewrite history or poison a future window.
    occurred_at > NOW() - INTERVAL '30 days'
    AND occurred_at < NOW() + INTERVAL '1 day'
  );
```

**The trade-off, stated plainly.** As 017's own header notes, an anonymous INSERT grant is by
construction an unauthenticated write endpoint on the database itself, and the `WITH CHECK`
is the real floor because a client holding the publishable anon key bypasses the route's rate
limit entirely. For feedback that ceiling is "bounded junk rows". For analytics it is worse
in kind: **anyone can forge our metrics.** Padded counts are not merely noise, they are
misleading in a way an empty table isn't — we'd make roadmap calls on fabricated numbers.

This is true to a lesser degree even under D4a: the route is public, so metrics are
*best-effort* and must never be treated as auditable or published externally. But D4a at
least keeps the rate limit on the only available path. That asymmetry is why I recommend
D4a.

---

## 3. Ingestion under MV3

### 3.1 Where this lives, and why

Per the repo convention of naming a feature's home before writing code:

- **The queue, the flush, and the only `fetch` live in the background service worker**
  (`extension/src/background/`). It is the one context with a lifecycle that spans surfaces,
  and centralising the sender means the consent check and the taxonomy validation exist in
  exactly one place.
- **Content scripts do not send.** They forward. This is not a preference, it's a hard
  constraint: content scripts are classic scripts sharing one global scope and cannot use ES
  imports, which is why `error-report-bridge.js` exists and why the twin-file convention
  exists. The analytics client mirrors that bridge exactly.
- **Side panel and dashboard** are module contexts and import the ESM twin directly.

Proposed files, following the established twin-file convention:

| File | Kind | Loaded by |
|---|---|---|
| `src/analytics.module.js` | ESM | Background worker, side panel, dashboard. Owns the queue, backoff, consent gate, and taxonomy constants. |
| `src/analytics-bridge.js` | Classic | Content scripts, via `manifest.json`'s `content_scripts`. Registers `globalThis.clipmarkTrack` and forwards via `chrome.runtime.sendMessage`. Must be added to `extension/scripts/content-globals-guard.mjs`'s list, or the built artifact can ship a `ReferenceError` that dev and source-based E2E will not catch. |

The bridge must be inserted into the `content_scripts` array *after* `error-report-bridge.js`
(which is deliberately first, because it stamps the injection marker
`clipmarkContentScriptVersion`) and before `content/content.js`.

### 3.2 Why we batch to our own endpoint

MV3 forbids remotely-hosted code, which rules out the normal vendor pattern of injecting an
SDK from a CDN. That's not a constraint we're working around — it's the same conclusion
`error-reporting.js` already reached for Sentry: no bundled SDK, just a small direct sender.
Our own `fetch` to our own origin is fully compliant, and
`https://clipmark.mithahara.com/*` is already in `host_permissions`, so **no new manifest
permission is required.** That matters for §4.4: a new permission would force a fresh Web
Store review of the permission set.

### 3.3 Endpoint contract

**Recommendation: a Next.js route, `POST /api/events`** — not a Supabase edge function. We
already have the route conventions (`handler.ts` + `route.ts` split with injected deps, per
`/api/feedback` and `/api/bookmarks`), the in-memory rate limiter, and the unit-test pattern
(`webapp/tests/unit/feedback-submit.test.ts`). An edge function would add a second deploy
target, a second secret to rotate, and a new host permission in the manifest, in exchange for
nothing we need.

```
POST https://clipmark.mithahara.com/api/events
Content-Type: application/json
```

No `Authorization` header. No Supabase key in the client (D4a).

**Request body** — a batch, always an array, even for one event:

```json
{
  "install_id": "3f2b9c7e-5a11-4d0e-9b6f-1c8e2a7d4b90",
  "app_version": "1.0.6",
  "is_pro": false,
  "events": [
    {
      "event_id": "b41c8f2a-77de-4a19-8f0b-2d6e91c3a55f",
      "name": "bookmark_created",
      "occurred_at": "2026-08-13T09:14:02.311Z",
      "surface": "content"
    },
    {
      "event_id": "c92d1e40-3b8a-4f77-91cc-5e0a7b23d118",
      "name": "recall_started",
      "occurred_at": "2026-08-13T09:31:47.002Z",
      "surface": "side-panel"
    }
  ]
}
```

`install_id`, `app_version` and `is_pro` sit on the envelope rather than on each event
because they're constant for a batch; the route fans them onto each row. Note that this means
a batch spanning a version upgrade would mis-attribute the older events — so **the queue is
flushed on `chrome.runtime.onInstalled` with `reason === 'update'`** before the new version
takes over, and any batch that fails to flush across an upgrade boundary is dropped rather
than relabelled.

**Validation** (all failures are 400 with a stable `error` code, no partial acceptance):

| Rule | Limit |
|---|---|
| `events` array length | 1–50 |
| Request body size | ≤ 32 KB, checked before parse |
| `install_id`, `event_id` | Must parse as UUID |
| `name` | Must be in the taxonomy allow-list (route-side, in addition to the DB `CHECK`) |
| `surface` | Must be in the surface allow-list |
| `app_version` | ≤ 20 chars, `/^\d+\.\d+\.\d+$/` |
| `occurred_at` | Valid ISO-8601, within `now − 30d` and `now + 1d` |
| Unknown fields | **Rejected, not ignored.** A strict allow-list on keys is a cheap structural guard against a future client accidentally sending a field the taxonomy never approved. |

**Responses:**

| Status | Body | Client behaviour |
|---|---|---|
| `200` | `{"ok": true, "accepted": 2}` | Drop the batch from the queue. |
| `400` | `{"error":"invalid_batch","message":"…"}` | **Drop the batch.** It will never succeed; retrying is a hot loop. Log locally in dev. |
| `429` | `{"error":"rate_limited"}` | Keep the batch, back off (§3.4). |
| `5xx` | `{"error":"save_failed"}` | Keep the batch, back off. |

**Rate limit:** same in-memory fixed window as `/api/feedback` and `/api/comments`, with the
same documented caveat that it resets on cold start and is per-instance under scale-out.
Suggested: **60 requests / 10 min / IP**, which at 50 events per batch is far above any honest
client and still bounds trivial hammering.

**Insert:** service role, `.upsert(rows, { onConflict: 'event_id', ignoreDuplicates: true })`
— one statement per batch. Duplicates from a retried batch are silently ignored, which is the
whole point of `event_id`.

**CORS:** the extension's `fetch` from a background worker sends `Origin:
chrome-extension://<id>`. The route needs an `OPTIONS` handler (as `/api/feedback` has) and
must allow the extension origin. Note that the extension id differs between the Web Store
build and unpacked dev loads, so the allow-list needs both, or the check keys off a
`chrome-extension://` prefix.

### 3.4 Client-side queue

**Storage: `chrome.storage.local`, never `chrome.storage.sync`.** Bookmarks use `sync`, but
an analytics queue must not: `sync` has a hard ~100 KB total quota and tight write-rate
limits, so a chatty queue would both risk evicting real user data and burn the write budget.
The queue is also inherently device-local — replicating it across a user's machines would
produce duplicate events. Proposed keys: `cm_analytics_queue`, `cm_analytics_install_id`,
`cm_analytics_enabled`, `cm_analytics_dnt`, `cm_analytics_backoff`.

**Install id:** generated with `crypto.randomUUID()` on first need and persisted. Generation
must be guarded against the race where two surfaces wake the worker simultaneously — read,
and only write if absent, then re-read the stored value as the source of truth.

**Flush triggers** (whichever comes first):
1. Queue length ≥ **25** events.
2. A `chrome.alarms` alarm every **5 minutes**. The worker already runs a `keepalive` alarm
   to survive MV3's ~5-minute idle shutdown, so this rides an existing pattern rather than
   introducing a new lifecycle concern.
3. `chrome.runtime.onInstalled` with `reason === 'update'` (see §3.3).

Deliberately **not** on every event — that would be one request per bookmark, which is both
wasteful and a much stronger timing signal about what the user is doing right now.

**Retry/backoff:** exponential with full jitter on `429` and `5xx` —
`min(30s × 2^attempt, 6h)` with a random factor in `[0.5, 1.0)`, persisted in
`cm_analytics_backoff` so a worker restart doesn't reset it into a tight loop. After **6**
consecutive failed attempts the batch is dropped. Analytics is strictly best-effort; it must
never grow unboundedly or retry forever.

**Queue cap: 500 events, dropping oldest.** An offline user for a week must not accumulate
megabytes in `storage.local`.

**Ordering with worker death:** the queue is only cleared *after* a 2xx. A worker killed
mid-flight therefore re-sends, which is exactly why `event_id` and the UNIQUE constraint
exist. At-least-once delivery plus idempotent insert gives effectively-once counting.

**Dev installs are excluded by default,** exactly as `error-reporting.js` does it: an
unpacked install (no `update_url` in the manifest) does not send, unless
`globalThis.CLIPMARK_ANALYTICS_DEV === true` is set. Otherwise E2E runs and local development
would pollute production metrics — and `test:yt` loads the extension from source on every CI
run, which would be a steady stream of fake events.

### 3.5 Failure modes that must not happen

| Failure | Guard |
|---|---|
| Analytics throws and breaks a user action | Every `track()` call is wrapped in `try/catch` and returns `void`. A bookmark must save even if analytics is completely broken. No `await` on `track()` at any call site. |
| Analytics error triggers an error report which triggers analytics | The analytics sender never reports its own failures through `clipmarkReportError`. Same recursion guard `error-reporting.js` already applies. |
| A retry loop burns the user's battery/network | Persisted backoff + attempt cap + queue cap (§3.4). |
| Events sent after the user opts out | The consent gate is checked at **enqueue** and again at **flush**, and opting out **clears the pending queue** (§4.1). A queued event from before opt-out must never be delivered. |

---

## 4. Privacy & consent

### 4.1 The toggle

**Location.** The extension has no consolidated settings screen today — the theme control is
a standalone `#theme-toggle` in the side panel, and `dashboard.js` has no settings view. So
this needs a small home rather than a slot in an existing one. Recommendation: a
**Privacy** section in the extension dashboard (`src/pages/dashboard.html` +
`dashboard.js`), which is our own full-page surface and the natural place for account- and
data-level controls. A second entry point from the side panel's overflow can follow later.

**Behaviour.**

- Stored in `chrome.storage.local` under `cm_analytics_enabled`. Local, not `sync`, because
  the queue and the install id are device-scoped, and a user may reasonably want their work
  laptop excluded but not their personal one.
- Toggling **off** must: stop enqueueing, **delete the pending queue**, and delete
  `cm_analytics_install_id` — so re-enabling later starts a fresh id rather than rejoining
  the old pseudonymous thread.
- The toggle reflects a DNT-forced-off state as off and disabled, with a one-line
  explanation, so the UI never claims to be collecting when it isn't (or vice versa).
- **No deletion-by-request path exists in v1, and the disclosure must not imply one.** Rows
  carry no user identifier, so we genuinely cannot find "your" events to delete — which is a
  consequence of the privacy design, not an oversight. The honest offer is "turn it off, and
  we stop"; the install id is the only handle, it never leaves the device in a form tied to
  an account, and §4.5's retention window bounds how long anything persists. If Ash wants a
  real erasure path, that requires the user to be able to surface their own install id
  (e.g. a copy button in the Privacy section) so support can delete by it — worth doing, but
  call it out as scope.

### 4.2 Disclosure copy (draft, for review)

In-product, in the Privacy section:

> **Help improve ClipMark**
> Send anonymous usage counts — which features you use, how often, and your ClipMark
> version. Never your videos, bookmarks, notes, or account details.
> We use this to decide what to build next. [What we collect](…)

The linked detail, kept short and specific:

> ClipMark records a small set of feature events: a bookmark was created, a Recall session
> started or finished, a loop was saved or played, a reminder was set, an Anki export ran,
> and ClipMark was opened. Each event carries a random install identifier, the time, your
> ClipMark version, whether you're on Pro, and which part of ClipMark it came from.
> It does **not** carry your identity, and it records nothing about *which* videos you
> watch or bookmark — no video IDs, titles, or URLs, and none of your notes or tags. The
> random identifier lets us count returning installs; it is not linked to your account, and
> turning this off deletes it. If your browser sends Do Not Track, this is off regardless of
> this setting.

Two things this copy deliberately avoids: the word "anonymised" (§1.5 — it's pseudonymous per
install, and overclaiming here is the kind of thing that turns a privacy story into a
credibility problem), and any implication that we can delete specific past events on request.

### 4.3 Opt-out vs opt-in — the trade-off (D1)

**Case for opt-out (my recommendation).** Feature-usage data is only decision-useful if it's
representative. Opt-in analytics in consumer software typically converts in the low tens of
percent at best, and the users who opt in are systematically the enthusiasts — precisely the
population whose behaviour least resembles the marginal user we're trying to activate. A 10%
enthusiast-skewed sample presented as "usage data" is arguably worse than no data, because
it will be believed. The payload here is genuinely minimal, carries no content and no
identity, and the questions it answers ("is anyone using loops?") are the ones that stop us
building things nobody wants.

**Case for opt-in (the real counterweight).** Under a strict reading of ePrivacy Art. 5(3),
storing the install id on the user's device is "storage of information on terminal
equipment", and the "strictly necessary" exemption does not cover analytics — so consent is
required for EU users. Some DPAs (CNIL notably) carve out genuinely anonymous first-party
audience measurement, but a *persistent* per-install identifier does not sit comfortably in
that carve-out. There's a product argument too: ClipMark's positioning includes on-device AI
and "we don't track you", and the privacy policy today says as much (§4.5). Default-on
telemetry is a real, if small, tension with that promise, and a privacy-forward user who
discovers it after the fact will not be reassured that it was disclosed in a policy update.

**Practical resolutions, in order of how much I'd recommend them:**
1. **Opt-out globally + DNT/GPC honored + prominent first-run disclosure** — the industry
   norm, best data, accepts a modest EU exposure at ClipMark's current scale.
2. **Opt-out + monthly-rotating install id (D6b)** — keeps feature counts and DAU, loses
   retention/cohorts, materially strengthens the "genuinely anonymous" claim and therefore
   the CNIL-style exemption argument. The best risk-adjusted option if #1 feels too
   exposed.
3. **Opt-in for everyone** — cleanest legally, weakest data.

Regional gating (opt-out globally, opt-in for EU) is technically possible but requires
inferring location from the request IP, which means introducing exactly the geo-inference
this spec otherwise refuses. **Not recommended.**

### 4.4 Do Not Track

Honored as a hard override: if DNT is on, analytics is off regardless of the toggle, and no
install id is generated. Check `navigator.doNotTrack === '1'`, and also
`navigator.globalPrivacyControl === true` (GPC), which is the signal that's actually gaining
legal weight.

**Implementation gotcha worth catching now:** the sender lives in the background service
worker, and `WorkerNavigator` does **not** expose `doNotTrack` — reading it there yields
`undefined`, which must not be misread as "not set, so proceed". DNT has to be sampled from a
document context (side panel, dashboard, or a content script, all of which see the browser
setting) and cached to `chrome.storage.local` under `cm_analytics_dnt`, which the worker
reads. Until a document context has reported once, the worker's default must be **off, not
on** — fail closed.

### 4.5 Privacy policy update

`webapp/app/(marketing)/privacy/page.tsx` needs edits before any collection ships. This is
not optional: the page currently states, in §1, *"We do **not** collect browsing history,
track pages outside of YouTube, or use third-party advertising trackers."* Feature analytics
doesn't contradict the letter of that sentence — we collect no browsing history and no
third-party trackers — but shipping usage telemetry while that sentence stands unamended
would be read as a broken promise, and reasonably so.

Required changes:

1. **§1 "Data We Collect"** — add a bullet:
   > **Anonymous usage data** — which ClipMark features you use and when, tied to a random
   > install identifier rather than to you. Includes your ClipMark version and whether you
   > are on Pro. Contains no video IDs, titles, or URLs, and none of your bookmarks, notes,
   > or tags. You can turn this off in ClipMark's settings, and it is off automatically if
   > your browser sends a Do Not Track or Global Privacy Control signal.

   The existing §1 usage-data bullet ("view counts for shared collections") stays; these are
   different things and shouldn't be merged.
2. **§1 closing paragraph** — keep the "no browsing history / no advertising trackers"
   sentence, which remains true and is worth keeping, but append that we collect anonymous
   feature-usage counts and link to the new bullet, so the paragraph can't be read as
   denying it.
3. **§3 "Third-Party Services"** — no new entry is needed for analytics (it's our own
   Supabase, already listed). **Separately noted as a pre-existing gap:** §3 does not list
   **Sentry**, which `extension/src/error-reporting.js` already sends unhandled errors to in
   production. That's an existing disclosure gap independent of this work, and it should be
   fixed in the same policy edit since we're in the file. Error payloads can incidentally
   include stack frames and messages, so it belongs there.
4. **§4 "How We Use Your Data"** — add: "To understand which features are used, so we can
   decide what to build and what to improve. We do not use this data to target you."
5. **§5 "Your Rights"** — note the opt-out, and state honestly that because usage events
   carry no account identifier, we cannot retrieve or delete specific past events on request
   (see §4.1).
6. **§6 "Data Retention"** — state the analytics retention window explicitly.
   **Recommendation: raw events deleted after 180 days**, with aggregates kept indefinitely.
   Needs a scheduled delete (`pg_cron`, or a Vercel cron hitting an admin route); v1 can
   ship the stated policy and a manual quarterly delete, but the automation should not lag
   far behind a promise made in the policy.
7. Bump the "Last updated" date.

### 4.6 Chrome Web Store data-use disclosure

The CWS **Privacy** tab must be updated *before* publishing a build that collects. These are
dashboard fields, not repo files, so Ash needs to do this in the Developer Dashboard — and
`docs/gtm/chrome-web-store-listing-FIELDS.md` should gain a section recording the answers,
since it currently documents only listing copy and has nothing on privacy practices.

| Field | Action |
|---|---|
| **Data types collected** | **Check "User activity."** Google defines this as including clicks and other in-product interaction, which is exactly what feature events are. This is the substantive change, and it is a *new* disclosure on a live listing. |
| | Leave unchecked, and confirm each is still accurate: PII, health, financial, authentication information, personal communications, location, web history, website content. Under the taxonomy in §1 all remain correctly unchecked — **"Web history" in particular stays unchecked only because of D2(a)**. Capturing any video identifier would arguably flip it, which is a second, independent reason to keep D2 at "none". |
| **Certifications** (three checkboxes) | All three remain truthfully checkable: we don't sell or transfer user data to third parties; we don't use it for purposes unrelated to the single purpose; we don't use it for creditworthiness or lending. |
| **Privacy policy URL** | Unchanged, but the policy at that URL must already contain the §4.5 edits **at the moment of submission** — reviewers check it. |
| **Permission justifications** | No change. §3.2 adds no permission; `storage` and the existing `clipmark.mithahara.com` host permission already cover this. |
| **Remote code** | Still "No, I am not using remote code." Batching to our own endpoint is data transmission, not code execution. |

**Release-risk note:** changing data-use disclosures on a live listing can extend review, and
in-review time is unpredictable. Bundle this with a release that isn't time-critical, and
don't stack it on top of a hotfix. Worth adding to `docs/RELEASE-RUNBOOK.md`.

---

## 5. Internal dashboard

**Location: a new admin-only page, `/admin/usage`.** It must **not** extend
`webapp/app/dashboard/analytics/` — that route already exists and is a *user-facing,
Pro-gated* view of the signed-in user's own bookmarking habits (heatmap, tag stats). Putting
internal product metrics there would mean either leaking them to every Pro user or bolting a
second access model onto a page that already has one.

**Access control:** reuse `requireAdmin` from `webapp/app/api/admin/_lib.ts`, which checks
the caller's id against the `ADMIN_USER_IDS` env var — the same gate `/admin` and the
existing admin API routes use. No new auth concept. Queries run through
`getSupabaseAdmin()` (service role) because the table has no read path for the API roles by
design.

**v1 shape:** a server component running four queries and rendering four plain cards. No
charting library, no client-side data fetching, no date-range picker — a hardcoded 30-day
window with a `?days=` override is enough to answer the questions we actually have.

**The four queries.**

```sql
-- 1. Feature usage counts, last 30 days — the headline table.
--    distinct_installs is the number that matters: 500 bookmarks from 3 installs is a
--    very different story from 500 from 300.
SELECT name,
       COUNT(*)                     AS events,
       COUNT(DISTINCT install_id)   AS distinct_installs
FROM public.feature_events
WHERE received_at > NOW() - INTERVAL '30 days'
GROUP BY name
ORDER BY events DESC;

-- 2. Free vs Pro split per feature. is_pro is client-asserted (§1.3) — directional only.
SELECT name,
       COUNT(*) FILTER (WHERE NOT is_pro) AS free_events,
       COUNT(*) FILTER (WHERE is_pro)     AS pro_events,
       COUNT(DISTINCT install_id) FILTER (WHERE NOT is_pro) AS free_installs,
       COUNT(DISTINCT install_id) FILTER (WHERE is_pro)     AS pro_installs
FROM public.feature_events
WHERE received_at > NOW() - INTERVAL '30 days'
GROUP BY name
ORDER BY name;

-- 3. Trend over time — daily active installs and daily event volume.
SELECT date_trunc('day', received_at)::date AS day,
       COUNT(DISTINCT install_id)           AS active_installs,
       COUNT(*)                             AS events
FROM public.feature_events
WHERE received_at > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1;

-- 4. Adoption against the install denominator, plus the one funnel we have.
--    "What fraction of installs seen in the window used each feature?"
WITH active AS (
  SELECT COUNT(DISTINCT install_id) AS n
  FROM public.feature_events
  WHERE received_at > NOW() - INTERVAL '30 days'
)
SELECT e.name,
       COUNT(DISTINCT e.install_id) AS installs,
       ROUND(100.0 * COUNT(DISTINCT e.install_id) / NULLIF(active.n, 0), 1) AS pct_of_active
FROM public.feature_events e
CROSS JOIN active
WHERE e.received_at > NOW() - INTERVAL '30 days'
GROUP BY e.name, active.n
ORDER BY installs DESC;

-- Recall completion rate — the drop-off worth watching, derived from queries 1/4:
--   count(recall_completed) / count(recall_started)
-- Deliberately computed across the window rather than per-session: sessions have no id in
-- this taxonomy, and giving them one would be a new dimension (and a new D2-shaped call).
```

**Scale note:** at ClipMark's current install base these are plain index scans over a small
table and need nothing further. Revisit with a `date_trunc` rollup table or a materialized
view when `feature_events` passes roughly 1M rows; adding it before then is speculative
complexity. The 180-day retention in §4.5 also caps growth.

**Do not** put a link to `/admin/usage` in any user-facing navigation.

---

## 6. Phased MVP plan

Phase numbering follows the brief. The one change is the **kill switch**: instrumentation
lands in phase 2 but stays `default-off` in any shipped build until phase 3 makes it
disclosed and controllable, and **phases 1–3 go to the Web Store as one release**. That way
no build ever collects from a user who hasn't been told.

### Phase 1 — Schema + endpoint (no client, nothing collected)

Deliberately lean. Nothing user-visible; nothing shipped to the Web Store.

- `webapp/migrations/019_feature_events.sql` per §2, per the D4/D5 answers. Applied
  **locally first**, then to production by hand via `make db-migrate` with a backup taken
  (free-tier Supabase has no automatic backups).
- `webapp/app/api/events/route.ts` + `handler.ts`, following the injected-deps split of
  `/api/feedback`.
- `webapp/app/lib/events.ts` — the taxonomy allow-list and `validateEventBatch()`, shared
  by the route (and later by the parity test).
- Tests: `webapp/tests/unit/events-submit.test.ts` for every validation and failure path,
  modelled on `feedback-submit.test.ts`. An integration test asserting `anon` and
  `authenticated` cannot `SELECT` or `INSERT` (D4a) — the existing RLS integration harness
  covers this shape.

**Exit criterion:** `curl` a batch at a local server, see rows land; confirm a repeated
`event_id` does not double-count; confirm an anon-key client is denied.

### Phase 2 — Client instrumentation (built, default-off)

- `src/analytics.module.js` (queue, backoff, consent gate, install id) and
  `src/analytics-bridge.js` (classic, content scripts) per §3.1.
- Register the bridge in `manifest.json`'s `content_scripts` **and** add its global to
  `extension/scripts/content-globals-guard.mjs`. Skipping the guard is how a build-only
  `ReferenceError` ships — dev loads and source-based E2E won't catch it.
- Wire the Tier 1 events (§1.2). `bookmark_created` must be hooked at the single point where
  a bookmark is committed to storage, not per UI entry point — there are four routes into it
  (Alt+B, quick save, side panel, context menu) and hooking them separately guarantees a
  miscount.
- Tests: `tests/unit/analytics.test.mjs` for queue cap, batch chunking, backoff-with-jitter
  bounds, the DNT fail-closed default, dev-install suppression, and that opt-out purges the
  queue. All pure logic, no browser needed.
- **Ships with `cm_analytics_enabled` defaulting to off.** Verify end-to-end by flipping the
  dev override.

### Phase 3 — Consent + policy (the release that turns it on)

- Privacy section + toggle in the extension dashboard (§4.1), with the §4.2 copy.
- DNT/GPC sampling from a document context into `cm_analytics_dnt` (§4.4).
- Default flips to on (or stays off, per D1).
- Privacy policy edits per §4.5 — **deployed before the extension build is submitted**,
  including the Sentry disclosure gap.
- CWS Privacy tab updated per §4.6; record the answers in
  `docs/gtm/chrome-web-store-listing-FIELDS.md`.
- Version bump; submit. Expect a longer review than usual.

**Exit criterion:** a fresh profile install produces `install_created` and `session_start`;
toggling off stops delivery and clears the queue; a DNT-on profile sends nothing at all.

### Phase 4 — Dashboard

- `/admin/usage` per §5, behind `requireAdmin`.
- The four queries, four cards, `?days=` override.
- Tier 2 events (`loop_played`, `reminder_created`) added once phase 3 has proven the pipe.
- Retention automation (§4.5 item 6) — or a calendar reminder for a manual quarterly delete,
  since the policy will already promise 180 days.

### Deferred beyond v1

`theme_changed`, any video-level dimension (D2), session ids, per-session funnels, rollup
tables, a user-facing erasure path keyed on a surfaced install id, and cohort/retention
reporting.

---

## 7. Review checklist

Before phase 3 ships, confirm each:

- [ ] No event carries a video id, title, URL, channel, bookmark description, tag, or note.
- [ ] No event carries a user id, email, name, or any `auth.users` reference.
- [ ] No `jsonb` or free-form text column exists on `feature_events`.
- [ ] `anon` and `authenticated` have no `SELECT` on the table (verified by integration test,
      not by reading the migration).
- [ ] The taxonomy allow-list is enforced in **both** the route and the DB `CHECK`.
- [ ] A repeated `event_id` cannot double-count.
- [ ] Opt-out purges the pending queue and deletes the install id.
- [ ] DNT and GPC both force off; the worker's default is off before any document reports.
- [ ] Unpacked/dev installs and the E2E suite send nothing.
- [ ] A thrown analytics error cannot fail a bookmark save.
- [ ] The privacy policy at the live URL is updated **before** submission.
- [ ] The CWS "User activity" box is checked and "Web history" is still legitimately
      unchecked.
- [ ] The new content-script global is in `content-globals-guard.mjs`, verified against a
      real `make ext-build` artifact rather than a dev load.
