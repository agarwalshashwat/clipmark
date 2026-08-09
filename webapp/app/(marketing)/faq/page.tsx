import type { Metadata } from 'next';
import { buildPageMetadata, buildFaqLd } from '@/app/lib/seo';
import { SUPPORT_EMAIL } from '@/app/lib/constants';
import { WhyClipMark } from '@/app/components/WhyClipMark';
import { PageHero, Section, FaqList, RelatedLinks, CtaBand, PROSE } from '../_components/ContentPage';

export const metadata: Metadata = buildPageMetadata({
  title: 'ClipMark FAQ — Playback Speed, Sync, Export, Permissions',
  description:
    'Straight answers about ClipMark: 2x and fullscreen, syncing and exporting clips, what the free tier really includes, and how it differs from a summariser.',
  path: '/faq',
  keywords: [
    'clipmark faq', 'youtube bookmark extension faq', 'youtube timestamp extension questions',
    'clipmark permissions', 'clipmark free tier', 'clipmark vs summarizer',
  ],
});

/**
 * Every answer here is checked against shipped behaviour, and anything not yet
 * built says so rather than being softened. `buildFaqLd` marks up this exact
 * array — Google requires the answer in the structured data to be the answer
 * visible on the page, so this must stay the single source for both.
 *
 * Written as plain strings (not JSX) for that reason: the string that renders is
 * byte-identical to the string in the JSON-LD.
 */
const FAQ_ITEMS = [
  {
    q: 'Does it work at 1.5x, 2x, and in fullscreen?',
    a: 'Yes. ClipMark reads the player’s current position directly, so the timestamp it saves is correct at any playback speed — 2x doesn’t drift it. Alt+B works in fullscreen too, because the shortcut is handled by the extension rather than by a button you need to see. The side panel is browser UI, so it isn’t visible while the video is fullscreen; leave fullscreen and it’s still there with everything you captured.',
  },
  {
    q: 'Can I sync my clips and notes across devices?',
    a: 'Yes, on Pro. Cloud sync keeps your clips, notes, and review schedule consistent across every browser you sign into, and gives you the web dashboard. On the free tier your bookmarks are stored locally in your browser profile instead — unlimited, but tied to that profile.',
  },
  {
    q: 'Can I export my clips and notes?',
    a: 'Yes, and export is not paywalled. JSON, CSV, and Markdown export are on the free tier, so you can always get your data out. An Anki-importable file is one export a month on Free and unlimited on Pro; Obsidian and Notion-ready CSV are Pro. ClipMark also imports a JSON array of clips, so your data can move both directions.',
  },
  {
    q: 'Can I add notes to bookmarks and organise them?',
    a: 'Yes. Every saved moment takes a one-line description plus a longer note, and any #word you type becomes a tag with its own colour. Videos can be collected into groups, so a lecture series or a course stays together, and you can filter and search across everything you have saved.',
  },
  {
    q: 'Can I edit a saved bookmark?',
    a: 'Partly. The longer note on a saved moment is fully editable — type in it and it auto-saves. The one-line description captured at save time is not editable in place yet; today the workaround is to delete that moment and re-save it. Both fields are editable before you save, including anything the AI drafted for you.',
  },
  {
    q: 'Is it really free? What’s the catch?',
    a: 'The catch is written down rather than hidden. Free gives you unlimited locally stored bookmarks, notes, tags, groups, on-device AI note drafting, JSON/CSV/Markdown export, 25 moments enrolled in Active Recall at a time, 30 reviews a month, one Anki export a month, and up to 10 shared collections. No card, no trial countdown. Pro removes the caps and adds cloud sync, scheduled review reminders, and Obsidian/Notion export. Every one of those numbers is on the pricing page.',
  },
  {
    q: 'How is this different from a study or focus blocker?',
    a: 'A blocker manages your attention; it has no idea what you watched. ClipMark starts after you have watched something and deals with whether you still know it next week — saving the moments that mattered, then quizzing you on them on a spaced schedule. Blockers stop you opening YouTube. ClipMark makes the YouTube you do watch stick. They solve different problems and can be used together.',
  },
  {
    q: 'How is it different from a YouTube summariser?',
    a: 'A summariser gives you a digest to read once, which feels productive and is forgotten at roughly the same rate as the video was. ClipMark is built around the opposite step: you decide which moments mattered, and then it makes you retrieve them from memory before it replays the clip. A summary is a shortcut past the video; Active Recall is repeated practice at remembering it. ClipMark can draft a note for a moment, but the drafting is a typing shortcut, not the point.',
  },
  {
    q: 'How is it different from Snipo or other notes-to-Notion tools?',
    a: 'Those tools are excellent at capture and hand-off: clip, annotate, push into Notion, done. Nothing in that chain ever asks you a question. ClipMark’s difference is what happens afterwards — every saved moment can be enrolled in a review schedule that hides your note and asks you to recall it before replaying the clip. If you want your clips to end up in Notion as well, ClipMark exports a Notion-ready CSV on Pro. The distinction is active recall and spaced repetition, not where the notes land.',
  },
  {
    q: 'Does it integrate with Notion?',
    a: 'Through a file, not an API. Pro exports a Notion-ready CSV you drop into any Notion database; the same file works for Obsidian or anything else that reads CSV. There is no live two-way Notion sync today, and we would rather say that plainly than call a CSV an integration.',
  },
  {
    q: 'Can I screenshot a frame into a note?',
    a: 'Not today — ClipMark saves the timestamp, not a still image. In practice the deep link does the job a screenshot would: opening a saved moment replays the actual second at full quality, in motion and in context, which is more than a frame would tell you. Frame capture is not a shipped feature and is not part of Pro.',
  },
  {
    q: 'Can it turn a whole summary or transcript into flashcards?',
    a: 'Not in bulk. ClipMark drafts the note for a moment you have saved using the transcript around that timestamp, so the writing is done for you one card at a time — but there is no “generate 40 cards from this video” step. Permanent transcript archiving and search inside transcripts are marked coming soon on the pricing page, not shipped. Choosing the moments yourself is also the part that makes the cards worth reviewing.',
  },
  {
    q: 'Will it break after a YouTube update?',
    a: `It can, and that is true of every extension that works inside YouTube’s player. What matters is whether it gets fixed. ClipMark is actively developed in a public repository, ships from a tested build, and runs an automated browser test suite against real YouTube pages so breakages surface before releases. If something does break, ${SUPPORT_EMAIL} reaches a human, and your clips are exportable in the meantime.`,
  },
  {
    q: 'Does it need scary permissions?',
    a: 'No. ClipMark requests two hosts: youtube.com, and clipmark.mithahara.com — its own domain, for sync. It cannot read any other site, because it was never granted access to one. Beyond that it uses storage, side panel, context menus, alarms, and notifications, all of which are extension plumbing rather than browsing access. AI note drafting runs on Chrome’s built-in on-device model, so transcripts aren’t sent to a server for it.',
  },
  {
    q: 'How do I get my clips into Anki?',
    a: 'Export from the ClipMark dashboard or side panel, then use File → Import in Anki, pick your existing deck and note type, and import. The file is a tab-separated Front / Back / Tags export that declares its own format, so there is nothing to configure. The front is your note, the back carries the video title, the timestamp, and a link that replays that exact second, and your #tags come across as Anki tags.',
  },
];

export default function FaqPage() {
  const faqLd = buildFaqLd(FAQ_ITEMS);

  return (
    <main style={{ color: 'var(--text)', fontFamily: 'var(--font)' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />

      <PageHero
        label="FAQ"
        title={<>Questions, answered without the marketing voice.</>}
        intro={
          <>
            Speed and fullscreen, sync and export, what the free tier actually includes, and where ClipMark stops. If
            something isn&apos;t built yet, it says so here.
          </>
        }
        ctaLabel="Try ClipMark — Free"
      />

      <Section tint>
        <FaqList items={FAQ_ITEMS} />
        <p style={{ ...PROSE, marginTop: 32, marginBottom: 0, fontSize: 15 }}>
          Something not covered? Email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>
            {SUPPORT_EMAIL}
          </a>{' '}
          and you&apos;ll get a real answer, including &ldquo;no, we don&apos;t do that.&rdquo;
        </p>
      </Section>

      <WhyClipMark />

      <Section tint heading="Read more">
        <RelatedLinks
          links={[
            {
              href: '/active-recall-youtube',
              label: 'Active recall from YouTube',
              desc: 'The quiz-before-you-watch loop, explained.',
            },
            {
              href: '/spaced-repetition-youtube',
              label: 'Spaced repetition for YouTube',
              desc: 'The review intervals, and how to revise a lecture series.',
            },
            {
              href: '/youtube-to-anki',
              label: 'YouTube to Anki',
              desc: 'The export format and the exact import steps.',
            },
            {
              href: '/switch-from-videosegments',
              label: 'Switching from VideoSegments',
              desc: 'Migrating off an extension with no sync or export.',
            },
          ]}
        />
      </Section>

      <CtaBand
        heading="Still reading? Just try it."
        sub="The free tier is genuinely usable, and everything you save can be exported back out."
      />
    </main>
  );
}
