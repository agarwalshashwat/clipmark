# Clipmark Public Launch Plan (4 Weeks, Big-Bang)

## Summary
Launch `extension + webapp` on the same day, with the extension as the release gate and `paid conversions` as the primary KPI.  
Operational posture: pragmatic baseline (critical monitoring, incident runbook, backup/recovery checks), not full SRE hardening.

## Implementation Changes
1. **Release governance and CI gates (Week 1)**
- Add required GitHub Actions checks for: unit tests, extension E2E smoke, webapp visual smoke.
- Define merge/release policy: no release candidate unless all required checks pass on `main`.
- Add one release checklist artifact for launch sign-off (engineering + product + ops).

2. **Revenue-critical path hardening (Week 1–2)**
- Validate end-to-end paid flow in production-like env: `/upgrade` checkout, Dodo webhook handling, Pro entitlement flips, downgrade events, referral/affiliate attribution.
- Add explicit failure handling verification for webhook signature errors and delayed webhook delivery.
- Freeze pricing/product IDs and environment variable matrix before launch week.

3. **Distribution and publishing readiness (Week 2–3)**
- Prepare Chrome Web Store release package, listing copy, screenshots, privacy disclosures, and support contact.
- Run full manual extension checklist plus focused cross-browser/version sanity on Chrome stable.
- Finalize webapp legal/support surfaces (terms, privacy, contact paths) and launch analytics events for funnel steps.

4. **Launch operations and execution (Week 4)**
- Execute go/no-go review 48 hours before launch with pass/fail criteria.
- Launch-day runbook: owner roster, incident channel, rollback decision rules, hourly KPI checks for first 24 hours.
- Same-day publish sequence: extension release first, then webapp and announcements once extension listing is live/verified.

## Public Interfaces / Contracts
- **No user-facing API contract changes required for launch.**
- New internal release interfaces: required CI status checks (named and enforced) and formal go/no-go checklist as release gate inputs.
- Keep existing payment/webhook/referral endpoints unchanged; launch focuses on reliability validation, not API redesign.

## Test Plan and Acceptance Criteria
- CI green on `main` for required checks for 3 consecutive days pre-launch.
- Manual checklist completion with no Sev-1/Sev-2 defects open at launch.
- Payment path acceptance: successful purchase grants Pro within target window; failed/invalid webhook does not grant access.
- Referral/affiliate acceptance: attribution cookie behavior, discount application, conversion recording verified on real checkout path.
- Launch day: monitor conversion funnel, webhook error rate, auth failures, and extension install/open behavior with defined rollback thresholds.

## Assumptions and Defaults
- Production infra remains Vercel + Supabase + Dodo Payments.
- Team can provide at least one engineering owner and one business/support owner during launch day + first 72 hours.
- Big-bang requirement is fixed (no phased rollout), because extension is core to product functionality.
- Timeline is relative (Week 1–4) and starts immediately after plan approval.
