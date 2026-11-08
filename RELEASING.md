# Releasing Hyperflow

Release and push are separate actions. Create releases only when requested. Keep a feature branch for reviewed changes and preserve historical changelog entries.

## Prepare

- Keep Conventional Commits separated by concern.
- Align the manifests, four public skills, installer, privacy policy, and current documentation.
- Keep the active host as coordinator. Delegate profiles select their own harness and model.
- Document migration without deleting existing `.hyperflow` data, credentials, shared skills, or foreign registrations.
- Use a major version for the new public commands and workflow compatibility boundary. Do not stamp a release version during ordinary development.

## Verify

Use Node.js 24 or newer. Run the maintained checks against the final tree:

```bash
npm run validate-plugin
npm run unittest
npm run evals
```

Validation covers version parity, exactly four public skills, runtime entrypoints, links, and package boundaries. Tests cover static workflow parsing, actual planning participation, configured delegates, isolated execution, review, repair, stop/resume, persistence, and installer migration. Static evaluations check the documented contracts. None of these certifies live provider or host behavior.

Check runtime and shell syntax, patch hygiene, maintained-file limits, and actual package footprint. Report the exact checks and any unavailable evidence. Fix causes without weakening gates.

## Create a local release

After approval, use the explicit version or appropriate bump:

```bash
./scripts/release.sh major
```

The script validates the tree, stamps version metadata, creates a local release commit, and creates an annotated tag. It never pushes. Confirm the commit, tag, version parity, and clean worktree before proceeding.

## Verify host claims

Claude Code, Codex CLI, Codex app-server, Codex desktop, Antigravity, Cursor, OpenCode, and Pi require separate evidence for command discovery and execution. An installed skill or manifest does not certify any host. Missing capabilities remain explicit blockers.

## Push

Only push within the user's authorization. Verify the destination branch and use a normal push:

```bash
git push origin HEAD
git push origin <approved-tag>
```

Confirm the remote revision and applicable checks before announcing a release. Package publication requires an explicit publication request.
