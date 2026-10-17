import { flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { addHostLanguage, parseDtsKeymap, parseKeyBinding, parseKeymap } from '@keymap-editor/keymap-core'
import { editor } from './lib/editor.svelte'
import { loadStoredDraft } from './lib/draft-storage'
import { clearHostLayoutStore } from './lib/host-layout-store'
import { saveFilesystemKeymap } from './lib/filesystem-save'
import type { FilesystemFileHandleLike } from './lib/filesystem-access'
import App from './App.svelte'

vi.mock('./lib/config', () => ({ apiBaseUrl: '', enableGitHub: false, enableLocal: false }))

// Match the real Comment constructor used by happy-dom's Svelte anchors.
const comment = document.createComment('')
if (!(comment instanceof Comment)) Object.defineProperty(globalThis, 'Comment', {
  configurable: true, writable: true, value: Object.getPrototypeOf(comment).constructor
})

const source = '#include <behaviors.dtsi>\n/ { keymap { compatible = "zmk,keymap"; base { bindings = <&kp A>; }; }; };\n'
let target: HTMLDivElement
let app: ReturnType<typeof mount> | undefined
beforeEach(() => {
  editor.resetForTests()
  localStorage.clear()
  // An unavailable stored source starts idle, never loads Demo over our fixture.
  localStorage.setItem('selectedSource', 'github')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  target = document.createElement('div')
  document.body.appendChild(target)
})
afterEach(async () => {
  if (app) await unmount(app)
  app = undefined
  target.remove()
  await editor._draftWrites
  editor.resetForTests()
  await clearHostLayoutStore()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const button = (text: string) => [...target.querySelectorAll('button')].find(node => node.textContent?.trim() === text)!
const leave = () => {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

it('keeps filesystem chrome firmware-only through open, host edits, Save and unresolved Discard', async () => {
  app = mount(App, { target })
  await vi.waitFor(() => expect(target.querySelector('.app-chrome')).not.toBeNull())
  const keymap = parseKeymap(parseDtsKeymap(source))
  const baseline = { keymap, source, bytes: Array.from(new TextEncoder().encode(source)), layout: [{ x: 0, y: 0, row: 0, col: 0 }], route: { kind: 'file' as const } }
  const documentId = `fs:1:${crypto.randomUUID()}`
  await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId, baseline } })
  await tick()
  flushSync()
  const status = () => target.querySelector<HTMLElement>('.publish-status')!
  const disclosure = () => target.querySelector('[aria-label="Filesystem firmware status"]')!
  expect(status().textContent).toContain('Firmware loaded')
  expect(status().title).toContain('host files not written')
  expect(disclosure().textContent).toContain('host files not written')
  expect(disclosure().textContent).toContain('browser-local')
  expect(button('Discard firmware draft').disabled).toBe(true)
  await editor.commitHostMap(addHostLanguage(editor.hostLegend, 'de'))
  flushSync()
  expect(status().textContent).toContain('Firmware loaded')
  expect(leave()).toBe(false)
  const host = JSON.stringify(editor.hostLegend)
  let disk = baseline.bytes
  let staged: number[] = []
  const file: FilesystemFileHandleLike = {
    kind: 'file', name: 'a.keymap', isSameEntry: async other => other === file,
    getFile: async () => ({ name: 'a.keymap', size: disk.length, lastModified: 0, arrayBuffer: async () => new Uint8Array(disk).buffer }),
    queryPermission: async () => 'granted',
    createWritable: vi.fn(async () => ({ write: async (bytes: Uint8Array) => { staged = Array.from(bytes) }, close: async () => { disk = staged } }))
  }
  const env = { isSecureContext: true, showOpenFilePicker: vi.fn(async () => [file]) }
  editor.updateKeymap({ ...keymap, layers: [[parseKeyBinding('&kp B')]] })
  expect(await saveFilesystemKeymap(editor, env, { documentId, file })).toBe(true)
  flushSync()
  expect(status().textContent).toContain('Firmware saved')
  expect(disclosure().textContent).toContain('Firmware saved; host files not written')
  expect(JSON.stringify(editor.hostLegend)).toBe(host)
  editor.updateKeymap({ ...editor.draftKeymap!, layers: [[parseKeyBinding('&kp C')]] })
  const attempt = editor.captureFilesystemSave()
  expect(await editor.retainFilesystemAttempt(attempt)).toBe(true)
  expect(await editor.markFilesystemWritePossible(attempt)).toBeTruthy()
  editor.hasPendingFirmwareRecovery = true
  flushSync()
  expect(button('Discard firmware draft').title).toMatch(/does not resolve.*attempt/i)
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  button('Discard firmware draft').click()
  await vi.waitFor(() => expect(editor.isDirty).toBe(false))
  flushSync()
  expect(confirm.mock.calls[0][0]).toMatch(/does not.*(resolve|retire).*attempt/i)
  expect(status().textContent).toContain('Firmware recovery')
  expect(status().title).toContain('Reconcile save')
  expect(status().title).toContain('Restore only restores the draft')
  expect(disclosure().textContent).toContain('host files not written')
  expect(leave()).toBe(true)
  expect((await loadStoredDraft(editor.currentDraftIdentity()!))?.filesystem?.attempt?.id).toBe(attempt.id)
  expect(JSON.stringify(editor.hostLegend)).toBe(host)
  expect(file.createWritable).toHaveBeenCalledTimes(1)
  expect(fetch).not.toHaveBeenCalled()
})
