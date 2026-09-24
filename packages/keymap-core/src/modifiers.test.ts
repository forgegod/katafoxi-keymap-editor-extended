import { describe, expect, it } from 'vitest'
import {
  modifierHoldLegend,
  modifierRoleGlyph,
  MODIFIER_HOLDS
} from './modifiers.js'

describe('modifierRoleGlyph', () => {
  it('maps every hold role to its TARGET_SYSTEM glyph', () => {
    expect(modifierRoleGlyph('ctrl')).toBe('⌃')
    expect(modifierRoleGlyph('shift')).toBe('⇧')
    expect(modifierRoleGlyph('alt')).toBe('⌥')
    expect(modifierRoleGlyph('gui')).toBe('⌘')
  })
})

describe('modifierHoldLegend', () => {
  it('leaves the left side unmarked and prefixes the right side', () => {
    const legends = MODIFIER_HOLDS.map(hold => modifierHoldLegend(hold))
    expect(legends).toEqual(['⇧', '⌃', '⌥', '⌘', 'R⇧', 'R⌃', 'R⌥', 'R⌘'])
  })
})
