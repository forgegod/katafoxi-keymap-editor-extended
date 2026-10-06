import { describe, expect, it } from 'vitest'
import { builtinHostLayoutSpecs } from './host-layout-catalog.js'
import { hostLayoutFromSymbols, withHostKey, type HostLayout } from './host-layout.js'
import { decodeKlc, parseKlc } from './klc-read.js'
import { windowsLocale, type WindowsLocale } from './klc-locale.js'
import { encodeKlc, hostLayoutsToCapsKlc, hostLayoutToKlc } from './klc-write.js'

function systemLayout(id: string): HostLayout {
  const spec = builtinHostLayoutSpecs.find(item => item.id === id)
  if (!spec) throw new Error(`missing builtin ${id}`)
  return hostLayoutFromSymbols(spec.source, spec.section, spec.id, spec.files)
}

function glyphs(layout: HostLayout, zmk: string): readonly string[] | undefined {
  return layout.byZmk.get(zmk)?.glyphs
}

describe('parseKlc', () => {
  it('decodes the UTF-16 LE file the writer emits', () => {
    const text = hostLayoutToKlc(systemLayout('system-us'), {
      name: 'US',
      locale: windowsLocale('en')
    })
    expect(decodeKlc(encodeKlc(text))).toBe(text)
  })

  it('reads a one-language file back onto the same keys', () => {
    const source = systemLayout('system-ru')
    const parsed = parseKlc(
      hostLayoutToKlc(source, { name: 'Russian', locale: windowsLocale('ru') })
    )
    expect(parsed.kind).toBe('single')
    expect(parsed.baseLanguage).toBe('ru')
    expect(parsed.caps).toBeUndefined()
    expect(parsed.warnings).toEqual([])
    expect(glyphs(parsed.base, 'Q')).toEqual(glyphs(source, 'Q'))
    expect(glyphs(parsed.base, 'N8')).toEqual(glyphs(source, 'N8'))
    for (const [zmk, levels] of parsed.base.byZmk) {
      expect(levels.glyphs, zmk).toEqual(glyphs(source, zmk))
    }
  })

  it('keeps a known dead key and ignores its composition table when the table matches', () => {
    const source = systemLayout('system-de')
    const parsed = parseKlc(
      hostLayoutToKlc(source, { name: 'German', locale: windowsLocale('de') })
    )
    expect(parsed.kind).toBe('single')
    expect(parsed.baseLanguage).toBe('de')
    expect(parsed.warnings).toEqual([])
    expect(parsed.base.byZmk.get('GRAVE')?.keysyms[0]).toBe(source.byZmk.get('GRAVE')?.keysyms[0])
    expect(glyphs(parsed.base, 'Y')).toEqual(glyphs(source, 'Y'))
  })

  it('leaves a short Caps Lock override in the one layout', () => {
    const layout = withHostKey(withHostKey(systemLayout('system-us'), 'N2', 0, 'U011B')!, 'N2', 1, '2')
    if (!layout) throw new Error('edit failed')
    const locale: WindowsLocale = { ...windowsLocale('en'), sgcapByZmk: { N2: 0x011a } }
    const parsed = parseKlc(hostLayoutToKlc(layout, { name: 'Czech', locale }))
    expect(parsed.kind).toBe('single')
    expect(parsed.capsLanguage).toBeNull()
    expect(glyphs(parsed.base, 'N2')?.[0]).toBe('ě')
    expect(parsed.warnings).toEqual(['Caps Lock characters that differ from Shift were left out.'])
  })

  it('splits a Caps Lock alphabet into the base language and the national language', () => {
    const english = systemLayout('system-us')
    const russian = systemLayout('system-ru')
    const parsed = parseKlc(
      hostLayoutsToCapsKlc(english, russian, {
        name: 'English + Russian',
        locale: windowsLocale('en')
      })
    )
    expect(parsed.kind).toBe('paired')
    expect(parsed.description).toBe('English + Russian')
    expect(parsed.baseLanguage).toBe('en')
    expect(parsed.capsLanguage).toBe('ru')
    expect(glyphs(parsed.base, 'Q')?.slice(0, 2)).toEqual(['q', 'Q'])
    expect(glyphs(parsed.base, 'Q')?.slice(2)).toEqual(['', ''])
    expect(glyphs(parsed.caps!, 'Q')?.slice(0, 2)).toEqual(glyphs(russian, 'Q')?.slice(0, 2))
    expect(glyphs(parsed.caps!, 'N8')?.[2]).toBe(glyphs(russian, 'N8')?.[2])
    expect(glyphs(parsed.base, 'N8')?.[2]).toBe('')
  })

  it('keeps merged AltGr on the Caps Lock language', () => {
    const english = withHostKey(systemLayout('system-us'), 'Q', 2, 'b')
    if (!english) throw new Error('edit failed')
    const parsed = parseKlc(
      hostLayoutsToCapsKlc(english, systemLayout('system-ru'), {
        name: 'English + Russian',
        locale: windowsLocale('en')
      })
    )
    expect(glyphs(parsed.base, 'Q')?.[2]).toBe('')
    expect(glyphs(parsed.caps!, 'Q')?.[2]).toBe('b')
  })

  it('recognizes German on Caps Lock from umlauts', () => {
    const parsed = parseKlc(
      hostLayoutsToCapsKlc(systemLayout('system-us'), systemLayout('system-de'), {
        name: 'English + German',
        locale: windowsLocale('en')
      })
    )
    expect(parsed.kind).toBe('paired')
    expect(parsed.capsLanguage).toBe('de')
    expect(glyphs(parsed.caps!, 'SEMI')?.[0]).toBe(glyphs(systemLayout('system-de'), 'SEMI')?.[0])
  })

  it('rejects a file with no shift states', () => {
    expect(() => parseKlc('KBD\tX\t"X"\r\nLAYOUT\r\n10\tQ\t1\tq\tQ\r\n')).toThrow(
      'This .klc file has no SHIFTSTATE table.'
    )
  })

  it('leaves N1 and N9 alone when a LIGATURE block follows LAYOUT', () => {
    const parsed = parseKlc(`KBD\tX\t"X"
SHIFTSTATE
0
1
LAYOUT
02	1	0	1	!
0a	9	0	9	(
LIGATURE
2	1	0061	0062
9	1	0063	0064
ENDKBD
`)
    expect(glyphs(parsed.base, 'N1')).toEqual(['1', '!', '', ''])
    expect(glyphs(parsed.base, 'N9')).toEqual(['9', '(', '', ''])
  })

  it('reads a LAYOUT row with double tabs the same as with single tabs', () => {
    const header = `KBD\tX\t"X"
SHIFTSTATE
0
1
LAYOUT
`
    const single = parseKlc(`${header}02\t1\t0\t1\t!\nENDKBD\n`)
    const doubled = parseKlc(`${header}02\t\t1\t0\t1\t!\nENDKBD\n`)
    expect(glyphs(doubled.base, 'N1')).toEqual(glyphs(single.base, 'N1'))
    expect(glyphs(doubled.base, 'N1')).toEqual(['1', '!', '', ''])
  })

  it('keeps a KBD description that has spaces and a // comment inside quotes', () => {
    const parsed = parseKlc(`KBD MyKbd "My Layout // draft"
SHIFTSTATE
0
1
LAYOUT
02	1	0	1	!
ENDKBD
`)
    expect(parsed.kbdId).toBe('MyKbd')
    expect(parsed.description).toBe('My Layout // draft')
  })
})
