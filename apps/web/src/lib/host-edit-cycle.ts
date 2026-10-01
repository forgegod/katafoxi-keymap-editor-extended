import {
  hostLegendColumns,
  type HostLanguageId,
  type HostLegendView
} from '@keymap-editor/keymap-core'

/** AltGr and AltGr+Shift — the usual host-symbol edit path. */
export const HOST_EDIT_CYCLE_LEVELS = [2, 3] as const

export type HostEditCycleTarget = {
  language: HostLanguageId
  zmk: string
  level: number
}

/**
 * Shown languages for the decode card, extras first then the base column.
 * Matches the bilingual flow: fill the stacked language, then English.
 */
export function hostEditCycleLanguages(view: HostLegendView): HostLanguageId[] {
  const shown = hostLegendColumns(view)
    .filter(column => column.shown)
    .map(column => column.language)
  if (shown.length <= 1) return shown
  const [base, ...extras] = shown
  return [...extras, base]
}

/** Flat walk: level 2 across languages, then level 3 across languages. */
export function hostEditCycleTargets(
  zmk: string,
  view: HostLegendView
): HostEditCycleTarget[] {
  const languages = hostEditCycleLanguages(view)
  const targets: HostEditCycleTarget[] = []
  for (const level of HOST_EDIT_CYCLE_LEVELS) {
    for (const language of languages) {
      targets.push({ language, zmk, level })
    }
  }
  return targets
}

export function defaultHostEditTarget(
  zmk: string,
  view: HostLegendView
): HostEditCycleTarget | null {
  return hostEditCycleTargets(zmk, view)[0] ?? null
}

/**
 * Step within the AltGr cycle. Stays on the first/last cell at the ends.
 * Unknown current cells (e.g. L0 after a manual click) enter at the nearest
 * forward/backward neighbor in the cycle.
 */
export function stepHostEditTarget(
  current: HostEditCycleTarget,
  view: HostLegendView,
  delta: number
): HostEditCycleTarget {
  const targets = hostEditCycleTargets(current.zmk, view)
  if (targets.length === 0) return current
  const index = targets.findIndex(
    item => item.language === current.language && item.level === current.level
  )
  if (index < 0) {
    if (delta > 0) return targets[0]!
    return targets[targets.length - 1]!
  }
  const next = Math.max(0, Math.min(targets.length - 1, index + delta))
  return targets[next]!
}
