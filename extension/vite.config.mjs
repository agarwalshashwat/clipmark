import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import { assertProdApiBase } from './scripts/api-base-guard.mjs';

// Fail a production build if the extension is configured to talk to a local
// dev server. Runs only on `vite build` (not `vite dev`), so localhost is still
// allowed while developing but can never be packaged for the Chrome Web Store.
// The parse/validate logic lives in ./scripts/api-base-guard.mjs so it can be
// unit-tested; this plugin only handles file reading + surfacing errors.
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
      try {
        assertProdApiBase(source);
      } catch (err) {
        this.error(err.message);
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
