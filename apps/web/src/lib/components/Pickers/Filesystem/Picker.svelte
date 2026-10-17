<script lang="ts">
  /**
   * Filesystem source picker.
   *
   * Bounded file/folder discovery, staged optional geometry, a separate fresh
   * Grant gesture, "Save .keymap" with per-attempt file reselection, explicit
   * discard/reload plus an ordinary Reload, reachable reconciliation for a
   * pending attempt, opt-in handle remembering/forget, protected recovery rows,
   * reconnect with fresh same-entry proof, manual Clipboard transfer, and the
   * Clipboard escape hatch.
   *
   * It drives the existing domain modules and never duplicates their protocol.
   * Mounting performs zero picker calls, zero permission requests and zero disk
   * reads. Every asynchronous continuation is fenced against destroy and a
   * newer gesture so a stale result can never re-label the current source.
   */
  import { onDestroy, untrack } from 'svelte'
  import { buildFilesystemKeymap } from '@keymap-editor/keymap-core'
  import type { FilesystemBaseline, StoredDraft } from '../../../draft-storage'
  import { listStoredFilesystemDrafts } from '../../../draft-storage'
  import {
    detectFilesystemAccess,
    discoverDirectoryKeymaps,
    matchingGeometryFilename,
    openFirmwareCandidate,
    pickFirmwareFile,
    readFirmwareCandidate,
    readGeometryCandidate,
    verifyFilesystemIdentity,
    FilesystemAccessError,
    type DirectoryInventory,
    type DiscoveredKeymap,
    type FilesystemAccessEnv,
    type FilesystemDirectoryHandleLike,
    type FilesystemFileHandleLike,
    type FirmwareCandidate,
    type GeometryCandidate
  } from '../../../filesystem-access'
  import {
    canGrantFilesystemSaveAccess,
    grantFilesystemSaveAccess,
    reconcileFilesystemSave,
    saveFilesystemKeymap,
    type FilesystemSaveHandles
  } from '../../../filesystem-save'
  import { editor } from '../../../editor.svelte.js'
  import type { FilesystemKeyboardSelection } from '../../../editor/types'
  import type { FilesystemHandlesPayload } from '../../../filesystem-handles'
  import { FILESYSTEM_INFERRED_LAYOUT_WARNING, buildFilesystemBaseline, pickGeometryFile } from './baseline'
  import { defaultHandlesPort, type FilesystemHandlesPort } from './handles-port'
  import { defaultReloadPort, type FilesystemReloadPort } from './reload-port'
  import { windowFilesystemEnv } from './env'

  interface Props {
    /** Returns the real acceptance boolean through the App → editor chain. */
    onSelect: (event: FilesystemKeyboardSelection) => boolean | void | Promise<boolean | void>
    onUseClipboard?: () => void
    /** Injectable for tests; defaults to the live window capabilities. */
    env?: FilesystemAccessEnv
    handles?: FilesystemHandlesPort
    canGrantAccess?: () => boolean
    /** Domain staged reload/adopt seam; defaults to the real editor API. */
    reload?: FilesystemReloadPort
    onStatus?: (status: { name: string | null; busy: boolean }) => void
  }

  let { onSelect, onUseClipboard, env, handles, canGrantAccess, reload, onStatus }: Props =
    $props()

  const resolvedEnv: FilesystemAccessEnv = untrack(() => env ?? windowFilesystemEnv())
  const port: FilesystemHandlesPort = untrack(() => handles ?? defaultHandlesPort())
  const caps = detectFilesystemAccess(resolvedEnv)
  const reloadPort = untrack(() => reload ?? defaultReloadPort())

  type AcceptedSession = {
    documentId: string
    payload: FilesystemHandlesPayload
    route: 'file' | 'directory'
    name: string
  }

  let alive = true
  let generation = 0

  let busy = $state(false)
  let staged = $state<{ candidate: FirmwareCandidate } | null>(null)
  let inventory = $state<DirectoryInventory | null>(null)
  let accepted = $state<AcceptedSession | null>(null)
  let recoveries = $state<StoredDraft[]>([])
  let remember = $state(false)
  let remembered = $state(false)
  let notice = $state<{ kind: 'error' | 'warning' | 'info'; messages: string[] } | null>(null)
  let pendingConfirm = $state<{ resolve: (value: boolean) => void } | null>(null)
  let outcome = $state(0)

  const recoveryOpen = $derived(
    editor.source === 'filesystem' && !!editor.filesystemRecovery && !!editor.draftKeymap
  )

  const connected = $derived(
    !!accepted && accepted.documentId === editor.filesystemDocumentId && editor.source === 'filesystem'
  )

  const grantable = $derived.by(() => {
    void outcome
    return canGrantAccess ? canGrantAccess() : canGrantFilesystemSaveAccess(editor)
  })

  const canReconcile = $derived(
    !busy && !editor.saving && !!editor.filesystemRecovery?.attempt && !pendingConfirm
  )

  const saveEnabled = $derived.by(() => {
    void outcome
    return (
      connected &&
      caps.fileSave.supported &&
      !busy &&
      !editor.saving &&
      editor.isDirty &&
      !editor.hasPendingFirmwareRecovery
    )
  })

  // Open recovery presents the baseline until Restore. Never offer that model
  // as a transfer of different stored work (including its structural metadata).
  const manualNeedsRestore = $derived(
    recoveryOpen && editor.hasPendingFirmwareRecovery && (
      !editor._filesystemRow ||
      JSON.stringify(editor._filesystemRow.draftKeymap) !== JSON.stringify(editor.draftKeymap) ||
      (!!editor._filesystemRow.layerOperation &&
        JSON.stringify(editor._filesystemRow.layerOperation.snapshot) !== JSON.stringify(editor.layerOperationSnapshot))
    )
  )

  const manualCode = $derived.by(() => {
    if (manualNeedsRestore || editor.source !== 'filesystem' || !editor.draftKeymap || !editor.layout || !editor.filesystemRecovery) {
      return ''
    }
    try {
      return buildFilesystemKeymap({
        keymap: editor.draftKeymap,
        layout: editor.layout,
        originalSource: editor.filesystemRecovery.baseline.source
      }).code
    } catch {
      return ''
    }
  })

  function refreshOutcome() {
    outcome += 1
  }

  function stale(gen: number): boolean {
    return !alive || gen !== generation
  }

  function capabilityText(): string {
    const reason = caps.fileOpen.reason ?? caps.directoryDiscovery.reason
    if (reason === 'insecure-context') return 'This page is not a secure context, so files cannot be opened.'
    if (reason === 'api-not-callable') return 'The file picker is not callable in this browser.'
    return 'This browser cannot open files from disk.'
  }

  function fromError(error: unknown): { kind: 'error'; messages: string[] } {
    const message = error instanceof Error && error.message ? error.message : 'The file operation failed'
    return { kind: 'error', messages: [message] }
  }

  function handleCancellation(error: unknown): boolean {
    if (error instanceof FilesystemAccessError && error.code === 'cancelled') {
      notice = null
      return true
    }
    return false
  }

  function isNotFound(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { name?: string }).name === 'NotFoundError'
    )
  }

  const sameBytes = (a: readonly number[], b: readonly number[]) =>
    a.length === b.length && a.every((byte, index) => byte === b[index])

  function handleName(handle: unknown): string {
    const name = (handle as { name?: unknown })?.name
    return typeof name === 'string' && name ? name : 'file'
  }

  function adoptEditorNotice(fallback: string) {
    const stored = editor.saveNotice
    notice = stored
      ? { kind: stored.kind, messages: [...stored.messages] }
      : { kind: 'error', messages: [fallback] }
  }

  function saveHandles(): FilesystemSaveHandles | null {
    if (!accepted) return null
    const out: FilesystemSaveHandles = {
      documentId: accepted.documentId,
      file: accepted.payload.file as FilesystemFileHandleLike
    }
    if (accepted.payload.directory) {
      out.directory = accepted.payload.directory as FilesystemDirectoryHandleLike
    }
    if (accepted.payload.geometry) {
      out.geometry = accepted.payload.geometry as FilesystemFileHandleLike
    }
    return out
  }

  function identityProof(handlesIn: FilesystemSaveHandles, entryName: string) {
    const proof: {
      accepted: FilesystemFileHandleLike
      directory?: { handle: FilesystemDirectoryHandleLike; entryName: string }
    } = { accepted: handlesIn.file }
    if (handlesIn.directory) proof.directory = { handle: handlesIn.directory, entryName }
    return proof
  }

  function routeEntryName(documentId: string): string {
    if (editor.filesystemDocumentId === documentId && editor.filesystemRecovery) {
      const route = editor.filesystemRecovery.baseline.route
      if (route.kind === 'directory') return route.entryName
    }
    return ''
  }

  async function retainedBaseline(documentId: string): Promise<FilesystemBaseline | null> {
    if (editor.source === 'filesystem' && editor.filesystemDocumentId === documentId && editor.filesystemRecovery) {
      return editor.filesystemRecovery.baseline
    }
    try {
      const rows = await listStoredFilesystemDrafts()
      return rows.find((row: StoredDraft) => row.filesystemDocumentId === documentId)?.filesystem?.baseline ?? null
    } catch {
      return null
    }
  }

  /** Select an accepted document; never a fallthrough to another source. */
  async function selectDocument(gen: number, documentId: string, baseline: FilesystemBaseline, warnings: string[]) {
    const selection: FilesystemKeyboardSelection = {
      source: 'filesystem',
      filesystem: { documentId, baseline },
      keymap: baseline.keymap,
      layout: baseline.layout,
      warnings,
      userInitiated: true
    }
    const result = await onSelect(selection)
    if (stale(gen)) return false
    const ok =
      result === false
        ? false
        : editor.source === 'filesystem' && editor.filesystemDocumentId === documentId
    if (!ok) {
      adoptEditorNotice('The filesystem selection was refused; the previous session is unchanged.')
      return false
    }
    return true
  }

  async function finishAccept(
    gen: number,
    documentId: string,
    candidate: FirmwareCandidate,
    baseline: FilesystemBaseline,
    geometryHandle: FilesystemHandlesPayload['geometry'] | undefined,
    rememberFlag: boolean
  ) {
    const warnings = [
      ...candidate.parseWarnings,
      ...(baseline.geometry ? [] : [FILESYSTEM_INFERRED_LAYOUT_WARNING])
    ]
    if (!(await selectDocument(gen, documentId, baseline, warnings))) return false
    const payload: FilesystemHandlesPayload = { file: candidate.handle }
    if (candidate.directory) {
      payload.directory = candidate.directory as unknown as FilesystemHandlesPayload['directory']
    }
    if (geometryHandle) payload.geometry = geometryHandle
    const acceptedResult = await port.accept(documentId, payload, rememberFlag)
    if (stale(gen)) return false
    remembered = acceptedResult.remembered
    accepted = { documentId, payload, route: baseline.route.kind, name: candidate.name }
    staged = null
    inventory = null
    refreshOutcome()
    notice = acceptedResult.warning ? { kind: 'warning', messages: [acceptedResult.warning] } : null
    return true
  }

  async function commitCandidate(gen: number, candidate: FirmwareCandidate, geometry: GeometryCandidate | undefined) {
    const baseline = buildFilesystemBaseline(candidate, geometry)
    const resolution = await port.identify(candidate.handle)
    if (stale(gen)) return
    await finishAccept(gen, resolution.documentId, candidate, baseline, geometry?.handle, remember)
  }

  async function openFile() {
    if (busy || !caps.fileOpen.supported) return
    const gen = generation
    busy = true
    notice = null
    try {
      const candidate = await openFirmwareCandidate(resolvedEnv)
      if (stale(gen)) return
      staged = { candidate }
      inventory = null
    } catch (error) {
      if (!stale(gen) && !handleCancellation(error)) notice = fromError(error)
    } finally {
      if (!stale(gen)) busy = false
    }
  }

  async function openFolder() {
    if (busy || !caps.directoryDiscovery.supported || typeof resolvedEnv.showDirectoryPicker !== 'function') return
    const gen = generation
    busy = true
    notice = null
    try {
      const directory = await resolvedEnv.showDirectoryPicker({ mode: 'read' })
      const discovered = await discoverDirectoryKeymaps(directory)
      if (stale(gen)) return
      inventory = discovered
      staged = null
    } catch (error) {
      if (!stale(gen) && !handleCancellation(error)) notice = fromError(error)
    } finally {
      if (!stale(gen)) busy = false
    }
  }

  async function discoverGeometry(
    directory: FilesystemDirectoryHandleLike,
    keymapName: string
  ): Promise<GeometryCandidate | undefined> {
    const geometryName = matchingGeometryFilename(keymapName)
    if (!geometryName || typeof directory.getFileHandle !== 'function') return undefined
    let handle: FilesystemFileHandleLike
    try {
      handle = await directory.getFileHandle(geometryName, { create: false })
    } catch (error) {
      // Only a missing matching file is absence; anything else refuses.
      if (isNotFound(error)) return undefined
      throw error
    }
    // Invalid or non-layout geometry throws and refuses the whole candidate.
    return readGeometryCandidate(handle)
  }

  async function chooseDiscovered(entry: DiscoveredKeymap) {
    if (busy || !inventory) return
    const gen = generation
    busy = true
    notice = null
    try {
      const directory = inventory.directory
      const candidate = await readFirmwareCandidate(entry.handle, { directory })
      const geometry = await discoverGeometry(directory, candidate.name)
      if (stale(gen)) return
      await commitCandidate(gen, candidate, geometry)
    } catch (error) {
      if (!stale(gen)) notice = fromError(error)
    } finally {
      if (!stale(gen)) busy = false
    }
  }

  async function chooseLayout() {
    if (!staged || busy) return
    const gen = generation
    const candidate = staged.candidate
    busy = true
    notice = null
    try {
      const geometry = await pickGeometryFile(resolvedEnv)
      if (!geometry || stale(gen)) return
      await commitCandidate(gen, candidate, geometry)
    } catch (error) {
      if (!stale(gen) && !handleCancellation(error)) notice = fromError(error)
    } finally {
      if (!stale(gen)) busy = false
    }
  }

  async function openWithoutLayout() {
    if (!staged || busy) return
    const gen = generation
    const candidate = staged.candidate
    busy = true
    notice = null
    try {
      await commitCandidate(gen, candidate, undefined)
    } catch (error) {
      if (!stale(gen)) notice = fromError(error)
    } finally {
      if (!stale(gen)) busy = false
    }
  }

  function cancelCandidate() {
    staged = null
    notice = null
  }

  async function save() {
    const handlesOut = saveHandles()
    if (!handlesOut || busy) return
    const gen = generation
    busy = true
    notice = null
    try {
      const ok = await saveFilesystemKeymap(editor, resolvedEnv, handlesOut)
      if (stale(gen)) return
      const stored = editor.saveNotice
      if (stored) notice = { kind: stored.kind, messages: [...stored.messages] }
      else if (!ok) notice = { kind: 'error', messages: ['Firmware was not saved; your draft and recovery were preserved.'] }
      else notice = { kind: 'info', messages: ['Firmware saved; host files not written.'] }
    } finally {
      if (!stale(gen)) {
        busy = false
        refreshOutcome()
      }
    }
  }

  async function grant() {
    if (busy || !grantable) return
    const gen = generation
    busy = true
    notice = null
    try {
      const ok = await grantFilesystemSaveAccess(editor)
      if (stale(gen)) return
      const stored = editor.saveNotice
      if (stored) notice = { kind: stored.kind, messages: [...stored.messages] }
      else if (!ok) notice = { kind: 'error', messages: ['Write access was not granted; the draft is unchanged.'] }
    } finally {
      if (!stale(gen)) {
        busy = false
        refreshOutcome()
      }
    }
  }

  function confirmIntended(): Promise<boolean> {
    return new Promise(resolve => {
      pendingConfirm = { resolve }
    })
  }

  function answerConfirm(value: boolean) {
    const pending = pendingConfirm
    pendingConfirm = null
    pending?.resolve(value)
  }

  async function reconcile() {
    const handlesOut = saveHandles()
    if (!handlesOut || busy) return
    const gen = generation
    busy = true
    notice = null
    try {
      const ok = await reconcileFilesystemSave(editor, resolvedEnv, handlesOut, () => confirmIntended())
      if (stale(gen)) return
      const stored = editor.saveNotice
      if (stored) notice = { kind: stored.kind, messages: [...stored.messages] }
      else if (!ok) notice = { kind: 'error', messages: ['Reconciliation stopped; recovery was retained.'] }
    } finally {
      if (!stale(gen)) {
        busy = false
        refreshOutcome()
      }
    }
  }

  /** Read the accepted file through a fresh explicit picker and prove identity. */
  async function readGeometryDependency(handlesOut: FilesystemSaveHandles, baseline: FilesystemBaseline) {
    if (baseline.route.kind === 'directory' && !handlesOut.directory) throw new Error('Directory context is disconnected')
    if (!!baseline.geometry !== !!handlesOut.geometry) throw new Error('Geometry context is disconnected')
    if (!baseline.geometry || !handlesOut.geometry) return undefined
    if (baseline.route.kind === 'directory') {
      const entry = await handlesOut.directory!.getFileHandle!(baseline.geometry.name, { create: false })
      if (!await entry.isSameEntry(handlesOut.geometry)) throw new Error('Geometry directory entry changed')
    }
    return readGeometryCandidate(handlesOut.geometry)
  }

  async function readDiskCandidate(gen: number, picking: Promise<FilesystemFileHandleLike>) {
    const handlesOut = saveHandles()
    if (!handlesOut) throw new Error('No connected filesystem document')
    const baseline = editor.filesystemRecovery!.baseline
    const picked = await picking
    await verifyFilesystemIdentity(picked, identityProof(handlesOut, routeEntryName(handlesOut.documentId)))
    const candidate = await readFirmwareCandidate(
      picked,
      handlesOut.directory ? { directory: handlesOut.directory } : {}
    )
    if (stale(gen)) throw new Error('Stale reload')
    const geometry = await readGeometryDependency(handlesOut, baseline)
    await verifyFilesystemIdentity(picked, identityProof(handlesOut, routeEntryName(handlesOut.documentId)))
    if (stale(gen)) throw new Error('Stale reload')
    return { candidate, geometry }
  }

  async function runReload(confirmedDiscard: boolean) {
    if (busy || !reloadPort || !connected) return
    // Explicit confirmation BEFORE any capture or disk read.
    if (confirmedDiscard && !window.confirm(editor.filesystemRecovery?.attempt
      ? 'Discard the firmware draft, retire the unresolved save attempt, and replace the verified baseline with validated disk bytes? This does not verify the earlier save. No disk or host files are written.'
      : 'Discard the firmware draft and replace the verified baseline with validated disk bytes? No disk or host files are written.')) return
    const gen = generation
    const context = reloadPort.capture()
    busy = true
    notice = null
    try {
      const picking = pickFirmwareFile(resolvedEnv)
      const { candidate, geometry } = await readDiskCandidate(gen, picking)
      const baseline = buildFilesystemBaseline(candidate, geometry)
      const ok = await reloadPort.reload(baseline, context, confirmedDiscard)
      if (stale(gen)) return
      const stored = editor.saveNotice
      if (stored) notice = { kind: stored.kind, messages: [...stored.messages] }
      else if (!ok) notice = { kind: 'error', messages: ['Reload was refused; existing work, baseline and recovery were retained.'] }
      else notice = { kind: 'info', messages: ['Firmware reloaded from disk. Host files not written.'] }
    } catch (error) {
      if (!stale(gen) && !handleCancellation(error)) notice = fromError(error)
    } finally {
      if (!stale(gen)) {
        busy = false
        refreshOutcome()
      }
    }
  }

  async function restoreDraft() {
    if (busy) return
    const gen = generation
    busy = true
    notice = null
    try {
      const ok = await editor.restoreFilesystemDraft()
      if (stale(gen)) return
      notice = ok
        ? { kind: 'info', messages: ['Draft restored from browser recovery. Restoring does not resolve a retained attempt — use Reconcile save for that.'] }
        : { kind: 'warning', messages: ['No restorable draft for this document; stored recovery is unchanged.'] }
    } finally {
      if (!stale(gen)) {
        busy = false
        refreshOutcome()
      }
    }
  }

  /** Open a stored recovery row without any handle or disk read. */
  async function openRecovery(row: StoredDraft) {
    if (busy || !row.filesystem || !row.filesystemDocumentId) return
    const gen = generation
    const documentId = row.filesystemDocumentId
    const baseline = row.filesystem.baseline
    busy = true
    notice = null
    try {
      if (!(await selectDocument(gen, documentId, baseline, []))) return
      if (stale(gen)) return
      accepted = null
      notice = {
        kind: 'info',
        messages: [
          'Recovery opened without a file handle. Use Reconnect to attach this file, or transfer the firmware through Clipboard. Save stays disabled until a handle is proved.'
        ]
      }
    } catch (error) {
      if (!stale(gen)) notice = fromError(error)
    } finally {
      if (!stale(gen)) busy = false
    }
  }

  /**
   * Reconnect retained work to its file. The picker starts synchronously (user
   * activation), proves same-entry identity against the retained handle, and
   * reopens the retained baseline — it never adopts changed disk bytes.
   */
  async function reconnect(documentId: string) {
    if (busy) return
    // Start the picker synchronously, before any await.
    const picking = pickFirmwareFile(resolvedEnv)
    const gen = generation
    busy = true
    notice = null
    try {
      const picked = await picking
      const payload = await port.restore(documentId)
      const baseline = await retainedBaseline(documentId)
      if (!payload || !baseline) {
        if (stale(gen)) return
        notice = {
          kind: 'error',
          messages: [
            payload
              ? 'No retained baseline for that document; its recovery cannot be reopened here. Transfer your work through Clipboard.'
              : 'This browser no longer has a usable handle for that file. Transfer your work through Clipboard.'
          ]
        }
        return
      }
      const file = payload.file as FilesystemFileHandleLike
      const directory = payload.directory as FilesystemDirectoryHandleLike | undefined
      const entryName = baseline.route.kind === 'directory' ? baseline.route.entryName : ''
      await verifyFilesystemIdentity(
        picked,
        identityProof({ documentId, file, ...(directory ? { directory } : {}) }, entryName)
      )
      if (stale(gen)) return
      // Identity proof attaches access, not a disk baseline. Keep recovery
      // actions reachable even if the following content inspection fails.
      if (!(await selectDocument(gen, documentId, baseline, []))) return
      const provedPayload = { ...payload, file: picked }
      const result = await port.accept(documentId, provedPayload, false)
      if (stale(gen) || editor.source !== 'filesystem' || editor.filesystemDocumentId !== documentId) return
      remembered = result.remembered
      accepted = { documentId, payload: provedPayload, route: baseline.route.kind, name: handleName(picked) }
      staged = null
      inventory = null
      notice = result.warning ? { kind: 'warning', messages: [result.warning] } : null
      const candidate = await readFirmwareCandidate(picked, directory ? { directory } : {})
      if (stale(gen)) return
      const differs = !sameBytes(candidate.bytes, baseline.bytes)
      await readGeometryDependency({ documentId, file: picked, directory,
        geometry: payload.geometry as FilesystemFileHandleLike | undefined }, baseline)
      if (stale(gen)) return
      if (differs) {
        notice = {
          kind: 'warning',
          messages: [
            'Reconnected to the retained baseline, but the file changed on disk. The retained baseline was not replaced; Save preflight will refuse until you resolve the conflict explicitly.'
          ]
        }
      }
    } catch (error) {
      if (!stale(gen) && !handleCancellation(error)) notice = fromError(error)
    } finally {
      if (!stale(gen)) {
        busy = false
        refreshOutcome()
      }
    }
  }

  async function rememberNow() {
    if (!accepted || busy) return
    const gen = generation
    busy = true
    notice = null
    try {
      const result = await port.accept(accepted.documentId, accepted.payload, true)
      if (stale(gen)) return
      remembered = result.remembered
      notice = result.warning
        ? { kind: 'warning', messages: [result.warning] }
        : { kind: 'info', messages: ['This file is remembered in this browser.'] }
    } catch (error) {
      if (!stale(gen)) notice = fromError(error)
    } finally {
      if (!stale(gen)) busy = false
    }
  }

  async function forget() {
    if (!accepted || busy) return
    const documentId = accepted.documentId
    const gen = generation
    busy = true
    notice = null
    try {
      await port.forget(documentId)
      if (stale(gen)) return
      remembered = false
      accepted = null
      notice = {
        kind: 'info',
        messages: [
          'Handle forgotten for this browser; the connected handle was released. Firmware recovery and the retained baseline were kept. This does not revoke browser or OS permission.'
        ]
      }
    } catch (error) {
      if (!stale(gen)) notice = fromError(error)
    } finally {
      if (!stale(gen)) busy = false
    }
  }

  async function copyManual() {
    if (!manualCode) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(manualCode)
      notice = {
        kind: 'info',
        messages: ['Firmware copied to the system clipboard. No filesystem baseline was accepted by this action.']
      }
    } catch {
      notice = { kind: 'error', messages: ['Could not write to the clipboard; select the text and copy it manually.'] }
    }
  }

  async function adoptSession() {
    if (accepted) return
    const documentId = editor.filesystemDocumentId
    if (!documentId) return
    const payload = await port.restore(documentId)
    if (!alive || !payload || accepted) return
    const route = editor.filesystemDocumentId === documentId
      ? (editor.filesystemRecovery?.baseline.route.kind ?? 'file')
      : 'file'
    const name = route === 'directory'
      ? (editor.filesystemRecovery?.baseline.route as { entryName?: string } | undefined)?.entryName ?? handleName(payload.file)
      : handleName(payload.file)
    accepted = { documentId, payload, route, name }
  }

  async function loadRecoveries() {
    try {
      const rows = await listStoredFilesystemDrafts()
      if (!alive) return
      recoveries = rows
    } catch {
      if (alive) recoveries = []
    }
  }

  function rowDocumentId(row: StoredDraft): string {
    return row.filesystemDocumentId ?? ''
  }

  $effect(() => {
    untrack(() => {
      void adoptSession()
      void loadRecoveries()
    })
  })

  $effect(() => {
    const status = { name: accepted?.name ?? null, busy }
    untrack(() => onStatus?.(status))
  })

  onDestroy(() => {
    alive = false
    generation += 1
    const pending = pendingConfirm
    pendingConfirm = null
    pending?.resolve(false)
  })
</script>

<div class="filesystem-picker" data-filesystem-picker>
  <p class="fs-scope" role="note">
    Firmware only — Save .keymap writes just this file. Sidecar, layout, geometry,
    and host files are not written.
  </p>

  {#if !caps.fileOpen.supported && !caps.directoryDiscovery.supported}
    <p class="fs-unsupported" role="status">
      {capabilityText()} Use Clipboard to paste a .keymap instead.
    </p>
  {:else if !caps.fileOpen.supported}
    <p class="fs-readonly" role="status">
      {capabilityText()} Folder discovery stays read-only; Save needs the file picker.
    </p>
  {/if}

  <label class="fs-remember">
    <input type="checkbox" bind:checked={remember} />
    Remember this file or folder
  </label>

  {#if !staged && !inventory}
    <div class="fs-actions">
      <button type="button" disabled={busy || !caps.fileOpen.supported} onclick={() => void openFile()}>
        Open file
      </button>
      <button
        type="button"
        disabled={busy || !caps.directoryDiscovery.supported}
        onclick={() => void openFolder()}
      >
        Open folder
      </button>
    </div>
  {/if}

  {#if staged}
    <div class="fs-staged">
      <p class="fs-staged-name" role="status">Staged firmware: {staged.candidate.name}</p>
      <div class="fs-actions">
        <button type="button" disabled={busy} onclick={() => void chooseLayout()}>
          Choose layout JSON
        </button>
        <button type="button" disabled={busy} onclick={() => void openWithoutLayout()}>
          Open without layout
        </button>
        <button type="button" disabled={busy} onclick={cancelCandidate}>Cancel candidate</button>
      </div>
    </div>
  {/if}

  {#if inventory}
    <div class="fs-inventory">
      {#if inventory.keymaps.length === 0}
        <p role="status">No eligible .keymap files in this folder. The current session is unchanged.</p>
      {:else}
        <ul class="fs-list" role="listbox" aria-label="Keymap files">
          {#each inventory.keymaps as entry (entry.name)}
            <li role="none">
              <button
                type="button"
                role="option"
                aria-selected="false"
                data-keymap={entry.name}
                disabled={busy}
                onclick={() => void chooseDiscovered(entry)}
              >
                {entry.name}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if inventory.ignoredNames.length > 0}
        <p class="fs-ignored" role="note">
          Ignored files (not read): {inventory.ignoredNames.join(', ')}
        </p>
      {/if}
      <div class="fs-actions">
        <button type="button" disabled={busy} onclick={() => { inventory = null; notice = null }}>Cancel folder</button>
      </div>
    </div>
  {/if}

  {#if recoveries.length > 0 && !recoveryOpen}
    <div class="fs-recoveries">
      <p class="fs-section" role="note">Stored firmware work in this browser</p>
      <ul class="fs-list" aria-label="Stored firmware work">
        {#each recoveries as row (row.id)}
          <li>
            <span class="fs-recovery-name">{row.filesystem?.baseline.route.kind === 'directory'
              ? (row.filesystem?.baseline.route as { entryName?: string }).entryName
              : 'file'}{row.filesystem?.attempt ? ' · unresolved attempt' : ''}</span>
            <div class="fs-actions">
              <button type="button" disabled={busy} onclick={() => void openRecovery(row)}>
                Open recovery
              </button>
              <button type="button" disabled={busy} onclick={() => void reconnect(rowDocumentId(row))}>
                Reconnect
              </button>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if accepted}
    <div class="fs-session">
      <p class="fs-name" role="status">Filesystem document: {accepted.name} ({accepted.route})</p>
      <div class="fs-actions">
        <button type="button" disabled={busy || !saveEnabled} onclick={() => void save()}>
          Save .keymap
        </button>
        {#if grantable}
          <button
            type="button"
            class="fs-grant-access"
            title="Allow this site to write the selected .keymap"
            disabled={busy}
            onclick={() => void grant()}
          >Grant write access</button>
        {/if}
        {#if canReconcile}
          <button type="button" disabled={busy} onclick={() => void reconcile()}>Reconcile save</button>
        {/if}
        {#if reloadPort}
          <button type="button" disabled={busy} onclick={() => void runReload(false)}>Reload</button>
          <button type="button" disabled={busy} onclick={() => void runReload(true)}>
            Discard firmware draft and reload
          </button>
        {/if}
        <button type="button" disabled={busy} onclick={() => void restoreDraft()}>Restore draft</button>
        {#if remembered}
          <button type="button" disabled={busy} onclick={() => void forget()}>Forget</button>
        {:else}
          <button type="button" disabled={busy} onclick={() => void rememberNow()}>
            Remember handle
          </button>
        {/if}
      </div>
    </div>
  {:else if recoveryOpen}
    <div class="fs-actions">
      <button type="button" disabled={busy || !caps.fileOpen.supported} onclick={() => void reconnect(editor.filesystemDocumentId!)}>Reconnect</button>
      <button type="button" disabled={busy} onclick={() => void restoreDraft()}>Restore draft</button>
    </div>
  {/if}

  {#if manualNeedsRestore}
    <p class="fs-section" role="note">Restore draft before manual Clipboard transfer; the visible baseline is not the stored firmware work.</p>
  {:else if recoveryOpen && manualCode}
    <div class="fs-manual">
      <p class="fs-section" role="note">
        Manual Clipboard transfer — copy this firmware out; it does not accept a filesystem baseline.
      </p>
      <textarea class="fs-manual-text" readonly rows="6" aria-label="Firmware text">{manualCode}</textarea>
      <div class="fs-actions">
        <button type="button" disabled={busy} onclick={() => void copyManual()}>
          Copy firmware to Clipboard
        </button>
      </div>
    </div>
  {/if}

  {#if pendingConfirm}
    <div class="fs-confirm" role="alertdialog" aria-label="Reconcile confirmation">
      <p>The file already contains the intended output. Confirm it matches what you tried to save.</p>
      <div class="fs-actions">
        <button type="button" onclick={() => answerConfirm(true)}>
          Confirm reconcile from intended bytes
        </button>
        <button type="button" onclick={() => answerConfirm(false)}>Cancel</button>
      </div>
    </div>
  {/if}

  <div class="fs-actions">
    <button type="button" class="fs-use-clipboard" onclick={() => onUseClipboard?.()}>
      Use Clipboard
    </button>
  </div>

  {#if notice}
    <ul class="fs-notice" class:fs-notice-error={notice.kind === 'error'} role="alert">
      {#each notice.messages as message, index (index)}
        <li>{message}</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .filesystem-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 18rem;
    max-width: min(34rem, calc(100vw - 32px));
  }

  .fs-scope,
  .fs-staged-name,
  .fs-name,
  .fs-ignored,
  .fs-unsupported,
  .fs-readonly,
  .fs-section,
  .fs-confirm p {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--font-sm, 0.85rem);
    line-height: 1.3;
  }

  .fs-notice-error {
    color: var(--danger-ink, #b3261e);
  }

  .fs-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .fs-actions button {
    min-height: 26px;
    padding: 3px 8px;
    color: inherit;
    font: inherit;
    font-size: var(--font-md, 0.95rem);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
  }

  .fs-actions button:hover:not(:disabled) {
    border-color: var(--text-muted);
  }

  .fs-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  /* A saved file is blocked until the explicit browser write grant. */
  .fs-actions .fs-grant-access:not(:disabled) {
    background: var(--danger-wash);
    border-color: var(--danger-border);
    color: var(--danger-ink);
    font-weight: 700;
  }

  .fs-actions .fs-grant-access:hover:not(:disabled) {
    background: color-mix(in srgb, var(--danger-wash) 70%, var(--danger-border));
    border-color: var(--danger-ink);
  }

  .fs-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .fs-list button {
    justify-content: flex-start;
    width: 100%;
    text-align: left;
  }

  .fs-recovery-name {
    display: block;
    font-size: var(--font-sm, 0.85rem);
  }

  .fs-remember {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-size: var(--font-sm, 0.85rem);
  }

  .fs-manual-text {
    width: 100%;
    box-sizing: border-box;
    font: var(--font-mono, monospace);
    font-size: var(--font-sm, 0.85rem);
  }

  .fs-notice {
    margin: 0;
    padding: 0 0 0 1rem;
    font-size: var(--font-sm, 0.85rem);
  }

  .fs-confirm {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
  }
</style>
