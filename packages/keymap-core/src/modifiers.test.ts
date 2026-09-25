import { describe, expect, it } from 'vitest'
import {
  ALT_GR_COLUMN_LABEL,
  ALT_GR_SHIFT_COLUMN_LABEL,
  modifierHoldLegend,
  modifierRoleGlyph,
  MODIFIER_HOLDS,
  readModifierChain,
  toggleModifierWraps,
  writeModifierChain
} from './modifiers.js'

describe('modifierRoleGlyph', () => {
  it('maps every hold role to its TARGET_SYSTEM glyph', () => {
    expect(modifierRoleGlyph('ctrl')).toBe('⌃')
    expect(modifierRoleGlyph('shift')).toBe('⇧')
    expect(modifierRoleGlyph('alt')).toBe('⎇')
    expect(modifierRoleGlyph('gui')).toBe('⌘')
  })
})

describe('modifierHoldLegend', () => {
  it('leaves the left side unmarked and prefixes the right side', () => {
    const legends = MODIFIER_HOLDS.map(hold => modifierHoldLegend(hold))
    expect(legends).toEqual(['⇧', '⌃', '⎇', '⌘', 'R⇧', 'R⌃', 'R⎇', 'R⌘'])
    expect(ALT_GR_COLUMN_LABEL).toBe('R⎇')
    expect(ALT_GR_SHIFT_COLUMN_LABEL).toBe('⇧R⎇')
  })
})

describe('modifier holds', () => {
  it('toggles a wrap on and off without stacking the same role', () => {
    expect(toggleModifierWraps([], 'LC')).toEqual(['LC'])
    expect(toggleModifierWraps(['LC'], 'LC')).toEqual([])
    expect(toggleModifierWraps(['LC'], 'RC')).toEqual(['RC'])
    expect(toggleModifierWraps(['LC'], 'LS')).toEqual(['LC', 'LS'])
  })

  it('nests Ctrl outside Shift and keeps a terminal key', () => {
    const tree = writeModifierChain(['LS', 'LC'], { value: 'A', params: [] }, (value, params) => ({
      value,
      params
    }))
    expect(tree).toEqual({
      value: 'LC',
      params: [{ value: 'LS', params: [{ value: 'A', params: [] }] }]
    })
    expect(readModifierChain(tree)).toEqual({
      wraps: ['LC', 'LS'],
      terminal: { value: 'A', params: [] }
    })
  })

  it('refuses to wrap a modifier key in the same role', () => {
    expect(toggleModifierWraps([], 'LS', 'LSHFT')).toEqual([])
    expect(
      writeModifierChain(['LS'], { value: 'LSHFT', params: [] }, (value, params) => ({
        value,
        params
      }))
    ).toEqual({ value: 'LSHFT', params: [] })
  })
})
