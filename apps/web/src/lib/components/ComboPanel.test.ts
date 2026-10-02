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
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target.remove()
    editor.resetForTests()
  })

  function mountPanel() {
    view = mount(ComboPanelHarness, { target })
    flushSync()
  }

  it('lists the active combo and turns prior idle on and off', () => {
    mountPanel()

    expect(target.querySelector('.combo-id')?.textContent).toBe('combo_esc')
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
})
