import { readFileSync, readdirSync, copyFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import { assertProdApiBase } from './scripts/api-base-guard.mjs';
import { assertContentGlobals } from './scripts/content-globals-guard.mjs';
import {
  assertNoContentGlobalLeaks,
  collectContentScriptGlobals,
} from './scripts/page-globals-guard.mjs';

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

// The mirror image of the guard above: fail the build if an extension PAGE
// bundle (dashboard, side panel) reads a name that only the youtube.com-injected
// content scripts define. See ./scripts/page-globals-guard.mjs for the full
// story — this plugin only walks dist/ and surfaces errors.
function pageGlobalsGuard() {
  return {
    name: 'clipmark-page-globals-guard',
    apply: 'build',
    closeBundle() {
      const dist = fileURLToPath(new URL('./dist', import.meta.url));
      const src = fileURLToPath(new URL('.', import.meta.url));

      // Forbidden names come from the manifest's own content_scripts list, so
      // adding a helper there covers it here automatically.
      let forbidden;
      try {
        forbidden = collectContentScriptGlobals(
          (manifest.content_scripts ?? [])
            .flatMap((c) => c.js ?? [])
            .map((p) => readFileSync(path.join(src, p), 'utf8')),
        );
      } catch (err) {
        this.error(`page-globals guard could not read the content scripts: ${err.message}`);
        return;
      }
      if (!forbidden.length) {
        this.error('page-globals guard derived an empty forbidden list — the manifest or the globalThis registration blocks changed shape.');
        return;
      }

      // Every HTML document the package can actually open as a page.
      const pageHtml = [
        manifest.side_panel?.default_path,
        ...(manifest.web_accessible_resources ?? []).flatMap((w) => w.resources ?? []),
      ].filter((p) => p && p.endsWith('.html'));

      const pages = [];
      for (const rel of pageHtml) {
        const htmlPath = path.join(dist, rel);
        if (!existsSync(htmlPath)) {
          this.error(`page-globals guard: ${rel} is not in dist/ — the page was never built.`);
          return;
        }
        const chunks = [];
        const seen = new Set();
        const html = readFileSync(htmlPath, 'utf8').replace(/<!--[\s\S]*?-->/g, ' ');
        const queue = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
          .map((m) => m[1])
          .filter((s) => !/^(https?:)?\/\//.test(s))
          .map((s) => (s.startsWith('/') ? path.join(dist, s.slice(1)) : path.resolve(path.dirname(htmlPath), s)));

        // Follow the module graph: a page's chunks import each other, and the
        // offending reference can sit in any of them.
        while (queue.length) {
          const file = queue.shift();
          if (seen.has(file) || !existsSync(file)) continue;
          seen.add(file);
          const source = readFileSync(file, 'utf8');
          chunks.push({ file: path.relative(dist, file), source });
          for (const m of source.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']/g)) {
            const spec = m[1] ?? m[2];
            if (!spec || !spec.startsWith('.')) continue;
            queue.push(path.resolve(path.dirname(file), spec));
          }
        }
        pages.push({ page: rel, chunks });
      }

      try {
        assertNoContentGlobalLeaks(pages, forbidden);
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

// The pre-paint theme resolver is a CLASSIC <script src> in the <head> of both
// page HTMLs — it has to be, because a type="module" script is deferred and
// would let the light theme paint first, and MV3's CSP forbids inlining it.
// Vite only bundles module scripts: it leaves a classic src attribute verbatim
// and emits nothing, so the packaged pages 404'd on it while `vite dev` (which
// serves the source tree) worked fine. Same dev-vs-dist trap the twin-file
// convention exists for. Copy the file, then ASSERT every classic script tag in
// every packaged page resolves — so the next one to go missing fails the build
// instead of silently pinning the extension to light mode.
function copyPageClassicScripts() {
  return {
    name: 'clipmark-copy-page-classic-scripts',
    apply: 'build',
    closeBundle() {
      const dist = fileURLToPath(new URL('./dist', import.meta.url));
      const src = fileURLToPath(new URL('.', import.meta.url));

      const pageHtml = [
        manifest.side_panel?.default_path,
        ...(manifest.web_accessible_resources ?? []).flatMap((w) => w.resources ?? []),
      ].filter((p) => p && p.endsWith('.html'));

      let copied = 0;
      for (const rel of pageHtml) {
        const htmlPath = path.join(dist, rel);
        if (!existsSync(htmlPath)) continue; // pageGlobalsGuard already reports this
        const html = readFileSync(htmlPath, 'utf8').replace(/<!--[\s\S]*?-->/g, ' ');
        for (const m of html.matchAll(/<script(?![^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["']/gi)) {
          const ref = m[1];
          // Vite rewrites everything it owns to a root-absolute /assets/ URL;
          // anything still relative is a file it left for us to ship.
          if (/^(https?:)?\/\//.test(ref) || ref.startsWith('/')) continue;
          const from = path.resolve(path.dirname(path.join(src, rel)), ref);
          const to = path.resolve(path.dirname(htmlPath), ref);
          if (!existsSync(from)) {
            this.error(`${rel} loads <script src="${ref}">, which does not exist in the source tree.`);
            return;
          }
          mkdirSync(path.dirname(to), { recursive: true });
          copyFileSync(from, to);
          copied += 1;
          if (!existsSync(to)) {
            this.error(`${rel} loads <script src="${ref}">, which is not in the package — the page would 404 on it.`);
            return;
          }
        }
      }
      if (!copied) {
        this.error(
          'No classic page script was packaged. side-panel.html and dashboard.html ' +
            'must each load ../popup/theme-loader.js before their stylesheet, or the ' +
            'extension paints light regardless of the system theme.',
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [
    apiBaseGuard(),
    crx({ manifest }),
    contentGlobalsGuard(),
    pageGlobalsGuard(),
    copyStyleImports(),
    copyPageClassicScripts(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Vite injects `<link rel="modulepreload">` for every code-split chunk an
    // HTML entry pulls in. On an extension page Chrome cannot match those hints
    // to the eventual import, so its Errors page fills with
    //   "A preload for '…' is found, but is not used because it is a
    //    cross-world extension resource mismatch"
    // plus the generic "preloaded ... but not used within a few seconds" warning.
    // Harmless, but noisy enough to invite questions during store review.
    //
    // The hints buy nothing here: these are local files served from the
    // extension origin with no network latency to hide, and the entry's own
    // static imports load them regardless. `false` also drops the preload
    // polyfill, which is irrelevant to a Chrome-only MV3 target.
    modulePreload: false,
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
