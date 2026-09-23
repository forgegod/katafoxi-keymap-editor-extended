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

/** `CODE — description` for native tooltips. */
export function catalogChoiceTooltip(choice: CatalogChoice): string {
  const code = String(choice.code ?? '').trim()
  const detail = String(choice.description ?? choice.name ?? '').trim()
  if (code && detail && detail !== code) return `${code} — ${detail}`
  return detail || code
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

/** Glyph or shortest code used to sort and label a choice. */
export function representativeLabel(choice: CatalogChoice): string {
  const symbol = choice.symbol == null ? '' : String(choice.symbol).trim()
  if (symbol) return symbol
  return String(choice.code ?? '')
}

function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
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

/**
 * `&kp` tap codes already placed on this layer. Used as a soft hint
 * (dim repeats); other behaviours are ignored.
 */
export function collectUsedKeycodesOnLayer(
  layer: KeyBindingNode[] | undefined
): Set<string> {
  const used = new Set<string>()
  for (const bind of layer ?? []) {
    if (String(bind.value) !== '&kp') continue
    const code = bind.params?.[0]?.value
    if (code == null || String(code) === '') continue
    used.add(String(code))
  }
  return used
}
