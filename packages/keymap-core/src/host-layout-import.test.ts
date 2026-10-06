import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hostLayoutFromXkb } from './host-layout-import.js'
import { hostLayout } from './host-layout-registry.js'
import { registerLarkHostFixture } from './testing/lark-host.js'
import { listXkbSections } from './xkb-symbols.js'

const HOST_DIR = fileURLToPath(new URL('../fixtures/lark/host', import.meta.url))

function expectSameLevels(
  imported: { byZmk: ReadonlyMap<string, unknown> },
  current: { byZmk: ReadonlyMap<string, unknown> } | undefined
) {
  expect(current).toBeDefined()
  for (const [zmk, levels] of current!.byZmk) {
    expect(imported.byZmk.get(zmk), zmk).toEqual(levels)
  }
}

describe('listXkbSections', () => {
  it('returns section ids and name[Group1]', () => {
    const text = `
      xkb_symbols "basic" {
        name[Group1]= "English (Australian)";
        key <AC01> {[ a, A ]};
      };
      xkb_symbols "legacy" {
        name[Group1]= "Russian (legacy)";
        key <AC01> {[ Cyrillic_ef, Cyrillic_EF ]};
      };
    `
    expect(listXkbSections(text)).toEqual([
      { section: 'basic', name: 'English (Australian)' },
      { section: 'legacy', name: 'Russian (legacy)' }
    ])
  })

  it('uses the section id when name[Group1] is missing', () => {
    expect(listXkbSections('xkb_symbols "extra" { key <AC01> {[ a, A ]}; }')).toEqual([
      { section: 'extra', name: 'extra' }
    ])
  })
})

describe('hostLayoutFromXkb', () => {
  it('imports fixtures/lark/host/au with the same levels as lark-en', () => {
    registerLarkHostFixture()
    const text = readFileSync(path.join(HOST_DIR, 'au'), 'utf8')
    const imported = hostLayoutFromXkb(text, 'basic', { fileName: 'au' })
    expectSameLevels(imported, hostLayout('lark-en'))
  })

  it('imports fixtures/lark/host/ru with the same levels as lark-ru, including LSGT', () => {
    registerLarkHostFixture()
    const text = readFileSync(path.join(HOST_DIR, 'ru'), 'utf8')
    const imported = hostLayoutFromXkb(text, 'legacy', { fileName: 'ru' })
    const current = hostLayout('lark-ru')
    expectSameLevels(imported, current)
    // ru(common) defines LSGT; the registered fixture drops that include-only key.
    expect(imported.byZmk.has('NON_US_BSLH')).toBe(true)
    expect(current?.byZmk.has('NON_US_BSLH')).toBe(false)
  })

  it('prefers same-file ru(common) over the vendored ru module', () => {
    const text = `
      xkb_symbols "common" {
        key <AC01> {[ x, X ]};
      };
      xkb_symbols "winkeys" {
        include "ru(common)"
      };
    `
    const layout = hostLayoutFromXkb(text, 'winkeys', { fileName: 'ru.xkb' })
    expect(layout.byZmk.get('A')?.keysyms[0]).toBe('x')
  })

  it('resolves include us(basic) against the vendored us file', () => {
    const text = `
      xkb_symbols "custom" {
        include "us(basic)"
        name[Group1]= "Custom US";
        key <AD03> {[ Greek_alpha, Greek_ALPHA, at, numbersign ]};
      };
    `
    const layout = hostLayoutFromXkb(text, 'custom', { fileName: 'custom' })
    expect(layout.byZmk.get('E')?.glyphs).toEqual(['α', 'Α', '@', '#'])
    expect(layout.byZmk.get('A')?.glyphs).toEqual(['a', 'A', '', ''])
  })

  it('names an unresolvable include in the error', () => {
    const text = `
      xkb_symbols "broken" {
        include "missing(nope)"
        key <AC01> {[ a, A ]};
      };
    `
    expect(() => hostLayoutFromXkb(text, 'broken', { fileName: 'broken' })).toThrow(
      'Unresolved xkb include "missing(nope)"'
    )
  })

  it('imports a file with level3(ralt_switch) and warns', () => {
    const text = `
      xkb_symbols "basic" {
        include "level3(ralt_switch)"
        key <AC01> {[ a, A ]};
      };
    `
    const warnings: string[] = []
    const layout = hostLayoutFromXkb(text, 'basic', { fileName: 'custom', warnings })
    expect(layout.byZmk.get('A')?.keysyms[0]).toBe('a')
    expect(warnings).toEqual(['Skipped xkb include "level3(ralt_switch)": non-character module.'])
  })

  it('throws on cyclic includes with the cycle path', () => {
    const text = `
      xkb_symbols "a" {
        include "cycle(b)"
        key <AC01> {[ a, A ]};
      };
      xkb_symbols "b" {
        include "cycle(a)"
        key <AC02> {[ s, S ]};
      };
    `
    expect(() => hostLayoutFromXkb(text, 'a', { fileName: 'cycle' })).toThrow(
      'Cyclic xkb include: cycle:a → cycle:b → cycle:a'
    )
  })
})
