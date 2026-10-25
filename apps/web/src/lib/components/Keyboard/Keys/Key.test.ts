import {
  encodeKeyBinding,
  parseKeyBinding,
  addHostLanguage,
  assignHostLanguageLayout,
  hostLayout,
  registerHostLayout,
  unregisterHostLayout,
  withHostKey,
  toggleHostLanguage,
  type HostLegendView,
  type KeyBindingNode
} from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editor } from '../../../editor.svelte.js'
import { resetLegendDecodeActive } from '../../../legend-decode-active'
import HostSymbolCatalog from '../../HostSymbolCatalog.svelte'
import Harness from './KeyHarness.svelte'

const typicalKey = {
  position: { x: 0, y: 0 },
  size: { u: 1, h: 1 },
  value: '&kp',
  params: [{ value: 'A', params: [] }]
}

function editorDialog(): HTMLElement | null {
  return document.querySelector('[role=dialog][aria-label="Edit key"]')
}

function clickKey() {
  const slot = document.querySelector('.key .layer-slot')
  if (!(slot instanceof HTMLElement)) throw new Error('missing .layer-slot')
  slot.click()
  flushSync()
}

function clickChoice(root: ParentNode, label: string, selector = '.key-editor-choice') {
  const button = [...root.querySelectorAll(selector)].find(
    el => (el.textContent ?? '').trim() === label
  )
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`missing choice ${label}`)
  }
  button.click()
  flushSync()
}

function clickApply() {
  const apply = document.querySelector('[aria-label=Apply]')
  if (!(apply instanceof HTMLButtonElement)) throw new Error('missing Apply')
  apply.click()
  flushSync()
}

function encodedUpdate(onUpdate: ReturnType<typeof vi.fn>): string {
  expect(onUpdate).toHaveBeenCalledOnce()
  return encodeKeyBinding(onUpdate.mock.calls[0][2] as KeyBindingNode)
}

function stackRows(): HTMLButtonElement[] {
  return [...document.querySelectorAll('.layer-stack button.layer-slot')].filter(
    (el): el is HTMLButtonElement => el instanceof HTMLButtonElement
  )
}

const threeLayerBindings: KeyBindingNode[] = [
  { value: '&kp', params: [{ value: 'A', params: [] }] },
  { value: '&kp', params: [{ value: 'B', params: [] }] },
  { value: '&kp', params: [{ value: 'C', params: [] }] }
]

describe('Key click editor', () => {
  let target: HTMLDivElement
  let modalRoot: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined
  let catalogView: ReturnType<typeof mount> | undefined

  beforeEach(() => {
    editor.resetForTests()
    resetLegendDecodeActive()
    target = document.createElement('div')
    document.body.appendChild(target)
    modalRoot = document.createElement('div')
    modalRoot.id = 'modal-root'
    // Keep the portal inside the Svelte mount so delegated clicks reach the dialog.
    target.appendChild(modalRoot)
    catalogView = mount(HostSymbolCatalog, {
      target
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    if (view) unmount(view)
    view = undefined
    if (catalogView) unmount(catalogView)
    catalogView = undefined
    modalRoot?.remove()
    target?.remove()
    editor.resetForTests()
    resetLegendDecodeActive()
    unregisterHostLayout('user:unicode-en')
    unregisterHostLayout('user:unicode-national')
  })

  function open(
    props: {
      onUpdate?: ReturnType<typeof vi.fn>
      value?: string
      params?: Array<{ value?: string | number; params?: unknown[] }>
      layerBindings?: KeyBindingNode[]
      layerView?: { shown: number[]; layer0Raw: boolean }
      hostView?: HostLegendView
      comboPeekLayer?: number | null
    } = {}
  ) {
    const onUpdate = props.onUpdate ?? vi.fn()
    view = mount(Harness, {
      target,
      props: {
        ...typicalKey,
        value: props.value ?? typicalKey.value,
        params: props.params ?? typicalKey.params,
        layerBindings: props.layerBindings,
        layerView: props.layerView,
        hostView: props.hostView,
        comboPeekLayer: props.comboPeekLayer,
        onUpdate
      }
    })
    flushSync()
    return onUpdate
  }

  it.each(['cancel', 'apply'])('keeps built-in help out of the real session and history before %s', ending => {
    const binding = parseKeyBinding('&uc UC_DE_AE')
    editor.baselineKeymap = { layer_names: ['base'], layers: [[binding]] }
    editor.draftKeymap = editor.baselineKeymap
    editor.updateKeymap({ ...editor.draftKeymap, layers: [[parseKeyBinding('&kp B')]] })
    editor.undo()
    expect(editor.canRedo).toBe(true)
    const snapshot = () => JSON.stringify({
      draft: editor.draftKeymap, baseline: editor.baselineKeymap,
      undo: editor.undoStack, redo: editor.redoStack,
      source: editor.clipboardOriginalSource, layers: editor.layerOperationSnapshot,
      holdTaps: editor._holdTapsOnNextUpdate, rgb: editor._rgbLayerRecipeOnNextUpdate,
      host: editor.hostLegend, dirty: editor.isDirty
    })
    const before = snapshot()
    const onUpdate = open({ value: String(binding.value), params: binding.params })
    const opened = vi.spyOn(window, 'open').mockReturnValue(null)
    try {
      clickKey()
      for (const changed of [false, true]) {
        if (changed) {
          const field = editorDialog()!.querySelector<HTMLInputElement>('[aria-label="Normal Unicode character or code point"]')!
          field.value = '€'
          field.dispatchEvent(new Event('input', { bubbles: true }))
          flushSync()
        }
        const expected = changed ? '&uc 0x20AC 0xC4' : '&uc UC_DE_AE'
        for (const [code, url] of [
          ['&uc', 'https://github.com/urob/zmk-unicode/blob/main/README.md'],
          ['&inc_dec_kp', 'https://zmk.dev/docs/features/encoders#rotation'],
          ['&studio_unlock', 'https://zmk.dev/docs/keymaps/behaviors/studio-unlock']
        ]) {
          const chip = [...editorDialog()!.querySelectorAll('.key-editor-chip')].find(el => el.textContent?.trim() === code)!
          expect(chip.getAttribute('title')).toContain('Ctrl+click: docs')
          for (const modifier of ['ctrlKey', 'metaKey']) {
            opened.mockClear()
            chip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, [modifier]: true }))
            flushSync()
            expect(opened).toHaveBeenCalledOnce()
            expect(opened).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer')
            expect(editorDialog()!.querySelector('.binding')?.textContent).toBe(expected)
            expect(onUpdate).not.toHaveBeenCalled()
            expect(snapshot()).toBe(before)
          }
        }
      }
      if (ending === 'apply') {
        clickApply()
        expect(encodedUpdate(onUpdate)).toBe('&uc 0x20AC 0xC4')
      } else {
        editorDialog()!.querySelector<HTMLButtonElement>('[aria-label="Cancel"]')!.click()
        flushSync()
        expect(onUpdate).not.toHaveBeenCalled()
        clickKey()
        expect(editorDialog()!.querySelector('.binding')?.textContent).toBe('&uc UC_DE_AE')
      }
      // This harness reports Apply via onUpdate; help must never publish globally.
      expect(snapshot()).toBe(before)
    } finally {
      opened.mockRestore()
    }
  })

  it('propagates the selected English compatibility into the Unicode picker', () => {
    const binding = parseKeyBinding('&uc UC_DE_AE')
    const onUpdate = open({ value: String(binding.value), params: binding.params })
    clickKey()
    const status = editorDialog()?.querySelector('[role="status"][aria-label="Unicode host-layout compatibility"]')
    expect(status?.textContent).toContain('Compatible English layout')
    expect(status?.textContent).toContain('editor-selected English profile')
    clickApply()
    expect(encodedUpdate(onUpdate)).toBe('&uc UC_DE_AE')
  })

  it('refreshes only the selected English table, independent of national visibility and cached glyphs', () => {
    const us = hostLayout('system-us')!
    const changed = withHostKey(us, 'N1', 0, 'exclam')!
    const english = { id: 'user:unicode-en', language: 'en', name: 'English test', flag: '', origin: 'user' } as const
    const national = { id: 'user:unicode-national', language: 'de', name: 'National test', flag: '', origin: 'user' } as const
    registerHostLayout(english, { ...us, id: english.id })
    registerHostLayout(national, { ...changed, id: national.id })
    editor.hostLegend = toggleHostLanguage(assignHostLanguageLayout(
      assignHostLanguageLayout(addHostLanguage(editor.hostLegend, 'de'), 'de', national.id),
      'en', english.id
    ), 'en')
    const before = JSON.stringify(editor.hostLegend)
    const binding = parseKeyBinding('&uc UC_DE_AE')
    const onUpdate = open({ value: String(binding.value), params: binding.params })
    clickKey()
    const status = () => editorDialog()?.querySelector('[aria-label="Unicode host-layout compatibility"]')?.textContent
    expect(status()).toContain('Compatible English layout')

    // Registry replacement under the same ID must invalidate the check. A
    // compatible national table and stale US glyphs cannot mask the base edit.
    registerHostLayout(national, { ...us, id: national.id })
    const byZmk = new Map(changed.byZmk)
    byZmk.set('N1', { ...byZmk.get('N1')!, glyphs: us.byZmk.get('N1')!.glyphs })
    registerHostLayout(english, { ...changed, id: english.id, byZmk })
    editor.hostLayoutRevision += 1
    flushSync()
    expect(status()).toContain('Incompatible English layout')
    expect(status()).toContain('N1: remapped; expected 1; found exclam')
    expect(onUpdate).not.toHaveBeenCalled()
    expect(JSON.stringify(editor.hostLegend)).toBe(before)
    editor.hostLegend = assignHostLanguageLayout(editor.hostLegend, 'en', 'system-us')
    flushSync()
    expect(status()).toContain('Compatible English layout')
    editor.hostLegend = assignHostLanguageLayout(editor.hostLegend, 'en', english.id)
    flushSync()
    expect(status()).toContain('Incompatible English layout')
    clickApply()
    expect(encodedUpdate(onUpdate)).toBe('&uc UC_DE_AE')
    expect(hostLayout(english.id)?.byZmk.get('N1')?.keysyms[0]).toBe('exclam')
    expect(hostLayout(national.id)?.byZmk.get('N1')?.keysyms[0]).toBe('1')
  })

  it.each(['missing English column', 'missing English table'])('keeps %s unavailable rather than using a national or default table', reason => {
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'de')
    if (reason === 'missing English column') {
      editor.hostLegend = { ...editor.hostLegend, columns: editor.hostLegend.columns.filter(column => column.language !== 'en') }
    } else {
      editor.hostLegend = { ...editor.hostLegend, columns: editor.hostLegend.columns.map(column => column.language === 'en' ? { ...column, layoutId: 'user:unicode-missing' } : column) }
    }
    const before = JSON.stringify(editor.hostLegend)
    const binding = parseKeyBinding('&uc UC_EXTERNAL_NAME')
    const onUpdate = open({ value: String(binding.value), params: binding.params })
    clickKey()
    expect(editorDialog()?.querySelector('[role="status"][aria-label="Unicode host-layout compatibility"]')?.textContent).toContain('English layout unavailable')
    clickApply()
    expect(encodedUpdate(onUpdate)).toBe('&uc UC_EXTERNAL_NAME')
    expect(JSON.stringify(editor.hostLegend)).toBe(before)
  })

  it.each(['incompatible', 'unavailable'])('keeps editing, Apply and Cancel usable with an %s English layout', state => {
    const english = { id: 'user:unicode-en', language: 'en', name: 'English test', flag: '', origin: 'user' } as const
    registerHostLayout(english, { ...withHostKey(hostLayout('system-us')!, 'A', 0, 'q')!, id: english.id })
    editor.hostLegend = assignHostLanguageLayout(editor.hostLegend, 'en', english.id)
    if (state === 'unavailable') unregisterHostLayout(english.id)
    const before = JSON.stringify(editor.hostLegend)
    const binding = parseKeyBinding('&uc UC_DE_AE')
    const onUpdate = open({ value: String(binding.value), params: binding.params })
    clickKey()
    const editNormal = (value: string) => {
      const field = editorDialog()!.querySelector<HTMLInputElement>('[aria-label="Normal Unicode character or code point"]')!
      field.value = value
      field.dispatchEvent(new Event('input', { bubbles: true }))
      flushSync()
    }
    expect(editorDialog()?.textContent).toContain('Warning only')
    editNormal('€')
    editorDialog()!.querySelector<HTMLButtonElement>('[aria-label="Cancel"]')!.click()
    flushSync()
    expect(onUpdate).not.toHaveBeenCalled()
    clickKey()
    expect(editorDialog()?.querySelector<HTMLInputElement>('[aria-label="Normal Unicode character or code point"]')?.value).toBe('U+00E4')
    editNormal('U+D800')
    expect(editorDialog()?.querySelector<HTMLButtonElement>('.key-editor-ok')?.disabled).toBe(true)
    editNormal('€')
    expect(editorDialog()?.querySelector<HTMLButtonElement>('.key-editor-ok')?.disabled).toBe(false)
    clickApply()
    expect(encodedUpdate(onUpdate)).toBe('&uc 0x20AC 0xC4')
    expect(JSON.stringify(editor.hostLegend)).toBe(before)
    expect(encodeKeyBinding(binding)).toBe('&uc UC_DE_AE')
  })

  it('washes an unpublished layer row and names the previous binding', () => {
    open()
    const binding = (code: string): KeyBindingNode => ({
      value: '&kp',
      params: [{ value: code, params: [] }]
    })
    editor.baselineKeymap = { layer_names: ['default'], layers: [[binding('A')]] }
    editor.draftKeymap = { layer_names: ['default'], layers: [[binding('M')]] }
    flushSync()

    const slot = document.querySelector('.key .layer-slot')
    expect(slot).toBeInstanceOf(HTMLElement)
    expect(slot?.classList.contains('unpublished')).toBe(true)
    expect(slot?.getAttribute('title')).toBe('Was &kp A')
  })

  it('guards layer operations for this key until its session closes or unmounts', async () => {
    open()
    clickKey()
    expect(editor.layerOperationBlocker?.()).toMatch(/key binding/)
    await unmount(view!)
    view = undefined
    expect(editor.layerOperationBlocker?.()).toBeNull()
  })

  it('guards drafts retained on another row even after the current row editor closes', () => {
    open({ layerBindings: threeLayerBindings })
    const rows = stackRows()
    rows[0].click()
    flushSync()
    clickChoice(document, 'X', '.key-editor-grid .key-editor-choice')
    rows[2].click()
    flushSync()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    flushSync()
    expect(editorDialog()).toBeNull()
    expect(editor.layerOperationBlocker()).toMatch(/key binding/)
    rows[0].click()
    flushSync()
    expect(document.querySelector('.binding')?.textContent).toBe('&kp X')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    flushSync()
    expect(editor.layerOperationBlocker()).toBeNull()
  })

  it('opens the editor on the Key slot with the code grid visible', () => {
    open()
    clickKey()

    const dialog = editorDialog()
    expect(dialog).toBeInstanceOf(HTMLElement)
    expect(dialog?.querySelector('.key-editor-grid')).toBeInstanceOf(HTMLElement)
    const keyChip = [...(dialog?.querySelectorAll('.key-editor-chip') ?? [])].find(el =>
      (el.textContent ?? '').trim().startsWith('Key')
    )
    if (keyChip) expect(keyChip.classList.contains('active')).toBe(true)
    expect(
      [...(dialog?.querySelectorAll('.key-editor-choice') ?? [])].some(
        el => (el.textContent ?? '').trim() === 'A'
      )
    ).toBe(true)
  })

  it('opens the editor when clicking ZMK legend .code inside the layer slot', () => {
    open({
      layerBindings: [
        { value: '&kp', params: [{ value: 'A', params: [] }] },
        { value: '&kp', params: [{ value: 'B', params: [] }] }
      ],
      layerView: { shown: [0, 1], layer0Raw: true }
    })
    const code = document.querySelector('.layer-slot .code')
    expect(code).toBeInstanceOf(HTMLElement)
    expect(code?.tagName).toBe('SPAN')
    code?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    flushSync()

    expect(editorDialog()).toBeInstanceOf(HTMLElement)
  })

  it('applies a picked key and closes the dialog', () => {
    const onUpdate = open()
    clickKey()
    clickChoice(document, 'B', '.key-editor-grid .key-editor-choice')
    clickApply()

    expect(encodedUpdate(onUpdate)).toBe('&kp B')
    expect(editorDialog()).toBeNull()
  })

  it('closes on Escape without applying', () => {
    const onUpdate = open()
    clickKey()
    expect(editorDialog()).toBeInstanceOf(HTMLElement)

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    flushSync()

    expect(onUpdate).not.toHaveBeenCalled()
    expect(editorDialog()).toBeNull()
    expect(document.querySelector('.legend-decode')).toBeNull()
  })

  it('closes on backdrop click without applying', () => {
    const onUpdate = open()
    clickKey()
    const backdrop = document.querySelector('.modal-wrapper')
    expect(backdrop).toBeInstanceOf(HTMLElement)
    backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    flushSync()

    expect(onUpdate).not.toHaveBeenCalled()
    expect(editorDialog()).toBeNull()
  })

  it('clears values when switching to &mt and blocks Enter until complete', () => {
    const onUpdate = open()
    clickKey()
    clickChoice(document, '&mt', '.key-editor-chip')

    const labels = [...document.querySelectorAll('.key-editor-section-label')].map(el =>
      (el.textContent ?? '').trim()
    )
    expect(labels).toEqual(expect.arrayContaining(['Modifier', 'Value']))
    const activeChoices = [...document.querySelectorAll('.key-editor-choice.active')].map(el =>
      (el.textContent ?? '').trim()
    )
    expect(activeChoices).not.toContain('A')
    expect(document.querySelector('.binding')?.textContent).toBe('&mt')

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    flushSync()

    expect(onUpdate).not.toHaveBeenCalled()
    expect(editorDialog()).toBeInstanceOf(HTMLElement)
  })

  it('selects BT_DISC with a documented profile index and applies the exact binding', () => {
    const onUpdate = open()
    clickKey()
    clickChoice(document, '&bt', '.key-editor-chip')

    const commandDescriptions = [...document.querySelectorAll('.key-editor-choice')].map(el =>
      el.getAttribute('title')
    )
    expect(commandDescriptions).toEqual(expect.arrayContaining([
      'Disconnect the connected inactive 0-indexed profile.',
      'Clear bond information for all Bluetooth profiles.'
    ]))
    clickChoice(document, 'DISC')
    expect([...document.querySelectorAll('.key-editor-choice')].map(el =>
      (el.textContent ?? '').trim()
    )).toContain('2')
    clickChoice(document, '2')
    clickApply()

    expect(encodedUpdate(onUpdate)).toBe('&bt BT_DISC 2')
    expect(editorDialog()).toBeNull()
  })

  it.each([
    '&reset WRAP(1,2) 3',
    '&custom WRAP(LC,2) 3',
    '&kt VENDOR_KEY(1,2)',
    '&out VENDOR_OUT 7',
    '&gresc WRAP(LC,2) 3',
    '&rgb_ug RGB_COLOR_HSB(10,20,30)'
  ])('previews the complete imported %s binding and applies it unchanged', binding => {
    const node = parseKeyBinding(binding)
    const onUpdate = open({ value: String(node.value), params: node.params })
    clickKey()
    expect(document.querySelector('.binding')?.textContent).toBe(binding)
    clickApply()
    expect(encodedUpdate(onUpdate)).toBe(binding)
  })

  it('stages Key Toggle through the key grid and hold controls before Apply', () => {
    const onUpdate = open()
    clickKey()
    clickChoice(document, '&kt', '.key-editor-chip')
    expect(document.querySelector('.binding')?.textContent).toBe('&kt')
    const blocked = document.querySelector<HTMLButtonElement>('.key-editor-ok')!
    blocked.click()
    flushSync()
    expect(onUpdate).not.toHaveBeenCalled()
    expect(editorDialog()).not.toBeNull()

    clickChoice(document, 'A', '.key-editor-grid .key-editor-choice')
    clickChoice(document, '⌃', '.key-editor-holds .key-editor-choice')
    expect(document.querySelector('.binding')?.textContent).toBe('&kt LC(A)')
    expect(onUpdate).not.toHaveBeenCalled()
    clickApply()
    expect(encodedUpdate(onUpdate)).toBe('&kt LC(A)')
    expect(editorDialog()).toBeNull()
  })

  it.each(['&gresc', '&soft_off', '&sys_reset', '&bootloader'])(
    'stages parameterless %s without a value grid and cancels without updating',
    behavior => {
      const onUpdate = open()
      clickKey()
      clickChoice(document, behavior, '.key-editor-chip')
      expect(document.querySelector('.binding')?.textContent).toBe(behavior)
      expect(document.querySelector('.key-editor-filter')).toBeNull()
      expect(document.querySelector('[data-slot-values]')).toBeNull()
      expect(document.querySelector('.key-editor-values')).toBeNull()
      expect(document.querySelector('.key-editor-ok')?.getAttribute('aria-label')).toBe('Apply')
      expect(onUpdate).not.toHaveBeenCalled()
      if (behavior === '&soft_off') {
        const note = document.querySelector('.key-editor-note')?.textContent ?? ''
        expect(note).toContain('CONFIG_ZMK_PM_SOFT_OFF=y')
        expect(note).toContain('requires hardware power-off support')
        expect(note).toContain('Wake-up depends on the keyboard hardware')
        expect(note).toContain('does not change firmware configuration or turn off hardware')
      }
      document.querySelector<HTMLButtonElement>('.key-editor-cancel')!.click()
      flushSync()
      expect(onUpdate).not.toHaveBeenCalled()
      expect(editorDialog()).toBeNull()
      clickKey()
      expect(document.querySelector('.binding')?.textContent).toBe('&kp A')
      clickChoice(document, behavior, '.key-editor-chip')
      clickApply()
      expect(encodedUpdate(onUpdate)).toBe(behavior)
    }
  )

  it('shows corrected output tooltips and applies OUT_NONE from the command grid', () => {
    const onUpdate = open()
    clickKey()
    clickChoice(document, '&out', '.key-editor-chip')
    for (const [label, description] of [
      ['OUT_USB', 'Prefer sending to USB.'],
      ['OUT_BLE', 'Prefer sending to the current Bluetooth profile.'],
      ['OUT_NONE', 'Prevent sending any output.']
    ]) {
      const choice = [...document.querySelectorAll('.key-editor-choice')].find(
        el => el.textContent?.trim() === label
      )
      expect(choice?.getAttribute('title')).toBe(description)
    }
    clickChoice(document, 'OUT_NONE')
    expect(onUpdate).not.toHaveBeenCalled()
    clickApply()
    expect(encodedUpdate(onUpdate)).toBe('&out OUT_NONE')
  })

  it('updates the binding preview when a hold wrap is toggled', () => {
    open({ params: [{ value: 'H', params: [] }] })
    clickKey()
    expect(document.querySelector('.binding')?.textContent).toBe('&kp H')

    clickChoice(document, '⇧', '.key-editor-holds .key-editor-choice')

    expect(document.querySelector('.binding')?.textContent).toBe('&kp LS(H)')
    const shift = [...document.querySelectorAll('.key-editor-holds .key-editor-choice')].find(
      el => (el.textContent ?? '').trim() === '⇧'
    )
    expect(shift?.classList.contains('active')).toBe(true)
  })

  it('does not toggle a hold that repeats the modifier key', () => {
    open({ params: [{ value: 'LCTRL', params: [] }] })
    clickKey()
    expect(document.querySelector('.binding')?.textContent).toBe('&kp LCTRL')

    const ctrl = [...document.querySelectorAll('.key-editor-holds .key-editor-choice')].find(
      el => (el.textContent ?? '').trim() === '⌃'
    )
    expect(ctrl).toBeInstanceOf(HTMLButtonElement)
    if (!(ctrl instanceof HTMLButtonElement)) throw new Error('missing ctrl hold')
    expect(ctrl.disabled).toBe(true)
    expect(ctrl.classList.contains('blocked')).toBe(true)
    expect(ctrl.classList.contains('active')).toBe(false)

    ctrl.click()
    flushSync()

    expect(document.querySelector('.binding')?.textContent).toBe('&kp LCTRL')
    expect(ctrl.classList.contains('active')).toBe(false)
  })

  it('applies a hold plus key as LC(A)', () => {
    const onUpdate = open()
    clickKey()
    clickChoice(document, '⌃', '.key-editor-holds .key-editor-choice')
    clickChoice(document, 'A', '.key-editor-grid .key-editor-choice')
    clickApply()

    expect(encodedUpdate(onUpdate)).toBe('&kp LC(A)')
    expect(editorDialog()).toBeNull()
  })

  it('edits layer 2 from the third composed row and leaves layer 0 unchanged', () => {
    const onUpdate = open({
      layerBindings: threeLayerBindings
    })
    const rows = stackRows()
    expect(rows).toHaveLength(3)
    const layer2 = rows.find(row => row.dataset.layer === '2')
    expect(layer2).toBeInstanceOf(HTMLButtonElement)
    layer2?.focus()
    expect(document.activeElement).toBe(layer2)
    layer2?.click()
    flushSync()

    expect(editorDialog()).toBeInstanceOf(HTMLElement)
    expect(document.querySelector('.binding')?.textContent).toBe('&kp C')
    clickChoice(document, 'D', '.key-editor-grid .key-editor-choice')
    clickApply()

    expect(onUpdate).toHaveBeenCalledOnce()
    const [, layerIndex, binding] = onUpdate.mock.calls[0]
    expect(layerIndex).toBe(2)
    expect(encodeKeyBinding(binding as KeyBindingNode)).toBe('&kp D')
  })

  it('opens a host decode card on composed row hover', () => {
    open({
      layerBindings: [
        { value: '&kp', params: [{ value: 'MINUS', params: [] }] },
        { value: '&kp', params: [{ value: 'B', params: [] }] }
      ]
    })
    const row = stackRows()[0]
    expect(row.getAttribute('title')).toBeNull()
    expect(row.querySelector('.keycap')?.getAttribute('title')).toBeNull()
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()

    const tip = document.querySelector('[role="tooltip"].legend-decode')
    expect(tip).toBeInstanceOf(HTMLElement)
    expect(tip?.id).toBe('legend-decode-0-0')
    expect(row.getAttribute('aria-describedby')).toBe(tip?.id)
    expect(tip?.textContent).toContain('KC_MINUS')
    expect(tip?.textContent).toContain('VK_OEM_MINUS')
    expect(tip?.textContent).toContain('KEY_MINUS')
    expect(tip?.querySelector('.id[title="ZMK keycode"]')?.textContent).toMatch(/ZMK/)
    expect(tip?.querySelector('.id[title="Windows virtual-key"]')?.textContent).toMatch(/Win/)
    expect(tip?.querySelector('.id[title="Linux evdev"]')?.textContent).toMatch(/Lin/)
    expect(
      [...(tip?.querySelectorAll('.row.flags .flag img') ?? [])].map(el => el.getAttribute('src'))
    ).toEqual(['/flags/us.svg'])
    expect(tip?.querySelector('.row.system')).toBeNull()
    expect(
      [...(tip?.querySelectorAll('.row.current .lang') ?? [])].map(lang =>
        [...lang.querySelectorAll('.slot')].map(slot => slot.textContent).join('')
      )
    ).toEqual(['-_ˬˬ'])
  })

  it('closes the hover decode peek as soon as the pointer leaves the row', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(document.querySelector('.legend-decode')).toBeInstanceOf(HTMLElement)

    row.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    flushSync()
    expect(document.querySelector('.legend-decode')).toBeNull()
  })

  it('keeps the hover decode peek read-only (no edit or revert controls)', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    const tip = document.querySelector('[role="tooltip"].legend-decode')
    expect(tip).toBeInstanceOf(HTMLElement)
    expect(tip?.querySelector('button.slot')).toBeNull()
    expect(tip?.querySelector('[data-host-revert]')).toBeNull()
    expect(tip?.querySelector('[data-host-accept]')).toBeNull()
    expect(tip?.classList.contains('peek')).toBe(true)
    expect(tip?.classList.contains('session')).toBe(false)
  })

  it('omits the Alt+click host hint on keys outside the host registry', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'BSPC', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    const tip = document.querySelector('[role="tooltip"].legend-decode')
    expect(tip).toBeInstanceOf(HTMLElement)
    expect(tip?.textContent).toContain('&kp BSPC')
    expect(tip?.textContent).toMatch(/Click row — ZMK/)
    expect(tip?.textContent).not.toMatch(/Alt\+click/)
    expect(tip?.querySelector('.row.current')).toBeNull()
  })

  it('does not open a host-edit session on Alt+click for non-host keys', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'BSPC', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true })
    )
    flushSync()
    expect(editor.hostEditSession).toBeNull()
    expect(editor.hostSymbolCatalogOpen).toBe(false)
    expect(document.querySelector('[role="dialog"].legend-decode')).toBeNull()
    expect(document.querySelector('[data-host-accept]')).toBeNull()
    expect(editorDialog()).toBeNull()
  })

  it('Alt+clicks a layer row to pin the decode card and open the host catalog', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true })
    )
    flushSync()

    expect(editorDialog()).toBeNull()
    expect(document.querySelector('[role="dialog"].legend-decode')).toBeInstanceOf(HTMLElement)
    expect(document.querySelector('[data-host-accept]')).toBeInstanceOf(HTMLElement)
    expect(document.querySelector('[data-host-cancel]')).toBeInstanceOf(HTMLElement)
    expect(editor.hostEditSession).toEqual({ keyIndex: 0, layer: 0 })
    expect(editor.hostSymbolCatalogOpen).toBe(true)
    expect(
      document.querySelector('[role="dialog"][aria-label="Host symbol catalog"]')
    ).toBeInstanceOf(HTMLElement)
  })

  it('keeps a host-edit session card when the pointer crosses another key', () => {
    const first = document.createElement('div')
    const second = document.createElement('div')
    target.appendChild(first)
    target.appendChild(second)
    const viewA = mount(Harness, {
      target: first,
      props: {
        ...typicalKey,
        keyIndex: 0,
        layerBindings: [{ value: '&kp', params: [{ value: 'H', params: [] }] }]
      }
    })
    const viewB = mount(Harness, {
      target: second,
      props: {
        ...typicalKey,
        keyIndex: 1,
        layerBindings: [{ value: '&kp', params: [{ value: 'I', params: [] }] }]
      }
    })
    flushSync()

    const rowA = first.querySelector('.layer-slot') as HTMLButtonElement
    const rowB = second.querySelector('.layer-slot') as HTMLButtonElement
    rowA.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true })
    )
    flushSync()
    expect(document.querySelector('#legend-decode-0-0')).toBeInstanceOf(HTMLElement)
    expect(document.querySelector('[data-host-accept]')).toBeInstanceOf(HTMLElement)

    rowB.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(document.querySelector('#legend-decode-0-0')).toBeInstanceOf(HTMLElement)
    expect(document.querySelector('#legend-decode-1-0')).toBeNull()
    expect(editor.hostEditSession?.keyIndex).toBe(0)

    unmount(viewA)
    unmount(viewB)
  })

  it('ends the host-edit session from Accept without opening the key editor', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true })
    )
    flushSync()
    document.querySelector('[data-host-accept]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    )
    flushSync()
    expect(editor.hostEditSession).toBeNull()
    expect(editor.hostSymbolCatalogOpen).toBe(false)
    expect(document.querySelector('.legend-decode')).toBeNull()
    expect(editorDialog()).toBeNull()
  })

  it('switches the hover decode peek to another layer on the same key immediately', () => {
    open({
      layerBindings: [
        { value: '&kp', params: [{ value: 'A', params: [] }] },
        { value: '&kp', params: [{ value: 'B', params: [] }] }
      ],
      layerView: { shown: [0, 1], layer0Raw: false }
    })
    const rows = stackRows()
    expect(rows.length).toBeGreaterThanOrEqual(2)
    rows[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(document.querySelector('#legend-decode-0-1')).toBeInstanceOf(HTMLElement)

    rows[0].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(document.querySelector('#legend-decode-0-1')).toBeNull()
    expect(document.querySelector('#legend-decode-0-0')).toBeInstanceOf(HTMLElement)
  })

  it('does not start a host-edit session from a hover peek click', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    const tip = document.querySelector('.legend-decode')
    expect(tip).toBeInstanceOf(HTMLElement)
    expect(tip?.textContent).toMatch(/Alt\+click/)

    tip?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    flushSync()
    expect(editorDialog()).toBeNull()
    expect(editor.hostEditSession).toBeNull()
    expect(document.querySelector('[role="dialog"].legend-decode')).toBeNull()
    expect(document.querySelector('[role="tooltip"].legend-decode')).toBeInstanceOf(HTMLElement)
  })

  it('arms a host level only after Alt+click opens the session', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true })
    )
    flushSync()
    expect(document.querySelector('[role="dialog"].legend-decode')).toBeInstanceOf(HTMLElement)
    expect(editor.hostSymbolEditTarget).toEqual({
      language: 'en',
      zmk: 'MINUS',
      level: 2
    })

    const slot = document.querySelector(
      '.legend-decode .row.current button.slot[data-level="0"]'
    )
    expect(slot).toBeInstanceOf(HTMLButtonElement)
    ;(slot as HTMLButtonElement).click()
    flushSync()

    expect(editorDialog()).toBeNull()
    expect(editor.hostSymbolEditTarget).toEqual({
      language: 'en',
      zmk: 'MINUS',
      level: 0
    })
    expect(document.querySelector('.legend-decode .cell-input')).toBeNull()
    expect(
      document.querySelector('[role="dialog"][aria-label="Host symbol catalog"]')
    ).toBeInstanceOf(HTMLElement)
  })

  it('unpins the decode card on Escape and returns focus to the row', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true })
    )
    flushSync()
    expect(document.querySelector('[role="dialog"].legend-decode')).toBeInstanceOf(HTMLElement)

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    flushSync()

    expect(editor.hostEditSession).toBeNull()
    expect(document.querySelector('.legend-decode')).toBeNull()
    expect(editorDialog()).toBeNull()
  })

  it('hides the decode card when the key editor opens', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(document.querySelector('.legend-decode')).toBeInstanceOf(HTMLElement)

    row.click()
    flushSync()

    expect(editorDialog()).toBeInstanceOf(HTMLElement)
    expect(document.querySelector('.legend-decode')).toBeNull()
  })

  it('dismisses a host-edit session on outside click instead of leaving a tooltip', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true })
    )
    flushSync()
    expect(document.querySelector('[role="dialog"].legend-decode')).toBeInstanceOf(HTMLElement)

    window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
    flushSync()
    expect(document.querySelector('.legend-decode')).toBeNull()
    expect(editor.hostEditSession).toBeNull()
  })

  it('closes the previous key decode card when another key opens one', () => {
    const first = document.createElement('div')
    const second = document.createElement('div')
    target.appendChild(first)
    target.appendChild(second)
    const viewA = mount(Harness, {
      target: first,
      props: {
        ...typicalKey,
        keyIndex: 0,
        layerBindings: [{ value: '&kp', params: [{ value: 'H', params: [] }] }]
      }
    })
    const viewB = mount(Harness, {
      target: second,
      props: {
        ...typicalKey,
        keyIndex: 1,
        layerBindings: [{ value: '&kp', params: [{ value: 'I', params: [] }] }]
      }
    })
    flushSync()

    const rowA = first.querySelector('.layer-slot') as HTMLButtonElement
    const rowB = second.querySelector('.layer-slot') as HTMLButtonElement
    rowA.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(document.querySelector('#legend-decode-0-0')).toBeInstanceOf(HTMLElement)

    rowB.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(document.querySelector('#legend-decode-0-0')).toBeNull()
    expect(document.querySelector('#legend-decode-1-0')).toBeInstanceOf(HTMLElement)

    unmount(viewA)
    unmount(viewB)
  })

  it('restores row clicks after the hover decode peek closes', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(document.querySelector('.legend-decode')).toBeInstanceOf(HTMLElement)

    row.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    flushSync()
    expect(document.querySelector('.legend-decode')).toBeNull()

    row.click()
    flushSync()
    expect(editorDialog()).toBeInstanceOf(HTMLElement)
  })

  it('opens the decode peek from keyboard focus and closes it on blur', () => {
    open({
      layerBindings: [{ value: '&kp', params: [{ value: 'MINUS', params: [] }] }]
    })
    const row = stackRows()[0]
    row.focus({ focusVisible: true } as FocusOptions)
    flushSync()
    expect(document.querySelector('[role="tooltip"].legend-decode')).toBeInstanceOf(HTMLElement)

    row.blur()
    flushSync()
    expect(document.querySelector('.legend-decode')).toBeNull()
  })

  it('opens the editor from a blank &trans composed row', () => {
    open({
      layerBindings: [
        { value: '&kp', params: [{ value: 'A', params: [] }] },
        { value: '&trans', params: [] }
      ]
    })
    const trans = stackRows().find(row => row.dataset.layer === '1')
    expect(trans).toBeInstanceOf(HTMLButtonElement)
    trans?.click()
    flushSync()

    expect(editorDialog()).toBeInstanceOf(HTMLElement)
    expect(document.querySelector('.binding')?.textContent).toBe('&trans')
  })

  it('keeps the first row draft when a second composed row is opened', () => {
    const onUpdate = open({
      layerBindings: threeLayerBindings
    })
    const rows = stackRows()
    rows[0].click()
    flushSync()
    expect(document.querySelector('.binding')?.textContent).toBe('&kp A')
    clickChoice(document, 'X', '.key-editor-grid .key-editor-choice')
    expect(document.querySelector('.binding')?.textContent).toBe('&kp X')

    rows[2].click()
    flushSync()
    expect(document.querySelector('.binding')?.textContent).toBe('&kp C')

    rows[0].click()
    flushSync()
    expect(document.querySelector('.binding')?.textContent).toBe('&kp X')
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('renders a compact ZMK legend for &bt on a stack row', () => {
    open({
      layerBindings: [{ value: '&bt', params: [{ value: 'BT_CLR', params: [] }] }]
    })
    expect(stackRows()[0].querySelector('.zmk-row')?.textContent?.trim()).toBe('&bt CLR')
  })

  it('highlights layer activators when hovering a stacked layer row', () => {
    open({
      layerBindings: [
        { value: '&mo', params: [{ value: '1', params: [] }] },
        { value: '&kp', params: [{ value: 'B', params: [] }] }
      ],
      layerView: { shown: [0, 1], layer0Raw: true }
    })
    const rows = stackRows()
    const layer0 = rows.find(row => row.dataset.layer === '0')
    const layer1 = rows.find(row => row.dataset.layer === '1')
    expect(layer0).toBeInstanceOf(HTMLButtonElement)
    expect(layer1).toBeInstanceOf(HTMLButtonElement)

    layer1?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    flushSync()
    expect(editor.legendHover).toEqual({ kind: 'layer', layer: 1 })
    expect(layer0?.querySelector('.zmk-row')?.classList.contains('legend-hit')).toBe(true)

    layer1?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    flushSync()
    expect(editor.legendHover).toBeNull()
    expect(layer0?.querySelector('.zmk-row')?.classList.contains('legend-hit')).toBe(false)
  })

  it('strikes the then-layer row on a key that holds the conditional layer', () => {
    editor.draftKeymap = {
      layer_names: ['base', 'lower', 'raise', 'adjust'],
      layers: [[{ value: '&none', params: [] }]],
      conditionalLayers: [{ id: 'when_lower_raise', ifLayers: [1, 2], thenLayer: 3 }]
    }
    open({
      layerBindings: [
        { value: '&mo', params: [{ value: '1', params: [] }] },
        { value: '&kp', params: [{ value: 'B', params: [] }] },
        { value: '&kp', params: [{ value: 'C', params: [] }] },
        { value: '&kp', params: [{ value: 'D', params: [] }] }
      ],
      layerView: { shown: [0, 1, 2, 3], layer0Raw: true }
    })
    const rows = stackRows()
    const held = rows.find(row => row.dataset.layer === '0')
    const shown = rows.find(row => row.dataset.layer === '3')
    const other = rows.find(row => row.dataset.layer === '1')
    expect(shown?.classList.contains('when-held')).toBe(true)
    expect(shown?.getAttribute('title')).toMatch(/Already held/)
    expect(shown?.getAttribute('aria-label')).toMatch(/already held/)
    expect(held?.classList.contains('when-held')).toBe(false)
    expect(other?.classList.contains('when-held')).toBe(false)
  })

  it('renders layer0 as a raw ZMK row when layer0Raw is set', () => {
    open({
      layerBindings: [
        { value: '&kp', params: [{ value: 'A', params: [] }] },
        { value: '&kp', params: [{ value: 'B', params: [] }] }
      ],
      layerView: { shown: [0, 1], layer0Raw: true }
    })
    const layer0 = stackRows().find(row => row.dataset.layer === '0')
    expect(layer0?.querySelector('.zmk-row.zmk-raw')).toBeInstanceOf(HTMLElement)
    expect(layer0?.querySelector('.keycap')).toBeNull()
  })

  it('underlines punctuation that sits on a different key in the other language', () => {
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'ru')
    open({ params: [{ value: 'COMMA', params: [] }] })
    const slot = document.querySelector('.layer-slot')
    expect(slot?.classList.contains('symbol-basic')).toBe(true)
    expect(slot?.getAttribute('title')).toMatch(/Different position|Linux split|On this key/)
  })

  it('compares two national keycap languages without English', () => {
    let view = addHostLanguage(addHostLanguage(editor.hostLegend, 'ru'), 'fr')
    view = toggleHostLanguage(view, 'en')
    view = toggleHostLanguage(view, 'ru')
    editor.hostLegend = view
    editor.symbolAlignOn = true
    open({ params: [{ value: 'DOT', params: [] }] })
    const slot = document.querySelector('.layer-slot')
    expect(slot?.classList.contains('symbol-basic')).toBe(true)
    expect(slot?.classList.contains('altgr-conflict')).toBe(false)
    expect(slot?.getAttribute('title') ?? '').not.toMatch(/Windows/)
  })

  it('stacks every host language on layer 0 and hides the other layers', () => {
    editor.hostLegend = addHostLanguage(addHostLanguage(editor.hostLegend, 'ru'), 'uk')
    open({
      hostView: editor.hostLegend,
      layerBindings: [
        { value: '&kp', params: [{ value: 'S', params: [] }] },
        { value: '&kp', params: [{ value: 'B', params: [] }] },
        { value: '&kp', params: [{ value: 'C', params: [] }] }
      ],
      layerView: { shown: [0, 1, 2], layer0Raw: false }
    })
    expect(stackRows().length).toBeGreaterThan(1)
    expect(document.querySelector('.lang-line')).toBeNull()

    editor.multilangView = true
    flushSync()
    const rows = stackRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.dataset.layer).toBe('0')
    const lines = [...rows[0].querySelectorAll('.lang-line')].map(line =>
      (line.textContent ?? '').replace(/\s+/g, '')
    )
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('sS')
    expect(lines[1]).toContain('ыЫ')
    expect(lines[2]).toContain('іІ')
    expect(rows[0].textContent).not.toMatch(/bB|cC/)
  })

  it('peeks the multilang face for any combo layer, not only L0', () => {
    editor.hostLegend = addHostLanguage(addHostLanguage(editor.hostLegend, 'ru'), 'uk')
    editor.multilangView = true
    open({
      hostView: editor.hostLegend,
      layerBindings: [
        { value: '&kp', params: [{ value: 'A', params: [] }] },
        { value: '&kp', params: [{ value: 'B', params: [] }] }
      ],
      layerView: { shown: [0, 1], layer0Raw: false },
      comboPeekLayer: 1
    })
    const face = document.querySelector('.layer-slot.multilang-face')
    expect(face?.classList.contains('combo-peek')).toBe(true)
  })

  it('keeps a non-character key on one row while languages are stacked', () => {
    editor.hostLegend = addHostLanguage(addHostLanguage(editor.hostLegend, 'ru'), 'uk')
    editor.multilangView = true
    open({
      hostView: editor.hostLegend,
      params: [{ value: 'ESC', params: [] }],
      layerBindings: [
        { value: '&kp', params: [{ value: 'ESC', params: [] }] },
        { value: '&kp', params: [{ value: 'B', params: [] }] }
      ],
      layerView: { shown: [0, 1], layer0Raw: false }
    })
    expect(stackRows()).toHaveLength(1)
    expect(document.querySelector('.lang-line')).toBeNull()
    expect(stackRows()[0]?.dataset.layer).toBe('0')
  })

  it('does not mark a letter that only changes alphabet', () => {
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'ru')
    open()
    const slot = document.querySelector('.layer-slot')
    expect(slot?.classList.contains('symbol-moved')).toBe(false)
    expect(slot?.classList.contains('symbol-basic')).toBe(false)
    expect(slot?.classList.contains('altgr-conflict')).toBe(false)
    expect(slot?.getAttribute('title')).toBeNull()
  })
})
