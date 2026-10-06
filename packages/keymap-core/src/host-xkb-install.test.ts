import { describe, expect, it } from 'vitest'
import { recommendedXkbInstallTarget } from './host-xkb-install.js'

describe('recommendedXkbInstallTarget', () => {
  it('prefers the short Australia module for English', () => {
    const target = recommendedXkbInstallTarget('en')
    expect(target.module).toBe('au')
    expect(target.systemPath).toBe('/usr/share/X11/xkb/symbols/au')
    expect(target.userPath).toBe('~/.xkb/symbols/au')
    expect(target.variant).toBe('Australia (au)')
    expect(target.tip).toMatch(/symbols\/au/)
    expect(target.tip).not.toMatch(/legacy/)
  })

  it('prefers the legacy section for Russian', () => {
    const target = recommendedXkbInstallTarget('ru')
    expect(target.module).toBe('ru')
    expect(target.systemPath).toBe('/usr/share/X11/xkb/symbols/ru')
    expect(target.variant).toBe('legacy')
    expect(target.tip).toMatch(/legacy/)
  })

  it('uses the language xkb module without a tip for other languages', () => {
    const target = recommendedXkbInstallTarget('fr')
    expect(target).toEqual({
      module: 'fr',
      systemPath: '/usr/share/X11/xkb/symbols/fr',
      userPath: '~/.xkb/symbols/fr',
      variant: null,
      tip: null
    })
  })
})
