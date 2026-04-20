# Decisions — Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs): short documents that capture important architectural decisions made during the development of Clipmark, along with their context and consequences.

## Contents

| File | Description |
|---|---|
| `template.md` | Blank ADR template |
| `ADR-000-use-adrs.md` | ADR describing the decision to adopt ADRs |

## What is an ADR?

An ADR is a short Markdown document (typically 1–2 pages) that records:

- **The decision** — what was chosen
- **The context** — why a decision was needed
- **The options considered** — alternatives evaluated
- **The rationale** — why this option was picked
- **The consequences** — trade-offs and follow-up actions

ADRs are **immutable once accepted**. If a decision is reversed, a new ADR supersedes the old one — the old ADR is marked *Superseded* and links to the new one.

## Status values

| Status | Meaning |
|---|---|
| `Proposed` | Under discussion; not yet adopted |
| `Accepted` | Adopted and in effect |
| `Rejected` | Considered but not adopted |
| `Superseded` | Replaced by a newer ADR (link provided) |
| `Deprecated` | No longer relevant |

## Naming convention

```
ADR-NNN-<short-slug>.md
# examples:
ADR-001-use-supabase.md
ADR-002-manifest-v3-service-worker-keepalive.md
ADR-003-group-collections-text-column.md
```

Increment `NNN` sequentially. Do not re-use numbers.

## How to create a new ADR

1. Copy `template.md` to `ADR-NNN-<slug>.md` with the next available number.
2. Fill in all sections.
3. Open a pull request — the ADR status starts as `Proposed`.
4. After discussion and approval, set status to `Accepted` and merge.
