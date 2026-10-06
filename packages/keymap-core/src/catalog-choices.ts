import { MOD_KEY_RE, MOD_WRAP_RE } from './modifiers.js'

/** Catalog or picker row that can be grouped for the key editor grid. */
export interface CatalogChoice {
  code?: string | number
  description?: string
  name?: string
  context?: string
  symbol?: string
  params?: unknown[]
  aliases?: Array<string | number>
  isModifier?: boolean
  faIcon?: string
  additionalParams?: unknown[]
  holdTap?: boolean
  tappingTermMs?: number
  quickTapMs?: number
  requirePriorIdleMs?: number
  flavor?: string
  commands?: CatalogChoice[]
  /** ZMK HID OS table when the binder passed it through. */
  os?: unknown
}

export function choiceHasParams(choice: CatalogChoice): boolean {
  return Array.isArray(choice.params) && choice.params.length > 0
}

export function isModifierWrap(choice: CatalogChoice): boolean {
  return choiceHasParams(choice) && MOD_WRAP_RE.test(String(choice.code ?? ''))
}

export function isModifierKey(choice: CatalogChoice): boolean {
  if (choiceHasParams(choice)) return false
  if (choice.isModifier) return true
  return MOD_KEY_RE.test(String(choice.code ?? ''))
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
function choiceAliasKeys(choice: CatalogChoice): string[] {
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

/** Tooltip suffix: "on layer L3" using current indexes after a layer delete. */
export function formatUsedChoiceTooltip(
  base: string,
  layers: number[],
  layerLabels?: readonly string[]
): string {
  if (!layers.length) return base
  const labels = layers.map(index => layerLabels?.[index] ?? String(index))
  const where = labels.length === 1 ? 'on layer' : 'on layers'
  return `${base}\n${where} ${labels.join(' · ')}`
}

/** Keys and glyphs only — modifier wrappers stay off the value grid. */
export function catalogKeyChoices(choices: CatalogChoice[]): CatalogChoice[] {
  return uniqueCatalogChoices(choices).filter(choice => !isModifierWrap(choice))
}
