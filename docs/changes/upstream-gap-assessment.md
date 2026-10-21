# Upstream parity evidence

This is a bounded discovery snapshot, not implementation progress or a claim that every upstream fix is absent. The [active CHGs](README.md) are the sole execution authority.

## Compared revisions

- Initial comparison: `d5c02762803bf2589c6be37ca3ee841013a443fd`, branch `deploy/cloudflare-containers`, plus working-tree layout lookup changes. The change-request baseline is now `2bb062d9e613980cc8d7ef1e4c545b527ff1e9c2` on main, which incorporates matching-layout lookup. That addition does not implement file selection or ZMK-derived discovery.
- Public upstream source: `e7946792cf674db20ab72ab67fea759fff4c3ccc` on `nickcoutsos/keymap-editor` main, verified against the remote. Fork ancestor `a6c0b7a0441be77dc0cd1ec06e7e43702cb92dab` has the identical tree `4f802d350217b21535a8cbf7ab91bad9e5e3d4d0`. This revision is unchanged since the first assessment.
- Hosted upstream app: pages commit `e954e104d5f2aeb7f2b6ef95cbb525ef5eb0c3cf`. Also unchanged.
- Intermediate fork source: `01232db45997653e45b63a944722613dce018c48` on `katafoxi/keymap-editor-extended` main, verified against the remote. It is 20 commits past the shared base `f1febacf67022d5522af754bd253917f7644b894`, which is where this repository's own history diverged. Public source updates stopped against the original upstream, but not against this intermediate fork.
- This repository: `8fb50d6f9689a3b738f1400b737778e4dfe780dc` on main, 70 commits past the same base.
- Deployment evidence was taken from assets referenced by that revision's index/runtime, not every retained historical bundle.

## Closed gaps

The first assessment listed eight parity gaps against the public upstream. All eight are now closed by this repository's own change records, and the public upstream source has not moved since.

| Gap | Closed by |
| --- | --- |
| Bluetooth/RGB picker commands | [CHG-001](archive/CHG-001-complete-bluetooth-rgb-command-catalog.md) |
| Leave-page protection | [CHG-002](archive/CHG-002-warn-before-leaving-unpublished-work.md) |
| Duplicate/reorder firmware layers | [CHG-003](archive/CHG-003-duplicate-and-reorder-firmware-layers.md) |
| Select keymap within GitHub repo | [CHG-004](archive/CHG-004-select-keymap-file-within-repository.md) |
| General macro authoring | [CHG-005](archive/CHG-005-visual-zmk-macro-editor.md) |
| General custom-behavior authoring | [CHG-006](archive/CHG-006-custom-behavior-definition-editor.md) |
| Browser filesystem source | [CHG-007](archive/CHG-007-browser-filesystem-keymap-source.md) |
| ZMK-derived layout discovery | [CHG-008](archive/CHG-008-discover-layouts-from-zmk-metadata.md) |

The fork already implements combos, conditional layers, encoders, mouse behavior, Clipboard, themes, GitHub, host layouts, Unicode, and drafts. These are not missing wholesale. Do not use this snapshot as proof of an untested parser bug or full upstream equivalence.

## New gaps in the intermediate fork delta

The intermediate fork moved after the first assessment. Its 20 commits split into four groups.

| Commit | Change | Outcome |
| --- | --- | --- |
| `2b9b51b` | GitHub App installation returns keep OAuth state | Already in this repository as `bd9aa1e` |
| `ad1998d` | Load matching config layouts for named keymaps | Already in this repository as `2bb062d` |
| `bd446c6` | Recognize `&sys_reset` and `&studio_unlock` bindings | Already in this repository as `0650405` |
| `aa83775` | Load well-formed unknown behaviors everywhere | Argument retention already present; catalog relaxation declined |
| `e58928b` | Accept named layout JSON only with a valid `layouts` object | Accepted, [CHG-011](active/CHG-011-upstream-named-layout-and-holdtap-dependency.md) |
| `3646de4` | Cover a named-layout keymap with reset, Unicode, encoders | Accepted as CHG-011 regression coverage |
| `f74a94d` | Require a declared node for `&hm` and `&as` in `keymap.json` | Accepted, CHG-011 |
| `a2ef691` | Let the host language list overflow visibly | Declined |
| `abec2b9`, `aef03c0` | Meta tags, robots.txt, sitemap.xml, Open Graph | Not applicable |
| `0ed3f70` | Cross-Origin-Resource-Policy for og.jpg | Not applicable |
| `4f733c6` | Caddyfile www redirect and deploy notes | Not applicable |
| `ebbe710`, `01232db` | og.jpg image updates | Not applicable |
| `be21bd9` | Optional local Chromium executable path | Not applicable |

Evidence for the two accepted gaps, taken against this repository at `8fb50d6`:

- The named-layout rule is absent. `packages/keymap-core/src/layout.ts` has no helper that distinguishes a layout file from other JSON, `packages/keymap-core/src/errors.ts` gives `InfoValidationError` no path, and `apps/web/src/lib/components/Pickers/Github/ValidationErrors.svelte` maps the error title to a fixed `config/info.json`. A named `config/<keymap>.json` carrying no `layouts` object therefore fails the whole load with `info must define "layouts"`, and a broken named file is blamed on the shared one.
- The hold-tap dependency rule is unstated. `packages/keymap-core/src/keymap.ts` rejects `&hm` and `&as` in a `keymap.json` only because those codes are absent from the stock catalog, not because a dependency is checked. The observable result matches the upstream rule today, and would stop matching if the catalog later gained those codes.

### Declined directions

The local decision overrules the upstream direction in two cases.

- `aa83775` replaces catalog membership with a bare well-formed-name check, which also accepts `&reset_extra` and `&external_unknown`. CHG-009 fixed that boundary deliberately and `packages/keymap-core/AGENTS.md` keeps it: unknown labels other than the exact legacy `&reset` import label require the explicit source-import option or a declared-model allowance.
- `a2ef691` drops the bounded height and scrolling from the host language list. This repository's own `9fd46e2` added that behavior together with the language menu's keyboard accessibility.

The remaining commits serve the intermediate fork's own domain, deployment, and browser tooling. This repository serves a different site and installs its own Chromium in CI.

## References

- [Source-release policy](https://github.com/nickcoutsos/keymap-editor/wiki/Source-Code-Updates)
- [Upstream features](https://github.com/nickcoutsos/keymap-editor/wiki/Features)
- [Automatic layout generation](https://github.com/nickcoutsos/keymap-editor/wiki/Defining-keyboard-layouts#automatic-layout-generation)
- [Hosted revision](https://github.com/nickcoutsos/keymap-editor/commit/e954e104d5f2aeb7f2b6ef95cbb525ef5eb0c3cf)

## Revalidation before implementation

Recheck current source, branch, working-tree ownership and relevant upstream schema/docs. Test behavior at the actual target revision; commit messages and compiled symbols alone are not executable proof for the fork. Never import compiled upstream bundles into the Svelte source tree.
