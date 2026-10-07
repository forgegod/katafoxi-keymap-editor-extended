import {
  addHostLanguage,
  type LayoutKey,
  type ZmkCombo
} from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editor } from '../../editor.svelte.js'
import { resetLegendDecodeActive } from '../../legend-decode-active'
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

function visibleGlyphs(el: Element | null | undefined): string {
  return [...(el?.querySelectorAll('.glyph:not(.empty)') ?? [])]
    .map(node => node.textContent ?? '')
    .join('')
}

describe('ComboDictionary', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  beforeEach(() => {
    editor.resetForTests()
    resetLegendDecodeActive()
    target = document.createElement('div')
    document.body.appendChild(target)
    const modalRoot = document.createElement('div')
    modalRoot.id = 'modal-root'
    document.body.appendChild(modalRoot)
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target?.remove()
    document.getElementById('modal-root')?.remove()
    editor.resetForTests()
    resetLegendDecodeActive()
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
    expect(visibleGlyphs(a)).toBe('a')
    a?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(onHoverHit).toHaveBeenCalledWith(
      expect.objectContaining({ keyId: 'a', band: 'base', positions: [0] })
    )

    const shifted = [...target.querySelectorAll('button.index-half')].find(
      button => button.getAttribute('aria-label') === 'A shift chord'
    )
    expect(visibleGlyphs(shifted)).toBe('A')
    shifted?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(onHoverHit).toHaveBeenCalledWith(
      expect.objectContaining({ keyId: 'a', band: 'shift', positions: [0, 4] })
    )
  })

  it('peeks the host decode card on hover with an Alt+click hint', () => {
    view = mount(ComboDictionary, {
      target,
      props: {
        layout,
        combos,
        open: true,
        activeKeyId: null,
        onToggle: vi.fn(),
        onHoverHit: vi.fn(),
        onSelectHit: vi.fn()
      }
    })
    flushSync()

    const a = [...target.querySelectorAll('button.index-half')].find(
      button => button.getAttribute('aria-label') === 'A chord'
    )
    if (!(a instanceof HTMLButtonElement)) throw new Error('missing A chord')
    a.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()

    const tip = document.querySelector('[role="tooltip"].legend-decode')
    expect(tip).toBeInstanceOf(HTMLElement)
    expect(tip?.classList.contains('peek')).toBe(true)
    expect(tip?.querySelector('.row.current')).toBeTruthy()
    expect(tip?.textContent).toMatch(/Click — combo · Alt\+click — host/)
    expect(tip?.querySelector('button.slot')).toBeNull()

    a.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    flushSync()
    expect(document.querySelector('[role="tooltip"].legend-decode')).toBeNull()
  })

  it('selects a combo on click and starts host edit on Alt+click', () => {
    const onSelectHit = vi.fn()
    view = mount(ComboDictionary, {
      target,
      props: {
        layout,
        combos,
        open: true,
        activeKeyId: null,
        onToggle: vi.fn(),
        onHoverHit: vi.fn(),
        onSelectHit
      }
    })
    flushSync()

    const a = [...target.querySelectorAll('button.index-half')].find(
      button => button.getAttribute('aria-label') === 'A chord'
    )
    if (!(a instanceof HTMLButtonElement)) throw new Error('missing A chord')
    a.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    flushSync()
    expect(onSelectHit).toHaveBeenCalledWith(
      expect.objectContaining({ keyId: 'a', band: 'base' })
    )

    onSelectHit.mockClear()
    a.dispatchEvent(
      new MouseEvent('click', { altKey: true, bubbles: true, cancelable: true })
    )
    flushSync()
    expect(onSelectHit).not.toHaveBeenCalled()
    expect(editor.hostEditSession?.keyIndex).toBe(-1)
    expect(editor.hostSymbolEditTarget?.zmk).toBe('A')
    expect(editor.hostSymbolEditTarget?.level).toBe(0)
  })

  it('paints a second-language pack on the D half', () => {
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'ru')
    view = mount(ComboDictionary, {
      target,
      props: {
        layout,
        combos,
        open: true,
        activeKeyId: null,
        onToggle: vi.fn(),
        onHoverHit: vi.fn(),
        onSelectHit: vi.fn()
      }
    })
    flushSync()

    const d = [...target.querySelectorAll('button.index-half')].find(
      button => button.getAttribute('aria-label') === 'D chord'
    )
    expect(visibleGlyphs(d)).toBe('dв')
    expect(d?.querySelector('.pack.second')).toBeTruthy()
    expect(d?.querySelectorAll('.glyph.alt').length).toBeGreaterThan(0)
  })

  it('paints mod-chord chips for Alt+Tab and Ctrl+Tab on Tab', () => {
    const withMods: ZmkCombo[] = [
      ...combos,
      combo('alt_tab', [0, 4], 'LA(TAB)'),
      combo('ctrl_tab', [1, 4], 'LC(TAB)')
    ]
    view = mount(ComboDictionary, {
      target,
      props: {
        layout,
        combos: withMods,
        open: true,
        activeKeyId: null,
        onToggle: vi.fn(),
        onHoverHit: vi.fn(),
        onSelectHit: vi.fn()
      }
    })
    flushSync()

    const altTab = [...target.querySelectorAll('button.index-mod')].find(
      button => button.getAttribute('aria-label') === '⎇TAB chord'
    )
    const ctrlTab = [...target.querySelectorAll('button.index-mod')].find(
      button => button.getAttribute('aria-label') === '⌃TAB chord'
    )
    expect(altTab?.textContent?.trim()).toBe('⎇TAB')
    expect(ctrlTab?.textContent?.trim()).toBe('⌃TAB')
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
