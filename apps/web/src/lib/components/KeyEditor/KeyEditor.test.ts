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
  { code: 'KP_N2', context: 'Keypad', description: 'keypad 2' }
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

  it('shows the key grid on &mt once the Key slot is active', () => {
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
      onSelectValue: () => {},
      onActivateSlot: () => {},
      onConfirm: () => {},
      onCancel: () => {}
    }
    const editor = open(base)

    expect(choiceTexts(target)).not.toContain('F1')
    expect(
      [...target.querySelectorAll('.key-editor-choice')].map(el => el.getAttribute('title'))
    ).toContain('Left control')

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
    expect(choiceTexts(target)).toContain('K')
    const keyChip = [...target.querySelectorAll('.key-editor-chip')].find(el =>
      (el.textContent ?? '').trim().startsWith('Key')
    )
    expect(keyChip?.classList.contains('active')).toBe(true)
    expect(
      [...target.querySelectorAll('.key-editor-group h3')].map(el => el.textContent)
    ).toContain('Keyboard')
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
    finished?.focus()
    finished?.dispatchEvent(
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

  it('shows the filter field while the Keyboard chip is active', () => {
    open(filterScene, filterSearch)

    expect(target.querySelector('.key-editor-filter')).toBeInstanceOf(HTMLInputElement)
    const keyboardChip = [...target.querySelectorAll('.key-editor-taxonomy .key-editor-chip')].find(
      el => (el.textContent ?? '').trim() === 'Keyboard'
    )
    expect(keyboardChip?.classList.contains('active')).toBe(true)
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
    expect(shown).toContain('KP_N0')
    expect(shown).toContain('KP_N1')
    expect(
      [...target.querySelectorAll('.key-editor-taxonomy .key-editor-chip')].map(el =>
        (el.textContent ?? '').trim()
      )
    ).toEqual(['Keyboard', 'Keypad'])
  })

  it('restores the selected-chip group after the filter is cleared', () => {
    open(filterScene, filterSearch)

    const filter = target.querySelector('.key-editor-filter')
    expect(filter).toBeInstanceOf(HTMLInputElement)
    if (!(filter instanceof HTMLInputElement)) throw new Error('missing filter')
    filter.value = 'KP_N'
    filter.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    expect(choiceTexts(target)).toContain('KP_N0')
    expect(choiceTexts(target)).not.toContain('A')

    filter.value = ''
    filter.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()

    expect(choiceTexts(target)).toContain('A')
    expect(choiceTexts(target)).toContain('KP_N0')
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
})
