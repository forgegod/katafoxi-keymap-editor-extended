import { beforeEach, describe, expect, it } from 'vitest'
import { editor } from './editor.svelte.js'

const binding = { value: '&kp', params: [{ value: 'A', params: [] }] }
const none = { value: '&none', params: [] }

describe('editor.promoteAbsentKey', () => {
  beforeEach(() => {
    editor.resetForTests()
    editor.layout = [
      { x: 0, y: 0, row: 0, col: 0, absent: true, label: '0,0' },
      { x: 1, y: 0, row: 0, col: 1, label: '0,1' }
    ]
  })

  it('promotes an absent slot when scheme mode is on and the binding is real', () => {
    editor.schemeMode = true
    editor.promoteAbsentKey(0, binding)
    expect(editor.layout?.[0]?.absent).toBeUndefined()
    expect(editor.layout?.[1]?.label).toBe('0,1')
  })

  it('does not promote outside scheme mode', () => {
    editor.schemeMode = false
    editor.promoteAbsentKey(0, binding)
    expect(editor.layout?.[0]?.absent).toBe(true)
  })

  it('does not promote a blank binding', () => {
    editor.schemeMode = true
    editor.promoteAbsentKey(0, none)
    expect(editor.layout?.[0]?.absent).toBe(true)
  })
})
