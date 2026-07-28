// ─── TODO(sentry) [launch blocker #3, deferred] ───────────────────────────────
// Init context 4 of 4: Next.js webapp (this is the root layout / app entry).
// When the Sentry dependency is added, wire up the standard Next.js integration
// using the SAME DSN/project as the three extension contexts (tag context
// 'webapp'):
//   • sentry.client.config.ts  — Sentry.init for the browser bundle
//   • sentry.server.config.ts  — Sentry.init for Node runtime
//   • sentry.edge.config.ts    — Sentry.init for the edge runtime
//   • instrumentation.ts       — export register() that imports the above
//     (requires experimental.instrumentationHook in next.config.mjs on Next 14)
// Read DSN from process.env.NEXT_PUBLIC_SENTRY_DSN; set environment from
// NODE_ENV. Do NOT add the @sentry/nextjs dependency yet — placeholder only.
// ──────────────────────────────────────────────────────────────────────────────

import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from './components/ThemeProvider';
import { APP_URL } from './lib/constants';

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
  title: 'Clipmark — YouTube Timestamp Bookmarks',
  description: 'Bookmark YouTube moments, get AI summaries, and revisit key insights — free Chrome extension for students, developers, and creators.',
  keywords: ['youtube bookmarks', 'youtube timestamp', 'youtube notes', 'chrome extension', 'ai summarizer', 'spaced repetition', 'study help'],
  icons: {
    icon: '/clipmark-logo.png',
    shortcut: '/clipmark-logo.png',
    apple: '/clipmark-logo.png',
  },
  alternates: {
    canonical: '/',
  },
  verification: {
    google: 'chJnY3idU4qZvir3ZZ3NAcVF3mde32n0AMYk2SJNt1k',
  },
  openGraph: {
    title: 'Clipmark — YouTube Timestamp Bookmarks',
    description: 'Bookmark YouTube moments, get AI summaries, and revisit key insights. Free Chrome extension.',
    type: 'website',
    url: APP_URL,
    siteName: 'Clipmark',
    images: [
      {
        url: `${APP_URL}/clipmark-logo.png`,
        width: 512,
        height: 512,
        alt: 'Clipmark — YouTube Bookmark Extension',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Clipmark — YouTube Timestamp Bookmarks',
    description: 'Bookmark YouTube moments, get AI summaries, and revisit key insights. Free Chrome extension.',
    images: [`${APP_URL}/clipmark-logo.png`],
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
    'name': 'Clipmark',
    'operatingSystem': 'ChromeOS, Windows, macOS, Linux',
    'applicationCategory': 'EducationalApplication, BrowserExtension',
    'aggregateRating': {
      '@type': 'AggregateRating',
      'ratingValue': '4.9',
      'reviewCount': '1250'
    },
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
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
