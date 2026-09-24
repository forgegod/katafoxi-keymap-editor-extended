import type { KeyBindingNode } from './types.js'

/** Catalog or picker row that can be grouped for the key editor grid. */
export interface CatalogChoice {
  code?: string | number
  description?: string
  name?: string
  context?: string
  symbol?: string
  params?: unknown[]
  [key: string]: unknown
}

export interface ChoiceGroup {
  context: string
  items: CatalogChoice[]
}

const CONTEXT_PRIORITY = ['Keyboard', 'Keypad']

/** Home view for keycode taxonomy chips. */
export const DEFAULT_TAXONOMY_CONTEXTS = ['Keyboard', 'Keypad'] as const

/**
 * Role order for the behaviour row: key input, layers, device, then
 * parameterless bindings. Unknown codes follow the same buckets.
 */
export const BEHAVIOR_ROLE_ORDER = [
  '&kp',
  '&mkp',
  '&msc',
  '&mmv',
  '&mt',
  '&lt',
  '&sk',
  '&mo',
  '&to',
  '&tog',
  '&sl',
  '&bt',
  '&out',
  '&rgb_ug',
  '&bl',
  '&ext_power',
  '&trans',
  '&none',
  '&caps_word',
  '&key_repeat',
  '&reset',
  '&bootloader'
] as const

export function isInstantBehavior(choice: {
  params?: unknown[]
}): boolean {
  return !Array.isArray(choice.params) || choice.params.length === 0
}

/** Mouse-emulation bindings that need firmware pointing support. */
export const POINTING_BEHAVIORS = ['&mkp', '&msc', '&mmv'] as const

export function isPointingBehavior(code: string | number | undefined | null): boolean {
  return (POINTING_BEHAVIORS as readonly string[]).includes(String(code))
}

/**
 * Firmware/Kconfig reminder for a behaviour. Pointing is off by default;
 * the editor only injects the keymap include, not `*.conf`.
 */
export function behaviorFirmwareNote(
  code: string | number | undefined | null
): string | null {
  if (!isPointingBehavior(code)) return null
  return 'Firmware: CONFIG_ZMK_POINTING=y in the keyboard .conf. This editor only adds #include <dt-bindings/zmk/pointing.h> to the keymap.'
}

export function sortBehaviorsByRole<T extends { code?: string | number; params?: unknown[] }>(
  list: T[]
): T[] {
  return [...list].sort((a, b) => {
    const ia = BEHAVIOR_ROLE_ORDER.indexOf(String(a.code) as (typeof BEHAVIOR_ROLE_ORDER)[number])
    const ib = BEHAVIOR_ROLE_ORDER.indexOf(String(b.code) as (typeof BEHAVIOR_ROLE_ORDER)[number])
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    const aInstant = isInstantBehavior(a)
    const bInstant = isInstantBehavior(b)
    if (aInstant !== bInstant) return aInstant ? 1 : -1
    return String(a.code ?? '').localeCompare(String(b.code ?? ''))
  })
}

function hasParams(choice: CatalogChoice): boolean {
  return Array.isArray(choice.params) && choice.params.length > 0
}

function modifierSide(code: string): 'L' | 'R' | '' {
  if (/^R(IGHT)?([A-Z_]|$)/i.test(code) || /^(RCMD|RALT|RCTRL|RGUI|RWIN|RMETA|RSHIFT|RSHFT)$/i.test(code)) {
    return 'R'
  }
  if (/^L(EFT)?([A-Z_]|$)/i.test(code) || /^(LCMD|LALT|LCTRL|LGUI|LWIN|LMETA|LSHIFT|LSHFT)$/i.test(code)) {
    return 'L'
  }
  return ''
}

/** `CODE — description` for native tooltips. Shifted US names name the LS() wrap. */
export function catalogChoiceTooltip(choice: CatalogChoice): string {
  const code = String(choice.code ?? '').trim()
  const shown = hasParams(choice) ? `${code}(${choice.params!.join(',')})` : code
  const shift = usShiftAlias(choice)
  if (shift) return `${shown} — LS(${shift.base})`
  const detail = String(choice.description ?? choice.name ?? '').trim()
  if (shown && detail && detail !== code && detail !== shown) return `${shown} — ${detail}`
  return detail || shown
}

/**
 * Keyboard+Keypad unless the current value lives in another HID group.
 */
export function initialTaxonomyContexts(
  groups: ChoiceGroup[],
  currentCode?: string | number
): string[] {
  const available = new Set(groups.map(group => group.context))
  const defaults = DEFAULT_TAXONOMY_CONTEXTS.filter(context =>
    available.has(context)
  )
  if (currentCode == null || String(currentCode) === '') {
    return defaults.length > 0 ? defaults : groups.map(group => group.context)
  }

  const current = String(currentCode)
  const home = groups.find(group =>
    group.items.some(item => String(item.code) === current)
  )
  if (!home || defaults.includes(home.context as (typeof DEFAULT_TAXONOMY_CONTEXTS)[number])) {
    return defaults.length > 0 ? defaults : groups.map(group => group.context)
  }
  return [home.context]
}

/** Keyboard/Keypad restore the home pair; other chips replace the view. */
export function nextTaxonomyContexts(
  groups: ChoiceGroup[],
  clicked: string
): string[] {
  const available = new Set(groups.map(group => group.context))
  if (
    (DEFAULT_TAXONOMY_CONTEXTS as readonly string[]).includes(clicked) &&
    available.has(clicked)
  ) {
    const home = DEFAULT_TAXONOMY_CONTEXTS.filter(context => available.has(context))
    return home.length > 0 ? [...home] : [clicked]
  }
  return available.has(clicked) ? [clicked] : initialTaxonomyContexts(groups)
}

/**
 * One chip per alias family. Modifier wrappers (`LC`) stay distinct
 * from the modifier key itself (`LCTRL`).
 */
export function uniqueCatalogChoices(choices: CatalogChoice[]): CatalogChoice[] {
  const seen = new Set<string>()
  const unique: CatalogChoice[] = []
  for (const choice of choices) {
    const aliases = Array.isArray(choice.aliases)
      ? choice.aliases.map(String)
      : []
    const params = Array.isArray(choice.params)
      ? choice.params.map(String).join(',')
      : ''
    const modifier = choice.isModifier ? '1' : '0'
    const key = aliases.length
      ? `${[...aliases].sort().join('|')}#${params}#${modifier}`
      : `code:${String(choice.code ?? '')}#${params}#${modifier}`
    if (seen.has(key)) continue
    seen.add(key)
    const code =
      aliases.length && !params
        ? [...aliases].sort((a, b) => a.length - b.length || a.localeCompare(b))[0]
        : choice.code
    unique.push({ ...choice, code })
  }
  return unique
}

/** Codes that name the same catalog chip (`RET` / `ENTER` / `RETURN`). */
export function choiceAliasKeys(choice: CatalogChoice): string[] {
  const keys = new Set<string>()
  if (choice.code != null && choice.code !== '') keys.add(String(choice.code))
  if (Array.isArray(choice.aliases)) {
    for (const alias of choice.aliases) {
      if (alias != null && alias !== '') keys.add(String(alias))
    }
  }
  return [...keys]
}

export function choiceMatchesCode(
  choice: CatalogChoice,
  code: string | number | undefined | null
): boolean {
  if (code == null || code === '') return false
  return choiceAliasKeys(choice).includes(String(code))
}

/** Layer indexes where this chip (or any of its aliases) is already bound. */
export function usedLayersForChoice(
  choice: CatalogChoice,
  used: ReadonlyMap<string, readonly number[]>
): number[] {
  const seen = new Set<number>()
  const layers: number[] = []
  for (const key of choiceAliasKeys(choice)) {
    for (const layer of used.get(key) ?? []) {
      if (seen.has(layer)) continue
      seen.add(layer)
      layers.push(layer)
    }
  }
  return layers
}

/** Glyph or shortest code used to sort and label a choice. */
export function representativeLabel(choice: CatalogChoice): string {
  if (hasParams(choice)) return String(choice.code ?? '')
  const symbol = choice.symbol == null ? '' : String(choice.symbol).trim()
  if (symbol) return symbol
  return String(choice.code ?? '')
}

/**
 * Same as `representativeLabel`, but L/R modifier keys that share a glyph
 * become `L⌘` / `R⌘`, extras drop the redundant `K_` prefix, US shift
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
  const base = representativeLabel(choice)
  if (!base) return stripExtrasChipPrefix(code)
  const collisions = peers.filter(peer => representativeLabel(peer) === base)
  if (collisions.length <= 1) return stripExtrasChipPrefix(code, base)
  const side = modifierSide(code)
  if (side && base.length === 1) return `${side}${base}`
  return stripExtrasChipPrefix(code)
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

function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

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

const MOD_WRAP_RE = /^(L|R)(C|S|A|G)$/i
const MOD_KEY_RE =
  /^(L|R)(CTRL|CONTROL|SHIFT|SHFT|ALT|CMD|GUI|WIN|META)$/i
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

export function isModifierWrap(choice: CatalogChoice): boolean {
  return hasParams(choice) && MOD_WRAP_RE.test(String(choice.code ?? ''))
}

export function isModifierKey(choice: CatalogChoice): boolean {
  if (hasParams(choice)) return false
  if (choice.isModifier) return true
  return MOD_KEY_RE.test(String(choice.code ?? ''))
}

export type ModifierRole = 'ctrl' | 'shift' | 'alt' | 'gui'

export interface ModifierHold {
  wrap: string
  key: string
  role: ModifierRole
  side: 'L' | 'R'
}

/** Hold-bar order: left then right, Shift → Ctrl → Alt → GUI. */
export const MODIFIER_HOLDS: ModifierHold[] = [
  { wrap: 'LS', key: 'LSHFT', role: 'shift', side: 'L' },
  { wrap: 'LC', key: 'LCTRL', role: 'ctrl', side: 'L' },
  { wrap: 'LA', key: 'LALT', role: 'alt', side: 'L' },
  { wrap: 'LG', key: 'LCMD', role: 'gui', side: 'L' },
  { wrap: 'RS', key: 'RSHFT', role: 'shift', side: 'R' },
  { wrap: 'RC', key: 'RCTRL', role: 'ctrl', side: 'R' },
  { wrap: 'RA', key: 'RALT', role: 'alt', side: 'R' },
  { wrap: 'RG', key: 'RCMD', role: 'gui', side: 'R' }
]

const HOLD_BY_WRAP = new Map(
  MODIFIER_HOLDS.map(hold => [hold.wrap, hold] as const)
)
const HOLD_BY_KEY = new Map(MODIFIER_HOLDS.map(hold => [hold.key, hold] as const))

/** Outer-first nest: LC(LS(A)) — Ctrl, then Shift, Alt, GUI. */
const OUTER_ROLE_ORDER: Record<ModifierRole, number> = {
  ctrl: 0,
  shift: 1,
  alt: 2,
  gui: 3
}

export function isModifierWrapCode(
  code: string | number | undefined | null
): boolean {
  return MOD_WRAP_RE.test(String(code ?? ''))
}

export function modifierHoldForWrap(
  wrap: string | number | undefined
): ModifierHold | undefined {
  return HOLD_BY_WRAP.get(String(wrap ?? '').toUpperCase())
}

export function modifierHoldForKey(
  key: string | number | undefined
): ModifierHold | undefined {
  const code = String(key ?? '').toUpperCase()
  const exact = HOLD_BY_KEY.get(code)
  if (exact) return exact
  if (code === 'LSHIFT' || code === 'LEFT_SHIFT') return HOLD_BY_KEY.get('LSHFT')
  if (code === 'RSHIFT' || code === 'RIGHT_SHIFT') return HOLD_BY_KEY.get('RSHFT')
  if (code === 'LCONTROL' || code === 'LEFT_CONTROL') return HOLD_BY_KEY.get('LCTRL')
  if (code === 'RCONTROL' || code === 'RIGHT_CONTROL') return HOLD_BY_KEY.get('RCTRL')
  if (code === 'LGUI' || code === 'LWIN' || code === 'LMETA') return HOLD_BY_KEY.get('LCMD')
  if (code === 'RGUI' || code === 'RWIN' || code === 'RMETA') return HOLD_BY_KEY.get('RCMD')
  return undefined
}

export function sortModifierWraps(wraps: Iterable<string>): string[] {
  return [...wraps].sort((a, b) => {
    const ha = modifierHoldForWrap(a)
    const hb = modifierHoldForWrap(b)
    const ra = ha ? OUTER_ROLE_ORDER[ha.role] : 99
    const rb = hb ? OUTER_ROLE_ORDER[hb.role] : 99
    if (ra !== rb) return ra - rb
    return (ha?.side === 'R' ? 1 : 0) - (hb?.side === 'R' ? 1 : 0)
  })
}

/** One wrap per role; last side wins. */
export function normalizeModifierWraps(wraps: Iterable<string>): string[] {
  const byRole = new Map<ModifierRole, string>()
  for (const wrap of wraps) {
    const hold = modifierHoldForWrap(wrap)
    if (hold) byRole.set(hold.role, hold.wrap)
  }
  return sortModifierWraps(byRole.values())
}

export function canApplyModifierHold(
  wrapCode: string,
  terminal?: string | number
): boolean {
  const wrapHold = modifierHoldForWrap(wrapCode)
  const keyHold = modifierHoldForKey(terminal)
  if (!wrapHold || !keyHold) return true
  return wrapHold.role !== keyHold.role
}

export function wrapsCompatibleWithTerminal(
  wraps: Iterable<string>,
  terminal?: string | number
): string[] {
  const normalized = normalizeModifierWraps(wraps)
  const keyHold = modifierHoldForKey(terminal)
  if (!keyHold) return normalized
  return normalized.filter(wrap => modifierHoldForWrap(wrap)?.role !== keyHold.role)
}

export function toggleModifierWraps(
  wraps: Iterable<string>,
  wrapCode: string,
  terminal?: string | number
): string[] {
  const hold = modifierHoldForWrap(wrapCode)
  if (!hold) return wrapsCompatibleWithTerminal(wraps, terminal)
  const current = wrapsCompatibleWithTerminal(wraps, terminal)
  if (current.includes(hold.wrap)) {
    return current.filter(wrap => wrap !== hold.wrap)
  }
  if (!canApplyModifierHold(wrapCode, terminal)) return current
  return wrapsCompatibleWithTerminal([...current, hold.wrap], terminal)
}

export interface ModifierChainNode {
  value?: string | number
  params?: ModifierChainNode[]
}

export function readModifierChain<T extends ModifierChainNode>(
  node: T | undefined
): { wraps: string[]; terminal: T | undefined } {
  const wraps: string[] = []
  let current = node
  while (current && isModifierWrapCode(current.value)) {
    wraps.push(String(current.value).toUpperCase())
    current = (current.params?.[0] as T | undefined) ?? undefined
  }
  return { wraps: normalizeModifierWraps(wraps), terminal: current }
}

export function writeModifierChain<T extends ModifierChainNode>(
  wraps: Iterable<string>,
  terminal: T | undefined,
  makeNode: (value: string | number | undefined, params: T[]) => T
): T {
  const ordered = wrapsCompatibleWithTerminal(wraps, terminal?.value)
  let node = terminal ?? makeNode(undefined, [])
  for (let i = ordered.length - 1; i >= 0; i--) {
    node = makeNode(ordered[i], [node])
  }
  return node
}

/** Keys and glyphs only — modifier wrappers stay off the value grid. */
export function catalogKeyChoices(choices: CatalogChoice[]): CatalogChoice[] {
  return uniqueCatalogChoices(choices).filter(choice => !isModifierWrap(choice))
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

/** Editing / navigation cluster — not punctuation. */
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
  'DOWN_ARROW'
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
  'DOWN_ARROW'
]

const ARROW_GLYPHS = new Set(['⏴', '⏵', '⏶', '⏷', '←', '→', '↑', '↓', '◀', '▶', '▲', '▼'])

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
  return [...items].sort((a, b) => {
    if (kind === 'function') {
      const byNum = functionKeyNumber(a) - functionKeyNumber(b)
      if (byNum !== 0) return byNum
    }
    if (kind === 'modkeys' || kind === 'modwraps') {
      return compareModifiers(a, b)
    }
    if (kind === 'digits') {
      const byNum =
        Number(representativeLabel(a).replace(/\D/g, '')) -
        Number(representativeLabel(b).replace(/\D/g, ''))
      if (byNum !== 0) return byNum
    }
    if (kind === 'nav') {
      const byNav = navRank(a) - navRank(b)
      if (byNav !== 0) return byNav
    }
    if (kind === 'punct') {
      const byHid = (punctHidMark(a)?.rank ?? 80) - (punctHidMark(b)?.rank ?? 80)
      if (byHid !== 0) return byHid
    }
    if (kind === 'shifted') {
      const byShift = (usShiftAlias(a)?.rank ?? 80) - (usShiftAlias(b)?.rank ?? 80)
      if (byShift !== 0) return byShift
    }
    const keyA = kind === 'codes' ? String(a.code ?? '') : representativeLabel(a)
    const keyB = kind === 'codes' ? String(b.code ?? '') : representativeLabel(b)
    const byLabel = compareLabels(keyA, keyB)
    if (byLabel !== 0) return byLabel
    return compareLabels(String(a.code ?? ''), String(b.code ?? ''))
  })
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

/**
 * Group picker choices by catalog context and sort each group by
 * representative label (then code). Keyboard / Keypad stay first.
 */
export function groupChoicesByContext(choices: CatalogChoice[]): ChoiceGroup[] {
  const groups = new Map<string, CatalogChoice[]>()
  for (const choice of choices) {
    const context = String(choice.context ?? '').trim() || 'Other'
    const list = groups.get(context)
    if (list) list.push(choice)
    else groups.set(context, [choice])
  }

  const ordered = [...groups.entries()].map(([context, items]) => ({
    context,
    items: [...items].sort((a, b) => {
      const byLabel = compareLabels(representativeLabel(a), representativeLabel(b))
      if (byLabel !== 0) return byLabel
      return compareLabels(String(a.code ?? ''), String(b.code ?? ''))
    })
  }))

  ordered.sort((a, b) => {
    const ia = CONTEXT_PRIORITY.indexOf(a.context)
    const ib = CONTEXT_PRIORITY.indexOf(b.context)
    if (ia !== -1 || ib !== -1) {
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    }
    if (a.context === 'Other') return 1
    if (b.context === 'Other') return -1
    return a.context.localeCompare(b.context)
  })

  return ordered
}

/** Param index of the tap keycode. Layer indexes are not keys. */
const TAP_CODE_PARAM: Record<string, number> = {
  '&kp': 0,
  '&sk': 0,
  '&mt': 1,
  '&lt': 1
}

/** Command token already placed on a key (`&mkp LCLK`), dimmed like a used keycode. */
const COMMAND_CODE_PARAM: Record<string, number> = {
  '&mkp': 0,
  '&msc': 0,
  '&mmv': 0,
  '&bt': 0,
  '&out': 0,
  '&bl': 0,
  '&rgb_ug': 0,
  '&ext_power': 0
}

/** Modifier key sitting on `&mt`, so a hold-only modifier still counts as placed. */
const MOD_CODE_PARAM: Record<string, number> = {
  '&mt': 0
}

function placedKeycode(node: KeyBindingNode | undefined): string | null {
  if (!node) return null
  const { terminal } = readModifierChain(node)
  const value = terminal?.value
  if (value == null || String(value) === '') return null
  if (isModifierWrapCode(value)) return null
  return String(value)
}

function rememberKeycode(found: Map<string, number[]>, code: string | null, layer: number) {
  if (!code) return
  const list = found.get(code)
  if (!list) found.set(code, [layer])
  else if (list[list.length - 1] !== layer) list.push(layer)
}

/**
 * Keycodes placed anywhere in the keymap, keyed to layer indexes.
 * Counts the tap of `&kp`, `&sk`, `&mt`, and `&lt`, the modifier of `&mt`,
 * and command tokens (`&mkp LCLK`, `&msc SCRL_UP`). `LS(CAPS)` and `LC(C)`
 * contribute the terminal key. Each layer index is listed once, in order.
 */
export function collectUsedKeycodes(
  layers: ReadonlyArray<readonly KeyBindingNode[] | undefined>
): Map<string, number[]> {
  const found = new Map<string, number[]>()
  layers.forEach((layer, index) => {
    for (const bind of layer ?? []) {
      const behavior = String(bind.value)
      const tapIndex = TAP_CODE_PARAM[behavior] ?? COMMAND_CODE_PARAM[behavior]
      if (tapIndex == null) continue
      rememberKeycode(found, placedKeycode(bind.params?.[tapIndex]), index)
      const modIndex = MOD_CODE_PARAM[behavior]
      if (modIndex != null) {
        rememberKeycode(found, placedKeycode(bind.params?.[modIndex]), index)
      }
    }
  })
  return found
}

/**
 * Keycodes already placed on this layer. Same rules as {@link collectUsedKeycodes}.
 */
export function collectUsedKeycodesOnLayer(
  layer: KeyBindingNode[] | undefined
): Set<string> {
  return new Set(collectUsedKeycodes([layer]).keys())
}
