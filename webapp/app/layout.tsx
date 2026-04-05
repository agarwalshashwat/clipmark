import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from './components/ThemeProvider';

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
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://clipmark.mithahara.com'),
  title: 'Clipmark — YouTube Timestamp Bookmarks',
  description: 'Bookmark YouTube moments, get AI summaries, and revisit key insights — free Chrome extension for students, developers, and creators.',
  keywords: ['youtube bookmarks', 'youtube timestamp', 'youtube notes', 'chrome extension', 'ai summarizer', 'spaced repetition', 'study help'],
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
    url: process.env.NEXT_PUBLIC_APP_URL ?? 'https://clipmark.mithahara.com',
    siteName: 'Clipmark',
    images: [
      {
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://clipmark.mithahara.com'}/clipmark-logo.png`,
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
    images: [`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://clipmark.mithahara.com'}/clipmark-logo.png`],
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
