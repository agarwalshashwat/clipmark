# ClipMark — Release / Update Runbook

**Purpose:** the practical, repeatable playbook for shipping updates **after launch** — webapp, extension, and database migrations. This is not the one-time launch plan (`docs/release/LAUNCH_PLAN.md`, `LAUNCH_DAY_RUNBOOK.md`, `LAUNCH_GO_NO_GO_CHECKLIST.md`, `RELEASE_POLICY.md` cover that). This doc is what you follow for the 50th release, not the first.

> **Cadence, hotfix criteria and the cut tooling now live in [`docs/RELEASE-PROCESS.md`](RELEASE-PROCESS.md).** That doc decides *when* a release ships and *what qualifies* to skip the queue (the extension ships on a fortnightly Tuesday train; the webapp stays continuous), and `scripts/cut-release.sh` automates §3's Step 1 and Step 2 below with added artifact verification. This runbook remains authoritative on the **mechanics** — dashboard fields, review timing, auto-update behaviour, staged rollout, Sentry monitoring, migrations — and RELEASE-PROCESS.md defers to it throughout. Where the two overlap on *scheduling*, RELEASE-PROCESS.md wins.

**Companion docs:** [`docs/DEPLOYMENTS.md`](DEPLOYMENTS.md) (environments + migration mechanics in full detail — this runbook summarizes the release-flow parts and defers to it for the how), [`docs/RELEASE-PROCESS.md`](RELEASE-PROCESS.md) (branch/merge/rollback *rules* — it replaced the old `docs/release/RELEASE_POLICY.md`), [`CHECKLIST.md`](../CHECKLIST.md) (manual extension regression checklist), [`docs/gtm/chrome-web-store-listing-FIELDS.md`](gtm/chrome-web-store-listing-FIELDS.md) (store listing copy).

---

## 0. The two independently-shippable surfaces

ClipMark has two release surfaces that ship on **different cadences and different mechanisms** — don't conflate them:

| Surface | Ships via | Cadence | Review gate |
|---|---|---|---|
| **Webapp** (`webapp/`) | Vercel auto-deploy on merge to `main` | As often as you merge — can be same-day | None (your own CI gates only) |
| **Extension** (`extension/`) | Manual zip upload to the Chrome Web Store dev console | Batched — bump version, zip, submit, wait for review | **Google review**, hours to days |

A webapp change and an extension change can ship independently. A webapp-only bugfix does not need an extension release, and vice versa. Only coordinate the two when a change spans both (e.g. a new `externally_connectable` message contract) — in that case, ship the webapp side first if it's backward-compatible with the *old* extension, or the extension side first if the webapp change would break old extension users, and always confirm compatibility with whichever version is still live for users who haven't updated yet (see §2 on Chrome's auto-update lag).

---

## 1. Versioning + Changelog convention

**Semver, applied independently per surface:**

- **Extension** (`extension/manifest.json` `version`, mirrored in `extension/package.json` `version`) — `MAJOR.MINOR.PATCH`. Chrome Web Store requires the version to strictly increase on every upload (no re-uploading the same version number). Current: `1.0.2`.
  - Note on `1.0.2`: an earlier `1.0.2` was tagged in the repo but **never uploaded to the Web Store**, so the number was still free and the combined restyle release reuses it. Reusing a version number is only safe when the store has never seen it — the live listing is `1.0.1`, and `1.0.2 > 1.0.1`, so the upload is accepted. Check the store listing, not just git history, before doing this again.
  - **PATCH** — bugfix, no new user-facing behavior (e.g. fix a crash, correct copy).
  - **MINOR** — new feature, backward-compatible (e.g. a new keyboard shortcut, a new export format).
  - **MAJOR** — breaking change to stored data shape, or a change that requires the webapp to be updated in lockstep (rare — coordinate carefully, see §0).
- **Webapp** (`webapp/package.json` `version`) — same semver rules, but this version number is informational only (Vercel doesn't gate on it). Bump it as a changelog anchor, not because anything reads it at runtime. Current: `0.1.0`.

**Git tags — one per extension release** (the webapp doesn't need its own tag since every merge to `main` is already a discrete, identifiable Vercel deployment with its own commit SHA):

**You do not do this by hand any more** — `scripts/cut-release.sh` step 8 creates and pushes an annotated `vX.Y.Z` tag at the built commit, with the artifact's sha256 in the message. [`RELEASE-PROCESS.md` §5 step 6](RELEASE-PROCESS.md) owns the rule; this is the summary:

```
v1.1.0   annotated, at the commit whose extension/dist/ was zipped and uploaded,
         message carries the zip filename + sha256.   Immutable.
```

It tags the exact commit whose `extension/dist/` you zipped and uploaded — that's what lets you answer "what code shipped as CWS version 1.1.0" months later, and it's the rollback path: check out the tag, rebuild. (The repo also has a `launch-candidate-1` tag from the pre-launch phase — unrelated, not a release anchor. An earlier draft of this doc proposed an `ext-v` prefix; it was never used and the convention is plain `vX.Y.Z`.)

**CHANGELOG** — keep a `CHANGELOG.md` at the repo root (create it with your first post-launch release if it doesn't exist yet), one section per release, newest first:

```markdown
## [Extension 1.1.0] — 2026-08-15
### Added
- Keyboard shortcut for Active Recall start.
### Fixed
- Duplicate bookmark rejection off-by-one at exact video end.

## [Webapp] — 2026-08-12
### Fixed
- Referral credit now reverses correctly on refund.
```

Write the entry **before** you tag/upload, from the PR titles merged since the last release — `git log <last-tag>..HEAD --oneline` is the fastest way to reconstruct the list.

---

## 2. Webapp updates

### The flow

```
branch → PR → Vercel Preview (UI check) → merge to main → Vercel deploys Production automatically
```

This is already documented in full in [`DEPLOYMENTS.md` §2](DEPLOYMENTS.md#2-the-everyday-flow) — the short version: merging to `main` triggers a Vercel build (`next build`, no migrations), and Production updates automatically. No manual "deploy" step exists or is needed for code.

**If your change includes a database migration, the deploy will NOT apply it** — that's a separate, deliberate manual step (§4). Ship the migration *before or alongside* the code that depends on it, per the sequencing note in §4.

### Verifying the deploy succeeded

1. **Vercel dashboard** → your project → the deployment for the merge commit → confirm status is **Ready**, not **Error**. (This also shows as a GitHub commit-status check on the merge commit itself — you don't have to leave GitHub to see it.)
2. **Smoke the live site** — load `https://clipmark.mithahara.com`, sign in, hit the specific page/flow your change touched. For anything touching checkout, do this locally instead (§6 of `DEPLOYMENTS.md` — Dodo runs `live_mode` on every Vercel build, so don't test-purchase against Production).
3. **Check the build log** in Vercel for the deployment if anything looks off — Next.js build warnings/errors show there even if the build technically "succeeded."

### Sentry monitoring post-deploy

Webapp errors report to the `clipmark-web` Sentry project (org `mithahara`), tagged automatically by `NEXT_PUBLIC_VERCEL_ENV` (production vs. preview) and by commit SHA — full config in [`DEPLOYMENTS.md` §6c](DEPLOYMENTS.md#6c-error-monitoring-sentry).

**Right after a deploy that touches meaningfully-used code paths:**
1. Open the `clipmark-web` Sentry project, filter to the last 15–30 minutes.
2. Look for **new issue types** (not just volume) — a brand-new error signature appearing right after a deploy is the strongest signal something in that release broke, even if the count is still low.
3. If you deployed a fix for a *known* issue, confirm that issue's event rate actually drops to zero post-deploy — don't just assume the fix worked.

Tracing/replay/profiling are deliberately off (privacy — see `DEPLOYMENTS.md`), so Sentry here is error-signal only, not a performance dashboard. There's no separate uptime/APM tool in this stack — Sentry's issue stream is the primary post-deploy signal, plus manual smoke-testing.

### Rollback

Two options, in order of speed:

1. **Vercel "Redeploy" a previous deployment** (dashboard → Deployments → find the last known-good one → **⋯ → Redeploy**). Fastest — seconds to a couple of minutes, no git history change. Use this when you need Production back to known-good *immediately* and will sort out the fix afterward.
2. **`git revert` the bad commit(s) and push to `main`** — this is the "correct" long-term rollback (git history reflects reality, and the next merge doesn't accidentally re-introduce the bug). Use this once the immediate fire is out via option 1, or from the start if there's no urgency.

**If the bad release included a migration that already ran against prod**, code rollback alone doesn't undo the schema change — see §5 for the DB-specific rollback procedure. Roll back code and database independently; don't assume reverting the commit reverts the migration.

---

## 3. Extension updates

Step-by-step, in order:

### Step 1 — Bump the version

Edit **both** files (they're independent fields, not linked, so both need the same value):

- `extension/manifest.json` → `"version"` field
- `extension/package.json` → `"version"` field

Follow the semver rule from §1. Chrome Web Store **rejects an upload whose version isn't strictly greater** than the currently-published version, so don't forget this step — a failed upload with a stale version number is the most common self-inflicted delay here.

### Step 2 — Build the release zip

```bash
make ext-zip
```

This runs `ext-build` (fresh `vite build` → `extension/dist/`) then zips `extension/dist/` into `clipmark-extension.zip` at the repo root. **Never zip the repo root or `extension/` source directly** — the Makefile target's own comment explains why: the dev manifest loads `src/*.js` as ES modules via classic content-script tags, which breaks on install, and zipping the source tree also drags in `node_modules`. `make ext-zip` always rebuilds `dist/` first specifically so the zip can't go stale relative to current source — trust it, don't skip the rebuild to save time.

Sanity-check before uploading:
```bash
unzip -p clipmark-extension.zip manifest.json | grep '"version"'
```
Confirm this matches what you set in Step 1 — the zip only reflects what was in `extension/dist/` at build time.

### Step 3 — Upload to the Chrome Web Store developer dashboard

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Open the ClipMark item — **item ID `iboippnihpcnnglgboaiedaiimbiolgg`** (currently published to testers only, i.e. beta).
3. **Package** tab → **Upload new package** → select `clipmark-extension.zip` from the repo root.
4. **Before submitting, re-check the Store Listing tab's Title field still reads exactly `ClipMark`** (capital M) — this was previously wrong (`Clipmark`, lowercase m) and was fixed in [PR #58](https://github.com/agarwalshashwat/clipmark/pull/58) on the *code* side (`manifest.json`'s `name`/`short_name`); the *dashboard's* Title field is a separate value that doesn't auto-sync from the manifest and must be checked by hand on every listing edit. If it's ever wrong again, see [`docs/gtm/chrome-web-store-listing-FIELDS.md`](gtm/chrome-web-store-listing-FIELDS.md) for the exact correct copy to paste back in.
5. (Optional but recommended for anything riskier than a copy fix) Set a **staged rollout percentage** — see §3a below — instead of defaulting to 100%.
6. **Submit for review.**

### Step 4 — Review timing

Google's review time is not a fixed SLA. Realistically:
- **Minor updates with no new permissions**: typically a few hours to ~1–2 business days.
- **Anything adding a new permission, a new host permission, or touching `content_scripts`/`externally_connectable`**: can take longer and is more likely to get a manual (not automated) review pass — budget several days, not hours.
- There's no dashboard countdown; you'll get an email when it's approved or rejected. If rejected, the email states the specific policy reason — fix and re-upload as a **new** version number (you cannot re-submit the same version).

**Don't plan a release around a specific ship date if it depends on same-day approval** — for anything time-sensitive (e.g. coordinating with a webapp change), submit with buffer days ahead, not the day of.

### Step 5 — What happens after approval: silent auto-update

Once approved and published, **you don't push the update to users** — Chrome pulls it. Chrome periodically checks each installed extension's update manifest in the background (roughly every few hours by default; exact timing is Chrome's internal scheduler, not something ClipMark controls) and silently downloads + installs the new version with no user action and no visible prompt in the common case.

**Practical implication:** after publishing, your userbase is on a **mix of old and new versions for hours to a few days**, not instantly on the new one. Any breaking change (especially one paired with a webapp change per §0) must tolerate that overlap window — don't ship a webapp change that assumes 100% of users are already on the new extension version the moment you hit publish.

### 3a — Staged / percentage rollout

The Chrome Web Store dashboard supports rolling out a new package to a **percentage of existing users** before going to 100%, directly in the same **Package** upload flow (there's a rollout-percentage control alongside the version you're publishing). Use this for anything higher-risk than a copy/asset fix:

1. Upload and submit as normal (Steps 1–4).
2. Set the rollout percentage (e.g. start at 10–25%) instead of 100%.
3. Watch the `clipmark-extension` Sentry project (§3b) for the rollout window — if error rates hold steady, increase the percentage in the dashboard; if they spike, halt the rollout without shipping to the remaining users.
4. Ramp to 100% once you're confident, or roll back (§5) if not.

This is the main lever you have for de-risking an extension release, given there's no way to instantly force-push or instantly revert once Chrome starts distributing a version.

### 3b — Monitoring an extension release

Extension errors report to the separate **`clipmark-extension`** Sentry project (background worker, side panel, content script) — deliberately split from `clipmark-web` so YouTube-page third-party noise doesn't pollute the webapp's issue stream (full rationale in `DEPLOYMENTS.md` §6c). After a rollout starts, watch this project the same way you'd watch `clipmark-web` post-webapp-deploy: new issue signatures appearing right as the rollout percentage climbs is your signal to pause or roll back.

---

## 4. Database migrations

Migrations are their own deliberate, manual, local-first flow — **this runbook does not restate the mechanics**, they're fully specified in [`DEPLOYMENTS.md` §3](DEPLOYMENTS.md#3-database-migrations-deliberate-local-first). The short version, for release sequencing purposes:

1. Write the migration (`webapp/migrations/NNN_description.sql`, next number, never edit an already-applied one).
2. Test it against **local Supabase** (`supabase start` + `db:bootstrap` + `db:migrate`), run the app locally against it.
3. **Back up production first** — Free tier has no automatic backups. `pg_dump '<prod DATABASE_URL>' > backup_$(date +%F).sql`, or use the Supabase dashboard SQL editor.
4. Apply to production by hand: `DATABASE_URL='<prod URI>' npm run db:migrate` (or `make db-migrate` with `DATABASE_URL` exported).
5. **Only then** merge/deploy the webapp code that depends on the new schema — deploying code that assumes a column/table exists *before* the migration has run against prod will 500 on every request that touches it. If the code is already written and merged ahead of the migration for review-flow reasons, that's fine as long as the feature path is gated (feature flag, or simply not yet linked from the UI) until the migration is confirmed applied.

**Rollback** for a migration is also covered in `DEPLOYMENTS.md` (no automatic "down" migrations — write a new forward migration that undoes the change, or restore the pre-migration backup in an emergency). Restated here only because it belongs in the same "what do I do if a release goes wrong" mental checklist as §5 below.

---

## 5. Pre-release checklist

Run through this before tagging/uploading **any** release (webapp or extension) that isn't a trivial copy fix:

- [ ] **CI green on `main`** for the commit you're releasing — `ci-unit`, `ci-extension-smoke`, `ci-webapp-visual-smoke`, `ci-integration` (all four, per `.github/workflows/ci-launch-gates.yml`). Check via `gh pr checks <PR#>` before merge, or the commit's status checks on GitHub after.
- [ ] **Extension zip validates** — `make ext-zip` completes without the Makefile's own guard failing (`extension/dist/manifest.json missing` means `ext-build` didn't run cleanly; fix before zipping), and the version inside the zip matches what you intend to upload (§3, Step 2's sanity check).
- [ ] **Relevant tests pass locally**, not just in CI — at minimum re-run the test layer(s) your change touches (`npm run test:unit`, `npm run test:yt`, `npm run test:visual`, `npm run test:integration` — see the root `README.md`/`CLAUDE.md` for which layer maps to which kind of change).
- [ ] **Any migration for this release has already been applied to production** (§4) — never ship extension/webapp code that depends on a schema change you haven't run against prod yet.
- [ ] **Manual smoke test** on the actual surface you changed — for extension changes, at minimum the relevant section of `CHECKLIST.md`; for webapp changes, the specific page/flow, done against the Vercel Preview for UI-only changes or locally for anything touching auth/payments/DB (per `DEPLOYMENTS.md` §1's Preview-is-UI-only-review rule).
- [ ] **Confirm the release tag exists** — extension: `vX.Y.Z`, created automatically by `cut-release.sh` per §1; webapp: no separate tag needed, the merge commit is the identifier and **update `CHANGELOG.md`** before or immediately after.

---

## 6. Rollback procedures, by surface

| Surface | How | When to use it |
|---|---|---|
| **Webapp** | Vercel dashboard → Deployments → previous good deploy → **Redeploy** (fastest), or `git revert` + push to `main` (correct long-term) | Sentry shows a new error signature spiking right after deploy, or a smoke test fails post-deploy |
| **Extension** | If mid-staged-rollout (§3a): halt the rollout percentage in the dashboard immediately — remaining users never get the bad version. If already at 100%: upload a new package with a **higher** version number containing the fix or a revert of the offending change — there is no way to "unpublish" a version already distributed to users, only ship a newer one | `clipmark-extension` Sentry shows a spike tied to the new version, or manual testing on the published (not dev-loaded) package surfaces a regression |
| **Database migration** | Write a new forward migration that undoes the change (preferred), or restore the pre-migration backup taken in §4 step 3 (emergency only — loses any writes made since the backup) | The migration itself is the root cause (e.g. a bad constraint, a lossy column change) — code-level rollback won't fix this |

### Responding to a Sentry spike after a release

1. **Confirm it's actually the release** — filter the issue to "first seen" and check the timestamp against your deploy/publish time. A spike that started before your release is a coincidence, not a regression from it.
2. **Read the actual error**, not just the count — one new issue type firing 500 times in 10 minutes (e.g. a hot-path bug hit by every user) is a different severity than 50 different rare issue types each firing once (noise floor rising slightly, often not release-related).
3. **Decide: hotfix or rollback**, using the same thresholds spirit as `docs/release/RELEASE_POLICY.md`'s launch-era rollback rules (checkout success rate, webhook failure rate, or core-flow breakage crossing a real threshold, sustained for a real window — not a single noisy data point). If it's a clear, isolated regression with an obvious one-line fix, a fast-follow hotfix release is often faster than a rollback for the webapp (redeploy is nearly as fast as rollback anyway); for the extension, rollback (halt rollout) is almost always faster than a fixed re-upload + new review cycle, so prefer halting the rollout first and shipping the fix as a normal follow-up release.
4. **Don't declare it resolved from the graph alone** — after mitigating (redeploy, rollback, or hotfix), re-check the specific issue's event rate actually drops to zero, the same way you'd verify a fix landed correctly in §2's "verifying the deploy succeeded."
