# ClipMark — Chrome Web Store Listing (Ready to Paste)

**Date:** 2026-07-31
**Positioning:** "Revise & remember" — Active Recall as hero, additive to Anki, beachhead is USMLE/IMG med students (per [ClipMark-MedExam-Strategy-Brief.md](../../ClipMark-MedExam-Strategy-Brief.md)), but copy stays usable for any serious YouTube learner so the listing doesn't cap itself to one audience.
**Honesty constraint:** every claim below maps to a shipped feature. Nothing here mentions Deep Transcript Search, Lifetime Cloud Archiving, "Early access to labs," or Notion/Obsidian **sync** (it's a one-off **export**, per the pricing-claims audit in [ClipMark-Claims-Buildout-Plan.md](../../ClipMark-Claims-Buildout-Plan.md) and [ClipMark-ROADMAP.md](../../ClipMark-ROADMAP.md)). Free-tier numbers below (25 Active Recall segments, 30 reviews/mo, 1 Anki export/mo, 10 shared collections) match the shipped caps in [ClipMark-UsageCaps-Spec.md](../../ClipMark-UsageCaps-Spec.md).

**Note on the name:** `extension/manifest.json` currently ships `"name": "Clipmark"` (lowercase "m"), while every planning doc and this listing use `"ClipMark"`. The Chrome Web Store listing title is set independently in the Developer Dashboard, so this doesn't block publishing — but worth reconciling manifest casing with the public brand before the CWS listing goes live, so the install-time permission dialog and the store page match.

---

## 1. Extension name / title (pick one)

CWS discourages literal keyword-stuffing in the title field (e.g. "ClipMark - YouTube Notes Timestamps Bookmarks Study Anki Flashcards" reads as spam and risks a listing flag) — so keywords are handled by title + summary *together*, plus the dedicated tags field (§5), not crammed into the title alone.

| # | Title | Rationale |
|---|---|---|
| A | **ClipMark: YouTube Notes & Active Recall** | Safe, clean, hits two real search clusters ("youtube notes," "active recall") without stuffing. Broadest appeal — doesn't read as med-only, so it still works if ClipMark expands to coding/language learners later. |
| B | **ClipMark — Study Smarter with YouTube Flashcards** ⭐ Recommended | Leads with outcome ("study smarter") and includes "flashcards" — the single word that best bridges general search *and* the Anki/med-exam crowd, since "flashcards" is core vocabulary for that audience without being as narrow as literally saying "USMLE" or "med school" in the title. Reads natural, not stuffed. |
| C | **ClipMark: Active Recall & Anki Export for YouTube** | Most specific/technical — best for searchers who already know the vocabulary (the exact med/exam power-user this niche targets), but narrower top-of-funnel reach for people who haven't heard "active recall" yet. Good fallback if B underperforms in CWS search testing. |

**Recommendation: B.** It's the best single line for the med/exam beachhead without hard-coding the extension to that niche alone — "study smarter" + "flashcards" is exactly the language a USMLE/Step 1 searcher uses, but it reads equally well to a coding-course or language-learning searcher if the product expands later per the strategy brief's stated sequencing.

---

## 2. Short description (132-character summary — shown under the title in search results)

| # | Copy | Length |
|---|---|---|
| 1 ⭐ | Capture YouTube timestamps, quiz yourself with spaced repetition, export straight to Anki. | 90 chars |
| 2 | Study smarter: capture YouTube timestamps, review with spaced repetition, export to Anki. | 89 chars |
| 3 | Bookmark YouTube moments, quiz yourself with Active Recall, export straight to Anki. | 84 chars |

**Recommendation: #1.** "Spaced repetition" and "Anki" are both real, specific, and search-relevant terms for the target audience; "quiz yourself" reads as an active benefit rather than a feature name, which tests better in summary lines than jargon alone.

---

## 3. Full detailed description

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
standing Active Recall segments, 30 reviews a month, 1 Anki export a month, and up to
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

## 4. Screenshot plan (5 screenshots, outcome-first order) + demo video outline

CWS screenshots are viewed in sequence before install, so order them as a story — outcome first, mechanism second — not a feature list.

| # | Shows | Caption (overlay text) |
|---|---|---|
| 1 | **The payoff moment**: Active Recall overlay mid-quiz on a real lecture (e.g. a Boards & Beyond–style video) — timestamp + tags visible, note hidden, "Reveal" button waiting. | "Recall it before you replay it." |
| 2 | **The capture moment**: YouTube video playing with the ClipMark capture UI open — timestamp just saved, AI-drafted note visible, tag chips shown. | "One keystroke saves the moment — AI drafts the note for you." |
| 3 | **The bridge to Anki**: dashboard/export screen showing a segment being exported, with the resulting Anki-importable file and a visible deep-link back to the timestamp. | "Export straight to Anki — every card links back to the source." |
| 4 | **The habit view**: dashboard showing the due-for-review queue/strip across multiple saved lectures, spaced-repetition intervals visible. | "Spaced review that brings it back until it sticks." |
| 5 | **The social/shareable moment**: a shared collection page (public link view) with a lecture series' worth of bookmarks. | "Share a collection — study the same deck as your classmates." |

**Sizing:** CWS accepts 1280×800 or 640×400 screenshots (1280×800 preferred for retina display) — capture at 1280×800, PNG, no padding/letterboxing.

**30-second demo video outline** (for the CWS video field and reused as a creator-outreach asset per the distribution plan):
1. **0:00–0:05** — Cold open on a real lecture playing, cursor hits the shortcut, timestamp saves instantly. Text: "Stop rewatching the whole lecture."
2. **0:05–0:12** — AI-drafted note appears, tag auto-applied. Text: "AI drafts the note. You just confirm."
3. **0:12–0:20** — Cut to Active Recall: moment comes due, note hidden, user recalls, reveals, clip replays to confirm. Text: "Recall it — then replay to confirm."
4. **0:20–0:26** — One click exports to an Anki file. Text: "Feeds straight into Anki. No new habit to build."
5. **0:26–0:30** — ClipMark logo + CTA. Text: "Free to start. clipmark.mithahara.com"

---

## 5. Category and search keywords/tags

**Primary CWS category:** Productivity (education-adjacent tools without a dedicated "Education" category on CWS list under Productivity; this is where Anki-adjacent and note-taking extensions land).

**Search keywords/tags to target** (for the CWS keywords field, meta description, and organic phrasing across the listing — not for title-stuffing):
- youtube notes
- youtube timestamps
- youtube bookmarks
- active recall
- spaced repetition
- anki export
- anki
- study tool
- flashcards from video
- video notes
- usmle study tools
- step 1 study tools
- med school study tools
- boards and beyond notes
- second brain youtube

Keep the med/exam terms (usmle, step 1, med school, boards and beyond) present in the **description body and tags**, not the title — this is where the niche keywords actually get indexed without tripping title-stuffing review flags, and it matches how CWS surfaces long-tail search matches.

---

## 6. Review flywheel — when and how to ask

Per the distribution plan's own finding: **never buy reviews**, and never prompt at install — prompt at the activation moment, when the "it worked" feeling is freshest.

- **Trigger point:** right after a user's **first completed Active Recall session** (first "reveal → replay → grade" cycle) or their **first successful Anki export** — whichever comes first. Both are the exact moments the caps spec identifies as "it stuck."
- **Mechanism:** a single non-blocking in-app prompt ("Was that useful? A quick review helps other students find ClipMark.") linking straight to the CWS review URL — never a modal that blocks the flow it's congratulating the user for completing.
- **Don't re-prompt** a user who dismisses it for at least 30 days, and never prompt the same session twice.
- **First 20-30 reviews realistically come from the design-partner cohort** (15-25 med students recruited via Reddit/Discord DMs per the distribution plan), asked directly once they've had a genuine "aha" moment — not from organic discovery. Layer the automated in-app trigger on top of that, don't rely on it alone in month 1.
- **Community asks** ("if this was useful, a review helps other students find it") are fine inside Reddit/Discord *once trust is established* in that community — never on a first post.

---

*Companion docs: [ClipMark-Distribution-Plan.md](../../ClipMark-Distribution-Plan.md) (channel strategy this listing supports), [ClipMark-MedExam-Strategy-Brief.md](../../ClipMark-MedExam-Strategy-Brief.md) (positioning source), [ClipMark-UsageCaps-Spec.md](../../ClipMark-UsageCaps-Spec.md) (free-tier numbers cited above), [ClipMark-ROADMAP.md](../../ClipMark-ROADMAP.md) (what's shipped vs. planned).*
