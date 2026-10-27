import { mapStudioRpcSession } from '@keymap-editor/keymap-core'
import { call_rpc, create_rpc_connection, type RpcConnection, type Notification } from '@zmkfirmware/zmk-studio-ts-client'
import { connect as serial_connect } from '@zmkfirmware/zmk-studio-ts-client/transport/serial'
import type { UsbKeyboardSelection } from './editor/types'

export type UsbStudioStatus = {
  state: 'unavailable' | 'disconnected' | 'connecting' | 'locked' | 'unlocked'
  deviceName?: string
  message?: string
}

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
}

/** Browser adapter only: all response validation and binding mapping belongs to core. */
export class UsbStudio {
  private session: Session | null = null

  constructor(
    private readonly onSelect: (selection: UsbKeyboardSelection) => Promise<boolean>,
    private readonly onStatus: (status: UsbStudioStatus) => void,
    private readonly captureEditor: () => () => boolean
  ) {}

  private current(session: Session): boolean {
    return this.session === session && !session.abort.signal.aborted
  }

  disconnect(): void {
    const session = this.session
    this.session = null
    if (session) {
      session.abort.abort()
      void session.reader?.cancel().catch(() => {})
    }
    this.onStatus({ state: 'disconnected' })
  }

  async connect(): Promise<void> {
    if (!usbStudioAvailable()) {
      this.onStatus({ state: 'unavailable', message: 'Web Serial requires a supported browser and a secure context. Use Clipboard instead.' })
      return
    }
    this.disconnect()
    const session: Session = { abort: new AbortController(), accepted: false, loading: false, pendingReload: false, lock: undefined, lockVersion: 0, editorUnchanged: this.captureEditor() }
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
        const lock = value.core?.lockStateChanged
        if (lock === undefined || lock === session.lock) continue
        session.lock = lock
        session.lockVersion++
        if (session.deviceName !== undefined) {
          this.onStatus({ state: lock === 1 ? 'unlocked' : 'locked', deviceName: session.deviceName })
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
      const isCurrent = () => this.current(session) && version === session.lockVersion && session.lock === 1
      if (!isCurrent()) return
      const mapped = mapStudioRpcSession({ getLockState: finalLock, listAllBehaviors, getBehaviorDetails, getPhysicalLayouts, getKeymap })
      if (mapped.status !== 'ready') throw new Error(`${mapped.reason}${mapped.path ? `: ${mapped.path}` : ''}`)
      if (!session.editorUnchanged()) throw new Error('USB load refused; the current editor was retained. Connect again to retry.')
      session.accepted = await this.onSelect({ ...mapped.selection, usb: { deviceName: session.deviceName!, isCurrent: () => isCurrent() && session.editorUnchanged() }, userInitiated: true })
      if (!session.accepted) throw new Error('USB load refused; the current editor was retained. Connect again to retry.')
      if (isCurrent()) this.onStatus({ state: 'unlocked', deviceName: session.deviceName })
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
