import { beforeEach, describe, expect, it } from 'vitest'
import { editor } from './editor.svelte.js'

const esc = {
  value: '&kp',
  params: [{ value: 'ESC', params: [] }]
}
const none = { value: '&none', params: [] }

function seedTwoKeyLayout() {
  editor.layout = [
    { x: 0, y: 0, row: 0, col: 0 },
    { x: 1, y: 0, row: 0, col: 1 },
    { x: 2, y: 0, row: 0, col: 2 }
  ]
  const keymap = {
    layers: [[none, none, none]],
    layer_names: ['Base'],
    combos: [] as NonNullable<(typeof editor)['draftKeymap']>['combos']
  }
  editor.baselineKeymap = structuredClone(keymap)
  editor.draftKeymap = structuredClone(keymap)
}

describe('editor combo mode', () => {
  beforeEach(() => {
    editor.resetForTests()
    seedTwoKeyLayout()
  })

  it('enters combo mode and selects the first combo when present', () => {
    editor.updateCombos([
      { id: 'combo_esc', keyPositions: [0, 1], binding: esc }
    ])
    editor.toggleComboMode()
    expect(editor.comboMode).toBe(true)
    expect(editor.schemeMode).toBe(false)
    expect(editor.activeComboId).toBe('combo_esc')
  })

  it('toggles key-positions on the active combo and blocks exit when incomplete', () => {
    editor.updateCombos([
      { id: 'combo_esc', keyPositions: [], binding: esc }
    ])
    editor.toggleComboMode()
    editor.activeComboId = 'combo_esc'

    editor.toggleComboPosition(0)
    expect(editor.draftKeymap?.combos?.[0]?.keyPositions).toEqual([0])
    expect(editor.comboNotice).toMatch(/2/)

    expect(editor.tryExitComboMode()).toBe(false)
    expect(editor.comboMode).toBe(true)
    expect(editor.activeComboId).toBe('combo_esc')

    editor.toggleComboPosition(1)
    expect(editor.draftKeymap?.combos?.[0]?.keyPositions).toEqual([0, 1])
    expect(editor.tryExitComboMode()).toBe(true)
    expect(editor.comboMode).toBe(false)
  })

  it('drops empty drafts on exit and keeps complete combos', () => {
    editor.updateCombos([
      { id: 'combo_esc', keyPositions: [0, 1], binding: esc },
      { id: 'combo_tab', keyPositions: [], binding: esc }
    ])
    editor.toggleComboMode()
    expect(editor.tryExitComboMode()).toBe(true)
    expect(editor.draftKeymap?.combos?.map(c => c.id)).toEqual(['combo_esc'])
  })
})
