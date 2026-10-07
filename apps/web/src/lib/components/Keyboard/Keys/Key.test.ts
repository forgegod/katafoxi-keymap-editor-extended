import {
  encodeKeyBinding,
  addHostLanguage,
  toggleHostLanguage,
  type HostLegendView,
  type KeyBindingNode
} from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editor } from '../../../editor.svelte.js'
import { resetLegendDecodeActive } from '../../../legend-decode-active'
import HostSymbolCatalog from '../../HostSymbolCatalog.svelte'
import Harness from './KeyHarness.svelte'

const typicalKey = {
  position: { x: 0, y: 0 },
  size: { u: 1, h: 1 },
  value: '&kp',
  params: [{ value: 'A', params: [] }]
}

function editorDialog(): HTMLElement | null {
  return document.querySelector('[role=dialog][aria-label="Edit key"]')
}

function clickKey() {
  const slot = document.querySelector('.key .layer-slot')
  if (!(slot instanceof HTMLElement)) throw new Error('missing .layer-slot')
  slot.click()
  flushSync()
}

function clickChoice(root: ParentNode, label: string, selector = '.key-editor-choice') {
  const button = [...root.querySelectorAll(selector)].find(
    el => (el.textContent ?? '').trim() === label
  )
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`missing choice ${label}`)
  }
  button.click()
  flushSync()
}

function clickApply() {
  const apply = document.querySelector('[aria-label=Apply]')
  if (!(apply instanceof HTMLButtonElement)) throw new Error('missing Apply')
  apply.click()
  flushSync()
}

function encodedUpdate(onUpdate: ReturnType<typeof vi.fn>): string {
  expect(onUpdate).toHaveBeenCalledOnce()
  return encodeKeyBinding(onUpdate.mock.calls[0][2] as KeyBindingNode)
}

function stackRows(): HTMLButtonElement[] {
  return [...document.querySelectorAll('.layer-stack button.layer-slot')].filter(
    (el): el is HTMLButtonElement => el instanceof HTMLButtonElement
  )
}

const threeLayerBindings: KeyBindingNode[] = [
  { value: '&kp', params: [{ value: 'A', params: [] }] },
  { value: '&kp', params: [{ value: 'B', params: [] }] },
  { value: '&kp', params: [{ value: 'C', params: [] }] }
]

describe('Key click editor', () => {
  let target: HTMLDivElement
  let modalRoot: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined
  let catalogView: ReturnType<typeof mount> | undefined

  beforeEach(() => {
    editor.resetForTests()
    resetLegendDecodeActive()
    target = document.createElement('div')
    document.body.appendChild(target)
    modalRoot = document.createElement('div')
    modalRoot.id = 'modal-root'
    // Keep the portal inside the Svelte mount so delegated clicks reach the dialog.
    target.appendChild(modalRoot)
    catalogView = mount(HostSymbolCatalog, {
      target
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    if (view) unmount(view)
    view = undefined
    if (catalogView) unmount(catalogView)
    catalogView = undefined
    modalRoot?.remove()
    target?.remove()
    editor.resetForTests()
    resetLegendDecodeActive()
  })

  function open(
    props: {
      onUpdate?: ReturnType<typeof vi.fn>
      value?: string
      params?: Array<{ value?: string | number; params?: unknown[] }>
      layerBindings?: KeyBindingNode[]
      layerView?: { shown: number[]; layer0Raw: boolean }
      hostView?: HostLegendView
      comboPeekLayer?: number | null
    } = {}
  ) {
    const onUpdate = props.onUpdate ?? vi.fn()
    view = mount(Harness, {
      target,
      props: {
        ...typicalKey,
        value: props.value ?? typicalKey.value,
        params: props.params ?? typicalKey.params,
        layerBindings: props.layerBindings,
        layerView: props.layerView,
        hostView: props.hostView,
        comboPeekLayer: props.comboPeekLayer,
        onUpdate
      }
    })
    flushSync()
    return onUpdate
  }

  it('washes an unpublished layer row and names the previous binding', () => {
    open()
    const binding = (code: string): KeyBindingNode => ({
      value: '&kp',
      params: [{ value: code, params: [] }]
    })
    editor.baselineKeymap = { layer_names: ['default'], layers: [[binding('A')]] }
    editor.draftKeymap = { layer_names: ['default'], layers: [[binding('M')]] }
    flushSync()

    const slot = document.querySelector('.key .layer-slot')
    expect(slot).toBeInstanceOf(HTMLElement)
    expect(slot?.classList.contains('unpublished')).toBe(true)
    expect(slot?.getAttribute('title')).toBe('Was &kp A')
  })

  it('opens the editor on the Key slot with the code grid visible', () => {
    open()
    clickKey()

    const dialog = editorDialog()
    expect(dialog).toBeInstanceOf(HTMLElement)
    expect(dialog?.querySelector('.key-editor-grid')).toBeInstanceOf(HTMLElement)
    const keyChip = [...(dialog?.querySelectorAll('.key-editor-chip') ?? [])].find(el =>
      (el.textContent ?? '').trim().startsWith('Key')
    )
    if (keyChip) expect(keyChip.classList.contains('active')).toBe(true)
    expect(
      [...(dialog?.querySelectorAll('.key-editor-choice') ?? [])].some(
        el => (el.textContent ?? '').trim() === 'A'
      )
    ).toBe(true)
  })

  it('opens the editor when clicking ZMK legend .code inside the layer slot', () => {
    open({
      layerBindings: [
        { value: '&kp', params: [{ value: 'A', params: [] }] },
        { value: '&kp', params: [{ value: 'B', params: [] }] }
      ],
      layerView: { shown: [0, 1], layer0Raw: true }
    })
    const code = document.querySelector('.layer-slot .code')
    expect(code).toBeInstanceOf(HTMLElement)
    expect(code?.tagName).toBe('SPAN')
    code?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    flushSync()

    expect(editorDialog()).toBeInstanceOf(HTMLElement)
  })

  it('applies a picked key and closes the dialog', () => {
    const onUpdate = open()
    clickKey()
    clickChoice(document, 'B', '.key-editor-grid .key-editor-choice')
    clickApply()

    expect(encodedUpdate(onUpdate)).toBe('&kp B')
    expect(editorDialog()).toBeNull()
  })

  it('closes on Escape without applying', () => {
    const onUpdate = open()
    clickKey()
    expect(editorDialog()).toBeInstanceOf(HTMLElement)

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    flushSync()

    expect(onUpdate).not.toHaveBeenCalled()
    expect(editorDialog()).toBeNull()
    expect(document.querySelector('.legend-decode')).toBeNull()
  })

  it('closes on backdrop click without applying', () => {
    const onUpdate = open()
    clickKey()
    const backdrop = document.querySelector('.modal-wrapper')
    expect(backdrop).toBeInstanceOf(HTMLElement)
    backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    flushSync()

    expect(onUpdate).not.toHaveBeenCalled()
    expect(editorDialog()).toBeNull()
  })

  it('clears values when switching to &mt and blocks Enter until complete', () => {
    const onUpdate = open()
    clickKey()
    clickChoice(document, '&mt', '.key-editor-chip')

    const labels = [...document.querySelectorAll('.key-editor-section-label')].map(el =>
      (el.textContent ?? '').trim()
    )
    expect(labels).toEqual(expect.arrayContaining(['Modifier', 'Value']))
    const activeChoices = [...document.querySelectorAll('.key-editor-choice.active')].map(el =>
      (el.textContent ?? '').trim()
    )
    expect(activeChoices).not.toContain('A')
    expect(document.querySelector('.binding')?.textContent).toBe('&mt')

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    flushSync()

    expect(onUpdate).not.toHaveBeenCalled()
    expect(editorDialog()).toBeInstanceOf(HTMLElement)
  })

  it('updates the binding preview when a hold wrap is toggled', () => {
    open({ params: [{ value: 'H', params: [] }] })
    clickKey()
    expect(document.querySelector('.binding')?.textContent).toBe('&kp H')

    clickChoice(document, '⇧', '.key-editor-holds .key-editor-choice')

    expect(document.querySelector('.binding')?.textContent).toBe('&kp LS(H)')
    const shift = [...document.querySelectorAll('.key-editor-holds .key-editor-choice')].find(
      el => (el.textContent ?? '').trim() === '⇧'
    )
    expect(shift?.classList.contains('active')).toBe(true)
  })

  it('does not toggle a hold that repeats the modifier key', () => {
    open({ params: [{ value: 'LCTRL', params: [] }] })
    clickKey()
    expect(document.querySelector('.binding')?.textContent).toBe('&kp LCTRL')

    const ctrl = [...document.querySelectorAll('.key-editor-holds .key-editor-choice')].find(
      el => (el.textContent ?? '').trim() === '⌃'
    )
    expect(ctrl).toBeInstanceOf(HTMLButtonElement)
    if (!(ctrl instanceof HTMLButtonElement)) throw new Error('missing ctrl hold')
    expect(ctrl.disabled).toBe(true)
    expect(ctrl.classList.contains('blocked')).toBe(true)
    expect(ctrl.classList.contains('active')).toBe(false)

    ctrl.click()
    flushSync()

    expect(document.querySelector('.binding')?.textContent).toBe('&kp LCTRL')
    expect(ctrl.classList.contains('active')).toBe(false)
  })

  it('applies a hold plus key as LC(A)', () => {
    const onUpdate = open()
    clickKey()
    clickChoice(document, '⌃', '.key-editor-holds .key-editor-choice')
    clickChoice(document, 'A', '.key-editor-grid .key-editor-choice')
    clickApply()

    expect(encodedUpdate(onUpdate)).toBe('&kp LC(A)')
    expect(editorDialog()).toBeNull()
  })

  it('edits layer 2 from the third composed row and leaves layer 0 unchanged', () => {
    const onUpdate = open({
      layerBindings: threeLayerBindings
    })
    const rows = stackRows()
    expect(rows).toHaveLength(3)
    const layer2 = rows.find(row => row.dataset.layer === '2')
    expect(layer2).toBeInstanceOf(HTMLButtonElement)
    layer2?.focus()
    expect(document.activeElement).toBe(layer2)
    layer2?.click()
    flushSync()

    expect(editorDialog()).toBeInstanceOf(HTMLElement)
    expect(document.querySelector('.binding')?.textContent).toBe('&kp C')
    clickChoice(document, 'D', '.key-editor-grid .key-editor-choice')
    clickApply()

    expect(onUpdate).toHaveBeenCalledOnce()
    const [, layerIndex, binding] = onUpdate.mock.calls[0]
    expect(layerIndex).toBe(2)
    expect(encodeKeyBinding(binding as KeyBindingNode)).toBe('&kp D')
  })

  it('opens a host decode card on composed row hover', () => {
    open({
      layerBindings: [
        { value: '&kp', params: [{ value: 'MINUS', params: [] }] },
        { value: '&kp', params: [{ value: 'B', params: [] }] }
      ]
    })
    const row = stackRows()[0]
    expect(row.getAttribute('title')).toBeNull()
    expect(row.querySelector('.keycap')?.getAttribute('title')).toBeNull()
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()

    const tip = document.querySelector('[role="tooltip"].legend-decode')
    expect(tip).toBeInstanceOf(HTMLElement)
    expect(tip?.id).toBe('legend-decode-0-0')
    expect(row.getAttribute('aria-describedby')).toBe(tip?.id)
    expect(tip?.textContent).toContain('KC_MINUS')
    expect(tip?.textContent).toContain('VK_OEM_MINUS')
    expect(tip?.textContent).toContain('KEY_MINUS')
    expect(tip?.querySelector('.id[title="ZMK keycode"]')?.textContent).toMatch(/ZMK/)
    expect(tip?.querySelector('.id[title="Windows virtual-key"]')?.textContent).toMatch(/Win/)
    expect(tip?.querySelector('.id[title="Linux evdev"]')?.textContent).toMatch(/Lin/)
    expect(
      [...(tip?.querySelectorAll('.row.flags .flag img') ?? [])].map(el => el.getAttribute('src'))
    ).toEqual(['/flags/us.svg'])
    expect(tip?.querySelector('.row.system')).toBeNull()
    expect(
      [...(tip?.querySelectorAll('.row.current .lang') ?? [])].map(lang =>
        [...lang.querySelectorAll('.slot')].map(slot => slot.textContent).join('')
      )
    ).toEqual(['-_ˬˬ'])
  })

  it('closes the hover decode peek as soon as the pointer leaves the row', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(document.querySelector('.legend-decode')).toBeInstanceOf(HTMLElement)

    row.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    flushSync()
    expect(document.querySelector('.legend-decode')).toBeNull()
  })

  it('keeps the hover decode peek read-only (no edit or revert controls)', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    const tip = document.querySelector('[role="tooltip"].legend-decode')
    expect(tip).toBeInstanceOf(HTMLElement)
    expect(tip?.querySelector('button.slot')).toBeNull()
    expect(tip?.querySelector('[data-host-revert]')).toBeNull()
    expect(tip?.querySelector('[data-host-accept]')).toBeNull()
    expect(tip?.classList.contains('peek')).toBe(true)
    expect(tip?.classList.contains('session')).toBe(false)
  })

  it('omits the Alt+click host hint on keys outside the host registry', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'BSPC', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    const tip = document.querySelector('[role="tooltip"].legend-decode')
    expect(tip).toBeInstanceOf(HTMLElement)
    expect(tip?.textContent).toContain('&kp BSPC')
    expect(tip?.textContent).toMatch(/Click row — ZMK/)
    expect(tip?.textContent).not.toMatch(/Alt\+click/)
    expect(tip?.querySelector('.row.current')).toBeNull()
  })

  it('does not open a host-edit session on Alt+click for non-host keys', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'BSPC', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true })
    )
    flushSync()
    expect(editor.hostEditSession).toBeNull()
    expect(editor.hostSymbolCatalogOpen).toBe(false)
    expect(document.querySelector('[role="dialog"].legend-decode')).toBeNull()
    expect(document.querySelector('[data-host-accept]')).toBeNull()
    expect(editorDialog()).toBeNull()
  })

  it('Alt+clicks a layer row to pin the decode card and open the host catalog', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true })
    )
    flushSync()

    expect(editorDialog()).toBeNull()
    expect(document.querySelector('[role="dialog"].legend-decode')).toBeInstanceOf(HTMLElement)
    expect(document.querySelector('[data-host-accept]')).toBeInstanceOf(HTMLElement)
    expect(document.querySelector('[data-host-cancel]')).toBeInstanceOf(HTMLElement)
    expect(editor.hostEditSession).toEqual({ keyIndex: 0, layer: 0 })
    expect(editor.hostSymbolCatalogOpen).toBe(true)
    expect(
      document.querySelector('[role="dialog"][aria-label="Host symbol catalog"]')
    ).toBeInstanceOf(HTMLElement)
  })

  it('keeps a host-edit session card when the pointer crosses another key', () => {
    const first = document.createElement('div')
    const second = document.createElement('div')
    target.appendChild(first)
    target.appendChild(second)
    const viewA = mount(Harness, {
      target: first,
      props: {
        ...typicalKey,
        keyIndex: 0,
        layerBindings: [{ value: '&kp', params: [{ value: 'H', params: [] }] }]
      }
    })
    const viewB = mount(Harness, {
      target: second,
      props: {
        ...typicalKey,
        keyIndex: 1,
        layerBindings: [{ value: '&kp', params: [{ value: 'I', params: [] }] }]
      }
    })
    flushSync()

    const rowA = first.querySelector('.layer-slot') as HTMLButtonElement
    const rowB = second.querySelector('.layer-slot') as HTMLButtonElement
    rowA.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true })
    )
    flushSync()
    expect(document.querySelector('#legend-decode-0-0')).toBeInstanceOf(HTMLElement)
    expect(document.querySelector('[data-host-accept]')).toBeInstanceOf(HTMLElement)

    rowB.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(document.querySelector('#legend-decode-0-0')).toBeInstanceOf(HTMLElement)
    expect(document.querySelector('#legend-decode-1-0')).toBeNull()
    expect(editor.hostEditSession?.keyIndex).toBe(0)

    unmount(viewA)
    unmount(viewB)
  })

  it('ends the host-edit session from Accept without opening the key editor', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true })
    )
    flushSync()
    document.querySelector('[data-host-accept]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    )
    flushSync()
    expect(editor.hostEditSession).toBeNull()
    expect(editor.hostSymbolCatalogOpen).toBe(false)
    expect(document.querySelector('.legend-decode')).toBeNull()
    expect(editorDialog()).toBeNull()
  })

  it('switches the hover decode peek to another layer on the same key immediately', () => {
    open({
      layerBindings: [
        { value: '&kp', params: [{ value: 'A', params: [] }] },
        { value: '&kp', params: [{ value: 'B', params: [] }] }
      ],
      layerView: { shown: [0, 1], layer0Raw: false }
    })
    const rows = stackRows()
    expect(rows.length).toBeGreaterThanOrEqual(2)
    rows[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(document.querySelector('#legend-decode-0-1')).toBeInstanceOf(HTMLElement)

    rows[0].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(document.querySelector('#legend-decode-0-1')).toBeNull()
    expect(document.querySelector('#legend-decode-0-0')).toBeInstanceOf(HTMLElement)
  })

  it('does not start a host-edit session from a hover peek click', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    const tip = document.querySelector('.legend-decode')
    expect(tip).toBeInstanceOf(HTMLElement)
    expect(tip?.textContent).toMatch(/Alt\+click/)

    tip?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    flushSync()
    expect(editorDialog()).toBeNull()
    expect(editor.hostEditSession).toBeNull()
    expect(document.querySelector('[role="dialog"].legend-decode')).toBeNull()
    expect(document.querySelector('[role="tooltip"].legend-decode')).toBeInstanceOf(HTMLElement)
  })

  it('arms a host level only after Alt+click opens the session', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true })
    )
    flushSync()
    expect(document.querySelector('[role="dialog"].legend-decode')).toBeInstanceOf(HTMLElement)
    expect(editor.hostSymbolEditTarget).toEqual({
      language: 'en',
      zmk: 'MINUS',
      level: 2
    })

    const slot = document.querySelector(
      '.legend-decode .row.current button.slot[data-level="0"]'
    )
    expect(slot).toBeInstanceOf(HTMLButtonElement)
    ;(slot as HTMLButtonElement).click()
    flushSync()

    expect(editorDialog()).toBeNull()
    expect(editor.hostSymbolEditTarget).toEqual({
      language: 'en',
      zmk: 'MINUS',
      level: 0
    })
    expect(document.querySelector('.legend-decode .cell-input')).toBeNull()
    expect(
      document.querySelector('[role="dialog"][aria-label="Host symbol catalog"]')
    ).toBeInstanceOf(HTMLElement)
  })

  it('unpins the decode card on Escape and returns focus to the row', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true })
    )
    flushSync()
    expect(document.querySelector('[role="dialog"].legend-decode')).toBeInstanceOf(HTMLElement)

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    flushSync()

    expect(editor.hostEditSession).toBeNull()
    expect(document.querySelector('.legend-decode')).toBeNull()
    expect(editorDialog()).toBeNull()
  })

  it('hides the decode card when the key editor opens', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(document.querySelector('.legend-decode')).toBeInstanceOf(HTMLElement)

    row.click()
    flushSync()

    expect(editorDialog()).toBeInstanceOf(HTMLElement)
    expect(document.querySelector('.legend-decode')).toBeNull()
  })

  it('dismisses a host-edit session on outside click instead of leaving a tooltip', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true })
    )
    flushSync()
    expect(document.querySelector('[role="dialog"].legend-decode')).toBeInstanceOf(HTMLElement)

    window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
    flushSync()
    expect(document.querySelector('.legend-decode')).toBeNull()
    expect(editor.hostEditSession).toBeNull()
  })

  it('closes the previous key decode card when another key opens one', () => {
    const first = document.createElement('div')
    const second = document.createElement('div')
    target.appendChild(first)
    target.appendChild(second)
    const viewA = mount(Harness, {
      target: first,
      props: {
        ...typicalKey,
        keyIndex: 0,
        layerBindings: [{ value: '&kp', params: [{ value: 'H', params: [] }] }]
      }
    })
    const viewB = mount(Harness, {
      target: second,
      props: {
        ...typicalKey,
        keyIndex: 1,
        layerBindings: [{ value: '&kp', params: [{ value: 'I', params: [] }] }]
      }
    })
    flushSync()

    const rowA = first.querySelector('.layer-slot') as HTMLButtonElement
    const rowB = second.querySelector('.layer-slot') as HTMLButtonElement
    rowA.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(document.querySelector('#legend-decode-0-0')).toBeInstanceOf(HTMLElement)

    rowB.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(document.querySelector('#legend-decode-0-0')).toBeNull()
    expect(document.querySelector('#legend-decode-1-0')).toBeInstanceOf(HTMLElement)

    unmount(viewA)
    unmount(viewB)
  })

  it('restores row clicks after the hover decode peek closes', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(document.querySelector('.legend-decode')).toBeInstanceOf(HTMLElement)

    row.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    flushSync()
    expect(document.querySelector('.legend-decode')).toBeNull()

    row.click()
    flushSync()
    expect(editorDialog()).toBeInstanceOf(HTMLElement)
  })

  it('opens the decode peek from keyboard focus and closes it on blur', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.focus({ focusVisible: true } as FocusOptions)
    flushSync()
    expect(document.querySelector('[role="tooltip"].legend-decode')).toBeInstanceOf(HTMLElement)

    row.blur()
    flushSync()
    expect(document.querySelector('.legend-decode')).toBeNull()
  })

  it('opens the editor from a blank &trans composed row', () => {
    open({
      layerBindings: [
        { value: '&kp', params: [{ value: 'A', params: [] }] },
        { value: '&trans', params: [] }
      ]
    })
    const trans = stackRows().find(row => row.dataset.layer === '1')
    expect(trans).toBeInstanceOf(HTMLButtonElement)
    trans?.click()
    flushSync()

    expect(editorDialog()).toBeInstanceOf(HTMLElement)
    expect(document.querySelector('.binding')?.textContent).toBe('&trans')
  })

  it('keeps the first row draft when a second composed row is opened', () => {
    const onUpdate = open({
      layerBindings: threeLayerBindings
    })
    const rows = stackRows()
    rows[0].click()
    flushSync()
    expect(document.querySelector('.binding')?.textContent).toBe('&kp A')
    clickChoice(document, 'X', '.key-editor-grid .key-editor-choice')
    expect(document.querySelector('.binding')?.textContent).toBe('&kp X')

    rows[2].click()
    flushSync()
    expect(document.querySelector('.binding')?.textContent).toBe('&kp C')

    rows[0].click()
    flushSync()
    expect(document.querySelector('.binding')?.textContent).toBe('&kp X')
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('renders a compact ZMK legend for &bt on a stack row', () => {
    open({
      layerBindings: [{ value: '&bt', params: [{ value: 'BT_CLR', params: [] }] }]
    })
    expect(stackRows()[0].querySelector('.zmk-row')?.textContent?.trim()).toBe('&bt CLR')
  })

  it('highlights layer activators when hovering a stacked layer row', () => {
    open({
      layerBindings: [
        { value: '&mo', params: [{ value: '1', params: [] }] },
        { value: '&kp', params: [{ value: 'B', params: [] }] }
      ],
      layerView: { shown: [0, 1], layer0Raw: true }
    })
    const rows = stackRows()
    const layer0 = rows.find(row => row.dataset.layer === '0')
    const layer1 = rows.find(row => row.dataset.layer === '1')
    expect(layer0).toBeInstanceOf(HTMLButtonElement)
    expect(layer1).toBeInstanceOf(HTMLButtonElement)

    layer1?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(editor.legendHover).toEqual({ kind: 'layer', layer: 1 })
    expect(layer0?.querySelector('.zmk-row')?.classList.contains('legend-hit')).toBe(true)

    layer1?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    flushSync()
    expect(editor.legendHover).toBeNull()
    expect(layer0?.querySelector('.zmk-row')?.classList.contains('legend-hit')).toBe(false)
  })

  it('strikes the then-layer row on a key that holds the conditional layer', () => {
    editor.draftKeymap = {
      layer_names: ['base', 'lower', 'raise', 'adjust'],
      layers: [[{ value: '&none', params: [] }]],
      conditionalLayers: [{ id: 'when_lower_raise', ifLayers: [1, 2], thenLayer: 3 }]
    }
    open({
      layerBindings: [
        { value: '&mo', params: [{ value: '1', params: [] }] },
        { value: '&kp', params: [{ value: 'B', params: [] }] },
        { value: '&kp', params: [{ value: 'C', params: [] }] },
        { value: '&kp', params: [{ value: 'D', params: [] }] }
      ],
      layerView: { shown: [0, 1, 2, 3], layer0Raw: true }
    })
    const rows = stackRows()
    const held = rows.find(row => row.dataset.layer === '0')
    const shown = rows.find(row => row.dataset.layer === '3')
    const other = rows.find(row => row.dataset.layer === '1')
    expect(shown?.classList.contains('when-held')).toBe(true)
    expect(shown?.getAttribute('title')).toMatch(/Already held/)
    expect(shown?.getAttribute('aria-label')).toMatch(/already held/)
    expect(held?.classList.contains('when-held')).toBe(false)
    expect(other?.classList.contains('when-held')).toBe(false)
  })

  it('renders layer0 as a raw ZMK row when layer0Raw is set', () => {
    open({
      layerBindings: [
        { value: '&kp', params: [{ value: 'A', params: [] }] },
        { value: '&kp', params: [{ value: 'B', params: [] }] }
      ],
      layerView: { shown: [0, 1], layer0Raw: true }
    })
    const layer0 = stackRows().find(row => row.dataset.layer === '0')
    expect(layer0?.querySelector('.zmk-row.zmk-raw')).toBeInstanceOf(HTMLElement)
    expect(layer0?.querySelector('.keycap')).toBeNull()
  })

  it('underlines punctuation that sits on a different key in the other language', () => {
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'ru')
    open({ params: [{ value: 'COMMA', params: [] }] })
    const slot = document.querySelector('.layer-slot')
    expect(slot?.classList.contains('symbol-basic')).toBe(true)
    expect(slot?.getAttribute('title')).toMatch(/Different position|Linux split|On this key/)
  })

  it('compares two national keycap languages without English', () => {
    let view = addHostLanguage(addHostLanguage(editor.hostLegend, 'ru'), 'fr')
    view = toggleHostLanguage(view, 'en')
    view = toggleHostLanguage(view, 'ru')
    editor.hostLegend = view
    editor.symbolAlignOn = true
    open({ params: [{ value: 'DOT', params: [] }] })
    const slot = document.querySelector('.layer-slot')
    expect(slot?.classList.contains('symbol-basic')).toBe(true)
    expect(slot?.classList.contains('altgr-conflict')).toBe(false)
    expect(slot?.getAttribute('title') ?? '').not.toMatch(/Windows/)
  })

  it('stacks every host language on layer 0 and hides the other layers', () => {
    editor.hostLegend = addHostLanguage(addHostLanguage(editor.hostLegend, 'ru'), 'uk')
    open({
      hostView: editor.hostLegend,
      layerBindings: [
        { value: '&kp', params: [{ value: 'S', params: [] }] },
        { value: '&kp', params: [{ value: 'B', params: [] }] },
        { value: '&kp', params: [{ value: 'C', params: [] }] }
      ],
      layerView: { shown: [0, 1, 2], layer0Raw: false }
    })
    expect(stackRows().length).toBeGreaterThan(1)
    expect(document.querySelector('.lang-line')).toBeNull()

    editor.multilangView = true
    flushSync()
    const rows = stackRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.dataset.layer).toBe('0')
    const lines = [...rows[0].querySelectorAll('.lang-line')].map(line =>
      (line.textContent ?? '').replace(/\s+/g, '')
    )
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('sS')
    expect(lines[1]).toContain('ыЫ')
    expect(lines[2]).toContain('іІ')
    expect(rows[0].textContent).not.toMatch(/bB|cC/)
  })

  it('peeks the multilang face for any combo layer, not only L0', () => {
    editor.hostLegend = addHostLanguage(addHostLanguage(editor.hostLegend, 'ru'), 'uk')
    editor.multilangView = true
    open({
      hostView: editor.hostLegend,
      layerBindings: [
        { value: '&kp', params: [{ value: 'A', params: [] }] },
        { value: '&kp', params: [{ value: 'B', params: [] }] }
      ],
      layerView: { shown: [0, 1], layer0Raw: false },
      comboPeekLayer: 1
    })
    const face = document.querySelector('.layer-slot.multilang-face')
    expect(face?.classList.contains('combo-peek')).toBe(true)
  })

  it('keeps a non-character key on one row while languages are stacked', () => {
    editor.hostLegend = addHostLanguage(addHostLanguage(editor.hostLegend, 'ru'), 'uk')
    editor.multilangView = true
    open({
      hostView: editor.hostLegend,
      params: [{ value: 'ESC', params: [] }],
      layerBindings: [
        { value: '&kp', params: [{ value: 'ESC', params: [] }] },
        { value: '&kp', params: [{ value: 'B', params: [] }] }
      ],
      layerView: { shown: [0, 1], layer0Raw: false }
    })
    expect(stackRows()).toHaveLength(1)
    expect(document.querySelector('.lang-line')).toBeNull()
    expect(stackRows()[0]?.dataset.layer).toBe('0')
  })

  it('does not mark a letter that only changes alphabet', () => {
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'ru')
    open()
    const slot = document.querySelector('.layer-slot')
    expect(slot?.classList.contains('symbol-moved')).toBe(false)
    expect(slot?.classList.contains('symbol-basic')).toBe(false)
    expect(slot?.classList.contains('altgr-conflict')).toBe(false)
    expect(slot?.getAttribute('title')).toBeNull()
  })
})
