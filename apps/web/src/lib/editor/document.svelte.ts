import {
  COMBO_MAX_KEYS,
  comboChordOverlap,
  comboChordOverlapPartners,
  comboKeysIssue,
  comboKeysMessage,
  comboOverlapMessage,
  isBlankLayerBinding,
  promoteAbsentLayoutKey,
  remapConditionalLayersAfterDelete,
  remapShownLayersAfterDelete,
  type KeyBindingNode,
  type KeymapChange,
  type ParsedKeymap,
  type ZmkCombo,
  type ZmkConditionalLayer,
  type ZmkHoldTap
} from '@keymap-editor/keymap-core'
import { cloneLayout, cloneParsedKeymap, cloneSensorBinding } from './keymap-clone'
import { HISTORY_LIMIT } from './types'
import type { EditorState } from './state.svelte'

/**
 * In scheme mode, a real binding on an absent slot promotes it to a
 * physical key for this session (clears `absent` on the live layout).
 */
export function promoteAbsentKey(this: EditorState, keyIndex: number, binding: KeyBindingNode) {
  if (!this.schemeMode || !this.layout) return
  if (isBlankLayerBinding(binding)) return
  const next = promoteAbsentLayoutKey(this.layout, keyIndex)
  if (next !== this.layout) this.layout = next
}

export function isDirty(this: EditorState): boolean {
  return this._changes.length > 0
}

export function changes(this: EditorState): KeymapChange[] {
  return this._changes
}

export function statusText(this: EditorState): string {
  if (!this.draftKeymap) return ''
  if (this.isDirty) return 'Draft'
  if (this.isHostRepoDirty) {
    return 'Host layout changed — commit to save with the keymap'
  }
  if (this.source === 'github') return 'Up to date with repo'
  if (this.source === 'clipboard') return 'Ready — copy .keymap out'
  if (this.source === 'demo') return 'Demo — not saved to a repo'
  return 'Up to date with disk'
}

export function canUndo(this: EditorState): boolean {
  return this.undoStack.length > 0
}

export function canRedo(this: EditorState): boolean {
  return this.redoStack.length > 0
}

/** Names for the host-legend table, one per keymap layer. */
export function hostLegendLayerNames(this: EditorState): string[] {
  const km = this.draftKeymap
  if (!km) return []
  return km.layers.map((_, i) => {
    const name = km.layer_names?.[i]
    return typeof name === 'string' && name.length > 0 ? name : `layer${i}`
  })
}

export function clearHistory(this: EditorState) {
  this.undoStack = []
  this.redoStack = []
}

export function addLayer(this: EditorState) {
  const km = this.draftKeymap
  if (!km) return
  const width = this.layout?.length ?? km.layers[0]?.length ?? 0
  const index = km.layers.length
  const names = this.hostLegendLayerNames
  const blank = (): KeyBindingNode => ({ value: '&trans', params: [] })
  const next: ParsedKeymap = {
    ...km,
    layer_names: [...names, `Layer #${index}`],
    layers: [...km.layers, Array.from({ length: width }, blank)]
  }
  if (km.sensorBindings) {
    const prev = km.sensorBindings[km.sensorBindings.length - 1] ?? []
    next.sensorBindings = [
      ...km.sensorBindings.map(row => row.map(cloneSensorBinding)),
      prev.map(cloneSensorBinding)
    ]
  }
  this.updateKeymap(next)
}

export function renameLayer(this: EditorState, index: number, name: string) {
  const km = this.draftKeymap
  if (!km || index < 0 || index >= km.layers.length) return
  const names = [...this.hostLegendLayerNames]
  names[index] = name
  this.updateKeymap({ ...km, layer_names: names })
}

export function deleteLayer(this: EditorState, index: number) {
  const km = this.draftKeymap
  if (!km || km.layers.length <= 1) return
  if (index < 0 || index >= km.layers.length) return
  const names = [...this.hostLegendLayerNames]
  names.splice(index, 1)
  const layers = km.layers.filter((_, i) => i !== index)
  const next: ParsedKeymap = { ...km, layer_names: names, layers }
  if (km.conditionalLayers) {
    next.conditionalLayers = remapConditionalLayersAfterDelete(
      km.conditionalLayers,
      index
    )
  }
  if (km.sensorBindings) {
    next.sensorBindings = km.sensorBindings.filter((_, i) => i !== index)
  }
  this.updateKeymap(next)
  this.layerView = remapShownLayersAfterDelete(this.layerView, index, layers.length)
}

/** Replace one encoder turn on a layer. */
export function updateSensorBinding(this: EditorState, layer: number, index: number, binding: KeyBindingNode) {
  const km = this.draftKeymap
  if (!km?.sensorBindings) return
  const rows = km.sensorBindings.map(row => row.map(cloneSensorBinding))
  const row = rows[layer]
  if (!row || index < 0 || index >= row.length) return
  row[index] = cloneSensorBinding(binding)
  this.updateKeymap({ ...km, sensorBindings: rows })
}

/**
 * Remember a hold-tap list for the keymap update that applies the open key.
 * A new preset stays out of the draft until that update.
 */
export function armHoldTapsForNextUpdate(this: EditorState, holdTaps: ZmkHoldTap[] | null) {
  this._holdTapsOnNextUpdate = holdTaps
}

/** Replace hold-tap nodes on the draft. Save rewrites those nodes in the keymap. */
export function updateHoldTaps(this: EditorState, holdTaps: ZmkHoldTap[]) {
  const km = this.draftKeymap
  if (!km) return
  this.updateKeymap({ ...km, holdTaps })
}

/** Replace conditional-layer rules on the draft. An empty list drops the block on save. */
export function updateConditionalLayers(this: EditorState, conditionalLayers: ZmkConditionalLayer[]) {
  const km = this.draftKeymap
  if (!km) return
  this.updateKeymap({ ...km, conditionalLayers })
}

export function updateKeymap(this: EditorState, next: ParsedKeymap) {
  const stagedHoldTaps = this._holdTapsOnNextUpdate
  this._holdTapsOnNextUpdate = null
  if (stagedHoldTaps) next = { ...next, holdTaps: stagedHoldTaps }
  if (this.draftKeymap) {
    const prev = cloneParsedKeymap(this.draftKeymap)
    const stack = [...this.undoStack, prev]
    this.undoStack =
      stack.length > HISTORY_LIMIT
        ? stack.slice(stack.length - HISTORY_LIMIT)
        : stack
    this.redoStack = []
  }
  this.draftKeymap = next
  this.schedulePersist()
}

/** Replace the combos list on the draft (undoable via updateKeymap). */
export function updateCombos(this: EditorState, combos: ZmkCombo[]) {
  const km = this.draftKeymap
  if (!km) return
  this.updateKeymap({ ...km, combos })
  if (this.activeComboId && !combos.some(c => c.id === this.activeComboId)) {
    this.activeComboId = combos[0]?.id ?? null
  }
}

export function toggleComboMode(this: EditorState) {
  if (this.comboMode) {
    if (!this.tryExitComboMode()) return
    return
  }

  this.comboMode = true
  this.schemeMode = false
  this.comboNotice = null
  const combos = this.draftKeymap?.combos ?? []
  if (
    this.activeComboId == null ||
    !combos.some(c => c.id === this.activeComboId)
  ) {
    this.activeComboId = combos[0]?.id ?? null
  }
}

/**
 * Leave combo mode when every kept combo has a valid key count and no two
 * claim the same keys on a shared layer. Drops empty drafts.
 * Returns false when a combo still blocks exit.
 */
export function tryExitComboMode(this: EditorState): boolean {
  if (!this.comboMode) return true
  const km = this.draftKeymap
  const list = km?.combos ?? []
  const withoutEmpty = list.filter(c => c.keyPositions.length > 0)
  if (km && withoutEmpty.length !== list.length) {
    this.updateCombos(withoutEmpty)
  }
  const incomplete = withoutEmpty.find(c => comboKeysIssue(c.keyPositions) != null)
  if (incomplete) {
    this.activeComboId = incomplete.id
    this.refreshComboNotice()
    return false
  }
  const overlap = comboChordOverlap(withoutEmpty)
  if (overlap) {
    this.activeComboId = overlap.id
    this.refreshComboNotice()
    return false
  }
  this.comboMode = false
  this.comboNotice = null
  return true
}

/** Hard hint for the active combo: key count, then a shared chord. */
export function refreshComboNotice(this: EditorState) {
  const combos = this.draftKeymap?.combos ?? []
  const combo = combos.find(c => c.id === this.activeComboId)
  if (!combo) {
    this.comboNotice = null
    return
  }
  const issue = comboKeysIssue(combo.keyPositions)
  if (issue) {
    this.comboNotice = comboKeysMessage(issue)
    return
  }
  const otherId = comboChordOverlapPartners(combos).get(combo.id)
  this.comboNotice = comboOverlapMessage(otherId)
}

/** Toggle `keyIndex` in the active combo's key-positions. */
export function toggleComboPosition(this: EditorState, keyIndex: number) {
  const km = this.draftKeymap
  if (!km || this.activeComboId == null) return
  const combos = [...(km.combos ?? [])]
  const i = combos.findIndex(c => c.id === this.activeComboId)
  if (i < 0) return
  const combo = combos[i]
  const set = new Set(combo.keyPositions)
  if (set.has(keyIndex)) {
    set.delete(keyIndex)
  } else {
    if (set.size >= COMBO_MAX_KEYS) {
      this.comboNotice = comboKeysMessage('too_many')
      return
    }
    set.add(keyIndex)
  }
  combos[i] = {
    ...combo,
    keyPositions: [...set].sort((a, b) => a - b)
  }
  this.updateCombos(combos)
  this.refreshComboNotice()
}

export function undo(this: EditorState) {
  if (!this.draftKeymap || this.undoStack.length === 0) return
  const stack = this.undoStack
  const prev = stack[stack.length - 1]
  this.undoStack = stack.slice(0, -1)
  this.redoStack = [...this.redoStack, cloneParsedKeymap(this.draftKeymap)]
  this.draftKeymap = cloneParsedKeymap(prev)
  this.schedulePersist()
}

export function redo(this: EditorState) {
  if (!this.draftKeymap || this.redoStack.length === 0) return
  const stack = this.redoStack
  const next = stack[stack.length - 1]
  this.redoStack = stack.slice(0, -1)
  this.undoStack = [...this.undoStack, cloneParsedKeymap(this.draftKeymap)]
  this.draftKeymap = cloneParsedKeymap(next)
  this.schedulePersist()
}

/**
 * Drop unpublished ZMK edits: draft ← baseline, restore layout baseline
 * (scheme-mode promote-absent), clear step history + IndexedDB.
 * Unlike undo, this works after reload when the session stack is empty.
 * Host layout table edits are unchanged (not part of ZMK draft history).
 */
export async function discardDraft(this: EditorState): Promise<boolean> {
  if (!this.baselineKeymap || !this.draftKeymap || !this.isDirty) return false
  this.draftKeymap = cloneParsedKeymap(this.baselineKeymap)
  this.layout = cloneLayout(this.baselineLayout)
  this.clearHistory()
  this.saveNotice = null
  await this.clearPersistedDraft()
  return true
}

