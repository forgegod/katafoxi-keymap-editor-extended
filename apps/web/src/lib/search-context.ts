import { getBehaviorCatalog } from '@keymap-editor/keymap-core'
import type { Definitions, SearchContextValue } from './context'

export function buildSearchContext(
  definitions: Definitions | null,
  layers: Array<{ code: number; symbol: string; description: string }>
): SearchContextValue {
  const sources = {
    code: (definitions?.keycodes.byCode ?? {}) as Record<string, unknown>,
    mod: Object.fromEntries(
      (definitions?.keycodes.list ?? [])
        .filter(k => k.isModifier)
        .map(k => [k.code, k])
    ) as Record<string, unknown>,
    behaviours: { ...(definitions?.behaviours.byCode ?? {}) } as Record<
      string,
      unknown
    >,
    layer: Object.fromEntries(layers.map(l => [l.code, l])) as Record<
      string,
      unknown
    >
  }

  const targets = {
    behaviour: definitions?.behaviours.list ?? [],
    layer: layers,
    mod: (definitions?.keycodes.list ?? []).filter(k => k.isModifier),
    code: definitions?.keycodes.list ?? []
  }

  return {
    sources,
    getSearchTargets: (param: unknown, behaviour: string | number) => {
      if (param && typeof param === 'object' && 'enum' in (param as object)) {
        return ((param as { enum: string[] }).enum || []).map(v => ({
          code: v
        }))
      }
      if (param === 'command') {
        const key = String(behaviour)
        const beh = sources.behaviours?.[key] as
          | { commands?: unknown[] }
          | undefined
        return (
          beh?.commands ??
          getBehaviorCatalog().byCode[key]?.commands ??
          []
        )
      }
      return (targets as Record<string, unknown[]>)[param as string] ?? []
    }
  }
}
