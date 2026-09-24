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

/** Compact layer index for key legends (`1` → `L1`). Binding value stays numeric. */
export function layerLegendSymbol(index: number | string): string {
  return `L${index}`
}

export function isLayerLegendSymbol(text: string): boolean {
  return /^L\d+$/.test(text)
}

/** Role glyphs shared by L/R modifiers. Right side is prefixed at display time. */
const ROLE_GLYPHS = new Set(['⌃', '⇧', '⌥', '⌘'])

function isRightModifierCode(code: string): boolean {
  const upper = code.toUpperCase()
  return (
    /^(RC|RS|RA|RG)$/.test(upper) ||
    /^(RCTRL|RSHFT|RSHIFT|RALT|RGUI|RCMD|RWIN|RMETA)$/.test(upper) ||
    /^RIGHT[_-]/.test(upper)
  )
}

/**
 * Keycap / ZMK-mode legend: left modifiers stay the role glyph,
 * right modifiers become `R⌃` / `R⌥` / `R⌘` / `R⇧`.
 */
export function keycapLegend(
  code?: string | number | null,
  symbol?: string | number | null
): string {
  const rawCode = code == null ? '' : String(code)
  const glyph = symbol == null ? '' : String(symbol).trim()
  const base = glyph || rawCode
  if (isRightModifierCode(rawCode) && ROLE_GLYPHS.has(glyph)) {
    return `R${glyph}`
  }
  return base
}

export function isCompactKeycapLegend(text: string): boolean {
  return (
    text.length === 1 ||
    isLayerLegendSymbol(text) ||
    /^R[⌃⇧⌥⌘]$/.test(text)
  )
}

/**
 * HID keypad page (`KP_N7`, `KP_ENTER`, `KC_KP_MINUS`).
 * Display-only: the glyph stays `7` / `+`; UI draws a box.
 */
export function isKeypadCode(code?: string | number | null): boolean {
  const upper = String(code ?? '')
    .trim()
    .toUpperCase()
    .replace(/^KC_/, '')
  return upper.startsWith('KP_')
}

/** Catalog chip: `KP_*` or the Keypad HID group (`CLEAR2`). */
export function isKeypadChoice(choice: {
  code?: string | number | null
  context?: string | null
  aliases?: unknown
}): boolean {
  if (isKeypadCode(choice.code)) return true
  if (String(choice.context ?? '').trim().toLowerCase() === 'keypad') return true
  if (!Array.isArray(choice.aliases)) return false
  return choice.aliases.some(alias => isKeypadCode(alias))
}

const MOD_WRAP_RE = /^(LS|RS|LC|RC|LA|RA|LG|RG)$/i

/** `LC(DEL)` / `RC(BSPC)` — wrap + one short key, no deeper nest. */
export function isCompactModifierChord(
  wrapCode: string | number | undefined | null,
  innerLegend: string
): boolean {
  return MOD_WRAP_RE.test(String(wrapCode ?? '')) && isCompactKeycapLegend(innerLegend)
}

/** Role glyph only; `keycapLegend` adds the `R` prefix for the right side. */
const HOLD_ROLE_GLYPH: Record<string, string> = {
  LCTRL: '⌃',
  LSHFT: '⇧',
  LALT: '⌥',
  LGUI: '⌘',
  RCTRL: '⌃',
  RSHFT: '⇧',
  RALT: '⌥',
  RGUI: '⌘',
  LC: '⌃',
  LS: '⇧',
  LA: '⌥',
  LG: '⌘',
  RC: '⌃',
  RS: '⇧',
  RA: '⌥',
  RG: '⌘'
}

/** `&mt` / `&lt` — first param is hold, second is tap. */
export function isHoldTapBehavior(code: string | number | undefined | null): boolean {
  const value = String(code ?? '')
  return value === '&mt' || value === '&lt'
}

export function isHoldTapParam(param: unknown): boolean {
  return param === 'mod' || param === 'layer'
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
      hold: layer != null ? layerLegendSymbol(layer) : undefined
    }
  }

  const tap = node.params[0]?.value
  return { tap: tap != null ? String(tap) : null }
}

function formatHoldBadge(hold: string): string {
  const glyph = HOLD_ROLE_GLYPH[hold]
  return `⧗${glyph ? keycapLegend(hold, glyph) : hold}`
}

function legendForTap(tap: string): ComposedLegend {
  const fixture = TAP_FIXTURES[tap] ?? TAP_FIXTURES[tap.replace(/^KC_/, '')]
  const keypad = isKeypadCode(tap)
  if (fixture) {
    return { ...fixture, keypad }
  }

  const short = tap.replace(/^KC_/, '')
  return {
    primary: [
      short.slice(0, 1).toLowerCase() || '?',
      short.slice(0, 1).toUpperCase() || '?'
    ],
    altGr: ['', ''],
    keycode: tap.startsWith('KC_') ? tap : `KC_${tap}`,
    keypad
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
