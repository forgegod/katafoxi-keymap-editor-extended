# CAP-002 — Keymap sources and persistence

**Status:** partial
**Primary surface:** human

## Behaviour

- Demo loads bundled sample keyboards without an account. Clipboard accepts keymap text with optional layout JSON and exports edited firmware text through Copy .keymap.
- GitHub loads an authorized repository/branch and commits through the API using a base head SHA. A stale head rejects the commit and preserves the draft rather than overwriting remote changes.
- GitHub chooses the first eligible config keymap. Layout lookup prefers config/info.json, then a matching config/<keymap-name>.json. GitHub/Clipboard can use a rectangular binding-count layout when no usable layout is supplied.
- The opt-in Local adapter reads/writes the configured development tree; it is not browser filesystem access.
- Browser drafts can be restored after reload. The app flushes pending draft persistence on pagehide/visibilitychange and surfaces persistence failures. This is recovery, not a leave-page confirmation.

## Implementation

- `apps/web/src/lib/components/Pickers/KeyboardPicker.svelte`
- `apps/web/src/lib/clipboard/load.ts`
- `apps/web/src/lib/clipboard/export.ts`
- `apps/web/src/lib/editor/persist-draft.ts`
- `apps/web/src/App.svelte`
- `apps/api/src/services/github/files.ts`
- `apps/api/src/services/zmk/local-source.ts`
- `packages/keymap-core/src/keyboard-bundle.ts`

## Rules and boundaries

- There is no per-file GitHub keymap picker, browser File System Access source, ZMK matrix-transform discovery or beforeunload warning.
- A rectangular fallback does not describe the physical geometry. Local requires layout metadata rather than promising the browser-source fallback.
- GitHub persistence depends on configured API/App access. Static Pages enables Demo/Clipboard only; Local is development-only.
- JSON priority, template/splice/default save paths and C-style alias expansion follow ADR 0002. Preserve source when the supported splice path applies.
- Browser storage can fail and does not mean firmware was published. Draft restoration is scoped and validated, not guaranteed durable storage.

## Verification

- `apps/api/src/services/github/files.test.ts` — file selection, matching-layout fallback, save contract and stale-head handling.
- `apps/api/src/services/zmk/local-source.test.ts` — gated development file loading/writing and matching layout.
- `packages/keymap-core/src/keyboard-bundle.test.ts` — explicit layout precedence, rectangular fallback and invalid empty input.
- `apps/web/src/lib/clipboard/load.test.ts` — Clipboard input and layout behavior.
- `apps/web/src/lib/editor.publish.test.ts` — save/reload failures, in-flight edits and draft state.
- `apps/web/src/lib/draft-storage.test.ts` — browser draft storage.
- `e2e/github.spec.ts` — mocked GitHub commit, conflict preservation and login draft flush.
- `e2e/clipboard.spec.ts` — Clipboard import/edit/export.
- `e2e/demo.spec.ts` — Demo load and draft restore.

The linked tests prove the named bounded outcomes, not full ZMK/OS compatibility. Run the root unit and browser gates; generated schematics are not executable evidence.

## Related contracts

- [Architecture](../../architecture.md)
- [Target system](../../TARGET_SYSTEM.md)
- [File contract](../../adr/0002-keymap-file-contract.md)
- [Host edit contract](../../adr/0004-host-edit-and-os-deliverables.md)
- [Host snapshot contract](../../adr/0005-host-keymap-github-snapshot.md)

## Links

- [Canonical HTML](../wireframes/html/CAP-002-keymap-sources-and-persistence.html)
- [Rendered PNG](../wireframes/exports/CAP-002-keymap-sources-and-persistence.png)
