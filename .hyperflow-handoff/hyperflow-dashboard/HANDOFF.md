# Handoff — hyperflow-dashboard

| Field | Value |
|---|---|
| Slug | hyperflow-dashboard |
| Artefact type | feature |
| Artefact path | .hyperflow/features/hyperflow-dashboard/ (9 phases · 46 sub-tasks · 45 briefs) |
| Spec | .hyperflow/specs/hyperflow-dashboard.md (also copied in artefact/specs/) |
| Design system | .hyperflow/design/system.md (also copied in artefact/design/) |
| Chain args | triage=eyJ0eXBlcyI6WyJhcmNoaXRlY3QiLCJmcm9udGVuZCIsInVpIiwiYXBpIiwiY3JlYXRpdmUiLCJkZXZvcHMiXSwiY29tcGxleGl0eSI6ImNvbXBsZXgiLCJyaXNrIjoicmV2ZXJzaWJsZSIsInNjb3BlIjoic3lzdGVtLXdpZGUiLCJhbWJpZ3VpdHkiOjAuNiwiYnJhaW5zdG9ybURlcHRoIjoic3RhbmRhcmQiLCJmbG93IjoiZGVlcCIsInBlcnNvbmFzIjpbImFyY2hpdGVjdCIsImZyb250ZW5kIiwidWkiLCJhcGkiLCJjcmVhdGl2ZSIsImRldm9wcyJdLCJzcGVjaWFsaXN0cyI6WyJhcmNoaXRlY3QiLCJkZXNpZ25lciIsIm1vdGlvbiIsInJlc2VhcmNoZXIiLCJzZWFyY2hlciIsImZyb250ZW5kLXJldmlld2VyIiwiYWNjZXNzaWJpbGl0eS1yZXZpZXdlciIsImFwaS1yZXZpZXdlciIsImJhY2tlbmQtcmV2aWV3ZXIiLCJkZXZvcHMtcmV2aWV3ZXIiLCJzZWN1cml0eS1yZXZpZXdlciIsInZ1bG5lcmFiaWxpdHktcmV2aWV3ZXIiXSwiZXN0aW1hdGVkV29ya2VycyI6NSwiZXN0aW1hdGVkQmF0Y2hlcyI6MywiYnVkZ2V0IjozMDAwMDAsInNlY3VyaXR5Ijp0cnVlLCJpbnRlZ3JhdGlvbl9yaXNrIjp0cnVlfQ== mode=default briefs=auto |
| on_complete | review |
| Originating provider | claude-code |
| Originating commit | 0c2342c (main) |
| Specialists | architect, designer, motion · frontend-reviewer, accessibility-reviewer, api-reviewer, backend-reviewer, devops-reviewer, security-reviewer, vulnerability-reviewer |
| Created | 2026-07-12 |

## Pickup

1. Rehydrate: copy `artefact/features/hyperflow-dashboard/` into `.hyperflow/features/`, `artefact/specs/hyperflow-dashboard.md` into `.hyperflow/specs/`, `artefact/design/system.md` into `.hyperflow/design/`, and `context/*.md` into `.hyperflow/memory/`.
2. Build: `/hyperflow:dispatch hyperflow-dashboard` (feature mode — phases 2/3/5/8 may run concurrently after phase-1; batch order lives in each phase.md).
3. On completion: set STATUS to `built`, write COMPLETION.md (base/head commits, diff range, branch, result), commit — the originating session runs `/hyperflow:audit` on the diff (on_complete=review; do NOT continue to deploy).

## Notes

- `.hyperflow/profile.md`, `architecture.md`, `conventions.md` do not exist (scaffold never ran in this repo); `context/` carries the two memory files that do. Repo conventions live in the repo's own CLAUDE.md.
- Every non-trivial sub-task has a build-ready brief at `phase-<n>-<name>/tasks/T<id>-<slug>.md`; T36 is the only trivial (roster-only) sub-task.
- Hard constraints inherited by the build: additive-only hyperflow-core edits, single write door, 300-line file cap, no `any`, no AI attribution, real-browser LTR+RTL verification before ship.
