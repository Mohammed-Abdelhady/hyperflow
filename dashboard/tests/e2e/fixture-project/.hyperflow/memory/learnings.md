# learnings

### [2026-05-10] Zod schemas are the single wire contract  `[api, convention]`
**What:** Shared Zod schemas are the only wire and parse contract.
**Why it matters:** Prevents server/client drift.
**Evidence:** .hyperflow/specs/hyperflow-dashboard.md:15

### [2026-05-11] Prisma findUnique needs compound keys  `[db, pitfall]`
**What:** findUnique requires the unique selector shape.
**Why it matters:** Runtime errors on wrong where clauses.
**Evidence:** src/db/user.ts:42

### [2026-05-12] Tailwind v4 drops some v3 utilities  `[ui, convention]`
**What:** Certain spacing utilities renamed in v4.
**Why it matters:** Build breaks on upgrade.
**Evidence:** package.json
