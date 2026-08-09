# Releasing Hyperflow

Release and push are separate boundaries. A successful local release never grants permission to push commits or tags.

## 1. Prepare the change

- Keep one Conventional Commit per distinct task.
- Confirm the working tree contains only intended changes.
- Keep `README.md`, `PRIVACY.md`, manifests, and current Markdown docs aligned with the seven core surfaces.
- Leave historical `CHANGELOG.md` entries intact; the lightweight release script does not rewrite them.
- Verify that Claude Code is described as primary and Codex/OpenCode have honest compatibility limits.

For the lightweight-core major release, include an explicit migration note: installation never deletes existing `.hyperflow` data, and users must rehydrate legacy JSON-only information into Markdown before relying on the new version.

## 2. Verify

Run the repository's maintained checks from the repository root:

```bash
npm test
```

Also check shell syntax for shipped shell entry points and parse every JSON manifest/configuration file. Validation must prove:

- exactly seven skill surfaces: `hyperflow`, `plan`, `dispatch`, `trace`, `audit`, `deploy`, and `handoff`;
- Direct, Focused, and Deep routing limits;
- no automatic session subprocess, network, or write path;
- Markdown-only current persistence;
- blocked-file and destructive-command rules;
- manifest version parity and resolvable current documentation links;
- Markdown is the only current persistence contract outside historical changelog and marked migration context.

Do not bypass a failing check. Fix the source and rerun the full maintained suite.

## 3. Create the local release

Run:

```bash
./scripts/release.sh major
```

This compatibility boundary requires the explicit `major` argument. The script updates release metadata and the changelog, creates the release commit, and creates the local annotated tag. Confirm the resulting commit, tag, version parity, and clean worktree. Later releases may use inference only when the exact current-version tag is reachable.

A major version is required for the lightweight-core compatibility break.

## 4. Review compatibility claims

- Claude Code may use the primary-support wording only after its maintained validation passes.
- Codex CLI, app-server, and desktop App are independent surfaces. Do not promote one from another surface's evidence.
- OpenCode remains a compatibility shim unless its own maintained checks prove a stronger claim.
- Missing host capabilities must be described as explicit degradation, never simulated background work.

## 5. Push only after authorization

After the user separately authorizes the push:

```bash
git push origin HEAD
git push origin <tag>
```

Never force-push `main` or `master`, never use `--no-verify`, and never publish a package unless the user explicitly requested that publication step.

After pushing, confirm the remote commit/tag and required CI checks before announcing the release.
