'use client';

/**
 * Vercel Web Analytics — visitor counts for the marketing site.
 *
 * Why this and not GA4: it is cookie-free (no client identifier is written, so
 * no consent banner is required in the EU/UK), it needs no third-party origin
 * — the script and the collection endpoint are both served from our own domain
 * under /_vercel/insights, so it survives ad-blocker domain lists better and
 * doesn't widen the CSP posture asserted in tests/unit/headers.test.ts — and it
 * ships no cross-site identifier we'd have to disclose in /privacy.
 *
 * NOTE: this is *website visitor* analytics only. It is unrelated to the
 * extension's feature-usage analytics, which never routes through here.
 *
 * Data only flows once Web Analytics is enabled for the project in the Vercel
 * dashboard (Project → Analytics → Enable). Until then this component mounts,
 * requests the script, gets a 404, and silently no-ops — it does not throw and
 * does not affect rendering.
 *
 * Wrapped in a client component purely so `beforeSend` (a function prop) can be
 * passed; the root layout is a server component and cannot pass one directly.
 */

import { Analytics } from '@vercel/analytics/next';

// Matched on the event's own URL rather than usePathname() because the event is
// what actually gets sent, and the pageview fires for the embed route before any
// client navigation would update a hook-derived path.
import { isEmbedView } from '../lib/analytics-filter';

export function SiteAnalytics() {
  return <Analytics beforeSend={(event) => (isEmbedView(event.url) ? null : event)} />;
}
