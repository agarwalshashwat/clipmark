# ClipMark — Chrome Web Store Listing (strategy + rationale)

**Date:** 2026-08-17 — rewritten as an SEO pass.
**This doc is the *why*.** The paste-ready field values are in
**[chrome-web-store-listing-FIELDS.md](chrome-web-store-listing-FIELDS.md)** — that's the one to work from at the dashboard.

**Why this matters:** for a Chrome extension with no ad budget, store search is the largest organic channel available, and the listing is the only part of it you control. The title alone carries more ranking weight than everything else on the page combined.

---

## 0. The research this is built on

### 0.1 Hard constraints (verified against Google's own docs)

| Constraint | Value | Source |
|---|---|---|
| **Title max** | **75 characters** (universal since 22 Feb 2024; was 45 for English) | [Chromium extensions PSA](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/mpDvFpT0KJM/m/WWFFQZFyAAAJ) |
| **Title shown in search** | **~35 characters** before truncation | [ExtensionFast ranking guide](https://www.extensionfast.com/blog/chrome-web-store-seo-complete-ranking-guide-for-2025) |
| **Summary max** | **132 characters** | manifest `description` field |
| **Title source** | `manifest.json` → `name` — **not dashboard-editable** | [Complete your listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) |
| **Summary source** | `manifest.json` → `description` — **not dashboard-editable** | same |
| **Keyword spam** | **Policy violation.** "Unnatural repetition of the same keyword more than 5 times"; lists of keywords with no added value | [Listing requirements policy](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements/) |
| **Misleading metadata** | Policy violation — titles, descriptions, screenshots must be accurate | same |

> **The two findings that change how this gets applied:**
>
> 1. **Title and summary are not dashboard fields.** They come from the manifest, so changing them means a package re-upload, not a paste. An earlier version of this doc claimed the title was "separate from `manifest.json`'s `name`" — that was wrong and it is corrected in FIELDS §"Read first". **Ride the change along with the pending v1.0.7 upload** and it costs no extra review cycle.
> 2. **Aggressive keyword packing is against policy, not just tacky.** High uninstall rates and misleading descriptions also damage rankings directly — so the SEO-optimal listing and the honest listing are the same listing here. That is convenient, and it is also why none of the retired claims come back.

### 0.2 What the ranking algorithm rewards

- **Title is the highest-weight field.** Exact keyword matches in the title beat the same keyword buried in the description. Treat it as a keyword decision, not a branding decision.
- **The first paragraph of the description is weighted well above the rest** — write the first 150–200 words as if nothing after them counts.
- **Install velocity and active users** matter more than lifetime install totals, so a listing change is best made *before* a traffic push, not after.
- **Uninstalls hurt.** A listing that oversells is worse than one that undersells, twice over: once at review, once in the ranking.

### 0.3 The keyword landscape

Grouped by intent, with the competition actually holding the term.

| Keyword cluster | Intent | Competition | Verdict |
|---|---|---|---|
| **youtube notes**, take notes on youtube, youtube note taking | High — the category's front door | **Crowded**: LunaNotes, YiNote, Rocket Note, TubeMemo, Video Notebook | **Target.** Highest volume in the set. We won't rank #1 quickly, but not appearing at all is the current state |
| **youtube flashcards**, video flashcards | High, and precisely our wedge | **Thin**: TubeStack, Knowt | **Target hard.** Best volume-to-competition ratio available |
| **spaced repetition**, active recall | High, self-selecting for the study audience | Moderate: ActiveRecall, Recall, Web Highlights | **Target.** These users convert — they already believe in the method |
| **anki youtube**, export to anki | Lower volume, **highest intent** | **Thin**: Klarrity | **Target.** Small pool, but they arrive knowing what they want |
| **youtube timestamps / bookmarks** | Medium | Moderate | **Secondary** — describes the mechanic, not the outcome |
| **loop youtube section**, youtube looper | High volume, **wrong intent** | **Saturated + free**: Looper for YouTube (~400K), YouTube Looper, Video Speed Controller | **Do not position here.** `COMPETITIVE-BRIEF.md` T4 (PR #143, not yet merged) says the same: loops are an acquisition hook, not the paid story. Mention the feature, never lead with it |
| **youtube summarizer** | High volume | Saturated, and a conceded space | **Avoid.** We deliberately don't summarize; ranking here would import users who'll uninstall |

### 0.4 How the competitors title themselves

| Extension | Title | Users | Pattern |
|---|---|---|---|
| [Web Highlights](https://chromewebstore.google.com/detail/web-highlights-pdf-web-hi/hldjnlbobkdkghfidgoecgmklcemanhm) | `Web Highlights: PDF & Web Highlighter + Notes & AI Summary` (58) | 200K | Brand + **four** keyword phrases |
| [Language Reactor](https://chromewebstore.google.com/detail/language-reactor/hoombieeljmmljlkjmnheibnpciblicm) | `Language Reactor` (16) | 2M | **Bare brand** |
| [Looper for YouTube](https://chromewebstore.google.com/detail/looper-for-youtube/iggpfpnahkgpnindfkdncknoldgnccdg) | `Looper for YouTube - Puts any YouTube Video on an Endless Loop` (62) | — | Brand + plain-English function |
| TubeStack | `TubeStack — YouTube Summarizer with Flashcards` (46) | — | Brand + two keywords |
| LunaNotes | `LunaNotes - Take notes on YouTube` (33) | — | Brand + the literal search query |

**The read:** the dominant pattern is `[Brand][separator][keyword phrase]`, and most sit at 45–60 characters — comfortably past the 35-char display cut, which tells you experienced builders accept truncation to buy the keyword match.

**Language Reactor is the exception that proves the rule.** A bare brand name works at 2M users because the brand *is* the search term. ClipMark is not there, and copying that title today would be copying the outcome of distribution we don't have. Our current title — bare `ClipMark` — is accidentally the Language Reactor strategy without the Language Reactor brand.

---

## 1. Title — recommendation

**✅ `ClipMark: YouTube Notes, Flashcards & Spaced Repetition`** (55 chars)

Reasoning: brand first (identity, and policy-safe), then the two highest-value clusters from §0.3 in descending volume order. The first 35 characters — all a searcher sees — render as `ClipMark: YouTube Notes, Flashcards`, which is a complete, readable phrase rather than a chopped one. "Spaced Repetition" lives past the cut, where it still earns the match at zero readability cost.

Alternates and the exact strings are in [FIELDS §1](chrome-web-store-listing-FIELDS.md).

**Rejected:** stuffing timestamps/bookmarks/study/Anki into the same title. It reads as spam to a human and trips the "lists of keywords" clause with the reviewer.

---

## 2. Summary — recommendation

**✅ `YouTube notes and flashcards that quiz you back: timestamps, spaced repetition, Anki export. AI runs on your device.`** (116/132)

The existing summary is accurate but spends its whole budget on mechanics and omits *notes* and *flashcards*, the two highest-volume terms we're targeting. "That quiz you back" is the benefit in four words; the closing clause is the one differentiator no competitor in the brief offers.

---

## 3. Detailed description — what it's doing

Full paste-ready text in [FIELDS §3](chrome-web-store-listing-FIELDS.md). The structure:

1. **First paragraph is the SEO payload** — "YouTube", "study extension", "timestamped notes", "loop", "spaced repetition", "Anki", "students", "lectures" all inside the first ~60 words, in prose that still scans as written-by-a-person. This is the part the algorithm weights most.
2. **On-device AI gets its own section, near the top**, per `COMPETITIVE-BRIEF.md` T2 (#143) — the only property nobody else in the set has. Stated as fact, never as a superiority claim.
3. **The surviving distinction, not the retired one.** *"Tools that quiz you on a video generate the questions from the transcript; ClipMark asks you about the note you wrote."* The false "no other bookmarker quizzes you" claim appears nowhere and must not return.
4. **Real numbers for the free tier** — 10 Anki exports, 30 reviews, 25 enrolled, 3 saved loops. Naming the wall beats "generous free tier" and directly protects against the uninstall penalty in §0.2.
5. **USD prices with tax stated as added at checkout.**

**Keyword density check** (measured on the final text, 600 words): youtube ×7, anki ×7, note ×12, loop ×7, active recall ×4, spaced repetition ×2, flashcards ×2. Every one is contextual usage, nothing near the "unnatural repetition" line. Re-run this check if the copy is edited.

---

## 4. Screenshot plan — shot list and captions

**Ash produces the images; this is the brief.** 1280×800 PNG, no padding or letterboxing, real product UI, no mockup chrome. Up to 5 slots — use all 5.

**Caption rule, and it is the important part of this section: write for someone who has never heard the words "spaced repetition."** Screenshot captions are read by people deciding in about four seconds. No jargon, no feature names, no product vocabulary. Plain sentences a non-technical person understands instantly. Burn the caption into the image as large, high-contrast text — most people never read the description.

Order is outcome-first: what you get, then how it works.

| # | Shot — what's on screen | Caption (burn in, verbatim) | Why this shot |
|---|---|---|---|
| **1** | Active Recall mid-prompt: timestamp and tags visible, the note **hidden**, Reveal button waiting | **"It asks you what you saved — before it shows you."** | The payoff, and the thing no screenshot elsewhere in the category shows. Leads because it's the reason to install |
| **2** | Same card revealed, clip replaying, grade buttons visible | **"Then it plays the exact moment, so you can check."** | Completes the story shot 1 opens. "Check yourself against the real thing" needs no explanation |
| **3** | Video playing, timestamp just saved, note being written, tag chips | **"Save the exact second. One key. Never pause the video."** | The core mechanic, in the user's language — "one key" not "keyboard shortcut" |
| **4** | AI drafting a note from the transcript, with a visible on-device/offline indicator | **"It writes the note for you — on your computer, not ours."** | The moat, in plain speech. "Runs locally" means nothing to a student; "on your computer, not ours" is instantly clear |
| **5** | Export screen: the Anki file produced, deep link visible | **"Send your cards to Anki. Free, every month."** | The highest-intent audience needs to see this exists before they install |

**If a sixth slot ever exists**, the A–B loop mid-drill: *"Play just the hard part, over and over."* It's deliberately last — loops are the acquisition hook, not the pitch (§0.3).

**Compliance, non-negotiable:**
- Every shot must match the **published** build, not `main`. A screenshot of something the installed extension doesn't do is misleading metadata under the same policy as the copy.
- Re-shoot rather than reuse any still whose source video isn't cleared for promotional use. Use the MIT-OCW-style lecture stills already identified.

---

## 5. Measuring whether any of this worked

**Record the baseline before uploading.** Once the new title ships you cannot recover the old ranks, and "it feels better" is not a result.

**[Extension Ranker](https://extensionranker.com/tools/rank-checker)** is the tool for this — it reads public Chrome Web Store data to check where an extension ranks for a keyword (top 30, English market by default), track that rank over time, tie movement to specific listing updates, and surface keywords you already rank for without knowing it. There is also an *Extension Rank Checker* companion extension that runs the same check from Chrome's side panel.

**Track this set** — it's §0.3's targets plus two controls:

```
youtube notes            youtube flashcards       spaced repetition
active recall            anki youtube             export to anki
take notes on youtube    youtube timestamps       study youtube
youtube bookmarks        lecture notes            clipmark          ← brand control
```

**Method:** baseline all of them the day before the upload → re-check weekly → attribute any move to the one listing change that preceded it. Change the title *or* the description in a given week, not both, or you won't know which did it.

**Expectations, so nobody panics:** ranking response to a listing change is typically slow, and install velocity is a heavier factor than copy (§0.2). A GTM push that drives installs will move ranks more than any wording here. **This pass is what makes that traffic compound instead of evaporate** — it is a multiplier on distribution, not a substitute for it.

---

## 6. Review flywheel

Ratings and review count feed ranking, and the listing currently has none. Ask *after* a completed recall streak, never at install. Never incentivise a review — that's a policy violation and gets the listing pulled, which costs more than every gain in this document.

---

## Sources

- [Chrome Web Store listing requirements policy](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements/) — keyword spam and misleading metadata
- [Complete your listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) — which fields are dashboard-editable
- [Extension name length PSA](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/mpDvFpT0KJM/m/WWFFQZFyAAAJ) — the 75-character limit
- [Chrome Web Store SEO ranking guide](https://www.extensionfast.com/blog/chrome-web-store-seo-complete-ranking-guide-for-2025) — truncation, title weighting, first-paragraph weighting
- [Chrome Web Store ranking algorithm](https://www.extensionfast.com/blog/chrome-web-store-ranking-algorithm-how-extensions-get-ranked-in-2025) — install velocity
- [Extension Ranker](https://extensionranker.com/) · [rank checker](https://extensionranker.com/tools/rank-checker)
- Competitor listings: [Web Highlights](https://chromewebstore.google.com/detail/web-highlights-pdf-web-hi/hldjnlbobkdkghfidgoecgmklcemanhm) · [Language Reactor](https://chromewebstore.google.com/detail/language-reactor/hoombieeljmmljlkjmnheibnpciblicm) · [Looper for YouTube](https://chromewebstore.google.com/detail/looper-for-youtube/iggpfpnahkgpnindfkdncknoldgnccdg)
- Internal: `docs/gtm/COMPETITIVE-BRIEF.md` T2/T4 — **PR #143, still open**, so the file is not on `main` yet · [posting-kit.md](posting-kit.md) §0
