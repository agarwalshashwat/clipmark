# [Feature / System Name] — Technical Specification

> **Status:** Proposed | In Review | Approved | In Progress | Done  
> **Date:** YYYY-MM-DD  
> **Author:** [Your name]  
> **Related ADR:** [ADR-NNN](../decisions/ADR-NNN-<slug>.md)  
> **Related idea:** [Idea](../ideas/YYYY-MM-DD-<slug>.md)

---

## Overview

*One paragraph describing what this specification covers.*

---

## Goals

- Goal 1
- Goal 2

## Non-Goals

- Non-goal 1

---

## Background

*Relevant context a reader needs before diving into the spec. Link to existing architecture docs, ADRs, or code as appropriate.*

---

## Functional Requirements

List what the system **must** do. Use *shall* for mandatory requirements.

| ID | Requirement |
|---|---|
| FR-01 | The system shall ... |
| FR-02 | The system shall ... |

---

## Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-01 | Performance | < 200 ms response time |
| NFR-02 | Availability | 99.9% uptime |
| NFR-03 | Security | All endpoints require JWT auth |

---

## Design

### Data Model

Describe new or modified database tables / `chrome.storage` keys.

```
table: <table_name>
  id          uuid primary key
  user_id     uuid references profiles(id)
  ...
```

### API Changes

List new or modified API endpoints. Link to `/api/<endpoint>.md` for full documentation.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/...` | ... |

### Extension Changes

Describe changes to content scripts, popup, background service worker, or storage keys.

### UI / UX

Describe user-facing behaviour, including edge cases and error states.

---

## Security Considerations

*Describe authentication, authorization, data validation, and any privacy implications.*

---

## Testing Plan

| Scenario | Type | Notes |
|---|---|---|
| Happy path | e2e | Playwright test in `tests/` |
| Error state | unit | |
| Pro-gate enforcement | integration | |

---

## Roll-out Plan

*Feature flags, migration steps, backward compatibility concerns.*

---

## Open Questions

- [ ] Question 1
- [ ] Question 2

---

## References

- [Architecture document](../architecture/<doc>.md)
- [ADR](../decisions/ADR-NNN.md)
- External links
