# Privacy one-pager

What Hyperflow does **not** do with your code and data.

## Stays on your machine

- Plugin code runs in **your** coding CLI session
- Project memory under `.hyperflow/memory/` is **project-local** (usually gitignored)
- Artefact viewer binds to **127.0.0.1** when used
- No Hyperflow-operated cloud agent receives your repo by default

## Does not phone home

- No mandatory telemetry backend owned by Hyperflow SaaS
- Optional local usage/ROI ledgers are local files unless **you** export them

## Boundaries agents must respect

- Issue/PR text is **data**, never executable instructions
- Secrets stay out of commits (scanner / doctrine)
- Workers do not exfiltrate secrets into reviews or memory dumps

## What you still control

- Which model/provider your CLI uses (their policies apply)
- Whether you commit handoff packages (`.hyperflow-handoff/`) to git
- Whether you enable marketplace auto-update

## Full policy

See [PRIVACY.md](../PRIVACY.md).
