import type { CatalogChoice } from './catalog-choices.js'
import { compareLabels, representativeLabel } from './keycode-labels.js'

export interface ChoiceGroup {
  context: string
  items: CatalogChoice[]
}

/** One taxonomy tab; home merges Keyboard + Keypad into a single chip. */
export interface TaxonomyChip {
  id: string
  label: string
  contexts: readonly string[]
}

const CONTEXT_PRIORITY = ['Keyboard', 'Keypad']

/** Catalog contexts that make up the home board view. */
const DEFAULT_TAXONOMY_CONTEXTS = ['Keyboard', 'Keypad'] as const

export const HOME_TAXONOMY_CHIP_ID = 'Keyboard+Keypad'

function availableHomeContexts(groups: ChoiceGroup[]): string[] {
  const available = new Set(groups.map(group => group.context))
  return DEFAULT_TAXONOMY_CONTEXTS.filter(context => available.has(context))
}

/**
 * Keyboard+Keypad unless the current value lives in another HID group.
 */
export function initialTaxonomyContexts(
  groups: ChoiceGroup[],
  currentCode?: string | number
): string[] {
  const defaults = availableHomeContexts(groups)
  if (currentCode == null || String(currentCode) === '') {
    return defaults.length > 0 ? defaults : groups.map(group => group.context)
  }

  const current = String(currentCode)
  const home = groups.find(group =>
    group.items.some(item => String(item.code) === current)
  )
  if (
    !home ||
    (DEFAULT_TAXONOMY_CONTEXTS as readonly string[]).includes(home.context)
  ) {
    return defaults.length > 0 ? defaults : groups.map(group => group.context)
  }
  return [home.context]
}

/** Home chip restores Keyboard+Keypad; other chips replace the view. */
export function nextTaxonomyContexts(
  groups: ChoiceGroup[],
  clicked: string
): string[] {
  const chip = buildTaxonomyChips(groups).find(entry => entry.id === clicked)
  if (chip) return [...chip.contexts]
  const available = new Set(groups.map(group => group.context))
  return available.has(clicked) ? [clicked] : initialTaxonomyContexts(groups)
}

/** Tabs for the Value row: one home chip, then each remaining HID context. */
export function buildTaxonomyChips(groups: ChoiceGroup[]): TaxonomyChip[] {
  const visible = groups.filter(
    group => group.context !== 'Other' || groups.length === 1
  )
  const homeContexts = availableHomeContexts(visible)
  const chips: TaxonomyChip[] = []
  if (homeContexts.length > 0) {
    chips.push({
      id: HOME_TAXONOMY_CHIP_ID,
      label:
        homeContexts.length > 1 ? HOME_TAXONOMY_CHIP_ID : homeContexts[0]!,
      contexts: homeContexts
    })
  }
  for (const group of visible) {
    if ((DEFAULT_TAXONOMY_CONTEXTS as readonly string[]).includes(group.context)) {
      continue
    }
    chips.push({
      id: group.context,
      label: group.context,
      contexts: [group.context]
    })
  }
  return chips
}

export function taxonomyChipIsActive(
  chip: TaxonomyChip,
  activeContexts: readonly string[]
): boolean {
  if (chip.contexts.length !== activeContexts.length) return false
  return chip.contexts.every(context => activeContexts.includes(context))
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
