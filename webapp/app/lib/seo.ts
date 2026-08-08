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
export function buildPageMetadata({
  title,
  description,
  path,
  keywords,
}: {
  title: string;
  /** Meta description. Keep to ~155 chars so it isn't truncated in the SERP. */
  description: string;
  /** Root-relative path, leading slash, no trailing slash (e.g. '/youtube-to-anki'). */
  path: string;
  keywords?: string[];
}): Metadata {
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
          url: `${APP_URL}/clipmark-logo.png`,
          width: 512,
          height: 512,
          alt: 'ClipMark — YouTube Bookmark Extension',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${APP_URL}/clipmark-logo.png`],
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
