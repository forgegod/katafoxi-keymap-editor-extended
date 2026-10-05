import { primarySystemLayoutId } from './host-layout-catalog.js'
import { describe, expect, it } from 'vitest'
import {
  hostLayout,
  keypadCoveredGlyphs,
  missingBasicGlyphs,
  parseKeyBinding,
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
  const us = hostLayout(primarySystemLayoutId('en')!)!
  const ru = hostLayout(primarySystemLayoutId('ru')!)!

  it('stays empty for each primary system layout', () => {
    expect(missingBasicGlyphs(us, 'en')).toEqual([])
    expect(missingBasicGlyphs(ru, 'ru')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(primarySystemLayoutId('uk')!)!, 'uk')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(primarySystemLayoutId('de')!)!, 'de')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(primarySystemLayoutId('fr')!)!, 'fr')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(primarySystemLayoutId('pl')!)!, 'pl')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(primarySystemLayoutId('es')!)!, 'es')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(primarySystemLayoutId('it')!)!, 'it')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(primarySystemLayoutId('pt')!)!, 'pt')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(primarySystemLayoutId('br')!)!, 'br')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(primarySystemLayoutId('cs')!)!, 'cs')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(primarySystemLayoutId('da')!)!, 'da')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(primarySystemLayoutId('sv')!)!, 'sv')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(primarySystemLayoutId('hu')!)!, 'hu')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(primarySystemLayoutId('tr')!)!, 'tr')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(primarySystemLayoutId('ro')!)!, 'ro')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(primarySystemLayoutId('fi')!)!, 'fi')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(primarySystemLayoutId('no')!)!, 'no')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(primarySystemLayoutId('el')!)!, 'el')).toEqual([])
    expect(missingBasicGlyphs(hostLayout(primarySystemLayoutId('bg')!)!, 'bg')).toEqual([])
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

  it('matches Turkish dotted and dotless I without default Unicode folding', () => {
    const tr = hostLayout(primarySystemLayoutId('tr')!)!
    const withoutDotted = dropGlyphs(tr, ['i', 'İ'])
    expect(missingBasicGlyphs(withoutDotted, 'tr')).toContain('i')
    expect(missingBasicGlyphs(withoutDotted, 'tr')).not.toContain('ı')

    const withoutDotless = dropGlyphs(tr, ['ı', 'I'])
    expect(missingBasicGlyphs(withoutDotless, 'tr')).toContain('ı')
    expect(missingBasicGlyphs(withoutDotless, 'tr')).not.toContain('i')

    const onlyUpperDotted = dropGlyphs(tr, ['i'])
    expect(missingBasicGlyphs(onlyUpperDotted, 'tr')).not.toContain('i')
  })

  it('treats German sharp s cases as the same letter', () => {
    const de = hostLayout(primarySystemLayoutId('de')!)!
    const without = dropGlyphs(de, ['ß', 'ẞ'])
    expect(missingBasicGlyphs(without, 'de')).toContain('ß')
    const onlyCapital = withHostKey(without, 'MINUS', 0, 'U1E9E')!
    expect(missingBasicGlyphs(onlyCapital, 'de')).not.toContain('ß')
  })
})
