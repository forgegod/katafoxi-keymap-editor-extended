# CAP-001 — Firmware keymap editing

**Status:** partial
**Primary surface:** human

## Behaviour

- Clicking a firmware layer slot opens a staged KeyEditor. A complete binding can be applied; cancel leaves that key unchanged. Catalog choices include keys, modifiers, layer references, device commands and Unicode input. Bluetooth choices include `BT_DISC` with the documented default profile indexes `0`–`4` and parameterless `BT_CLR_ALL`; RGB underglow choices include parameterless `RGB_ON` and `RGB_OFF`.
- Output choices include `OUT_NONE` (prevent output), `OUT_USB` (prefer USB), and `OUT_BLE` (prefer the current Bluetooth profile). `OUT_TOG` remains available. Apply, reopen, cancel, and Clipboard export retain the selected symbolic token.
- Key Toggle (`&kt`) uses the keycode picker, including modifier keys and hold wrappers; Apply requires a key. Grave Escape (`&gresc`), Soft Off (`&soft_off`), Reset (`&sys_reset`), and Bootloader (`&bootloader`) require no value but remain staged until Apply. Ctrl+click opens the stock behavior's ZMK documentation without changing the binding.
- The stock picker does not advertise `&reset`. Imported legacy `&reset`, including opaque arguments, is retained without conversion to `&sys_reset`; legacy JSON imports remain accepted. The editor's binding preview and no-op Apply retain complete opaque/excess arguments, not just the editable catalog slots.
- Users add blank layers, rename or delete layers, and undo/redo ZMK draft changes. Deleting a layer remaps supported layer references and combo filters, with a warning when a deleted target becomes transparent.
- In the expanded layer table with Stack off, Duplicate appends an independent copy of a layer's keys and encoder bindings, including layer zero. The first unused `<name> copy` / `<name> copy 2` name is chosen; copied self-references still target the original layer. Global combos/rules are not duplicated, and explicit combo filters do not gain the copy.
- Move opens a keyboard-accessible final-position selector; dragging a Move control onto another Move control uses the same transaction. Layer zero stays fixed. Proven reference targets follow their logical layers across bindings, combo filters, conditional rules, sensors and supported recipes; numeric firmware priority changes intentionally.
- Each successful duplicate/move is one firmware undo step. Duplicate retains focus on its source control; a move follows the moved layer's control. Cancel, Escape, unchanged position, rejected moves and external drops do not edit the document or consume redo. Results and refusal reasons appear in a polite status region. A move captured before another document edit is refused rather than retargeted.
- Users edit visual combos, conditional-layer rules and existing encoder sensor bindings. Hold-tap timing and Homerow/Autoshift presets are editable; the fixed rgblayer recipe can be inserted on save.
- Existing external bindings and their opaque parameters survive supported import/edit/export. Macros lists supported definitions and read-only diagnostics for opaque definitions; unsupported source is not promoted to editable syntax.
- Macros provides bounded staged authoring on Demo and verified Clipboard documents: create a label, edit display name, ordered behavior/control steps and tap/wait timing (including zero), then preview source and Confirm changes. New definitions offer zero, one or two parameters; existing parameter counts stay fixed. The focused interaction tests exercise one-input forwarding, step movement and timing, not every control combination.
- Use assigns a validated invocation to an existing key or combo with inferred argument types and a replacement/source preview. Delete refuses referenced or unproven targets and reports sites/reasons; an eligible unreferenced deletion also requires source preview and confirmation. Cancel and unchanged edits preserve redo. Confirmed changes carry the model and matching Clipboard source through firmware undo/redo; recovered Clipboard drafts retain that source for further editing and discard.
- Text to sequence requires explicit US QWERTY / ASCII acknowledgement and a valid sequence preview. It creates a new zero-parameter sequence, with editable initial tap/wait values of 40 ms, independently of Host language. Invalid input disables use rather than partially converting it; pasted CRLF is rejected before textarea normalization. Queue warnings remain visible during editing and confirmation.
- Applying a changed binding updates the firmware draft, not the source files. A dirty firmware draft arms native leave-page confirmation, including in Demo. Dismissing the confirmation keeps the applied edit; accepting it leaves without publishing.

## Implementation

- `apps/web/src/lib/components/KeyEditor/KeyEditor.svelte`
- `apps/web/src/lib/components/MacroPanel.svelte` and `apps/web/src/lib/components/MacroPanel.css` — macro list, staged sequence/timing/parameter controls, text conversion, invocation and deletion previews; mounted by `apps/web/src/App.svelte`.
- `apps/web/src/lib/macro-editor.ts` — captures the document/source revision, checks draft owners and busy state, delegates preview generation to core, and commits matching source/model through existing history and recovery snapshots.
- `packages/keymap-core/src/zmk-macros.ts` — bounded parsing, validation, reference/delete preflight, source-local edits, queue warnings and fixed US ASCII conversion; shared `buildKeymapCode` remains the writer.
- `apps/web/src/lib/components/KeyEditor/BehaviourRow.svelte` — stock choices and documentation actions.
- `apps/web/src/lib/key-edit-session.svelte.ts` and `apps/web/src/lib/hydrate.ts` — staged binding tree and opaque argument preservation.
- `packages/keymap-core/data/zmk-behaviors.json`, `packages/keymap-core/src/behaviors.ts`, and `packages/keymap-core/src/zmk-docs.ts` — shared stock catalog, firmware notes, and documentation links.
- `apps/web/src/lib/editor/document.svelte.ts`
- `apps/web/src/lib/components/HostLegendPicker.svelte` and `apps/web/src/lib/components/HostLegendLayerRow.svelte` — layer controls, move draft, drag/drop, focus and status.
- `packages/keymap-core/src/layer-operations.ts` and `packages/keymap-core/src/layer-operation-source.ts` — immutable graph transforms, closed source preflight and logical source-node moves.
- `apps/web/src/lib/editor/persist-draft.ts` and `apps/web/src/lib/editor/publish-bridge.ts` — layer identity/source recovery and captured copy baselines.
- `apps/web/src/App.svelte` and `apps/web/src/lib/editor/leave-warning.ts` — native leave confirmation for the applied draft.
- `packages/keymap-core/src/keymap.ts`
- `packages/keymap-core/src/dts-splice.ts`
- `packages/keymap-core/src/dts-behaviors.ts`

## Rules and boundaries

- Macro authoring is bounded, not an arbitrary ZMK/custom-behavior-definition editor. Demo is positively source-free; Clipboard requires its matching source and core's closed source proof. GitHub/local, missing-source Clipboard, template-backed and unproven documents are not macro-authoring paths. No include fetching, repair, firmware build or host execution is added.
- Macro Use supports keys and existing combos only: no sensor-child assignment or general sensor-adapter authoring, and no new hold-tap child authoring. Deletion/label rename require complete document-local reference coverage and zero incoming references; no cross-file proof or force-delete. The fixed rgblayer recipe stays separately owned. Macro-aware layer deletion and the full CHG-005 M01–M12 matrix are not certified by this slice.
- Text conversion accepts printable ASCII plus LF/TAB only, at most 24 characters / 48 queue entries, with a 16-entry margin against the pinned default queue size of 64. That margin is not a runtime safety guarantee; arbitrary concurrent/nested work, firmware settings, modifiers and host layout can affect output. No Unicode fallback or Host-layout inversion. General sequences retain core's 256-entry bound.
- Macro preview confirmation rechecks document/source identity and other open draft owners; stale previews refuse without overwriting newer work. Source and model travel together in existing browser history/recovery metadata, never through a separate serializer. The canonical macro visual is a schematic of separate states, not an application screenshot or proof of firmware output.
- Duplicate/reorder accept Demo's positively source-free model or Clipboard's matching, supported source revision. GitHub, dev-local, source-less Clipboard, templates and unsafe/unknown source graphs are refused; controls do not bypass this boundary. Diagnostics direct users to review the source/definition externally. No include fetching or server expansion is involved.
- Opaque external arguments are not assumed to be layer indices. Reorder requires proven slots; duplication preserves opaque payloads only when the selected source/model passes preflight. Unverified includes, macros, aliases, overrides, partial parses and unsupported metadata refuse rather than silently regenerate source.
- Structural operations block while publication, host editing, staged definitions or registered key/encoder/combo/layer/macro drafts remain open. Apply rechecks guards. Supported source nodes, labels, comments and exterior bytes follow identity; appended DTS IDs use `layer_N` collision allocation, not the UI copy name. Raw Clipboard DTS re-import shows node names (for example `layer_4`), not the transient `Lower copy` name; JSON-first reload retains UI names. Clipboard textarea input normalizes line endings and the existing loader trims outer whitespace.
- Stock device commands only stage source bindings. They do not execute firmware actions, clear pairing information, disconnect a host, reset/power off hardware, or configure firmware. Output choices do not detect available transports; `OUT_NONE` is not power-off or bond clearing.
- Soft Off displays its prerequisite: `CONFIG_ZMK_PM_SOFT_OFF=y` in the keyboard `.conf`, hardware power-off support, and hardware-dependent wake-up (wake button or reset). The browser cannot establish firmware/hardware compatibility.
- Existing source splicing preserves the preamble; the stock catalog does not repair includes. Existing source must supply needed behavior/header includes; generated templates use catalog includes (`outputs.h` for `&out`, `keys.h` for `&kt`). The existing Unicode-specific include rule remains separate in ADR 0002.
- Selecting a replacement behavior intentionally replaces its old parameters. Opaque imports are preserved, not validated as stock firmware or exposed as a general custom editor. Neither deprecated `&inc_dec_cp` nor parameterized `RGB_COLOR_HSB(h,s,b)` is promoted to a new static picker choice.
- Source-preserving splice is bounded, not a full DTS/C preprocessor. Alias expansion is lossy as documented in ADR 0002; unsupported ambiguous edits can be rejected.
- Unicode and pointing firmware modules/configuration remain user responsibilities. The editor neither builds nor flashes firmware.
- Browser draft recovery is not publication. Source-specific write/copy/commit completion and native-dialog limitations follow [CAP-002](CAP-002-keymap-sources-and-persistence.md). Discard draft reverts firmware, not host-layout changes.

## Verification

- [Macro panel component tests](../../../apps/web/src/lib/components/MacroPanel.test.ts) — staged create/use/edit/delete, one-input forwarding and typed combo assignment/refusal, zero timing and step movement, cancel/no-op redo retention, queue warnings, ASCII acknowledgement/rejection and pasted CRLF, opaque diagnostics, Demo creation/use, source-boundary/stale-preview guards, and Clipboard source recovery followed by edit/discard. These mount the real App; source-gate refusal cases set editor provenance directly, not remote services.
- [Macro browser workflow](../../../e2e/macros.spec.ts) — real Clipboard import, keyboard-activated create/confirm, key assignment preview/cancel, referenced-delete refusal, timing/sequence edit, creation/edit undo/redo, actual system-clipboard export, re-import of exported DTS and byte-stable second export. This is one bounded workflow, not the complete M01–M12 matrix or a browser-recovery matrix.
- [Core macro tests](../../../packages/keymap-core/src/zmk-macros.test.ts) — bounded parse/validation/splice, reference preflight, serialization/source-baseline refusal and fixed ASCII conversion. Core evidence does not imply UI coverage for every parameter/control combination or sensor-child assignment.
- [KeyEditor component tests](../../../apps/web/src/lib/components/KeyEditor/KeyEditor.test.ts#L194) — `puts parameterless behaviours on a second chip row` excludes stale `&reset`; `opens %s stock documentation without staging a binding` checks the five stock docs actions and safe new-window arguments.
- [Key interaction tests](../../../apps/web/src/lib/components/Keyboard/Keys/Key.test.ts#L242) — staged `BT_DISC`; `previews the complete imported %s binding and applies it unchanged`; `stages Key Toggle through the key grid and hold controls before Apply`; `stages parameterless %s without a value grid and cancels without updating`; and corrected output tooltips/`OUT_NONE`. These exercise the real session/component wiring, including Soft Off's visible prerequisite.
- `apps/web/src/lib/key-edit-session.test.ts` — Bluetooth/RGB command argument counts and encode/parse round trips.
- [Stock catalog tests](../../../packages/keymap-core/src/behaviors.test.ts#L17) — `CHG-009 stock catalog contract`: descriptions, includes, docs, arity, firmware prerequisite, stock reset exclusion, and retained commands. Existing Bluetooth/RGB and profile-index tests remain in this file.
- [Legacy JSON tests](../../../packages/keymap-core/src/keymap.test.ts#L99) — `legacy behavior JSON compatibility`: legacy reset validation and primary-source detection without relaxing unknown/malformed-label rejection.
- `e2e/clipboard.spec.ts` — all four Bluetooth/RGB commands survive picker selection, Apply, reopen, cancel, imported no-op Apply, and exact source export; `BT_DISC` requires an index and offers the documented `0`–`4` choices.
- [Stock picker browser matrix](../../../e2e/clipboard.spec.ts#L236) — `CHG-009 stock picker integration`: nine selection cases (`OUT_NONE`, USB/BLE, `&kt LA(F13)` / `&kt LALT`, and four parameterless bindings) exercise Apply, reopen, cancel both before/after Apply, imported no-op Apply, and actual system-clipboard export with exact binding tokens and unchanged preamble/suffix. Keycode/command selection includes keyboard activation.
- [Legacy JSON browser workflow](../../../e2e/clipboard.spec.ts#L350) — `legacy reset JSON imports remain editable and export through the supplied source without promotion`: both bare/opaque reset survive import, Apply, reopen and Clipboard source splicing.
- [Opaque import browser workflow](../../../e2e/clipboard.spec.ts#L390) — `legacy reset and opaque imports survive no-op Apply and export without stock promotion or include repair`: ten imported bindings retain their complete previews, Apply/reopen/cancel results, and exact tokens after another key forces a real export splice. Legacy reset, external labels, nested opaque tokens, excess arguments, sensor alias and parameterized RGB stay source-preserved, not promoted.
- `apps/web/src/lib/editor.layers.test.ts` — deletion remaps known references and combo filters.
- [Layer operation component tests](../../../apps/web/src/lib/components/HostLegendPicker.layer-operations.test.ts) — duplicate/move focus, keyboard selector, drag parity, base restriction, cancel/no-op/redo/persistence, stale moves, commit-boundary guards and source refusal.
- [Layer picker regressions](../../../apps/web/src/lib/components/HostLegendPicker.test.ts) — keyboard expansion, existing rename/delete/conditional guards and layer-table behavior.
- [Core layer operations](../../../packages/keymap-core/src/layer-operations.test.ts) — append isolation/names, proven reference remaps, inverse permutations, strict source refusal, node metadata/EOL locality and JSON-first round trips.
- [Editor layer lifecycle](../../../apps/web/src/lib/editor.layer-operations.test.ts) — atomic history, identity-only dirty state, captured copy baselines, recovery/discard, current eye preferences and host-state isolation.
- [Layer operation browser workflows](../../../e2e/layer-operations.spec.ts) — real keyboard and native drag moves, duplicate, focus, undo/redo, system-clipboard export/reparse/re-import and stable second export; native drag cancellation and unsafe-source refusal preserve state/source.
- `apps/web/src/lib/editor.model.test.ts` — document/history and effective rendered-layer bounds; stored layer preferences and raw-view choice survive discard on one-, two- and four-layer keymaps and undo/redo of an added visible layer.
- `apps/web/src/App.test.ts` — firmware warning, undo/discard cleanup, and successful versus failed/in-flight publication.
- `e2e/demo.spec.ts` — a real KeyEditor edit survives native close-dialog dismissal; accepting the next close leaves. Persisting the draft does not disarm the warning.
- `packages/keymap-core/src/custom-bindings.test.ts` — opaque source binding parameters survive serialization.
- `packages/keymap-core/src/fixture-roundtrip.test.ts` — fixture no-op saves and binding-edit locality, including documented alias-expansion exception.
- `apps/web/src/lib/components/ComboPanel.test.ts` — combo editing interaction.
- `apps/web/src/lib/components/Keyboard/EncoderBar.test.ts` — directional encoder editing.
- `packages/keymap-core/src/dts-conditional-layers.test.ts` — conditional rules parse and splice.

The linked tests prove the named bounded outcomes, not full ZMK/OS compatibility. Run the root unit and browser gates; generated schematics are not executable evidence.

## Related contracts

- [Architecture](../../architecture.md)
- [Target system](../../TARGET_SYSTEM.md)
- [File contract](../../adr/0002-keymap-file-contract.md)
- [Host edit contract](../../adr/0004-host-edit-and-os-deliverables.md)
- [Host snapshot contract](../../adr/0005-host-keymap-github-snapshot.md)

## Links

- [Canonical HTML](../wireframes/html/CAP-001-firmware-keymap-editing.html)
- [Rendered PNG](../wireframes/exports/CAP-001-firmware-keymap-editing.png)
