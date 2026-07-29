import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required on Next 14 for instrumentation.ts to be loaded (stable in 15+).
  experimental: {
    instrumentationHook: true,
  },
  async headers() {
    return [
      {
        // Security headers for all routes
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // Allow Chrome extension to call the API.
        // CORS wildcard is intentional: Chrome extension background scripts
        // do not send an Origin header the same way browsers do, so restricting
        // to a specific origin would block extension requests.
        // Authorization header is required for Bearer token auth.
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
      {
        // Allow embed pages to be used in iframes (overrides global X-Frame-Options: DENY)
        source: '/embed/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Content-Security-Policy', value: "frame-ancestors *" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
        port: '',
        pathname: '/vi/**',
      },
    ],
  },
};

/**
 * Source maps are only uploaded when SENTRY_AUTH_TOKEN is present, so keyless
 * local builds and CI keep working — they just produce minified stack traces.
 * Add the token in Vercel (Settings → Environment Variables) to get readable
 * ones in production; never commit it.
 */
const sentryBuildOptions = {
  org: 'mithahara',
  project: 'clipmark-web',
  // Don't fail a deploy because Sentry's API had a bad day.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  silent: !process.env.CI,
  // Strips Sentry's own debug logging from the bundle. Kept on except when
  // NEXT_PUBLIC_SENTRY_DEBUG=1, because stripping it makes `debug: true` a no-op
  // and you get a warning instead of the logs you asked for.
  webpack: { treeshake: { removeDebugLogging: process.env.NEXT_PUBLIC_SENTRY_DEBUG !== '1' } },
  // Without this, source maps for files loaded outside the default client
  // chunks (our route groups) are missed.
  widenClientFileUpload: true,
  // We deliberately do NOT set tunnelRoute: it proxies events through our own
  // domain to dodge ad blockers, at the cost of an extra API route and our
  // Vercel bandwidth. Revisit only if reports look suspiciously sparse.
};

export default withSentryConfig(nextConfig, sentryBuildOptions);
