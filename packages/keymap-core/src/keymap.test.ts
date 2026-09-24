import { describe, expect, it } from 'vitest'
import {
  generateKeymap,
  isPrimaryKeymapJson,
  isUserKeymapFilename,
  parseKeymap
} from './keymap.js'

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

  it('accepts &mkp once the mouse behaviour is in the catalog', () => {
    expect(isPrimaryKeymapJson({ layers: [['&mkp LCLK']] })).toBe(true)
  })
})

describe('generateKeymap mouse includes', () => {
  it('adds pointing.h once when mouse behaviours are used', () => {
    const { code } = generateKeymap(
      [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      parseKeymap({ layers: [['&mkp LCLK', '&msc SCRL_DOWN']] })
    )
    expect(code).toContain('#include <dt-bindings/zmk/pointing.h>')
    expect(code.match(/dt-bindings\/zmk\/pointing\.h/g)?.length).toBe(1)
    expect(code).toContain('&mkp LCLK')
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
