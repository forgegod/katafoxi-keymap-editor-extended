import { describe, expect, it } from 'vitest'
import {
  buildChoiceLabeler,
  catalogChoiceTooltip,
  displayChoiceLabel,
  representativeLabel
} from './keycode-labels.js'

describe('representativeLabel', () => {
  it('prefers a symbol over the raw code', () => {
    expect(representativeLabel({ code: 'N1', symbol: '1' })).toBe('1')
  })

  it('falls back to the code when no symbol is set', () => {
    expect(representativeLabel({ code: 'A' })).toBe('A')
  })

  it('uses the function name for modifier wrappers, not the key glyph', () => {
    expect(
      representativeLabel({ code: 'LG', symbol: '⌘', params: ['code'] })
    ).toBe('LG')
  })
})

describe('displayChoiceLabel', () => {
  it('marks left/right when the same glyph is shared', () => {
    const peers = [
      { code: 'LCMD', symbol: '⌘' },
      { code: 'RCMD', symbol: '⌘' },
      { code: 'LG', symbol: '⌘', params: ['code'] }
    ]
    expect(displayChoiceLabel(peers[0], peers)).toBe('⌘')
    expect(displayChoiceLabel(peers[1], peers)).toBe('R⌘')
    expect(displayChoiceLabel(peers[2], peers)).toBe('LG(…)')
  })

  it('uses short media/scroll chips and keypad glyphs', () => {
    expect(displayChoiceLabel({ code: 'K_MUTE' })).toBe('MUTE')
    expect(displayChoiceLabel({ code: 'K_MUTE', symbol: '🔇' })).toBe('MUTE')
    expect(displayChoiceLabel({ code: 'K_MUTE2', symbol: '🔇' })).toBe('MUTE2')
    expect(displayChoiceLabel({ code: 'K_VOL_DN2' })).toBe('VOL_DN2')
    expect(displayChoiceLabel({ code: 'K_SCROLL_DOWN' })).toBe('SCROLL_DN')
    expect(displayChoiceLabel({ code: 'K_SCROLL_UP' })).toBe('SCROLL_UP')
    expect(displayChoiceLabel({ code: 'KP_LPAR' })).toBe('(')
    expect(displayChoiceLabel({ code: 'KP_RPAR' })).toBe(')')
    expect(displayChoiceLabel({ code: 'KP_COMMA' })).toBe(',')
    expect(displayChoiceLabel({ code: 'KP_DOT' })).toBe('.')
    expect(displayChoiceLabel({ code: 'KP_N7', symbol: '7' })).toBe('7')
    expect(displayChoiceLabel({ code: 'KP_ENTER', symbol: '⮐' })).toBe('⮐')
    expect(displayChoiceLabel({ code: 'KP_NUM' })).toBe('NUM')
    expect(displayChoiceLabel({ code: 'KP_MINUS', symbol: '-' })).toBe('-')
    expect(displayChoiceLabel({ code: 'KP_EQUAL', symbol: '=' })).toBe('=')
    expect(displayChoiceLabel({ code: 'KP_EQUAL_AS400' })).toBe('AS400=')
    expect(displayChoiceLabel({ code: 'K_CUT' })).toBe('✂')
    expect(displayChoiceLabel({ code: 'K_COPY' })).toBe('⧉')
    expect(displayChoiceLabel({ code: 'K_PASTE' })).toBe('📋')
    expect(displayChoiceLabel({ code: 'K_UNDO' })).toBe('↶')
    expect(displayChoiceLabel({ code: 'K_REDO' })).toBe('↷')
    expect(displayChoiceLabel({ code: 'K_AGAIN' })).toBe('↷')
    expect(displayChoiceLabel({ code: 'K_FIND' })).toBe('🔍')
  })

  it('keeps keypad glyphs when a Keyboard peer shares the mark', () => {
    const peers = [
      { code: 'MINUS', symbol: '-' },
      { code: 'KP_MINUS', symbol: '-', context: 'Keypad' },
      { code: 'EQUAL', symbol: '=' },
      { code: 'KP_EQUAL', symbol: '=', context: 'Keypad' },
      { code: 'N7', symbol: '7' },
      { code: 'KP_N7', symbol: '7', context: 'Keypad' },
      { code: 'RET', symbol: '⮐' },
      { code: 'KP_ENTER', symbol: '⮐', context: 'Keypad' }
    ]
    expect(displayChoiceLabel(peers[1], peers)).toBe('-')
    expect(displayChoiceLabel(peers[3], peers)).toBe('=')
    expect(displayChoiceLabel(peers[5], peers)).toBe('7')
    expect(displayChoiceLabel(peers[7], peers)).toBe('⮐')
  })

  it('marks US shift aliases as LS of the HID key', () => {
    expect(displayChoiceLabel({ code: 'COLON' })).toBe('⇧:')
    expect(displayChoiceLabel({ code: 'SEMI', symbol: ';' })).toBe(';')
    expect(displayChoiceLabel({ code: 'QMARK', symbol: '?' })).toBe('⇧?')
    expect(displayChoiceLabel({ code: 'BSLH', symbol: '\\' })).toBe('\\')
  })

  it('matches buildChoiceLabeler for the same peer list', () => {
    const peers = [
      { code: 'LCMD', symbol: '⌘' },
      { code: 'RCMD', symbol: '⌘' },
      { code: 'COLON' },
      { code: 'K_MUTE' }
    ]
    const label = buildChoiceLabeler(peers)
    for (const choice of peers) {
      expect(label(choice)).toBe(displayChoiceLabel(choice, peers))
    }
  })
})

describe('catalogChoiceTooltip', () => {
  it('joins code and description', () => {
    expect(catalogChoiceTooltip({ code: 'M', description: 'm and M' })).toBe(
      'M — m and M'
    )
    expect(catalogChoiceTooltip({ code: '&kp', name: 'Key Press' })).toBe(
      '&kp — Key Press'
    )
    expect(
      catalogChoiceTooltip({
        code: 'LG',
        params: ['code'],
        description: 'Left GUI (Windows / Command / Meta)'
      })
    ).toBe('LG(code) — Left GUI (Windows / Command / Meta)')
    expect(catalogChoiceTooltip({ code: 'K_MUTE', description: 'Mute' })).toBe(
      'K_MUTE — Mute'
    )
    expect(
      catalogChoiceTooltip({ code: 'COLON', description: ': [Colon]' })
    ).toBe('COLON — LS(SEMI)')
  })
})
