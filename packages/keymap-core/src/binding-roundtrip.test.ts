/**
 * Property tests: encodeKeymap/parseKeymap trees and spliceBindingsIntoDts
 * preamble stability. Keys and modifiers come from the real catalogs.
 *
 * Unary nests only: parseKeyBinding's greedy `/\((.+)\)/` plus comma-split
 * cannot round-trip multi-arg wraps (e.g. FOO(BAR(A,B),C)).
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isModifierKey, isModifierWrap } from './catalog-choices.js'
import { getKeycodeCatalog } from './catalog.js'
import { spliceBindingsIntoDts } from './dts-splice.js'
import { encodeKeyBinding, encodeKeymap, parseKeymap } from './keymap.js'
import type { KeyBindingNode, LayoutKey } from './types.js'

const SAFE_TOKEN = /^[A-Za-z0-9_]+$/

const catalog = getKeycodeCatalog().list

const terminalKeys = [
  ...new Set(
    catalog
      .filter(k => k.params.length === 0 && SAFE_TOKEN.test(k.code))
      .map(k => k.code)
  )
]

const wrapCodes = [
  ...new Set(catalog.filter(k => isModifierWrap(k)).map(k => String(k.code)))
]

const modifierKeys = [
  ...new Set(
    catalog
      .filter(k => isModifierKey(k) && SAFE_TOKEN.test(String(k.code)))
      .map(k => String(k.code))
  )
]

// Layer tokens as strings: encode stringifies and parse never emits numbers,
// so a numeric `0` in the tree would fail deep equality after round-trip.
const layerTokens = ['0', '1', '2', '3'] as const

function leaf(value: string): KeyBindingNode {
  return { value, params: [] }
}

function wrapChain(wraps: string[], terminal: string): KeyBindingNode {
  return wraps.reduceRight<KeyBindingNode>(
    (inner, wrap) => ({ value: wrap, params: [inner] }),
    leaf(terminal)
  )
}

const keyArb = fc.constantFrom(...terminalKeys)
const wrapArb = fc.constantFrom(...wrapCodes)
const modArb = fc.constantFrom(...modifierKeys)
const layerArb = fc.constantFrom(...layerTokens)

/** 1–2 distinct wraps, outer-first: LS(LC(KEY)). */
const nestedWrapArb = fc.record({
  wraps: fc.uniqueArray(wrapArb, { minLength: 1, maxLength: 2 }),
  key: keyArb
})

const bindingArb: fc.Arbitrary<KeyBindingNode> = fc.oneof(
  keyArb.map(key => ({ value: '&kp', params: [leaf(key)] })),
  nestedWrapArb.map(({ wraps, key }) => ({
    value: '&kp',
    params: [wrapChain(wraps, key)]
  })),
  fc.record({ mod: modArb, key: keyArb }).map(({ mod, key }) => ({
    value: '&mt',
    params: [leaf(mod), leaf(key)]
  })),
  fc.record({ layer: layerArb, key: keyArb }).map(({ layer, key }) => ({
    value: '&lt',
    params: [leaf(layer), leaf(key)]
  }))
)

const SPLICE_SOURCE = `#define UNUSED C_VOL_UP
#include <behaviors.dtsi>

/ {
    keymap {
        compatible = "zmk,keymap";
        layer_0 {
            bindings = <
&kp A
            >;
        };
    };
};
`

const KEYMAP_MARK = 'keymap {'
const SPLICE_PREFIX = SPLICE_SOURCE.slice(0, SPLICE_SOURCE.indexOf(KEYMAP_MARK))
const SPLICE_LAYOUT: LayoutKey[] = [{ x: 0, y: 0, row: 0, col: 0 }]

describe('binding encode/parse round-trip', () => {
  it('has catalog tokens for the generator', () => {
    expect(terminalKeys.length).toBeGreaterThan(0)
    expect(wrapCodes).toEqual(expect.arrayContaining(['LS', 'LC']))
    expect(modifierKeys.length).toBeGreaterThan(0)
  })

  it('treats raw layer 0 as a filled param', () => {
    const original = parseKeymap({ layers: [['&lt 0 A']] })
    expect(original.layers[0][0].params[0]).toEqual({ value: '0', params: [] })
    expect(parseKeymap(encodeKeymap(original))).toEqual(original)
  })

  it('parseKeymap(encodeKeymap) matches the original tree', () => {
    fc.assert(
      fc.property(bindingArb, binding => {
        const original = { layers: [[binding]] }
        expect(parseKeymap(encodeKeymap(original))).toEqual(original)
      }),
      { numRuns: 100 }
    )
  })
})

describe('spliceBindingsIntoDts preamble', () => {
  it('keeps the prefix before keymap { byte-identical', () => {
    fc.assert(
      fc.property(bindingArb, binding => {
        const spliced = spliceBindingsIntoDts(SPLICE_SOURCE, {
          layout: SPLICE_LAYOUT,
          layers: [[encodeKeyBinding(binding)]],
          layerNames: ['layer_0']
        })
        expect(spliced.slice(0, spliced.indexOf(KEYMAP_MARK))).toBe(SPLICE_PREFIX)
      }),
      { numRuns: 100 }
    )
  })
})
