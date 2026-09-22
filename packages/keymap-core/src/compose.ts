import type {
  ComposedLegend,
  ComposeKeyInput,
  KeyBindingNode,
  ResolvedBinding
} from './types.js'

/**
 * Glyph fixtures by tap keycode only — never attach hold here.
 * Hold badges come from resolveBinding (e.g. &mt), not from the letter.
 * Full HostLayout/HostProfile replaces this map after migration.
 */
const TAP_FIXTURES: Record<string, Omit<ComposedLegend, 'hold'>> = {
  KC_A: { primary: ['a', 'Ф'], altGr: ['@', 'α'], keycode: 'KC_A' },
  A: { primary: ['a', 'Ф'], altGr: ['@', 'α'], keycode: 'KC_A' },
  KC_S: { primary: ['s', 'Ы'], altGr: ['$', 'σ'], keycode: 'KC_S' },
  S: { primary: ['s', 'Ы'], altGr: ['$', 'σ'], keycode: 'KC_S' },
  KC_D: { primary: ['d', 'В'], altGr: ['%', 'δ'], keycode: 'KC_D' },
  D: { primary: ['d', 'В'], altGr: ['%', 'δ'], keycode: 'KC_D' },
  KC_J: { primary: ['j', 'О'], altGr: ['ˬ', 'ξ'], keycode: 'KC_J' },
  J: { primary: ['j', 'О'], altGr: ['ˬ', 'ξ'], keycode: 'KC_J' }
}

const HOLD_SHORT: Record<string, string> = {
  LCTRL: 'LC',
  LSHFT: 'LS',
  LALT: 'LA',
  LGUI: 'LG',
  RCTRL: 'RC',
  RSHFT: 'RS',
  RALT: 'RA',
  RGUI: 'RG',
  LC: 'LC',
  LS: 'LS',
  LA: 'LA',
  LG: 'LG'
}

/**
 * Split a ZMK binding into tap keycode + optional hold annotation source.
 * Covers the common editor behaviors; unknown binds yield tap from first param if any.
 */
export function resolveBinding(node: KeyBindingNode): ResolvedBinding {
  const behavior = String(node.value)

  if (behavior === '&none' || behavior === '&trans') {
    return { tap: null }
  }

  if (behavior === '&kp') {
    const tap = node.params[0]?.value
    return { tap: tap != null ? String(tap) : null }
  }

  // &mt hold_mod tap_keycode
  if (behavior === '&mt') {
    const hold = node.params[0]?.value
    const tap = node.params[1]?.value
    return {
      tap: tap != null ? String(tap) : null,
      hold: hold != null ? String(hold) : undefined
    }
  }

  // &lt layer tap_keycode
  if (behavior === '&lt') {
    const layer = node.params[0]?.value
    const tap = node.params[1]?.value
    return {
      tap: tap != null ? String(tap) : null,
      hold: layer != null ? `L${layer}` : undefined
    }
  }

  const tap = node.params[0]?.value
  return { tap: tap != null ? String(tap) : null }
}

function formatHoldBadge(hold: string): string {
  const short = HOLD_SHORT[hold] ?? hold
  return `⧗${short}`
}

function legendForTap(tap: string): ComposedLegend {
  const fixture = TAP_FIXTURES[tap] ?? TAP_FIXTURES[tap.replace(/^KC_/, '')]
  if (fixture) {
    return { ...fixture }
  }

  const short = tap.replace(/^KC_/, '')
  return {
    primary: [
      short.slice(0, 1).toLowerCase() || '?',
      short.slice(0, 1).toUpperCase() || '?'
    ],
    altGr: ['', ''],
    keycode: tap.startsWith('KC_') ? tap : `KC_${tap}`
  }
}

/**
 * Stub host×ZMK composition: glyphs from tap fixtures, hold only from the binding.
 * Returns null when there is no tap (e.g. &trans) so the UI can keep ZMK mode.
 */
export function composeKey(input: ComposeKeyInput): ComposedLegend | null {
  const resolved = resolveBinding(input.binding)
  if (resolved.tap == null) return null

  const legend = legendForTap(resolved.tap)
  if (resolved.hold) {
    legend.hold = formatHoldBadge(resolved.hold)
  }
  return legend
}

export function formatLegendCompact(legend: ComposedLegend): string {
  const base = `${legend.primary[0]}${legend.primary[1]}`
  const alt = `${legend.altGr[0]}${legend.altGr[1]}`.trim()
  const hold = legend.hold ? ` ${legend.hold}` : ''
  const note = legend.bilingualNote ? ` ${legend.bilingualNote}` : ''
  return alt ? `${base} ${alt}${hold}${note}`.trim() : `${base}${hold}${note}`.trim()
}
