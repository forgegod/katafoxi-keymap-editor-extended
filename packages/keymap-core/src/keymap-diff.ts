import { encodeConditionalLayerFingerprint } from './dts-conditional-layers.js'
import { encodeKeyBinding } from './keymap.js'
import type { KeyBindingNode, ParsedKeymap, ZmkCombo } from './types.js'

export type KeymapChange =
  | {
      type: 'binding'
      layer: number
      index: number
      before: string
      after: string
    }
  | {
      type: 'layer_rename'
      layer: number
      before: string
      after: string
    }
  | {
      type: 'layer_add'
      layer: number
      name: string
    }
  | {
      type: 'layer_remove'
      layer: number
      name: string
    }
  | {
      type: 'combo'
      id: string
      /** Empty when the combo was added. */
      before: string
      /** Empty when the combo was removed. */
      after: string
    }
  | {
      type: 'conditional_layer'
      id: string
      /** Empty when the rule was added. */
      before: string
      /** Empty when the rule was removed. */
      after: string
    }

function layerName(keymap: ParsedKeymap, index: number): string {
  return keymap.layer_names?.[index] ?? `Layer ${index}`
}

function encodeOrEmpty(binding: KeyBindingNode | undefined): string {
  if (!binding) return ''
  return encodeKeyBinding(binding)
}

/** Stable fingerprint for dirty detection (id is keyed separately). */
export function encodeComboFingerprint(combo: ZmkCombo): string {
  const bits = [
    `[${combo.keyPositions.join(' ')}]`,
    encodeOrEmpty(combo.binding)
  ]
  if (combo.timeoutMs !== undefined) bits.push(`${combo.timeoutMs}ms`)
  if (combo.layers && combo.layers.length > 0) {
    bits.push(`L${combo.layers.join(',')}`)
  } else {
    bits.push('all')
  }
  if (combo.slowRelease) bits.push('slow')
  if (combo.requirePriorIdleMs !== undefined) {
    bits.push(`idle${combo.requirePriorIdleMs}`)
  }
  return bits.join(' ')
}

function comboMap(keymap: ParsedKeymap): Map<string, string> {
  const map = new Map<string, string>()
  for (const combo of keymap.combos ?? []) {
    map.set(combo.id, encodeComboFingerprint(combo))
  }
  return map
}

function conditionalLayerMap(keymap: ParsedKeymap): Map<string, string> {
  const map = new Map<string, string>()
  for (const rule of keymap.conditionalLayers ?? []) {
    map.set(rule.id, encodeConditionalLayerFingerprint(rule))
  }
  return map
}

/**
 * Structural diff of draft vs baseline using encoded bind strings,
 * so equivalent trees do not report false dirty.
 */
export function diffKeymaps(
  baseline: ParsedKeymap,
  draft: ParsedKeymap
): KeymapChange[] {
  const changes: KeymapChange[] = []
  const baseCount = baseline.layers.length
  const draftCount = draft.layers.length
  const shared = Math.min(baseCount, draftCount)

  for (let layer = 0; layer < shared; layer++) {
    const beforeName = layerName(baseline, layer)
    const afterName = layerName(draft, layer)
    if (beforeName !== afterName) {
      changes.push({
        type: 'layer_rename',
        layer,
        before: beforeName,
        after: afterName
      })
    }

    const beforeLayer = baseline.layers[layer]
    const afterLayer = draft.layers[layer]
    const keyCount = Math.max(beforeLayer.length, afterLayer.length)
    for (let index = 0; index < keyCount; index++) {
      const before = encodeOrEmpty(beforeLayer[index])
      const after = encodeOrEmpty(afterLayer[index])
      if (before !== after) {
        changes.push({ type: 'binding', layer, index, before, after })
      }
    }
  }

  for (let layer = shared; layer < draftCount; layer++) {
    changes.push({
      type: 'layer_add',
      layer,
      name: layerName(draft, layer)
    })
  }

  for (let layer = shared; layer < baseCount; layer++) {
    changes.push({
      type: 'layer_remove',
      layer,
      name: layerName(baseline, layer)
    })
  }

  const beforeCombos = comboMap(baseline)
  const afterCombos = comboMap(draft)
  const ids = new Set([...beforeCombos.keys(), ...afterCombos.keys()])
  for (const id of [...ids].sort()) {
    const before = beforeCombos.get(id) ?? ''
    const after = afterCombos.get(id) ?? ''
    if (before !== after) {
      changes.push({ type: 'combo', id, before, after })
    }
  }

  const beforeRules = conditionalLayerMap(baseline)
  const afterRules = conditionalLayerMap(draft)
  const ruleIds = new Set([...beforeRules.keys(), ...afterRules.keys()])
  for (const id of [...ruleIds].sort()) {
    const before = beforeRules.get(id) ?? ''
    const after = afterRules.get(id) ?? ''
    if (before !== after) {
      changes.push({ type: 'conditional_layer', id, before, after })
    }
  }

  return changes
}

function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** One-line description of a single change for the draft list. */
export function formatKeymapChange(change: KeymapChange): string {
  switch (change.type) {
    case 'binding':
      return `L${change.layer} key ${change.index}: ${change.before || '(empty)'} → ${change.after || '(empty)'}`
    case 'layer_rename':
      return `L${change.layer}: ${change.before} → ${change.after}`
    case 'layer_add':
      return `L${change.layer} added: ${change.name}`
    case 'layer_remove':
      return `L${change.layer} removed: ${change.name}`
    case 'combo':
      if (!change.before) return `${change.id} added: ${change.after}`
      if (!change.after) return `${change.id} removed: ${change.before}`
      return `${change.id}: ${change.before} → ${change.after}`
    case 'conditional_layer':
      if (!change.before) return `${change.id} added: ${change.after}`
      if (!change.after) return `${change.id} removed: ${change.before}`
      return `${change.id}: ${change.before} → ${change.after}`
  }
}

/** Human status fragment, e.g. "3 bindings, 1 layer renamed". */
export function summarizeKeymapDiff(changes: KeymapChange[]): string {
  let bindings = 0
  let renames = 0
  let adds = 0
  let removes = 0
  let combos = 0
  let conditionalLayers = 0
  for (const change of changes) {
    switch (change.type) {
      case 'binding':
        bindings++
        break
      case 'layer_rename':
        renames++
        break
      case 'layer_add':
        adds++
        break
      case 'layer_remove':
        removes++
        break
      case 'combo':
        combos++
        break
      case 'conditional_layer':
        conditionalLayers++
        break
    }
  }

  const parts: string[] = []
  if (bindings > 0) parts.push(countLabel(bindings, 'binding', 'bindings'))
  if (renames > 0) {
    parts.push(countLabel(renames, 'layer renamed', 'layers renamed'))
  }
  if (adds > 0) parts.push(countLabel(adds, 'layer added', 'layers added'))
  if (removes > 0) {
    parts.push(countLabel(removes, 'layer removed', 'layers removed'))
  }
  if (combos > 0) parts.push(countLabel(combos, 'combo', 'combos'))
  if (conditionalLayers > 0) {
    parts.push(countLabel(conditionalLayers, 'conditional layer', 'conditional layers'))
  }
  return parts.join(', ')
}

export function keymapsAreEqual(
  baseline: ParsedKeymap,
  draft: ParsedKeymap
): boolean {
  return diffKeymaps(baseline, draft).length === 0
}
