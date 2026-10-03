import { describe, expect, it } from 'vitest'
import {
  addHostLanguage,
  glyphToKeysym,
  hostLayout,
  standardHostLegendView,
  symbolAlign,
  symbolAlignCaption,
  symbolAlignHasBasic,
  symbolAlignHasOrnament,
  symbolAlignPairFromView,
  SYSTEM_FR_LAYOUT_ID,
  SYSTEM_RU_LAYOUT_ID,
  SYSTEM_US_LAYOUT_ID,
  toggleHostLanguage,
  withHostKey,
  type HostLayout
} from './index.js'

function keysym(glyph: string): string {
  const parsed = glyphToKeysym(glyph)
  if (!parsed.ok) throw new Error(parsed.reason)
  return parsed.keysym
}

function layout(id: string, rows: Record<string, readonly string[]>): HostLayout {
  let next: HostLayout = { id, byZmk: new Map() }
  for (const [zmk, levels] of Object.entries(rows)) {
    for (let level = 0; level < levels.length; level++) {
      const updated = withHostKey(next, zmk, level, levels[level]!)
      if (!updated) throw new Error(`bad key ${zmk}`)
      next = updated
    }
  }
  return next
}

describe('symbolAlign', () => {
  const us = hostLayout(SYSTEM_US_LAYOUT_ID)!
  const ru = hostLayout(SYSTEM_RU_LAYOUT_ID)!

  it('marks punctuation with no shared key and skips letters', () => {
    const align = symbolAlign(us, ru)
    expect(symbolAlignCaption('T', align)).toBe('')
    expect(symbolAlignCaption('A', align)).toBe('')
    expect(symbolAlignCaption('N4', align)).toContain('Different position: ;')
    expect(symbolAlignCaption('SEMI', align)).toContain(';')
    expect(symbolAlignCaption('COMMA', align)).toContain(',')
    expect(symbolAlignCaption('SLASH', align)).toMatch(/,|\./)
    const n4 = align.byZmk.get('N4') ?? []
    expect(n4.every(item => item.glyph !== '4')).toBe(true)
    expect(symbolAlignHasBasic('COMMA', align)).toBe(true)
  })

  it('marks a per-key basic gap when a shared place exists elsewhere', () => {
    const base = layout('en', {
      RBKT: [']', '}', 'NoSymbol', 'NoSymbol'],
      V: ['v', 'V', 'NoSymbol', 'NoSymbol']
    })
    const extra = layout('ru', {
      RBKT: [']', '}', 'NoSymbol', 'NoSymbol'],
      V: [keysym('м'), keysym('М'), '#', ']']
    })
    const align = symbolAlign(base, extra)
    expect(symbolAlignCaption('RBKT', align)).toBe('')
    expect(symbolAlignHasBasic('V', align)).toBe(true)
    expect(symbolAlignCaption('V', align)).toContain('On this key only in one language: ]')
    // `#` is ornament: global only-in-one / different position, not a basic gap.
    expect(symbolAlignCaption('V', align)).toMatch(/Only in one language: #|Different position: #/)
  })

  it('marks shared AltGr extras on LBKT as a key gap when N9 already shares', () => {
    const base = layout('en', {
      N9: ['9', '(', '[', '{'],
      LBKT: ['[', '{', 'NoSymbol', 'NoSymbol']
    })
    const extra = layout('ru', {
      N9: ['9', '(', '[', '{'],
      LBKT: [keysym('х'), keysym('Х'), 'NoSymbol', 'NoSymbol']
    })
    const align = symbolAlign(base, extra)
    expect(symbolAlignCaption('N9', align)).toBe('')
    expect(symbolAlignHasBasic('LBKT', align)).toBe(true)
    expect(symbolAlignCaption('LBKT', align)).toBe('On this key only in one language: [ {')
  })

  it('marks basic only-in-one as Linux split and ornament as mild', () => {
    const base = layout('en', {
      N2: ['2', '@', 'NoSymbol', 'NoSymbol'],
      N3: ['3', '#', 'NoSymbol', 'NoSymbol']
    })
    const extra = layout('ru', {
      N2: ['2', '"', 'NoSymbol', 'NoSymbol'],
      N3: ['3', keysym('№'), 'NoSymbol', 'NoSymbol']
    })
    const align = symbolAlign(base, extra)
    expect(symbolAlignCaption('N2', align)).toBe(
      'Only in one language (Linux split): " · Only in one language: @'
    )
    expect(symbolAlignHasBasic('N2', align)).toBe(true)
    expect(symbolAlignHasOrnament('N2', align)).toBe(true)
    expect(symbolAlignCaption('N3', align)).toBe('Only in one language: # №')
    expect(symbolAlignHasBasic('N3', align)).toBe(false)
    expect(symbolAlignHasOrnament('N3', align)).toBe(true)
  })

  it('marks a symbol that shares the key only on another level', () => {
    const base = layout('en', {
      DOT: ['.', '>', 'NoSymbol', 'NoSymbol']
    })
    const extra = layout('ru', {
      DOT: [keysym('ю'), keysym('Ю'), 'NoSymbol', 'NoSymbol'],
      SLASH: ['.', ',', 'NoSymbol', 'NoSymbol']
    })
    const align = symbolAlign(base, extra)
    expect(symbolAlignCaption('DOT', align)).toBe(
      'Different position: . · Only in one language (Linux split): >'
    )
    expect(symbolAlignCaption('SLASH', align)).toBe(
      'Different position: . · Only in one language (Linux split): ,'
    )
    expect(symbolAlignHasBasic('DOT', align)).toBe(true)
  })

  it('marks an AltGr cell Windows cannot keep for both languages', () => {
    const base = layout('en', {
      T: ['t', 'T', keysym('Δ'), keysym('τ')],
      N1: ['1', '!', keysym('€'), 'NoSymbol']
    })
    const extra = layout('ru', {
      T: [keysym('е'), keysym('Е'), keysym('ё'), keysym('Ё')],
      N1: ['1', '!', 'NoSymbol', 'NoSymbol']
    })
    const align = symbolAlign(base, extra)
    expect(symbolAlignCaption('T', align)).toBe(
      'Windows AltGr keeps ё, drops Δ · Windows AltGr+Shift keeps Ё, drops τ'
    )
    expect(align.conflictByZmk.has('N1')).toBe(false)
    expect(symbolAlignCaption('T', symbolAlign(base, extra, { levels: [0, 1] }))).toBe('')
    expect(symbolAlignCaption('T', symbolAlign(base, extra, { winMerge: null }))).toBe('')
    expect(
      symbolAlignCaption(
        'T',
        symbolAlign(extra, base, { winMerge: { base, extra }, levels: [0, 1] })
      )
    ).toBe('Windows AltGr keeps ё, drops Δ · Windows AltGr+Shift keeps Ё, drops τ')
  })

  it('compares the two keycap languages, not only English × open', () => {
    let view = addHostLanguage(addHostLanguage(standardHostLegendView(), 'ru'), 'fr')
    view = toggleHostLanguage(view, 'en')
    view = toggleHostLanguage(view, 'ru')
    const pair = symbolAlignPairFromView(view)
    expect(pair).toEqual({
      leftLanguage: 'fr',
      rightLanguage: 'ru',
      leftLayoutId: SYSTEM_FR_LAYOUT_ID,
      rightLayoutId: SYSTEM_RU_LAYOUT_ID,
      winMerge: null
    })
    const fr = hostLayout(SYSTEM_FR_LAYOUT_ID)!
    const ruLayout = hostLayout(SYSTEM_RU_LAYOUT_ID)!
    const align = symbolAlign(fr, ruLayout, { winMerge: null })
    expect(align.conflictByZmk.size).toBe(0)
    expect(symbolAlignCaption('DOT', align).length).toBeGreaterThan(0)
  })

  it('keeps Win AltGr merge only when English and open share the keycap', () => {
    const view = addHostLanguage(standardHostLegendView(), 'ru')
    expect(symbolAlignPairFromView(view)).toEqual({
      leftLanguage: 'en',
      rightLanguage: 'ru',
      leftLayoutId: SYSTEM_US_LAYOUT_ID,
      rightLayoutId: SYSTEM_RU_LAYOUT_ID,
      winMerge: {
        baseLayoutId: SYSTEM_US_LAYOUT_ID,
        extraLayoutId: SYSTEM_RU_LAYOUT_ID
      }
    })
  })
})
