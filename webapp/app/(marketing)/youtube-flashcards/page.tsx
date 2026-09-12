import type { Metadata } from 'next';
import { buildPageMetadata } from '@/app/lib/seo';
import { WhyClipMark } from '@/app/components/WhyClipMark';
import {
  PageHero, Section, Steps, CardGrid, RelatedLinks, CtaBand, PROSE, H3,
} from '../_components/ContentPage';

export const metadata: Metadata = buildPageMetadata({
  title: 'Flashcards From YouTube — Turn Any Video Into Flashcards',
  description:
    'Make flashcards from YouTube without transcribing anything. Save a timestamp, add a note, and ClipMark turns it into a card whose answer replays the exact moment.',
  path: '/youtube-flashcards',
  keywords: [
    'flashcards from youtube', 'turn youtube into flashcards', 'youtube flashcards',
    'video flashcards', 'make flashcards from video', 'lecture video to flashcards',
  ],
});

export default function YouTubeFlashcardsPage() {
  return (
    <main style={{ color: 'var(--text)', fontFamily: 'var(--font)' }}>
      <PageHero
        label="Video Flashcards"
        title={<>Turn YouTube into flashcards without transcribing a thing.</>}
        intro={
          <>
            A ClipMark card is a moment, not a paragraph you retyped. Save the timestamp, write a line (or let the
            on-device AI draft it), and you have a card whose answer is the video itself, playing from the exact second
            it came from.
          </>
        }
      />

      <Section
        heading="Why making cards from video is normally so slow"
        intro={
          <>
            The standard route is manual: pause, scrub back a few seconds, retype the point into a card app, invent a
            question, and — if you&apos;re diligent — paste a link so you can find the moment again. Five minutes of
            admin per card, on top of watching. Anyone who has tried it on a full lecture series knows how that ends.
          </>
        }
      >
        <p style={{ ...PROSE, marginBottom: 0 }}>
          The transcription step is the part that isn&apos;t actually doing anything for your memory. ClipMark drops it.
          The card keeps a pointer to the source instead of a copy of it, which is both faster to make and better to
          review — you check yourself against the real explanation rather than against your own hurried paraphrase.
        </p>
      </Section>

      <Section tint heading="Three keystrokes to a card">
        <Steps
          items={[
            {
              title: 'Alt+B while it plays',
              desc: 'The timestamp is saved silently — no dialog, no pause. Keep watching; come back to the side panel when the section ends.',
            },
            {
              title: 'Add the prompt, or let AI draft it',
              desc: (
                <>
                  Type the line you want to be asked about, or let ClipMark draft a note from the transcript around that
                  second using Chrome&apos;s built-in on-device model. Any <code>#word</code> becomes a tag.
                </>
              ),
            },
            {
              title: 'Enrol it for review',
              desc: 'Enrolled cards enter the recall schedule — 1, 3, then 7 days, doubling to 60 — with your note hidden until you have answered.',
            },
          ]}
        />
      </Section>

      <Section heading={<>A video flashcard has something a text card can&apos;t</>}>
        <CardGrid
          items={[
            {
              icon: 'play_circle',
              title: 'The answer is the footage',
              desc: 'Reveal replays the exact second. You are corrected by the lecturer who explained it, in the words and diagrams that made it land.',
            },
            {
              icon: 'schedule',
              title: 'Made in seconds',
              desc: 'No transcription step, so the marginal cost of one more card is a keystroke — which is why the habit survives past week one.',
            },
            {
              icon: 'inventory_2',
              title: 'Kept in context',
              desc: 'Cards stay grouped by video and tag, so a card never arrives stranded without the lecture it came from.',
            },
          ]}
        />
        <p style={{ ...PROSE, marginTop: 28, marginBottom: 0 }}>
          It works on whatever you actually watch — a conference talk, a pharmacology lecture, a three-hour podcast, a
          framework tutorial you&apos;ll need again in six months. Anything with a timeline can carry cards.
        </p>
      </Section>

      <Section tint heading="Cards, decks, and what free covers">
        <p style={PROSE}>
          Saving bookmarks is unlimited on Free and stored locally. Enrolling them as recall cards is capped on Free at
          25 standing cards and 30 reviews a month; Pro makes both unlimited and adds cloud sync so a card made on your
          laptop is due on your desktop. Free also includes 10 Anki exports a month, and Pro makes that unlimited.
        </p>
        <h3 style={H3}>Can it build cards from a summary or transcript?</h3>
        <p style={{ ...PROSE, marginBottom: 0 }}>
          Partly, today. ClipMark drafts the note for a card you&apos;ve saved from the transcript around that timestamp,
          so the text is written for you — but you choose the moments, one card at a time. There is no bulk
          &ldquo;generate 40 cards from this whole video&rdquo; step, and deeper transcript features (permanent
          transcript archiving and search inside transcripts) are marked <strong>coming soon</strong> on the pricing
          page rather than shipped. Choosing the moments yourself is the part worth keeping anyway: a card you decided
          mattered is one you will actually answer.
        </p>
      </Section>

      <WhyClipMark />

      <Section tint heading="Keep reading">
        <RelatedLinks
          links={[
            {
              href: '/youtube-to-anki',
              label: 'YouTube to Anki',
              desc: 'Export these cards into the deck you already run, timestamps intact.',
            },
            {
              href: '/active-recall-youtube',
              label: 'Active recall from YouTube',
              desc: 'Why the note stays hidden until you have attempted the answer.',
            },
            {
              href: '/spaced-repetition-youtube',
              label: 'Spaced repetition for YouTube',
              desc: 'The intervals that decide when each card comes back.',
            },
            {
              href: '/faq',
              label: 'Questions and answers',
              desc: 'Editing cards, notes, sync, permissions, and how this differs from a summarizer.',
            },
          ]}
        />
      </Section>

      <CtaBand
        heading="Your next lecture could leave you with cards."
        sub="Install ClipMark, hit Alt+B on the moments that matter, and let them come back and ask."
      />
    </main>
  );
}
