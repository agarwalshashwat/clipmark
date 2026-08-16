#!/usr/bin/env bash
#
# cut-release.sh — cut an extension release candidate for the Chrome Web Store.
#
# The release train (docs/RELEASE-PROCESS.md) batches extension releases because
# every Web Store upload costs a Google review and force-updates every user. This
# script is the mechanical half of that: it does everything up to — and
# deliberately NOT including — the upload. The upload stays a manual owner step in
# the CWS dashboard, so there is no store API key anywhere in this repo or its CI.
#
# What it does, in order:
#   1. Preflight  — tools, repo root, git state, resolve the target version.
#   2. Bump       — extension/manifest.json AND extension/package.json together,
#                   then prove they match via tests/unit/manifest.test.mjs.
#   3. Build      — `vite build`, which runs the in-build guards (api-base,
#                   content-globals, page-globals, style/script packaging).
#   4. Verify     — bundle-resolve-guard + design audit against dist/.
#   5. Package    — versioned zip into release-artifacts/.
#   6. Verify the ARTIFACT — `unzip -t`, the manifest *inside* the zip, hygiene
#                   scan, and bundle-resolve-guard re-run against the extracted
#                   zip (the bytes that actually ship, not dist/).
#   7. Checksum   — sha256, `sha256sum -c`-compatible.
#   8. Tag        — annotated `vX.Y.Z` at the built commit, sha256 in the message,
#                   pushed to origin. This is the rollback anchor.
#
# Usage:
#   scripts/cut-release.sh patch                 # 1.0.5 -> 1.0.6
#   scripts/cut-release.sh minor                 # 1.0.5 -> 1.1.0
#   scripts/cut-release.sh patch --dry-run       # preflight + plan, mutate nothing
#   scripts/cut-release.sh --no-bump             # build/verify/package at the current version
#   scripts/cut-release.sh --set-version 1.2.0   # explicit target
#   scripts/cut-release.sh patch --no-tag        # skip the tag (you own the anchor then)
#   scripts/cut-release.sh patch --no-push-tag   # tag locally, push it yourself
#   scripts/cut-release.sh --help
#
# Tags are immutable. The script refuses — before building — if `vX.Y.Z` already
# exists locally or on origin, and never moves an existing tag: it anchors a build
# that may already be installed in users' browsers. `--no-bump` never tags.
#
# Idempotency: re-running after a mid-flight failure does NOT double-bump. If the
# working tree's version already differs from HEAD's, the script adopts that
# in-flight version as the target instead of bumping again — the exact failure
# mode behind the 1.0.2 -> 1.0.5 thrash this process exists to stop.
#
set -euo pipefail

# ── Output helpers ────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; RED=''; GREEN=''; YELLOW=''; BLUE=''; RESET=''
fi

step()  { printf '\n%s──%s %s %s%s\n' "$BLUE" "$RESET" "$BOLD$*$RESET" "$BLUE" "$RESET"; }
ok()    { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
info()  { printf '  %s•%s %s\n' "$DIM" "$RESET" "$*"; }
warn()  { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
die()   { printf '\n  %s✗%s %s\n\n' "$RED" "$RESET" "$*" >&2; exit 1; }

usage() {
  sed -n '3,35p' "$0" | sed 's|^# \{0,1\}||'
  exit "${1:-0}"
}

# ── Argument parsing ──────────────────────────────────────────────────────────
BUMP=''
SET_VERSION=''
DRY_RUN=0
NO_BUMP=0
NO_TAG=0
PUSH_TAG=1
ALLOW_DIRTY=0
SKIP_DESIGN_AUDIT=0

while [ $# -gt 0 ]; do
  case "$1" in
    patch|minor|major)
      [ -n "$BUMP" ] && die "bump type given twice ('$BUMP' then '$1')"
      BUMP="$1" ;;
    --set-version)
      shift; [ $# -gt 0 ] || die "--set-version needs a version (e.g. 1.2.0)"
      SET_VERSION="$1" ;;
    --set-version=*)  SET_VERSION="${1#*=}" ;;
    --dry-run)        DRY_RUN=1 ;;
    --no-bump)        NO_BUMP=1 ;;
    --no-tag)         NO_TAG=1 ;;
    --no-push-tag)    PUSH_TAG=0 ;;
    --allow-dirty)    ALLOW_DIRTY=1 ;;
    --skip-design-audit) SKIP_DESIGN_AUDIT=1 ;;
    -h|--help)        usage 0 ;;
    *)                printf '%sunknown argument: %s%s\n\n' "$RED" "$1" "$RESET" >&2; usage 1 ;;
  esac
  shift
done

# Mutually exclusive ways of choosing a version.
selectors=0
[ -n "$BUMP" ]        && selectors=$((selectors + 1))
[ -n "$SET_VERSION" ] && selectors=$((selectors + 1))
[ "$NO_BUMP" -eq 1 ]  && selectors=$((selectors + 1))
if [ "$selectors" -gt 1 ]; then
  die "pick one of: a bump type (patch|minor|major), --set-version, or --no-bump"
fi
if [ "$selectors" -eq 0 ]; then
  printf '%sno bump type given.%s Pass patch, minor, major, --set-version X.Y.Z, or --no-bump.\n\n' \
    "$RED" "$RESET" >&2
  usage 1
fi

# ── Locate the repo ───────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

MANIFEST="extension/manifest.json"
EXT_PKG="extension/package.json"
EXT_DIST="extension/dist"
ARTIFACT_DIR="release-artifacts"
VERSION_TEST="tests/unit/manifest.test.mjs"

step "Preflight"

for f in "$MANIFEST" "$EXT_PKG" "$VERSION_TEST" scripts/design-audit.mjs \
         extension/scripts/bundle-resolve-guard.mjs; do
  [ -f "$f" ] || die "expected $f at the repo root ($REPO_ROOT) — is this the clipmark repo?"
done

for tool in git jq node npm zip unzip sha256sum; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' is not installed but is required."
done
ok "required tools present: git jq node npm zip unzip sha256sum"

# Dependency checks belong here, not at the step that needs them — a missing
# install should not surface two minutes into a build that was going to fail.
[ -d extension/node_modules ] \
  || die "extension/node_modules is missing. Run 'npm --prefix extension ci' first."
if [ "$SKIP_DESIGN_AUDIT" -eq 0 ] && [ ! -d webapp/node_modules/postcss ]; then
  die "scripts/design-audit.mjs resolves postcss from webapp/node_modules, which is missing.
      Run 'npm --prefix webapp ci' first, or pass --skip-design-audit to cut without the
      DESIGN.md gate (the audit's R0 CSS-syntax rule FAILS rather than skips when postcss
      cannot be resolved, so a missing install looks like a real design regression)."
fi
ok "node_modules present for the steps that need them"

git rev-parse --git-dir >/dev/null 2>&1 || die "not a git repository."
GIT_SHA="$(git rev-parse --short HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
info "repo:   $REPO_ROOT"
info "commit: $GIT_SHA on $BRANCH"

case "$BRANCH" in
  main|release/*|hotfix/*) ;;
  *) warn "branch '$BRANCH' is not main, release/*, or hotfix/*. Cut from a release branch off main (see docs/RELEASE-PROCESS.md §5)." ;;
esac

# Read the current versions BEFORE touching anything.
HEAD_VERSION="$(git show "HEAD:$MANIFEST" 2>/dev/null | jq -r '.version' || echo '')"
WT_VERSION="$(jq -r '.version' "$MANIFEST")"
WT_PKG_VERSION="$(jq -r '.version' "$EXT_PKG")"

[ -n "$WT_VERSION" ] && [ "$WT_VERSION" != "null" ] || die "$MANIFEST has no version field."

semver_ok() { [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; }
semver_ok "$WT_VERSION" || die "$MANIFEST version '$WT_VERSION' is not MAJOR.MINOR.PATCH."

info "manifest.json version:    $WT_VERSION"
info "ext package.json version: $WT_PKG_VERSION"
if [ "$WT_VERSION" != "$WT_PKG_VERSION" ]; then
  warn "the two versions have DRIFTED ($WT_VERSION vs $WT_PKG_VERSION) — this cut writes both to the target, which repairs it."
fi

# Refuse to package an unreviewed working tree. The zip is built from whatever is
# on disk, so a dirty tree means shipping code that never went through a PR. The
# two version files are exempt: this script writes them, and a re-run after a
# failed build legitimately finds them already modified.
DIRTY="$(git status --porcelain -- . \
  | grep -v -E "^.. (${MANIFEST}|${EXT_PKG})$" \
  | grep -v -E "^\?\? (${ARTIFACT_DIR}/|${EXT_DIST}/)" || true)"
if [ -n "$DIRTY" ]; then
  if [ "$ALLOW_DIRTY" -eq 1 ]; then
    warn "working tree is dirty, continuing because --allow-dirty was passed:"
    printf '%s\n' "$DIRTY" | sed 's/^/      /' >&2
  else
    printf '\n  %s✗%s working tree has changes outside the version files:\n\n' "$RED" "$RESET" >&2
    printf '%s\n' "$DIRTY" | sed 's/^/      /' >&2
    printf '\n      The zip is built from the working tree, so this would ship unreviewed\n' >&2
    printf '      code to every user. Commit, stash, or pass --allow-dirty.\n\n' >&2
    exit 1
  fi
else
  ok "working tree clean (outside the version files)"
fi

# ── Resolve the target version ────────────────────────────────────────────────
bump_version() {
  local v="$1" kind="$2" maj min pat
  IFS=. read -r maj min pat <<<"$v"
  case "$kind" in
    patch) pat=$((pat + 1)) ;;
    minor) min=$((min + 1)); pat=0 ;;
    major) maj=$((maj + 1)); min=0; pat=0 ;;
  esac
  printf '%s.%s.%s' "$maj" "$min" "$pat"
}

# `sort -V` puts the greater version last, so "strictly greater" means: not equal,
# and the target sorts last.
version_gt() {
  [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -1)" = "$1" ]
}

REUSED_INFLIGHT=0
if [ "$NO_BUMP" -eq 1 ]; then
  TARGET="$WT_VERSION"
elif [ -n "$SET_VERSION" ]; then
  semver_ok "$SET_VERSION" || die "--set-version '$SET_VERSION' is not MAJOR.MINOR.PATCH."
  TARGET="$SET_VERSION"
elif [ -n "$HEAD_VERSION" ] && [ "$HEAD_VERSION" != "null" ] && [ "$WT_VERSION" != "$HEAD_VERSION" ]; then
  # Idempotency: a previous run already bumped the working tree and then failed.
  # Adopt that version instead of bumping on top of it.
  TARGET="$WT_VERSION"
  REUSED_INFLIGHT=1
  warn "working tree is already bumped ($HEAD_VERSION at HEAD -> $WT_VERSION on disk)."
  warn "adopting $WT_VERSION as the target instead of applying another '$BUMP' bump."
  warn "pass --set-version to override."
else
  TARGET="$(bump_version "$WT_VERSION" "$BUMP")"
fi

semver_ok "$TARGET" || die "resolved target version '$TARGET' is not MAJOR.MINOR.PATCH."

# The Chrome Web Store rejects an upload whose version is not strictly greater
# than the published one. HEAD's version is the best proxy we have for that.
if [ "$NO_BUMP" -eq 0 ] && [ -n "$HEAD_VERSION" ] && [ "$HEAD_VERSION" != "null" ]; then
  if ! version_gt "$TARGET" "$HEAD_VERSION"; then
    die "target $TARGET is not greater than $HEAD_VERSION (HEAD). The Chrome Web Store rejects a non-increasing version."
  fi
fi

ZIP_PATH="$ARTIFACT_DIR/clipmark-extension-$TARGET.zip"
SUM_PATH="$ZIP_PATH.sha256"
TAG_NAME="v$TARGET"

# --no-bump builds at the *existing* version to prove main still packages. That
# artifact is never uploaded, so tagging it would anchor a version to a commit
# that shipped nothing — and would collide with the real cut's tag later.
if [ "$NO_BUMP" -eq 1 ] && [ "$NO_TAG" -eq 0 ]; then
  NO_TAG=1
  info "verification build (--no-bump): tagging disabled"
fi

if [ "$NO_BUMP" -eq 1 ]; then
  ok "no-bump mode: building and verifying at the current version $TARGET"
elif [ "$REUSED_INFLIGHT" -eq 1 ]; then
  ok "target version $TARGET (adopted from the in-flight bump)"
else
  ok "target version $HEAD_VERSION -> ${BOLD}$TARGET${RESET} ($BUMP)"
fi

# ── Dry run stops here ────────────────────────────────────────────────────────
if [ "$DRY_RUN" -eq 1 ]; then
  step "Dry run — nothing was modified"
  cat <<EOF
  A real run would:

    1. write version $TARGET into
         $MANIFEST
         $EXT_PKG
    2. node --test $VERSION_TEST          (the version-sync assertion)
    3. npm --prefix extension run build   (in-build guards: api-base,
                                           content-globals, page-globals)
    4. node extension/scripts/bundle-resolve-guard.mjs
$( [ "$SKIP_DESIGN_AUDIT" -eq 1 ] || printf '       node scripts/design-audit.mjs --dist\n' )
    5. zip $EXT_DIST/ -> $ZIP_PATH
    6. unzip -t + verify the manifest inside the zip + re-run the bundle guard
       against the extracted zip
    7. write $SUM_PATH
$( [ "$NO_TAG" -eq 1 ] \
     && printf '    8. (--no-tag: no tag would be created)\n' \
     || printf '    8. git tag -a v%s at %s, sha256 in the message%s\n' \
          "$TARGET" "$GIT_SHA" "$( [ "$PUSH_TAG" -eq 1 ] && printf ', then push it' || printf ' (push it yourself)' )" )

  Nothing is uploaded. The Chrome Web Store upload is a manual owner step —
  see docs/RELEASE-PROCESS.md §5 step 7.

EOF
  exit 0
fi

# A tag is an immutable rollback anchor, so refuse *before* doing any work if
# this version is already anchored — finding out after a full build is a waste,
# and silently moving a tag would break the one guarantee the tag provides.
if [ "$NO_TAG" -eq 0 ]; then
  if git rev-parse -q --verify "refs/tags/$TAG_NAME" >/dev/null; then
    die "$TAG_NAME already exists (at $(git rev-parse --short "$TAG_NAME^{commit}")).
      A release tag is immutable — it is the rollback anchor for a build that may
      already be in users' browsers. Cut a higher version, or if this tag was
      created in error delete it deliberately:
        git tag -d $TAG_NAME && git push origin :refs/tags/$TAG_NAME"
  fi
  if [ "$PUSH_TAG" -eq 1 ] && git ls-remote --exit-code --tags origin "$TAG_NAME" >/dev/null 2>&1; then
    die "$TAG_NAME already exists on origin. Someone else cut this version — re-sync
      (git fetch --tags) and check before cutting again."
  fi
fi

# ── Bump both version files together ──────────────────────────────────────────
step "Bump version -> $TARGET"

# Rewrite only the version LINE so the diff stays one line per file, then
# re-parse with jq to prove the result is still valid JSON with the right value.
set_version_in() {
  local file="$1" want="$2" matches
  matches="$(grep -c -E '^[[:space:]]*"version"[[:space:]]*:' "$file" || true)"
  [ "$matches" = "1" ] || die "$file has $matches lines matching a top-level \"version\" key; expected exactly 1. Fix by hand."

  # The flag is set only when the substitution actually fires, so the first
  # matching LINE is rewritten (not merely the first line read). `$want` is
  # passed through the environment rather than interpolated into the program.
  CUT_WANT="$want" perl -i -pe \
    'if (!$done && s/^(\s*"version"\s*:\s*")[^"]*(")/$1$ENV{CUT_WANT}$2/) { $done = 1 }' "$file"

  local got
  got="$(jq -r '.version' "$file")" || die "$file is no longer valid JSON after the bump — restore it with 'git checkout -- $file'."
  [ "$got" = "$want" ] || die "$file version is '$got' after the bump, expected '$want'."
}

if [ "$NO_BUMP" -eq 1 ]; then
  info "skipping the bump (--no-bump)"
else
  set_version_in "$MANIFEST" "$TARGET"
  ok "$MANIFEST -> $TARGET"
  set_version_in "$EXT_PKG" "$TARGET"
  ok "$EXT_PKG -> $TARGET"
fi

# The authoritative check that the two files agree is the existing unit test —
# tests/unit/manifest.test.mjs, 'manifest version matches extension/package.json
# version'. Run it here so a drift fails the cut, not the PR.
step "Version-sync + manifest posture tests"
# Quiet on success (node --test is very chatty), full TAP output on failure.
if ! TEST_OUT="$(node --test "$VERSION_TEST" 2>&1)"; then
  printf '%s\n' "$TEST_OUT" | sed 's/^/      /' >&2
  die "$VERSION_TEST failed. The manifest/package versions drifted or the manifest posture regressed."
fi
ok "$VERSION_TEST passed (versions agree, manifest posture intact)"

# ── Production build (runs the in-build guards) ───────────────────────────────
step "Production build"
info "npm --prefix extension run build"
npm --prefix extension run build \
  || die "the extension build failed. The in-build guards (api-base, content-globals, page-globals) report the reason above."
[ -f "$EXT_DIST/manifest.json" ] || die "$EXT_DIST/manifest.json missing after the build."
ok "built $EXT_DIST/ (api-base + content-globals + page-globals guards passed)"

DIST_VERSION="$(jq -r '.version' "$EXT_DIST/manifest.json")"
[ "$DIST_VERSION" = "$TARGET" ] \
  || die "$EXT_DIST/manifest.json says $DIST_VERSION but the target is $TARGET — the build did not pick up the bump."
ok "dist manifest version is $DIST_VERSION"

# ── Verify dist/ ──────────────────────────────────────────────────────────────
step "Verify the built package"
node extension/scripts/bundle-resolve-guard.mjs \
  || die "bundle-resolve-guard found a reference that does not resolve inside dist/."

if [ "$SKIP_DESIGN_AUDIT" -eq 1 ]; then
  warn "skipping the shipped-artifact design audit (--skip-design-audit)"
else
  node scripts/design-audit.mjs --dist \
    || die "the DESIGN.md audit failed against dist/. Re-run 'node scripts/design-audit.mjs --dist' for detail, or pass --skip-design-audit if you have deliberately accepted this."
  ok "DESIGN.md audit passed against dist/"
fi

# ── Package ───────────────────────────────────────────────────────────────────
step "Package"
mkdir -p "$ARTIFACT_DIR"
rm -f "$ZIP_PATH" "$SUM_PATH"          # idempotent: a re-run replaces, never appends
( cd "$EXT_DIST" && zip -q -r "$REPO_ROOT/$ZIP_PATH" . \
    --exclude "*.DS_Store" --exclude "__MACOSX/*" --exclude "*.map" ) \
  || die "zip failed."
[ -f "$ZIP_PATH" ] || die "$ZIP_PATH was not created."
ok "$ZIP_PATH ($(du -h "$ZIP_PATH" | cut -f1))"

# ── Verify the ARTIFACT, not dist/ ────────────────────────────────────────────
step "Verify the artifact"

unzip -t -qq "$ZIP_PATH" || die "'unzip -t' says $ZIP_PATH is corrupt."
ok "unzip -t: archive integrity OK"

# The manifest INSIDE the zip is the only version Chrome will ever read.
ZIP_MANIFEST="$(unzip -p "$ZIP_PATH" manifest.json)" \
  || die "manifest.json is not at the root of $ZIP_PATH — the zip was made from the wrong directory."
ZIP_VERSION="$(printf '%s' "$ZIP_MANIFEST" | jq -r '.version')"
ZIP_NAME_FIELD="$(printf '%s' "$ZIP_MANIFEST" | jq -r '.name')"
ZIP_MV="$(printf '%s' "$ZIP_MANIFEST" | jq -r '.manifest_version')"

[ "$ZIP_VERSION" = "$TARGET" ] \
  || die "the manifest inside the zip says version '$ZIP_VERSION' but this cut is $TARGET."
ok "manifest inside the zip: version $ZIP_VERSION"

[ "$ZIP_MV" = "3" ] || die "the manifest inside the zip is manifest_version '$ZIP_MV', expected 3."
ok "manifest inside the zip: manifest_version 3"

# Brand casing has been wrong in a shipped listing before (Clipmark vs ClipMark).
if [ "$ZIP_NAME_FIELD" != "ClipMark" ]; then
  warn "manifest name inside the zip is '$ZIP_NAME_FIELD', not 'ClipMark' — check the casing before uploading."
else
  ok "manifest inside the zip: name 'ClipMark'"
fi

# Hygiene: things that must never be in a package uploaded to a public store.
ZIP_LIST="$(unzip -Z1 "$ZIP_PATH")"
for bad in 'node_modules/' '.env' '.git/'; do
  if printf '%s\n' "$ZIP_LIST" | grep -q -- "$bad"; then
    die "$ZIP_PATH contains '$bad' — it was built from the wrong directory. Never zip extension/ or the repo root."
  fi
done
if printf '%s\n' "$ZIP_LIST" | grep -q '\.map$'; then
  die "$ZIP_PATH contains source maps; the zip step is supposed to exclude them."
fi
ok "no node_modules/, .env, .git/ or source maps in the package"

# Extract to a temp dir and re-run the resolve guard against the EXTRACTED bytes.
# dist/ passing is not the same as the zip passing — the zip is what Chrome
# installs, and the guard takes a dist-dir argument precisely so it can be
# pointed at an unpacked package.
EXTRACT_DIR="$(mktemp -d)"
cleanup() { rm -rf "$EXTRACT_DIR"; }
trap cleanup EXIT
unzip -q "$ZIP_PATH" -d "$EXTRACT_DIR" || die "could not extract $ZIP_PATH for verification."
node extension/scripts/bundle-resolve-guard.mjs "$EXTRACT_DIR" \
  || die "bundle-resolve-guard failed against the EXTRACTED zip — a reference is missing from the shipped package."

# Cheap catch for a catastrophic-but-quiet mistake: the extension bundle carries
# no keys of any kind today (extension/src/config.js holds only the public API
# base), so any JWT or secret-shaped literal in the package is a regression.
SECRETS="$(grep -rlE 'eyJ[A-Za-z0-9_-]{20,}|service_role|sk_live_|whsec_' "$EXTRACT_DIR" 2>/dev/null || true)"
if [ -n "$SECRETS" ]; then
  printf '\n  %s✗%s secret-shaped literals found in the package:\n\n' "$RED" "$RESET" >&2
  printf '%s\n' "$SECRETS" | sed "s|$EXTRACT_DIR|<pkg>|" | sed 's/^/      /' >&2
  die "refusing to hand off a package that may embed a credential. Investigate before uploading."
fi
ok "no secret-shaped literals in the package"

# ── Checksum ──────────────────────────────────────────────────────────────────
step "Checksum"
# Written from inside the artifact dir so the recorded path is a bare filename
# and `sha256sum -c` works from there without --ignore-missing gymnastics.
( cd "$ARTIFACT_DIR" && sha256sum "$(basename "$ZIP_PATH")" > "$(basename "$SUM_PATH")" )
( cd "$ARTIFACT_DIR" && sha256sum -c --quiet "$(basename "$SUM_PATH")" ) \
  || die "the checksum we just wrote does not verify."
SHA="$(cut -d' ' -f1 < "$SUM_PATH")"
ok "$SUM_PATH"
info "sha256: $SHA"

# ── Tag ───────────────────────────────────────────────────────────────────────
# The rollback anchor. `main` merges many branches, so "the commit v1.0.6 was
# built from" is not otherwise recoverable after the fact — an annotated tag is
# the only durable record. It also keeps the commit alive once the release
# branch is deleted, since a tag is a ref.
#
# Annotated (not lightweight) on purpose: it carries the sha256 of the exact zip
# handed to the store, so a future "is this artifact the one we shipped?" is a
# one-command answer.
if [ "$NO_TAG" -eq 1 ]; then
  step "Tag — skipped"
  info "no tag created (--no-tag or verification build)"
else
  step "Tag $TAG_NAME"

  # Re-check: the build takes minutes and another cut may have raced us.
  git rev-parse -q --verify "refs/tags/$TAG_NAME" >/dev/null \
    && die "$TAG_NAME appeared while this build was running — refusing to move an existing tag."

  git tag -a "$TAG_NAME" -F - <<EOF || die "could not create $TAG_NAME"
ClipMark extension $TARGET

Built from: $(git rev-parse HEAD) ($BRANCH)
Artifact:   $(basename "$ZIP_PATH")
sha256:     $SHA

Immutable rollback anchor — check out this tag and rebuild to reproduce the
package that was uploaded to the Chrome Web Store as $TARGET.
EOF
  ok "annotated tag $TAG_NAME at $GIT_SHA"

  if [ "$PUSH_TAG" -eq 1 ]; then
    if git push origin "refs/tags/$TAG_NAME" >/dev/null 2>&1; then
      ok "pushed $TAG_NAME to origin"
    else
      warn "could not push $TAG_NAME — it exists locally. Push it yourself:"
      warn "  git push origin refs/tags/$TAG_NAME"
    fi
  else
    info "--no-push-tag: push it with  git push origin refs/tags/$TAG_NAME"
  fi
fi

# ── Hand off ──────────────────────────────────────────────────────────────────
printf '\n%s%s─── release candidate ready ───%s\n\n' "$BOLD" "$GREEN" "$RESET"
printf '  version   %s%s%s\n' "$BOLD" "$TARGET" "$RESET"
printf '  commit    %s (%s)\n' "$GIT_SHA" "$BRANCH"
printf '  artifact  %s%s/%s%s\n' "$BOLD" "$REPO_ROOT" "$ZIP_PATH" "$RESET"
printf '  sha256    %s\n' "$SHA"
printf '\n  Remaining steps are MANUAL and owner-only (docs/RELEASE-PROCESS.md §5):\n\n'
if [ "$NO_BUMP" -eq 0 ]; then
  printf '    1. commit the bump, open a PR, land it on main\n'
  printf '    2. update CHANGELOG.md\n'
  printf '    3. upload %s by hand in the CWS dashboard, staged rollout first\n' "$(basename "$ZIP_PATH")"
  if [ "$NO_TAG" -eq 0 ]; then
    printf '\n  %s%s is your rollback anchor%s — already created%s. To reproduce this build:\n' \
      "$BOLD" "$TAG_NAME" "$RESET" "$( [ "$PUSH_TAG" -eq 1 ] && printf ' and pushed' || printf ' locally' )"
    printf '    git checkout %s && npm --prefix extension run build\n' "$TAG_NAME"
  else
    printf '\n  %sNo tag was created.%s Nothing anchors this build for rollback — see\n' "$YELLOW" "$RESET"
    printf '  docs/RELEASE-PROCESS.md §6 before uploading it.\n'
  fi
else
  printf '    (--no-bump: this is a verification build, not a release candidate.\n'
  printf '     Do not upload it — cut a real one with a bump type.)\n'
fi
printf '\n'
