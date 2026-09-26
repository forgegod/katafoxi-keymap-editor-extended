import {
  hostSymbolShelves,
  SYSTEM_US_LAYOUT_ID,
  hostLayout,
  type HostLanguageId
} from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editor } from '../editor.svelte.js'
import { clearHostLayoutStore } from '../host-layout-store'
import HostSymbolCatalog from './HostSymbolCatalog.svelte'
import HostSymbolPicker, {
  hostSymbolExpandedByLanguage,
  hostSymbolPickerFrame
} from './HostSymbolPicker.svelte'
import Harness from './Keyboard/Keys/KeyHarness.svelte'

function stackRows(): HTMLButtonElement[] {
  return [...document.querySelectorAll('.layer-stack button.layer-slot')].filter(
    (el): el is HTMLButtonElement => el instanceof HTMLButtonElement
  )
}

function catalog(): HTMLElement | null {
  return document.querySelector('[role="dialog"][aria-label="Host symbol catalog"]')
}

function openDecodeCell(levelLabel = 'Edit en level 0'): HTMLButtonElement {
  const row = stackRows()[0]
  row.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true })
  )
  flushSync()
  const slot = [...document.querySelectorAll('.legend-decode .row.current button.slot')].find(
    el => el.getAttribute('aria-label') === levelLabel
  )
  if (!(slot instanceof HTMLButtonElement)) {
    throw new Error(`missing cell ${levelLabel}`)
  }
  slot.click()
  flushSync()
  return slot
}

describe('HostSymbolPicker', () => {
  let target: HTMLDivElement
  let modalRoot: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  beforeEach(async () => {
    editor.resetForTests()
    hostSymbolExpandedByLanguage.clear()
    hostSymbolPickerFrame.geometry = null
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
    modalRoot?.remove()
    target?.remove()
    editor.resetForTests()
    hostSymbolExpandedByLanguage.clear()
    hostSymbolPickerFrame.geometry = null
    vi.restoreAllMocks()
  })

  function mountPicker(
    language: HostLanguageId = 'en',
    handlers: { onPick?: (text: string) => void } = {}
  ) {
    const onPick = handlers.onPick ?? vi.fn()
    view = mount(HostSymbolPicker, {
      target,
      props: {
        language,
        onPick
      }
    })
    flushSync()
    return { onPick }
  }

  it('renders open shelves and keeps collapsed glyphs out of the tree until expanded', () => {
    mountPicker('en')
    const dialog = catalog()
    expect(dialog).toBeInstanceOf(HTMLElement)

    const shelves = hostSymbolShelves('en')
    const openIds = shelves.filter(shelf => shelf.open).map(shelf => shelf.id)
    const collapsed = shelves.find(shelf => !shelf.open)
    expect(collapsed).toBeDefined()
    if (!collapsed) throw new Error('expected a collapsed shelf')

    for (const id of openIds) {
      expect(dialog?.querySelector(`[data-shelf="${id}"][data-open="true"]`)).toBeInstanceOf(
        HTMLElement
      )
    }

    const sample = collapsed.entries[0]
    expect(sample).toBeDefined()
    const label = sample.glyph ? `${sample.glyph} ${sample.keysym}` : sample.keysym
    expect(
      dialog?.querySelector(`button.glyph[aria-label="${CSS.escape(label)}"]`)
    ).toBeNull()

    const toggle = dialog?.querySelector(
      `[data-shelf="${collapsed.id}"] .shelf-toggle`
    ) as HTMLButtonElement | null
    expect(toggle).toBeInstanceOf(HTMLButtonElement)
    toggle?.click()
    flushSync()

    expect(
      dialog?.querySelector(`button.glyph[aria-label="${CSS.escape(label)}"]`)
    ).toBeInstanceOf(HTMLButtonElement)
  })

  it('picks a glyph value and a modifier keysym name', () => {
    const { onPick } = mountPicker('en')
    const dialog = catalog()
    const glyph = dialog?.querySelector('button.glyph[aria-label="a a"]')
    expect(glyph).toBeInstanceOf(HTMLButtonElement)
    ;(glyph as HTMLButtonElement).click()
    flushSync()
    expect(onPick).toHaveBeenCalledWith('a')

    const noSymbol = dialog?.querySelector('button.glyph[aria-label="NoSymbol"]')
    expect(noSymbol).toBeInstanceOf(HTMLButtonElement)
    ;(noSymbol as HTMLButtonElement).click()
    flushSync()
    expect(onPick).toHaveBeenCalledWith('NoSymbol')
  })

  it('keeps an expanded collapsed shelf after remount', () => {
    mountPicker('en')
    const collapsed = hostSymbolShelves('en').find(shelf => !shelf.open)
    expect(collapsed).toBeDefined()
    if (!collapsed) throw new Error('expected a collapsed shelf')
    const toggle = catalog()?.querySelector(
      `[data-shelf="${collapsed.id}"] .shelf-toggle`
    ) as HTMLButtonElement
    toggle.click()
    flushSync()
    if (view) unmount(view)
    view = undefined
    flushSync()

    mountPicker('en')
    expect(
      catalog()?.querySelector(`[data-shelf="${collapsed.id}"][data-open="true"]`)
    ).toBeInstanceOf(HTMLElement)
  })
})

describe('LegendDecodeCard host symbol catalog', () => {
  let target: HTMLDivElement
  let modalRoot: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined
  let catalogView: ReturnType<typeof mount> | undefined

  beforeEach(async () => {
    editor.resetForTests()
    hostSymbolExpandedByLanguage.clear()
    hostSymbolPickerFrame.geometry = null
    await clearHostLayoutStore()
    target = document.createElement('div')
    document.body.appendChild(target)
    modalRoot = document.createElement('div')
    modalRoot.id = 'modal-root'
    target.appendChild(modalRoot)
    catalogView = mount(HostSymbolCatalog, {
      target,
      props: { showToggle: false }
    })
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    if (catalogView) unmount(catalogView)
    catalogView = undefined
    modalRoot?.remove()
    target?.remove()
    editor.resetForTests()
    hostSymbolExpandedByLanguage.clear()
    hostSymbolPickerFrame.geometry = null
  })

  function openKey(code = 'A') {
    view = mount(Harness, {
      target,
      props: {
        value: '&kp',
        params: [{ value: code, params: [] }],
        layerBindings: [{ value: '&kp', params: [{ value: code, params: [] }] }]
      }
    })
    flushSync()
  }

  it('opens a catalog dialog from a level cell without a text field', async () => {
    openKey('A')
    await editor.selectLanguageProfile('en', SYSTEM_US_LAYOUT_ID)
    flushSync()
    openDecodeCell('Edit en level 0')

    expect(catalog()).toBeInstanceOf(HTMLElement)
    expect(document.querySelector('.cell-input')).toBeNull()
    expect(document.querySelector('[role="dialog"].legend-decode')).toBeInstanceOf(HTMLElement)
    expect(editor.hostSymbolEditTarget).toEqual({ language: 'en', zmk: 'A', level: 0 })
  })

  it('applies an open-shelf glyph through setHostKeyLevel and keeps the catalog open', async () => {
    openKey('A')
    await editor.selectLanguageProfile('en', SYSTEM_US_LAYOUT_ID)
    flushSync()
    openDecodeCell('Edit en level 0')

    const glyph = catalog()?.querySelector('button.glyph[aria-label="b b"]')
    expect(glyph).toBeInstanceOf(HTMLButtonElement)
    expect((glyph as HTMLButtonElement).disabled).toBe(false)
    ;(glyph as HTMLButtonElement).click()
    flushSync()
    await vi.waitFor(() => {
      const layoutId = editor.activeProfileId('en')
      expect(hostLayout(layoutId)?.byZmk.get('A')?.keysyms[0]).toBe('b')
    })
    expect(catalog()).toBeInstanceOf(HTMLElement)
  })

  it('clears a level when NoSymbol is chosen from modifiers', async () => {
    openKey('A')
    await editor.selectLanguageProfile('en', SYSTEM_US_LAYOUT_ID)
    flushSync()
    await editor.setHostKeyLevel('en', 'A', 1, 'B')
    flushSync()

    openDecodeCell('Edit en level 1')
    const noSymbol = catalog()?.querySelector('button.glyph[aria-label="NoSymbol"]')
    expect(noSymbol).toBeInstanceOf(HTMLButtonElement)
    ;(noSymbol as HTMLButtonElement).click()
    flushSync()
    await vi.waitFor(() => {
      const layoutId = editor.activeProfileId('en')
      expect(hostLayout(layoutId)?.byZmk.get('A')?.keysyms[1]).toBe('NoSymbol')
    })
    expect(catalog()).toBeInstanceOf(HTMLElement)
  })

  it('closes the catalog on Escape and ends the host-edit session', async () => {
    openKey('A')
    await editor.selectLanguageProfile('en', SYSTEM_US_LAYOUT_ID)
    flushSync()
    openDecodeCell('Edit en level 0')
    expect(catalog()).toBeInstanceOf(HTMLElement)
    expect(editor.hostEditSession).not.toBeNull()

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    flushSync()
    await vi.waitFor(() => expect(catalog()).toBeNull())

    expect(editor.hostSymbolCatalogOpen).toBe(false)
    expect(editor.hostEditSession).toBeNull()
    expect(document.querySelector('.legend-decode')).toBeNull()
  })
})
