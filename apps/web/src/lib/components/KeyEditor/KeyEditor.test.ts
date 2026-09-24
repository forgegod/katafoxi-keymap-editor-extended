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

  function open(scene: EditorScene) {
    target = document.createElement('div')
    document.body.appendChild(target)
    view = mount(Harness, { target, props: { search, scene } })
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
})
