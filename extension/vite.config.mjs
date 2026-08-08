import { readFileSync, readdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import { assertProdApiBase } from './scripts/api-base-guard.mjs';
import { assertContentGlobals } from './scripts/content-globals-guard.mjs';

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

// Fail the build if the packaged content-script chunks were tree-shaken in a
// way that strips the globals content.js depends on (see
// ./scripts/content-globals-guard.mjs for the full story). Runs after crx has
// written dist/, so it checks the actual shipped artifact.
function contentGlobalsGuard() {
  return {
    name: 'clipmark-content-globals-guard',
    apply: 'build',
    closeBundle() {
      // Scan every built JS asset (crxjs may emit loader shims for the
      // manifest-listed paths, with the real code in a separate chunk — a
      // union check across all assets is loader-proof).
      const assetsDir = fileURLToPath(new URL('./dist/assets', import.meta.url));
      let files;
      try {
        files = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
      } catch {
        this.error('dist/assets missing after build — cannot verify content-script chunks.');
        return;
      }
      const sources = files.map((f) => readFileSync(`${assetsDir}/${f}`, 'utf8'));
      try {
        assertContentGlobals(sources);
      } catch (err) {
        this.error(err.message);
      }
    },
  };
}

// styles/dashboard.css is listed in web_accessible_resources, so crxjs copies it
// into dist/ verbatim — @import lines and all. Its imports (./design-tokens.css,
// ./fonts.css) were never copied alongside it, so that exposed stylesheet has
// always resolved to no tokens and no fonts. dashboard.html itself is fine (Vite
// inlines the imports into the hashed bundle it links instead), which is why this
// went unnoticed. Emit the two companions next to the verbatim copy, rewriting
// fonts.css's relative woff2 urls onto the hashed assets the build actually
// produced, so every stylesheet the package serves resolves.
function copyStyleImports() {
  return {
    name: 'clipmark-copy-style-imports',
    apply: 'build',
    closeBundle() {
      const styles = fileURLToPath(new URL('./styles', import.meta.url));
      const outStyles = fileURLToPath(new URL('./dist/styles', import.meta.url));
      const assets = fileURLToPath(new URL('./dist/assets', import.meta.url));
      if (!existsSync(outStyles)) return; // nothing was copied verbatim

      copyFileSync(`${styles}/design-tokens.css`, `${outStyles}/design-tokens.css`);

      const hashed = readdirSync(assets).filter((f) => f.endsWith('.woff2'));
      let fonts = readFileSync(`${styles}/fonts.css`, 'utf8');
      fonts = fonts.replace(/url\('\.\.\/assets\/fonts\/([^']+)\.woff2'\)/g, (m, stem) => {
        const hit = hashed.find((f) => f.startsWith(`${stem}-`));
        if (!hit) {
          this.error(`fonts.css references ${stem}.woff2 but no hashed build of it is in dist/assets.`);
          return m;
        }
        return `url('../assets/${hit}')`;
      });
      writeFileSync(`${outStyles}/fonts.css`, fonts);
    },
  };
}

export default defineConfig({
  plugins: [apiBaseGuard(), crx({ manifest }), contentGlobalsGuard(), copyStyleImports()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // dashboard.html is only reachable via web_accessible_resources, so crxjs
      // copies it verbatim instead of treating it as an HTML entry — leaving its
      // <script src="./dashboard.entry.js"> pointing at a file that was never
      // built (broken dashboard + Anki export in the packaged zip). Declaring it
      // as an explicit input makes Vite bundle it like the manifest-referenced
      // side-panel.html. crxjs merges this with its own manifest-derived inputs.
      input: {
        dashboard: fileURLToPath(new URL('./src/pages/dashboard.html', import.meta.url)),
      },
    },
  },
});
