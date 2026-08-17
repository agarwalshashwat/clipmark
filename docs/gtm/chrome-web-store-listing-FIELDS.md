# ClipMark — Chrome Web Store Dashboard Fields (Copy/Paste)

**Date:** 2026-08-17 — SEO pass. Keyword-optimized against the research in [chrome-web-store-listing.md](chrome-web-store-listing.md) §0.
**Purpose:** paste-ready field values for the live listing (item ID `iboippnihpcnnglgboaiedaiimbiolgg`).
**Scope:** copy/paste handoff only. No Web Store API calls made, no prod touched — the owner applies these by hand.

---

## 🚨 Read first: two of these three fields are NOT dashboard-editable

This is the thing that trips people up, and an earlier version of this doc got it wrong.

| Field | Where it actually comes from | How to change it |
|---|---|---|
| **Title** (the big text in search results) | **`extension/manifest.json` → `name`** | Edit the manifest, bump the version, rebuild, **re-upload the package** |
| **Summary** (the grey line under the title) | **`extension/manifest.json` → `description`** | Same — manifest edit + re-upload |
| **Detailed description** | **Dashboard → Store listing tab** | Paste and save. Live after review |

Only the detailed description, screenshots and category are editable from the dashboard. **The title — the single highest-weight ranking field — requires a package upload.**

> **✅ The good news: v1.0.7 is already pending upload.** The manifest changes below should ride along with that upload, so the SEO title and summary cost **zero extra review cycles**. If v1.0.7 ships without them, the next chance is the release after.

**⚠️ And the standing gate:** the published build is still **v1.0.6, which caps free Anki export at 1/month**. Every description below says **10/month**, which is v1.0.7. **Upload v1.0.7 before pasting this copy** — promising 10 against a package that allows 1 is a mis-sell on the highest-traffic surface ClipMark owns, and a store listing is slower to correct than a website. See the timing note in [posting-kit.md](posting-kit.md).

---

## 1. Title

**Source:** `extension/manifest.json` → `name` · **Hard limit: 75 characters** (universal since Feb 2024)
**Practical limit: ~35 characters** — that's roughly where the Chrome Web Store truncates a title in search results. Everything past 35 still counts for keyword matching, but a searcher won't read it.

**Current value is `ClipMark` — a bare brand name with zero keywords in the highest-weight field ClipMark controls.** Fixing that is the single biggest lever in this document.

**✅ Recommended (55 chars):**

```
ClipMark: YouTube Notes, Flashcards & Spaced Repetition
```

*First 35 render as `ClipMark: YouTube Notes, Flashcards` — brand, then the two highest-intent keywords, both fully visible before the cut. "Spaced Repetition" sits past the truncation point where it still earns the keyword match without costing anything visible.*

**Alternate A — Anki-forward (50 chars):**

```
ClipMark — YouTube Flashcards, Notes & Anki Export
```
*Use if the Anki audience is the priority. "Anki" is lower-volume but very high-intent, and the competition on it is thin.*

**Alternate B — shortest, cleanest (37 chars):**

```
ClipMark – YouTube Notes & Flashcards
```
*Nothing truncates. Fewer keyword matches, best readability. Pick this if the listing is going to lean on the screenshots.*

> **Do not** pack more keywords in. Listing policy prohibits **keyword spam**, defined to include *"unnatural repetition of the same keyword more than 5 times"* and *"lists of … keywords"* with no added value. A title like *"ClipMark: YouTube Notes, Video Bookmarks, Timestamps, Flashcards, Anki, Study, Spaced Repetition"* is a rejection risk, not a clever one.

---

## 2. Summary (short description)

**Source:** `extension/manifest.json` → `description` · **Hard limit: 132 characters**
This is the grey line under the title in search results — the only body copy most searchers read.

**Current value (108 chars):** `Capture YouTube timestamps, quiz yourself with spaced-repetition Active Recall, and export straight to Anki.`
Accurate, but it spends its budget on mechanics and never says what the user gets, and it omits "notes" and "flashcards" — two of the highest-volume terms in the category.

**✅ Recommended (116 chars):**

```
YouTube notes and flashcards that quiz you back: timestamps, spaced repetition, Anki export. AI runs on your device.
```

*Leads with the two biggest keywords, states the benefit ("quiz you back"), and closes on the differentiator no competitor has.*

**Alternate — benefit-first (118 chars):**

```
Turn YouTube lectures into flashcards. Timestamped notes, spaced repetition, free Anki export. AI runs on your device.
```

---

## 3. Detailed description

**Field:** Dashboard → Store listing → *Detailed description* · **Dashboard-editable, no package upload needed**
**Paste as-is.** Plain text; the editor supports line breaks and emoji, no markdown or HTML.

The first paragraph carries the most algorithmic weight and is what shows in previews — it is deliberately dense with the target keywords and still reads like a sentence a human wrote.

```
Turn YouTube into flashcards you actually remember.

ClipMark is a study extension for YouTube. Save timestamped notes on any YouTube
video, loop the passage you need to drill, then get quizzed on it days later with
spaced repetition — and export your cards to Anki for free. Built for students,
self-teachers, and anyone who learns from long lectures, tutorials and talks.

One job: help you actually remember what you study. Whatever you're studying.

THE AI RUNS INSIDE YOUR BROWSER

ClipMark can draft a note for you from the surrounding transcript using Chrome's
built-in on-device AI. Nothing is uploaded. Your lecture transcripts never leave
your laptop, because there is no server to send them to. That is also why AI
note drafting is on the free tier instead of behind the paywall — it costs
nothing to run.

HOW IT WORKS

📌 Timestamped notes, one keystroke
Hit a shortcut while the video plays to save the exact second — no pausing, no
switching tabs. Add a note and tags, or let the on-device AI draft one for you.

🔁 A–B loops for the part that matters
Mark A, mark B, and loop just that passage until it's drilled. Several segments
per video, all editable. Looping is never capped, on any plan.

🧠 Active recall, on a spaced repetition schedule
Saved moments come back at 1, 3, then 7 days, doubling out to a 60-day maximum.
Answer "again" and it returns tomorrow. Active Recall is on the free tier, not
locked behind Pro.

🔗 Your note is the question. The clip is the answer.
When a moment comes due, ClipMark shows the timestamp and your tags but hides
your note. You try to remember it, then reveal and replay the exact second to
check yourself. Tools that quiz you on a video generate the questions from the
transcript; ClipMark asks you about the note you wrote, and hands you the source
as the answer key. No paraphrase in between.

📤 Free export to Anki
One click turns your saved moments into YouTube flashcards Anki can import —
note, timestamp, and a deep link back to the exact second. ClipMark doesn't
replace Anki, it feeds it: Anki is where a card lives for years, and this is the
step before the card exists, while you're still in the video.

🏷️ Tags that organise themselves
Add #tags in a note and ClipMark colours and groups them, so a semester of
bookmarks stays browsable.

🗂️ Shareable collections
Turn a YouTube lecture series into a public link classmates can open.

WORKS WITHOUT AN ACCOUNT

Capture, loops, active recall and Anki export all work signed out. Only cloud
sync and shared collections need an account. No card, no trial countdown.

FREE VS PRO

Free, every month: 10 Anki exports, 30 recall reviews, 25 moments enrolled in
Active Recall at a time, 3 saved A–B loops, and unlimited local bookmarks,
notes and tags. On-device AI note drafting is included.

Pro is $7.99/month USD, $59.99/year USD, or $99.99 USD once (local tax added at
checkout). It removes those caps and adds cross-device cloud sync, scheduled
review reminders, and one-click export to Notion and Obsidian.

WHO IT'S FOR

Anyone who studies from YouTube and is tired of watching things twice. Medical and
undergraduate students working through recorded lectures, language learners
drilling a phrase until the pronunciation sticks, musicians looping four bars,
developers working through a long conference talk. Same problem every time: you
watched it, you understood it, and a week later it's gone.

Install ClipMark, open any YouTube video, and save your first moment.
```

---

## 4. Category and language

**Primary category:** `Productivity`
*Considered and rejected: `Education`. Productivity is the larger surface and the one the competitor set sits in. Revisit if rank tracking shows Education converting better.*

**Language:** `English` — the copy targets US/UK/AU study audiences. Don't add locales until real localized copy exists; an unlocalized locale is a keyword-spam signal, not a reach win.

---

## 5. Screenshots

Full shot list, plain-language captions and the reasoning are in
**[chrome-web-store-listing.md](chrome-web-store-listing.md) §4** — that section is the one to hand to whoever produces the images.

**Specs:** 1280×800 PNG, no padding or letterboxing, real product UI. Up to 5; ship all 5.

---

## 6. After it's live — track whether any of this worked

Covered in [chrome-web-store-listing.md](chrome-web-store-listing.md) §5. Short version: record the baseline ranks **before** uploading, then re-check weekly with **[Extension Ranker](https://extensionranker.com/tools/rank-checker)**.
