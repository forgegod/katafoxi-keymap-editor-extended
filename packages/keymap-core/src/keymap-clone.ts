import { normalizeParsedKeymap } from './keymap.js'
import type {
  KeyBindingNode,
  LayoutKey,
  ParsedKeymap,
  ZmkCombo,
  ZmkHoldTap
} from './types.js'

/** Shallow-clone each key so promote-absent edits do not mutate the load baseline. */
export function cloneLayout(layout: LayoutKey[] | null | undefined): LayoutKey[] | null {
  if (!layout) return null
  return layout.map(key => ({ ...key }))
}

/** Deep clone plain ParsedKeymap (value+params only). Never structuredClone reactive graphs. */
export function cloneSensorBinding(node: KeyBindingNode): KeyBindingNode {
  return {
    value: node.value,
    params: Array.isArray(node.params) ? node.params.map(cloneSensorBinding) : []
  }
}

export function cloneParsedKeymap(km: ParsedKeymap): ParsedKeymap {
  const cloneBinding = cloneSensorBinding
  const normalized = normalizeParsedKeymap(km)

  const out: ParsedKeymap = {
    layer_names: normalized.layer_names!,
    layers: normalized.layers.map(layer => layer.map(cloneBinding))
  }
  if (normalized.keyboard != null) out.keyboard = normalized.keyboard
  if (normalized.keymap != null) out.keymap = normalized.keymap
  if (normalized.layout != null) out.layout = normalized.layout
  // Keep explicit `combos: []` so Save can drop the DTS block (absent ≠ empty).
  if (normalized.combos !== undefined) {
    out.combos = normalized.combos.map(c => {
      const combo: ZmkCombo = {
        id: c.id,
        keyPositions: [...c.keyPositions],
        binding: cloneBinding(c.binding)
      }
      if (c.timeoutMs !== undefined) combo.timeoutMs = c.timeoutMs
      if (c.requirePriorIdleMs !== undefined) {
        combo.requirePriorIdleMs = c.requirePriorIdleMs
      }
      if (c.slowRelease) combo.slowRelease = true
      if (c.layers) combo.layers = [...c.layers]
      return combo
    })
  }
  if (normalized.conditionalLayers) {
    out.conditionalLayers = normalized.conditionalLayers.map(rule => ({
      id: rule.id,
      ifLayers: [...rule.ifLayers],
      thenLayer: rule.thenLayer
    }))
  }
  if (normalized.holdTaps) {
    out.holdTaps = normalized.holdTaps.map(holdTap => {
      const copy: ZmkHoldTap = { code: holdTap.code }
      if (holdTap.override) copy.override = true
      if (holdTap.nodeName) copy.nodeName = holdTap.nodeName
      if (holdTap.tappingTermMs != null) copy.tappingTermMs = holdTap.tappingTermMs
      if (holdTap.quickTapMs != null) copy.quickTapMs = holdTap.quickTapMs
      if (holdTap.requirePriorIdleMs != null) copy.requirePriorIdleMs = holdTap.requirePriorIdleMs
      if (holdTap.flavor) copy.flavor = holdTap.flavor
      if (holdTap.bindings) copy.bindings = [...holdTap.bindings]
      if (holdTap.params) copy.params = [...holdTap.params]
      return copy
    })
  }
  if (normalized.sensorBindings) {
    out.sensorBindings = normalized.sensorBindings.map(row => row.map(cloneBinding))
  }
  if (normalized.rgbLayerRecipe === true) out.rgbLayerRecipe = true
  else if (normalized.rgbLayerRecipe === false) out.rgbLayerRecipe = false
  return out
}

/**
 * Hold-tap timings come from the keymap file. A draft saved before that load
 * keeps its bindings and takes the timings from the loaded keymap.
 * An explicit list on the draft, including empty, stays as saved.
 */
export function adoptHoldTaps(draft: ParsedKeymap, loaded: ParsedKeymap | null): ParsedKeymap {
  if (draft.holdTaps != null || !loaded?.holdTaps) return draft
  return cloneParsedKeymap({ ...draft, holdTaps: loaded.holdTaps })
}

/**
 * Encoder lists come from the keymap file. A draft saved before that load
 * keeps its bindings and takes the encoder rows from the loaded keymap.
 * An explicit list on the draft, including empty, stays as saved.
 */
export function adoptSensorBindings(
  draft: ParsedKeymap,
  loaded: ParsedKeymap | null
): ParsedKeymap {
  if (draft.sensorBindings != null || !loaded?.sensorBindings) return draft
  return cloneParsedKeymap({ ...draft, sensorBindings: loaded.sensorBindings })
}
