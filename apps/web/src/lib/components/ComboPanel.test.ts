import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editor } from '../editor.svelte.js'
import ComboPanelHarness from './ComboPanelHarness.svelte'
import LinuxInstallSheet from './LinuxInstallSheet.svelte'

const esc = {
  value: '&kp',
  params: [{ value: 'ESC', params: [] }]
}
const none = { value: '&none', params: [] }

describe('ComboPanel', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined
  let sheetView: ReturnType<typeof mount> | undefined

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
    if (sheetView) unmount(sheetView)
    sheetView = undefined
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

  it('marks both rows when two combos share keys and clears after the layers split', () => {
    const keymap = {
      layers: [
        [none, none],
        [none, none]
      ],
      layer_names: ['Base', 'Lower'],
      combos: [
        { id: 'combo_esc', keyPositions: [0, 1], binding: esc },
        { id: 'combo_tab', keyPositions: [1, 0], binding: esc, layers: [1] }
      ]
    }
    editor.baselineKeymap = structuredClone(keymap)
    editor.draftKeymap = structuredClone(keymap)
    editor.activeComboId = 'combo_esc'
    mountPanel()

    expect(target.querySelectorAll('.combo-item.invalid')).toHaveLength(2)
    expect(target.querySelector('.combo-warn')?.textContent).toMatch(/combo_tab/)

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    flushSync()
    expect(editor.comboMode).toBe(true)

    const base = [...target.querySelectorAll('.layer-chip')].find(
      el => el.textContent?.trim() === 'L0'
    )
    if (!(base instanceof HTMLButtonElement)) throw new Error('missing L0')
    base.click()
    flushSync()

    expect(editor.draftKeymap?.combos?.[0]?.layers).toEqual([0])
    expect(target.querySelectorAll('.combo-item.invalid')).toHaveLength(0)
    expect(target.querySelector('.combo-warn')).toBeNull()
    expect(editor.comboNotice).toBeNull()
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
    expect(editor.comboNotice).toMatch(/Click keys/)
  })

  it('keeps combo mode when Escape closes the Linux install sheet', () => {
    mountPanel()
    sheetView = mount(LinuxInstallSheet, {
      target,
      props: {
        exports: [],
        copyNote: '',
        onCopyText: () => {},
        onDownloadSection: () => {},
        onDownloadAll: () => {},
        onClose: () => {
          if (sheetView) {
            unmount(sheetView)
            sheetView = undefined
          }
        }
      }
    })
    flushSync()
    expect(document.querySelector('#linux-install-title')).toBeTruthy()
    expect(editor.comboMode).toBe(true)

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    flushSync()
    expect(editor.comboMode).toBe(true)
    expect(document.querySelector('#linux-install-title')).toBeNull()
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

  it('leaves combo mode on Escape with a 1-key combo', () => {
    mountPanel()
    const add = [...target.querySelectorAll('.combo-btn')].find(
      el => el.textContent?.trim() === 'New'
    )
    if (!(add instanceof HTMLButtonElement)) throw new Error('missing New')
    add.click()
    flushSync()
    editor.toggleComboPosition(0)
    flushSync()
    expect(editor.comboMode).toBe(true)

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    flushSync()
    expect(editor.comboMode).toBe(false)
    expect(editor.draftKeymap?.combos?.some(c => c.keyPositions.length === 1)).toBe(
      true
    )
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

  it('names a new combo combo_esc after picking &kp ESC and keeps it selected', () => {
    const keymap = {
      layers: [[none, none]],
      layer_names: ['Base'],
      combos: [] as { id: string; keyPositions: number[]; binding: typeof none }[]
    }
    editor.baselineKeymap = structuredClone(keymap)
    editor.draftKeymap = structuredClone(keymap)
    editor.activeComboId = null
    mountPanel()

    const add = [...target.querySelectorAll('.combo-btn')].find(
      el => el.textContent?.trim() === 'New'
    )
    if (!(add instanceof HTMLButtonElement)) throw new Error('missing New')
    add.click()
    flushSync()

    // New names from the default ESC binding; a placeholder is what picking ESC renames.
    const created = editor.draftKeymap?.combos?.[0]
    expect(created).toBeTruthy()
    editor.updateCombos([
      { ...created!, id: 'combo', binding: none, keyPositions: [0, 1] }
    ])
    editor.activeComboId = 'combo'
    flushSync()

    const binding = [...target.querySelectorAll('.combo-btn')].find(
      el => el.textContent?.trim() === 'Binding'
    )
    if (!(binding instanceof HTMLButtonElement)) throw new Error('missing Binding')
    binding.click()
    flushSync()

    const kp = [...document.querySelectorAll('.key-editor-chip')].find(
      el => (el.textContent ?? '').trim() === '&kp'
    )
    if (!(kp instanceof HTMLButtonElement)) throw new Error('missing &kp')
    kp.click()
    flushSync()

    const filter = document.querySelector('.key-editor-filter')
    if (!(filter instanceof HTMLInputElement)) throw new Error('missing filter')
    filter.value = 'ESC'
    filter.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()

    const escChoice = [...document.querySelectorAll('.key-editor-choice')].find(
      el => (el.textContent ?? '').trim() === 'ESC'
    )
    if (!(escChoice instanceof HTMLButtonElement)) throw new Error('missing ESC')
    escChoice.click()
    flushSync()

    const apply = document.querySelector('[aria-label=Apply]')
    if (!(apply instanceof HTMLButtonElement)) throw new Error('missing Apply')
    apply.click()
    flushSync()

    expect(editor.draftKeymap?.combos?.[0]?.id).toBe('combo_esc')
    expect(editor.activeComboId).toBe('combo_esc')
    expect(target.querySelector('.combo-id')?.textContent).toBe('combo_esc')
  })

  it('marks keycodes already used by other combo bindings', () => {
    const a = {
      value: '&kp',
      params: [{ value: 'A', params: [] }]
    }
    const keymap = {
      layers: [[none, none]],
      layer_names: ['Base'],
      combos: [
        { id: 'combo_esc', keyPositions: [0, 1], binding: esc },
        { id: 'combo_a', keyPositions: [0, 1], binding: a, layers: [0] }
      ]
    }
    editor.baselineKeymap = structuredClone(keymap)
    editor.draftKeymap = structuredClone(keymap)
    editor.activeComboId = 'combo_esc'
    mountPanel()

    const binding = [...target.querySelectorAll('.combo-btn')].find(
      el => el.textContent?.trim() === 'Binding'
    )
    if (!(binding instanceof HTMLButtonElement)) throw new Error('missing Binding')
    binding.click()
    flushSync()

    const filter = document.querySelector('.key-editor-filter')
    if (!(filter instanceof HTMLInputElement)) throw new Error('missing filter')
    filter.value = 'A'
    filter.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()

    const aChoice = [...document.querySelectorAll('.key-editor-choice')].find(
      el => (el.textContent ?? '').trim() === 'A'
    )
    if (!(aChoice instanceof HTMLButtonElement)) throw new Error('missing A')
    expect(aChoice.classList.contains('used')).toBe(true)
  })

  it('reverts the id field when the new name is already taken', () => {
    const keymap = {
      layers: [[none, none]],
      layer_names: ['Base'],
      combos: [
        { id: 'combo_esc', keyPositions: [0, 1], binding: esc },
        { id: 'combo_tab', keyPositions: [0, 1], binding: esc, layers: [0] }
      ]
    }
    editor.baselineKeymap = structuredClone(keymap)
    editor.draftKeymap = structuredClone(keymap)
    editor.activeComboId = 'combo_esc'
    mountPanel()

    const input = target.querySelector('.combo-props input')
    if (!(input instanceof HTMLInputElement)) throw new Error('missing id input')
    input.value = 'combo_tab'
    input.dispatchEvent(new Event('change', { bubbles: true }))
    flushSync()

    expect(input.value).toBe('combo_esc')
    expect(editor.draftKeymap?.combos?.map(c => c.id)).toEqual([
      'combo_esc',
      'combo_tab'
    ])
    expect(editor.activeComboId).toBe('combo_esc')
  })

  it('selects the next combo after deleting the active one', () => {
    const keymap = {
      layers: [[none, none]],
      layer_names: ['Base'],
      combos: [
        { id: 'combo_esc', keyPositions: [0, 1], binding: esc },
        { id: 'combo_tab', keyPositions: [0, 1], binding: esc, layers: [0] }
      ]
    }
    editor.baselineKeymap = structuredClone(keymap)
    editor.draftKeymap = structuredClone(keymap)
    editor.activeComboId = 'combo_esc'
    mountPanel()

    const del = [...target.querySelectorAll('.combo-btn')].find(
      el => el.textContent?.trim() === 'Delete'
    )
    if (!(del instanceof HTMLButtonElement)) throw new Error('missing Delete')
    del.click()
    flushSync()

    expect(editor.draftKeymap?.combos?.map(c => c.id)).toEqual(['combo_tab'])
    expect(editor.activeComboId).toBe('combo_tab')
    expect(target.querySelector('.combo-id')?.textContent).toBe('combo_tab')
  })

  it('shows All layers after the last layer chip is turned off', () => {
    const keymap = {
      layers: [
        [none, none],
        [none, none]
      ],
      layer_names: ['Base', 'Lower'],
      combos: [
        { id: 'combo_esc', keyPositions: [0, 1], binding: esc, layers: [1] }
      ]
    }
    editor.baselineKeymap = structuredClone(keymap)
    editor.draftKeymap = structuredClone(keymap)
    editor.activeComboId = 'combo_esc'
    mountPanel()

    const l1 = [...target.querySelectorAll('.layer-chip')].find(
      el => el.textContent?.trim() === 'L1'
    )
    if (!(l1 instanceof HTMLButtonElement)) throw new Error('missing L1')
    expect(l1.getAttribute('aria-pressed')).toBe('true')
    l1.click()
    flushSync()

    expect(editor.draftKeymap?.combos?.[0]?.layers).toBeUndefined()
    const all = [...target.querySelectorAll('.combo-layers .combo-btn')].find(
      el => el.textContent?.trim() === 'All'
    )
    expect(all?.classList.contains('on')).toBe(true)
    expect(target.querySelector('.combo-meta')?.textContent).toContain('all')
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
  it('scrolls the combo list to the active row when selection changes', () => {
    const combos = Array.from({ length: 40 }, (_, index) => ({
      id: `combo_${index}`,
      keyPositions: [0, 1],
      binding: esc
    }))
    const keymap = {
      layers: [[none, none]],
      layer_names: ['Base'],
      combos
    }
    editor.baselineKeymap = structuredClone(keymap)
    editor.draftKeymap = structuredClone(keymap)
    editor.activeComboId = 'combo_0'
    mountPanel()

    const scrollIntoView = vi.fn()
    const proto = HTMLElement.prototype as HTMLElement & {
      scrollIntoView: typeof scrollIntoView
    }
    const previous = proto.scrollIntoView
    proto.scrollIntoView = scrollIntoView
    try {
      editor.activeComboId = 'combo_35'
      flushSync()
      expect(scrollIntoView).toHaveBeenCalled()
      const active = target.querySelector('.combo-item.active .combo-id')
      expect(active?.textContent).toBe('combo_35')
    } finally {
      proto.scrollIntoView = previous
    }
  })

})
