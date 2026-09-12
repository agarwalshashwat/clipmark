import type { Metadata } from 'next';
import { APP_URL } from './constants';

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
/**
 * Absolute URL for a generated 1200×630 social card (app/api/og/route.tsx).
 *
 * Every card used to be the raw square logo — /clipmark-logo.png, a 450×450 file
 * that the metadata declared as 512×512. Both facts hurt: `summary_large_image`
 * wants a 1.91:1 image and downgrades or letterboxes a square one, and the wrong
 * declared dimensions mean a scraper that trusts the tags reserves the wrong box.
 *
 * `subtitle` rather than `count`: the OG route only renders its "N Bookmarks
 * Curated" line when a count is explicitly passed, which the two share routes do
 * and marketing pages must not.
 */
export function ogImageUrl({ title, subtitle }: { title: string; subtitle?: string }): string {
  const params = new URLSearchParams({ title });
  if (subtitle) params.set('subtitle', subtitle);
  return `${APP_URL}/api/og?${params.toString()}`;
}

export function buildPageMetadata({
  title,
  description,
  path,
  keywords,
  ogTitle,
  ogSubtitle,
}: {
  title: string;
  /** Meta description. Keep to ~155 chars so it isn't truncated in the SERP. */
  description: string;
  /** Root-relative path, leading slash, no trailing slash (e.g. '/youtube-to-anki'). */
  path: string;
  keywords?: string[];
  /**
   * Headline drawn on the social card. Defaults to `title`, which is usually
   * right — override when the SERP title carries an "— ClipMark" suffix that the
   * card doesn't need (the card already shows the wordmark).
   */
  ogTitle?: string;
  /** Second line on the card. Defaults to nothing rather than a stray "0". */
  ogSubtitle?: string;
}): Metadata {
  const cardTitle = ogTitle ?? title;
  const card = ogImageUrl({ title: cardTitle, subtitle: ogSubtitle });

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
          url: card,
          width: 1200,
          height: 630,
          alt: cardTitle,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [card],
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
