# Codex support: preview

Hyperflow provides a Codex plugin manifest and the same seven Markdown workflow surfaces, but it does not make a blanket Codex support claim.

## Independent surfaces

| Surface | Current claim |
|---|---|
| Codex CLI | Preview, uncertified |
| Codex app-server | Preview, uncertified |
| Codex desktop App | Preview, uncertified |

A successful plugin listing or CLI workflow does not certify app-server or desktop App behavior. Each surface needs evidence from that exact surface and build.

## Command model

Treat `hyperflow plan`, `hyperflow dispatch`, `hyperflow trace`, `hyperflow audit`, `hyperflow deploy`, and `hyperflow handoff` as textual intents unless the active Codex version exposes a native command for them. Hyperflow does not claim native `/hyperflow:*` slash commands in Codex.

## Capability model

Use collaboration, structured questions, parallel tools, or thread controls only when they are present in the live tool inventory. If a capability is absent:

- Direct work continues with the coordinator.
- Focused or Deep work reports the missing independence boundary and uses only an honest supported fallback.
- Background notifications, lifecycle events, and review evidence are never fabricated.

Hyperflow registers no automatic lifecycle runtime in the Codex manifest and performs no automatic startup work.

## Installation evidence

Installation proves only that the manifest and seven skill directories are discoverable. A workflow claim additionally requires routing, scoped writes, independent review where promised, verification, and push-gate behavior to pass on the same Codex surface.

See [installation](installation.md). This document is the compatibility contract; no generated registry or derived schema is required at runtime.
