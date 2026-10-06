# Demo keyboard fixtures

Bundled sample layouts + keymaps for the SPA **Demo** source (first-visit onboarding).

| Id | Layout source | Keymap |
|----|---------------|--------|
| `lark` | [`fixtures/lark`](../lark/) (sibling; not under `demo/`) | Vendored LARK keymap |
| `corne` | [keymap-editor-contrib](https://github.com/nickcoutsos/keymap-editor-contrib/blob/main/keyboard-data/corne.json) | ZMK shield default |
| `lily58` | same contrib repo | ZMK shield default |
| `cradio` | same contrib repo (Sweep) | Small demo keymap sized to the 34-key layout |
| `pncateho` | Dual-half 2×4 + thumbs (from [zmk-PNCATEHO](https://github.com/aroum/zmk-PNCATEHO) transform) | Chord firmware with combos expanded from `chords.dtsi` |

Product code loads these as opaque fixture ids via `apps/web/src/lib/demo/catalog.ts` (`catalog.json` + Vite-imported files). Do not teach compose/host-layout domain logic about these board names.
