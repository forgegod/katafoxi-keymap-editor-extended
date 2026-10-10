# CAP-001 — Firmware keymap editing

**Status:** partial
**Primary surface:** human

## Behaviour

- Clicking a firmware layer slot opens a staged KeyEditor. A complete binding can be applied; cancel leaves that key unchanged. Catalog choices include keys, modifiers, layer references, device commands and Unicode input. Bluetooth choices include `BT_DISC` with the documented default profile indexes `0`–`4` and parameterless `BT_CLR_ALL`; RGB underglow choices include parameterless `RGB_ON` and `RGB_OFF`.
- Output choices include `OUT_NONE` (prevent output), `OUT_USB` (prefer USB), and `OUT_BLE` (prefer the current Bluetooth profile). `OUT_TOG` remains available. Apply, reopen, cancel, and Clipboard export retain the selected symbolic token.
- Key Toggle (`&kt`) uses the keycode picker, including modifier keys and hold wrappers; Apply requires a key. Grave Escape (`&gresc`), Soft Off (`&soft_off`), Reset (`&sys_reset`), and Bootloader (`&bootloader`) require no value but remain staged until Apply. Ctrl+click opens the stock behavior's ZMK documentation without changing the binding.
- The stock picker does not advertise `&reset`. Imported legacy `&reset`, including opaque arguments, is retained without conversion to `&sys_reset`; legacy JSON imports remain accepted. The editor's binding preview and no-op Apply retain complete opaque/excess arguments, not just the editable catalog slots.
- Users add blank layers, rename or delete layers, and undo/redo ZMK draft changes. Deleting a layer remaps supported layer references and combo filters, with a warning when a deleted target becomes transparent.
- Users edit visual combos, conditional-layer rules and existing encoder sensor bindings. Hold-tap timing and Homerow/Autoshift presets are editable; the fixed rgblayer recipe can be inserted on save.
- Existing external bindings and their opaque parameters survive supported import/edit/export. Existing macro nodes remain source text rather than a general editable macro model.
- Applying a changed binding updates the firmware draft, not the source files. A dirty firmware draft arms native leave-page confirmation, including in Demo. Dismissing the confirmation keeps the applied edit; accepting it leaves without publishing.

## Implementation

- `apps/web/src/lib/components/KeyEditor/KeyEditor.svelte`
- `apps/web/src/lib/components/KeyEditor/BehaviourRow.svelte` — stock choices and documentation actions.
- `apps/web/src/lib/key-edit-session.svelte.ts` and `apps/web/src/lib/hydrate.ts` — staged binding tree and opaque argument preservation.
- `packages/keymap-core/data/zmk-behaviors.json`, `packages/keymap-core/src/behaviors.ts`, and `packages/keymap-core/src/zmk-docs.ts` — shared stock catalog, firmware notes, and documentation links.
- `apps/web/src/lib/editor/document.svelte.ts`
- `apps/web/src/App.svelte` and `apps/web/src/lib/editor/leave-warning.ts` — native leave confirmation for the applied draft.
- `packages/keymap-core/src/keymap.ts`
- `packages/keymap-core/src/dts-splice.ts`
- `packages/keymap-core/src/dts-behaviors.ts`

## Rules and boundaries

- No general visual macro or custom-behavior-definition editor exists. Hold-tap controls and fixed recipes are narrower capabilities.
- Firmware layer duplication and reordering are not implemented. Opaque external arguments are not assumed to be layer indices.
- Stock device commands only stage source bindings. They do not execute firmware actions, clear pairing information, disconnect a host, reset/power off hardware, or configure firmware. Output choices do not detect available transports; `OUT_NONE` is not power-off or bond clearing.
- Soft Off displays its prerequisite: `CONFIG_ZMK_PM_SOFT_OFF=y` in the keyboard `.conf`, hardware power-off support, and hardware-dependent wake-up (wake button or reset). The browser cannot establish firmware/hardware compatibility.
- Existing source splicing preserves the preamble; the stock catalog does not repair includes. Existing source must supply needed behavior/header includes; generated templates use catalog includes (`outputs.h` for `&out`, `keys.h` for `&kt`). The existing Unicode-specific include rule remains separate in ADR 0002.
- Selecting a replacement behavior intentionally replaces its old parameters. Opaque imports are preserved, not validated as stock firmware or exposed as a general custom editor. Neither deprecated `&inc_dec_cp` nor parameterized `RGB_COLOR_HSB(h,s,b)` is promoted to a new static picker choice.
- Source-preserving splice is bounded, not a full DTS/C preprocessor. Alias expansion is lossy as documented in ADR 0002; unsupported ambiguous edits can be rejected.
- Unicode and pointing firmware modules/configuration remain user responsibilities. The editor neither builds nor flashes firmware.
- Browser draft recovery is not publication. Source-specific write/copy/commit completion and native-dialog limitations follow [CAP-002](CAP-002-keymap-sources-and-persistence.md). Discard draft reverts firmware, not host-layout changes.

## Verification

- [KeyEditor component tests](../../../apps/web/src/lib/components/KeyEditor/KeyEditor.test.ts#L194) — `puts parameterless behaviours on a second chip row` excludes stale `&reset`; `opens %s stock documentation without staging a binding` checks the five stock docs actions and safe new-window arguments.
- [Key interaction tests](../../../apps/web/src/lib/components/Keyboard/Keys/Key.test.ts#L241) — staged `BT_DISC`; `previews the complete imported %s binding and applies it unchanged`; `stages Key Toggle through the key grid and hold controls before Apply`; `stages parameterless %s without a value grid and cancels without updating`; and corrected output tooltips/`OUT_NONE`. These exercise the real session/component wiring, including Soft Off's visible prerequisite.
- `apps/web/src/lib/key-edit-session.test.ts` — Bluetooth/RGB command argument counts and encode/parse round trips.
- [Stock catalog tests](../../../packages/keymap-core/src/behaviors.test.ts#L17) — `CHG-009 stock catalog contract`: descriptions, includes, docs, arity, firmware prerequisite, stock reset exclusion, and retained commands. Existing Bluetooth/RGB and profile-index tests remain in this file.
- [Legacy JSON tests](../../../packages/keymap-core/src/keymap.test.ts#L99) — `legacy behavior JSON compatibility`: legacy reset validation and primary-source detection without relaxing unknown/malformed-label rejection.
- `e2e/clipboard.spec.ts` — all four Bluetooth/RGB commands survive picker selection, Apply, reopen, cancel, imported no-op Apply, and exact source export; `BT_DISC` requires an index and offers the documented `0`–`4` choices.
- [Stock picker browser matrix](../../../e2e/clipboard.spec.ts#L236) — `CHG-009 stock picker integration`: nine selection cases (`OUT_NONE`, USB/BLE, `&kt LA(F13)` / `&kt LALT`, and four parameterless bindings) exercise Apply, reopen, cancel both before/after Apply, imported no-op Apply, and actual system-clipboard export with exact binding tokens and unchanged preamble/suffix. Keycode/command selection includes keyboard activation.
- [Legacy JSON browser workflow](../../../e2e/clipboard.spec.ts#L350) — `legacy reset JSON imports remain editable and export through the supplied source without promotion`: both bare/opaque reset survive import, Apply, reopen and Clipboard source splicing.
- [Opaque import browser workflow](../../../e2e/clipboard.spec.ts#L390) — `legacy reset and opaque imports survive no-op Apply and export without stock promotion or include repair`: ten imported bindings retain their complete previews, Apply/reopen/cancel results, and exact tokens after another key forces a real export splice. Legacy reset, external labels, nested opaque tokens, excess arguments, sensor alias and parameterized RGB stay source-preserved, not promoted.
- `apps/web/src/lib/editor.layers.test.ts` — deletion remaps known references and combo filters.
- `apps/web/src/lib/editor.model.test.ts` — document/history invariants.
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
