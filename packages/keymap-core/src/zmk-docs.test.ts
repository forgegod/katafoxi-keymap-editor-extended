import { describe, expect, it } from 'vitest'
import { getBehaviorCatalog } from './catalog.js'
import { zmkBehaviorDocsUrl } from './zmk-docs.js'

describe('zmkBehaviorDocsUrl', () => {
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
