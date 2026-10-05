const BEHAVIOR_DOCS: Record<string, string> = {
  '&kp': 'https://zmk.dev/docs/keymaps/behaviors/key-press',
  '&mkp': 'https://zmk.dev/docs/keymaps/behaviors/mouse-emulation',
  '&msc': 'https://zmk.dev/docs/keymaps/behaviors/mouse-emulation',
  '&mmv': 'https://zmk.dev/docs/keymaps/behaviors/mouse-emulation',
  '&mt': 'https://zmk.dev/docs/keymaps/behaviors/hold-tap',
  '&lt': 'https://zmk.dev/docs/keymaps/behaviors/hold-tap',
  // Editor presets. Both are hold-taps; ZMK documents them on the hold-tap page.
  '&hm': 'https://zmk.dev/docs/keymaps/behaviors/hold-tap',
  '&as': 'https://zmk.dev/docs/keymaps/behaviors/hold-tap',
  '&sk': 'https://zmk.dev/docs/keymaps/behaviors/sticky-key',
  '&sl': 'https://zmk.dev/docs/keymaps/behaviors/sticky-layer',
  '&mo': 'https://zmk.dev/docs/keymaps/behaviors/layers',
  '&to': 'https://zmk.dev/docs/keymaps/behaviors/layers',
  '&tog': 'https://zmk.dev/docs/keymaps/behaviors/layers',
  '&caps_word': 'https://zmk.dev/docs/keymaps/behaviors/caps-word',
  '&key_repeat': 'https://zmk.dev/docs/keymaps/behaviors/key-repeat',
  '&bt': 'https://zmk.dev/docs/keymaps/behaviors/bluetooth',
  '&out': 'https://zmk.dev/docs/keymaps/behaviors/outputs',
  '&rgb_ug': 'https://zmk.dev/docs/keymaps/behaviors/underglow',
  '&bl': 'https://zmk.dev/docs/keymaps/behaviors/backlight',
  '&ext_power': 'https://zmk.dev/docs/keymaps/behaviors/power',
  '&reset': 'https://zmk.dev/docs/keymaps/behaviors/reset',
  '&bootloader': 'https://zmk.dev/docs/keymaps/behaviors/reset',
  '&trans': 'https://zmk.dev/docs/keymaps/behaviors/transparent',
  '&none': 'https://zmk.dev/docs/keymaps/behaviors/none'
}

/** Official ZMK docs for a behaviour binding, if we have a known page. */
export function zmkBehaviorDocsUrl(
  code: string | number | undefined
): string | null {
  if (code == null) return null
  return BEHAVIOR_DOCS[String(code)] ?? null
}
