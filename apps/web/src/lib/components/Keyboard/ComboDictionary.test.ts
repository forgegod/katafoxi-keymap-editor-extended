import type { LayoutKey, ZmkCombo } from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ComboDictionary from './ComboDictionary.svelte'

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
  { x: 1, y: 0, row: 0, col: 1 },
  { x: 0, y: 1, row: 1, col: 0 },
  { x: 1, y: 1, row: 1, col: 1 },
  { x: 1, y: 2, row: 2, col: 1 }
]

function combo(id: string, keyPositions: number[], code: string): ZmkCombo {
  return {
    id,
    keyPositions,
    binding: { value: '&kp', params: [{ value: code, params: [] }] }
  }
}

const combos: ZmkCombo[] = [
  combo('space', [4], 'SPACE'),
  combo('l_a', [0], 'A'),
  combo('li_a', [0, 4], 'LS(A)'),
  combo('l_d', [0, 1], 'D'),
  combo('boot', [0, 1], 'F1')
]

describe('ComboDictionary', () => {
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

  it('paints a typewriter index and peeks the chord for a covered letter', () => {
    const onHoverHit = vi.fn()
    view = mount(ComboDictionary, {
      target,
      props: {
        layout,
        combos,
        open: true,
        activeKeyId: null,
        onToggle: vi.fn(),
        onHoverHit,
        onSelectHit: vi.fn()
      }
    })
    flushSync()

    const toggle = target.querySelector('.dict-toggle')
    expect(toggle).toBeInstanceOf(HTMLButtonElement)
    expect(toggle?.textContent).toMatch(/Chord dictionary/)
    expect(toggle?.getAttribute('aria-expanded')).toBe('true')

    const index = target.querySelector('#combo-dictionary-index')
    expect(index?.getAttribute('aria-label')).toMatch(/Typewriter index/)

    const a = [...target.querySelectorAll('button.index-half')].find(
      button => button.getAttribute('aria-label') === 'A chord'
    )
    expect(a).toBeInstanceOf(HTMLButtonElement)
    expect(a?.textContent?.trim()).toBe('a')
    a?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(onHoverHit).toHaveBeenCalledWith(
      expect.objectContaining({ keyId: 'a', band: 'base', positions: [0] })
    )

    const shifted = [...target.querySelectorAll('button.index-half')].find(
      button => button.getAttribute('aria-label') === 'A shift chord'
    )
    expect(shifted?.textContent?.trim()).toBe('A')
    shifted?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(onHoverHit).toHaveBeenCalledWith(
      expect.objectContaining({ keyId: 'a', band: 'shift', positions: [0, 4] })
    )
  })

  it('hides the index when collapsed', () => {
    view = mount(ComboDictionary, {
      target,
      props: {
        layout,
        combos,
        open: false,
        activeKeyId: null,
        onToggle: vi.fn(),
        onHoverHit: vi.fn(),
        onSelectHit: vi.fn()
      }
    })
    flushSync()
    expect(target.querySelector('#combo-dictionary-index')).toBeNull()
    expect(target.querySelector('.dict-toggle')?.getAttribute('aria-expanded')).toBe(
      'false'
    )
  })
})
