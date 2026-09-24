import {
  choiceHasParams,
  isModifierKey,
  isModifierWrap,
  type CatalogChoice
} from './catalog-choices.js'
import {
  modifierHoldForKey,
  modifierHoldLegend,
  modifierSide
} from './modifiers.js'

/** Glyph or shortest code used to sort and label a choice. */
export function representativeLabel(choice: CatalogChoice): string {
  if (choiceHasParams(choice)) return String(choice.code ?? '')
  const symbol = choice.symbol == null ? '' : String(choice.symbol).trim()
  if (symbol) return symbol
  return String(choice.code ?? '')
}

/**
 * Same as `representativeLabel`, but modifier keys use the TARGET_SYSTEM
 * contract (`⌘` / `R⌘`), extras drop the redundant `K_` prefix, US shift
 * aliases show `⇧:`, and any other collision falls back to the code.
 */
export function displayChoiceLabel(
  choice: CatalogChoice,
  peers: CatalogChoice[] = []
): string {
  if (isModifierWrap(choice)) return `${String(choice.code ?? '')}(…)`
  const shift = usShiftAlias(choice)
  if (shift) return `⇧${shift.symbol}`
  const hid = punctHidMark(choice)
  if (hid) return hid.symbol
  const code = String(choice.code ?? '')
  if (isModifierKey(choice)) {
    const hold = modifierHoldForKey(code)
    if (hold) return modifierHoldLegend(hold)
  }
  const base = representativeLabel(choice)
  if (!base) return stripExtrasChipPrefix(code)
  const collisions = peers.filter(peer => representativeLabel(peer) === base)
  if (collisions.length <= 1) return stripExtrasChipPrefix(code, base)
  const side = modifierSide(code)
  if (side && base.length === 1) return `${side}${base}`
  return stripExtrasChipPrefix(code)
}

/** `CODE — description` for native tooltips. Shifted US names name the LS() wrap. */
export function catalogChoiceTooltip(choice: CatalogChoice): string {
  const code = String(choice.code ?? '').trim()
  const shown = choiceHasParams(choice) ? `${code}(${choice.params!.join(',')})` : code
  const shift = usShiftAlias(choice)
  if (shift) return `${shown} — LS(${shift.base})`
  const detail = String(choice.description ?? choice.name ?? '').trim()
  if (shown && detail && detail !== code && detail !== shown) return `${shown} — ${detail}`
  return detail || shown
}

/** Extras band is all `K_*`; hide that prefix on the chip, not in tooltips. */
function isExtrasKeycode(code: string): boolean {
  const upper = code.toUpperCase()
  return /^K_/.test(upper) && !/2$/.test(upper)
}

function stripExtrasChipPrefix(code: string, label = code): string {
  if (label !== code || !isExtrasKeycode(code)) return label
  return code.replace(/^K_/i, '')
}

export function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Physical HID punctuation (no LS). Order follows the US key row:
 * ` - = [ ] \ ; ' , . /
 */
const PUNCT_HID_MARKS: Array<{ names: string[]; symbol: string }> = [
  { names: ['GRAVE'], symbol: '`' },
  { names: ['MINUS'], symbol: '-' },
  { names: ['EQUAL'], symbol: '=' },
  { names: ['LEFT_BRACKET', 'LBKT'], symbol: '[' },
  { names: ['RIGHT_BRACKET', 'RBKT'], symbol: ']' },
  { names: ['BACKSLASH', 'BSLH'], symbol: '\\' },
  { names: ['SEMICOLON', 'SEMI'], symbol: ';' },
  { names: ['SINGLE_QUOTE', 'SQT', 'APOSTROPHE', 'APOS'], symbol: "'" },
  { names: ['COMMA'], symbol: ',' },
  { names: ['PERIOD', 'DOT'], symbol: '.' },
  { names: ['SLASH', 'FSLH'], symbol: '/' }
]

/**
 * ZMK keys.h convenience names: `COLON` is `LS(SEMI)`, not another HID key.
 * Glyphs are US QWERTY; host compose will always see that shifted report.
 */
const US_SHIFT_ALIASES: Array<{ names: string[]; base: string; symbol: string }> = [
  { names: ['EXCLAMATION', 'EXCL'], base: 'N1', symbol: '!' },
  { names: ['AT_SIGN', 'AT'], base: 'N2', symbol: '@' },
  { names: ['HASH', 'POUND'], base: 'N3', symbol: '#' },
  { names: ['DOLLAR', 'DLLR'], base: 'N4', symbol: '$' },
  { names: ['PERCENT', 'PRCNT'], base: 'N5', symbol: '%' },
  { names: ['CARET'], base: 'N6', symbol: '^' },
  { names: ['AMPERSAND', 'AMPS'], base: 'N7', symbol: '&' },
  { names: ['ASTERISK', 'ASTRK', 'STAR'], base: 'N8', symbol: '*' },
  { names: ['LEFT_PARENTHESIS', 'LPAR'], base: 'N9', symbol: '(' },
  { names: ['RIGHT_PARENTHESIS', 'RPAR'], base: 'N0', symbol: ')' },
  { names: ['UNDERSCORE', 'UNDER'], base: 'MINUS', symbol: '_' },
  { names: ['PLUS'], base: 'EQUAL', symbol: '+' },
  { names: ['LEFT_BRACE', 'LBRC'], base: 'LBKT', symbol: '{' },
  { names: ['RIGHT_BRACE', 'RBRC'], base: 'RBKT', symbol: '}' },
  { names: ['PIPE'], base: 'BSLH', symbol: '|' },
  { names: ['COLON'], base: 'SEMI', symbol: ':' },
  { names: ['DOUBLE_QUOTES', 'DQT'], base: 'SQT', symbol: '"' },
  { names: ['TILDE'], base: 'GRAVE', symbol: '~' },
  { names: ['LESS_THAN', 'LT'], base: 'COMMA', symbol: '<' },
  { names: ['GREATER_THAN', 'GT'], base: 'DOT', symbol: '>' },
  { names: ['QUESTION', 'QMARK'], base: 'FSLH', symbol: '?' }
]

function choiceNames(choice: CatalogChoice): string[] {
  const aliases = Array.isArray(choice.aliases)
    ? choice.aliases.map(alias => String(alias).toUpperCase())
    : []
  const code = String(choice.code ?? '').toUpperCase()
  return code ? [code, ...aliases.filter(name => name !== code)] : aliases
}

export function punctHidMark(
  choice: CatalogChoice
): { symbol: string; rank: number } | null {
  const names = new Set(choiceNames(choice))
  const index = PUNCT_HID_MARKS.findIndex(mark =>
    mark.names.some(name => names.has(name))
  )
  if (index < 0) return null
  return { symbol: PUNCT_HID_MARKS[index].symbol, rank: index }
}

export function usShiftAlias(
  choice: CatalogChoice
): { base: string; symbol: string; rank: number } | null {
  const names = new Set(choiceNames(choice))
  const index = US_SHIFT_ALIASES.findIndex(alias =>
    alias.names.some(name => names.has(name))
  )
  if (index < 0) return null
  const alias = US_SHIFT_ALIASES[index]
  return { base: alias.base, symbol: alias.symbol, rank: index }
}
