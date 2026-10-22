import { describe, expect, it } from 'vitest'
import { unicodeHostLayoutCompatibility } from './index.js'
import { hostLayout } from './host-layout-registry.js'
import {
  cloneHostLayoutTable, freezeHostLayoutTable, hostLayoutFromKeysyms,
  hostLayoutFromSymbols, withHostKey
} from './host-layout.js'
import {
  buildHostKeymapSnapshot, encodeHostKeymapSnapshot,
  hostLayoutFromKeymapSnapshotKeys, parseHostKeymapSnapshot
} from './host-keymap-snapshot.js'
import { hostLayoutToXkbSection } from './xkb-write.js'

const required = [
  ['N0', '0'], ['N1', '1'], ['N2', '2'], ['N3', '3'], ['N4', '4'],
  ['N5', '5'], ['N6', '6'], ['N7', '7'], ['N8', '8'], ['N9', '9'],
  ['A', 'a'], ['B', 'b'], ['C', 'c'], ['D', 'd'], ['E', 'e'], ['F', 'f'],
  ['U', 'u'], ['SPACE', 'space'], ['ENTER', 'Return']
] as const

// Use the real registry table, not a keyboard fixture or rendered legend.
const us = () => hostLayout('system-us')!

describe('Unicode host-layout compatibility', () => {
  it('accepts the standard US table through the public core API', () => {
    expect(unicodeHostLayoutCompatibility(us())).toEqual({ status: 'compatible', issues: [] })
  })

  it.each(required)('reports a remapped base output at %s', (zmk, expectedKeysym) => {
    const changed = withHostKey(us(), zmk, 0, 'x')!
    expect(unicodeHostLayoutCompatibility(changed)).toEqual({
      status: 'incompatible',
      issues: [{ zmk, expectedKeysym, actualKeysym: 'x', reason: 'remapped' }]
    })
  })

  it.each(required)('reports a missing service row at %s', (zmk, expectedKeysym) => {
    const byZmk = new Map(us().byZmk)
    byZmk.delete(zmk)
    expect(unicodeHostLayoutCompatibility({ id: 'selected-en', byZmk })).toEqual({
      status: 'incompatible',
      issues: [{ zmk, expectedKeysym, actualKeysym: null, reason: 'missing' }]
    })
  })

  it('distinguishes an unavailable selection from an incompatible table', () => {
    expect(unicodeHostLayoutCompatibility(undefined)).toEqual({ status: 'unavailable', issues: [] })
  })

  it.each(['NoSymbol', 'VoidSymbol'])('reports %s as a missing output, not a remap', actualKeysym => {
    const changed = withHostKey(us(), 'N1', 0, actualKeysym)!
    expect(unicodeHostLayoutCompatibility(changed)).toEqual({
      status: 'incompatible',
      issues: [{ zmk: 'N1', expectedKeysym: '1', actualKeysym, reason: 'missing' }]
    })
  })

  it.each([
    ['N1', 'U0031'], ['A', 'U0061'], ['U', '0x01000075'], ['SPACE', 'U0020']
  ])('accepts an equivalent character keysym at %s', (zmk, keysym) => {
    expect(unicodeHostLayoutCompatibility(withHostKey(us(), zmk, 0, keysym)!))
      .toEqual({ status: 'compatible', issues: [] })
  })

  it.each(['U000D', 'KP_Enter', 'Linefeed', 'dead_acute', 'unknown_keysym'])(
    'does not mistake %s for the Return action', keysym => {
      expect(unicodeHostLayoutCompatibility(withHostKey(us(), 'ENTER', 0, keysym)!).status)
        .toBe('incompatible')
    }
  )

  it.each(required.slice(0, 10))('ignores Shift and both AltGr levels at %s', zmk => {
    for (const level of [1, 2, 3]) {
      const changed = withHostKey(us(), zmk, level, 'dead_acute')!
      expect(unicodeHostLayoutCompatibility(changed)).toEqual({ status: 'compatible', issues: [] })
    }
  })

  it('checks only service keys, not other letter or punctuation outputs', () => {
    const changed = withHostKey(withHostKey(us(), 'Q', 0, 'Cyrillic_ya')!, 'SLASH', 0, 'NoSymbol')!
    expect(unicodeHostLayoutCompatibility(changed)).toEqual({ status: 'compatible', issues: [] })
  })

  it('uses base keysyms even when cached display glyphs disagree', () => {
    const byZmk = new Map(us().byZmk)
    byZmk.set('A', { keysyms: ['Cyrillic_a', 'A', 'a', 'a'], glyphs: ['a', 'A', 'a', 'a'] })
    expect(unicodeHostLayoutCompatibility({ id: 'system-us', byZmk }).issues).toEqual([
      { zmk: 'A', expectedKeysym: 'a', actualKeysym: 'Cyrillic_a', reason: 'remapped' }
    ])
    byZmk.set('A', { keysyms: ['a', 'NoSymbol', 'NoSymbol', 'NoSymbol'], glyphs: ['', '', '', ''] })
    expect(unicodeHostLayoutCompatibility({ id: 'not-a-registry-id', byZmk }).status).toBe('compatible')
  })

  it('reports all missing outputs in service order without filling an empty table', () => {
    const empty = freezeHostLayoutTable(hostLayoutFromKeysyms('user:empty', []))
    expect(unicodeHostLayoutCompatibility(empty)).toEqual({
      status: 'incompatible',
      issues: required.map(([zmk, expectedKeysym]) => ({
        zmk, expectedKeysym, actualKeysym: null, reason: 'missing'
      }))
    })
    expect(empty.byZmk.size).toBe(0)
  })

  it('does not mutate or cache the selected editable table', () => {
    const selected = cloneHostLayoutTable(us(), 'user:english')
    const before = structuredClone(selected)
    expect(unicodeHostLayoutCompatibility(freezeHostLayoutTable(selected)).status).toBe('compatible')
    const changed = withHostKey(selected, 'N1', 0, 'exclam')!
    const changedBefore = structuredClone(changed)
    expect(unicodeHostLayoutCompatibility(freezeHostLayoutTable(changed)).status).toBe('incompatible')
    expect(selected).toEqual(before)
    expect(changed).toEqual(changedBefore)
    expect(unicodeHostLayoutCompatibility(selected).status).toBe('compatible')
  })

  it('preserves explicit Space/Enter edits through XKB and host snapshot round trips', () => {
    const id = 'user:english'
    const selected = cloneHostLayoutTable(us(), id)
    const changed = withHostKey(withHostKey(selected, 'SPC', 0, 'nobreakspace')!, 'RET', 0, 'Tab')!
    const expected = unicodeHostLayoutCompatibility(changed)
    expect(expected.issues.map(issue => issue.zmk)).toEqual(['SPACE', 'ENTER'])
    expect(selected.byZmk.get('SPACE')?.keysyms[0]).toBe('space')
    expect(selected.byZmk.get('ENTER')?.keysyms[0]).toBe('Return')

    const xkb = hostLayoutToXkbSection(changed, { section: 'test', name: 'English test' })
    const imported = hostLayoutFromSymbols(xkb, 'test', id)
    expect(imported.byZmk).toEqual(changed.byZmk)
    expect(unicodeHostLayoutCompatibility(imported)).toEqual(expected)

    const snapshot = buildHostKeymapSnapshot({
      columns: [{ language: 'en', layoutId: id, visible: true, altGr: true, altGrShift: true }],
      open: 'en',
      keycap: ['en']
    }, [{ id, name: 'English test', language: 'en', origin: { from: 'copy', layoutId: 'system-us' }, layout: changed }])
    const text = encodeHostKeymapSnapshot(snapshot)
    const parsed = parseHostKeymapSnapshot(text)
    expect(parsed).toEqual({ ok: true, snapshot, warnings: [] })
    if (!parsed.ok) throw new Error('Snapshot did not parse')
    const restored = hostLayoutFromKeymapSnapshotKeys(id, parsed.snapshot.layouts[0].keys)
    expect(unicodeHostLayoutCompatibility(restored)).toEqual(expected)
    expect(encodeHostKeymapSnapshot(parsed.snapshot)).toBe(text)
  })

  it('does not inject service defaults into old snapshots or imported tables', () => {
    const id = 'user:old'
    const entries = [...us().byZmk].filter(([zmk]) => zmk !== 'SPACE' && zmk !== 'ENTER')
    const restored = hostLayoutFromKeymapSnapshotKeys(id, entries.map(([zmk, levels]) => ({ zmk, ...levels })))
    const imported = hostLayoutFromSymbols(
      hostLayoutToXkbSection(restored, { section: 'old', name: 'Old English' }), 'old', id
    )
    for (const table of [restored, imported]) {
      expect(unicodeHostLayoutCompatibility(table).issues).toEqual([
        { zmk: 'SPACE', expectedKeysym: 'space', actualKeysym: null, reason: 'missing' },
        { zmk: 'ENTER', expectedKeysym: 'Return', actualKeysym: null, reason: 'missing' }
      ])
      expect(table.byZmk.has('SPACE')).toBe(false)
      expect(table.byZmk.has('ENTER')).toBe(false)
    }
  })
})
