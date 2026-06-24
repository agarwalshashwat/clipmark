# Launch Day Runbook

## Owners
- Incident commander: `TBD`
- Engineering owner: `TBD`
- Product owner: `TBD`
- Support owner: `TBD`

## Publish Sequence
1. Confirm go/no-go checklist is complete.
2. Publish extension release.
3. Verify install flow on Chrome stable.
4. Verify bookmark save and side panel open on a fresh profile.
5. Publish launch communications and webapp announcement.

## First 2 Hours Monitoring
- Every 15 minutes, check:
  - Extension install/open success.
  - Checkout completion success rate.
  - Dodo webhook error rate.
  - Auth callback failures.

## First 24 Hours Monitoring
- Every hour, check:
  - New paid conversions.
  - Extension review/support issues.
  - Unexpected error spikes in API routes.

## Incident Procedure
1. Declare incident in team channel.
2. Freeze non-essential deploys.
3. Assign owner for mitigation and owner for communication.
4. Decide rollback or hotfix using rollback thresholds in `docs/release/RELEASE_POLICY.md`.
5. Record timeline, impact, and resolution notes.
