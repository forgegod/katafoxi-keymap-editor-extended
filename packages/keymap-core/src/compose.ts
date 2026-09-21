import type { ComposedLegend, ComposeKeyInput } from './types.js'

/** Fixture legends matching LARK sheet examples (host-composed preview). */
const FIXTURES: Record<string, ComposedLegend> = {
  KC_A: {
    primary: ['a', 'Ф'],
    altGr: ['@', 'α'],
    keycode: 'KC_A'
  },
  A: {
    primary: ['a', 'Ф'],
    altGr: ['@', 'α'],
    keycode: 'KC_A'
  },
  KC_S: {
    primary: ['s', 'Ы'],
    altGr: ['$', 'σ'],
    keycode: 'KC_S'
  },
  S: {
    primary: ['s', 'Ы'],
    altGr: ['$', 'σ'],
    keycode: 'KC_S'
  },
  KC_D: {
    primary: ['d', 'В'],
    altGr: ['%', 'δ'],
    keycode: 'KC_D'
  },
  D: {
    primary: ['d', 'В'],
    altGr: ['%', 'δ'],
    keycode: 'KC_D'
  },
  KC_J: {
    primary: ['j', 'О'],
    altGr: ['ˬ', 'ξ'],
    hold: '⧗LC',
    keycode: 'KC_J'
  },
  J: {
    primary: ['j', 'О'],
    altGr: ['ˬ', 'ξ'],
    hold: '⧗LC',
    keycode: 'KC_J'
  }
}

/**
 * Stub host×ZMK composition. Returns LARK-style legend for known fixtures;
 * otherwise a placeholder from the raw keycode string.
 */
export function composeKey(input: ComposeKeyInput): ComposedLegend {
  const code = input.keycode.replace(/^&kp\s+/, '').trim()
  const fixture = FIXTURES[code]
  if (fixture) {
    return { ...fixture }
  }

  const short = code.replace(/^KC_/, '')
  return {
    primary: [short.slice(0, 1).toLowerCase() || '?', short.slice(0, 1).toUpperCase() || '?'],
    altGr: ['', ''],
    keycode: code.startsWith('KC_') ? code : `KC_${code}`
  }
}

export function formatLegendCompact(legend: ComposedLegend): string {
  const base = `${legend.primary[0]}${legend.primary[1]}`
  const alt = `${legend.altGr[0]}${legend.altGr[1]}`.trim()
  const hold = legend.hold ? ` ${legend.hold}` : ''
  const note = legend.bilingualNote ? ` ${legend.bilingualNote}` : ''
  return alt ? `${base} ${alt}${hold}${note}`.trim() : `${base}${hold}${note}`.trim()
}
