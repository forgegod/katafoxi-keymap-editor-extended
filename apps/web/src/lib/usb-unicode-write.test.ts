import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseKeyBinding, type StudioBehaviorDetails } from '@keymap-editor/keymap-core'
import { UsbStudio } from './usb-studio'
import { editor } from './editor.svelte'
import { publishKeymap } from './publish-keymap'
import { copyClipboardKeymap } from './editor/clipboard-copy'
import { flushSync, mount, unmount } from 'svelte'
import UsbPicker from './components/Pickers/UsbPicker.svelte'
import type { UsbKeyboardSelection } from './editor/types'

vi.mock('@zmkfirmware/zmk-studio-ts-client', () => ({ create_rpc_connection: vi.fn(), call_rpc: vi.fn() }))
vi.mock('@zmkfirmware/zmk-studio-ts-client/transport/serial', () => ({ connect: vi.fn() }))
import { call_rpc, create_rpc_connection, type Notification, type RequestResponse } from '@zmkfirmware/zmk-studio-ts-client'
import { connect } from '@zmkfirmware/zmk-studio-ts-client/transport/serial'

// Synthetic firmware identity: the display name deliberately does not identify &uc.
const behaviorId = 37
const numericNode = (param1: number, param2: number) => ({ value: behaviorId, params: [
  { value: param1, params: [] }, { value: param2, params: [] }
] })
const unicodeMetadata = (): StudioBehaviorDetails['metadata'] => [{
  param1: [{ name: 'Normal', range: { min: 0, max: 0x10ffff } }],
  param2: [{ name: 'Shift', range: { min: 0, max: 0x10ffff } }]
}, {
  param1: [{ name: 'Mode sentinel', constant: 0xffffff }],
  param2: [{ name: 'Mode', range: { min: 0, max: 5 } }]
}]
const fixtures = () => ({
  getDeviceInfo: { core: { getDeviceInfo: { name: 'Test keyboard', serialNumber: new Uint8Array([1]) } } },
  getLockState: { core: { getLockState: 1 } },
  listAllBehaviors: { behaviors: { listAllBehaviors: { behaviors: [behaviorId] } } },
  getBehaviorDetails: { behaviors: { getBehaviorDetails: { id: behaviorId, displayName: 'Selected firmware behavior', metadata: unicodeMetadata() } } },
  getPhysicalLayouts: { keymap: { getPhysicalLayouts: { activeLayoutIndex: 0, layouts: [{ name: 'Test layout', keys: [{ x: 0, y: 0, width: 100, height: 100, r: 0, rx: 0, ry: 0 }] }] } } },
  getKeymap: { keymap: { getKeymap: { layers: [{ id: 9, name: 'Base', bindings: [{ behaviorId, param1: 4, param2: 0 }] }], availableLayers: 1, maxLayerNameLength: 16 } } },
  setLayerBinding: { keymap: { setLayerBinding: 0 } },
  checkUnsavedChanges: { keymap: { checkUnsavedChanges: false } },
  saveChanges: { keymap: { saveChanges: { ok: true } } }
})

describe('USB Unicode writes through the accepted Studio session', () => {
  let session: UsbStudio
  let replies: ReturnType<typeof fixtures>
  let notifications: ReadableStreamDefaultController<Notification>
  let picker: ReturnType<typeof mount> | undefined
  let target: HTMLDivElement

  beforeEach(async () => {
    editor.resetForTests()
    replies = fixtures()
    vi.stubGlobal('navigator', { serial: { requestPort() {} } })
    vi.stubGlobal('isSecureContext', true)
    vi.mocked(connect).mockResolvedValue({ label: 'Test USB', abortController: new AbortController(), readable: new ReadableStream(), writable: new WritableStream() })
    vi.mocked(create_rpc_connection).mockImplementation(() => ({ label: 'Test USB', current_request: 0, request_writable: new WritableStream(), request_response_readable: new ReadableStream(), notification_readable: new ReadableStream({ start(controller) { notifications = controller } }) }))
    vi.mocked(call_rpc).mockImplementation(async (_conn, request) => {
      const method = Object.keys(request.core ?? request.behaviors ?? request.keymap ?? {})[0]
      if (request.keymap?.setLayerBinding) {
        replies.getKeymap.keymap.getKeymap.layers[0].bindings[0] = { ...request.keymap.setLayerBinding.binding! }
        replies.checkUnsavedChanges.keymap.checkUnsavedChanges = true
      }
      if (request.keymap?.saveChanges) replies.checkUnsavedChanges.keymap.checkUnsavedChanges = false
      return structuredClone(replies[method as keyof typeof replies]) as RequestResponse
    })
    session = new UsbStudio(async selection => {
      await editor.selectKeyboard(selection)
      return editor.usbSelection === selection
    }, (status, selection, update) => editor.acceptUsbStudioState(status, selection, update),
    () => editor.captureUsbLoadGuard(), selection => editor.source === 'usb' && editor.usbSelection === selection)
    await session.connect()
    expect(editor.usbStatus?.state).toBe('unlocked')
    vi.mocked(call_rpc).mockClear()
  })

  afterEach(async () => {
    if (picker) await unmount(picker)
    picker = undefined
    target?.remove()
    session.disconnect()
    await editor._draftWrites
    await editor._hostCacheWrites
    editor.resetForTests()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  const writes = () => vi.mocked(call_rpc).mock.calls.filter(([, request]) => request.keymap?.setLayerBinding)
  const button = (text: string) => {
    const found = [...target.querySelectorAll('button')].find(item => item.textContent?.trim() === text)
    if (!found) throw new Error(`Missing button: ${text}`)
    return found
  }
  const field = (label: string) => {
    const found = target.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)
    if (!found) throw new Error(`Missing control: ${label}`)
    return found
  }
  const enter = (label: string, value: string) => {
    const control = field(label)
    control.value = value
    if (control instanceof HTMLSelectElement) {
      for (const option of control.options) option.selected = option.value === value
      // happy-dom 15 lacks option :checked, which Svelte's select binding reads.
      const query = control.querySelector.bind(control)
      const spy = vi.spyOn(control, 'querySelector').mockImplementation(selector =>
        selector === ':checked' ? [...control.options].find(option => option.value === value) ?? null : query(selector))
      control.dispatchEvent(new Event('change', { bubbles: true }))
      spy.mockRestore()
    } else control.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
  }
  const openPicker = async () => {
    session.disconnect()
    editor.resetForTests()
    vi.mocked(connect).mockClear()
    vi.mocked(create_rpc_connection).mockClear()
    target = document.createElement('div')
    document.body.appendChild(target)
    picker = mount(UsbPicker, { target, props: {
      onSelect: async (selection: UsbKeyboardSelection) => {
        await editor.selectKeyboard(selection)
        return editor.usbSelection === selection
      }, onUseClipboard() {}
    } })
    flushSync()
    button('Connect USB').click()
    await vi.waitFor(() => expect(button('Write binding').disabled).toBe(false))
    vi.mocked(call_rpc).mockClear()
    enter('USB binding format', 'unicode')
  }
  const fileState = () => JSON.stringify({
    source: editor.source, github: editor.githubMeta,
    sourceText: editor.clipboardOriginalSource, baselineSource: editor._baselineClipboardSource,
    filesystemDocumentId: editor.filesystemDocumentId, filesystemRecovery: editor.filesystemRecovery,
    filesystemVerifiedSave: editor.filesystemVerifiedSave, identity: editor.currentDraftIdentity(),
    saving: editor.saving, notice: editor.saveNotice, pending: editor.hasPendingFirmwareRecovery,
    undo: editor.undoStack, redo: editor.redoStack, layer: editor.layerOperationSnapshot,
    baselineIds: editor._baselineLayerIds, layout: editor.layout, baselineLayout: editor.baselineLayout,
    host: editor.hostLegend, assemblies: editor.hostAssemblies, delivered: editor.hostDeliveredFingerprint
  })

  it.each([
    ['&uc UC_DE_AE', 0xe4, 0xc4],
    ['&uc 0xE4 0', 0xe4, 0],
    ['&uc UC_SET_LINUX', 0xffffff, 1]
  ] as const)('writes %s through the production control and saves only keyboard settings', async (source, param1, param2) => {
    await openPicker()
    editor.saveNotice = { kind: 'warning', messages: ['Existing file-save notice'] }
    const before = fileState()
    enter('USB Unicode binding', source)
    expect(field('USB Unicode firmware behavior ID').value).toBe('')
    button('Write binding').click()
    await vi.waitFor(() => expect(target.textContent).toContain('select a firmware behavior ID'))
    expect(call_rpc).not.toHaveBeenCalled()
    enter('USB Unicode firmware behavior ID', String(behaviorId))
    button('Write binding').click()
    await vi.waitFor(() => expect(editor.draftKeymap?.layers[0][0]).toEqual(numericNode(param1, param2)))
    expect(writes()).toHaveLength(1)
    expect(writes()[0][1].keymap?.setLayerBinding?.binding).toEqual({ behaviorId, param1, param2 })
    expect(editor.baselineKeymap?.layers[0][0]).toEqual(numericNode(4, 0))
    expect(fileState()).toBe(before)
    expect(target.textContent).toContain('not saved')
    button('Save keyboard settings').click()
    await vi.waitFor(() => expect(target.textContent).toContain('Keyboard settings saved'))
    expect(fileState()).toBe(before)
    expect(target.textContent).toContain('overrides the flashed keymap')
    expect(target.textContent).toContain('not a .keymap, GitHub or Clipboard save')
    expect(connect).toHaveBeenCalledTimes(1)
    expect(create_rpc_connection).toHaveBeenCalledTimes(1)
  })

  it.each(['invalid-source', 'metadata'] as const)('shows %s refusal through the production control without changing state', async failure => {
    await openPicker()
    const before = fileState()
    const snapshot = JSON.stringify([editor.draftKeymap, editor.baselineKeymap])
    enter('USB Unicode binding', failure === 'invalid-source' ? '&uc 0xD800 0' : '&uc UC_DE_AE')
    enter('USB Unicode firmware behavior ID', String(behaviorId))
    if (failure === 'metadata') replies.getBehaviorDetails.behaviors.getBehaviorDetails.metadata = []
    button('Write binding').click()
    await vi.waitFor(() => expect(target.textContent).toContain(failure === 'metadata' ? 'missing-unicode-parameter-set' : 'invalid Unicode binding'))
    expect(writes()).toHaveLength(0)
    expect(fileState()).toBe(before)
    expect(JSON.stringify([editor.draftKeymap, editor.baselineKeymap])).toBe(snapshot)
  })

  it('uses the explicitly selected ID instead of a Unicode display name or the current key', async () => {
    replies.listAllBehaviors.behaviors.listAllBehaviors.behaviors.push(38)
    const normal = vi.mocked(call_rpc).getMockImplementation()!
    vi.mocked(call_rpc).mockImplementation(async (conn, request) => {
      const reply = await normal(conn, request)
      if (request.behaviors?.getBehaviorDetails) {
        const id = request.behaviors.getBehaviorDetails.behaviorId
        return { requestId: 0, behaviors: { getBehaviorDetails: {
          id, displayName: id === behaviorId ? '&uc' : 'Another behavior', metadata: unicodeMetadata()
        } } } as RequestResponse
      }
      return reply
    })
    await openPicker()
    enter('USB Unicode binding', '&uc UC_DE_AE')
    enter('USB Unicode firmware behavior ID', '38')
    button('Write binding').click()
    await vi.waitFor(() => expect(editor.draftKeymap?.layers[0][0]?.value).toBe(38))
    expect(writes()[0][1].keymap?.setLayerBinding?.binding).toEqual({ behaviorId: 38, param1: 0xe4, param2: 0xc4 })
  })

  it('gates non-&uc text and clears the explicit ID on a new accepted connection', async () => {
    await openPicker()
    for (const source of ['', 'UC_DE_AE', '&kp A']) {
      enter('USB Unicode binding', source)
      expect(button('Write binding').disabled).toBe(true)
      expect(target.textContent).toContain('Enter a source binding beginning with &uc')
    }
    expect(call_rpc).not.toHaveBeenCalled()
    enter('USB Unicode binding', '&uc UC_DE_AE')
    enter('USB Unicode firmware behavior ID', String(behaviorId))
    const previous = editor.usbSelection
    button('Connect USB').click()
    await vi.waitFor(() => expect(editor.usbSelection).not.toBe(previous))
    await vi.waitFor(() => expect(button('Write binding').disabled).toBe(false))
    expect(field('USB Unicode firmware behavior ID').value).toBe('')
    expect(writes()).toHaveLength(0)
  })

  it('preserves numeric writes and disables the production controls when locked or disconnected', async () => {
    await openPicker()
    enter('USB binding format', 'numeric')
    enter('Parameter 1', '5')
    button('Write binding').click()
    await vi.waitFor(() => expect(editor.draftKeymap?.layers[0][0]).toEqual(numericNode(5, 0)))
    enter('USB binding format', 'unicode')
    enter('USB Unicode binding', '&uc UC_DE_AE')
    notifications.enqueue({ core: { lockStateChanged: 0 } })
    await vi.waitFor(() => expect(field('USB Unicode binding').closest('fieldset')?.disabled).toBe(true))
    expect(button('Write binding').disabled).toBe(true)
    button('Disconnect USB').click()
    await vi.waitFor(() => expect(target.textContent).toContain('Disconnected'))
    expect(button('Write binding').disabled).toBe(true)
    expect(writes()).toHaveLength(1)
  })

  it.each([
    ['&uc 0xE4 0xC4', 0xe4, 0xc4], ['&uc 0xE4 0', 0xe4, 0],
    ['&uc UC_SET_MACOS', 0xffffff, 0], ['&uc UC_SET_LINUX', 0xffffff, 1],
    ['&uc UC_SET_EMACS', 0xffffff, 5]
  ] as const)('sends core-expanded cells for %s and verifies numeric readback', async (source, param1, param2) => {
    expect(await session.setBinding(0, 0, parseKeyBinding(source), behaviorId)).toBe(true)
    expect(writes()).toHaveLength(1)
    expect(writes()[0][1].keymap?.setLayerBinding?.binding).toEqual({ behaviorId, param1, param2 })
    expect(editor.draftKeymap?.layers[0][0]).toEqual(numericNode(param1, param2))
  })

  it.each(['empty', 'absent', 'normal-rejected', 'shift-rejected', 'split-sets', 'wrong-id', 'missing-reply'] as const)(
    'refuses %s fresh metadata without changing file state or accepting a cached set', async failure => {
      const details = replies.getBehaviorDetails.behaviors.getBehaviorDetails
      if (failure === 'empty') details.metadata = []
      if (failure === 'normal-rejected') details.metadata[0].param1 = [{ name: '', constant: 0 }]
      if (failure === 'shift-rejected') details.metadata[0].param2 = [{ name: '', constant: 0 }]
      if (failure === 'split-sets') details.metadata = [
        { param1: [{ name: '', constant: 0xe4 }], param2: [{ name: '', constant: 0 }] },
        { param1: [{ name: '', constant: 0 }], param2: [{ name: '', constant: 0xc4 }] }
      ]
      if (failure === 'wrong-id') details.id = 38
      const normal = vi.mocked(call_rpc).getMockImplementation()!
      vi.mocked(call_rpc).mockImplementation((conn, request) => {
        if (request.behaviors?.getBehaviorDetails) {
          if (failure === 'missing-reply') return Promise.resolve({ requestId: 0 })
          if (failure === 'absent') {
            const { metadata: _metadata, ...withoutMetadata } = details
            return Promise.resolve({ requestId: 0, behaviors: { getBehaviorDetails: withoutMetadata } } as RequestResponse)
          }
        }
        return normal(conn, request)
      })
      const before = fileState()
      const snapshot = JSON.stringify([editor.draftKeymap, editor.baselineKeymap])
      expect(await session.setBinding(0, 0, parseKeyBinding('&uc UC_DE_AE'), behaviorId)).toBe(false)
      expect(writes()).toHaveLength(0)
      expect(call_rpc).toHaveBeenCalledWith(expect.anything(), { behaviors: { getBehaviorDetails: { behaviorId } } })
      expect(editor.statusText).toContain('USB binding refused:')
      if (failure !== 'wrong-id' && failure !== 'missing-reply') expect(editor.statusText).toContain('missing-unicode-parameter-set')
      expect(fileState()).toBe(before)
      expect(JSON.stringify([editor.draftKeymap, editor.baselineKeymap])).toBe(snapshot)
      expect(editor.usbStatus).toMatchObject({ dirty: false, busy: false })
    }
  )

  it.each(['&uc 0xD800 0', '&uc 0x110000 0', '&uc 123', '&uc UNKNOWN_ALIAS'])('refuses invalid expansion %s before any RPC', async source => {
    expect(await session.setBinding(0, 0, parseKeyBinding(source), behaviorId)).toBe(false)
    expect(call_rpc).not.toHaveBeenCalled()
    expect(editor.statusText).toContain('invalid Unicode binding')
  })

  it.each([undefined, 38, NaN])('refuses an absent or unadvertised explicit firmware identity (%s)', async id => {
    expect(await session.setBinding(0, 0, parseKeyBinding('&uc UC_DE_AE'), id)).toBe(false)
    expect(call_rpc).not.toHaveBeenCalled()
    expect(editor.statusText).toContain('USB binding refused:')
  })

  it('keeps file-save state and publication isolated after fake write and save success', async () => {
    const fetch = vi.fn()
    const writeText = vi.fn()
    vi.stubGlobal('fetch', fetch)
    Object.assign(navigator, { clipboard: { writeText } })
    editor.saveNotice = { kind: 'warning', messages: ['Existing file-save notice'] }
    const before = fileState()
    const baseline = JSON.stringify(editor.baselineKeymap)
    expect(await session.setBinding(0, 0, parseKeyBinding('&uc UC_DE_AE'), behaviorId)).toBe(true)
    expect(fileState()).toBe(before)
    expect(JSON.stringify(editor.baselineKeymap)).toBe(baseline)
    expect(editor.usbStatus?.dirty).toBe(true)
    expect(await session.saveChanges()).toBe(true)
    expect(fileState()).toBe(before)
    expect(editor.baselineKeymap).toEqual(editor.draftKeymap)
    expect(editor.usbStatus?.dirty).toBe(false)
    expect(editor.statusText).toContain('overrides the flashed keymap')
    expect(editor.statusText).toContain('not a .keymap, GitHub or Clipboard save')
    const write = vi.fn()
    const reload = vi.fn()
    expect(await publishKeymap({ ...editor, source: 'usb', isDirty: true, isPublishDirty: true } as unknown as Parameters<typeof publishKeymap>[0], { write, reload })).toBe(false)
    await copyClipboardKeymap(editor as unknown as Parameters<typeof copyClipboardKeymap>[0])
    expect(write).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled()
    expect(fileState()).toBe(before)
  })

  it.each(['locked', 'disconnected', 'replaced'] as const)('refuses a Unicode write when %s during the metadata probe', async change => {
    let resolve!: (value: RequestResponse) => void
    const pending = new Promise<RequestResponse>(done => { resolve = done })
    const normal = vi.mocked(call_rpc).getMockImplementation()!
    vi.mocked(call_rpc).mockImplementation((conn, request) => request.behaviors?.getBehaviorDetails ? pending : normal(conn, request))
    const before = JSON.stringify([editor.draftKeymap, editor.baselineKeymap])
    const writing = session.setBinding(0, 0, parseKeyBinding('&uc UC_DE_AE'), behaviorId)
    await vi.waitFor(() => expect(call_rpc).toHaveBeenCalledWith(expect.anything(), { behaviors: { getBehaviorDetails: { behaviorId } } }))
    if (change === 'locked') {
      notifications.enqueue({ core: { lockStateChanged: 0 } })
      await vi.waitFor(() => expect(editor.usbStatus?.state).toBe('locked'))
    }
    if (change === 'disconnected') session.disconnect()
    if (change === 'replaced') editor.usbSelection = null
    resolve({ requestId: 0, ...replies.getBehaviorDetails })
    expect(await writing).toBe(false)
    expect(writes()).toHaveLength(0)
    expect(JSON.stringify([editor.draftKeymap, editor.baselineKeymap])).toBe(before)
  })

  it('refuses fresh HID-only metadata even when the expanded scalars fit its HID ranges', async () => {
    const hid = [{ name: 'Unicode', hidUsage: { keyboardMax: 255, consumerMax: 4095 } }]
    replies.getBehaviorDetails.behaviors.getBehaviorDetails.metadata = [{ param1: hid, param2: hid }]
    const before = JSON.stringify([editor.draftKeymap, editor.baselineKeymap])
    expect(await session.setBinding(0, 0, parseKeyBinding('&uc 0x70004 0xC0001'), behaviorId)).toBe(false)
    expect(vi.mocked(call_rpc).mock.calls.some(([, request]) => request.keymap?.setLayerBinding)).toBe(false)
    expect(editor.statusText).toContain('USB binding refused: missing-unicode-parameter-set')
    expect(JSON.stringify([editor.draftKeymap, editor.baselineKeymap])).toBe(before)
    expect(editor.usbStatus?.dirty).toBe(false)
  })

  it('expands an alias, probes fresh metadata and sends numeric cells on the existing connection', async () => {
    const binding = parseKeyBinding('&uc UC_DE_AE')
    const before = structuredClone(binding)
    expect(await session.setBinding(0, 0, binding, behaviorId)).toBe(true)
    const requests = vi.mocked(call_rpc).mock.calls.map(([, request]) => request)
    expect(requests).toContainEqual({ behaviors: { getBehaviorDetails: { behaviorId } } })
    expect(requests.filter(request => request.keymap?.setLayerBinding)).toEqual([
      { keymap: { setLayerBinding: { layerId: 9, keyPosition: 0, binding: { behaviorId, param1: 0xe4, param2: 0xc4 } } } }
    ])
    expect(requests.findIndex(request => request.behaviors?.getBehaviorDetails))
      .toBeLessThan(requests.findIndex(request => request.keymap?.setLayerBinding))
    expect(editor.draftKeymap?.layers[0][0]).toEqual(numericNode(0xe4, 0xc4))
    expect(editor.baselineKeymap?.layers[0][0]).toEqual(numericNode(4, 0))
    expect(editor.statusText).toContain('not saved')
    expect(binding).toEqual(before)
    expect(connect).toHaveBeenCalledTimes(1)
    expect(create_rpc_connection).toHaveBeenCalledTimes(1)
  })
})
