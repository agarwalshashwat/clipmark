# ClipMark — Creator / Affiliate Outreach Kit (USMLE/Med Beachhead)

**Date:** 2026-07-31
**Grounds in:** [ClipMark-Distribution-Plan.md](../../ClipMark-Distribution-Plan.md) §2 (creator outreach), §3 (flywheel structure), [ClipMark-MedExam-Strategy-Brief.md](../../ClipMark-MedExam-Strategy-Brief.md) §2 (named creators), §7 (90-day GTM), [ClipMark-Affiliate-Fix-Spec.md](../../ClipMark-Affiliate-Fix-Spec.md), [ClipMark-ROADMAP.md](../../ClipMark-ROADMAP.md).
**Affiliate terms below are verified against the live code**, not assumed — see §2.
**Constraint:** solo founder, zero track record with any creator, no ad budget beyond a possible small flat sponsorship ($200–500) for 1–2 creators per the distribution plan §5.

---

## 1. Target list — types first, named creators where real ones are known

**Priority order (per the strategy brief and distribution plan): micro study-workflow creators first, not the big lecture brands.** Their content already *is* the study-workflow niche, so the product needs no explaining, and they're far easier to actually get a response from than an established channel with a full sponsorship queue.

| Tier | Type | Approx. audience | Why this tier, why this order |
|---|---|---|---|
| **1 — start here** | Micro study-workflow / "how I use Anki" / "day in my life as a med student" creators (YouTube, TikTok, IG) | 5K–50K subscribers/followers | Easiest to reach, no cold-outreach competition from bigger sponsors, tool-fit is obvious from their existing content, and they need content ideas as much as revenue — a scripted 60–90s segment is a genuine favor to them, not just an ask. |
| **2 — after 1–2 tier-1 wins** | Anki-influencer / study-system YouTubers with a dedicated med-study or general-study-tips channel | 50K–300K | Same pitch, slightly higher production bar; use a live tier-1 integration as social proof ("here's how [smaller creator] used it"). |
| **3 — approach, low odds, low cost** | Big lecture brands (see named list below) | 300K–4M+ | Reachable later once there's proof of retention and at least one live creator integration; the brief explicitly frames this as "low odds, low cost to try," not a primary bet. |

**Named channels worth knowing (confirmed real, per the strategy brief):**

- **Boards & Beyond** (Dr. Ryan) — the spine of the Step 1 video-lecture workflow; students already pair it 1:1 with Anki decks (the "Lightyear" deck ecosystem watches these near timestamp-by-timestamp). Tier 3.
- **Sketchy / SketchyMedical** — visual mnemonics, gold standard for pharm/micro. Tier 3.
- **Ninja Nerd** — **4M+ subscribers, 314M+ views** (per NoxInfluencer, cited in the strategy brief), explicitly serves "medical students of all kinds around the world," core lectures free on YouTube. The single most global/reachable big-brand name — matches the IMG/global-English audience directly. Tier 3, but the best tier-3 first attempt given scale and the free/global framing already matches ClipMark's positioning.
- **Dirty Medicine** — high-subscriber, study-focused. Tier 3.
- **Osmosis** — global, English-first, IMG-relevant per the brief's Part II global analysis. Tier 3.
- **Medgeeks** — high-subscriber, study-focused. Tier 3.
- **LY Med**, **HY Guru** — named in the brief's global/IMG section as serving the same global-English audience. Tier 2–3 depending on actual size (verify subscriber count before outreach — not independently confirmed here).
- **AMBOSS** — has its own Anki add-on and IMG focus; more of a potential integration/co-marketing partner than a pure affiliate given it's itself a paid product, but worth a relationship for the IMG segment. Treat as its own outreach track, not a standard creator affiliate pitch.

**How to build the tier-1 list out (this is the actual month-1 work — it isn't pre-built anywhere):**
1. Search YouTube/TikTok/IG for "how I study for Step 1," "med school Anki setup," "day in the life med student," filtered to recent uploads (active channels, not dormant ones).
2. Check r/medicalschoolanki and r/step1 threads for creators students already reference approvingly ("I use [X]'s Anki tips") — a creator already trusted by the exact target community is a much better fit than one found cold.
3. Cross-check subscriber count and upload recency (a channel with 20K subs and a video last week beats one with 40K subs and nothing in 6 months).
4. Keep the list in the tracking sheet in §4 as you find them — don't pre-build a speculative list of names you haven't actually verified are active.

---

## 2. The affiliate offer — verified against the live code, not guessed

**Self-serve default terms** (confirmed in `webapp/migrations/007_affiliate_program.sql`, `009_affiliate_discounts.sql`, and the live copy at `webapp/app/(marketing)/affiliate/page.tsx` / `affiliate/terms/page.tsx`):

| Term | Value | Source |
|---|---|---|
| Commission | **30%**, calculated on the post-discount sale amount, **one-time per referred user** — whichever plan (monthly/annual/lifetime) they convert on triggers a single commission; renewals on that same subscription do NOT generate another one | `profiles.commission_rate DECIMAL(4,2) DEFAULT 0.30` (migration 007); confirmed live in `affiliate/page.tsx`'s `COMMISSION_RATE = 0.30`. **Verified against `webapp/app/api/webhooks/dodo/handler.ts:91-97`** — an explicit "duplicate conversion guard: one commission per referred user lifetime" blocks a second `affiliate_conversions` row for the same `referred_user_id`; the marketing FAQ confirms this in plain language ("Renewals on existing subscriptions do not generate additional commissions") |
| Referred-user discount | **10% off** at checkout, automatically applied via a real Dodo discount code | `profiles.affiliate_discount_pct SMALLINT DEFAULT 10` (migration 009); `REFERRAL_DISCOUNT = 0.10` in `affiliate/page.tsx` |
| Cookie / attribution window | **30 days** from click | Stated in `affiliate/page.tsx` FAQ and `affiliate/terms/page.tsx`; matches the distribution plan's own summary |
| Payout threshold | **$25** minimum pending balance | `affiliate/terms/page.tsx` line 135; matches `affiliate/page.tsx` stat tile |
| Payout hold | **30 days** post-conversion (refund-window buffer) | `affiliate/export/route.ts` computes `payoutDate = created_at + 30 days`; `dashboard/affiliate/page.tsx` shows the same |
| Refund handling | Commission is cancelled and removed from pending balance if the referred purchase is refunded | `affiliate/terms/page.tsx` line 146 |
| Self-serve eligibility gate | Active Pro subscriber, account ≥30 days old | `affiliate/apply/route.ts`, `affiliate/page.tsx` eligibility section |

**Get the commission timing right in every pitch — it's the detail most likely to disappoint a creator if it's left ambiguous.** "Earn 30% for life" in the marketing headline refers to the *affiliate relationship* being ongoing (every new person you refer earns 30%, for as long as you keep referring people) — not a recurring monthly cut of one referred user's subscription. At current pricing ($7.99/mo, $59.99/yr, $99.99 founding lifetime), a single one-time commission looks like:

- Monthly-plan referral: **~$2.16** (30% of $7.19 net-of-discount) — one payment, ever, for that referred user.
- Annual-plan referral: **~$16.20** (30% of $53.99 net-of-discount) — meaningfully larger; lead with this.
- Lifetime/founding referral: **~$27.00** (30% of $89.99 net-of-discount) — the largest single payout; the number to headline in a founding-partner pitch.

**Practical implication:** steer creators toward promoting the annual or founding-lifetime plan specifically — a one-time-per-referral structure only produces a payout worth a creator's time if the underlying sale is sized for it.

**Important honesty note for outreach — payout is not actually automated.** The marketing page's FAQ says commissions are "paid out monthly," but there is no automated payout job anywhere in the codebase (no scheduled job, no Dodo/Wise/PayPal payout API call — `affiliate/export/route.ts` only *exports* a CSV-style payout report for the founder to act on manually). In practice: the founder personally reviews the export and manually sends payment via Wise or PayPal once a creator clears $25 and the 30-day hold. **Don't promise "automatic" payouts in outreach** — say commissions are tracked automatically and paid out by hand each month, which is both true and still a completely normal creator-affiliate process. This mirrors the same gap the Distribution Plan already flagged (§0.2) as needing a copy fix before real creator money is riding on it — treat this kit's own language as part of that fix, not a repeat of the overpromise.

**The admin bypass for non-Pro external creators — now fixed and usable.** `webapp/app/api/admin/set-affiliate/route.ts` (handler in `handler.ts`) lets an admin grant a working affiliate code, `approve: true` status, a custom `commissionRate` (0–100, stored correctly as a 0–1 fraction — the unit bug that would have paid out 5000% commission on a creator's first sale is fixed, see [ClipMark-Affiliate-Fix-Spec.md](../../ClipMark-Affiliate-Fix-Spec.md)), and a custom `discountPct` — all **same-day, to a user who has never made a ClipMark account, bypassing the self-serve 30-day-Pro gate entirely.** This is the single thing that makes creator outreach viable this early; before this fix, a creator would've had to sign up, pay for Pro, and wait 30 days before getting a code.

**Founding-partner offer to pitch (per the strategy brief and distribution plan, both currently just config — no new engineering needed since the admin route works):**
- **35–40% commission** (vs. the 30% default) for the first 3–5 creators signed, framed explicitly as a time-boxed "founding partner" rate.
- **A bigger personal discount code** for their audience specifically — 15–20% off instead of the generic 10% — set via the same admin route's `discountPct` field.
- **A free lifetime Pro account** for the creator themselves (a low-cost goodwill item, not from the affiliate program — grant directly via the Pro-status columns, separate from the affiliate grant).
- **Optional flat sponsorship** ($200–500) for 1–2 creators, if pure commission isn't enough to get a first video prioritized over their existing paid-sponsor queue — this is the one place a small budget has real leverage per the distribution plan §5.

---

## 3. Outreach templates

All templates: personalize the bracketed content before sending, reference one *specific* video the creator made, lead with value to their audience (content idea + free product), and don't oversell — this audience can smell a form-letter pitch immediately.

### 3a. Short cold DM (warm/small creator, 5K–50K subs)

> Hey [Name] — loved your [specific video title] video, especially the part where you [specific detail, e.g. "showed your actual Anki review session"]. I built a small tool that might fit right into that kind of content: ClipMark lets you bookmark the exact moment in a YouTube lecture and turn it into a spaced-repetition flashcard that exports straight to Anki — so instead of re-scrubbing a whole lecture, you jump straight back to the moment.
>
> I'd love to send you free lifetime Pro + a real affiliate deal (30%+ commission, your own discount code for your audience) if you ever wanted to show it in a video — no pressure either way, just wanted you to have it as an option. Happy to send a quick demo clip you could drop straight in if that's easier than filming your own segment.

### 3b. Longer email (warm/small creator, 5K–50K subs)

> Subject: A tool for your Anki/study-workflow content — free access + real affiliate terms
>
> Hi [Name],
>
> I'm [Founder Name], building ClipMark — a small YouTube extension that lets you bookmark the exact timestamp in a lecture (Boards & Beyond, Sketchy, whatever you're studying from), then turns that moment into a spaced-repetition flashcard, and exports straight into Anki when you're ready. It's built to be additive to Anki, not a replacement — the idea is capturing the *moment*, not the note.
>
> I've been watching your channel for a while — your [specific video] really nails [specific thing they do well], and it's exactly the kind of study-workflow content this tool was built around. Two things I'd love to offer, no obligation either way:
>
> 1. **Free lifetime Pro access** — just to try it, whether or not you ever mention it.
> 2. **An affiliate partnership** if you ever wanted to feature it: 30%+ commission on every Pro upgrade your audience makes (for the first few creators I work with, I'm doing 35–40% as a founding-partner rate), plus your own discount code for your audience — 15–20% off instead of the standard 10%. Commissions are tracked automatically in a dashboard and paid out monthly by bank transfer or PayPal once you clear a $25 balance.
>
> If it's useful, I can also put together a quick 60–90 second demo clip scripted around your existing content style (e.g. "here's how I turn a B&B lecture into an Anki card in 10 seconds") that you could drop straight into a video — happy to do that legwork so it's close to zero extra effort on your end.
>
> No pressure at all if it's not a fit right now — either way, I'd genuinely appreciate any feedback if you try it.
>
> [Founder Name]
> [email] · clipmark.mithahara.com

### 3c. Follow-up (both sizes, sent 7–10 days after no response)

> Hey [Name] — no worries if this got buried, just following up in case it's helpful! If the affiliate side isn't interesting right now, the free lifetime Pro offer still stands with zero strings — happy to just get your feedback as someone who actually studies this way. Either way, hope [reference something recent, e.g. their latest video or an exam season they mentioned] is going well.

### 3d. Bigger/established creator version (50K–300K+, or Tier 3 lecture brands)

> Subject: ClipMark — a study-workflow tool for [Channel]'s audience
>
> Hi [Name / team],
>
> I'm [Founder Name], the solo founder behind ClipMark — a YouTube extension built specifically for the way med students already study from channels like yours: bookmark the exact lecture moment, turn it into a spaced-repetition flashcard, and export straight into Anki. It's positioned as additive to Anki and to the lecture content itself, not a competitor to either.
>
> I know a channel your size gets a lot of sponsorship requests, so I'll keep this concrete: I'd like to offer a real affiliate partnership (30%+ commission, custom terms negotiable for a channel your size, a dedicated discount code for your audience) plus a scripted, low-effort integration idea — a short segment showing how a viewer turns one of your lectures into review-ready flashcards. I'm also open to a flat sponsorship fee alongside commission if that fits your usual format better than pure rev-share.
>
> Totally understand if the timing or fit isn't right — happy to send a short demo reel either way so you have it on file. Thanks for considering it.
>
> [Founder Name]
> [email] · clipmark.mithahara.com

---

## 4. Tracking approach — a CRM-lite a solo founder can actually maintain

A single spreadsheet (Google Sheets is enough — don't adopt real CRM tooling before there's real volume, matching the same reasoning the distribution plan applies to email/ESP tooling). One row per creator:

| Column | Purpose |
|---|---|
| Name / Channel | Identifier |
| Tier (1/2/3) | From §1 |
| Platform + subscriber count | Sizing, refreshed periodically — creator growth isn't tracked live |
| Specific video referenced | Forces personalization before sending; also a reminder of what hook was used |
| Outreach date + template used (3a/3b/3c/3d) | So a follow-up isn't sent with the wrong tone/size assumption |
| Status | `Not contacted` → `DM/email sent` → `Follow-up sent` → `Responded — interested` / `Responded — declined` / `No response` → `Affiliate code issued` → `Content live` |
| Affiliate code + commission rate + discount pct | Once issued via the admin route — keep this in sync with what was actually granted in the DB |
| Content live? (Y/N + link) | The actual outcome that matters |
| Notes | Anything creator-specific — tone preferences, best contact channel, timing constraints |

**What "good" looks like, realistically, for a zero-audience solo founder doing cold outreach at this scale:**
- **Response rate:** a cold DM/email response rate of **10–20%** from tier-1 micro-creators is a reasonable target — this segment is used to being asked and is more receptive than bigger channels, but most cold outreach still goes unanswered. Treat anything above that as a good week, not the baseline to expect every time.
- **Conversion to a signed affiliate:** of those who respond positively, expect roughly **half** to actually follow through to a code being issued and content going live — interest often doesn't survive the creator's own production bandwidth.
- **Overall:** the distribution plan itself frames "whether any single creator with a real audience actually posts" as the single highest-variance factor in the entire GTM plan — don't be discouraged by a string of no-responses from tier 1 before the first real hit; budget for reaching out to **15–25 tier-1 creators** to realistically land the 3–5 the 90-day plan targets.
- **Track dry spells honestly** in the sheet rather than padding the pipeline with "maybe" statuses — a stalled outreach effort is a signal to widen the tier-1 search (§1.4), not to lower the bar on what counts as "interested."
