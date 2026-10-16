import { flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { buildKeymapCode, encodeKeyBinding, ensureHoldTapPreset, parseDtsKeymap, parseKeymap } from '@keymap-editor/keymap-core'
import { editor } from '../editor.svelte.js'
import { deleteStoredDraft } from '../draft-storage'
import App from '../../App.svelte'

vi.mock('../config', () => ({ apiBaseUrl: '', enableGitHub: false, enableLocal: false }))
const comment = document.createComment('')
if (!(comment instanceof Comment)) Object.defineProperty(globalThis, 'Comment', { configurable: true, writable: true, value: Object.getPrototypeOf(comment).constructor })
const SOURCE = `// Preserved preamble
#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
#include <dt-bindings/zmk/modifiers.h>
/ { keymap { compatible = "zmk,keymap"; base { bindings = <&kp A>; sensor-bindings = <&inc_dec_kp C_VOL_UP C_VOL_DN>; }; }; };`
let target: HTMLDivElement
let view: ReturnType<typeof mount>
function button(name: string) {
  const found = [...document.querySelectorAll('button')].find(el => (el.getAttribute('aria-label') ?? el.textContent?.trim()) === name)
  expect(found, `button ${name}; alert: ${document.querySelector('[role="alert"]')?.textContent}`).toBeDefined()
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
async function load(source: string) {
  await editor.selectKeyboard({ source: 'clipboard', layout: [{ x: 0, y: 0, row: 0, col: 0 }], keymap: parseKeymap(parseDtsKeymap(source)), clipboardOriginalSource: source })
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
  await load(SOURCE)
})
afterEach(() => { unmount(view); target.remove(); editor.resetForTests(); vi.unstubAllGlobals() })

it('creates a staged tap-dance with global scope notice and paired undo', () => {
  click('Behaviors'); click('New behavior')
  input('Behavior label', 'tap_pair')
  expect(document.body.textContent).toContain('Global definition: changes affect every reference. Invocation arguments stay per key, combo or encoder.')
  expect(editor.draftKeymap?.behaviorDefinitions).toBeUndefined()
  click('Preview changes')
  expect(document.querySelector('[aria-label="Behavior source preview"]')?.textContent).toContain('tap_pair: tap_pair')
  click('Apply changes')
  expect(editor.draftKeymap?.behaviorDefinitions?.[0]).toMatchObject({ code: '&tap_pair', compatible: 'zmk,behavior-tap-dance', bindings: ['&kp A'] })
  const source = editor.clipboardOriginalSource
  expect(source).toContain('tap_pair:')
  editor.undo()
  expect(editor.draftKeymap?.behaviorDefinitions).toBeUndefined()
  expect(editor.clipboardOriginalSource).toBe(SOURCE)
  editor.redo()
  expect(editor.clipboardOriginalSource).toBe(source)
  expect(buildKeymapCode(editor.layout!, editor.draftKeymap!, { originalSource: source! }).code).toBe(source)
})

it.each([false, true])('creates Demo behaviors with existing Homerow/Autoshift presets (macros: %s)', async withMacros => {
  const keymap = parseKeymap(parseDtsKeymap(SOURCE))
  keymap.holdTaps = ensureHoldTapPreset(ensureHoldTapPreset(undefined, '&hm'), '&as')
  await editor.selectKeyboard({ source: 'demo', layout: editor.layout!, keymap })
  flushSync()
  if (withMacros) {
    click('Macros'); click('New macro'); input('Macro label', 'sequence')
    click('Preview changes'); click('Confirm changes'); click('Close')
  }
  click('Behaviors'); click('New behavior'); input('Behavior label', 'dance')
  input('Child 1 binding', withMacros ? '&sequence' : '&hm LSHFT A')
  click('Preview changes'); click('Apply changes')
  expect(editor.draftKeymap?.behaviorDefinitions?.map(item => item.code).sort()).toEqual(['&as', '&dance', '&hm'])
  expect(editor.draftKeymap?.holdTaps).toHaveLength(2)
  click('Edit &dance'); input('tapping-term-ms', '0'); click('Preview changes'); click('Apply changes')
  expect(editor.draftKeymap?.behaviorDefinitions?.find(item => item.code === '&dance')?.properties).toEqual({ 'tapping-term-ms': 0 })
})

it.each(['behavior', 'macro'] as const)('refuses a referenced Demo %s rename using the pre-recipe graph', async family => {
  await editor.selectKeyboard({ source: 'demo', layout: editor.layout!,
    keymap: { ...parseKeymap(parseDtsKeymap(SOURCE)), rgbLayerRecipe: true } })
  flushSync()
  click('Behaviors'); click('New behavior'); click('Preview changes'); click('Apply changes')
  if (family === 'macro') {
    click('Close'); click('Macros'); click('New macro'); click('Preview changes'); click('Confirm changes')
  }
  const label = family === 'behavior' ? 'new_behavior' : 'new_macro'
  const apply = family === 'behavior' ? 'Apply changes' : 'Confirm changes'
  click(`Use &${label}`); click('Preview binding'); click(apply)
  const before = editor.draftKeymap
  const history = editor.undoStack.length
  click(`Edit &${label}`); input(family === 'behavior' ? 'Behavior label' : 'Macro label', 'renamed'); click('Preview changes')
  expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/incoming references/i)
  expect(document.querySelector(`[aria-label="${family === 'behavior' ? 'Behavior' : 'Macro'} source preview"]`)).toBeNull()
  expect(editor.draftKeymap).toBe(before)
  expect(editor.undoStack).toHaveLength(history)
  click('Cancel')
  editor.undo(); flushSync()
  click(`Edit &${label}`); input(family === 'behavior' ? 'Behavior label' : 'Macro label', 'renamed'); click('Preview changes'); click(apply)
  expect(family === 'behavior' ? editor.draftKeymap?.behaviorDefinitions?.[0].code : editor.draftKeymap?.macros?.[0].code).toBe('&renamed')
})

it('previews and edits Demo behaviors with the editor-owned RGB layer recipe', async () => {
  await editor.selectKeyboard({ source: 'demo', layout: editor.layout!,
    keymap: { ...parseKeymap(parseDtsKeymap(SOURCE)), rgbLayerRecipe: true } })
  flushSync()
  click('Behaviors'); click('New behavior'); input('Behavior label', 'rgb_dance')
  click('Preview changes')
  const preview = document.querySelector('[aria-label="Behavior source preview"]')
  expect(preview, document.querySelector('[role="alert"]')?.textContent ?? '').not.toBeNull()
  expect(preview?.textContent).toContain('#include <dt-bindings/zmk/rgb.h>')
  expect(preview?.textContent).toContain('rgblayer:')
  click('Apply changes')
  expect(button('Edit &rgb_dance').disabled).toBe(false)
  click('Edit &rgb_dance'); input('Child 1 binding', '&kp B')
  click('Preview changes'); click('Apply changes')
  expect(editor.draftKeymap?.behaviorDefinitions?.[0].bindings).toEqual(['&kp B'])
  expect(editor.draftKeymap?.macros ?? []).toEqual([])
  click('Use &rgb_dance'); click('Preview binding'); click('Apply changes')
  expect(encodeKeyBinding(editor.draftKeymap!.layers[0][0])).toBe('&rgb_dance')
  click('Delete &rgb_dance')
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('incoming references')
  click('New behavior'); input('Behavior label', 'unused'); click('Preview changes'); click('Apply changes')
  click('Delete &unused'); click('Apply changes')
  expect(editor.draftKeymap?.behaviorDefinitions?.map(item => item.code)).toEqual(['&rgb_dance'])
  const built = buildKeymapCode(editor.layout!, editor.draftKeymap!, { allowSourceFreeMacros: true, allowSourceFreeBehaviors: true })
  const imported = parseKeymap(parseDtsKeymap(built.code))
  expect(imported.behaviorDefinitions?.[0].editable).toBe(false)
  imported.behaviorDefinitions![0].bindings = ['&kp C']
  expect(() => buildKeymapCode(editor.layout!, imported, { originalSource: built.code })).toThrow(/coverage|read-only/i)
})

it.each(['use', 'delete'] as const)('can %s a Demo macro alongside named behaviors and the editor-owned RGB recipe', async action => {
  await editor.selectKeyboard({ source: 'demo', layout: editor.layout!,
    keymap: { ...parseKeymap(parseDtsKeymap(SOURCE)), rgbLayerRecipe: true } })
  flushSync()
  click('Behaviors'); click('New behavior'); click('Preview changes'); click('Apply changes'); click('Close')
  click('Macros'); click('New macro'); input('Macro label', 'sequence')
  input('Step 1 binding', '&new_behavior')
  click('Preview changes'); click('Confirm changes')
  const before = editor.draftKeymap
  if (action === 'use') {
    click('Use &sequence'); click('Preview binding')
  } else click('Delete &sequence')
  const preview = document.querySelector('[aria-label="Macro source preview"]')
  expect(preview, document.querySelector('[role="alert"]')?.textContent ?? '').not.toBeNull()
  expect(preview?.textContent).toContain('#include <dt-bindings/zmk/rgb.h>')
  expect(preview?.textContent).toContain('rgblayer:')
  expect(editor.draftKeymap).toBe(before)
  click('Confirm changes')
  if (action === 'use') {
    expect(encodeKeyBinding(editor.draftKeymap!.layers[0][0])).toBe('&sequence')
    click('Delete &sequence')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('incoming references')
    expect(document.querySelector('[aria-label="Macro source preview"]')).toBeNull()
  } else expect(editor.draftKeymap?.macros).toEqual([])
  expect(editor.draftKeymap?.behaviorDefinitions?.[0].code).toBe('&new_behavior')
  expect(editor.clipboardOriginalSource).toBeNull()
})

it.each(['demo', 'demo-rgb', 'clipboard'] as const)('duplicates and moves layers after %s behavior creation, then edits and undoes', async source => {
  if (source !== 'clipboard') {
    await editor.selectKeyboard({ source: 'demo', layout: editor.layout!, keymap: { ...parseKeymap(parseDtsKeymap(SOURCE)), ...(source === 'demo-rgb' ? { rgbLayerRecipe: true } : {}) } })
    flushSync()
  }
  click('Behaviors'); click('New behavior'); click('Preview changes'); click('Apply changes'); click('Close')
  expect(editor.duplicateLayer(0)).toMatchObject({ ok: true, changed: true })
  expect(editor.duplicateLayer(1)).toMatchObject({ ok: true, changed: true })
  const before = editor.draftKeymap
  const beforeSource = editor.clipboardOriginalSource
  expect(editor.reorderLayers([0, 2, 1])).toMatchObject({ ok: true, changed: true })
  const afterSource = editor.clipboardOriginalSource
  editor.undo(); flushSync()
  expect(editor.draftKeymap).toEqual(before)
  expect(editor.clipboardOriginalSource).toBe(beforeSource)
  editor.redo(); flushSync()
  expect(editor.clipboardOriginalSource).toBe(afterSource)
  click('Behaviors'); click('Edit &new_behavior'); input('Child 1 binding', '&kp B')
  click('Preview changes'); click('Apply changes')
  expect(editor.draftKeymap?.behaviorDefinitions?.[0].bindings).toEqual(['&kp B'])
  if (source === 'demo-rgb') {
    const saved = buildKeymapCode(editor.layout!, editor.draftKeymap!, { allowSourceFreeBehaviors: true, allowSourceFreeMacros: true })
    expect(saved.code).toContain('rgblayer:')
    expect(saved.code).toContain('#include <dt-bindings/zmk/rgb.h>')
    expect(editor.clipboardOriginalSource).toBeNull()
  }
})

it('configures sticky-layer using the sticky-key schema without materializing absent options', () => {
  click('Behaviors'); click('New behavior')
  input('Behavior type', 'zmk,behavior-sticky-key')
  input('Behavior label', 'sticky_nav')
  input('Child 1 binding', '&mo')
  input('release-after-ms', '0')
  const flag = document.querySelector<HTMLInputElement>('[aria-label="quick-release"]')!
  expect(flag).not.toBeNull()
  flag.click(); flushSync()
  expect(document.body.textContent).toContain('Bare child references forward invocation arguments')
  click('Preview changes'); click('Apply changes')
  expect(editor.draftKeymap?.behaviorDefinitions?.[0]).toMatchObject({ arity: 1, bindings: ['&mo'], properties: { 'release-after-ms': 0, 'quick-release': true } })
  click('Edit &sticky_nav')
  expect(document.querySelector<HTMLSelectElement>('[aria-label="Behavior type"]')?.disabled).toBe(true)
  input('release-after-ms', '450')
  document.querySelector<HTMLInputElement>('[aria-label="quick-release"]')!.click(); flushSync()
  click('Preview changes'); click('Apply changes')
  expect(editor.draftKeymap?.behaviorDefinitions?.[0].properties).toEqual({ 'release-after-ms': 450 })
  expect(editor.clipboardOriginalSource).not.toContain('quick-release')
  expect(editor.clipboardOriginalSource).not.toContain('lazy')
})

it('stages ordered tap-dance children and preserves redo on cancel and no-op', () => {
  click('Behaviors'); click('New behavior')
  click('Add child'); input('Child 2 binding', '&kp B')
  click('Move child 2 up')
  click('Preview changes'); click('Apply changes')
  expect(editor.draftKeymap?.behaviorDefinitions?.[0].bindings).toEqual(['&kp B', '&kp A'])
  editor.renameLayer(0, 'temporary'); editor.undo(); flushSync()
  const source = editor.clipboardOriginalSource
  const history = editor.undoStack.length
  click('Edit &new_behavior'); click('Remove child 1'); click('Preview changes'); click('Cancel')
  expect(editor.clipboardOriginalSource).toBe(source)
  expect(editor.canRedo).toBe(true)
  click('Edit &new_behavior'); click('Preview changes'); click('Apply changes')
  expect(editor.canRedo).toBe(true)
  expect(editor.undoStack).toHaveLength(history)
})

it.each(['key', 'combo'])('assigns a validated per-invocation argument to an existing %s', destination => {
  editor.updateCombos([{ id: 'chord', keyPositions: [0], binding: { value: '&none', params: [] } }]); flushSync()
  click('Behaviors'); click('New behavior'); input('Behavior type', 'zmk,behavior-sticky-key')
  input('Behavior label', 'sticky'); input('release-after-ms', '100')
  click('Preview changes'); click('Apply changes')
  const source = editor.clipboardOriginalSource
  click('Use &sticky')
  input('Behavior destination', destination)
  expect(document.body.textContent).toContain('Argument 1 · code')
  input('Behavior argument 1', 'NOT_A_KEY'); click('Preview binding')
  expect(document.querySelector('[role="alert"]')).not.toBeNull()
  expect(editor.clipboardOriginalSource).toBe(source)
  input('Behavior argument 1', 'LS(A)'); click('Preview binding')
  expect(document.querySelector('[aria-label="Binding replacement"]')?.textContent).toContain('→ &sticky LS(A)')
  click('Cancel')
  expect(editor.clipboardOriginalSource).toBe(source)
  click('Use &sticky'); input('Behavior destination', destination); input('Behavior argument 1', 'LS(A)')
  click('Preview binding'); click('Apply changes')
  expect(encodeKeyBinding(destination === 'key' ? editor.draftKeymap!.layers[0][0] : editor.draftKeymap!.combos![0].binding)).toBe('&sticky LS(A)')
  click('Edit &sticky'); input('release-after-ms', '0'); click('Preview changes'); click('Apply changes')
  expect(encodeKeyBinding(destination === 'key' ? editor.draftKeymap!.layers[0][0] : editor.draftKeymap!.combos![0].binding)).toBe('&sticky LS(A)')
})

it('binds a zero-cell sensor adapter only to an existing encoder slot and round-trips its edit', () => {
  click('Behaviors'); click('New behavior'); input('Behavior type', 'zmk,behavior-sensor-rotate')
  input('Behavior label', 'dial'); input('Child 1 binding', '&kp C_VOL_UP'); input('Child 2 binding', '&kp C_VOL_DN')
  input('tap-ms', '0'); click('Preview changes'); click('Apply changes')
  click('Use &dial')
  expect(document.querySelector<HTMLSelectElement>('[aria-label="Behavior destination"]')?.value).toBe('sensor')
  expect(document.querySelector('[aria-label="Behavior argument 1"]')).toBeNull()
  input('Behavior target encoder', '0')
  click('Preview binding')
  expect(document.querySelector('[aria-label="Binding replacement"]')?.textContent).toContain('&inc_dec_kp C_VOL_UP C_VOL_DN → &dial')
  click('Apply changes')
  expect(encodeKeyBinding(editor.draftKeymap!.sensorBindings![0][0])).toBe('&dial')
  click('Edit &dial'); input('tap-ms', '10'); click('Preview changes'); click('Apply changes')
  const output = buildKeymapCode(editor.layout!, editor.draftKeymap!, { originalSource: editor.clipboardOriginalSource! })
  const reloaded = parseKeymap(parseDtsKeymap(output.code))
  expect(reloaded.behaviorDefinitions?.[0].properties).toEqual({ 'tap-ms': 10 })
  expect(encodeKeyBinding(reloaded.sensorBindings![0][0])).toBe('&dial')
  expect(buildKeymapCode(editor.layout!, reloaded, { originalSource: output.code }).code).toBe(output.code)
})

it('preflights deletion with incoming sites and stages an unreferenced deletion', () => {
  click('Behaviors'); click('New behavior'); click('Preview changes'); click('Apply changes')
  const created = editor.clipboardOriginalSource
  click('Use &new_behavior'); click('Preview binding'); click('Apply changes')
  const referenced = editor.clipboardOriginalSource
  click('Delete &new_behavior')
  expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/incoming references.*keymap\.base/s)
  expect(document.body.textContent).toContain('Remove the listed references first')
  expect(editor.clipboardOriginalSource).toBe(referenced)
  editor.undo(); flushSync()
  click('Delete &new_behavior')
  expect(editor.clipboardOriginalSource).toBe(created)
  click('Cancel'); expect(editor.canRedo).toBe(true)
  click('Delete &new_behavior'); click('Apply changes')
  expect(editor.draftKeymap?.behaviorDefinitions).toEqual([])
  expect(editor.clipboardOriginalSource).not.toContain('new_behavior:')
  editor.undo(); flushSync()
  expect(editor.clipboardOriginalSource).toBe(created)
})

it('lists unsupported definitions with actionable read-only diagnostics without changing bytes', async () => {
  const source = SOURCE.replace('/ {', '/ { behaviors { opaque: opaque { compatible = "zmk,behavior-tap-dance"; #binding-cells = <0>; vendor,extra = <1>; bindings = <&kp A>; }; };')
  await load(source)
  click('Behaviors')
  expect(button('Edit &opaque').disabled).toBe(true)
  expect(button('Use &opaque').disabled).toBe(true)
  expect(document.querySelector('[aria-label="Behavior diagnostics &opaque"]')?.textContent).toContain('vendor,extra')
  expect(document.body.textContent).toContain('Review unsupported source externally and reload')
  click('Delete &opaque')
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('not a uniquely owned editable')
  expect(editor.clipboardOriginalSource).toBe(source)
  expect(editor.undoStack).toHaveLength(0)
})

it.each(['github', 'local', 'clipboard'] as const)('makes %s without matching source visibly read-only', source => {
  editor.source = source; editor.clipboardOriginalSource = null; flushSync()
  const before = editor.draftKeymap
  click('Behaviors')
  expect(button('New behavior').disabled).toBe(true)
  expect(document.querySelector('[aria-label="Behavior authoring availability"]')?.textContent).toContain('Demo or matching Clipboard source')
  expect(document.body.textContent).toContain('Load the complete .keymap through Clipboard')
  expect(editor.draftKeymap).toBe(before)
})

it('recovers the paired Clipboard definition source and can edit then discard it', async () => {
  const identity = editor.currentDraftIdentity()!
  await deleteStoredDraft(identity)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  try {
    click('Behaviors'); click('New behavior'); input('Behavior label', 'recovered')
    click('Preview changes'); click('Apply changes'); click('Close')
    const source = editor.clipboardOriginalSource
    await editor.flushPendingPersist()
    editor.resetForTests()
    await load(SOURCE)
    expect(editor.draftKeymap?.behaviorDefinitions?.[0].code).toBe('&recovered')
    expect(editor.clipboardOriginalSource).toBe(source)
    click('Behaviors'); click('Edit &recovered'); input('Child 1 binding', '&kp B')
    click('Preview changes'); click('Apply changes'); click('Close')
    expect(editor.draftKeymap?.behaviorDefinitions?.[0].bindings).toEqual(['&kp B'])
    expect(await editor.discardDraft()).toBe(true)
    expect(editor.clipboardOriginalSource).toBe(SOURCE)
    expect(editor.draftKeymap?.behaviorDefinitions).toBeUndefined()
  } finally { await deleteStoredDraft(identity); vi.restoreAllMocks() }
})

it.each(['named', 'preset', 'preset-rgb', 'clipboard'] as const)('deletes an absorbed %s hold-tap without resurrecting its legacy mirror', async kind => {
  if (kind !== 'clipboard') {
    const keymap = parseKeymap(parseDtsKeymap(SOURCE))
    keymap.holdTaps = ensureHoldTapPreset(undefined, '&as')
    if (kind.startsWith('preset')) keymap.holdTaps = ensureHoldTapPreset(keymap.holdTaps, '&hm')
    if (kind === 'preset-rgb') keymap.rgbLayerRecipe = true
    await editor.selectKeyboard({ source: 'demo', layout: editor.layout!, keymap })
    flushSync()
  }
  click('Behaviors'); click('New behavior')
  if (!kind.startsWith('preset')) {
    input('Behavior type', 'zmk,behavior-hold-tap'); input('Behavior label', 'home_row')
    input('tapping-term-ms', '180')
  }
  click('Preview changes'); click('Apply changes')
  const code = kind.startsWith('preset') ? '&hm' : '&home_row'
  expect(editor.draftKeymap?.holdTaps?.some(item => item.code === code)).toBe(true)
  expect(editor.draftKeymap?.behaviorDefinitions?.some(item => item.code === code)).toBe(true)
  const before = editor.draftKeymap
  const source = editor.clipboardOriginalSource
  click(`Delete ${code}`)
  expect(document.querySelector('[aria-label="Behavior source preview"]')?.textContent).not.toContain(`${code.slice(1)}:`)
  expect(editor.draftKeymap).toBe(before)
  click('Cancel')
  expect(editor.draftKeymap).toBe(before)
  click(`Delete ${code}`); click('Apply changes')
  const deleted = editor.draftKeymap
  expect(deleted?.behaviorDefinitions?.some(item => item.code === code)).toBe(false)
  expect(deleted?.holdTaps?.some(item => item.code === code) ?? false).toBe(false)
  if (kind !== 'clipboard') expect(deleted?.holdTaps?.map(item => item.code)).toEqual(['&as'])
  const options = kind === 'clipboard' ? { originalSource: editor.clipboardOriginalSource! } : { allowSourceFreeBehaviors: true, allowSourceFreeMacros: true }
  const built = buildKeymapCode(editor.layout!, deleted!, options)
  expect(built.code).not.toContain(`${code.slice(1)}:`)
  expect(parseKeymap(JSON.parse(built.json)).holdTaps?.some(item => item.code === code) ?? false).toBe(false)
  editor.undo(); flushSync()
  expect(editor.draftKeymap).toEqual(before)
  expect(editor.clipboardOriginalSource).toBe(source)
  editor.redo(); flushSync()
  expect(editor.draftKeymap).toEqual(deleted)
  click('Close'); click('Macros'); click('New macro'); click('Preview changes'); click('Confirm changes')
  expect(editor.draftKeymap?.holdTaps?.some(item => item.code === code) ?? false).toBe(false)
})

it('keeps named hold-tap tuning paired with the legacy view', () => {
  click('Behaviors'); click('New behavior'); input('Behavior type', 'zmk,behavior-hold-tap')
  input('Behavior label', 'home_row'); input('tapping-term-ms', '0'); input('quick-tap-ms', '0')
  input('require-prior-idle-ms', '0'); input('flavor', 'tap-preferred')
  click('Preview changes'); click('Apply changes')
  expect(editor.draftKeymap?.behaviorDefinitions?.[0].properties).toEqual({ 'tapping-term-ms': 0, 'quick-tap-ms': 0, 'require-prior-idle-ms': 0, flavor: 'tap-preferred' })
  expect(editor.draftKeymap?.holdTaps?.find(item => item.code === '&home_row')?.tappingTermMs).toBe(0)
  click('Use &home_row'); input('Behavior argument 1', 'LSHFT'); input('Behavior argument 2', 'A')
  click('Preview binding'); click('Apply changes')
  click('Edit &home_row'); input('tapping-term-ms', '210'); input('quick-tap-ms', '')
  click('Preview changes'); click('Apply changes')
  expect(editor.draftKeymap?.holdTaps?.find(item => item.code === '&home_row')?.tappingTermMs).toBe(210)
  expect(buildKeymapCode(editor.layout!, editor.draftKeymap!, { originalSource: editor.clipboardOriginalSource! }).code).toBe(editor.clipboardOriginalSource)
})

it('explains incomplete source coverage before creating and preserves stock override bytes', async () => {
  const source = SOURCE + '\n&mt { tapping-term-ms = <180>; };'
  await load(source)
  click('Behaviors')
  expect(button('New behavior').disabled).toBe(true)
  expect(document.querySelector('[aria-label="Behavior authoring availability"]')?.textContent).toContain('Reference coverage is incomplete')
  expect(document.body.textContent).toContain('Review unsupported source externally and reload')
  expect(buildKeymapCode(editor.layout!, editor.draftKeymap!, { originalSource: source }).code).toBe(source)
})

it.each(['demo', 'clipboard'] as const)('keeps %s behavior and macro transactions paired through interleaved edits and history', async source => {
  if (source === 'demo') {
    await editor.selectKeyboard({ source: 'demo', layout: editor.layout!, keymap: parseKeymap(parseDtsKeymap(SOURCE)) })
    flushSync()
  }
  click('Behaviors'); click('New behavior'); input('Behavior type', 'zmk,behavior-hold-tap')
  input('Behavior label', 'home_row'); input('tapping-term-ms', '180')
  click('Preview changes'); click('Apply changes'); click('Close')
  click('Macros'); click('New macro'); input('Macro label', 'sequence')
  input('Step 1 binding', '&home_row LSHFT A')
  click('Preview changes'); click('Confirm changes'); click('Close')
  expect(editor.draftKeymap?.holdTaps?.find(item => item.code === '&home_row')?.tappingTermMs).toBe(180)
  const before = editor.clipboardOriginalSource
  click('Behaviors'); click('Edit &home_row'); input('tapping-term-ms', '210')
  click('Preview changes'); click('Apply changes'); click('Close')
  const after = editor.clipboardOriginalSource
  editor.undo(); flushSync()
  expect(editor.clipboardOriginalSource).toBe(before)
  expect(editor.draftKeymap?.holdTaps?.find(item => item.code === '&home_row')?.tappingTermMs).toBe(180)
  editor.redo(); flushSync()
  expect(editor.clipboardOriginalSource).toBe(after)
  click('Macros'); click('Edit &sequence'); input('Wait time (ms)', '0')
  click('Preview changes'); click('Confirm changes'); click('Close')
  expect(editor.draftKeymap?.behaviorDefinitions?.[0].properties).toEqual({ 'tapping-term-ms': 210 })
  expect(editor.draftKeymap?.holdTaps?.find(item => item.code === '&home_row')?.tappingTermMs).toBe(210)
  expect(editor.draftKeymap?.macros?.[0].steps).toEqual([{ kind: 'behavior', binding: '&home_row LSHFT A' }])
  const built = buildKeymapCode(editor.layout!, editor.draftKeymap!, source === 'demo'
    ? { allowSourceFreeMacros: true, allowSourceFreeBehaviors: true }
    : { originalSource: editor.clipboardOriginalSource! })
  const parsed = parseKeymap(parseDtsKeymap(built.code))
  expect(parsed.behaviorDefinitions).toEqual(editor.draftKeymap?.behaviorDefinitions)
  expect(parsed.holdTaps).toEqual(editor.draftKeymap?.holdTaps)
  expect(parsed.macros).toEqual(editor.draftKeymap?.macros)
  if (source === 'clipboard') expect(built.code).toBe(editor.clipboardOriginalSource)
  else expect(editor.clipboardOriginalSource).toBeNull()
})

it('creates a bounded mod-morph and refuses invalid properties and referenced rename without mutation', () => {
  click('Behaviors'); click('New behavior'); input('Behavior type', 'zmk,behavior-mod-morph')
  input('Behavior label', 'shift_pair'); input('Child 2 binding', '&kp B')
  for (const value of ['', '-1', '0x10', '4294967296']) {
    input('mods', value); click('Preview changes')
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/required|decimal integer/)
    expect(editor.clipboardOriginalSource).toBe(SOURCE)
    expect(document.querySelector('[aria-label="Behavior source preview"]')).toBeNull()
  }
  input('mods', '0'); input('keep-mods', '0'); click('Preview changes'); click('Apply changes')
  expect(editor.draftKeymap?.behaviorDefinitions?.[0].properties).toEqual({ mods: 0, 'keep-mods': 0 })
  click('Use &shift_pair'); click('Preview binding'); click('Apply changes')
  const source = editor.clipboardOriginalSource
  const history = editor.undoStack.length
  click('Edit &shift_pair'); input('Behavior label', 'renamed'); click('Preview changes')
  expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/references|referenced/i)
  expect(editor.clipboardOriginalSource).toBe(source)
  expect(editor.undoStack).toHaveLength(history)
})

it.each(['document', 'source', 'key', 'macro', 'publication'] as const)('rechecks the captured %s at Apply without overwriting newer work', changed => {
  click('Behaviors'); click('New behavior')
  expect(editor.layerOperationBlocker()).toMatch(/behavior definition/)
  click('Preview changes')
  let unregister = () => {}
  if (changed === 'document') editor.renameLayer(0, 'new name')
  else if (changed === 'source') editor.clipboardOriginalSource = SOURCE + '\n// changed'
  else if (changed === 'publication') editor.saving = true
  else unregister = editor.registerLayerOperationGuard(() => changed)
  flushSync()
  const before = editor.draftKeymap
  const source = editor.clipboardOriginalSource
  const history = editor.undoStack.length
  click('Apply changes')
  expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/changed|draft|publication/i)
  expect(editor.draftKeymap).toBe(before)
  expect(editor.clipboardOriginalSource).toBe(source)
  expect(editor.undoStack).toHaveLength(history)
  unregister(); editor.saving = false; click('Cancel')
  expect(editor.layerOperationBlocker()).toBeNull()
})
