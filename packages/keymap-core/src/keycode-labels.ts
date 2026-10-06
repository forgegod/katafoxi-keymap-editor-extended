import {
  choiceHasParams,
  isModifierKey,
  isModifierWrap,
  type CatalogChoice
} from './catalog-choices.js'
import {
  choiceKeycodeOs,
  formatKeycodeOsTooltip
} from './keycode-os.js'
import {
  modifierHoldForKey,
  modifierHoldLegend,
  modifierSide
} from './modifiers.js'

/** Keypad chips use the legend glyph; the `.keypad` wash disambiguates from Keyboard. */
const KEYPAD_GLYPH_LABELS = new Map<string, string>([
  ['KP_N0', '0'],
  ['KP_NUMBER_0', '0'],
  ['KP_N1', '1'],
  ['KP_NUMBER_1', '1'],
  ['KP_N2', '2'],
  ['KP_NUMBER_2', '2'],
  ['KP_N3', '3'],
  ['KP_NUMBER_3', '3'],
  ['KP_N4', '4'],
  ['KP_NUMBER_4', '4'],
  ['KP_N5', '5'],
  ['KP_NUMBER_5', '5'],
  ['KP_N6', '6'],
  ['KP_NUMBER_6', '6'],
  ['KP_N7', '7'],
  ['KP_NUMBER_7', '7'],
  ['KP_N8', '8'],
  ['KP_NUMBER_8', '8'],
  ['KP_N9', '9'],
  ['KP_NUMBER_9', '9'],
  ['KP_MINUS', '-'],
  ['KP_SUBTRACT', '-'],
  ['KP_DOT', '.'],
  ['KP_PLUS', '+'],
  ['KP_EQUAL', '='],
  ['KP_SLASH', '/'],
  ['KP_DIVIDE', '/'],
  ['KP_ASTERISK', '*'],
  ['KP_MULTIPLY', '*'],
  ['KP_ENTER', '⮐'],
  ['KP_COMMA', ','],
  ['KP_LPAR', '('],
  ['KP_LEFT_PARENTHESIS', '('],
  ['KP_RPAR', ')'],
  ['KP_RIGHT_PARENTHESIS', ')'],
  ['KP_NUM', 'NUM'],
  ['KP_NUMLOCK', 'NUM'],
  ['KP_NLCK', 'NUM']
])

/** Compact keypad legend shared by edit_key chips and keycap text. */
function normalizeKeycodeName(code?: string | number | null): string {
  return String(code ?? '')
    .trim()
    .toUpperCase()
    .replace(/^KC_/, '')
}

export function keypadGlyphLabel(code?: string | number | null): string | null {
  return KEYPAD_GLYPH_LABELS.get(normalizeKeycodeName(code)) ?? null
}

function keypadCompactPunctLabel(choice: CatalogChoice): string | null {
  return keypadGlyphLabel(choice.code)
}

export function isKeypadCompactPunct(choice: CatalogChoice): boolean {
  return keypadCompactPunctLabel(choice) != null
}

/**
 * Short chip text for keyboard media / scroll / edit-action codes.
 * Full ZMK names stay in tooltips (`K_MUTE2 — Mute`, `K_COPY — Copy`).
 */
const KEYBOARD_CHIP_SHORT = new Map<string, string>([
  ['K_SCROLL_UP', 'SCROLL_UP'],
  ['K_SCROLL_DOWN', 'SCROLL_DN'],
  ['K_MUTE', 'MUTE'],
  ['K_MUTE2', 'MUTE2'],
  ['K_VOL_UP', 'VOL_UP'],
  ['K_VOLUME_UP', 'VOL_UP'],
  ['K_VOL_DN', 'VOL_DN'],
  ['K_VOLUME_DOWN', 'VOL_DN'],
  ['K_VOL_UP2', 'VOL_UP2'],
  ['K_VOLUME_UP2', 'VOL_UP2'],
  ['K_VOL_DN2', 'VOL_DN2'],
  ['K_VOLUME_DOWN2', 'VOL_DN2'],
  // Toolbar-familiar edit actions (chip only — not keycap legend symbols).
  ['K_CUT', '✂'],
  ['K_COPY', '⧉'],
  ['K_PASTE', '📋'],
  ['K_UNDO', '↶'],
  ['K_REDO', '↷'],
  ['K_AGAIN', '↷'],
  ['K_FIND', '🔍'],
  // Rare keypad dump — keep readable without sitting next to KP_EQUAL.
  ['KP_EQUAL_AS400', 'AS400=']
])

function keyboardChipShortLabel(choice: CatalogChoice): string | null {
  const code = String(choice.code ?? '').toUpperCase()
  return KEYBOARD_CHIP_SHORT.get(code) ?? null
}

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
  const compact = keypadCompactPunctLabel(choice)
  if (compact) return compact
  const short = keyboardChipShortLabel(choice)
  if (short) return short
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
  const head = shift
    ? `${shown} — LS(${shift.base})`
    : (() => {
        const detail = String(choice.description ?? choice.name ?? '').trim()
        if (shown && detail && detail !== code && detail !== shown) {
          return `${shown} — ${detail}`
        }
        return detail || shown
      })()
  const os = choiceKeycodeOs(choice)
  const osLine = os ? formatKeycodeOsTooltip(os) : null
  return osLine ? `${head}\n${osLine}` : head
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

/**
 * Single-glyph legend for HID punctuation (`MINUS` → `-`) and US shift
 * aliases (`PRCNT` → `%`, `HASH` → `#`). Number-row bases (`N5`) stay out —
 * those keep the catalog digit until a host compose column replaces them.
 */
export function keycodeGlyphLabel(code?: string | number | null): string | null {
  const upper = normalizeKeycodeName(code)
  if (!upper) return null
  return (
    PUNCT_HID_BY_NAME.get(upper)?.symbol ??
    US_SHIFT_BY_NAME.get(upper)?.symbol ??
    null
  )
}

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
