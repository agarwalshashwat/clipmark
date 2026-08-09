/**
 * Tests for the packaged-content-script globals guard.
 *
 * Guards the pure logic that fails `vite build` when a classic content-script
 * helper (constants.js / recall.js / loop.js / local-ai.js) gets tree-shaken to an empty
 * chunk, stripping the globals the built content.js references bare.
 * Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertContentGlobals,
  REQUIRED_CONTENT_GLOBALS,
} from '../../extension/scripts/content-globals-guard.mjs';

const exposing = (names) => names.map((n) => `globalThis.${n} = ${n};`).join('\n');

describe('assertContentGlobals', () => {
  it('passes when all required globals are assigned across chunks', () => {
    const chunkA = exposing(['TAG_COLORS', 'parseTags', 'stringToColor', 'getTagColor', 'FONT_FAMILY_NATIVE', 'TRANSCRIPT_TRUNCATE_LENGTH', 'isPendingRevisionExpired']);
    const chunkB = exposing(['localSummarizeSnippet']);
    const chunkC = exposing(['isDueForRecall', 'gradeRecall']);
    const chunkD = exposing(['clipmarkReportError', 'clipmarkContentScriptVersion']);
    const chunkE = exposing(['countEnrolledRecallSegments', 'isEnrollmentCapReached', 'isMonthlyReviewCapReached', 'normalizeMonthlyCounter', 'isMonthlyReviewWarnThreshold', 'countSavedLoops', 'isSavedLoopCapReached']);
    const chunkF = exposing(['advanceLoop', 'normalizeLoopSegment', 'isValidLoopSegment', 'isSameLoopSegment', 'insertLoopSegment', 'removeLoopSegment', 'updateLoopSegmentBound', 'needsOverlayRemount', 'shouldRebindVideo', 'loopEndForBookmark', 'loopSegmentsFromBookmarks', 'formatLoopClock', 'buildLoopBookmark', 'isDuplicateLoop', 'LOOP_CONSTANTS']);
    assert.equal(assertContentGlobals([chunkA, chunkB, chunkC, chunkD, chunkE, chunkF]), true);
  });

  it('passes on minified-style assignments (no spaces)', () => {
    const minified = REQUIRED_CONTENT_GLOBALS.map((n) => `globalThis.${n}=x`).join(',');
    assert.equal(assertContentGlobals([minified]), true);
  });

  it('throws and names the missing globals when a chunk is tree-shaken empty', () => {
    // Simulates the real bug: constants.js compiled to an empty IIFE.
    const emptyConstantsChunk = '(function(){\n})()';
    const otherChunks = exposing([
      'localSummarizeSnippet',
      'isDueForRecall',
      'gradeRecall',
      'clipmarkReportError',
      'countEnrolledRecallSegments',
      'isEnrollmentCapReached',
      'isMonthlyReviewCapReached',
      'normalizeMonthlyCounter',
      'isMonthlyReviewWarnThreshold',
      'countSavedLoops',
      'isSavedLoopCapReached',
      'advanceLoop',
      'normalizeLoopSegment',
      'isValidLoopSegment',
      'isSameLoopSegment',
      'insertLoopSegment',
      'removeLoopSegment',
      'updateLoopSegmentBound',
      'needsOverlayRemount',
      'shouldRebindVideo',
      'loopEndForBookmark',
      'loopSegmentsFromBookmarks',
      'formatLoopClock',
      'buildLoopBookmark',
      'isDuplicateLoop',
      'LOOP_CONSTANTS',
    ]);
    assert.throws(
      () => assertContentGlobals([emptyConstantsChunk, otherChunks]),
      (err) => err.message.includes('TAG_COLORS') && err.message.includes('getTagColor'),
    );
  });

  it('does not accept a bare reference as an assignment', () => {
    const referencesOnly = 'const c = TAG_COLORS[t] || stringToColor(t);';
    assert.throws(() => assertContentGlobals([referencesOnly]));
  });

  it('supports a custom required list', () => {
    assert.equal(assertContentGlobals(['globalThis.foo = 1;'], ['foo']), true);
    assert.throws(() => assertContentGlobals(['globalThis.foo = 1;'], ['bar']));
  });
});
