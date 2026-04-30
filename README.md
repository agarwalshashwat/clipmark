# Clipmark — YouTube Video Bookmarker

> **Turn long YouTube videos into searchable, revisable knowledge.**

A Chrome extension + Next.js webapp that lets you bookmark timestamps in YouTube videos, replay only what matters, and share structured knowledge with the world.

Live at **[clipmark.mithahara.com](https://clipmark.mithahara.com)**

---

## Who is it for?

**Developers** — Reviewing a 2-hour system design lecture before an interview? Hit ▶ Revisit Mode and play only your saved clips back to back. `2 hours → 6 minutes`.

**Students** — Schedule revisit reminders at any cadence (daily, weekly, monthly) so you come back to important content before it fades.

**Creators** — Bookmark key moments from a podcast, hit ✍ Post, and AI writes a platform-tuned caption with a share link attached.

---

## Features

### Core Bookmarking

- **Bookmark any moment** — one click, optional description, auto-tagged
- **Visual progress bar markers** — always-visible diamond nubs on the YouTube seek bar with rich hover tooltips (timestamp, description, tag chips)
- **16px invisible click target** — easy to hit without pixel-perfect aim
- **Active marker pulse** — the marker at the current playback position briefly pulses/glows
- **`#tag` syntax** — `#important`, `#review`, `#key`, etc. with named colors
- **Marker clustering** — nearby markers merge into a cluster marker when a video has many bookmarks
- **Context menu** — right-click any YouTube page to "Bookmark at current time" or "Bookmark quote" from selected text

### Revisit & Learning

- **Revisit Mode** — plays only your bookmarked segments back to back
- **Reminders & Re-engagement** — schedule revisits for any video or group (once, daily, weekly, bi-weekly, monthly); due reminders surface with a badge in the sidebar
- **Spaced Revisit** — resurfaces bookmarks on a 1/3/7-day schedule

### Dashboard & Organisation

- **Dashboard** — card / timeline / groups / videos view, search, sort, bulk delete
- **Analytics** — 14-day activity heatmap, tag frequency chart, top videos by bookmark count
- **Groups** — create custom groups (manual curation) or tag-based auto-groups; add/remove videos per group
- **Timeline grouping** — multiple clips from the same video on the same day grouped into one card
- **Side panel** — persistent access alongside any YouTube video

### AI (Pro)

- **Auto-description** — fills description from live transcript at current timestamp (Claude Haiku)
- **Summary** — AI overview, key topics, and action items for a video's bookmarks
- **Smart tag suggestions** — clickable chips suggested after auto-fill
- **Social post generator** — X/Twitter, LinkedIn, or Threads caption with share link

### Sharing & Sync

- **Share** — publish any video's bookmarks to a public URL (`/v/{shareId}`)
- **Embed widget** — embed a shared collection as an `<iframe>` on any site
- **Cloud sync** — bookmarks pushed to Supabase when signed in
- **Sign in with Google** — OAuth through the webapp
- **Public profile** — every user gets a `/u/[username]` page with their public collections
- **YouTube comments** — view top comments alongside a video's bookmarks in the dashboard

### Growth & Monetisation

- **Refer & Earn** — share your personal referral link; earn 3 free Pro months per friend who converts
- **Affiliate program** — invite-only; track clicks and commission-based conversions with a dedicated dashboard
- **Gifted Pro** — admin can grant Pro access to partners and creators without a payment

### Other

- **Export / Import** — JSON, CSV, Markdown
- **Upgrade / Pro** — Dodo Payments integration; Pro Monthly, Pro Annual, and Lifetime plans

---

## Installation

**Load the extension (dev)**

1. Clone this repo
2. Go to `chrome://extensions/` → enable **Developer mode**
3. **Load unpacked** → select the `extension/` folder

**Run the webapp locally**

```bash
cd webapp && npm install && npm run dev
```

Copy `.env.example` to `.env.local` and fill in your Supabase, Anthropic, and Dodo Payments keys.

Set `API_BASE` at the top of `extension/src/popup/popup.js` to `http://localhost:3000` for local dev.

---

## Keyboard Shortcuts

| Shortcut                       | Action                                                                |
| ------------------------------ | --------------------------------------------------------------------- |
| `Alt+S`                        | Silent-save bookmark at current timestamp (with transcript auto-fill) |
| `Alt+B`                        | Open the extension popup                                              |
| `Ctrl+Shift+S` / `Cmd+Shift+S` | Quick save bookmark                                                   |
| `[` / `]`                      | Skip to prev / next clip during Revisit Mode                          |

---

## Tech Stack

| Layer      | Stack                                         |
| ---------- | --------------------------------------------- |
| Extension  | Vanilla JS, Chrome Manifest V3                |
| Webapp     | Next.js 14, TypeScript                        |
| Database   | Supabase (PostgreSQL)                         |
| Auth       | Google OAuth via Supabase                     |
| AI (cloud) | Anthropic Claude Haiku                        |
| AI (local) | Chrome built-in `LanguageModel` (Gemini Nano) |
| Payments   | Dodo Payments (MoR, global VAT)               |
| Hosting    | Vercel                                        |

---

## Project Structure

```
extension/          Chrome extension source (Manifest V3, no build step)
  src/
    constants.js    Shared constants, tag colors, URL helpers
    content/        Content script — injected into YouTube
    popup/          Extension popup UI + dashboard + side panel
    background/     Service worker (keep-alive, context menus, commands, OAuth)
    ai/             On-device Gemini Nano helpers
packages/
  design-system/    Single source of truth for CSS design tokens
webapp/             Next.js 14 webapp
  app/
    dashboard/      Authenticated dashboard (cards, timeline, groups, analytics,
                    reminders, affiliate, referral)
    api/            API routes (bookmarks, share, summarize, suggest-tags,
                    generate-post, comments, referrals, affiliate, webhooks)
    v/[shareId]/    Public share pages
    u/[username]/   Public user profile pages
    embed/[shareId]/ Embeddable iframe widget
  lib/              Supabase client helpers
  migrations/       11 SQL migration files (idempotent, auto-run on build)
tests/
  unit/             Pure-logic unit tests (Node.js, no browser)
  *.spec.ts         Playwright E2E tests (non-headless Chrome with extension)
```

---

## Testing

```bash
# Pure logic — runs instantly, no browser needed
npm run test:unit

# E2E — opens a real Chrome window with the extension loaded
npx playwright install chromium   # first time only
npm run test:yt

# Both suites together
npm run test:all
```

The E2E suite covers:

- YouTube DOM selector alignment (progress bar, player controls, title element)
- Extension UI injection and double-injection guards
- Bookmark lifecycle (save → persist → reload)
- Marker interactions (click-to-seek, hover tooltips, tag chips, duplicate rejection)
- `chrome.storage.sync` schema validation

---

## Contributing

The `main` branch is protected — all changes must come in through a pull request with at least one review. Branch off `main`, open a PR, and request a review.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

---

## License

Copyright © 2026 Clipmark. All rights reserved. This software is proprietary and not open source.
