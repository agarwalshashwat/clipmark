import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

// Fail a production build if the extension is configured to talk to a local
// dev server. Runs only on `vite build` (not `vite dev`), so localhost is still
// allowed while developing but can never be packaged for the Chrome Web Store.
function apiBaseGuard() {
  return {
    name: 'clipmark-api-base-guard',
    apply: 'build',
    buildStart() {
      const configPath = fileURLToPath(new URL('./src/config.js', import.meta.url));
      let source;
      try {
        source = readFileSync(configPath, 'utf8');
      } catch {
        this.error(
          'src/config.js is missing. It is committed as the production default — ' +
            'restore it (see src/config.example.js) before building.'
        );
        return;
      }
      const match = source.match(/API_BASE\s*=\s*['"`]([^'"`]*)['"`]/);
      if (!match) {
        this.error('Could not find API_BASE in src/config.js.');
        return;
      }
      const apiBase = match[1];
      if (/localhost|127\.0\.0\.1/i.test(apiBase)) {
        this.error(
          `API_BASE points at a local dev server ("${apiBase}"). Set it to the ` +
            'production URL in src/config.js before building for release.'
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [apiBaseGuard(), crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
