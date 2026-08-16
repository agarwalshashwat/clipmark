# ClipMark — Chrome Web Store Dashboard Fields (Copy/Paste)

**Date:** 2026-07-31
**Purpose:** paste-ready field values for the **existing beta listing** (item ID `iboippnihpcnnglgboaiedaiimbiolgg`, currently published to testers as "Clipmark"). This doc is a dashboard-formatted extract of [chrome-web-store-listing.md](chrome-web-store-listing.md) — read that doc for rationale/alternates; this one is just the fields, in the order the Developer Dashboard's "Store listing" tab presents them.
**Scope:** copy/paste handoff only. No Web Store API calls made, no prod touched — the owner applies these by hand in the dashboard.

---

## Changes to apply to the current beta listing

The beta listing is currently live with the wrong casing and (possibly) stale copy. Three must-dos, in order:

1. **Fix the name casing.** The dashboard "Title" field almost certainly still reads `Clipmark` (lowercase "m"). Replace it with the corrected title below (`ClipMark` — capital M throughout this doc and the product).
2. **Re-upload the corrected package.** `extension/manifest.json` on `main` now ships `"name": "ClipMark"` / `"short_name": "ClipMark"` (fixed in [PR #58](https://github.com/agarwalshashwat/clipmark/pull/58)). Build a fresh zip (`make ext-zip`) from current `main` and upload it as a new package version — otherwise the install-time permission dialog and `chrome://extensions` entry will keep showing the old lowercase name even after the dashboard listing text is fixed, and the two will visibly disagree to testers.
3. **Replace any old copy that overpromises.** If the current beta listing's summary/description predates the pricing-claims honesty pass, check it for:
   - The word **"sync"** applied to Notion or Obsidian — the real feature is a one-off **export**, not live sync. Replace with the description below.
   - Any mention of **Deep Transcript Search**, **Lifetime Cloud Archiving**, **Permanent Transcript Archiving**, or **"early access to labs"** — none of these are built; they're `ComingSoon`-tagged on the pricing page and must not appear in the store listing as if live.
   - Any claim of unlimited free usage where a real cap exists — Free is capped (25 Active Recall segments standing, 30 reviews/mo, 10 Anki exports/mo, 10 shared collections); **Pro is unlimited** on all of those. Say it that way, not "unlimited" across the board.

Everything below is written clean against those three constraints — safe to paste as-is.

---

## Title / Name

**Field:** Store listing → *Title* (also drives what testers/reviewers see; separate from `manifest.json`'s `name`, but should match it — see must-do #2 above)
**Limit:** 75 characters max
**Paste this (48 chars):**

```
ClipMark — Study Smarter with YouTube Flashcards
```

---

## Summary (short description)

**Field:** Store listing → *Summary*
**Limit:** 132 characters max
**Character count of the pick below: 90 / 132**
**Paste this:**

```
Capture YouTube timestamps, quiz yourself with spaced repetition, export straight to Anki.
```

---

## Detailed description

**Field:** Store listing → *Description*
**Paste this as-is** (plain text; the CWS editor supports line breaks and emoji, no markdown/HTML):

```
Turn YouTube lectures into flashcards you actually remember.

ClipMark lets you bookmark the exact moment that matters in any YouTube video — a
professor's explanation, a mechanism, a diagram — then brings that moment back for
review before you forget it. Built for anyone learning from video, and tuned for
students who live in Anki: the workflow already works with Boards & Beyond, Sketchy,
Ninja Nerd, and any other lecture you study from.

WHY CLIPMARK

Most note-taking tools summarize a video once and let you forget it. ClipMark is
built around retention, not summarization — capture the moment, then let spaced
review bring it back until it sticks.

HOW IT WORKS

📌 Capture in one keystroke
Hit a shortcut (or the ClipMark button) while a YouTube video plays to save the exact
timestamp — no pausing, no switching tabs. Add a quick note and tag, or let ClipMark's
on-device AI draft one for you from the surrounding transcript (free, runs entirely in
your browser — nothing leaves your device).

🧠 Active Recall Mode
This is the core loop: when a saved moment comes due for review, ClipMark shows you
the timestamp and tags but hides your note. Try to recall it first — then reveal your
note and replay the clip to confirm. Say "got it" and the next review interval
doubles; say "again" and it comes back tomorrow. It's spaced repetition built for
video, not flashcard text.

🔗 Every card links back to the source
No paraphrasing, no lossy summary — every review links straight back to the exact
second in the original video, so you're reviewing the professor's actual explanation,
not someone's rewrite of it.

📤 Export straight to Anki
ClipMark doesn't compete with Anki — it feeds it. One click exports your reviewed
segments (note, timestamp, and a deep link back to the moment) into an
Anki-importable file, so you keep the deck and workflow you already trust.

🗂️ Share a collection
Turn a lecture series into a shareable ClipMark collection — a public link classmates
can open to see the same bookmarked moments, the same way AnKing-style shared decks
already circulate in study groups.

🏷️ Smart tags
Add #tags in your notes and ClipMark colors and organizes them automatically, so a
semester's worth of bookmarks stays browsable instead of turning into a pile.

FREE VS. PRO

Free gets you the full loop, generously capped: unlimited local bookmarks, 25
standing Active Recall segments, 30 reviews a month, 10 Anki exports a month, and up to
10 shared collections — enough to build and review a real deck from one full lecture.

Pro removes the caps and adds cross-device cloud sync, unlimited Active Recall and
Anki exports, unlimited shared collections, and one-click export to Notion and
Obsidian.

WHO IT'S FOR

Built first for USMLE Step 1/Step 2 students and IMGs studying from free YouTube
lecture channels alongside Anki — but the same loop works for any course, lecture, or
video you're trying to actually retain, not just watch once.

Get started: install ClipMark, open any YouTube video, and save your first moment.
```

---

## Category

**Field:** Store listing → *Category*
**Select:** `Productivity`

## Language

**Field:** Store listing → *Language*
**Select:** `English` (no localized copy exists yet — every claim above assumes an English-reading, USMLE/IMG-adjacent audience per the strategy brief; don't add other languages until real localized copy exists)

---

## Screenshots (5) — shot checklist

CWS displays these in order before install, so shoot them as a story — outcome first, mechanism second. Capture at **1280×800 PNG**, no padding/letterboxing, real product UI (no mockup chrome).

- [ ] **Screenshot 1 — the payoff moment.** Active Recall overlay mid-quiz on a real lecture (e.g. a Boards & Beyond–style video) — timestamp + tags visible, note hidden, "Reveal" button waiting.
  **Caption overlay:** "Recall it before you replay it."
- [ ] **Screenshot 2 — the capture moment.** YouTube video playing with the ClipMark capture UI open — timestamp just saved, AI-drafted note visible, tag chips shown.
  **Caption overlay:** "One keystroke saves the moment — AI drafts the note for you."
- [ ] **Screenshot 3 — the bridge to Anki.** Dashboard/export screen showing a segment being exported, with the resulting Anki-importable file and a visible deep link back to the timestamp.
  **Caption overlay:** "Export straight to Anki — every card links back to the source."
- [ ] **Screenshot 4 — the habit view.** Dashboard showing the due-for-review queue/strip across multiple saved lectures, spaced-repetition intervals visible.
  **Caption overlay:** "Spaced review that brings it back until it sticks."
- [ ] **Screenshot 5 — the social/shareable moment.** A shared collection page (public link view) with a lecture series' worth of bookmarks.
  **Caption overlay:** "Share a collection — study the same deck as your classmates."

---

*Source doc: [chrome-web-store-listing.md](chrome-web-store-listing.md) (title/summary alternates, rationale, demo video outline, keyword list, review-flywheel trigger). Casing fix reference: [PR #58](https://github.com/agarwalshashwat/clipmark/pull/58).*
