import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { HOST_KEY_IDS } from './host-key-id.js'
import { builtinHostLayoutSpecs } from './host-layout-catalog.js'
import { hostLayoutFromSymbols, type HostKeyLevels, type HostLayout } from './host-layout.js'
import { hostLayoutToXkbSection } from './xkb-write.js'

const LARK_HOST_DIR = fileURLToPath(new URL('../fixtures/lark/host', import.meta.url))

function byZmkRecord(layout: HostLayout): Record<string, HostKeyLevels> {
  return Object.fromEntries(
    [...layout.byZmk.entries()].sort(([left], [right]) => left.localeCompare(right))
  )
}

function writtenKeyNames(text: string): string[] {
  return [...text.matchAll(/key\s*<([A-Za-z0-9]+)>/g)].map(match => match[1])
}

function writtenKeysymCounts(text: string): number[] {
  return [...text.matchAll(/key\s*<[A-Za-z0-9]+>\s*\{\s*\[([^\]]*)\]\s*\}/g)].map(match =>
    match[1]
      .split(',')
      .map(item => item.trim())
      .filter(Boolean).length
  )
}

function expectedKeyOrder(layout: HostLayout): string[] {
  return HOST_KEY_IDS.filter(host => layout.byZmk.has(host.zmk)).map(host => host.xkb)
}

function roundTrip(
  source: string,
  section: string,
  id: string,
  files?: Parameters<typeof hostLayoutFromSymbols>[3],
  name = id
): { original: HostLayout; written: string; again: HostLayout } {
  const original = hostLayoutFromSymbols(source, section, id, files)
  const written = hostLayoutToXkbSection(original, { section, name })
  const again = hostLayoutFromSymbols(written, section, id)
  return { original, written, again }
}

describe('hostLayoutToXkbSection', () => {
  const layout: HostLayout = {
    id: 'sample',
    byZmk: new Map([
      [
        'A',
        {
          keysyms: ['a', 'A', 'at', 'Greek_alpha'],
          glyphs: ['a', 'A', '@', 'α']
        }
      ],
      [
        'N1',
        {
          keysyms: ['1', 'exclam', 'NoSymbol', 'NoSymbol'],
          glyphs: ['1', '!', '', '']
        }
      ],
      [
        'RALT',
        {
          keysyms: ['ISO_Level3_Shift', 'Multi_key', 'NoSymbol', 'NoSymbol'],
          glyphs: ['', '', '', '']
        }
      ]
    ])
  }

  it('writes a standalone section with keys in HOST_KEY_IDS order', () => {
    const text = hostLayoutToXkbSection(layout, { section: 'basic', name: 'Sample' })
    expect(text).toContain('xkb_symbols "basic"')
    expect(text).toContain('name[Group1]= "Sample";')
    expect(text).not.toMatch(/\binclude\b/)
    expect(writtenKeyNames(text)).toEqual(['AE01', 'AC01', 'RALT'])
    expect(writtenKeyNames(text)).toEqual(expectedKeyOrder(layout))
    expect(writtenKeysymCounts(text)).toEqual([4, 4, 4])
    expect(text).not.toContain('TLDE')
    expect(text).toContain('key <AC01> { [ a, A, at, Greek_alpha ] };')
  })

  it('round-trips the sample through parse → write → parse', () => {
    const written = hostLayoutToXkbSection(layout, { section: 'basic', name: 'Sample' })
    const again = hostLayoutFromSymbols(written, 'basic', 'sample')
    expect(byZmkRecord(again)).toEqual(byZmkRecord(layout))
  })
})

describe('xkb host layout round-trip', () => {
  it(`keeps byZmk on all ${builtinHostLayoutSpecs.length} builtin sections`, () => {
    expect(builtinHostLayoutSpecs.length).toBeGreaterThan(0)
    for (const spec of builtinHostLayoutSpecs) {
      const { original, written, again } = roundTrip(
        spec.source,
        spec.section,
        spec.id,
        spec.files,
        spec.name
      )
      expect(written, spec.id).not.toMatch(/\binclude\b/)
      expect(writtenKeyNames(written), spec.id).toEqual(expectedKeyOrder(original))
      expect(writtenKeysymCounts(written), spec.id).toEqual(
        expectedKeyOrder(original).map(() => 4)
      )
      expect(byZmkRecord(again), spec.id).toEqual(byZmkRecord(original))
    }
  })

  it('keeps byZmk on the LARK au(basic) and ru(legacy) fixtures', () => {
    const cases = [
      {
        source: readFileSync(path.join(LARK_HOST_DIR, 'au'), 'utf8'),
        section: 'basic',
        id: 'lark-en',
        name: 'English (Australian)'
      },
      {
        source: readFileSync(path.join(LARK_HOST_DIR, 'ru'), 'utf8'),
        section: 'legacy',
        id: 'lark-ru',
        name: 'Russian (legacy)'
      }
    ]
    for (const spec of cases) {
      const { original, written, again } = roundTrip(
        spec.source,
        spec.section,
        spec.id,
        undefined,
        spec.name
      )
      expect(written, spec.id).not.toMatch(/\binclude\b/)
      expect(writtenKeyNames(written), spec.id).toEqual(expectedKeyOrder(original))
      expect(byZmkRecord(again), spec.id).toEqual(byZmkRecord(original))
    }
  })
})
