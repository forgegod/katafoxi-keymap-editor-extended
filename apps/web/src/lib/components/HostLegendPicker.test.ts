import {
  addHostLanguage,
  encodeKlc,
  type HostLegendView,
  type KeyBindingNode,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editor } from '../editor.svelte.js'
import { clearHostLayoutStore, loadUserHostLayouts } from '../host-layout-store'
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

  beforeEach(async () => {
    editor.resetForTests()
    await clearHostLayoutStore()
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

  function hoverStrip() {
    const strip = target.querySelector('.host-legend-strip')
    if (!(strip instanceof HTMLElement)) throw new Error('missing strip')
    strip.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    return strip
  }

  it('hides firmware layers and shows every language while languages are stacked', async () => {
    await open(keymapOf(['default', 'raise', 'adjust']))
    editor.hostLegend = addHostLanguage(addHostLanguage(editor.hostLegend, 'ru'), 'uk')
    editor.multilangView = true
    flushSync()
    expect(panelRows().map(row => row.querySelector('th')?.textContent?.trim())).toEqual(['default'])
    const russian = target.querySelector('.legend-panel [aria-label="Russian stays on the key while languages are stacked"]')
    expect(russian).toHaveProperty('disabled', true)
    const text = (panelRows()[0]?.textContent ?? '').replace(/\s+/g, '')
    expect(text).toContain('eE')
    expect(text).toContain('уУ')
  })

  it('keeps the sample layer in the resting strip and the rest behind the overlay', async () => {
    await open(keymapOf(['default', 'raise']))
    expect(panelRows().map(row => row.querySelector('th')?.textContent?.trim())).toEqual(['default'])
    const sizer = target.querySelector('.legend-sizer')
    if (!(sizer instanceof HTMLElement)) throw new Error('missing sizer')
    expect(sizer.querySelectorAll('tbody tr')).toHaveLength(1)

    hoverStrip()
    expect(panelRows().map(row => row.querySelector('th')?.textContent?.trim())).toEqual([
      'default',
      'raise'
    ])
    expect(sizer.querySelectorAll('tbody tr')).toHaveLength(1)
  })

  it('keeps extra layers behind the overlay until it is opened', async () => {
    await open(keymapOf(Array.from({ length: 9 }, (_, i) => `L${i}`)))
    expect(panelRows()).toHaveLength(1)

    const sizer = target.querySelector('.legend-sizer')
    const panel = target.querySelector('.legend-panel')
    if (!(sizer instanceof HTMLElement) || !(panel instanceof HTMLElement)) {
      throw new Error('missing overlay parts')
    }
    expect(panel.style.position).toBe('absolute')
    expect(sizer.hasAttribute('inert')).toBe(true)
    expect(sizer.querySelectorAll('tbody tr')).toHaveLength(1)

    hoverStrip()
    expect(sizer.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(panelRows()).toHaveLength(9)
    expect(panelRows().map(row => row.querySelector('th')?.textContent?.trim())).toEqual(
      Array.from({ length: 9 }, (_, i) => `L${i}`)
    )
  })

  it('anchors the legend sample on the layer0 &kp E key', async () => {
    await open(
      keymapOf(['base', 'num'], [kp('A'), kp('E')])
    )
    editor.layerView = { ...editor.layerView, shown: [0, 1] }
    flushSync()
    // Sample key is E (not A); row cells show composed host glyphs for that key.
    const basePair = panelRows()[0]?.querySelector('td')?.textContent?.trim()
    expect(basePair).toBeTruthy()
    expect(basePair).not.toMatch(/^A$/i)
  })

  it('collapses as soon as the pointer leaves', async () => {
    await open(keymapOf(Array.from({ length: 9 }, (_, i) => `L${i}`)))
    const strip = target.querySelector('.host-legend-strip')
    if (!(strip instanceof HTMLElement)) throw new Error('missing strip')

    strip.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(panelRows()).toHaveLength(9)

    strip.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    flushSync()
    expect(panelRows().map(row => row.querySelector('th')?.textContent?.trim())).toEqual(['L0'])

    strip.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    const eye = target.querySelector('.legend-panel [aria-label="Show L1"]')
    if (!(eye instanceof HTMLButtonElement)) throw new Error('missing eye')
    eye.click()
    flushSync()
    expect(panelRows()).toHaveLength(9)
    strip.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    flushSync()
    expect(panelRows().map(row => row.querySelector('th')?.textContent?.trim())).toEqual(['L0'])
  })

  it('expands on focus so extra layers are reachable without a mouse', async () => {
    await open(keymapOf(Array.from({ length: 9 }, (_, i) => `L${i}`)))
    expect(panelRows()).toHaveLength(1)
    const eye = target.querySelector('.legend-panel [aria-label="Show host legend L0"]')
    if (!(eye instanceof HTMLButtonElement)) throw new Error('missing layer eye')
    eye.focus()
    flushSync()
    expect(panelRows()).toHaveLength(9)
  })

  it('toggles layer0 to a raw ZMK row instead of hiding it', async () => {
    await open(keymapOf(['default', 'raise']))
    const shownBefore = editor.layerView.shown
    const eye = target.querySelector('.legend-panel [aria-label="Show host legend default"]')
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
    const strip = target.querySelector('.host-legend-strip')
    if (!(strip instanceof HTMLElement)) throw new Error('missing strip')
    strip.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    const eye = target.querySelector('.legend-panel [aria-label="Show raise"]')
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
      'Profile English: System'
    ])
    expect(target.querySelector('.legend-panel .prompt-label')?.textContent).toBe(
      'Computer language'
    )
    const english = triggers[0]
    if (!(english instanceof HTMLButtonElement)) throw new Error('missing English profile')
    expect(english.textContent?.trim()).toBe('System')
    english.click()
    flushSync()
    const items = [...target.querySelectorAll('.profile-list .profile-item')].map(
      el => el.textContent?.trim()
    )
    expect(items).toEqual(['System'])
    const system = [...target.querySelectorAll('.profile-list .profile-item')].find(
      el => el.textContent?.trim() === 'System'
    )
    if (!(system instanceof HTMLButtonElement)) throw new Error('missing system option')
    system.click()
    flushSync()
    expect(editor.hostLegend.columns[0].layoutId).toBe('system-us')
    expect(editor.activeProfileId('en')).toBe('system-us')
  })

  it('lists Russian system variants and copies from a row', async () => {
    await open(keymapOf(['default']))
    chooseLanguage('ru')
    const russian = [...target.querySelectorAll('.legend-panel .profile-trigger')].find(
      el => el.getAttribute('aria-label')?.startsWith('Profile Russian')
    )
    if (!(russian instanceof HTMLButtonElement)) throw new Error('missing Russian profile')
    russian.click()
    flushSync()
    const items = [...target.querySelectorAll('.profile-list .profile-item')].map(
      el => el.textContent?.trim()
    )
    expect(items[0]).toBe('System')
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

  function languageLabel(value: string): string {
    if (value === '__remove__') return 'Remove language'
    if (value === 'ru') return 'Russian'
    if (value === 'uk') return 'Ukrainian'
    if (value === 'de') return 'German'
    return value
  }

  function openAddLanguageMenu() {
    const add = target.querySelector('.legend-panel .add-language')
    if (!(add instanceof HTMLButtonElement)) throw new Error('missing add language')
    if (add.getAttribute('aria-expanded') !== 'true') {
      add.click()
      flushSync()
    }
  }

  function chooseLanguage(value: string) {
    const label = languageLabel(value)
    let menuItem = [...target.querySelectorAll('.legend-panel .lang-item')].find(el => {
      if (!(el instanceof HTMLButtonElement) || el.disabled) return false
      return el.textContent?.replace(/\s+/g, ' ').trim() === label
    })
    if (!(menuItem instanceof HTMLButtonElement)) {
      openAddLanguageMenu()
      menuItem = [...target.querySelectorAll('.legend-panel .lang-item')].find(el => {
        if (!(el instanceof HTMLButtonElement) || el.disabled) return false
        return el.textContent?.replace(/\s+/g, ' ').trim() === label
      })
    }
    if (!(menuItem instanceof HTMLButtonElement)) throw new Error(`missing language ${label}`)
    menuItem.click()
    flushSync()
  }

  function languageMenuLabels(): string[] {
    return [...target.querySelectorAll('.legend-panel .lang-item')]
      .map(el => el.textContent?.replace(/\s+/g, ' ').trim())
      .filter((text): text is string => Boolean(text))
  }

  it('adds Ukrainian after the language is chosen', async () => {
    await open(keymapOf(['default']))
    openAddLanguageMenu()
    expect(languageMenuLabels()).toEqual([
      'Russian',
      'Ukrainian',
      'German',
      'French',
      'Polish',
      'Spanish'
    ])
    chooseLanguage('uk')
    expect(openLayoutId(editor.hostLegend)).toBe('system-ua')
    const flags = [...target.querySelectorAll('.legend-panel .lang-flag img')].map(el =>
      el.getAttribute('src')
    )
    expect(flags).toEqual(['/flags/us.svg', '/flags/ua.svg'])
    const triggers = [...target.querySelectorAll('.legend-panel .profile-trigger')]
      .filter(el => !el.closest('.lang-head.narrow'))
      .map(el => el.getAttribute('aria-label'))
    expect(triggers).toEqual(['Profile English: System', 'Profile Ukrainian: System'])
    const ukrainian = [...target.querySelectorAll('.legend-panel .profile-trigger')].find(
      el => el.getAttribute('aria-label')?.startsWith('Profile Ukrainian')
    )
    if (!(ukrainian instanceof HTMLButtonElement)) throw new Error('missing Ukrainian profile')
    ukrainian.click()
    flushSync()
    const items = [...target.querySelectorAll('.profile-list .profile-item')].map(
      el => el.textContent?.trim()
    )
    expect(items[0]).toBe('System')
    expect(items).toEqual([
      'System',
      'macOS',
      'legacy',
      'winkeys',
      'typewriter',
      'phonetic',
      'homophonic'
    ])
    const copies = [...target.querySelectorAll('.profile-list .profile-icon')].filter(
      el => el.getAttribute('title') === 'Copy profile'
    )
    expect(copies).toHaveLength(items.length)
    expect(target.querySelector('.legend-panel .lang-list')).toBeNull()
    const flag = target.querySelector('.legend-panel button.lang-flag')
    if (!(flag instanceof HTMLButtonElement)) throw new Error('missing language flag')
    flag.click()
    flushSync()
    expect(languageMenuLabels()).toEqual([
      'Ukrainian',
      'Russian',
      'German',
      'French',
      'Polish',
      'Spanish',
      'Remove language'
    ])
  })

  it('adds German after Ukrainian and lists its system variants', async () => {
    await open(keymapOf(['default']))
    chooseLanguage('uk')
    const addAgain = target.querySelector('.legend-panel .add-language')
    if (!(addAgain instanceof HTMLButtonElement)) throw new Error('missing second add language')
    addAgain.click()
    flushSync()
    expect(languageMenuLabels()).toEqual([
      'Russian',
      'German',
      'French',
      'Polish',
      'Spanish'
    ])
    chooseLanguage('de')
    expect(openLayoutId(editor.hostLegend)).toBe('system-de')
    const flags = [...target.querySelectorAll('.legend-panel .lang-flag img')].map(el =>
      el.getAttribute('src')
    )
    expect(flags).toEqual(['/flags/us.svg', '/flags/ua.svg', '/flags/de.svg'])
    const german = [...target.querySelectorAll('.legend-panel .profile-trigger')].find(
      el => el.getAttribute('aria-label')?.startsWith('Profile German')
    )
    if (!(german instanceof HTMLButtonElement)) throw new Error('missing German profile')
    german.click()
    flushSync()
    const items = [...target.querySelectorAll('.profile-list .profile-item')].map(
      el => el.textContent?.trim()
    )
    expect(items[0]).toBe('System')
    expect(items).toContain('nodeadkeys')
    expect(items).toContain('neo')
    expect(items.at(-1)).toBe('noted')
    const copies = [...target.querySelectorAll('.profile-list .profile-icon')].filter(
      el => el.getAttribute('title') === 'Copy profile'
    )
    expect(copies).toHaveLength(items.length)
    const germanFlag = [...target.querySelectorAll('.legend-panel button.lang-flag')].find(
      el => el.getAttribute('aria-label') === 'Language German'
    )
    if (!(germanFlag instanceof HTMLButtonElement)) throw new Error('missing German flag')
    germanFlag.click()
    flushSync()
    expect(languageMenuLabels()).toEqual([
      'German',
      'Russian',
      'French',
      'Polish',
      'Spanish',
      'Remove language'
    ])
    chooseLanguage('__remove__')
    expect(
      [...target.querySelectorAll('.legend-panel .lang-flag img')].map(el => el.getAttribute('src'))
    ).toEqual(['/flags/us.svg', '/flags/ua.svg'])
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

  const importedXkb = `
    xkb_symbols "basic" {
      name[Group1]= "Imported EN";
      key <AD03> {[ Greek_alpha, Greek_ALPHA, at, numbersign ]};
    };
  `

  function englishPair(): string {
    const row = target.querySelector('.legend-panel tbody tr')
    const cells = row ? [...row.querySelectorAll('td')] : []
    return cells[0]?.textContent?.replace(/\s+/g, '') ?? ''
  }

  async function assignImportedFile() {
    const english = [...target.querySelectorAll('.legend-panel .profile-trigger')].find(
      el => el.getAttribute('aria-label')?.startsWith('Profile English')
    )
    if (!(english instanceof HTMLButtonElement)) throw new Error('missing English profile')
    english.click()
    flushSync()
    const importItem = [...target.querySelectorAll('.profile-action')].find(
      el => el.textContent?.includes('Import xkb')
    )
    if (!(importItem instanceof HTMLButtonElement)) throw new Error('missing import item')
    importItem.click()
    flushSync()
    const input = target.querySelector('input[type="file"][aria-label="xkb file"]')
    if (!(input instanceof HTMLInputElement)) throw new Error('missing file input')
    const file = new File([importedXkb], 'imported.xkb', { type: 'text/plain' })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(async () => {
      expect(editor.activeProfileId('en')).toMatch(/^user:/)
      expect(await loadUserHostLayouts()).toHaveLength(1)
    })
    flushSync()
  }

  it('imports an xkb file into the column and keeps it after reload', async () => {
    await clearHostLayoutStore()
    await open(keymapOf(['default']))
    expect(englishPair()).toBe('eE')

    await assignImportedFile()
    expect(editor.activeProfileId('en')).toMatch(/^user:/)
    expect(editor.userLayouts[0]?.origin).toEqual({
      from: 'xkb',
      fileName: 'imported.xkb',
      section: 'basic'
    })
    expect(englishPair()).toBe('αΑ')

    if (view) unmount(view)
    view = undefined
    editor.resetForTests()
    await editor.restoreHostProfiles()
    await editor.selectKeyboard({
      source: 'local',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: keymapOf(['default'])
    })
    view = mount(HostLegendPicker, { target })
    flushSync()
    expect(editor.activeProfileId('en')).toMatch(/^user:/)
    expect(editor.userLayouts[0]?.origin).toEqual({
      from: 'xkb',
      fileName: 'imported.xkb',
      section: 'basic'
    })
    expect(englishPair()).toBe('αΑ')
  })

  it('imports a klc file into the column', async () => {
    await clearHostLayoutStore()
    await open(keymapOf(['default']))
    expect(englishPair()).toBe('eE')

    const english = [...target.querySelectorAll('.legend-panel .profile-trigger')].find(
      el => el.getAttribute('aria-label')?.startsWith('Profile English')
    )
    if (!(english instanceof HTMLButtonElement)) throw new Error('missing English profile')
    english.click()
    flushSync()
    const importItem = [...target.querySelectorAll('.profile-action')].find(
      el => el.textContent?.includes('Import klc')
    )
    if (!(importItem instanceof HTMLButtonElement)) throw new Error('missing klc import')
    importItem.click()
    flushSync()
    const input = target.querySelector('input[type="file"][aria-label="klc file"]')
    if (!(input instanceof HTMLInputElement)) throw new Error('missing klc file input')
    const bytes = encodeKlc(
      [
        'KBD\tTest\t"Imported KLC"',
        'LOCALEID\t"00000409"',
        'SHIFTSTATE',
        '',
        '0',
        '1',
        '2',
        '',
        'LAYOUT',
        '',
        '12\tE\t1\t03b2\t0392\t-1'
      ].join('\r\n')
    )
    const file = new File([bytes], 'imported.klc')
    const transfer = new DataTransfer()
    transfer.items.add(file)
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(async () => {
      expect(editor.activeProfileId('en')).toMatch(/^user:/)
      expect(englishPair()).toBe('βΒ')
    })
    expect(editor.userLayouts[0]?.origin).toEqual({
      from: 'klc',
      fileName: 'imported.klc',
      role: 'single'
    })
    expect(editor.userLayouts[0]?.name).toBe('Imported KLC')
  })

  it('lets the user pick a section when the file has several', async () => {
    await clearHostLayoutStore()
    await open(keymapOf(['default']))
    const english = [...target.querySelectorAll('.legend-panel .profile-trigger')].find(
      el => el.getAttribute('aria-label')?.startsWith('Profile English')
    )
    if (!(english instanceof HTMLButtonElement)) throw new Error('missing English profile')
    english.click()
    flushSync()
    const importItem = [...target.querySelectorAll('.profile-action')].find(
      el => el.textContent?.includes('Import xkb')
    )
    if (!(importItem instanceof HTMLButtonElement)) throw new Error('missing import item')
    importItem.click()
    flushSync()

    const textarea = target.querySelector('textarea[aria-label="xkb text"]')
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error('missing paste field')
    textarea.value = `
      xkb_symbols "one" {
        name[Group1]= "First";
        key <AD03> {[ a, A, at, numbersign ]};
      };
      xkb_symbols "two" {
        name[Group1]= "Second";
        key <AD03> {[ Greek_alpha, Greek_ALPHA, at, numbersign ]};
      };
    `
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    const select = target.querySelector('select[aria-label="xkb section"]')
    if (!(select instanceof HTMLSelectElement)) throw new Error('missing section select')
    expect([...select.options].map(option => option.textContent)).toEqual(['First', 'Second'])
    select.value = 'two'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    flushSync()
    const confirm = [...target.querySelectorAll('.profile-import button')].find(
      el => el.textContent?.trim() === 'Import'
    )
    if (!(confirm instanceof HTMLButtonElement)) throw new Error('missing import confirm')
    confirm.click()
    await vi.waitFor(() => {
      expect(editor.userLayouts[0]?.origin).toEqual({
        from: 'xkb',
        fileName: 'paste',
        section: 'two'
      })
    })
    flushSync()
    expect(editor.userLayouts[0]?.origin).toEqual({
      from: 'xkb',
      fileName: 'paste',
      section: 'two'
    })
    expect(englishPair()).toBe('αΑ')
  })

  it('remembers a column set and switches back to it', async () => {
    const keymap = keymapOf(['Base'])
    await open(keymap)
    const remember = () => {
      const button = target.querySelector('.legend-panel .remember')
      if (!(button instanceof HTMLButtonElement)) throw new Error('missing remember')
      return button
    }
    const chipLabels = () =>
      [...target.querySelectorAll('.legend-panel .chip .show')].map(el =>
        [...el.querySelectorAll('.name')].map(name => name.textContent?.trim()).join(' + ')
      )

    remember().click()
    await vi.waitFor(() => {
      expect(chipLabels()).toEqual(['System'])
    })
    expect(remember().disabled).toBe(true)

    await editor.commitHostMap(addHostLanguage(editor.hostLegend, 'ru'))
    flushSync()
    expect(target.querySelector('.legend-panel .chip.on')).toBeNull()
    expect(remember().disabled).toBe(false)

    remember().click()
    await vi.waitFor(() => {
      expect(chipLabels()).toEqual(['System', 'System + System'])
    })
    const second = target.querySelectorAll('.legend-panel .chip .show')[1]
    expect(
      [...(second?.querySelectorAll('img') ?? [])].map(img => img.getAttribute('src'))
    ).toEqual(['/flags/us.svg', '/flags/ru.svg'])
    expect(second?.getAttribute('aria-label')).toBe('English System + Russian System')

    const first = target.querySelector('.legend-panel .chip .show')
    if (!(first instanceof HTMLButtonElement)) throw new Error('missing assembly')
    first.click()
    await vi.waitFor(() => {
      expect(editor.hostLegend.columns.map(column => column.language)).toEqual(['en'])
    })
    flushSync()
    expect(target.querySelector('.legend-panel .chip.on .show')?.textContent?.trim()).toBe('System')

    const forget = target.querySelector(
      '.legend-panel [aria-label="Forget English System + Russian System"]'
    )
    if (!(forget instanceof HTMLButtonElement)) throw new Error('missing forget')
    forget.click()
    await vi.waitFor(() => {
      expect(chipLabels()).toEqual(['System'])
    })

    await editor.selectKeyboard({
      source: 'local',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap
    })
    flushSync()
    await vi.waitFor(() => {
      expect(chipLabels()).toEqual(['System'])
    })
  })
})
