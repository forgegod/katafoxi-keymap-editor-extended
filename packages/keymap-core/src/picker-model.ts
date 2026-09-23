import type { KeyBindingNode } from './types.js'

/** Catalog or picker row that can be grouped for the key editor grid. */
export interface CatalogChoice {
  code?: string | number
  description?: string
  context?: string
  symbol?: string
  [key: string]: unknown
}

export interface ChoiceGroup {
  context: string
  items: CatalogChoice[]
}

const CONTEXT_PRIORITY = ['Keyboard', 'Keypad']

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
