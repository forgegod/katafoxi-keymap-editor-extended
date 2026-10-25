import { describe, expect, it } from 'vitest'
import { getBehaviorCatalog } from './catalog.js'
import { parseDtsKeymap } from './dts-keymap.js'
import { mergeHoldTapCatalog } from './behaviors.js'
import { zmkBehaviorDocsUrl, zmkBehaviorHelp } from './zmk-docs.js'

describe('zmkBehaviorDocsUrl', () => {
  const namedSource = (properties = '') => `#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
/ {
  behaviors {
    kestrel: arbitrary_node {
      compatible = "zmk,behavior-hold-tap";
      #binding-cells = <2>;
      bindings = <&kp>, <&kp>;
      tapping-term-ms = <180>;
      ${properties}
    };
  };
  keymap { compatible = "zmk,keymap"; base { bindings = <&kestrel LCTRL A>; }; };
};`

  it('resolves an arbitrary named hold-tap only with document-proven metadata', () => {
    const document = parseDtsKeymap(namedSource())
    const before = JSON.stringify(document)
    expect(mergeHoldTapCatalog(getBehaviorCatalog(), document.holdTaps).byCode['&kestrel'].holdTap).toBe(true)
    expect(zmkBehaviorDocsUrl('&kestrel')).toBeNull()
    expect(zmkBehaviorDocsUrl('&kestrel', document)).toBe('https://zmk.dev/docs/keymaps/behaviors/hold-tap')
    expect(JSON.stringify(document)).toBe(before)
  })

  it('refuses opaque definitions, unproven models, lookalikes and legacy reset', () => {
    for (const properties of ['tapping-term-ms = <OPAQUE>;', 'unsupported-property;']) {
      const document = parseDtsKeymap(namedSource(properties))
      expect(zmkBehaviorDocsUrl('&kestrel', document)).toBeNull()
    }
    for (const code of ['&kestrel', '&custom_hold_tap', '&hm_lookalike', '&reset']) {
      expect(zmkBehaviorDocsUrl(code, { holdTaps: [{ code }] })).toBeNull()
      expect(zmkBehaviorDocsUrl(code, { holdTaps: [{ code, override: true, bindings: ['&kp', '&kp'] }] })).toBeNull()
    }
    const document = parseDtsKeymap(namedSource())
    expect(zmkBehaviorDocsUrl('&custom_hold_tap', document)).toBeNull()
    expect(zmkBehaviorDocsUrl('&reset', { holdTaps: [{ code: '&reset', bindings: ['&kp', '&kp'] }] })).toBeNull()
  })

  it('classifies exact bindings, proven families and explicitly requested recipe patterns', () => {
    expect(zmkBehaviorHelp('&uc')).toMatchObject({ kind: 'binding', hint: 'Ctrl+click: docs' })
    for (const code of ['&hm', '&as']) {
      expect(zmkBehaviorHelp(code)).toMatchObject({ kind: 'family', hint: 'Ctrl+click: docs — hold-tap family, not this definition.' })
    }
    expect(zmkBehaviorHelp('&kestrel', parseDtsKeymap(namedSource()))).toMatchObject({ kind: 'family' })
    expect(zmkBehaviorDocsUrl('&rgblayer', { recipe: 'rgb-layer' })).toBe('https://zmk.dev/docs/keymaps/behaviors/macros#layer--underglow-color')
    expect(zmkBehaviorHelp('&rgblayer', { recipe: 'rgb-layer' })).toEqual({
      kind: 'recipe-pattern',
      url: 'https://zmk.dev/docs/keymaps/behaviors/macros#layer--underglow-color',
      hint: 'Ctrl+click: docs — ZMK macro pattern, not exact editor recipe documentation.'
    })
    for (const code of ['&rgblayer_1', '&rgblayer_2', '&custom', '&reset', 'constructor', '__proto__']) {
      expect(zmkBehaviorHelp(code, { recipe: 'rgb-layer' })).toBeNull()
    }
  })

  const builtins = {
    '&kp': 'keymaps/behaviors/key-press',
    '&kt': 'keymaps/behaviors/key-toggle',
    '&gresc': 'keymaps/behaviors/mod-morph#behavior-binding',
    '&mkp': 'keymaps/behaviors/mouse-emulation',
    '&msc': 'keymaps/behaviors/mouse-emulation',
    '&mmv': 'keymaps/behaviors/mouse-emulation',
    '&mt': 'keymaps/behaviors/hold-tap',
    '&lt': 'keymaps/behaviors/hold-tap',
    '&sk': 'keymaps/behaviors/sticky-key',
    '&sl': 'keymaps/behaviors/sticky-layer',
    '&mo': 'keymaps/behaviors/layers',
    '&to': 'keymaps/behaviors/layers',
    '&tog': 'keymaps/behaviors/layers',
    '&caps_word': 'keymaps/behaviors/caps-word',
    '&key_repeat': 'keymaps/behaviors/key-repeat',
    '&bt': 'keymaps/behaviors/bluetooth',
    '&out': 'keymaps/behaviors/outputs',
    '&rgb_ug': 'keymaps/behaviors/underglow',
    '&bl': 'keymaps/behaviors/backlight',
    '&ext_power': 'keymaps/behaviors/power',
    '&soft_off': 'keymaps/behaviors/soft-off',
    '&sys_reset': 'keymaps/behaviors/reset',
    '&bootloader': 'keymaps/behaviors/reset',
    '&trans': 'keymaps/behaviors/transparent',
    '&none': 'keymaps/behaviors/none',
    '&inc_dec_kp': 'features/encoders#rotation',
    '&studio_unlock': 'keymaps/behaviors/studio-unlock',
    '&uc': 'https://github.com/urob/zmk-unicode/blob/main/README.md'
  }

  it('covers exactly the built-in catalog without changing membership or schemas', () => {
    const catalog = getBehaviorCatalog()
    const before = JSON.stringify(catalog)
    expect(catalog.list.map(choice => choice.code).sort()).toEqual(Object.keys(builtins).sort())
    for (const choice of catalog.list) expect(zmkBehaviorDocsUrl(choice.code)).toBeTruthy()
    expect(JSON.stringify(catalog)).toBe(before)
  })

  it.each(Object.entries(builtins))('retains the exact selected destination for %s', (code, path) => {
    expect(zmkBehaviorDocsUrl(code)).toBe(path.startsWith('https:') ? path : `https://zmk.dev/docs/${path}`)
  })

  it('maps known behaviours to zmk.dev pages', () => {
    expect(zmkBehaviorDocsUrl('&kp')).toBe(
      'https://zmk.dev/docs/keymaps/behaviors/key-press'
    )
    expect(zmkBehaviorDocsUrl('&mkp')).toBe(
      'https://zmk.dev/docs/keymaps/behaviors/mouse-emulation'
    )
    expect(zmkBehaviorDocsUrl('&mo')).toBe(
      'https://zmk.dev/docs/keymaps/behaviors/layers'
    )
    expect(zmkBehaviorDocsUrl('&bootloader')).toBe(
      'https://zmk.dev/docs/keymaps/behaviors/reset'
    )
    expect(zmkBehaviorDocsUrl('&hm')).toBe(
      'https://zmk.dev/docs/keymaps/behaviors/hold-tap'
    )
    expect(zmkBehaviorDocsUrl('&as')).toBe(
      'https://zmk.dev/docs/keymaps/behaviors/hold-tap'
    )
  })

  it('returns null for unknown bindings', () => {
    expect(zmkBehaviorDocsUrl('&macro')).toBeNull()
    expect(zmkBehaviorDocsUrl(undefined)).toBeNull()
    for (const code of ['&reset', '&custom', '&custom_hold_tap', '&inc_dec_cp', '&rgblayer', '&rgblayer_1', '', 0]) {
      expect(zmkBehaviorDocsUrl(code)).toBeNull()
    }
  })
})
