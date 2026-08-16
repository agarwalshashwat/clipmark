# docs/archive — historical, superseded

**Do not trust anything in this folder as current state.** Every file here is a
**point-in-time snapshot** that was accurate when written and is not maintained. Several
describe work as "planned" or "not implemented" that has since shipped, and at least one
was actively generating false bug reports before it was moved here.

**For current state, read [`../../CONTEXT.md`](../../CONTEXT.md)** — §3 for status, §4 for why
past decisions were made. The fuller product picture is [`../LAUNCH-PRD.md`](../LAUNCH-PRD.md).

These are kept because the *reasoning* in them is often still worth reading — why a thing was
built the way it was, what alternatives were rejected. That value survives being out of date;
the status claims do not.

| File | What it was | Why it's here |
|---|---|---|
| `ClipMark-ROADMAP.md` | 2026-07-30 "master roadmap" | Superseded by `docs/gtm/PARKED-BACKLOG.md` and `CONTEXT.md` §3 |
| `ClipMark-Affiliate-Fix-Spec.md` | Diagnosis + spec for the admin affiliate commission bug | **The fix shipped.** The doc still says "no code changed" |
| `DASHBOARD-PARITY.md` | Web-vs-extension dashboard parity audit @ `b4fb4db` | Both surfaces moved on. Caused two false P1s while it read as current |
| `DARK-MODE-PLAN.md` | System-synced dark mode plan | **Shipped** — webapp surfaces (#127–#129) and the toggle (#134) |
| `PROGRESS.md` | Progress log compiled 2026-08-02, self-titled "single source of truth" | `CONTEXT.md` §3 is now that. Two docs claiming the title is how drift starts |
| `CONVERSION_PLAN.md` | Conversion-trigger implementation plan, 2026-07-18 | Plan only; the homepage work landed differently (#131, #132) |
| `guided-tour-spec.md` | Guided onboarding tour spec | **Implemented** (`extension/src/content/tour.js`). The doc still says "planning only" |
| `LAUNCH_PLAN.md` | 4-week big-bang launch plan, 2026-06-25 | Replaced by the 2-day push in `docs/gtm/marketing-launch-plan.md` |

Nothing is deleted by archiving — and nothing is truly lost by deletion either, since git
history keeps it. If a file here becomes relevant again, refresh it and move it back rather
than citing it from this folder.
