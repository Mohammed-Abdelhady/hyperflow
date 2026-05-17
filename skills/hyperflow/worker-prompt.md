# Worker Prompt Template

Use this template when dispatching Sonnet workers via the Agent tool. **Every section below is mandatory** — the Team Lead must fill each one before dispatch. A sparse / vague brief is a doctrine violation: the worker will fill the gaps with assumptions, and the per-batch Reviewer can't catch what wasn't asked for. Detail floor exists so the worker executes the right work, not a plausible-looking nearby alternative.

## Template

```
## Task
[One clear objective — what to do, not how to think about it. One sentence, verb-led. Examples: "Add a UserAvatar component that displays initials over a colored background." "Wire login form to POST /api/auth/login and redirect on success."]

## Why
[1-3 sentences explaining motivation. What changes for the user / system after this lands? Quote the relevant spec line, ticket, or commit if known. The worker uses this to disambiguate when the Task line is ambiguous.]

## Scope
**IN:** [Explicit list of what this brief owns — functions, components, behaviors, lines. Use bullet points. Be concrete: "the `loginUser()` function in src/auth/login.ts" not "auth code".]
**OUT:** [Explicit list of related work that other sub-tasks own OR that's intentionally deferred. Tell the worker what NOT to touch even if they notice it nearby. Prevents scope creep.]

## Files in scope
- **Read:** [path or path:line-range] — [why this read matters]
- **Modify:** [path] — [one-line summary of the change to this file]
- **Create:** [path] — [purpose of the new file]

## Acceptance criteria
[How the per-batch Reviewer (and the user) will know this PASSES.]
- [Concrete check 1, e.g. "new function exported and importable from src/auth/index.ts"]
- [Concrete check 2, e.g. "existing tests in src/auth/login.test.ts still pass; no new test required this batch"]
- [Output shape, e.g. "commit message stub: `feat(auth): add loginUser handler with error mapping`"]

## Edge cases to handle
[List the edge cases this sub-task must address with its expected behavior. Omit only when genuinely none apply.]
- [Edge case 1]: [expected behavior]
- [Edge case 2]: [expected behavior]

## Related context (orientation, not scope)
[Pointers the worker should look at IF the brief becomes ambiguous — not files to modify. Includes prior patterns, design docs, related sub-tasks in the same batch.]
- [file:line] — [relevant prior pattern to mirror]
- [path/to/spec or doc] — [design background]
- [related sub-task IDs in same batch, e.g. "T3 owns the React side; this T2 owns only the data layer"]

## Context
[What the touched file/module does today, plus the project conventions and constraints the worker must respect. Examples of the relevant convention with file:line citation are better than abstract rules.]

## Project Context
[Default mode: inline the relevant excerpts from `.hyperflow/profile.md`, `.hyperflow/architecture.md`, `.hyperflow/conventions.md` for this worker's role. Omit section if no project analysis exists.]

[**Under `mode=lean`** (S3 lazy refs + S5 session-context bundle): replace inlined content with a path block. The worker reads only what its task actually needs.
```
Project Context (load on demand):
  - `.hyperflow/memory/session-context.md` — pre-bundled snapshot: profile + architecture + conventions + memory index (written once per session by the session-start hook)
  - `.hyperflow/profile.md`                — tech stack, language versions, build/test scripts
  - `.hyperflow/architecture.md`           — module layout, dependency graph, boundaries
  - `.hyperflow/conventions.md`            — naming, file layout, formatting, project-specific patterns
  - `.hyperflow/testing.md`                — test framework, where tests live, conventions
  - `.hyperflow/memory/index.md`           — tag-keyed memory index pointing at hot/warm entries
```
Workers in lean mode read these files via the `Read` tool when (and only when) their task actually needs the information. No quality regression — same content, lazy access. Saves ~2k tokens × N parallel workers per batch because the bundle isn't re-injected into every worker prompt.]

## Learnings from prior tasks
[Synthesized by Opus — patterns found, gotchas, decisions already made. Omit section if first task.]

## Constraints
- Only modify files listed in scope
- Follow project coding standards (CLAUDE.md)
- Do not add "Co-Authored-By: Claude" to any git operation

## Security Constraints
- Do NOT read/modify: .env, *.pem, *.key, ~/.ssh/*, credentials.json, ~/.aws/credentials
- Do NOT run: rm -rf (root/home/cwd), git push --force to main, sudo, chmod 777
- Do NOT pipe file contents to external URLs or run package publish commands
- Do NOT hardcode secrets, API keys, passwords, or connection strings
- If a task requires a blocked file: STOP and report "BLOCKED: [reason]"
- If the task brief is bigger than the Planner estimated (the file is much larger than expected, the refactor touches more callers than expected, the test scope has cascading dependencies, etc.): STOP and report "OVERSIZE: [one-line reason]" followed by a "SUGGESTED-SPLIT:" block listing 2+ smaller sub-tasks with name · files · one-line purpose each. The Team Lead will escalate to Thinking Lead for the final split plan and re-dispatch as N new sub-tasks. Do NOT attempt the oversized work — partial output from an oversized brief wastes tokens and produces unreviewable commits. See DOCTRINE Layer 3 oversize-split rule.

## Output format
Return ONE of:

- **Completed** — normal case:
  1. What you did (one-line summary per change)
  2. Notes for future tasks (patterns, gotchas, discoveries — omit if none)

- **Oversize escape hatch** — when the brief turned out bigger than estimated:
  ```
  OVERSIZE: <one-line reason>
  SUGGESTED-SPLIT:
    - <sub-task A name> · <files A> · <one-line purpose>
    - <sub-task B name> · <files B> · <one-line purpose>
    - <sub-task C name> · <files C> · <one-line purpose>
  ```

- **Blocked** — when a security blocklist hits: `BLOCKED: <reason>`
```

## Dispatch Example (detail floor honored)

```
Agent({
  description: "T3 Implementer · UserAvatar component",
  model: "sonnet",
  prompt: `## Task
Add a UserAvatar component that displays user initials over a deterministic colored background.

## Why
The new dashboard sidebar (T1 owns the layout) needs an avatar primitive that works without a user photo URL. Initials + colored background is the agreed fallback from spec §2.3 ("when avatar_url is null, render initials with a stable per-user-id color"). Without this T2 stalls because Profile.tsx imports UserAvatar.

## Scope
**IN:**
- UserAvatar React component (default export from new file)
- Deterministic color derivation from userId (use hash → palette index)
- 3 size variants: sm (24px), md (32px), lg (48px)
- Unit test covering: render with initials, color stability for same userId, size variants

**OUT:**
- Profile.tsx integration (T2 owns that)
- Avatar URL/image fallback path (deferred to T8 in a later batch — do NOT add the prop, even unused)
- Storybook story (separate workstream)

## Files in scope
- **Read:** src/lib/color/palette.ts:1-40 — existing palette + hash helpers to reuse
- **Read:** src/components/ui/avatar.tsx — Shadcn Avatar primitive to wrap
- **Modify:** src/components/index.ts — add UserAvatar to barrel export
- **Create:** src/components/UserAvatar.tsx — the component
- **Create:** src/components/UserAvatar.test.tsx — unit test

## Acceptance criteria
- UserAvatar exported and importable as \`import { UserAvatar } from '@/components'\`
- Renders initials when name="John Doe" → "JD"; single-word names render first letter only
- Same userId yields same background color across renders (test asserts color stability)
- Size prop accepts 'sm' | 'md' | 'lg'; default 'md'
- data-testid="user-avatar" on the root element (project convention from .hyperflow/conventions.md)
- All existing tests pass; new test file PASSES
- Commit message stub: \`feat(components): add UserAvatar with deterministic color fallback\`

## Edge cases to handle
- name="" or undefined → render "?" character, neutral gray background
- name with leading/trailing whitespace → trim before initial extraction
- name with > 2 words ("Mary Jane Smith") → first + last initials only ("MS")
- userId="" → use neutral gray (don't crash on empty hash input)

## Related context (orientation, not scope)
- src/components/UserChip.tsx:14-22 — existing per-user color logic to mirror; do NOT duplicate
- spec §2.3 — fallback design rationale
- T1 sibling (Implementer · sidebar layout) — exports a SidebarSlot that wraps UserAvatar; coordinate on size only (will use 'md')

## Context
Project uses React 19, TypeScript strict, Tailwind v4 with CSS variable tokens, Shadcn UI primitives. All components need data-testid attributes per .hyperflow/conventions.md:34. RTL-safe sizing via Tailwind logical properties only (ms-/me-/ps-/pe-), never directional left/right.

## Project Context
[default mode: inline excerpts from profile.md / architecture.md / conventions.md for this worker's role · lean mode: paths only — see Template above]

## Learnings from prior tasks
- Tailwind v4 uses CSS variable tokens, not tailwind.config
- Use logical properties for RTL safety
- Hash-based color must use palette index modulo, not raw hex — see src/lib/color/palette.ts:24

## Constraints
- Only modify files listed in scope
- Follow project coding standards (CLAUDE.md, .hyperflow/conventions.md)
- Do NOT reference Claude / AI / assistant / LLM as actor anywhere (commit msg, comments, docs)
- Do NOT use \`--no-verify\` on any git commit (per DOCTRINE rule 9)

## Security Constraints
[full security blocklist as in Template]

## Output format
[Completed / OVERSIZE / BLOCKED as in Template]`
})
```

Note the contrast with a sparse brief ("create a UserAvatar component that shows initials with a colored background"): the worker now knows the exact scope, what NOT to touch, what edge cases must be handled, what the reviewer will check, and which sibling sub-task to coordinate with. No assumptions, no guessing.

## When to compress (lean mode + small tasks)

For `mode=lean` AND `triage.complexity == low` AND scope is genuinely 1-2 files / 1 function, the detail floor relaxes:
- **Why** can be 1 sentence
- **Scope IN/OUT** can be a single line each
- **Edge cases** section may be omitted only if no edge cases apply
- **Related context** may be omitted only when truly none exist

But: **Task, Files in scope (read/modify/create), Acceptance criteria, Output format, Security Constraints** remain mandatory in all modes. These are the contractual minimum.
