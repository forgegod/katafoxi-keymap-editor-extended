import type { LayoutKey, ZmkCombo } from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ComboArcsOverlay from './ComboArcsOverlay.svelte'

const happyComment = document.createComment('')
const CommentCtor = Object.getPrototypeOf(happyComment).constructor
if (!(happyComment instanceof Comment)) {
  Object.defineProperty(globalThis, 'Comment', {
    configurable: true,
    writable: true,
    value: CommentCtor
  })
}

const layout: LayoutKey[] = [
  { x: 0, y: 0, row: 0, col: 0 },
  { x: 1, y: 0, row: 0, col: 1 }
]

const combo: ZmkCombo = {
  id: 'combo_esc',
  keyPositions: [0, 1],
  binding: { value: '&kp', params: [{ value: 'ESC', params: [] }] }
}

describe('ComboArcsOverlay', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target?.remove()
  })

  it('labels the combo svg as a group', () => {
    view = mount(ComboArcsOverlay, {
      target,
      props: {
        layout,
        combos: [combo],
        shownLayers: [0],
        width: 200,
        height: 80,
        minX: 0,
        minY: 0,
        labelFor: () => '&kp ESC',
        onSelect: vi.fn()
      }
    })
    flushSync()

    const svg = target.querySelector('svg.combo-arcs')
    expect(svg?.getAttribute('role')).toBe('group')
    expect(svg?.getAttribute('aria-label')).toBe('Combos on this board')
  })
})
