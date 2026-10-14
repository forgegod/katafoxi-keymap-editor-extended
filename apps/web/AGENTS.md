# Browser editor

## Purpose

Browser editor.

## Ownership

Svelte components, reactive editor state, source pickers, draft/host storage, and component tests.

## Local Contracts

Keep ZMK parsing and file generation in keymap-core. Plain click edits ZMK; Alt+click edits host glyphs. UI chrome is English. Preserve accessibility, stale-load guards, draft identity, and separate firmware/host dirty state. Arm beforeunload while firmware is dirty, a GitHub host snapshot is unpublished, or GitHub firmware/host recovery remains pending (including omitted host writes); host-install status and non-GitHub host edits do not arm it. Keep pagehide and visibilitychange draft flushing independent of that guard.

Hydration preserves imported arguments beyond catalog arity and keeps undeclared nested arguments opaque. Catalog schemas define editable slots, not a truncation boundary; selecting a replacement behavior intentionally resets its parameters.

KeyEditor previews use the session's full encoded draft once a behavior selection is synchronized. Editable slots omit opaque/excess arguments and must not replace that source-preserving preview.

## Work Guidance

GitHub draft/cache identity includes repository, branch and exact keymap path, not keyboard metadata. Keep unscoped legacy rows unattached; adoption UI is not implemented. Preserve original firmware provenance and separate immutable host origin from working recovery. Selected firmware writes/deletes and host-cache writes require transaction-time conflict checks. Read destination recovery before replacing live identity; branch carry copies/verifies without retiring source recovery. Omitted host publication cannot clear local host work.

Remember repository/branch/file choices only after editor acceptance. A missing remembered path never defaults to another sole candidate. Automatic picker remounts must preserve an unchanged document's history; explicit Reload is separate. Refused loads restore accepted repository/branch/file controls and inventories without triggering another load; chrome identifies the live Commit target while browsing. Selected GitHub transitions verify the captured firmware draft, layer metadata and GitHub baseline, including pending recovery and competing writes; do not extend these semantics to Demo/Clipboard/Local or legacy unselected sessions.

Omitted host writes require explicit browser-local/unpublishable status for actual host recovery before and after firmware-only Commit. Without host recovery, state only the write limitation; pending firmware recovery remains explicit. Only confirmed Discard local host edits clears that recovery block: atomically reset the named identity's host view, private tables, assemblies and working recovery to standard English; preserve firmware/history, historical host origin, remote files, other identities and global profiles. Cancellation, stale consent or storage failure cannot authorize reset. Reload never discards. CHG-004 owns the remaining phase verification/review.

Fence host view, table and assembly mutations while hostRecoveryBusy; a committed discard must reconcile live memory before later persistence. Async host-edit continuations must not cross the reset epoch. Keep identity-private user:github layouts out of global restore and non-owner profile shelves; refuse non-owner selection and in-place edits, including stale view/prompt callbacks.

Follow root keycapFace and CSS-sidecar rules. Pair material interaction changes with CAP tests and canonical wireframes.

Layer-view tests distinguish stored preferences from effective rendered layers. `layerView.shown` may include unavailable layers; check current-layer bounds through core `effectiveShownLayers`, and preserve marks and `layer0Raw` across discard/undo/redo.

Capture the sent document before async publish/copy I/O. Accept only that baseline and preserve newer edits; session-generation guards also own saving-lock cleanup. Export-sheet retries accept the sheet's captured document, never the current draft.

Layer operations delegate to core and commit document/source/identity together. Demo is positively source-free; Clipboard requires its actual source revision. GitHub/local operations remain refused until their real save inputs are available. No source omission implies safety.

The expanded non-stacked layer table exposes Duplicate and Move. Keyboard position selection and internal drag/drop share one transaction; capture the document with the move, refuse stale drafts, and never interpret external drag payloads. Keep layer zero fixed, announce priority changes/refusals, preserve redo on cancel/no-op, and restore focus to the source or moved control without collapsing the overlay during the handoff.

Keep logical layer IDs and source snapshots with undo/redo, copied baselines and versioned draft metadata; restore current eye preferences by identity, including discard after recovery with no history. Once used, identity tracking survives undo to a pre-operation step so delayed copy receipts cannot erase identity-only dirty state. Capture layer metadata for both publish and copy. It never enters firmware JSON or host snapshots.

Every mounted key, encoder, combo-binding and layer-picker draft owner registers a synchronous operation guard and unregisters on destruction. Guard retained row drafts as well as visible sessions; check publication, host editing and staged definitions again at the transaction boundary. Structural operations clear central hover and the local decode owner, not host layout data.

## Verification

From repository root: pnpm --filter @keymap-editor/web test; pnpm --filter @keymap-editor/web lint. Use Node 24 LTS for verification; Node 26 currently causes happy-dom storage failures.

## Child DOX Index

None.
