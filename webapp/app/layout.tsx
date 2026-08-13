// Sentry is wired up outside this file — nothing to init in the layout:
//   • instrumentation.ts        — Node + edge runtimes
//   • instrumentation-client.ts — browser bundle
//   • lib/sentry-config.ts      — options shared by all three
//   • app/global-error.tsx      — root error boundary that reports crashes
// The extension reports to a separate Sentry project (clipmark-extension) so
// content-script noise from youtube.com can't drown out webapp issues.

import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Inter, JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { ThemeProvider } from './components/ThemeProvider';
import { APP_URL, CHROME_STORE_URL } from './lib/constants';
import { buildOgImageUrl, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from './lib/seo';

// Fallback card for routes that set no openGraph of their own — the dashboard,
// /signin, /feedback. Marketing routes build their own through
// buildPageMetadata(); see the note there on why this must not be inherited.
const ROOT_OG_IMAGE = buildOgImageUrl({
  title: 'YouTube Timestamp Bookmarks',
  subtitle: 'Save the moment, get quizzed on it, export the deck to Anki.',
});

const plusJakarta = Plus_Jakarta_Sans({ 
  subsets: ['latin'], 
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta' 
});
const inter = Inter({ 
  subsets: ['latin'], 
  weight: ['300', '400', '500', '600'],
  variable: '--font-inter' 
});
const jetbrains = JetBrains_Mono({ 
  subsets: ['latin'],
  variable: '--font-jetbrains' 
});

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: 'ClipMark — YouTube Timestamp Bookmarks',
  description: 'Bookmark YouTube moments, get AI summaries, and revisit key insights — free Chrome extension for students, developers, and creators.',
  keywords: ['youtube bookmarks', 'youtube timestamp', 'youtube notes', 'chrome extension', 'ai summarizer', 'spaced repetition', 'study help'],
  // No `icons` block: app/favicon.ico and app/apple-icon.png are file-convention
  // icons that Next links automatically, and an explicit `icons` here would
  // override them. The old block pointed all three at /clipmark-logo.png — a
  // 154 kB 450x450 PNG served as the favicon, while /favicon.ico (which every
  // browser requests regardless) 404'd. See webapp/scripts/generate-icons.py.
  alternates: {
    canonical: '/',
  },
  verification: {
    google: 'chJnY3idU4qZvir3ZZ3NAcVF3mde32n0AMYk2SJNt1k',
  },
  openGraph: {
    title: 'ClipMark — YouTube Timestamp Bookmarks',
    description: 'Bookmark YouTube moments, get AI summaries, and revisit key insights. Free Chrome extension.',
    type: 'website',
    url: APP_URL,
    siteName: 'ClipMark',
    images: [
      {
        url: ROOT_OG_IMAGE,
        width: OG_IMAGE_WIDTH,
        height: OG_IMAGE_HEIGHT,
        alt: 'ClipMark — YouTube Timestamp Bookmarks',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ClipMark — YouTube Timestamp Bookmarks',
    description: 'Bookmark YouTube moments, get AI summaries, and revisit key insights. Free Chrome extension.',
    images: [ROOT_OG_IMAGE],
  },
};

// Inline script runs synchronously before first paint to avoid flash of wrong theme.
const themeScript = `
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch(e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    'name': 'ClipMark',
    'operatingSystem': 'ChromeOS, Windows, macOS, Linux',
    'applicationCategory': 'EducationalApplication, BrowserExtension',
    'installUrl': CHROME_STORE_URL,
    'offers': {
      '@type': 'Offer',
      'price': '0',
      'priceCurrency': 'USD',
    },
  };

  return (
    <html lang="en" data-theme="light" className={`${plusJakarta.variable} ${inter.variable} ${jetbrains.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Material Symbols is self-hosted from /public/fonts (see the @font-face
            in globals.css) — the text families already come from next/font, which
            serves them off our own origin, so no font is fetched from Google at
            runtime. Preloaded because icons appear above the fold in the nav. */}
        <link
          rel="preload"
          href="/fonts/material-symbols-outlined.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        {/* Site-visitor analytics (page views / referrers), NOT the extension's
            feature-usage telemetry. Cookieless and no client identifier is
            stored, so it needs no consent banner under GDPR/ePrivacy — that is
            the reason it was picked over GA4, which does set cookies and would
            drag a banner onto every page.

            The <script> only loads on Vercel deployments, and data only starts
            flowing once Web Analytics is enabled for the project in the Vercel
            dashboard (Project → Analytics → Enable). Until then this renders a
            no-op: nothing to configure in code, no env var, and local `next dev`
            deliberately sends nothing. */}
        <Analytics />
      </body>
    </html>
  );
}
