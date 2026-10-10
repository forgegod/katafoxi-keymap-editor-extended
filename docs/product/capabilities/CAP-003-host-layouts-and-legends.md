# CAP-003 — Host layouts and composed legends

**Status:** partial
**Primary surface:** human

## Behaviour

- Composed keycaps show host-resolved glyphs from selected language layouts alongside firmware layer bindings. The shared keycapFace contract uses four level slots per displayed language, with at most two languages on the keycap.
- Hover is a read-only decode preview. Alt+click starts a host-edit session; choosing a glyph updates the host layout immediately. The first edit of a system layout makes a user copy.
- Accept/Cancel end the host-edit session; Cancel is not rollback of already chosen glyphs. ZMK undo/redo does not undo host-layout edits.
- Host language/profile selections and user layouts persist in the browser. Users can import supported xkb/KLC layouts and download Linux xkb or Windows .klc deliverables through the Host lane.
- On GitHub, the host snapshot and generated host deliverables can accompany the firmware commit. A loaded repository snapshot takes precedence over cached host state; host repository changes and OS-install status are separate signals.

## Implementation

- `packages/keymap-core/src/keycap-face.ts`
- `packages/keymap-core/src/host-layout-registry.ts`
- `packages/keymap-core/src/klc-write.ts`
- `packages/keymap-core/src/host-keymap-deliverables.ts`
- `apps/web/src/lib/editor/host-legend.svelte.ts`
- `apps/web/src/lib/components/LegendDecodeCard.svelte`
- `apps/web/src/lib/components/HostPipeline.svelte`
- `apps/web/src/lib/editor/host-repo.ts`

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
