import { describe, expect, it } from 'vitest'
import { zmkBehaviorDocsUrl } from './zmk-docs.js'

describe('zmkBehaviorDocsUrl', () => {
  it('maps known behaviours to zmk.dev pages', () => {
    expect(zmkBehaviorDocsUrl('&kp')).toBe(
      'https://zmk.dev/docs/keymaps/behaviors/key-press'
    )
    expect(zmkBehaviorDocsUrl('&mkp')).toBe(
      'https://zmk.dev/docs/keymaps/behaviors/mouse-emulation'
    )
    expect(zmkBehaviorDocsUrl('&mo')).toBe(
      'https://zmk.dev/docs/keymaps/behaviors/layers'
    )
    expect(zmkBehaviorDocsUrl('&bootloader')).toBe(
      'https://zmk.dev/docs/keymaps/behaviors/reset'
    )
  })

  it('returns null for unknown bindings', () => {
    expect(zmkBehaviorDocsUrl('&macro')).toBeNull()
    expect(zmkBehaviorDocsUrl(undefined)).toBeNull()
  })
})
