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
  return encodeKeyBinding(onUpdate.mock.calls[0][0] as KeyBindingNode)
}

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

  it('does not open the editor in composed legend mode', () => {
    open({ legendMode: 'composed' })
    clickKey()
    expect(editorDialog()).toBeNull()
  })
})
