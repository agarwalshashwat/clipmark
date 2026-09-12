import type { Metadata } from 'next';
import { buildPageMetadata } from '@/app/lib/seo';
import { WhyClipMark } from '@/app/components/WhyClipMark';
import {
  PageHero, Section, Steps, ComparisonTable, RelatedLinks, CtaBand, PROSE, H3,
} from '../_components/ContentPage';

export const metadata: Metadata = buildPageMetadata({
  title: 'Switching From VideoSegments — A Migration Guide',
  description:
    'Moving off an unmaintained YouTube timestamp extension? Here is what you lose when one stops shipping, how to get your clips out, and what ClipMark does differently.',
  path: '/switch-from-videosegments',
  keywords: [
    'videosegments alternative', 'switch from videosegments', 'videosegments replacement',
    'youtube timestamp extension alternative', 'youtube bookmark extension alternative',
  ],
});

export default function SwitchFromVideoSegmentsPage() {
  return (
    <main style={{ color: 'var(--text)', fontFamily: 'var(--font)' }}>
      <PageHero
        label="Migration Guide"
        title={<>Switching from VideoSegments.</>}
        intro={
          <>
            If the extension you saved your YouTube timestamps in has gone quiet, this page is the practical version:
            what actually goes wrong when a bookmarking extension stops shipping, how to get your clips out, and where
            ClipMark is genuinely different.
          </>
        }
        ctaLabel="Try ClipMark — Free"
      />

      <Section heading="First, the honest part">
        <p style={PROSE}>
          We&apos;re not going to characterise anyone else&apos;s roadmap, team, or intentions — we don&apos;t know
          them. What we can point at is capability, which you can check for yourself on any extension&apos;s store
          listing in about a minute: <strong>does it sync your clips off this one browser profile, and can you export
          them?</strong> VideoSegments answers no to both, and that is the whole reason this page exists. Everything
          below follows from those two gaps, not from anything we think about its authors.
        </p>
        <p style={{ ...PROSE, marginBottom: 0 }}>
          If it still works for you and you don&apos;t need either of those things, there is no urgency here. Read the
          next section anyway, because the risk is quiet rather than sudden.
        </p>
      </Section>

      <Section tint heading="What an unmaintained bookmarking extension costs you">
        <Steps
          items={[
            {
              title: 'Your clips live in one browser, on one machine',
              desc: 'With no cloud sync, the copy in that profile is the only copy. A new laptop, a wiped profile, or a reinstall takes the lot with it — and an extension that has stopped shipping updates is unlikely to ship you a recovery path.',
            },
            {
              title: 'No export means no way out',
              desc: 'This is the one that traps people. If an extension can’t write your data to a file, migrating is retyping, and staying is the path of least resistance right up until you lose it.',
            },
            {
              title: 'YouTube changes; the extension doesn’t',
              desc: 'YouTube is a single-page app that gets reworked continually. Capture and player-injection code needs occasional repair. On a maintained extension you get an update; on an abandoned one, the feature just stops working one Tuesday.',
            },
            {
              title: 'A delisted extension is an unrecoverable one',
              desc: 'Extensions that stop meeting store policy get removed. Once that happens, reinstalling on a new machine isn’t an option, and whatever was only in that profile is gone.',
            },
          ]}
        />
      </Section>

      <Section heading="Capability comparison">
        <p style={PROSE}>
          Limited to things you can verify — capabilities, not opinions. Where we can only speak for ClipMark, that is
          what the column says.
        </p>
        <ComparisonTable
          columns={['VideoSegments', 'ClipMark']}
          rows={[
            {
              label: 'Cloud sync',
              left: 'None — clips stay in the local browser profile.',
              right: 'Cross-device sync on Pro; local storage on Free.',
            },
            {
              label: 'Export your data',
              left: 'No export path.',
              right: 'JSON, CSV and Markdown export on the free tier. Anki file monthly on Free, unlimited on Pro. Obsidian and Notion-ready CSV on Pro.',
            },
            {
              label: 'Import your data',
              left: 'Nothing to import from, since there is no export.',
              right: 'JSON import, so your clips can move in and out.',
            },
            {
              label: 'Review / recall',
              left: 'Bookmarks only — saving is where it stops.',
              right: 'Active Recall schedules each moment (1, 3, 7 days, doubling to 60) and quizzes you before replaying it.',
            },
            {
              label: 'Where the UI sits',
              left: 'In-page UI around the player.',
              right: 'Chrome’s side panel, beside the video. Nothing covers the player.',
            },
            {
              label: 'Host permissions',
              left: 'Check the listing’s permission block before installing anything.',
              right: 'youtube.com and clipmark.mithahara.com only.',
            },
            {
              label: 'Actively developed',
              left: 'Judge from the listing’s “Updated” date.',
              right: 'Public repository; the extension and this site ship from it.',
            },
          ]}
        />
      </Section>

      <Section tint heading="Moving your clips across">
        <p style={PROSE}>
          Being straight with you: <strong>there is no one-click VideoSegments importer</strong>, and we can&apos;t build
          one honestly against an extension with no export format. Here are the three real options, worst case first.
        </p>
        <h3 style={H3}>1. If you can get a JSON file out</h3>
        <p style={PROSE}>
          ClipMark&apos;s dashboard imports a JSON array where each entry has at minimum a <code>videoId</code> and a{' '}
          <code>timestamp</code>, plus optional <code>description</code>, <code>notes</code> and <code>tags</code>.
          Anything you can reshape into that — a manual export, a spreadsheet you keep, a file another tool produced —
          imports in one go, and duplicates are skipped.
        </p>
        <h3 style={H3}>2. Re-enter them as a review pass</h3>
        <p style={PROSE}>
          Less painful than it sounds, and the reason we suggest it: open your old list beside the video and re-save the
          moments with Alt+B. You will drop maybe a third of them, because a lot of old bookmarks turn out not to matter.
          The ones you keep arrive with a note and a review schedule attached, which is more than they had before.
        </p>
        <h3 style={H3}>3. Draw a line and start from here</h3>
        <p style={{ ...PROSE, marginBottom: 0 }}>
          Keep the old extension installed and read-only, and put everything new in ClipMark. Nothing forces a
          big-bang migration, and your old clips stay where they are until you want them.
        </p>
      </Section>

      <Section heading={<>What you gain that you didn&apos;t have</>}>
        <p style={PROSE}>
          Sync and export are the reasons to move, but the reason to stay is the review loop. A bookmark tells you
          where something was; it does nothing about whether you remember it. ClipMark schedules the moments you saved,
          hides your note, and asks you to recall it before replaying the clip — the mechanism from{' '}
          <a href="/active-recall-youtube" style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>active recall</a> and{' '}
          <a href="/spaced-repetition-youtube" style={{ color: 'var(--brand-ink)', fontWeight: 600 }}>spaced repetition</a>,
          applied to video instead of cards.
        </p>
        <p style={{ ...PROSE, marginBottom: 0 }}>
          And because export is free rather than a paid escape hatch, you are not making this decision twice. If
          ClipMark ever stops being the right tool, your clips leave in a JSON, CSV, or Markdown file on the free tier —
          which is the standard we thought was missing in the first place.
        </p>
      </Section>

      <WhyClipMark tint />

      <Section heading="Keep reading">
        <RelatedLinks
          links={[
            {
              href: '/faq',
              label: 'Questions and answers',
              desc: 'Playback speed, fullscreen, notes, editing, permissions, and export.',
            },
            {
              href: '/active-recall-youtube',
              label: 'Active recall from YouTube',
              desc: 'The quiz loop that a bookmark-only extension can’t give you.',
            },
            {
              href: '/youtube-to-anki',
              label: 'YouTube to Anki',
              desc: 'If your clips ultimately belong in a deck you already run.',
            },
            {
              href: '/upgrade',
              label: 'Free vs Pro',
              desc: 'Every cap on the free tier, written down.',
            },
          ]}
        />
      </Section>

      <CtaBand
        heading="Get your clips somewhere they can leave from."
        sub="Install ClipMark free, save the next moment with Alt+B, and export whenever you want to."
      />
    </main>
  );
}
