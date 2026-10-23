# CAP-003 — Host layouts and composed legends

**Status:** partial
**Primary surface:** human

## Behaviour

- Composed keycaps show host-resolved glyphs from selected language layouts alongside firmware layer bindings. The shared keycapFace contract uses four level slots per displayed language, with at most two languages on the keycap.
- On Demo Corne at 360×640 and 1280×720 in light and dark themes, the legend's AltGr, AltGr+Shift and Computer language / Choose controls fit in the viewport or are fully exposed by scrolling the legend horizontally. Their border boxes and text remain intact, and the layer columns stay aligned in the resting and expanded strip.
- With German added beside English at those viewports/themes, the rightmost profile menu, Add language list and German change/remove list expose all their items through viewport-contained scrolling. Profile and language text remains intact; icon-only Copy controls retain reachable boxes. The German profile menu is height-bounded below its trigger, so its last profiles and import actions do not disappear below the viewport. This covers the system-profile menu and language lists, not arbitrary user-profile names or opened import dialogs.
- Hover is a read-only decode preview. Alt+click starts a host-edit session; choosing a glyph updates the host layout immediately. The first edit of a system layout makes a user copy.
- At 360×640, the Alt+click Host symbol catalog and locked decode card remain inside the viewport without overlapping. The catalog adjusts its initial or remembered frame around the card and scrolls its own symbol content; the level cells and session actions remain unobstructed. This is a bounded narrow-viewport layout outcome, not a guarantee for every viewport or arbitrary card size.
- Accept/Cancel end the host-edit session; Cancel is not rollback of already chosen glyphs. ZMK undo/redo does not undo host-layout edits.
- Host language/profile selections and user layouts persist in the browser. Users can import supported xkb/KLC layouts and download Linux xkb or Windows .klc deliverables through the Host lane.
- Filesystem firmware Save writes no host snapshot or install files. Its persistent chrome distinguishes loaded firmware, a firmware draft, verified firmware Save and pending recovery, always disclosing that host files are not written and host edits stay browser-local. Host-only edits do not enable Save .keymap or arm leave confirmation. Firmware Save, reconciliation and Discard preserve host profiles, assemblies and delivery status; Linux/Windows downloads remain separate Host-lane actions.
- On GitHub, a compatible owned host snapshot and generated deliverables can accompany the firmware commit. The server independently omits all host writes for invalid, unsupported or ownership/reference-incompatible remote snapshots, even if replacements are submitted. A firmware-only receipt does not accept local host recovery as published.
- Selected GitHub files have identity-scoped host caches and private working table IDs, preserving remote wire IDs without overwriting same-named global profiles or another selected file. Pending recovery takes precedence over a new remote snapshot; a clean invalid/unsupported reopen retains its last verified compatible host origin, or standard English when no verified origin exists. Host repository changes and OS-install status remain separate signals.
- Under omitted host writes, the chrome explicitly labels actual host recovery browser-local and unpublishable to GitHub: Commit cannot save it. Clean and post-discard states state only the host-write limitation, not nonexistent edits. Pending firmware recovery remains explicit even without host edits. Host editing remains available. Firmware-only Commit and same-file Reload preserve host recovery and its source-switch protection.
- Discard local host edits is available in the Host lane for omitted snapshots with local host work, including sole-keymap repositories. Explicit confirmation names the repository/branch/file and the resulting system-English state. One host-database transaction resets that identity's working view, private tables, remembered assemblies and working recovery, retaining historical origin metadata. Firmware draft/history, remote files, other identities and global profiles are unchanged. Cancel, transaction failure or stale revision retains recovery. Reopening does not revive discarded host work.
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
- `apps/web/src/lib/components/HostSymbolPicker.svelte` and `apps/web/src/lib/components/host-symbol-geometry.ts` — viewport-clamped catalog placement around the locked decode card, including remembered frames, with an internally scrolling symbol body.
- `apps/web/src/lib/components/HostPipeline.svelte`
- `apps/web/src/lib/editor/host-repo.ts`
- `apps/web/src/lib/host-layout-store.ts` — revision-checked host working writes and atomic identity-only discard.
- `apps/web/src/App.svelte` and `apps/web/src/lib/editor/select-keyboard.ts` — browser-local status, standalone discard and transition guard.
- `apps/web/src/lib/components/HostLegendPicker.svelte` and `apps/web/src/lib/components/HostLegendLayerRow.svelte` — expanded firmware rows, keyboard/drag controls and feedback.
- `apps/web/src/lib/components/HostLegendPicker.svelte` — viewport-bounded horizontal scrollport for the complete legend table; Alt glyphs retain their existing size and rotation.
- `apps/web/src/lib/actions/legend-popover.ts` and `apps/web/src/lib/components/HostProfileMenu.svelte` — viewport-positioned menus retain legend DOM ownership; the profile list caps its own scrolling height to the remaining space below its trigger.
- `apps/web/src/lib/editor/document.svelte.ts` and `apps/web/src/lib/editor/persist-draft.ts` — logical layer/view identity across history and recovery.

## Rules and boundaries

- The Host lane downloads installation sources and guidance; it does not install layouts into the OS.
- Browser-only assemblies are not additional GitHub keymap files. Repository host snapshot ownership still follows ADR 0005.
- Host-only discard is not a universal switching prerequisite: it resolves omitted-snapshot local recovery only. Clean or successfully published compatible host sessions do not require it. Firmware protection remains independent; separate databases do not provide an atomic firmware/host move. Ambiguous legacy/global tables are not broadly deleted.
- Leave-page confirmation follows unpublished firmware, pending filesystem firmware recovery, a dirty GitHub host snapshot or pending GitHub recovery, including omitted host work. OS-install status and non-GitHub host edits do not arm it by themselves. Downloading/installing host files is not a repository commit; firmware Discard draft does not discard host changes. The source handoff and browser-native dialog limits follow [CAP-002](CAP-002-keymap-sources-and-persistence.md).
- Difference highlighting and keycap composition reflect selected layout tables, not live observation of the host OS or firmware execution.
- Import/export supports documented subsets, not every xkb/KLC feature. Shared host registry access remains synchronous.

## Verification

- `e2e/legend-clipping.spec.ts` — Demo Corne at 360×640 and 1280×720 in both themes: named control boxes and text ranges, viewport-contained auto/scroll ancestry, full exposure and hit-testing after scrolling, reversible pointer/keyboard Alt toggles, Choose focus and layer-column alignment. Adds German through the UI and checks every system-profile menu item (including Copy/import actions), Add language option and German change/remove option. Exercises pointer/keyboard profile selection, profile Escape/focus, language initial focus, disabled selected language, Escape/outside dismissal and pointer removal without firmware history changes. Viewport-fixed menus escape outer DOM scroll clips, not the viewport; body/html hidden overflow never qualifies as scroll reachability.
- `apps/web/src/lib/components/Keyboard/Keys/Key.test.ts` — composed faces, click/Alt+click and host editing.
- `e2e/host-symbol-picker-layout.spec.ts` — Alt+click on a synthetic Clipboard key at 360×640 opens the catalog and locked decode card with non-overlapping, viewport-contained bounds.
- `apps/web/src/lib/components/HostSymbolPicker.test.ts` — catalog interaction plus geometry cases for gutter clearance, overlapping frames, already-clear placement and vertical stacking; these geometry checks are not browser remembered-frame recovery or an all-screen/card-size matrix.
- `apps/web/src/lib/host-layout-store.test.ts` — user layouts and storage boundaries.
- `apps/web/src/lib/editor.host-edit.test.ts` — editing session clears when switching keyboards or logging out.
- `apps/web/src/lib/host-keymap-snapshot.test.ts` — repository snapshot application and dirty state.
- `apps/api/src/services/github/selected-files.test.ts` — server-side invalid/unsupported/incompatible omission, compatible owned co-commit and untouched legacy/other files.
- `apps/web/src/lib/github-selected-identity.test.ts` — clean origin retention, omitted recovery across reload/publication, private tables versus global profiles, cross-session cache conflicts and stale load isolation.
- `apps/web/src/lib/github-host-discard.test.ts` — identity-only host reset and global-profile isolation; cache/view/assembly/private-table transaction failures, stale revision, firmware/history preservation and reset on reopen.
- `e2e/github.spec.ts` — invalid/unsupported snapshots with host-only and mixed work: Reload, blocked transition, cancel/confirm reset, unchanged firmware/storage/other identity and synthetic remote artifacts; firmware-only Commit keeps host recovery through browser reload.
- `apps/web/src/App.test.ts` — a GitHub host-snapshot edit arms leave confirmation without a firmware edit and successful commit clears it; browser-only host edits and host-delivery status changes do not arm it. Firmware discard leaves browser-only host changes intact.
- `apps/web/src/App.filesystem.test.ts` — persistent loaded/host-only/saved/recovery chrome, firmware-only Discard disclosure, preserved host state and unresolved-attempt leave protection using synthetic file handles and real browser draft storage.
- `apps/web/src/lib/filesystem-save.test.ts` — firmware receipts and reconciliation preserve the host boundary; filesystem Save never uses the GitHub publication path.
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
