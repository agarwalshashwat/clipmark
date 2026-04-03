# Clipmark — Copilot Agent Instructions

## What this project is

**Clipmark** is a YouTube video bookmarking tool comprising two components that are developed together in this monorepo:

1. **Chrome Extension** (`extension/`) — Manifest V3, vanilla JS. Injected into YouTube pages. Handles bookmark creation, progress-bar markers, revisit mode, keyboard shortcuts, context menus, and optional on-device AI (Gemini Nano via `LanguageModel` API).
2. **Next.js 14 Webapp** (`webapp/`) — TypeScript. Provides cloud sync, Google OAuth, AI API endpoints (Claude Haiku), payments (Dodo Payments), public share pages, and a full dashboard.

Live URL: **https://clipmark.mithahara.com** | Hosted on Vercel + Supabase.

---

## Repository layout

```
extension/                   Chrome Extension (Manifest V3, vanilla JS)
  manifest.json              Permissions, commands, content_scripts, host_permissions
  src/
    background/background.js Service worker — auth, alarms, context menus, cloud sync
    content/content.js       YouTube page injection — markers, revisit mode, shortcuts
    popup/popup.js           Extension popup UI — bookmark CRUD, AI, auth, reminders
    popup/dashboard.js       Full-page dashboard (card/timeline/groups/export/import)
    popup/side-panel.js      Persistent side panel alongside YouTube
    popup/theme-loader.js    Theme (light/dark) bootstrapper
    ai/local-ai.js           On-device Gemini Nano helpers (localAiAvailability, localSuggestTags, localSummarizeBookmarks)
    pages/                   popup.html, dashboard.html, side-panel.html
    config.example.js        Copy to config.js (gitignored); sets API_BASE
  styles/                    popup.css, dashboard.css, side-panel.css, design-tokens.css

packages/design-system/      Single source of truth for CSS design tokens
  tokens.css                 Edit ONLY this file; never edit tokens in extension or webapp directly

webapp/                      Next.js 14 + TypeScript + Supabase
  app/
    api/
      share/                 POST — create public shared collection → returns shareId
      bookmarks/             PUT  — cloud sync (upsert per-video bookmarks)
      summarize/             POST — Claude Haiku AI summary
      suggest-tags/          POST — Claude Haiku tag suggestions
      generate-post/         POST — Claude Haiku social post (X/LinkedIn/Threads)
      refresh/               POST — Supabase token auto-refresh
      webhooks/dodo/         POST — Dodo Payments webhook → updates is_pro flag
      reminders/             GET/POST — fetch + manage revisit reminders
    auth/                    Google OAuth callback + token handoff to extension
    dashboard/               Authenticated dashboard (queue, groups, shared views)
    upgrade/                 Pricing page + Server Action checkout
    v/[shareId]/             Public shared collection view
    embed/[shareId]/         Embeddable iframe
    u/[username]/            Public user profile
  lib/supabase.ts            Supabase client helpers
  migrations/                SQL migration files (001–006); auto-run before every build
  .env.example               All required env vars with comments

scripts/
  sync-design-tokens.js      Copies tokens.css from packages/design-system → extension and webapp

tests/                       Playwright e2e tests (extension behavior + YouTube selectors)
  fixtures.ts                Launches Chrome with extension loaded via launchPersistentContext
```

---

## Tech stack at a glance

| Layer | Technology |
|---|---|
| Extension | Vanilla JS, Chrome Manifest V3, no build step |
| Webapp | Next.js 14 (App Router), TypeScript |
| Database | Supabase (PostgreSQL) |
| Auth | Google OAuth via Supabase; token stored in `chrome.storage.sync` as `bmUser` |
| AI (cloud) | Anthropic Claude Haiku — transcript auto-fill, summaries, tag suggestions, social posts |
| AI (local) | Chrome built-in `LanguageModel` (Gemini Nano) — `local-ai.js` |
| Payments | Dodo Payments (Merchant of Record) |
| Hosting | Vercel |
| Testing | Playwright (non-headless, loads extension via persistent context) |

---

## Key development commands

```bash
# --- Root ---
npm run sync-tokens          # Sync design tokens from packages/design-system → extension + webapp
npm run test:yt              # Run Playwright tests (install Chromium first: npx playwright install chromium)
make help                    # Show all available make targets

# --- Webapp (cd webapp first, or use make targets) ---
make dev                     # next dev (hot reload)
make build                   # run DB migrations + next build
make migrate                 # run SQL migrations only
make start                   # next start (production)

# --- Extension ---
make ext-zip                 # Zip extension/ for Chrome Web Store submission
make ext-open                # Open chrome://extensions in Chrome

# --- Design Tokens ---
make sync-tokens             # same as npm run sync-tokens from root
```

### Running tests

```bash
npx playwright install chromium   # first time only
npm run test:yt                   # or: make test
npx playwright show-report        # or: make test-report
```

Tests are non-headless (`headless: false`) because Chrome extensions cannot run in headless mode. Workers are set to 1 (serial) because `launchPersistentContext` cannot run concurrently.

---

## Local dev setup

### Extension

1. Go to `chrome://extensions/` → enable **Developer mode**
2. Click **Load unpacked** → select the `extension/` folder
3. Set `API_BASE` at the top of `extension/src/popup/popup.js` to `http://localhost:3000`

### Webapp

```bash
cd webapp
cp .env.example .env.local       # fill in Supabase, Anthropic, Dodo Payments keys
npm install
npm run dev
```

Required environment variables (see `webapp/.env.example` for the full list with comments):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (used by webhooks + migration runner) |
| `DATABASE_URL` | PostgreSQL connection string (for migrations) |
| `NEXT_PUBLIC_APP_URL` | App base URL (`http://localhost:3000` locally) |
| `ANTHROPIC_API_KEY` | Claude Haiku API key |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key |
| `DODO_PAYMENTS_API_KEY` | Dodo Payments API key |
| `DODO_PAYMENTS_WEBHOOK_SECRET` | Dodo webhook signing secret |
| `DODO_MONTHLY_PRODUCT_ID` | Dodo product IDs for Pro Monthly/Annual/Lifetime |

---

## Storage schema

### `chrome.storage.sync` (extension)

```js
// Bookmarks: key = "bm_{videoId}"
{
  id:             number,      // Date.now() — creation sort key
  videoId:        string,
  timestamp:      number,      // seconds (float)
  description:    string,
  tags:           string[],    // parsed from #tag syntax in description
  color:          string,      // derived from first tag
  createdAt:      string,      // ISO date
  videoTitle:     string,
  videoDuration:  number|null,
  reviewSchedule: number[],    // [1, 3, 7] days for spaced revisit
  lastReviewed:   string|null
}

// Revisit reminder: key = "rem_{videoId}"
{ days: number, nextDue: string, setAt: string }

// Groups: key = "vgroups"
[{ id: string, name: string, videoIds: string[] }]

// Auth: key = "bmUser"
{ userId, userEmail, accessToken, refreshToken, isPro }
```

### Supabase tables (see `webapp/migrations/`)

| Table | Description |
|---|---|
| `collections` | Public shared bookmark pages (`/v/[shareId]`) |
| `profiles` | User accounts; `is_pro` flag; `username` |
| `user_bookmarks` | Cloud-synced bookmarks per user+video |
| `revisit_reminders` | Server-side revisit reminders (frequency, next_due_at) |
| `groups` | User-defined video groups (`custom` or `tag` type) |
| `group_collections` | Many-to-many: group ↔ video_id (TEXT, not UUID FK) |

---

## Design system

- **Single source of truth**: `packages/design-system/tokens.css`
- **Never** edit design tokens directly in `extension/styles/design-tokens.css` or `webapp/app/design-tokens.css`
- After editing tokens, run `npm run sync-tokens` (or `make sync-tokens`) to propagate changes
- Brand palette: teal `#14B8A6` (accent), purple `#8B5CF6` (secondary), dark bg `#0F172A`
- Both light and dark themes are defined in tokens.css via `[data-theme="dark"]`

---

## Tag system (extension)

Tags are parsed from `#word` patterns in bookmark descriptions. Named tag colors:

| Tag | Color |
|---|---|
| `#important` | `#ff6b6b` (red) |
| `#review` | `#ffa94d` (orange) |
| `#note` | `#74c0fc` (blue) |
| `#question` | `#a9e34b` (green) |
| `#todo` | `#da77f2` (purple) |
| `#key` | `#f783ac` (pink) |

Unknown tags get a deterministic hash-based HSL color.

---

## Extension architecture notes

- **No build step** in the extension — all JS is plain ES2020, loaded directly by Chrome
- **No module imports** in extension JS files — all helpers must be globals or inline
- `local-ai.js` is loaded before `popup.js` / `side-panel.js` via `<script>` tags; its functions are globals
- The service worker (`background.js`) uses a `keepalive` alarm (every 0.4 min) to prevent MV3 service worker shutdown
- The extension communicates with the webapp via `chrome.runtime.onMessageExternal` (for auth token handoff after OAuth) and `fetch` calls to `API_BASE`
- `API_BASE` is set in `extension/src/popup/popup.js` (top of file). In production it points to `https://clipmark.mithahara.com`; change to `http://localhost:3000` for local dev. The file `extension/src/config.example.js` documents this

---

## Webapp architecture notes

- Uses Next.js 14 **App Router** (all routes under `webapp/app/`)
- Database migrations run automatically before every build (`npm run build` = `tsx scripts/migrate.ts && next build`)
- To run migrations independently: `npm run migrate` (or `make migrate`) — migrations are idempotent SQL files numbered `001–006`
- Supabase client is in `webapp/lib/supabase.ts`
- Pro gating: check `profiles.is_pro` via Supabase; Dodo Payments webhook at `/api/webhooks/dodo` updates this flag
- Token auto-refresh endpoint: `POST /api/refresh` — called by the extension when the access token is near expiry

---

## Monetization / Pro tier

- **Free**: unlimited local bookmarks, 5 public shared collections, no AI features, no Revisit Mode
- **Pro** ($5/mo or $40/yr): unlimited shares, all AI features, Revisit Mode, social post generation
- Payment processor: Dodo Payments (handles VAT/global tax compliance)
- Webhook verifies signature and sets `is_pro` on the user's profile in Supabase

---

## Keyboard shortcuts (extension)

| Shortcut | Action |
|---|---|
| `Alt+B` | Silent-save bookmark (with transcript auto-fill) |
| `Ctrl+Shift+S` / `Cmd+Shift+S` | Quick-save bookmark |

---

## Known patterns and conventions

- Bookmark IDs use `Date.now()` (integer milliseconds) — serves as both unique ID and sort key
- Storage key convention: `bm_{videoId}` for bookmarks, `rem_{videoId}` for reminders, `vgroups` for groups, `bmUser` for auth
- Duplicate bookmarks are rejected if `Math.floor(timestamp)` already exists for the same video
- `group_collections.collection_id` is a `TEXT` column (stores `video_id` string), **not** a UUID foreign key — this was changed in migration 005
- Playwright tests load the extension from `extension/` using `launchPersistentContext`; tests run serially (`workers: 1`) and non-headless
- The `shared-styles.css` at the repo root is a shared CSS base that can be referenced in both extension and webapp contexts

---

## Errors and workarounds encountered

- **MV3 service worker timeout**: Service workers in Manifest V3 are killed after ~5 minutes of inactivity. Workaround: a `keepalive` alarm fires every 0.4 minutes in `background.js` to keep the service worker alive for features that need persistence (context menus, OAuth coordination).
- **`chrome.sidePanel` availability**: `chrome.sidePanel.open()` is only available in Chrome 114+; errors are caught and logged but don't crash the extension.
- **Extension context invalidated**: When the extension is reloaded while a YouTube tab is open, the content script handle becomes invalid. The content script handles `chrome.runtime.lastError` gracefully and retries up to 3 times before showing a friendly error.
- **YouTube SPA navigation**: YouTube is a single-page app. The content script watches for `yt-navigate-finish` events to reset markers and reload bookmarks when navigating between videos without a full page reload.
- **`group_collections.collection_id` type change**: Migration 005 changed this column from a UUID foreign key to a `TEXT` column storing `video_id` strings. If you see type errors in group queries, verify the column type is `TEXT`.
- **Playwright non-headless requirement**: Chrome extensions cannot load in headless mode. If tests fail with extension-not-found errors, ensure `headless: false` is set in `playwright.config.ts` and that `--load-extension` path is correct.
