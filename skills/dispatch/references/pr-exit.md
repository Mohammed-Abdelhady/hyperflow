# PR Exit (dispatch Step 5)

End-of-chain contract for opening a GitHub pull request after a build. Owned by `/hyperflow:dispatch`. Full detail lives here so `SKILL.md` stays lean.

Semantic host ops (see `skills/hyperflow/runtime-contract.md`): `structured_question` for gates, `shell` for git/gh, `edit` for media paths and body files. External writes remain **explicitly gated** — never open, comment, or push on a silent default.

## When the PR question fires

| `pr=` value | Behaviour |
|-------------|-----------|
| `ask` (default) | Always include **Open a pull request?** in the Step 5 combined gate — **every** dispatch, not only issue chains |
| `auto` | Skip the question; open PR after audit/deploy answers are processed (gates green enough to continue) |
| `never` | Skip the question; print a ready-to-run `gh pr create` command in wrap-up |

Issue chains (`gh_issue=<n>`) still use the same gate. They only **add**:

- `Closes #<n>` in the PR body  
- optional courtesy comment on the issue (`comment=ask|never`)

Unauthenticated `gh` (via `shell`) → do not open; print `gh auth login` + full `gh pr create` recovery. Never half-post. Never force-push. Never push to `main`/`master` directly — feature branch only.

## Visual verification detection

A chain is **visual-verification** when **any** of:

1. Triage `types[]` intersects `{frontend, ui, mobile, creative}` (from chain `triage=` JSON / task `Specialists` / Brain roster), **or**
2. Changed files in the chain range match UI/mobile surfaces **and** the change is not docs-only:
   - Extensions: `*.tsx` `*.jsx` `*.vue` `*.svelte` `*.css` `*.scss` `*.swift` `*.kt` `*.kts` `*.dart` `*.xib` `*.storyboard`
   - Path segments: `components/`, `screens/`, `pages/`, `app/` (Expo/Next), `ios/`, `android/`, `*.xcassets`
3. Chain arg `pr_images=require`

**Not** visual-verification when types are only `api` / `db` / `docs` / `devops` / `security` (etc.) **and** no UI files changed — unless `pr_images=require`.

Force-skip local visual verification: `pr_images=never` — document in Evidence Risks that visual verification was waived.

## Local visual verification (visual changes only)

Run **before** `gh pr create`, after the user said Yes (or `pr=auto`) when the project has a capture path. This is a local or CI quality check only. Screenshots are never PR media.

### 1. Try auto-capture (best effort, short timeout)

1. Prefer a project script if `.hyperflow/testing.md` or `package.json` documents one (`screenshot`, `capture`, Maestro/Detox) — run via `shell`.
2. Web: if Playwright CLI or a host capture tool is available and a local/staging base URL is known (README, `.env.example` `PORT`, common `localhost:3000`), capture the primary changed route.
3. Mobile: only if a project screenshot/Maestro/Detox path exists; otherwise go to user-supply.
4. On success: store temporary captures outside tracked source, preferably under `.hyperflow/evidence/<slug>/`. Inspect them locally or in CI, then remove them or leave them in the ignored evidence directory. Never copy them into `docs/pr-media/`, commit them, upload them, or embed them in the PR body.

### 2. User-supply fallback (optional)

Do not block the PR on a missing capture. If a user supplies a screenshot for local review, inspect it without copying it into the branch:

- Use a local path only. Do not ask for screenshots solely to satisfy a PR-media requirement.
- When structured UI is missing, continue with text-only PR evidence rather than inventing paths or stopping the chain.

### 3. No PR media

If visual-verification did not run or produced **zero** captures:

- Continue to `gh pr create` when the normal PR gate is green.
- Record `Visual verification: unavailable` or `Visual verification: passed locally` in the Validation section.
- Never add a Screenshots section, image markdown, `docs/pr-media/` files, or screenshot URLs to the PR.

There is no image minimum for opening a PR. The PR remains reviewable from the diff, tests, deployment links, and written validation.

## PR create steps

All git/gh steps use the `shell` op inside the security blocklist. Never force-push; never push to `main`/`master`.

1. Resolve default base branch: `main`, else `master`, else remote default (`gh repo view --json defaultBranchRef` when `gh` is authenticated).
2. `git push -u origin <feature-branch>` (never force, never to main/master).
3. Build body from the template below. Never include screenshot or image media.
4. `gh pr create --base <base> --head <branch> --title "<conventional title>" --body-file <tmp>`
5. Title from dominant conventional commit type on the chain range.
6. No AI attribution in title or body.

## Body template

```markdown
## Summary

<what changed and why — from Evidence / task goal>

## Validation

<gates · tests · review summary from Evidence>

## Visual validation

<Visual verification: passed locally | unavailable | not applicable>

<!-- Do not add screenshots, image markdown, media files, or screenshot URLs. -->

## Issue

Closes #<n>
```

Omit `## Issue` when `gh_issue` is absent.

## Gate UI (Step 5)

When `pr=ask`, question [3] in the combined audit/deploy gate uses `structured_question` (or the Hyperflow Question chat fallback):

```
[3] Open a pull request for this chain?
    Yes — push feature branch · gh pr create
    No  — keep the branch local · print the gh pr create command
```

Binary action gate — no `(Recommended)` marker. Combined call still ≤ 4 questions.

### Declined / skipped

| Outcome | Required behaviour |
|---|---|
| User answers **No** | No push for PR, no `gh pr create`, no issue comment. Print ready-to-run `gh pr create` only. |
| `pr=never` | Same as No for external writes; print the command in wrap-up. |
| Visual verification unavailable | Open the PR with written validation; do not add screenshots or block PR creation. |
| `comment=never` or comment declined | Do not post on the issue even if a PR opens. |

## Evidence

On PR opened: Next may include `PR #<n> · <url>`.  
On unavailable visual verification: record it in Validation / Risks.
On skipped (`pr=never` or user No): print the ready command only.  
Never invent PR numbers, URLs, or media paths when the create step did not run.
