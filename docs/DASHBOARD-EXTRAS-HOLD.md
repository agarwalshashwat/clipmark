# Dashboard extras on hold

This branch exists purely to preserve web-dashboard code/history that has no
equivalent in the extension dashboard (`extension/src/popup/dashboard.js`),
per the dashboard feature-parity sync effort. It is not meant to be merged
as-is — it's a parking spot so this code isn't lost when the sync branch
removes it to match the extension's feature set. A future release can revisit
adding these to both dashboards together.

See `sync/dashboard-parity`'s `docs/DASHBOARD-PARITY.md` (§1, §10) for the
full parity matrix and reasoning.

## What's held here

- **Referral program ("Refer & Earn")** — `webapp/app/dashboard/referral/page.tsx`.
  Own DB tables (`profiles.referral_code`, `profiles.referral_months_credit`,
  `referrals`), own API route (`/api/referrals/export`). No extension
  equivalent — the extension's Account sidebar section has only
  Upgrade/Manage Subscription and Sign Out.
- **Affiliate program** — `webapp/app/dashboard/affiliate/page.tsx`,
  `webapp/app/dashboard/affiliate/AffiliateApplyForm.tsx`. Own DB tables
  (`profiles.is_affiliate`/`affiliate_code`/`commission_rate`,
  `affiliate_applications`, `affiliate_clicks`, `affiliate_conversions`), own
  API routes (`/api/affiliate/apply`, `/api/affiliate/export`). No extension
  equivalent.
- The corresponding sidebar entries in
  `webapp/app/dashboard/_components/DashboardChrome.tsx` ("Refer & Earn",
  "Earn with Clipmark" / "Affiliate") — removed from the sync branch, kept
  here as a reference diff (see that branch's iteration commit for the exact
  removal).

## Restoring

From a branch based on the then-current `main`:

```
git checkout feature/dashboard-extras-hold -- webapp/app/dashboard/referral webapp/app/dashboard/affiliate
```

Then re-wire the sidebar links in `DashboardChrome.tsx` (diff against this
branch's copy if needed) and re-add the `/api/referrals/export` and
`/api/affiliate/*` routes if they were also removed elsewhere.
