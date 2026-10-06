/**
 * Property tests: encodeKeymap/parseKeymap trees and spliceBindingsIntoDts
 * preamble stability. Keys and modifiers come from the real catalogs.
 * Multi-arg nests (FOO(BAR(A,B),C)) are covered by unit tests below; the
 * property arb stays on catalog unary wraps and hold-tap shapes.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { spliceBindingsIntoDts } from './dts-splice.js'
import { encodeKeyBinding, encodeKeymap, parseKeymap } from './keymap.js'
import {
  bindingArb,
  leaf,
  modifierKeys,
  terminalKeys,
  wrapChain,
  wrapCodes
} from './testing/binding-arbitraries.js'
import type { LayoutKey } from './types.js'

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

  it('round-trips multi-arg nests and unary wraps', () => {
    const multiArg = {
      value: '&kp',
      params: [
        {
          value: 'FOO',
          params: [
            {
              value: 'BAR',
              params: [leaf('A'), leaf('B')]
            },
            leaf('C')
          ]
        }
      ]
    }
    const unary = {
      value: '&kp',
      params: [wrapChain(['LC', 'LS'], 'A')]
    }
    expect(encodeKeyBinding(multiArg)).toBe('&kp FOO(BAR(A,B),C)')
    expect(encodeKeyBinding(unary)).toBe('&kp LC(LS(A))')
    expect(parseKeymap(encodeKeymap({ layers: [[multiArg, unary]] }))).toEqual({
      layers: [[multiArg, unary]]
    })
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
        })
        expect(spliced.slice(0, spliced.indexOf(KEYMAP_MARK))).toBe(SPLICE_PREFIX)
      }),
      { numRuns: 100 }
    )
  })
})
