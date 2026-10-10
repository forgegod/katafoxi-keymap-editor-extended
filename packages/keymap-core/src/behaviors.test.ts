import { describe, expect, it } from 'vitest'
import {
  BEHAVIOR_ROLE_ORDER,
  behaviorFirmwareNote,
  behaviorPeekNote,
  behaviorSlotParam,
  behaviorValueCatalog,
  isInstantBehavior,
  sortBehaviorsByRole
} from './behaviors.js'
import { getBehaviorCatalog } from './catalog.js'
import { generateKeymap, parseKeymap } from './keymap.js'
import { zmkBehaviorDocsUrl } from './zmk-docs.js'

// CHG-009 phase 1: executable target contract, intentionally RED before phase 2.
// ZMK 5b51501fead672c41b5cfb396f3dafe0894bf4e9; evidence matrix lives in CHG-009.
describe('CHG-009 stock catalog contract', () => {
  it.each([
    ['OUT_USB', 'Prefer sending to USB.'],
    ['OUT_BLE', 'Prefer sending to the current Bluetooth profile.'],
    ['OUT_NONE', 'Prevent sending any output.']
  ])('describes %s without reversing the output destination', (code, description) => {
    const output = getBehaviorCatalog().byCode['&out']
    expect(output?.params).toEqual(['command'])
    expect(output?.includes).toEqual(['#include <dt-bindings/zmk/outputs.h>'])
    const command = behaviorValueCatalog('&out').choices.find(choice => choice.code === code)
    expect(command).toMatchObject({ code, description })
    expect(command?.additionalParams ?? []).toEqual([])
  })

  it.each([
    ['&kt', 'Key Toggle', ['code'], ['#include <dt-bindings/zmk/keys.h>'],
      'Toggle the key press; hold it until toggled again or released elsewhere.'],
    ['&gresc', 'Grave Escape', [], [],
      'Send Escape, or Grave when Shift or GUI is held.'],
    ['&soft_off', 'Soft Off', [], [], 'Turn the keyboard off.']
  ] as const)('offers %s with its stock arity, includes, and copy', (code, name, params, includes, description) => {
    const behavior = getBehaviorCatalog().byCode[code]
    expect(behavior).toMatchObject({ code, name, params, description })
    expect(behavior?.includes ?? []).toEqual(includes)
    expect(behaviorValueCatalog(code).param).toBe(params[0])
    expect(isInstantBehavior(behavior!)).toBe(params.length === 0)
  })

  it('requires soft-off firmware support without claiming to configure hardware', () => {
    expect(behaviorFirmwareNote('&soft_off')).toBe(
      'Firmware: CONFIG_ZMK_PM_SOFT_OFF=y in the keyboard .conf; requires hardware power-off support. Wake-up depends on the keyboard hardware (dedicated wake button or reset). This editor only stages the binding; it does not change firmware configuration or turn off hardware.'
    )
  })

  it('does not advertise &reset as a stock behavior', () => {
    const catalog = getBehaviorCatalog()
    expect(catalog.list.map(behavior => behavior.code)).not.toContain('&reset')
    expect(catalog.byCode['&reset']).toBeUndefined()
    expect(zmkBehaviorDocsUrl('&reset')).toBeNull()
  })

  it('does not give the external &reset label a stock role', () => {
    expect(BEHAVIOR_ROLE_ORDER).not.toContain('&reset')
  })

  it('generates keys.h for &kt without relying on another keycode behavior', () => {
    const { code, json } = generateKeymap(
      [{ x: 0, y: 0 }],
      parseKeymap({ layers: [['&kt LA(A)']] })
    )
    expect(code.match(/#include <dt-bindings\/zmk\/keys\.h>/g)).toHaveLength(1)
    expect(code).toContain('&kt LA(A)')
    expect(JSON.parse(json).layers).toEqual([['&kt LA(A)']])
  })

  it.each(['&sys_reset', '&bootloader'])('retains parameterless stock %s', code => {
    const behavior = getBehaviorCatalog().byCode[code]
    expect(behavior).toMatchObject({ code, params: [] })
    expect(behavior?.includes ?? []).toEqual([])
  })

  it.each([
    ['&out', 'outputs'],
    ['&kt', 'key-toggle'],
    ['&gresc', 'mod-morph#behavior-binding'],
    ['&soft_off', 'soft-off'],
    ['&sys_reset', 'reset'],
    ['&bootloader', 'reset']
  ])('links %s to its documented stock behavior', (code, page) => {
    expect(zmkBehaviorDocsUrl(code)).toBe(`https://zmk.dev/docs/keymaps/behaviors/${page}`)
  })

  it('retains OUT_TOG and excludes parameterized RGB color and the deprecated sensor alias', () => {
    expect(behaviorValueCatalog('&out').choices.map(choice => choice.code)).toContain('OUT_TOG')
    expect(behaviorValueCatalog('&rgb_ug').choices.some(choice =>
      String(choice.code).startsWith('RGB_COLOR_HSB')
    )).toBe(false)
    expect(getBehaviorCatalog().byCode['&inc_dec_cp']).toBeUndefined()
  })
})

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

describe('behaviorPeekNote', () => {
  it('explains layer and hold-tap behaviours in one line', () => {
    expect(behaviorPeekNote('&mo')).toMatch(/Hold.*layer/i)
    expect(behaviorPeekNote('&to')).toMatch(/Switch.*stay/i)
    expect(behaviorPeekNote('&tog')).toMatch(/Toggle/i)
    expect(behaviorPeekNote('&sl')).toMatch(/sticky/i)
    expect(behaviorPeekNote('&lt')).toMatch(/Hold.*layer.*tap/i)
    expect(behaviorPeekNote('&mt')).toMatch(/Hold.*modifier.*tap/i)
    expect(behaviorPeekNote('&sk')).toMatch(/sticky/i)
  })

  it('stays silent for ordinary key press', () => {
    expect(behaviorPeekNote('&kp')).toBeNull()
    expect(behaviorPeekNote('&bt')).toBeNull()
    expect(behaviorPeekNote(undefined)).toBeNull()
  })
})

describe('behaviorValueCatalog', () => {
  it('lists the documented Bluetooth and RGB commands with their required parameters', () => {
    const bluetooth = getBehaviorCatalog().byCode['&bt']
    const rgb = getBehaviorCatalog().byCode['&rgb_ug']

    expect(bluetooth?.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'BT_DISC',
        description: 'Disconnect the connected inactive 0-indexed profile.',
        additionalParams: [{ name: 'index', type: 'integer', enum: [0, 1, 2, 3, 4] }]
      }),
      expect.objectContaining({
        code: 'BT_CLR_ALL',
        description: 'Clear bond information for all Bluetooth profiles.'
      })
    ]))
    expect(rgb?.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'RGB_ON', description: 'Turn on RGB underglow.' }),
      expect.objectContaining({ code: 'RGB_OFF', description: 'Turn off RGB underglow.' })
    ]))
  })

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

  it('returns a copy of the command list', () => {
    const catalog = behaviorValueCatalog('&mkp')
    catalog.choices.push({ code: 'MUTATED' })
    expect(behaviorValueCatalog('&mkp').choices.map(c => c.code)).not.toContain(
      'MUTATED'
    )
  })
})

describe('behaviorSlotParam', () => {
  it('keeps the active Bluetooth command index parameter', () => {
    const index = getBehaviorCatalog().byCode['&bt']?.commands
      ?.find(command => command.code === 'BT_DISC')?.additionalParams?.[0]
    expect(index).toBeDefined()
    expect(behaviorSlotParam('&bt', index)).toBe(index)
  })

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
