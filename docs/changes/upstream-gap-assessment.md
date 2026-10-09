# Upstream parity evidence

This is a bounded discovery snapshot, not implementation progress or a claim that every upstream fix is absent. The [active CHGs](README.md) are the sole execution authority.

## Compared revisions

- Initial comparison: `d5c02762803bf2589c6be37ca3ee841013a443fd`, branch `deploy/cloudflare-containers`, plus working-tree layout lookup changes. The change-request baseline is now `2bb062d9e613980cc8d7ef1e4c545b527ff1e9c2` on main, which incorporates matching-layout lookup. That addition does not implement file selection or ZMK-derived discovery.
- Public upstream source: `e7946792cf674db20ab72ab67fea759fff4c3ccc` on main, verified against the remote. Fork ancestor `a6c0b7a0441be77dc0cd1ec06e7e43702cb92dab` has the identical tree `4f802d350217b21535a8cbf7ab91bad9e5e3d4d0`.
- Hosted upstream app: pages commit `e954e104d5f2aeb7f2b6ef95cbb525ef5eb0c3cf`. Public source updates stopped; these parity gaps are not a set of main commits to cherry-pick.
- Deployment evidence was taken from assets referenced by that revision's index/runtime, not every retained historical bundle.

## Bounded gaps

| Gap | Evidence in fork | Upstream evidence |
| --- | --- | --- |
| Bluetooth/RGB picker commands | `packages/keymap-core/data/zmk-behaviors.json` lacks BT_DISC, BT_CLR_ALL, RGB_ON, RGB_OFF. Existing raw tokens may still survive source round-trip. | Active shared bundle contains all four; commits e2b7d30, 7a68f4c, 8e062d0. |
| Leave-page warning | `apps/web/src/App.svelte` flushes on pagehide/visibilitychange but has no beforeunload guard. | e954e10 adds beforeunload protection. |
| Duplicate/reorder firmware layers | `apps/web/src/lib/editor/document.svelte.ts` and HostLegendLayerRow expose add/rename/delete only. | Active LayerEditorTab contains Duplicate layer and drag/drop; c195a59 adds duplication. |
| Select keymap within GitHub repo | `apps/api/src/services/github/files.ts` selects the first matching config keymap; picker carries repo/branch only. | Upstream README advertises multiple keymaps. |
| General macro authoring | Fixed rgblayer recipe and opaque source preservation, no general macro sequence model/UI. | Active MacroEditorTab supports typing sequences and timing; wiki describes parameterized macros. |
| General custom-behavior authoring | Hold-tap timing/presets and opaque existing bindings, not arbitrary definition forms. | Active BehaviorEditorTab includes tap-dance, mod-morph, sticky-key, hold-tap, sensor-rotate families. |
| Browser filesystem source | Demo, Clipboard, GitHub, dev-local only. | Live upstream picker includes File System. |
| ZMK-derived layout discovery | Shared keyboard-bundle uses supplied layout JSON or binding-count rectangle. | Wiki describes matrix-transform parsing and generated metadata. |

The fork already implements combos, conditional layers, encoders, mouse behavior, Clipboard, themes, GitHub, host layouts, Unicode, and drafts. These are not missing wholesale. Do not use this snapshot as proof of an untested parser bug or full upstream equivalence.

## References

- [Source-release policy](https://github.com/nickcoutsos/keymap-editor/wiki/Source-Code-Updates)
- [Upstream features](https://github.com/nickcoutsos/keymap-editor/wiki/Features)
- [Automatic layout generation](https://github.com/nickcoutsos/keymap-editor/wiki/Defining-keyboard-layouts#automatic-layout-generation)
- [Hosted revision](https://github.com/nickcoutsos/keymap-editor/commit/e954e104d5f2aeb7f2b6ef95cbb525ef5eb0c3cf)

## Revalidation before implementation

Recheck current source, branch, working-tree ownership and relevant upstream schema/docs. Test behavior at the actual target revision; commit messages and compiled symbols alone are not executable proof for the fork. Never import compiled upstream bundles into the Svelte source tree.
