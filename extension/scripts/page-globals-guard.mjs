/**
 * Build guard: extension PAGE bundles must not read content-script globals.
 *
 * Sibling of ./content-globals-guard.mjs, guarding the opposite direction of
 * the same twin-file trap described in CLAUDE.md.
 *
 * The content-script helpers (constants.js, recall.js, loop.js, usage-caps.js,
 * local-ai.js, …) are classic scripts that publish their names onto
 * `globalThis`, and the manifest injects them into youtube.com ONLY. Extension
 * pages — the dashboard and the side panel — are separate documents with their
 * own ESM module graph; nothing in that graph ever runs those files, so every
 * one of those names is undefined there.
 *
 * The content-globals guard checks that content.js's globals still exist. It
 * cannot see this failure, because the offending reference is in a page chunk
 * and the name IS assigned — just in a chunk the page never loads. That gap
 * shipped: `dashboard.js` read a bare `TITLE_TRUNCATE_LENGTH` (defined only in
 * constants.js), so the Reminders "create" form threw a ReferenceError for any
 * user with at least one titled bookmark. Source-loaded dev and the E2E suite
 * never saw it — on youtube.com the content script has already defined the name
 * globally.
 *
 * The forbidden list is DERIVED from the manifest's own content_scripts rather
 * than hand-maintained, so a new content-script helper is covered the day it is
 * added.
 *
 * Pure logic (unit-tested); the vite plugin only reads files and surfaces
 * errors. Deliberately dependency-free — tests/unit runs without the
 * extension's node_modules installed.
 */

/**
 * Names a classic content-script helper publishes via `globalThis.X = …`.
 *
 * @param {string[]} sources - contents of the manifest's content_scripts files
 * @returns {string[]} sorted, de-duplicated global names
 */
export function collectContentScriptGlobals(sources) {
  const names = new Set();
  for (const src of sources) {
    for (const m of stripLiterals(src).matchAll(/globalThis\.([A-Za-z_$][\w$]*)\s*=/g)) {
      names.add(m[1]);
    }
  }
  return [...names].sort();
}

// Keywords after which a `/` opens a regex literal rather than dividing. They
// end in identifier characters, so the "previous token" test below would
// otherwise read `return /x/` as division.
const REGEX_PRECEDING_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'do', 'else', 'case', 'yield', 'await',
]);

/**
 * Blanks out comments, strings, template text and regex literals, so a name
 * that merely appears in prose or in a message string isn't mistaken for a
 * reference. Blanks in place (space-for-character, newlines kept) so offsets
 * and line numbers survive.
 *
 * This is a real scanner rather than a regex because both halves matter:
 *
 *   - `${…}` interpolations inside a template literal are CODE and must be
 *     kept. The reference that shipped the dashboard ReferenceError lived in
 *     exactly that position (`` `…${t.substring(0, TITLE_TRUNCATE_LENGTH)}…` ``),
 *     so blanking whole templates would have missed the very bug this guards.
 *   - regex literals must be recognised, because minified bundles are full of
 *     things like `.replace(/"/g, "&quot;")` whose quote characters would
 *     otherwise desync a naive string scanner for the rest of the file.
 *
 * @param {string} source
 * @returns {string}
 */
export function stripLiterals(source) {
  const out = source.split('');
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' ';
  };

  // Frames track template-literal nesting: `tpl` = inside template text,
  // `code` = inside a ${…} interpolation (with its own brace depth).
  const frames = [{ kind: 'code', depth: 0 }];
  let i = 0;
  let lastSignificant = ''; // last non-whitespace CODE character seen

  const precededByRegexContext = () => {
    if (!lastSignificant) return true;
    if (/[)\]]/.test(lastSignificant)) return false;
    if (!/[\w$]/.test(lastSignificant)) return true;
    // Identifier-ish: a regex only follows if that identifier is a keyword.
    const before = source.slice(Math.max(0, i - 12), i);
    const word = (before.match(/([A-Za-z$_][\w$]*)\s*$/) || [])[1];
    return word ? REGEX_PRECEDING_KEYWORDS.has(word) : false;
  };

  while (i < source.length) {
    const frame = frames[frames.length - 1];
    const c = source[i];

    if (frame.kind === 'tpl') {
      if (c === '\\') { blank(i, i + 2); i += 2; continue; }
      if (c === '`') { blank(i, i + 1); frames.pop(); lastSignificant = '`'; i += 1; continue; }
      if (c === '$' && source[i + 1] === '{') {
        blank(i, i + 2);
        frames.push({ kind: 'code', depth: 0 });
        lastSignificant = '';
        i += 2;
        continue;
      }
      blank(i, i + 1);
      i += 1;
      continue;
    }

    // ── code ──
    if (c === '/' && source[i + 1] === '/') {
      let j = i;
      while (j < source.length && source[j] !== '\n') j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const j = end === -1 ? source.length : end + 2;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== c) {
        if (source[j] === '\\') j++;
        j++;
      }
      blank(i, j + 1);
      lastSignificant = c;
      i = j + 1;
      continue;
    }
    if (c === '`') {
      blank(i, i + 1);
      frames.push({ kind: 'tpl' });
      i += 1;
      continue;
    }
    if (c === '/' && precededByRegexContext()) {
      let j = i + 1;
      let inClass = false;
      while (j < source.length) {
        const d = source[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
        else if (d === '\n') break; // unterminated — treat as division after all
        j++;
      }
      if (source[j] === '/') {
        while (j + 1 < source.length && /[a-z]/.test(source[j + 1])) j++; // flags
        blank(i, j + 1);
        lastSignificant = '/';
        i = j + 1;
        continue;
      }
    }
    if (c === '{') frame.depth += 1;
    if (c === '}') {
      if (frame.depth === 0 && frames.length > 1) {
        blank(i, i + 1);
        frames.pop(); // back into the enclosing template's text
        i += 1;
        continue;
      }
      frame.depth -= 1;
    }
    if (!/\s/.test(c)) lastSignificant = c;
    i += 1;
  }

  return out.join('');
}

/**
 * Every identifier appearing inside an `import { … }` / `export { … }` clause.
 *
 * Both positions of `import { localSummarizeSnippet as x }` count: the left one
 * names a real module binding this chunk resolves at load time, so it is not a
 * global read. Collected separately from `declaresName` because a bare
 * `\bas\s+NAME\b` test only ever sees the alias side.
 *
 * @param {string} stripped - literal-stripped source
 * @returns {Set<string>}
 */
export function moduleClauseBindings(stripped) {
  const names = new Set();
  for (const m of stripped.matchAll(/\b(?:import|export)\s*\{([^}]*)\}/g)) {
    for (const id of m[1].matchAll(/[A-Za-z_$][\w$]*/g)) {
      if (id[0] !== 'as') names.add(id[0]);
    }
  }
  return names;
}

/**
 * True when `name` is bound in the given (already literal-stripped) chunk:
 * declared, imported/exported by name, or assigned onto globalThis by the
 * chunk itself.
 *
 * Scoped per chunk on purpose — these are ES modules, so a binding in one
 * chunk does nothing for a bare read in another.
 *
 * @param {string} stripped
 * @param {string} name
 * @returns {boolean}
 */
export function declaresName(stripped, name) {
  const n = escapeRe(name);
  return (
    new RegExp(`\\b(?:const|let|var|function|class)\\s+${n}\\b`).test(stripped) ||
    new RegExp(`\\bas\\s+${n}\\b`).test(stripped) ||
    new RegExp(`globalThis\\.${n}\\s*=`).test(stripped) ||
    moduleClauseBindings(stripped).has(name)
  );
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds every content-script global referenced by a page bundle.
 *
 * A "reference" is the bare name not preceded by `.` (so `obj.parseTags` and
 * `?.parseTags` are property access, not a global read) and not bound anywhere
 * in that page's own chunk graph.
 *
 * Because the shipped page bundles are minified, a correctly imported binding
 * is mangled to a short alias and cannot match — so a surviving occurrence of a
 * long, unmangled name is close to proof of an undeclared global read. The
 * `declaresName` escape hatch keeps the guard correct for unminified builds too.
 *
 * @param {{ page: string, chunks: { file: string, source: string }[] }[]} pages
 * @param {string[]} forbidden - names from collectContentScriptGlobals
 * @param {string[]} [allow] - names to exempt (documented false positives)
 * @returns {{ page: string, file: string, name: string }[]}
 */
export function findContentGlobalLeaks(pages, forbidden, allow = []) {
  const exempt = new Set(allow);
  const leaks = [];

  for (const { page, chunks } of pages) {
    for (const { file, source } of chunks) {
      const code = stripLiterals(source);
      for (const name of forbidden) {
        if (exempt.has(name)) continue;
        // Per chunk, not per page: these are ES modules, so a binding in a
        // sibling chunk does nothing for a bare read here.
        if (declaresName(code, name)) continue;
        if (new RegExp(`(?<![\\w$.])${escapeRe(name)}(?![\\w$])`).test(code)) {
          leaks.push({ page, file, name });
        }
      }
    }
  }
  return leaks;
}

/**
 * @param {{ page: string, chunks: { file: string, source: string }[] }[]} pages
 * @param {string[]} forbidden
 * @param {string[]} [allow]
 * @returns {true}
 * @throws when a page bundle reads a content-script-only global
 */
export function assertNoContentGlobalLeaks(pages, forbidden, allow = []) {
  const leaks = findContentGlobalLeaks(pages, forbidden, allow);
  if (leaks.length) {
    const lines = leaks.map((l) => `  ${l.page} → ${l.file} reads bare global "${l.name}"`);
    throw new Error(
      `Extension page bundle(s) reference content-script-only globals:\n${lines.join('\n')}\n` +
        'Those names are published by classic content scripts the manifest injects into ' +
        'youtube.com only — they are undefined on an extension page and will throw a ' +
        'ReferenceError at runtime. Import the value from the ESM twin ' +
        '(e.g. constants.module.js) instead of reading it as a global.',
    );
  }
  return true;
}
