/**
 * Config for auditing the webapp's PRODUCTION build.
 *
 * playwright.config.ts declares a global `webServer` that runs `next dev`. That
 * is right for the visual suite, but it makes auditing a production build
 * impossible: `next dev` rewrites webapp/.next/static, which orphans the hashed
 * CSS filenames the already-running `next start` is serving. The page then loads
 * with NO stylesheet at all and every rendered assertion reports nonsense —
 * every icon "fails" its ligature check, every label comes out white-on-white.
 * (Ask me how I know.)
 *
 * So: no webServer here, and the target comes from DESIGN_AUDIT_URL.
 *
 *   cd webapp && npx next build && npx next start -p 3458 &
 *   DESIGN_AUDIT_URL=http://localhost:3458 \
 *     npx playwright test --config=playwright.audit.config.ts
 *
 * Sanity-check before trusting a run: the stylesheet the HTML references must
 * return 200, not 500.
 */
import { defineConfig, devices } from '@playwright/test';

const target = process.env.DESIGN_AUDIT_URL;
if (!target) {
  throw new Error('Set DESIGN_AUDIT_URL to the origin of an already-running build, e.g. http://localhost:3458');
}

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  projects: [
    {
      name: 'webapp',
      testMatch: /visual\/design-consistency\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], headless: true, baseURL: target },
    },
  ],
  reporter: [['list']],
});
