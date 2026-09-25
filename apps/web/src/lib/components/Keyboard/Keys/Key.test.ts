import {
  encodeKeyBinding,
  type KeyBindingNode
} from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  const key = document.querySelector('.key')
  if (!(key instanceof HTMLElement)) throw new Error('missing .key')
  key.click()
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

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    modalRoot = document.createElement('div')
    modalRoot.id = 'modal-root'
    // Keep the portal inside the Svelte mount so delegated clicks reach the dialog.
    target.appendChild(modalRoot)
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    modalRoot?.remove()
    target?.remove()
  })

  function open(
    props: {
      legendMode?: 'zmk' | 'composed'
      onUpdate?: ReturnType<typeof vi.fn>
      value?: string
      params?: Array<{ value?: string | number; params?: unknown[] }>
      layerBindings?: KeyBindingNode[]
    } = {}
  ) {
    const onUpdate = props.onUpdate ?? vi.fn()
    view = mount(Harness, {
      target,
      props: {
        ...typicalKey,
        value: props.value ?? typicalKey.value,
        params: props.params ?? typicalKey.params,
        legendMode: props.legendMode ?? 'zmk',
        layerBindings: props.layerBindings,
        onUpdate
      }
    })
    flushSync()
    return onUpdate
  }

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

    const chips = [...document.querySelectorAll('.key-editor-chip')].map(el =>
      (el.textContent ?? '').trim()
    )
    expect(chips).toContain('Modifier')
    expect(chips).toContain('Key')
    expect(chips.some(text => text.includes('A'))).toBe(false)
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
      legendMode: 'composed',
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
      legendMode: 'composed',
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
      [...(tip?.querySelectorAll('.row.flags .flag') ?? [])].map(el => el.textContent)
    ).toEqual(['🇦🇺', '🇷🇺'])
    expect(tip?.querySelector('.row.system')).toBeInstanceOf(HTMLElement)
    expect(
      [...(tip?.querySelectorAll('.row.current .lang') ?? [])].map(el => el.textContent)
    ).toEqual(['-_±ˬ', 'хХ±ˬ'])
  })

  it('opens the editor from a blank &trans composed row', () => {
    open({
      legendMode: 'composed',
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
      legendMode: 'composed',
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
})
