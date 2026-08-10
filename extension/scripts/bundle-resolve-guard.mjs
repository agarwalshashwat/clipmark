#!/usr/bin/env node
/**
 * Build guard: every reference the packaged extension makes to its own files
 * must actually resolve inside the package.
 *
 * The bug class this exists for is one this repo has already shipped three
 * times, each time via web_accessible_resources causing a verbatim copy:
 *
 *   - dashboard.html is only reachable via web_accessible_resources, so crxjs
 *     copied it verbatim instead of treating it as an HTML entry, leaving
 *     `<script src="./dashboard.entry.js">` pointing at a file that was never
 *     built. The dashboard and Anki export were dead in the packaged zip while
 *     every source-loaded test stayed green.
 *   - styles/dashboard.css is ALSO copied verbatim, and its `@import`s
 *     (design-tokens.css, fonts.css) were never copied alongside it, so that
 *     exposed stylesheet resolved to no tokens and no fonts.
 *   - src/popup/dashboard.js was listed too, so 113KB of raw un-bundled ESM
 *     shipped in v1.0.3 with none of its nine relative imports packaged. The
 *     page ran the bundled chunk, so nothing looked broken; the exposed file
 *     was simply dead weight that could never execute. Fixed by dropping it
 *     from web_accessible_resources — an extension page's own subresources do
 *     not need to be listed there.
 *
 * Both were invisible to the source tree and to the E2E suite; only the shipped
 * bytes show them. So this reads dist/ and nothing else.
 *
 *   node extension/scripts/bundle-resolve-guard.mjs [dist-dir]
 *
 * Exits non-zero on the first unresolved reference.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv, exit } from 'node:process';

const DIST = path.resolve(argv[2] ?? fileURLToPath(new URL('../dist', import.meta.url)));
const problems = [];
const checked = { html: 0, css: 0, js: 0, refs: 0 };

function walk(dir) {
  return readdirSync(dir).flatMap((e) => {
    const p = path.join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

if (!existsSync(DIST)) {
  console.error(`✗ ${DIST} does not exist — run \`make ext-build\` first.`);
  exit(1);
}

const files = walk(DIST);
const rel = (p) => path.relative(DIST, p);

/** Resolve a reference the way the browser would, from the referring file. */
function resolveRef(fromFile, ref) {
  // Extension pages resolve root-absolute paths against the package root.
  const target = ref.startsWith('/')
    ? path.join(DIST, ref.slice(1))
    : path.resolve(path.dirname(fromFile), ref);
  return target.split('?')[0].split('#')[0];
}

function check(fromFile, ref, kind) {
  // Only our own files — a remote URL or data: URI is a different question
  // (R6 in the design audit covers CDN fonts).
  if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:') || ref.startsWith('chrome-extension://')) return;
  checked.refs += 1;
  const target = resolveRef(fromFile, ref);
  if (!existsSync(target)) {
    problems.push(`${rel(fromFile)} → ${kind} "${ref}" does not exist in the package (looked for ${rel(target)})`);
  }
}

for (const f of files) {
  const ext = path.extname(f);
  if (ext === '.html') {
    checked.html += 1;
    // Commented-out markup is not a reference, so strip comments before
    // scanning — otherwise a disabled tag would make this guard cry wolf on a
    // healthy build. (Both pages' `<script src="../popup/theme-loader.js">` is
    // live as of v1.0.4's dark mode, and IS therefore checked: Vite does not
    // bundle classic scripts, so a missing copy step would 404 the pre-paint
    // resolver and pin the extension to light. See the copyPageClassicScripts
    // plugin in vite.config.mjs.)
    const src = readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, ' ');
    for (const m of src.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) check(f, m[1], '<script src>');
    for (const m of src.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)) check(f, m[1], '<link href>');
    for (const m of src.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) check(f, m[1], '<img src>');
  } else if (ext === '.css') {
    checked.css += 1;
    const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const m of src.matchAll(/@import\s+(?:url\()?["']([^"']+)["']/gi)) check(f, m[1], '@import');
    for (const m of src.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      if (!/^data:/.test(m[1])) check(f, m[1], 'url()');
    }
  } else if (ext === '.js') {
    // A THIRD instance of the same bug class, shipped in v1.0.3: raw ESM copied
    // verbatim because it was listed in web_accessible_resources, whose relative
    // imports (../loop.module.js, ../constants.module.js, …) were never bundled
    // alongside it. 113KB of dead weight that a browser could fetch and fail to
    // execute, while the page itself ran the bundled copy. The html/css scans
    // above could not see it — nothing references it, which is the point.
    checked.js += 1;
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:^|[\s;}])(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']/g)) {
      if (m[1].startsWith('.') || m[1].startsWith('/')) check(f, m[1], 'import');
    }
    for (const m of src.matchAll(/(?:^|[\s;}])import\s*["']([^"']+)["']/g)) {
      if (m[1].startsWith('.') || m[1].startsWith('/')) check(f, m[1], 'bare import');
    }
  }
}

// Everything the manifest points at must exist too.
const manifestPath = path.join(DIST, 'manifest.json');
if (!existsSync(manifestPath)) {
  problems.push('manifest.json is missing from the package');
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const manifestRefs = [
    manifest.background?.service_worker,
    manifest.side_panel?.default_path,
    ...(manifest.content_scripts ?? []).flatMap((c) => [...(c.js ?? []), ...(c.css ?? [])]),
    ...(manifest.web_accessible_resources ?? []).flatMap((w) => w.resources ?? []),
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {}),
  ].filter(Boolean);
  for (const r of manifestRefs) {
    checked.refs += 1;
    if (!existsSync(path.join(DIST, r))) problems.push(`manifest.json → "${r}" is not in the package`);
  }
}

console.log(`\n── packaged bundle references ${'─'.repeat(44)}`);
console.log(`  scanned ${checked.html} html + ${checked.css} css + ${checked.js} js file(s), ${checked.refs} reference(s)`);
if (problems.length) {
  console.log(`  ✗ FAIL — ${problems.length} unresolved reference(s):`);
  for (const p of problems) console.log(`      ${p}`);
  console.log('');
  exit(1);
}
console.log('  ✓ PASS — every reference resolves inside the package\n');
