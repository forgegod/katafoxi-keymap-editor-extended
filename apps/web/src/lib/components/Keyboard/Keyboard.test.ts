import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParsedKeymap } from '@keymap-editor/keymap-core'
import { SYSTEM_US_LAYOUT_ID } from '@keymap-editor/keymap-core'
import { buildDraftIdentity, deleteStoredDraft } from '../../draft-storage'
import { editor } from '../../editor.svelte.js'
import { clearHostLayoutStore } from '../../host-layout-store'
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

function hoverLegend(root: ParentNode) {
  const strip = root.querySelector('.host-legend-strip')
  if (!(strip instanceof HTMLElement)) {
    throw new Error('missing host legend')
  }
  strip.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
  flushSync()
}

function clickAddLayer(root: ParentNode) {
  hoverLegend(root)
  const button = root.querySelector('.legend-panel .add-layer')
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('missing Add Layer')
  }
  button.click()
  flushSync()
}

function layerItem(root: ParentNode, index: number) {
  const item = root.querySelector(`.legend-panel tr[data-layer="${index}"]`)
  if (!(item instanceof HTMLTableRowElement)) {
    throw new Error(`missing layer ${index}`)
  }
  return item
}

function renameField(root: ParentNode) {
  return root.querySelector('.legend-panel input.layer-name')
}

function startRename(root: ParentNode, index = 0) {
  const name = layerItem(root, index).querySelector('.layer-name')
  if (!(name instanceof HTMLButtonElement)) {
    throw new Error(`missing layer name ${index}`)
  }
  name.click()
  flushSync()
  const input = renameField(root)
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('rename field did not appear')
  }
  return input
}

function layerSlot(root: ParentNode, keyIndex: number, layer = 0) {
  const key = root.querySelectorAll('.key')[keyIndex]
  const slot = key?.querySelector(`.layer-slot[data-layer="${layer}"]`)
  if (!(slot instanceof HTMLButtonElement)) {
    throw new Error(`missing layer-slot ${layer} on key ${keyIndex}`)
  }
  return slot
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

function keySlotTitles(root: ParentNode): string[] {
  return [...root.querySelectorAll('.key .layer-slot[data-layer="0"]')].map(el =>
    (el.getAttribute('aria-label') ?? '').replace(/, layer \d.*$/, '').trim()
  )
}

function keycapFace(root: ParentNode, keyIndex: number): string {
  const key = root.querySelectorAll('.key')[keyIndex]
  return (key?.querySelector('.keycap')?.textContent ?? '').replace(/\s+/g, '')
}

const twinAKeymap: ParsedKeymap = {
  layer_names: ['Base'],
  layers: [
    [
      { value: '&kp', params: [{ value: 'A', params: [] }] },
      { value: '&kp', params: [{ value: 'A', params: [] }] }
    ]
  ]
}

describe('Keyboard host legend redraw', () => {
  let target: HTMLDivElement
  let modalRoot: HTMLDivElement
  let view: HarnessView | undefined

  beforeEach(async () => {
    editor.resetForTests()
    await clearHostLayoutStore()
    target = document.createElement('div')
    document.body.appendChild(target)
    modalRoot = document.createElement('div')
    modalRoot.id = 'modal-root'
    target.appendChild(modalRoot)
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target?.remove()
    editor.resetForTests()
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

  it('repaints the same keycap after an in-place host level edit', async () => {
    open(twinAKeymap)
    await editor.selectLanguageProfile('en', SYSTEM_US_LAYOUT_ID)
    flushSync()
    const layoutId = await editor.ensureEditableUserHostLayout('en')
    flushSync()
    const before = keycapFace(target, 0)
    expect(before).toContain('aA')
    const viewId = editor.activeProfileId('en')
    expect(viewId).toBe(layoutId)
    const revisionBefore = editor.hostLayoutRevision
    const columnsBefore = editor.hostLegend.columns.map(column => ({ ...column }))

    const edited = await editor.setHostKeyLevel('en', 'A', 0, 'α')
    flushSync()

    expect(edited).toMatchObject({ ok: true, layoutId })
    expect(editor.activeProfileId('en')).toBe(layoutId)
    expect(editor.hostLegend.columns).toEqual(columnsBefore)
    expect(editor.hostLayoutRevision).toBe(revisionBefore + 1)
    const after = keycapFace(target, 0)
    expect(after).not.toBe(before)
    expect(after).toContain('αA')
    expect(after).not.toContain('aA')
  })

  it('shows the same in-place edit on every key that uses that host key', async () => {
    open(twinAKeymap)
    await editor.selectLanguageProfile('en', SYSTEM_US_LAYOUT_ID)
    flushSync()
    await editor.ensureEditableUserHostLayout('en')
    flushSync()
    expect(keycapFace(target, 0)).toBe(keycapFace(target, 1))
    expect(keycapFace(target, 0)).toContain('aA')

    await editor.setHostKeyLevel('en', 'A', 0, 'α')
    flushSync()

    expect(keycapFace(target, 0)).toContain('αA')
    expect(keycapFace(target, 1)).toContain('αA')
    expect(keycapFace(target, 0)).toBe(keycapFace(target, 1))
  })

  it('does not bump hostLayoutRevision when the pointer only hovers a key', async () => {
    open(twinAKeymap)
    const before = editor.hostLayoutRevision
    const slot = layerSlot(target, 0, 0)
    slot.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(document.querySelector('.legend-decode')).toBeInstanceOf(HTMLElement)
    expect(editor.hostLayoutRevision).toBe(before)
    slot.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    flushSync()
    expect(editor.hostLayoutRevision).toBe(before)
  })
})

describe('Keyboard layers', () => {
  let target: HTMLDivElement
  let modalRoot: HTMLDivElement
  let view: HarnessView | undefined

  beforeEach(() => {
    editor.resetForTests()
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
    editor.resetForTests()
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

    expect(target.querySelectorAll('.key').length).toBe(2)
    layerSlot(target, 0, 1).click()
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

    const del = layerItem(target, 1).querySelector('.delete')
    expect(del).toBeInstanceOf(SVGElement)
    clickNode(del as SVGElement)

    const confirm = target.querySelector('.confirm-delete')
    expect(confirm).toBeInstanceOf(HTMLButtonElement)
    clickNode(confirm as HTMLButtonElement)

    expect(target.querySelector('[role=alertdialog]')).toBeNull()
    expect(harness.getKeymap().layers).toHaveLength(1)
    expect(harness.getKeymap().layer_names).toEqual(['Base'])
    expect(layerItem(target, 0).textContent).toContain('Base')
    expect(target.querySelector('.legend-panel tr[data-layer="1"]')).toBeNull()
    expect(target.querySelectorAll('.key').length).toBe(2)
  })

  it('clears used marks for keycodes that lived only on the deleted layer', () => {
    open()
    layerSlot(target, 0, 0).click()
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

    clickNode(layerItem(target, 1).querySelector('.delete') as SVGElement)
    clickNode(target.querySelector('.confirm-delete') as HTMLButtonElement)

    expect(document.querySelector('[role="dialog"][aria-label="Edit key"]')).toBeNull()
    layerSlot(target, 0, 0).click()
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
    layerSlot(target, 0, 0).click()
    flushSync()

    const editing = document.querySelector('[role="dialog"][aria-label="Edit key"]')
    expect(editing).toBeInstanceOf(HTMLElement)
    pickChoice(editing as HTMLElement, 'Q').click()
    flushSync()
    ;(editing?.querySelector('[aria-label="Apply"]') as HTMLButtonElement).click()
    flushSync()

    layerSlot(target, 1, 0).click()
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
    layerSlot(target, 0, 0).click()
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

    layerSlot(target, 1, 0).click()
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

    layerSlot(target, 1, 0).click()
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
    expect(layerItem(target, 0).textContent).toContain('Raise')
    expect(target.querySelector('.legend-panel tr[data-layer="1"]')).toBeNull()

    layerSlot(target, 0, 0).click()
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
    expect(keySlotTitles(target)).toEqual(['&kp A', '&kp B'])

    layerSlot(target, 0, 0).click()
    flushSync()
    const dialog = document.querySelector('[role="dialog"][aria-label="Edit key"]')
    expect(dialog).toBeInstanceOf(HTMLElement)
    pickChoice(dialog as HTMLElement, 'Q').click()
    flushSync()
    ;(dialog?.querySelector('[aria-label="Apply"]') as HTMLButtonElement).click()
    flushSync()

    expect(keySlotTitles(target)).toEqual(['&kp Q', '&kp B'])
    expect(target.querySelector('.editor-status')?.textContent).toMatch(/^Draft/)
    const undo = target.querySelector('.undo')
    expect(undo).toBeInstanceOf(HTMLButtonElement)
    expect((undo as HTMLButtonElement).disabled).toBe(false)
    ;(undo as HTMLButtonElement).click()
    flushSync()

    expect(keySlotTitles(target)).toEqual(['&kp A', '&kp B'])
    expect(target.querySelector('.editor-status')?.textContent).toBe('Up to date with disk')
    expect((undo as HTMLButtonElement).disabled).toBe(true)
  })
})
