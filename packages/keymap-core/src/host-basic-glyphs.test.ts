import { describe, expect, it } from 'vitest'
import {
  hostLayout,
  keypadCoveredGlyphs,
  missingBasicGlyphs,
  parseKeyBinding,
  SYSTEM_BG_LAYOUT_ID,
  SYSTEM_BR_LAYOUT_ID,
  SYSTEM_CS_LAYOUT_ID,
  SYSTEM_DA_LAYOUT_ID,
  SYSTEM_DE_LAYOUT_ID,
  SYSTEM_EL_LAYOUT_ID,
  SYSTEM_ES_LAYOUT_ID,
  SYSTEM_FI_LAYOUT_ID,
  SYSTEM_FR_LAYOUT_ID,
  SYSTEM_HU_LAYOUT_ID,
  SYSTEM_IT_LAYOUT_ID,
  SYSTEM_NO_LAYOUT_ID,
  SYSTEM_PL_LAYOUT_ID,
  SYSTEM_PT_LAYOUT_ID,
  SYSTEM_RO_LAYOUT_ID,
  SYSTEM_RU_LAYOUT_ID,
  SYSTEM_SV_LAYOUT_ID,
  SYSTEM_TR_LAYOUT_ID,
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
    expect(missingBasicGlyphs(hostLayout(SYSTEM_FR_LAYOUT_ID)!, 'fr')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(SYSTEM_PL_LAYOUT_ID)!, 'pl')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(SYSTEM_ES_LAYOUT_ID)!, 'es')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(SYSTEM_IT_LAYOUT_ID)!, 'it')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(SYSTEM_PT_LAYOUT_ID)!, 'pt')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(SYSTEM_BR_LAYOUT_ID)!, 'br')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(SYSTEM_CS_LAYOUT_ID)!, 'cs')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(SYSTEM_DA_LAYOUT_ID)!, 'da')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(SYSTEM_SV_LAYOUT_ID)!, 'sv')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(SYSTEM_HU_LAYOUT_ID)!, 'hu')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(SYSTEM_TR_LAYOUT_ID)!, 'tr')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(SYSTEM_RO_LAYOUT_ID)!, 'ro')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(SYSTEM_FI_LAYOUT_ID)!, 'fi')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(SYSTEM_NO_LAYOUT_ID)!, 'no')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(SYSTEM_EL_LAYOUT_ID)!, 'el')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(SYSTEM_BG_LAYOUT_ID)!, 'bg')).toEqual([])
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
