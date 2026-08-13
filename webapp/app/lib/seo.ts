import type { Metadata } from 'next';
import { APP_URL } from './constants';

/** Every social card is this size. Facebook/LinkedIn/X all crop to ~1.91:1. */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/**
 * URL of a generated 1200x630 social card for a marketing route.
 *
 * Replaces `/clipmark-logo.png` as the site's og:image. That file is the app
 * icon: 450x450 of rounded-square logo, declared to crawlers as 512x512 (it was
 * never that size), so a shared link rendered as a small centred glyph — and
 * because the root layout's card was inherited by pages that override only
 * their `title`, the picture and the headline disagreed. A card carrying the
 * page's own words fixes both at once.
 *
 * Absolute, because og:image is fetched by scrapers that do not resolve
 * relative URLs (`metadataBase` covers Next's own resolution, not theirs).
 */
export function buildOgImageUrl({ title, subtitle }: { title: string; subtitle?: string }): string {
  const params = new URLSearchParams({ title });
  if (subtitle) params.set('subtitle', subtitle);
  // No `count` — the route reads its absence as "this is not a collection", so
  // no "0 Bookmarks Curated" line appears under a marketing headline.
  return `${APP_URL}/api/og?${params.toString()}`;
}

/**
 * Card headline: the page title minus the wordmark, which the card already
 * draws above the headline. "ClipMark Pricing — Free & Pro Plans" would
 * otherwise render under a second "ClipMark".
 *
 * Three shapes appear in the real titles, and all three are stripped:
 * "X — ClipMark" (Privacy, Terms, Affiliate), "ClipMark — X" (the homepage),
 * and "ClipMark X — …" with no delimiter (Pricing, FAQ). That last one is why
 * the leading match also accepts plain whitespace, but only before a capital:
 * it must not eat the wordmark out of a title that reads as a sentence, and a
 * lowercase next word ("ClipMark for students…") is the signal for that. A page
 * whose title genuinely opens with the wordmark mid-sentence should pass
 * `cardTitle` rather than rely on this.
 *
 * Only leading/trailing occurrences are touched — "Send ClipMark Feedback — …"
 * keeps its wordmark, because there it is the object of the sentence.
 */
function cardHeadline(title: string): string {
  return title
    .replace(/\s*[—–|:-]\s*ClipMark\s*$/, '')
    .replace(/^\s*ClipMark\s*(?:[—–|:-]\s*|(?=[A-Z]))/, '')
    .trim() || 'ClipMark';
}

/**
 * Card sub-line: the first sentence of the meta description, capped so a long
 * one cannot push the headline off a 630px-tall card.
 */
function cardSubline(description: string): string {
  const firstSentence = description.split(/(?<=\.)\s/)[0] ?? description;
  const source = firstSentence.replace(/\.$/, '');
  if (source.length <= 100) return source;
  return `${source.slice(0, 97).trimEnd()}…`;
}

/**
 * Shared page-metadata builder for the marketing site.
 *
 * Next.js *replaces* `openGraph` rather than merging it, so a page that sets
 * only `alternates.canonical` keeps inheriting the root layout's `openGraph.url`
 * (the homepage) and contradicts its own canonical — the bug PR #85 had to fix
 * route by route. Rather than repeat that 30-line block on every new page (and
 * eventually forget a field), every marketing route builds its metadata here so
 * the canonical, `og:url`, and `twitter` card can't drift apart again.
 *
 * `twitter` is emitted explicitly for the same reason: it only auto-fills from
 * `openGraph` when the page isn't already inheriting a populated block.
 *
 * Deliberately absent: any `aggregateRating`-style social proof. Ratings must be
 * real and visible on the page they're marked up on, and ClipMark has no review
 * base to cite yet (see docs/gtm/SEO-AUDIT.md §1.4).
 */
export function buildPageMetadata({
  title,
  description,
  path,
  keywords,
  cardTitle,
  cardSubtitle,
}: {
  title: string;
  /** Meta description. Keep to ~155 chars so it isn't truncated in the SERP. */
  description: string;
  /** Root-relative path, leading slash, no trailing slash (e.g. '/youtube-to-anki'). */
  path: string;
  keywords?: string[];
  /** Override the card headline when the page title is too long to read at 60px. */
  cardTitle?: string;
  /** Override the card sub-line. Keep under ~100 chars. */
  cardSubtitle?: string;
}): Metadata {
  const ogImage = buildOgImageUrl({
    title: cardTitle ?? cardHeadline(title),
    subtitle: cardSubtitle ?? cardSubline(description),
  });

  return {
    title,
    description,
    ...(keywords ? { keywords } : {}),
    alternates: {
      canonical: path,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: path,
      siteName: 'ClipMark',
      images: [
        {
          url: ogImage,
          width: OG_IMAGE_WIDTH,
          height: OG_IMAGE_HEIGHT,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}

/**
 * `FAQPage` structured data. Answers are the same strings rendered on the page —
 * Google requires the marked-up answer to be visible content, so callers must
 * pass the identical array they render, not a summarised variant.
 */
export function buildFaqLd(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };
}
