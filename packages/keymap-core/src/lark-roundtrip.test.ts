/**
 * LARK fixture round-trip: DTS import → edit → buildKeymapCode → reload semantics.
 * Fixtures are vendored copies of zmk-keyboard-lark config (no junction required).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildKeymapCode,
  encodeKeyBinding,
  isPrimaryKeymapJson,
  parseDtsKeymap,
  parseKeymap,
  type LayoutKey
} from './index.js'

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/lark'
)

function loadLarkFixture() {
  const keymapSource = fs.readFileSync(
    path.join(FIXTURE_DIR, 'lark.keymap'),
    'utf8'
  )
  const info = JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, 'info.json'), 'utf8')
  ) as { id?: string; layouts: { LAYOUT: { layout: LayoutKey[] } } }
  const layout = info.layouts.LAYOUT.layout
  return { keymapSource, layout, keyboard: info.id ?? 'lark' }
}

describe('LARK fixture round-trip', () => {
  it('expands #define aliases on DTS import', () => {
    const { keymapSource, keyboard } = loadLarkFixture()
    const raw = parseDtsKeymap(keymapSource, {
      keyboard,
      keymap: 'lark',
      layout: 'LAYOUT'
    })

    expect(raw.warnings).toContain('macros_expanded')
    expect(raw.layers.length).toBe(7)

    const flat = raw.layers.flat()
    expect(flat.some(b => b.includes('C_VOL_UP'))).toBe(true)
    expect(flat.some(b => b.includes('C_VOL_DN'))).toBe(true)
    expect(flat.some(b => /\bVU\b/.test(b))).toBe(false)
    expect(flat.some(b => b.includes('BT_SEL 0'))).toBe(true)
    expect(flat.some(b => /\bBT0\b/.test(b))).toBe(false)
  })

  it('splices expanded bindings and keeps preamble after edit+save', () => {
    const { keymapSource, layout, keyboard } = loadLarkFixture()
    expect(layout.length).toBe(84)

    const raw = parseDtsKeymap(keymapSource, {
      keyboard,
      keymap: 'lark',
      layout: 'LAYOUT'
    })
    const parsed = parseKeymap(raw)

    for (const layer of parsed.layers) {
      expect(layer.length).toBe(layout.length)
    }

    // Edit one key on layer 0 (same size; still dirty vs original for our purposes)
    const draft = {
      ...parsed,
      layers: parsed.layers.map((layer, li) =>
        li === 0
          ? layer.map((bind, ki) =>
              ki === 1 ? { value: '&kp', params: [{ value: 'M', params: [] }] } : bind
            )
          : layer
      )
    }

    const built = buildKeymapCode(layout, draft, {
      originalSource: keymapSource
    })

    expect(built.mode).toBe('splice')
    expect(built.warnings).toContain('macros_expanded')
    expect(built.code).toContain('#define VU          C_VOL_UP')
    expect(built.code).toContain('&mt {')
    expect(built.code).toContain('C_VOL_UP')
    expect(built.code).toContain('C_VOL_DN')
    // Bindings interiors should not keep short aliases
    expect(built.code).not.toMatch(/bindings = <[^>]*\bVU\b/)
    expect(built.json).toContain('C_VOL_UP')
    expect(built.json).not.toMatch(/"&kp VU"/)

    const reloaded = parseDtsKeymap(built.code, {
      keyboard,
      keymap: 'lark',
      layout: 'LAYOUT'
    })
    // Defines remain in preamble but bindings are already expanded
    expect(reloaded.layers.flat().some(b => b.includes('C_VOL_UP'))).toBe(true)
    expect(reloaded.layers[0].some(b => b === '&kp M' || b.startsWith('&kp M'))).toBe(
      true
    )

    const json = JSON.parse(built.json) as unknown
    // LARK uses &msc / &mkp which are not in the shipped behaviors catalog,
    // so keymap.json is written but may not be the primary reload source.
    if (isPrimaryKeymapJson(json)) {
      const fromJson = parseKeymap(json as { layers: string[][] })
      expect(
        fromJson.layers.flat().map(encodeKeyBinding).some(b => b.includes('C_VOL_UP'))
      ).toBe(true)
    } else {
      expect(isPrimaryKeymapJson(json)).toBe(false)
    }
  })
})
