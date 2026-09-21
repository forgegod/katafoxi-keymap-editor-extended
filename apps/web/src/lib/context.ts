import { getContext, setContext } from 'svelte'
import type { NormalizedKeycode } from '@keymap-editor/keymap-core'

const DEFINITIONS_KEY = Symbol('definitions')
const SEARCH_KEY = Symbol('search')

export interface BehaviorDef {
  code: string
  description?: string
  params?: unknown[]
  commands?: Array<{ code: string; additionalParams?: unknown[]; [key: string]: unknown }>
  [key: string]: unknown
}

export interface Definitions {
  keycodes: NormalizedKeycode[] & { indexed?: Record<string, NormalizedKeycode> }
  behaviours: BehaviorDef[] & { indexed?: Record<string, BehaviorDef> }
}

export interface SearchContextValue {
  getSearchTargets: (param: unknown, behaviour: string | number) => unknown[]
  sources: Record<string, Record<string, unknown>>
}

export function setDefinitionsContext(value: Definitions | null) {
  setContext(DEFINITIONS_KEY, value)
}

export function getDefinitionsContext(): Definitions | null {
  return getContext(DEFINITIONS_KEY)
}

export function setSearchContext(value: SearchContextValue) {
  setContext(SEARCH_KEY, value)
}

export function getSearchContext(): SearchContextValue {
  return getContext(SEARCH_KEY)
}

export type LegendMode = 'zmk' | 'composed'
