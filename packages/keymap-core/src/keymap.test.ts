import { describe, expect, it } from 'vitest'
import { isPrimaryKeymapJson, isUserKeymapFilename } from './keymap.js'

describe('isPrimaryKeymapJson', () => {
  it('accepts a non-empty valid keymap', () => {
    expect(isPrimaryKeymapJson({ layers: [['&kp A']] })).toBe(true)
  })

  it('rejects empty layer shells', () => {
    expect(isPrimaryKeymapJson({ layers: [[]] })).toBe(false)
    expect(isPrimaryKeymapJson({ layers: [] })).toBe(false)
  })

  it('rejects invalid binds without throwing', () => {
    expect(isPrimaryKeymapJson({ layers: [['not-a-bind']] })).toBe(false)
  })

  it('rejects null', () => {
    expect(isPrimaryKeymapJson(null)).toBe(false)
  })
})

describe('isUserKeymapFilename', () => {
  it('accepts user .keymap files', () => {
    expect(isUserKeymapFilename('lark.keymap')).toBe(true)
    expect(isUserKeymapFilename('LARK.KEYMAP')).toBe(true)
  })

  it('rejects templates and other files', () => {
    expect(isUserKeymapFilename('lark.keymap.template')).toBe(false)
    expect(isUserKeymapFilename('readme.md')).toBe(false)
  })
})
