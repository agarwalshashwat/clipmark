/**
 * Social-card metadata built by app/lib/seo.ts.
 *
 * The bug being locked out: marketing routes advertised `/clipmark-logo.png` as
 * their og:image — a 450x450 app icon declared to crawlers as 512x512 — so a
 * shared link rendered a small square glyph with copy that belonged to a
 * different page. The card is now generated per route, and these assertions
 * cover the three ways that silently regresses: wrong dimensions, the Twitter
 * card drifting away from the OG card, and a `count` param leaking onto a
 * marketing card (which would render "0 Bookmarks Curated" under the headline).
 *
 * Run: npm --prefix webapp run test:unit
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOgImageUrl,
  buildPageMetadata,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
} from '../../app/lib/seo';

/** Narrow the loose Next metadata types down to what these tests read. */
function ogImage(meta: ReturnType<typeof buildPageMetadata>) {
  const images = meta.openGraph?.images;
  assert.ok(Array.isArray(images) && images.length === 1, 'expected exactly one og:image');
  return images[0] as { url: string; width: number; height: number; alt: string };
}

describe('buildOgImageUrl', () => {
  it('targets the generated card route, absolutely', () => {
    const url = buildOgImageUrl({ title: 'Hello', subtitle: 'World' });
    // Absolute: scrapers do not resolve relative og:image against metadataBase.
    assert.match(url, /^https?:\/\/[^/]+\/api\/og\?/);
    const params = new URL(url).searchParams;
    assert.equal(params.get('title'), 'Hello');
    assert.equal(params.get('subtitle'), 'World');
  });

  it('never sends count — that line belongs to collection cards only', () => {
    const url = buildOgImageUrl({ title: 'Pricing', subtitle: 'Free and Pro' });
    assert.equal(new URL(url).searchParams.has('count'), false);
  });

  it('omits subtitle rather than sending an empty one', () => {
    const url = buildOgImageUrl({ title: 'Pricing' });
    assert.equal(new URL(url).searchParams.has('subtitle'), false);
  });
});

describe('buildPageMetadata', () => {
  const meta = buildPageMetadata({
    title: 'ClipMark Pricing — Free & Pro Plans',
    description: 'Compare ClipMark Free and Pro. Pro adds cloud sync and Anki export.',
    path: '/upgrade',
  });

  it('declares the card at the real 1200x630', () => {
    const image = ogImage(meta);
    assert.equal(image.width, OG_IMAGE_WIDTH);
    assert.equal(image.height, OG_IMAGE_HEIGHT);
    assert.equal(OG_IMAGE_WIDTH, 1200);
    assert.equal(OG_IMAGE_HEIGHT, 630);
  });

  it('keeps the Twitter card and the OG card on the same image', () => {
    const twitterImages = meta.twitter?.images;
    assert.ok(Array.isArray(twitterImages));
    assert.equal(twitterImages[0], ogImage(meta).url);
  });

  it('keeps canonical and og:url on the same path', () => {
    assert.equal(meta.alternates?.canonical, '/upgrade');
    assert.equal(meta.openGraph?.url, '/upgrade');
  });

  it('strips the wordmark from the card headline — the card already draws it', () => {
    const headlineFor = (title: string) =>
      new URL(
        ogImage(buildPageMetadata({ title, description: 'Any description.', path: '/x' })).url,
      ).searchParams.get('title');

    // Every wordmark shape that appears in the real page titles.
    assert.equal(headlineFor('ClipMark Pricing — Free & Pro Plans'), 'Pricing — Free & Pro Plans');
    assert.equal(
      headlineFor('ClipMark FAQ — Playback Speed, Sync, Export, Permissions'),
      'FAQ — Playback Speed, Sync, Export, Permissions',
    );
    assert.equal(
      headlineFor('ClipMark — Turn YouTube Into Video Flashcards You Remember'),
      'Turn YouTube Into Video Flashcards You Remember',
    );
    assert.equal(headlineFor('Affiliate Program — ClipMark'), 'Affiliate Program');
    assert.equal(headlineFor('Privacy Policy — ClipMark'), 'Privacy Policy');

    // Mid-sentence, the wordmark is the object and must survive.
    assert.equal(
      headlineFor('Send ClipMark Feedback — Tell Us What Is Missing'),
      'Send ClipMark Feedback — Tell Us What Is Missing',
    );

    // A title that is only the wordmark must not reduce to an empty headline.
    assert.equal(headlineFor('ClipMark'), 'ClipMark');

    assert.equal(new URL(ogImage(meta).url).searchParams.get('title'), 'Pricing — Free & Pro Plans');
  });

  it('caps the card sub-line so it cannot push the headline off the card', () => {
    const long = buildPageMetadata({
      title: 'Some Page — ClipMark',
      description: `${'word '.repeat(60)}.`,
      path: '/some-page',
    });
    const subtitle = new URL(ogImage(long).url).searchParams.get('subtitle')!;
    assert.ok(subtitle.length <= 100, `subtitle was ${subtitle.length} chars`);
    assert.ok(subtitle.endsWith('…'), 'a truncated sub-line should be marked as truncated');
  });

  it('lets a page override card copy without touching its <title>', () => {
    const overridden = buildPageMetadata({
      title: 'ClipMark — Turn YouTube Into Video Flashcards You Remember',
      description: 'Bookmark the moments that matter.',
      path: '/',
      cardTitle: 'Short Headline',
      cardSubtitle: 'Short sub-line.',
    });
    const params = new URL(ogImage(overridden).url).searchParams;
    assert.equal(params.get('title'), 'Short Headline');
    assert.equal(params.get('subtitle'), 'Short sub-line.');
    // The page's own <title> must be untouched by the card override.
    assert.equal(overridden.title, 'ClipMark — Turn YouTube Into Video Flashcards You Remember');
  });
});
