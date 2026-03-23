# Clipmark — YouTube Video Bookmarker

> **Turn long YouTube videos into searchable, revisable knowledge.**

A Chrome extension + Next.js webapp that lets you bookmark timestamps in YouTube videos, replay only what matters, and share structured knowledge with the world.

Live at **[clipmark-chi.vercel.app](https://clipmark-chi.vercel.app)**

---

## Who is it for?

**Developers** — Reviewing a 2-hour system design lecture before an interview? Hit ▶ Revisit Mode and play only your saved clips back to back. `2 hours → 6 minutes`.

**Students** — Spaced Revisit resurfaces your bookmarks at 1, 3, and 7 days after saving — like flashcards for video.

**Creators** — Bookmark key moments from a podcast, hit ✍ Post, and AI writes a platform-tuned caption with a share link attached.

---

## Features

- **Bookmark any moment** — one click, optional description, auto-tagged
- **Visual progress bar markers** — colored dots on the YouTube seek bar
- **`#tag` syntax** — `#important`, `#review`, `#key`, etc. with named colors
- **Revisit Mode** — plays only your bookmarked segments, back to back
- **Spaced Revisit** — resurfaces bookmarks on a 1/3/7-day schedule
- **AI features (Pro)** — auto-description from transcript, tag suggestions, social post generator
- **Dashboard** — card/timeline/groups view, search, sort, bulk delete
- **Side panel** — persistent access alongside any YouTube video
- **Export / Import** — JSON, CSV, Markdown
- **Share** — publish any video's bookmarks to a public URL (`/v/{shareId}`)
- **Cloud sync** — bookmarks pushed to Supabase when signed in
- **Sign in with Google** — OAuth through the webapp

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

## Testing

```bash
npx playwright install chromium   # first time only
npm run test:yt
```

---

## License

Copyright © 2026 Clipmark. All rights reserved. This software is proprietary and not open source.
