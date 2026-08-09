import type { Metadata } from 'next';
import { buildPageMetadata } from '@/app/lib/seo';
import { WhyClipMark } from '@/app/components/WhyClipMark';
import {
  PageHero, Section, Steps, CardGrid, RelatedLinks, CtaBand, PROSE, H3,
} from '../_components/ContentPage';

export const metadata: Metadata = buildPageMetadata({
  title: 'Spaced Repetition for YouTube — Revise Lectures That Stick',
  description:
    'Put YouTube lectures on a spaced-repetition schedule. ClipMark resurfaces saved moments after 1, 3 and 7 days, doubling to 60, and quizzes you before the replay.',
  path: '/spaced-repetition-youtube',
  keywords: [
    'spaced repetition youtube', 'revise lectures', 'spaced repetition video',
    'youtube spaced repetition extension', 'lecture revision schedule', 'review youtube lectures',
  ],
});

export default function SpacedRepetitionYouTubePage() {
  return (
    <main style={{ color: 'var(--text)', fontFamily: 'var(--font)' }}>
      <PageHero
        label="Spaced Repetition"
        title={<>Spaced repetition for the lectures you watch on YouTube.</>}
        intro={
          <>
            Cards get spaced review. Videos don&apos;t — they get watched once and forgotten. ClipMark puts the moments
            you saved from a lecture on an expanding schedule and brings them back on the days you were about to lose
            them.
          </>
        }
      />

      <Section
        heading="Video is the one format spaced repetition skipped"
        intro={
          <>
            The scheduling idea is old and well established: review something just as it starts to fade, and each
            successful review buys a longer gap before the next one. Anki, SuperMemo, and every review app since is
            built on it. All of them assume your material is already text on a card. A four-hour lecture isn&apos;t, so
            the usual answer is &ldquo;make cards from it first&rdquo; — an hour of transcription for an hour of
            watching, which is why almost nobody keeps it up.
          </>
        }
      >
        <p style={{ ...PROSE, marginBottom: 0 }}>
          ClipMark keeps the video as the material. The unit of review is a timestamp with your note attached, so
          creating one costs a keystroke and reviewing one costs the seconds it takes to remember. The schedule then
          does the same job it does for cards.
        </p>
      </Section>

      <Section tint heading="The schedule, stated plainly">
        <Steps
          items={[
            {
              title: 'First pass: 1, 3, then 7 days',
              desc: 'A newly enrolled moment comes back the next day, then three days later, then a week later — the early gaps where forgetting is steepest.',
            },
            {
              title: 'Got it — the gap doubles',
              desc: 'Each successful recall doubles the next interval, up to a 60-day ceiling. Material you clearly know stops asking for your time.',
            },
            {
              title: 'Again — back tomorrow',
              desc: 'A miss resets the moment to the next day, so the things you keep losing are the things you keep seeing.',
            },
            {
              title: 'Reviews stay in one queue',
              desc: 'Everything due across every video you have saved shows up in one queue on your dashboard, so revision is one session rather than a hunt through your history.',
            },
          ]}
        />
      </Section>

      <Section id="revise-lectures" heading="How to revise lectures with this">
        <p style={PROSE}>
          The workflow that holds up over a term is deliberately unambitious: watch the lecture once, properly, and hit
          Alt+B at the four or five moments that actually carry the concept — a definition, the step you know you&apos;ll
          misremember, the diagram that finally made it land. Tag them with the subject as you go (any{' '}
          <code>#word</code> in a note becomes a tag). Then let the queue come to you. You are not making a deck; you
          are marking the parts of the lecture worth being asked about later.
        </p>
        <p style={PROSE}>
          A week in, the queue is the revision plan. Instead of deciding what to go back over — which is where most
          revision time disappears — you answer what&apos;s due and replay only the clips you missed. A three-hour
          lecture you watched a fortnight ago becomes ten minutes of targeted work rather than a decision about whether
          to rewatch it.
        </p>
        <CardGrid
          items={[
            {
              icon: 'category',
              title: 'One tag per subject',
              desc: 'Tags are parsed from your notes and colour-coded, so a whole module can be filtered and reviewed as one set.',
            },
            {
              icon: 'folder_open',
              title: 'Groups for a series',
              desc: 'Collect the videos in a course into a group and keep a lecture series together instead of scattered across your history.',
            },
            {
              icon: 'notifications_active',
              title: 'Reminders when due',
              desc: 'Scheduled review reminders are a Pro feature; the review queue itself is on the free tier, capped at 30 reviews a month.',
            },
          ]}
        />
      </Section>

      <Section tint heading={<>What&apos;s free, and what isn&apos;t</>}>
        <p style={PROSE}>
          Free covers unlimited locally stored bookmarks, 25 moments enrolled in the review schedule at any one time,
          and 30 reviews a month — a real revision habit, not a demo. Pro removes both caps and adds cloud sync across
          devices, scheduled reminders, and unlimited Anki export. Permanent transcript archiving and deep search inside
          transcripts are <strong>coming soon</strong> and not part of Pro today; the{' '}
          <a href="/upgrade" style={{ color: '#0F766E', fontWeight: 600 }}>pricing page</a> marks them as such.
        </p>
        <h3 style={H3}>If you already run Anki</h3>
        <p style={{ ...PROSE, marginBottom: 0 }}>
          Keep it. ClipMark schedules video moments, which Anki can&apos;t hold, and exports them into your existing
          deck with a link back to the second each card came from — see{' '}
          <a href="/youtube-to-anki" style={{ color: '#0F766E', fontWeight: 600 }}>YouTube to Anki</a>.
        </p>
      </Section>

      <WhyClipMark />

      <Section tint heading="Keep reading">
        <RelatedLinks
          links={[
            {
              href: '/active-recall-youtube',
              label: 'Active recall from YouTube',
              desc: 'Why answering before revealing is the part that does the work.',
            },
            {
              href: '/youtube-flashcards',
              label: 'Turn YouTube into flashcards',
              desc: 'What a flashcard looks like when its answer is a moment in a video.',
            },
            {
              href: '/youtube-to-anki',
              label: 'YouTube to Anki',
              desc: 'Move your clips into the deck you already trust, timestamps intact.',
            },
            {
              href: '/faq',
              label: 'Questions and answers',
              desc: 'Speed, fullscreen, sync, export, permissions, and how this differs from a blocker.',
            },
          ]}
        />
      </Section>

      <CtaBand
        heading="Revise the lecture, not your whole watch history."
        sub="Save the moments that carry the concept, and let the schedule decide when you see them again."
      />
    </main>
  );
}
