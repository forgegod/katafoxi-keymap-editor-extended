import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParsedKeymap } from '@keymap-editor/keymap-core'
import { buildDraftIdentity, deleteStoredDraft } from '../../draft-storage'
import { editor } from '../../editor.svelte.js'
import EditorHarness from './EditorKeyboardHarness.svelte'
import Harness from './KeyboardHarness.svelte'

// happy-dom comment nodes are not `instanceof Comment`. Svelte skips empty
// comment anchors with that check; without it, Keyboard's wrapper style is
// applied to a text node and mount throws.
const happyComment = document.createComment('')
const CommentCtor = Object.getPrototypeOf(happyComment).constructor
if (!(happyComment instanceof Comment)) {
  Object.defineProperty(globalThis, 'Comment', {
    configurable: true,
    writable: true,
    value: CommentCtor
  })
}

type HarnessView = ReturnType<typeof mount> & {
  getKeymap: () => ParsedKeymap
  getUpdateCount: () => number
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function clickAddLayer(root: ParentNode) {
  const item = [...root.querySelectorAll('.layer-selector li')].find(
    li => li.querySelector('.name')?.textContent?.trim() === 'Add Layer'
  )
  if (!(item instanceof HTMLLIElement)) {
    throw new Error('missing Add Layer')
  }
  item.click()
  flushSync()
}

function layerItem(root: ParentNode, index: number) {
  const item = root.querySelector(`li[data-layer="${index}"]`)
  if (!(item instanceof HTMLLIElement)) {
    throw new Error(`missing layer ${index}`)
  }
  return item
}

function renameField(root: ParentNode) {
  return root.querySelector('input.name')
}

function startRename(root: ParentNode, index = 0) {
  const item = layerItem(root, index)
  if (!item.classList.contains('active')) {
    item.click()
    flushSync()
  }
  layerItem(root, index).click()
  flushSync()
  const input = renameField(root)
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('rename field did not appear')
  }
  return input
}

function clickNode(node: EventTarget) {
  node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  flushSync()
}

function pickChoice(root: ParentNode, label: string) {
  const button = [...root.querySelectorAll('.key-editor-choice')].find(
    el => (el.textContent ?? '').trim() === label
  )
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`missing key choice ${label}`)
  }
  return button
}

function clickChip(root: ParentNode, label: string) {
  const button = [...root.querySelectorAll('.key-editor-chip')].find(
    el => (el.textContent ?? '').trim() === label
  )
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`missing behaviour chip ${label}`)
  }
  button.click()
  flushSync()
}

function closeDialog() {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  )
  flushSync()
}

function keyLegends(root: ParentNode): string[] {
  return [...root.querySelectorAll('.key .code')].map(el => (el.textContent ?? '').trim())
}

describe('Keyboard layers', () => {
  let target: HTMLDivElement
  let modalRoot: HTMLDivElement
  let view: HarnessView | undefined

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
    target?.remove()
    vi.restoreAllMocks()
  })

  function open(initialKeymap?: ParsedKeymap) {
    view = mount(Harness, {
      target,
      props: initialKeymap ? { initialKeymap } : {}
    }) as HarnessView
    flushSync()
    return view
  }

  it('adds a transparent Layer #2 when Add Layer is clicked', () => {
    const harness = open()
    clickAddLayer(target)

    const keymap = harness.getKeymap()
    expect(keymap.layers).toHaveLength(3)
    expect(keymap.layer_names).toEqual(['Base', 'Raise', 'Layer #2'])
    expect(clone(keymap.layers[2])).toEqual([
      { value: '&trans', params: [] },
      { value: '&trans', params: [] }
    ])
  })

  it('edits only the selected layer and key through the key dialog', () => {
    const harness = open()
    const original = clone(harness.getKeymap())

    layerItem(target, 1).click()
    flushSync()

    const keys = target.querySelectorAll('.key')
    expect(keys.length).toBe(2)
    ;(keys[0] as HTMLElement).click()
    flushSync()

    const dialog = document.querySelector('[role="dialog"][aria-label="Edit key"]')
    expect(dialog).toBeInstanceOf(HTMLElement)
    if (!(dialog instanceof HTMLElement)) throw new Error('missing key dialog')

    pickChoice(dialog, 'Q').click()
    flushSync()

    const apply = dialog.querySelector('[aria-label="Apply"]')
    expect(apply).toBeInstanceOf(HTMLButtonElement)
    ;(apply as HTMLButtonElement).click()
    flushSync()

    expect(document.querySelector('[role="dialog"][aria-label="Edit key"]')).toBeNull()

    const next = clone(harness.getKeymap())
    expect(next.layers[0]).toEqual(original.layers[0])
    expect(next.layers[1][1]).toEqual(original.layers[1][1])
    expect(next.layers[1][0]).not.toEqual(original.layers[1][0])
    expect(next.layers[1][0]).toEqual({
      value: '&kp',
      params: [{ value: 'Q', params: [] }]
    })
  })

  it('renames the active layer when Enter is pressed', () => {
    const harness = open()
    const input = startRename(target, 0)

    input.value = 'Lower'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    flushSync()

    expect(renameField(target)).toBeNull()
    expect(harness.getKeymap().layer_names).toEqual(['Lower', 'Raise'])
    expect(harness.getUpdateCount()).toBe(1)
  })

  it('cancels rename on Escape without calling onUpdate', () => {
    const harness = open()
    const input = startRename(target, 0)

    input.value = 'Lower'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    flushSync()

    expect(renameField(target)).toBeNull()
    expect(harness.getKeymap().layer_names).toEqual(['Base', 'Raise'])
    expect(harness.getUpdateCount()).toBe(0)
  })

  it('cancels rename when clicking document.body', () => {
    const harness = open()
    const input = startRename(target, 0)

    input.value = 'Lower'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    document.body.click()
    flushSync()

    expect(renameField(target)).toBeNull()
    expect(harness.getKeymap().layer_names).toEqual(['Base', 'Raise'])
    expect(harness.getUpdateCount()).toBe(0)
  })

  it('keeps the layer when delete is cancelled', () => {
    const harness = open()

    const del = target.querySelector('.delete')
    expect(del).toBeInstanceOf(SVGElement)
    clickNode(del as SVGElement)

    const dialog = target.querySelector('[role=alertdialog][aria-label="Delete layer"]')
    expect(dialog).toBeInstanceOf(HTMLElement)
    expect(dialog?.textContent).toContain('Delete layer Base?')

    const cancel = target.querySelector('.cancel-delete')
    expect(cancel).toBeInstanceOf(HTMLButtonElement)
    clickNode(cancel as HTMLButtonElement)

    expect(target.querySelector('[role=alertdialog]')).toBeNull()
    expect(harness.getKeymap().layers).toHaveLength(2)
    expect(harness.getKeymap().layer_names).toEqual(['Base', 'Raise'])
    expect(harness.getUpdateCount()).toBe(0)
  })

  it('removes the last layer and keeps an active remaining layer', () => {
    const harness = open()

    layerItem(target, 1).click()
    flushSync()
    expect(layerItem(target, 1).classList.contains('active')).toBe(true)

    const del = layerItem(target, 1).querySelector('.delete')
    expect(del).toBeInstanceOf(SVGElement)
    clickNode(del as SVGElement)

    const confirm = target.querySelector('.confirm-delete')
    expect(confirm).toBeInstanceOf(HTMLButtonElement)
    clickNode(confirm as HTMLButtonElement)

    expect(target.querySelector('[role=alertdialog]')).toBeNull()
    expect(harness.getKeymap().layers).toHaveLength(1)
    expect(harness.getKeymap().layer_names).toEqual(['Base'])
    expect(target.querySelector('li[data-layer].active')).toBeInstanceOf(HTMLLIElement)
    expect(target.querySelectorAll('.key').length).toBe(2)
  })

  it('clears used marks for keycodes that lived only on the deleted layer', () => {
    open()
    ;(target.querySelector('.key') as HTMLElement).click()
    flushSync()

    const before = document.querySelector('[role="dialog"][aria-label="Edit key"]')
    expect(before).toBeInstanceOf(HTMLElement)
    expect(pickChoice(before as HTMLElement, 'F4').classList.contains('used')).toBe(true)
    expect(pickChoice(before as HTMLElement, 'F4').title).toMatch(/L0 · L1/)
    expect(pickChoice(before as HTMLElement, 'F12').classList.contains('used')).toBe(true)
    expect(pickChoice(before as HTMLElement, 'F12').title).toMatch(/L1/)

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    flushSync()

    layerItem(target, 1).click()
    flushSync()
    clickNode(layerItem(target, 1).querySelector('.delete') as SVGElement)
    clickNode(target.querySelector('.confirm-delete') as HTMLButtonElement)

    expect(document.querySelector('[role="dialog"][aria-label="Edit key"]')).toBeNull()
    ;(target.querySelector('.key') as HTMLElement).click()
    flushSync()

    const after = document.querySelector('[role="dialog"][aria-label="Edit key"]')
    expect(after).toBeInstanceOf(HTMLElement)
    expect(pickChoice(after as HTMLElement, 'F4').classList.contains('used')).toBe(true)
    expect(pickChoice(after as HTMLElement, 'F4').title).toMatch(/L0/)
    expect(pickChoice(after as HTMLElement, 'F4').title).not.toMatch(/L1/)
    expect(pickChoice(after as HTMLElement, 'F12').classList.contains('used')).toBe(false)
    expect(pickChoice(after as HTMLElement, 'F12').title).not.toMatch(/layer/)
  })

  it('marks a newly applied key and leaves the open value undimmed', () => {
    open()
    const keys = target.querySelectorAll('.key')
    ;(keys[0] as HTMLElement).click()
    flushSync()

    const editing = document.querySelector('[role="dialog"][aria-label="Edit key"]')
    expect(editing).toBeInstanceOf(HTMLElement)
    pickChoice(editing as HTMLElement, 'Q').click()
    flushSync()
    ;(editing?.querySelector('[aria-label="Apply"]') as HTMLButtonElement).click()
    flushSync()

    ;(target.querySelectorAll('.key')[1] as HTMLElement).click()
    flushSync()

    const dialog = document.querySelector('[role="dialog"][aria-label="Edit key"]')
    expect(dialog).toBeInstanceOf(HTMLElement)
    const assigned = pickChoice(dialog as HTMLElement, 'Q')
    const current = pickChoice(dialog as HTMLElement, 'F4')
    expect(assigned.classList.contains('used')).toBe(true)
    expect(assigned.title).toMatch(/on layer L0/)
    expect(current.classList.contains('active')).toBe(true)
    expect(current.classList.contains('used')).toBe(false)
    expect(pickChoice(dialog as HTMLElement, 'A').classList.contains('used')).toBe(false)

    closeDialog()
    ;(target.querySelectorAll('.key')[0] as HTMLElement).click()
    flushSync()

    const reopened = document.querySelector('[role="dialog"][aria-label="Edit key"]')
    expect(reopened).toBeInstanceOf(HTMLElement)
    const selected = pickChoice(reopened as HTMLElement, 'Q')
    expect(selected.classList.contains('active')).toBe(true)
    expect(selected.classList.contains('used')).toBe(false)
    expect(selected.title).toMatch(/on layer L0/)
  })

  it('marks the RET chip when the layer uses the ENTER alias', () => {
    open({
      layer_names: ['Base'],
      layers: [
        [
          { value: '&kp', params: [{ value: 'ENTER', params: [] }] },
          { value: '&kp', params: [{ value: 'A', params: [] }] }
        ]
      ]
    })

    ;(target.querySelectorAll('.key')[1] as HTMLElement).click()
    flushSync()

    const dialog = document.querySelector('[role="dialog"][aria-label="Edit key"]')
    expect(dialog).toBeInstanceOf(HTMLElement)
    const ret = [...(dialog as HTMLElement).querySelectorAll('.key-editor-choice')].find(
      el => el instanceof HTMLButtonElement && /^RET\b/.test(el.title)
    )
    expect(ret).toBeInstanceOf(HTMLButtonElement)
    if (!(ret instanceof HTMLButtonElement)) throw new Error('missing RET chip')
    expect(ret.classList.contains('used')).toBe(true)
    expect(ret.classList.contains('active')).toBe(false)
    expect(ret.title).toMatch(/on layer L0/)
  })

  it('marks a mouse command already placed when &mkp is open', () => {
    open({
      layer_names: ['Base'],
      layers: [
        [
          { value: '&mkp', params: [{ value: 'LCLK', params: [] }] },
          { value: '&kp', params: [{ value: 'A', params: [] }] }
        ]
      ]
    })

    ;(target.querySelectorAll('.key')[1] as HTMLElement).click()
    flushSync()
    const dialog = document.querySelector('[role="dialog"][aria-label="Edit key"]')
    expect(dialog).toBeInstanceOf(HTMLElement)
    clickChip(dialog as HTMLElement, '&mkp')

    const left = pickChoice(dialog as HTMLElement, 'LCLK')
    expect(left.classList.contains('used')).toBe(true)
    expect(left.classList.contains('active')).toBe(false)
    expect(pickChoice(dialog as HTMLElement, 'RCLK').classList.contains('used')).toBe(false)
  })

  it('shows the former next layer after the active first layer is deleted', () => {
    open()

    clickNode(layerItem(target, 0).querySelector('.delete') as SVGElement)
    clickNode(target.querySelector('.confirm-delete') as HTMLButtonElement)

    expect(target.querySelector('[role=alertdialog]')).toBeNull()
    expect(layerItem(target, 0).classList.contains('active')).toBe(true)
    expect(layerItem(target, 0).textContent).toContain('Raise')
    expect(keyLegends(target)).toEqual(['F4', 'F12'])

    ;(target.querySelector('.key') as HTMLElement).click()
    flushSync()

    const dialog = document.querySelector('[role="dialog"][aria-label="Edit key"]')
    expect(dialog).toBeInstanceOf(HTMLElement)
    const current = pickChoice(dialog as HTMLElement, 'F4')
    const moved = pickChoice(dialog as HTMLElement, 'F12')
    expect(current.classList.contains('active')).toBe(true)
    expect(current.classList.contains('used')).toBe(false)
    expect(current.title).toMatch(/on layer L0/)
    expect(current.title).not.toMatch(/L1/)
    expect(moved.classList.contains('used')).toBe(true)
    expect(moved.title).toMatch(/on layer L0/)
    expect(moved.title).not.toMatch(/L1/)
  })
})

describe('Keyboard draft undo', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  beforeEach(async () => {
    editor.resetForTests()
    editor.initCatalogs()
    const identity = buildDraftIdentity({ source: 'local', keyboard: 'undo-board' })
    if (identity) await deleteStoredDraft(identity)

    target = document.createElement('div')
    document.body.appendChild(target)
    const modalRoot = document.createElement('div')
    modalRoot.id = 'modal-root'
    target.appendChild(modalRoot)
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target?.remove()
    editor.resetForTests()
  })

  it('restores the key legend and a clean status after Undo', async () => {
    await editor.selectKeyboard({
      source: 'local',
      layout: [
        { x: 0, y: 0, row: 0, col: 0 },
        { x: 1, y: 0, row: 0, col: 1 }
      ],
      keymap: {
        keyboard: 'undo-board',
        layer_names: ['Base'],
        layers: [
          [
            { value: '&kp', params: [{ value: 'A', params: [] }] },
            { value: '&kp', params: [{ value: 'B', params: [] }] }
          ]
        ]
      }
    })

    view = mount(EditorHarness, { target })
    flushSync()

    expect(target.querySelector('.editor-status')?.textContent).toBe('Up to date with disk')
    expect(keyLegends(target)).toEqual(['A', 'B'])

    ;(target.querySelector('.key') as HTMLElement).click()
    flushSync()
    const dialog = document.querySelector('[role="dialog"][aria-label="Edit key"]')
    expect(dialog).toBeInstanceOf(HTMLElement)
    pickChoice(dialog as HTMLElement, 'Q').click()
    flushSync()
    ;(dialog?.querySelector('[aria-label="Apply"]') as HTMLButtonElement).click()
    flushSync()

    expect(keyLegends(target)).toEqual(['Q', 'B'])
    expect(target.querySelector('.editor-status')?.textContent).toMatch(/^Draft/)
    const undo = target.querySelector('.undo')
    expect(undo).toBeInstanceOf(HTMLButtonElement)
    expect((undo as HTMLButtonElement).disabled).toBe(false)
    ;(undo as HTMLButtonElement).click()
    flushSync()

    expect(keyLegends(target)).toEqual(['A', 'B'])
    expect(target.querySelector('.editor-status')?.textContent).toBe('Up to date with disk')
    expect((undo as HTMLButtonElement).disabled).toBe(true)
  })
})
