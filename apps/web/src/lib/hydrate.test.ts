import { describe, expect, it } from 'vitest'
import { hydrateTree } from './hydrate'

describe('hydrateTree', () => {
  it('does not treat prototype keys as catalogue entries', () => {
    const tree = hydrateTree('constructor', [], {})
    expect(tree.source).toBeNull()
    expect(tree.params).toEqual([])
  })

  it('looks up only own keys on untrusted source maps', () => {
    const tree = hydrateTree('&kp', [{ value: 'constructor', params: [] }], {
      code: {}
    })
    expect(tree.params[0]?.source).toBeNull()
  })
})
