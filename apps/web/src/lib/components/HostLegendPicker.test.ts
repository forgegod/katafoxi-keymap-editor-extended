import type { KeyBindingNode, ParsedKeymap } from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { editor } from '../editor.svelte.js'
import HostLegendPicker from './HostLegendPicker.svelte'

const happyComment = document.createComment('')
const CommentCtor = Object.getPrototypeOf(happyComment).constructor
if (!(happyComment instanceof Comment)) {
  Object.defineProperty(globalThis, 'Comment', {
    configurable: true,
    writable: true,
    value: CommentCtor
  })
}

function kp(code: string): KeyBindingNode {
  return { value: '&kp', params: [{ value: code, params: [] }] }
}

function keymapOf(names: string[], layer0: KeyBindingNode[] = [kp('E')]): ParsedKeymap {
  return {
    layer_names: names,
    layers: names.map((_, layer) =>
      layer0.map((node, key) =>
        layer === 0 ? node : kp(key === 0 ? `F${layer}` : 'X')
      )
    )
  }
}

describe('HostLegendPicker', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  beforeEach(() => {
    editor.resetForTests()
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target?.remove()
    editor.resetForTests()
  })

  async function open(keymap: ParsedKeymap) {
    await editor.selectKeyboard({
      source: 'local',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap
    })
    view = mount(HostLegendPicker, { target })
    flushSync()
  }

  function panelRows(): HTMLTableRowElement[] {
    return [...target.querySelectorAll('.legend-panel tbody tr')].filter(
      (el): el is HTMLTableRowElement => el instanceof HTMLTableRowElement
    )
  }

  function expand() {
    const button = target.querySelector('.legend-panel .layer-disclosure')
    if (!(button instanceof HTMLButtonElement)) throw new Error('missing disclosure')
    button.click()
    flushSync()
    return button
  }

  it('builds one row per keymap layer when the list is short', async () => {
    await open(keymapOf(['default', 'raise']))
    expect(panelRows().map(row => row.querySelector('th')?.textContent?.trim())).toEqual([
      'default',
      'raise'
    ])
  })

  it('keeps extra layers behind the overlay until it is opened', async () => {
    await open(keymapOf(Array.from({ length: 9 }, (_, i) => `L${i}`)))
    expect(panelRows()).toHaveLength(4)

    const sizer = target.querySelector('.legend-sizer')
    const panel = target.querySelector('.legend-panel')
    if (!(sizer instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
      throw new Error('missing overlay parts')
    }
    expect(panel.style.position).toBe('absolute')
    expect(sizer.hasAttribute('inert')).toBe(true)
    expect(sizer.querySelectorAll('tbody tr')).toHaveLength(4)

    const button = expand()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(sizer.querySelectorAll('tbody tr')).toHaveLength(4)
    expect(panelRows()).toHaveLength(9)
    expect(panelRows().map(row => row.querySelector('th')?.textContent?.trim())).toEqual(
      Array.from({ length: 9 }, (_, i) => `L${i}`)
    )
  })

  it('takes the ZMK keycode from the layer0 &kp E key', async () => {
    await open(
      keymapOf(['base', 'num'], [kp('A'), kp('E')])
    )
    editor.hostLegend = { ...editor.hostLegend, shownLayers: [0, 1] }
    flushSync()
    const codes = panelRows().map(row => row.querySelector('.zmk')?.textContent?.trim())
    expect(codes[0]).toMatch(/E/)
    expect(codes[1]).toMatch(/X/)
  })

  it('collapses as soon as the pointer leaves unless the list is pinned', async () => {
    await open(keymapOf(Array.from({ length: 9 }, (_, i) => `L${i}`)))
    const strip = target.querySelector('.host-legend-strip')
    if (!(strip instanceof HTMLElement)) throw new Error('missing strip')

    strip.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(panelRows()).toHaveLength(9)

    strip.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    flushSync()
    expect(panelRows()).toHaveLength(4)

    const eye = target.querySelector('.legend-panel [aria-label="Показать L1"]')
    if (!(eye instanceof HTMLButtonElement)) throw new Error('missing eye')
    strip.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    eye.click()
    flushSync()
    expect(panelRows()).toHaveLength(9)
    strip.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    flushSync()
    expect(panelRows().map(row => row.querySelector('th')?.textContent?.trim())).toEqual([
      'L0',
      'L2',
      'L3'
    ])

    const button = expand()
    strip.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    flushSync()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(panelRows()).toHaveLength(9)
  })

  it('expands on focus so extra layers are reachable without a mouse', async () => {
    await open(keymapOf(Array.from({ length: 9 }, (_, i) => `L${i}`)))
    expect(panelRows()).toHaveLength(4)
    const button = target.querySelector('.legend-panel .layer-disclosure')
    if (!(button instanceof HTMLButtonElement)) throw new Error('missing disclosure')
    button.focus()
    flushSync()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(panelRows()).toHaveLength(9)
  })

  it('toggles layer0 to a raw ZMK row instead of hiding it', async () => {
    await open(keymapOf(['default', 'raise']))
    const shownBefore = editor.hostLegend.shownLayers
    const eye = target.querySelector('.legend-panel [aria-label="Показать host-легенду default"]')
    if (!(eye instanceof HTMLButtonElement)) throw new Error('missing layer0 eye')
    expect(eye.getAttribute('aria-pressed')).toBe('true')
    eye.click()
    flushSync()
    expect(editor.hostLegend.layer0Raw).toBe(true)
    expect(editor.hostLegend.shownLayers).toEqual(shownBefore)
    expect(eye.getAttribute('aria-pressed')).toBe('false')
    eye.click()
    flushSync()
    expect(editor.hostLegend.layer0Raw).toBe(false)
    expect(eye.getAttribute('aria-pressed')).toBe('true')
  })

  it('toggles visibility through toggleShownLayer and does not write layers', async () => {
    await open(keymapOf(['default', 'raise']))
    const layersBefore = editor.hostLegend.layers
    const eye = target.querySelector('.legend-panel [aria-label="Показать raise"]')
    if (!(eye instanceof HTMLButtonElement)) throw new Error('missing raise eye')
    eye.click()
    flushSync()
    expect(editor.hostLegend.shownLayers).toEqual([0, 2, 3])
    expect(editor.hostLegend.layers).toEqual(layersBefore)
  })

  it('adds a transparent Layer #2 from the table footer', async () => {
    await open(keymapOf(['default', 'raise']))
    expect(target.querySelector('.legend-panel .add-layer')).toBeNull()

    const strip = target.querySelector('.host-legend-strip')
    if (!(strip instanceof HTMLElement)) throw new Error('missing strip')
    strip.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()

    const add = target.querySelector('.legend-panel .add-layer')
    if (!(add instanceof HTMLButtonElement)) throw new Error('missing Add Layer')
    add.click()
    flushSync()
    expect(editor.draftKeymap?.layer_names).toEqual(['default', 'raise', 'Layer #2'])
    expect(editor.draftKeymap?.layers).toHaveLength(3)
    expect(editor.draftKeymap?.layers[2]).toEqual([{ value: '&trans', params: [] }])
  })

  it('renames a layer from the table name button', async () => {
    await open(keymapOf(['default', 'raise']))
    const name = target.querySelector('.legend-panel tr[data-layer="0"] .layer-name')
    if (!(name instanceof HTMLButtonElement)) throw new Error('missing name')
    name.click()
    flushSync()
    const input = target.querySelector('.legend-panel input.layer-name')
    if (!(input instanceof HTMLInputElement)) throw new Error('missing rename field')
    input.value = 'Lower'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    flushSync()
    expect(editor.draftKeymap?.layer_names).toEqual(['Lower', 'raise'])
  })
})
