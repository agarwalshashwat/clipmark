# ADR-000: Use Architecture Decision Records

> **Status:** Accepted  
> **Date:** 2026-04-11  
> **Author:** Clipmark team

---

## Context

As Clipmark grows, we are making architectural decisions that affect the extension, webapp, database schema, AI integrations, and payment flows. Without a lightweight record-keeping practice, the rationale behind these decisions is lost over time, making it hard for new contributors to understand constraints and for existing contributors to avoid re-debating settled questions.

---

## Decision

> **We will use Architecture Decision Records (ADRs) stored in `/decisions/` to document all significant architectural decisions.**

An ADR is a short Markdown file that records the decision, the context that drove it, the alternatives considered, and the consequences.

---

## Options Considered

### Option 1: ADRs in `/decisions/`

- ✅ Version-controlled alongside the codebase
- ✅ Reviewable via pull requests
- ✅ Easy to link from code comments, issues, and specs
- ❌ Requires discipline to keep up to date

### Option 2: GitHub Wiki

- ✅ Low ceremony, quick to write
- ❌ Not reviewable via PR
- ❌ Harder to link from code
- ❌ Less version-control visibility

### Option 3: No formal record

- ✅ Zero overhead
- ❌ Context is lost over time
- ❌ Decisions are re-debated repeatedly

---

## Rationale

ADRs in the repository strike the best balance between low overhead and long-term utility. They are reviewable, linkable, and live where the code lives. The template ensures consistency without being burdensome.

---

## Consequences

### Positive

- New contributors can understand historical context without asking questions.
- Decisions are visible in the git history and can be referenced in PRs and code comments.

### Negative / Trade-offs

- Requires contributors to write ADRs when making significant decisions (lightweight, but not zero cost).

### Neutral / Follow-on work

- Add links from relevant code comments to the ADR they implement.
- Backfill ADRs for decisions already made (e.g., Supabase choice, Manifest V3, Dodo Payments).
