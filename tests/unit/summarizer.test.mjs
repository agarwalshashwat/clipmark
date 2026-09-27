/**
 * Unit tests for the on-device Summarizer wrapper and the AI (beta) setting.
 *
 * The parts worth pinning are the ones that fail *quietly*: a transcript one
 * character over the model's limit rejects the whole summary, a bullet leader
 * the parser doesn't know about renders as "* * Foo" at the user, and a
 * mis-spelled settings key silently disables auto-labelling forever.
 *
 * Run: npm run test:unit  (or: node --test tests/unit/summarizer.test.mjs)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  MAX_TRANSCRIPT_CHARS,
  summarizerAvailability,
  trimTranscript,
  parseKeyPoints,
} from '../../extension/src/ai/summarizer.js';

const read = (rel) =>
  readFileSync(fileURLToPath(new URL(`../../extension/src/${rel}`, import.meta.url)), 'utf8');

describe('summarizerAvailability', () => {
  it('reports unavailable when Chrome has no Summarizer at all', async () => {
    // Node has no `Summarizer` global — the same shape as Chrome < 138, which is
    // the case progressive enhancement exists for.
    assert.equal(globalThis.Summarizer, undefined, 'precondition: no global');
    assert.equal(await summarizerAvailability(), 'unavailable');
  });

  it('passes through the API’s own state vocabulary', async () => {
    globalThis.Summarizer = { availability: async () => 'downloadable' };
    try {
      assert.equal(await summarizerAvailability(), 'downloadable');
    } finally {
      delete globalThis.Summarizer;
    }
  });

  it('never throws, whatever the global does', async () => {
    // An older/newer Chrome may expose the name with a different signature. A
    // throw here would run during panel init and take the whole panel with it.
    globalThis.Summarizer = { availability: () => { throw new Error('bad signature'); } };
    try {
      assert.equal(await summarizerAvailability(), 'unavailable');
    } finally {
      delete globalThis.Summarizer;
    }

    globalThis.Summarizer = { availability: async () => undefined };
    try {
      assert.equal(await summarizerAvailability(), 'unavailable', 'undefined is not a state');
    } finally {
      delete globalThis.Summarizer;
    }
  });
});

describe('trimTranscript', () => {
  it('leaves a short transcript alone', () => {
    assert.deepEqual(trimTranscript('  a neural network  '), { text: 'a neural network', truncated: false });
  });

  it('never returns more than the cap', () => {
    const long = 'word '.repeat(MAX_TRANSCRIPT_CHARS); // comfortably over
    const { text, truncated } = trimTranscript(long);
    assert.equal(truncated, true);
    assert.ok(text.length <= MAX_TRANSCRIPT_CHARS, `got ${text.length}`);
  });

  it('cuts on a word boundary rather than mid-token', () => {
    const { text } = trimTranscript('alpha beta gamma delta', 12);
    assert.equal(text, 'alpha beta', 'should not end mid-word');
  });

  it('falls back to a hard cut when there is no nearby space', () => {
    // A single enormous token (no spaces): a boundary cut would throw away
    // almost everything, so the hard cut is correct here.
    const { text, truncated } = trimTranscript('x'.repeat(50), 10);
    assert.equal(text, 'x'.repeat(10));
    assert.equal(truncated, true);
  });

  it('treats junk input as empty instead of throwing', () => {
    for (const bad of [undefined, null, 42, {}]) {
      assert.deepEqual(trimTranscript(bad), { text: '', truncated: false });
    }
  });
});

describe('parseKeyPoints', () => {
  it('strips whichever bullet leader the model used', () => {
    const raw = [
      '* Gradient descent minimises the cost function',
      '- Weights are updated layer by layer',
      '• Backpropagation computes the gradient',
      '1. Neurons hold an activation between 0 and 1',
      '2) Layers compose into a network',
    ].join('\n');

    assert.deepEqual(parseKeyPoints(raw), [
      'Gradient descent minimises the cost function',
      'Weights are updated layer by layer',
      'Backpropagation computes the gradient',
      'Neurons hold an activation between 0 and 1',
      'Layers compose into a network',
    ]);
  });

  it('drops blank lines and tolerates no bullets at all', () => {
    assert.deepEqual(parseKeyPoints('One thing\n\n\nAnother thing\n'), ['One thing', 'Another thing']);
  });

  it('returns an empty list for junk rather than throwing', () => {
    for (const bad of [undefined, null, 42, {}]) assert.deepEqual(parseKeyPoints(bad), []);
    assert.deepEqual(parseKeyPoints(''), []);
  });
});

describe('the AI (beta) setting', () => {
  // The content script cannot import the side panel's module, so the key is
  // spelled in both. Disagreement means auto-labelling silently never runs
  // while the panel's toggle looks like it is working.
  it('is spelled identically in the content script and the side panel', () => {
    const panel = read('popup/side-panel.js');
    const content = read('content/content.js');
    const declared = /const AI_BETA_KEY = '([^']+)'/.exec(panel)?.[1];

    assert.equal(declared, 'aiBetaEnabled', 'side panel declares the key');
    assert.ok(
      content.includes(`chrome.storage.sync.get({ ${declared}: true }`),
      'content.js must read the same key, defaulting to on',
    );
  });

  it('defaults to on in both places', () => {
    assert.match(read('popup/side-panel.js'), /syncGet\(\{ \[AI_BETA_KEY\]: true \}\)/);
    assert.match(read('content/content.js'), /aiBetaEnabled: true/);
  });

  it('gates auto-labelling on the setting', () => {
    // The whole point of the toggle: with it off, no prompt is issued on save.
    assert.match(read('content/content.js'), /if \(transcriptText && await isAiBetaEnabled\(\)\)/);
  });
});

describe('progressive enhancement', () => {
  it('keeps the Summarizer out of the content-script bundle', () => {
    // ai/local-ai.js is a declared content script, so anything added there ships
    // into every YouTube page. The Summarizer is side-panel-only by design.
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../extension/manifest.json', import.meta.url)), 'utf8'),
    );
    // Select by world, not by index — position in this array is meaningless.
    const isolated = manifest.content_scripts.find((e) => (e.world ?? 'ISOLATED') === 'ISOLATED');
    const contentScripts = isolated.js;
    assert.ok(contentScripts.includes('src/ai/local-ai.js'), 'precondition');
    assert.ok(
      !contentScripts.includes('src/ai/summarizer.js'),
      'summarizer.js must not be injected into every page',
    );
  });

  it('hides the AI card instead of letting it fail', () => {
    const panel = read('popup/side-panel.js');
    assert.match(panel, /card\.hidden = !usable/);
    assert.match(panel, /note\.hidden = usable/);
    assert.match(panel, /AI features need Chrome 138\+/);
  });
});
