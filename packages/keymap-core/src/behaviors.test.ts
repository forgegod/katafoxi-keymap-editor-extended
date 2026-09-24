import { describe, expect, it } from 'vitest'
import {
  behaviorFirmwareNote,
  isInstantBehavior,
  sortBehaviorsByRole
} from './behaviors.js'

describe('sortBehaviorsByRole', () => {
  it('puts &kp first and instant bindings last', () => {
    const sorted = sortBehaviorsByRole([
      { code: '&trans', params: [] },
      { code: '&bt', params: ['command'] },
      { code: '&mo', params: ['layer'] },
      { code: '&kp', params: ['code'] },
      { code: '&none', params: [] }
    ])
    expect(sorted.map(b => b.code)).toEqual([
      '&kp',
      '&mo',
      '&bt',
      '&trans',
      '&none'
    ])
  })
})

describe('isInstantBehavior', () => {
  it('is true only when there are no params', () => {
    expect(isInstantBehavior({ params: [] })).toBe(true)
    expect(isInstantBehavior({ params: ['code'] })).toBe(false)
  })
})

describe('behaviorFirmwareNote', () => {
  it('reminds pointing behaviours need CONFIG_ZMK_POINTING', () => {
    for (const code of ['&mkp', '&msc', '&mmv']) {
      expect(behaviorFirmwareNote(code)).toContain('CONFIG_ZMK_POINTING=y')
      expect(behaviorFirmwareNote(code)).toContain('pointing.h')
    }
  })

  it('reminds lighting behaviours need their Kconfig flags', () => {
    expect(behaviorFirmwareNote('&bl')).toContain('CONFIG_ZMK_BACKLIGHT=y')
    expect(behaviorFirmwareNote('&bl')).toContain('backlight.h')
    expect(behaviorFirmwareNote('&rgb_ug')).toContain('CONFIG_ZMK_RGB_UNDERGLOW=y')
    expect(behaviorFirmwareNote('&rgb_ug')).toContain('rgb.h')
  })

  it('is silent for behaviours that do not need an enable flag', () => {
    expect(behaviorFirmwareNote('&kp')).toBeNull()
    expect(behaviorFirmwareNote('&mo')).toBeNull()
    expect(behaviorFirmwareNote('&bt')).toBeNull()
    expect(behaviorFirmwareNote('&out')).toBeNull()
    expect(behaviorFirmwareNote('&ext_power')).toBeNull()
  })
})
