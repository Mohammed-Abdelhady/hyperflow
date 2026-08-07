# Decision card

Use during plan/spec when multiple product/architecture options exist.

## Question

<one sentence>

## Options

| # | Option | Trade-off |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |

## Recommendation

**<n>** - <one line why>

## Locked choice

- Date:
- Chooser:
- Choice:
- Consequences:

## Memory write

After lock, use the deterministic writer (replace the placeholders with the
user's actual answer; do not invent them):

```bash
python3 <plugin-root>/scripts/decision-card.py lock \
  --memory-dir .hyperflow/memory \
  --title "<short title>" --choice "<locked option>" \
  --why "<why>" --revisit-if "<condition>"
```

It appends this canonical shape to `.hyperflow/memory/decisions.md`:

```markdown
### [YYYY-MM-DD] <short title>  `[decision]`
- Choice: ...
- Why: ...
- Chooser: ...
- Revisit if: ...
```

The writer refuses duplicate titles and malformed fields. Run
`python3 <plugin-root>/scripts/decision-card.py validate --memory-dir
.hyperflow/memory` when checking an existing memory file.
