import { describe, expect, it } from 'vitest'
import {
  bandCatalogChoices,
  catalogChoiceTooltip,
  catalogKeyChoices,
  displayChoiceLabel,
  readModifierChain,
  toggleModifierWraps,
  writeModifierChain,
  collectUsedKeycodes,
  collectUsedKeycodesOnLayer,
  groupChoicesByContext,
  initialTaxonomyContexts,
  behaviorFirmwareNote,
  isInstantBehavior,
  nextTaxonomyContexts,
  representativeLabel,
  sortBehaviorsByRole,
  uniqueCatalogChoices,
  valueBandCaption,
  valueBandKind
} from './picker-model.js'

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
    expect(displayChoiceLabel(peers[0], peers)).toBe('L⌘')
    expect(displayChoiceLabel(peers[1], peers)).toBe('R⌘')
    expect(displayChoiceLabel(peers[2], peers)).toBe('LG(…)')
  })

  it('hides the K_ prefix on extras chips, not leftover K_*2 codes', () => {
    expect(displayChoiceLabel({ code: 'K_MUTE' })).toBe('MUTE')
    expect(displayChoiceLabel({ code: 'K_SCROLL_DOWN' })).toBe('SCROLL_DOWN')
    expect(displayChoiceLabel({ code: 'K_MUTE2' })).toBe('K_MUTE2')
    expect(displayChoiceLabel({ code: 'K_MUTE', symbol: '🔇' })).toBe('🔇')
  })

  it('marks US shift aliases as LS of the HID key', () => {
    expect(displayChoiceLabel({ code: 'COLON' })).toBe('⇧:')
    expect(displayChoiceLabel({ code: 'SEMI', symbol: ';' })).toBe(';')
    expect(displayChoiceLabel({ code: 'QMARK', symbol: '?' })).toBe('⇧?')
    expect(displayChoiceLabel({ code: 'BSLH', symbol: '\\' })).toBe('\\')
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

  it('drops wrappers from the value catalog', () => {
    const unique = catalogKeyChoices([
      { code: 'A' },
      { code: 'LC', params: ['code'] },
      { code: 'LCTRL', isModifier: true }
    ])
    expect(unique.map(c => c.code)).toEqual(['A', 'LCTRL'])
  })
})

describe('uniqueCatalogChoices', () => {
  it('keeps the shortest alias and the LC wrapper separately', () => {
    const unique = uniqueCatalogChoices([
      {
        code: 'LCONTROL',
        aliases: ['LCTRL', 'LCONTROL'],
        symbol: 'LCTRL',
        isModifier: true,
        params: []
      },
      {
        code: 'LCTRL',
        aliases: ['LCTRL', 'LCONTROL'],
        symbol: 'LCTRL',
        isModifier: true,
        params: []
      },
      {
        code: 'LC',
        aliases: ['LCTRL', 'LCONTROL'],
        symbol: 'LCTRL',
        params: ['code']
      }
    ])
    expect(unique.map(c => c.code)).toEqual(['LCTRL', 'LC'])
  })
})

describe('groupChoicesByContext', () => {
  it('groups by context and sorts Keyboard first, then by label', () => {
    const groups = groupChoicesByContext([
      { code: 'C_VOL_UP', context: 'Consumer', symbol: '🔊' },
      { code: 'B', context: 'Keyboard', symbol: 'B' },
      { code: 'A', context: 'Keyboard', symbol: 'A' },
      { code: 'KP_ENTER', context: 'Keypad' },
      { code: 'BT_CLR' }
    ])

    expect(groups.map(g => g.context)).toEqual([
      'Keyboard',
      'Keypad',
      'Consumer',
      'Other'
    ])
    expect(groups[0].items.map(i => i.code)).toEqual(['A', 'B'])
    expect(groups[3].items.map(i => i.code)).toEqual(['BT_CLR'])
  })
})

describe('valueBandKind', () => {
  it('keeps letters, digits, and F-keys out of the long-code grid', () => {
    expect(valueBandKind({ code: 'A' })).toBe('letters')
    expect(valueBandKind({ code: 'N1', symbol: '1' })).toBe('digits')
    expect(valueBandKind({ code: 'F12' })).toBe('function')
    expect(valueBandKind({ code: 'ESC' })).toBe('nav')
    expect(valueBandKind({ code: 'MINUS' })).toBe('punct')
    expect(valueBandKind({ code: 'SEMI', symbol: ';' })).toBe('punct')
    expect(valueBandKind({ code: 'COLON' })).toBe('shifted')
    expect(valueBandKind({ code: 'HASH' })).toBe('shifted')
    expect(valueBandKind({ code: 'K_MUTE' })).toBe('extras')
    expect(valueBandKind({ code: 'K_MUTE2' })).toBe('codes')
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
      'ESC',
      'LEFT'
    ])
    expect(bands.find(b => b.kind === 'codes')?.items.map(i => i.code)).toEqual([
      'PIPE2'
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

  it('lifts keyboard K_* extras out of the HID dump', () => {
    const bands = bandCatalogChoices([
      { code: 'K_MUTE' },
      { code: 'K_CALC' },
      { code: 'K_MUTE2' },
      { code: 'ALT_ERASE' }
    ])
    expect(bands.map(b => b.kind)).toEqual(['extras', 'codes'])
    expect(bands.find(b => b.kind === 'extras')?.items.map(i => i.code)).toEqual([
      'K_CALC',
      'K_MUTE'
    ])
    expect(bands.find(b => b.kind === 'codes')?.items.map(i => i.code)).toEqual([
      'ALT_ERASE',
      'K_MUTE2'
    ])
  })
})

describe('sortBehaviorsByRole', () => {
  it('puts &kp first and instant bindings last', () => {
    const sorted = sortBehaviorsByRole([
      { code: '&trans', params: [] },
      { code: '&bt', params: ['command'] },
      { code: '&mo', params: ['layer'] },
      { code: '&kp', params: ['code'] },
      { code: '&none', params: [] }
    ])
    expect(sorted.map(b => b.code)).toEqual([
      '&kp',
      '&mo',
      '&bt',
      '&trans',
      '&none'
    ])
  })
})

describe('isInstantBehavior', () => {
  it('is true only when there are no params', () => {
    expect(isInstantBehavior({ params: [] })).toBe(true)
    expect(isInstantBehavior({ params: ['code'] })).toBe(false)
  })
})

describe('behaviorFirmwareNote', () => {
  it('reminds pointing behaviours need CONFIG_ZMK_POINTING', () => {
    for (const code of ['&mkp', '&msc', '&mmv']) {
      expect(behaviorFirmwareNote(code)).toContain('CONFIG_ZMK_POINTING=y')
      expect(behaviorFirmwareNote(code)).toContain('pointing.h')
    }
  })

  it('is silent for ordinary key and layer behaviours', () => {
    expect(behaviorFirmwareNote('&kp')).toBeNull()
    expect(behaviorFirmwareNote('&mo')).toBeNull()
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

describe('taxonomy contexts', () => {
  const groups = groupChoicesByContext([
    { code: 'A', context: 'Keyboard' },
    { code: 'KP_ENTER', context: 'Keypad' },
    { code: 'C_VOL_UP', context: 'Consumer Media' }
  ])

  it('defaults to Keyboard and Keypad', () => {
    expect(initialTaxonomyContexts(groups)).toEqual(['Keyboard', 'Keypad'])
  })

  it('opens on the current value group when it is not the home pair', () => {
    expect(initialTaxonomyContexts(groups, 'C_VOL_UP')).toEqual([
      'Consumer Media'
    ])
  })

  it('restores the home pair from Keyboard or Keypad', () => {
    expect(nextTaxonomyContexts(groups, 'Keyboard')).toEqual([
      'Keyboard',
      'Keypad'
    ])
  })

  it('replaces the view for other subgroups', () => {
    expect(nextTaxonomyContexts(groups, 'Consumer Media')).toEqual([
      'Consumer Media'
    ])
  })
})

describe('collectUsedKeycodesOnLayer', () => {
  it('collects &kp taps and the tap plus modifier of &mt', () => {
    const used = collectUsedKeycodesOnLayer([
      { value: '&kp', params: [{ value: 'A', params: [] }] },
      {
        value: '&mt',
        params: [
          { value: 'LCTRL', params: [] },
          { value: 'B', params: [] }
        ]
      },
      { value: '&kp', params: [{ value: 'SPC', params: [] }] },
      { value: '&trans', params: [] }
    ])

    expect([...used].sort()).toEqual(['A', 'B', 'LCTRL', 'SPC'])
  })

  it('unwraps a modifier chain to the terminal key', () => {
    const used = collectUsedKeycodesOnLayer([
      {
        value: '&lt',
        params: [
          { value: 1, params: [] },
          { value: 'LS', params: [{ value: 'CAPS', params: [] }] }
        ]
      },
      { value: '&mo', params: [{ value: 2, params: [] }] }
    ])

    expect([...used]).toEqual(['CAPS'])
  })

  it('returns an empty set for missing layers', () => {
    expect(collectUsedKeycodesOnLayer(undefined).size).toBe(0)
  })
})

describe('collectUsedKeycodes', () => {
  it('lists each layer index once, across the keymap', () => {
    const layer = (code: string) => [
      { value: '&kp', params: [{ value: code, params: [] }] }
    ]
    const used = collectUsedKeycodes([
      layer('Q'),
      [{ value: '&none', params: [] }],
      layer('F7'),
      undefined,
      [
        { value: '&kp', params: [{ value: 'Q', params: [] }] },
        { value: '&kp', params: [{ value: 'Q', params: [] }] }
      ]
    ])

    expect(used.get('Q')).toEqual([0, 4])
    expect(used.get('F7')).toEqual([2])
    expect(used.has('1')).toBe(false)
  })
})
