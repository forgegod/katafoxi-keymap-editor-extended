import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParsedKeymap } from '@keymap-editor/keymap-core'
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

  function open() {
    view = mount(Harness, { target }) as HarnessView
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
})
