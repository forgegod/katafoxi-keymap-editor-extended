import { describe, expect, it } from 'vitest'
import { hostLayoutFromXkb } from './host-layout-import.js'
import { hostLayout } from './host-layout-registry.js'
import { LARK_AU_BASIC, LARK_RU_LEGACY } from './lark-host-symbols.js'
import { listXkbSections } from './xkb-symbols.js'

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
  it('imports LARK au/basic with the same levels as lark-en', () => {
    // fixtures/lark/host/ is not present yet (T4). Compare against the
    // current registry layouts using lark-host-symbols.ts as the xkb text.
    const imported = hostLayoutFromXkb(LARK_AU_BASIC, 'basic', { fileName: 'au' })
    expectSameLevels(imported, hostLayout('lark-en'))
  })

  it('imports LARK ru/legacy with the same levels as lark-ru', () => {
    const imported = hostLayoutFromXkb(LARK_RU_LEGACY, 'legacy', { fileName: 'ru' })
    const current = hostLayout('lark-ru')
    expectSameLevels(imported, current)
    // ru(common) also defines LSGT; current lark-ru skipped that include.
    expect(imported.byZmk.has('NON_US_BSLH')).toBe(true)
    expect(current?.byZmk.has('NON_US_BSLH')).toBe(false)
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
        include "level3(ralt_switch)"
        key <AC01> {[ a, A ]};
      };
    `
    expect(() => hostLayoutFromXkb(text, 'broken', { fileName: 'broken' })).toThrow(
      'Unresolved xkb include "level3(ralt_switch)"'
    )
  })
})
