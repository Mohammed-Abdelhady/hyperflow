# Installation and migration

## Claude Code

Claude Code is the primary supported host.

```bash
claude plugin marketplace add Mohammed-Abdelhady/hyperflow
claude plugin install hyperflow@hyperflow-marketplace
```

Update or remove the plugin through Claude Code's normal plugin management commands. Hyperflow adds no background updater and performs no network request at session start.

## Codex

The repository includes a Codex manifest, but Codex support remains preview. Install through the plugin workflow exposed by your Codex version, then confirm that the seven skill directories are discoverable.

Use `hyperflow plan`, `hyperflow dispatch`, and the other surface names as text-routed intent. Do not assume they are native slash commands. CLI, app-server, and desktop App behavior are verified independently; plugin discovery alone is not workflow certification.

See [Codex compatibility](codex.md).

## OpenCode

OpenCode is a compatibility shim for the same Markdown contract. It does not imply Claude Code lifecycle events or equivalent child-agent/background behavior. Use only the capabilities exposed by the installed host version.

For a source-managed installation, run `./install.sh`. It validates the Hyperflow checkout before updating or linking the seven skills into an existing `~/.config/opencode/skills` directory. Updates require a clean checkout and a fast-forwardable `origin/main`; dirty, diverged, fetch-failed, or otherwise unverifiable updates stop before changing checked-out files. A detected major update stops before changing the checkout; complete the migration review below, then rerun with `--accept-major-migration`. Use `./install.sh --link-only` to validate and expose an existing checkout without a network update. `./install.sh --uninstall` removes only links owned by that checkout, including legacy `~/.opencode/skills` links, and keeps the checkout and all project data.

## Antigravity

Antigravity (AGY) is a compatibility shim for the Markdown skill contract. Running `./install.sh` detects `~/.gemini/config` and links all seven skills into `~/.gemini/config/skills` for the Antigravity agent environment.

## Major-version migration

<!-- hyperflow:legacy-migration:start -->
The lightweight core removes the old dashboard, viewer files, and generated JSON persistence twin. Installation must not delete or rewrite an existing `.hyperflow` directory.

Before upgrading:

1. Back up `.hyperflow/` and any committed `.hyperflow-handoff/` packages.
2. Inspect `.hyperflow/artefacts/**/*.json`, archived JSON under `.hyperflow/archive/**`, and JSON or nested artefact copies under `.hyperflow-handoff/**` for information that is not present in a Markdown task, spec, audit, or memory file.
3. Rehydrate that information into the matching Markdown file.
4. Verify the Markdown copy before removing any legacy file yourself.
<!-- hyperflow:legacy-migration:end -->

There is no automatic migration, archive, compaction, or cleanup pass.

Legacy v5 handoff packages using `HANDOFF.md`, `STATUS`, or nested `artefact/` directories are archive-only until manually converted to the current `task.md` plus `handoff.md` layout. Hyperflow never rewrites those packages automatically.

## Verify the install

Confirm these directories exist in the installed plugin:

```text
skills/hyperflow
skills/plan
skills/dispatch
skills/trace
skills/audit
skills/deploy
skills/handoff
```

Then start with a read-only request such as `hyperflow audit this repository structure` and verify that any capability degradation is reported explicitly.
