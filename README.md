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

### Revisit & Learning
- **Revisit Mode** — plays only your bookmarked segments back to back
- **Reminders & Re-engagement** — schedule revisits for any video or group (once, daily, weekly, bi-weekly, monthly); due reminders surface with a badge in the sidebar
- **Spaced Revisit** — resurfaces bookmarks on a 1/3/7-day schedule

### Dashboard & Organisation
- **Dashboard** — card / timeline / groups view, search, sort, bulk delete
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
- **Cloud sync** — bookmarks pushed to Supabase when signed in
- **Sign in with Google** — OAuth through the webapp

### Other
- **Export / Import** — JSON, CSV, Markdown
- **Upgrade / Pro** — Dodo Payments integration; Pro Monthly and Pro Annual plans

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
Copy `.env.local.example` to `.env.local` and fill in your Supabase, Anthropic, and Dodo Payments keys.

Set `API_BASE` at the top of `extension/src/popup/popup.js` to `http://localhost:3000` for local dev.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+B` | Silent-save bookmark at current timestamp |
| `Ctrl+Shift+S` / `Cmd+Shift+S` | Quick save bookmark |

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| Extension | Vanilla JS, Chrome Manifest V3 |
| Webapp | Next.js 14, TypeScript |
| Database | Supabase (PostgreSQL) |
| Auth | Google OAuth via Supabase |
| AI | Anthropic Claude Haiku |
| Payments | Dodo Payments |
| Hosting | Vercel |

---

## Project Structure

```
extension/          Chrome extension source (Manifest V3)
  src/
    content/        Content script — injected into YouTube
    popup/          Extension popup UI
    background/     Service worker
webapp/             Next.js 14 webapp
  app/
    dashboard/      Authenticated dashboard pages
    api/            API routes (share, bookmarks, webhooks)
    v/[shareId]/    Public share pages
  migrations/       Supabase SQL migrations
```

---

## Documentation

Non-code documentation and planning is organized in the following directories:

| Directory | Purpose |
|---|---|
| [`/architecture`](./architecture/) | System design documents, diagrams, and architectural overviews |
| [`/ideas`](./ideas/) | Feature proposals, brainstorms, and early-stage exploration |
| [`/decisions`](./decisions/) | Architecture Decision Records (ADRs) — key decisions and their rationale |
| [`/specifications`](./specifications/) | Detailed technical specifications for features and integrations |
| [`/api`](./api/) | HTTP API endpoint documentation |

Each directory contains a `README.md` with contribution guidelines and a `template.md` to help you get started quickly.

---

## Testing

```bash
npx playwright install chromium   # first time only
npm run test:yt
```

---

## Contributing

The `main` branch is protected — all changes must come in through a pull request with at least one review. Branch off `main`, open a PR, and request a review.

---

## License

Copyright © 2026 Clipmark. All rights reserved. This software is proprietary and not open source.
