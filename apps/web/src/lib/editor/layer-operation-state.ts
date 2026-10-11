import { cloneParsedKeymap, encodeKeymap, type LayerView, type ParsedKeymap } from '@keymap-editor/keymap-core'

/** Browser document metadata, never part of firmware JSON or host state. */
export interface LayerOperationSnapshot {
  ids: string[]
  /** Source in this snapshot's logical order, not necessarily the publish baseline. */
  source: string | null
  sourceModel: ParsedKeymap
  identityAware: boolean
}

export interface StoredLayerOperationState {
  version: 1
  baselineFingerprint: string
  baselineSource: string | null
  baselineIds: string[]
  snapshot: LayerOperationSnapshot
  /** Stored preferences are in snapshot order, including unavailable marks. */
  view: LayerView
}

export function layerBaselineFingerprint(keymap: ParsedKeymap): string {
  return JSON.stringify(encodeKeymap(keymap))
}

export function initialLayerSnapshot(keymap: ParsedKeymap, source: string | null): LayerOperationSnapshot {
  return {
    ids: keymap.layers.map((_, index) => `loaded:${index}`),
    source,
    sourceModel: cloneParsedKeymap(keymap),
    identityAware: false
  }
}

export function cloneLayerSnapshot(value: LayerOperationSnapshot): LayerOperationSnapshot {
  return { ...value, ids: [...value.ids], sourceModel: cloneParsedKeymap(value.sourceModel) }
}

/** Remap current preferences, never restore a stale eye-toggle snapshot. */
export function remapLayerIdentityView(view: LayerView, from: string[], to: string[]): LayerView {
  const shown = view.shown.map(index => {
    const id = from[index]
    const mapped = id === undefined ? -1 : to.indexOf(id)
    return mapped < 0 ? index : mapped
  })
  if (shown.every((index, i) => index === view.shown[i])) return view
  // Inclusion order controls the next eye-toggle eviction; do not sort it.
  return { ...view, shown: [...new Set(shown)] }
}
