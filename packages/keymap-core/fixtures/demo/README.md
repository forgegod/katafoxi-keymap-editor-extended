# Demo keyboard fixtures

Bundled sample layouts + keymaps for the SPA **Demo** source (first-visit onboarding).

| Id | Layout source | Keymap |
|----|---------------|--------|
| `corne` | [keymap-editor-contrib](https://github.com/nickcoutsos/keymap-editor-contrib/blob/main/keyboard-data/corne.json) | ZMK shield default |
| `kabarga` | [zmk-kabarga](https://github.com/aroum/zmk-kabarga) `config/kabarga.json` | Upstream keymap with layer `#define`s expanded to numbers, plus demo gap/anchor combos |
| `lark` | [`fixtures/lark`](../lark/) (sibling; not under `demo/`) | Vendored LARK keymap |
| `lily58` | same contrib repo | ZMK shield default |
| `nice60` | same contrib repo | ZMK nice!60 default plus demo combos |
| `planck` | same contrib repo (`planck_rev6`) | ZMK Planck Rev6 default, grid layout only, demo combos |
| `pncateho` | Dual-half 2×4 + thumbs (from [zmk-PNCATEHO](https://github.com/aroum/zmk-PNCATEHO) transform) | Chord firmware with combos expanded from `chords.dtsi` |
| `sofle` | same contrib repo | ZMK shield default with layer `#define`s expanded, dual encoders, demo combos |
| `cradio` | same contrib repo (Sweep) | Small demo keymap sized to the 34-key layout |

Product code loads these as opaque fixture ids via `apps/web/src/lib/demo/catalog.ts` (`catalog.json` + Vite-imported files). The SPA lists demos alphabetically by display name. Do not teach compose/host-layout domain logic about these board names.
