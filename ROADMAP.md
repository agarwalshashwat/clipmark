# Clipmark — Product Roadmap

> Turn long YouTube videos into searchable, revisable knowledge.

---

## Current State

| Property | Value |
|----------|-------|
| Product name | Clipmark |
| Type | Chrome Extension (Manifest V3) + Next.js 14 webapp |
| Stack | Vanilla JS extension · Next.js 14 + TypeScript + Supabase |
| Storage | `chrome.storage.sync` + Supabase `user_bookmarks` (when signed in) |
| Auth | Google OAuth via Supabase; token stored in sync storage |
| AI | Claude Haiku — transcript auto-fill, summaries, tag suggestions, social posts |
| AI (local) | Chrome built-in `LanguageModel` (Gemini Nano) — on-device, no network |
| Payments | Dodo Payments — Monthly / Annual / Lifetime + commission-based affiliate |
| Testing | 75 unit tests (Node.js) + Playwright E2E suite |
| Latest phase | Phase 9 (Testing) complete |
| Live at | https://clipmark.mithahara.com |

---

## Phase 1 — Core Extension ✅ Done

> Build a bookmarking tool worth using every day on YouTube.

- [x] One-click bookmark — description optional; auto-fills from transcript → chapter → "Bookmark at M:SS"
- [x] Inline edit — click any description in the popup to edit in-place
- [x] **Alt+S** silent save — instant bookmark with toast confirmation
- [x] **Alt+B** — opens popup (manifest `commands`)
- [x] Tag parsing — `#important`, `#review`, `#todo` etc. auto-extracted from descriptions
- [x] Named tag colors — important → red, review → orange, note → blue, question → green, todo → purple, key → pink
- [x] Custom tag colors — unknown tags get a deterministic hash-based color
- [x] Colored progress bar markers — each marker reflects its bookmark's tag color
- [x] Export JSON / CSV / Markdown — full backup or paste-ready timestamped links
- [x] Import JSON — merge from backup, deduplicates by ID
- [x] `chrome.storage.sync` — per-video key architecture (`bm_{videoId}`), one-time migration from local
- [x] YouTube player bookmark button — injected into `.ytp-right-controls`, pulse animation on save
- [x] Visual save flash — sparkle overlay on player frame (~700ms)
- [x] Marker clustering — nearby markers merge into a cluster when >8 bookmarks on a video
- [x] Copy timestamped link — ⎘ button on every bookmark
- [x] Bulk delete — checkbox selection with "Delete (N)" action in dashboard toolbar

---

## Phase 2 — Dashboard ✅ Done

> A full-page view of all bookmarks, organized and explorable.

- [x] Video-grouped card view — cinematic thumbnail, visual timeline scrubber with colored dots, bookmark rows
- [x] Timeline view — chronological view of all bookmarks across all videos; alternating left/right layout with month/year markers
- [x] **Timeline grouping** — multiple clips from the same video on the same day collapsed into a single grouped card with stacked clip rows
- [x] Search — filter by description, video title, or tag in real time
- [x] Sort — newest first / oldest first / by timestamp
- [x] Card and timeline view toggle
- [x] Dark theme with teal + purple palette — `#0F172A` base, `#1E293B` surfaces, `#14B8A6` accent, `#8B5CF6` secondary

---

## Phase 3 — Backend & Sharing ✅ Done

> Make bookmarks shareable and add cloud sync.

- [x] **↗ Share** — publishes bookmarks for a video to a public URL (`/v/{shareId}`)
- [x] Public share page — video title + clickable timestamp list, any visitor can jump to the moment
- [x] View count tracking per shared collection
- [x] Embed widget — `<iframe>`-embeddable page at `/embed/{shareId}`
- [x] **Sign in with Google** — extension opens OAuth flow in webapp, token sent back via `chrome.runtime.sendMessage`
- [x] Public profile page — `/u/[username]` with avatar and collection grid
- [x] Cloud bookmark sync — `PUT /api/bookmarks` upserts to Supabase `user_bookmarks` on every save/delete
- [x] **✍ Post** — AI-generated social post for X/Twitter, LinkedIn, or Threads from current video's bookmarks (Pro)

---

## Phase 4 — AI Features ✅ Done

> Move from manual notes to smart notes.

- [x] **✦ Auto** — pre-fills description from live transcript at current timestamp (Claude Haiku)
- [x] Transcript cached per-video; invalidates on SPA navigation
- [x] Auto-transcript on all empty saves — same chain used for Alt+S silent save
- [x] **✦ Summary** — AI overview, key topics, and action items for current video's bookmarks
- [x] Smart tag suggestions — after Auto fill, AI suggests relevant tags as clickable chips
- [x] Pro paywall — `is_pro` flag on profiles; Summary, Tags, Social gated behind Pro

---

## Phase 5 — Revisit & Learning ✅ Done

> Turn bookmarks into a study tool.

- [x] **▶ Revisit Mode** — plays each bookmarked segment sequentially (default 60s clips) with HUD overlay showing clip progress and countdown
- [x] `pendingRevision` stored in `chrome.storage.local`; content script picks it up when the YouTube tab loads
- [x] **Spaced Revisit** — bookmarks store `reviewSchedule: [1, 3, 7]` (days after creation); popup shows "📚 Revisit Today" panel when reviews are due
- [x] Clicking a due item marks it reviewed and navigates to the timestamp
- [x] **Custom revisit reminders** — per-video reminder with user-defined interval (days); stored as `rem_{videoId}` in `chrome.storage.sync`; popup shows active reminder with change/clear controls

---

## Phase 6 — Polish & UX ✅ Done

> Make every pixel intentional.

- [x] Popup redesign — dark-first palette, rounded popup card, fused input+auto button
- [x] Quick tag chips — `#important`, `#note`, `#review`, `#idea` one-click insert below input
- [x] Title shimmer — skeleton animation while video title loads
- [x] Save button renamed "Save Moment" — more emotionally resonant
- [x] Sign-in as icon button — SVG person icon keeps header from overflowing
- [x] Header separator — feature pills (Summary/Share/Post) visually separated from nav/auth
- [x] **Clipmark logo** — teal rounded-square play+bookmark icon; cropped/resized to `icon-16/48/128.png` and `clipmark-logo.png`
- [x] **Groups view (webapp)** — custom groups (manual curation) and tag-based auto-groups; create/delete groups, add/remove videos per group with inline dropdown + × overlay button
- [x] **Sign-out button** — SVG icon in popup header; clears `bmUser` from sync storage
- [x] **✦ Pro upgrade button** — always-visible purple pill in popup header; opens `/upgrade` in new tab; hidden when already Pro
- [x] **Dashboard "Editorial Collection" redesign** — 50/50 two-column card layout, rounded 24px cards with elevated shadow, gradient overlay on thumbnails, hover play button, absolute thread line + ring-shadow dots for timeline

---

## Phase 7 — Monetization ✅ Done

> Convert free users to paying ones.

### Pricing Tiers

| Tier | Price | Notes |
|------|-------|-------|
| **Free** | $0 | Core bookmarking, local storage, limited sharing |
| **Pro Monthly** | $5 / month | Full feature access |
| **Pro Annual** | $40 / year (~$3.33/mo) | Best value |

### Free Tier Limits
- Unlimited local bookmarks
- 5 public shared collections
- No AI features (Auto, Summary, Tags, Social Post)
- No Revisit Mode

### Pro Tier Unlocks
- Unlimited shared collections
- AI auto-fill, summaries, smart tag suggestions
- Social post generation (X, LinkedIn, Threads)
- Revisit Mode
- Priority support

### Implementation
- [x] Dodo Payments integration — Merchant of Record, handles VAT/global compliance
- [x] `POST /api/checkout` — creates Dodo checkout session with `metadata.user_id`
- [x] `POST /api/webhooks/dodo` — verifies signature; `payment.succeeded / subscription.active/renewed` → `is_pro=true`; `subscription.cancelled/expired` → `is_pro=false`
- [x] `/upgrade` page — Free / Pro Monthly / Pro Annual pricing cards with feature comparison table
- [x] Success banner on `?success=true`; "Already on Pro" banner for existing subscribers

---

## Phase 7.5 — Quick Wins ✅ Done

> High-impact, low-effort improvements before major new phases.

- [x] **Onboarding tour** — 3-step overlay on first install
- [x] Keyboard shortcut hints — tooltip on Save Moment button showing Alt+S shortcut
- [x] **Dashboard "Editorial Collection" redesign** — full bookmarks page overhaul matching design system reference
- [x] **Watermark on share pages** — "Made with Clipmark" footer CTA with link to Chrome extension
- [x] Soft paywall — show AI summary preview (blurred), "Upgrade to reveal"
- [x] Usage limit nudge — "You've used 4 of 5 free shares this month"

---

## Phase 7.6 — Webapp Dashboard Improvements ✅ Done

> Reminders, groups management, and marker UX shipped as a cohesive update.

### Reminders & Re-engagement (renamed from "Revisit Queue")
- [x] `revisit_reminders` table — `target_type` (collection/group), `target_id` (TEXT), `frequency`, `next_due_at`, `last_done_at`, optional `label`
- [x] Frequencies: once, daily, weekly, biweekly, monthly
- [x] `markReminderDone` — advances `next_due_at` for recurring reminders; clears one-time reminders
- [x] **Reminders page redesign** — two-column editorial layout: Active Clip preview panel (left) + form (right)
  - Target type pill tabs: "Specific Video" / "Collection/Group"
  - Active Clip preview shows YouTube thumbnail, video title, tag chips, editorial pull quote
  - Radio button frequency selector (One-time / Weekly / Every 2 weeks / Monthly / Daily)
  - "Active Schedule" timeline section with due/upcoming cards
  - Due reminders highlighted in red with "DUE NOW" label, "Revisit ↗" and "Mark Done" buttons
- [x] **Due-reminder badge** in sidebar nav — red count pill on desktop, red dot on mobile
- [x] Fix: query `user_bookmarks` table (not `collections`) for video dropdown — all bookmarked videos now appear

### Groups
- [x] `groups` table — `type: 'custom' | 'tag'`, optional `tag_name`
- [x] `group_collections` table — stores `(group_id, collection_id TEXT)` where `collection_id` = `video_id`
- [x] Custom groups: manually add/remove videos via inline dropdown + × overlay button
- [x] Tag groups: auto-populated from all bookmarks matching the tag
- [x] "Auto Groups" section below user groups (existing tag-based auto-detection)
- [x] Fix: `group_collections.collection_id` changed from UUID FK → TEXT (stores `video_id` string)

### YouTube Player Marker UI/UX
- [x] **Always-visible diamond nub** — rotated 8×8px square above the progress bar at `opacity: 0.85`; scales up on hover
- [x] **Rich DOM tooltip** — shared `#yt-bm-tooltip` element at `document.body`; shows timestamp (teal), description, tag chips with per-tag color backgrounds
- [x] **Cluster tooltips** — "N clips nearby" header + one item per line for clustered markers
- [x] **Edge-aware tooltip positioning** — `requestAnimationFrame` clamps tooltip within viewport; flips below marker if no room above
- [x] **16px invisible click target** — marker div is `width: 16px; background: transparent`; `::after` draws the 3px colored bar; easy to hit without pixel-perfect aim
- [x] **Active marker pulse** — throttled `timeupdate` handler finds marker within 1.5s of current time; `::after` widens and plays `bm-pass-pulse` keyframe animation
- [x] CSS custom property `--bm-color` on each marker element — nub, bar, and tooltip chips all derive color from this

---

## Phase 8 — Growth & Monetisation Infrastructure ✅ Done

> Viral growth loops, creator partnerships, and a broader Pro tier.

### 8.1 Referral Program
- [x] `referral_code` auto-generated for every user (8-char md5 slug)
- [x] `referrals` table — tracks referrer, referred user, status, reward months
- [x] `/ref/[code]` landing page — attribution cookie set on click (30-day window)
- [x] **Refer & Earn dashboard page** — personal link, copy button, stat cards (friends referred, months earned), referral history table
- [x] Reward: 3 free Pro months per successful conversion

### 8.2 Affiliate Program
- [x] Invite-only affiliate accounts (`is_affiliate` flag on profiles)
- [x] `affiliate_clicks` table — anonymous click tracking per affiliate code
- [x] `affiliate_conversions` table — commission tracking (30% default) with `pending / approved / paid / cancelled` lifecycle
- [x] `affiliate_applications` table — intake form for new applicants; admin review workflow
- [x] **Affiliate dashboard page** — apply form for non-affiliates; click/conversion stats + earnings table for approved affiliates
- [x] Dodo webhook updates conversions on `payment.succeeded`

### 8.3 Gifted Pro
- [x] `is_gifted_pro`, `gifted_pro_expires_at`, `gifted_by_note` columns on profiles
- [x] Admin can grant permanent or time-limited Pro to partners and creators without a Dodo payment
- [x] Gifted accounts excluded from paid-subscriber analytics

### 8.4 Analytics Dashboard
- [x] **Analytics page** (`/dashboard/analytics`) — 14-day activity heatmap, tag frequency chart, top videos by bookmark count, total stats card
- [x] All data computed server-side from `user_bookmarks`; zero extra API calls

### 8.5 YouTube Comments Integration
- [x] `GET /api/comments?videoId=...` — proxies YouTube Data API v3 `commentThreads`
- [x] Returns top 20 comments by relevance; gracefully returns `[]` when comments are disabled
- [x] Surfaced alongside bookmarks in the dashboard video view

### 8.6 OG Image Generation
- [x] `GET /api/og` — generates Open Graph images for share pages using `@vercel/og`

---

## Phase 9 — Comprehensive Testing ✅ Done

> Make the extension safe to iterate on at speed.

- [x] **Pure-logic unit tests** (75 tests, Node.js built-in runner, no browser) covering `parseTags`, `getTagColor`, `stringToColor`, `formatTimestamp`, `bmKey`, `ytWatchUrl`, `ytThumbnailUrl`, `clusterBookmarks`, `cleanTranscriptText`, `getTextAtTimestamp`
- [x] **Shared E2E test helpers** (`tests/helpers.ts`) — `seedBookmarks`, `getStoredBookmarks`, `clearStoredBookmarks`, `makeBookmark` via the background service worker
- [x] **Bookmark lifecycle spec** — save → persist → reload; pre-seeded markers; marker count; `data-timestamp` attribute; left-% positioning
- [x] **Marker interactions spec** — click-to-seek, hover tooltips, tag chips, mouseleave hides tooltip, duplicate rejection, `.yt-save-flash`, `.yt-bookmark-toast`, `.clicked` animation, cluster tooltip header
- [x] **Storage schema spec** — all required fields, correct types, ISO date strings, `reviewSchedule` default, insertion order, array accumulation
- [x] `npm run test:unit` / `npm run test:yt` / `npm run test:all` scripts in root `package.json`

---

## Phase 10 — Server Sync & Insights Platform 🔲 Next (Q3 2026)

> Enable cross-device sync, build analytics infrastructure, unlock data-driven features.

### Goal
Move beyond local-only storage to enable cross-device sync, video insights, and predictive recommendations while maintaining fast offline access.

### Architecture

| Layer | Purpose | Technology |
|-------|---------|------------|
| **Client (Extension)** | Instant offline access, low latency | `chrome.storage.sync` (local cache) |
| **Server (Sync Engine)** | Persistence, backup, cross-device | Supabase PostgreSQL |
| **Analytics Engine** | Insights, heatmaps, engagement data | PostgreSQL aggregations + Redis cache |

**Sync Strategy:**
- Client writes locally first (instant feedback)
- Background sync every 30s when online
- Server timestamp wins conflicts
- Offline queue syncs when connection restored

### 8.1 Checklist
- [ ] Design & migrate database schema (bookmarks, video_analytics, user_video_sessions)
- [ ] Build sync API endpoints (`/api/sync/bookmarks`, `/api/bookmarks/*`)
- [ ] Implement conflict resolution logic (server timestamp wins)
- [ ] Build SyncEngine class in background worker
- [ ] Add offline queue for failed syncs
- [ ] Migrate existing users (one-time: chrome.storage → server)
- [ ] Build insights dashboard UI (`/dashboard/insights`)
  - Global stats card (total bookmarks, videos, avg per video, most active day)
  - Tag frequency chart + tag co-occurrence
  - Watch pattern heatmap (day × hour)
  - Top videos by bookmark count
- [ ] Add sync status indicator in side panel
- [ ] Cross-device testing (2+ Chrome profiles)

**Estimated Effort:** 3–4 weeks

---

## Phase 11 — Smart Watching 🔲 (Q4 2026) — Pro Feature

> Compress long videos into high-value segments using AI + engagement heatmaps.

### Goal
Auto-seek through only the "hot points" of a long video — saving 50–75% of watch time while retaining key insights.

### How it works
1. Extract YouTube's engagement heatmap (shows where users rewatch/slow down)
2. Combine with Clipmark aggregate bookmark data across all users
3. Identify "hot points" (peaks > 70th percentile, weighted 70% YT / 30% Clipmark)
4. Content script auto-seeks between hot points, watching 30–60s at each
5. Result: 1 hour → ~18 minutes of dense content

### 9.1 Checklist
- [ ] Server-side video analysis job — `analyze-video.js` runs daily for videos with >10 bookmarks
- [ ] `video_analytics.hot_points` stored per video
- [ ] `/api/insights/video/:id` endpoint returns hot points to extension
- [ ] `SmartWatcher` class in content script — seeks through hot points with HUD overlay
- [ ] "Smart Watch" button in popup (Pro only)
- [ ] User-configurable segment duration (15s / 30s / 60s)
- [ ] Auto-bookmark option — optionally saves a bookmark at each hot point visited
- [ ] Analytics: track which videos users Smart Watch; feedback loop to improve scoring

**Estimated Effort:** 2–3 weeks

---

## Phase 12 — Platform Expansion 🔲 (2027)

> Extend beyond YouTube to other video platforms and use cases.

- [ ] Vimeo support
- [ ] Coursera / Udemy support (iframe-based players)
- [ ] Podcast support (audio bookmarking)
- [ ] Mobile companion app (React Native) — view/search bookmarks on the go
- [ ] Browser extension for Firefox

---

## Backlog / Ideas

- [ ] Empty state illustrations — friendly graphics when no bookmarks exist
- [ ] Success animations — confetti on first share
- [ ] Bookmark streak — "5-day streak! 🔥" badge in popup
- [ ] Weekly digest email — "You bookmarked 12 moments this week" (opt-in, Pro)
- [ ] ~~Referral program~~ ✅ Shipped (Phase 8.1)
- [ ] Testimonial carousel on /upgrade page
- [ ] Cancel subscription UI — refund within 14 days vs. cancel-at-period-end
- [ ] Public stats badge — embeddable "Bookmarked with Clipmark" SVG for READMEs
