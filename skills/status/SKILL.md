---
name: status
description: Use when the user wants a one-screen view of current hyperflow project state — active tasks, memory entry count, current release version, Layer 0 cache freshness. Read-only; never modifies state.
---

# Status

Read-only snapshot of the current hyperflow project. Standalone — does not auto-chain and is never invoked by other skills. Invoked manually via `/hyperflow:status`.

## What to read

| Field | Source | Fallback |
|-------|--------|----------|
| Version | Latest git tag matching `v*` + tag commit date | `(missing)` |
| Profile | `.hyperflow/profile.md` file modification time | `(missing)` |
| Memory | Line count of `.hyperflow/memory/index.md` minus header rows | `(none)` |
| Active tasks | Files matching `.hyperflow/tasks/*.md` | `(none)` |

## How to compute each field

### Version

```bash
tag=$(git tag --sort=-v:refname | grep -E '^v[0-9]' | head -1)
released=$(git log -1 --format=%ci "$tag" 2>/dev/null | cut -d' ' -f1)
```

If `$tag` is empty → print `(missing)` for the version line.

### Profile freshness

```bash
profile=".hyperflow/profile.md"
```

- If the file does not exist → `(missing)`
- If `mtime` is within the last 24 hours → `fresh`
- If `mtime` is older than 24 hours → `stale`

Compute elapsed time in hours using:

```bash
now=$(date +%s)
mtime=$(stat -f %m "$profile" 2>/dev/null || stat -c %Y "$profile" 2>/dev/null)
hours=$(( (now - mtime) / 3600 ))
```

Display as `fresh   (analyzed Xh ago)` or `stale   (analyzed Xh ago)`.

### Memory entry count

Count non-header, non-blank lines in `.hyperflow/memory/index.md`:

```bash
index=".hyperflow/memory/index.md"
```

If file absent → `(none)`.

Count table-body rows (lines starting with `|` and not the header or separator):

```bash
count=$(grep -c '^|' "$index" 2>/dev/null)
# subtract 2 for header + separator rows
entries=$(( count - 2 ))
```

Display as `N entries`. If the file is absent or count resolves to 0 or below → `(none)`.

### Active tasks

```bash
tasks=$(ls .hyperflow/tasks/*.md 2>/dev/null)
```

If no files → show `(none)` on the Active tasks line and omit the indented list.

Otherwise count files and list each basename indented under the header line.

## Output format

Print the block below verbatim, substituting computed values. Use exactly this spacing (two spaces of padding inside the label column):

```
── Hyperflow Status ─────────────────────────────
Version       <tag>   (released <YYYY-MM-DD>)
Profile       <fresh|stale|(missing)>    (analyzed <N>h ago)
Memory        <N entries|(none)>
Active tasks  <count|(none)>
  - <task-filename.md>
  - <task-filename.md>
─────────────────────────────────────────────────
```

Omit the indented task list entirely when Active tasks is `(none)`.

When Profile is `(missing)`, omit the `(analyzed Xh ago)` parenthetical.

When Version is `(missing)`, print:
```
Version       (missing)
```

## Failure modes

Every section degrades gracefully:

- Missing git tags → `Version  (missing)`
- Missing `.hyperflow/profile.md` → `Profile  (missing)`
- Missing `.hyperflow/memory/index.md` → `Memory  (none)`
- No `.hyperflow/tasks/*.md` files → `Active tasks  (none)` with no list

Never error out. Never modify any file.

## Doctrine

This skill has no Worker/Reviewer dispatch — it is a pure read. It does not count as a hyperflow run and does not append to memory. Full output style rules in [output-style.md](../hyperflow/output-style.md).
