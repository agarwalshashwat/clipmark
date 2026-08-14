'use client';

/**
 * Vercel Web Analytics — visitor counts for the marketing site.
 *
 * Cookieless and aggregate-only, so it needs no consent banner, and the script
 * and collection endpoint are both served from our own origin under
 * /_vercel/insights — it doesn't widen the header posture asserted in
 * tests/unit/headers.test.ts. Disclosed in /privacy.
 *
 * NOTE: *website visitor* analytics only. Unrelated to the extension's own
 * feature-usage instrumentation, which never routes through here.
 *
 * Nothing is collected until Web Analytics is enabled for the project in the
 * Vercel dashboard (Project → Analytics → Enable). Until then this mounts,
 * requests the script, gets a 404 and silently no-ops — it neither throws nor
 * affects rendering. It also only reports from Vercel deployments, so a local
 * `next start` showing no data is expected.
 *
 * This exists as a client component purely so `beforeSend` — a function prop —
 * can be passed; the root layout is a server component and cannot pass one.
 */
import { Analytics } from '@vercel/analytics/next';

// Filtered on the event's own URL rather than usePathname(): the event URL is
// what actually gets sent, and the pageview fires for the embed route before any
// client navigation would update a hook-derived path.
import { isEmbedView } from '../lib/analytics-filter';

export function SiteAnalytics() {
  return <Analytics beforeSend={(event) => (isEmbedView(event.url) ? null : event)} />;
}
