import type { HostLegendView, KeyBindingNode, ParsedKeymap } from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { editor } from '../editor.svelte.js'
import HostLegendPicker from './HostLegendPicker.svelte'

const happyComment = document.createComment('')
const CommentCtor = Object.getPrototypeOf(happyComment).constructor
if (!(happyComment instanceof Comment)) {
  Object.defineProperty(globalThis, 'Comment', {
    configurable: true,
    writable: true,
    value: CommentCtor
  })
}

function openLayoutId(view: HostLegendView): string | null {
  if (view.open == null) return null
  return view.columns.find(column => column.language === view.open)?.layoutId ?? null
}

function kp(code: string): KeyBindingNode {
  return { value: '&kp', params: [{ value: code, params: [] }] }
}

function keymapOf(names: string[], layer0: KeyBindingNode[] = [kp('E')]): ParsedKeymap {
  return {
    layer_names: names,
    layers: names.map((_, layer) =>
      layer0.map((node, key) =>
        layer === 0 ? node : kp(key === 0 ? `F${layer}` : 'X')
      )
    )
  }
}

describe('HostLegendPicker', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  beforeEach(() => {
    editor.resetForTests()
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target?.remove()
    editor.resetForTests()
  })

  async function open(keymap: ParsedKeymap) {
    await editor.selectKeyboard({
      source: 'local',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap
    })
    view = mount(HostLegendPicker, { target })
    flushSync()
  }

  function panelRows(): HTMLTableRowElement[] {
    return [...target.querySelectorAll('.legend-panel tbody tr')].filter(
      (el): el is HTMLTableRowElement => el instanceof HTMLTableRowElement
    )
  }

  function expand() {
    const button = target.querySelector('.legend-panel .layer-disclosure')
    if (!(button instanceof HTMLButtonElement)) throw new Error('missing disclosure')
    button.click()
    flushSync()
    return button
  }

  it('builds one row per keymap layer when the list is short', async () => {
    await open(keymapOf(['default', 'raise']))
    expect(panelRows().map(row => row.querySelector('th')?.textContent?.trim())).toEqual([
      'default',
      'raise'
    ])
  })

  it('keeps extra layers behind the overlay until it is opened', async () => {
    await open(keymapOf(Array.from({ length: 9 }, (_, i) => `L${i}`)))
    expect(panelRows()).toHaveLength(4)

    const sizer = target.querySelector('.legend-sizer')
    const panel = target.querySelector('.legend-panel')
    if (!(sizer instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
      throw new Error('missing overlay parts')
    }
    expect(panel.style.position).toBe('absolute')
    expect(sizer.hasAttribute('inert')).toBe(true)
    expect(sizer.querySelectorAll('tbody tr')).toHaveLength(4)

    const button = expand()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(sizer.querySelectorAll('tbody tr')).toHaveLength(4)
    expect(panelRows()).toHaveLength(9)
    expect(panelRows().map(row => row.querySelector('th')?.textContent?.trim())).toEqual(
      Array.from({ length: 9 }, (_, i) => `L${i}`)
    )
  })

  it('takes the ZMK keycode from the layer0 &kp E key', async () => {
    await open(
      keymapOf(['base', 'num'], [kp('A'), kp('E')])
    )
    editor.layerView = { ...editor.layerView, shown: [0, 1] }
    flushSync()
    const codes = panelRows().map(row => row.querySelector('.zmk')?.textContent?.trim())
    expect(codes[0]).toMatch(/E/)
    expect(codes[1]).toMatch(/X/)
  })

  it('collapses as soon as the pointer leaves unless the list is pinned', async () => {
    await open(keymapOf(Array.from({ length: 9 }, (_, i) => `L${i}`)))
    const strip = target.querySelector('.host-legend-strip')
    if (!(strip instanceof HTMLElement)) throw new Error('missing strip')

    strip.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(panelRows()).toHaveLength(9)

    strip.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    flushSync()
    expect(panelRows()).toHaveLength(4)

    const eye = target.querySelector('.legend-panel [aria-label="Показать L1"]')
    if (!(eye instanceof HTMLButtonElement)) throw new Error('missing eye')
    strip.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    eye.click()
    flushSync()
    expect(panelRows()).toHaveLength(9)
    strip.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    flushSync()
    expect(panelRows().map(row => row.querySelector('th')?.textContent?.trim())).toEqual([
      'L0',
      'L2',
      'L3'
    ])

    const button = expand()
    strip.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    flushSync()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(panelRows()).toHaveLength(9)
  })

  it('expands on focus so extra layers are reachable without a mouse', async () => {
    await open(keymapOf(Array.from({ length: 9 }, (_, i) => `L${i}`)))
    expect(panelRows()).toHaveLength(4)
    const button = target.querySelector('.legend-panel .layer-disclosure')
    if (!(button instanceof HTMLButtonElement)) throw new Error('missing disclosure')
    button.focus()
    flushSync()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(panelRows()).toHaveLength(9)
  })

  it('toggles layer0 to a raw ZMK row instead of hiding it', async () => {
    await open(keymapOf(['default', 'raise']))
    const shownBefore = editor.layerView.shown
    const eye = target.querySelector('.legend-panel [aria-label="Показать host-легенду default"]')
    if (!(eye instanceof HTMLButtonElement)) throw new Error('missing layer0 eye')
    expect(eye.getAttribute('aria-pressed')).toBe('true')
    eye.click()
    flushSync()
    expect(editor.layerView.layer0Raw).toBe(true)
    expect(editor.layerView.shown).toEqual(shownBefore)
    expect(eye.getAttribute('aria-pressed')).toBe('false')
    eye.click()
    flushSync()
    expect(editor.layerView.layer0Raw).toBe(false)
    expect(eye.getAttribute('aria-pressed')).toBe('true')
  })

  it('toggles visibility through toggleShownLayer', async () => {
    await open(keymapOf(['default', 'raise']))
    const eye = target.querySelector('.legend-panel [aria-label="Показать raise"]')
    if (!(eye instanceof HTMLButtonElement)) throw new Error('missing raise eye')
    eye.click()
    flushSync()
    expect(editor.layerView.shown).toEqual([0, 2, 3])
  })

  it('adds a transparent Layer #2 from the table footer', async () => {
    await open(keymapOf(['default', 'raise']))
    expect(target.querySelector('.legend-panel .add-layer')).toBeNull()

    const strip = target.querySelector('.host-legend-strip')
    if (!(strip instanceof HTMLElement)) throw new Error('missing strip')
    strip.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()

    const add = target.querySelector('.legend-panel .add-layer')
    if (!(add instanceof HTMLButtonElement)) throw new Error('missing Add Layer')
    add.click()
    flushSync()
    expect(editor.draftKeymap?.layer_names).toEqual(['default', 'raise', 'Layer #2'])
    expect(editor.draftKeymap?.layers).toHaveLength(3)
    expect(editor.draftKeymap?.layers[2]).toEqual([{ value: '&trans', params: [] }])
  })

  it('puts a profile menu after each language flag', async () => {
    await open(keymapOf(['default']))
    const triggers = [...target.querySelectorAll('.legend-panel .profile-trigger')]
    expect(triggers.map(el => el.getAttribute('aria-label'))).toEqual([
      'Профиль English',
      'Профиль Russian'
    ])
    const english = triggers[0]
    if (!(english instanceof HTMLButtonElement)) throw new Error('missing English profile')
    expect(english.textContent?.trim()).toBe('В раскладке')
    english.click()
    flushSync()
    const items = [...target.querySelectorAll('.profile-list .profile-item')].map(
      el => el.textContent?.trim()
    )
    expect(items).toEqual(['В раскладке', 'Системная'])
    const system = [...target.querySelectorAll('.profile-list .profile-item')].find(
      el => el.textContent?.trim() === 'Системная'
    )
    if (!(system instanceof HTMLButtonElement)) throw new Error('missing system option')
    system.click()
    flushSync()
    expect(editor.hostLegend.columns[0].layoutId).toBe('system-us')
    expect(editor.activeProfileId('en')).toBe('system-us')
  })

  it('lists Russian system variants and copies from a row', async () => {
    await open(keymapOf(['default']))
    const russian = [...target.querySelectorAll('.legend-panel .profile-trigger')].find(
      el => el.getAttribute('aria-label') === 'Профиль Russian'
    )
    if (!(russian instanceof HTMLButtonElement)) throw new Error('missing Russian profile')
    russian.click()
    flushSync()
    const items = [...target.querySelectorAll('.profile-list .profile-item')].map(
      el => el.textContent?.trim()
    )
    expect(items[0]).toBe('В раскладке')
    expect(items[1]).toBe('Системная')
    expect(items).toContain('phonetic')
    expect(items.at(-1)).toBe('phonetic_mac')
    const phonetic = [...target.querySelectorAll('.profile-list .profile-item')].find(
      el => el.textContent?.trim() === 'phonetic'
    )
    if (!(phonetic instanceof HTMLButtonElement)) throw new Error('missing phonetic')
    phonetic.click()
    flushSync()
    expect(openLayoutId(editor.hostLegend)).toBe('system-ru-phonetic')
    expect(editor.activeProfileId('ru')).toBe('system-ru-phonetic')
  })

  function chooseLanguage(value: string) {
    const select = target.querySelector('.legend-panel .language-select')
    if (!(select instanceof HTMLSelectElement)) throw new Error('missing language select')
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
    flushSync()
  }

  it('adds Ukrainian after the language is chosen', async () => {
    await open(keymapOf(['default']))
    const add = target.querySelector('.legend-panel .add-language')
    if (!(add instanceof HTMLButtonElement)) throw new Error('missing add language')
    add.click()
    flushSync()
    expect(openLayoutId(editor.hostLegend)).toBe('lark-ru')
    const options = [...target.querySelectorAll('.legend-panel .language-select option')].map(
      el => el.textContent?.trim()
    )
    expect(options).toEqual(['Язык', 'Ukrainian', 'German'])
    chooseLanguage('uk')
    expect(openLayoutId(editor.hostLegend)).toBe('system-ua')
    const flags = [...target.querySelectorAll('.legend-panel .lang-flag')].map(
      el => el.textContent
    )
    expect(flags).toEqual(['🇦🇺', '🇷🇺', '🇺🇦'])
    const triggers = [...target.querySelectorAll('.legend-panel .profile-trigger')]
      .filter(el => !el.closest('.lang-head.narrow'))
      .map(el => el.getAttribute('aria-label'))
    expect(triggers).toEqual(['Профиль English', 'Профиль Ukrainian'])
    const russian = target.querySelector('.legend-panel .lang-head.narrow .lang-flag')
    expect(russian?.textContent).toBe('🇷🇺')
    const ukrainian = [...target.querySelectorAll('.legend-panel .profile-trigger')].find(
      el => el.getAttribute('aria-label') === 'Профиль Ukrainian'
    )
    if (!(ukrainian instanceof HTMLButtonElement)) throw new Error('missing Ukrainian profile')
    ukrainian.click()
    flushSync()
    const items = [...target.querySelectorAll('.profile-list .profile-item')].map(
      el => el.textContent?.trim()
    )
    expect(items[0]).toBe('Системная')
    expect(items).toEqual([
      'Системная',
      'macOS',
      'legacy',
      'winkeys',
      'typewriter',
      'phonetic',
      'homophonic'
    ])
    const copies = [...target.querySelectorAll('.profile-list .profile-icon')].filter(
      el => el.getAttribute('title') === 'Скопировать профиль'
    )
    expect(copies).toHaveLength(items.length)
    expect(target.querySelector('.legend-panel .language-select')).toBeNull()
    const flag = target.querySelector('.legend-panel button.lang-flag')
    if (!(flag instanceof HTMLButtonElement)) throw new Error('missing language flag')
    flag.click()
    flushSync()
    expect(
      [...target.querySelectorAll('.legend-panel .language-select option')]
        .map(el => el.textContent?.trim())
        .filter(Boolean)
    ).toEqual(['Убрать язык', 'German'])
  })

  it('adds German after Ukrainian and lists its system variants', async () => {
    await open(keymapOf(['default']))
    const add = target.querySelector('.legend-panel .add-language')
    if (!(add instanceof HTMLButtonElement)) throw new Error('missing add language')
    add.click()
    flushSync()
    chooseLanguage('uk')
    const addAgain = target.querySelector('.legend-panel .add-language')
    if (!(addAgain instanceof HTMLButtonElement)) throw new Error('missing second add language')
    addAgain.click()
    flushSync()
    expect(
      [...target.querySelectorAll('.legend-panel .language-select option')].map(el =>
        el.textContent?.trim()
      )
    ).toEqual(['Язык', 'German'])
    chooseLanguage('de')
    expect(openLayoutId(editor.hostLegend)).toBe('system-de')
    const flags = [...target.querySelectorAll('.legend-panel .lang-flag')].map(
      el => el.textContent
    )
    expect(flags).toEqual(['🇦🇺', '🇷🇺', '🇺🇦', '🇩🇪'])
    const german = [...target.querySelectorAll('.legend-panel .profile-trigger')].find(
      el => el.getAttribute('aria-label') === 'Профиль German'
    )
    if (!(german instanceof HTMLButtonElement)) throw new Error('missing German profile')
    german.click()
    flushSync()
    const items = [...target.querySelectorAll('.profile-list .profile-item')].map(
      el => el.textContent?.trim()
    )
    expect(items[0]).toBe('Системная')
    expect(items).toContain('nodeadkeys')
    expect(items).toContain('neo')
    expect(items.at(-1)).toBe('noted')
    const copies = [...target.querySelectorAll('.profile-list .profile-icon')].filter(
      el => el.getAttribute('title') === 'Скопировать профиль'
    )
    expect(copies).toHaveLength(items.length)
    const germanFlag = [...target.querySelectorAll('.legend-panel button.lang-flag')].find(
      el => el.getAttribute('aria-label') === 'Язык German'
    )
    if (!(germanFlag instanceof HTMLButtonElement)) throw new Error('missing German flag')
    germanFlag.click()
    flushSync()
    expect(
      [...target.querySelectorAll('.legend-panel .language-select option')]
        .map(el => el.textContent?.trim())
        .filter(Boolean)
    ).toEqual(['Убрать язык'])
    chooseLanguage('__remove__')
    expect(
      [...target.querySelectorAll('.legend-panel .lang-flag')].map(el => el.textContent)
    ).toEqual(['🇦🇺', '🇷🇺', '🇺🇦'])
    expect(target.querySelector('.legend-panel .add-language')).toBeInstanceOf(HTMLButtonElement)
  })

  it('renames a layer from the table name button', async () => {
    await open(keymapOf(['default', 'raise']))
    const name = target.querySelector('.legend-panel tr[data-layer="0"] .layer-name')
    if (!(name instanceof HTMLButtonElement)) throw new Error('missing name')
    name.click()
    flushSync()
    const input = target.querySelector('.legend-panel input.layer-name')
    if (!(input instanceof HTMLInputElement)) throw new Error('missing rename field')
    input.value = 'Lower'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    flushSync()
    expect(editor.draftKeymap?.layer_names).toEqual(['Lower', 'raise'])
  })
})
