import { describe, expect, it } from 'vitest'
import { deadKeySpacingGlyph, windowsDeadKey } from './klc-dead.js'

describe('deadKeySpacingGlyph', () => {
  it('returns the MSKLC spacing character for known accents', () => {
    expect(deadKeySpacingGlyph('dead_circumflex')).toBe('^')
    expect(deadKeySpacingGlyph('dead_diaeresis')).toBe('¨')
    expect(deadKeySpacingGlyph('dead_grave')).toBe('`')
    expect(deadKeySpacingGlyph('dead_tilde')).toBe('~')
    expect(windowsDeadKey('dead_circumflex')?.id).toBe(0x005e)
  })

  it('puts combining accents on a dotted circle', () => {
    expect(deadKeySpacingGlyph('dead_belowdot')).toBe('\u25cc\u0323')
    expect(deadKeySpacingGlyph('dead_horn')).toBe('\u25cc\u031b')
    expect(deadKeySpacingGlyph('dead_macron')).toBe('¯')
    expect(deadKeySpacingGlyph('dead_belowcomma')).toBe('\u25cc\u0326')
  })

  it('uses spacing Greek marks for iota and breathings', () => {
    expect(deadKeySpacingGlyph('dead_iota')).toBe('\u037a')
    expect(deadKeySpacingGlyph('dead_psili')).toBe('\u1fbf')
    expect(deadKeySpacingGlyph('dead_dasia')).toBe('\u1ffe')
  })

  it('uses a dotted circle for an unknown dead accent', () => {
    expect(deadKeySpacingGlyph('dead_something_new')).toBe('\u25cc')
  })

  it('returns null for ordinary keysyms', () => {
    expect(deadKeySpacingGlyph('dollar')).toBeNull()
    expect(deadKeySpacingGlyph('NoSymbol')).toBeNull()
  })
})
