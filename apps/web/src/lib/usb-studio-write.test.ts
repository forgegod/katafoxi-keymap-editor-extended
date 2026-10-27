import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UsbStudio, type UsbStudioStatus } from './usb-studio'
import type { UsbKeyboardSelection } from './editor/types'
import type { KeyBindingNode, ParsedKeymap, StudioBehaviorDetails } from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import UsbPicker from './components/Pickers/UsbPicker.svelte'
import { editor } from './editor.svelte'
import { needsUnpublishedLeaveWarning } from './editor/leave-warning'

vi.mock('@zmkfirmware/zmk-studio-ts-client', () => ({ create_rpc_connection: vi.fn(), call_rpc: vi.fn() }))
vi.mock('@zmkfirmware/zmk-studio-ts-client/transport/serial', () => ({ connect: vi.fn() }))
import { call_rpc, create_rpc_connection, type Notification, type RequestResponse } from '@zmkfirmware/zmk-studio-ts-client'
import { connect } from '@zmkfirmware/zmk-studio-ts-client/transport/serial'

const node = (param1 = 5, param2 = 0): KeyBindingNode => ({ value: 7, params: [{ value: param1, params: [] }, { value: param2, params: [] }] })
const fixtures = () => ({
  getDeviceInfo: { core: { getDeviceInfo: { name: 'Test keyboard', serialNumber: new Uint8Array([1]) } } },
  getLockState: { core: { getLockState: 1 } },
  listAllBehaviors: { behaviors: { listAllBehaviors: { behaviors: [7] } } },
  getBehaviorDetails: { behaviors: { getBehaviorDetails: { id: 7, displayName: 'Test behavior', metadata: [{ param1: [{ name: 'Value', range: { min: 0, max: 10 } }], param2: [{ name: 'Unused', nil: {} }] }] } as StudioBehaviorDetails } },
  getPhysicalLayouts: { keymap: { getPhysicalLayouts: { activeLayoutIndex: 0, layouts: [{ name: 'Test layout', keys: [{ x: 0, y: 0, width: 100, height: 100, r: 0, rx: 0, ry: 0 }] }] } } },
  getKeymap: { keymap: { getKeymap: { layers: [{ id: 9, name: 'Base', bindings: [{ behaviorId: 7, param1: 4, param2: 0 }] }], availableLayers: 1, maxLayerNameLength: 16 } } },
  setLayerBinding: { keymap: { setLayerBinding: 0 } },
  checkUnsavedChanges: { keymap: { checkUnsavedChanges: false } },
  saveChanges: { keymap: { saveChanges: { ok: true } } },
  discardChanges: { keymap: { discardChanges: true } },
  resetSettings: { core: { resetSettings: true } }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => { resolve = res })
  return { promise, resolve }
}

describe('USB Studio settings writes', () => {
  let session: UsbStudio
  let selected: UsbKeyboardSelection | undefined
  let status: UsbStudioStatus
  let draft: ParsedKeymap
  let baseline: ParsedKeymap
  let replies: ReturnType<typeof fixtures>
  let notifications: ReadableStreamDefaultController<Notification>
  let owned: boolean

  beforeEach(async () => {
    replies = fixtures()
    owned = true
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
      selected = selection
      draft = structuredClone(selection.keymap)
      baseline = structuredClone(draft)
      return true
    }, (next, selection, update) => {
      status = next
      if (selection === selected && update) { draft = update.keymap; baseline = update.baseline }
    }, () => () => true, selection => owned && selection === selected)
    await session.connect()
    expect(selected).toBeDefined()
    vi.mocked(call_rpc).mockClear()
  })

  afterEach(() => {
    session.disconnect()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('writes one metadata-accepted binding to its firmware layer ID without advancing the saved baseline', async () => {
    expect(await session.setBinding(0, 0, node())).toBe(true)
    expect(call_rpc).toHaveBeenCalledWith(expect.anything(), { keymap: { setLayerBinding: { layerId: 9, keyPosition: 0, binding: { behaviorId: 7, param1: 5, param2: 0 } } } })
    expect(draft.layers[0][0]).toEqual(node())
    expect(baseline.layers[0][0]).toEqual(node(4))
    expect(status.dirty).toBe(true)
    expect(status.message).toContain('not saved')
  })

  it.each([[11, 0], [5, 1], [0, 1], [-1, 0], [1.5, 0], [0x100000000, 0]])('refuses metadata-invalid parameters %s / %s without a write or baseline change', async (param1, param2) => {
    const before = structuredClone({ draft, baseline })
    expect(await session.setBinding(0, 0, node(param1, param2))).toBe(false)
    expect(vi.mocked(call_rpc).mock.calls.some(([, request]) => request.keymap?.setLayerBinding)).toBe(false)
    expect({ draft, baseline }).toEqual(before)
    expect(status.message).toMatch(/binding|metadata/)
  })

  it('saves keyboard settings only after positive acknowledgement and clean readback', async () => {
    await session.setBinding(0, 0, node())
    expect(await session.saveChanges()).toBe(true)
    expect(call_rpc).toHaveBeenCalledWith(expect.anything(), { keymap: { saveChanges: true } })
    expect(call_rpc).toHaveBeenCalledWith(expect.anything(), { keymap: { checkUnsavedChanges: true } })
    expect(baseline).toEqual(draft)
    expect(status.dirty).toBe(false)
    expect(status.message).toContain('overrides the flashed keymap')
    expect(status.message).toContain('not a .keymap, GitHub or Clipboard save')
  })

  it.each(['discardChanges', 'resetSettings'] as const)('%s reads the resulting keyboard instead of assuming the old browser baseline is stock', async method => {
    await session.setBinding(0, 0, node())
    const normal = vi.mocked(call_rpc).getMockImplementation()!
    vi.mocked(call_rpc).mockImplementation(async (conn, request) => {
      if (request.keymap?.discardChanges || request.core?.resetSettings) {
        replies.getKeymap.keymap.getKeymap.layers[0].bindings[0].param1 = method === 'resetSettings' ? 2 : 4
        replies.checkUnsavedChanges.keymap.checkUnsavedChanges = false
      }
      return normal(conn, request)
    })
    expect(await session[method]()).toBe(true)
    expect(call_rpc).toHaveBeenCalledWith(expect.anything(), method === 'resetSettings' ? { core: { resetSettings: true } } : { keymap: { discardChanges: true } })
    expect(draft.layers[0][0]).toEqual(node(method === 'resetSettings' ? 2 : 4))
    expect(baseline).toEqual(draft)
    expect(status.dirty).toBe(false)
  })

  it.each(['missing', 'error', 'false', 'dirty-readback', 'wrong-readback'] as const)('does not accept a save with %s', async failure => {
    await session.setBinding(0, 0, node())
    const before = structuredClone(baseline)
    const normal = vi.mocked(call_rpc).getMockImplementation()!
    vi.mocked(call_rpc).mockImplementation(async (conn, request) => {
      if (request.keymap?.saveChanges) {
        if (failure === 'missing') return { requestId: 0 }
        if (failure === 'error') return { requestId: 0, keymap: { saveChanges: { err: 3 } } }
        if (failure === 'false') return { requestId: 0, keymap: { saveChanges: { ok: false } } }
        if (failure === 'wrong-readback') replies.getKeymap.keymap.getKeymap.layers[0].bindings[0].param1 = 8
      }
      if (request.keymap?.checkUnsavedChanges && failure === 'dirty-readback') return { requestId: 0, keymap: { checkUnsavedChanges: true } }
      return normal(conn, request)
    })
    expect(await session.saveChanges()).toBe(false)
    expect(baseline).toEqual(before)
    expect(status.dirty).toBe(true)
  })

  it('ignores a save reply arriving after disconnect and never promises unsaved recovery', async () => {
    await session.setBinding(0, 0, node())
    const before = structuredClone(baseline)
    const pending = deferred<RequestResponse>()
    const normal = vi.mocked(call_rpc).getMockImplementation()!
    vi.mocked(call_rpc).mockImplementation((conn, request) => request.keymap?.saveChanges ? pending.promise : normal(conn, request))
    const saving = session.saveChanges()
    await vi.waitFor(() => expect(call_rpc).toHaveBeenCalledWith(expect.anything(), { keymap: { saveChanges: true } }))
    notifications.close()
    await vi.waitFor(() => expect(status.state).toBe('disconnected'))
    pending.resolve({ requestId: 0, keymap: { saveChanges: { ok: true } } })
    expect(await saving).toBe(false)
    expect(baseline).toEqual(before)
    expect(status.dirty).toBe(true)
    expect(status.message).toContain('survival is unknown')
    expect(await session.setBinding(0, 0, node(6))).toBe(false)
  })

  it('keeps device-reported dirty settings guarded even without a local binding difference', async () => {
    notifications.enqueue({ keymap: { unsavedChangesStatusChanged: true } })
    await vi.waitFor(() => expect(status.dirty).toBe(true))
    notifications.enqueue({ keymap: { unsavedChangesStatusChanged: false } })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(status.dirty).toBe(true) // A notification alone is not a verified saved baseline.
  })

  it('reads existing unsaved keyboard settings on connection instead of declaring a clean session', async () => {
    replies.checkUnsavedChanges.keymap.checkUnsavedChanges = true
    await session.connect()
    expect(status.dirty).toBe(true)
  })

  it.each(['disconnected', 'locked', 'replaced'] as const)('does not send a binding after %s during metadata preflight', async outcome => {
    const pending = deferred<RequestResponse>()
    const normal = vi.mocked(call_rpc).getMockImplementation()!
    vi.mocked(call_rpc).mockImplementation((conn, request) => request.behaviors?.getBehaviorDetails ? pending.promise : normal(conn, request))
    const writing = session.setBinding(0, 0, node())
    await vi.waitFor(() => expect(call_rpc).toHaveBeenCalledWith(expect.anything(), { behaviors: { getBehaviorDetails: { behaviorId: 7 } } }))
    if (outcome === 'disconnected') session.disconnect()
    if (outcome === 'replaced') owned = false
    if (outcome === 'locked') {
      notifications.enqueue({ core: { lockStateChanged: 0 } })
      await vi.waitFor(() => expect(status.state).toBe('locked'))
    }
    pending.resolve({ requestId: 0, ...replies.getBehaviorDetails })
    expect(await writing).toBe(false)
    expect(vi.mocked(call_rpc).mock.calls.some(([, request]) => request.keymap?.setLayerBinding)).toBe(false)
    expect(draft.layers[0][0]).toEqual(node(4))
  })

  it('captures the proposed binding and serializes operations across pending RPCs', async () => {
    const pending = deferred<RequestResponse>()
    const normal = vi.mocked(call_rpc).getMockImplementation()!
    vi.mocked(call_rpc).mockImplementation((conn, request) => request.behaviors?.getBehaviorDetails ? pending.promise : normal(conn, request))
    const binding = node()
    const writing = session.setBinding(0, 0, binding)
    binding.params[0].value = 9
    expect(await session.setBinding(0, 0, node(8))).toBe(false)
    expect(await session.saveChanges()).toBe(false)
    expect(await session.discardChanges()).toBe(false)
    expect(await session.resetSettings()).toBe(false)
    pending.resolve({ requestId: 0, ...replies.getBehaviorDetails })
    expect(await writing).toBe(true)
    expect(draft.layers[0][0]).toEqual(node())
  })

  it.each(['layer', 'layout', 'binding'] as const)('refuses stale %s state before sending a binding', async changed => {
    if (changed === 'layer') replies.getKeymap.keymap.getKeymap.layers[0].id = 10
    if (changed === 'layout') replies.getPhysicalLayouts.keymap.getPhysicalLayouts.layouts[0].keys[0].x = 100
    if (changed === 'binding') replies.getKeymap.keymap.getKeymap.layers[0].bindings[0].param1 = 8
    expect(await session.setBinding(0, 0, node())).toBe(false)
    expect(vi.mocked(call_rpc).mock.calls.some(([, request]) => request.keymap?.setLayerBinding)).toBe(false)
    expect(baseline.layers[0][0]).toEqual(node(4))
  })

  it.each(['disconnect', 'missing-reply', 'refused', 'wrong-readback'] as const)('does not advance live or baseline state after a sent binding has %s', async failure => {
    const normal = vi.mocked(call_rpc).getMockImplementation()!
    vi.mocked(call_rpc).mockImplementation(async (conn, request) => {
      if (request.keymap?.setLayerBinding) {
        if (failure === 'disconnect') { session.disconnect(); return { requestId: 0, keymap: { setLayerBinding: 0 } } }
        if (failure === 'missing-reply') return { requestId: 0 }
        if (failure === 'refused') return { requestId: 0, keymap: { setLayerBinding: 3 } }
        if (failure === 'wrong-readback') return { requestId: 0, keymap: { setLayerBinding: 0 } }
      }
      return normal(conn, request)
    })
    expect(await session.setBinding(0, 0, node())).toBe(false)
    expect(draft.layers[0][0]).toEqual(node(4))
    expect(baseline.layers[0][0]).toEqual(node(4))
    expect(status.dirty).toBe(true)
  })

  it.each([
    { metadata: [], binding: node(0, 0), accepted: false },
    { metadata: [{ param1: [], param2: [] }], binding: node(0, 1), accepted: false },
    { metadata: [{ param1: [], param2: [] }], binding: node(0, 0), accepted: true },
    { metadata: [{ param1: [{ name: '', constant: 5 }], param2: [{ name: '', layerId: {} }] }], binding: node(5, 9), accepted: true },
    { metadata: [{ param1: [{ name: '', constant: 5 }], param2: [{ name: '', layerId: {} }] }], binding: node(5, 0), accepted: false },
    { metadata: [{ param1: [{ name: '', constant: 5 }], param2: [{ name: '', constant: 6 }] }, { param1: [{ name: '', constant: 6 }], param2: [{ name: '', constant: 5 }] }], binding: node(5, 5), accepted: false },
    ...[0x70004, 0x7000b, 0xc0001, 0xc0003, 0x10001, 0x70000, 0x1070004].map(value => ({
      metadata: [{ param1: [{ name: '', hidUsage: { keyboardMax: 10, consumerMax: 2 } }], param2: [] }],
      binding: node(value), accepted: value === 0x70004 || value === 0xc0001
    }))
  ])('validates the complete advertised metadata set: %j', async ({ metadata, binding, accepted }) => {
    replies.getBehaviorDetails.behaviors.getBehaviorDetails.metadata = metadata
    expect(await session.setBinding(0, 0, binding)).toBe(accepted)
    expect(vi.mocked(call_rpc).mock.calls.filter(([, request]) => request.keymap?.setLayerBinding)).toHaveLength(accepted ? 1 : 0)
  })

  it.each(['missing-details', 'wrong-id', 'malformed-metadata'] as const)('refuses %s from the fresh metadata read', async failure => {
    if (failure === 'wrong-id') replies.getBehaviorDetails.behaviors.getBehaviorDetails.id = 8
    if (failure === 'malformed-metadata') Object.assign(replies.getBehaviorDetails.behaviors.getBehaviorDetails.metadata[0].param1[0], { constant: 5 })
    if (failure === 'missing-details') {
      const normal = vi.mocked(call_rpc).getMockImplementation()!
      vi.mocked(call_rpc).mockImplementation((conn, request) => request.behaviors?.getBehaviorDetails ? Promise.resolve({ requestId: 0 }) : normal(conn, request))
    }
    expect(await session.setBinding(0, 0, node())).toBe(false)
    expect(vi.mocked(call_rpc).mock.calls.some(([, request]) => request.keymap?.setLayerBinding)).toBe(false)
    expect(baseline.layers[0][0]).toEqual(node(4))
  })

  it.each(['discardChanges', 'resetSettings'] as const)('does not advance the baseline for missing %s acknowledgement', async method => {
    await session.setBinding(0, 0, node())
    const normal = vi.mocked(call_rpc).getMockImplementation()!
    vi.mocked(call_rpc).mockImplementation((conn, request) => request.keymap?.discardChanges || request.core?.resetSettings ? Promise.resolve({ requestId: 0 }) : normal(conn, request))
    expect(await session[method]()).toBe(false)
    expect(status.dirty).toBe(true)
    expect(baseline.layers[0][0]).toEqual(node(4))
  })

  it('exposes explicit USB actions, metadata refusal, leave protection and restore-stock consent', async () => {
    session.disconnect()
    editor.resetForTests()
    const target = document.createElement('div')
    document.body.appendChild(target)
    const view = mount(UsbPicker, { target, props: {
      onSelect: async (selection: UsbKeyboardSelection) => {
        await editor.selectKeyboard(selection)
        return editor.usbSelection === selection
      }, onUseClipboard() {}
    } })
    const button = (text: string) => {
      const found = [...target.querySelectorAll('button')].find(item => item.textContent?.trim() === text)
      if (!found) throw new Error(`Missing button: ${text}`)
      return found
    }
    const input = (label: string, value: string) => {
      const field = target.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!
      field.value = value
      field.dispatchEvent(new Event('input', { bubbles: true }))
      flushSync()
    }
    try {
      flushSync()
      button('Connect USB').click()
      await vi.waitFor(() => expect(editor.source).toBe('usb'))
      await vi.waitFor(() => expect(button('Write binding').disabled).toBe(false))
      expect(target.textContent).toContain('overrides the flashed keymap')
      expect(target.textContent).toContain('not a .keymap, GitHub or Clipboard save')
      input('Parameter 1', '11')
      button('Write binding').click()
      await vi.waitFor(() => expect(target.textContent).toContain('metadata-refusal'))
      expect(needsUnpublishedLeaveWarning(editor)).toBe(false)
      input('Parameter 1', '5')
      button('Write binding').click()
      await vi.waitFor(() => expect(editor.draftKeymap!.layers[0][0]).toEqual(node()))
      expect(needsUnpublishedLeaveWarning(editor)).toBe(true)
      expect(editor.statusText).toContain('not saved')
      button('Save keyboard settings').click()
      await vi.waitFor(() => expect(needsUnpublishedLeaveWarning(editor)).toBe(false))
      expect(editor.baselineKeymap!.layers[0][0]).toEqual(node())
      expect(editor.statusText).toContain('overrides the flashed keymap')
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      vi.mocked(call_rpc).mockClear()
      button('Restore stock').click()
      expect(confirm).toHaveBeenCalledWith(expect.stringContaining('core.resetSettings'))
      expect(call_rpc).not.toHaveBeenCalled()
      confirm.mockReturnValue(true)
      button('Restore stock').click()
      await vi.waitFor(() => expect(call_rpc).toHaveBeenCalledWith(expect.anything(), { core: { resetSettings: true } }))
      await vi.waitFor(() => expect(target.textContent).toContain('Stock keyboard settings restored'))
      input('Parameter 1', '6')
      button('Write binding').click()
      await vi.waitFor(() => expect(editor.draftKeymap!.layers[0][0]).toEqual(node(6)))
      button('Disconnect USB').click()
      await vi.waitFor(() => expect(editor.statusText).toContain('survival is unknown'))
      expect(needsUnpublishedLeaveWarning(editor)).toBe(true)
      expect(editor.baselineKeymap!.layers[0][0]).toEqual(node())
      expect(button('Write binding').disabled).toBe(true)
    } finally {
      await unmount(view)
      target.remove()
      editor.resetForTests()
    }
  })
})
