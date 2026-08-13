/**
 * Social cards (app/lib/seo.ts → app/api/og) and the favicon set.
 *
 * Two classes of silent breakage are covered:
 *
 * 1. Card geometry. Every route used to advertise the square 450×450 logo as a
 *    512×512 `summary_large_image`. Nothing failed — the tags were well-formed
 *    and the file existed — the cards just rendered as a letterboxed logo, and
 *    only a link preview would have shown it.
 *
 * 2. The "0 Bookmarks Curated" trap. The OG route defaulted `count` to '0', so
 *    pointing a marketing page at it produced a card whose strapline read
 *    "0 Bookmarks Curated". Presence of the param, not its truthiness, has to
 *    decide — a real collection can legitimately hold zero.
 *
 * Run: npm --prefix webapp run test:unit
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPageMetadata, ogImageUrl } from '../../app/lib/seo';

const WEBAPP_DIR = fileURLToPath(new URL('../..', import.meta.url));
const PUBLIC_DIR = join(WEBAPP_DIR, 'public');

describe('ogImageUrl', () => {
  it('builds an absolute /api/og URL', () => {
    const url = ogImageUrl({ title: 'Hello' });
    assert.match(url, /^https?:\/\//, 'scrapers need an absolute URL');
    assert.ok(url.includes('/api/og?'), 'must use the card generator');
  });

  it('never sends a count, so marketing cards cannot read "0 Bookmarks Curated"', () => {
    for (const args of [{ title: 'A' }, { title: 'B', subtitle: 'C' }]) {
      assert.ok(!new URL(ogImageUrl(args)).searchParams.has('count'));
    }
  });

  it('omits subtitle entirely when not given', () => {
    assert.ok(!new URL(ogImageUrl({ title: 'A' })).searchParams.has('subtitle'));
    assert.equal(
      new URL(ogImageUrl({ title: 'A', subtitle: 'S' })).searchParams.get('subtitle'),
      'S',
    );
  });

  it('encodes titles that contain URL-significant characters', () => {
    const url = ogImageUrl({ title: 'Free & Pro — 100% off?' });
    assert.equal(new URL(url).searchParams.get('title'), 'Free & Pro — 100% off?');
  });
});

describe('buildPageMetadata', () => {
  const meta = buildPageMetadata({
    title: 'Pricing — ClipMark',
    description: 'Compare plans.',
    path: '/upgrade',
    ogTitle: 'Pricing',
    ogSubtitle: 'Start free.',
  });

  it('declares a 1200x630 card', () => {
    const image = (meta.openGraph?.images as { url: string; width: number; height: number }[])[0];
    assert.equal(image.width, 1200);
    assert.equal(image.height, 630);
    assert.ok(image.url.includes('/api/og?'), 'not the raw logo');
  });

  it('keeps canonical and og:url in step', () => {
    assert.equal(meta.alternates?.canonical, '/upgrade');
    assert.equal(meta.openGraph?.url, '/upgrade');
  });

  it('emits a twitter block explicitly, using the same card', () => {
    const ogImage = (meta.openGraph?.images as { url: string }[])[0].url;
    // Metadata['twitter'] is a union whose other arms have no `card`.
    const twitter = meta.twitter as { card: string; images: string[] };
    assert.equal(twitter.card, 'summary_large_image');
    assert.deepEqual(twitter.images, [ogImage]);
  });

  it('uses ogTitle for the card and title for the SERP', () => {
    const image = (meta.openGraph?.images as { url: string }[])[0];
    assert.equal(new URL(image.url).searchParams.get('title'), 'Pricing');
    assert.equal(meta.title, 'Pricing — ClipMark');
  });

  it('falls back to title when no ogTitle is given', () => {
    const m = buildPageMetadata({ title: 'Solo', description: 'd', path: '/x' });
    const image = (m.openGraph?.images as { url: string }[])[0];
    assert.equal(new URL(image.url).searchParams.get('title'), 'Solo');
  });
});

describe('the OG route gates its count on presence', () => {
  it('reads searchParams.has("count"), not a falsy default', () => {
    const src = readFileSync(join(WEBAPP_DIR, 'app/api/og/route.tsx'), 'utf8');
    assert.match(src, /searchParams\.has\('count'\)/);
    assert.ok(
      !/searchParams\.get\('count'\)\s*\|\|\s*'0'/.test(src),
      'the || \'0\' default is what put "0 Bookmarks Curated" on every card',
    );
  });
});

/** width/height from a PNG IHDR chunk. */
function pngSize(file: string): [number, number] {
  const buf = readFileSync(file);
  assert.equal(buf.readUInt32BE(0), 0x89504e47, `${file} is not a PNG`);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe('favicon set', () => {
  // /favicon.ico is requested by browsers whether or not a page links it, and
  // returned a 404 until these files existed.
  it('ships an .ico with more than one resolution', () => {
    const ico = join(PUBLIC_DIR, 'favicon.ico');
    assert.ok(existsSync(ico), 'public/favicon.ico is missing — /favicon.ico would 404');

    const buf = readFileSync(ico);
    assert.equal(buf.readUInt16LE(0), 0, 'ICONDIR reserved field');
    assert.equal(buf.readUInt16LE(2), 1, 'type 1 = icon');
    assert.ok(buf.readUInt16LE(4) >= 2, 'want several frames so 16/32/48 all look right');
  });

  it('ships the PWA and Apple icons at their declared sizes', () => {
    for (const [name, size] of [
      ['apple-touch-icon.png', 180],
      ['icon-192.png', 192],
      ['icon-512.png', 512],
    ] as const) {
      const file = join(PUBLIC_DIR, name);
      assert.ok(existsSync(file), `public/${name} is missing`);
      assert.deepEqual(pngSize(file), [size, size], `${name} should be ${size}x${size}`);
    }
  });

  it('every icon the layout declares actually exists', () => {
    const layout = readFileSync(join(WEBAPP_DIR, 'app/layout.tsx'), 'utf8');
    const block = layout.slice(layout.indexOf('icons:'), layout.indexOf('alternates:'));

    // exec loop rather than [...matchAll()] — the tsconfig target here predates
    // iterating an iterator with spread.
    const declared: string[] = [];
    const re = /url: '(\/[^']+)'/g;
    for (let m = re.exec(block); m !== null; m = re.exec(block)) declared.push(m[1]);
    assert.ok(declared.length >= 4, `expected the icon block to be found, saw ${declared.length}`);

    for (const url of declared) {
      assert.ok(existsSync(join(PUBLIC_DIR, url)), `layout declares ${url}, which does not exist`);
    }
  });
});
