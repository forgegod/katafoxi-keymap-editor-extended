# CAP-003 — Host layouts and composed legends

**Status:** partial
**Primary surface:** human

## Behaviour

- Composed keycaps show host-resolved glyphs from selected language layouts alongside firmware layer bindings. The shared keycapFace contract uses four level slots per displayed language, with at most two languages on the keycap.
- Hover is a read-only decode preview. Alt+click starts a host-edit session; choosing a glyph updates the host layout immediately. The first edit of a system layout makes a user copy.
- Accept/Cancel end the host-edit session; Cancel is not rollback of already chosen glyphs. ZMK undo/redo does not undo host-layout edits.
- Host language/profile selections and user layouts persist in the browser. Users can import supported xkb/KLC layouts and download Linux xkb or Windows .klc deliverables through the Host lane.
- On GitHub, the host snapshot and generated host deliverables can accompany the firmware commit. A loaded repository snapshot takes precedence over cached host state; host repository changes and OS-install status are separate signals.
- Focusing or hovering the layer strip expands its firmware rows. With Stack off, each row exposes Duplicate and Move; keyboard position selection and drag/drop share the [firmware operation boundary](CAP-001-firmware-keymap-editing.md). The base Move control announces that layer zero stays fixed. These controls are hidden in the resting strip and language-stack mode.
- Firmware reorder recomposes legends and maps current eye preferences by logical layer through move, undo, redo and discard, including recovered drafts with no undo history. Unavailable stored layer marks and the raw-base preference are retained. Duplicate leaves eye preferences unchanged rather than automatically showing the copy.
- Structural firmware operations clear transient hover/decode ownership without changing host language tables, assemblies, host repository dirty state or OS-delivery state. Moves change firmware priority, not host layout contents; existing conditional-layer cover warnings reflect the new indices. An open host-edit session blocks the operation rather than being discarded.

## Implementation

- `packages/keymap-core/src/keycap-face.ts`
- `packages/keymap-core/src/host-layout-registry.ts`
- `packages/keymap-core/src/klc-write.ts`
- `packages/keymap-core/src/host-keymap-deliverables.ts`
- `apps/web/src/lib/editor/host-legend.svelte.ts`
- `apps/web/src/lib/components/LegendDecodeCard.svelte`
- `apps/web/src/lib/components/HostPipeline.svelte`
- `apps/web/src/lib/editor/host-repo.ts`
- `apps/web/src/lib/components/HostLegendPicker.svelte` and `apps/web/src/lib/components/HostLegendLayerRow.svelte` — expanded firmware rows, keyboard/drag controls and feedback.
- `apps/web/src/lib/editor/document.svelte.ts` and `apps/web/src/lib/editor/persist-draft.ts` — logical layer/view identity across history and recovery.

## Rules and boundaries

- The Host lane downloads installation sources and guidance; it does not install layouts into the OS.
- Browser-only assemblies are not additional GitHub keymap files. Repository host snapshot ownership still follows ADR 0005.
- Leave-page confirmation follows unpublished firmware or a dirty GitHub host snapshot, even when firmware is unchanged. OS-install status and a browser-only host edit do not arm it by themselves. Downloading/installing host files is not a repository commit; firmware Discard draft does not discard host changes. The source handoff and browser-native dialog limits follow [CAP-002](CAP-002-keymap-sources-and-persistence.md).
- Difference highlighting and keycap composition reflect selected layout tables, not live observation of the host OS or firmware execution.
- Import/export supports documented subsets, not every xkb/KLC feature. Shared host registry access remains synchronous.

## Verification

- `apps/web/src/lib/components/Keyboard/Keys/Key.test.ts` — composed faces, click/Alt+click and host editing.
- `apps/web/src/lib/host-layout-store.test.ts` — user layouts and storage boundaries.
- `apps/web/src/lib/editor.host-edit.test.ts` — editing session clears when switching keyboards or logging out.
- `apps/web/src/lib/host-keymap-snapshot.test.ts` — repository snapshot application and dirty state.
- `apps/web/src/App.test.ts` — a GitHub host-snapshot edit arms leave confirmation without a firmware edit and successful commit clears it; browser-only host edits and host-delivery status changes do not arm it. Firmware discard leaves browser-only host changes intact.
- `packages/keymap-core/src/xkb-write.test.ts` — xkb export round-trips.
- `packages/keymap-core/src/klc-write.test.ts` — KLC output.
- `e2e/host-install.spec.ts` — real browser downloads produce parseable Windows/Linux files.
- `e2e/demo.spec.ts` — host edits persist across demo selection.
- [Layer picker tests](../../../apps/web/src/lib/components/HostLegendPicker.test.ts) — resting/expanded rows, focus access, raw base view, eye toggles and language-stack behavior.
- [Layer operation component tests](../../../apps/web/src/lib/components/HostLegendPicker.layer-operations.test.ts) — source-control/moved-control focus, cancel/no-op, mapped eyes and unchanged host legend.
- [Layer lifecycle tests](../../../apps/web/src/lib/editor.layer-operations.test.ts) — composed row/conditional warning updates, eye identity through undo/redo/recovery/discard, host-state isolation and host-edit refusal.
- [Layer operation browser tests](../../../e2e/layer-operations.spec.ts) — keyboard/native-drag parity, visible remapped binding, copy visibility preference, focus, cancel and safe export/re-import.

The linked tests prove the named bounded outcomes, not full ZMK/OS compatibility. Run the root unit and browser gates; generated schematics are not executable evidence.

## Related contracts

- [Architecture](../../architecture.md)
- [Target system](../../TARGET_SYSTEM.md)
- [File contract](../../adr/0002-keymap-file-contract.md)
- [Host edit contract](../../adr/0004-host-edit-and-os-deliverables.md)
- [Host snapshot contract](../../adr/0005-host-keymap-github-snapshot.md)

## Links

- [Canonical HTML](../wireframes/html/CAP-003-host-layouts-and-legends.html)
- [Rendered PNG](../wireframes/exports/CAP-003-host-layouts-and-legends.png)
