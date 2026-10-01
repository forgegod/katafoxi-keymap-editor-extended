import {
  isModifierKey,
  isModifierWrap,
  type CatalogChoice
} from './catalog-choices.js'
import {
  compareLabels,
  isKeypadCompactPunct,
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
  | 'edit'
  | 'media'
  | 'extras'
  | 'codes'

export interface ValueBand {
  kind: ValueBandKind
  items: CatalogChoice[]
  /** Extra flex rows after `items` (nav: six-pack / system / browser). */
  extraRows?: CatalogChoice[][]
}

const BAND_ORDER: ValueBandKind[] = [
  'function',
  'digits',
  'letters',
  'punct',
  'shifted',
  'nav',
  'modkeys',
  'modwraps',
  'edit',
  'media',
  'extras',
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
  'PAUSE_BREAK',
  // Num Lock lives with Caps Lock, not in the keycode dump.
  'KP_NUM',
  'KP_NUMLOCK',
  'KP_NLCK'
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
  'PAUSE_BREAK',
  'KP_NUM',
  'KP_NUMLOCK',
  'KP_NLCK'
]

/** Main-board edge keys — first nav row. Everything else in nav is row 2. */
const NAV_ROW1_CODES = new Set([
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
  'DEL'
])

/** Transport / volume cluster lifted out of the long K_* extras row.
 * `*2` are distinct Linux/Android keyboard-page usages, not aliases of K_MUTE / K_VOL_*. */
const MEDIA_NAMED_CODES = new Set([
  'K_MUTE',
  'K_MUTE2',
  'K_VOL_DN',
  'K_VOLUME_DOWN',
  'K_VOL_DN2',
  'K_VOLUME_DOWN2',
  'K_VOL_UP',
  'K_VOLUME_UP',
  'K_VOL_UP2',
  'K_VOLUME_UP2',
  'K_PP',
  'K_PLAY_PAUSE',
  'K_NEXT',
  'K_PREV',
  'K_PREVIOUS',
  'K_STOP',
  'K_STOP3',
  'K_EJECT',
  'K_PWR',
  'K_POWER',
  'K_SLEEP'
])

const MEDIA_ORDER = [
  'K_MUTE',
  'K_MUTE2',
  'K_VOL_DN',
  'K_VOLUME_DOWN',
  'K_VOL_DN2',
  'K_VOLUME_DOWN2',
  'K_VOL_UP',
  'K_VOLUME_UP',
  'K_VOL_UP2',
  'K_VOLUME_UP2',
  'K_PP',
  'K_PLAY_PAUSE',
  'K_PREV',
  'K_PREVIOUS',
  'K_NEXT',
  'K_STOP',
  'K_STOP3',
  'K_EJECT',
  'K_PWR',
  'K_POWER',
  'K_SLEEP'
]

/** Clipboard / find toolbar — own band between nav and modifiers. */
const EDIT_NAMED_CODES = new Set([
  'K_CUT',
  'K_COPY',
  'K_PASTE',
  'K_UNDO',
  'K_REDO',
  'K_AGAIN',
  'K_FIND'
])

const EDIT_ORDER = [
  'K_CUT',
  'K_COPY',
  'K_PASTE',
  'K_UNDO',
  'K_REDO',
  'K_AGAIN',
  'K_FIND'
]

const ARROW_GLYPHS = new Set(['⏴', '⏵', '⏶', '⏷', '←', '→', '↑', '↓', '◀', '▶', '▲', '▼'])

function navRank(choice: CatalogChoice): number {
  const code = String(choice.code ?? '').toUpperCase()
  const index = NAV_ORDER.indexOf(code)
  return index >= 0 ? index : 80
}

function mediaRank(choice: CatalogChoice): number {
  const code = String(choice.code ?? '').toUpperCase()
  const index = MEDIA_ORDER.indexOf(code)
  return index >= 0 ? index : 80
}

function editRank(choice: CatalogChoice): number {
  const code = String(choice.code ?? '').toUpperCase()
  const index = EDIT_ORDER.indexOf(code)
  return index >= 0 ? index : 80
}

function isNavRow1(choice: CatalogChoice): boolean {
  return NAV_ROW1_CODES.has(String(choice.code ?? '').toUpperCase())
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
  if (isKeypadCompactPunct(choice)) return 'punct'
  if (MEDIA_NAMED_CODES.has(upper)) return 'media'
  if (EDIT_NAMED_CODES.has(upper)) return 'edit'
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
            : kind === 'media'
              ? mediaRank(item)
              : kind === 'edit'
                ? editRank(item)
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
 * punctuation, US-shift LS() aliases, navigation (two rows), modifiers, edit toolbar,
 * media, extras (K_*), then long codes.
 *
 * A Keypad-only group is one row: digits, operators, Num Lock, then rare HID.
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
    edit: [],
    media: [],
    extras: [],
    codes: []
  }
  for (const choice of choices) {
    buckets[valueBandKind(choice)].push(choice)
  }
  const bands = BAND_ORDER.filter(kind => buckets[kind].length > 0).map(kind => {
    const items = sortBand(kind, buckets[kind])
    if (kind === 'nav') return splitNavRows(items)
    if (kind === 'function') return splitFunctionRows(items)
    if (kind === 'media') return splitMediaRows(items)
    return { kind, items }
  })
  if (choices.length === 0 || !choices.every(isKeypadGroupChoice)) return bands

  const flat = bands.flatMap(band => [
    ...band.items,
    ...(band.extraRows ?? []).flat()
  ])
  if (flat.length === 0) return bands
  return [{ kind: 'punct', items: sortKeypadOpsRow(flat) }]
}

/**
 * Collapse the HID dump only on the Keyboard taxonomy tab. Other contexts
 * (Consumer*, Keypad-only, …) are already small slices — keep codes open.
 */
export function codesBandNeedsDisclosure(context: string): boolean {
  return context.trim() === 'Keyboard'
}

function splitNavRows(sorted: CatalogChoice[]): ValueBand {
  const row1: CatalogChoice[] = []
  const row2: CatalogChoice[] = []
  for (const item of sorted) {
    if (isNavRow1(item)) row1.push(item)
    else row2.push(item)
  }
  if (row2.length === 0) return { kind: 'nav', items: row1 }
  if (row1.length === 0) return { kind: 'nav', items: row2 }
  return { kind: 'nav', items: row1, extraRows: [row2] }
}

/** F1–F12 on the main row; F13–F24 wait behind a disclosure in the UI. */
function splitFunctionRows(sorted: CatalogChoice[]): ValueBand {
  const main: CatalogChoice[] = []
  const more: CatalogChoice[] = []
  for (const item of sorted) {
    if (functionKeyNumber(item) > 12) more.push(item)
    else main.push(item)
  }
  if (more.length === 0) return { kind: 'function', items: main }
  if (main.length === 0) return { kind: 'function', items: more }
  return { kind: 'function', items: main, extraRows: [more] }
}

/** Linux/Android mute/volume *2 duplicates sit on a secondary media row. */
const MEDIA_SECONDARY_CODES = new Set([
  'K_MUTE2',
  'K_VOL_DN2',
  'K_VOLUME_DOWN2',
  'K_VOL_UP2',
  'K_VOLUME_UP2'
])

function splitMediaRows(sorted: CatalogChoice[]): ValueBand {
  const primary: CatalogChoice[] = []
  const secondary: CatalogChoice[] = []
  for (const item of sorted) {
    if (MEDIA_SECONDARY_CODES.has(String(item.code ?? '').toUpperCase())) {
      secondary.push(item)
    } else {
      primary.push(item)
    }
  }
  if (secondary.length === 0) return { kind: 'media', items: primary }
  if (primary.length === 0) return { kind: 'media', items: secondary }
  return { kind: 'media', items: primary, extraRows: [secondary] }
}

function isKeypadGroupChoice(choice: CatalogChoice): boolean {
  if (String(choice.context ?? '').trim().toLowerCase() === 'keypad') return true
  const upper = String(choice.code ?? '')
    .trim()
    .toUpperCase()
  return upper.startsWith('KP_') || upper === 'CLEAR2'
}

/** Digits → operators → Num Lock → rare clear/AS400. */
const KEYPAD_OPS_ORDER = [
  'KP_N0',
  'KP_NUMBER_0',
  'KP_N1',
  'KP_NUMBER_1',
  'KP_N2',
  'KP_NUMBER_2',
  'KP_N3',
  'KP_NUMBER_3',
  'KP_N4',
  'KP_NUMBER_4',
  'KP_N5',
  'KP_NUMBER_5',
  'KP_N6',
  'KP_NUMBER_6',
  'KP_N7',
  'KP_NUMBER_7',
  'KP_N8',
  'KP_NUMBER_8',
  'KP_N9',
  'KP_NUMBER_9',
  'KP_MINUS',
  'KP_SUBTRACT',
  'KP_DOT',
  'KP_ASTERISK',
  'KP_MULTIPLY',
  'KP_SLASH',
  'KP_DIVIDE',
  'KP_PLUS',
  'KP_EQUAL',
  'KP_ENTER',
  'KP_COMMA',
  'KP_LPAR',
  'KP_LEFT_PARENTHESIS',
  'KP_RPAR',
  'KP_RIGHT_PARENTHESIS',
  'KP_NUM',
  'KP_NUMLOCK',
  'KP_NLCK',
  'CLEAR2',
  'KP_CLEAR',
  'KP_EQUAL_AS400'
]

function keypadOpsRank(choice: CatalogChoice): number {
  const code = String(choice.code ?? '').toUpperCase()
  const index = KEYPAD_OPS_ORDER.indexOf(code)
  return index >= 0 ? index : 80
}

function sortKeypadOpsRow(items: CatalogChoice[]): CatalogChoice[] {
  return [...items].sort((a, b) => {
    const byRank = keypadOpsRank(a) - keypadOpsRank(b)
    if (byRank !== 0) return byRank
    return compareLabels(String(a.code ?? ''), String(b.code ?? ''))
  })
}
