# Architecture

This directory contains system design documents, architectural overviews, diagrams, and technical context for the Clipmark project.

## Contents

| File / Folder | Description |
|---|---|
| `template.md` | Template for new architecture documents |
| `overview.md` | High-level system architecture overview *(add when ready)* |

## When to add a document here

- You are describing how a major subsystem (extension, webapp, database, AI pipeline) works
- You are proposing or explaining a system-wide design change
- You want to capture diagrams, data-flow descriptions, or integration contracts
- You need to share context that helps new contributors understand "why" the system is built the way it is

## Naming convention

Use lowercase, hyphen-separated filenames:

```
<component>-<topic>.md
# examples:
extension-architecture.md
webapp-auth-flow.md
ai-pipeline-design.md
```

## See also

- [`/decisions`](../decisions/) — formal Architecture Decision Records (ADRs) for specific choices
- [`/specifications`](../specifications/) — detailed technical specifications
