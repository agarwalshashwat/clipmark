import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from './components/ThemeProvider';

export const metadata: Metadata = {
  title: 'Clipmark — YouTube Timestamp Bookmarks',
  description: 'Bookmark YouTube moments, get AI summaries, and revisit key insights — free Chrome extension for students, developers, and creators.',
  keywords: ['youtube bookmarks', 'youtube timestamp', 'youtube notes', 'chrome extension', 'ai summarizer'],
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
  return (
    <html lang="en" data-theme="light">
      <head>
        {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600&family=JetBrains+Mono&display=swap" rel="stylesheet" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
