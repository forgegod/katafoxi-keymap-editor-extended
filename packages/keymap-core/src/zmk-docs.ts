import type { ZmkBehaviorDefinition, ZmkHoldTap } from './types.js'
import { RGB_LAYER_RECIPE_CODE } from './behavior-recipes.js'

const BEHAVIOR_DOCS: Record<string, string> = {
  '&kp': 'https://zmk.dev/docs/keymaps/behaviors/key-press',
  '&kt': 'https://zmk.dev/docs/keymaps/behaviors/key-toggle',
  '&inc_dec_kp': 'https://zmk.dev/docs/features/encoders#rotation',
  // Third-party module, not a stock ZMK behavior.
  '&uc': 'https://github.com/urob/zmk-unicode/blob/main/README.md',
  '&gresc': 'https://zmk.dev/docs/keymaps/behaviors/mod-morph#behavior-binding',
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
  '&soft_off': 'https://zmk.dev/docs/keymaps/behaviors/soft-off',
  '&sys_reset': 'https://zmk.dev/docs/keymaps/behaviors/reset',
  '&bootloader': 'https://zmk.dev/docs/keymaps/behaviors/reset',
  '&studio_unlock': 'https://zmk.dev/docs/keymaps/behaviors/studio-unlock',
  '&trans': 'https://zmk.dev/docs/keymaps/behaviors/transparent',
  '&none': 'https://zmk.dev/docs/keymaps/behaviors/none'
}

/** Document metadata, not a label/arity guess or a UI choice's holdTap hint. */
export interface ZmkBehaviorHelpContext {
  holdTaps?: readonly ZmkHoldTap[]
  behaviorDefinitions?: readonly ZmkBehaviorDefinition[]
  /** Only the editor-owned recipe selection surface supplies this context. */
  recipe?: 'rgb-layer'
}

export interface ZmkBehaviorHelp {
  kind: 'binding' | 'family' | 'recipe-pattern'
  url: string
  hint: string
}

function provenHoldTap(code: string, context: ZmkBehaviorHelpContext): boolean {
  const definitions = context.behaviorDefinitions?.filter(item => item.code === code) ?? []
  // The legacy timing parser can retain metadata for an opaque definition.
  // Never promote that metadata to help when the definition parser refused it.
  if (definitions.some(item => !item.editable || item.compatible !== 'zmk,behavior-hold-tap')) return false
  return context.holdTaps?.some(item =>
    item.code === code && !item.override && item.bindings?.length === 2
  ) ?? false
}

/** Known binding help plus document-proven named hold-tap family references. */
export function zmkBehaviorDocsUrl(
  code: string | number | undefined,
  context: ZmkBehaviorHelpContext = {}
): string | null {
  return zmkBehaviorHelp(code, context)?.url ?? null
}

/** Shared destination and semantic category; never infers a family from arity/name. */
export function zmkBehaviorHelp(
  code: string | number | undefined,
  context: ZmkBehaviorHelpContext = {}
): ZmkBehaviorHelp | null {
  if (code == null || code === '&reset') return null
  if (code === RGB_LAYER_RECIPE_CODE && context.recipe === 'rgb-layer') {
    return {
      kind: 'recipe-pattern',
      url: 'https://zmk.dev/docs/keymaps/behaviors/macros#layer--underglow-color',
      hint: 'Ctrl+click: docs — ZMK macro pattern, not exact editor recipe documentation.'
    }
  }
  const exact = Object.hasOwn(BEHAVIOR_DOCS, String(code)) ? BEHAVIOR_DOCS[String(code)] : null
  const family = code === '&hm' || code === '&as' || (!exact && provenHoldTap(String(code), context))
  if (family) {
    return {
      kind: 'family', url: BEHAVIOR_DOCS['&mt']!,
      hint: 'Ctrl+click: docs — hold-tap family, not this definition.'
    }
  }
  return exact ? { kind: 'binding', url: exact, hint: 'Ctrl+click: docs' } : null
}
