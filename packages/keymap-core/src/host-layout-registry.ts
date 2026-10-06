import {
  builtinHostLayoutSpecs,
  catalogLayoutsForLanguage,
  hostLayoutChoices,
  type BuiltinHostLayoutSpec,
  type HostLayoutChoice
} from './host-layout-catalog.js'
import { hostLanguage, type HostLanguageId } from './host-languages.js'
import {
  cloneHostLayoutTable,
  freezeHostLayoutTable,
  hostLayoutFromSymbols,
  type HostKeyLevels,
  type HostLayout
} from './host-layout.js'

export interface HostLayoutMeta {
  id: string
  language: HostLanguageId
  name: string
  flag: string
  origin: 'system' | 'user'
  primary?: boolean
}

interface RegisteredHostLayout {
  meta: HostLayoutMeta
  layout: HostLayout
}

const builtinSpecs = new Map<string, BuiltinHostLayoutSpec>(
  builtinHostLayoutSpecs.map(spec => [spec.id, spec])
)

const parsedBuiltins = new Map<string, HostLayout>()
const registered = new Map<string, RegisteredHostLayout>()

function metaFromSpec(spec: BuiltinHostLayoutSpec): HostLayoutMeta {
  return {
    id: spec.id,
    language: spec.language,
    name: spec.name,
    flag: spec.flag,
    origin: 'system',
    primary: spec.primary
  }
}

function parseBuiltin(spec: BuiltinHostLayoutSpec): HostLayout {
  const cached = parsedBuiltins.get(spec.id)
  if (cached) return cached
  const layout = freezeHostLayoutTable(
    hostLayoutFromSymbols(spec.source, spec.section, spec.id, spec.files)
  )
  parsedBuiltins.set(spec.id, layout)
  return layout
}

/** Parsed layout for a builtin or registered id. Builtins parse on first call. */
export function hostLayout(id: string): HostLayout | undefined {
  const user = registered.get(id)
  if (user) return user.layout
  const spec = builtinSpecs.get(id)
  return spec ? parseBuiltin(spec) : undefined
}

/** Metadata for a builtin or registered id. Does not parse the section. */
export function hostLayoutMeta(id: string): HostLayoutMeta | undefined {
  const user = registered.get(id)
  if (user) return user.meta
  const spec = builtinSpecs.get(id)
  return spec ? metaFromSpec(spec) : undefined
}

/** Four keysyms and glyphs for one ZMK name, or undefined when the key is absent. */
export function hostLevels(layoutId: string, zmk: string): HostKeyLevels | undefined {
  return hostLayout(layoutId)?.byZmk.get(zmk)
}

function choiceFromMeta(meta: HostLayoutMeta): HostLayoutChoice {
  const language = hostLanguage(meta.language)
  return {
    id: meta.id,
    language: meta.language,
    languageName: language.name,
    layoutName: meta.name,
    flag: meta.flag,
    kind: meta.origin === 'user' ? 'user' : 'system',
    primary: meta.primary
  }
}

/** Builtin catalog row, or a choice synthesized from registered metadata. */
export function hostLayoutChoice(id: string): HostLayoutChoice | undefined {
  const listed = hostLayoutChoices.find(choice => choice.id === id)
  if (listed) return listed
  const meta = hostLayoutMeta(id)
  return meta ? choiceFromMeta(meta) : undefined
}

function registeredChoices(language: HostLanguageId): HostLayoutChoice[] {
  const rows: HostLayoutChoice[] = []
  for (const { meta } of registered.values()) {
    if (meta.language === language) rows.push(choiceFromMeta(meta))
  }
  return rows.sort((a, b) => a.layoutName.localeCompare(b.layoutName, 'en'))
}

/** Catalog rows plus registered user layouts for one language. */
export function hostLayoutsForLanguage(language: HostLanguageId): HostLayoutChoice[] {
  return [...catalogLayoutsForLanguage(language), ...registeredChoices(language)]
}

export function hostLayoutShelves(language: HostLanguageId): {
  primary?: HostLayoutChoice
  systems: HostLayoutChoice[]
  users: HostLayoutChoice[]
} {
  const layouts = hostLayoutsForLanguage(language)
  return {
    primary: layouts.find(choice => choice.kind === 'system' && choice.primary),
    systems: layouts.filter(choice => choice.kind === 'system' && !choice.primary),
    users: layouts.filter(choice => choice.kind === 'user')
  }
}

/**
 * Add or replace a runtime layout. Built-in ids cannot be registered.
 * Re-registering a user id replaces the previous entry.
 */
export function registerHostLayout(meta: HostLayoutMeta, layout: HostLayout): void {
  if (builtinSpecs.has(meta.id)) {
    throw new Error(`Cannot re-register built-in host layout "${meta.id}"`)
  }
  registered.set(meta.id, {
    meta: { ...meta, origin: 'user' },
    layout: cloneHostLayoutTable(layout, layout.id)
  })
}

/** Drop a runtime layout. Built-in ids are left unchanged. */
export function unregisterHostLayout(id: string): void {
  if (builtinSpecs.has(id)) return
  registered.delete(id)
}

/** Clear runtime layouts and the builtin parse cache. */
export function resetHostLayoutRegistry(): void {
  registered.clear()
  parsedBuiltins.clear()
}
