import {
  comboChordOverlap,
  comboChordOverlapPartners,
  comboKeysIssue,
  comboKeysMessage,
  comboOverlapMessage,
  isBlankLayerBinding,
  operateLayers,
  promoteAbsentLayoutKey,
  LAYER_REF_CLEARED_NOTE,
  remapCombosAfterLayerDelete,
  remapConditionalLayersAfterDelete,
  remapLayerRefBindingAfterDelete,
  remapShownLayersAfterDelete,
  type KeyBindingNode,
  type KeymapChange,
  type LayerOperation,
  type LayerOperationResult,
  type ParsedKeymap,
  type ZmkCombo,
  type ZmkConditionalLayer,
  type ZmkHoldTap
} from '@keymap-editor/keymap-core'
import { cloneLayout, cloneParsedKeymap, cloneSensorBinding } from './keymap-clone'
import { HISTORY_LIMIT } from './types'
import { dismissLegendDecode } from '../legend-decode-active'
import type { EditorState } from './state.svelte'
import { cloneLayerSnapshot, initialLayerSnapshot, remapLayerIdentityView, type LayerOperationSnapshot } from './layer-operation-state'

function firmwareEditBlocker(state: EditorState): string | null {
  if (state.source !== 'github' || !state.githubMeta?.keymapPath) return null
  if (state._firmwareRecoveryLoading) return 'Firmware editing is blocked while recovery is being checked. Wait for loading to finish.'
  return state.hasPendingFirmwareRecovery
    ? 'Firmware editing is blocked while stored firmware recovery is pending. The stored draft was kept unchanged.'
    : null
}

function refuseFirmwareEdit(state: EditorState): boolean {
  const message = firmwareEditBlocker(state)
  if (!message) return false
  state.saveNotice = { kind: 'warning', messages: [message] }
  return true
}

/**
 * In scheme mode, a real binding on an absent slot promotes it to a
 * physical key for this session (clears `absent` on the live layout).
 */
export function promoteAbsentKey(this: EditorState, keyIndex: number, binding: KeyBindingNode) {
  if (refuseFirmwareEdit(this)) return
  if (!this.schemeMode || !this.layout) return
  if (isBlankLayerBinding(binding)) return
  const next = promoteAbsentLayoutKey(this.layout, keyIndex)
  if (next !== this.layout) this.layout = next
}

export function isDirty(this: EditorState): boolean {
  return this._changes.length > 0 || Boolean(this.layerOperationSnapshot?.identityAware &&
    JSON.stringify(this.layerOperationSnapshot.ids) !== JSON.stringify(this._baselineLayerIds))
}

export function changes(this: EditorState): KeymapChange[] {
  return this._changes
}

export function statusText(this: EditorState): string {
  if (!this.draftKeymap) return ''
  const firmwareRecovery = this.hasPendingFirmwareRecovery
    ? this.isDirty
      ? 'Live firmware differs from stored recovery and is not saved in this browser. Do not reload or close this page; both revisions were kept separate and switching is blocked.'
      : 'Unpublished firmware recovery is retained in this browser. Reopen to restore it before committing.'
    : ''
  if (this.source === 'github' && this._omitHostKeymapSnapshotOnCommit) {
    const hostStatus = this.hasLocalHostRecovery
      ? this.isDirty && !this.hasPendingFirmwareRecovery
        ? 'Commit can save firmware only. Host edits remain browser-local and unpublishable to GitHub.'
        : 'Host edits are browser-local and unpublishable to GitHub. Commit cannot save them.'
      : 'Host snapshot and install-file writes are disabled. Remote host files remain unchanged.'
    const firmwareStatus = firmwareRecovery || (this.isDirty && !this.hasLocalHostRecovery ? 'Commit can save firmware only.' : '')
    return [firmwareStatus, hostStatus].filter(Boolean).join(' ')
  }
  if (firmwareRecovery) return firmwareRecovery
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

export function reorderLayers(this: EditorState, order: number[]): LayerOperationResult {
  return applyLayerOperation.call(this, { kind: 'reorder', order })
}

export function duplicateLayer(this: EditorState, index: number): LayerOperationResult {
  return applyLayerOperation.call(this, { kind: 'duplicate', index })
}

function applyLayerOperation(this: EditorState, operation: LayerOperation): LayerOperationResult {
  const keymap = this.draftKeymap
  const snapshot = this.layerOperationSnapshot
  const refuse = (error: string): LayerOperationResult => {
    this.saveNotice = { kind: 'warning', messages: [error] }
    return { ok: false, error }
  }
  const recoveryBlocker = firmwareEditBlocker(this)
  if (recoveryBlocker) return refuse(recoveryBlocker)
  if (!keymap || !this.layout || !snapshot) return refuse('Load a document with verified layer identity first.')
  if (operation.kind === 'reorder' && operation.order.length === keymap.layers.length && Array.from(operation.order).every((old, i) => old === i)) {
    return { ok: true, changed: false, keymap, source: snapshot.source, oldToNew: [...operation.order] }
  }
  const blocker = this.layerOperationBlocker()
  if (blocker) return refuse(blocker)
  if (snapshot.ids.length !== keymap.layers.length) return refuse('Layer identity is stale. Reload the saved document before changing layer order.')
  if (this.source === 'clipboard' && snapshot.source !== this.clipboardOriginalSource) return refuse('Source revision changed. Reload before changing layers.')
  const provenance = this.source === 'clipboard' || this.source === 'demo'
    ? snapshot.source
      ? { kind: 'source' as const, originalSource: snapshot.source, baseline: snapshot.sourceModel }
      : this.source === 'demo' ? { kind: 'source-free' as const } : { kind: 'unverified' as const }
    : { kind: 'unverified' as const }
  const result = operateLayers({ keymap, layout: this.layout, operation, provenance })
  if (!result.ok) return refuse(result.error)
  if (!result.changed) return result
  // Recheck mounted owners at the exact commit boundary, not only in future controls.
  const lateBlocker = this.layerOperationBlocker()
  if (lateBlocker) return refuse(lateBlocker)
  this.updateKeymap(result.keymap, {
    ids: operation.kind === 'reorder' ? operation.order.map(old => snapshot.ids[old]) : [...snapshot.ids, `added:${crypto.randomUUID()}`],
    source: result.source,
    sourceModel: cloneParsedKeymap(result.keymap),
    identityAware: true
  })
  this.legendHover = null
  return result
}

export function addLayer(this: EditorState) {
  if (refuseFirmwareEdit(this)) return
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
  if (this.layerOperationSnapshot) {
    this.layerOperationSnapshot = { ...this.layerOperationSnapshot, ids: [...this.layerOperationSnapshot.ids, `added:${crypto.randomUUID()}`] }
  }
}

export function renameLayer(this: EditorState, index: number, name: string) {
  const km = this.draftKeymap
  if (!km || index < 0 || index >= km.layers.length) return
  const names = [...this.hostLegendLayerNames]
  names[index] = name
  this.updateKeymap({ ...km, layer_names: names })
}

export function deleteLayer(this: EditorState, index: number) {
  if (refuseFirmwareEdit(this)) return
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
  if (km.combos) {
    next.combos = remapCombosAfterLayerDelete(km.combos, index)
  }
  if (km.sensorBindings) {
    next.sensorBindings = km.sensorBindings.filter((_, i) => i !== index)
  }
  const remapped = remapKeymapLayerRefsAfterDelete(next, index)
  this.updateKeymap(remapped.keymap)
  if (this.layerOperationSnapshot) {
    this.layerOperationSnapshot = { ...this.layerOperationSnapshot, ids: this.layerOperationSnapshot.ids.filter((_, i) => i !== index) }
  }
  if (remapped.cleared) {
    this.saveNotice = { kind: 'warning', messages: [LAYER_REF_CLEARED_NOTE] }
  }
  syncActiveComboId.call(this, remapped.keymap.combos)
  this.layerView = remapShownLayersAfterDelete(this.layerView, index, layers.length)
}

function remapKeymapLayerRefsAfterDelete(
  keymap: ParsedKeymap,
  deleted: number
): { keymap: ParsedKeymap; cleared: boolean } {
  let cleared = false
  const walk = (node: KeyBindingNode): KeyBindingNode => {
    const next = remapLayerRefBindingAfterDelete(node, deleted)
    if (next.cleared) cleared = true
    return next.node
  }
  const layers = keymap.layers.map(row => row.map(walk))
  const out: ParsedKeymap = { ...keymap, layers }
  if (keymap.combos) {
    out.combos = keymap.combos.map(combo => ({
      ...combo,
      binding: walk(combo.binding)
    }))
  }
  if (keymap.sensorBindings) {
    out.sensorBindings = keymap.sensorBindings.map(row => row.map(walk))
  }
  return { keymap: out, cleared }
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

/** Stage ensuring the `&rgblayer` recipe node on the next keymap update. */
export function armRgbLayerRecipeForNextUpdate(this: EditorState, ensure: boolean | null) {
  this._rgbLayerRecipeOnNextUpdate = ensure
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

export function updateKeymap(this: EditorState, next: ParsedKeymap, layerSnapshot?: LayerOperationSnapshot) {
  if (refuseFirmwareEdit(this)) return
  const stagedHoldTaps = this._holdTapsOnNextUpdate
  this._holdTapsOnNextUpdate = null
  if (stagedHoldTaps) next = { ...next, holdTaps: stagedHoldTaps }
  const stagedRgb = this._rgbLayerRecipeOnNextUpdate
  this._rgbLayerRecipeOnNextUpdate = null
  if (stagedRgb === true) next = { ...next, rgbLayerRecipe: true }
  if (this.draftKeymap) {
    const prev = cloneParsedKeymap(this.draftKeymap)
    if (this.layerOperationSnapshot) this._layerHistory.set(prev, cloneLayerSnapshot(this.layerOperationSnapshot))
    const stack = [...this.undoStack, prev]
    this.undoStack =
      stack.length > HISTORY_LIMIT
        ? stack.slice(stack.length - HISTORY_LIMIT)
        : stack
    this.redoStack = []
  }
  this.draftKeymap = next
  if (layerSnapshot) restoreLayerSnapshot.call(this, layerSnapshot)
  this.schedulePersist()
}

/** Keep `activeComboId` pointing at a combo that still exists. */
function syncActiveComboId(this: EditorState, combos: ZmkCombo[] | undefined) {
  const list = combos ?? []
  if (this.activeComboId && !list.some(c => c.id === this.activeComboId)) {
    this.activeComboId = list[0]?.id ?? null
  }
}

/** Replace the combos list on the draft (undoable via updateKeymap). */
export function updateCombos(this: EditorState, combos: ZmkCombo[]) {
  if (refuseFirmwareEdit(this)) return
  const km = this.draftKeymap
  if (!km) return
  this.updateKeymap({ ...km, combos })
  syncActiveComboId.call(this, combos)
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
 * Leave combo mode when no two 2+ key chords share keys on a layer.
 * Drops empty drafts. 1-key and 6+ combos are ZMK-legal and only warn.
 * Returns false when overlap still blocks exit.
 */
export function tryExitComboMode(this: EditorState): boolean {
  if (!this.comboMode) return true
  const km = this.draftKeymap
  const list = km?.combos ?? []
  const withoutEmpty = list.filter(c => c.keyPositions.length > 0)
  if (km && withoutEmpty.length !== list.length) {
    this.updateCombos(withoutEmpty)
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
    this.comboNotice = comboKeysMessage(issue, combo.keyPositions.length)
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
  if (refuseFirmwareEdit(this)) return
  if (!this.draftKeymap || this.undoStack.length === 0) return
  const stack = this.undoStack
  const prev = stack[stack.length - 1]
  this.undoStack = stack.slice(0, -1)
  const current = cloneParsedKeymap(this.draftKeymap)
  if (this.layerOperationSnapshot) this._layerHistory.set(current, cloneLayerSnapshot(this.layerOperationSnapshot))
  this.redoStack = [...this.redoStack, current]
  this.draftKeymap = cloneParsedKeymap(prev)
  const previousLayerSnapshot = this._layerHistory.get(prev)
  if (previousLayerSnapshot) restoreLayerSnapshot.call(this, previousLayerSnapshot)
  syncActiveComboId.call(this, this.draftKeymap.combos)
  this.schedulePersist()
}

export function redo(this: EditorState) {
  if (refuseFirmwareEdit(this)) return
  if (!this.draftKeymap || this.redoStack.length === 0) return
  const stack = this.redoStack
  const next = stack[stack.length - 1]
  this.redoStack = stack.slice(0, -1)
  const current = cloneParsedKeymap(this.draftKeymap)
  if (this.layerOperationSnapshot) this._layerHistory.set(current, cloneLayerSnapshot(this.layerOperationSnapshot))
  this.undoStack = [...this.undoStack, current]
  this.draftKeymap = cloneParsedKeymap(next)
  const nextLayerSnapshot = this._layerHistory.get(next)
  if (nextLayerSnapshot) restoreLayerSnapshot.call(this, nextLayerSnapshot)
  syncActiveComboId.call(this, this.draftKeymap.combos)
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
  restoreLayerSnapshot.call(this, {
    ...initialLayerSnapshot(this.baselineKeymap, this._baselineClipboardSource),
    ids: [...this._baselineLayerIds]
  })
  this.draftKeymap = cloneParsedKeymap(this.baselineKeymap)
  this.layout = cloneLayout(this.baselineLayout)
  this.clearHistory()
  this.saveNotice = null
  await this.clearPersistedDraft()
  return true
}

function restoreLayerSnapshot(this: EditorState, snapshot: LayerOperationSnapshot) {
  const current = this.layerOperationSnapshot
  if (current && (current.identityAware || snapshot.identityAware)) {
    this.layerView = remapLayerIdentityView(this.layerView, current.ids, snapshot.ids)
    this.legendHover = null
    dismissLegendDecode()
  }
  // Identity tracking is sticky within a loaded session: an asynchronous copy
  // may still accept the reordered baseline after undo reaches a pre-move step.
  this.layerOperationSnapshot = {
    ...cloneLayerSnapshot(snapshot),
    identityAware: Boolean(current?.identityAware || snapshot.identityAware)
  }
  if (this.source === 'clipboard') this.clipboardOriginalSource = snapshot.source
}

