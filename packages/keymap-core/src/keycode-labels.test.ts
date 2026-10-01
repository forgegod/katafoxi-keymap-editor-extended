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

  it('uses short media and scroll chips', () => {
    expect(displayChoiceLabel({ code: 'K_MUTE' })).toBe('MUTE')
    expect(displayChoiceLabel({ code: 'K_MUTE', symbol: '🔇' })).toBe('MUTE')
    expect(displayChoiceLabel({ code: 'K_MUTE2', symbol: '🔇' })).toBe('MUTE2')
    expect(displayChoiceLabel({ code: 'K_VOL_DN2' })).toBe('VOL_DN2')
    expect(displayChoiceLabel({ code: 'K_SCROLL_DOWN' })).toBe('SCROLL_DN')
    expect(displayChoiceLabel({ code: 'K_SCROLL_UP' })).toBe('SCROLL_UP')
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
