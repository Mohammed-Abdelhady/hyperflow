# PR Exit (dispatch Step 5)

End-of-chain contract for opening a GitHub pull request after a build. Owned by `/hyperflow:dispatch`. Full detail lives here so `SKILL.md` stays lean.

## When the PR question fires

| `pr=` value | Behaviour |
|-------------|-----------|
| `ask` (default) | Always include **Open a pull request?** in the Step 5 combined gate — **every** dispatch, not only issue chains |
| `auto` | Skip the question; open PR after audit/deploy answers are processed (gates green enough to continue) |
| `never` | Skip the question; print a ready-to-run `gh pr create` command in wrap-up |

Issue chains (`gh_issue=<n>`) still use the same gate. They only **add**:

- `Closes #<n>` in the PR body  
- optional courtesy comment on the issue (`comment=ask|never`)

Unauthenticated `gh` → do not open; print `gh auth login` + full `gh pr create` recovery. Never half-post. Never force-push. Never push to `main`/`master` directly — feature branch only.

## Visual-required detection

A PR is **visual-required** (images mandatory) when **any** of:

1. Triage `types[]` intersects `{frontend, ui, mobile, creative}` (from chain `triage=` JSON / task `Specialists` / Brain roster), **or**
2. Changed files in the chain range match UI/mobile surfaces **and** the change is not docs-only:
   - Extensions: `*.tsx` `*.jsx` `*.vue` `*.svelte` `*.css` `*.scss` `*.swift` `*.kt` `*.kts` `*.dart` `*.xib` `*.storyboard`
   - Path segments: `components/`, `screens/`, `pages/`, `app/` (Expo/Next), `ios/`, `android/`, `*.xcassets`
3. Chain arg `pr_images=require`

**Not** visual-required when types are only `api` / `db` / `docs` / `devops` / `security` (etc.) **and** no UI files changed — unless `pr_images=require`.

Force-skip media (rare): `pr_images=never` — document in Evidence Risks that screenshots were waived.

## Image acquisition (visual-required only)

Run **before** `gh pr create`, after the user said Yes (or `pr=auto`).

### 1. Try auto-capture (best effort, short timeout)

1. Prefer a project script if `.hyperflow/testing.md` or `package.json` documents one (`screenshot`, `capture`, Maestro/Detox).
2. Web: if Playwright CLI or MCP is available and a local/staging base URL is known (README, `.env.example` `PORT`, common `localhost:3000`), capture the primary changed route.
3. Mobile: only if a project screenshot/Maestro/Detox path exists; otherwise go to user-supply.
4. On success: write files under `docs/pr-media/<slug>/` (e.g. `after.png`), commit `chore(pr-media): <slug>`, include in the branch push.

### 2. User-supply fallback (mandatory if capture fails)

Fire a **second** `AskUserQuestion` (not crammed into the audit/deploy/PR triple):

- Options: provide path(s) / cancel PR  
- Or free-form path list via chat on portable surfaces  

Copy validated image files into `docs/pr-media/<slug>/`, commit, push.

### 3. Hard block

If visual-required and still **zero** images:

- **Do not** run `gh pr create`
- Print recovery: expected paths, how to re-invoke, and the drafted `gh pr create` body template
- Evidence / Next: `PR blocked — screenshots required`

Minimum: **≥1** image. Before/after preferred when both exist; not required for v1.

## PR create steps

1. Resolve default base branch: `main`, else `master`, else remote default (`gh repo view --json defaultBranchRef`).
2. `git push -u origin <feature-branch>` (never force, never to main/master).
3. Build body from the template below (include Screenshots section iff visual-required).
4. Image markdown URLs after push:
   `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/docs/pr-media/<slug>/<file>`
5. `gh pr create --base <base> --head <branch> --title "<conventional title>" --body-file <tmp>`
6. Title from dominant conventional commit type on the chain range.
7. No AI attribution in title or body.

## Body template

```markdown
## Summary

<what changed and why — from Evidence / task goal>

## Validation

<gates · tests · review summary from Evidence>

## Screenshots

<!-- omit entire section when not visual-required -->

| | |
|--|--|
| After | ![after](https://raw.githubusercontent.com/<owner>/<repo>/<branch>/docs/pr-media/<slug>/after.png) |

## Issue

Closes #<n>
```

Omit `## Issue` when `gh_issue` is absent.

## Gate UI (Step 5)

When `pr=ask`, question [3] in the combined audit/deploy gate:

```
[3] Open a pull request for this chain?
    Yes — push feature branch · gh pr create
    No  — keep the branch local · print the gh pr create command
```

Binary action gate — no `(Recommended)` marker. Combined call still ≤ 4 questions.

## Evidence

On PR opened: Next may include `PR #<n> · <url>`.  
On blocked media: Risks / Next note the block.  
On skipped (`pr=never` or user No): print the ready command only.
