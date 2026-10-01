import {
  isModifierKey,
  isModifierWrap,
  type CatalogChoice
} from './catalog-choices.js'
import {
  compareLabels,
  punctHidMark,
  representativeLabel,
  usShiftAlias
} from './keycode-labels.js'
import { modifierSide } from './modifiers.js'

export type ValueBandKind =
  | 'letters'
  | 'digits'
  | 'function'
  | 'modkeys'
  | 'modwraps'
  | 'punct'
  | 'shifted'
  | 'nav'
  | 'extras'
  | 'codes'

export interface ValueBand {
  kind: ValueBandKind
  items: CatalogChoice[]
}

const BAND_ORDER: ValueBandKind[] = [
  'function',
  'digits',
  'letters',
  'punct',
  'shifted',
  'nav',
  'extras',
  'modkeys',
  'modwraps',
  'codes'
]

export function valueBandCaption(
  kind: ValueBandKind
): { label: string; hint: string } | null {
  if (kind === 'shifted') {
    return {
      label: 'LS · US',
      hint: 'Already LS(key) on US QWERTY. Skip for host compose — COLON is LS(SEMI).'
    }
  }
  return null
}

const MOD_ROLE_FROM_WRAP: Record<string, number> = {
  LS: 0,
  RS: 0,
  LC: 1,
  RC: 1,
  LA: 2,
  RA: 2,
  LG: 3,
  RG: 3
}

function modifierRole(choice: CatalogChoice): number {
  const code = String(choice.code ?? '').toUpperCase()
  if (code in MOD_ROLE_FROM_WRAP) return MOD_ROLE_FROM_WRAP[code]
  const aliases = Array.isArray(choice.aliases)
    ? choice.aliases.map(alias => String(alias).toUpperCase())
    : []
  const hay = [code, ...aliases]
  if (hay.some(name => /SHIFT|SHFT/.test(name))) return 0
  if (hay.some(name => /CTRL|CONTROL/.test(name))) return 1
  if (hay.some(name => /(^|_)ALT$/.test(name) || name.includes('ALT'))) return 2
  if (hay.some(name => /GUI|CMD|WIN|META/.test(name))) return 3
  return 99
}

function compareModifiers(a: CatalogChoice, b: CatalogChoice): number {
  const sideA = modifierSide(String(a.code ?? '')) === 'R' ? 1 : 0
  const sideB = modifierSide(String(b.code ?? '')) === 'R' ? 1 : 0
  if (sideA !== sideB) return sideA - sideB
  const byRole = modifierRole(a) - modifierRole(b)
  if (byRole !== 0) return byRole
  return compareLabels(String(a.code ?? ''), String(b.code ?? ''))
}

/** Editing / navigation / system cluster — not punctuation or HID dump. */
const NAV_NAMED_CODES = new Set([
  'ESC',
  'TAB',
  'CAPS',
  'SPACE',
  'SPC',
  'RET',
  'RTRN',
  'ENTER',
  'BSPC',
  'BKSP',
  'DEL',
  'INS',
  'HOME',
  'END',
  'PG_UP',
  'PG_DN',
  'LEFT',
  'RIGHT',
  'UP',
  'DOWN',
  'LEFT_ARROW',
  'RIGHT_ARROW',
  'UP_ARROW',
  'DOWN_ARROW',
  // Standard top-right system keys (not locking LSLCK / LCAPS / LNLCK).
  'PSCRN',
  'PRINTSCREEN',
  'SLCK',
  'SCROLLLOCK',
  'PAUSE_BREAK'
])

const NAV_ORDER = [
  'ESC',
  'TAB',
  'CAPS',
  'SPACE',
  'SPC',
  'RET',
  'RTRN',
  'ENTER',
  'BSPC',
  'BKSP',
  'DEL',
  'INS',
  'HOME',
  'END',
  'PG_UP',
  'PG_DN',
  'LEFT',
  'LEFT_ARROW',
  'RIGHT',
  'RIGHT_ARROW',
  'UP',
  'UP_ARROW',
  'DOWN',
  'DOWN_ARROW',
  'PSCRN',
  'PRINTSCREEN',
  'SLCK',
  'SCROLLLOCK',
  'PAUSE_BREAK'
]

const ARROW_GLYPHS = new Set(['⏴', '⏵', '⏶', '⏷', '←', '→', '↑', '↓', '◀', '▶', '▲', '▼'])

function navRank(choice: CatalogChoice): number {
  const code = String(choice.code ?? '').toUpperCase()
  const index = NAV_ORDER.indexOf(code)
  return index >= 0 ? index : 80
}

const LETTER_RE = /^[A-Z]$/i
const DIGIT_RE = /^[0-9]$/
const FN_RE = /^F([1-9]|1[0-9]|2[0-4])$/i
const N_DIGIT_RE = /^N[0-9]$/i
const SHORT_WORD_RE = /^[A-Z0-9]{2}$/i

function functionKeyNumber(choice: CatalogChoice): number {
  const match = String(choice.code ?? representativeLabel(choice)).match(
    /^F(\d{1,2})$/i
  )
  return match ? Number(match[1]) : 0
}

export function valueBandKind(choice: CatalogChoice): ValueBandKind {
  const code = String(choice.code ?? '').trim()
  const label = representativeLabel(choice)

  if (LETTER_RE.test(code) || (code.length <= 1 && LETTER_RE.test(label))) {
    return 'letters'
  }
  if (DIGIT_RE.test(label) || DIGIT_RE.test(code) || N_DIGIT_RE.test(code)) {
    return 'digits'
  }
  if (FN_RE.test(code) || FN_RE.test(label)) return 'function'
  if (isModifierWrap(choice)) return 'modwraps'
  if (isModifierKey(choice)) return 'modkeys'
  const upper = code.toUpperCase()
  if (NAV_NAMED_CODES.has(upper) || ARROW_GLYPHS.has(label)) return 'nav'
  if (usShiftAlias(choice)) return 'shifted'
  if (punctHidMark(choice)) return 'punct'
  if (/^K_/.test(upper) && !/2$/.test(upper)) return 'extras'
  if (upper.startsWith('NON_US') || upper === 'PIPE2' || upper === 'TILDE2') {
    return 'codes'
  }
  if (label.length <= 2 && !SHORT_WORD_RE.test(label)) return 'punct'
  if (label.length === 1) return 'punct'
  return 'codes'
}

function sortBand(kind: ValueBandKind, items: CatalogChoice[]): CatalogChoice[] {
  if (kind === 'modkeys' || kind === 'modwraps') {
    return [...items].sort(compareModifiers)
  }
  const rows = items.map(item => ({
    item,
    primary:
      kind === 'function'
        ? functionKeyNumber(item)
        : kind === 'digits'
          ? Number(representativeLabel(item).replace(/\D/g, ''))
          : kind === 'nav'
            ? navRank(item)
            : kind === 'punct'
              ? (punctHidMark(item)?.rank ?? 80)
              : kind === 'shifted'
                ? (usShiftAlias(item)?.rank ?? 80)
                : 0,
    label: kind === 'codes' ? String(item.code ?? '') : representativeLabel(item),
    code: String(item.code ?? '')
  }))
  rows.sort((a, b) => {
    if (a.primary !== b.primary) return a.primary - b.primary
    const byLabel = compareLabels(a.label, b.label)
    if (byLabel !== 0) return byLabel
    return compareLabels(a.code, b.code)
  })
  return rows.map(row => row.item)
}

/**
 * Split a group's chips into keyboard-like bands: F-keys, digits, letters,
 * punctuation, US-shift LS() aliases, navigation, extras (K_*), then long codes.
 */
export function bandCatalogChoices(choices: CatalogChoice[]): ValueBand[] {
  const buckets: Record<ValueBandKind, CatalogChoice[]> = {
    letters: [],
    digits: [],
    function: [],
    modkeys: [],
    modwraps: [],
    punct: [],
    shifted: [],
    nav: [],
    extras: [],
    codes: []
  }
  for (const choice of choices) {
    buckets[valueBandKind(choice)].push(choice)
  }
  return BAND_ORDER.filter(kind => buckets[kind].length > 0).map(kind => ({
    kind,
    items: sortBand(kind, buckets[kind])
  }))
}
