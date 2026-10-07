import { describe, expect, it, vi } from 'vitest'

describe('host layout registry lazy parse', () => {
  it('does not parse on import and parses one section on first hostLayout', async () => {
    const hostLayoutMod = await import('./host-layout.js')
    const spy = vi.spyOn(hostLayoutMod, 'hostLayoutFromSymbols')
    const { hostLayout, hostLayoutMeta } = await import('./host-layout-registry.js')

    expect(spy).not.toHaveBeenCalled()
    expect(hostLayoutMeta('system-de-neo')).toMatchObject({
      id: 'system-de-neo',
      language: 'de',
      name: 'neo',
      origin: 'system'
    })
    expect(spy).not.toHaveBeenCalled()

    const layout = hostLayout('system-de-neo')
    expect(layout?.id).toBe('system-de-neo')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[1]).toBe('neo')
    expect(spy.mock.calls[0]?.[2]).toBe('system-de-neo')

    hostLayout('system-de-neo')
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
