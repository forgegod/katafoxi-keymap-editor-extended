import { assertLayerKeyCounts, buildFilesystemKeymap, isUserKeymapFilename, parseDtsKeymap, parseKeymap } from '@keymap-editor/keymap-core'
import { buildDraftIdentity, loadStoredDraft, saveStoredDraft, type FilesystemAttempt, type FilesystemBaseline, type FilesystemRecovery, type StoredDraft } from '../draft-storage'
import { validateGeometryJson } from '../filesystem-access'
import { dismissLegendDecode } from '../legend-decode-active'
import { cloneParsedKeymap, cloneLayout } from './keymap-clone'
import { cloneLayerSnapshot, initialLayerSnapshot, layerBaselineFingerprint, remapLayerIdentityView } from './layer-operation-state'
import type { EditorState } from './state.svelte'
import type { FilesystemKeyboardSelection } from './types'

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const equal = (a: unknown, b: unknown): boolean => {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]))
      : value
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

function validateBaseline(base: FilesystemBaseline) {
  if (!base?.route || !['file', 'directory'].includes(base.route.kind) ||
      (base.route.kind === 'directory' && (typeof base.route.entryName !== 'string' || /[/\\\0]/.test(base.route.entryName) || !isUserKeymapFilename(base.route.entryName)))) throw new Error('Invalid filesystem route or direct entry provenance')
  if (!base || !Array.isArray(base.bytes) || !base.bytes.every(n => Number.isInteger(n) && n >= 0 && n <= 255) ||
      !base.source?.trim() || new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(new Uint8Array(base.bytes)) !== base.source) throw new Error('Invalid filesystem original source baseline')
  const parsed = parseKeymap(parseDtsKeymap(base.source, base.keymap))
  // Adapter metadata is not firmware, but every source-derived model field is.
  if (!equal(parsed, { ...base.keymap, keyboard: parsed.keyboard, keymap: parsed.keymap, layout: parsed.layout })) throw new Error('Filesystem baseline model does not match original source')
  if (base.geometry !== undefined) {
    if (!base.geometry || !Array.isArray(base.geometry.bytes) || !base.geometry.bytes.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) throw new Error('Invalid filesystem geometry bytes')
    validateGeometryJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(new Uint8Array(base.geometry.bytes)))
  }
  assertLayerKeyCounts(base.layout, parsed.layers.map(layer => layer.map(() => '')))
  assertLayerKeyCounts(base.layout, base.keymap.layers.map(layer => layer.map(() => '')))
}

function presentedBaseline(recovery: FilesystemRecovery) {
  const model = cloneParsedKeymap(recovery.baseline.keymap)
  const display = recovery.display
  if (display) {
    if (display.version !== 1 || display.layerIds.length !== model.layers.length ||
        new Set(display.layerIds).size !== model.layers.length || !display.layerIds.every(id => typeof id === 'string') ||
        (display.layerNames && (display.layerNames.length !== model.layers.length || !display.layerNames.every(name => typeof name === 'string')))) throw new Error('Invalid browser-local layer metadata')
    if (display.layerNames) model.layer_names = [...display.layerNames]
  }
  return model
}

function receiptRecovery(attempt: FilesystemAttempt, bytes: number[]): FilesystemRecovery {
  const keymap = parseKeymap(parseDtsKeymap(attempt.code, attempt.sent))
  const baseline = { ...copy(attempt.baseline), bytes, source: attempt.code, keymap, layout: copy(attempt.layout) }
  validateBaseline(baseline)
  const recovery: FilesystemRecovery = { version: 1, baseline, display: {
    version: 1, layerIds: [...(attempt.layer?.snapshot.ids ?? initialLayerSnapshot(attempt.sent, attempt.code).ids)],
    ...(attempt.sent.layer_names ? { layerNames: [...attempt.sent.layer_names] } : {})
  } }
  presentedBaseline(recovery)
  return recovery
}

function validateAttempt(attempt: FilesystemAttempt, recovery: FilesystemRecovery) {
  if (!attempt.id || !((attempt.version === undefined && attempt.stage === undefined) ||
      (attempt.version === 1 && ['prepared', 'write-possible'].includes(attempt.stage!)))) throw new Error('Unsupported filesystem attempt stage')
  // Only the legacy name representation may differ after narrow baseline repair.
  const parsed = parseKeymap(parseDtsKeymap(attempt.baseline.source, attempt.baseline.keymap))
  const baseline = { ...copy(attempt.baseline), keymap: { ...copy(attempt.baseline.keymap), layer_names: parsed.layer_names } }
  validateBaseline(baseline)
  if (!equal(baseline, recovery.baseline)) throw new Error('Retained attempt baseline changed')
  const built = buildFilesystemKeymap({ keymap: attempt.sent, layout: attempt.layout, originalSource: baseline.source })
  if (built.code !== attempt.code || !equal(Array.from(new TextEncoder().encode(attempt.code)), attempt.bytes)) throw new Error('Retained output does not match captured firmware')
  receiptRecovery(attempt, attempt.bytes)
}

/** Internal domain selection; the access controller proves file identity first. */
export async function selectFilesystemKeyboard(this: EditorState, event: FilesystemKeyboardSelection) {
  if (this.source === 'filesystem' && this.saving) return false
  const identity = buildDraftIdentity({ source: 'filesystem', filesystemDocumentId: event.filesystem.documentId })
  if (!identity) throw new Error('Invalid filesystem identity')
  validateBaseline(event.filesystem.baseline)
  if (this.source === 'filesystem' && this.filesystemDocumentId === event.filesystem.documentId) return true
  const token = ++this._transitionGeneration
  const draft = this.draftKeymap
  if (!await this.retainWorkForTransition()) return false
  let stored = await loadStoredDraft(identity)
  if (token !== this._transitionGeneration || this.draftKeymap !== draft) return false
  const recovery = copy(stored?.filesystem ?? { version: 1 as const, baseline: event.filesystem.baseline })
  if (stored && (!stored.filesystem || stored.filesystem.version !== 1)) throw new Error('Invalid filesystem baseline recovery; row retained')
  try {
    validateBaseline(recovery.baseline)
  } catch (error) {
    // Candidate-version migration only: names are the sole repairable field.
    // The unchanged bytes, every other firmware field and geometry still pass
    // the normal reopen validator before any guarded replacement is attempted.
    if (!stored || recovery.display) throw error
    const names = recovery.baseline.keymap.layer_names
    const parsed = parseKeymap(parseDtsKeymap(recovery.baseline.source, recovery.baseline.keymap))
    const repaired = { ...copy(recovery.baseline), keymap: { ...copy(recovery.baseline.keymap), layer_names: parsed.layer_names } }
    validateBaseline(repaired)
    recovery.display = { version: 1, layerNames: names && [...names],
      layerIds: [...(stored.layerOperation?.baselineIds ?? initialLayerSnapshot(repaired.keymap, repaired.source).ids)] }
    recovery.baseline = repaired
    presentedBaseline(recovery)
    await saveStoredDraft(identity, stored.draftKeymap, stored.layerOperation, undefined, {
      expected: stored, isCurrent: () => token === this._transitionGeneration && this.draftKeymap === draft,
      accepted: row => { stored = row }
    }, recovery)
  }
  presentedBaseline(recovery)
  if (!stored) {
    await saveStoredDraft(identity, recovery.baseline.keymap, undefined, undefined, {
      expected: null, isCurrent: () => token === this._transitionGeneration && this.draftKeymap === draft
    }, recovery)
  }
  const row = await loadStoredDraft(identity)
  if (!row || !equal(row.filesystem, recovery) || (stored && !equal(row, stored)) || token !== this._transitionGeneration || this.draftKeymap !== draft) return false
  this._selectGeneration += 1
  this._persistGeneration += 1
  this._publishGeneration += 1
  this._cancelPersistTimer()
  this.source = 'filesystem'
  this.filesystemDocumentId = event.filesystem.documentId
  this.filesystemRecovery = recovery
  this._filesystemRow = row
  this.githubMeta = null
  this.clipboardOriginalSource = null
  this.filesystemVerifiedSave = false
  this.baselineKeymap = presentedBaseline(recovery)
  this.draftKeymap = presentedBaseline(recovery)
  this.layout = cloneLayout(recovery.baseline.layout)
  this.baselineLayout = cloneLayout(recovery.baseline.layout)
  this.layerOperationSnapshot = initialLayerSnapshot(this.draftKeymap, recovery.baseline.source)
  if (recovery.display) this.layerOperationSnapshot.ids = [...recovery.display.layerIds]
  this._baselineLayerIds = [...this.layerOperationSnapshot.ids]
  this._baselineClipboardSource = null
  this.hasPendingFirmwareRecovery = !!recovery.attempt || !equal(row.draftKeymap, this.baselineKeymap) ||
    !!(row.layerOperation && !equal(row.layerOperation.snapshot.ids, this._baselineLayerIds))
  this.clearHistory()
  this.saveNotice = null
  return true
}

/** Clean filesystem rows keep the independently verified original source. */
export async function flushFilesystemDraft(this: EditorState): Promise<boolean> {
  if (this.saving) return false
  const identity = this.currentDraftIdentity()
  if (this.source !== 'filesystem' || !identity || !this.filesystemRecovery || !this.draftKeymap) return false
  if (this.hasPendingFirmwareRecovery) return !this.isDirty && equal(await loadStoredDraft(identity), this._filesystemRow)
  const token = this._selectGeneration
  const draft = cloneParsedKeymap(this.draftKeymap)
  const layer = this._storedLayerOperation()
  const recovery = copy(this.filesystemRecovery)
  const current = () => token === this._selectGeneration && equal(this.draftKeymap, draft) && equal(this.filesystemRecovery, recovery)
  const write = this._draftWrites.then(async () => {
    if (!current()) return false
    let accepted: StoredDraft | null = null
    await saveStoredDraft(identity, draft, layer, undefined, {
      expected: this._filesystemRow, isCurrent: current, accepted: row => { accepted = row }
    }, recovery)
    if (!current()) return false
    this._filesystemRow = accepted
    return true
  }).catch(() => {
    if (token === this._selectGeneration) this.saveNotice = { kind: 'error', messages: ['Could not retain filesystem recovery safely; firmware was not saved.'] }
    return false
  })
  this._draftWrites = write.then(() => undefined)
  return write
}

/** Discard working firmware only after its guarded baseline revert commits. */
export async function discardFilesystemDraft(this: EditorState): Promise<boolean> {
  const identity = this.currentDraftIdentity()
  const layer = this._storedLayerOperation()
  if (this.source !== 'filesystem' || this.saving || !identity || !layer || !this.filesystemRecovery || !this.baselineKeymap || !this.isDirty) return false
  const session = this._selectGeneration
  const documentId = this.filesystemDocumentId
  const sameSession = () => this.source === 'filesystem' && this._selectGeneration === session && this.filesystemDocumentId === documentId
  const capture = () => ({ draft: this.draftKeymap, layout: this.layout, baseline: this.baselineKeymap, baselineLayout: this.baselineLayout,
    recovery: this.filesystemRecovery, layer: this._storedLayerOperation(), pending: this.hasPendingFirmwareRecovery })
  const before = copy(capture())
  const history = this.undoStack
  const redo = this.redoStack
  const current = () => sameSession() && equal(before, capture()) && this.undoStack === history && this.redoStack === redo
  const draft = cloneParsedKeymap(this.baselineKeymap)
  const layout = cloneLayout(this.baselineLayout)
  const recovery = copy(this.filesystemRecovery)
  const snapshot = { ...initialLayerSnapshot(draft, recovery.baseline.source), ids: [...layer.baselineIds], identityAware: layer.snapshot.identityAware }
  const nextLayer = { ...layer, snapshot, view: snapshot.identityAware ? remapLayerIdentityView(layer.view, layer.snapshot.ids, snapshot.ids) : layer.view }
  let committed = false
  let discarded = false
  this.saving = true
  this._cancelPersistTimer()
  try {
    await this._draftWrites
    await saveStoredDraft(identity, draft, nextLayer, undefined, {
      expected: this._filesystemRow, isCurrent: current, accepted: row => {
        committed = true
        if (!sameSession()) return
        this._filesystemRow = row
        if (!current()) return
        this.draftKeymap = draft
        this.layout = layout
        this.layerOperationSnapshot = snapshot
        this.layerView = nextLayer.view
        if (snapshot.identityAware) {
          this.legendHover = null
          dismissLegendDecode()
        }
        this.hasPendingFirmwareRecovery = !!recovery.attempt
        this.clearHistory()
        this.saveNotice = null
        discarded = true
      }
    }, recovery)
    // An edit after put is not covered by Discard consent. Keep its live history
    // and retain it against the committed row rather than replacing it in memory.
    if (!discarded && sameSession() && equal(this.filesystemRecovery, recovery)) {
      if (!await this.retainFilesystemFailure() && sameSession()) this.saveNotice = { kind: 'error', messages: ['Discard was superseded. Newer edits remain in memory; browser recovery could not be retained. Do not reload or close this page.'] }
    }
    return discarded
  } catch {
    if (sameSession()) this.saveNotice = { kind: 'error', messages: ['Could not discard filesystem draft safely. Live work and recovery were retained.'] }
    return committed && discarded
  } finally {
    if (sameSession()) this.saving = false
  }
}

/** No implicit recovery dialog on startup: decline is simply leaving this row intact. */
export async function restoreFilesystemDraft(this: EditorState): Promise<boolean> {
  const identity = this.currentDraftIdentity()
  if (this.source !== 'filesystem' || !identity || !this._filesystemRow) return false
  const token = this._selectGeneration
  const row = await loadStoredDraft(identity)
  if (token !== this._selectGeneration || !equal(row, this._filesystemRow)) return false
  this.draftKeymap = cloneParsedKeymap(row!.draftKeymap)
  if (row!.layerOperation) {
    this.layerOperationSnapshot = cloneLayerSnapshot(row!.layerOperation.snapshot)
    this.layerView = copy(row!.layerOperation.view)
  }
  this.hasPendingFirmwareRecovery = !!row!.filesystem?.attempt
  this.clearHistory()
  return true
}

export async function retainFilesystemWork(this: EditorState): Promise<boolean> {
  if (this.saving) return false
  const identity = this.currentDraftIdentity()
  const token = this._selectGeneration
  const capture = () => ({ draft: this.draftKeymap, layout: this.layout, recovery: this.filesystemRecovery, layer: this._storedLayerOperation(), pending: this.hasPendingFirmwareRecovery })
  const before = copy(capture())
  const current = () => token === this._selectGeneration && equal(before, capture())
  if (!identity) return false
  try {
    if (before.pending) {
      await this._draftWrites
      const row = await loadStoredDraft(identity)
      if (!current() || !row || !equal(row, this._filesystemRow) || !equal(row.filesystem, before.recovery)) return false
      // A clean visible baseline may be declined recovery: never overwrite it.
      // Dirty work can leave once the complete working revision is retained,
      // independently of the unresolved attempt (which must survive unchanged).
      if (this.isDirty && (!equal(row.draftKeymap, before.draft) || !equal(row.layerOperation, before.layer))) {
        if (!before.recovery?.attempt || !await this.retainFilesystemFailure()) return false
      }
    } else if (!await this.flushFilesystemDraft()) return false
    const row = await loadStoredDraft(identity)
    return current() && equal(row, this._filesystemRow)
  } catch { return false }
}

/** Captured revision must still be live until the stream starts. */
export function filesystemAttemptMatchesDraft(this: EditorState, attempt: FilesystemAttempt): boolean {
  return this.source === 'filesystem' && this.filesystemDocumentId === attempt.documentId && this._selectGeneration === attempt.session &&
    equal(this.draftKeymap, attempt.sent) && equal(this.layout, attempt.layout) && equal(this._storedLayerOperation(), attempt.layer)
}

export async function verifyFilesystemAttempt(this: EditorState, attempt: FilesystemAttempt): Promise<boolean> {
  const identity = this.currentDraftIdentity()
  if (!identity || !this.filesystemAttemptMatchesDraft(attempt)) return false
  const row = await loadStoredDraft(identity)
  return this.filesystemAttemptMatchesDraft(attempt) && equal(row, this._filesystemRow) &&
    equal(this.filesystemRecovery?.attempt, attempt) && equal(row?.filesystem?.attempt, attempt)
}

/** Capture synchronously before a picker, permission query or IndexedDB yield. */
export function captureFilesystemSave(this: EditorState): FilesystemAttempt {
  if (this.source !== 'filesystem' || !this.filesystemDocumentId || !this.filesystemRecovery || !this.draftKeymap || !this.layout || this.hasPendingFirmwareRecovery || !this.isDirty) throw new Error('No writable filesystem firmware draft')
  const baseline = copy(this.filesystemRecovery.baseline)
  const sent = cloneParsedKeymap(this.draftKeymap)
  const layout = cloneLayout(this.layout)!
  const built = buildFilesystemKeymap({ keymap: sent, layout, originalSource: baseline.source })
  const attempt: FilesystemAttempt = { version: 1, stage: 'prepared', id: crypto.randomUUID(), documentId: this.filesystemDocumentId, session: this._selectGeneration,
    baseline, sent, layout, layer: this._storedLayerOperation(), code: built.code, bytes: Array.from(new TextEncoder().encode(built.code)) }
  validateAttempt(attempt, this.filesystemRecovery)
  return attempt
}

export async function retainFilesystemAttempt(this: EditorState, input: FilesystemAttempt): Promise<boolean> {
  const attempt = copy(input)
  const identity = this.currentDraftIdentity()
  const current = () => this.source === 'filesystem' && this.filesystemDocumentId === attempt.documentId && this._selectGeneration === attempt.session &&
    equal(this.draftKeymap, attempt.sent) && equal(this.layout, attempt.layout) && equal(this._storedLayerOperation(), attempt.layer) &&
    equal(this.filesystemRecovery?.baseline, attempt.baseline) && !this.filesystemRecovery?.attempt && !this.hasPendingFirmwareRecovery
  if (!identity || !current()) return false
  try { validateAttempt(attempt, this.filesystemRecovery!) } catch { return false }
  const recovery = { ...copy(this.filesystemRecovery!), attempt }
  try {
    await this._draftWrites
    if (!current()) return false
    let accepted: StoredDraft | null = null
    await saveStoredDraft(identity, attempt.sent, attempt.layer, undefined, {
      expected: this._filesystemRow, isCurrent: current, accepted: row => {
        accepted = row
        if (this.source === 'filesystem' && this.filesystemDocumentId === attempt.documentId && this._selectGeneration === attempt.session) {
          this._filesystemRow = row
          this.filesystemRecovery = recovery
        }
      }
    }, recovery)
    const retained = await loadStoredDraft(identity)
    return this.filesystemAttemptMatchesDraft(attempt) && equal(retained, accepted)
  } catch { return false }
}

/** Commit uncertainty BEFORE invocation; a crash in the gap remains protected. */
export async function markFilesystemWritePossible(this: EditorState, input: FilesystemAttempt): Promise<FilesystemAttempt | null> {
  const attempt = copy(input)
  const identity = this.currentDraftIdentity()
  const current = () => this.filesystemAttemptMatchesDraft(attempt) && equal(this.filesystemRecovery?.attempt, attempt)
  if (!identity || attempt.version !== 1 || attempt.stage !== 'prepared' || !current()) return null
  const next: FilesystemAttempt = { ...attempt, stage: 'write-possible' }
  const recovery = { ...copy(this.filesystemRecovery!), attempt: next }
  try {
    await saveStoredDraft(identity, attempt.sent, attempt.layer, undefined, {
      expected: this._filesystemRow, isCurrent: current, accepted: row => {
        if (this.source !== 'filesystem' || this.filesystemDocumentId !== attempt.documentId || this._selectGeneration !== attempt.session) return
        this._filesystemRow = row
        this.filesystemRecovery = recovery
      }
    }, recovery)
    return next
  } catch { return null }
}

/** Keep newer live edits alongside, never instead of, an uncertain sent revision. */
export async function retainFilesystemFailure(this: EditorState, attempt?: FilesystemAttempt, unstarted = false): Promise<boolean> {
  const session = this._selectGeneration
  const documentId = this.filesystemDocumentId
  const identity = this.currentDraftIdentity()
  const sameSession = () => this.source === 'filesystem' && this.filesystemDocumentId === documentId && this._selectGeneration === session
  if (!identity || (attempt && (attempt.documentId !== documentId || attempt.session !== session))) return false
  let retired = false
  try {
    await this._draftWrites
    while (sameSession()) {
      const draft = this.draftKeymap && cloneParsedKeymap(this.draftKeymap)
      const recovery = this.filesystemRecovery && copy(this.filesystemRecovery)
      const layer = this._storedLayerOperation()
      const sameDraft = () => equal(this.draftKeymap, draft) && equal(this._storedLayerOperation(), layer)
      const current = () => sameSession() && equal(this.filesystemRecovery, recovery) && sameDraft()
      if (!draft || !recovery || (attempt && !equal(recovery.attempt, attempt) && !(unstarted && !recovery.attempt))) return false
      if (unstarted && recovery.attempt && (recovery.attempt.version !== 1 || recovery.attempt.stage !== 'prepared')) return false
      const retainedRecovery = copy(recovery)
      if (unstarted) delete retainedRecovery.attempt
      let accepted: StoredDraft | null = null
      try {
        await saveStoredDraft(identity, draft, layer, undefined, {
          expected: this._filesystemRow, isCurrent: current, accepted: row => {
            accepted = row
            retired = unstarted
            if (!sameSession() || !equal(this.filesystemRecovery, recovery)) return
            this._filesystemRow = row
            this.filesystemRecovery = retainedRecovery
            if (retired) this.hasPendingFirmwareRecovery = false
          }
        }, retainedRecovery)
      } catch {
        if (sameSession() && equal(this.filesystemRecovery, recovery) && !sameDraft()) continue
        return retired
      }
      // Retirement is committed, independently of retaining later working edits.
      // Never retry cleanup with the old attempt or resurrect its pending lock.
      if (retired) {
        if (sameSession() && equal(this.filesystemRecovery, retainedRecovery) && !sameDraft()) await this.retainFilesystemFailure()
        return true
      }
      if (!sameSession() || !equal(this.filesystemRecovery, retainedRecovery) || !equal(await loadStoredDraft(identity), accepted)) return false
      if (sameSession() && sameDraft()) return true
      // Edits after put must use the committed revision, not a stale expected row.
    }
    return false
  } catch { return retired }
}

export type FilesystemReconciliation = {
  session: number
  row: StoredDraft
  draft: NonNullable<EditorState['draftKeymap']>
  layout: EditorState['layout']
  layer: ReturnType<EditorState['_storedLayerOperation']>
}

/** A fresh session fence, not a new attempt or a recapture of intended output. */
export function captureFilesystemReconciliation(this: EditorState): FilesystemReconciliation {
  const row = this._filesystemRow
  if (this.source !== 'filesystem' || !row?.filesystem?.attempt || !this.draftKeymap ||
      row.filesystem.attempt.documentId !== this.filesystemDocumentId || !equal(row.filesystem, this.filesystemRecovery)) throw new Error('No retained filesystem attempt to reconcile')
  validateAttempt(row.filesystem.attempt, row.filesystem)
  return copy({ session: this._selectGeneration, row, draft: this.draftKeymap, layout: this.layout, layer: this._storedLayerOperation() })
}

export function filesystemReconciliationIsCurrent(this: EditorState, context: FilesystemReconciliation): boolean {
  return this.source === 'filesystem' && this._selectGeneration === context.session &&
    this.filesystemDocumentId === context.row.filesystemDocumentId && equal(this._filesystemRow, context.row) &&
    equal(this.filesystemRecovery, context.row.filesystem) && equal(this.draftKeymap, context.draft) &&
    equal(this.layout, context.layout) && equal(this._storedLayerOperation(), context.layer)
}

function reconciliationWork(context: FilesystemReconciliation) {
  // A clean baseline shown after declining Restore is not consent to discard
  // the stored mutable draft. Reconcile the attempt, not that recovery decision.
  const declined = equal(context.draft, presentedBaseline(context.row.filesystem!)) &&
    !equal(context.draft, context.row.draftKeymap)
  return { declined, draft: declined ? context.row.draftKeymap : context.draft,
    layer: declined ? context.row.layerOperation : context.layer }
}

/** Explicit full-byte proof of original bytes permits this exact retirement. */
export async function retireFilesystemReconciliation(this: EditorState, input: FilesystemReconciliation): Promise<boolean> {
  const context = copy(input)
  const identity = this.currentDraftIdentity()
  const current = () => this.filesystemReconciliationIsCurrent(context)
  if (!identity || !current()) return false
  const work = reconciliationWork(context)
  const recovery = copy(context.row.filesystem!)
  delete recovery.attempt
  let committed = false
  try {
    await this._draftWrites
    await saveStoredDraft(identity, work.draft, work.layer, undefined, {
      expected: context.row, isCurrent: current, accepted: row => {
        committed = true
        if (this._selectGeneration !== context.session || this.filesystemDocumentId !== context.row.filesystemDocumentId) return
        this._filesystemRow = row
        this.filesystemRecovery = recovery
        this.hasPendingFirmwareRecovery = work.declined
        this.filesystemVerifiedSave = false
        this.saveNotice = { kind: 'warning', messages: ['Original firmware bytes verified; retained attempt retired without writing. Host files not written.'] }
      }
    }, recovery)
    if (!work.declined && this._selectGeneration === context.session && equal(this.filesystemRecovery, recovery) &&
        (!equal(this.draftKeymap, work.draft) || !equal(this._storedLayerOperation(), work.layer))) {
      if (!await this.retainFilesystemFailure()) this.saveNotice = { kind: 'warning', messages: ['Attempt retired without writing; host files not written. Newer edits remain in memory; browser recovery could not be retained.'] }
    }
    return true
  } catch { return committed }
}

/** Only closed/read-back Save or explicitly confirmed no-write reconciliation. */
export async function acceptFilesystemReceipt(this: EditorState, input: FilesystemAttempt, observed: readonly number[], reconciliation?: FilesystemReconciliation): Promise<boolean> {
  const attempt = copy(input)
  const bytes = [...observed]
  const context = reconciliation && copy(reconciliation)
  const session = context?.session ?? attempt.session
  const identity = this.currentDraftIdentity()
  const current = () => this.source === 'filesystem' && this.filesystemDocumentId === attempt.documentId && this._selectGeneration === session &&
    equal(this.filesystemRecovery?.attempt, attempt) && equal(this._filesystemRow?.filesystem?.attempt, attempt)
  if (!identity || !current() || (context && !this.filesystemReconciliationIsCurrent(context)) || !equal(bytes, attempt.bytes)) return false
  try { validateAttempt(attempt, this.filesystemRecovery!) } catch { return false }
  const draft = cloneParsedKeymap(this.draftKeymap!)
  const layer = this._storedLayerOperation()
  const work = context ? reconciliationWork(context) : { declined: false, draft, layer }
  const recovery = receiptRecovery(attempt, bytes)
  const baseline = recovery.baseline
  const presentation = presentedBaseline(recovery)
  const nextLayer = work.layer && { ...work.layer, baselineFingerprint: layerBaselineFingerprint(presentation),
    baselineSource: baseline.source, baselineIds: [...recovery.display!.layerIds] }
  const unchanged = equal(work.draft, attempt.sent)
  const nextDraft = unchanged ? presentation : work.draft
  const stillCurrent = () => current() && (!context || this.filesystemReconciliationIsCurrent(context)) && equal(this.draftKeymap, draft) && equal(this._storedLayerOperation(), layer)
  let committed = false
  try {
    await this._draftWrites
    if (!stillCurrent()) return false
    let accepted: StoredDraft | null = null
    await saveStoredDraft(identity, nextDraft, nextLayer, undefined, {
      expected: this._filesystemRow, isCurrent: stillCurrent, accepted: row => {
        committed = true
        accepted = row
        if (!current()) return
        // The transaction is authoritative now. A later edit cannot undo its
        // receipt, and accepting the sent baseline must never replace that edit.
        const sameDraft = stillCurrent()
        this._filesystemRow = row
        this.filesystemRecovery = recovery
        this.baselineKeymap = cloneParsedKeymap(presentation)
        this._baselineLayerIds = [...recovery.display!.layerIds]
        this.baselineLayout = cloneLayout(baseline.layout)
        if (sameDraft) this.draftKeymap = cloneParsedKeymap(work.declined ? presentation : nextDraft)
        this.filesystemVerifiedSave = !context
        this.hasPendingFirmwareRecovery = work.declined && !equal(nextDraft, presentation)
        this.saveNotice = { kind: 'warning', messages: [`${context ? 'Firmware reconciled from verified current bytes without writing' : 'Firmware saved'}; host files not written. Raw .keymap only; sidecars are not synchronized. Layer display names remain browser-local; DTS nodes are not renamed.`] }
      }
    }, recovery)
    if (!work.declined && this._selectGeneration === session && this._filesystemRow === accepted &&
        (!equal(this.draftKeymap, nextDraft) || !equal(this._storedLayerOperation(), nextLayer))) {
      if (!await this.retainFilesystemFailure()) {
        this.saveNotice = { kind: 'warning', messages: [`${context ? 'Firmware reconciled without writing' : 'Firmware saved'}; host files not written. Newer edits remain in memory; browser recovery could not be retained.`] }
      }
    }
    return true
  } catch {
    if (committed) return true
    if (current()) this.hasPendingFirmwareRecovery = true
    return false
  }
}
