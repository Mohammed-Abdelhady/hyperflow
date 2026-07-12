# Feature: Checkout redesign

## Status

| Field       | Value                         |
|-------------|-------------------------------|
| Status      | in_progress                   |
| Phases      | `██████░░░` 2 / 3 complete    |
| Branch      | `feat/checkout-redesign`      |
| Specialists | `backend-reviewer`            |

## Goal

Redesign checkout flow end-to-end.

## Phases

1. **phase-1-data-layer** — schema and models — `completed`
2. **phase-2-api** — handlers — `in_progress` (depends on phase-1-data-layer)
3. **phase-3-ui** — storefront — `pending` (depends on phase-2-api)

## Phase dependency graph

```
phase-1 → phase-2 → phase-3
```
