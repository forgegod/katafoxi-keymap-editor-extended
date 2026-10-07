import {
  addHostLanguage,
  assignHostLanguageLayout,
  hostLanguagesAvailable,
  preferredAddableHostLanguage,
  sameHostLegendView,
  standardHostLegendView
} from '@keymap-editor/keymap-core'
import {
  demoHostLayoutTable,
  type DemoHostLayoutSeed
} from '../demo/host-seeds.js'
import { saveUserHostLayout, type UserHostLayoutRecord } from '../host-layout-store'
import type { EditorState } from './state.svelte'

/**
 * Register demo host layouts under stable ids so a later Demo select reuses
 * the same tables. Insert a seed only when that id is missing from
 * `userLayouts`; in-place edits on those ids must survive re-select.
 * Assign them on the legend only while it is still the default English-only view.
 * Buffer seeds first; register/persist only while `selectToken` is still current.
 * Demo seed ids are stable shared fixtures — do not delete them on abort.
 */
export async function _seedDemoHostLayouts(this: EditorState, 
  seeds: DemoHostLayoutSeed[],
  selectToken: number
): Promise<void> {
  if (selectToken !== this._selectGeneration) return
  // Registering fixtures bumps hostLayoutRevision; do not treat that as a
  // user edit waiting for OS install.
  const dirtyBefore = this.isHostDirty
  const records: UserHostLayoutRecord[] = seeds.map(seed => ({
    id: seed.id,
    name: seed.name,
    language: seed.language,
    origin: { from: 'xkb' as const, fileName: seed.name, section: seed.section },
    updatedAt: Date.now(),
    layout: demoHostLayoutTable(seed)
  }))
  if (selectToken !== this._selectGeneration) return

  const existingIds = new Set(this.userLayouts.map(item => item.id))
  const fresh = records.filter(record => !existingIds.has(record.id))

  for (const record of fresh) {
    if (selectToken !== this._selectGeneration) return
    this._registerUserLayout(record)
    this.userLayouts = [
      ...this.userLayouts,
      {
        id: record.id,
        name: record.name,
        language: record.language,
        origin: record.origin,
        updatedAt: record.updatedAt
      }
    ]
  }

  try {
    for (const record of fresh) {
      if (selectToken !== this._selectGeneration) return
      await saveUserHostLayout(record)
    }
  } catch {
    this._noteHostLayoutSaveFailed()
  }
  if (selectToken !== this._selectGeneration) return

  if (!sameHostLegendView(this.hostLegend, standardHostLegendView())) {
    if (!dirtyBefore) this.markHostDelivered()
    return
  }

  let view = this.hostLegend
  for (const seed of seeds) {
    if (!view.columns.some(column => column.language === seed.language)) {
      view = addHostLanguage(view, seed.language)
    }
    view = assignHostLanguageLayout(view, seed.language, seed.id)
  }

  this.hostLegend = view
  if (selectToken !== this._selectGeneration) return
  await this._persistHostLegend()
  if (selectToken !== this._selectGeneration) return
  this.markHostDelivered()
}

/**
 * On a fresh demo (still English-only after restore/seeds), add one host
 * language from the browser locale when we ship a system layout for it.
 */
export async function _maybeAddPreferredDemoLanguage(this: EditorState, selectToken: number): Promise<void> {
  if (!sameHostLegendView(this.hostLegend, standardHostLegendView())) return
  const locales =
    typeof navigator !== 'undefined'
      ? [...(navigator.languages ?? []), navigator.language].filter(Boolean)
      : []
  const preferred = preferredAddableHostLanguage(locales)
  if (!preferred) return
  if (!hostLanguagesAvailable(this.hostLegend).includes(preferred)) return

  const dirtyBefore = this.isHostDirty
  this.hostLegend = addHostLanguage(this.hostLegend, preferred)
  await this._persistHostLegend()
  if (selectToken !== this._selectGeneration) return
  if (!dirtyBefore) this.markHostDelivered()
}

