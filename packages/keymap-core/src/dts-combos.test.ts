import { describe, expect, it } from 'vitest'
import {
  buildKeymapCode,
  COMBO_MAX_KEYS,
  COMBO_MIN_KEYS,
  bindingLooksLikeAltTab,
  comboChordOverlap,
  comboChordOverlapPartners,
  comboDesignHint,
  comboKeysIssue,
  comboListMeta,
  comboOverlapMessage,
  comboLooksLikeModifierChord,
  createEmptyCombo,
  encodeKeyBinding,
  formatCombosBlock,
  nextComboIdFromBinding,
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

  it('ignores braces inside combo comments', () => {
    const src = `/ {
    combos {
        compatible = "zmk,combos";
        combo_esc {
            // { decoy
            /* } */
            bindings = <&kp ESC>;
            key-positions = <0 1>;
        };
    };
};
`
    expect(parseDtsCombos(src)).toEqual([
      { id: 'combo_esc', binding: '&kp ESC', keyPositions: [0, 1] }
    ])
  })

  it('reads bindings with spaces inside parentheses', () => {
    const src = `/ {
    combos {
        compatible = "zmk,combos";
        combo_shift_a {
            bindings = <&kp LS( A )>;
            key-positions = <0 1>;
        };
    };
};
`
    expect(parseDtsCombos(src)).toEqual([
      { id: 'combo_shift_a', binding: '&kp LS( A )', keyPositions: [0, 1] }
    ])
  })

  it('does not treat sensor-bindings as the combo binding', () => {
    const src = `/ {
    combos {
        compatible = "zmk,combos";
        combo_esc {
            sensor-bindings = <&inc_dec_kp C_VOL_UP C_VOL_DN>;
            bindings = <&kp ESC>;
            key-positions = <0 1>;
        };
    };
};
`
    expect(parseDtsCombos(src)).toEqual([
      { id: 'combo_esc', binding: '&kp ESC', keyPositions: [0, 1] }
    ])
  })

  it('does not take slow-release from a commented-out property', () => {
    const src = `/ {
    combos {
        compatible = "zmk,combos";
        combo_esc {
            bindings = <&kp ESC>;
            key-positions = <0 1>;
            // slow-release;
        };
    };
};
`
    expect(parseDtsCombos(src)).toEqual([
      { id: 'combo_esc', binding: '&kp ESC', keyPositions: [0, 1] }
    ])
  })

  it('does not take slow-release from not-slow-release', () => {
    const src = `/ {
    combos {
        compatible = "zmk,combos";
        combo_esc {
            bindings = <&kp ESC>;
            key-positions = <0 1>;
            not-slow-release;
        };
    };
};
`
    expect(parseDtsCombos(src)).toEqual([
      { id: 'combo_esc', binding: '&kp ESC', keyPositions: [0, 1] }
    ])
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

  it('omits combos when the file has no combos block', () => {
    const src = `/ {
    keymap {
        compatible = "zmk,keymap";
        layer_0 { bindings = <&kp A &kp B>; };
    };
};
`
    const raw = parseDtsKeymap(src)
    expect(raw.combos).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(raw, 'combos')).toBe(false)
    const km = parseKeymap(raw)
    expect(km.combos).toBeUndefined()
  })

  it('omits combos and warns when a combos block yields zero parsed nodes', () => {
    const src = `/ {
    keymap {
        compatible = "zmk,keymap";
        layer_0 { bindings = <&kp A &kp B>; };
    };

    combos {
        compatible = "zmk,combos";
        broken_combo {
            timeout-ms = <40>;
        };
    };
};
`
    const raw = parseDtsKeymap(src)
    expect(raw.combos).toBeUndefined()
    expect(raw.warnings).toContain('combos_unparsed')
  })

  it('leaves an unowned combos block alone on Save when parse omitted the field', () => {
    const src = `/ {
    keymap {
        compatible = "zmk,keymap";
        layer_0 { bindings = <&kp A &kp B>; };
    };

    combos {
        compatible = "zmk,combos";
        broken_combo {
            timeout-ms = <40>;
        };
    };
};
`
    const km = parseKeymap(parseDtsKeymap(src))
    expect(km.combos).toBeUndefined()
    const built = buildKeymapCode(TINY_LAYOUT, km, { originalSource: src })
    expect(built.mode).toBe('splice')
    expect(built.code).toContain('broken_combo')
    expect(built.code).toContain('compatible = "zmk,combos"')
  })

  it('drops the combos block when the model explicitly sets combos to []', () => {
    const km = parseKeymap(parseDtsKeymap(WITH_COMBO))
    km.combos = []
    const built = buildKeymapCode(TINY_LAYOUT, km, { originalSource: WITH_COMBO })
    expect(built.code).not.toContain('combos')
    expect(built.code).toContain('&kp A')
  })

  it('omits combos when key-positions, layers, or timeout use macros', () => {
    const src = `/ {
    keymap {
        compatible = "zmk,keymap";
        layer_0 { bindings = <&kp A &kp B>; };
    };

    combos {
        compatible = "zmk,combos";

        /* keep this comment */
        combo_esc {
            bindings = <&kp ESC>;
            key-positions = <LT0 LT1>;
            timeout-ms = <COMBO_T>;
            layers = <BASE>;
        };
    };
};
`
    const raw = parseDtsKeymap(src)
    expect(raw.combos).toBeUndefined()
    expect(raw.warnings).toContain('combos_unparsed')
    const built = buildKeymapCode(TINY_LAYOUT, parseKeymap(raw), { originalSource: src })
    expect(built.code).toContain('key-positions = <LT0 LT1>;')
    expect(built.code).toContain('layers = <BASE>;')
    expect(built.code).toContain('timeout-ms = <COMBO_T>;')
    expect(built.code).toContain('/* keep this comment */')
  })

  it('omits combos when a node has a DTS label so Save keeps the label', () => {
    const src = `/ {
    keymap {
        compatible = "zmk,keymap";
        layer_0 { bindings = <&kp A &kp B>; };
    };

    combos {
        compatible = "zmk,combos";
        lbl: c_esc {
            bindings = <&kp ESC>;
            key-positions = <0 1>;
        };
    };
};
`
    const raw = parseDtsKeymap(src)
    expect(raw.combos).toBeUndefined()
    expect(raw.warnings).toContain('combos_unparsed')
    const built = buildKeymapCode(TINY_LAYOUT, parseKeymap(raw), { originalSource: src })
    expect(built.code).toContain('lbl: c_esc {')
    expect(built.code).toContain('key-positions = <0 1>;')
  })

  it('omits the whole combos list when one node is numeric and another is not', () => {
    const src = `/ {
    keymap {
        compatible = "zmk,keymap";
        layer_0 { bindings = <&kp A &kp B>; };
    };

    combos {
        compatible = "zmk,combos";
        combo_esc {
            bindings = <&kp ESC>;
            key-positions = <0 1>;
        };
        combo_tab {
            bindings = <&kp TAB>;
            key-positions = <LT0 LT1>;
        };
    };
};
`
    const raw = parseDtsKeymap(src)
    expect(raw.combos).toBeUndefined()
    expect(raw.warnings).toContain('combos_unparsed')
    const built = buildKeymapCode(TINY_LAYOUT, parseKeymap(raw), { originalSource: src })
    expect(built.code).toContain('combo_esc')
    expect(built.code).toContain('key-positions = <LT0 LT1>;')
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

  it('rewrites combos with CRLF when the source uses CRLF', () => {
    const crlf = WITH_COMBO.replace(/\n/g, '\r\n')
    const next = spliceCombosIntoDts(crlf, [
      { id: 'combo_tab', binding: '&kp TAB', keyPositions: [0] }
    ])
    expect(next).toContain('combo_tab')
    expect(next.replace(/\r\n/g, '')).not.toContain('\n')
  })
})

describe('buildKeymapCode combos', () => {
  const comboKm = () =>
    parseKeymap({
      layer_names: ['default'],
      layers: [['&kp A', '&trans']],
      combos: [
        {
          id: 'combo_esc',
          binding: '&kp ESC',
          keyPositions: [0, 1],
          timeoutMs: 40
        }
      ]
    })

  const ROOT_TEMPLATE = `/ {
    keymap {
        compatible = "zmk,keymap";

{{rendered_layers}}
    };
};
`

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

  it('writes non-empty combos when saving with a template', () => {
    const built = buildKeymapCode(TINY_LAYOUT, comboKm(), { template: ROOT_TEMPLATE })
    expect(built.mode).toBe('template')
    expect(built.code).toContain('compatible = "zmk,combos"')
    expect(built.code).toContain('combo_esc')
    expect(built.code).toContain('&kp ESC')
    expect(built.code).toContain('key-positions = <0 1>;')
    expect(built.code).toContain('timeout-ms = <40>;')
  })

  it('writes non-empty combos on the default generated template path', () => {
    const built = buildKeymapCode(TINY_LAYOUT, comboKm())
    expect(built.mode).toBe('default_template')
    expect(built.warnings).toContain('generated_default_template')
    expect(built.code).toContain('compatible = "zmk,combos"')
    expect(built.code).toContain('combo_esc')
    expect(built.code).toContain('&kp ESC')
    expect(built.code).toContain('key-positions = <0 1>;')
  })
})

describe('createEmptyCombo / formatCombosBlock', () => {
  it('names new combos from the default ESC binding', () => {
    const a = createEmptyCombo([])
    expect(a.id).toBe('combo_esc')
    const b = createEmptyCombo([a])
    expect(b.id).toBe('combo_esc_2')
    expect(encodeKeyBinding(a.binding)).toBe('&kp ESC')
  })

  it('formats a compatible combos block', () => {
    const text = formatCombosBlock([
      { id: 'combo_esc', binding: '&kp ESC', keyPositions: [0, 1] }
    ])
    expect(text).toContain('compatible = "zmk,combos"')
    expect(text).toContain('combo_esc')
  })

  it('builds list meta and binding-based ids', () => {
    expect(
      comboListMeta({
        keyPositions: [0, 1],
        timeoutMs: 30,
        layers: [0, 1],
        slowRelease: true
      })
    ).toBe('30ms · L0L1 · slow')
    expect(
      comboListMeta({
        keyPositions: [0, 1],
        requirePriorIdleMs: 100
      })
    ).toBe('50ms · all · idle100')
    expect(
      nextComboIdFromBinding(
        { value: '&mo', params: [{ value: 1, params: [] }] },
        []
      )
    ).toBe('combo_mo_1')
    expect(
      nextComboIdFromBinding(
        { value: '&kp', params: [{ value: 'TAB', params: [] }] },
        [{ id: 'combo_tab' }]
      )
    ).toBe('combo_tab_2')
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
  })
})

describe('combo chord overlap', () => {
  const chord = (id: string, keyPositions: number[], layers?: number[]) => ({
    id,
    keyPositions,
    ...(layers ? { layers } : {})
  })

  it('flags the same keys on a shared layer, including reversed order', () => {
    const combos = [
      chord('combo_esc', [0, 1]),
      chord('combo_tab', [1, 0])
    ]
    expect(comboChordOverlap(combos)).toEqual({
      id: 'combo_esc',
      otherId: 'combo_tab'
    })
    expect(comboChordOverlapPartners(combos).get('combo_tab')).toBe('combo_esc')
    expect(comboOverlapMessage('combo_tab')).toMatch(/combo_tab/)
  })

  it('treats repeated indexes as the same chord', () => {
    expect(
      comboChordOverlap([
        chord('combo_esc', [0, 1, 1]),
        chord('combo_tab', [1, 0])
      ])
    ).toEqual({ id: 'combo_esc', otherId: 'combo_tab' })
  })

  it('flags a global combo against the same keys on one layer', () => {
    expect(
      comboChordOverlap([
        chord('combo_esc', [0, 1]),
        chord('combo_tab', [0, 1], [0])
      ])
    ).toEqual({ id: 'combo_esc', otherId: 'combo_tab' })
  })

  it('flags a partial layer overlap', () => {
    expect(
      comboChordOverlap([
        chord('combo_esc', [0, 1], [0, 1]),
        chord('combo_tab', [0, 1], [1, 2])
      ])?.id
    ).toBe('combo_esc')
  })

  it('allows the same keys on disjoint layers', () => {
    expect(
      comboChordOverlap([
        chord('combo_esc', [0, 1], [0]),
        chord('combo_tab', [0, 1], [1])
      ])
    ).toBeNull()
  })

  it('allows a shorter chord nested in a longer one', () => {
    expect(
      comboChordOverlap([
        chord('combo_esc', [0, 1]),
        chord('combo_tab', [0, 1, 2])
      ])
    ).toBeNull()
  })
})

describe('combo modifier-chord hint', () => {
  const layer0 = [
    { value: '&kp', params: [{ value: 'LSHIFT', params: [] }] },
    { value: '&kp', params: [{ value: 'R', params: [] }] },
    { value: '&kp', params: [{ value: 'A', params: [] }] },
    {
      value: '&mt',
      params: [
        { value: 'LCTRL', params: [] },
        { value: 'ESC', params: [] }
      ]
    },
    {
      value: '&lt',
      params: [
        { value: 1, params: [] },
        { value: 'LS', params: [{ value: 'CAPS', params: [] }] }
      ]
    },
    { value: '&kp', params: [{ value: 'H', params: [] }] }
  ]

  it('flags Shift+letter positions on layer0', () => {
    expect(comboLooksLikeModifierChord([0, 1], layer0)).toBe(true)
    expect(comboDesignHint([0, 1], layer0)).toMatch(/modifier chord/)
  })

  it('stays quiet for two letter keys', () => {
    expect(comboLooksLikeModifierChord([1, 2], layer0)).toBe(false)
    expect(comboDesignHint([1, 2], layer0)).toBeNull()
  })

  it('flags &mt hold-mod + another key', () => {
    expect(comboLooksLikeModifierChord([3, 2], layer0)).toBe(true)
  })

  it('flags two modifier keys (e.g. Alt + RAlt/Tab)', () => {
    const alt = { value: '&kp', params: [{ value: 'LALT', params: [] }] }
    const raltTab = {
      value: '&mt',
      params: [
        { value: 'RALT', params: [] },
        { value: 'TAB', params: [] }
      ]
    }
    const board = [alt, raltTab, { value: '&kp', params: [{ value: 'A', params: [] }] }]
    expect(comboLooksLikeModifierChord([0, 1], board)).toBe(true)
    expect(comboDesignHint([0, 1], board)).toMatch(/modifier chord/)
  })

  it('flags letter + &lt with LS() tap (Lark Caps key)', () => {
    expect(comboLooksLikeModifierChord([5, 4], layer0)).toBe(true)
    expect(comboDesignHint([5, 4], layer0)).toMatch(/modifier chord/)
  })

  it('does not warn when the hard count rule already fails', () => {
    expect(comboDesignHint([0], layer0)).toBeNull()
  })

  it('warns on Alt+Tab bindings', () => {
    const altTab = {
      value: '&kp',
      params: [{ value: 'LA', params: [{ value: 'TAB', params: [] }] }]
    }
    expect(bindingLooksLikeAltTab(altTab)).toBe(true)
    expect(comboDesignHint([1, 2], layer0, altTab)).toMatch(/Alt\+Tab/)
    // Binding hint wins over mod-chord positions
    expect(comboDesignHint([0, 1], layer0, altTab)).toMatch(/Alt\+Tab/)
  })

  it('stays quiet for Ctrl+C bindings', () => {
    const copy = {
      value: '&kp',
      params: [{ value: 'LC', params: [{ value: 'C', params: [] }] }]
    }
    expect(bindingLooksLikeAltTab(copy)).toBe(false)
    expect(comboDesignHint([1, 2], layer0, copy)).toBeNull()
  })
})
