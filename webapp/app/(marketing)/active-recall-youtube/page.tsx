import type { Metadata } from 'next';
import { buildPageMetadata } from '@/app/lib/seo';
import { WhyClipMark } from '@/app/components/WhyClipMark';
import {
  PageHero, Section, Steps, CardGrid, RelatedLinks, CtaBand, PROSE, H3,
} from '../_components/ContentPage';

export const metadata: Metadata = buildPageMetadata({
  title: 'Active Recall From YouTube — Quiz Yourself on Any Video',
  description:
    'Turn any YouTube video into an active-recall session. ClipMark hides your note and asks you to remember the moment before replaying the clip. Free to start.',
  path: '/active-recall-youtube',
  keywords: [
    'active recall from youtube', 'active recall youtube', 'quiz yourself on a video',
    'remember what you watch', 'youtube active recall extension', 'testing effect video',
  ],
});

export default function ActiveRecallYouTubePage() {
  return (
    <main style={{ color: 'var(--text)', fontFamily: 'var(--font)' }}>
      <PageHero
        label="Active Recall"
        title={<>Active recall, from YouTube —<br />not from a blank page.</>}
        intro={
          <>
            Rewatching feels like studying. It isn&apos;t. ClipMark saves the moments that mattered, then brings them
            back with your note hidden and asks you to answer first — so the video becomes a question instead of a
            replay.
          </>
        }
      />

      <Section
        heading="Why rewatching quietly fails"
        intro={
          <>
            Replaying a lecture is recognition, not retrieval. Everything looks familiar as it goes past, which feels
            like understanding right up until you have to produce the answer without the video playing. Active recall
            flips the order: you attempt the answer first, and only then check it. The attempt is the part that does
            the work — and it&apos;s the part that watching a video a second time skips entirely.
          </>
        }
      >
        <p style={PROSE}>
          The problem has never been that people don&apos;t know this. It&apos;s that setting up retrieval practice for
          video is tedious: pause, transcribe the point into some other app, invent a question, keep a link back to the
          timestamp so you can check yourself. Most people do it for one lecture and quietly stop. ClipMark exists to
          collapse that whole chain into one keystroke while you watch.
        </p>
      </Section>

      <Section tint heading="How a recall session actually runs">
        <Steps
          items={[
            {
              title: 'Save the moment with Alt+B',
              desc: (
                <>
                  No dialog, no interruption — the timestamp is captured while the video keeps playing. Add a note in
                  the side panel when you&apos;re ready, or let ClipMark draft one from the transcript around that
                  second using Chrome&apos;s on-device AI.
                </>
              ),
            },
            {
              title: 'The moment gets a review schedule',
              desc: (
                <>
                  Enrolled clips come back after 1 day, then 3, then 7. Answer <strong>Got it</strong> and the next
                  interval doubles, up to 60 days. Answer <strong>Again</strong> and it returns tomorrow.
                </>
              ),
            },
            {
              title: 'You answer before you watch',
              desc: (
                <>
                  When a clip is due, ClipMark shows the timestamp and its tags but hides your note. You recall what
                  the moment was about, reveal to check yourself, and replay the exact second if you were wrong.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section heading="Quiz yourself on a video without leaving it">
        <p style={PROSE}>
          Everything happens beside the player, in Chrome&apos;s own side panel. Nothing floats over the video, the
          controls stay reachable, and YouTube&apos;s keyboard shortcuts keep working — ClipMark takes Alt+B for saving
          and, only while a revisit session is running, <code>[</code> and <code>]</code> to step between your saved
          moments. You can run a full recall pass over a three-hour lecture without ever opening another tab.
        </p>
        <CardGrid
          items={[
            {
              icon: 'quiz',
              title: 'Retrieval before reveal',
              desc: 'The note is hidden by default. You produce the answer, then check it — the order that makes the difference.',
            },
            {
              icon: 'replay',
              title: 'The clip is the answer key',
              desc: 'Got it wrong? One click replays the exact second the note came from, in context, at full quality.',
            },
            {
              icon: 'label',
              title: 'Tags you already type',
              desc: 'Any #word in a note becomes a tag, so a whole subject can be reviewed as one set later.',
            },
          ]}
        />
      </Section>

      <Section tint heading="Remember what you watch — on the free tier">
        <p style={PROSE}>
          Bookmarks are unlimited and stored locally on Free, and the free tier carries a real Active Recall
          allowance: 25 enrolled cards standing at any time and 30 reviews a month. That is enough to run genuine
          retrieval practice over a full course, not a teaser. Pro lifts both to unlimited and adds cloud sync across
          devices, scheduled review reminders, and unlimited Anki export — the exact split is on the{' '}
          <a href="/upgrade" style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>pricing page</a>.
        </p>
        <h3 style={H3}>Where the AI does and doesn&apos;t help</h3>
        <p style={{ ...PROSE, marginBottom: 0 }}>
          ClipMark can draft the note for you from the transcript around a timestamp, which removes the typing but not
          the thinking — you still have to recall it later. That drafting runs on Chrome&apos;s built-in on-device model
          (Gemini Nano), so transcripts aren&apos;t sent anywhere for it; availability depends on your Chrome version
          and Google&apos;s support for the API. Everything above works without it.
        </p>
      </Section>

      <WhyClipMark />

      <Section tint heading="Keep reading">
        <RelatedLinks
          links={[
            {
              href: '/spaced-repetition-youtube',
              label: 'Spaced repetition for YouTube',
              desc: 'The intervals behind the review queue, and how to revise a lecture series over weeks.',
            },
            {
              href: '/youtube-flashcards',
              label: 'Turn YouTube into flashcards',
              desc: 'What a video flashcard is when the answer is a moment rather than a line of text.',
            },
            {
              href: '/youtube-to-anki',
              label: 'YouTube to Anki',
              desc: 'Export your clips into the deck you already run, with a link back to every timestamp.',
            },
            {
              href: '/faq',
              label: 'Questions and answers',
              desc: 'Playback speed, fullscreen, syncing, permissions, and how this differs from a summariser.',
            },
          ]}
        />
      </Section>

      <CtaBand
        heading="Stop replaying. Start recalling."
        sub="Install ClipMark, save the next moment that matters with Alt+B, and let it come back and ask you about it."
      />
    </main>
  );
}
