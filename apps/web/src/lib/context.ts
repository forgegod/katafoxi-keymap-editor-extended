import { getContext, setContext } from 'svelte'
import type {
  BehaviorCatalog,
  BehaviorDef,
  KeycodeCatalog
} from '@keymap-editor/keymap-core'
import type { LegendMode } from './editor.svelte.js'

const DEFINITIONS_KEY = Symbol('definitions')
const SEARCH_KEY = Symbol('search')

export type { BehaviorDef, LegendMode }

export interface Definitions {
  keycodes: KeycodeCatalog
  behaviours: BehaviorCatalog
}

export interface SearchContextValue {
  getSearchTargets: (param: unknown, behaviour: string | number) => unknown[]
  sources: Record<string, Record<string, unknown>>
}

/** Reactive box so context stays reactive under Svelte 5 runes. */
export interface DefinitionsBox {
  current: Definitions | null
}

export interface SearchBox {
  current: SearchContextValue | null
}

export function setDefinitionsContext(box: DefinitionsBox) {
  setContext(DEFINITIONS_KEY, box)
}

export function getDefinitionsContext(): DefinitionsBox {
  return getContext(DEFINITIONS_KEY)
}

export function setSearchContext(box: SearchBox) {
  setContext(SEARCH_KEY, box)
}

export function getSearchContext(): SearchBox {
  return getContext(SEARCH_KEY)
}
