import { buildStudioSetLayerBinding, buildValidatedStudioSetLayerBinding, mapStudioRpcSession, type KeyBindingNode, type ParsedKeymap } from '@keymap-editor/keymap-core'
import { call_rpc, create_rpc_connection, type RpcConnection, type Notification } from '@zmkfirmware/zmk-studio-ts-client'
import { connect as serial_connect } from '@zmkfirmware/zmk-studio-ts-client/transport/serial'
import type { UsbKeyboardSelection } from './editor/types'

export type UsbStudioStatus = {
  state: 'unavailable' | 'disconnected' | 'connecting' | 'locked' | 'unlocked'
  deviceName?: string
  message?: string
  dirty?: boolean
  busy?: boolean
}

export type UsbStudioUpdate = { keymap: ParsedKeymap; baseline: ParsedKeymap }

export function usbStudioAvailable(): boolean {
  const serial = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { serial?: { requestPort?: unknown } }).serial
  return globalThis.isSecureContext === true && typeof serial?.requestPort === 'function'
}

type Session = {
  abort: AbortController
  conn?: RpcConnection
  reader?: ReadableStreamDefaultReader<Notification>
  deviceName?: string
  accepted: boolean
  loading: boolean
  pendingReload: boolean
  lock: number | undefined
  lockVersion: number
  editorUnchanged: () => boolean
  responses?: Record<string, unknown>
  selection?: UsbKeyboardSelection
  snapshot?: UsbStudioUpdate
  dirty: boolean
  busy: boolean
  message?: string
}

/** Browser adapter only: all response validation and binding mapping belongs to core. */
export class UsbStudio {
  private session: Session | null = null

  constructor(
    private readonly onSelect: (selection: UsbKeyboardSelection) => Promise<boolean>,
    private readonly onStatus: (status: UsbStudioStatus, selection?: UsbKeyboardSelection, update?: UsbStudioUpdate) => void,
    private readonly captureEditor: () => () => boolean,
    private readonly ownsSelection: (selection: UsbKeyboardSelection) => boolean = () => false
  ) {}

  private current(session: Session): boolean {
    return this.session === session && !session.abort.signal.aborted
  }

  private report(session: Session, message?: string, update?: UsbStudioUpdate): void {
    session.message = message
    this.onStatus({ state: session.lock === 1 ? 'unlocked' : 'locked', deviceName: session.deviceName,
      dirty: session.dirty, busy: session.busy, message }, session.selection, update && structuredClone(update))
  }

  private writable(session: Session): boolean {
    return this.current(session) && session.accepted && session.lock === 1 &&
      !!session.selection && this.ownsSelection(session.selection)
  }

  private assertWritable(session: Session, version: number): void {
    if (!this.writable(session) || version !== session.lockVersion) throw new Error('USB operation refused: session changed or keyboard locked.')
  }

  async setBinding(layerIndex: number, keyPosition: number, binding: KeyBindingNode): Promise<boolean> {
    const session = this.session
    if (!session || !this.writable(session) || session.busy) return false
    const candidate = structuredClone(binding)
    const version = session.lockVersion
    session.busy = true
    this.report(session)
    try {
      const shape = buildStudioSetLayerBinding(session.responses, layerIndex, keyPosition, candidate)
      if (shape.status !== 'encoded') throw new Error(`USB binding refused: ${shape.reason}`)
      const before = await this.readSettings(session, version)
      if (JSON.stringify(before.keymap) !== JSON.stringify(session.snapshot!.keymap)) throw new Error('USB binding refused: keyboard changed; reconnect before writing.')
      const details = await this.request(session, { behaviors: { getBehaviorDetails: { behaviorId: shape.request.keymap.setLayerBinding.binding.behaviorId } } })
      this.assertWritable(session, version)
      const responses = { ...before.responses, getBehaviorDetails: (session.responses!.getBehaviorDetails as Array<{ behaviors?: { getBehaviorDetails?: { id: number } } }>).map(old =>
        old.behaviors?.getBehaviorDetails?.id === candidate.value ? details : old) }
      const encoded = buildValidatedStudioSetLayerBinding(responses, layerIndex, keyPosition, candidate)
      if (encoded.status !== 'encoded') throw new Error(`USB binding refused: ${encoded.reason}${encoded.path ? ` (${encoded.path})` : ''}`)
      // Once sent, loss of the reply cannot prove the keyboard is clean.
      session.dirty = true
      this.report(session, 'USB write pending; keyboard settings are not saved.')
      const response = await this.request(session, encoded.request)
      this.assertWritable(session, version)
      if (response.keymap?.setLayerBinding !== 0) throw new Error('Keyboard refused the binding; no saved baseline changed.')
      const readback = await this.readSettings(session, version)
      if (JSON.stringify(readback.keymap.layers[layerIndex]?.[keyPosition]) !== JSON.stringify(candidate)) throw new Error('USB binding readback failed; saved baseline unchanged.')
      session.responses = { ...readback.responses, getBehaviorDetails: responses.getBehaviorDetails }
      session.snapshot = { keymap: readback.keymap, baseline: session.snapshot!.baseline }
      this.report(session, 'Keyboard binding changed, not saved. Save keyboard settings explicitly.', session.snapshot)
      return true
    } catch (error) {
      if (this.current(session)) this.report(session, error instanceof Error ? error.message : 'USB write failed.')
      return false
    } finally {
      session.busy = false
      if (this.current(session)) this.report(session, session.message)
    }
  }

  saveChanges(): Promise<boolean> { return this.finishSettings('saveChanges') }
  discardChanges(): Promise<boolean> { return this.finishSettings('discardChanges') }
  resetSettings(): Promise<boolean> { return this.finishSettings('resetSettings') }

  private async finishSettings(method: 'saveChanges' | 'discardChanges' | 'resetSettings'): Promise<boolean> {
    const session = this.session
    if (!session || !this.writable(session) || session.busy) return false
    const version = session.lockVersion
    session.busy = true
    this.report(session)
    try {
      const lock = await this.request(session, { core: { getLockState: true } })
      this.assertWritable(session, version)
      if (lock.core?.getLockState !== 1) throw new Error('USB operation refused: keyboard locked.')
      if (method === 'saveChanges') {
        const before = await this.readSettings(session, version)
        if (JSON.stringify(before.keymap) !== JSON.stringify(session.snapshot!.keymap)) throw new Error('Keyboard changed since the last verified read. Reconnect before saving.')
      }
      session.dirty = true
      this.report(session, 'Keyboard settings operation pending; outcome not yet verified.')
      const response = await this.request(session, method === 'resetSettings' ? { core: { resetSettings: true } } : { keymap: { [method]: true } })
      this.assertWritable(session, version)
      const ok = method === 'saveChanges'
        ? response.keymap?.saveChanges?.ok === true && response.keymap.saveChanges.err === undefined
        : method === 'discardChanges' ? response.keymap?.discardChanges === true : response.core?.resetSettings === true
      if (!ok) throw new Error(`Keyboard did not confirm ${method}; saved baseline unchanged.`)
      const readback = await this.readSettings(session, version)
      const unsaved = await this.request(session, { keymap: { checkUnsavedChanges: true } })
      this.assertWritable(session, version)
      if (unsaved.keymap?.checkUnsavedChanges !== false) throw new Error('Keyboard settings are still dirty or unverified; saved baseline unchanged.')
      if (method === 'saveChanges' && JSON.stringify(readback.keymap) !== JSON.stringify(session.snapshot!.keymap)) throw new Error('Saved settings readback differs; saved baseline unchanged.')
      session.snapshot = { keymap: readback.keymap, baseline: structuredClone(readback.keymap) }
      session.responses = readback.responses
      session.dirty = false
      const message = method === 'saveChanges'
        ? 'Keyboard settings saved. Each saved binding overrides the flashed keymap at that position until Restore stock. This is not a .keymap, GitHub or Clipboard save.'
        : method === 'discardChanges' ? 'Unsaved keyboard settings discarded; keyboard settings reloaded. Files and host layouts unchanged.'
        : 'Stock keyboard settings restored with core.resetSettings; settings reloaded. Files and host layouts unchanged.'
      this.report(session, message, session.snapshot)
      return true
    } catch (error) {
      if (this.current(session)) this.report(session, error instanceof Error ? error.message : 'USB settings operation failed.')
      return false
    } finally {
      session.busy = false
      if (this.current(session)) this.report(session, session.message)
    }
  }

  private async readSettings(session: Session, version: number) {
    const getPhysicalLayouts = await this.request(session, { keymap: { getPhysicalLayouts: true } })
    this.assertWritable(session, version)
    const getKeymap = await this.request(session, { keymap: { getKeymap: true } })
    this.assertWritable(session, version)
    const getLockState = await this.request(session, { core: { getLockState: true } })
    this.assertWritable(session, version)
    const responses = { ...session.responses, getPhysicalLayouts, getKeymap, getLockState }
    const mapped = mapStudioRpcSession(responses)
    if (mapped.status !== 'ready') throw new Error('Keyboard readback unavailable; reconnect before editing.')
    if (JSON.stringify(mapped.selection.layout) !== JSON.stringify(session.selection!.layout) ||
        JSON.stringify(mapped.selection.studio.layerIds) !== JSON.stringify(session.selection!.studio.layerIds)) {
      throw new Error('Keyboard layout changed; reconnect to load its new positions before editing.')
    }
    return { responses, keymap: mapped.selection.keymap }
  }

  disconnect(): void {
    const session = this.session
    this.session = null
    if (session) {
      session.abort.abort()
      void session.reader?.cancel().catch(() => {})
    }
    this.onStatus({ state: 'disconnected', dirty: session?.dirty, busy: false,
      message: session?.dirty ? 'Disconnected with unsaved or unverified USB settings. Their survival is unknown; reconnect and read the keyboard. Nothing was saved by disconnecting.' : undefined }, session?.selection)
  }

  async connect(): Promise<void> {
    if (!usbStudioAvailable()) {
      this.onStatus({ state: 'unavailable', message: 'Web Serial requires a supported browser and a secure context. Use Clipboard instead.' })
      return
    }
    this.disconnect()
    const session: Session = { abort: new AbortController(), accepted: false, loading: false, pendingReload: false, lock: undefined, lockVersion: 0, editorUnchanged: this.captureEditor(), dirty: false, busy: false }
    this.session = session
    this.onStatus({ state: 'connecting' })
    try {
      // Do not insert an await/import/storage operation before this call: it owns the gesture.
      const transport = await serial_connect()
      if (!this.current(session)) { transport.abortController.abort(); return }
      transport.abortController.signal.addEventListener('abort', () => {
        if (this.current(session)) this.disconnect()
      }, { once: true })
      session.conn = create_rpc_connection(transport, { signal: session.abort.signal })
      void this.listen(session)
      const info = await this.request(session, { core: { getDeviceInfo: true } })
      if (!this.current(session)) return
      if (!info.core?.getDeviceInfo) throw new Error('No ZMK Studio keyboard responded.')
      session.deviceName = info.core.getDeviceInfo.name
      await this.load(session)
    } catch (error) {
      this.fail(session, error)
    }
  }

  private fail(session: Session, error: unknown): void {
    if (!this.current(session)) return
    this.disconnect()
    this.onStatus({ state: 'unavailable', message: error instanceof Error ? error.message : 'Could not connect to the keyboard.' })
  }

  private async request(session: Session, request: Parameters<typeof call_rpc>[1]) {
    if (!this.current(session)) throw new Error('USB disconnected.')
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort = () => {}
    const stopped = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Keyboard RPC timed out. Reconnect to try again.')), 5000)
      onAbort = () => reject(new Error('USB disconnected.'))
      session.abort.signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      const response = await Promise.race([call_rpc(session.conn!, request), stopped])
      if (!this.current(session)) throw new Error('USB disconnected.')
      return response
    } finally {
      clearTimeout(timer)
      session.abort.signal.removeEventListener('abort', onAbort)
    }
  }

  private async listen(session: Session): Promise<void> {
    const reader = session.conn!.notification_readable.getReader()
    session.reader = reader
    try {
      while (this.current(session)) {
        const { done, value } = await reader.read()
        if (done) break
        if (!this.current(session)) return
        if (value.keymap?.unsavedChangesStatusChanged === true) {
          session.dirty = true
          this.report(session, 'Keyboard reports unsaved settings. Save or discard explicitly; disconnect does not save them.')
        }
        const lock = value.core?.lockStateChanged
        if (lock === undefined || lock === session.lock) continue
        session.lock = lock
        session.lockVersion++
        if (session.deviceName !== undefined) {
          this.report(session, session.message)
          if (lock === 1 && !session.accepted) void this.load(session)
        }
      }
    } catch {
      // Stream EOF/errors are disconnects, never an empty replacement keyboard.
    } finally {
      reader.releaseLock()
      if (this.current(session)) this.disconnect()
    }
  }

  private async load(session: Session): Promise<void> {
    if (!this.current(session) || session.accepted) return
    if (session.loading) {
      session.pendingReload = true
      return
    }
    session.loading = true
    try {
      const version = session.lockVersion
      const getLockState = await this.request(session, { core: { getLockState: true } })
      if (!this.current(session) || version !== session.lockVersion) return
      session.lock = getLockState.core?.getLockState
      if (session.lock !== 1) {
        this.onStatus({ state: 'locked', deviceName: session.deviceName })
        return
      }
      const listAllBehaviors = await this.request(session, { behaviors: { listAllBehaviors: true } })
      const ids = listAllBehaviors.behaviors?.listAllBehaviors?.behaviors
      if (!ids) throw new Error('Behavior inventory unavailable.')
      const getBehaviorDetails = []
      for (const behaviorId of ids) getBehaviorDetails.push(await this.request(session, { behaviors: { getBehaviorDetails: { behaviorId } } }))
      const getPhysicalLayouts = await this.request(session, { keymap: { getPhysicalLayouts: true } })
      const getKeymap = await this.request(session, { keymap: { getKeymap: true } })
      const finalLock = await this.request(session, { core: { getLockState: true } })
      const unsaved = await this.request(session, { keymap: { checkUnsavedChanges: true } })
      if (typeof unsaved.keymap?.checkUnsavedChanges !== 'boolean') throw new Error('Keyboard settings dirty state unavailable.')
      session.dirty ||= unsaved.keymap.checkUnsavedChanges
      const isCurrent = () => this.current(session) && version === session.lockVersion && session.lock === 1
      if (!isCurrent()) return
      session.responses = { getLockState: finalLock, listAllBehaviors, getBehaviorDetails, getPhysicalLayouts, getKeymap }
      const mapped = mapStudioRpcSession(session.responses)
      if (mapped.status !== 'ready') throw new Error(`${mapped.reason}${mapped.path ? `: ${mapped.path}` : ''}`)
      if (!session.editorUnchanged()) throw new Error('USB load refused; the current editor was retained. Connect again to retry.')
      session.selection = { ...mapped.selection, usb: { deviceName: session.deviceName!, isCurrent: () => isCurrent() && session.editorUnchanged() }, userInitiated: true }
      session.snapshot = { keymap: structuredClone(mapped.selection.keymap), baseline: structuredClone(mapped.selection.keymap) }
      session.accepted = await this.onSelect(session.selection)
      if (!session.accepted) throw new Error('USB load refused; the current editor was retained. Connect again to retry.')
      if (isCurrent()) this.report(session, session.dirty ? 'Keyboard reports unsaved settings. Save or discard explicitly; disconnect does not save them.' : undefined)
    } catch (error) {
      this.fail(session, error)
    } finally {
      session.loading = false
      // Coalesce unlocks during a stale read into one fresh, guarded load.
      const pendingReload = session.pendingReload
      session.pendingReload = false
      if (pendingReload && this.current(session) && session.lock === 1 && !session.accepted) void this.load(session)
    }
  }
}
