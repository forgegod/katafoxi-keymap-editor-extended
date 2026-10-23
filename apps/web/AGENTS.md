# Browser editor

## Purpose

Browser editor.

## Ownership

Svelte components, reactive editor state, source pickers, draft/host storage, and component tests.

`src/lib/components/MacroPanel.svelte` and `BehaviorPanel.svelte` own staged macro and named-behavior interaction; `src/lib/macro-editor.ts` owns their shared captured preview/apply transactions. Core owns definition schemas, semantics, references and the shared writer.

`src/lib/components/DefinitionDialog.css` owns opt-in `.definition-dialog`, `.definition-group`, `.definition-check` and `.definition-actions` presentation. Macros and Behaviors adopt it with Common/Button actions. `MacroPanel.css` retains shared viewport/scroll containment. Keep these sidecars split and ordinary button variants/sizing in Common/Button.

## Local Contracts

Keep ZMK parsing and file generation in keymap-core. Plain click edits ZMK; Alt+click edits host glyphs. UI chrome is English. Preserve accessibility, stale-load guards, draft identity, and separate firmware/host dirty state. Arm beforeunload while firmware is dirty, filesystem firmware recovery remains pending, a GitHub host snapshot is unpublished, or GitHub firmware/host recovery remains pending (including omitted host writes); host-install status and non-GitHub host edits do not arm it. Keep pagehide and visibilitychange draft flushing independent of that guard.

Filesystem source state is isolated by its versioned opaque document ID. Store transferable firmware baseline and recovery in draft storage, but keep browser file handles in their own opt-in, origin-local store. Every filesystem Save must use a fresh file-picker handle proved equivalent to the accepted firmware file; directory grants remain discovery-only. The domain modules preserve uncertain recovery and refuse sidecar, host, multi-file, API, GitHub, or publication paths. `components/Pickers/Filesystem/` owns source/access/recovery interaction; `KeyboardPicker` passes the real acceptance result through to it. Never prompt or read disk on mount; every picker and permission request starts synchronously in its own explicit gesture. Keep optional layout selection separate from firmware selection.

Filesystem chrome identifies loaded/draft/saved/pending firmware and always discloses host files not written and browser-local host edits. Keep Reconcile save reachable independently of blocked ordinary Save/editing. Restore and ordinary Discard do not resolve attempts. Reload adoption requires a captured revision, freshly proved identity and validated inputs, with explicit destructive consent for dirty or pending work and a guarded browser-storage commit before live replacement. Clipboard transfer never accepts a filesystem baseline or clears its recovery. Synthetic handle tests do not certify native picker activation or filesystem crash durability.

Hide manual Clipboard transfer while pending stored firmware or structural metadata differs from the live draft; direct the user to Restore first. Reconnect attaches freshly proved same-entry access before inspecting disk content, so unreadable/invalid firmware or geometry cannot hide Reconcile save; failed reconciliation retains recovery without writing. Pending discard-and-reload confirmation must explicitly name retirement of the unresolved attempt and replacement of the verified baseline with validated disk bytes, not imply verification of the earlier Save.

Filesystem selection verifies the baseline model against parsed original source and validates supplied geometry bytes/JSON before acceptance. Receipt baselines stay source-canonical; versioned browser-only display names and logical layer IDs supply presentation, dirty comparison, history and restore without renaming DTS nodes. Validate that separation before retaining an attempt or opening a stream. Repair legacy baseline names only when exact source bytes and every other source-derived field validate, using a guarded row replacement that preserves draft/recovery metadata.

Filesystem attempts persist versioned `prepared` then `write-possible` stages before `createWritable`; the commit/invocation gap and unstaged legacy attempts remain unresolved. Pre-stream cleanup may retire only its matching prepared attempt with row/session guards; failed cleanup preserves protection for surviving attempts. Explicit no-write reconciliation uses a new current-session fence, fresh file-picker identity, exact directory entry and geometry checks: original bytes permit guarded retirement; intended bytes require confirmation and source-canonical receipt acceptance. Restore restores only the draft. Receipt/retirement commits remain authoritative across later edits; retain newer work separately against the committed row without inventing a no-attempt pending lock, clearing declined recovery or releasing another session's lock. Failure retention requires transaction-time storage proof, never memory equality.

Pending dirty filesystem work may switch sources only after exact stored draft/metadata/provenance verification or guarded retention of newer work without retiring the attempt. Declined clean recovery stays untouched. Filesystem Discard must commit the mutable baseline revert and layer metadata before changing live model/layout/history; storage failure or stale consent returns false and preserves live work. Keep verified provenance and any unresolved attempt through Discard and reopen; a post-commit edit stays live and is retained separately.

Hydration preserves imported arguments beyond catalog arity and keeps undeclared nested arguments opaque. Catalog schemas define editable slots, not a truncation boundary; selecting a replacement behavior intentionally resets its parameters.

KeyEditor previews use the session's full encoded draft once a behavior selection is synchronized. Editable slots omit opaque/excess arguments and must not replace that source-preserving preview.

KeyEditorHost computes Unicode compatibility only from the editor-selected English profile/table, tracking hostLayoutRevision, and passes the core result through KeyEditor to UnicodePicker without mutation. Keep all three accessible states advisory: no national/default fallback, mapping repair, OS-layout detection/switching or compatibility-based Apply block. Preserve scalar validation and staged Cancel/no-op/source contracts.

## Work Guidance

For every UI change, follow [the editor design language](../../docs/ui-design-language.md): use the shared theme/type roles and ordinary Button primitive, take compact panel hierarchy from Combos, and style internal controls across all affected states rather than only the launcher. Preserve semantic variants and verify computed styles, focus/disabled states and wrapping in both themes with real browser evidence.

Layout discovery is an optional Clipboard/GitHub session-geometry transaction. Supplied JSON wins. Capture actual source proof and document/history state; refuse dirty/recovery/busy/staged work and recheck on Accept/Export. Delegate metadata parsing and order validation to core. Catalog imports are offline curator artifacts, not verified hardware inventory; disclose attribution and unverified compatibility. Acceptance never writes files or publishes firmware/host work; JSON download is separate. Do not automatically persist/reapply catalog choices or extend discovery into Filesystem/Local.

Discovery acceptance changes only the live display layout, never `baselineLayout`: branch carry and persisted GitHub recovery retain the loaded repository geometry, and firmware Discard restores that loaded layout as well as the baseline bindings.

GitHub draft/cache identity includes repository, branch and exact keymap path, not keyboard metadata. Keep unscoped legacy rows unattached; adoption UI is not implemented. Preserve original firmware provenance and separate immutable host origin from working recovery. Selected firmware writes/deletes and host-cache writes require transaction-time conflict checks. Read destination recovery before replacing live identity; branch carry copies/verifies without retiring source recovery. Omitted host publication cannot clear local host work.

Host-cache hydration never assigns the firmware publish head; only firmware recovery restores stored firmware provenance. After firmware restoration changes that head, synchronize the selected host cache before completing selection. Private-profile deletion retains explicit owned IDs across hydration skips and failed writes; later serialized, revision-checked cache transactions carry them with the replacement view and table writes. Keep private table/metadata and the retry prompt until commit, and refuse selection/editing of pending deletions. Retire deletion intent only after its transaction (or scoped host discard) commits. Absence from hydrated layouts is not deletion: retain inactive private tables, global profiles and other identities.

Pending exact-owner profile deletes cannot be dismissed by Cancel/backdrop or dropped by same-identity Reload. On owner return, restore pending inactive records and their retry prompt without exposing them to other identities or making them selectable/editable. Resolve confirmation names from retained userLayouts, not the selectable profile shelf.

Remember repository/branch/file choices only after editor acceptance. A missing remembered path never defaults to another sole candidate. Automatic picker remounts must preserve an unchanged document's history; explicit Reload is separate. Refused loads restore accepted repository/branch/file controls and inventories without triggering another load; chrome identifies the live Commit target while browsing. Selected GitHub transitions verify the captured firmware draft, layer metadata and GitHub baseline, including pending recovery and competing writes; do not extend these semantics to Demo/Clipboard/Local or legacy unselected sessions.

GitHub validation dialogs use the API error's exact path when supplied, not the selected firmware filename. Keep legacy title-based filenames only as a fallback for path-free errors; dismissal never accepts a failed load.

Omitted host writes require explicit browser-local/unpublishable status for actual host recovery before and after firmware-only Commit. Without host recovery, state only the write limitation; pending firmware recovery remains explicit. Only confirmed Discard local host edits clears that recovery block: atomically reset the named identity's host view, private tables, assemblies and working recovery to standard English; preserve firmware/history, historical host origin, remote files, other identities and global profiles. Cancellation, stale consent or storage failure cannot authorize reset. Reload never discards. CHG-004 owns the remaining phase verification/review.

Fence host view, table and assembly mutations while hostRecoveryBusy; a committed discard must reconcile live memory before later persistence. Async host-edit continuations must not cross the reset epoch. Keep identity-private user:github layouts out of global restore and non-owner profile shelves; refuse non-owner selection and in-place edits, including stale view/prompt callbacks.

Follow root keycapFace and CSS-sidecar rules. Pair material interaction changes with CAP tests and canonical wireframes.

The legend panel owns horizontal scrolling within the available chrome width. Scroll the complete table without wrapping its headers away from layer cells or ellipsizing rotated Alt glyphs. Keep notes and layer confirmations outside the table scrollport; language/profile popovers use viewport positioning to escape its clip while retaining DOM ownership for focus and dismissal. The profile list consumes the popover action's available-height limit and scrolls vertically above the viewport bottom. Keep profile/language selection and Alt-toggle semantics separate from layout.

Layer-view tests distinguish stored preferences from effective rendered layers. `layerView.shown` may include unavailable layers; check current-layer bounds through core `effectiveShownLayers`, and preserve marks and `layer0Raw` across discard/undo/redo. Keep captured model-property seeds as additional replay cases, not replacements for fresh random runs.

Capture the sent document before async publish/copy I/O. Accept only that baseline and preserve newer edits; session-generation guards also own saving-lock cleanup. Export-sheet retries accept the sheet's captured document, never the current draft.

Layer operations delegate to core and commit document/source/identity together. Demo is positively source-free; Clipboard requires its actual source revision. GitHub/local operations remain refused until their real save inputs are available. No source omission implies safety.

The expanded non-stacked layer table exposes Duplicate and Move. Keyboard position selection and internal drag/drop share one transaction; capture the document with the move, refuse stale drafts, and never interpret external drag payloads. Keep layer zero fixed, announce priority changes/refusals, preserve redo on cancel/no-op, and restore focus to the source or moved control without collapsing the overlay during the handoff.

Keep logical layer IDs and source snapshots with undo/redo, copied baselines and versioned draft metadata; restore current eye preferences by identity, including discard after recovery with no history. Once used, identity tracking survives undo to a pre-operation step so delayed copy receipts cannot erase identity-only dirty state. Capture layer metadata for both publish and copy. It never enters firmware JSON or host snapshots.

Every mounted key, encoder, combo-binding, layer-picker, macro and behavior-definition draft owner registers a synchronous operation guard and unregisters on destruction. Guard retained row drafts as well as visible sessions; check publication, host editing and staged definitions again at the transaction boundary. Structural operations clear central hover and the local decode owner, not host layout data.

Macro authoring accepts only source-free Demo or verified Clipboard source. Stage edits/use/delete until source preview confirmation; recheck the captured document/source and other draft guards. Carry the writer's source with its reparsed model through history and enable persistence of the matching snapshot for Clipboard recovery. Cancel/no-op must retain redo. Do not infer sensor-child compatibility or enable GitHub/local authoring from catalog membership. Text conversion uses core's explicit US ASCII contract, not Host legends; reject pasted CR before textarea normalization.

Behaviors uses the same provenance/transaction boundary and core-authoritative coverage, including refusal for stock override blocks such as `&mt`. Distinguish global definition properties from per-invocation arguments before Apply. Ordinary Use targets existing keys/combos; zero-cell sensor-rotate Use replaces a whole existing encoder adapter, never creates hardware/slots. Unsupported definitions stay read-only with diagnostics. Preserve writer-reconciled behavior fingerprints and legacy hold-taps during interleaved macro/behavior edits.

Macro and behavior invocation/rename/delete preflights consume the shared preview's `definitionSource`; render/export its full `code`. Only core's source-free generated graph may separate validation from the appended fixed RGB recipe. Clipboard retains full-source validation; never strip imported headers or recipes in the UI to grant ownership.

Demo remains source-free after layer operations even when history retains generated source. In staged Demo definition deletion/rename, remove only the removed captured hold-tap definitions' legacy mirrors; retain unmanaged presets and keep normal key-editor hold-tap semantics separate. Clipboard reconciliation stays with the source-backed writer.

## Verification

From repository root: pnpm --filter @keymap-editor/web test; pnpm --filter @keymap-editor/web lint. Use Node 24 LTS for verification; Node 26 currently causes happy-dom storage failures.

`pnpm exec playwright test e2e/editor-design-language.spec.ts` checks bounded Macro/Behavior control styles, keyboard/disabled states and wrapping in light/dark at 1280×720 and 360×640. Behavior examples cover ordered tap-dance, hold-tap flavor, sticky-key flags/typed invocation, mod-morph required fields, sensor-rotate, opaque diagnostics and source restrictions; this is not exhaustive schema certification.

`pnpm exec playwright test e2e/legend-clipping.spec.ts` checks Demo Corne's resting/expanded AltGr, AltGr+Shift and Choose controls at those viewports/themes, plus every item in the German system-profile menu and Add/change language lists with English and German present. Measure boxes and text ranges; accept offscreen controls only through viewport-contained auto/scroll ancestry that exposes both, and verify hit-testing. Viewport-fixed menus escape outer DOM scroll clips, not the viewport; SVG-only controls still require full boxes. It also checks that the auto-focused layer Delete confirmation is painted outside the scrollport and Escape cancels without editing.

## Child DOX Index

None.
