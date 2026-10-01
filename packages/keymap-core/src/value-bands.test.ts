import { describe, expect, it } from 'vitest'
import { bandCatalogChoices, valueBandCaption, valueBandKind } from './value-bands.js'

describe('valueBandKind', () => {
  it('keeps letters, digits, and F-keys out of the long-code grid', () => {
    expect(valueBandKind({ code: 'A' })).toBe('letters')
    expect(valueBandKind({ code: 'N1', symbol: '1' })).toBe('digits')
    expect(valueBandKind({ code: 'F12' })).toBe('function')
    expect(valueBandKind({ code: 'ESC' })).toBe('nav')
    expect(valueBandKind({ code: 'PSCRN' })).toBe('nav')
    expect(valueBandKind({ code: 'PRINTSCREEN' })).toBe('nav')
    expect(valueBandKind({ code: 'SLCK' })).toBe('nav')
    expect(valueBandKind({ code: 'SCROLLLOCK' })).toBe('nav')
    expect(valueBandKind({ code: 'PAUSE_BREAK', symbol: '⏸' })).toBe('nav')
    expect(valueBandKind({ code: 'KP_NUM' })).toBe('nav')
    expect(valueBandKind({ code: 'LSLCK' })).toBe('codes')
    expect(valueBandKind({ code: 'SYSREQ' })).toBe('codes')
    expect(valueBandKind({ code: 'K_MUTE' })).toBe('media')
    expect(valueBandKind({ code: 'K_MUTE2', symbol: '🔇' })).toBe('media')
    expect(valueBandKind({ code: 'K_VOL_DN2' })).toBe('media')
    expect(valueBandKind({ code: 'K_CUT' })).toBe('edit')
    expect(valueBandKind({ code: 'K_FIND' })).toBe('edit')
    expect(valueBandKind({ code: 'K_APP' })).toBe('extras')
    expect(valueBandKind({ code: 'KP_EQUAL_AS400' })).toBe('codes')
    expect(valueBandKind({ code: 'KP_MINUS', symbol: '-' })).toBe('punct')
    expect(valueBandKind({ code: 'MINUS' })).toBe('punct')
    expect(valueBandKind({ code: 'SEMI', symbol: ';' })).toBe('punct')
    expect(valueBandKind({ code: 'COLON' })).toBe('shifted')
    expect(valueBandKind({ code: 'HASH' })).toBe('shifted')
    expect(valueBandKind({ code: 'PIPE2' })).toBe('codes')
    expect(valueBandKind({ code: 'ALT_ERASE' })).toBe('codes')
    expect(valueBandKind({ code: 'LCMD', symbol: '⌘', isModifier: true })).toBe(
      'modkeys'
    )
    expect(valueBandKind({ code: 'LCTRL', isModifier: true })).toBe('modkeys')
    expect(valueBandKind({ code: 'LG', params: ['code'] })).toBe('modwraps')
  })
})

describe('valueBandCaption', () => {
  it('labels US shift aliases without calling them forbidden', () => {
    const caption = valueBandCaption('shifted')
    expect(caption?.label).toBe('LS · US')
    expect(caption?.hint).toContain('COLON is LS(SEMI)')
    expect(valueBandCaption('punct')).toBeNull()
  })
})

describe('bandCatalogChoices', () => {
  it('orders compact bands before even columns of long names', () => {
    const bands = bandCatalogChoices([
      { code: 'ALT_ERASE' },
      { code: 'BSPC' },
      { code: 'F24' },
      { code: 'A' },
      { code: 'F1' },
      { code: 'N2', symbol: '2' },
      { code: 'AMPS' }
    ])
    expect(bands.map(b => b.kind)).toEqual([
      'function',
      'digits',
      'letters',
      'shifted',
      'nav',
      'codes'
    ])
    expect(bands.find(b => b.kind === 'function')?.items.map(i => i.code)).toEqual([
      'F1',
      'F24'
    ])
    expect(bands.find(b => b.kind === 'shifted')?.items.map(i => i.code)).toEqual([
      'AMPS'
    ])
    expect(bands.find(b => b.kind === 'nav')?.items.map(i => i.code)).toEqual([
      'BSPC'
    ])
    expect(bands.find(b => b.kind === 'codes')?.items.map(i => i.code)).toEqual([
      'ALT_ERASE'
    ])
  })

  it('puts modifier keys and wraps after letters and F-keys', () => {
    const bands = bandCatalogChoices([
      { code: 'RCMD', symbol: '⌘', isModifier: true },
      { code: 'LG', params: ['code'] },
      { code: 'LCTRL', isModifier: true },
      { code: 'LC', params: ['code'] },
      { code: 'LSHFT', symbol: '⇧', isModifier: true },
      { code: 'F1' },
      { code: 'A' }
    ])
    expect(bands.map(b => b.kind)).toEqual([
      'function',
      'letters',
      'modkeys',
      'modwraps'
    ])
    expect(bands.find(b => b.kind === 'modkeys')?.items.map(i => i.code)).toEqual([
      'LSHFT',
      'LCTRL',
      'RCMD'
    ])
    expect(bands.find(b => b.kind === 'modwraps')?.items.map(i => i.code)).toEqual([
      'LC',
      'LG'
    ])
  })

  it('keeps modifiers with the core keyboard rows, ahead of media', () => {
    const bands = bandCatalogChoices([
      { code: 'K_MUTE' },
      { code: 'LCTRL', isModifier: true },
      { code: 'ESC' },
      { code: 'K_APP' }
    ])
    expect(bands.map(b => b.kind)).toEqual(['nav', 'modkeys', 'media', 'extras'])
  })

  it('puts typed marks in punct and editing keys in nav', () => {
    const bands = bandCatalogChoices([
      { code: 'MINUS' },
      { code: 'HASH' },
      { code: 'PIPE2' },
      { code: 'ESC' },
      { code: 'LEFT', symbol: '⏴' },
      { code: 'COMMA', symbol: ',' }
    ])
    expect(bands.map(b => b.kind)).toEqual(['punct', 'shifted', 'nav', 'codes'])
    expect(bands.find(b => b.kind === 'punct')?.items.map(i => i.code)).toEqual([
      'MINUS',
      'COMMA'
    ])
    expect(bands.find(b => b.kind === 'shifted')?.items.map(i => i.code)).toEqual([
      'HASH'
    ])
    expect(bands.find(b => b.kind === 'nav')?.items.map(i => i.code)).toEqual([
      'ESC'
    ])
    expect(
      bands.find(b => b.kind === 'nav')?.extraRows?.map(row => row.map(i => i.code))
    ).toEqual([['LEFT']])
    expect(bands.find(b => b.kind === 'codes')?.items.map(i => i.code)).toEqual([
      'PIPE2'
    ])
  })

  it('lifts Print Screen / Scroll Lock / Pause into nav ahead of HID dump', () => {
    const bands = bandCatalogChoices([
      { code: 'ALT_ERASE' },
      { code: 'PSCRN' },
      { code: 'SLCK' },
      { code: 'PAUSE_BREAK', symbol: '⏸' },
      { code: 'PG_DN' },
      { code: 'LSLCK' }
    ])
    expect(bands.map(b => b.kind)).toEqual(['nav', 'codes'])
    expect(bands.find(b => b.kind === 'nav')?.items.map(i => i.code)).toEqual([
      'PG_DN',
      'PSCRN',
      'SLCK',
      'PAUSE_BREAK'
    ])
    expect(bands.find(b => b.kind === 'nav')?.extraRows).toBeUndefined()
    expect(bands.find(b => b.kind === 'codes')?.items.map(i => i.code)).toEqual([
      'ALT_ERASE',
      'LSLCK'
    ])
  })

  it('splits nav into main-board keys and the jump/system row', () => {
    const bands = bandCatalogChoices([
      { code: 'ESC' },
      { code: 'DEL' },
      { code: 'INS' },
      { code: 'HOME' },
      { code: 'LEFT', symbol: '⏴' },
      { code: 'PSCRN' },
      { code: 'K_BACK', symbol: '←' }
    ])
    const nav = bands.find(b => b.kind === 'nav')
    expect(nav?.items.map(i => i.code)).toEqual(['ESC', 'DEL'])
    expect(nav?.extraRows?.map(row => row.map(i => i.code))).toEqual([
      ['INS', 'HOME', 'LEFT', 'PSCRN', 'K_BACK']
    ])
  })

  it('keeps SEMI with HID punctuation and COLON with LS aliases', () => {
    const bands = bandCatalogChoices([
      { code: 'COLON' },
      { code: 'SEMI', symbol: ';' },
      { code: 'QMARK', symbol: '?' },
      { code: 'FSLH', symbol: '/' }
    ])
    expect(bands.map(b => b.kind)).toEqual(['punct', 'shifted'])
    expect(bands.find(b => b.kind === 'punct')?.items.map(i => i.code)).toEqual([
      'SEMI',
      'FSLH'
    ])
    expect(bands.find(b => b.kind === 'shifted')?.items.map(i => i.code)).toEqual([
      'COLON',
      'QMARK'
    ])
  })

  it('lifts keyboard media and K_* extras out of the HID dump', () => {
    const bands = bandCatalogChoices([
      { code: 'K_MUTE' },
      { code: 'K_MUTE2', symbol: '🔇' },
      { code: 'K_CALC' },
      { code: 'K_STOP2' },
      { code: 'ALT_ERASE' },
      { code: 'KP_EQUAL_AS400' }
    ])
    expect(bands.map(b => b.kind)).toEqual(['media', 'extras', 'codes'])
    expect(bands.find(b => b.kind === 'media')?.items.map(i => i.code)).toEqual([
      'K_MUTE',
      'K_MUTE2'
    ])
    expect(bands.find(b => b.kind === 'extras')?.items.map(i => i.code)).toEqual([
      'K_CALC'
    ])
    expect(bands.find(b => b.kind === 'codes')?.items.map(i => i.code)).toEqual([
      'ALT_ERASE',
      'K_STOP2',
      'KP_EQUAL_AS400'
    ])
  })

  it('merges the whole Keypad group into one glyph row', () => {
    const bands = bandCatalogChoices([
      { code: 'KP_N7', symbol: '7', context: 'Keypad' },
      { code: 'KP_MINUS', symbol: '-', context: 'Keypad' },
      { code: 'KP_ENTER', symbol: '⮐', context: 'Keypad' },
      { code: 'KP_NUM', context: 'Keypad' },
      { code: 'CLEAR2', context: 'Keypad' },
      { code: 'KP_EQUAL_AS400', context: 'Keypad' }
    ])
    expect(bands.map(b => b.kind)).toEqual(['punct'])
    expect(bands[0]?.items.map(i => i.code)).toEqual([
      'KP_N7',
      'KP_MINUS',
      'KP_ENTER',
      'KP_NUM',
      'CLEAR2',
      'KP_EQUAL_AS400'
    ])
  })

  it('keeps cut/copy/paste/undo/redo/find in an edit band after modifiers', () => {
    const bands = bandCatalogChoices([
      { code: 'K_WWW' },
      { code: 'K_FIND' },
      { code: 'K_PASTE' },
      { code: 'K_APP' },
      { code: 'K_CUT' },
      { code: 'ESC' },
      { code: 'LCTRL', isModifier: true },
      { code: 'K_COPY' },
      { code: 'K_UNDO' },
      { code: 'K_REDO' }
    ])
    expect(bands.map(b => b.kind)).toEqual(['nav', 'modkeys', 'edit', 'extras'])
    expect(bands.find(b => b.kind === 'edit')?.items.map(i => i.code)).toEqual([
      'K_CUT',
      'K_COPY',
      'K_PASTE',
      'K_UNDO',
      'K_REDO',
      'K_FIND'
    ])
    expect(bands.find(b => b.kind === 'extras')?.items.map(i => i.code)).toEqual([
      'K_APP',
      'K_WWW'
    ])
  })
})
