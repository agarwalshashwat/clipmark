import type { Metadata } from 'next';
import { buildPageMetadata } from '@/app/lib/seo';
import { WhyClipMark } from '@/app/components/WhyClipMark';
import {
  PageHero, Section, Steps, CardGrid, RelatedLinks, CtaBand, PROSE, H3,
} from '../_components/ContentPage';

export const metadata: Metadata = buildPageMetadata({
  title: 'YouTube to Anki — Export Video Moments Into Your Deck',
  description:
    'Get Anki cards from YouTube without retyping. ClipMark exports your saved moments as an Anki-importable file where every card links back to the exact second.',
  path: '/youtube-to-anki',
  keywords: [
    'youtube to anki', 'anki from youtube', 'export youtube to anki',
    'anki cards from video', 'youtube anki extension', 'anki timestamp cards',
  ],
});

export default function YouTubeToAnkiPage() {
  return (
    <main style={{ color: 'var(--text)', fontFamily: 'var(--font)' }}>
      <PageHero
        label="Works With Anki"
        title={<>YouTube to Anki, with the timestamp still attached.</>}
        intro={
          <>
            ClipMark doesn&apos;t compete with your deck — it feeds it. Save moments while you watch, then export them
            as an Anki-importable file where every card&apos;s back links straight to the second it came from.
          </>
        }
      />

      <Section
        heading={<>Anki can&apos;t hold a moment. That&apos;s the gap.</>}
        intro={
          <>
            Anki is excellent at scheduling text, images, and audio you have already prepared. What it cannot do is
            bookmark the 41st minute of a lecture and replay it when you get the card wrong. So people either retype
            the point by hand and lose the source, or paste a bare URL and lose the timestamp. Both are worse than the
            explanation they came from.
          </>
        }
      >
        <p style={{ ...PROSE, marginBottom: 0 }}>
          ClipMark handles the capture end — the part that has to happen while the video is playing — and hands the
          result to Anki in the format Anki already imports. You keep your deck, your scheduler, your add-ons, and
          whatever review habits you have built up. Nothing has to move.
        </p>
      </Section>

      <Section tint heading="How to get your clips into Anki">
        <Steps
          items={[
            {
              title: 'Save moments as you watch',
              desc: 'Alt+B captures the timestamp silently. Add a note in the side panel, or let the on-device AI draft one from the transcript around that second.',
            },
            {
              title: 'Export from the dashboard or side panel',
              desc: 'Choose the clips you want and export. ClipMark writes a tab-separated file with three columns — Front, Back, and Tags — that Anki reads natively.',
            },
            {
              title: 'In Anki: File → Import',
              desc: 'Pick the file, choose the deck and note type you already use, and import. The file declares its own separator, HTML handling, and tags column, so there is nothing to configure by hand.',
            },
            {
              title: 'Review, and replay when you miss',
              desc: 'Each card back carries the video title, the timestamp, and a “Replay the moment” link that opens YouTube at that exact second.',
            },
          ]}
        />
      </Section>

      <Section heading="What ends up on the card">
        <CardGrid
          items={[
            {
              icon: 'help',
              title: 'Front',
              desc: 'Your note for that moment. If you never wrote one, ClipMark falls back to the video title and timestamp so the card is still usable.',
            },
            {
              icon: 'link',
              title: 'Back',
              desc: 'The video title, the moment’s time, a deep link that replays it, and any longer note you added underneath.',
            },
            {
              icon: 'sell',
              title: 'Tags',
              desc: 'The tags you typed as #words, carried across as real Anki tags — spaces become underscores so Anki reads them correctly.',
            },
          ]}
        />
        <p style={{ ...PROSE, marginTop: 28, marginBottom: 0 }}>
          The extension and the webapp produce byte-identical files for the same clips — that&apos;s covered by a test
          in the repository — so it makes no difference whether you export from the side panel or from your dashboard.
        </p>
      </Section>

      <Section tint heading="Limits, honestly">
        <p style={PROSE}>
          Anki export runs <strong>once a month on the free tier</strong> and unlimited on Pro. That is a real
          constraint, not a hidden one: it&apos;s printed on the{' '}
          <a href="/upgrade" style={{ color: '#0F766E', fontWeight: 600 }}>pricing page</a> next to every other cap. One
          export a month is enough to move a term&apos;s worth of clips into a deck in a single batch; if you export
          weekly, you want Pro.
        </p>
        <h3 style={H3}>Other destinations</h3>
        <p style={PROSE}>
          Pro also exports a Notion-ready CSV that works for Obsidian and anything else that reads CSV. It&apos;s a file
          export, not a live two-way Notion integration — you drop it into a database rather than syncing continuously.
        </p>
        <h3 style={H3}>Do you still need ClipMark once cards are in Anki?</h3>
        <p style={{ ...PROSE, marginBottom: 0 }}>
          Only for the parts Anki doesn&apos;t do: capturing new moments while you watch, and reviewing against the
          footage itself. Plenty of people run ClipMark&apos;s own recall queue for recent lectures and export to Anki
          for long-term retention. Both work; they aren&apos;t exclusive.
        </p>
      </Section>

      <WhyClipMark />

      <Section tint heading="Keep reading">
        <RelatedLinks
          links={[
            {
              href: '/youtube-flashcards',
              label: 'Turn YouTube into flashcards',
              desc: 'How a card gets made in three keystrokes, with no transcription.',
            },
            {
              href: '/active-recall-youtube',
              label: 'Active recall from YouTube',
              desc: 'The built-in quiz loop, if you would rather not leave for Anki at all.',
            },
            {
              href: '/spaced-repetition-youtube',
              label: 'Spaced repetition for YouTube',
              desc: 'ClipMark’s own intervals, and how they compare to your deck’s.',
            },
            {
              href: '/faq',
              label: 'Questions and answers',
              desc: 'Import steps, sync, permissions, playback speed, and fullscreen.',
            },
          ]}
        />
      </Section>

      <CtaBand
        heading="Keep the deck. Fix the capture."
        sub="Install ClipMark, save moments with Alt+B, and export them into Anki with the timestamp intact."
      />
    </main>
  );
}
