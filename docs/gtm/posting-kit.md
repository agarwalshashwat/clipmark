# ClipMark — Posting Kit (paste-ready)

**Date:** 2026-08-12
**How to use:** everything in a fenced block is written to be posted **as-is**. Everything outside a fenced block is instruction for Ash and must not be pasted.
**Read first:** [marketing-launch-plan.md](marketing-launch-plan.md) §1 (the Day 0 gate), §7.2 (the Reddit rules check), §8 (the honest-claims register).

---

## 0. Global rules that apply to every block below

1. **🚨 Every `[DARK MODE]`-tagged line is blocked until v1.0.4 is live on the Chrome Web Store.** The public listing read **v1.0.3** on 2026-08-12. Where a block has a dark-mode line, an alternate line is given directly beneath it. Check the listing, then delete one.
2. **Never ask for upvotes.** Product Hunt's own guidance: ask people to *visit and comment*. Hacker News: *"Please don't ask friends to upvote or comment. That's not ok on HN."* Both are enforced.
3. **No numbers about ClipMark.** No installs, users, ratings, MRR, "trusted by." The listing has zero reviews; any number is either false or unimpressive.
4. **Affiliate is one-time 30%.** Never "recurring," never "revenue share."
5. **Notion/Obsidian is export, not sync.**
6. **Never post an affiliate/referral link on Reddit, HN, or IH.** Plain product links only.
7. **Links** — use these exactly:
   - Site: `https://clipmark.mithahara.com`
   - Extension: `https://chromewebstore.google.com/detail/clipmark/iboippnihpcnnglgboaiedaiimbiolgg`
   - No trailing slashes on hand-built URLs (they 308).

---

## 1. Product Hunt

### 1.1 Timing

Submit at **12:01 AM PT** on a **Tuesday or Wednesday**. PH's ranking day runs 12:00 AM–11:59 PM PT, so a late submission competes with a fraction of a day. Prepare the draft the day before; publish, then post the maker comment within five minutes.

PH's own guide notes the best day is "the day on which you're most prepared" — if v1.0.4 hasn't cleared review, slip it.

### 1.2 Name

```
ClipMark
```

### 1.3 Tagline — 60 char limit

**Pick one.** Character counts included.

```
Spaced repetition for YouTube — remember what you watch
```
*(55) — Recommended. Leads with the retention wedge, and "spaced repetition" is a term the PH audience already knows.*

```
Bookmark, loop and get quizzed on any YouTube moment
```
*(52) — Mechanic-first. Better if the gallery carries the "why."*

```
Turn YouTube lectures into flashcards you actually recall
```
*(56) — Strongest for the student segment, weaker for generalist PH.*

### 1.4 Description — 240 char limit

```
ClipMark bookmarks the exact second that mattered, loops an A–B passage until it's drilled, then pauses the video days later and quizzes you on it before replaying. Every card links back to the source, not a summary. Exports to Anki. Free tier.
```
*(240)*

**Alternate, shorter:**

```
Mark the exact moment. Loop the passage. Get quizzed on it before you forget it — with the clip itself as the answer. Every review links back to the real second in the real video, never a summary. Exports to Anki. Free to use.
```
*(224)*

### 1.5 Topics / categories

`Chrome Extensions` · `Education` · `Productivity` · `Study Tools`
(Pick the 3 PH allows; drop `Productivity` first if you must choose.)

### 1.6 Maker's first comment

~70% of Product-of-the-Day winners posted one. Post it within five minutes of going live.

```
Hey Product Hunt 👋

I built ClipMark because of a habit I couldn't shake: I'd watch a 40-minute
lecture, understand every word of it, and have nothing left a week later. Then
I'd go back and scrub through the whole thing again to find the one explanation
I actually needed.

The tools I tried all solved the wrong half of the problem. Loopers let me
replay a section — great, but I still forgot it. Summarizers handed me a wall of
AI text that wasn't what the professor said. Note apps wanted me to leave the
video, which is exactly when you lose the thread.

So ClipMark does the other half — retrieval:

📌 One keystroke saves the exact second, without pausing or leaving the page.
🔁 Mark A, mark B, and loop the passage until it's drilled. Multiple segments
   per video, and each one is saved — so a passage you looped is a passage you
   can be quizzed on later.
🧠 Days later, the video pauses and shows you the timestamp and your tags with
   your note hidden. You try to recall it, then reveal and replay to check
   yourself. "Got it" doubles the interval. "Again" brings it back tomorrow.
🔗 Every review links to the real second in the real video. No paraphrase
   standing between you and the explanation.
📤 One click exports to an Anki-importable file — note, timestamp, and a deep
   link back to the moment.

On the obvious question: **ClipMark doesn't replace Anki, it feeds it.** I use
both. Anki is where a card lives for years; ClipMark is what I use before the
card exists, while I'm still in the video.

The free tier is a real allowance, not a teaser — unlimited local bookmarks,
notes, tags and on-device AI note drafting, 25 moments enrolled in Active Recall
at a time, 30 reviews a month, one Anki export a month, and up to 10 shared
collections. No card, no trial countdown. Pro removes those caps and adds cloud
sync, scheduled review reminders, and Obsidian/Notion export.

I'd genuinely like to know: what's the thing you keep having to rewatch? Language
learners and musicians have been using the A–B loop in a way I didn't design for,
and that feedback has been the most useful I've had. Drop it in the comments —
I'm here all day.

— Ash
```

**If v1.0.4 is live**, add after the 📤 line:

```
🌓 Light and dark, following your system theme (and YouTube's).
```

### 1.7 Gallery / asset checklist

PH gallery images: **1270 × 760 px**, 6–8 of them, first image is the one that decides whether anyone scrolls.

- [ ] **Video (first slot):** `videos/clipmark-remember-master-60s/renders/clipmark-remember-master-60s.mp4` — the narrated 60s master. PH plays this first; it does more work than any still.
- [ ] **Image 1 — the payoff.** Active Recall mid-prompt: timestamp + tags visible, note hidden, Reveal waiting. Caption overlay: *"Recall it before you replay it."* (Source: `cws-screenshots/03-active-recall-prompt.png`)
- [ ] **Image 2 — the reveal.** Same card revealed, clip replaying, grade buttons visible. Caption: *"Reveal, replay, grade. Got it → doubles. Again → tomorrow."* (`04-active-recall-revealed.png`)
- [ ] **Image 3 — capture.** Video playing, timestamp just saved, AI-drafted note, tag chips. Caption: *"One keystroke. No pausing, no tab switch."* (`01-video-with-markers.png`)
- [ ] **Image 4 — the A–B loop.** Multiple marked segments on the scrubber, mid-loop. Caption: *"Mark A, mark B. Drill the passage."*
- [ ] **Image 5 — Anki bridge.** Export screen with the resulting file and a visible deep link. Caption: *"Feeds Anki. Doesn't replace it."*
- [ ] **Image 6 — the habit.** Due-for-review queue across several lectures. Caption: *"It comes back until it sticks."* (`06-dashboard.png`)
- [ ] **Image 7 (optional) — shared collection** public link view. (`05-side-panel.png`)
- [ ] Thumbnail/logo asset set.
- [ ] **⚠️ Asset compliance:** re-shoot rather than reuse any still whose source video isn't cleared for promotional use. Use the MIT-OCW-style lecture stills already identified for this purpose — do not ship the restyled screenshots that show unlicensed content.
- [ ] **⚠️ Confirm no still shows a v1.0.4-only surface** (dark mode) if v1.0.4 isn't live.

### 1.8 Sharing the launch

PH allows sharing the link anywhere. Say **"take a look and tell me what you think"**, never "upvote."

```
ClipMark is live on Product Hunt today. It's the thing I've been building to fix
my own habit of rewatching lectures I'd already understood.

Would love your read on it — especially if you learn from long video and have
opinions about what's missing: <PH link>
```

---

## 2. X / Twitter

### 2.1 Launch thread (Day 1, 07:00 ET) — pin it

**Hook variants — pick one for tweet 1/9:**

- **(A) Problem-first, recommended:**
  ```
  I watched a 40-minute lecture, understood every word, and had nothing left a week later.
  ```
- **(B) Contrarian:**
  ```
  Every YouTube tool solves the wrong half of the problem. They all help you watch. None of them help you remember.
  ```
- **(C) Concrete:**
  ```
  400,000 people installed a Chrome extension whose only job is looping a section of a YouTube video. Every one of them still forgets what was in it.
  ```

**The thread (using hook A):**

```
1/9
I watched a 40-minute lecture, understood every word, and had nothing left a
week later.

So I'd scrub back through the whole thing to find the one explanation I needed.

I got tired of it and built ClipMark. It's live on Product Hunt today 👇
```

```
2/9
The tools I tried all fixed watching, not remembering.

Loopers replay a section — I still forgot it.
Summarizers gave me AI text that wasn't what the professor said.
Note apps wanted me to leave the video, which is exactly when you lose the thread.
```

```
3/9
So ClipMark does the missing half: retrieval.

One keystroke saves the exact second. No pause, no tab switch, no leaving the
video.
```

```
4/9
Then A–B loops.

Mark A. Mark B. Loop the passage until it's drilled.

Multiple segments per video, all editable. Language learners drilling a phrase
and musicians drilling a bar found this before I'd even pitched it to them.
```

```
5/9
Here's the design decision I'm proudest of:

a loop and a flashcard are the same object.

A passage you looped is a passage that can come back and ask you about itself.
```

```
6/9
Days later the video pauses and shows you the timestamp and your tags — with
your note hidden.

You try to recall it. Then you reveal, and replay the clip to check yourself.

"Got it" → the interval doubles.
"Again" → it's back tomorrow.
```

```
7/9
The part I won't compromise on: no summaries.

Every review links to the real second in the real video. You review the
professor's actual sentence, not a paraphrase of it.

The clip is the answer key.
```

```
8/9
And the question everyone asks first:

no, it doesn't replace Anki. It feeds it.

One click exports your reviewed segments — note, timestamp, deep link back to
the moment — as an Anki-importable file. I use both. Anki is where a card lives
for years; ClipMark is what I use before the card exists.
```

```
9/9
Free tier is a real allowance, not a teaser: unlimited local bookmarks, notes,
on-device AI note drafting, 25 Active Recall moments at a time, 30 reviews a
month, 1 Anki export a month. No card, no trial clock.

It's on PH today — I'd love your read: <PH link>
```

**Reply-post to your own thread, ~13:00 ET** (attach a short screen capture of the A–B loop):

```
Someone asked what the A–B loop actually looks like. This:

mark A, mark B, and it just loops that passage. Multiple per video.

Then that same segment shows up in review three days later and asks you what
was in it.
```

### 2.2 Build-in-public posts

**(a) Day 2, 16:00 ET — the honest numbers post.** Fill in the real figures. Small honest numbers outperform vague big ones; this is the post that starts the habit.

```
ClipMark launch, 24 hours in, actual numbers:

• __ Product Hunt comments
• __ installs
• __ signups
• __ Pro upgrades

Small. Also the most useful day of feedback I've had.

The question I got asked most: "why not just use Anki?" I've answered it about
__ times now, which tells me it belongs at the top of the landing page, not
buried in the FAQ.
```

**(b) The build-in-public post about the constraint** (any day after launch):

```
Something I got wrong for months.

I built ClipMark's Active Recall to show you a note and replay the clip. Clean.
Except it was showing you the answer before asking the question — so you'd nod
along and learn nothing.

The fix was to hide the note and pause first. One inverted order, and it went
from a bookmark tool to something that actually teaches.

Retrieval only works if you have to reach for it.
```

**(c) The segment-discovery post:**

```
I built A–B loops for students re-drilling a lecture passage.

The people using it hardest are musicians looping four bars and language
learners looping one sentence until the pronunciation sticks.

I did not design for either. Both are better use cases than the one I did
design for.

Build the primitive, let people tell you what it's for.
```

**(d) The honest-pricing post:**

```
Wrote out ClipMark's free tier limits as actual numbers on the pricing page:
25 Active Recall moments, 30 reviews a month, 1 Anki export a month.

Every instinct said round it to "generous free tier" and let people find the
wall later.

Naming the wall up front is the whole reason I'd trust a study tool with a
semester of work. Doing it.
```

**(e) Show HN day cross-post (Day 2, 09:00 ET):**

```
ClipMark is on Show HN today.

Bracing for the good kind of brutal: MV3 service-worker lifecycle, why an
extension and not a webapp, and what happens the next time YouTube reworks its
player.

All fair questions. I'm in the thread: <HN link>
```

---

## 3. LinkedIn founder post (Day 1, 08:00 ET)

Upload `clipmark-remember-master-60s.mp4` **natively**. Don't paste a YouTube link — LinkedIn suppresses off-platform links.

**Hook variants for line 1:**
- (A) `I kept rewatching lectures I had already understood.`
- (B) `Watching is not learning. I built a tool because I finally accepted that about myself.`
- (C) `The most expensive thing in online learning isn't the course. It's the second time you watch it.`

```
I kept rewatching lectures I had already understood.

Not because the material was hard. Because a week later there was nothing left
of it, and finding the one explanation I needed meant scrubbing through forty
minutes to get to ninety seconds.

I looked for a tool that fixed it. What I found all solved the same half of the
problem:

→ Loopers let me replay a section. I still forgot it.
→ Summarizers gave me AI-written text that wasn't what the lecturer actually
  said.
→ Note-taking tools asked me to leave the video, which is precisely the moment
  you lose the thread.

Every one of them helps you watch. None of them help you remember.

So I built ClipMark, and it does the other half.

📌 One keystroke saves the exact second that mattered — no pausing, no switching
tabs.

🔁 Mark A, mark B, and loop that passage until it's drilled. Several segments
per video.

🧠 Then, days later, the video pauses and shows you the timestamp and your tags
with your note hidden. You try to recall it first. Then you reveal it and replay
the clip to check yourself. Got it, and the next review is twice as far away.
Didn't, and it's back tomorrow.

🔗 And every single review links back to the real second in the real video. Not
a summary. You review what the lecturer actually said.

The design decision I keep coming back to: a loop and a flashcard turned out to
be the same object. A passage worth drilling is a passage worth being asked
about later — so in ClipMark they're one thing, not two features.

The question I get asked first is always "doesn't Anki already do this?" No —
and it isn't trying to. ClipMark feeds Anki. One click exports your reviewed
segments, with the note, the timestamp, and a deep link back to the moment, as
an Anki-importable file. Anki is where a card lives for years. ClipMark is what
I use before the card exists, while I'm still inside the video.

It's live on Product Hunt today. The free tier is a real allowance rather than a
teaser — the exact limits are written on the pricing page instead of discovered
after you install.

If you learn from long-form video — lectures, conference talks, a language, an
instrument — I'd genuinely like to know what you keep having to rewatch.

<PH link>

#learning #edtech #buildinpublic #spacedrepetition #productivity
```

---

## 4. Hacker News — Show HN (Day 2, 08:30 ET)

**Rules that actually bind here**, from HN's own [Show HN guidelines](https://news.ycombinator.com/showhn.html):

- Must be *"something you've made that other people can play with"* — ClipMark qualifies. Non-trivial, personally built, and installable without a signup wall (free tier works locally without an account).
- Title must begin with `Show HN:`.
- **"Please don't ask friends to upvote or comment. That's not ok on HN."** No exceptions, no DMs, no group chats.
- Be present in the thread. This is the whole norm — block out 3+ hours.
- No hype, no emoji, no exclamation marks, no marketing adjectives in the title. HN punishes all four.

### 4.1 Title — pick one

```
Show HN: ClipMark – bookmark a YouTube moment, then get quizzed on it later
```
*(Recommended. Plain, mechanical, states what it does.)*

```
Show HN: Spaced repetition for YouTube, as a Chrome extension
```

```
Show HN: I built A–B loops and spaced review into YouTube to stop rewatching lectures
```

### 4.2 Body (post as the first comment)

```
I watch a lot of long technical video — conference talks, lectures — and I kept
hitting the same failure: I'd follow the whole thing, understand it, and retain
almost none of it a week later. Then I'd scrub back through forty minutes to
find the ninety seconds I actually needed.

Everything I found solved playback. Loopers replay a section; summarizers hand
you generated text that isn't what the speaker said; note tools ask you to leave
the video. So ClipMark does retrieval instead.

How it works:

- A keyboard shortcut saves the exact timestamp without pausing or leaving the
  page. Optionally a note is drafted from the surrounding transcript using
  Chrome's built-in Gemini Nano via the Prompt API — on-device, nothing leaves
  the machine, no API key and no inference cost to me. Caveat: Chrome only
  reports the model as available on machines that meet its requirements and
  after it has downloaded, so this feature is genuinely absent for some users
  and the flow falls back to writing the note yourself.
- A–B segments: mark a start and an end and it loops that passage. Multiple
  segments per video, editable after the fact.
- Segments and bookmarks are the same object as review items. When one comes
  due, the content script pauses the video and shows the timestamp and tags with
  the note hidden. You attempt recall, then reveal and replay the clip to check.
  Grading "got it" doubles the interval; "again" schedules it for tomorrow.
- Every review resolves to the real second in the original video, so what you
  review is the source, not a paraphrase of it.
- One-click export to an Anki-importable file (note, timestamp, deep link). It
  isn't trying to replace Anki — I use both, and this is the step before a card
  exists.

Implementation notes that might interest people here:

- MV3, Vite + CRXJS. The service worker uses a keepalive alarm to survive MV3's
  idle shutdown, which is its own small saga.
- YouTube is an SPA, so navigation is handled off `yt-navigate-finish` rather
  than page loads — markers and bookmarks reset there.
- One bug worth mentioning because it only existed in the built artifact:
  content scripts share a single global scope, and the bundler tree-shook a
  constants chunk that the content script referenced as bare globals. Dev and
  source-based E2E were both fine; only the shipped zip threw a ReferenceError.
  The fix was a twin-file convention (a classic script registering onto
  globalThis alongside an ESM twin for the panel and tests) plus a build-time
  guard that fails the bundle if a required global goes missing.
- Bookmarks live in chrome.storage.sync, so capture, loops, review and the Anki
  export all work with no ClipMark account — the only things that need one are
  shared collections and cross-device cloud sync.

Free tier is unlimited local bookmarks, notes, tags and on-device note drafting,
25 moments enrolled in review at a time, 30 reviews a month, and one Anki export
a month. Paid removes those caps and adds cross-device sync. The numbers are on
the pricing page rather than discovered post-install.

Extension: https://chromewebstore.google.com/detail/clipmark/iboippnihpcnnglgboaiedaiimbiolgg
Site: https://clipmark.mithahara.com

Things I already know are weak and would rather hear about than defend: it's
Chromium-only today, the review scheduler is a simple doubling interval rather
than a real SM-2/FSRS implementation, and it depends on YouTube's player DOM,
which will break again. Happy to get into any of it.
```

**Prepare answers for the questions HN will definitely ask:**

| Question | Honest answer |
|---|---|
| "Why not just Anki?" | It feeds Anki. This is the capture-and-triage step that happens while you're still in the video, and the review replays the clip rather than showing text. |
| "Why a browser extension?" | The capture has to happen without leaving the video, and the review has to be able to pause and seek the actual player. Neither is possible from a separate webapp. |
| "Firefox?" | Not today. Chromium-only. Say so plainly. |
| "Is this SM-2/FSRS?" | No. It's `min(lastInterval × 2, 60)` days, with "again" resetting the streak and re-queueing for ~tomorrow. Give the actual formula — vagueness here reads as bluffing. |
| "What happens when YouTube changes the DOM?" | It breaks and gets repaired; that's the standing maintenance cost of the category. Note the `yt-navigate-finish` handling. |
| "What's the AI, and where does my data go?" | Chrome's built-in Gemini Nano through the Prompt API, on-device, for drafting a note from the surrounding transcript. Nothing leaves the machine. Volunteer the caveat: Chrome gates availability on hardware/version and a model download, so some users won't have it. |
| "Business model?" | Freemium, $7.99/mo, $59.99/yr, $99.99 lifetime, Merchant-of-Record payments. Say the numbers. |
| "Privacy / permissions?" | Point at the privacy page and the actual permission list. Do not hand-wave this one on HN. |

---

## 5. Reddit

> **⛔ Before any block in this section: run the §7.2 check in [marketing-launch-plan.md](marketing-launch-plan.md).**
> `reddit.com` was blocked by policy in the environment this kit was written in, so **no rule below was read first-hand.** Each sub is tagged with what's corroborated vs. what must be verified. If a check contradicts anything here, the sub's actual rules win.
>
> **Universal rules, corroborated across sources:** roughly **90/10** — most of your activity should be genuine participation, not promotion. Disclose that you built it, always. Never post the same text in two subs. **Never post an affiliate or referral link.** One sub at a time, not a same-day sweep.

### 5.1 r/SideProject — Day 1, 09:00 ET

**Rule status:** *Corroborated* — this is the rare sub where posting your own project in the main feed is the intended behaviour, and it does **not** publish a sub-specific self-promo rule, so the site-wide norm applies. It **does** enforce that posts show real progress (screenshots, working demo) — *"just an idea"* posts get removed — and bans repeat submissions of the same project in a short window. Reciprocity is the social contract: comment on other people's projects too.
**Still verify:** flair requirements and any karma/age gate.

**Post — attach a screen capture of the recall prompt or the A–B loop.**

Title:
```
I built a Chrome extension that pauses YouTube days later and quizzes you on the moment you bookmarked
```

Body:
```
I kept rewatching lectures I'd already understood, because a week later there
was nothing left of them.

Loopers let me replay a section but I still forgot it. Summarizers gave me AI
text that wasn't what the lecturer said. Note apps wanted me to leave the video.

So I built ClipMark to do the missing part — retrieval:

- One keystroke saves the exact second, no pausing or tab-switching
- Mark A, mark B, and it loops that passage. Several segments per video
- Days later the video pauses and shows the timestamp and tags with your note
  hidden. You try to recall it, then reveal and replay to check. "Got it"
  doubles the interval, "again" brings it back tomorrow
- Every review links to the real second in the real video, never a summary
- One-click export to an Anki-importable file, because this feeds Anki rather
  than replacing it

The thing I found interesting building it: a loop and a flashcard turned out to
be the same object, so I made them one thing instead of two features.

Free tier is unlimited local bookmarks, 25 review moments at a time, 30 reviews
a month, 1 Anki export a month, and it works without an account. Paid removes
the caps and adds sync.

Built solo. Chromium-only for now, and the review scheduler is a plain doubling
interval rather than a real FSRS implementation — both on the list.

https://clipmark.mithahara.com

What I'd most like feedback on: does the "pause and ask before replaying" bit
land, or does it just feel annoying? That's the whole bet and I can't tell from
the inside.
```

### 5.2 r/chrome_extensions — Day 2, 12:00 ET

**Rule status:** ⚠️ **UNVERIFIED.** I could not retrieve this sub's rules. Builder-oriented extension subs commonly permit "I made an extension" posts, but that is an assumption, not a checked fact.
**Check for:** self-promo ban, a dedicated showcase/weekly thread, flair requirement, karma/age gate. If it's weekly-thread-only, use variant B in §5.6.

Title:
```
Shipped my first MV3 extension: A–B loops + spaced review on YouTube. Two build problems that only showed up in the packaged zip.
```

Body:
```
ClipMark saves the exact second of a YouTube video, loops an A–B passage, and
then pauses the video days later to quiz you on it before replaying. Built solo,
MV3, Vite + CRXJS.

Two things bit me that might save someone else the afternoon:

1. Content scripts share one global scope, and the bundler tree-shook a
   constants chunk that my content script referenced as bare globals. Dev server
   was fine. Source-based E2E was fine. Only the built zip threw a
   ReferenceError — in production. I ended up on a twin-file convention: a
   classic script that registers onto globalThis for the content script, plus an
   ESM twin for the side panel and unit tests, with a build-time guard that
   fails the bundle if a required global disappears from the shipped chunks.

2. MV3's idle service-worker shutdown. A keepalive alarm keeps the worker alive
   for the scheduling side. Obvious in hindsight, invisible until reminders
   silently stopped firing.

Also worth knowing if you touch YouTube: it's an SPA, so you want
`yt-navigate-finish` rather than page loads, or your injected UI survives into a
video it doesn't belong to.

Extension:
https://chromewebstore.google.com/detail/clipmark/iboippnihpcnnglgboaiedaiimbiolgg

Happy to go into any of it. And if anyone's found a cleaner answer to the
globals/tree-shaking problem than twin files, I'd take it — mine works but it's
a convention held together by tests.
```

### 5.3 r/Anki — Day 2, 14:00 ET (pick this **or** §5.4, not both)

**Rule status:** ⚠️ **UNVERIFIED.** Third-party sources indicate r/Anki recognises a "Self-Promotion" post category, which suggests promotion is permitted with appropriate flair — **but I could not read the rules.**
**Check for:** the flair requirement (very likely), any mod-preclearance step, karma/age gate.
**Framing is everything here.** This audience will assume you're trying to replace Anki. Lead with the opposite.

Title:
```
Built a YouTube capture tool that exports to Anki — it's the step before the card, not a replacement
```

Body:
```
Disclosure up front: I built this, and I'm posting it because this sub is the
one place where the "why not just Anki" question is the whole conversation
rather than an objection.

My problem was the gap between watching a lecture and having cards. I'd watch,
understand it, mean to make cards, and then either not do it or make them from
memory two days later — by which point I'd lost the specific thing the lecturer
said.

ClipMark is a Chrome extension that closes that gap:

- A shortcut saves the exact timestamp while the video is still playing
- Mark A and B to loop a passage until it's drilled
- Segments come back on a schedule and pause the video: it shows the timestamp
  and tags with your note hidden, you attempt recall, then reveal and replay the
  clip. This is a triage pass, not a long-term scheduler — it's a plain doubling
  interval with an "again" reset, not SM-2 or FSRS
- One click exports to an Anki-importable file with the note, the timestamp, and
  a deep link back to the moment

The honest positioning: **Anki is where a card lives for years. This is what I
use before the card exists, while I'm still in the video.** The review loop
inside ClipMark exists to work out which moments deserve a card at all, and the
export is the handoff. I'm not trying to build a better scheduler than Anki, and
I'd be a fool to.

Free tier includes the capture, the loops, the review loop and one Anki export a
month — enough to run a full lecture through it and see if the workflow fits.
Paid removes the caps.

https://clipmark.mithahara.com

The genuine question I have for this sub: for video-sourced cards, do you want
the deep link on the card at all, or is the extra click just noise once the card
exists? I've built it as a link-back and I'm not sure that's right.
```

### 5.4 r/languagelearning — Day 2, 14:00 ET (alternative to §5.3)

**Rule status:** ⚠️ **UNVERIFIED, and this sub is likely restrictive.** Large language-learning communities commonly restrict tool/app promotion to a **weekly or pinned megathread**, and often ban it outright in the main feed.
**Default assumption: use the weekly thread, comment form only. Do not make a top-level post unless the rules explicitly allow it.**

**Comment for the weekly self-promo / tools thread:**

```
Built a Chrome extension for the loop-a-phrase-until-it-sticks workflow —
disclosure, it's mine, and it's free to use.

ClipMark lets you mark A and B on a YouTube video and loop just that passage,
with several segments per video. The part that's actually different: those
segments come back later on a spaced schedule and pause the video to ask you
about them before replaying — timestamp and tags visible, your note hidden — so
you have to reproduce the phrase before you hear it again.

I built it for lecture material and language learners found it first, which is
why I'm here. It exports to Anki as well if that's already your setup.

Free tier: unlimited saved moments locally, 25 in active review at a time, 30
reviews a month, one Anki export a month, no account needed.

https://clipmark.mithahara.com — genuinely interested whether the "reproduce it
before you hear it" bit is useful for shadowing/pronunciation work or whether
you'd rather just have the raw loop.
```

### 5.5 One more, if a check clears it

**r/GetStudying / r/studytips / r/EdTech** — ⚠️ **UNVERIFIED and probably restrictive.** Study subs are typically strict about tool promotion. **Default: skip in the 2-day window**, and put them on the long-game track in [community-engagement-plan.md](community-engagement-plan.md). Only if a check shows promotion is explicitly permitted, use the workflow-framed variant:

Title:
```
The review step I skipped for years: what to do after you finish the lecture
```

Body:
```
Disclosure: I built the tool mentioned at the end. The workflow is the point of
the post, so I've written it so it's useful even if you never install anything.

The mistake I made for years was treating "I understood the lecture" as "I've
learned the lecture." They're unrelated. Understanding happens while you watch.
Learning happens when you fail to recall it and then get it back.

What actually worked, tool-agnostic:

1. While watching, mark the moments you'd struggle to explain out loud — not the
   ones you found interesting. The gap between "interesting" and "couldn't
   reproduce" is where all the forgetting lives.
2. For anything procedural, loop the passage rather than rewatching the lecture.
   Ninety seconds five times beats forty minutes once.
3. A few days later, do not rewatch. Try to say it from memory first, then check
   against the source. The failure is the useful part.
4. Check against the original, not your notes. Your notes are already a lossy
   copy of the thing you're trying to learn.

Step 3 is the one everyone skips, including me, because rewatching feels
productive and failing doesn't.

I ended up building a Chrome extension to force step 3 on myself — it pauses the
video days later and asks before replaying. It's at
clipmark.mithahara.com if it's useful, free tier, no account needed. But the
four steps work with a notes app and a calendar reminder, and that's the part
worth taking from this post.
```

### 5.6 Variant B — the generic weekly-thread comment

Use whenever a rules check says *weekly/megathread only*. Short, disclosed, no hard sell.

```
Disclosure: mine, and free to use.

ClipMark is a Chrome extension that saves the exact second of a YouTube video,
loops an A–B passage, and then pauses the video days later to quiz you on that
moment before replaying it — note hidden, so you have to actually recall it.
Exports to Anki; doesn't try to replace it.

Free tier works without an account. https://clipmark.mithahara.com

Happy to answer anything, and I'd rather hear what's missing than what's good.
```

---

## 6. IndieHackers (Day 1, 10:00 ET)

**Norms that bind:** IH rewards *"here's how I got here and what I learned"* over announcements — posts that only announce get ignored. **Revenue claims without proof get removed**, so make none. Participate in other threads the same day.

Title:
```
I spent months building the wrong half of my product before I noticed
```

Body:
```
ClipMark launched on Product Hunt yesterday. Rather than pitch it, here's the
mistake that shaped it, because it cost me the most time and it's the kind of
thing that's invisible from the inside.

**The product.** A Chrome extension for people who learn from long YouTube
video. Save the exact second that mattered, loop an A–B passage until it's
drilled, and then get quizzed on that moment days later — the video pauses,
shows the timestamp and your tags with your note hidden, and you try to recall
it before revealing and replaying. Exports to Anki.

**The mistake.** For months, the review screen showed you your note and replayed
the clip. It looked great in a demo. It taught you nothing, because it answered
the question before asking it — you read your note, nodded, and moved on
feeling productive.

Inverting it — hide the note, pause first, make the user reach for the answer —
is a small amount of code and the entire difference between a bookmark manager
and a study tool. I had built a bookmark manager for months and called it a
retention product. Nobody caught it, including me, because a demo of the wrong
version looks identical to a demo of the right one.

**The second thing I got wrong, in the other direction.** I assumed the moat was
AI: summarize the video, generate the cards, be smart. Turns out the moat is the
opposite. Every review in ClipMark links to the real second in the real video,
because the one thing people learning something hard will not tolerate is a
paraphrase standing between them and the source. Not generating text became the
feature.

**What I'd tell someone starting.** The market I'm in is full of playback tools
— an extension whose entire job is looping a section of a YouTube video has
roughly 400,000 installs. Enormous demonstrated demand for a shallow version of
the behaviour, and nobody closing the loop on whether you remember any of it.
Looking for a large under-served *adjacent* behaviour beat trying to invent a
new one.

**Where it actually is.** Live, freemium, Merchant-of-Record payments, solo.
Free tier is a real allowance with the numbers written on the pricing page —
25 review moments at a time, 30 reviews a month, one Anki export a month — and
Pro removes the caps. I'm not going to post revenue numbers because there
aren't interesting ones yet, and I'd rather say that than imply otherwise.

**Open question I'd take help on.** My hardest users showed up unplanned:
musicians looping four bars and language learners looping a single sentence.
Neither was who I built for, and both are better fits than who I did build for.
How aggressively would you re-point positioning at a segment that found you,
versus finishing the one you planned?

https://clipmark.mithahara.com
```

---

## 7. Short-video — TikTok / YouTube Shorts / Instagram Reels (Day 2, 13:00 ET)

**Assets:** `clipmark-remember-vertical-15s` for all three (9:16). `clipmark-remember-cutdown-30s` as the alternate where 30s performs better. The 60s master is for PH/LinkedIn/X, not for these.

**Craft notes:** the first 1.5 seconds decide everything — the hook must be legible as on-screen text with the sound off. All three platforms suppress off-platform links in-caption, so the CTA is *"link in bio"* and the bio link is the site. Post native uploads, never a re-share of another platform's export with a watermark.

### 7.1 On-screen hook variants (first 1.5s, burned-in text)

- **(A)** `You didn't forget the lecture. You never learned it.`
- **(B)** `POV: rewatching 40 minutes to find 20 seconds`
- **(C)** `The video pauses and asks you what was in it`

**(C)** is the strongest, because it describes something the viewer has never seen a video player do — that's the scroll-stopper. **(B)** is the most relatable and the safest. **(A)** is the most likely to get argued with in comments, which is not necessarily bad.

### 7.2 TikTok caption

```
It pauses the video and makes you recall it before you're allowed to replay it 🧠

Mark the exact second → loop the passage → get quizzed on it days later. The
clip is the answer key, so you're never reviewing an AI summary of what the
lecturer said.

Free Chrome extension, link in bio.

#studytok #spacedrepetition #activerecall #studytips #anki #langblr #musicpractice #chromeextension
```

### 7.3 YouTube Shorts caption

```
Stop rewatching lectures you already understood.

ClipMark saves the exact second, loops an A–B passage until it's drilled, then
pauses the video days later and quizzes you on it before replaying — your note
hidden, so you have to actually recall it. Every review links back to the real
moment, not a summary. Exports to Anki.

Free Chrome extension: clipmark.mithahara.com

#shorts #studytips #spacedrepetition #activerecall #anki
```

*(Shorts is the one platform where a URL in the description is worth including — put it there as well as in the pinned comment.)*

### 7.4 Instagram Reels caption

```
Watching isn't learning. This is the part everyone skips 👇

Mark the moment → loop the passage → the video comes back days later and asks
you what was in it, before it lets you replay.

Built for lectures. Language learners and musicians got there first.

Free Chrome extension — link in bio.

#studygram #spacedrepetition #activerecall #studytips #languagelearning #practiceroom #anki #edtech
```

### 7.5 Pinned first comment (all three)

```
Free tier, no account needed: unlimited saved moments locally, 25 in active
review at a time, 30 reviews a month, 1 Anki export a month. The limits are on
the pricing page, not hidden behind an install. Ask me anything.
```

---

## 8. Pre-post checklist — run once per post

- [ ] Zero dark-mode claims, **or** v1.0.4 is confirmed live on the CWS listing
- [ ] No user/install/rating/revenue numbers about ClipMark
- [ ] "Export," never "sync," for Notion/Obsidian
- [ ] Free-tier caps stated as real numbers wherever the free tier is mentioned
- [ ] Affiliate, if mentioned at all, is "one-time 30%"
- [ ] No affiliate/referral link — plain product links only
- [ ] No upvote ask (PH, HN)
- [ ] "I built this" disclosure present on Reddit and IH
- [ ] Text is not a copy-paste of another channel's version
- [ ] Every link opens and resolves, no trailing-slash 308
- [ ] Sub's rules read first-hand, and the right variant chosen
- [ ] Ash has 2+ hours free to answer replies after posting

---

## Sources

- [Show HN guidelines — Hacker News](https://news.ycombinator.com/showhn.html)
- [Product Hunt Launch Guide](https://www.producthunt.com/launch) · [How to post a product](https://help.producthunt.com/en/articles/479557-how-to-post-a-product) · [PH launch assets & sizes — Submitator](https://submitator.com/blog/product-hunt-launch-assets) · [PH launch checklist 2026 — Screenhance](https://screenhance.com/blog/product-hunt-launch-checklist-2026)
- [r/SideProject rules 2026 — MediaFast](https://www.mediafa.st/subreddit/sideproject) · [Reddit self-promotion rules, the 90/10 rule — Indexly](https://indexly.ai/glossary/reddit-self-promotion-rules) · [Self-promotion rules by subreddit — Soar](https://www.soar.sh/blog/self-promotion-rules-by-subreddit-database)
- [Tips for making successful posts on Indie Hackers](https://www.indiehackers.com/post/tips-for-making-successful-posts-on-indie-hackers-b04454a57a) · [Indie hacker revenue milestones — Monolit](https://monolit.sh/blog/indie-hacker-revenue-milestones-how-to-celebrate-share-publicly)
- [Build in Public on X in 2026 — AutoTweet](https://www.autotweet.io/blog/build-in-public-on-x-twitter-2026) · [X thread best practices 2026 — Teract](https://www.teract.ai/resources/twitter-thread-writing-2026)
- [Looper for YouTube — Chrome Web Store](https://chromewebstore.google.com/detail/looper-for-youtube/iggpfpnahkgpnindfkdncknoldgnccdg) (the ~400K figure)
