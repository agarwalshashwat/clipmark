# ClipMark — Release Process (the release train)

**Purpose:** decide *when* a release ships and *what qualifies* to jump the queue. This is the policy layer.

**This doc vs. [`RELEASE-RUNBOOK.md`](RELEASE-RUNBOOK.md):** the runbook is the *mechanics* — how the Chrome Web Store dashboard works, review timing, Chrome's silent auto-update, staged rollout, Sentry monitoring, migration sequencing. It stays authoritative on all of that and this doc does not restate it. What you're reading adds the **schedule**, the **hotfix criteria**, and the **tooling** (`scripts/cut-release.sh`) that the runbook predates.

**Read the runbook when** you're mid-upload and need to know what a dashboard field does. **Read this** when deciding whether something ships today or on the 12th.

---

## 1. Why a train exists

Between 2026-07 and 2026-08 the extension shipped **1.0.2 → 1.0.3 → 1.0.4 → 1.0.5 in rapid succession**, each one a small follow-up to the last. Every one of those uploads cost a Google review cycle and force-updated the entire userbase — and 1.0.4 and 1.0.5 existed only because 1.0.3 and 1.0.4 went out before they were done.

That's the failure mode this process prevents. It isn't a hypothetical: `git log --oneline -- extension/manifest.json` shows it.

The two surfaces have genuinely different economics, so they get genuinely different cadences:

| | **Webapp** (`webapp/`) | **Extension** (`extension/`) |
|---|---|---|
| **Cadence** | **Continuous** — ships on merge | **Batched** — every 2 weeks |
| **Mechanism** | Vercel auto-deploys `main` | Manual zip upload to the CWS dashboard |
| **Gate before users see it** | Your CI only | **Google review**, hours to days |
| **Time to correct a mistake** | Seconds — redeploy the previous build | Another full review cycle; you cannot unpublish |
| **User consent to update** | N/A | None — Chrome force-updates silently |

**Webapp: keep shipping continuously.** Merge to `main`, Vercel deploys, done. There is no train for the webapp and adding one would only make rollback slower. A same-day webapp fix is the *normal* case, not an exception.

**Extension: batch it.** The upload is irreversible from the user's side, gated by a third party, and pushed without consent. Batching means each review cycle carries a fortnight of value instead of one commit, and there's a buffer where a not-quite-ready change gets caught before it becomes a version number that can never be recalled.

> A change spanning both surfaces still follows [`RELEASE-RUNBOOK.md` §0](RELEASE-RUNBOOK.md) on ordering and the auto-update overlap window. The train changes *when* the extension half ships, not the compatibility rules.

---

## 2. The schedule

**Extension releases cut every second Tuesday.**

- **Tuesday**, mid-week, deliberately. Google's review clock starts on upload and doesn't stop for the weekend, but *yours* does — a Friday cut means an approval landing Saturday with nobody watching Sentry and nobody able to halt a staged rollout. Tuesday leaves three business days to catch a bad rollout before the weekend.
- **Fortnightly.** Long enough that a cut is worth the review cycle; short enough that a non-urgent fix never waits more than two weeks.
- **A cut with nothing worth shipping is skipped, not filled.** An empty train is a good sign, not wasted capacity. Never manufacture a release to hit the date.
- **The date is a ceiling, not a deadline.** If a change isn't ready on the Tuesday it catches the next train. Shipping it half-done is precisely how 1.0.3 became 1.0.5.

Nothing enforces the date automatically — it's a calendar reminder plus this doc. The `release-train.yml` workflow (§7) builds a package weekly, but it never starts a release; only a human running `cut-release.sh` with a bump type does that.

---

## 3. The hotfix lane

Some bugs shouldn't wait up to two weeks. The lane exists so that's a **decision against criteria**, not a judgement call under pressure — the 1.0.2→1.0.5 churn was four consecutive "this feels urgent" calls.

### Qualifies as a hotfix

Ship immediately, skipping the train, if the bug is **in production** and **any one** of these holds:

1. **Security or privacy.** Credential/token exposure, a data leak across users, an RLS or auth bypass, or a bug writing another user's data. No further test — this is always a hotfix.
2. **Data loss or corruption.** Users are losing bookmarks, clips, or recall history, or having them silently written wrong. Includes anything corrupting `chrome.storage.sync` state or cloud-synced rows.
3. **A core flow is broken for a large share of users, with no workaround.** Bookmarking, playback/revisit, Active Recall, sign-in, or checkout is dead — not degraded. "Large share" means it isn't reproducing only on one config or one edge input.
4. **Payments are wrong.** Checkout failing, users double-charged, refunds not reversing entitlement, or webhooks silently dropping. Money moving incorrectly is always a hotfix.
5. **A Chrome Web Store policy violation** flagged by Google, or anything risking takedown. The clock is Google's, not yours.

### Does not qualify — catches the next train

- A cosmetic or layout bug, however visible.
- A bug with a workaround a user can reasonably discover.
- A bug affecting one narrow configuration or reachable only by an unusual sequence.
- A missing feature, an incomplete feature, or a copy fix.
- Anything caught before publish, on a branch, or only in a preview — it isn't in production, so there is nothing to hotfix.
- **"It's a one-line fix."** Size is not urgency. This is the single most common reason a release train breaks, and how the churn above happened. A one-line fix ships on the next Tuesday.
- **"It's already written and tested."** Also not urgency. Merge it, let it ride the train.

**If it isn't clearly on the qualifying list, it isn't a hotfix.** Ambiguity resolves toward waiting.

### Running the hotfix lane

A hotfix is a normal cut with a shortened schedule, not a different pipeline. Same script, same gates.

1. Branch `hotfix/<short-description>` **off `main`**, not off a feature branch. (`cut-release.sh` recognises `hotfix/*` and won't warn about the branch.)
2. Fix the bug and **nothing else.** Every extra change in a hotfix is a change that skipped its review buffer. Refactors, cleanups and drive-by improvements go on a separate branch for the next train.
3. **If the fix is webapp-only, stop here** — merge to `main` and let Vercel deploy. No extension release, no version bump. Check this before bumping anything; a webapp fix does not need a CWS review cycle.
4. PR with the qualifying criterion from the list above stated in the description. This is the audit trail for whether the lane is being used honestly — review the last few hotfix PRs occasionally and see whether they'd still qualify in hindsight.
5. Cut with `scripts/cut-release.sh patch` (§5). A hotfix is a PATCH bump by definition — if it needs a minor, it's a feature and it isn't a hotfix.
6. **Staged rollout is not optional here.** A hotfix has had less soak time than a train release, so start at 10–25% and watch Sentry ([`RELEASE-RUNBOOK.md` §3a/§3b](RELEASE-RUNBOOK.md)). The instinct to push a fix to 100% immediately is exactly backwards.
7. **The train still departs on schedule.** A hotfix does not reset the fortnightly clock or become the next scheduled release.

---

## 4. Versioning

Semver per surface, unchanged from [`RELEASE-RUNBOOK.md` §1](RELEASE-RUNBOOK.md) — restated because `cut-release.sh` takes the bump type as its argument:

| Bump | When | Command |
|---|---|---|
| **PATCH** | Bug fixes only. No new user-facing capability. Every hotfix. | `scripts/cut-release.sh patch` |
| **MINOR** | New feature or capability, backward-compatible. | `scripts/cut-release.sh minor` |
| **MAJOR** | Breaking change to stored data shape, or requires the webapp in lockstep. Rare — read [`RELEASE-RUNBOOK.md` §0](RELEASE-RUNBOOK.md) on the auto-update overlap first. | `scripts/cut-release.sh major` |

**A train release carrying both fixes and features is a MINOR.** The highest bump in the batch wins; don't split one cut into two uploads to keep the numbers tidy — that's the churn again.

The Chrome Web Store **rejects any upload whose version is not strictly greater** than the published one, and a rejected upload still costs you the round trip. `cut-release.sh` refuses to produce an artifact whose version isn't greater than `HEAD`'s.

### The manifest ↔ package.json version guard

The extension's version lives in **two** files that nothing links automatically:

- `extension/manifest.json` → `"version"` — the one Chrome actually reads.
- `extension/package.json` → `"version"` — the one humans and tooling read.

Only the manifest affects the shipped package, so a drift is silent: the zip installs fine and `package.json` just lies about what shipped.

**The guard is [`tests/unit/manifest.test.mjs`](../tests/unit/manifest.test.mjs) — the `manifest version matches extension/package.json version` case:**

```js
  it('manifest version matches extension/package.json version', () => {
    assert.equal(
      manifest.version,
      extPkg.version,
      `manifest.json (${manifest.version}) and package.json (${extPkg.version}) versions drifted`,
    );
  });
```

It runs in `npm run test:unit`, so it's gated on every PR by the `ci-unit` job in [`.github/workflows/ci-launch-gates.yml`](../.github/workflows/ci-launch-gates.yml). **`cut-release.sh` also runs that file directly, right after bumping** — so a drift fails the cut before a build is spent, rather than at PR time after the fact. This is also why you should never hand-edit one of the two files: bump through the script and both move together.

The same test file locks the manifest's permission posture and the CWS listing limits (132-char description, 75-char name, 12-char `short_name`), so a green run means more than the versions agreeing.

---

## 5. Cutting an extension release, step by step

Steps 1–5 are scripted. Steps 6–8 are deliberately manual.

### Before you start

```bash
git checkout main && git pull
npm ci && npm --prefix extension ci && npm --prefix webapp ci
```

`webapp/` matters even for an extension cut: `scripts/design-audit.mjs` resolves `postcss` from `webapp/node_modules`, and its R0 rule **fails rather than skips** when it can't. Without the install, a missing dependency looks like a real design regression. `cut-release.sh` checks for this in preflight and tells you.

Confirm `main` is green on all five CI jobs for the commit you're cutting (`ci-unit`, `ci-design-conformance`, `ci-extension-smoke`, `ci-webapp-visual-smoke`, `ci-integration`). Then walk [`RELEASE-RUNBOOK.md` §5](RELEASE-RUNBOOK.md)'s pre-release checklist — in particular that any migration this release depends on is **already applied to production**, and that the relevant part of [`CHECKLIST.md`](../CHECKLIST.md) has been smoke-tested by hand.

**A green PR does not mean the packaged specs ran.** CI gates 4 of the 20 Playwright specs. Every `tests/*-packaged.spec.ts` and `tests/loop-zip.spec.ts` — the ones that load the built artifact rather than the source tree, and therefore the ones most relevant to a release — runs **only locally**:

```bash
npx playwright test --project=extension tests/loop-packaged.spec.ts    # etc.
```

Run the packaged specs covering what's in this batch before cutting. The guards in step 3 catch a *missing* file in the package; only these catch a package that installs and then misbehaves.

### Step 1 — Preview the cut

```bash
scripts/cut-release.sh minor --dry-run
```

Mutates nothing. Prints the resolved target version and every step a real run would take. Its preflight is real, so this is also how you check tooling, deps and git state before committing to anything.

### Step 2 — Branch

```bash
git checkout -b release/ext-v1.1.0
```

The script warns if you're not on `main`, `release/*` or `hotfix/*`.

### Step 3 — Cut

```bash
scripts/cut-release.sh minor
```

In order, it:

1. **Preflights** — required tools, repo root, git state, `node_modules`, and **refuses on a dirty working tree** (outside the two version files). The zip is built from the working tree, so a dirty tree means shipping unreviewed code; `--allow-dirty` overrides if you truly mean to.
2. **Bumps both version files together**, rewriting only the version line so each diff is one line, then re-parsing with `jq` to prove the result is still valid JSON.
3. **Runs `tests/unit/manifest.test.mjs`** — the version-sync guard from §4, plus the permission posture and listing-limit assertions.
4. **Builds** via `npm --prefix extension run build`, which runs the in-build guards: `api-base-guard` (fails if `config.js` points at localhost), `content-globals-guard` (fails if a required content-script global was tree-shaken out), `page-globals-guard` (fails if a page bundle reads a content-script-only global), plus the stylesheet and classic-script packaging plugins.
5. **Verifies `dist/`** — `bundle-resolve-guard.mjs` (every self-reference resolves) and `design-audit.mjs --dist`.
6. **Packages** a versioned zip into `release-artifacts/` (gitignored — build output, never committed).
7. **Verifies the artifact, not `dist/`** — `unzip -t`, the manifest **inside** the zip (version matches the cut, `manifest_version` is 3, `name` is exactly `ClipMark` — the casing has been wrong in a shipped listing before), no `node_modules/`/`.env`/`.git/`/source maps, `bundle-resolve-guard` re-run **against the extracted zip**, and a scan for secret-shaped literals. The extension bundle carries no keys at all today, so any JWT- or key-shaped string in it is a regression, and it would be public.
8. **Writes a `sha256`** next to the zip in `sha256sum -c` format, and verifies it.

Then it prints the artifact path, the sha256, and the manual steps left.

**If it fails partway, just run it again.** It won't double-bump: when the working tree's version already differs from `HEAD`'s, it adopts that in-flight version instead of bumping on top of it. Re-running `patch` three times against a `1.0.5` HEAD yields `1.0.6` every time, not `1.0.8`. That accidental double-bump is a real contributor to version thrash.

Other flags: `--set-version X.Y.Z` for an explicit target, `--no-bump` to build/verify/package at the current version without touching a version number (verification only — do not upload it; §7 uses this), `--skip-design-audit` to cut past a design failure you've deliberately accepted, `--help`.

### Step 4 — Install the artifact and test it

Load the **unzipped artifact** at `chrome://extensions` (Developer Mode → Load unpacked), not `extension/` or `extension/dist/`. Nearly every bug class the guards in step 3(7) exist for was invisible in source and only appeared in the packaged bytes.

Walk the relevant part of [`CHECKLIST.md`](../CHECKLIST.md) against this build.

### Step 5 — PR and land

Open a PR for the release branch (bump commit only) and merge it. `main` is protected — PR, not a direct push, regardless of whether admin credentials would let it through.

### Step 6 — Tag the exact commit

```bash
git checkout main && git pull
git tag -a ext-v1.1.0 -m "Extension v1.1.0 — <one-line summary>"
git push origin ext-v1.1.0
```

Tag **after** merging, on the merge commit. This is what lets you find "what code shipped as CWS 1.1.0" months later — the store keeps the zip but tells you nothing about its provenance.

### Step 7 — Update `CHANGELOG.md`

Format and rationale in [`RELEASE-RUNBOOK.md` §1](RELEASE-RUNBOOK.md). `git log ext-v1.0.5..HEAD --oneline` reconstructs the batch. Write it before uploading, while you still remember what's in the train.

`CHANGELOG.md` **does not exist yet** — the first cut under this process creates it. Start it at that release rather than back-filling 1.0.0–1.0.5 from memory; the commit log is the record for everything before the train.

### Step 8 — Upload to the Chrome Web Store — **manual, owner only**

**This step is never automated, and that's a deliberate decision, not a gap.**

Follow [`RELEASE-RUNBOOK.md` §3, steps 3–5](RELEASE-RUNBOOK.md) for the dashboard walkthrough (item ID, the Title-casing check, staged rollout, submit). Then §3b for monitoring the rollout.

Why it stays manual:

- **It's irreversible.** There is no unpublish. The only correction is another version through another review cycle. An automated path could push an unreviewed build to every user with no human in the loop.
- **It force-updates everyone.** Chrome installs silently, without consent. That deserves an intentional human action.
- **The dashboard has fields the repo can't see** — the Title casing, the rollout percentage, the listing copy. A CWS API upload skips all of them.
- **No store credential should exist here.** This repo is **public**. Automating the upload means a CWS OAuth client secret and refresh token in Actions secrets, giving anything that can trigger a workflow the power to publish. Not having the credential at all is a stronger guarantee than guarding it. There is no store API key in this repo or its CI, by design.

The `release-train.yml` workflow (§7) exists so that the *build* is always ready and this manual step is as short as possible — never so that it can be skipped.

---

## 6. Rollback

Mechanics are in [`RELEASE-RUNBOOK.md` §6](RELEASE-RUNBOOK.md), which stays authoritative. What matters for the train:

**Webapp — rollback is cheap, so use it.** Vercel → Deployments → last known-good → Redeploy. Seconds. Then `git revert` for the record. Because it's this cheap, a webapp fix is almost never a reason to touch the extension.

**Extension — there is no rollback.** Say it plainly: you cannot recall a published version. Your only levers are:

1. **Mid-staged-rollout: halt it.** The single most valuable reason to always stage. Remaining users never receive the bad version. This is the closest thing to a rollback the extension has, and it's only available if you staged in the first place — see step 8.
2. **Already at 100%: ship forward.** A new, higher version with the fix or a revert, through a full review cycle. Hours to days during which every user has the bad build.

Because (2) is so expensive, the asymmetry drives the whole process: **an extension release is a one-way door.** A staged rollout you didn't need costs you a day of ramping; one you needed and skipped costs a review cycle with every user on a broken build. Always stage.

**A rollback does not entitle a same-day re-release.** Halt, diagnose properly, and put the fix on the next train unless it independently meets the §3 hotfix criteria. "We just broke it, so we must fix it now" is how 1.0.3 became 1.0.5.

**Database migrations roll back independently of code** — reverting a commit does not undo a schema change. [`DEPLOYMENTS.md` §3](DEPLOYMENTS.md) and [`RELEASE-RUNBOOK.md` §4](RELEASE-RUNBOOK.md).

---

## 7. `release-train.yml` — the always-ready draft build

[`.github/workflows/release-train.yml`](../.github/workflows/release-train.yml) builds `main`'s extension package and parks it as a **draft** GitHub Release under the rolling tag `ext-build-latest`.

**Why it's worth having:** a hotfix's slowest step is often "get a verified package in hand." This means one always exists. It's also a standing check that `main` still *packages* — a class of breakage (§5 step 3's guards) that no source-level test catches.

**How the risks are contained:**

- It runs **`scripts/cut-release.sh --no-bump`** — the same code path as a real cut, so the workflow cannot drift from the local tooling, and `--no-bump` means it can never touch a version number or start a release.
- **It never uploads to the Chrome Web Store**, and no store credential exists to make that possible (§5 step 8).
- The release is a **draft prerelease** under a **non-semver tag**, so it can't be mistaken for `ext-vX.Y.Z`. Drafts are visible only to collaborators, and carry no git tag until published. Its release notes state outright that it must not be uploaded — its version is whatever `main` carries, un-bumped, which the store would reject as non-increasing anyway.
- **`contents: write` is scoped to that one job**, the workflow's `permissions` default is `read`, and it's `if`-guarded to the canonical repo so forks can't run it.
- It keeps **one** rolling draft rather than accumulating one per run, deleting only a draft under its own tag — it cannot touch a published release.

**The cadence deliberately differs from the cut:** the workflow runs **weekly** on Tuesday while the cut is **fortnightly**. Every-other-week cron needs ISO-week parity arithmetic inside the job, and the off-week run is free signal rather than dead time. The build is not the release — only a human running `cut-release.sh` with a bump type cuts one.

**A draft build is never what you upload.** The store package comes from a tagged commit, cut by a human, per §5. Use the draft for testing and for handing a build to a tester.

---

## 8. Quick reference

```bash
# Preview a cut — mutates nothing
scripts/cut-release.sh minor --dry-run

# Cut a train release (fixes + features)      → MINOR
scripts/cut-release.sh minor

# Cut a train release (fixes only) or a hotfix → PATCH
scripts/cut-release.sh patch

# Verify main packages cleanly, no version change
scripts/cut-release.sh --no-bump

scripts/cut-release.sh --help
```

| Situation | Lane |
|---|---|
| Webapp bug, any severity | Merge to `main`. Ships immediately. No train, no version bump. |
| Extension bug: security, privacy, data loss, payments, dead core flow, CWS policy | **Hotfix** — §3. Staged rollout mandatory. |
| Extension bug: cosmetic, has a workaround, narrow config, "one-line fix" | Next train. |
| New extension feature | Next train, MINOR. |
| Nothing worth shipping this Tuesday | **Skip the train.** |

| | |
|---|---|
| Extension cut | Every second **Tuesday** |
| Draft build | Weekly Tuesday, 13:00 UTC (`release-train.yml`) |
| Webapp | Continuous, on merge |
| CWS upload | **Manual, owner only — never automated** |
| Version guard | `tests/unit/manifest.test.mjs`, gated by `ci-unit` |
