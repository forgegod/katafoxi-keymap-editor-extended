import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseKeyBinding } from '@keymap-editor/keymap-core'
import { editor } from './editor.svelte'
import KeyboardPicker from './components/Pickers/KeyboardPicker.svelte'
import type { KeyboardSelection } from './editor/types'
import { publishKeymap } from './publish-keymap'
import { copyClipboardKeymap } from './editor/clipboard-copy'
import { buildDraftIdentity, deleteStoredDraft } from './draft-storage'
import { clearHostLayoutStore } from './host-layout-store'

vi.mock('@zmkfirmware/zmk-studio-ts-client', () => ({
  create_rpc_connection: vi.fn(),
  call_rpc: vi.fn()
}))

import { call_rpc, create_rpc_connection, type Notification, type RequestResponse } from '@zmkfirmware/zmk-studio-ts-client'

const responses = () => ({
  getDeviceInfo: { core: { getDeviceInfo: { name: 'Test keyboard', serialNumber: new Uint8Array([1]) } } },
  getLockState: { core: { getLockState: 1 } },
  checkUnsavedChanges: { keymap: { checkUnsavedChanges: false } },
  listAllBehaviors: { behaviors: { listAllBehaviors: { behaviors: [7] } } },
  getBehaviorDetails: { behaviors: { getBehaviorDetails: { id: 7, displayName: 'Key press', metadata: [] } } },
  getPhysicalLayouts: { keymap: { getPhysicalLayouts: { activeLayoutIndex: 0, layouts: [{ name: 'Test layout', keys: [{ x: 0, y: 0, width: 100, height: 100, r: 0, rx: 0, ry: 0 }] }] } } },
  getKeymap: { keymap: { getKeymap: { layers: [{ id: 9, name: 'Base', bindings: [{ behaviorId: 7, param1: 4, param2: 0 }] }], availableLayers: 1, maxLayerNameLength: 16 } } }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => { resolve = res })
  return { promise, resolve }
}

describe('USB Studio source picker', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined
  let replies: ReturnType<typeof responses>
  let notifications: ReadableStreamDefaultController<Notification>
  let connectionSignal: AbortSignal | undefined
  let requestPort: ReturnType<typeof vi.fn>
  let port: { open: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; getInfo: () => object; readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }

  function button(label: string) {
    const found = [...target.querySelectorAll('button')].find(node => node.textContent?.trim() === label)
    if (!found) throw new Error(`Missing button: ${label}`)
    return found
  }

  function acceptedState() {
    return JSON.stringify({
      source: editor.source, draft: editor.draftKeymap, baseline: editor.baselineKeymap,
      layout: editor.layout, baselineLayout: editor.baselineLayout,
      undo: editor.undoStack, redo: editor.redoStack,
      host: editor.hostLegend, assemblies: editor.hostAssemblies,
      sourceText: editor.clipboardOriginalSource, baselineSource: editor._baselineClipboardSource,
      layer: editor.layerOperationSnapshot, baselineIds: editor._baselineLayerIds,
      github: editor.githubMeta, pending: editor.hasPendingFirmwareRecovery,
      remembered: localStorage.getItem('selectedSource')
    })
  }

  function openPicker(onSelect?: (event: KeyboardSelection) => Promise<boolean>) {
    view = mount(KeyboardPicker, { target, props: {
      onSelect: onSelect ?? (async (event: KeyboardSelection) => {
        await editor.selectKeyboard(event)
        return editor.source === event.source && (event.source !== 'usb' || editor.usbSelection === event)
      })
    } })
    flushSync()
    target.querySelector<HTMLButtonElement>('[data-testid="source-menu-trigger"]')!.click()
    target.querySelector<HTMLButtonElement>('[data-source="usb"]')?.click()
    flushSync()
  }

  beforeEach(async () => {
    editor.resetForTests()
    await editor._draftWrites
    await editor._hostCacheWrites
    await deleteStoredDraft(buildDraftIdentity({ source: 'clipboard', keyboard: 'accepted' })!)
    await clearHostLayoutStore()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    localStorage.clear()
    localStorage.setItem('selectedSource', 'clipboard')
    await editor.selectKeyboard({ source: 'clipboard', keymap: { keyboard: 'accepted', layers: [[parseKeyBinding('&kp A')]], layer_names: ['Base'] }, layout: [{ x: 0, y: 0 }], clipboardOriginalSource: 'accepted source' })
    target = document.createElement('div')
    document.body.appendChild(target)
    replies = responses()
    port = { open: vi.fn(async () => {}), close: vi.fn(async () => {}), getInfo: () => ({ usbVendorId: 1, usbProductId: 2 }), readable: new ReadableStream(), writable: new WritableStream() }
    requestPort = vi.fn(async () => port)
    vi.stubGlobal('navigator', { serial: { requestPort } })
    vi.stubGlobal('isSecureContext', true)
    vi.mocked(create_rpc_connection).mockImplementation((transport, opts) => {
      connectionSignal = opts?.signal
      connectionSignal?.addEventListener('abort', () => transport.abortController.abort(), { once: true })
      return { label: transport.label, current_request: 0, request_writable: new WritableStream(), request_response_readable: new ReadableStream(), notification_readable: new ReadableStream({ start(controller) { notifications = controller } }) }
    })
    vi.mocked(call_rpc).mockImplementation(async (_conn, request) => {
      const method = Object.keys(request.core ?? request.behaviors ?? request.keymap ?? {})[0]
      const reply = replies[method as keyof typeof replies]
      if (!reply) throw new Error(`Unexpected RPC: ${method}`)
      return reply as RequestResponse
    })
  })

  afterEach(async () => {
    if (view) await unmount(view)
    view = undefined
    await editor._draftWrites
    editor.resetForTests()
    target.remove()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('offers USB beside the existing sources without requesting a port on mount', async () => {
    openPicker()
    await vi.waitFor(() => expect(target.querySelector('[data-source="usb"]')).not.toBeNull())
    await vi.waitFor(() => expect(button('Connect USB').disabled).toBe(false))
    expect(target.textContent).toContain('Disconnected')
    expect(requestPort).not.toHaveBeenCalled()
    expect(call_rpc).not.toHaveBeenCalled()
    expect(editor.source).toBe('clipboard')
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('requests serial synchronously on Connect and accepts only identified, unlocked mapped data', async () => {
    const info = deferred<RequestResponse>()
    vi.mocked(call_rpc).mockImplementationOnce(() => info.promise)
    openPicker()
    await vi.waitFor(() => expect(button('Connect USB')).toBeTruthy())
    const before = editor.draftKeymap
    button('Connect USB').click()
    expect(requestPort).toHaveBeenCalledWith({})
    await vi.waitFor(() => expect(call_rpc).toHaveBeenCalledTimes(1))
    expect(call_rpc).toHaveBeenLastCalledWith(expect.anything(), { core: { getDeviceInfo: true } })
    expect(editor.draftKeymap).toBe(before)
    info.resolve({ requestId: 0, ...replies.getDeviceInfo })
    await vi.waitFor(() => expect(editor.source).toBe('usb'))
    expect(editor.draftKeymap?.layers).toEqual([[{ value: 7, params: [{ value: 4, params: [] }, { value: 0, params: [] }] }]])
    expect(editor.layout).toEqual([{ x: 0, y: 0, w: 1, h: 1, r: 0, rx: 0, ry: 0 }])
    expect(target.textContent).toContain('Unlocked')
    expect(target.textContent).toContain('Test keyboard')
    expect(editor.clipboardOriginalSource).toBeNull()
    expect(editor.githubMeta).toBeNull()
    expect(localStorage.getItem('selectedSource')).toBe('usb')
    expect(vi.mocked(call_rpc).mock.calls.map(([, request]) => request)).toEqual([
      { core: { getDeviceInfo: true } }, { core: { getLockState: true } },
      { behaviors: { listAllBehaviors: true } }, { behaviors: { getBehaviorDetails: { behaviorId: 7 } } },
      { keymap: { getPhysicalLayouts: true } }, { keymap: { getKeymap: true } },
      { core: { getLockState: true } }, { keymap: { checkUnsavedChanges: true } }
    ])
  })

  it.each([undefined, {}, { requestPort: 'not callable' }])('keeps Clipboard guidance when Web Serial is unavailable (%s)', async serial => {
    vi.stubGlobal('navigator', { serial })
    openPicker()
    await vi.waitFor(() => expect(target.textContent).toContain('Unavailable'))
    expect(button('Connect USB').disabled).toBe(true)
    expect(target.textContent).toContain('Use Clipboard')
    button('Use Clipboard').click()
    await vi.waitFor(() => expect(target.querySelector('[data-source="clipboard"]')?.getAttribute('aria-checked')).toBe('true'))
    expect(requestPort).not.toHaveBeenCalled()
    expect(editor.source).toBe('clipboard')
  })

  it('waits for physical unlock, loads once, and preserves that snapshot on disconnect', async () => {
    replies.getLockState.core.getLockState = 0
    openPicker()
    await vi.waitFor(() => expect(button('Connect USB')).toBeTruthy())
    const before = editor.draftKeymap
    button('Connect USB').click()
    await vi.waitFor(() => expect(target.textContent).toContain('Locked'))
    expect(target.textContent).toContain('Studio Unlock')
    expect(editor.draftKeymap).toBe(before)
    expect(call_rpc).toHaveBeenCalledTimes(2)
    replies.getLockState.core.getLockState = 1
    notifications.enqueue({ core: { lockStateChanged: 1 } })
    await vi.waitFor(() => expect(editor.source).toBe('usb'))
    const accepted = editor.draftKeymap
    const calls = vi.mocked(call_rpc).mock.calls.length
    notifications.enqueue({ core: { lockStateChanged: 1 } })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(call_rpc).toHaveBeenCalledTimes(calls)
    notifications.close()
    await vi.waitFor(() => expect(target.textContent).toContain('Disconnected'))
    expect(editor.draftKeymap).toBe(accepted)
    expect(connectionSignal?.aborted).toBe(true)
    await vi.waitFor(() => expect(port.close).toHaveBeenCalledTimes(1))
  })

  it('queues an unlock while the initial lock-state read is pending and loads once', async () => {
    const lockState = deferred<RequestResponse>()
    const normal = vi.mocked(call_rpc).getMockImplementation()!
    vi.mocked(call_rpc)
      .mockImplementationOnce(normal)
      .mockImplementationOnce(() => lockState.promise)
    const select = vi.fn(async (event: KeyboardSelection) => {
      await editor.selectKeyboard(event)
      return editor.source === event.source && editor.usbSelection === event
    })
    openPicker(select)
    await vi.waitFor(() => expect(button('Connect USB')).toBeTruthy())
    const before = acceptedState()
    button('Connect USB').click()
    await vi.waitFor(() => expect(call_rpc).toHaveBeenLastCalledWith(expect.anything(), { core: { getLockState: true } }))
    notifications.enqueue({ core: { lockStateChanged: 1 } })
    await vi.waitFor(() => expect(target.textContent).toContain('Unlocked'))
    expect(call_rpc).toHaveBeenCalledTimes(2)
    expect(select).not.toHaveBeenCalled()
    expect(acceptedState()).toBe(before)

    lockState.resolve({ requestId: 0, core: { getLockState: 0 } })
    await vi.waitFor(() => expect(editor.source).toBe('usb'))
    expect(select).toHaveBeenCalledTimes(1)
    expect(vi.mocked(call_rpc).mock.calls.map(([, request]) => request)).toEqual([
      { core: { getDeviceInfo: true } }, { core: { getLockState: true } },
      { core: { getLockState: true } },
      { behaviors: { listAllBehaviors: true } }, { behaviors: { getBehaviorDetails: { behaviorId: 7 } } },
      { keymap: { getPhysicalLayouts: true } }, { keymap: { getKeymap: true } },
      { core: { getLockState: true } }, { keymap: { checkUnsavedChanges: true } }
    ])
    notifications.enqueue({ core: { lockStateChanged: 0 } })
    await vi.waitFor(() => expect(target.textContent).toContain('Locked'))
    notifications.enqueue({ core: { lockStateChanged: 1 } })
    await vi.waitFor(() => expect(target.textContent).toContain('Unlocked'))
    expect(call_rpc).toHaveBeenCalledTimes(9)
    expect(select).toHaveBeenCalledTimes(1)
  })

  it.each(['relocked', 'disconnected', 'edited'] as const)('does not apply a queued unlock load after the session is %s', async outcome => {
    const lockState = deferred<RequestResponse>()
    const normal = vi.mocked(call_rpc).getMockImplementation()!
    vi.mocked(call_rpc)
      .mockImplementationOnce(normal)
      .mockImplementationOnce(() => lockState.promise)
    const select = vi.fn(async () => true)
    openPicker(select)
    await vi.waitFor(() => expect(button('Connect USB')).toBeTruthy())
    button('Connect USB').click()
    await vi.waitFor(() => expect(call_rpc).toHaveBeenLastCalledWith(expect.anything(), { core: { getLockState: true } }))
    notifications.enqueue({ core: { lockStateChanged: 1 } })
    await vi.waitFor(() => expect(target.textContent).toContain('Unlocked'))
    if (outcome === 'relocked') {
      notifications.enqueue({ core: { lockStateChanged: 0 } })
      await vi.waitFor(() => expect(target.textContent).toContain('Locked'))
    } else if (outcome === 'disconnected') {
      button('Disconnect USB').click()
      await vi.waitFor(() => expect(target.textContent).toContain('Disconnected'))
    } else {
      editor.updateKeymap({ layers: [[parseKeyBinding('&kp D')]] })
    }
    const before = acceptedState()
    lockState.resolve({ requestId: 0, core: { getLockState: 0 } })
    if (outcome === 'edited') await vi.waitFor(() => expect(target.textContent).toContain('current editor was retained'))
    else {
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(call_rpc).toHaveBeenCalledTimes(2)
    }
    expect(select).not.toHaveBeenCalled()
    expect(acceptedState()).toBe(before)
  })

  it.each(['denied', 'cancelled', 'missing', 'rpc-error', 'unsupported'] as const)('preserves the accepted editor when connection is %s', async failure => {
    if (failure === 'denied') requestPort.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))
    if (failure === 'cancelled') requestPort.mockRejectedValue(new DOMException('No port selected', 'NotFoundError'))
    if (failure === 'missing') vi.mocked(call_rpc).mockResolvedValueOnce({ requestId: 0 })
    if (failure === 'rpc-error') vi.mocked(call_rpc).mockRejectedValueOnce(new Error('Read failed'))
    if (failure === 'unsupported') Object.assign(replies.getKeymap.keymap.getKeymap, { combos: [] })
    openPicker()
    await vi.waitFor(() => expect(button('Connect USB')).toBeTruthy())
    editor.updateKeymap({ layers: [[parseKeyBinding('&kp B')]] })
    const before = { keymap: editor.draftKeymap, baseline: editor.baselineKeymap, layout: editor.layout, host: JSON.stringify(editor.hostLegend), history: editor.undoStack }
    const snapshot = acceptedState()
    button('Connect USB').click()
    await vi.waitFor(() => expect(target.textContent).toContain('Unavailable'))
    expect(editor.source).toBe('clipboard')
    expect(editor.draftKeymap).toBe(before.keymap)
    expect(editor.baselineKeymap).toBe(before.baseline)
    expect(editor.layout).toBe(before.layout)
    expect(editor.undoStack).toBe(before.history)
    expect(JSON.stringify(editor.hostLegend)).toBe(before.host)
    expect(localStorage.getItem('selectedSource')).toBe('clipboard')
    if (failure === 'unsupported') expect(target.textContent).toContain('combos')
    expect(acceptedState()).toBe(snapshot)
    if (failure !== 'denied' && failure !== 'cancelled') await vi.waitFor(() => expect(port.close).toHaveBeenCalledTimes(1))
  })

  it.each(['refused', 'edited'] as const)('preserves accepted state when retention is %s', async outcome => {
    openPicker()
    await vi.waitFor(() => expect(button('Connect USB')).toBeTruthy())
    const pending = deferred<boolean>()
    const retain = vi.spyOn(editor, 'retainWorkForTransition').mockReturnValue(pending.promise)
    button('Connect USB').click()
    await vi.waitFor(() => expect(retain).toHaveBeenCalled())
    if (outcome === 'edited') editor.updateKeymap({ layers: [[parseKeyBinding('&kp D')]] })
    const before = acceptedState()
    pending.resolve(outcome === 'edited')
    await vi.waitFor(() => expect(target.textContent).toContain('current editor was retained'))
    expect(acceptedState()).toBe(before)
    expect(connectionSignal?.aborted).toBe(true)
    expect(button('Connect USB').disabled).toBe(false)
  })

  it('does not treat a same-source callback as acceptance of a different USB snapshot', async () => {
    let refuse = false
    openPicker(async event => {
      if (!refuse) await editor.selectKeyboard(event)
      return editor.source === event.source
    })
    await vi.waitFor(() => expect(button('Connect USB')).toBeTruthy())
    button('Connect USB').click()
    await vi.waitFor(() => expect(editor.source).toBe('usb'))
    const before = editor.draftKeymap
    const selection = editor.usbSelection
    refuse = true
    button('Disconnect USB').click()
    await vi.waitFor(() => expect(port.close).toHaveBeenCalledTimes(1))
    port.readable = new ReadableStream()
    port.writable = new WritableStream()
    button('Connect USB').click()
    await vi.waitFor(() => expect(target.textContent).toContain('current editor was retained'))
    expect(editor.draftKeymap).toBe(before)
    expect(editor.usbSelection).toBe(selection)
    expect(connectionSignal?.aborted).toBe(true)
  })

  it('times out an unresponsive device without clearing the accepted editor', async () => {
    const reply = deferred<RequestResponse>()
    vi.mocked(call_rpc).mockImplementationOnce(() => reply.promise)
    openPicker()
    await vi.waitFor(() => expect(button('Connect USB')).toBeTruthy())
    const before = editor.draftKeymap
    vi.useFakeTimers()
    button('Connect USB').click()
    await vi.advanceTimersByTimeAsync(5001)
    flushSync()
    expect(target.textContent).toContain('Unavailable')
    expect(target.textContent).toContain('timed out')
    expect(editor.draftKeymap).toBe(before)
    expect(connectionSignal?.aborted).toBe(true)
    reply.resolve({ requestId: 0, ...replies.getDeviceInfo })
    await vi.advanceTimersByTimeAsync(1)
    expect(call_rpc).toHaveBeenCalledTimes(1)
  })

  it('rechecks disconnect at the editor acceptance boundary after asynchronous retention', async () => {
    openPicker()
    await vi.waitFor(() => expect(button('Connect USB')).toBeTruthy())
    const retained = deferred<boolean>()
    const retain = vi.spyOn(editor, 'retainWorkForTransition').mockReturnValue(retained.promise)
    const before = editor.draftKeymap
    button('Connect USB').click()
    await vi.waitFor(() => expect(retain).toHaveBeenCalled())
    notifications.close()
    await vi.waitFor(() => expect(target.textContent).toContain('Disconnected'))
    retained.resolve(true)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(editor.draftKeymap).toBe(before)
    expect(editor.source).toBe('clipboard')
    expect(localStorage.getItem('selectedSource')).toBe('clipboard')
  })

  it('keeps numeric USB snapshots read-only, session-local and outside file publication', async () => {
    openPicker()
    await vi.waitFor(() => expect(button('Connect USB')).toBeTruthy())
    const restoreHost = vi.spyOn(editor, '_restoreHostLegend')
    const restoreDraft = vi.spyOn(editor, '_maybeRestorePersistedDraft')
    const fetch = vi.fn()
    const writeText = vi.fn()
    vi.stubGlobal('fetch', fetch)
    Object.assign(navigator, { clipboard: { writeText } })
    button('Connect USB').click()
    await vi.waitFor(() => expect(editor.source).toBe('usb'))
    expect(editor.currentDraftIdentity()).toBeNull()
    expect(editor.usbSelection?.studio.layerIds).toEqual([9])
    expect(editor.statusText).toContain('read-only')
    expect(restoreHost).not.toHaveBeenCalled()
    expect(restoreDraft).not.toHaveBeenCalled()
    const before = editor.draftKeymap
    editor.updateKeymap({ layers: [[parseKeyBinding('&kp B')]] })
    editor.addLayer()
    expect(editor.draftKeymap).toBe(before)
    expect(editor.canUndo).toBe(false)
    const write = vi.fn()
    const reload = vi.fn()
    // Even a bypassed UI/dirty caller must not send numeric RPC bindings to a file writer.
    await publishKeymap({ ...editor, source: 'usb', isDirty: true, isPublishDirty: true } as unknown as Parameters<typeof publishKeymap>[0], { write, reload })
    expect(write).not.toHaveBeenCalled()
    await copyClipboardKeymap(editor as unknown as Parameters<typeof copyClipboardKeymap>[0])
    expect(writeText).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['device-info', 'keymap', 'permission'] as const)('does not replace edits made during pending %s reads', async stage => {
    const info = deferred<RequestResponse>()
    const permission = deferred<typeof port>()
    if (stage === 'permission') requestPort.mockReturnValueOnce(permission.promise)
    else {
      const normal = vi.mocked(call_rpc).getMockImplementation()!
      vi.mocked(call_rpc).mockImplementation((conn, request) =>
        (stage === 'device-info' ? request.core?.getDeviceInfo : request.keymap?.getKeymap) ? info.promise : normal(conn, request))
    }
    openPicker()
    await vi.waitFor(() => expect(button('Connect USB')).toBeTruthy())
    button('Connect USB').click()
    if (stage === 'permission') expect(requestPort).toHaveBeenCalledTimes(1)
    else await vi.waitFor(() => expect(call_rpc).toHaveBeenLastCalledWith(expect.anything(), stage === 'device-info' ? { core: { getDeviceInfo: true } } : { keymap: { getKeymap: true } }))
    editor.updateKeymap({ ...editor.draftKeymap!, layers: [[parseKeyBinding('&kp C')]] })
    const changed = editor.draftKeymap
    const snapshot = acceptedState()
    if (stage === 'permission') permission.resolve(port)
    else info.resolve({ requestId: 0, ...(stage === 'device-info' ? replies.getDeviceInfo : replies.getKeymap) })
    await vi.waitFor(() => expect(target.textContent).toContain('current editor was retained'))
    expect(editor.draftKeymap).toBe(changed)
    expect(editor.source).toBe('clipboard')
    expect(editor.canUndo).toBe(true)
    expect(connectionSignal?.aborted).toBe(true)
    expect(acceptedState()).toBe(snapshot)
  })

  it.each([0, 1])('manually disconnects a lock=%s session without changing the accepted editor', async lock => {
    replies.getLockState.core.getLockState = lock
    openPicker()
    await vi.waitFor(() => expect(button('Connect USB')).toBeTruthy())
    button('Connect USB').click()
    await vi.waitFor(() => expect(target.textContent).toContain(lock ? 'Unlocked' : 'Locked'))
    const before = acceptedState()
    // Acceptance closes the popup; reopen it to prove Disconnect is reachable.
    if (target.querySelector('.source-popover')?.hasAttribute('hidden')) {
      target.querySelector<HTMLButtonElement>('[data-testid="source-menu-trigger"]')!.click()
      flushSync()
    }
    expect(target.querySelector('.source-popover')?.hasAttribute('hidden')).toBe(false)
    expect(button('Disconnect USB').disabled).toBe(false)
    button('Disconnect USB').click()
    await vi.waitFor(() => expect(target.textContent).toContain('Disconnected'))
    expect(acceptedState()).toBe(before)
    expect(connectionSignal?.aborted).toBe(true)
    await vi.waitFor(() => expect(port.close).toHaveBeenCalledTimes(1))
  })

  it('cancels an in-flight read with Disconnect and ignores its late response', async () => {
    const info = deferred<RequestResponse>()
    vi.mocked(call_rpc).mockImplementationOnce(() => info.promise)
    openPicker()
    await vi.waitFor(() => expect(button('Connect USB')).toBeTruthy())
    const before = editor.draftKeymap
    button('Connect USB').click()
    await vi.waitFor(() => expect(call_rpc).toHaveBeenCalledTimes(1))
    button('Disconnect USB').click()
    await vi.waitFor(() => expect(target.textContent).toContain('Disconnected'))
    const snapshot = acceptedState()
    info.resolve({ requestId: 0, ...replies.getDeviceInfo })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(editor.draftKeymap).toBe(before)
    expect(call_rpc).toHaveBeenCalledTimes(1)
    expect(connectionSignal?.aborted).toBe(true)
    expect(acceptedState()).toBe(snapshot)
  })
})
