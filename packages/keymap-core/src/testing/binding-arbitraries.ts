/**
 * fast-check generators for ZMK binding trees. Keys and modifiers come from
 * the real catalogs. Multi-arg nests stay in unit tests; the arb covers
 * catalog unary wraps and hold-tap shapes.
 */

import fc from 'fast-check'
import { isModifierKey, isModifierWrap } from '../catalog-choices.js'
import { getKeycodeCatalog } from '../catalog.js'
import type { KeyBindingNode } from '../types.js'

const SAFE_TOKEN = /^[A-Za-z0-9_]+$/

const catalog = getKeycodeCatalog().list

export const terminalKeys = [
  ...new Set(
    catalog
      .filter(k => k.params.length === 0 && SAFE_TOKEN.test(k.code))
      .map(k => k.code)
  )
]

export const wrapCodes = [
  ...new Set(catalog.filter(k => isModifierWrap(k)).map(k => String(k.code)))
]

export const modifierKeys = [
  ...new Set(
    catalog
      .filter(k => isModifierKey(k) && SAFE_TOKEN.test(String(k.code)))
      .map(k => String(k.code))
  )
]

// Layer tokens as strings: encode stringifies and parse never emits numbers,
// so a numeric `0` in the tree would fail deep equality after round-trip.
const layerTokens = ['0', '1', '2', '3'] as const

export function leaf(value: string): KeyBindingNode {
  return { value, params: [] }
}

export function wrapChain(wraps: string[], terminal: string): KeyBindingNode {
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

export const bindingArb: fc.Arbitrary<KeyBindingNode> = fc.oneof(
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
