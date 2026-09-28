import { describe, expect, it } from 'vitest'
import {
  applyAltGrCopy,
  glyphToKeysym,
  hostLayout,
  planAltGrCopy,
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

  it('marks punctuation that moved and skips letters', () => {
    const align = symbolAlign(us, ru)
    expect(symbolAlignCaption('T', align)).toBe('')
    expect(symbolAlignCaption('A', align)).toBe('')
    expect(symbolAlignCaption('N4', align)).toContain(';')
    expect(symbolAlignCaption('SEMI', align)).toContain(';')
    expect(symbolAlignCaption('COMMA', align)).toContain(',')
    expect(symbolAlignCaption('SLASH', align)).toMatch(/,|\./)
    const n4 = align.byZmk.get('N4') ?? []
    expect(n4.every(item => item.glyph !== '4')).toBe(true)
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
      'Windows AltGr keeps ё, drops Δ. Windows AltGr+Shift keeps Ё, drops τ'
    )
    expect(align.conflictByZmk.has('N1')).toBe(false)
    expect(symbolAlignCaption('T', symbolAlign(base, extra, { levels: [0, 1] }))).toBe('')
  })
})

describe('planAltGrCopy', () => {
  const base = layout('en', {
    T: ['t', 'T', keysym('Δ'), keysym('τ')],
    E: ['e', 'E', 'NoSymbol', 'NoSymbol'],
    N8: ['8', '*', keysym('€'), 'NoSymbol'],
    Q: ['q', 'Q', 'NoSymbol', keysym('§')]
  })
  const extra = layout('ru', {
    T: [keysym('е'), keysym('Е'), keysym('ё'), keysym('Ё')],
    E: ['e', 'E', keysym('€'), 'NoSymbol'],
    N8: ['8', '*', 'NoSymbol', 'NoSymbol'],
    Q: ['q', 'Q', 'NoSymbol', 'NoSymbol']
  })

  it('overwrites a conflicting AltGr, fills an empty one, and leaves letters and empty national cells', () => {
    const plan = planAltGrCopy(base, extra)
    expect(plan.map(edit => `${edit.zmk}:${edit.level}:${edit.overwrites}`)).toEqual([
      'E:2:false',
      'T:2:true',
      'T:3:true'
    ])
    const next = applyAltGrCopy(base, extra)
    expect(next.byZmk.get('T')?.glyphs).toEqual(['t', 'T', 'ё', 'Ё'])
    expect(next.byZmk.get('E')?.glyphs[2]).toBe('€')
    expect(next.byZmk.get('N8')?.glyphs[2]).toBe('€')
    expect(next.byZmk.get('Q')?.glyphs[3]).toBe('§')
    expect(base.byZmk.get('T')?.glyphs[2]).toBe('Δ')
    expect(planAltGrCopy(next, extra)).toEqual([])
  })
})
