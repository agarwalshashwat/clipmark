/**
 * Every Active Recall entry point must ask the shared free-tier gate.
 *
 * Active Recall is NOT a Pro-only feature: the pricing page sells it as free up
 * to FREE_RECALL_REVIEWS_PER_MONTH reviews a month, unlimited on Pro
 * (webapp/app/(marketing)/upgrade/page.tsx, and the FAQ). The rule therefore
 * lives in ONE function — `isRecallStartBlocked` in usage-caps.module.js — and
 * usage-caps.module.js's own docstring says every entry point must ask it "and
 * nothing else, so the answer cannot differ by where the user clicked".
 *
 * Nothing enforced that. #96 unified four entry points and missed a fifth: the
 * extension dashboard's per-card `.vc-revisit-btn` kept a bare `checkPro()`
 * hard-block, so a free user clicking Recall on a video card was told to
 * "unlock it with Pro" — a paywall on a feature the pricing page gives them —
 * while the due-strip button in the same file honoured the monthly cap.
 *
 * This test finds every place a surface actually STARTS a recall session and
 * asserts the enclosing function also consults the gate. It is a source-level
 * invariant, so it runs in ci-unit rather than needing a packaged build.
 *
 * Deliberately dependency-free (tests/unit runs without extension/node_modules).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../extension/src/', import.meta.url));

/**
 * Surfaces that can start a recall session. content.js is excluded on purpose:
 * it is the *engine*, downstream of every gate — it runs the session it is
 * handed and has no entitlement to read.
 */
const SURFACES = [
  'popup/dashboard.js',
  'popup/side-panel.js',
  'background/background.js',
];

/** The shared rule. A local wrapper around it counts too (resolved below). */
const SHARED_GATE = 'isRecallStartBlocked';

/**
 * How a surface starts a session: hand off through storage, or message a live
 * content script. Both mean "a recall session is now beginning".
 */
const START_MARKERS = [
  { name: 'buildPendingRevision(…, recall=true)', re: /buildPendingRevision\s*\(/g },
  { name: "message { action: 'startRevision' }", re: /action:\s*['"]startRevision['"]/g },
];

// Block openers that are control flow, not a function body.
const CONTROL_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'do', 'with']);

/** Index of the `(` matching the `)` at `close`, or -1. */
function matchParenBackwards(src, close) {
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    if (src[i] === ')') depth++;
    else if (src[i] === '(') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** True when the `{` at `open` starts a function body rather than a plain block. */
function isFunctionBody(src, open) {
  const before = src.slice(0, open).replace(/\s+$/, '');
  if (before.endsWith('=>')) return true;
  if (!before.endsWith(')')) return false; // `try {`, `else {`, object/bare block
  const lparen = matchParenBackwards(before, before.length - 1);
  if (lparen === -1) return false;
  const head = before.slice(0, lparen).replace(/\s+$/, '');
  const word = (head.match(/([A-Za-z_$][\w$]*)$/) || [])[1];
  if (word && CONTROL_KEYWORDS.has(word)) return false;
  return true; // `function f(…) {`, `async f(…) {`, `method(…) {`
}

/**
 * The innermost enclosing FUNCTION body around `index`, as a source slice.
 * Walks out through plain blocks (try/if/for) until it reaches a function.
 * Returns null at module scope — a start site with no enclosing function.
 */
export function enclosingFunctionBody(src, index) {
  let from = index;
  for (let guard = 0; guard < 40; guard++) {
    let depth = 0;
    let open = -1;
    for (let i = from - 1; i >= 0; i--) {
      const c = src[i];
      if (c === '}') depth++;
      else if (c === '{') {
        if (depth === 0) { open = i; break; }
        depth--;
      }
    }
    if (open === -1) return null; // module scope

    // Matching close brace, so the body we test is the whole function.
    let d = 0;
    let close = src.length;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') d++;
      else if (src[i] === '}') { d--; if (d === 0) { close = i; break; } }
    }
    const body = src.slice(open, close + 1);
    if (isFunctionBody(src, open)) return body;
    from = open; // a plain block — keep walking outwards
  }
  return null;
}

/**
 * Names in `src` that are, or wrap, the shared gate: the gate itself plus any
 * function in this file whose own body consults it (side-panel.js and
 * background.js both use a local `isRecallBlockedForFreeTier()` wrapper that
 * reads chrome.storage before delegating).
 */
export function gateNames(src) {
  const names = new Set([SHARED_GATE]);
  for (const m of src.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    // Scan FORWARD from the declaration: a function's body follows its name,
    // so the backwards walk used for start sites would find the wrong block
    // (or module scope) here.
    const body = declaredFunctionBody(src, m.index + m[0].length - 1);
    if (body && body.includes(SHARED_GATE)) names.add(m[1]);
  }
  return names;
}

/**
 * Body of the function whose parameter-list `(` sits at `lparen`: skip to the
 * matching `)`, then take the brace-matched block that follows.
 */
function declaredFunctionBody(src, lparen) {
  let depth = 0;
  let i = lparen;
  for (; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (depth === 0) break; }
  }
  const open = src.indexOf('{', i);
  if (open === -1) return null;
  let d = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(open, j + 1); }
  }
  return null;
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

/** Every recall-start site in `src` that is not gated. */
export function ungatedRecallStarts(src) {
  const gates = [...gateNames(src)];
  const ungated = [];
  for (const { name, re } of START_MARKERS) {
    for (const m of src.matchAll(re)) {
      const body = enclosingFunctionBody(src, m.index);
      // Module scope can't hold a gate; treat it as ungated so it gets looked at.
      if (body && gates.some(g => body.includes(g))) continue;
      ungated.push({ marker: name, line: lineOf(src, m.index) });
    }
  }
  return ungated;
}

describe('Active Recall free-tier gate covers every entry point', () => {
  for (const rel of SURFACES) {
    it(`${rel} gates every recall session it starts`, () => {
      const src = readFileSync(path.join(SRC, rel), 'utf8');
      const ungated = ungatedRecallStarts(src);
      assert.deepEqual(
        ungated,
        [],
        `${rel} starts an Active Recall session without consulting ${SHARED_GATE}:\n` +
          ungated.map(u => `  line ${u.line}: ${u.marker}`).join('\n') +
          `\nActive Recall is free up to the monthly review cap — gate with ` +
          `${SHARED_GATE} (or this file's wrapper around it), never with a bare ` +
          `checkPro(), which paywalls a free-tier feature.`,
      );
    });
  }

  it('finds start sites at all — the markers still match the source', () => {
    // Guards the guard: if the surfaces are refactored so no marker matches,
    // every assertion above would pass vacuously.
    const total = SURFACES.reduce((n, rel) => {
      const src = readFileSync(path.join(SRC, rel), 'utf8');
      return n + START_MARKERS.reduce((k, { re }) => k + [...src.matchAll(re)].length, 0);
    }, 0);
    assert.ok(total >= 5, `expected ≥5 recall-start sites across the surfaces, found ${total}`);
  });

  it('every surface actually reaches the shared rule', () => {
    for (const rel of SURFACES) {
      const src = readFileSync(path.join(SRC, rel), 'utf8');
      assert.ok(
        src.includes(SHARED_GATE),
        `${rel} never mentions ${SHARED_GATE} — it cannot be gating anything.`,
      );
    }
  });
});

describe('the scanner itself', () => {
  it('walks out of a try block to the enclosing function', () => {
    const src = `async function go(){ if (await blocked()) return; try { send({ action: 'startRevision' }); } catch {} }`;
    assert.deepEqual(ungatedRecallStarts(src.replace('blocked', SHARED_GATE)), []);
  });

  it('flags a sibling handler that has no gate of its own', () => {
    const src = [
      `async function gated(){ if (${SHARED_GATE}(x)) return; buildPendingRevision(a,b,true); }`,
      `async function ungated(){ if (await checkPro()) buildPendingRevision(a,b,true); }`,
    ].join('\n');
    const found = ungatedRecallStarts(src);
    assert.equal(found.length, 1);
    assert.equal(found[0].line, 2);
  });

  it('does not mistake `if (…) {` for a function body', () => {
    const src = `function f(){ if (a) { buildPendingRevision(1,2,true); } }`;
    // No gate anywhere, so the site must be reported — and reported once,
    // meaning the walk found f() rather than stopping at the if-block.
    assert.equal(ungatedRecallStarts(src).length, 1);
  });

  it('accepts a local wrapper around the shared rule', () => {
    const src = [
      `async function isRecallBlockedForFreeTier(){ return ${SHARED_GATE}({}); }`,
      `async function go(){ if (await isRecallBlockedForFreeTier()) return; buildPendingRevision(a,b,true); }`,
    ].join('\n');
    assert.deepEqual(ungatedRecallStarts(src), []);
  });

  it('reports a start site at module scope', () => {
    assert.equal(ungatedRecallStarts(`buildPendingRevision(a,b,true);`).length, 1);
  });
});
