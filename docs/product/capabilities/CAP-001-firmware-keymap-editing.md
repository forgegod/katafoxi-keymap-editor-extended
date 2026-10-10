# CAP-001 — Firmware keymap editing

**Status:** partial
**Primary surface:** human

## Behaviour

- Clicking a firmware layer slot opens a staged KeyEditor. A complete binding can be applied; cancel leaves that key unchanged. Catalog choices include keys, modifiers, layer references, device commands and Unicode input. Bluetooth choices include `BT_DISC` with the documented default profile indexes `0`–`4` and parameterless `BT_CLR_ALL`; RGB underglow choices include parameterless `RGB_ON` and `RGB_OFF`.
- Users add blank layers, rename or delete layers, and undo/redo ZMK draft changes. Deleting a layer remaps supported layer references and combo filters, with a warning when a deleted target becomes transparent.
- Users edit visual combos, conditional-layer rules and existing encoder sensor bindings. Hold-tap timing and Homerow/Autoshift presets are editable; the fixed rgblayer recipe can be inserted on save.
- Existing external bindings and their opaque parameters survive supported import/edit/export. Existing macro nodes remain source text rather than a general editable macro model.

## Implementation

- `apps/web/src/lib/components/KeyEditor/KeyEditor.svelte`
- `apps/web/src/lib/editor/document.svelte.ts`
- `packages/keymap-core/src/keymap.ts`
- `packages/keymap-core/src/dts-splice.ts`
- `packages/keymap-core/src/dts-behaviors.ts`

## Rules and boundaries

- No general visual macro or custom-behavior-definition editor exists. Hold-tap controls and fixed recipes are narrower capabilities.
- Firmware layer duplication and reordering are not implemented. Opaque external arguments are not assumed to be layer indices.
- Bluetooth and RGB command choices only stage source bindings. They do not execute firmware actions, clear pairing information, disconnect a host, or configure hardware.
- Source-preserving splice is bounded, not a full DTS/C preprocessor. Alias expansion is lossy as documented in ADR 0002; unsupported ambiguous edits can be rejected.
- Unicode and pointing firmware modules/configuration remain user responsibilities. The editor neither builds nor flashes firmware.

## Verification

- `apps/web/src/lib/components/KeyEditor/KeyEditor.test.ts` — staged binding editing and supported controls.
- `apps/web/src/lib/components/Keyboard/Keys/Key.test.ts` — staged `BT_DISC` selection, profile index, and Apply interaction.
- `apps/web/src/lib/key-edit-session.test.ts` — Bluetooth/RGB command argument counts and encode/parse round trips.
- `packages/keymap-core/src/behaviors.test.ts` — catalog command availability and profile-index picker contract.
- `e2e/clipboard.spec.ts` — all four Bluetooth/RGB commands survive picker selection, Apply, reopen, cancel, imported no-op Apply, and exact source export; `BT_DISC` requires an index and offers the documented `0`–`4` choices.
- `apps/web/src/lib/editor.layers.test.ts` — deletion remaps known references and combo filters.
- `apps/web/src/lib/editor.model.test.ts` — document/history invariants.
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
