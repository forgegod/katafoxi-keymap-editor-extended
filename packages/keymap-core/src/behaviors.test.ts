import { describe, expect, it } from 'vitest'
import {
  behaviorFirmwareNote,
  behaviorSlotParam,
  behaviorValueCatalog,
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

describe('behaviorValueCatalog', () => {
  it('returns mouse buttons for &mkp, not keycodes', () => {
    const catalog = behaviorValueCatalog('&mkp')
    expect(catalog.param).toBe('command')
    expect(catalog.choices.map(c => c.code)).toEqual([
      'LCLK',
      'RCLK',
      'MCLK',
      'MB4',
      'MB5'
    ])
  })

  it('returns scroll commands for &msc and move commands for &mmv', () => {
    expect(behaviorValueCatalog('&msc').choices.map(c => c.code)).toEqual([
      'SCRL_UP',
      'SCRL_DOWN',
      'SCRL_LEFT',
      'SCRL_RIGHT'
    ])
    expect(behaviorValueCatalog('&mmv').choices.map(c => c.code)).toEqual([
      'MOVE_UP',
      'MOVE_DOWN',
      'MOVE_LEFT',
      'MOVE_RIGHT'
    ])
  })

  it('names the keycode param for &kp without embedding the key list', () => {
    const catalog = behaviorValueCatalog('&kp')
    expect(catalog.param).toBe('code')
    expect(catalog.choices).toEqual([])
  })
})

describe('behaviorSlotParam', () => {
  it('follows the key slot on &mt after the modifier is chosen', () => {
    expect(behaviorSlotParam('&mt', 'mod')).toBe('mod')
    expect(behaviorSlotParam('&mt', 'code')).toBe('code')
    expect(behaviorSlotParam('&lt', 'layer')).toBe('layer')
    expect(behaviorSlotParam('&lt', 'code')).toBe('code')
  })

  it('ignores a leftover keycode slot on a command behaviour', () => {
    expect(behaviorSlotParam('&mkp', 'code')).toBe('command')
    expect(behaviorSlotParam('&kp', 'code')).toBe('code')
  })
})
