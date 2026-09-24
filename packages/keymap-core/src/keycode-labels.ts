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

function labelChoice(choice: CatalogChoice, collisionCount: number): string {
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
  if (collisionCount <= 1) return stripExtrasChipPrefix(code, base)
  const side = modifierSide(code)
  if (side && base.length === 1) return `${side}${base}`
  return stripExtrasChipPrefix(code)
}

/**
 * One pass over `choices` so each label does not re-scan peers.
 * Equivalent to `displayChoiceLabel(choice, choices)`.
 */
export function buildChoiceLabeler(
  choices: CatalogChoice[]
): (choice: CatalogChoice) => string {
  const counts = new Map<string, number>()
  for (const choice of choices) {
    const base = representativeLabel(choice)
    counts.set(base, (counts.get(base) ?? 0) + 1)
  }
  return choice => labelChoice(choice, counts.get(representativeLabel(choice)) ?? 0)
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
  return buildChoiceLabeler(peers)(choice)
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
type PunctHidEntry = { symbol: string; rank: number }
type ShiftAliasEntry = { base: string; symbol: string; rank: number }

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

const PUNCT_HID_BY_NAME = new Map<string, PunctHidEntry>(
  PUNCT_HID_MARKS.flatMap((mark, rank) =>
    mark.names.map(name => [name, { symbol: mark.symbol, rank }] as const)
  )
)

const US_SHIFT_BY_NAME = new Map<string, ShiftAliasEntry>(
  US_SHIFT_ALIASES.flatMap((alias, rank) =>
    alias.names.map(
      name => [name, { base: alias.base, symbol: alias.symbol, rank }] as const
    )
  )
)

function choiceNames(choice: CatalogChoice): string[] {
  const aliases = Array.isArray(choice.aliases)
    ? choice.aliases.map(alias => String(alias).toUpperCase())
    : []
  const code = String(choice.code ?? '').toUpperCase()
  return code ? [code, ...aliases.filter(name => name !== code)] : aliases
}

function firstNamedEntry<T>(
  names: string[],
  index: Map<string, T>
): T | null {
  for (const name of names) {
    const entry = index.get(name)
    if (entry) return entry
  }
  return null
}

export function punctHidMark(
  choice: CatalogChoice
): { symbol: string; rank: number } | null {
  return firstNamedEntry(choiceNames(choice), PUNCT_HID_BY_NAME)
}

export function usShiftAlias(
  choice: CatalogChoice
): { base: string; symbol: string; rank: number } | null {
  return firstNamedEntry(choiceNames(choice), US_SHIFT_BY_NAME)
}
