# Decision cards

Structured A/B/C choices during plan so answers become durable memory.

## When

- Framework or storage shape
- Privacy-sensitive modeling (e.g. analytics identity)
- Test strategy (PGlite vs Docker)
- Public vs internal API surface

## How

1. Agent presents a decision card ([template](../templates/decision-card.md)).
2. Founder picks a number (or edits).
3. Agent writes the lock into `.hyperflow/memory/decisions.md` the same turn. Prefer the deterministic helper so the entry is dated, tagged, and duplicate-safe:

   ```bash
   python3 <plugin-root>/scripts/decision-card.py lock \
     --memory-dir .hyperflow/memory \
     --title "<short title>" --choice "<locked option>" \
     --why "<why>" --revisit-if "<condition>"
   ```

   Add `--chooser` when the project records who made the choice. The helper
   refuses blank or multi-line fields and an existing title; it never edits an
   existing decision silently. Use `validate` to detect duplicate legacy
   headings before a plan relies on them.
4. Later plans must read decisions before re-asking.

## Anti-patterns

- Re-asking a locked decision without "revisit if"
- Locking without writing memory
- More than 4 options (collapse first)
