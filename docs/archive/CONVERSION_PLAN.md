# ClipMark Conversion-Trigger Implementation Plan

> Plan only — nothing implemented yet. Turns the conversion-trigger review into concrete,
> ordered work across the **marketing site** and the **extension/app**. Grouped by build
> order (P0 → P1 → P2); within each group, Landing/Marketing and App/Extension are separated.
> A "Fix-regardless" section covers the bugs to correct no matter what.
>
> **Live-surface note:** the extension's live UIs are `extension/src/popup/side-panel.js`
> (+ `src/pages/side-panel.html`) and `extension/src/popup/dashboard.js` (+ `src/pages/dashboard.html`).
> `extension/src/popup/popup.js` appears to be **dead code** (no `popup.html`, no `default_popup`
> in the manifest). **Decision D0:** confirm popup.js is unused before investing in it — if dead,
> skip it everywhere below (and consider deleting it separately).

---

## Shared building blocks (build once, reuse)

Creating these first removes duplication across items:

1. **`<PlanCards>` (webapp, shared).** Extract the three pricing cards currently inline in
   `webapp/app/(marketing)/upgrade/page.tsx` into a reusable server component
   `webapp/app/(marketing)/upgrade/PlanCards.tsx` that takes `prices` + `variant` ('full' | 'preview').
   Reused by the landing pricing preview (P0) and the upgrade page. Keeps one source of truth for
   plan copy/prices. Depends on the existing `fetchProductPrices()` / `PRICE_DEFAULTS`
   (`webapp/app/(marketing)/upgrade/pricing.ts`).

2. **Extension `showUpgradeModal(opts)` (extension, shared).** One branded modal to replace the
   error-toast gates. New file `extension/src/popup/upgrade-modal.js` exporting
   `showUpgradeModal({ feature, benefit, ctaUrl })`, plus shared markup + styles. Injected into both
   `src/pages/side-panel.html` and `src/pages/dashboard.html` (follow the existing
   `summary-panel-overlay` / `social-panel-overlay` overlay pattern already in side-panel.html).
   Reused by every feature gate (P1). CSS in `extension/styles/` alongside the existing overlay styles.

3. **`<GuaranteeLine>` / `<SocialProof>` snippets (webapp).** Tiny presentational components in
   `webapp/app/components/` reused on `/upgrade` and the landing pricing preview.

---

## Fix-regardless (do alongside P0 — all trivial)

### App/config
- **F1 — Refund window mismatch.** Terms says **7-day** money-back
  (`webapp/app/(marketing)/terms/page.tsx:111`) but code treats **14 days** as refund-eligible
  (`webapp/app/(marketing)/upgrade/page.tsx:103` `daysSinceStart <= 14`; `upgrade/actions.ts:76`).
  Pick one value and make Terms + code + the new guarantee line agree.
  - **Decision D1:** which window is real — 7 or 14 days? (Everything downstream, incl. the P0
    guarantee copy, depends on this.)
  - Effort: **XS** (one number + copy) once decided.

### Landing/Marketing
- **F2 — Unverified "15,000+ power learners"** (`webapp/app/(marketing)/page.tsx:654`). Either
  substantiate with a real figure or soften to a non-numeric claim.
  - **Decision D2:** real user count to display, or replace with e.g. "Join power learners who…".
  - Effort: **XS**.
- **F3 — Dead "Watch Demo" button** (`webapp/app/(marketing)/page.tsx:189`) — no `href`/`onClick`.
  Either wire to a demo (video modal / scroll-to-demo / YouTube link) or remove it.
  - **Decision D3:** is there a demo asset to link, or remove the button?
  - Effort: **XS** (remove) / **S** (wire a lightweight video modal).

---

## P0 — high impact, low effort

### Landing/Marketing

- **P0-A — Pricing preview section on the landing page.**
  - **What/where:** add a pricing section to `webapp/app/(marketing)/page.tsx` (e.g. before the FAQ),
    rendering the shared `<PlanCards variant="preview">`. The homepage is a server component and can
    call `fetchProductPrices()` the same way `/upgrade` does.
  - **Approach:** new section in `page.tsx` + shared `<PlanCards>` (see Shared #1). Include a
    "See full comparison → /upgrade" link. Keep it lean (3 cards + one-line value each).
  - **Copy:** section header "Simple pricing. Absurdly affordable." / subhead "From **$1.99/mo** —
    less than one coffee, for a permanent second brain." CTA "Compare all plans →".
  - **Decision D4:** show **live Dodo prices** on the homepage (adds a fetch + failure fallback to
    `PRICE_DEFAULTS`, already the pattern) vs a static "from $1.99/mo" blurb. Recommend live via the
    shared component so it never drifts.
  - **Effort:** **M** (mostly the `<PlanCards>` extraction; the section itself is small).
  - **Depends on:** Shared #1.

- **P0-B — Money-back guarantee under the CTAs.**
  - **What/where:** add `<GuaranteeLine>` directly beneath each checkout button on
    `webapp/app/(marketing)/upgrade/page.tsx` (inside each `<form action={createCheckoutSession}>`,
    after the button) and under the landing pricing preview.
  - **Approach:** small shared component (Shared #3); no logic.
  - **Copy:** "**{N}-day money-back guarantee.** Cancel anytime — keep your data." (N from D1.)
    Optional second line: "No lock-in. Your clips are always yours."
  - **Effort:** **XS**.
  - **Depends on:** D1 (window), Shared #3.

- **P0-C — Wire up `LifetimeCountdown` (currently dead code).**
  - **What/where:** import `webapp/app/(marketing)/upgrade/LifetimeCountdown.tsx` into the Lifetime
    plan card in `webapp/app/(marketing)/upgrade/page.tsx` (near the "Launch Special" badge / strikethrough
    $79.99). Optionally a slim urgency strip on the landing pricing preview.
  - **Approach:** edit only (component already built + styled). It's a client component; the upgrade
    page is a server component, so import + render inline (client islands are fine).
  - **Copy:** "Launch pricing ends in" above the timer.
  - **Decision D5 (important):** the component currently **auto-resets to "next Sunday" every week**
    (perpetual countdown). That reads as a dark pattern and can erode trust. Choose one:
    (a) a **real fixed** launch-end date (honest, best), (b) keep the weekly reset (not recommended),
    or (c) drop the countdown and keep only the strikethrough price. Recommend (a) with a config
    constant.
  - **Effort:** **XS** (wire) + depends on D5 for the date behavior.

### App/Extension

- **P0-D — Persistent "Go Pro" affordance is already decent; tighten it.**
  - The dashboard already has a persistent "✦ Upgrade" (`webapp/app/dashboard/_components/DashboardChrome.tsx:63`)
    and the extension side-panel/dashboard have upgrade buttons. **P0 app work is minimal**; the
    substantive app changes are the modal (P1) and badges (P2).
  - **What/where (small):** ensure the extension's persistent upgrade button is present in the **live**
    side-panel (`side-panel.js` / `side-panel.html`) — popup.js has one but is likely dead (D0).
  - **Effort:** **XS–S** (verify + add to side-panel if missing).

---

## P1 — high impact, moderate effort

### App/Extension

- **P1-A — Branded upsell modal replacing error-toast gates.**
  - **Problem:** feature gates currently fire red **error toasts** (`showError` /
    `showUpgradePrompt` / `showToast`) — see `side-panel.js:459,1320`, `dashboard.js:543,728,796`,
    (and dead `popup.js:372,798,1158`). Errors read as "something went wrong," not "unlock this."
  - **What/where:** build the shared `showUpgradeModal()` (Shared #2) and swap it in at each gate:
    - Share limit reached — `side-panel.js:458` (and popup.js:608 if live).
    - Revisit Mode — `side-panel.js:1318`, `dashboard.js:726`.
    - AI synthesis / Post Insights — `dashboard.js:795`, popup.js:1157 (if live).
    - Analytics — `dashboard.js:542` (already a link; upgrade to modal or keep inline CTA).
  - **Approach:** new `extension/src/popup/upgrade-modal.js` + overlay markup in `side-panel.html`
    and `dashboard.html` mirroring the existing `summary-panel-overlay`. Modal shows the specific
    locked benefit, the plan/price hook, the guarantee line, and a primary "Upgrade to Pro" button
    that opens `${API_BASE}/upgrade` (existing pattern). Keep a lightweight toast only for genuine
    errors.
  - **Copy (per gate):**
    - Header: "Unlock {feature} with Pro"
    - Share limit: "You've saved all 5 free shared collections. Go Pro for **unlimited** sharing."
    - Revisit Mode: "Revisit Mode replays only your saved moments — turn hours into minutes. Pro unlocks it."
    - AI synthesis: "Let AI summarize and synthesize your clips automatically. Available on Pro."
    - Footer line: "{N}-day money-back guarantee · from $1.99/mo" · button "Upgrade to Pro →".
  - **Effort:** **M** (modal + wiring across 2 live files).
  - **Depends on:** Shared #2; guarantee copy (D1); D0 (skip popup.js if dead).

### Landing/Marketing

- **P1-B — Testimonials + Chrome Web Store rating badge.**
  - **What/where:** new testimonials section in `webapp/app/(marketing)/page.tsx` (before the final
    CTA) + a rating badge in the hero and/or near the pricing preview. Optionally a `<SocialProof>`
    shared snippet (Shared #3).
  - **Approach:** new presentational section; static data array of quotes (like `FAQ_DATA`).
  - **Copy:** placeholder structure — 3 cards `{ quote, name, role }`; badge "★ 4.8 · 1,200+ Chrome
    users" (real numbers TBD).
  - **Decision D6:** source of testimonials (real user quotes? beta feedback?) and the **actual Web
    Store rating + install count** to display. Do not ship fabricated reviews.
  - **Effort:** **S–M** (layout is easy; gathering real content is the gate).
  - **Depends on:** D6.

---

## P2 — build-out (higher effort / product decisions)

### App/Extension

- **P2-A — Persistent "PRO" lock badges on gated features.**
  - **What/where:** add small "PRO" pills / lock icons on gated controls so value is visible *before*
    a click: Revisit Mode buttons, AI/synthesis actions, analytics — in `side-panel.js` /
    `side-panel.html`, `dashboard.js` / `dashboard.html`. In the webapp dashboard, badge the gated
    nav/among `DashboardContent.tsx` items.
  - **Approach:** conditionally render a `.pro-badge` when `!isPro` (both extension `checkPro()` and
    webapp `isPro` prop already exist). Shared CSS class.
  - **Copy/label:** "PRO" pill; tooltip "Pro feature — click to unlock".
  - **Effort:** **M** (many small touch points across extension + webapp).
  - **Depends on:** P1-A modal (badge click → modal).

- **P2-B — Trial / first-run onboarding upsell.**
  - **What/where:** an onboarding overlay already exists in dead popup.js (`onboarding-overlay`);
    build the equivalent for the live side-panel first-run, ending on a "Try Pro" step. Optionally a
    time-limited Pro trial.
  - **Approach:** first-run detection in `side-panel.js` + overlay in `side-panel.html`; if a trial is
    offered, it needs payment-provider support.
  - **Decision D7 (product):** offer a **free Pro trial**? If yes: length (7/14 days), and whether
    Dodo supports trials (`webapp/app/(marketing)/upgrade/actions.ts` `createCheckoutSession`) or we
    self-manage a `trial_ends_at` column + entitlement check. Also add "no credit card required"
    reassurance if card-free.
  - **Effort:** **L** (esp. if a real trial — touches payments, entitlement, webhook).
  - **Depends on:** D7; entitlement plumbing.

### Landing/Marketing

- **P2-C — Prominent "Go Pro" CTA alongside the free-install CTA.**
  - **What/where:** add a secondary "See Pricing / Go Pro" button in the hero
    (`webapp/app/(marketing)/page.tsx:177` CTA row) and the final CTA (`page.tsx:656`), and make the
    nav "Pricing" link a styled button (`webapp/app/components/Navigation.tsx:23`).
  - **Approach:** edit existing CTA rows; link to `/upgrade` or the new pricing section anchor.
  - **Copy:** "See Plans" / "Go Pro from $1.99".
  - **Effort:** **S**.
  - **Depends on:** P0-A (so the pricing section/anchor exists).

---

## Build order & dependency summary

1. **Shared #1 `<PlanCards>`, #2 `showUpgradeModal`, #3 snippets** — enable everything else.
2. **Fix-regardless F1–F3** (needs D1, D2, D3) — trivial, do with P0.
3. **P0:** A pricing preview (D4) · B guarantee line (D1) · C wire countdown (D5) · D verify extension Go-Pro button (D0).
4. **P1:** A branded upsell modal (D0, D1) · B testimonials + rating (D6).
5. **P2:** A PRO badges · B trial/onboarding (D7) · C prominent Go-Pro CTA.

## Decisions needed from you
- **D0** — Is `extension/src/popup/popup.js` dead? (Skip it if so.)
- **D1** — Real refund window: **7 or 14 days**? (Drives Terms, code, guarantee copy.)
- **D2** — Real user count for social proof, or soften the "15,000+" claim.
- **D3** — Demo asset for "Watch Demo", or remove the button.
- **D4** — Landing pricing preview: live Dodo prices (recommended) vs static blurb.
- **D5** — Countdown behavior: fixed real end date (recommended), weekly reset, or drop it.
- **D6** — Testimonials source + actual Web Store rating/install numbers.
- **D7** — Offer a free Pro trial? If yes, length + card-required? (Biggest scope driver.)

## Rough effort totals
- Shared blocks: **M**
- Fix-regardless: **XS** each
- P0: **S–M** total
- P1: **M** (modal) + **S–M** (testimonials)
- P2: **M** (badges) + **S** (CTA) + **L** (trial, if chosen)
