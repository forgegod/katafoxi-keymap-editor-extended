import { describe, expect, it } from 'vitest'
import { layerToneStyle } from './layer-tone'

describe('layerToneStyle', () => {
  it('maps layer index onto the four tone tokens', () => {
    expect(layerToneStyle(0)).toBe('--layer-tone: var(--layer-tone-0)')
    expect(layerToneStyle(1)).toBe('--layer-tone: var(--layer-tone-1)')
    expect(layerToneStyle(2)).toBe('--layer-tone: var(--layer-tone-2)')
    expect(layerToneStyle(3)).toBe('--layer-tone: var(--layer-tone-3)')
    expect(layerToneStyle(4)).toBe('--layer-tone: var(--layer-tone-0)')
    expect(layerToneStyle(7)).toBe('--layer-tone: var(--layer-tone-3)')
  })
})
