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
3. Agent writes the lock into `.hyperflow/memory/decisions.md` the same turn.
4. Later plans must read decisions before re-asking.

## Anti-patterns

- Re-asking a locked decision without "revisit if"
- Locking without writing memory
- More than 4 options (collapse first)
