# CAP-002 — Keymap sources and persistence

**Status:** partial
**Primary surface:** human

## Behaviour

- Demo loads bundled sample keyboards without an account. Clipboard accepts keymap text with optional layout JSON and exports edited firmware text through Copy .keymap.
- GitHub loads an authorized repository/branch and commits through the API using a base head SHA. A stale head rejects the commit and preserves the draft rather than overwriting remote changes.
- The GitHub picker lists eligible direct config keymaps after repository/branch selection. Without a remembered selection, only a sole candidate defaults; multiple candidates require explicit choice. Accepted exact paths are remembered per repository/branch and carried through Reload and Commit. Loading, empty inventory and missing-file states are explicit; a vanished accepted path never falls back to the remaining sole file.
- Proved legacy mode retains config/keymap.json and config/info.json priority. Scoped mode uses selected-file firmware JSON, a matching template/physical-layout JSON and a durable mode marker per ADR 0002; shared legacy sidecars remain untouched. Creating a missing/invalid scoped firmware JSON beside legacy JSON requires revision-bound explicit input choice at the API. GitHub/Clipboard can infer a rectangular binding-count layout when geometry is absent.
- The opt-in Local adapter reads/writes the configured development tree; it is not browser filesystem access.
- Browser drafts can be restored after reload. The app flushes pending draft persistence on pagehide/visibilitychange and surfaces persistence failures. That flush is recovery, not publication, and it runs whether or not a leave warning is armed.
- The app attaches the browser-native beforeunload guard while firmware is dirty, a GitHub host snapshot is unpublished, or GitHub firmware/host recovery remains pending, including host edits omitted from Commit. It rechecks live state when the event fires and never saves or publishes from that handler. Persisting or restoring browser recovery does not clear the warning; non-GitHub host edits and OS-install status do not arm it.
- Dismissing native leave confirmation keeps the page open with its applied edit; accepting it permits leaving without publishing. On reload, leave confirmation precedes the separate compatible-draft recovery prompt. Restoring keeps the unpublished edit. Demo/Clipboard/Local decline discards that source's stored firmware draft; GitHub decline retains it and disables publication and automatic draft replacement while recovery remains pending.
- Selected GitHub drafts use repository/branch/path identity and retain firmware baseline provenance. Same-identity dirty Reload preserves live work and its old publish base. Branch-carry plumbing validates the selected file/baseline and verifies copies before retargeting; failures retain the original session and source recovery. Firmware and host storage are separate transactions, not a cross-database atomic move.
- Switching away from selected GitHub work verifies the captured firmware draft, layer metadata and GitHub baseline under the original identity, including declined/pending recovery. Competing writes cannot substitute another revision as proof of retention. Omitted host writes plus local host work block switching until the separately confirmed host-only reset; clean sessions do not require that reset. Refused repository, branch, file and inventory loads restore accepted controls without replacing persisted choices; Reload and Commit retain the same identity. Chrome names the accepted Commit target during pending loads. Automatic unchanged picker remount preserves clean undo/redo history.
- The Host lane offers Discard local host edits even with one keymap. Its confirmation names repository, branch and file, resets only that identity's host work to system English, and preserves firmware drafts/history, remote files, other identities and global profiles. Cancel leaves storage unchanged. Reload is never a discard action. See [host recovery](CAP-003-host-layouts-and-legends.md).
- Successful Local write plus reload, GitHub commit plus reload, or Clipboard copy accepts the sent baseline without dropping newer edits. A successful **Copy again** in the export sheet accepts that sheet's exact exported snapshot, not the later live draft. Failed write/copy/reload and superseded-session completions do not advance the active baseline. Confirmed Discard draft reverts firmware only; publishable GitHub host changes still require Commit, while omitted host recovery remains browser-local. The guard is removed only when no unpublished work or pending recovery remains.

## Implementation

- `apps/web/src/lib/components/Pickers/KeyboardPicker.svelte`
- `apps/web/src/lib/components/Pickers/Github/Picker.svelte` and `apps/web/src/lib/github/storage.ts` — accepted file choice and branch-scoped persistence.
- `apps/web/src/lib/editor/select-keyboard.ts` — source transitions and verified firmware retention.
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

- There is no browser File System Access source or ZMK matrix-transform discovery.
- Legacy unscoped browser rows remain stored and unattached. Per-file JSON choice/adoption UI is not implemented: the API rejects a Commit requiring that consent rather than silently adopting shared JSON. A failed branch carry may leave destination recovery copies; it never retires source rows or claims to undo remote branch creation.
- A rejected system-clipboard write does not count as Copy .keymap export. The export sheet may still show the text for a manual copy, and the firmware draft stays dirty.
- The app cannot detect a manual copy from selected text. Only a confirmed system-clipboard write advances the Clipboard baseline. Export warnings remain in the sheet.
- Native confirmation requires browser support and prior user interaction; wording is browser-controlled and delivery is not guaranteed, especially on mobile. This guard does not block internal source or keyboard switching.
- A rectangular fallback does not describe the physical geometry. Local requires layout metadata rather than promising the browser-source fallback.
- GitHub persistence depends on configured API/App access. Static Pages enables Demo/Clipboard only; Local is development-only.
- JSON priority, template/splice/default save paths and C-style alias expansion follow ADR 0002. Preserve source when the supported splice path applies.
- Browser storage can fail and does not mean firmware was published. Draft restoration is scoped and validated, not guaranteed durable storage.
- Demo has no firmware write/export action: its dirty firmware still warns even after browser persistence. Returning to the loaded baseline (Undo or confirmed Discard draft) clears firmware dirty state. Local Write files, Clipboard Copy .keymap, and GitHub Commit are distinct source handoffs, not OS installation. Newer unsent edits keep the warning armed after a handoff.

## Verification

- `apps/api/src/services/github/files.test.ts` — file selection, matching-layout fallback, save contract and stale-head handling.
- `apps/api/src/services/github/selected-files.test.ts` — exact selected write sets/readback, unchanged unrelated blobs, ownership marker, consent identity/revision checks, host omission and mocked write failures.
- `packages/keymap-core/src/repository-keymap.test.ts` — exact paths, distinct sidecar roots and self-contained host references.
- `apps/web/src/lib/github-selected-identity.test.ts` — equal-metadata file isolation, retained provenance/recovery, guarded branch carry, storage failures and stale callbacks.
- `apps/web/src/lib/components/Pickers/Github/Picker.test.ts` — explicit selection, remembered missing-file no-fallback, rejected selection, independent branch choices, remount history and stale completions.
- `apps/web/src/lib/github-host-discard.test.ts` — scoped atomic reset, storage failures, firmware preservation and protected source transitions.
- `apps/api/src/services/zmk/local-source.test.ts` — gated development file loading/writing and matching layout.
- `packages/keymap-core/src/keyboard-bundle.test.ts` — explicit layout precedence, rectangular fallback and invalid empty input.
- `apps/web/src/lib/clipboard/load.test.ts` — Clipboard input and layout behavior.
- `apps/web/src/lib/editor.publish.test.ts` — save/reload failures, in-flight edits and draft state.
- `apps/web/src/App.test.ts` — beforeunload guard for firmware edits, GitHub host-snapshot edits, discard, failed and in-flight saves, clipboard copy, restored Demo drafts, source changes, and independent pagehide/visibilitychange flush.
- `apps/web/src/lib/editor/clipboard-copy.test.ts` — rejected writes, in-flight edits/undo, exact export-sheet retry baselines, stale source/re-paste completions, validation before clipboard I/O, and copy-lock ownership.
- `apps/web/src/lib/components/Pickers/Clipboard/ExportSheet.test.ts` — only a successful Copy again reports export completion.
- `apps/web/src/lib/publish-keymap.test.ts` — publish completion preserves newer edits and cannot release a newer session's saving lock.
- `apps/web/src/lib/draft-storage.test.ts` — browser draft storage.
- `e2e/github.spec.ts` — mocked GitHub commit/conflict/login, two-file edit/retention/selected Commit, vanished-file reopen, Reload then blocked transition, cancelled/confirmed host-only reset, and firmware-only Commit/reopen retaining host recovery. Assertions read browser storage and synthetic API artifacts; server-side enforcement is covered separately by API tests.
- `e2e/clipboard.spec.ts` — Clipboard import/edit/export.
- `e2e/demo.spec.ts` — real-edit Chromium close confirmation: dismissal retains the edit and acceptance closes the page; recovery storage does not disarm it. Reload handles native leave before restore/discard, and a discarded clean draft reloads without either prompt.
- `e2e/local-keymap.spec.ts` — native leave confirmation before draft recovery; declining restore leaves disk unchanged, removes the stored draft, and returns to a clean editor.

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
