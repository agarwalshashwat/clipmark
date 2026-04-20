# Specifications

This directory contains detailed technical specifications for features, systems, and integrations in the Clipmark project.

## Contents

| File | Description |
|---|---|
| `template.md` | Blank specification template |

## What belongs here

- Detailed functional and non-functional requirements for a feature
- Data models, schemas, and storage contracts
- Integration contracts with external services (Supabase, Anthropic, Dodo Payments, YouTube API)
- UX behaviour descriptions (edge cases, error states, interactions)
- Security and privacy requirements

A specification is more detailed than an idea and more granular than an ADR. It is the reference document engineers use when implementing a feature.

## Specification lifecycle

```
Proposed → In Review → Approved → In Progress → Done
```

The current status should always be at the top of each spec document.

## Naming convention

```
<YYYY-MM-DD>-<feature-slug>.md
# examples:
2026-04-11-revisit-mode.md
2026-05-01-pro-subscription-flow.md
2026-06-15-ai-tag-suggestions.md
```

## Relationship to other directories

- Start with an **idea** (`/ideas/`) for early exploration.
- Record the key architectural **decision** in `/decisions/` once you know the approach.
- Write the **specification** here once the decision is made and implementation is about to begin.
