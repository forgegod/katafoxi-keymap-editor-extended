/**
 * Host profile import/export and name rules on EditorState
 * (`editor/host-legend.svelte.ts`).
 */

import {
  addHostLanguage,
  cloneHostLegendView,
  decodeKlc,
  hostLayout,
  hostLayoutsToCapsKlc,
  parseKlc,
  primarySystemLayoutId,
  sameHostLegendView,
  standardHostLegendView,
  standardLayerView,
  windowsLocale,
  withHostKey,
  type HostLayout,
  type HostLegendView
} from '@keymap-editor/keymap-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editor } from './editor.svelte.js'
import * as hostLayoutStore from './host-layout-store'
import {
  clearHostLayoutStore,
  foldHostProfileName
} from './host-layout-store'

const BOARD = {
  source: 'local' as const,
  layout: [] as { x: number; y: number; row: number; col: number }[],
  keymap: {
    keyboard: 'board',
    layers: [[{ value: '&none', params: [] }]],
    layer_names: ['base']
  }
}

function snapshotLegend(view: HostLegendView): HostLegendView {
  return cloneHostLegendView(view)
}

function expectLegendUnchanged(before: HostLegendView) {
  expect(sameHostLegendView(editor.hostLegend, before)).toBe(true)
  expect(editor.userLayouts).toEqual([])
}

function keysymTable(layout: HostLayout): Record<string, readonly string[]> {
  return Object.fromEntries(
    [...layout.byZmk.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([zmk, levels]) => [zmk, [...levels.keysyms]])
  )
}

function pairedCapsWithoutCatalogLetters(): string {
  const english = hostLayout(primarySystemLayoutId('en')!)!
  let other: HostLayout = english
  for (const zmk of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const next = withHostKey(
      withHostKey(other, zmk, 0, 'U0627')!,
      zmk,
      1,
      'U0628'
    )
    if (!next) throw new Error(`could not rewrite ${zmk}`)
    other = next
  }
  return hostLayoutsToCapsKlc(english, other, {
    name: 'English + Other',
    locale: windowsLocale('en')
  })
}

describe('editor host profiles', () => {
  beforeEach(async () => {
    editor.resetForTests()
    await clearHostLayoutStore()
    await editor.selectKeyboard(BOARD)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exports a user layout as UTF-16 LE .klc that parseKlc round-trips', async () => {
    editor.beginSaveHostProfile('en')
    expect(await editor.confirmHostProfileName('Home')).toBeNull()
    const layoutId = editor.activeProfileId('en')
    const source = hostLayout(layoutId)
    expect(source).toBeDefined()
    if (!source) throw new Error('missing user layout')

    const exported = editor.exportUserHostLayoutKlc(layoutId)
    expect(exported).not.toBeNull()
    if (!exported) throw new Error('export failed')
    expect(exported.name).toBe('Home')
    expect(exported.bytes[0]).toBe(0xff)
    expect(exported.bytes[1]).toBe(0xfe)

    const parsed = parseKlc(decodeKlc(exported.bytes))
    expect(parsed.kind).toBe('single')
    expect(parsed.description).toBe('Home')
    expect(keysymTable(parsed.base)).toEqual(keysymTable(source))

    expect(editor.exportUserHostLayoutKlc(primarySystemLayoutId('en')!)).toBeNull()
    expect(editor.exportUserHostLayoutKlc('system-us')).toBeNull()
  })

  it('returns the UI English import errors and leaves the legend unchanged', async () => {
    const xkb = `
      xkb_symbols "basic" {
        name[Group1]= "Imported EN";
        key <AD03> {[ a, A ]};
      };
    `
    const before = snapshotLegend(editor.hostLegend)

    expect(await editor.importHostLayoutFromXkb('en', xkb, 'missing', 'imported.xkb')).toBe(
      'Section “missing” was not found'
    )
    expectLegendUnchanged(before)

    expect(
      await editor.importHostLayoutFromXkb('en', 'xkb_symbols "nobody"\n', 'nobody', 'nobody.xkb')
    ).toBe('xkb symbols section "nobody" has no body')
    expectLegendUnchanged(before)

    expect(
      await editor.importHostLayoutFromXkb(
        'en',
        `
          xkb_symbols "broken" {
            include "missing(nope)"
            key <AC01> {[ a, A ]};
          };
        `,
        'broken',
        'broken.xkb'
      )
    ).toBe('Unresolved xkb include "missing(nope)"')
    expectLegendUnchanged(before)

    expect(await editor.importHostLayoutFromKlc('en', 'not a keyboard file', 'bad.klc')).toBe(
      'This .klc file has no SHIFTSTATE table.'
    )
    expectLegendUnchanged(before)

    expect(await editor.importHostLayoutFromKlc('en', pairedCapsWithoutCatalogLetters(), 'caps.klc')).toBe(
      "This file puts another alphabet on Caps Lock. Import it from that language's column."
    )
    expectLegendUnchanged(before)

    editor.hostLegend = addHostLanguage(editor.hostLegend, 'ru')
    const withoutEnglish = cloneHostLegendView(editor.hostLegend)
    withoutEnglish.columns = withoutEnglish.columns.filter(column => column.language !== 'en')
    editor.hostLegend = withoutEnglish
    const beforePaired = snapshotLegend(editor.hostLegend)
    const pairedRu = hostLayoutsToCapsKlc(
      hostLayout(primarySystemLayoutId('en')!)!,
      hostLayout(primarySystemLayoutId('ru')!)!,
      { name: 'English + Russian', locale: windowsLocale('en') }
    )
    expect(await editor.importHostLayoutFromKlc('ru', pairedRu, 'paired.klc')).toBe(
      'This .klc file names a language the legend cannot open.'
    )
    expect(sameHostLegendView(editor.hostLegend, beforePaired)).toBe(true)
    expect(editor.userLayouts).toEqual([])
  })

  it('treats Мой and мой as the same folded profile name', async () => {
    expect(foldHostProfileName('Мой')).toBe(foldHostProfileName('мой'))
    expect(foldHostProfileName('Мой')).toBe('мой')

    editor.beginSaveHostProfile('en')
    expect(await editor.confirmHostProfileName('Мой')).toBeNull()
    editor.beginSaveHostProfile('en')
    expect(await editor.confirmHostProfileName('мой')).toBe('A profile with this name already exists')
    expect(editor.userLayouts).toHaveLength(1)
    expect(editor.userLayouts[0]?.name).toBe('Мой')

    editor.beginRenameHostProfile('en')
    expect(await editor.confirmHostProfileName('мой')).toBeNull()
    expect(editor.hostProfilePrompt).toBeNull()
    expect(editor.userLayouts[0]?.name).toBe('Мой')
  })

  it('rejects empty, reserved, and ASCII-folded duplicate profile names', async () => {
    editor.beginSaveHostProfile('en')
    expect(await editor.confirmHostProfileName('  ')).toBe('Enter a profile name')
    expect(editor.hostProfilePrompt?.kind).toBe('save-as')
    expect(await editor.confirmHostProfileName('System')).toBe(
      'Name “System” is reserved for a built-in profile'
    )
    expect(editor.userLayouts).toHaveLength(0)

    expect(await editor.confirmHostProfileName('Home')).toBeNull()
    editor.beginSaveHostProfile('en')
    expect(await editor.confirmHostProfileName('home')).toBe(
      'A profile with this name already exists'
    )
  })

  it('keeps the standard legend when loadUserHostLayouts rejects', async () => {
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'ru')
    editor.userLayouts = [
      {
        id: 'user:stale',
        name: 'Stale',
        language: 'en',
        origin: { from: 'copy', layoutId: primarySystemLayoutId('en')! },
        updatedAt: 1
      }
    ]
    editor.hostAssemblies = [{ id: 'chip', view: cloneHostLegendView(editor.hostLegend) }]
    editor.layerView = { shown: [0], layer0Raw: true }
    editor.hostProfileNote = 'stale notice'

    vi.spyOn(hostLayoutStore, 'loadUserHostLayouts').mockRejectedValue(new Error('IndexedDB failed'))

    await expect(editor.restoreHostProfiles()).resolves.toBeUndefined()
    expect(sameHostLegendView(editor.hostLegend, standardHostLegendView())).toBe(true)
    expect(editor.userLayouts).toEqual([])
    expect(editor.hostAssemblies).toEqual([])
    expect(editor.layerView).toEqual(standardLayerView())
    expect(editor.hostProfileNote).toBeNull()
  })
})
