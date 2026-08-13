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
 * Absolute URL of a generated 1200x630 brand card for a marketing route.
 *
 * Every page previously advertised `/clipmark-logo.png` — a 450x450 square that
 * the metadata also mis-declared as 512x512. A square in a `summary_large_image`
 * slot gets letterboxed into grey bars by X and LinkedIn, and the copy on the
 * card never matched the page being shared. Generating per-route means the card
 * carries that page's own title.
 *
 * Absolute because og:image is one of the few metadata fields where relative
 * URLs are unreliable across scrapers, several of which don't apply
 * `metadataBase`.
 */
export function ogImageUrl(title: string, subtitle?: string): string {
  const params = new URLSearchParams({ title });
  if (subtitle) params.set('subtitle', subtitle);
  return `${APP_URL}/api/og?${params.toString()}`;
}

/**
 * Alt text for a card. Only brands the title when it isn't already branded —
 * otherwise a page titled "ClipMark — …" produced "ClipMark — … — ClipMark".
 */
function cardAlt(title: string): string {
  return /clipmark/i.test(title) ? title : `${title} — ClipMark`;
}

/** og:image / twitter:image block shared by every marketing route. */
function ogImages(title: string, subtitle?: string) {
  return [
    {
      url: ogImageUrl(title, subtitle),
      width: 1200,
      height: 630,
      alt: cardAlt(title),
    },
  ];
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
   * Card headline, when the page <title> is too long to render legibly at 58px.
   * Defaults to `title`, so the card and the page can't silently disagree.
   */
  ogTitle?: string;
  /** Card sub-line. Defaults to `description`. */
  ogSubtitle?: string;
}): Metadata {
  const cardTitle = ogTitle ?? title;
  const cardSubtitle = ogSubtitle ?? description;

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
      images: ogImages(cardTitle, cardSubtitle),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl(cardTitle, cardSubtitle)],
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
