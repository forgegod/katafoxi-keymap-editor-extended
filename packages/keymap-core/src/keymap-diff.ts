import { encodeKeyBinding } from './keymap.js'
import type { KeyBindingNode, ParsedKeymap } from './types.js'

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

function layerName(keymap: ParsedKeymap, index: number): string {
  return keymap.layer_names?.[index] ?? `Layer ${index}`
}

function encodeOrEmpty(binding: KeyBindingNode | undefined): string {
  if (!binding) return ''
  return encodeKeyBinding(binding)
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
  }
}

/** Human status fragment, e.g. "3 bindings, 1 layer renamed". */
export function summarizeKeymapDiff(changes: KeymapChange[]): string {
  let bindings = 0
  let renames = 0
  let adds = 0
  let removes = 0
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
  return parts.join(', ')
}

export function keymapsAreEqual(
  baseline: ParsedKeymap,
  draft: ParsedKeymap
): boolean {
  return diffKeymaps(baseline, draft).length === 0
}
