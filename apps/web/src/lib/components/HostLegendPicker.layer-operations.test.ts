import { parseDtsKeymap, parseKeyBinding, parseKeymap, type ParsedKeymap } from '@keymap-editor/keymap-core'
import { flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editor } from '../editor.svelte.js'
import HostLegendPicker from './HostLegendPicker.svelte'

const comment = document.createComment('')
if (!(comment instanceof Comment)) {
  Object.defineProperty(globalThis, 'Comment', {
    configurable: true, writable: true, value: Object.getPrototypeOf(comment).constructor
  })
}

const fixture = (): ParsedKeymap => ({
  layer_names: ['Base', 'Lower', 'Raise'],
  layers: ['&mo 2', '&to 1', '&kp E'].map(binding => [parseKeyBinding(binding)])
})

describe('layer row operations', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount>

  beforeEach(async () => {
    editor.resetForTests()
    await editor.selectKeyboard({ source: 'demo', layout: [{ x: 0, y: 0, row: 0, col: 0 }], keymap: fixture() })
    target = document.createElement('div')
    document.body.append(target)
    view = mount(HostLegendPicker, { target })
    flushSync()
    button('Show host legend Base').focus()
    flushSync()
  })
  afterEach(() => {
    unmount(view)
    target.remove()
    vi.restoreAllMocks()
    editor.resetForTests()
  })

  function button(label: string) {
    const found = target.querySelector(`button[aria-label="${label}"]`)
    expect(found, label).toBeInstanceOf(HTMLButtonElement)
    return found as HTMLButtonElement
  }
  async function click(label: string) {
    button(label).focus()
    button(label).click()
    flushSync()
    await tick()
  }

  function choosePosition(value: string) {
    const select = target.querySelector('select[aria-label="New layer position"]') as HTMLSelectElement
    select.value = value
    // happy-dom 15 does not implement option :checked; Svelte's binding reads it.
    // Browser tests exercise the native select without this DOM-only shim.
    const query = select.querySelector.bind(select)
    const spy = vi.spyOn(select, 'querySelector').mockImplementation(selector =>
      selector === ':checked' ? select.selectedOptions[0] : query(selector))
    select.dispatchEvent(new Event('change', { bubbles: true }))
    spy.mockRestore()
    flushSync()
  }

  it('moves to a chosen final index, remaps references and eyes, and follows the moved control with focus', async () => {
    editor.layerView = { shown: [0, 1, 7], layer0Raw: true }
    const host = JSON.stringify(editor.hostLegend)
    await click('Move layer Lower (1)')
    const select = target.querySelector('select[aria-label="New layer position"]') as HTMLSelectElement
    expect(document.activeElement).toBe(select)
    expect([...select.options].map(option => option.value)).toEqual(['1', '2'])
    choosePosition('2')
    await click('Apply layer move')
    expect(target.querySelector('[role="status"]')?.textContent).toMatch(/Moved Lower/)
    expect(editor.hostLegendLayerNames).toEqual(['Base', 'Raise', 'Lower'])
    expect(editor.draftKeymap!.layers[0][0]).toEqual(parseKeyBinding('&mo 1'))
    expect(editor.layerView).toEqual({ shown: [0, 2, 7], layer0Raw: true })
    expect(JSON.stringify(editor.hostLegend)).toBe(host)
    expect(editor.undoStack).toHaveLength(1)
    expect(document.activeElement).toBe(button('Move layer Lower (2)'))
    expect(target.querySelector('[role="status"]')?.textContent).toMatch(/priority/i)
  })

  function dragEvent(type: string, dataTransfer = new DataTransfer()) {
    // happy-dom's DragEvent omits dataTransfer from its constructor options.
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
    return event
  }

  it('uses the same move transaction and focus destination for drag/drop', async () => {
    const handle = button('Move layer Lower (1)')
    expect(handle.getAttribute('draggable')).toBe('true')
    const dataTransfer = new DataTransfer()
    handle.dispatchEvent(dragEvent('dragstart', dataTransfer))
    flushSync()
    expect(target.querySelector('[role="status"]')?.textContent).toMatch(/Moving Lower/)
    button('Move layer Raise (2)').dispatchEvent(dragEvent('drop', dataTransfer))
    flushSync()
    await tick()
    expect(editor.hostLegendLayerNames).toEqual(['Base', 'Raise', 'Lower'])
    expect(editor.draftKeymap!.layers[0][0]).toEqual(parseKeyBinding('&mo 1'))
    expect(editor.undoStack).toHaveLength(1)
    await vi.waitFor(() => expect(document.activeElement).toBe(button('Move layer Lower (2)')))
  })

  it.each(['cancel', 'escape', 'noop'])('%s leaves the document, source, redo, view and persistence untouched', async mode => {
    editor.duplicateLayer(0)
    editor.undo()
    const before = {
      document: editor.draftKeymap, source: editor.clipboardOriginalSource,
      snapshot: editor.layerOperationSnapshot, undo: editor.undoStack, redo: editor.redoStack,
      view: editor.layerView, dirty: editor.isDirty
    }
    const persist = vi.spyOn(editor, 'schedulePersist')
    await click('Move layer Lower (1)')
    if (mode === 'cancel') await click('Cancel layer move')
    if (mode === 'escape') {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      flushSync()
      await tick()
    }
    if (mode === 'noop') await click('Apply layer move')
    expect(editor.draftKeymap).toBe(before.document)
    expect(editor.clipboardOriginalSource).toBe(before.source)
    expect(editor.layerOperationSnapshot).toBe(before.snapshot)
    expect(editor.undoStack).toBe(before.undo)
    expect(editor.redoStack).toBe(before.redo)
    expect(editor.layerView).toBe(before.view)
    expect(editor.isDirty).toBe(before.dirty)
    expect(persist).not.toHaveBeenCalled()
    persist.mockRestore()
    await vi.waitFor(() => expect(document.activeElement).toBe(button('Move layer Lower (1)')))
    expect(editor.layerOperationBlocker()).toBeNull()
  })

  it.each(['same', 'zero', 'cancel', 'external'])('drag %s is not an edit and retains redo', async mode => {
    editor.duplicateLayer(0)
    editor.undo()
    const before = editor.draftKeymap
    const redo = editor.redoStack
    const persist = vi.spyOn(editor, 'schedulePersist')
    const handle = button('Move layer Lower (1)')
    if (mode !== 'external') handle.dispatchEvent(dragEvent('dragstart'))
    if (mode === 'cancel') handle.dispatchEvent(dragEvent('dragend'))
    else button(mode === 'zero' ? 'Move layer Base (0)' : 'Move layer Lower (1)').dispatchEvent(dragEvent('drop'))
    flushSync()
    await tick()
    expect(editor.draftKeymap).toBe(before)
    expect(editor.redoStack).toBe(redo)
    expect(persist).not.toHaveBeenCalled()
    if (mode !== 'external') await vi.waitFor(() => expect(document.activeElement).toBe(handle))
  })

  it('announces the fixed base restriction but permits duplication of zero', async () => {
    expect(button('Move layer Base (0)').getAttribute('aria-disabled')).toBe('true')
    expect(button('Move layer Base (0)').getAttribute('draggable')).toBe('false')
    await click('Move layer Base (0)')
    expect(target.querySelector('select[aria-label="New layer position"]')).toBeNull()
    expect(target.querySelector('[role="status"]')?.textContent).toContain('Layer 0 stays fixed')
    expect(editor.undoStack).toHaveLength(0)
    await click('Duplicate layer Base (0)')
    expect(editor.hostLegendLayerNames.at(-1)).toBe('Base copy')
  })

  it.each(['local', 'github'] as const)('keeps the %s provenance refusal visible without mutation', async source => {
    const selection = { layout: [{ x: 0, y: 0, row: 0, col: 0 }], keymap: fixture() }
    await editor.selectKeyboard(source === 'github'
      ? { ...selection, source, github: { repository: 'synthetic/repo', branch: 'test' } }
      : { ...selection, source })
    flushSync()
    const before = editor.draftKeymap
    await click('Duplicate layer Lower (1)')
    expect(target.querySelector('[role="status"]')?.textContent).toMatch(/source|provenance/i)
    await click('Move layer Lower (1)')
    choosePosition('2')
    await click('Apply layer move')
    expect(target.querySelector('[role="status"]')?.textContent).toMatch(/source|provenance/i)
    expect(editor.draftKeymap).toBe(before)
    expect(editor.undoStack).toHaveLength(0)
  })

  it('surfaces the core unsafe-source diagnostic for keyboard and drag moves', async () => {
    const source = '#include "external.dtsi"\n/ { keymap { compatible = "zmk,keymap"; base { bindings = <&kp A>; }; lower { bindings = <&kp B>; }; raise { bindings = <&kp C>; }; }; };'
    await editor.selectKeyboard({ source: 'clipboard', layout: [{ x: 0, y: 0, row: 0, col: 0 }], keymap: parseKeymap(parseDtsKeymap(source)), clipboardOriginalSource: source })
    flushSync()
    const before = editor.draftKeymap
    await click('Move layer lower (1)')
    choosePosition('2')
    await click('Apply layer move')
    const diagnostic = target.querySelector('[role="status"]')?.textContent
    expect(diagnostic).toMatch(/source: unverified include.*#include/)
    button('Move layer lower (1)').dispatchEvent(dragEvent('dragstart'))
    button('Move layer raise (2)').dispatchEvent(dragEvent('drop'))
    flushSync()
    expect(target.querySelector('[role="status"]')?.textContent).toBe(diagnostic)
    expect(editor.draftKeymap).toBe(before)
    expect(editor.clipboardOriginalSource).toBe(source)
    expect(editor.isDirty).toBe(false)
  })

  it.each(['keyboard', 'drag'])('keeps a stale %s move refusal visible through focusout and restores source focus', async mode => {
    const source = button('Move layer Lower (1)')
    const strip = target.querySelector('.host-legend-strip')!
    const status = target.querySelector('[role="status"]')!
    if (mode === 'keyboard') {
      await click('Move layer Lower (1)')
      choosePosition('2')
    } else {
      source.dispatchEvent(dragEvent('dragstart'))
      flushSync()
    }
    editor.renameLayer(1, 'New name')
    const updated = editor.draftKeymap
    const control = button(mode === 'keyboard' ? 'Apply layer move' : 'Move layer Raise (2)')
    control.focus()
    expect(document.activeElement).toBe(control)
    if (mode === 'keyboard') control.click()
    else control.dispatchEvent(dragEvent('drop'))
    flushSync()
    if (mode === 'keyboard') expect(control.isConnected).toBe(false)
    // happy-dom can retain focus on removed Apply without bubbling focusout.
    // Exercise that browser handoff before tick() restores the source control.
    control.blur()
    strip.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))
    flushSync()
    expect(target.querySelector('[role="status"]')).toBe(status)
    expect(strip.classList.contains('expanded')).toBe(true)
    await tick()
    flushSync()
    expect(editor.draftKeymap).toBe(updated)
    expect(button('Move layer New name (1)')).toBe(source)
    await vi.waitFor(() => expect(document.activeElement).toBe(source))
    flushSync()
    expect(target.querySelector('[role="status"]')).toBe(status)
    expect(status.textContent).toBe('The document changed. Choose the layer again before moving it.')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(strip.classList.contains('expanded')).toBe(true)
    expect(status.isConnected).toBe(true)
    expect(status.closest('.legend-panel.overlay')).not.toBeNull()
  })

  it('rechecks other mounted draft guards on Apply and does not discard them', async () => {
    await click('Move layer Lower (1)')
    choosePosition('2')
    const unregister = editor.registerLayerOperationGuard(() => 'test key')
    await click('Apply layer move')
    expect(target.querySelector('[role="status"]')?.textContent).toMatch(/Close the test key draft/)
    expect(editor.layerOperationBlocker()).toMatch(/test key/)
    expect(editor.undoStack).toHaveLength(0)
    unregister()
  })

  it('does not blur a keyboard-focused operation when the pointer leaves the overlay', async () => {
    button('Move layer Lower (1)').focus()
    target.querySelector('.host-legend-strip')!.dispatchEvent(new MouseEvent('mouseleave'))
    flushSync()
    expect(document.activeElement).toBe(button('Move layer Lower (1)'))
  })

  it('appends an independent copy in one transaction and keeps focus on its source control', async () => {
    const shown = [...editor.layerView.shown]
    await click('Duplicate layer Lower (1)')
    expect(editor.hostLegendLayerNames).toEqual(['Base', 'Lower', 'Raise', 'Lower copy'])
    expect(editor.draftKeymap!.layers[3]).toEqual(editor.draftKeymap!.layers[1])
    expect(editor.draftKeymap!.layers[3]).not.toBe(editor.draftKeymap!.layers[1])
    expect(editor.undoStack).toHaveLength(1)
    expect(editor.layerView.shown).toEqual(shown)
    expect(document.activeElement).toBe(button('Duplicate layer Lower (1)'))
    expect(target.querySelector('[role="status"]')?.textContent).toContain('Lower copy')
    editor.undo()
    expect(editor.hostLegendLayerNames).toEqual(['Base', 'Lower', 'Raise'])
    editor.redo()
    expect(editor.hostLegendLayerNames).toEqual(['Base', 'Lower', 'Raise', 'Lower copy'])
  })
})
