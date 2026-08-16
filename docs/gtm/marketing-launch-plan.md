# ClipMark — Launch Marketing Plan

**Date:** 2026-08-12
**Owner:** Ash (all posting is done by hand — nothing in this plan is automated or pre-scheduled by anyone but him)
**Companion docs:** [posting-kit.md](posting-kit.md) (paste-ready copy), [paid-plan.md](paid-plan.md) (inorganic)
**Existing docs this builds on:** [community-engagement-plan.md](community-engagement-plan.md), [SEO-AUDIT.md](SEO-AUDIT.md), [chrome-web-store-listing-FIELDS.md](chrome-web-store-listing-FIELDS.md), [creator-outreach-kit.md](creator-outreach-kit.md). The old `docs/release/LAUNCH_DAY_RUNBOOK.md` is folded into [§6.1](#61-watch-windows-and-the-incident-path)

---

## 0. Assumptions — override any of these before executing

These were handed to me as the brief. They're listed first so they're easy to change.

| # | Assumption | Override by |
|---|---|---|
| A1 | **Target platforms** are Product Hunt, X, LinkedIn, relevant subreddits, Hacker News, IndieHackers, and TikTok/Shorts/Reels. Nothing else in the 2-day window. | Cut or add channels in §5 |
| A2 | **Voice is founder-led build-in-public — Ash personally** — with a brand account cross-posting/amplifying, not originating. | §4 |
| A3 | **Ash does all the posting.** This kit contains zero scheduled posts, zero accounts created, zero campaigns started, zero money spent. | n/a — hard constraint |
| A4 | **Paid budget is TBD.** [paid-plan.md](paid-plan.md) presents $10 / $25 / $50-a-day scenarios and does not assume one. | Pick a scenario in paid-plan §6 |
| A5 | **The 2-day window is Tue + Wed.** Product Hunt's own guidance is 12:01 AM PT, and the days that most consistently produce #1-of-day are Tue–Thu; Tue/Wed also gives Show HN a weekday-morning US audience on Day 2. | §6 — shift the pair, keep the internal order |
| A6 | **Launch positioning is the broad study/retention wedge**, not the USMLE/med beachhead. Reason: every Day 1–2 channel (PH, HN, IH, X, r/SideProject) is a builder/generalist audience, and med-specific framing lands flat there. The med/USMLE beachhead in [community-engagement-plan.md](community-engagement-plan.md) is a **parallel long-game track that this 2-day plan does not touch** — see §7. | §2, §7 |
| A7 | **No claim is made about traction, revenue, user counts, or ratings** anywhere in the kit. ClipMark's public listing currently shows a very low install count and zero reviews (§1), so every number would be a liability rather than an asset. | n/a — honesty constraint |

---

## 1. Day 0 gate — read this before booking a launch date

Three things are true right now, verified against the repo and the live listing on 2026-08-12. Two of them are scheduling dependencies, not opinions.

### 1.1 The public Chrome Web Store listing is on v1.0.3, not v1.0.4 — **blocking**

The live listing (`iboippnihpcnnglgboaiedaiimbiolgg`) reports **version 1.0.3, last updated 2026-08-10**. The repo's `extension/manifest.json` on `main` is at **1.0.4**. So:

- **System-synced dark mode ships in v1.0.4 and is therefore not yet available to anyone who installs today.** It cannot appear in launch copy until the v1.0.4 package is published *and* has cleared Chrome Web Store review.
- Same for the v1.0.4 A/B-loop and tour fixes (`8f20661`, `349c907`).
- CWS review time is not controllable and is not instant. **Publish v1.0.4 and confirm the listing shows 1.0.4 before Day 1 is booked.** If review hasn't cleared, either slip the launch or strike every dark-mode mention from the kit — the [posting-kit.md](posting-kit.md) copy flags each spot.

A–B multi-segment loops *are* safe to claim: PR #91 is merged to `main` and shipped in the published 1.0.3.

### 1.2 The listing has 0 reviews and a near-zero install count — **not blocking, but shapes the plan**

Every Day 1 channel sends people to a store page with no social proof. Two consequences baked into §6:

- **Don't manufacture proof.** No bought reviews, no same-day cluster of scripted 5-stars from friends. [community-engagement-plan.md](community-engagement-plan.md) §4 already calls this a hard line, and it's the right call — a fake-review flag on a study tool is unrecoverable.
- **Do line up genuine reviews before Day 1.** Anyone who has actually used ClipMark and hit a real "oh, that's the point" moment can be asked, individually, in the week before launch. Staggered, unscripted. This is Day 0 work, not Day 1 work.

### 1.3 I could not verify subreddit rules first-hand — **read §7.2 before any Reddit post**

`reddit.com` is blocked by policy in the environment this kit was written in — both direct fetch and the browser pane. Every subreddit rule in [posting-kit.md](posting-kit.md) is therefore either **(a)** a widely-corroborated site-wide norm, or **(b)** explicitly marked `UNVERIFIED — check the sidebar`. The kit is built as a decision tree so that a 5-minute rules check per sub tells Ash which of two pre-written variants to use. Do not skip that check.

---

## 2. Positioning

### One-liner

> **ClipMark turns YouTube into something you actually remember — mark the exact moment, loop the passage until it's drilled, and get quizzed on it before you forget it.**

### Alternates

- *For the retention angle:* "You don't have a note-taking problem. You have a forgetting problem. ClipMark is spaced repetition for YouTube."
- *For the builder/HN angle:* "A Chrome extension that bookmarks exact YouTube timestamps, loops A–B segments, and then pauses the video to quiz you on them on a spaced schedule. Exports to Anki."
- *For short-video:* "Stop rewatching the same 40-minute lecture to find one 20-second explanation."

### The wedge, stated as a contrast

Everything else in this space is a **playback** tool. ClipMark is a **retention** tool.

| The market today | ClipMark |
|---|---|
| Loopers (e.g. Looper for YouTube — ~400K users, 4.6★ / ~4K ratings) let you replay a section. You still forget it. | Loops a section **and then comes back and asks you about it days later.** |
| Speed controllers and note tools help you get through video faster. | Helps you get through it **once** and not need to again. |
| Summarizer/AI-notes tools paraphrase the video and hand you a wall of text. | Never paraphrases — every review links back to **the professor's actual sentence at the actual second.** |
| Flashcard tools ask you to leave the video and go make cards. | Capture happens in one keystroke without leaving the video; the card is a byproduct. |

**The single most important sentence in the whole kit:** *ClipMark doesn't replace Anki — it feeds it.* Anyone spaced-repetition-literate will immediately ask "why not just Anki?", and the honest answer is the differentiator. Lead with it rather than dodging it. (This is already the site's FAQ answer, so the story is consistent.)

**The demand proof that isn't a claim about us:** ~400K people installed an extension whose entire job is looping a YouTube section, and ~2M installed Language Reactor to study from video. The behaviour is real and large. Nobody in that set closes the loop on *retention*.

---

## 3. ICP + segments

### Primary ICP

An adult learning something hard from long-form video, who has already noticed they forget it. Concretely: they re-scrub the same lecture more than once, they already know what spaced repetition is, and many of them already use Anki.

### Segments, ranked by Day 1–2 usefulness

| # | Segment | Why they care | Where they are on Day 1–2 | Long-game channel |
|---|---|---|---|---|
| S1 | **Self-learners / devs learning from conference talks & long tutorials** | Live on YouTube for technical learning; forget it immediately; sympathetic to a well-built extension | **PH, HN, IH, X, r/SideProject** — this is the launch-window audience | X build-in-public |
| S2 | **Students on lecture-heavy courses** (uni, exam prep) | The core use case; rewatching lectures is the pain | Lightly, via short-video + study subs on Day 2 | Study subs, SEO pages |
| S3 | **Language learners** | Loop a phrase, drill pronunciation, come back to it. A–B loops + recall map exactly onto this. | Weekly-thread comment only (§7.2) | r/languagelearning long game |
| S4 | **Musicians drilling a passage** | A–B loop is *the* practice primitive; recall for "did I retain the fingering" is a genuinely novel angle | Short-video only on Day 2 | Untapped — see §9 |
| S5 | **USMLE / med students + IMGs** | Highest documented intent, Anki-native | **Deliberately excluded from the 2-day window** (§7.1) | [community-engagement-plan.md](community-engagement-plan.md) 4-week plan |

S4 (musicians) is the most under-served and the most visually obvious in a 15-second vertical video. It is cheap to test on Day 2 and worth a real look after launch.

---

## 4. Messaging pillars

Four pillars. Every piece of copy in [posting-kit.md](posting-kit.md) is built from one of them; if a post isn't traceable to one, cut it.

### P1 — "Watching isn't learning" (the retention pillar)

The core argument. You watched the lecture. You understood it. You have nothing a week later. Summaries don't fix this; retrieval does. ClipMark is the retrieval step that video has never had.

*Proof points to use:* Active Recall **pauses the video and shows you the timestamp and tags with your note hidden**, then you reveal and replay to confirm; "got it" doubles the interval, "again" brings it back tomorrow.

### P2 — "The source, not a summary" (the fidelity pillar)

Every review links to the exact second in the original video. No paraphrase, no AI rewrite standing between you and the explanation. This is the pillar that separates ClipMark from the entire summarizer category, and it's the one that plays best on HN.

### P3 — "Drill the passage" (the A–B loop pillar)

Mark A, mark B, loop it. Multiple segments per video. Saved as bookmarks, so a passage you drilled is also a passage you can be quizzed on later. Loops and recall are the same object — that's the design decision worth talking about.

*Proof points:* multi-segment (not one loop per video), segments are editable, and they flow into Active Recall.

### P4 — "It feeds Anki, it doesn't fight it" (the honesty pillar)

Named and answered before anyone asks. One-click export of reviewed segments — note, timestamp, and a deep link back to the moment — into an Anki-importable file. **Available on the free tier, capped at one export a month.**

This pillar is also where the free-tier caps get stated out loud, because a plan that hides its limits doesn't get to use "honest" as positioning. See §8.

---

## 5. Channel strategy

### 5.1 Organic — the 2-day window

| Channel | Role | Realistic expectation |
|---|---|---|
| **Product Hunt** | The anchor. Everything on Day 1 orbits it. | 2026 PH rewards **comments, maker replies, time-on-page** over raw upvotes, and rewards bringing *new* people to PH. A no-audience solo launch is unlikely to hit #1; a well-defended comment thread and a few hundred genuine visitors is the realistic win. |
| **Hacker News (Show HN)** | Highest-variance, highest-quality channel. Day 2, separated from PH so Ash can actually be present in both threads. | Most Show HNs get modest attention. If it catches, it's the single biggest traffic event available. Pillar P2 is the one that resonates here. |
| **X / Twitter** | Owned narrative + the durable asset. Founder-led. | With no existing following, Day 1 impressions will be small. The thread's real job is to be the thing Ash links to from every other channel, and the start of a build-in-public habit that compounds over months. |
| **LinkedIn** | Second-highest-quality single post. Professional-learning framing lands well. | One good founder post reaches further on LinkedIn than on X from a cold start. |
| **IndieHackers** | Builder peers, durable SEO-ish page. IH culture rewards *"here's how and what I learned,"* not *"we launched."* | Modest traffic, good feedback, occasional durable referral. |
| **Reddit** | Highest reward *and* highest ban risk. Deliberately narrow in this window — see §7. | Two builder-friendly subs on Day 1–2. The study/med/language subs are long-game only. |
| **TikTok / Shorts / Reels** | Distribution for the promo video. Cheapest possible reach test. | Almost certainly nothing on Day 2. These are algorithmic lotteries with a long tail; the point is to have tickets in, not to expect a Day 2 result. |

**Hero creative:** three cuts are rendered and ready — `clipmark-remember-master-60s`, `clipmark-remember-cutdown-30s`, `clipmark-remember-vertical-15s`. The 60s is the PH gallery video and the X/LinkedIn embed; the 15s vertical is the TikTok/Shorts/Reels asset; the 30s is the fallback for anywhere 60s is too long. Asset checklist is in [posting-kit.md](posting-kit.md) §3.

**Explicitly not in the 2-day window:** creator/influencer outreach (that's [creator-outreach-kit.md](creator-outreach-kit.md), a multi-week track), the SEO content program ([SEO-AUDIT.md](SEO-AUDIT.md) §5), Discord servers, and the med beachhead. Adding any of them to a 2-day window guarantees all of them get done badly.

### 5.2 Inorganic / paid

Full detail in [paid-plan.md](paid-plan.md). The strategic summary, because it changes what Day 1–2 should even try to do:

**At ClipMark's price point, paid search is very unlikely to be CAC-positive on day one, and the plan says so out loud.** Education-vertical Google Ads CPCs benchmark around **$4.81–$6.23** in 2026. Against a $7.99/mo, $59.99/yr, $99.99-lifetime product with an unmeasured funnel, the arithmetic doesn't close on broad terms (worked through in [paid-plan.md](paid-plan.md) §4).

So paid gets reframed: **a small budget buying keyword and message intelligence, not customers.** Branded defence, a handful of competitor terms, and ultra-long-tail exact matches — run to learn which words convert, then feed those words into the free channels (SEO pages, PH tagline, ad-free copy). That is a genuinely good use of $10–25/day. Treating it as an acquisition engine at this stage is not.

**Do not start any of it during the 2-day window.** Paid launches after Day 2, once there's baseline organic conversion data to compare against — otherwise the two are indistinguishable in the numbers.

---

## 6. The 2-day execution timeline

All times are **America/New_York (ET)** with PT in brackets where it matters. Dependencies are marked `⛔ blocks`.

### Day 0 — pre-flight (the day before; not a posting day)

| # | Task | Why it's here |
|---|---|---|
| 0.1 | **⛔ Publish v1.0.4 to CWS and confirm the public listing reads 1.0.4.** | §1.1. Blocks every dark-mode claim. If not cleared, run the no-dark-mode copy variants. |
| 0.2 | **⛔ Verify every CTA link resolves**: `clipmark.mithahara.com`, the CWS listing, `/upgrade`, `/affiliate`. Watch for the trailing-slash 308 issue on any hand-built URL. | A dead link on Day 1 costs the whole launch. |
| 0.3 | **⛔ Do one live end-to-end paid purchase check** per `../release/LAUNCH_GO_NO_GO_CHECKLIST.md`. Dodo runs `live_mode` on every Vercel build. | If checkout is broken, traffic is wasted. |
| 0.4 | **Create the PH draft** — tagline, description, gallery, 60s video, topics, first comment saved as a note. Schedule it for 12:01 AM PT. Do **not** publish. | PH drafts can be prepared in advance; doing this at midnight is how launches go out with typos. |
| 0.5 | Prepare the X thread, LinkedIn post, HN title+body, IH post, and both Reddit variants as **local drafts** (they're all in [posting-kit.md](posting-kit.md)). | Nothing should be composed live. |
| 0.6 | **Run the §7.2 rules check on every subreddit** you intend to touch. Write down which variant each sub gets. | 5 minutes per sub. This is the ban-avoidance step. |
| 0.7 | Ask any genuine existing users for a review — individually, unscripted, staggered. Never a batch. | §1.2 |
| 0.8 | Upload the 15s vertical to TikTok/Shorts/Reels as **drafts**. | Day 2 has no room for uploads. |

### Day 1 — Tuesday (Product Hunt day)

| Time (ET) | Do | Depends on |
|---|---|---|
| **03:01** *(12:01 AM PT)* | **Product Hunt goes live.** | 0.1, 0.4 |
| **03:05** | **Post the maker's first comment immediately.** ~70% of Product-of-the-Day winners had one. It's the single highest-leverage 5 minutes of the launch. | PH live |
| 03:10 | Sleep. Genuinely. Day 1 is a 14-hour engagement day and the thread doesn't need a 4 AM reply. | — |
| **07:00** | **X launch thread.** Pin it. This becomes the canonical link every other channel points at. | PH live (thread links to it) |
| 07:15 | Brand account quote-tweets the thread with the 15s vertical. Amplify, don't duplicate. | X thread |
| **08:00** | **LinkedIn founder post** with the 60s video native-uploaded (not a YouTube link — LinkedIn suppresses off-platform links). | PH live |
| **09:00** | **r/SideProject post.** Of all target subs this is the one where posting your own project in the main feed is the intended behaviour. Include a real screenshot/demo — "just an idea" posts get removed. | 0.6 |
| **10:00** | **IndieHackers post** — the "how I built it / what I learned" framing IH rewards, not an announcement. | PH live |
| **10:00–22:00** | **The actual work: engagement.** Reply to *every* PH comment personally. Answer the "why not Anki" question every single time it comes up — that's P4 doing its job. Reply in the r/SideProject and IH threads. Give feedback on other people's PH launches (reciprocity is the social contract in all three communities). | — |
| 13:00 | One X reply-post in the thread with a short screen-capture of the A–B loop. Keeps the thread alive without a new post. | X thread |
| 18:00 | Second LinkedIn *comment* (not post) on your own post answering the most common question so far. | LinkedIn post |
| **22:00** | Log the day: PH upvotes/comments, CWS installs, site sessions, signups, any Pro conversion. Raw numbers to a file. | — |

**Day 1 hard rules:** never ask anyone to upvote on PH — PH's own guidance is *ask people to visit and comment*, not to upvote. Don't post the Show HN today. Don't touch the study/med/language subs today.

### Day 2 — Wednesday (Show HN day + the long tail)

| Time (ET) | Do | Depends on |
|---|---|---|
| **08:30** | **Show HN.** Weekday US-morning is the live window. Title format is fixed: `Show HN: ` + plain description, **no hype, no exclamation marks, no emoji**. Body as a first comment. Then **sit in the thread for 3+ hours** — HN's whole norm is that the maker is present and discussing. | 0.5 |
| **08:30–12:00** | Answer HN comments. Expect hard technical and business questions: MV3 lifecycle, why a browser extension instead of a webapp, on-device AI, why not Anki alone, what happens if YouTube changes its DOM. Answer them straight; concede what's genuinely weak. **Never ask for upvotes — HN's guidelines call it out explicitly.** | HN live |
| **09:00** | Brand account cross-posts the HN link on X. | HN live |
| **12:00** | **r/chrome_extensions post** (only if 0.6 cleared it). Builder-side framing. | 0.6 |
| **13:00** | **Publish the three short videos** — TikTok, YouTube Shorts, Instagram Reels — from the Day 0 drafts. Different hook per platform (variants in [posting-kit.md](posting-kit.md) §7). | 0.8 |
| **14:00** | **r/Anki** *or* the **r/languagelearning weekly thread** — whichever the 0.6 check cleared. Not both. Anki framing must be additive ("it feeds Anki"), never competitive. | 0.6 |
| **16:00** | **X build-in-public Day-2 post** — the honest numbers from Day 1. Real numbers, including if they're small. This is the post that starts the compounding habit, and small honest numbers outperform vague big claims. | Day 1 log |
| **18:00** | Final PH engagement pass before the 11:59 PM PT day closes. Reply to stragglers. **A comment nudge, not an upvote ask.** | — |
| **21:00** | Write the retro: what got traffic, what converted, which objection came up most, which hook performed. This is the input to [paid-plan.md](paid-plan.md) — the words real people used are the keywords worth buying. | — |

### Dependency graph, compressed

```
0.1 v1.0.4 live ──⛔──> all dark-mode copy
0.2 links OK    ──⛔──> every post on both days
0.3 checkout OK ──⛔──> any paid traffic, ever
0.6 sub rules   ──⛔──> every Reddit action
        │
   PH live (D1 03:01) ──> maker comment (03:05) ──> X thread (07:00) ──> everything else links here
        │                                              │
        └──> LinkedIn (08:00), r/SideProject (09:00), IH (10:00)
                                                       │
   Show HN (D2 08:30) ──> X cross-post (09:00)         │
   Day 1 log ─────────────────────────────────────────> D2 16:00 build-in-public post
   Day 2 retro ───────────────────────────────────────> paid-plan.md keyword list
```

### 6.1 Watch windows and the incident path

Folded in from `docs/release/LAUNCH_DAY_RUNBOOK.md` (2026-06-25), which this section replaced.
Its four named owner roles were dropped — they described a team that doesn't exist. The
monitoring cadence is the part worth keeping, because launch day is the one day the numbers
move fast enough that hourly is too slow:

| Window | Cadence | Watch |
|---|---|---|
| **First 2 hours** after the listing goes live | every **15 min** | Install and first-open success · checkout completion rate · Dodo webhook errors (**Vercel function logs** — Sentry does not see these) · auth callback failures |
| **Rest of the first 24 hours** | **hourly** | New paid conversions · listing reviews and support mail · error spikes in API routes |

**If something breaks:** freeze non-essential deploys, fix forward or roll back, then write down
the timeline and impact while you still remember it. Whether it's a hotfix or waits for the next
train is a decision **against the criteria in [`../RELEASE-PROCESS.md`](../RELEASE-PROCESS.md) §3**,
not a judgement call under launch-day pressure — that's exactly the situation the lane was
written for. Rollback mechanics: [`../RELEASE-RUNBOOK.md`](../RELEASE-RUNBOOK.md) §6. Remember the
webapp rolls back in seconds and the extension does not roll back at all.

---

## 7. Reddit — the part most likely to go wrong

### 7.1 Why the 2-day window deliberately avoids the best subreddits

This repo already contains a Reddit plan — [community-engagement-plan.md](community-engagement-plan.md) — and it says, in writing, **do not post a product link in week 1**, and treats a ban from r/medicalschoolanki as the single highest-severity failure mode in the whole go-to-market.

A 2-day all-platforms blitz and that plan are in direct conflict for the strict study/med subs. Resolving it by ignoring the existing plan would be the expensive mistake, so:

- **In the 2-day window:** only subs where sharing your own project is the *intended* behaviour of the sub — r/SideProject, and r/chrome_extensions if its rules confirm it. Plus, at most, one carefully-framed post in r/Anki or one comment in the r/languagelearning weekly thread.
- **Not in the 2-day window, at any framing:** r/medicalschoolanki, r/step1, r/step2, r/usmle, r/medicalschool, r/Mcat, r/productivity, r/GetStudying, r/studytips, and every Discord. These stay on the existing weeks-of-participation-first track.

The trade is explicit: **the 2-day plan gives up the highest-intent Reddit audiences in exchange for not burning them.** They're worth more in week 6 with a track record than in hour 30 with none.

### 7.2 The mandatory 5-minute check, per sub

Because I could not read reddit.com from this environment (§1.3), do this by hand for each sub, in order:

1. Open `reddit.com/r/<sub>/about/rules` and read every rule.
2. Look for: an outright self-promotion ban; a **weekly/megathread-only** rule; a **flair requirement**; a **karma or account-age minimum**; a **mod-preclearance** requirement.
3. Check the pinned posts for a self-promo thread.
4. Then pick the variant in [posting-kit.md](posting-kit.md) §5:
   - Rules **permit a project post** → post variant **A** (full post).
   - Rules say **weekly thread / megathread only** → comment variant **B** in that thread. Do not make a post.
   - Rules **ban self-promotion outright**, or you don't clear a karma/age gate → **post nothing.** Add the sub to the long-game track instead.
5. Never post the same text in two subs. Never post an affiliate/referral link in a comment or post — plain product links only.

---

## 8. Honest-claims register

Every one of these was checked against the code or the live site on 2026-08-12. The register exists so that a claim can't drift into the copy by accident.

**Safe to claim, verified:**

- Bookmark the exact timestamp in one keystroke, without leaving the video.
- **A–B multi-segment loops** — multiple segments per video, editable, saved as bookmarks, and drilled in Active Recall. Merged and shipped in the published 1.0.3.
- **Active Recall pauses and prompts before replaying:** shows timestamp + tags with the note hidden; reveal, replay, then grade — "got it" doubles the interval, "again" returns it tomorrow.
- Every review deep-links to the exact second in the original video.
- On-device AI note drafting — it uses **Chrome's built-in Gemini Nano via the Prompt API**, so nothing leaves the machine. ⚠️ **Caveat worth volunteering on technical channels:** Chrome gates that model on version, hardware, and a background download, so the feature is genuinely unavailable to some users and the flow falls back to writing the note by hand. Fine to describe as "on-device AI note drafting" in short-form copy; don't imply it's universally available in any long-form or technical context.
- Anki export — note, timestamp, and deep link, as an Anki-importable file.
- Shared collections via a public link.
- `#tag` parsing with automatic colouring.
- Free tier: **unlimited local bookmarks, notes, tags, groups, on-device AI drafting, JSON/CSV/Markdown export, 25 standing Active Recall segments, 30 reviews/month, 1 Anki export/month, up to 10 shared collections. No card, no trial clock.**
- **Capture, A–B loops, Active Recall and the Anki export all work with no ClipMark account** — bookmarks live in `chrome.storage.sync` and the Anki export is generated locally against a local usage counter. Only shared collections and cross-device cloud sync require an account. Say it that way; don't flatten it to "no account needed" where collections are also being mentioned.
- Pro: **$7.99/mo, $59.99/yr, $99.99 lifetime.** Removes those caps and adds cloud sync, scheduled review reminders, and Obsidian/Notion **export**.
- Affiliate: **one-time 30% commission** on a referred user's first Pro purchase, 30-day cookie, audience gets 10% off.

**Must not be claimed:**

| Don't say | Because |
|---|---|
| System-synced dark mode | ✋ **Ships in v1.0.4, which is not on the public listing yet.** Blocked on Day 0.1. |
| "Syncs to Notion/Obsidian" | It's a one-off **export**, not sync. |
| Deep Transcript Search · Lifetime/Permanent Cloud or Transcript Archiving · "early access to labs" | Not built. `ComingSoon` on the pricing page. |
| "Free unlimited Anki export" / "unlimited free tier" | Free is **1 Anki export a month**, 25 standing segments, 30 reviews. Pro is the unlimited one. |
| "Scheduled reminders, free" | Scheduled review reminders are **Pro**. |
| **"30% recurring" / "revenue share" / "lifetime commission"** | It's **one-time**, on the first purchase only. The affiliate page says so explicitly. |
| Any user count, install count, rating, MRR, or "trusted by N learners" | Listing shows a near-zero install count and **zero reviews**. IH removes unproven MRR claims, and HN will find out. |
| Competitor brand names in paid **ad copy** | Allowed as keywords, not in ad text/display URL. See [paid-plan.md](paid-plan.md) §3.3. |

---

## 9. What to measure, and what "worked" means

**Per channel, log by hand:** referrer sessions → CWS listing clicks → installs → signups → first-bookmark-saved → first-recall-completed → Pro conversions.

The activation event that matters is not the install. It's **first completed Active Recall cycle** — reveal, replay, grade. That's the moment the product's argument lands. A 2-day launch that produces installs and zero completed recall cycles has an activation problem, and pushing more traffic at it wastes the one-time trust withdrawal each community post represents.

**Realistic 2-day success, given zero audience and zero reviews:**

- PH: a real comment thread with Ash in every reply. Ranking is a bonus, not the goal.
- HN: front-page is a lottery. A thread with substantive technical discussion is the win.
- The durable outputs are: **one pinned X thread**, **one LinkedIn post**, **one IH page**, **three short videos in three algorithms**, and **a written list of the actual objections real people raised.** That last one is the most valuable artifact of the whole two days — it's the input to the paid keyword list, the SEO pages, and the next version of the copy.

**Post-launch, in priority order:** (1) fix whatever activation gap the funnel shows; (2) start the [community-engagement-plan.md](community-engagement-plan.md) 4-week med track; (3) build the SEO pages from [SEO-AUDIT.md](SEO-AUDIT.md) §5 using the words from the Day 2 retro; (4) test the musician/language-learner segments (S3, S4) that the A–B loop serves and nobody is marketing to; (5) only then consider scaling paid.

---

## Sources

Platform rules and benchmarks referenced above:

- [Show HN guidelines — Hacker News](https://news.ycombinator.com/showhn.html)
- [Product Hunt Launch Guide (official)](https://www.producthunt.com/launch) · [How to post a product — PH Help Center](https://help.producthunt.com/en/articles/479557-how-to-post-a-product)
- [How to Launch on Product Hunt in 2026 — InnMind](https://blog.innmind.com/how-to-launch-on-product-hunt-in-2026/) · [LaunchList](https://getlaunchlist.com/blog/how-to-launch-on-product-hunt-2026) · [Product Hunt launch assets — Submitator](https://submitator.com/blog/product-hunt-launch-assets)
- [Reddit self-promotion rules / the 90-10 rule — Indexly](https://indexly.ai/glossary/reddit-self-promotion-rules) · [r/SideProject rules 2026 — MediaFast](https://www.mediafa.st/subreddit/sideproject) · [Self-promotion rules by subreddit — Soar](https://www.soar.sh/blog/self-promotion-rules-by-subreddit-database)
- [Tips for making successful posts on Indie Hackers](https://www.indiehackers.com/post/tips-for-making-successful-posts-on-indie-hackers-b04454a57a)
- [Build in Public on X in 2026 — AutoTweet](https://www.autotweet.io/blog/build-in-public-on-x-twitter-2026) · [Build-in-public launch strategy 2026 — Averi](https://www.averi.ai/blog/how-to-launch-your-product-in-2026-a-build-in-public-strategy-guide)
- [Looper for YouTube — Chrome Web Store](https://chromewebstore.google.com/detail/looper-for-youtube/iggpfpnahkgpnindfkdncknoldgnccdg) · [Language Reactor — Chrome Web Store](https://chromewebstore.google.com/detail/language-reactor/hoombieeljmmljlkjmnheibnpciblicm) · [ClipMark — Chrome Web Store](https://chromewebstore.google.com/detail/clipmark/iboippnihpcnnglgboaiedaiimbiolgg)
- Paid benchmarks are cited in [paid-plan.md](paid-plan.md).
