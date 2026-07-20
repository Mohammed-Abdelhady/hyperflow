# Getting started: default vs advanced

Hyperflow is deep on purpose. **Start thin.**

## One-line product

**Project memory + reviewed multi-agent chain for AI coding CLIs.**

Issue→PR is a mode. The viewer is optional. Doctrine is the floor.

## Default surface (learn these first)

| Skill | When |
|---|---|
| `plan` | Design + decompose |
| `dispatch` | Build under review |
| `status` | What is in flight |
| `cache` | Read/write project memory |
| `trace` | Debug root cause |

Daily habit:

```text
/hyperflow:plan → /hyperflow:dispatch → /hyperflow:status
```

## Advanced surface (after golden path)

| Skill | When |
|---|---|
| `issue` | GitHub issue → reviewed PR |
| `pr` | Review an incoming PR |
| `audit` | Explicit L1-L5 outside review |
| `deploy` | Gates + push (always gated) |
| `workflow` | Large migrations / system-wide work |
| `handoff` | Plan on machine A, build on machine B |
| `scaffold` | Force re-setup (usually automatic) |
| `design` | Design-system / anti-slop research |
| `background` / `sticky` / `bridge` / `flush` / `reap` | Ops and portability |

## Progressive disclosure rule (for agents)

1. Prefer default skills unless the user names an advanced skill or the task clearly needs it.  
2. Do not dump the full doctrine in chat. Point to docs.  
3. Auto-route to `plan`/`dispatch`/`trace` for ordinary build/debug language.

## Next

1. [Golden path (5 minutes)](golden-path.md)  
2. [Proof pack](proof.md)  
3. [Orchestration](orchestration.md)

## Market bar

We score ourselves in [market-bar.md](market-bar.md). Target: 16/20.
