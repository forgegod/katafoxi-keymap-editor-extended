import { flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { buildKeymapCode, encodeKeyBinding, parseDtsKeymap, parseKeymap } from '@keymap-editor/keymap-core'
import { editor } from '../editor.svelte.js'
import { deleteStoredDraft } from '../draft-storage'
import App from '../../App.svelte'

vi.mock('../config', () => ({ apiBaseUrl: '', enableGitHub: false, enableLocal: false }))
const comment = document.createComment('')
if (!(comment instanceof Comment)) Object.defineProperty(globalThis, 'Comment', { configurable: true, writable: true, value: Object.getPrototypeOf(comment).constructor })
const SOURCE = `#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
#include <dt-bindings/zmk/modifiers.h>
/ { keymap { compatible = "zmk,keymap"; base { bindings = <&kp A>; }; }; };`
let target: HTMLDivElement
let view: ReturnType<typeof mount>
function button(name: string) {
  const found = [...document.querySelectorAll('button')].find(el => (el.getAttribute('aria-label') ?? el.textContent?.trim()) === name)
  expect(found, `button ${name}`).toBeDefined()
  return found!
}
function click(name: string) { button(name).click(); flushSync() }
function input(name: string, value: string) {
  const el = document.querySelector<HTMLInputElement>(`[aria-label="${name}"]`)!
  expect(el, name).not.toBeNull()
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  flushSync()
}
beforeEach(async () => {
  editor.resetForTests()
  localStorage.clear()
  localStorage.setItem('coachTourDone', '1')
  localStorage.setItem('selectedSource', 'clipboard')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  target = document.createElement('div')
  document.body.appendChild(target)
  view = mount(App, { target })
  flushSync()
  await tick()
  await editor.selectKeyboard({ source: 'clipboard', layout: [{ x: 0, y: 0, row: 0, col: 0 }], keymap: parseKeymap(parseDtsKeymap(SOURCE)), clipboardOriginalSource: SOURCE })
  flushSync()
})
afterEach(() => { unmount(view); target.remove(); editor.resetForTests(); vi.unstubAllGlobals() })

it('creates a staged macro through the SPA as one undoable edit', () => {
  click('Macros')
  click('New macro')
  input('Macro label', 'greeting')
  expect(editor.draftKeymap?.macros).toBeUndefined()
  click('Preview changes')
  expect(document.querySelector('[aria-label="Macro source preview"]')?.textContent).toContain('greeting:')
  click('Confirm changes')
  expect(editor.draftKeymap?.macros?.[0]).toMatchObject({ code: '&greeting', arity: 0, steps: [{ kind: 'behavior', binding: '&kp A' }] })
  editor.undo()
  expect(editor.draftKeymap?.macros).toBeUndefined()
  editor.redo()
  expect(editor.draftKeymap?.macros?.[0].code).toBe('&greeting')
})

it('authors parameter forwarding and zero timing with ordered controls, then edits without changing arity', () => {
  click('Macros')
  click('New macro')
  input('Macro label', 'forward')
  input('Parameter count', '1')
  input('Tap time (ms)', '0')
  input('Wait time (ms)', '0')
  input('Step 1 type', 'param_1to1')
  click('Add step')
  input('Step 2 binding', '&kp MACRO_PLACEHOLDER')
  click('Preview changes')
  click('Confirm changes')
  expect(editor.draftKeymap?.macros?.[0]).toMatchObject({ arity: 1, tapMs: 0, waitMs: 0, steps: [
    { kind: 'control', control: 'param_1to1', values: [] }, { kind: 'behavior', binding: '&kp MACRO_PLACEHOLDER' }
  ] })
  click('Edit &forward')
  expect(document.querySelector<HTMLSelectElement>('[aria-label="Parameter count"]')?.disabled).toBe(true)
  input('Display name', 'Forward key')
  click('Add step')
  input('Step 3 type', 'wait_time')
  input('Step 3 milliseconds', '0')
  click('Move step 3 up')
  click('Preview changes')
  click('Confirm changes')
  expect(editor.draftKeymap?.macros?.[0].displayName).toBe('Forward key')
  expect(editor.draftKeymap?.macros?.[0].steps[1]).toEqual({ kind: 'control', control: 'wait_time', values: ['0'] })
})

it('previews use on a key, blocks referenced delete, and carries source through history and export', () => {
  click('Macros'); click('New macro'); input('Macro label', 'greeting')
  click('Preview changes'); click('Confirm changes')
  const createdSource = editor.clipboardOriginalSource
  expect(createdSource).toContain('greeting:')
  click('Use &greeting')
  click('Preview binding')
  expect(document.querySelector('[aria-label="Binding replacement"]')?.textContent).toContain('&kp A → &greeting')
  expect(encodeKeyBinding(editor.draftKeymap!.layers[0][0])).toBe('&kp A')
  click('Confirm changes')
  expect(encodeKeyBinding(editor.draftKeymap!.layers[0][0])).toBe('&greeting')
  click('Delete &greeting')
  expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/incoming references.*keymap\.base/s)
  expect(editor.draftKeymap!.macros).toHaveLength(1)
  editor.undo(); flushSync()
  expect(editor.clipboardOriginalSource).toBe(createdSource)
  click('Delete &greeting')
  expect(document.querySelector('[aria-label="Macro source preview"]')).not.toBeNull()
  click('Cancel')
  expect(editor.canRedo).toBe(true)
  click('Delete &greeting'); click('Confirm changes')
  expect(editor.draftKeymap!.macros).toEqual([])
  editor.undo(); flushSync()
  const output = buildKeymapCode(editor.layout!, editor.draftKeymap!, { originalSource: editor.clipboardOriginalSource! })
  expect(parseKeymap(parseDtsKeymap(output.code)).macros?.[0].code).toBe('&greeting')
})

it('generates a new US ASCII sequence only after acknowledgement and an atomic valid preview', () => {
  const host = JSON.stringify(editor.hostLegend)
  click('Macros'); click('Text to sequence')
  input('Macro text', '[]{ }\\|A\n\t')
  expect(button('Use generated sequence').disabled).toBe(true)
  const ack = document.querySelector<HTMLInputElement>('[aria-label="Use US QWERTY / ASCII mapping"]')!
  ack.click(); flushSync()
  input('Macro text', 'é')
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('U+00E9')
  expect(button('Use generated sequence').disabled).toBe(true)
  input('Macro text', 'a'.repeat(25))
  expect(button('Use generated sequence').disabled).toBe(true)
  input('Macro text', '[]{ }\\|A\n\t')
  expect(document.querySelector('[aria-label="Generated sequence"]')?.textContent).toContain('&kp LS(LBKT)')
  expect(document.body.textContent).toContain('16 entries')
  click('Use generated sequence')
  input('Macro label', 'ascii_text')
  click('Preview changes'); click('Confirm changes')
  expect(editor.draftKeymap?.macros?.[0]).toMatchObject({ arity: 0, tapMs: 40, waitMs: 40 })
  expect(editor.draftKeymap?.macros?.[0].steps).toHaveLength(10)
  expect(JSON.stringify(editor.hostLegend)).toBe(host)
})

it('rejects pasted CRLF before the browser normalizes it', () => {
  click('Macros'); click('Text to sequence')
  const textarea = document.querySelector<HTMLTextAreaElement>('[aria-label="Macro text"]')!
  const paste = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'a\r\nb' } })
  textarea.dispatchEvent(paste); flushSync()
  expect(paste.defaultPrevented).toBe(true)
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('U+000D')
  expect(button('Use generated sequence').disabled).toBe(true)
})

it('uses inferred argument types for an existing combo and refuses an invalid invocation', () => {
  editor.updateCombos([{ id: 'chord', keyPositions: [0], binding: { value: '&none', params: [] } }])
  flushSync()
  click('Macros'); click('New macro'); input('Macro label', 'forward')
  input('Parameter count', '1'); input('Step 1 type', 'param_1to1')
  click('Add step'); input('Step 2 binding', '&kp MACRO_PLACEHOLDER')
  click('Preview changes'); click('Confirm changes')
  click('Use &forward')
  expect(document.body.textContent).toContain('Argument 1 · code')
  input('Macro destination', 'combo')
  input('Macro target combo', 'chord')
  input('Macro argument 1', 'NOT_A_KEY')
  click('Preview binding')
  expect(document.querySelector('[role="alert"]')).not.toBeNull()
  expect(encodeKeyBinding(editor.draftKeymap!.combos![0].binding)).toBe('&none')
  input('Macro argument 1', 'LS(A)')
  click('Preview binding'); click('Confirm changes')
  expect(encodeKeyBinding(editor.draftKeymap!.combos![0].binding)).toBe('&forward LS(A)')
  click('Delete &forward')
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('combos.chord')
})

it('guards staged macro drafts and rechecks other draft owners at confirmation', () => {
  click('Macros'); click('New macro')
  expect(editor.layerOperationBlocker()).toMatch(/macro/)
  click('Preview changes')
  const unregister = editor.registerLayerOperationGuard(() => 'key')
  click('Confirm changes')
  expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/key draft/)
  expect(editor.draftKeymap?.macros).toBeUndefined()
  unregister()
  click('Cancel')
  expect(editor.layerOperationBlocker()).toBeNull()
})

it('treats an unchanged edit as a no-op without consuming redo', () => {
  click('Macros'); click('New macro'); click('Preview changes'); click('Confirm changes')
  editor.renameLayer(0, 'temporary'); editor.undo(); flushSync()
  const history = editor.undoStack.length
  click('Edit &new_macro'); click('Preview changes'); click('Confirm changes')
  expect(editor.canRedo).toBe(true)
  expect(editor.undoStack).toHaveLength(history)
})

it('shows core queue warnings in the sequence editor and confirmation', () => {
  click('Macros'); click('New macro')
  for (let i = 1; i < 32; i++) click('Add step')
  expect(document.querySelector('[aria-label="Macro warnings"]')?.textContent).toContain('fills the pinned default queue size of 64')
  click('Preview changes')
  expect(document.querySelector('[aria-label="Macro warnings"]')?.textContent).toContain('not a runtime safety estimate')
  click('Cancel')
  expect(editor.draftKeymap?.macros).toBeUndefined()
})

it('authors a source-free Demo macro without creating Clipboard provenance', async () => {
  await editor.selectKeyboard({ source: 'demo', layout: editor.layout, keymap: parseKeymap({ layers: [['&kp A']] }) })
  flushSync()
  click('Macros'); click('New macro'); click('Preview changes'); click('Confirm changes')
  expect(editor.draftKeymap?.macros?.[0].code).toBe('&new_macro')
  expect(editor.clipboardOriginalSource).toBeNull()
  click('Use &new_macro'); click('Preview binding'); click('Confirm changes')
  expect(encodeKeyBinding(editor.draftKeymap!.layers[0][0])).toBe('&new_macro')
})

it.each(['github', 'local', 'clipboard'] as const)('refuses authoring without verified %s provenance', source => {
  // Preserve the loaded model while exercising the transaction's source gate.
  editor.source = source
  editor.clipboardOriginalSource = null
  const before = editor.draftKeymap
  click('Macros'); click('New macro')
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Macro authoring requires Demo or matching Clipboard source')
  expect(document.querySelector('[aria-label="Macro label"]')).toBeNull()
  expect(editor.draftKeymap).toBe(before)
  expect(editor.undoStack).toHaveLength(0)
})

it.each(['document', 'source'] as const)('refuses a preview after its captured %s changes', changed => {
  click('Macros'); click('New macro'); click('Preview changes')
  if (changed === 'document') editor.renameLayer(0, 'New name')
  else editor.clipboardOriginalSource = SOURCE + '\n// newer revision'
  flushSync()
  const before = editor.draftKeymap
  const source = editor.clipboardOriginalSource
  const history = editor.undoStack.length
  click('Confirm changes')
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Document or source changed')
  expect(editor.draftKeymap).toBe(before)
  expect(editor.clipboardOriginalSource).toBe(source)
  expect(editor.undoStack).toHaveLength(history)
})

it('restores the matching macro source with a recovered Clipboard draft', async () => {
  const layout = editor.layout!
  const identity = editor.currentDraftIdentity()!
  await deleteStoredDraft(identity)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  try {
    click('Macros'); click('New macro'); input('Macro label', 'recovered')
    click('Preview changes'); click('Confirm changes'); click('Close')
    const source = editor.clipboardOriginalSource
    await editor.flushPendingPersist()
    editor.resetForTests()
    await editor.selectKeyboard({ source: 'clipboard', layout, keymap: parseKeymap(parseDtsKeymap(SOURCE)), clipboardOriginalSource: SOURCE })
    flushSync()
    expect(editor.draftKeymap?.macros?.[0].code).toBe('&recovered')
    expect(editor.clipboardOriginalSource).toBe(source)
    click('Macros'); click('Edit &recovered')
    input('Step 1 binding', '&kp B')
    click('Preview changes'); click('Confirm changes')
    expect(editor.draftKeymap?.macros?.[0].steps).toEqual([{ kind: 'behavior', binding: '&kp B' }])
    click('Close')
    expect(await editor.discardDraft()).toBe(true)
    expect(editor.clipboardOriginalSource).toBe(SOURCE)
    expect(editor.draftKeymap?.macros).toBeUndefined()
  } finally {
    await deleteStoredDraft(identity)
    vi.restoreAllMocks()
  }
})

it('lists opaque definitions with their diagnostics and keeps source bytes unchanged', async () => {
  const source = SOURCE.replace('/ {', '/ { macros { opaque: opaque { compatible = "zmk,behavior-macro"; #binding-cells = <0>; unknown = <1>; bindings = <&kp A>; }; };')
  await editor.selectKeyboard({ source: 'clipboard', layout: editor.layout, keymap: parseKeymap(parseDtsKeymap(source)), clipboardOriginalSource: source })
  flushSync(); click('Macros')
  expect(button('Edit &opaque').disabled).toBe(true)
  expect(document.querySelector('[aria-label="Macro diagnostics &opaque"]')?.textContent).toMatch(/unknown/i)
  click('Delete &opaque')
  expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/not a uniquely owned editable/)
  expect(editor.clipboardOriginalSource).toBe(source)
  expect(editor.undoStack).toHaveLength(0)
})
