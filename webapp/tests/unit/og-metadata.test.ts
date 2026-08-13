/**
 * Social-card metadata (app/lib/seo.ts).
 *
 * Every marketing route used to advertise /clipmark-logo.png as its og:image —
 * a 450x450 square that the metadata *also* declared as 512x512. Two distinct
 * defects: a square gets letterboxed into grey bars in a summary_large_image
 * slot, and the declared dimensions didn't match the file, which some scrapers
 * use to pre-allocate the crop.
 *
 * Both are invisible in the product. Nothing renders differently, no test fails,
 * and the only symptom is that links shared to X/LinkedIn/Slack look broken —
 * which you find out from the audience, not from CI. Hence this file.
 *
 * Run: npm --prefix webapp run test:unit
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPageMetadata, ogImageUrl } from '../../app/lib/seo';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('ogImageUrl', () => {
  it('is absolute and points at the card generator', () => {
    const url = ogImageUrl('Hello', 'World');
    assert.match(url, /^https?:\/\//, 'og:image must be absolute — some scrapers ignore metadataBase');
    assert.ok(new URL(url).pathname === '/api/og', 'should render through /api/og');
  });

  it('round-trips title and subtitle through the query string', () => {
    const url = new URL(ogImageUrl('Free & Pro Plans', '30% off, forever'));
    assert.equal(url.searchParams.get('title'), 'Free & Pro Plans');
    assert.equal(url.searchParams.get('subtitle'), '30% off, forever');
  });

  it('omits subtitle when not supplied', () => {
    assert.equal(new URL(ogImageUrl('Solo')).searchParams.has('subtitle'), false);
  });

  it('never emits a count, which would render "0 Bookmarks Curated"', () => {
    assert.equal(new URL(ogImageUrl('Any page')).searchParams.has('count'), false);
  });
});

describe('buildPageMetadata', () => {
  const meta = buildPageMetadata({
    title: 'Privacy Policy — ClipMark',
    description: 'How ClipMark collects, uses, and protects your data.',
    path: '/privacy',
  });

  it('declares a 1200x630 card', () => {
    const images = meta.openGraph?.images as { width: number; height: number; url: string }[];
    assert.equal(images.length, 1);
    assert.equal(images[0].width, 1200);
    assert.equal(images[0].height, 630);
  });

  it('keeps canonical and og:url in agreement', () => {
    assert.equal(meta.alternates?.canonical, '/privacy');
    assert.equal(meta.openGraph?.url, '/privacy');
  });

  it('emits a matching twitter image so the card cannot drift', () => {
    const og = (meta.openGraph?.images as { url: string }[])[0].url;
    const twitter = (meta.twitter?.images as string[])[0];
    assert.equal(og, twitter);
  });

  it('does not double-brand alt text for an already-branded title', () => {
    const alt = (meta.openGraph?.images as { alt: string }[])[0].alt;
    assert.equal(alt.match(/ClipMark/g)?.length, 1, `alt double-brands: ${alt}`);
  });

  it('brands alt text when the title is not already branded', () => {
    const bare = buildPageMetadata({ title: 'Pricing', description: 'd', path: '/upgrade' });
    const alt = (bare.openGraph?.images as { alt: string }[])[0].alt;
    assert.equal(alt, 'Pricing — ClipMark');
  });

  it('lets a page override the card copy without touching its <title>', () => {
    const meta2 = buildPageMetadata({
      title: 'A Very Long SEO Title That Would Wrap Three Times On A Card',
      description: 'desc',
      path: '/x',
      ogTitle: 'Short headline',
      ogSubtitle: 'Short sub',
    });
    const url = new URL((meta2.openGraph?.images as { url: string }[])[0].url);
    assert.equal(url.searchParams.get('title'), 'Short headline');
    assert.equal(url.searchParams.get('subtitle'), 'Short sub');
    // The <title> itself must be untouched — the card is not the SERP entry.
    assert.equal(meta2.title, 'A Very Long SEO Title That Would Wrap Three Times On A Card');
  });
});

describe('no route advertises the square logo as a social card', () => {
  it('has no clipmark-logo.png in any og:image / twitter:image', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(APP_DIR)) {
      const src = readFileSync(file, 'utf8');
      // Strip comments first: several files explain the old bug by name, and
      // that prose is documentation, not a live reference.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (code.includes('clipmark-logo.png')) {
        // Navigation renders the logo as an <img>; that is a real, correct use.
        if (/<img[^>]*clipmark-logo\.png/.test(code)) continue;
        offenders.push(path.relative(APP_DIR, file));
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `these routes still use the 450x450 square logo as a social card; build the ` +
        `card with ogImageUrl() instead:\n  ${offenders.join('\n  ')}`,
    );
  });
});
