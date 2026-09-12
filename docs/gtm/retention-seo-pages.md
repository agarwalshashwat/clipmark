# Retention SEO pages — keyword → page map

**Shipped:** 2026-08-08 · **Scope:** `webapp/app/(marketing)/` · **Ref:** [SEO-AUDIT.md](./SEO-AUDIT.md)

The strategy is to take the **retention** search space, which no competitor is
contesting, rather than the two spaces we have concluded are unwinnable:

- **AI summary / "youtube summarizer"** — lost. Well-funded incumbents, and the
  term is a poor fit for what ClipMark actually does (make it stick, not digest
  it). Addressed only as a disambiguation answer on `/faq`, never as a target.
- **Generic "study mode" / "focus mode" head terms** — overcrowded, and the
  intent is blocking distraction rather than remembering. Also handled as a
  single FAQ disambiguation, not as a page.

## Mapping

| Target term | Page | `<title>` | Meta description (opening) |
|---|---|---|---|
| active recall from youtube · quiz yourself on a video · remember what you watch (secondary) | `/active-recall-youtube` | Active Recall From YouTube — Quiz Yourself on Any Video | Turn any YouTube video into an active-recall session… |
| spaced repetition youtube · revise lectures (`#revise-lectures` H2) | `/spaced-repetition-youtube` | Spaced Repetition for YouTube — Revise Lectures That Stick | Put YouTube lectures on a spaced-repetition schedule… |
| flashcards from youtube · turn youtube into flashcards | `/youtube-flashcards` | Flashcards From YouTube — Turn Any Video Into Flashcards | Make flashcards from YouTube without transcribing anything… |
| youtube to anki · anki from youtube · how do I get my clips into Anki | `/youtube-to-anki` | YouTube to Anki — Export Video Moments Into Your Deck | Get Anki cards from YouTube without retyping… |
| videosegments alternative · switch from videosegments | `/switch-from-videosegments` | Switching From VideoSegments — A Migration Guide | Moving off an unmaintained YouTube timestamp extension… |
| long-tail question queries (speed, fullscreen, sync, export, permissions, Notion, Anki) | `/faq` | ClipMark FAQ — Playback Speed, Sync, Export, Permissions | Straight answers about ClipMark… |
| remember what you watch (primary) | `/` | ClipMark — Turn YouTube Into Video Flashcards You Remember | Bookmark the moments that matter… |

`remember what you watch` stays on the homepage because its H1 already owns the
phrasing ("Stop Forgetting What You Watch"); duplicating it as a standalone page
would have the two competing. `/active-recall-youtube` carries it as a secondary
H2 instead.

## Metadata pattern

Every page builds its metadata through `buildPageMetadata()` in
[webapp/app/lib/seo.ts](../../webapp/app/lib/seo.ts), which emits a
self-referential canonical plus a complete `openGraph`/`twitter` block. This
exists because Next.js **replaces** `openGraph` rather than merging it, so a page
that sets only `alternates.canonical` keeps inheriting the root layout's
`openGraph.url` (the homepage) and contradicts its own canonical — the defect
PR #85 had to fix route by route. Routing new pages through one builder stops it
recurring.

The homepage was moved onto the same builder, which also closes SEO-AUDIT quick
win #4 (its `og:title`/`og:description` were the stale generic root copy while its
`<title>` said something stronger).

No `aggregateRating` is emitted anywhere. There is no visible review base to back
one, and fabricating it risks a sitewide manual action — see SEO-AUDIT §1.4.

## Structured data

`FAQPage` JSON-LD lives on `/faq`, built by `buildFaqLd()` from the same
`FAQ_ITEMS` array the page renders, so the marked-up answer text is always the
visible answer text (a Google requirement). The homepage keeps its own separate,
shorter `FAQPage` block covering billing/product questions; the two lists are
deliberately non-overlapping.

## Honesty constraints applied

Per CLAUDE.md, no unsubstantiated claims, and anything unshipped is labelled.
Specifically:

- **Frame/screenshot capture** — not shipped. `/faq` says so outright rather than
  implying it is coming.
- **Bulk "transcript → 40 flashcards"** — not shipped. The AI drafts one note per
  saved moment; `/faq` and `/youtube-flashcards` both state the limit.
- **Notion** — a Pro CSV export, not a live integration. Described that way.
- **Transcript archiving / deep search** — marked *coming soon*, matching the
  `/upgrade` FEATURES table.
- **Editing a saved bookmark** — notes are editable, the one-line description is
  not yet; `/faq` gives the delete-and-re-save workaround.
- **Free-tier numbers** — 25 enrolled cards, 30 reviews/month, 10 Anki exports/month,
  10 shared collections, taken from `extension/src/usage-caps.js` and the
  `/upgrade` FEATURES table, quoted as numbers rather than as "generous".
- **Competitor claims** — `/switch-from-videosegments` limits itself to checkable
  capability gaps (no cloud sync, no export) and explicitly declines to
  characterise the other project's team or roadmap. No review quotes, star
  ratings, or user counts appear on any page, in either direction.

## Advertise-now placements

`WhyClipMark` ([webapp/app/components/WhyClipMark.tsx](../../webapp/app/components/WhyClipMark.tsx))
carries the four validated strengths — clean side panel, honest free tier, two-host
permission list, and the Active Recall engine — and is rendered on the homepage
(directly above pricing, where scepticism about the free tier peaks) and on all six
content pages. Each claim is traceable to shipped code; the component's header
comment records where.
