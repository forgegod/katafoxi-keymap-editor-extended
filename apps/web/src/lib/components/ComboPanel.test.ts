import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { editor } from '../editor.svelte.js'
import ComboPanelHarness from './ComboPanelHarness.svelte'

const esc = {
  value: '&kp',
  params: [{ value: 'ESC', params: [] }]
}
const none = { value: '&none', params: [] }

describe('ComboPanel', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  beforeEach(() => {
    editor.resetForTests()
    editor.layout = [
      { x: 0, y: 0, row: 0, col: 0 },
      { x: 1, y: 0, row: 0, col: 1 }
    ]
    const keymap = {
      layers: [[none, none]],
      layer_names: ['Base'],
      combos: [
        {
          id: 'combo_esc',
          keyPositions: [0, 1],
          binding: esc
        }
      ]
    }
    editor.baselineKeymap = structuredClone(keymap)
    editor.draftKeymap = structuredClone(keymap)
    editor.comboMode = true
    editor.activeComboId = 'combo_esc'
    target = document.createElement('div')
    document.body.appendChild(target)
    const modalRoot = document.createElement('div')
    modalRoot.id = 'modal-root'
    document.body.appendChild(modalRoot)
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target.remove()
    document.getElementById('modal-root')?.remove()
    editor.resetForTests()
  })

  function mountPanel() {
    view = mount(ComboPanelHarness, { target })
    flushSync()
  }

  it('lists the active combo and turns prior idle on and off', () => {
    mountPanel()

    expect(target.querySelector('.combo-id')?.textContent).toBe('combo_esc')
    const docs = target.querySelector('a.combo-docs')
    expect(docs).toBeTruthy()
    expect(docs?.getAttribute('href')).toBe('https://zmk.dev/docs/keymaps/combos')
    expect(docs?.getAttribute('target')).toBe('_blank')
    expect(target.querySelector('[aria-label="Require prior idle"]')).toBeTruthy()

    const off = [
      ...target.querySelectorAll('[aria-label="Require prior idle"] .combo-btn')
    ].find(el => el.textContent?.trim() === 'Off')
    const hundred = [
      ...target.querySelectorAll('[aria-label="Require prior idle"] .combo-btn')
    ].find(el => el.textContent?.trim() === '100')
    if (!(off instanceof HTMLButtonElement) || !(hundred instanceof HTMLButtonElement)) {
      throw new Error('missing prior-idle presets')
    }

    hundred.click()
    flushSync()
    expect(editor.draftKeymap?.combos?.[0]?.requirePriorIdleMs).toBe(100)
    expect(
      target.querySelector('[aria-label="Require prior idle in milliseconds"]')
    ).toBeTruthy()
    expect(target.querySelector('.combo-meta')?.textContent).toContain('idle100')

    off.click()
    flushSync()
    expect(editor.draftKeymap?.combos?.[0]?.requirePriorIdleMs).toBeUndefined()
    expect(
      target.querySelector('[aria-label="Require prior idle in milliseconds"]')
    ).toBeNull()
  })

  it('adds a new incomplete combo from New', () => {
    mountPanel()
    const add = [...target.querySelectorAll('.combo-btn')].find(
      el => el.textContent?.trim() === 'New'
    )
    if (!(add instanceof HTMLButtonElement)) throw new Error('missing New')
    add.click()
    flushSync()
    expect(editor.draftKeymap?.combos).toHaveLength(2)
    expect(editor.activeComboId).toBeTruthy()
    expect(editor.comboNotice).toMatch(/2/)
  })

  it('leaves combo mode on Escape when every combo is complete', () => {
    mountPanel()
    const done = target.querySelector('.combo-btn.done')
    expect(done?.getAttribute('aria-keyshortcuts')).toBe('Escape')
    expect(done?.querySelector('.esc-hint')?.textContent).toBe('Esc')
    expect(editor.comboMode).toBe(true)
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    flushSync()
    expect(editor.comboMode).toBe(false)
  })

  it('keeps combo mode on Escape when the active combo is incomplete', () => {
    mountPanel()
    const add = [...target.querySelectorAll('.combo-btn')].find(
      el => el.textContent?.trim() === 'New'
    )
    if (!(add instanceof HTMLButtonElement)) throw new Error('missing New')
    add.click()
    flushSync()
    // Empty drafts are dropped on exit; one key is incomplete and blocks.
    editor.toggleComboPosition(0)
    flushSync()
    expect(editor.comboMode).toBe(true)

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    flushSync()
    expect(editor.comboMode).toBe(true)
    expect(editor.comboNotice).toBeTruthy()
  })

  it('closes the binding editor on Escape without leaving combo mode', () => {
    mountPanel()
    const binding = [...target.querySelectorAll('.combo-btn')].find(
      el => el.textContent?.trim() === 'Binding'
    )
    if (!(binding instanceof HTMLButtonElement)) throw new Error('missing Binding')
    binding.click()
    flushSync()
    expect(document.querySelector('[role=dialog][aria-label="Edit key"]')).toBeTruthy()
    expect(editor.comboMode).toBe(true)

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    flushSync()
    expect(document.querySelector('[role=dialog][aria-label="Edit key"]')).toBeNull()
    expect(editor.comboMode).toBe(true)
  })

  it('blurs a focused id field on Escape without leaving combo mode', () => {
    mountPanel()
    const input = target.querySelector('.combo-props input')
    if (!(input instanceof HTMLInputElement)) throw new Error('missing id input')
    input.focus()
    expect(document.activeElement).toBe(input)

    // Capture listener on window still sees target = input.
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
      })
    )
    flushSync()
    expect(editor.comboMode).toBe(true)
    expect(document.activeElement).not.toBe(input)
  })
})
