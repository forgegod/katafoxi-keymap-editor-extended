import type { CatalogChoice } from './catalog-choices.js'
import { compareLabels, representativeLabel } from './keycode-labels.js'

export interface ChoiceGroup {
  context: string
  items: CatalogChoice[]
}

const CONTEXT_PRIORITY = ['Keyboard', 'Keypad']

/** Home view for keycode taxonomy chips. */
export const DEFAULT_TAXONOMY_CONTEXTS = ['Keyboard', 'Keypad'] as const

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
