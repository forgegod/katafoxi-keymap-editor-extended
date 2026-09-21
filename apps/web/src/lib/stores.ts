import { writable } from 'svelte/store'
import type { Definitions, SearchContextValue } from './context'

export const definitionsStore = writable<Definitions | null>(null)
export const searchStore = writable<SearchContextValue | null>(null)
