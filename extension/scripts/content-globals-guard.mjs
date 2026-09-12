/**
 * Build guard: the packaged content-script chunks must expose their globals.
 *
 * Background: content scripts are classic files sharing one global scope in the
 * source tree, but the crxjs/Vite build wraps each entry in its own IIFE and
 * tree-shakes entries with no side effects. A helper file (constants.js,
 * recall.js, local-ai.js) that only *declares* consts/functions compiles to an
 * EMPTY chunk, while the built content.js still references those names as bare
 * globals → ReferenceError in the Web-Store-packaged extension. Unpacked dev
 * loads and the Playwright E2E suite use raw source files, so only the packaged
 * artifact breaks — which is why this must be a build-time guard.
 *
 * Pure logic (unit-tested); the vite plugin only reads files and surfaces errors.
 */

// Bare-global names the built content.js chunk depends on, and which helper
// chunk is responsible for exposing each (via `globalThis.<name> = ...`).
export const REQUIRED_CONTENT_GLOBALS = [
  // src/constants.js
  'TAG_COLORS',
  'parseTags',
  'stringToColor',
  'getTagColor',
  'FONT_FAMILY_NATIVE',
  'TRANSCRIPT_TRUNCATE_LENGTH',
  'isPendingRevisionExpired',
  // src/storage-maps.js
  'pruneVideoMaps',
  'pruneMapToBudget',
  'storageItemBytes',
  // src/ai/local-ai.js
  'localSummarizeSnippet',
  // src/recall.js
  'isDueForRecall',
  'gradeRecall',
  // src/loop.js
  'advanceLoop',
  'loopEditAnchor',
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
  // src/usage-caps.js
  'countEnrolledRecallSegments',
  'countSavedLoops',
  'isSavedLoopCapReached',
  'isEnrollmentCapReached',
  'isMonthlyReviewCapReached',
  'normalizeMonthlyCounter',
  'isMonthlyReviewWarnThreshold',
  // src/error-report-bridge.js
  'clipmarkReportError',
  // Load-bearing for the install-time backfill's double-injection guard — if
  // this is ever tree-shaken away the backfill re-injects on every install.
  'clipmarkContentScriptVersion',
];

/**
 * @param {string[]} chunkSources - built sources of ALL content-script chunks
 * @param {string[]} required - global names that must be assigned somewhere
 * @returns {true}
 * @throws when any required global is never assigned to globalThis
 */
export function assertContentGlobals(chunkSources, required = REQUIRED_CONTENT_GLOBALS) {
  const combined = chunkSources.join('\n');
  const missing = required.filter(
    (name) => !new RegExp(`globalThis\\.${name}\\s*=`).test(combined),
  );
  if (missing.length) {
    throw new Error(
      `Packaged content-script chunks never assign globalThis.{${missing.join(', ')}}. ` +
        'A classic content-script helper was tree-shaken to an empty chunk — ensure the ' +
        'source file ends with a globalThis registration block (see src/constants.js).',
    );
  }
  return true;
}
