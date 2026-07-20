# Golden path (5 minutes)

The thinnest path from install to a reviewed change. Everything else is advanced.

## Goal

In one short session you should see:

1. Hyperflow load project facts  
2. A plan written under `.hyperflow/`  
3. Dispatch with Worker → Reviewer  
4. Memory updated  

## Prerequisites

- Claude Code (primary) or another supported host  
- Hyperflow installed ([installation](installation.md))  
- A real git repo (not only this plugin repo)

## Steps

### 1. Open a project repo

```bash
cd /path/to/your-app
git status   # clean enough to work
```

### 2. First chain-starter (auto-scaffold)

```text
/hyperflow:plan
```

Say what you want in one sentence, for example:

```text
Add a GET /healthz route that returns JSON {status:"ok"} and a unit test.
```

On first use, Hyperflow scaffolds `.hyperflow/` (profile, conventions, memory). Accept defaults unless you know better.

### 3. Answer only structural questions

Clarify **what/which/where**. Do not answer "should I start?"  -  the agent starts.

Sign off the short design chunks when prompted.

### 4. Dispatch

When the plan stops at the build gate:

```text
/hyperflow:dispatch
```

(or continue if the chain auto-advances in your host)

Watch: workers implement under review; integration review signs off.

### 5. Status and memory

```text
/hyperflow:status
/hyperflow:cache show
```

You should see decisions/learnings for this project only.

## Success checklist

- [ ] `.hyperflow/` exists and is project-local  
- [ ] Spec/tasks under `.hyperflow/` (not `PLAN.md` at repo root)  
- [ ] At least one Conventional Commit style change  
- [ ] Reviewer path ran (or inline-fast for a true 1-2 file reversible edit)  
- [ ] `cache show` lists something non-empty after the run  

## If something fails

See [dispatch resume](dispatch-resume.md) and [failure recovery](../skills/hyperflow/failure-recovery.md).

## Not the golden path (advanced)

Issue→PR full chain, audit gates, deploy, workflow migrations, handoff packages, ROI viewer, reap. Use those after this path works once.

## Related

- [Getting started (default vs advanced)](getting-started.md)  
- [Proof pack](proof.md)  
- [Demo GIF script](demo-script.md)  
