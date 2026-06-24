# Release Policy

## Branch and Merge Rules
- `main` is the release branch.
- Every PR must pass required checks before merge:
  - `ci-unit`
  - `ci-extension-smoke`
  - `ci-webapp-visual-smoke`
- No direct pushes to `main` for launch-related changes.

## Release Candidate Rules
- Create a release candidate only from `main`.
- Block release if any Sev-1 or Sev-2 issue is open.
- Re-run smoke checks on the exact release commit hash before publish.

## Launch Window Rules
- Big-bang release sequence:
  1. Publish extension.
  2. Verify extension listing availability and install path.
  3. Publish webapp announcement and launch communications.
- Keep one engineer and one product/support owner on-call for first 24 hours.

## Rollback Rules
- Roll back if one of these is true:
  - Checkout success rate drops below 95% for 30 minutes.
  - Webhook failures exceed 5% for 30 minutes.
  - Extension install/open flow is broken for new users.
- Use most recent known-good extension package and previous stable webapp deployment.
