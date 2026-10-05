import { getBehaviorCatalog, type CatalogChoice } from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, it } from 'vitest'
import type { SearchBox } from '../../context'
import type { EditorSlot } from '../../key-editor'
import Harness, { type EditorScene } from './KeyEditorHarness.svelte'

const behaviours = getBehaviorCatalog().list as EditorScene['behaviours']

const codeChoices: CatalogChoice[] = [
  { code: 'F1', context: 'Keyboard', description: 'F1' },
  { code: 'K', context: 'Keyboard', description: 'K' },
  { code: 'A', context: 'Keyboard', description: 'A' },
  { code: 'KP_N0', context: 'Keypad', description: 'keypad 0' }
]

const modChoices: CatalogChoice[] = [
  { code: 'LCTRL', description: 'Left control', isModifier: true },
  { code: 'RCTRL', description: 'Right control', isModifier: true }
]

const search: SearchBox = {
  current: {
    sources: {},
    getSearchTargets: (param: unknown) => {
      if (param === 'code') return codeChoices
      if (param === 'mod') return modChoices
      if (param === 'layer') return [{ code: 0, symbol: 'L0', description: 'Layer 0' }]
      return []
    }
  }
}

const filterChoices: CatalogChoice[] = [
  ...'ABCDEFGHIJKLMNOPQRST'.split('').map(code => ({
    code,
    context: 'Keyboard',
    description: code
  })),
  { code: 'KP_N0', context: 'Keypad', description: 'keypad 0' },
  { code: 'KP_N1', context: 'Keypad', description: 'keypad 1' },
  { code: 'KP_N2', context: 'Keypad', description: 'keypad 2' },
  { code: 'C_MUTE', context: 'Consumer', description: 'Mute' }
]

const filterSearch: SearchBox = {
  current: {
    sources: {},
    getSearchTargets: (param: unknown) => {
      if (param === 'code') return filterChoices
      if (param === 'mod') return modChoices
      return []
    }
  }
}

function slot(
  codeIndex: number,
  param: string,
  value: string | undefined,
  label: string
): EditorSlot {
  return { codeIndex, param, value, label }
}

function choiceTexts(root: ParentNode): string[] {
  return [...root.querySelectorAll('.key-editor-choice')].map(el =>
    (el.textContent ?? '').trim()
  )
}

function clickChip(root: ParentNode, label: string) {
  const button = [...root.querySelectorAll('.key-editor-chip')].find(
    el => (el.textContent ?? '').trim() === label
  )
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`missing behaviour chip ${label}`)
  }
  button.click()
}

describe('KeyEditor value catalog', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  afterEach(() => {
    if (view) unmount(view)
    target?.remove()
  })

  function open(scene: EditorScene, searchBox: SearchBox = search) {
    target = document.createElement('div')
    document.body.appendChild(target)
    view = mount(Harness, { target, props: { search: searchBox, scene } })
    flushSync()
    return view as ReturnType<typeof mount> & { show: (next: EditorScene) => void }
  }

  it('shows the binding as a result sticker above the panel and explains chip styles', () => {
    open({
      bindingLabel: '&kp A',
      behaviours,
      editorSlots: [
        slot(0, 'behaviour', '&kp', 'Behaviour'),
        slot(1, 'code', 'A', 'Key')
      ],
      activeCodeIndex: 1,
      choices: codeChoices,
      onSelectBehaviour: () => {},
      onSelectValue: () => {},
      onActivateSlot: () => {},
      onConfirm: () => {},
      onCancel: () => {}
    })

    const editor = target.querySelector('.key-editor')
    const preview = editor?.querySelector('.key-editor-preview')
    const body = editor?.querySelector('.key-editor-body')
    expect(preview).toBeTruthy()
    expect(body).toBeTruthy()
    expect(body!.contains(preview as Node)).toBe(false)
    expect(preview!.querySelector('.binding')?.textContent).toBe('&kp A')
    expect(preview!.querySelector('.key-editor-preview-label')).toBeNull()
    expect(
      preview!.compareDocumentPosition(body as Node) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    const legend = target.querySelector('.key-editor-legend')
    expect(legend?.getAttribute('aria-label')).toBe('Value chip styles')
    expect(legend?.textContent).toContain('Selected')
    expect(legend?.textContent).toContain('Already used elsewhere')
    expect(legend?.textContent).toContain('Limited OS support')
    expect(legend?.textContent).toContain('Alias / alternate name')

    const instant = target.querySelector('[data-behaviour-group="instant"]')
    expect(instant?.querySelector('.key-editor-chip-note')?.textContent?.trim()).toBe(
      'Instant'
    )
    expect(target.querySelector('.key-editor-hold-hint')?.textContent).toContain(
      'Dashed = wrap the key'
    )
  })

  it('puts parameterless behaviours on a second chip row', () => {
    open({
      bindingLabel: '&kp A',
      behaviours,
      editorSlots: [
        slot(0, 'behaviour', '&kp', 'Behaviour'),
        slot(1, 'code', 'A', 'Key')
      ],
      activeCodeIndex: 1,
      choices: codeChoices,
      onSelectBehaviour: () => {},
      onSelectValue: () => {},
      onActivateSlot: () => {},
      onConfirm: () => {},
      onCancel: () => {}
    })

    const withParams = target.querySelector('[data-behaviour-group="params"]')
    const instant = target.querySelector('[data-behaviour-group="instant"]')
    expect(withParams).toBeTruthy()
    expect(instant).toBeTruthy()

    const paramCodes = [...(withParams?.querySelectorAll('.key-editor-chip') ?? [])].map(el =>
      (el.textContent ?? '').trim()
    )
    const instantCodes = [...(instant?.querySelectorAll('.key-editor-chip') ?? [])].map(el =>
      (el.textContent ?? '').trim()
    )

    expect(paramCodes).toContain('&kp')
    expect(paramCodes).toContain('&mo')
    expect(paramCodes).not.toContain('&trans')
    expect(instantCodes).toEqual(
      expect.arrayContaining(['&trans', '&none', '&caps_word', '&key_repeat', '&reset', '&bootloader'])
    )
    expect(instantCodes).not.toContain('&kp')
  })

  it('shows pointing commands instead of Keyboard+Keypad', () => {
    const handlers = {
      onSelectValue: () => {},
      onActivateSlot: () => {},
      onConfirm: () => {},
      onCancel: () => {}
    }
    let scene: EditorScene = {
      bindingLabel: '&kp ESC',
      behaviours,
      editorSlots: [
        slot(0, 'behaviour', '&kp', 'Behaviour'),
        slot(1, 'code', 'ESC', 'Key')
      ],
      activeCodeIndex: 1,
      choices: codeChoices,
      onSelectBehaviour: () => {},
      ...handlers
    }
    const editor = open(scene)
    scene = {
      ...scene,
      onSelectBehaviour: choice => {
        const code = String(choice.code ?? '')
        scene = {
          ...scene,
          bindingLabel: code,
          editorSlots: [
            slot(0, 'behaviour', code, 'Behaviour'),
            slot(1, 'command', undefined, 'Command')
          ],
          activeCodeIndex: 1
        }
        editor.show(scene)
      }
    }
    editor.show(scene)
    flushSync()

    expect(choiceTexts(target)).toContain('F1')

    for (const [chip, commands] of [
      ['&mkp', ['LCLK', 'RCLK', 'MCLK', 'MB4', 'MB5']],
      ['&msc', ['SCRL⬆', 'SCRL⬇', 'SCRL⬅', 'SCRL➡']],
      ['&mmv', ['MOVE_UP', 'MOVE_DOWN', 'MOVE_LEFT', 'MOVE_RIGHT']]
    ] as const) {
      clickChip(target, chip)
      flushSync()
      const shown = choiceTexts(target)
      expect(shown, chip).toEqual([...commands])
      expect(shown, chip).not.toContain('F1')
    }
  })

  it('shows the modifier row and the key grid together for &mt', () => {
    const activated: number[] = []
    const selected: string[] = []
    const base: EditorScene = {
      bindingLabel: '&mt',
      behaviours,
      editorSlots: [
        slot(0, 'behaviour', '&mt', 'Behaviour'),
        slot(1, 'mod', undefined, 'Modifier'),
        slot(2, 'code', undefined, 'Key')
      ],
      activeCodeIndex: 1,
      choices: codeChoices,
      onSelectBehaviour: () => {},
      onSelectValue: choice => {
        selected.push(String(choice.code))
      },
      onActivateSlot: codeIndex => {
        activated.push(codeIndex)
      },
      onConfirm: () => {},
      onCancel: () => {}
    }
    const editor = open(base)

    expect(choiceTexts(target)).toContain('F1')
    expect(choiceTexts(target)).toContain('K')
    expect(
      [...target.querySelectorAll('[data-slot-values] .key-editor-choice')].map(el =>
        el.getAttribute('title')
      )
    ).toContain('Left control')
    expect(target.querySelector('[data-binding-slots]')).toBeNull()
    expect(target.querySelector('[data-slot-values] .key-editor-section-label')?.textContent).toBe(
      'Modifier'
    )
    expect(
      [...target.querySelectorAll('.key-editor-section-label')].map(el =>
        (el.textContent ?? '').trim()
      )
    ).toEqual(expect.arrayContaining(['Modifier', 'Value']))
    const choiceBlock = target.querySelector('[data-behavior-choice]')
    expect(choiceBlock?.querySelector('[data-behaviour-group="params"]')).toBeTruthy()
    expect(choiceBlock?.querySelector('[data-behavior-presets]')).toBeTruthy()
    expect(choiceBlock?.querySelector('[data-slot-values]')).toBeNull()

    const ctrl = [...target.querySelectorAll('[data-slot-values] .key-editor-choice')].find(
      el => el.getAttribute('title') === 'Left control'
    )
    if (!(ctrl instanceof HTMLButtonElement)) throw new Error('missing modifier choice')
    ctrl.click()
    expect(activated).toEqual([1])
    expect(selected).toEqual(['LCTRL'])

    editor.show({
      ...base,
      bindingLabel: '&mt RCTRL',
      editorSlots: [
        slot(0, 'behaviour', '&mt', 'Behaviour'),
        slot(1, 'mod', 'RCTRL', 'Modifier'),
        slot(2, 'code', undefined, 'Key')
      ],
      activeCodeIndex: 2
    })
    flushSync()

    expect(choiceTexts(target)).toContain('F1')
    expect(target.querySelector('[data-slot-values]')).toBeTruthy()
    expect(
      [...target.querySelectorAll('.key-editor-group h3')].map(el => el.textContent)
    ).toContain('Keyboard')
    const key = [...target.querySelectorAll('.key-editor-choice')].find(
      el => (el.textContent ?? '').trim() === 'K'
    )
    if (!(key instanceof HTMLButtonElement)) throw new Error('missing key choice')
    key.click()
    expect(activated.at(-1)).toBe(2)
    expect(selected.at(-1)).toBe('K')
  })

  it('applies a finished &mt binding with Enter while a key button is focused', () => {
    let confirmed = 0
    const filled: EditorScene = {
      bindingLabel: '&mt RCTRL K',
      behaviours,
      editorSlots: [
        slot(0, 'behaviour', '&mt', 'Behaviour'),
        slot(1, 'mod', 'RCTRL', 'Modifier'),
        slot(2, 'code', 'K', 'Key')
      ],
      activeCodeIndex: 2,
      choices: codeChoices,
      onSelectBehaviour: () => {},
      onSelectValue: () => {},
      onActivateSlot: () => {},
      onConfirm: () => {
        confirmed += 1
      },
      onCancel: () => {}
    }
    const editor = open({
      ...filled,
      editorSlots: [
        slot(0, 'behaviour', '&mt', 'Behaviour'),
        slot(1, 'mod', 'RCTRL', 'Modifier'),
        slot(2, 'code', undefined, 'Key')
      ]
    })

    const keyButton = () =>
      [...target.querySelectorAll('.key-editor-choice')].find(
        el => (el.textContent ?? '').trim() === 'K'
      )

    const unfinished = keyButton()
    expect(unfinished).toBeInstanceOf(HTMLButtonElement)
    unfinished?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    expect(confirmed).toBe(0)

    editor.show(filled)
    flushSync()
    expect(target.querySelector('.binding')?.textContent).toBe('&mt RCTRL K')

    const finished = keyButton()
    expect(finished).toBeInstanceOf(HTMLButtonElement)
    if (!(finished instanceof HTMLButtonElement)) {
      throw new Error('expected key choice button')
    }
    finished.focus()
    finished.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    expect(confirmed).toBe(1)
  })

  const filterScene: EditorScene = {
    bindingLabel: '&kp A',
    behaviours,
    editorSlots: [
      slot(0, 'behaviour', '&kp', 'Behaviour'),
      slot(1, 'code', 'A', 'Key')
    ],
    activeCodeIndex: 1,
    choices: filterChoices,
    onSelectBehaviour: () => {},
    onSelectValue: () => {},
    onActivateSlot: () => {},
    onConfirm: () => {},
    onCancel: () => {}
  }

  it('shows the filter field while the Keyboard+Keypad chip is active', () => {
    open(filterScene, filterSearch)

    expect(target.querySelector('.key-editor-filter')).toBeInstanceOf(HTMLInputElement)
    const homeChip = [...target.querySelectorAll('.key-editor-taxonomy .key-editor-chip')].find(
      el => (el.textContent ?? '').trim() === 'Keyboard+Keypad'
    )
    expect(homeChip?.classList.contains('active')).toBe(true)
  })

  it.todo(
    'hides KP_* until search — home taxonomy selects Keyboard+Keypad, so keypad stays visible without a query'
  )

  it('shows Keypad matches while taxonomy chips stay visible', () => {
    open(filterScene, filterSearch)

    const filter = target.querySelector('.key-editor-filter')
    expect(filter).toBeInstanceOf(HTMLInputElement)
    if (!(filter instanceof HTMLInputElement)) throw new Error('missing filter')
    filter.value = 'KP_N'
    filter.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()

    const shown = choiceTexts(target)
    expect(shown).toContain('0')
    expect(shown).toContain('1')
    expect(
      [...target.querySelectorAll('.key-editor-taxonomy .key-editor-chip')].map(el =>
        (el.textContent ?? '').trim()
      )
    ).toEqual(['Keyboard+Keypad', 'Consumer'])
  })

  it('restores the selected-chip group after the filter is cleared', () => {
    open(filterScene, filterSearch)

    const filter = target.querySelector('.key-editor-filter')
    expect(filter).toBeInstanceOf(HTMLInputElement)
    if (!(filter instanceof HTMLInputElement)) throw new Error('missing filter')
    filter.value = 'KP_N'
    filter.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    expect(choiceTexts(target)).toContain('0')
    expect(choiceTexts(target)).not.toContain('A')

    filter.value = ''
    filter.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()

    expect(choiceTexts(target)).toContain('A')
    expect(choiceTexts(target)).toContain('0')
  })

  it('confirms a complete binding when Enter is pressed in the filter field', () => {
    let confirmed = 0
    open(
      {
        ...filterScene,
        onConfirm: () => {
          confirmed += 1
        }
      },
      filterSearch
    )

    const filter = target.querySelector('.key-editor-filter')
    expect(filter).toBeInstanceOf(HTMLInputElement)
    filter?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    expect(confirmed).toBe(1)
  })

  it('activates the empty Key slot when Enter is pressed in the filter field', () => {
    let confirmed = 0
    const activated: number[] = []
    open(
      {
        ...filterScene,
        bindingLabel: '&kp',
        editorSlots: [
          slot(0, 'behaviour', '&kp', 'Behaviour'),
          slot(1, 'code', undefined, 'Key')
        ],
        onConfirm: () => {
          confirmed += 1
        },
        onActivateSlot: codeIndex => {
          activated.push(codeIndex)
        }
      },
      filterSearch
    )

    const filter = target.querySelector('.key-editor-filter')
    expect(filter).toBeInstanceOf(HTMLInputElement)
    filter?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    expect(confirmed).toBe(0)
    expect(activated).toEqual([1])
  })

  it('shows keymap hold-tap timing under the behaviour chips', () => {
    const withTiming = behaviours.map(behavior =>
      behavior.code === '&mt'
        ? { ...behavior, tappingTermMs: 300, flavor: 'tap-preferred' }
        : behavior
    )
    withTiming.push({
      code: '&hm',
      name: 'Hold-tap',
      description: 'Hold-tap, 280 ms, tap preferred',
      params: ['code', 'code'],
      tappingTermMs: 280,
      flavor: 'tap-preferred'
    })
    open({
      bindingLabel: '&hm LCTRL A',
      behaviours: withTiming,
      editorSlots: [
        slot(0, 'behaviour', '&hm', 'Behaviour'),
        slot(1, 'code', 'LCTRL', 'Key'),
        slot(2, 'code', 'A', 'Key')
      ],
      activeCodeIndex: 1,
      choices: codeChoices,
      onSelectBehaviour: () => {},
      onSelectValue: () => {},
      onActivateSlot: () => {},
      onConfirm: () => {},
      onCancel: () => {}
    })

    const chips = [...target.querySelectorAll('.key-editor-chip')].map(el =>
      (el.textContent ?? '').trim()
    )
    expect(chips).toContain('&hm')
    expect(target.querySelector('[data-hold-tap-fields] .key-editor-section-label')?.textContent).toBe(
      'Timing'
    )
    expect(target.querySelector('[data-hold-tap-note]')?.textContent?.trim()).toBe(
      'Changes every key that uses &hm.'
    )
    expect(target.textContent).not.toContain('Every &hm')
  })

  it('opens the hold-tap docs from a preset without selecting it', () => {
    const selected: string[] = []
    const opened: string[] = []
    const original = window.open
    window.open = ((url?: string | URL) => {
      opened.push(String(url))
      return null
    }) as typeof window.open
    try {
      open({
        bindingLabel: '&mt LCTRL J',
        behaviours,
        editorSlots: [
          slot(0, 'behaviour', '&mt', 'Behaviour'),
          slot(1, 'mod', 'LCTRL', 'Modifier'),
          slot(2, 'code', 'J', 'Key')
        ],
        activeCodeIndex: 1,
        choices: codeChoices,
        onSelectBehaviour: choice => {
          selected.push(String(choice.code))
        },
        onChangeHoldTaps: () => {},
        onSelectValue: () => {},
        onActivateSlot: () => {},
        onConfirm: () => {},
        onCancel: () => {}
      })

      const homerow = target.querySelector('[data-behavior-preset="&hm"]')
      const autoshift = target.querySelector('[data-behavior-preset="&as"]')
      expect(homerow?.getAttribute('title')).toContain('Ctrl+click: docs')
      expect(autoshift?.getAttribute('title')).toContain('Ctrl+click: docs')
      homerow?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
      )
      expect(opened).toEqual(['https://zmk.dev/docs/keymaps/behaviors/hold-tap'])
      expect(selected).toEqual([])
    } finally {
      window.open = original
    }
  })

  it('edits the shared &mt term and adds the homerow preset', () => {
    const changes: unknown[] = []
    const applied: unknown[] = []
    let selected = ''
    open({
      bindingLabel: '&mt LCTRL J',
      behaviours,
      editorSlots: [
        slot(0, 'behaviour', '&mt', 'Behaviour'),
        slot(1, 'mod', 'LCTRL', 'Modifier'),
        slot(2, 'code', 'J', 'Key')
      ],
      activeCodeIndex: 1,
      choices: codeChoices,
      holdTaps: [{ code: '&mt', override: true, tappingTermMs: 300, flavor: 'tap-preferred' }],
      onChangeHoldTaps: next => changes.push(next),
      onSelectBehaviour: choice => {
        selected = String(choice.code)
      },
      onSelectValue: () => {},
      onActivateSlot: () => {},
      onConfirm: staged => {
        applied.push(staged)
      },
      onCancel: () => {}
    })

    expect(target.querySelector('[data-add-custom-behavior]')).toBeNull()
    const term = target.querySelector('[data-hold-tap-term]')
    expect(term).toBeInstanceOf(HTMLInputElement)
    expect((term as HTMLInputElement).value).toBe('300')
    ;(term as HTMLInputElement).value = '280'
    term?.dispatchEvent(new Event('input', { bubbles: true }))
    term?.dispatchEvent(new Event('change', { bubbles: true }))
    expect(changes.at(-1)).toEqual([
      { code: '&mt', override: true, tappingTermMs: 280, flavor: 'tap-preferred' }
    ])

    const homerow = target.querySelector('[data-behavior-preset="&hm"]')
    expect(homerow).toBeInstanceOf(HTMLButtonElement)
    expect(homerow?.getAttribute('aria-label')).toBe('Homerow')
    ;(homerow as HTMLButtonElement).click()
    flushSync()
    expect(selected).toBe('&hm')
    expect(changes).toHaveLength(1)
    expect((term as HTMLInputElement).value).toBe('280')

    const apply = target.querySelector('[aria-label="Apply"]')
    if (!(apply instanceof HTMLButtonElement)) throw new Error('missing Apply')
    apply.click()
    const created = applied[0] as Array<{
      code: string
      tappingTermMs?: number
      requirePriorIdleMs?: number
    }>
    expect(created.some(node => node.code === '&mt')).toBe(true)
    expect(
      created.some(
        node => node.code === '&hm' && node.tappingTermMs === 280 && node.requirePriorIdleMs === 150
      )
    ).toBe(true)
  })

  it('switches from the active &mt chip to a preset', () => {
    open({
      bindingLabel: '&mt LCTRL J',
      behaviours,
      editorSlots: [
        slot(0, 'behaviour', '&mt', 'Behaviour'),
        slot(1, 'mod', 'LCTRL', 'Modifier'),
        slot(2, 'code', 'J', 'Key')
      ],
      activeCodeIndex: 1,
      choices: codeChoices,
      holdTaps: [{ code: '&mt', override: true, tappingTermMs: 300, flavor: 'tap-preferred' }],
      onChangeHoldTaps: () => {},
      onSelectBehaviour: () => {},
      onSelectValue: () => {},
      onActivateSlot: () => {},
      onConfirm: () => {},
      onCancel: () => {}
    })

    clickChip(target, '&mt')
    flushSync()
    clickChip(target, '&hm')
    flushSync()
    const homerow = target.querySelector('[data-behavior-preset="&hm"]')
    const autoshift = target.querySelector('[data-behavior-preset="&as"]')
    expect(homerow?.classList.contains('active')).toBe(true)
    expect(target.querySelector('.binding')?.textContent).toContain('&hm')
    expect(
      [...target.querySelectorAll('.key-editor-chip')].find(
        el => (el.textContent ?? '').trim() === '&mt'
      )?.classList.contains('active')
    ).toBe(false)

    ;(autoshift as HTMLButtonElement).click()
    flushSync()
    expect(autoshift?.classList.contains('active')).toBe(true)
    expect(homerow?.classList.contains('active')).toBe(false)
    expect(target.querySelector('.binding')?.textContent).toContain('&as')
    expect(target.querySelector('[data-hold-tap-flavor]')).toBeNull()
  })
})
