import { describe, expect, it } from 'vitest'
import { builtinHostLayoutSpecs } from './host-layout-catalog.js'
import { hostLayoutFromSymbols, withHostKey, type HostLayout } from './host-layout.js'
import { windowsLocale, type WindowsLocale } from './klc-locale.js'
import { encodeKlc, hostLayoutsToCapsKlc, hostLayoutToKlc, klcIdentifier } from './klc-write.js'

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
    expect(text).toContain('\r\n36\t"Right Shift"\r\n')
    expect(text).toContain('\r\n4d\tRight\r\n')
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
