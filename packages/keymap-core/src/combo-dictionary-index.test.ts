import { describe, expect, it } from 'vitest'
import {
  comboBindingIndexRef,
  comboDictionaryIndexHits,
  comboDictionaryIndexModel,
  typewriterIndexBandFace,
  TYPEWRITER_INDEX_KEYS
} from './combo-dictionary-index.js'
import { primarySystemLayoutId } from './host-layout-catalog.js'
import type { KeyBindingNode, LayoutKey, ZmkCombo } from './types.js'

function kp(code: string): KeyBindingNode {
  return { value: '&kp', params: [{ value: code, params: [] }] }
}

function kpWrap(wrap: string, inner: string): KeyBindingNode {
  return {
    value: '&kp',
    params: [{ value: wrap, params: [{ value: inner, params: [] }] }]
  }
}

function combo(id: string, keyPositions: number[], binding: KeyBindingNode): ZmkCombo {
  return { id, keyPositions, binding }
}

const LAYOUT: LayoutKey[] = [
  { x: 0, y: 0, row: 0, col: 0 },
  { x: 1, y: 0, row: 0, col: 1 },
  { x: 2, y: 2, row: 2, col: 2 },
  { x: 3, y: 2, row: 2, col: 3 }
]

describe('combo typewriter index', () => {
  it('maps letters, wraps, shift aliases, and F-keys onto the skeleton', () => {
    expect(comboBindingIndexRef(kp('A'))).toEqual({
      kind: 'key',
      keyId: 'a',
      band: 'base'
    })
    expect(comboBindingIndexRef(kp('LS(B)'))).toEqual({
      kind: 'key',
      keyId: 'b',
      band: 'shift'
    })
    expect(comboBindingIndexRef(kpWrap('LS', 'B'))).toEqual({
      kind: 'key',
      keyId: 'b',
      band: 'shift'
    })
    expect(comboBindingIndexRef(kp('EXCL'))).toEqual({
      kind: 'key',
      keyId: 'n1',
      band: 'shift'
    })
    expect(comboBindingIndexRef(kp('F5'))).toEqual({
      kind: 'key',
      keyId: 'f5',
      band: 'base'
    })
    expect(comboBindingIndexRef(kp('LEFT'))).toEqual({
      kind: 'key',
      keyId: 'left',
      band: 'base'
    })
    expect(comboBindingIndexRef(kp('LA(TAB)'))).toEqual({
      kind: 'mod',
      keyId: 'tab',
      wrap: 'LA',
      label: '⎇TAB'
    })
    expect(comboBindingIndexRef(kpWrap('LC', 'TAB'))).toEqual({
      kind: 'mod',
      keyId: 'tab',
      wrap: 'LC',
      label: '⌃TAB'
    })
    expect(comboBindingIndexRef(kp('LC(DEL)'))).toEqual({
      kind: 'mod',
      keyId: 'del',
      wrap: 'LC',
      label: '⌃⌦'
    })
    expect(comboBindingIndexRef({ value: '&sk', params: [{ value: 'LCTRL', params: [] }] })).toEqual({
      kind: 'key',
      keyId: 'lctrl',
      band: 'base'
    })
    expect(comboBindingIndexRef({ value: '&none', params: [] })).toEqual({ kind: 'skip' })
    expect(comboBindingIndexRef({ value: '&bootloader', params: [] })).toEqual({
      kind: 'other',
      label: 'bootloader'
    })
  })

  it('keeps Alt/Ctrl chords on the terminal key as mod chips beside the plain half', () => {
    const combos = [
      combo('tab', [0, 1], kp('TAB')),
      combo('alt_tab', [0, 1, 2], kp('LA(TAB)')),
      combo('ctrl_tab', [0, 1, 3], kpWrap('LC', 'TAB')),
      combo('sk_ctrl', [2], { value: '&sk', params: [{ value: 'LCTRL', params: [] }] })
    ]
    const hits = comboDictionaryIndexHits(combos, [2, 3])
    expect(hits.get('tab')?.base?.positions).toEqual([0, 1])
    expect(hits.get('tab')?.mods?.map(mod => mod.label)).toEqual(['⌃TAB', '⎇TAB'])
    expect(hits.get('tab')?.mods?.map(mod => mod.wrap)).toEqual(['LC', 'LA'])
    expect(hits.get('lctrl')?.base?.positions).toEqual([2])
  })

  it('peeks the fewest-extra chords when several variants share a letter', () => {
    const combos = [
      combo('l_a', [0], kp('A')),
      combo('li_a', [0, 2], kpWrap('LS', 'A')),
      combo('r_a', [1], kp('A')),
      combo('lo_a', [0, 3], kp('LEFT')),
      combo('boot', [0, 1], { value: '&bootloader', params: [] })
    ]
    const hits = comboDictionaryIndexHits(combos, [2, 3])
    expect(hits.get('a')?.base?.positions).toEqual([0, 1])
    expect(hits.get('a')?.shift?.positions).toEqual([0, 2])
    expect(hits.get('left')?.base?.positions).toEqual([0, 3])
    const model = comboDictionaryIndexModel(LAYOUT, combos)
    expect(model.hits.get('a')?.base?.positions).toEqual([0, 1])
    expect(model.other.map(item => item.label)).toEqual(['bootloader'])
  })

  it('shows y/Y and 1/! when a key has both bands and no host view', () => {
    const y = TYPEWRITER_INDEX_KEYS.find(key => key.id === 'y')
    const n1 = TYPEWRITER_INDEX_KEYS.find(key => key.id === 'n1')
    expect(y && typewriterIndexBandFace(y, 'base', null, true)).toEqual({
      packs: [],
      fallback: 'y'
    })
    expect(y && typewriterIndexBandFace(y, 'shift', null, true)).toEqual({
      packs: [],
      fallback: 'Y'
    })
    expect(n1 && typewriterIndexBandFace(n1, 'base', null, true)).toEqual({
      packs: [],
      fallback: '1'
    })
    expect(n1 && typewriterIndexBandFace(n1, 'shift', null, true)).toEqual({
      packs: [],
      fallback: '!'
    })
  })

  it('packs D as distinct en+ru faces with AltGr slots, not a joined string', () => {
    const d = TYPEWRITER_INDEX_KEYS.find(key => key.id === 'd')
    expect(d).toBeTruthy()
    const view = {
      columns: [
        {
          language: 'en' as const,
          layoutId: primarySystemLayoutId('en')!,
          visible: true,
          altGr: true,
          altGrShift: true
        },
        {
          language: 'ru' as const,
          layoutId: primarySystemLayoutId('ru')!,
          visible: true,
          altGr: true,
          altGrShift: true
        }
      ],
      open: 'ru' as const,
      keycap: ['en' as const, 'ru' as const]
    }
    const base = typewriterIndexBandFace(d!, 'base', view, true)
    const shift = typewriterIndexBandFace(d!, 'shift', view, true)
    expect(base.fallback).toBeUndefined()
    expect(base.packs.map(pack => pack.tone)).toEqual(['base', 'second'])
    expect(base.packs.map(pack => pack.glyphs[0].text)).toEqual(['d', 'в'])
    expect(base.packs.every(pack => pack.glyphs[1].alt)).toBe(true)
    expect(shift.packs.map(pack => pack.glyphs[0].text)).toEqual(['D', 'В'])
    expect(shift.packs.every(pack => pack.glyphs[1].alt)).toBe(true)
    expect(JSON.stringify(base)).not.toContain('"dв"')
  })
})
