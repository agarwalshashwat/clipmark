/**
 * Page-globals build guard — pure logic (see extension/scripts/page-globals-guard.mjs).
 *
 * The guard exists because a page bundle reading a content-script-only global
 * shipped to the Chrome Web Store: dashboard.js used a bare
 * `TITLE_TRUNCATE_LENGTH`, defined only in constants.js, which the manifest
 * injects into youtube.com and nowhere else — so the Reminders create form
 * threw a ReferenceError on the dashboard page.
 *
 * The cases below are shaped like real minified bundle output, because that is
 * what the guard actually reads.
 *
 * Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  collectContentScriptGlobals,
  stripLiterals,
  declaresName,
  moduleClauseBindings,
  findContentGlobalLeaks,
  assertNoContentGlobalLeaks,
} from '../../extension/scripts/page-globals-guard.mjs';

const page = (source) => [{ page: 'p.html', chunks: [{ file: 'c.js', source }] }];

describe('collectContentScriptGlobals', () => {
  it('picks up every globalThis registration', () => {
    const names = collectContentScriptGlobals([
      'const A = 1;\nif (typeof globalThis !== "undefined") { globalThis.A = A; globalThis.b = b; }',
      'globalThis.C=C;',
    ]);
    assert.deepEqual(names, ['A', 'C', 'b']);
  });

  it('ignores registrations that only appear inside comments or strings', () => {
    const names = collectContentScriptGlobals([
      '// globalThis.NOPE = 1;\nconst s = "globalThis.ALSO_NOPE =";\nglobalThis.REAL = 1;',
    ]);
    assert.deepEqual(names, ['REAL']);
  });

  it('de-duplicates across files', () => {
    assert.deepEqual(collectContentScriptGlobals(['globalThis.X=1', 'globalThis.X=2']), ['X']);
  });
});

describe('stripLiterals', () => {
  it('keeps ${…} interpolations, which are code', () => {
    // The exact shape of the shipped bug: the bare global sat inside a template
    // interpolation. Blanking whole templates would miss it.
    const out = stripLiterals('const h = `<option>${t.substring(0, TITLE_TRUNCATE_LENGTH)}</option>`;');
    assert.match(out, /TITLE_TRUNCATE_LENGTH/);
    assert.doesNotMatch(out, /option/);
  });

  it('blanks strings, and a name mentioned only in one is not a reference', () => {
    const out = stripLiterals('const msg = "TITLE_TRUNCATE_LENGTH is nice";');
    assert.doesNotMatch(out, /TITLE_TRUNCATE_LENGTH/);
  });

  it('blanks line and block comments', () => {
    assert.doesNotMatch(stripLiterals('// see parseTags\nx=1;'), /parseTags/);
    assert.doesNotMatch(stripLiterals('/* parseTags */ x=1;'), /parseTags/);
  });

  it('preserves length and newlines so offsets survive', () => {
    const src = 'a="one";\nb=`two`;\n// three\n';
    const out = stripLiterals(src);
    assert.equal(out.length, src.length);
    assert.equal(out.split('\n').length, src.split('\n').length);
  });

  it('handles a regex literal containing quote characters without desyncing', () => {
    // Minified bundles are full of these; a naive string scanner treats the
    // quote inside /"/ as opening a string and blanks the rest of the file.
    const src = 'x.replace(/"/g, "&quot;"); y = parseTags(z);';
    const out = stripLiterals(src);
    assert.match(out, /parseTags/, 'code after the regex must survive');
    assert.doesNotMatch(out, /quot/);
  });

  it('treats a regex after `return` as a regex, not division', () => {
    const out = stripLiterals('function f(){return /getTagColor/.test(s)} g=getTagColor;');
    // The name inside the regex is blanked; the real reference after it is not.
    assert.equal((out.match(/getTagColor/g) || []).length, 1);
  });

  it('treats a slash after an identifier or ) as division', () => {
    const out = stripLiterals('const r = total/count; const q = (a+b)/2; z = parseTags;');
    assert.match(out, /parseTags/);
  });

  it('handles nested templates and braces', () => {
    const out = stripLiterals('const s = `a${ b ? `x${ parseTags(c) }y` : "q" }z`;');
    assert.match(out, /parseTags/);
    assert.doesNotMatch(out, /q/);
  });
});

describe('moduleClauseBindings / declaresName', () => {
  it('reads both sides of an import specifier', () => {
    const b = moduleClauseBindings('import{localAiAvailability as ze,localGeneratePost as kt}from"./x.js";');
    assert.ok(b.has('localAiAvailability'));
    assert.ok(b.has('ze'));
    assert.ok(!b.has('as'));
  });

  it('counts a properly imported name as bound', () => {
    assert.ok(declaresName(stripLiterals('import{parseTags as p}from"./c.js";p(x)'), 'parseTags'));
  });

  it('counts declarations and globalThis assignment as bound', () => {
    assert.ok(declaresName('const parseTags = 1;', 'parseTags'));
    assert.ok(declaresName('function parseTags(){}', 'parseTags'));
    assert.ok(declaresName('globalThis.parseTags = x;', 'parseTags'));
  });

  it('does not count an unrelated property of the same name', () => {
    assert.ok(!declaresName('o.parseTags = 1;', 'parseTags'));
  });
});

describe('findContentGlobalLeaks', () => {
  const forbidden = ['TITLE_TRUNCATE_LENGTH', 'parseTags', 'localSummarizeSnippet'];

  it('flags a bare read of a content-script-only global', () => {
    const leaks = findContentGlobalLeaks(page('const o=`${t.substring(0,TITLE_TRUNCATE_LENGTH)}`;'), forbidden);
    assert.deepEqual(leaks.map(l => l.name), ['TITLE_TRUNCATE_LENGTH']);
  });

  it('flags a bare call, which is how the side panel read localSummarizeSnippet', () => {
    const leaks = findContentGlobalLeaks(page('const s=await localSummarizeSnippet(k);'), forbidden);
    assert.deepEqual(leaks.map(l => l.name), ['localSummarizeSnippet']);
  });

  it('passes when the name is imported from the ESM twin', () => {
    const src = 'import{TITLE_TRUNCATE_LENGTH as ct}from"./constants.module.js";const o=t.substring(0,ct);';
    assert.deepEqual(findContentGlobalLeaks(page(src), forbidden), []);
  });

  it('passes for property access of the same name', () => {
    assert.deepEqual(findContentGlobalLeaks(page('cfg.parseTags(); o?.parseTags;'), forbidden), []);
  });

  it('passes when the name only appears in a string or comment', () => {
    assert.deepEqual(
      findContentGlobalLeaks(page('// parseTags does the thing\nconst m="parseTags";'), forbidden),
      [],
    );
  });

  it('is per chunk — a binding in a sibling chunk does not excuse a bare read', () => {
    const pages = [{
      page: 'p.html',
      chunks: [
        { file: 'a.js', source: 'import{parseTags}from"./c.js";parseTags(1);' },
        { file: 'b.js', source: 'parseTags(2);' },
      ],
    }];
    const leaks = findContentGlobalLeaks(pages, forbidden);
    assert.deepEqual(leaks.map(l => l.file), ['b.js']);
  });

  it('honours the allow-list escape hatch', () => {
    const src = 'parseTags(1);';
    assert.equal(findContentGlobalLeaks(page(src), forbidden).length, 1);
    assert.deepEqual(findContentGlobalLeaks(page(src), forbidden, ['parseTags']), []);
  });
});

describe('assertNoContentGlobalLeaks', () => {
  it('returns true for a clean page', () => {
    assert.equal(assertNoContentGlobalLeaks(page('const x=1;'), ['parseTags']), true);
  });

  it('throws naming the page, the chunk and the global', () => {
    assert.throws(
      () => assertNoContentGlobalLeaks(page('parseTags(1)'), ['parseTags']),
      (err) => /p\.html/.test(err.message) && /c\.js/.test(err.message) && /parseTags/.test(err.message),
    );
  });
});
