import { flushSync, mount, unmount, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseKeyBinding } from '@keymap-editor/keymap-core'
import { editor } from '../../../editor.svelte'
import { loadStoredDraft } from '../../../draft-storage'
import type { FilesystemAccessEnv, FilesystemDirectoryHandleLike, FilesystemFileHandleLike, FilesystemWritableStreamLike } from '../../../filesystem-access'
import type { FilesystemKeyboardSelection } from '../../../editor/types'
import type { FilesystemHandlesPort } from './handles-port'
import type { FilesystemReloadPort } from './reload-port'
import FilesystemPicker from './Picker.svelte'

const SOURCE = '/* raw */\n#include <behaviors.dtsi>\n/ {\n  keymap {\n    compatible = "zmk,keymap";\n    default_layer {\n      bindings = <&kp A>;\n    };\n  };\n};\n'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type Entry = { id: string; name: string; bytes: number[] }

function entry(name: string, text = SOURCE): Entry {
  return { id: crypto.randomUUID(), name, bytes: Array.from(new TextEncoder().encode(text)) }
}

type Handle = FilesystemFileHandleLike & { readonly __entryId: string }

function handleFor(
  disk: Entry,
  options: {
    writable?: { stream: FilesystemWritableStreamLike; permission?: 'granted' | 'prompt' | 'denied' }
  } = {}
): Handle {
  const handle: Handle = {
    kind: 'file',
    name: disk.name,
    __entryId: disk.id,
    getFile: async () => ({
      name: disk.name,
      size: disk.bytes.length,
      lastModified: 0,
      arrayBuffer: async () => new Uint8Array([...disk.bytes]).buffer
    }),
    isSameEntry: async other => (other as Handle | null)?.__entryId === disk.id
  }
  if (options.writable) {
    handle.queryPermission = vi.fn(async () => (options.writable!.permission ?? 'granted') as 'granted' | 'prompt' | 'denied')
    handle.requestPermission = vi.fn(async () => {
      options.writable!.permission = 'granted'
      return 'granted' as const
    })
    handle.createWritable = vi.fn(async () => options.writable!.stream)
  }
  return handle
}

function memoryPort() {
  const store = new Map<string, Parameters<FilesystemHandlesPort['accept']>[1]>()
  const port: FilesystemHandlesPort = {
    identify: vi.fn(async handle => {
      for (const [documentId, payload] of store) {
        if (await payload.file.isSameEntry(handle)) return { documentId, reused: true }
      }
      const documentId = `fs:1:${crypto.randomUUID()}`
      return { documentId, reused: false }
    }),
    accept: vi.fn(async (documentId, payload, remember) => {
      store.set(documentId, payload)
      return { remembered: Boolean(remember) }
    }),
    restore: vi.fn(async documentId => store.get(documentId) ?? null),
    forget: vi.fn(async documentId => {
      store.delete(documentId)
    })
  }
  return { port, store }
}

function makeEnv() {
  return {
    isSecureContext: true,
    showOpenFilePicker: vi.fn(),
    showDirectoryPicker: vi.fn()
  } as FilesystemAccessEnv & {
    showOpenFilePicker: ReturnType<typeof vi.fn>
    showDirectoryPicker: ReturnType<typeof vi.fn>
  }
}

describe('FilesystemPicker', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  function mountPicker(props: ComponentProps<typeof FilesystemPicker>) {
    view = mount(FilesystemPicker, { target, props })
    flushSync()
  }

  function button(label: string): HTMLButtonElement {
    const found = [...target.querySelectorAll('button')].find(node => node.textContent?.trim() === label)
    if (!(found instanceof HTMLButtonElement)) throw new Error(`missing button: ${label}`)
    return found
  }

  function buttonContaining(label: string): HTMLButtonElement {
    const found = [...target.querySelectorAll('button')].find(node => node.textContent?.includes(label))
    if (!(found instanceof HTMLButtonElement)) throw new Error(`missing button containing: ${label}`)
    return found
  }

  function text(): string {
    return target.textContent ?? ''
  }

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  afterEach(async () => {
    await editor._draftWrites
    if (view) unmount(view)
    view = undefined
    target?.remove()
    editor.resetForTests()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const onSelect = (event: FilesystemKeyboardSelection) => editor.selectKeyboard(event)

  it('performs no picker call, permission request or disk read on mount', () => {
    const env = makeEnv()
    const { port } = memoryPort()
    mountPicker({ onSelect: vi.fn(), env, handles: port })
    expect(env.showOpenFilePicker).not.toHaveBeenCalled()
    expect(env.showDirectoryPicker).not.toHaveBeenCalled()
    expect(port.identify).not.toHaveBeenCalled()
    expect(port.restore).not.toHaveBeenCalled()
  })

  it('explains an unsupported browser and offers Clipboard without touching the domain', () => {
    const onUseClipboard = vi.fn()
    const { port } = memoryPort()
    mountPicker({ onSelect: vi.fn(), env: { isSecureContext: true }, handles: port, onUseClipboard })
    expect(text()).toContain('cannot open files from disk')
    button('Use Clipboard').click()
    flushSync()
    expect(onUseClipboard).toHaveBeenCalled()
    expect(port.identify).not.toHaveBeenCalled()
  })

  it('stages a picked file and accepts it with Open without layout', async () => {
    const disk = entry('a.keymap')
    const picked = handleFor(disk)
    const env = makeEnv()
    env.showOpenFilePicker.mockResolvedValue([picked])
    const { port } = memoryPort()
    const select = vi.fn(onSelect)
    mountPicker({ onSelect: select, env, handles: port })

    button('Open file').click()
    await vi.waitFor(() => expect(text()).toContain('Staged firmware: a.keymap'))
    expect(select).not.toHaveBeenCalled()

    button('Open without layout').click()
    await vi.waitFor(() => expect(editor.source).toBe('filesystem'))
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'filesystem',
        keymap: expect.any(Object),
        filesystem: expect.objectContaining({
          documentId: expect.stringMatching(/^fs:1:/),
          baseline: expect.objectContaining({ source: SOURCE, route: { kind: 'file' } })
        })
      })
    )
    expect(target.querySelector('[data-filesystem-picker]')).toBeTruthy()
    expect(editor.saveNotice?.messages.join(' ')).toContain('flat rectangular')
  })

  it('accepts an explicitly chosen layout JSON and records the geometry baseline', async () => {
    const disk = entry('a.keymap')
    const geometryDisk = entry('a.json', JSON.stringify({ layouts: { default: { layout: [{ x: 0, y: 0, row: 0, col: 0 }] } } }))
    const env = makeEnv()
    env.showOpenFilePicker.mockResolvedValueOnce([handleFor(disk)]).mockResolvedValueOnce([handleFor(geometryDisk)])
    const { port } = memoryPort()
    const select = vi.fn(onSelect)
    mountPicker({ onSelect: select, env, handles: port })

    button('Open file').click()
    await vi.waitFor(() => expect(text()).toContain('Staged firmware'))
    button('Choose layout JSON').click()
    await vi.waitFor(() => expect(editor.source).toBe('filesystem'))
    const baseline = (select.mock.calls[0][0] as FilesystemKeyboardSelection).filesystem.baseline
    expect(baseline.geometry).toEqual({ name: 'a.json', bytes: geometryDisk.bytes })
    expect(baseline.layout).toHaveLength(1)
  })

  it('refuses a JSON-only "keymap" and keeps the staged slot clean', async () => {
    const disk = entry('a.keymap', '{ "layers": [] }')
    const env = makeEnv()
    env.showOpenFilePicker.mockResolvedValue([handleFor(disk)])
    const { port } = memoryPort()
    const select = vi.fn(onSelect)
    mountPicker({ onSelect: select, env, handles: port })

    button('Open file').click()
    await vi.waitFor(() => expect(text()).toContain('ZMK .keymap text, not JSON'))
    expect(select).not.toHaveBeenCalled()
    expect(text()).not.toContain('Open without layout')
  })

  it('cancels a staged candidate without touching the session', async () => {
    const env = makeEnv()
    env.showOpenFilePicker.mockResolvedValue([handleFor(entry('a.keymap'))])
    const { port } = memoryPort()
    mountPicker({ onSelect: vi.fn(onSelect), env, handles: port })
    button('Open file').click()
    await vi.waitFor(() => expect(text()).toContain('Staged firmware'))
    button('Cancel candidate').click()
    flushSync()
    expect(text()).not.toContain('Staged firmware')
    expect(editor.source).toBeNull()
  })

  it('lists direct folder keymaps in exact order and requires an explicit choice', async () => {
    const upper = handleFor(entry('B.keymap'))
    const lower = handleFor(entry('a.keymap'))
    const umlaut = handleFor(entry('ä.keymap'))
    const env = makeEnv()
    env.showDirectoryPicker.mockResolvedValue({
      kind: 'directory',
      name: 'config',
      entries: async function* () {
        yield ['B.keymap', upper]
        yield ['ä.keymap', umlaut]
        yield ['a.keymap', lower]
        yield ['info.json', handleFor(entry('info.json', '{}'))]
      },
      getFileHandle: async () => {
        throw new DOMException('missing', 'NotFoundError')
      }
    } as FilesystemDirectoryHandleLike)
    const { port } = memoryPort()
    const select = vi.fn(onSelect)
    mountPicker({ onSelect: select, env, handles: port })

    button('Open folder').click()
    await vi.waitFor(() => expect(target.querySelector('[role="listbox"]')).toBeTruthy())
    const options = [...target.querySelectorAll('[role="option"]')].map(node => node.textContent?.trim())
    expect(options).toEqual(['B.keymap', 'a.keymap', 'ä.keymap'])
    expect(select).not.toHaveBeenCalled()

    const chosen = target.querySelector('[data-keymap="a.keymap"]')
    if (!(chosen instanceof HTMLButtonElement)) throw new Error('missing a.keymap option')
    chosen.click()
    await vi.waitFor(() => expect(editor.source).toBe('filesystem'))
    const baseline = (select.mock.calls[0][0] as FilesystemKeyboardSelection).filesystem.baseline
    expect(baseline.route).toEqual({ kind: 'directory', entryName: 'a.keymap' })
  })

  it('can leave an empty folder inventory and choose a different route', async () => {
    const env = makeEnv()
    env.showDirectoryPicker.mockResolvedValue({ kind: 'directory', name: 'empty', entries: async function* () {} })
    mountPicker({ onSelect, env, handles: memoryPort().port })
    button('Open folder').click()
    await vi.waitFor(() => expect(text()).toContain('No eligible .keymap'))
    button('Cancel folder').click()
    flushSync()
    expect(button('Open file').disabled).toBe(false)
    expect(editor.source).toBeNull()
  })

  it('refuses a candidate whose matching directory geometry is invalid', async () => {
    const keymap = entry('a.keymap')
    const geometryDisk = entry('a.json', '{ "nope": true }')
    const env = makeEnv()
    env.showDirectoryPicker.mockResolvedValue({
      kind: 'directory',
      name: 'config',
      entries: async function* () {
        yield ['a.keymap', handleFor(keymap)]
      },
      getFileHandle: async () => handleFor(geometryDisk)
    } as FilesystemDirectoryHandleLike)
    const { port } = memoryPort()
    const select = vi.fn(onSelect)
    mountPicker({ onSelect: select, env, handles: port })

    button('Open folder').click()
    await vi.waitFor(() => expect(target.querySelector('[role="option"]')).toBeTruthy())
    ;(target.querySelector('[data-keymap="a.keymap"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(text()).toContain('info must define "layouts"'))
    expect(select).not.toHaveBeenCalled()
    expect(editor.source).toBeNull()
  })

  it('saves one raw .keymap through a fresh picker selection and readback', async () => {

    const disk = entry('a.keymap')
    const accepted = handleFor(disk)
    const stream: FilesystemWritableStreamLike = {
      write: vi.fn(async (data: Uint8Array) => {
        disk.bytes = Array.from(data)
      }),
      close: vi.fn(async () => {}),
      abort: vi.fn(async () => {})
    }
    const picked = handleFor(disk, { writable: { stream } })
    const env = makeEnv()
    env.showOpenFilePicker.mockResolvedValueOnce([accepted]).mockResolvedValueOnce([picked])
    const { port } = memoryPort()
    mountPicker({ onSelect: vi.fn(onSelect), env, handles: port })

    button('Open file').click()
    await vi.waitFor(() => expect(text()).toContain('Staged firmware'))
    button('Open without layout').click()
    await vi.waitFor(() => expect(editor.source).toBe('filesystem'))

    const draft = structuredClone(editor.draftKeymap!)
    draft.layers[0][0] = parseKeyBinding('&kp B')
    editor.updateKeymap(draft)
    flushSync()

    button('Save .keymap').click()
    await vi.waitFor(() => expect(stream.close).toHaveBeenCalled())
    expect(env.showOpenFilePicker).toHaveBeenCalledTimes(2)
    expect(stream.write).toHaveBeenCalledTimes(1)
    expect(new TextDecoder().decode(new Uint8Array(disk.bytes))).toContain('&kp B')
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
  })

  it('refuses Reload when the exact directory geometry entry was replaced', async () => {
    const file = handleFor(entry('a.keymap'))
    const geometryText = '{"layouts":{"LAYOUT":{"layout":[{"x":0,"y":0}]}}}'
    let geometry = handleFor(entry('a.json', geometryText))
    const env = makeEnv()
    env.showOpenFilePicker.mockResolvedValue([file])
    env.showDirectoryPicker.mockResolvedValue({
      kind: 'directory', name: 'config',
      entries: async function* () { yield ['a.keymap', file] },
      getFileHandle: async (name: string) => name === 'a.keymap' ? file : geometry
    } as FilesystemDirectoryHandleLike)
    mountPicker({ onSelect, env, handles: memoryPort().port })
    button('Open folder').click()
    await vi.waitFor(() => expect(target.querySelector('[data-keymap]')).toBeTruthy())
    ;(target.querySelector('[data-keymap]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(button('Reload').disabled).toBe(false))
    const before = editor.filesystemRecovery
    geometry = handleFor(entry('a.json', geometryText))
    button('Reload').click()
    await vi.waitFor(() => expect(text()).toContain('Geometry directory entry changed'))
    expect(editor.filesystemRecovery).toBe(before)
  })

  it('waits for a fresh Grant access gesture when write permission is prompt', async () => {
    const disk = entry('a.keymap')
    const accepted = handleFor(disk)
    const stream: FilesystemWritableStreamLike = {
      write: vi.fn(async (data: Uint8Array) => {
        disk.bytes = Array.from(data)
      }),
      close: vi.fn(async () => {}),
      abort: vi.fn(async () => {})
    }
    const picked = handleFor(disk, { writable: { stream, permission: 'prompt' } })
    const env = makeEnv()
    env.showOpenFilePicker.mockResolvedValueOnce([accepted]).mockResolvedValueOnce([picked])
    const { port } = memoryPort()
    mountPicker({ onSelect: vi.fn(onSelect), env, handles: port })

    button('Open file').click()
    await vi.waitFor(() => expect(text()).toContain('Staged firmware'))
    button('Open without layout').click()
    await vi.waitFor(() => expect(editor.source).toBe('filesystem'))
    const draft = structuredClone(editor.draftKeymap!)
    draft.layers[0][0] = parseKeyBinding('&kp C')
    editor.updateKeymap(draft)
    flushSync()

    button('Save .keymap').click()
    await vi.waitFor(() => expect(buttonContaining('Grant write access')).toBeTruthy())
    const grant = button('Grant write access')
    expect(grant.classList.contains('fs-grant-access')).toBe(true)
    expect(stream.write).not.toHaveBeenCalled()

    grant.click()
    await vi.waitFor(() => expect(stream.close).toHaveBeenCalled())
    expect(picked.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
  })

  it('keeps Reconcile save reachable while an attempt is pending and retires original bytes', async () => {
    const disk = entry('a.keymap')
    const accepted = handleFor(disk)
    const picked = handleFor(disk)
    picked.createWritable = vi.fn(async () => { throw new Error('Reconciliation must not write') })
    const env = makeEnv()
    env.showOpenFilePicker.mockResolvedValueOnce([accepted]).mockResolvedValueOnce([picked])
    const { port } = memoryPort()
    mountPicker({ onSelect: vi.fn(onSelect), env, handles: port })

    button('Open file').click()
    await vi.waitFor(() => expect(text()).toContain('Staged firmware'))
    button('Open without layout').click()
    await vi.waitFor(() => expect(editor.source).toBe('filesystem'))
    const draft = structuredClone(editor.draftKeymap!)
    draft.layers[0][0] = parseKeyBinding('&kp D')
    editor.updateKeymap(draft)
    const attempt = editor.captureFilesystemSave()
    expect(await editor.retainFilesystemAttempt(attempt)).toBe(true)
    flushSync()

    expect(buttonContaining('Reconcile save')).toBeTruthy()
    button('Reconcile save').click()
    await vi.waitFor(() => expect(editor.filesystemRecovery?.attempt).toBeUndefined())
    expect(picked.createWritable).not.toHaveBeenCalled()
  })

  it('confirms before reading disk for discard-and-reload and uses an ordinary Reload separately', async () => {
    const disk = entry('a.keymap')
    const accepted = handleFor(disk)
    const picked = handleFor(disk)
    const env = makeEnv()
    env.showOpenFilePicker.mockResolvedValue([accepted])
    const { port } = memoryPort()
    const order: string[] = []
    const reload: FilesystemReloadPort = {
      capture: vi.fn(() => {
        order.push('capture')
        return editor.captureFilesystemReload()
      }),
      reload: vi.fn(async (_baseline, _context, _confirmed) => {
        order.push('reload')
        return true
      })
    }
    const confirmSpy = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmSpy)
    mountPicker({ onSelect: vi.fn(onSelect), env, handles: port, reload })

    button('Open file').click()
    await vi.waitFor(() => expect(text()).toContain('Staged firmware'))
    button('Open without layout').click()
    await vi.waitFor(() => expect(editor.source).toBe('filesystem'))

    env.showOpenFilePicker.mockResolvedValue([picked])
    button('Discard firmware draft and reload').click()
    await vi.waitFor(() => expect(confirmSpy).toHaveBeenCalled())
    expect(reload.reload).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    button('Discard firmware draft and reload').click()
    await vi.waitFor(() => expect(reload.reload).toHaveBeenCalledWith(expect.anything(), expect.anything(), true))
    expect(order[0]).toBe('capture')

    order.length = 0
    ;(reload.reload as ReturnType<typeof vi.fn>).mockClear()
    button('Reload').click()
    await vi.waitFor(() => expect(reload.reload).toHaveBeenCalled())
    expect(order[0]).toBe('capture')
    expect((reload.reload as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[2]).toBe(false)
  })

  it('explicitly confirms attempt retirement and disk baseline replacement before destructive reload', async () => {
    const disk = entry('a.keymap')
    const file = handleFor(disk)
    const env = makeEnv()
    env.showOpenFilePicker.mockResolvedValue([file])
    mountPicker({ onSelect, env, handles: memoryPort().port })
    button('Open file').click()
    await vi.waitFor(() => expect(text()).toContain('Staged firmware'))
    button('Open without layout').click()
    await vi.waitFor(() => expect(button('Save .keymap').disabled).toBe(true))
    editor.updateKeymap({ ...editor.draftKeymap!, layers: [[parseKeyBinding('&kp B')]] })
    const attempt = editor.captureFilesystemSave()
    expect(await editor.retainFilesystemAttempt(attempt)).toBe(true)
    expect(await editor.markFilesystemWritePossible(attempt)).toBeTruthy()
    editor.hasPendingFirmwareRecovery = true
    expect(await editor.discardDraft()).toBe(true)
    expect(editor.isDirty).toBe(false)
    flushSync()
    const identity = editor.currentDraftIdentity()!
    const stored = await loadStoredDraft(identity)
    const host = JSON.stringify(editor.hostLegend)
    const replacement = SOURCE.replace('/* raw */', '/* external */').replace('&kp A', '&kp C')
    disk.bytes = Array.from(new TextEncoder().encode(replacement))
    const read = vi.spyOn(file, 'getFile')
    file.createWritable = vi.fn(async () => { throw new Error('Reload must not write') })
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Reload must not use an API') }))
    env.showOpenFilePicker.mockClear()
    const confirm = vi.fn((_message: string) => false)
    vi.stubGlobal('confirm', confirm)

    button('Discard firmware draft and reload').click()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0][0]).toContain('retire the unresolved save attempt')
    expect(confirm.mock.calls[0][0]).toContain('replace the verified baseline with validated disk bytes')
    expect(env.showOpenFilePicker).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
    expect(await loadStoredDraft(identity)).toEqual(stored)
    expect(editor.filesystemRecovery).toEqual(stored!.filesystem)

    confirm.mockReturnValue(true)
    button('Discard firmware draft and reload').click()
    await vi.waitFor(() => expect(editor.filesystemRecovery!.baseline.source).toBe(replacement))
    expect(editor.filesystemRecovery!.attempt).toBeUndefined()
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
    expect(editor.draftKeymap!.layers[0][0]).toEqual(parseKeyBinding('&kp C'))
    const adopted = await loadStoredDraft(identity)
    expect(adopted!.filesystem!.baseline.bytes).toEqual(disk.bytes)
    expect(adopted!.filesystem!.attempt).toBeUndefined()
    expect(adopted!.draftKeymap).toEqual(editor.baselineKeymap)
    expect(editor.filesystemVerifiedSave).toBe(false)
    expect(JSON.stringify(editor.hostLegend)).toBe(host)
    expect(file.createWritable).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('honours the opt-in remember checkbox before acceptance and forgets the live handle', async () => {
    const env = makeEnv()
    env.showOpenFilePicker.mockResolvedValue([handleFor(entry('a.keymap'))])
    const { port } = memoryPort()
    mountPicker({ onSelect: vi.fn(onSelect), env, handles: port })

    const rememberBox = target.querySelector('input[type="checkbox"]')
    if (!(rememberBox instanceof HTMLInputElement)) throw new Error('missing remember checkbox')
    rememberBox.click()
    flushSync()

    button('Open file').click()
    await vi.waitFor(() => expect(text()).toContain('Staged firmware'))
    button('Open without layout').click()
    await vi.waitFor(() => expect(port.accept).toHaveBeenCalled())
    expect(port.accept).toHaveBeenCalledWith(expect.stringMatching(/^fs:1:/), expect.anything(), true)

    await vi.waitFor(() => expect(buttonContaining('Forget')).toBeTruthy())
    editor.updateKeymap(editor.draftKeymap!)
    flushSync()
    button('Forget').click()
    await vi.waitFor(() => {
      expect(port.forget).toHaveBeenCalled()
      expect(text()).toContain('Handle forgotten')
      expect([...target.querySelectorAll('button')].some(node => node.textContent?.trim() === 'Save .keymap')).toBe(false)
    })
  })

  it('lists every stored recovery row, opens it without a handle, and exposes manual transfer', async () => {
    const disk = entry('a.keymap')
    const env = makeEnv()
    env.showOpenFilePicker.mockResolvedValue([handleFor(disk)])
    const first = memoryPort()
    mountPicker({ onSelect: vi.fn(onSelect), env, handles: first.port })
    button('Open file').click()
    await vi.waitFor(() => expect(text()).toContain('Staged firmware'))
    button('Open without layout').click()
    await vi.waitFor(() => expect(editor.source).toBe('filesystem'))
    unmount(view!)
    view = undefined
    editor.resetForTests()

    const { port } = memoryPort()
    const select = vi.fn(onSelect)
    mountPicker({ onSelect: select, env, handles: port })
    await vi.waitFor(() => expect(buttonContaining('Open recovery')).toBeTruthy())
    button('Open recovery').click()
    await vi.waitFor(() => expect(editor.source).toBe('filesystem'))
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'filesystem', filesystem: expect.objectContaining({ baseline: expect.objectContaining({ source: SOURCE }) }) })
    )
    await vi.waitFor(() => {
      const area = target.querySelector('textarea')
      expect(area?.value).toContain('&kp A')
    })
    expect(button('Reconnect').disabled).toBe(false)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    button('Copy firmware to Clipboard').click()
    await vi.waitFor(() => expect(text()).toContain('Could not write to the clipboard'))
  })

  it.each([false, true])('withholds manual transfer before Restore of changed recovery (attempt: %s)', async pendingAttempt => {
    const env = makeEnv()
    env.showOpenFilePicker.mockResolvedValue([handleFor(entry('a.keymap'))])
    mountPicker({ onSelect, env, handles: memoryPort().port })
    button('Open file').click()
    await vi.waitFor(() => expect(text()).toContain('Staged firmware'))
    button('Open without layout').click()
    await vi.waitFor(() => expect(button('Save .keymap').disabled).toBe(true))
    const draft = structuredClone(editor.draftKeymap!)
    draft.layers[0][0] = parseKeyBinding('&kp B')
    editor.updateKeymap(draft)
    editor.renameLayer(0, 'Recovered display name')
    if (pendingAttempt) {
      const attempt = editor.captureFilesystemSave()
      expect(await editor.retainFilesystemAttempt(attempt)).toBe(true)
      expect(await editor.markFilesystemWritePossible(attempt)).toBeTruthy()
    } else {
      expect(await editor.flushFilesystemDraft()).toBe(true)
    }
    const identity = editor.currentDraftIdentity()!
    const stored = await loadStoredDraft(identity)
    await unmount(view!)
    view = undefined
    editor.resetForTests()

    const writeText = vi.fn(async (_text: string) => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    mountPicker({ onSelect, env, handles: memoryPort().port })
    await vi.waitFor(() => expect(button('Open recovery').disabled).toBe(false))
    button('Open recovery').click()
    await vi.waitFor(() => expect(button('Restore draft').disabled).toBe(false))
    expect(editor.draftKeymap!.layers[0][0]).toEqual(parseKeyBinding('&kp A'))
    expect(target.querySelector('textarea[aria-label="Firmware text"]')).toBeNull()
    expect(text()).not.toContain('Copy firmware to Clipboard')
    expect(text()).toContain('Restore draft before manual Clipboard transfer')
    expect(writeText).not.toHaveBeenCalled()
    expect(await loadStoredDraft(identity)).toEqual(stored)

    button('Restore draft').click()
    await vi.waitFor(() => expect(target.querySelector<HTMLTextAreaElement>('textarea')?.value).toContain('&kp B'))
    expect(editor.layerOperationSnapshot).toEqual(stored!.layerOperation!.snapshot)
    button('Copy firmware to Clipboard').click()
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0][0]).toContain('&kp B')
    expect(editor.filesystemRecovery!.baseline.source).toBe(SOURCE)
    expect(await loadStoredDraft(identity)).toEqual(stored)
    expect(editor.hasPendingFirmwareRecovery).toBe(pendingAttempt)
    expect(editor.filesystemVerifiedSave).toBe(false)
  })

  it('reconnects with a fresh same-entry proof and keeps the retained baseline when disk changed', async () => {
    const disk = entry('a.keymap')
    const retained = handleFor(disk)
    const env = makeEnv()
    env.showOpenFilePicker.mockResolvedValue([retained])
    const { port } = memoryPort()
    mountPicker({ onSelect: vi.fn(onSelect), env, handles: port })
    button('Open file').click()
    await vi.waitFor(() => expect(text()).toContain('Staged firmware'))
    button('Open without layout').click()
    await vi.waitFor(() => expect(editor.source).toBe('filesystem'))
    const documentId = editor.filesystemDocumentId!
    unmount(view!)
    view = undefined
    editor.resetForTests()
    expect(editor.source).toBeNull()

    disk.bytes = Array.from(new TextEncoder().encode(SOURCE.replace('&kp A', '&kp Z')))
    const select = vi.fn(onSelect)
    mountPicker({ onSelect: select, env, handles: port, reload: undefined })
    await vi.waitFor(() => expect(buttonContaining('Reconnect')).toBeTruthy())
    button('Reconnect').click()
    await vi.waitFor(() => expect(editor.source).toBe('filesystem'))
    expect(editor.filesystemDocumentId).toBe(documentId)
    const baseline = (select.mock.calls.at(-1)![0] as FilesystemKeyboardSelection).filesystem.baseline
    expect(baseline.source).toBe(SOURCE)
    await vi.waitFor(() => expect(text()).toContain('changed on disk'))
  })

  it.each([
    ['file', 'unreadable'], ['file', 'invalid firmware'], ['file', 'invalid geometry'], ['file', 'identity'],
    ['directory', 'unreadable'], ['directory', 'invalid firmware'], ['directory', 'invalid geometry'], ['directory', 'identity']
  ] as const)('keeps proved %s recovery reachable when Reconnect encounters %s', async (route, failure) => {
    const disk = entry('a.keymap')
    const retained = handleFor(disk)
    const geometryDisk = entry('a.json', '{"layouts":{"LAYOUT":{"layout":[{"x":0,"y":0}]}}}')
    const geometry = handleFor(geometryDisk)
    const env = makeEnv()
    env.showOpenFilePicker.mockResolvedValueOnce([retained]).mockResolvedValueOnce([geometry])
    env.showDirectoryPicker.mockResolvedValue({
      kind: 'directory', name: 'config',
      entries: async function* () { yield ['a.keymap', retained] },
      getFileHandle: async (name: string) => name === 'a.keymap' ? retained : geometry
    } as FilesystemDirectoryHandleLike)
    const { port, store } = memoryPort()
    mountPicker({ onSelect, env, handles: port })
    if (route === 'file') {
      button('Open file').click()
      await vi.waitFor(() => expect(text()).toContain('Staged firmware'))
      button('Choose layout JSON').click()
    } else {
      button('Open folder').click()
      await vi.waitFor(() => expect(target.querySelector('[data-keymap]')).toBeTruthy())
      ;(target.querySelector('[data-keymap]') as HTMLButtonElement).click()
    }
    await vi.waitFor(() => expect(button('Save .keymap').disabled).toBe(true))
    editor.updateKeymap({ ...editor.draftKeymap!, layers: [[parseKeyBinding('&kp B')]] })
    const attempt = editor.captureFilesystemSave()
    expect(await editor.retainFilesystemAttempt(attempt)).toBe(true)
    expect(await editor.markFilesystemWritePossible(attempt)).toBeTruthy()
    const identity = editor.currentDraftIdentity()!
    const stored = await loadStoredDraft(identity)
    const documentId = editor.filesystemDocumentId!
    await unmount(view!)
    view = undefined
    editor.resetForTests()

    mountPicker({ onSelect, env, handles: port })
    await vi.waitFor(() => expect(button('Open recovery').disabled).toBe(false))
    button('Open recovery').click()
    await vi.waitFor(() => expect(text()).toContain('Recovery opened without a file handle'))
    await vi.waitFor(() => expect(button('Reconnect').disabled).toBe(false))
    const draft = editor.draftKeymap
    const history = editor.undoStack
    const host = JSON.stringify(editor.hostLegend)
    const picked = handleFor(failure === 'identity' ? entry('a.keymap') : disk)
    picked.createWritable = vi.fn(async () => { throw new Error('Recovery must not write') })
    picked.requestPermission = vi.fn(async () => 'granted' as const)
    const proof = vi.spyOn(picked, 'isSameEntry')
    if (failure === 'unreadable') vi.spyOn(picked, 'getFile').mockRejectedValue(new Error('Disk unreadable'))
    if (failure === 'invalid firmware') disk.bytes = Array.from(new TextEncoder().encode('{ "layers": [] }'))
    if (failure === 'invalid geometry') geometryDisk.bytes = Array.from(new TextEncoder().encode('{}'))
    const accept = vi.mocked(port.accept)
    accept.mockClear()
    env.showOpenFilePicker.mockReset().mockResolvedValue([picked])
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Recovery must not use an API') }))

    button('Reconnect').click()
    const error = failure === 'unreadable' ? 'Disk unreadable' : failure === 'invalid firmware'
      ? 'ZMK .keymap text, not JSON' : failure === 'invalid geometry' ? 'info must define "layouts"' : 'not the accepted document'
    await vi.waitFor(() => expect(target.querySelector('.fs-notice-error')?.textContent?.toLowerCase()).toContain(error.toLowerCase()))
    expect(proof).toHaveBeenCalledWith(retained)
    if (failure === 'identity') {
      expect(text()).not.toContain('Reconcile save')
      expect(accept).not.toHaveBeenCalled()
    } else {
      expect(button('Reconcile save').disabled).toBe(false)
      expect(button('Save .keymap').disabled).toBe(true)
      expect(store.get(documentId)?.file).toBe(picked)
      expect(store.get(documentId)?.geometry).toBe(geometry)
      button('Reconcile save').click()
      await vi.waitFor(() => expect(text()).toContain('Reconciliation stopped; recovery retained'))
      expect(env.showOpenFilePicker).toHaveBeenCalledTimes(2)
      expect(button('Reconcile save').disabled).toBe(false)
    }
    expect(editor.draftKeymap).toBe(draft)
    expect(editor.undoStack).toBe(history)
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    expect(editor.filesystemRecovery).toEqual(stored!.filesystem)
    expect(await loadStoredDraft(identity)).toEqual(stored)
    expect(JSON.stringify(editor.hostLegend)).toBe(host)
    expect(picked.createWritable).not.toHaveBeenCalled()
    expect(picked.requestPermission).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('drops a stale selection result after the picker unmounts', async () => {
    const gate = deferred<FilesystemFileHandleLike[]>()
    const env = makeEnv()
    env.showOpenFilePicker.mockReturnValue(gate.promise)
    const { port } = memoryPort()
    const select = vi.fn(onSelect)
    mountPicker({ onSelect: select, env, handles: port })
    button('Open file').click()
    flushSync()
    unmount(view!)
    view = undefined
    gate.resolve([handleFor(entry('a.keymap'))])
    await Promise.resolve()
    await Promise.resolve()
    flushSync()
    expect(select).not.toHaveBeenCalled()
    expect(editor.source).toBeNull()
  })
})
