# Contributing

> This is proprietary software. Do not redistribute or publish forks without permission.

## Project Structure

```
youtube-vid-bookmarker/
├── extension/                  # Chrome Extension (Manifest V3, vanilla JS)
│   ├── manifest.json
│   ├── assets/icons/
│   ├── src/
│   │   ├── background/background.js   # Service worker: auth token storage, messaging
│   │   ├── content/content.js         # YouTube page: markers, keyboard shortcuts, revisit mode
│   │   ├── pages/                     # popup.html, dashboard.html, side-panel.html
│   │   └── popup/
│   │       ├── popup.js               # Bookmark CRUD, AI features, auth, reminders
│   │       ├── dashboard.js           # Dashboard: cards, timeline, groups, export/import
│   │       ├── side-panel.js
│   │       └── theme-loader.js
│   └── styles/                        # popup.css, dashboard.css, side-panel.css, design-tokens.css
│
├── packages/design-system/            # Shared CSS design tokens (extension + webapp)
│
├── webapp/                            # Next.js 14 + Supabase
│   ├── app/
│   │   ├── api/
│   │   │   ├── share/                 # POST — store collection, return shareId
│   │   │   ├── bookmarks/             # PUT  — upsert per-video bookmarks (cloud sync)
│   │   │   ├── summarize/             # POST — AI summary via Claude Haiku
│   │   │   ├── suggest-tags/          # POST — AI tag suggestions
│   │   │   ├── generate-post/         # POST — AI social post
│   │   │   ├── refresh/               # POST — token auto-refresh
│   │   │   └── webhooks/dodo/         # POST — Dodo Payments webhook → update is_pro
│   │   ├── auth/                      # Google OAuth callback + extension handoff
│   │   ├── dashboard/                 # Main dashboard (queue, groups, shared views)
│   │   ├── upgrade/                   # Pricing page + Server Action checkout
│   │   ├── v/[shareId]/               # Public shared collection page
│   │   ├── embed/[shareId]/           # Embeddable iframe page
│   │   └── u/[username]/              # Public user profile page
│   ├── lib/supabase.ts
│   └── migrations/                    # SQL schema migrations
│
└── tests/                             # Playwright e2e tests
```

---

## Storage Schema

Bookmarks are stored per-video in `chrome.storage.sync`:

```js
// Key: "bm_{videoId}"  →  Value: Bookmark[]
{
  id:             number,      // Date.now() — also creation sort key
  videoId:        string,
  timestamp:      number,      // seconds (float)
  description:    string,
  tags:           string[],    // parsed from #tag in description
  color:          string,      // derived from first tag
  createdAt:      string,      // ISO date
  videoTitle:     string,
  videoDuration:  number|null, // total video duration in seconds
  reviewSchedule: number[],    // days after creation to resurface [1, 3, 7]
  lastReviewed:   string|null  // ISO date of last spaced-revisit interaction
}

// Key: "rem_{videoId}"  →  Value: RevisitReminder
{
  days:    number,  // user-defined revisit interval in days
  nextDue: string,  // ISO date of next reminder
  setAt:   string,  // ISO date reminder was created/updated
}

// Key: "vgroups"  →  Value: VideoGroup[]
{
  id:       string,    // uuid
  name:     string,
  videoIds: string[],
}
```

---

## Env Variables

Create `webapp/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
DODO_PAYMENTS_API_KEY=
DODO_PAYMENTS_WEBHOOK_SECRET=
DODO_MONTHLY_PRODUCT_ID=
DODO_ANNUAL_PRODUCT_ID=
DODO_LIFETIME_PRODUCT_ID=
```

---

## Local Dev Tips

- Set `API_BASE` at the top of `extension/src/popup/popup.js` to `http://localhost:3000` when running the webapp locally.
- Run `npm run sync-tokens` from the root to sync design tokens from `packages/design-system` into the extension and webapp.
- Tests: `npx playwright install chromium` (first time), then `npm run test:yt`.
