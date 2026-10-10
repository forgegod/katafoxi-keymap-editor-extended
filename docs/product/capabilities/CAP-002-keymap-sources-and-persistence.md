# CAP-002 — Keymap sources and persistence

**Status:** partial
**Primary surface:** human

## Behaviour

- Demo loads bundled sample keyboards without an account. Clipboard accepts keymap text with optional layout JSON and exports edited firmware text through Copy .keymap.
- GitHub loads an authorized repository/branch and commits through the API using a base head SHA. A stale head rejects the commit and preserves the draft rather than overwriting remote changes.
- GitHub chooses the first eligible config keymap. Layout lookup prefers config/info.json, then a matching config/<keymap-name>.json. GitHub/Clipboard can use a rectangular binding-count layout when no usable layout is supplied.
- The opt-in Local adapter reads/writes the configured development tree; it is not browser filesystem access.
- Browser drafts can be restored after reload. The app flushes pending draft persistence on pagehide/visibilitychange and surfaces persistence failures. That flush is recovery, not publication, and it runs whether or not a leave warning is armed.
- The app attaches the browser-native beforeunload guard only while firmware is dirty or a GitHub host snapshot is unpublished. It rechecks live state when the event fires and never saves or publishes from that handler. Persisting or restoring a browser draft does not clear the warning; browser-only host edits and OS-install status do not arm it.
- Successful Local write plus reload, GitHub commit plus reload, or Clipboard copy accepts the sent baseline without dropping newer edits. A successful **Copy again** in the export sheet accepts that sheet's exact exported snapshot, not the later live draft. Failed write/copy/reload and superseded-session completions do not advance the active baseline. Confirmed Discard draft reverts firmware only; any remaining GitHub host-snapshot change still requires a commit. The guard is removed only when both dirty conditions are false.

## Implementation

- `apps/web/src/lib/components/Pickers/KeyboardPicker.svelte`
- `apps/web/src/lib/clipboard/load.ts`
- `apps/web/src/lib/clipboard/export.ts`
- `apps/web/src/lib/editor/persist-draft.ts`
- `apps/web/src/lib/editor/leave-warning.ts`
- `apps/web/src/lib/editor/clipboard-copy.ts`
- `apps/web/src/lib/editor/publish-bridge.ts`
- `apps/web/src/lib/components/Pickers/Clipboard/ExportSheet.svelte`
- `apps/web/src/App.svelte`
- `apps/api/src/services/github/files.ts`
- `apps/api/src/services/zmk/local-source.ts`
- `packages/keymap-core/src/keyboard-bundle.ts`

## Rules and boundaries

- There is no per-file GitHub keymap picker, browser File System Access source, or ZMK matrix-transform discovery.
- A rejected system-clipboard write does not count as Copy .keymap export. The export sheet may still show the text for a manual copy, and the firmware draft stays dirty.
- The app cannot detect a manual copy from selected text. Only a confirmed system-clipboard write advances the Clipboard baseline. Export warnings remain in the sheet.
- Native confirmation requires browser support and prior user interaction; wording is browser-controlled and delivery is not guaranteed, especially on mobile. This guard does not block internal source or keyboard switching.
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
- `apps/web/src/App.test.ts` — beforeunload guard for firmware edits, GitHub host-snapshot edits, discard, failed and in-flight saves, clipboard copy, restored Demo drafts, source changes, and independent pagehide/visibilitychange flush.
- `apps/web/src/lib/editor/clipboard-copy.test.ts` — rejected writes, in-flight edits/undo, exact export-sheet retry baselines, stale source/re-paste completions, validation before clipboard I/O, and copy-lock ownership.
- `apps/web/src/lib/components/Pickers/Clipboard/ExportSheet.test.ts` — only a successful Copy again reports export completion.
- `apps/web/src/lib/publish-keymap.test.ts` — publish completion preserves newer edits and cannot release a newer session's saving lock.
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
