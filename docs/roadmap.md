# Roadmap (clarity → proof → depth)

Product direction after v5.17. Not a commitment calendar; ordered by leverage.

## Theme

Stop adding surface area. Make the default path obvious, measurable, and reliable.

## Shipped in the 5.18+ clarity train

- Golden path + getting started (default vs advanced)  
- Proof pack template  
- Dispatch resume doc  
- This roadmap  

## Shipped in the 5.19 reliability train

- Eval harness (`evals/` + `scripts/run-evals.py`)  
- Host parity config (`config/host-parity.json` + checker)  
- CI steps for evals + host parity  


## Shipped in the 5.20 train

- Memory hygiene script + tests  
- Specialist priority config  
- Failure-recovery link to dispatch resume  

## Shipped in the 5.21 train

- Monorepo AGENTS snippet  
- Decision cards template + docs  
- Privacy one-pager  
- Handoff shape test  
- Optional junior-proof TDD plan habit  

## Shipped in the 5.22 market-bar train

- Maintainer scorecard under docs/internal (not public README)
- vs Superpowers positioning
- Plan decision-card wiring + dispatch specialist-priority
- Expanded evals (optional maintainer score gate)

## Shipped in the 5.23 failure-UX train

- Deterministic `scripts/status.py` one-screen snapshot  
- `DISPATCH_RESUME` emitter (`--resume` / `--resume-only` / `--json`)  
- Status skill prefers the script; dispatch-resume + failure-recovery wired  
- Eval + unit tests for status/resume  

## Shipped in the 5.24 memory-hygiene depth train

- Conflict quality beyond duplicate headings (Use/Avoid polarity, near-duplicate topics)  
- Prune suggestions (compaction threshold, cold entries, empty bodies, missing type tags)  
- `--strict` / `--json` / `--threshold`; status `memory_ok` shares scanner  
- Expanded unit tests + eval checks  

## Shipped in the 5.25 status depth train

- Feature-phase progress: tasks/ files, Progress row, Tasks checkboxes, current phase, depends-on  
- Background registry: canonical `agents` key, timeout→stalled, uncollected, per-agent rows + JSON  
- DISPATCH_RESUME for mid-flight features (`phase:` field)  

## Shipped in the 5.26 memory auto-archive train

- Deterministic `scripts/memory-compact.py` (dry-run default, `--apply`, compact >7d / archive >30d)  
- Stub + `memory/archive/YYYY-MM.md` sidecars, header dedup, index rebuild  
- Cache skill + compaction protocol prefer the helper; hygiene + session-start point at it  

## Shipped in the 5.27 memory reliability train

- Opt-in `memory.autoCompact` session-start hook for oversized category files
- Deterministic helper remains the only writer; hot, undated, structural, and already-stubbed entries are preserved
- Config/schema, privacy inventory, integration coverage, and mirrored memory protocol docs

## Shipped in the 5.28 doctrine-reference train

- Lazy doctrine reference index keeps startup doctrine compact while preserving navigable source links
- Session-start cache migration refreshes generated doctrine and index artifacts without overwriting customized memory
- Memory indexing, compaction, and reaping skip generated references and use atomic, no-follow writes for safer derived-state maintenance

## Next trains

### Reliability

- Eval harness with golden tasks (see `evals/`)  
- Host parity smoke in CI  

### Congar-class depth

- Monorepo dirty-worktree isolation helpers  
- Decision cards → `.hyperflow/memory/decisions.md` wiring depth  
- Handoff round-trip test  
- Privacy one-pager for skeptical adopters  

### Growth (only after reliability)

- Marketplace listing screenshots from golden path  
- Honest "Hyperflow vs Superpowers" note (different jobs)  
- Template gallery (API scaffold, RN screen, marketing polish)  

## Explicit non-goals (near term)

- Hosted agent cloud  
- Chasing star parity feature-for-feature  
- More specialist agents without ROI measurement  
- Claiming certified Codex support while certificates are preview  

## Related

- [Getting started](getting-started.md)  
- [Golden path](golden-path.md)  
- [Proof](proof.md)  
