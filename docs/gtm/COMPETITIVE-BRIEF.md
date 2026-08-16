# ClipMark — Competitive brief

**Date:** 2026-08-16 · **Method:** live web research — Chrome Web Store listings and vendor sites fetched directly, August 2026
**Fills:** [`MARKET-FIT-US-UK-AU.md`](MARKET-FIT-US-UK-AU.md) §5 / **B1**, which flagged that no competitive brief existed and declined to invent one.

## Evidence rules

- **`[VERIFIED]`** — fetched from the vendor's own site or its Chrome Web Store listing on 2026-08-16. Source linked.
- **`[SECONDARY]`** — from a third-party review/aggregator, not the vendor. Treat as indicative.
- **`[ASSUMPTION]`** — my inference, labelled as such.
- **`[UNVERIFIED]`** — could not establish. Not guessed.

CWS install counts are Google's own rounded buckets ("100,000 users"), not exact figures. Regional splits are **not** published by the Chrome Web Store, so **no per-country install data appears anywhere in this brief** — that is a real limitation, called out again in §7.

> **Reddit was not reachable from this environment**, so community-sentiment data (r/medicalschoolanki, r/step1, r/UniUK) is absent. [`community-engagement-plan.md`](community-engagement-plan.md) §1 remains the source for that, and its figures are unverified here.

---

# 1 · The landscape at a glance

Everything in this table was fetched on 2026-08-16.

| Product | Category | Users `[VERIFIED]` | Rating | Last updated | Price `[VERIFIED]` unless noted |
|---|---|---:|---|---|---|
| [Language Reactor](https://chromewebstore.google.com/detail/language-reactor/hoombieeljmmljlkjmnheibnpciblicm) | Learning-from-video (language) | **2,000,000** | 4.2 (4.3K) | 1 Jul 2026 | Free + Pro **$5/mo · $28/yr** `[SECONDARY]` |
| [Looper for YouTube](https://chromewebstore.google.com/detail/looper-for-youtube/iggpfpnahkgpnindfkdncknoldgnccdg) | A–B loop / repeat | **400,000** | 4.6 (4,000) | 23 Apr 2026 | Free, no IAP |
| [Web Highlights](https://chromewebstore.google.com/detail/web-highlights-pdf-web-hi/hldjnlbobkdkghfidgoecgmklcemanhm) | Highlighting + flashcards + SR | **200,000** | 4.8 (5,000) | 24 Jul 2026 | Freemium; Premium ~**$4.49/mo** `[SECONDARY]` |
| [Glasp — YouTube Summary](https://chromewebstore.google.com/detail/youtube-summary-chatgpt-b/cdjifpfganmhoojfclednjdnnpooaojb) | Summarize / highlight | **100,000** | 3.9 (209) | 5 Aug 2026 | Free + Pro **$12.50/mo · $150/yr**; Unlimited **$30/mo** |
| [Video Speed Controller](https://chromewebstore.google.com/detail/video-speed-controller/gioehmkjkeamcinbdelehlpnpdcdjpdp) | Playback control | **100,000** | 4.6 (1.2K) | 5 May 2025 | Free |
| [YiNote](https://chromewebstore.google.com/detail/yinote/fhpgggnmdlmekfdpkdgeiccfkignhkdf) | Timestamped video notes | **7,000** | 4.0 (134) | **3 Jul 2024** | Free |
| [ReClipped](https://chromewebstore.google.com/detail/reclipped-youtube-notes-s/gbnebpdekafhpcipejfhabfghccgfnbh) | Timestamped notes + screenshots | **4,000** | 4.3 (53) | 4 Apr 2026 | No price on listing `[UNVERIFIED]` |
| [Klarrity](https://klarrity.app/) | Highlight → flashcards → export | `[UNVERIFIED]` | — | — | **$7/mo · $59/yr**, 7-day trial |
| [Youtube2Anki](https://chromewebstore.google.com/detail/youtube2anki/boebbbjmbikafafhoelhdjeocceddngi) | Transcript → Anki | **1,000** | 5.0 (9) | **14 Aug 2022** | Free |
| [Ulearn — YouTube Quiz & Spaced Repetition](https://chromewebstore.google.com/detail/ulearn-youtube-quiz-space/kfeabnmakekpdjbpkfghknoeoahjagif) | Auto-quiz + SR on YouTube | **230** | 5.0 (3) | 14 Jun 2026 | `[UNVERIFIED]` |
| **[ClipMark](https://chromewebstore.google.com/detail/clipmark/iboippnihpcnnglgboaiedaiimbiolgg)** | *(this product)* | **7** | 5.0 (1) | 16 Aug 2026 | Free + **$7.99/mo · $59.99/yr · $99.99 lifetime** |

`[VERIFIED]` ClipMark's own listing reads **7 users, 1 rating, v1.0.6** — confirming the "~0 reviews" premise in [`marketing-launch-plan.md`](marketing-launch-plan.md) §1.2. Every number above is a starting position, not a destination.

---

# 2 · ⚠️ The finding that changes a claim on ClipMark's own site

`webapp/app/components/WhyClipMark.tsx:41` currently states, as one of "four things we refuse to get wrong":

> **"It quizzes you — no other YouTube bookmarker does"**

**That claim does not survive contact with the market.** Two shipping products already quiz you on YouTube content and schedule the review themselves:

### Ulearn — YouTube Quiz & Spaced Repetition `[VERIFIED]`
[CWS listing](https://chromewebstore.google.com/detail/ulearn-youtube-quiz-space/kfeabnmakekpdjbpkfghknoeoahjagif) · 230 users · updated 14 Jun 2026

Generates an AI quiz when you finish a video, "based only on the portion of the video you've watched", and saves results to a **built-in spaced-repetition dashboard** with staged progression. Multiple-choice and free-response modes, cross-device sync, offline support.

### Web Highlights `[VERIFIED]`
[CWS listing](https://chromewebstore.google.com/detail/web-highlights-pdf-web-hi/hldjnlbobkdkghfidgoecgmklcemanhm) · **200,000 users** · updated 24 Jul 2026 · [YouTube feature docs](https://web-highlights.com/docs/features/youtube-highlighting)

Highlights YouTube transcripts in sync with playback, turns the transcript **and your highlights** into Q&A cards, and reviews them **with its own spaced repetition**. Free and Premium are limited to 1 video/day; Ultimate is unlimited.

**Why this matters more than a normal competitive finding:** ClipMark's brand position is claim honesty — the `WhyClipMark` file header explicitly promises each claim is "checkable against shipped code rather than asserted." This one is checkable against shipped *code* and false against the *market*. It is exactly the failure mode the earlier audits were commissioned to catch, one level up.

## The distinction that does survive — and it is a good one

The competitors generate **AI questions about the video's content**. ClipMark hides **your own note** and replays **the actual clip** as the answer key. That is a different epistemic act: retrieval of your own encoding, with the primary source as the answer, versus recognition of a machine-authored multiple choice.

**Recommended replacement claim `[VERIFIED]` as accurate:**

> *"Your note is the question. The clip is the answer. Most tools generate AI quizzes about a video — ClipMark hides what **you** wrote and replays the exact second so you check yourself against the source."*

That is defensible, more specific, and more flattering than the absolute claim it replaces.

---

# 3 · Category by category

## 3.1 Timestamped video notes — the nominal category, and it is weak

| | YiNote | ReClipped |
|---|---|---|
| Users `[VERIFIED]` | 7,000 | 4,000 |
| Last updated `[VERIFIED]` | **3 Jul 2024** | 4 Apr 2026 |
| Does | Timestamped notes, click-to-jump, central library, keyword search | Timestamped notes, screenshots, transcript highlighting, colour/tags, export PDF/Markdown, Notion/Evernote/Readwise sync |
| Gap | No review loop, no Anki, ~2 years without an update | No review loop; capture-and-hand-off only |

`[ASSUMPTION]` YiNote is effectively abandoned — two years without an update on an extension that lives inside YouTube's DOM is, per this repo's own reasoning on `/switch-from-videosegments`, a reliability risk.

**The pattern across the whole category `[VERIFIED]` across all listings read:** every one of these tools stops at *capture and export*. **None of them asks you a question later.** That is the structural gap ClipMark is aimed at, and it is real — just not unoccupied (§2).

## 3.2 A–B loop / segment repeat — big, free, and a different job

`[VERIFIED]` Looper for YouTube: **400,000 users**, 4.6 (4,000 ratings), free, no in-app purchases. This externally confirms the "~400K-install looper" cited in [`paid-plan.md`](paid-plan.md):85.

- **Does:** one-click replay, auto-loop toggle, loop counts, loop portions, hotkeys, URL parameters, 18 languages.
- **Gap:** no notes, no persistence of *meaning*, no review. It repeats a segment; it does not help you remember it.
- **Strategic read `[ASSUMPTION]`:** this is a **demand signal, not a rival**. 400K people already drill segments of YouTube videos — the behaviour ClipMark's A–B loops serve. But the category is free and commoditised (LoopTube A–B, YouTube Looper, A-B Repeat all exist), so **loops cannot be the paid wedge**; they are an acquisition hook. That matches `paid-plan.md`'s Tier-2 keyword framing.

`[VERIFIED]` Video Speed Controller (the listing I fetched): 100,000 users, last updated **May 2025**, free. `[SECONDARY]` a larger, widely-cited VSC with ~3M users exists; I could not resolve its listing and am **not** citing that number as verified. Adjacent utility, not a competitor.

## 3.3 Learning-from-video — the biggest player, and it proves the model

`[VERIFIED]` Language Reactor: **2,000,000 users**, 4.2 (4.3K), updated 1 Jul 2026. Dual subtitles on Netflix and YouTube, popup dictionary, sentence navigation, TTS.

`[SECONDARY]` Pro is **$5/mo or $28/yr**, adding machine translation, unlimited saving, **Anki export** and an AI dictionary. Note: the CWS listing itself makes **no mention** of Anki export or spaced repetition — that claim comes from third-party reviews, so treat it as indicative.

**Why it is the most instructive competitor:**
- `[VERIFIED]` It is the largest tool in this space **by a factor of five**, and it is a *narrow, audience-specific* tool — language learners — not a general one.
- `[ASSUMPTION]` That is direct evidence for §6's positioning takeaway: in this category, **specificity scales better than generality.** Language Reactor did not win by being a good video tool; it won by being *the* tool for one way of studying.
- `[SECONDARY]` It also validates the export-to-Anki pattern as a paid feature at a **$5/mo** price point — meaningfully below ClipMark's $7.99.

## 3.4 Summarizers — a conceded space, correctly

`[VERIFIED]` Glasp — YouTube Summary: 100,000 users, but **3.9 stars from only 209 ratings**, the weakest satisfaction signal in this set. Pricing is aggressive: Free (3 summaries/day), Pro **$12.50/mo · $150/yr**, Unlimited **$30/mo**.

`[VERIFIED]` [`retention-seo-pages.md`](retention-seo-pages.md) already concedes "youtube summarizer" as unwinnable and targets the retention space instead. **This research supports that call** — and adds a second reason beyond competition: at 3.9 stars, the category has a satisfaction problem, which is consistent with `/faq`'s existing argument that a summary is "a shortcut past the video."

`[ASSUMPTION]` Glasp's $12.50–$30/mo pricing also anchors the ceiling: ClipMark at $7.99 is not the expensive option in this market.

## 3.5 Anki-ecosystem and YouTube→Anki — thin, stale, but *not* empty

| Tool | Users | Updated | Does |
|---|---|---|---|
| Youtube2Anki `[VERIFIED]` | 1,000 | **Aug 2022** | Transcript → CSV or direct to Anki deck |
| YouTube to Anki (XXHK) `[SECONDARY]` | `[UNVERIFIED]` | — | Timestamped notes → Anki via AnkiConnect (Alt+S) |
| Klarrity `[VERIFIED]` | `[UNVERIFIED]` | — | Highlight → AI cards → Anki/Quizlet/Notion/Obsidian/CSV |

**Klarrity is the closest analogue to ClipMark and deserves attention.** `[VERIFIED]` from [klarrity.app](https://klarrity.app/): positioning is *"Highlight text. Get flashcards."*, its **Study Klips** feature picks the last 30s/60s/2m of a YouTube video and generates cards "with timestamp links back to the source moment", and it prices at **$7/mo · $59/yr** — within a dollar of ClipMark's $7.99/$59.99.

`[VERIFIED]` **But Klarrity does not review.** Its own site is explicit that it exports to "Anki · Quizlet · Notion · Obsidian · CSV" and has no spaced-repetition system of its own. So on the review loop, ClipMark's differentiation holds against Klarrity — it does not hold against Ulearn and Web Highlights (§2).

`[VERIFIED]` Anki itself: free on desktop/Android, **$24.99 one-time on iOS** `[SECONDARY]`. It is not a competitor — it is the standard ClipMark correctly positions as additive (`/faq`: "No — it feeds it").

---

# 4 · Where ClipMark's combination is genuinely uncontested

Nothing found in this research does **all** of the following in one product:

| Capability | ClipMark | Nearest competitor doing it |
|---|---|---|
| Timestamp capture with your own note | ✓ | ReClipped, YiNote |
| A–B loop / segment drill | ✓ | Looper (400K, free, separate tool) |
| Spaced review **of your own note**, in-product | ✓ | Ulearn / Web Highlights — but of *AI-generated* cards |
| Anki export on the **free** tier | ✓ (1/mo) | Language Reactor (Pro only) `[SECONDARY]`; Klarrity (paid only) |
| On-device AI, nothing sent to a server | ✓ | **None found** |
| Two-host permission scope | ✓ | **Not advertised by any competitor found** |

**Two of these look genuinely differentiating, and they are not the ones the site currently leads with:**

1. **On-device AI.** `[VERIFIED]` Every AI competitor found routes content to a server — Glasp names ChatGPT/Claude/Mistral/Gemini; Klarrity and Ulearn are AI-generation tools. ClipMark's Chrome-built-in Gemini Nano means transcripts never leave the device. `[ASSUMPTION]` For UK/EU users post-GDPR and for anyone studying licensed course material, that is a substantive advantage — and **no competitor in this set advertises anything equivalent.**

2. **Anki export on the free tier.** `[SECONDARY]` Language Reactor gates Anki export behind Pro; Klarrity is paid-only. ClipMark gives one free export a month. `[ASSUMPTION]` — and this reinforces the `MARKET-FIT` §3.2 concern that 1/month is too tight to demonstrate the advantage.

---

# 5 · Where competitors are weak for US/UK/AU study users

Being honest about the limit first: **no per-country data exists.** CWS does not publish regional splits, and Reddit was unreachable. What follows is inference from product design, marked accordingly.

| Weakness | Evidence | Who it opens up |
|---|---|---|
| **Capture-only tools never close the loop** | `[VERIFIED]` YiNote, ReClipped, Klarrity all export and stop | Exam-driven students, whose whole problem is *recall under time pressure*, not archival |
| **AI-quiz tools test the video, not your understanding** | `[VERIFIED]` Ulearn quizzes "based only on the portion you've watched"; Web Highlights generates from transcript | `[ASSUMPTION]` Students who already know what mattered in the lecture and need to retain *that*, not be re-tested on the whole thing |
| **The dominant loop tool has no memory** | `[VERIFIED]` Looper: 400K users, zero notes/review | 400K people already drilling segments with nothing to show for it a week later |
| **Server-side AI in an era of institutional data rules** | `[VERIFIED]` all AI competitors found are cloud-based | `[ASSUMPTION]` UK/EU/AU university students and anyone handling licensed lecture content |
| **Nobody found is positioned for a named exam or education system** | `[VERIFIED]` every listing read is generic — "learners", "students", "language learners" | **All three target markets.** Even Language Reactor, the category leader, wins on *method* specificity, not *market* specificity |
| **Stale incumbents in the notes category** | `[VERIFIED]` YiNote Jul 2024, Youtube2Anki Aug 2022 | Reliability-conscious users — the argument `/switch-from-videosegments` already makes |

`[ASSUMPTION]` **The most exploitable of these is the last-but-one.** Not one competitor found names an exam, a course, a syllabus or a country. If Language Reactor's 2M users demonstrate that specificity scales, then the naming gap is the opening — and it is a *positioning* opening, which is cheap, rather than a *feature* one.

---

# 6 · Defensible differentiation, threats, and positioning takeaways

## 6.1 What is actually defensible

| Claim | Defensibility | Basis |
|---|---|---|
| **On-device AI (nothing leaves the device)** | **Strongest.** Competitors would need to re-architect off their server-side LLM economics | `[VERIFIED]` no competitor found offers it |
| **Your note is the question, the clip is the answer** | **Strong and precise** — distinct from AI-generated quizzing | `[VERIFIED]` §2 |
| **Free Anki export** | Moderate — trivially copied, but nobody has | `[SECONDARY]` competitors gate it |
| **Capture + loop + review in one tool** | Moderate — an integration advantage, not a moat | `[VERIFIED]` §4 |
| ~~"No other YouTube bookmarker quizzes you"~~ | **Not defensible — false.** Replace it | `[VERIFIED]` §2 |

## 6.2 Biggest threats, ranked

1. **Web Highlights `[VERIFIED]` — 200,000 users, 4.8★, ships YouTube highlighting + flashcards + spaced repetition, updated last month.** The single most serious competitor found: it already does the loop, at scale, with a strong satisfaction signal, at a lower price point `[SECONDARY]` ~$4.49/mo. Its YouTube limit of 1 video/day on Free *and* Premium `[VERIFIED]` is the visible seam.
2. **Klarrity `[VERIFIED]`** — nearly identical price ($7/mo vs $7.99), timestamp-linked cards from YouTube clips, multi-destination export. One product decision away (adding review) from erasing ClipMark's core distinction.
3. **Language Reactor `[VERIFIED]` — 2M users.** Not a direct competitor today, but it has the audience, the Anki habit `[SECONDARY]`, and the distribution. If it extends beyond language learning, it starts from 2M users; ClipMark starts from 7.
4. **`[ASSUMPTION]` Google/YouTube shipping native AI notes or recall.** Platform risk that would compress the whole category. Unpredictable, unmitigable, worth naming.
5. **`[ASSUMPTION]` Commoditised free loopers** anchoring willingness-to-pay near zero for the loop feature specifically.

## 6.3 Positioning takeaways — for the audience-anchor decision

**T1. Fix the falsified claim before anything else ships.** `[VERIFIED]` `WhyClipMark.tsx:41` is wrong. On a site whose differentiator *is* honesty, an unsubstantiated competitive claim is a bigger liability than the differentiation it was meant to buy. §2 has drop-in replacement copy. **This is the highest-priority item in this brief.**

**T2. Lead with on-device AI — it is the only thing nobody else has.** `[VERIFIED]` Every AI competitor found is cloud-based. Today ClipMark buries this: the audit found the AI section mislabelled "Pro Features", and privacy sits in a footnote. `[ASSUMPTION]` "Your lecture transcripts never leave your laptop" is a sharper wedge in US/UK/AU study markets than "second brain" — and it is unarguably true.

**T3. Specificity beats generality — the category leader proves it.** `[VERIFIED]` Language Reactor is 5× the next-largest tool and is narrowly aimed at one way of studying. `[VERIFIED]` No competitor found names an exam, syllabus or country. This is direct support for `MARKET-FIT` §2.5's audience-anchor recommendation: **name the studier.** The competitive risk of narrowing is lower than the analysis assumed, because the winner in this category is the narrow one.

**T4. Do not position on loops or notes.** `[VERIFIED]` Looper (400K) and Video Speed Controller (100K) are free and mature; ReClipped and YiNote already do notes. Loops are an acquisition hook (`paid-plan.md` Tier 2 agrees); the paid story has to be retention.

**T5. Price is not the problem — clarity is.** `[VERIFIED]` ClipMark at $7.99/mo sits between Klarrity ($7) and Language Reactor ($5) `[SECONDARY]`, and far under Glasp ($12.50–$30). `[ASSUMPTION]` The pricing work worth doing is the currency labelling and tax claim from `MARKET-FIT` §1, not a price change. **Do not discount into a market where you are already mid-range.**

---

# 7 · What this brief could not establish

Stated plainly so nobody treats absence as evidence:

- **Per-country installs or revenue for any competitor.** CWS publishes no regional data. Any US/UK/AU market-share claim would be fabricated.
- **Community sentiment.** Reddit unreachable from this environment.
- **Klarrity's and Ulearn's scale.** Klarrity has no CWS listing I could locate; Ulearn's linked site (`ulearnai.org`) resolves to unrelated content, so its pricing is `[UNVERIFIED]`.
- **Whether Language Reactor's Anki export is real and in which tier.** Its own CWS listing omits it; only third-party reviews assert it. Verify on the vendor site before citing it.
- **ReClipped's pricing.** Absent from its listing.
- **The larger Video Speed Controller listing** (~3M users `[SECONDARY]`) — could not resolve, so not counted.

**Refresh cadence `[ASSUMPTION]`:** install buckets and pricing move slowly; re-run before any major positioning change or paid campaign, and immediately if Web Highlights or Klarrity ship a change to their review loop.

---

*Sources are linked inline. Every figure is tagged. Nothing here is estimated market data — where a number could not be verified it is marked `[UNVERIFIED]` rather than filled in.*
