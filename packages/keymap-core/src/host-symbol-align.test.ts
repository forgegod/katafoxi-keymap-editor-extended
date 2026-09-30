import { describe, expect, it } from 'vitest'
import {
  glyphToKeysym,
  hostLayout,
  symbolAlign,
  symbolAlignCaption,
  SYSTEM_RU_LAYOUT_ID,
  SYSTEM_US_LAYOUT_ID,
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
  })

  it('stays quiet when one shared place remains beside extra copies', () => {
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
    expect(symbolAlignCaption('LBKT', align)).toBe('')
  })

  it('marks a symbol that only one language can type', () => {
    const base = layout('en', {
      N2: ['2', '@', 'NoSymbol', 'NoSymbol']
    })
    const extra = layout('ru', {
      N2: ['2', '"', 'NoSymbol', 'NoSymbol']
    })
    const align = symbolAlign(base, extra)
    expect(symbolAlignCaption('N2', align)).toBe('Only in one language: @ "')
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
    expect(symbolAlignCaption('DOT', align)).toBe('Different position: . · Only in one language: >')
    expect(symbolAlignCaption('SLASH', align)).toBe('Different position: . · Only in one language: ,')
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
  })
})
