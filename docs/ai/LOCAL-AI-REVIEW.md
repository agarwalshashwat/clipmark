# On-device AI — review and upgrade plan

**Status: SPEC / PLAN ONLY. No extension code changes in this document's PR.**
`extension/src/ai/local-ai.js` is being touched by other workstreams; everything
below is a proposal to schedule, not a change that has been made.

Audited against `origin/main` @ `0518936`. Written 2026-08-17.

---

## 0. How current is the evidence — read this first

Ash's pasted docs were ~a year old. **The live docs are the same vintage.** I
fetched them rather than assuming, and each page carries its own last-updated
date:

| Page | URL | Last updated (as published) |
|---|---|---|
| Built-in AI APIs (status table) | https://developer.chrome.com/docs/ai/built-in-apis | **2025-09-12** |
| Prompt API | https://developer.chrome.com/docs/ai/prompt-api | (undated in fetch) |
| Summarizer API | https://developer.chrome.com/docs/ai/summarizer-api | (undated in fetch) |
| Proofreader API | https://developer.chrome.com/docs/ai/proofreader-api | **2025-09-12** |
| Translator API | https://developer.chrome.com/docs/ai/translator-api | **2025-05-20** |

So "current" below means *as Google currently publishes it*, which is not the
same as *as of today*. Two consequences worth acting on:

1. **The Proofreader origin trial is stated as "Chrome 141 to 145".** That
   window has closed — Chrome is well past 145. The page has not been updated,
   so from the docs alone we cannot tell whether Proofreader graduated to
   stable, lapsed, or was extended. **Its status is genuinely unknown and must
   be re-checked before any planning depends on it.** This is exactly the trap
   Ash flagged, and it is still live.
2. **The docs contradict themselves on Prompt API in extensions.** The status
   table says extensions **Chrome 138 (stable)**; the Prompt API page says
   "Extensions support: **Chrome 148**". Our extension demonstrably works today
   on the `LanguageModel` global, so 138 is the one consistent with observed
   reality, and 148 most likely refers to the sampling-parameters origin trial.
   Flagged rather than resolved — do not cite a version here without checking.

Everything in §4 is graded on this evidence. **Nothing that is not stable gets
shipped**, per the standing rule.

---

## 1. Are we on the current API surface?

**Mostly yes — this is the good news.** `local-ai.js` is not carrying any of the
deprecated shapes:

| Deprecated form | Present? |
|---|---|
| `window.ai.*` | ❌ absent |
| `canCreateTextSession()` | ❌ absent |
| `ai.languageModel.*` namespace | ❌ absent |
| `createTextSession()` | ❌ absent |

It uses the standardised surface: the **`LanguageModel` global**,
`LanguageModel.availability()`, `LanguageModel.create({ systemPrompt })`,
`session.prompt()`, `session.destroy()` in a `finally`. Language declarations
are already passed as `expectedInputs` / `expectedOutputs`
(`_LM_LANGUAGE_OPTIONS`), which is the current shape and satisfies the
language-declaration requirement.

**No migration is required for correctness.** What is missing is the *newer*
surface we never adopted:

| Capability | Doc | Used? | Consequence |
|---|---|---|---|
| `create({ monitor })` + `downloadprogress` | Prompt API | ❌ | First-ever AI use on a cold profile silently does nothing while a multi-GB model downloads. No UI, no progress, no explanation. |
| `LanguageModel.params()` | Prompt API (extensions-only) | ❌ | `temperature`/`topK` left at defaults. For a deterministic 3–7 word title, a low temperature is the obvious lever and we never pull it. |
| `responseConstraint` (JSON Schema) | Prompt API | ❌ | We hand-roll JSON parsing — see below. |
| `inputQuota` / `inputUsage` / `measureInputUsage()` | Prompt API | ❌ | No token budgeting anywhere. |
| `session.clone()` | Prompt API | ❌ | Every call pays full session construction. Minor. |

### 1a. The hand-rolled JSON parser is the sharpest finding

`_parseJson(raw, opener, closer)` strips markdown fences, attempts a parse,
then — on failure — *reconstructs* JSON by finding the last closing bracket and
re-wrapping. Three prompts additionally beg the model in prose ("No markdown
fences, no extra keys, no explanation") and one even pre-seeds the opening `[`.

That is the entire problem `responseConstraint` exists to solve: pass a JSON
Schema and the model is constrained to conform. Adopting it would let us
**delete `_parseJson` outright** along with the prose pleading, and would remove
a class of silent failure (`_parseJson` returns `null`, and
`localSuggestTags` then returns `[]` — indistinguishable from "no tags apply").

### 1b. Availability checking is inconsistent

Only `localSummarizeSnippet` calls `localAiAvailability()` before
`LanguageModel.create()`. `localSuggestTags`, `localSummarizeBookmarks` and
`localGeneratePost` call `create()` directly and rely on **callers** to have
checked (`side-panel.js` does, for the two that ship). That works today but is
a latent trap: the guarantee lives in the caller, not the function.

### 1c. No input bounding

`localSummarizeBookmarks` concatenates *every* bookmark for a video into one
prompt with no cap. A heavily-bookmarked 3-hour lecture can overflow the context
window; the failure mode is a `contextoverflow` event we do not listen for and a
truncated or failed result. `localSuggestTags` truncates transcript context with
a bare `.slice(0, 300)` — arbitrary, and characters are not tokens.

### 1d. Stale header comment

`local-ai.js:1-3` claims "All functions are globals; no module syntax (no build
step)." There **is** a build step (Vite/CRXJS), and the file exports via both
`globalThis` and `module.exports`. Cosmetic, but it misleads anyone applying the
twin-file rules in `.claude/CLAUDE.md`.

---

## 2. Smart Summary → migrate to the Summarizer API

**Recommendation: yes, and it is the highest-value change in this document.**

`localSummarizeSnippet` currently uses the general Prompt API with a
hand-written system prompt to turn a transcript snippet into a 3–7 word title.
The **Summarizer API is purpose-built for exactly this** and is
**stable in Chrome 138** for both web and extensions
(https://developer.chrome.com/docs/ai/summarizer-api).

The decisive detail: `Summarizer.create()` takes a **`type`** option of
`"key-points" | "tldr" | "teaser" | "headline"`, plus `length`
(`"short" | "medium" | "long"`) and `format` (`"markdown" | "plain-text"`).
**`type: 'headline'` with `length: 'short'` and `format: 'plain-text'` is
literally the shape we are prompt-engineering toward.** We are asking a general
model in prose to do what a dedicated API exposes as a parameter.

Sketch (illustrative — not applied):

```js
const summarizer = await Summarizer.create({
  type: 'headline',
  length: 'short',
  format: 'plain-text',
  sharedContext: 'A timestamped moment from a YouTube video transcript.',
  expectedInputLanguages: ['en'],
  monitor(m) {
    m.addEventListener('downloadprogress', (e) => onProgress(e.loaded));
  },
});
const title = await summarizer.summarize(snippet);
```

**Assessment**

- *Quality fit:* **good.** Condensing long-form prose is the API's stated
  purpose, and `headline` is a first-class output type. It should beat a prose
  system prompt on consistency, and removes our post-hoc
  `raw.replace(/["']/g, '').trim()` cleanup of stray quotes.
- *Robustness fit:* **better than today.** `format: 'plain-text'` removes the
  markdown-fence class of bug at the source.
- *Risk:* the Summarizer is tuned for *summaries*, and a 3–7 word bookmark title
  is at the extreme short end. `headline`/`short` should cover it, but this
  needs an A/B on real transcripts before switching — see §5.
- *Change size:* small and well-isolated. One function, plus an availability
  helper for `Summarizer` alongside the existing `LanguageModel` one. The
  fallback contract (`return snippet` unchanged when unavailable) is preserved
  exactly.
- *Constraint to respect:* Summarizer supports **five input languages**
  (`en`, `ja`, `es`, `de`, `fr`) and needs **22 GB free storage**, same as the
  Prompt API. Not a regression — we already declare `['en']`.

**Do not migrate `localGeneratePost`.** Drafting a platform-specific social post
is generative, not summarisation; the Prompt API remains correct there. It is,
however, the best candidate for `responseConstraint` (§1a).

---

## 3. Robustness plan

Prioritised, all using stable APIs only:

1. **Model-download UX (`monitor` + `downloadprogress`).** Today `availability()`
   returning `"downloadable"` or `"downloading"` is treated identically to
   `"unavailable"` — `localSummarizeSnippet` just returns the raw snippet, and
   the side panel says AI "is required". A first-run user on capable hardware is
   told the feature doesn't work when in truth it is *about to*. Distinguish the
   four states and surface real progress.
2. **Uniform availability gating.** Move the `availability()` check inside each
   entry point rather than trusting callers.
3. **Token budgeting.** Use `measureInputUsage()` / `inputQuota` to bound
   `localSummarizeBookmarks` input, and listen for `contextoverflow`. Replace the
   magic `.slice(0, 300)`.
4. **Structured output.** Adopt `responseConstraint` for the JSON-returning
   functions; delete `_parseJson`.
5. **Keep the honest fallback.** Every path must still degrade to the current
   non-AI behaviour, and the marketing footnote ("availability varies by Chrome
   version") stays true. **Do not** make any AI path load-bearing.
6. **Typings: adopt `@types/dom-chromium-ai`.** The extension is JS, but the
   webapp is TS and `tsc --noEmit` is gated in CI; a devDependency plus a
   `// @ts-check` pass over `local-ai.js` would catch option-shape drift (the
   `expectedInputs` vs `expectedInputLanguages` distinction between the Prompt
   and Summarizer APIs is exactly the kind of mistake it prevents). Low cost,
   no runtime footprint.

---

## 4. New-capability backlog (prioritised)

**Ship rule: stable only.** Origin-trial and developer-trial APIs need a token
or a flag and can be withdrawn; neither is acceptable for a published extension.

### P1 — Translator API · ✅ STABLE (Chrome 138)
https://developer.chrome.com/docs/ai/translator-api

**Use case:** the language-learner audience. Translate a bookmark's description
or transcript snippet inline, and translate an Active Recall card's prompt to
the learner's language. This is the segment where **Language Reactor (~2M
users)** is the incumbent, and it is the single clearest product wedge available
from a stable API.

**Maturity:** stable, desktop-only, **40+ language codes**, per-pair language
packs downloaded on demand via `Translator.create({sourceLanguage, targetLanguage, monitor})`.
Note the documented privacy behaviour: *"all language pairs are reported as
downloadable"* — so `availability()` cannot be used to detect an already-cached
pair, and the download-progress UX from §3.1 is a **prerequisite**, not a
nice-to-have.

**Verdict: SHIP-NOW candidate — highest strategic value in this list.**

### P2 — Language Detector API · ✅ STABLE (Chrome 138)
**Use case:** pairs with Translator — detect a transcript's language rather than
asking, and stop assuming `['en']` (which we currently hard-code in
`_LM_LANGUAGE_OPTIONS`). Also gates Summarizer correctly, since it accepts only
five input languages.

**Verdict: SHIP-NOW, as the enabler for P1.** Small, and it removes a real
existing assumption.

### P3 — Proofreader API · ⚠️ STATUS UNKNOWN — verify before planning
https://developer.chrome.com/docs/ai/proofreader-api

**Use case:** proofread the user's own typed notes on a bookmark — grammar,
spelling, punctuation, with per-correction `startIndex`/`endIndex` for inline
underlining. Genuinely nice for the ESL slice of the language-learner audience.

**Maturity:** doc (2025-09-12) states an origin trial **Chrome 141–145** — a
window that has since closed, with no doc update. Could now be stable, lapsed,
or extended. The doc also warns that `includeCorrectionTypes` and
`includeCorrectionExplanation` from the explainer **"aren't supported"**, so the
"explain the error" pitch may not be deliverable even if it ships.

**Verdict: WATCH. Re-check status first; do not plan against it until confirmed
stable.**

### P4 — Writer / Rewriter APIs · ❌ NOT STABLE (developer trial)
**Use case:** Writer — draft study notes from a set of clips. Rewriter — adjust
tone/length of an existing note, and a better-fitting home for "rewrite this
post for LinkedIn vs X" than our current single-shot `localGeneratePost`.

**Maturity:** developer trial per the status table; origin trials per the Chrome
blog. Either way **not stable**.

**Verdict: WATCH. Do not ship.** Note `localGeneratePost` already covers the
main Rewriter use case adequately on a stable API.

### Summary table

| API | Status | ClipMark use | Verdict |
|---|---|---|---|
| Summarizer | ✅ Stable (138) | Smart Summary titles | **Migrate (§2)** |
| Prompt / LanguageModel | ✅ Stable (138, extensions) | Post Insights, tags | **Keep + modernise (§1,§3)** |
| Translator | ✅ Stable (138) | Language-learner wedge | **P1 ship-now** |
| Language Detector | ✅ Stable (138) | Enabler for P1 | **P2 ship-now** |
| Proofreader | ⚠️ Unknown (OT 141–145 closed) | Proofread notes | **P3 verify first** |
| Writer / Rewriter | ❌ Dev trial | Draft/retone notes | **P4 watch** |

---

## 5. Suggested sequencing

Each step is independently shippable and independently revertible.

1. **Fix the honesty gap first (no AI work).** Per the marketing audit,
   `localSuggestTags` is **unshipped** — zero callers — while the site
   advertises "Auto Tagging". Either wire it up or correct the copy. Nothing
   below should land while the site claims a feature that does not exist.
2. **Robustness pass** (§3.1–3.4) on the existing Prompt API paths — download
   UX, uniform gating, `responseConstraint`, token bounds. Pure improvement, no
   new surface.
3. **Summarizer migration** (§2) behind an A/B against the current prompt on a
   corpus of real transcript snippets. Keep the Prompt API path until it wins.
4. **Language Detector**, then **Translator** — the wedge. Requires step 2's
   download UX to exist first.
5. **Re-check Proofreader status.** Revisit if stable.

## 6. Open questions for Ash

- Is the language-learner wedge (P1/P2) a direction we want, or a distraction
  pre-launch? It is the largest opportunity here but also the largest scope.
- Do we want AI features to remain **free for everyone** (they cost us nothing —
  see `side-panel.js`, "free for everyone, on-device, zero cost to us"), or is
  Translator a Pro feature? This interacts with the "PRO FEATURES" marketing
  correction already flagged.
- Minimum Chrome version: adopting Summarizer/Translator sets a practical floor
  of **138** for those features. Fallbacks keep older Chrome working, but the
  support matrix should be a deliberate call.

## Sources

- Built-in AI APIs status table — https://developer.chrome.com/docs/ai/built-in-apis
- Prompt API — https://developer.chrome.com/docs/ai/prompt-api
- Summarizer API — https://developer.chrome.com/docs/ai/summarizer-api
- Translator API — https://developer.chrome.com/docs/ai/translator-api
- Proofreader API — https://developer.chrome.com/docs/ai/proofreader-api
- Chrome blog, AI API updates — https://developer.chrome.com/blog/ai-api-updates-io25
