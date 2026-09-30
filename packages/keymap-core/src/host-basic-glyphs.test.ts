import { describe, expect, it } from 'vitest'
import {
  hostLayout,
  keypadCoveredGlyphs,
  missingBasicGlyphs,
  parseKeyBinding,
  SYSTEM_DE_LAYOUT_ID,
  SYSTEM_RU_LAYOUT_ID,
  SYSTEM_UA_LAYOUT_ID,
  SYSTEM_US_LAYOUT_ID,
  withHostKey,
  type HostLayout,
  type ParsedKeymap
} from './index.js'

function dropGlyphs(layout: HostLayout, glyphs: readonly string[]): HostLayout {
  const drop = new Set(glyphs)
  let next = layout
  for (const [zmk, row] of layout.byZmk) {
    for (let level = 0; level < row.glyphs.length; level++) {
      if (!drop.has(row.glyphs[level] ?? '')) continue
      const updated = withHostKey(next, zmk, level, 'NoSymbol')
      if (updated) next = updated
    }
  }
  return next
}

describe('missingBasicGlyphs', () => {
  const us = hostLayout(SYSTEM_US_LAYOUT_ID)!
  const ru = hostLayout(SYSTEM_RU_LAYOUT_ID)!

  it('stays empty for each primary system layout', () => {
    expect(missingBasicGlyphs(us, 'en')).toEqual([])
    expect(missingBasicGlyphs(ru, 'ru')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(SYSTEM_UA_LAYOUT_ID)!, 'uk')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(SYSTEM_DE_LAYOUT_ID)!, 'de')).toEqual([])
  })

  it('reports a Russian letter missing in both cases', () => {
    expect(missingBasicGlyphs(dropGlyphs(ru, ['ъ', 'Ъ']), 'ru')).toEqual(['ъ'])
  })

  it('keeps a letter that remains in one case or only on AltGr', () => {
    expect(missingBasicGlyphs(dropGlyphs(ru, ['ъ']), 'ru')).toEqual([])
    const without = dropGlyphs(ru, ['ё', 'Ё'])
    const onAltGr = withHostKey(without, 'T', 2, 'Cyrillic_io')!
    expect(missingBasicGlyphs(onAltGr, 'ru')).not.toContain('ё')
    expect(missingBasicGlyphs(without, 'ru')).toContain('ё')
  })

  it('reports a typewriter mark the language normally has', () => {
    expect(missingBasicGlyphs(dropGlyphs(ru, [';']), 'ru')).toEqual([';'])
    expect(missingBasicGlyphs(dropGlyphs(us, ['/']), 'en')).toContain('/')
  })

  it('treats a keypad binding as the glyph and ignores a shifted alias', () => {
    const bare = dropGlyphs(ru, ['3', '4', '+', '-', 'ъ', 'Ъ'])
    expect(missingBasicGlyphs(bare, 'ru')).toEqual(['ъ', '3', '4', '-', '+'])
    const keymap: ParsedKeymap = {
      layers: [
        ['&kp KP_N3', '&kp KC_KP_N4', '&mt LSHIFT KP_PLUS', '&kp PLUS', '&kp KP_MINUS'].map(
          parseKeyBinding
        )
      ]
    }
    const covered = keypadCoveredGlyphs(keymap)
    expect(missingBasicGlyphs(bare, 'ru', covered)).toEqual(['ъ'])
  })

  it('ignores a mark the primary system layout does not produce', () => {
    const bare = dropGlyphs(ru, ['<', '>'])
    expect(missingBasicGlyphs(bare, 'ru')).not.toContain('<')
    expect(missingBasicGlyphs(bare, 'ru')).not.toContain('>')
  })
})
