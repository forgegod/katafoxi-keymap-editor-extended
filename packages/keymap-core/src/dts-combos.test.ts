import { describe, expect, it } from 'vitest'
import {
  buildKeymapCode,
  COMBO_MAX_KEYS,
  COMBO_MIN_KEYS,
  comboKeysIssue,
  createEmptyCombo,
  encodeKeyBinding,
  formatCombosBlock,
  isComboReady,
  parseDtsCombos,
  parseDtsKeymap,
  parseKeymap,
  spliceCombosIntoDts
} from '../src/index.js'
import type { LayoutKey } from '../src/types.js'

const TINY_LAYOUT: LayoutKey[] = [
  { x: 0, y: 0, row: 0, col: 0 },
  { x: 1, y: 0, row: 0, col: 1 }
]

const WITH_COMBO = `/ {
    keymap {
        compatible = "zmk,keymap";

        layer_0 {
            bindings = <
&kp A &kp B
            >;
        };
    };

    combos {
        compatible = "zmk,combos";

        combo_esc {
            bindings = <&kp ESC>;
            key-positions = <0 1>;
            timeout-ms = <40>;
        };
    };
};
`

describe('parseDtsCombos', () => {
  it('reads id, binding, positions, and timeout', () => {
    expect(parseDtsCombos(WITH_COMBO)).toEqual([
      {
        id: 'combo_esc',
        binding: '&kp ESC',
        keyPositions: [0, 1],
        timeoutMs: 40
      }
    ])
  })

  it('returns [] when no combos block', () => {
    expect(
      parseDtsCombos(`/ {
    keymap {
        compatible = "zmk,keymap";
        layer_0 { bindings = <&kp A>; };
    };
};`)
    ).toEqual([])
  })
})

describe('parseDtsKeymap combos', () => {
  it('attaches combos onto the DtsKeymapJson', () => {
    const raw = parseDtsKeymap(WITH_COMBO)
    expect(raw.combos).toEqual([
      {
        id: 'combo_esc',
        binding: '&kp ESC',
        keyPositions: [0, 1],
        timeoutMs: 40
      }
    ])
    const km = parseKeymap(raw)
    expect(km.combos?.[0]?.binding).toEqual({
      value: '&kp',
      params: [{ value: 'ESC', params: [] }]
    })
  })
})

describe('spliceCombosIntoDts', () => {
  it('rewrites an existing combos block', () => {
    const next = spliceCombosIntoDts(WITH_COMBO, [
      {
        id: 'combo_tab',
        binding: '&kp TAB',
        keyPositions: [0]
      }
    ])
    expect(next).toContain('combo_tab')
    expect(next).toContain('key-positions = <0>;')
    expect(next).not.toContain('combo_esc')
    expect(next).toContain('compatible = "zmk,keymap"')
  })

  it('removes the combos block when the list is empty', () => {
    const next = spliceCombosIntoDts(WITH_COMBO, [])
    expect(next).not.toContain('combos')
    expect(next).toContain('&kp A')
  })

  it('inserts a combos block when missing', () => {
    const source = `/ {
    keymap {
        compatible = "zmk,keymap";
        layer_0 {
            bindings = <
&kp A &kp B
            >;
        };
    };
};
`
    const next = spliceCombosIntoDts(source, [
      { id: 'combo', binding: '&kp ESC', keyPositions: [0, 1] }
    ])
    expect(next).toContain('compatible = "zmk,combos"')
    expect(next).toContain('key-positions = <0 1>;')
  })
})

describe('buildKeymapCode combos', () => {
  it('splices combo edits after layer bindings', () => {
    const km = parseKeymap(parseDtsKeymap(WITH_COMBO))
    km.combos = [
      {
        id: 'combo_esc',
        keyPositions: [1, 0],
        binding: { value: '&kp', params: [{ value: 'ENTER', params: [] }] }
      }
    ]
    const built = buildKeymapCode(TINY_LAYOUT, km, { originalSource: WITH_COMBO })
    expect(built.mode).toBe('splice')
    expect(built.code).toContain('&kp ENTER')
    expect(built.code).toContain('key-positions = <1 0>;')
    expect(built.code).toContain('&kp A')
  })
})

describe('createEmptyCombo / formatCombosBlock', () => {
  it('allocates a unique id', () => {
    const a = createEmptyCombo([])
    expect(a.id).toBe('combo')
    const b = createEmptyCombo([a])
    expect(b.id).toBe('combo_2')
    expect(encodeKeyBinding(a.binding)).toBe('&kp ESC')
  })

  it('formats a compatible combos block', () => {
    const text = formatCombosBlock([
      { id: 'combo_esc', binding: '&kp ESC', keyPositions: [0, 1] }
    ])
    expect(text).toContain('compatible = "zmk,combos"')
    expect(text).toContain('combo_esc')
  })
})

describe('combo key counts', () => {
  it('requires 2–5 keys', () => {
    expect(COMBO_MIN_KEYS).toBe(2)
    expect(COMBO_MAX_KEYS).toBe(5)
    expect(comboKeysIssue([])).toBe('too_few')
    expect(comboKeysIssue([0])).toBe('too_few')
    expect(comboKeysIssue([0, 1])).toBeNull()
    expect(comboKeysIssue([0, 1, 2, 3, 4])).toBeNull()
    expect(comboKeysIssue([0, 1, 2, 3, 4, 5])).toBe('too_many')
    expect(isComboReady({ keyPositions: [1, 2] })).toBe(true)
    expect(isComboReady({ keyPositions: [1] })).toBe(false)
  })
})
