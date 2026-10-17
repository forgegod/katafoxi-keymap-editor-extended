import type { EditorState } from './editor/state.svelte'
import type { FilesystemAttempt } from './draft-storage'
import { loadStoredDraft } from './draft-storage'
import { authorizeSaveViaFilePicker, grantWritePermission, queryWritePermission, verifyFilesystemIdentity, type PermissionState, type FilesystemAccessEnv, type FilesystemDirectoryHandleLike, type FilesystemFileHandleLike, type FilesystemWritableStreamLike } from './filesystem-access'

export type FilesystemSaveHandles = {
  documentId: string
  file: FilesystemFileHandleLike
  directory?: FilesystemDirectoryHandleLike
  geometry?: FilesystemFileHandleLike
}

const sameBytes = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((byte, i) => byte === b[i])
async function readBytes(handle: FilesystemFileHandleLike): Promise<number[]> {
  const file = await handle.getFile()
  return Array.from(new Uint8Array(await file.arrayBuffer()))
}

type PendingGrant = { attempt: FilesystemAttempt; handles: FilesystemSaveHandles; picked: FilesystemFileHandleLike }
const pendingGrants = new WeakMap<EditorState, PendingGrant>()

/** Explicit recovery action. This path NEVER requests write permission or opens
 * a stream; confirmation accepts observed intended bytes, not a failed Save. */
export async function reconcileFilesystemSave(state: EditorState, env: FilesystemAccessEnv, handles: FilesystemSaveHandles,
  confirmIntended: (attempt: FilesystemAttempt) => boolean | Promise<boolean>): Promise<boolean> {
  if (state.saving || state.source !== 'filesystem' || handles.documentId !== state.filesystemDocumentId || !state.filesystemRecovery?.attempt) return false
  handles = { ...handles }
  const session = state._selectGeneration
  const sameSession = () => state.source === 'filesystem' && state.filesystemDocumentId === handles.documentId && state._selectGeneration === session
  pendingGrants.delete(state)
  state.saving = true
  try {
    const context = state.captureFilesystemReconciliation()
    const attempt = context.row.filesystem!.attempt!
    const current = () => state.filesystemReconciliationIsCurrent(context)
    const route = attempt.baseline.route
    if (route.kind === 'directory' && !handles.directory) throw new Error('Directory context is disconnected')
    if (!!attempt.baseline.geometry !== !!handles.geometry) throw new Error('Geometry context is disconnected')
    const proof = { accepted: handles.file, isCurrent: current,
      ...(route.kind === 'directory' ? { directory: { handle: handles.directory!, entryName: route.entryName } } : {}) }
    // Picker invocation is synchronous in this explicit action, before IDB.
    const { handle: picked } = await authorizeSaveViaFilePicker({ env, ...proof })
    const readVerified = async () => {
      if (!current()) throw new Error('Reconciliation revision changed')
      const row = await loadStoredDraft(state.currentDraftIdentity()!)
      if (!current() || JSON.stringify(row) !== JSON.stringify(context.row)) throw new Error('Stored recovery changed')
      await verifyFilesystemIdentity(picked, proof)
      if (attempt.baseline.geometry && route.kind === 'directory') {
        const entry = await handles.directory!.getFileHandle!(attempt.baseline.geometry.name, { create: false })
        if (!await entry.isSameEntry(handles.geometry!)) throw new Error('Geometry directory entry changed')
      }
      if (attempt.baseline.geometry && !sameBytes(await readBytes(handles.geometry!), attempt.baseline.geometry.bytes)) throw new Error('Geometry dependency changed')
      const observed = await readBytes(picked)
      if (!current()) throw new Error('Reconciliation revision changed')
      return observed
    }
    const observed = await readVerified()
    // Equal original/intended is deliberately the confirmed current-bytes path.
    if (sameBytes(observed, attempt.bytes)) {
      if (!await confirmIntended(JSON.parse(JSON.stringify(attempt)))) throw new Error('Intended-byte reconciliation was not confirmed')
      const confirmed = await readVerified()
      if (!sameBytes(confirmed, observed) || !await state.acceptFilesystemReceipt(attempt, confirmed, context)) throw new Error('Could not retain reconciled receipt')
    } else if (sameBytes(observed, attempt.baseline.bytes)) {
      if (!await state.retireFilesystemReconciliation(context)) throw new Error('Could not retire the retained attempt')
    } else throw new Error('Firmware conflict: bytes match neither original nor intended output')
    return true
  } catch (error) {
    if (sameSession()) {
      state.hasPendingFirmwareRecovery = true
      state.saveNotice = { kind: 'error', messages: [`Reconciliation stopped; recovery retained. Reconnect or transfer manually through Clipboard. ${error instanceof Error ? error.message : 'File operation failed'}`] }
    }
    return false
  } finally {
    if (sameSession()) state.saving = false
  }
}

/** Explicit user action only; never called by persistence or lifecycle hooks. */
export function saveFilesystemKeymap(state: EditorState, env: FilesystemAccessEnv, handles: FilesystemSaveHandles): Promise<boolean> {
  if (state.saving || state.source !== 'filesystem' || handles.documentId !== state.filesystemDocumentId || !state.isDirty || state.hasPendingFirmwareRecovery) return Promise.resolve(false)
  pendingGrants.delete(state)
  return runSave(state, env, handles)
}

/** Separate fresh gesture; this is the only orchestrator action that may prompt. */
export function grantFilesystemSaveAccess(state: EditorState): Promise<boolean> {
  const pending = pendingGrants.get(state)
  if (state.saving) return Promise.resolve(false)
  pendingGrants.delete(state)
  if (!pending || !state.filesystemAttemptMatchesDraft(pending.attempt) || state.hasPendingFirmwareRecovery || state.filesystemRecovery?.attempt) return Promise.resolve(false)
  // Invoke before any await. The continuation still rechecks identity, storage,
  // permission and every captured byte; this gesture does not authorize a retry.
  const permission = grantWritePermission(pending.picked)
  return runSave(state, undefined, pending.handles, { ...pending, permission })
}

async function runSave(state: EditorState, env: FilesystemAccessEnv | undefined, handles: FilesystemSaveHandles,
  prepared?: PendingGrant & { permission: Promise<PermissionState> }): Promise<boolean> {
  handles = { ...handles }
  const session = state._selectGeneration
  const current = () => state.source === 'filesystem' && state._selectGeneration === session && state.filesystemDocumentId === handles.documentId
  let stream: FilesystemWritableStreamLike | undefined
  let closed = false
  let stage = 'capture'
  let attempt: FilesystemAttempt | undefined

  state.saving = true
  try {
    attempt = prepared?.attempt ?? state.captureFilesystemSave()
    if (Object.keys(handles).some(key => !['documentId', 'file', 'directory', 'geometry'].includes(key))) throw new Error('Only one raw .keymap output is permitted')
    const route = attempt.baseline.route
    if (!route || (route.kind !== 'file' && route.kind !== 'directory')) throw new Error('Missing filesystem route provenance')
    if (route.kind === 'directory' && !handles.directory) throw new Error('Required directory context is disconnected')
    if (!!attempt.baseline.geometry !== !!handles.geometry) throw new Error('Geometry context does not match the captured dependency')
    const proof = { accepted: handles.file, isCurrent: current,
      ...(route.kind === 'directory' ? { directory: { handle: handles.directory!, entryName: route.entryName } } : {}) }
    stage = 'authorization'
    // Start the picker synchronously in the initiating gesture, before storage yields.
    let picked: FilesystemFileHandleLike
    if (prepared) {
      stage = 'permission'
      if (await prepared.permission !== 'granted') throw new Error('Write permission was not granted')
      if (!await state.retainFilesystemAttempt(attempt)) throw new Error('Could not retain the captured attempt')
      picked = prepared.picked
    } else {
      const authorization = authorizeSaveViaFilePicker({ env: env!, ...proof })
        .then(value => ({ value }), error => ({ error }))
      if (!await state.retainFilesystemAttempt(attempt)) throw new Error('Could not retain the captured attempt')
      const result = await authorization
      if ('error' in result) throw result.error
      picked = result.value.handle
    }
    stage = 'permission'
    const permission = await queryWritePermission(picked)
    if (permission === 'prompt' && !prepared && current()) pendingGrants.set(state, { attempt, handles, picked })
    if (permission !== 'granted') throw new Error('Write permission is not granted; an explicit access action is required')
    if (!current()) throw new Error('Save session changed')
    stage = 'preflight'
    if (!await state.verifyFilesystemAttempt(attempt)) throw new Error('Stored recovery changed during Save preparation')
    if (await queryWritePermission(picked) !== 'granted') throw new Error('Write permission was revoked')
    await verifyFilesystemIdentity(picked, proof)
    if (attempt.baseline.geometry && route.kind === 'directory') {
      const entry = await handles.directory!.getFileHandle!(attempt.baseline.geometry.name, { create: false })
      if (!await entry.isSameEntry(handles.geometry!)) throw new Error('Geometry directory entry changed')
      if (!current()) throw new Error('Save session changed')
    }
    if (attempt.baseline.geometry && !sameBytes(await readBytes(handles.geometry!), attempt.baseline.geometry.bytes)) throw new Error('Geometry dependency changed externally')
    if (!sameBytes(await readBytes(picked), attempt.baseline.bytes)) throw new Error('Firmware changed externally; original baseline and draft retained')
    if (!current()) throw new Error('Save session changed')
    if (!state.filesystemAttemptMatchesDraft(attempt)) throw new Error('Firmware changed during Save preparation')
    stage = 'create'
    if (!picked.createWritable) throw new Error('Selected file does not support writing')
    const possible = await state.markFilesystemWritePossible(attempt)
    if (!possible) throw new Error('Could not retain write-possible recovery')
    attempt = possible
    // Persistence yields too: repeat permission, identity and full-byte checks
    // after the durable stage transition, immediately before invocation.
    if (!await state.verifyFilesystemAttempt(attempt)) throw new Error('Stored recovery changed before stream creation')
    if (await queryWritePermission(picked) !== 'granted') throw new Error('Write permission was revoked')
    await verifyFilesystemIdentity(picked, proof)
    if (attempt.baseline.geometry && route.kind === 'directory') {
      const entry = await handles.directory!.getFileHandle!(attempt.baseline.geometry.name, { create: false })
      if (!await entry.isSameEntry(handles.geometry!)) throw new Error('Geometry directory entry changed')
    }
    if (attempt.baseline.geometry && !sameBytes(await readBytes(handles.geometry!), attempt.baseline.geometry.bytes)) throw new Error('Geometry dependency changed externally')
    if (!sameBytes(await readBytes(picked), attempt.baseline.bytes) || !current() || !state.filesystemAttemptMatchesDraft(attempt)) throw new Error('Firmware changed before stream creation')
    stream = await picked.createWritable({ keepExistingData: false })
    if (!current()) throw new Error('Save session changed while opening the stream')
    stage = 'write'
    await stream.write(new Uint8Array(attempt.bytes))
    stage = 'close'
    await stream.close()
    closed = true
    stage = 'readback'
    await verifyFilesystemIdentity(picked, proof)
    const observed = await readBytes(picked)
    stage = 'receipt'
    if (!current() || !await state.acceptFilesystemReceipt(attempt, observed)) throw new Error('Could not verify and retain the firmware receipt')
    return true
  } catch (error) {
    if (stream && !closed) {
      try { await stream.abort?.(error) } catch { /* Abort does not prove rollback. */ }
    }
    let retained = false
    const unresolved = state.filesystemRecovery?.attempt
    const possibleWrite = !!unresolved && (unresolved.version !== 1 || unresolved.stage !== 'prepared')
    if (current()) {
      try { retained = await state.retainFilesystemFailure(attempt, !possibleWrite) } catch { /* Keep protection on storage failure. */ }
    }
    if (current()) {
      state.hasPendingFirmwareRecovery = !!state.filesystemRecovery?.attempt
      state.filesystemVerifiedSave = false
      const outcome = state.hasPendingFirmwareRecovery && !retained ? 'Browser recovery cleanup failed; recovery remains pending'
        : possibleWrite ? 'Save not verified; file may have changed' : 'Save stopped before writing; draft remains editable'
      const newerUnretained = !retained || JSON.stringify(state._filesystemRow?.draftKeymap) !== JSON.stringify(state.draftKeymap) ||
        JSON.stringify(state._filesystemRow?.layerOperation) !== JSON.stringify(state._storedLayerOperation())
      state.saveNotice = { kind: 'error', messages: [`${outcome} (${handles.file.name}, ${stage}). ${error instanceof Error ? error.message : 'File operation failed'}`,
        ...(newerUnretained ? ['Newer edits remain in memory; browser recovery could not be retained. Do not reload or close this page.'] : [])] }
    }
    return false
  } finally {
    if (current()) state.saving = false
  }
}
