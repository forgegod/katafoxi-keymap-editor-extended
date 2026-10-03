import { describe, expect, it } from 'vitest'
import { builtinHostLayoutSpecs } from './host-layout-catalog.js'
import { hostLayoutFromSymbols, withHostKey, type HostLayout } from './host-layout.js'
import { windowsLocale, type WindowsLocale } from './klc-locale.js'
import {
  encodeKlc,
  hostLayoutsToCapsKlc,
  hostLayoutToKlc,
  klcBlockLines,
  klcDocument,
  klcIdentifier,
  pairedKbdId
} from './klc-write.js'

function systemLayout(id: string): HostLayout {
  const spec = builtinHostLayoutSpecs.find(item => item.id === id)
  if (!spec) throw new Error(`missing builtin ${id}`)
  return hostLayoutFromSymbols(spec.source, spec.section, spec.id, spec.files)
}

function layoutRows(text: string): Map<string, string[]> {
  const rows = new Map<string, string[]>()
  let inLayout = false
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('LAYOUT')) {
      inLayout = true
      continue
    }
    if (line.startsWith('DEADKEY') || line.startsWith('KEYNAME')) inLayout = false
    if (!inLayout || !line || line.startsWith('//')) continue
    const fields = line.split('//')[0].trim().split(/\s+/)
    if (!fields[0] || fields[0] === '-1') continue
    rows.set(fields[0].toLowerCase(), fields)
  }
  return rows
}

describe('klc export', () => {
  it('builds an eight-character KBD id from the profile name', () => {
    expect(klcIdentifier('German')).toBe('German')
    expect(klcIdentifier('My layout')).toBe('Mylayout')
    expect(klcIdentifier('12345')).toBe('L12345')
    expect(klcIdentifier('йцукен')).toBe('Layout')
    expect(pairedKbdId('English', 'Russian', 1)).toBe('EngRus01')
    expect(pairedKbdId('English', 'German', 12)).toBe('EngGer12')
    expect(pairedKbdId('English', 'Ukrainian', 99)).toBe('EngUkr99')
    expect(pairedKbdId('English', 'Russian', 0)).toBe('EngRus01')
  })

  it('writes German virtual keys, dead keys, and the de-DE locale', () => {
    const text = hostLayoutToKlc(systemLayout('system-de'), {
      name: 'German',
      locale: windowsLocale('de')
    })
    expect(text).toContain('LOCALENAME\t"de-DE"')
    expect(text).toContain('LOCALEID\t"00000407"')
    expect(text).toContain('\r\n6\t//Column 7')
    expect(text).toContain('\r\n7\t//Column 8')
    const rows = layoutRows(text)
    expect(rows.get('15')?.slice(0, 5)).toEqual(['15', 'Z', '1', 'z', 'Z'])
    expect(rows.get('2c')?.[1]).toBe('Y')
    expect(rows.get('0c')?.[1]).toBe('OEM_4')
    expect(rows.get('29')?.[3]).toBe('005e@')
    expect(text).toContain('DEADKEY\t00b4')
    expect(text).toContain('0061\t00e1\t// a -> á')
    expect(text).toContain('ENDKBD')
  })

  it('writes French AZERTY virtual keys and the fr-FR locale', () => {
    const text = hostLayoutToKlc(systemLayout('system-fr'), {
      name: 'French',
      locale: windowsLocale('fr')
    })
    expect(text).toContain('LOCALENAME\t"fr-FR"')
    expect(text).toContain('LOCALEID\t"0000040c"')
    const rows = layoutRows(text)
    expect(rows.get('10')?.[1]).toBe('A')
    expect(rows.get('11')?.[1]).toBe('Z')
    expect(rows.get('1e')?.[1]).toBe('Q')
    expect(rows.get('0c')?.[1]).toBe('OEM_4')
    expect(rows.get('32')?.[1]).toBe('OEM_COMMA')
    expect(rows.get('35')?.[1]).toBe('OEM_8')
  })

  it('keeps US virtual keys for Polish programmers and uses locale 00000415', () => {
    const text = hostLayoutToKlc(systemLayout('system-pl'), {
      name: 'Polish',
      locale: windowsLocale('pl')
    })
    expect(text).toContain('LOCALEID\t"00000415"')
    const rows = layoutRows(text)
    expect(rows.get('10')?.[1]).toBe('Q')
    expect(rows.get('0c')?.[1]).toBe('OEM_MINUS')
    expect(rows.get('15')?.[1]).toBe('Y')
  })

  it('writes Spanish punctuation virtual keys and the es-ES locale', () => {
    const text = hostLayoutToKlc(systemLayout('system-es'), {
      name: 'Spanish',
      locale: windowsLocale('es')
    })
    expect(text).toContain('LOCALENAME\t"es-ES"')
    expect(text).toContain('LOCALEID\t"0000040a"')
    const rows = layoutRows(text)
    expect(rows.get('0c')?.[1]).toBe('OEM_4')
    expect(rows.get('0d')?.[1]).toBe('OEM_6')
    expect(rows.get('35')?.[1]).toBe('OEM_MINUS')
  })

  it('writes Italian punctuation virtual keys from it.klc', () => {
    const text = hostLayoutToKlc(systemLayout('system-it'), {
      name: 'Italian',
      locale: windowsLocale('it')
    })
    expect(text).toContain('LOCALEID\t"00000410"')
    const rows = layoutRows(text)
    expect(rows.get('0c')?.[1]).toBe('OEM_4')
    expect(rows.get('1a')?.[1]).toBe('OEM_1')
    expect(rows.get('35')?.[1]).toBe('OEM_MINUS')
  })

  it('writes Brazilian ABNT2 locale 00010416', () => {
    const text = hostLayoutToKlc(systemLayout('system-br'), {
      name: 'Portuguese (Brazil)',
      locale: windowsLocale('br')
    })
    expect(text).toContain('LOCALENAME\t"pt-BR"')
    expect(text).toContain('LOCALEID\t"00010416"')
    expect(layoutRows(text).get('10')?.[1]).toBe('Q')
  })

  it('writes Portuguese (Portugal) punctuation virtual keys from pt.klc', () => {
    const text = hostLayoutToKlc(systemLayout('system-pt'), {
      name: 'Portuguese',
      locale: windowsLocale('pt')
    })
    expect(text).toContain('LOCALEID\t"00000816"')
    const rows = layoutRows(text)
    expect(rows.get('1a')?.[1]).toBe('OEM_PLUS')
    expect(rows.get('1b')?.[1]).toBe('OEM_1')
  })

  it('writes Czech SGCap on the number row and locale 00000405', () => {
    const text = hostLayoutToKlc(systemLayout('system-cz'), {
      name: 'Czech',
      locale: windowsLocale('cs')
    })
    expect(text).toContain('LOCALEID\t"00000405"')
    const lines = text.split(/\r?\n/)
    const n2 = lines.findIndex(line => line.startsWith('03\t'))
    expect(lines[n2]?.split('\t')[2]).toBe('SGCap')
    expect(lines[n2 + 1]).toBe('-1\t-1\t0\t011a')
    expect(layoutRows(text).get('0c')?.[1]).toBe('OEM_PLUS')
  })

  it('writes Hungarian zero-on-grave virtual keys', () => {
    const text = hostLayoutToKlc(systemLayout('system-hu'), {
      name: 'Hungarian',
      locale: windowsLocale('hu')
    })
    expect(text).toContain('LOCALEID\t"0000040e"')
    const rows = layoutRows(text)
    expect(rows.get('29')?.[1]).toBe('0')
    expect(rows.get('0b')?.[1]).toBe('OEM_3')
  })

  it('keeps US virtual keys for Cyrillic and uses the ru-RU locale', () => {
    const text = hostLayoutToKlc(systemLayout('system-ru'), {
      name: 'Russian',
      locale: windowsLocale('ru')
    })
    expect(text).toContain('LOCALEID\t"00000419"')
    const rows = layoutRows(text)
    expect(rows.get('10')?.slice(0, 5)).toEqual(['10', 'Q', '1', '0439', '0419'])
    expect(text).not.toContain('\r\n7\t//Column 8')
  })

  it('omits AltGr columns for a US layout and adds them when a level is filled', () => {
    const locale = windowsLocale('en')
    const plain = hostLayoutToKlc(systemLayout('system-us'), { name: 'US', locale })
    expect(plain).toContain('LOCALEID\t"00000409"')
    expect(plain).not.toContain('DEADKEY')
    expect(layoutRows(plain).get('1e')?.slice(0, 5)).toEqual(['1e', 'A', '1', 'a', 'A'])
    expect(plain).not.toMatch(/\r\n6\t\/\//)

    const edited = withHostKey(systemLayout('system-us'), 'A', 2, 'b')
    if (!edited) throw new Error('edit failed')
    const text = hostLayoutToKlc(edited, { name: 'US', locale })
    const row = layoutRows(text).get('1e')
    expect(row?.[1]).toBe('A')
    expect(row).toContain('b')
    expect(text).toContain('\r\n6\t//Column 7')
  })

  it('emits an SGCap continuation when the locale names a caps-lock character', () => {
    const base = systemLayout('system-us')
    const layout = withHostKey(withHostKey(base, 'N2', 0, 'U011B')!, 'N2', 1, '2')
    if (!layout) throw new Error('edit failed')
    const locale: WindowsLocale = {
      ...windowsLocale('en'),
      sgcapByZmk: { N2: 0x011a }
    }
    const text = hostLayoutToKlc(layout, { name: 'Czech', locale })
    const lines = text.split(/\r?\n/)
    const index = lines.findIndex(line => line.startsWith('03\t'))
    expect(lines[index]?.split('\t')[2]).toBe('SGCap')
    expect(lines[index + 1]).toBe('-1\t-1\t0\t011a')
  })

  it('lets a locale use a different spacing character for the same accent', () => {
    const layout = withHostKey(systemLayout('system-us'), 'GRAVE', 0, 'dead_acute')
    if (!layout) throw new Error('edit failed')
    const text = hostLayoutToKlc(layout, {
      name: 'US',
      locale: { ...windowsLocale('en'), deadIdByKeysym: { dead_acute: 0x0027 } }
    })
    expect(layoutRows(text).get('29')?.[3]).toBe('0027@')
    expect(text).toContain('DEADKEY\t0027')
    expect(text).toContain('0020\t0027\t')
  })
  it('puts a second alphabet on Caps Lock and keeps the base locale', () => {
    const text = hostLayoutsToCapsKlc(systemLayout('system-us'), systemLayout('system-ru'), {
      name: 'English + Russian',
      locale: windowsLocale('en')
    })
    expect(text).toContain('LOCALEID\t"00000409"')
    expect(text).toContain('KBD\tEnglishR\t"English + Russian"')
    const named = hostLayoutsToCapsKlc(systemLayout('system-us'), systemLayout('system-ru'), {
      name: 'English + Russian',
      kbdId: pairedKbdId('English', 'Russian', 1),
      locale: windowsLocale('en')
    })
    expect(named).toContain('KBD\tEngRus01\t"English + Russian"')
    expect(text).not.toContain('00000419')
    const lines = text.split(/\r?\n/)
    const q = lines.findIndex(line => line.startsWith('10\t'))
    expect(lines[q]).toBe('10\tQ\tSGCap\tq\tQ\t-1\t-1')
    expect(lines[q + 1]).toBe('-1\t-1\t0\t0439\t0419\t-1\t-1')
    const digit = lines.findIndex(line => line.startsWith('02\t'))
    expect(lines[digit]).toBe('02\t1\t0\t1\t0021\t-1\t-1')
    expect(lines[digit + 1]?.startsWith('-1\t')).toBe(false)
    const eight = lines.findIndex(line => line.startsWith('09\t'))
    expect(lines[eight]).toBe('09\t8\t0\t8\t002a\t-1\t20bd')
    expect(text).toContain('\r\n6\t//Column 7')
    expect(text).not.toContain('\r\n7\t//Column 8')
  })

  it('keeps an English AltGr symbol when the national level is empty', () => {
    const english = withHostKey(systemLayout('system-us'), 'Q', 2, 'b')
    if (!english) throw new Error('edit failed')
    const text = hostLayoutsToCapsKlc(english, systemLayout('system-ru'), {
      name: 'English + Russian',
      locale: windowsLocale('en')
    })
    const lines = text.split(/\r?\n/)
    const q = lines.findIndex(line => line.startsWith('10\t'))
    expect(lines[q]).toBe('10\tQ\tSGCap\tq\tQ\t-1\tb')
    expect(lines[q + 1]).toBe('-1\t-1\t0\t0439\t0419\t-1\tb')
  })

  it('writes national AltGr over an English symbol and into a US layout that has none', () => {
    const english = withHostKey(systemLayout('system-us'), 'E', 2, 'b')
    if (!english) throw new Error('edit failed')
    const text = hostLayoutsToCapsKlc(english, systemLayout('system-de'), {
      name: 'English + German',
      locale: windowsLocale('en')
    })
    expect(text).toContain('LOCALEID\t"00000409"')
    expect(text).toContain('\r\n6\t//Column 7')
    expect(text).toContain('\r\n7\t//Column 8')
    const lines = text.split(/\r?\n/)
    const e = lines.findIndex(line => line.startsWith('12\t'))
    expect(lines[e]).toBe('12\tE\t1\te\tE\t-1\t20ac\t20ac')
    expect(lines[e + 1]?.startsWith('-1\t')).toBe(false)
  })

  it('ends every line with CRLF so MSKLC can split key names', () => {
    const text = hostLayoutToKlc(systemLayout('system-us'), {
      name: 'US',
      locale: windowsLocale('en')
    })
    expect(text.replace(/\r\n/g, '')).not.toContain('\n')
    expect(text).not.toContain('\r\r')
    expect(text).toContain('\r\n36\t"Right Shift"\r\n')
    expect(text).toContain('\r\n4d\tRight\r\n')
    const fromCrlfSource = klcDocument(['36\t"Right Shift"\r', '4d\tRight\r'])
    expect(fromCrlfSource).toBe('36\t"Right Shift"\r\n4d\tRight')
    expect(fromCrlfSource).not.toContain('\r\r')
    expect(klcBlockLines('36\t"Right Shift"\r\n4d\tRight')).toEqual(['36\t"Right Shift"', '4d\tRight'])
  })

  it('encodes the file as UTF-16 LE with a BOM', () => {
    const text = hostLayoutToKlc(systemLayout('system-us'), {
      name: 'US',
      locale: windowsLocale('en')
    })
    const bytes = encodeKlc(text)
    expect(bytes[0]).toBe(0xff)
    expect(bytes[1]).toBe(0xfe)
    expect(new TextDecoder('utf-16le').decode(bytes.subarray(2))).toBe(text)
  })
})
