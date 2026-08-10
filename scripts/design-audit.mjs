#!/usr/bin/env node
/**
 * DESIGN.md conformance audit — run over the SOURCE of all three surfaces
 * (extension dashboard, extension side panel, webapp) plus, when
 * `--dist` is passed, the built extension in extension/dist.
 *
 *   node scripts/design-audit.mjs           # source only
 *   node scripts/design-audit.mjs --dist    # also audit the packaged artifact
 *
 * Exits non-zero if any rule fails, so it can gate CI the same way
 * extension/scripts/{api-base,content-globals}-guard.mjs gate the extension build.
 *
 * The eight rules mirror DESIGN.md's "Do's and Don'ts":
 *   R1  one gray neutral ramp — no stray neutral/brand hex outside the tokens
 *   R2  every filled CTA is teal-700 and passes WCAG AA for white text
 *   R3  no text below the 11px floor
 *   R4  the wordmark is "ClipMark", solid, never gradient-clipped
 *   R5  at most two teal gradients, each with a solid fallback
 *   R6  no font fetched from a Google CDN at runtime
 *   R7  the dashboard and side-panel header chrome resolve to the same token
 *   R8  no var() reference to a token that is not defined
 *   R9  every colour token has a dark override; the pre-paint path stays sync
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { argv } from 'node:process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const AUDIT_DIST = argv.includes('--dist');
const failures = [];
const notes = [];
const fail = (rule, msg) => failures.push(`[${rule}] ${msg}`);
const note = (msg) => notes.push(`      ${msg}`);

// Comments never render, so they must not be audited — a token file that
// explains "the retired off-ramp #006b5f is gone" was being reported as
// shipping #006b5f.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // /* ... */  (CSS + JS + the inside of {/* ... */})
    .replace(/^[ \t]*\/\/.*$/gm, ' ');     // whole-line // comments (JS/TS only)
}
const read = (p) => stripComments(readFileSync(`${ROOT}/${p}`, 'utf8'));
const readRaw = (p) => readFileSync(`${ROOT}/${p}`, 'utf8');
const sh = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);

const EXT_CSS = ['extension/styles/dashboard.css', 'extension/styles/side-panel.css'];
// Injected into youtube.com, where our :root tokens are NOT defined — these
// files carry literal brand hex by design (see the note in tour-theme.css) and
// are audited against the ramps as literals, not asked to use var().
const ON_YOUTUBE = ['extension/src/tour-theme.css'];
// Satori resolves no custom properties either, so the OG route is held to the
// same standard: literal values, but they must be ON a ramp.
const LITERAL_ONLY = ['webapp/app/api/og/route.tsx'];
const WEBAPP_CSS = sh(`find webapp/app -name '*.css' -not -name 'design-tokens.css'`);
const WEBAPP_TSX = sh(`find webapp/app -name '*.tsx' -not -path '*/node_modules/*'`);
// Satori (the OG image renderer) resolves no CSS custom properties, so that one
// route legitimately carries literal brand hex values.
const SATORI = 'webapp/app/api/og/route.tsx';
const SURFACES = [...EXT_CSS, ...WEBAPP_CSS, ...WEBAPP_TSX].filter((f) => f !== SATORI);
// The literal-hex surfaces are checked separately: every value must still be ON
// one of the ramps, it just may not be a var().
const RAMP_LITERALS = new Set(['#f9fafb','#f3f4f6','#e5e7eb','#d1d5db','#9ca3af','#6b7280',
  '#4b5563','#374151','#1f2937','#111827','#030712','#f0fdfa','#ccfbf1','#99f6e4','#5eead4',
  '#2dd4bf','#14b8a6','#0d9488','#0f766e','#115e59','#134e4a','#042f2e','#8b5cf6','#7c3aed',
  '#dc2626','#15803d','#b45309','#4ade80','#f87171','#fbbf24']);

// ── colour helpers ───────────────────────────────────────────────────────────
function hexToRgb(h) {
  let s = h.replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
function contrast(a, b) {
  const [l1, l2] = [lum(hexToRgb(a)), lum(hexToRgb(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
function hueSat(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s, l };
}

// Colours that are legitimately literal: pure white/black (a white label on a
// teal button is correct, not a token), and other companies' brand marks.
const ALWAYS_OK = new Set(['#fff', '#ffffff', '#000', '#000000']);
const THIRD_PARTY_BRAND = new Set([
  '#4285f4', '#ea4335', '#fbbc05', '#34a853', // Google sign-in mark
  '#ff0000',                                   // YouTube red
]);

// ── R1: one gray neutral ramp, no stray brand hex ────────────────────────────
// A hex is a violation when it is a NEUTRAL (low saturation) or sits in the
// teal/violet brand hue bands — those must come from a token. Unrelated hues
// (tag chips, illustrative category colours) are reported, not failed.
function auditRamps() {
  const strays = new Map();
  const otherHues = new Map();
  for (const f of SURFACES) {
    const src = read(f);
    for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
      const hex = m[0].toLowerCase();
      if (ALWAYS_OK.has(hex) || THIRD_PARTY_BRAND.has(hex)) continue;
      const { h, s } = hueSat(hex);
      const isNeutral = s < 0.18;
      const isTeal = h >= 150 && h <= 195 && s >= 0.18;
      const isViolet = h >= 250 && h <= 285 && s >= 0.18;
      const bucket = isNeutral || isTeal || isViolet ? strays : otherHues;
      if (!bucket.has(hex)) bucket.set(hex, new Set());
      bucket.get(hex).add(f);
    }
  }
  if (strays.size) {
    fail('R1', `${strays.size} stray neutral/brand hex value(s) not drawn from a token:`);
    for (const [hex, files] of [...strays].sort()) note(`${hex} — ${[...files].join(', ')}`);
  }
  // Literal-hex surfaces: values must still come from a ramp.
  for (const f of [...ON_YOUTUBE, ...LITERAL_ONLY]) {
    for (const m of read(f).matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
      const hex = m[0].toLowerCase();
      if (ALWAYS_OK.has(hex) || THIRD_PARTY_BRAND.has(hex) || RAMP_LITERALS.has(hex)) continue;
      fail('R1', `${f}: ${hex} is not a value on any ClipMark ramp`);
    }
    if (ON_YOUTUBE.includes(f) && /var\(--/.test(read(f))) fail('R1', `${f} uses var() but is injected into youtube.com, where our tokens are undefined`);
  }
  if (otherHues.size) {
    note(`R1 note: ${otherHues.size} non-ramp hue(s) left literal (tag/category chips): ${[...otherHues.keys()].sort().join(' ')}`);
  }
}

// ── R0: every stylesheet still PARSES, and no declaration is malformed ───────
// A find/replace over CSS can silently produce syntactically-valid-looking but
// broken output: truncating inside linear-gradient(...) once left
// `background: var(--accent-strong) 100%);`, which browsers drop entirely, so a
// filled button rendered transparent and put white text on a white page. Every
// other rule here reads intent; this one reads validity.
async function auditSyntax() {
  // postcss is a webapp dependency, not a root one, so resolve it from there.
  let postcss;
  for (const spec of ['postcss', `${ROOT}webapp/node_modules/postcss/lib/postcss.mjs`]) {
    try { ({ default: postcss } = await import(spec)); break; } catch { /* try next */ }
  }
  if (!postcss) {
    fail('R0', 'postcss could not be resolved — the CSS syntax gate did not run');
    return;
  }
  for (const f of [...EXT_CSS, ...ON_YOUTUBE, ...WEBAPP_CSS, 'packages/design-system/tokens.css']) {
    const src = readRaw(f);
    let root;
    try {
      root = postcss.parse(src, { from: f });
    } catch (err) {
      fail('R0', `${f} does not parse: ${err.reason ?? err.message}`);
      continue;
    }
    root.walkDecls((decl) => {
      const v = decl.value;
      // Unbalanced parens in a declaration value, in either direction.
      const open = (v.match(/\(/g) ?? []).length;
      const close = (v.match(/\)/g) ?? []).length;
      if (open !== close) {
        fail('R0', `${f}:${decl.source?.start?.line} "${decl.prop}: ${v}" has unbalanced parentheses`);
        return;
      }
      // A bare percentage or length trailing a complete var()/colour is the
      // fingerprint of a truncated gradient.
      if (/^\s*var\([^)]*\)\s+[\d.]+%\s*$/.test(v) ||
          /^\s*#[0-9a-fA-F]{3,8}\s+[\d.]+%\s*$/.test(v)) {
        fail('R0', `${f}:${decl.source?.start?.line} "${decl.prop}: ${v}" looks like a truncated gradient`);
      }
    });
  }
}

// ── R2: filled CTAs are AA ───────────────────────────────────────────────────
function auditContrast() {
  // The one filled-CTA recipe, asserted numerically rather than trusted.
  const tokens = read('packages/design-system/tokens.css');
  const strong = tokens.match(/--teal-700:\s*(#[0-9a-fA-F]{6})/)?.[1];
  if (!strong) return fail('R2', '--teal-700 is not defined in packages/design-system/tokens.css');
  const ratio = contrast('#ffffff', strong);
  if (ratio < 4.5) fail('R2', `white on --accent-strong (${strong}) is ${ratio.toFixed(2)}:1 — below AA 4.5:1`);
  else note(`R2: white on --accent-strong ${strong} = ${ratio.toFixed(2)}:1 (AA pass)`);

  // No rule block may put white text on the bright brand teal, or on a teal
  // gradient (which always passes through teal-500 somewhere).
  const white = /color:\s*(?:#fff(?:fff)?|white)\s*(?:!important)?\s*;/i;
  for (const f of [...EXT_CSS, ...WEBAPP_CSS]) {
    for (const block of read(f).split(/(?<=\})/)) {
      if (!white.test(block)) continue;
      const bg = block.match(/background(?:-color)?:\s*([^;]+);/i)?.[1] ?? '';
      if (/var\(--accent\)/.test(bg) || /linear-gradient\([^)]*var\(--accent\)/.test(bg)) {
        const sel = block.trim().split('{')[0].trim().replace(/\s+/g, ' ').slice(0, 70);
        fail('R2', `${f}: "${sel}" puts white text on bright teal — use var(--accent-strong)`);
      }
    }
  }
  // The on-YouTube overlays inject their CSS from JS template literals, so they
  // are invisible to the CSS-file scan above and to the rendered specs (which
  // drive extension pages, not youtube.com). Check the literal pairs here.
  const ON_YT_JS = sh(`find extension/src/content extension/src/popup -name '*.js'`);
  const HEX_LUM = (hex) => {
    const [r, g, b] = hexToRgb(hex);
    return lum([r, g, b]);
  };
  for (const f of [...ON_YT_JS, ...ON_YOUTUBE]) {
    const src = read(f);
    // `background: #xxxxxx;` … `color: #yyy;` inside one declaration block.
    // `color:` must not match the tail of `border-color:` / `outline-color:` —
    // that read a border hex as the foreground and reported 1.00:1 against its
    // own background.
    for (const m of src.matchAll(/background(?:-color)?:\s*(#[0-9a-fA-F]{3,6})\s*;[^}]{0,400}?(?:^|[;{\s])color:\s*(#[0-9a-fA-F]{3,6}|white)\s*;/gm)) {
      const bg = m[1].toLowerCase();
      const fg = m[2].toLowerCase() === 'white' ? '#ffffff' : m[2].toLowerCase();
      const l = [HEX_LUM(bg), HEX_LUM(fg)].sort((a, b) => b - a);
      const r = (l[0] + 0.05) / (l[1] + 0.05);
      if (r < 4.5) {
        fail('R2', `${f}: ${fg} on ${bg} is ${r.toFixed(2)}:1 — below AA (injected on-YouTube style)`);
      }
    }
  }

  // Same check for React inline styles.
  for (const f of WEBAPP_TSX) {
    const src = read(f);
    for (const m of src.matchAll(/style=\{\{([^}]*)\}\}/g)) {
      const s = m[1];
      if (/var\(--accent\)/.test(s) && /(?:color:\s*['"](?:#fff(?:fff)?|white)['"])/i.test(s) &&
          /background/i.test(s)) {
        fail('R2', `${f}: inline style puts white text on bright teal — use var(--accent-strong)`);
      }
    }
  }
}

// ── R3: the 11px floor ───────────────────────────────────────────────────────
function auditTypeFloor() {
  const hits = [];
  for (const f of [...EXT_CSS, ...WEBAPP_CSS]) {
    read(f).split('\n').forEach((line, i) => {
      const m = line.match(/font-size:\s*(\d+(?:\.\d+)?)px/i);
      if (m && parseFloat(m[1]) < 11) hits.push(`${f}:${i + 1} → ${m[1]}px`);
    });
  }
  for (const f of [...WEBAPP_TSX, 'extension/src/pages/dashboard.html', 'extension/src/pages/side-panel.html']) {
    if (!existsSync(`${ROOT}/${f}`)) continue;
    read(f).split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/font-?[sS]ize:\s*['"]?(\d+(?:\.\d+)?)(?:px)?['"]?/g)) {
        if (parseFloat(m[1]) < 11) hits.push(`${f}:${i + 1} → ${m[1]}px`);
      }
    });
  }
  // JS-generated markup on the extension surfaces.
  for (const f of sh(`find extension/src -name '*.js'`)) {
    read(f).split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/font-?[sS]ize:\s*['"]?(\d+(?:\.\d+)?)(?:px)?['"]?/g)) {
        if (parseFloat(m[1]) < 11) hits.push(`${f}:${i + 1} → ${m[1]}px`);
      }
    });
  }
  if (hits.length) {
    fail('R3', `${hits.length} rule(s) below the 11px floor:`);
    hits.forEach(note);
  }
}

// ── R4: the wordmark ─────────────────────────────────────────────────────────
function auditWordmark() {
  // Casing, in user-facing copy. Token/CSS comments and identifiers are exempt.
  const bad = [];
  for (const f of [...WEBAPP_TSX, 'extension/src/pages/dashboard.html', 'extension/src/pages/side-panel.html',
                   ...sh(`find extension/src -name '*.js'`)]) {
    if (!existsSync(`${ROOT}/${f}`)) continue;
    read(f).split('\n').forEach((line, i) => {
      if (/\bClipmark\b|\bclipMark\b/.test(line)) bad.push(`${f}:${i + 1}`);
    });
  }
  if (bad.length) {
    fail('R4', `${bad.length} occurrence(s) of the wordmark mis-cased (must be "ClipMark"):`);
    bad.slice(0, 25).forEach(note);
    if (bad.length > 25) note(`… and ${bad.length - 25} more`);
  }

  // The wordmark must never be gradient-clipped.
  const WORDMARK_SEL = /\.(page-title|sp-logo-text|footer-logo|nav-logo|wordmark|logo-text)\b/;
  for (const f of [...EXT_CSS, ...WEBAPP_CSS]) {
    for (const block of read(f).split(/(?<=\})/)) {
      const sel = block.split('{')[0] ?? '';
      if (WORDMARK_SEL.test(sel) && /background-clip:\s*text|text-fill-color/.test(block)) {
        fail('R4', `${f}: "${sel.trim().replace(/\s+/g, ' ')}" renders the wordmark as gradient text`);
      }
    }
  }
}

// ── R5: gradient budget + fallbacks ──────────────────────────────────────────
function auditGradients() {
  const tokens = read('packages/design-system/tokens.css');
  const defined = [...tokens.matchAll(/--gradient-[a-z-]+:\s*(linear-gradient\([^;]+)\);/g)];
  if (defined.length > 2) fail('R5', `${defined.length} gradient tokens defined — DESIGN.md allows 2`);
  else note(`R5: ${defined.length} teal gradient token(s) defined`);

  // Any surviving inline teal gradient is a third gradient in disguise.
  const inline = [];
  for (const f of [...EXT_CSS, ...WEBAPP_CSS, ...WEBAPP_TSX]) {
    read(f).split('\n').forEach((line, i) => {
      if (!/linear-gradient|radial-gradient/.test(line)) return;
      if (/var\(--gradient-/.test(line)) return;
      if (/var\(--accent|var\(--teal-|#0f766e|#14b8a6|#2dd4bf/i.test(line)) inline.push(`${f}:${i + 1}`);
    });
  }
  if (inline.length) {
    fail('R5', `${inline.length} ad-hoc teal gradient(s) outside the two tokens:`);
    inline.forEach(note);
  }

  // Every background-clip:text needs a solid colour declared BEFORE it.
  for (const f of [...EXT_CSS, ...WEBAPP_CSS, ...WEBAPP_TSX]) {
    for (const block of read(f).split(/(?<=\})/)) {
      if (!/background-clip:\s*text/.test(block)) continue;
      const clipAt = block.search(/(?:-webkit-)?background-clip:\s*text/);
      const before = block.slice(0, clipAt);
      if (!/(?:^|[;{])\s*color:\s*[^;]+;/.test(before)) {
        const sel = (block.split('{')[0] ?? '').trim().replace(/\s+/g, ' ').slice(0, 70);
        fail('R5', `${f}: "${sel}" clips a gradient to text with no solid color fallback before it`);
      }
    }
  }
}

// ── R6: no runtime CDN fonts ─────────────────────────────────────────────────
function auditFonts() {
  const hits = [];
  const scan = ['extension/src/pages/dashboard.html', 'extension/src/pages/side-panel.html',
                'webapp/app/layout.tsx', ...EXT_CSS, ...WEBAPP_CSS, ...WEBAPP_TSX];
  for (const f of scan) {
    if (!existsSync(`${ROOT}/${f}`)) continue;
    read(f).split('\n').forEach((line, i) => {
      if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(line)) hits.push(`${f}:${i + 1}`);
    });
  }
  if (hits.length) {
    fail('R6', `${hits.length} runtime Google-CDN font reference(s):`);
    hits.forEach(note);
  }
  for (const woff of ['plus-jakarta-sans-latin-var', 'inter-latin-var', 'jetbrains-mono-latin-var', 'material-symbols-outlined']) {
    if (!existsSync(`${ROOT}/extension/assets/fonts/${woff}.woff2`)) fail('R6', `extension/assets/fonts/${woff}.woff2 is missing`);
  }
  if (!existsSync(`${ROOT}/webapp/public/fonts/material-symbols-outlined.woff2`)) {
    fail('R6', 'webapp/public/fonts/material-symbols-outlined.woff2 is missing');
  }
}

// ── R7: the two extension headers share one chrome ───────────────────────────
function auditHeaderParity() {
  const dash = read('extension/styles/dashboard.css');
  const panel = read('extension/styles/side-panel.css');
  const bgOf = (src, sel) => {
    const block = src.split(/(?<=\})/).find((b) => (b.split('{')[0] ?? '').trim().endsWith(sel));
    return block?.match(/background(?:-color)?:\s*([^;]+);/i)?.[1]?.trim();
  };
  const pairs = [
    ['.page-header (dashboard)', bgOf(dash, '.page-header')],
    ['.side-panel-header (panel)', bgOf(panel, '.side-panel-header')],
  ];
  const vals = pairs.map(([, v]) => v);
  if (vals.some((v) => v !== 'var(--nav-bg)')) {
    fail('R7', 'the two extension headers do not both resolve to var(--nav-bg):');
    pairs.forEach(([k, v]) => note(`${k} → ${v ?? '(not found)'}`));
  } else note('R7: both extension headers use var(--nav-bg)');

  // And neither may re-declare a per-theme override that reintroduces a fork.
  for (const [f, src] of [['dashboard.css', dash], ['side-panel.css', panel]]) {
    for (const block of src.split(/(?<=\})/)) {
      const sel = block.split('{')[0] ?? '';
      if (/\[data-theme="dark"\][^,{]*(?:page-header|side-panel-header)\s*$/.test(sel.trim()) &&
          /background(?:-color)?:/.test(block)) {
        fail('R7', `${f}: "${sel.trim().replace(/\s+/g, ' ')}" forks the header background per theme — --nav-bg is already theme-aware`);
      }
    }
  }
}

// ── R8: no dangling var() references ─────────────────────────────────────────
function auditTokenRefs() {
  const tokenSrc = read('packages/design-system/tokens.css');
  const defined = new Set([...tokenSrc.matchAll(/^\s*(--[a-z0-9-]+):/gim)].map((m) => m[1]));
  // Variables set from JS at runtime (per-element inline custom properties).
  const RUNTIME = new Set(['--ac-color', '--gv-color', '--hm-opacity', '--tl-idx',
                           '--font-plus-jakarta', '--font-inter', '--font-jetbrains']);
  const dangling = new Map();
  for (const f of [...EXT_CSS, ...WEBAPP_CSS]) {
    const src = read(f);
    const localDefs = new Set([...src.matchAll(/^\s*(--[a-z0-9-]+):/gim)].map((m) => m[1]));
    src.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/g)) {
        const [, name, next] = m;
        if (defined.has(name) || localDefs.has(name) || RUNTIME.has(name)) continue;
        // A var() WITH a fallback still renders; without one it renders nothing.
        const key = `${name}${next === ',' ? ' (has fallback)' : ' (NO fallback)'}`;
        if (!dangling.has(key)) dangling.set(key, new Set());
        dangling.get(key).add(`${f}:${i + 1}`);
      }
    });
  }
  if (dangling.size) {
    fail('R8', `${dangling.size} var() reference(s) to undefined token(s):`);
    for (const [k, where] of dangling) note(`${k} — ${[...where].slice(0, 4).join(', ')}`);
  }
}

// ── R9: dark-mode completeness ───────────────────────────────────────────────
// Every colour-bearing token defined in :root must either be overridden in
// [data-theme="dark"] or be on an explicit allowlist. This is the rule that
// would have caught the missing --shadow-* tokens and --secondary-hover's
// 2.58:1 dark contrast statically, in milliseconds, instead of by eye.
//
// It also lints the PRE-PAINT contract: theme-loader.js must resolve the theme
// with synchronous APIs only. The version this replaced read chrome.storage
// asynchronously and so guaranteed the very flash its comment promised to
// prevent; a regression back to that shape must fail the build, not ship.
function auditDarkCompleteness() {
  const src = read('packages/design-system/tokens.css');
  const rootBlock = src.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1];
  const darkBlock = src.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1];
  if (!rootBlock) return fail('R9', 'packages/design-system/tokens.css has no :root block');
  if (!darkBlock) return fail('R9', 'packages/design-system/tokens.css has no [data-theme="dark"] block');

  const decls = (block) =>
    new Map([...block.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gim)].map((m) => [m[1], m[2].trim()]));
  const light = decls(rootBlock);
  const dark = decls(darkBlock);

  // The ramps are deliberately theme-invariant: DESIGN.md is explicit that ONE
  // gray ramp and ONE teal ramp supply both themes, and R1 enforces it. A dark
  // override on a ramp step would be the bug, not the fix.
  const RAMP = /^--(?:gray|teal)-\d+$/;
  // Values that are theme-invariant by construction or by documented decision.
  const ALLOW = new Set([
    '--accent-soft',      // the dark-surface brand ink; it IS the dark value
    '--ai', '--ai-strong', '--ai-soft', '--ai-light', // the violet ramp + its two surface steps
    '--secondary', '--secondary-light',
    '--primary-deep', '--cta', '--cta-hover',   // aliases of --accent-strong, which is a no-op in dark by design
    '--gradient-brand', '--gradient-brand-soft', // teal fills, legible on both canvases
    '--danger-light', '--success-light', '--warning-light', // alpha tints over a theme-aware surface
  ]);
  // A token is colour-bearing if its value is a colour or resolves to one.
  const isColour = (v) =>
    /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|linear-gradient|^transparent$/.test(v) ||
    /var\(--(?:gray|teal|accent|ai|bg|surface|text|border|danger|success|warning|scrim|on-primary|focus-ring|secondary)/.test(v);

  const missing = [];
  for (const [name, value] of light) {
    if (RAMP.test(name) || ALLOW.has(name)) continue;
    if (!isColour(value)) continue;                 // type scale, radii, fonts
    if (dark.has(name)) continue;
    missing.push(`${name}: ${value}`);
  }
  if (missing.length) {
    fail('R9', `${missing.length} colour token(s) have no [data-theme="dark"] override and are not allowlisted:`);
    missing.forEach(note);
  } else {
    note(`R9: all ${[...light].filter(([n, v]) => !RAMP.test(n) && !ALLOW.has(n) && isColour(v)).length} theme-sensitive colour token(s) have a dark override`);
  }

  // Dark-mode contrast: the text ramp against the surfaces it actually sits on.
  const resolve = (block, name, depth = 0) => {
    const v = block.get(name);
    if (!v || depth > 6) return null;
    if (/^#[0-9a-fA-F]{3,6}$/.test(v)) return v;
    const ref = v.match(/^var\((--[a-z0-9-]+)\)$/)?.[1];
    if (!ref) return null;
    // A dark override may point at a ramp step that only :root defines.
    return resolve(block, ref, depth + 1) ?? resolve(light, ref, depth + 1);
  };
  for (const surfaceName of ['--surface', '--surface-alt']) {
    const surface = resolve(dark, surfaceName);
    if (!surface) continue;
    for (const textName of ['--text', '--text-sub', '--text-muted']) {
      const fg = resolve(dark, textName);
      if (!fg) continue;
      const r = contrast(fg, surface);
      if (r < 4.5) {
        fail('R9', `dark ${textName} (${fg}) on ${surfaceName} (${surface}) is ${r.toFixed(2)}:1 — below AA 4.5:1`);
      }
    }
  }
  // And the theme-aware brand/AI inks, which are the tokens that exist BECAUSE
  // their light values fail on a dark canvas.
  const canvas = resolve(dark, '--bg');
  for (const inkName of ['--brand-ink', '--ai-ink', '--secondary-hover']) {
    const ink = resolve(dark, inkName);
    if (!ink || !canvas) continue;
    const r = contrast(ink, canvas);
    if (r < 4.5) fail('R9', `dark ${inkName} (${ink}) on --bg (${canvas}) is ${r.toFixed(2)}:1 — below AA 4.5:1`);
    else note(`R9: dark ${inkName} ${ink} on ${canvas} = ${r.toFixed(2)}:1 (AA pass)`);
  }

  // The pre-paint contract.
  const loader = 'extension/src/popup/theme-loader.js';
  if (!existsSync(`${ROOT}/${loader}`)) {
    fail('R9', `${loader} is missing — the extension pages have no pre-paint theme resolver`);
  } else {
    // stripComments() only drops WHOLE-LINE `//` comments, which is right for
    // the colour rules (a trailing comment can still carry a real hex). Here it
    // is wrong: a trailing `// chrome.storage.sync — …` note is prose, not a
    // pre-paint read, and reported this very file as async. Strip trailing
    // comments too, leaving `://` alone so URLs survive.
    const code = read(loader).replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (!/matchMedia\(\s*['"]\(prefers-color-scheme:\s*dark\)['"]\s*\)/.test(code)) {
      fail('R9', `${loader} does not read matchMedia('(prefers-color-scheme: dark)') — the system theme is not the source of truth`);
    }
    // The code that actually RUNS at load must not await or read
    // chrome.storage, both of which land after first paint. Slicing the file at
    // init() is not good enough: a helper defined earlier that merely MENTIONS
    // chrome.storage is not a pre-paint read, and reported one falsely. Strip
    // every function body so only the top-level statements remain.
    const stripFunctionBodies = (src) => {
      let out = '';
      for (let i = 0; i < src.length; ) {
        const head = /^(?:function\b[^{;]*|\([^()]*\)\s*=>\s*)\{/.exec(src.slice(i));
        if (head) {
          let depth = 0;
          let j = i + head[0].length - 1;
          for (; j < src.length; j++) {
            if (src[j] === '{') depth++;
            else if (src[j] === '}' && --depth === 0) { j++; break; }
          }
          i = j;
          continue;
        }
        out += src[i++];
      }
      return out;
    };
    // The file is one big IIFE, so step inside it first — otherwise the stripper
    // eats the whole program and every check below trivially "passes".
    const iife = code.slice(code.indexOf('{') + 1);
    const atLoad = stripFunctionBodies(iife);
    if (/\bawait\b|chrome\.storage/.test(atLoad)) {
      fail('R9', `${loader} reads an async API before first paint — that is the flash the file exists to prevent`);
    }
    // The resolver must stamp the attribute at load, not only from init().
    if (!/^[\s\S]*\bapply\(\)\s*;/.test(atLoad)) {
      fail('R9', `${loader} never calls apply() at load — data-theme would not be set before the first paint`);
    }
    // …and it needs a synchronous mirror of the override, or a stored
    // light/dark pick flashes the system theme first. (Checked against the whole
    // file: the read itself lives in a helper.)
    if (!/localStorage/.test(code)) {
      fail('R9', `${loader} has no synchronous override cache — a stored light/dark pick would flash the system theme first`);
    }
  }
  // Both page HTMLs must load it as a CLASSIC script before their stylesheet.
  for (const page of ['extension/src/pages/side-panel.html', 'extension/src/pages/dashboard.html']) {
    const html = read(page);
    const script = html.search(/<script[^>]*theme-loader\.js/);
    const sheet = html.search(/<link[^>]*rel=["']stylesheet["']/);
    if (script < 0) {
      fail('R9', `${page} does not load popup/theme-loader.js — it would paint light regardless of the system theme`);
      continue;
    }
    if (/<script[^>]*type=["']module["'][^>]*theme-loader\.js/.test(html)) {
      fail('R9', `${page} loads theme-loader.js as a module — modules are deferred and paint the light theme first`);
    }
    if (sheet >= 0 && script > sheet) {
      fail('R9', `${page} loads theme-loader.js AFTER its stylesheet — it must run first`);
    }
    // A static data-theme on <html> defeats the resolver. (data-theme-follow,
    // which opts the panel into the "either-is-dark" rule, is a different
    // attribute and is expected.)
    if (/<html[^>]*\bdata-theme=/.test(html)) {
      fail('R9', `${page} hardcodes data-theme on <html> — ship it bare and let the resolver stamp it`);
    }
  }
}

// ── the packaged artifact ────────────────────────────────────────────────────
const vendorHexes = new Set();
function auditDist() {
  const dist = `${ROOT}/extension/dist`;
  if (!existsSync(dist)) return fail('DIST', 'extension/dist does not exist — run `make ext-build` first');
  const walk = (d) => readdirSync(d).flatMap((e) => {
    const p = `${d}/${e}`;
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const files = walk(dist);
  const css = files.filter((f) => f.endsWith('.css'));
  const html = files.filter((f) => f.endsWith('.html'));

  for (const f of [...css, ...html]) {
    const src = stripComments(readFileSync(f, 'utf8'));
    const rel = f.slice(dist.length + 1);
    if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(src)) fail('DIST', `${rel} still references a Google font CDN`);
    for (const m of src.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/gi)) {
      if (parseFloat(m[1]) < 11) fail('DIST', `${rel} ships font-size:${m[1]}px`);
    }
    for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      const hex = m[0].toLowerCase();
      if (ALWAYS_OK.has(hex) || THIRD_PARTY_BRAND.has(hex) || RAMP_LITERALS.has(hex)) continue;
      const { h, s } = hueSat(hex);
      // The token block and the two gradient tokens are bundled into this file,
      // so a hex sitting on the right-hand side of a custom property is the
      // definition, not a stray. The build minifies, so there is no whitespace
      // to anchor on — match the property name directly.
      const decl = src.slice(Math.max(0, m.index - 48), m.index);
      if (/--[a-z0-9-]+:\s*(?:linear-gradient\([^;]*)?$/.test(decl)) continue;
      // Third-party CSS bundled verbatim (driver.js's tour popover) is not ours
      // to re-colour value-by-value; tour-theme.css overrides what it paints.
      // Flag it only if no ClipMark override exists for that selector.
      const ctx = src.slice(Math.max(0, m.index - 220), m.index);
      if (/\.driver-|\.crx-/.test(ctx) && !/clipmark/.test(ctx)) {
        vendorHexes.add(`${hex} (${(ctx.match(/\.driver-popover[a-z-]*/g) ?? ['vendor']).slice(-1)[0]})`);
        continue;
      }
      if (s < 0.18 || (h >= 150 && h <= 195) || (h >= 250 && h <= 285)) {
        fail('DIST', `${rel} ships stray ramp hex ${hex}`);
      }
    }
  }
  // The self-hosted faces must actually be in the package.
  const woff = files.filter((f) => f.endsWith('.woff2'));
  if (woff.length < 4) fail('DIST', `only ${woff.length} woff2 file(s) in the package — expected 4 self-hosted faces`);
  else note(`DIST: ${woff.length} self-hosted woff2 face(s) packaged`);
  // And the CSS must point at them.
  const anyFontUrl = css.some((f) => /url\([^)]*\.woff2/.test(readFileSync(f, 'utf8')));
  if (!anyFontUrl) fail('DIST', 'no packaged stylesheet references a .woff2 file — @font-face urls did not survive the build');
  if (vendorHexes.size) {
    note(`DIST note: ${vendorHexes.size} third-party (driver.js) default(s) still in the bundle, overridden by tour-theme.css: ${[...vendorHexes].sort().join(', ')}`);
  }
  // Every stylesheet the package actually serves must resolve its own imports.
  for (const f of css) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/@import\s+(?:url\()?['"]?\.\/([^'")]+)/g)) {
      if (!existsSync(`${f.slice(0, f.lastIndexOf('/'))}/${m[1]}`)) {
        fail('DIST', `${f.slice(dist.length + 1)} @imports ./${m[1]}, which is not in the package`);
      }
    }
  }
}

// ── run ──────────────────────────────────────────────────────────────────────
await auditSyntax();
auditRamps();
auditContrast();
auditTypeFloor();
auditWordmark();
auditGradients();
auditFonts();
auditHeaderParity();
auditTokenRefs();
auditDarkCompleteness();
if (AUDIT_DIST) auditDist();

const RULES = ['R0 CSS parses', 'R1 one gray ramp', 'R2 AA filled CTAs', 'R3 11px floor', 'R4 wordmark',
               'R5 gradient budget', 'R6 self-hosted fonts', 'R7 header parity', 'R8 token refs',
               'R9 dark completeness'];
if (AUDIT_DIST) RULES.push('DIST packaged artifact');

console.log('\n── DESIGN.md conformance ' + '─'.repeat(48));
for (const rule of RULES) {
  const id = rule.split(' ')[0];
  const hits = failures.filter((f) => f.startsWith(`[${id}]`));
  console.log(`  ${hits.length ? '✗ FAIL' : '✓ PASS'}  ${rule}${hits.length ? ` (${hits.length})` : ''}`);
}
if (failures.length) {
  console.log('\n── details ' + '─'.repeat(61));
  for (const f of failures) console.log('  ' + f);
}
if (notes.length) {
  console.log('\n── notes ' + '─'.repeat(63));
  for (const n of notes) console.log(n.trimEnd());
}
console.log('');
process.exit(failures.length ? 1 : 0);
