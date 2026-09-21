# ADR 0001: Persistence — GitHub-first thin API

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

This fork needs a clear split between:

1. **Product persistence** — how end users load and save firmware (and later host) keymap data.
2. **Development convenience** — editing against a local clone such as `zmk-keyboard-lark` while building features.

Upstream keymap-editor intent (see `old-readme.md`) lists GitHub, Clipboard, and browser File System Access as keymap sources. The frozen tree also contains a Node “sibling `zmk-config`” path used by `running-locally.md`. Growing that Node path into a full local file server would fight the planned work (composed host×ZMK legends, host layout files) and duplicate what the browser or GitHub already can do.

The only hard requirement for a backend today is **keeping GitHub App / OAuth secrets off the client** and performing authenticated GitHub API writes.

## Decision

1. **Treat the Hono API as a thin GitHub gateway** (OAuth, installation tokens, read/write repo files). Do not add product features that require the server to own the user’s disk.
2. **Treat local `zmk-config` / junction I/O (`ENABLE_LOCAL`, `GET/POST /layout|/keymap`) as a dev adapter** — allowed for fixtures and iteration on real boards, not the architectural center.
3. **Keep all keymap/host domain logic in `packages/keymap-core`**, usable from the browser first; the API calls core for generate/parse when committing or for the dev bridge.
4. **Target product sources** (implement or restore over time): GitHub (primary), Clipboard, File System Access API — including future host-layout artifacts alongside ZMK config.
5. When local and GitHub share a file format concern (e.g. `.keymap` round-trip), implement it **once in core**, then wire both adapters.

## Consequences

### Positive

- Clear place for LARK/host-compose work: client + `keymap-core`.
- Smaller, safer API surface.
- Dev can still use a real firmware repo via junction without pretending that is the product.

### Negative / trade-offs

- Dev-local and GitHub can drift if adapters are not kept on the same core contracts — must share parse/generate/splice and tests.
- File System Access / Clipboard are not fully restored in this tree yet; until they are, GitHub + optional dev-local remain the practical paths.
- Saving via GitHub still needs careful `.keymap` preservation (template or splice); that is a separate ADR / hardening workstream.

## References

- [TARGET_SYSTEM.md](../TARGET_SYSTEM.md)
- [running-locally.md](../../running-locally.md)
- Upstream feature list in `old-readme.md`
