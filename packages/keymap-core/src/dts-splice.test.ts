import { describe, expect, it } from 'vitest'
import {
  buildKeymapCode,
  KeymapValidationError,
  parseDtsKeymap,
  parseKeymap,
  spliceBindingsIntoDts
} from '../src/index.js'
import type { LayoutKey } from '../src/types.js'

const TINY_LAYOUT: LayoutKey[] = [
  { x: 0, y: 0, row: 0, col: 0 },
  { x: 1, y: 0, row: 0, col: 1 }
]

const LARK_LIKE = `#define VU C_VOL_UP
#include <behaviors.dtsi>

&mt {
    flavor = "tap-preferred";
};

&lt {
    flavor = "balanced";
};

/ {
    keymap {
        compatible = "zmk,keymap";

        layer_0 {
            bindings = <
&kp A &kp B
            >;
        };

        layer_1 {
            bindings = <
&kp VU &trans
            >;
        };
    };

    combos {
        combo_esc {
            bindings = <&kp ESC>;
            key-positions = <0 1>;
        };
    };
};
`

function layoutOf(n: number): LayoutKey[] {
  return Array.from({ length: n }, (_, i) => ({ x: i, y: 0, row: 0, col: i }))
}

describe('spliceBindingsIntoDts', () => {
  it('keeps preamble and exterior byte-stable when editing one key', () => {
    const spliced = spliceBindingsIntoDts(LARK_LIKE, {
      layout: TINY_LAYOUT,
      layers: [
        ['&kp Z', '&kp B'],
        ['&kp C_VOL_UP', '&trans']
      ],
    })

    expect(spliced).toContain('#define VU C_VOL_UP')
    expect(spliced).toContain('#include <behaviors.dtsi>')
    expect(spliced).toContain('&mt {\n    flavor = "tap-preferred";\n};')
    expect(spliced).toContain('&lt {\n    flavor = "balanced";\n};')
    expect(spliced).toContain('bindings = <&kp ESC>')
    expect(spliced).toContain('&kp Z')
    expect(spliced).not.toContain('&kp A &kp B')
  })

  it('keeps a bindings interior byte-identical when tokens already match', () => {
    const src = `/ {
    keymap {
        compatible = "zmk,keymap";
        layer_0 {
            bindings = <
&kp A  &kp B
            >;
        };
    };
};
`
    const spliced = spliceBindingsIntoDts(src, {
      layout: TINY_LAYOUT,
      layers: [['&kp A', '&kp B']]
    })
    expect(spliced).toBe(src)
  })

  it('writes expanded macros (C_VOL_UP) not VU inside bindings', () => {
    const parsed = parseDtsKeymap(LARK_LIKE)
    const result = buildKeymapCode(TINY_LAYOUT, parseKeymap(parsed), {
      originalSource: LARK_LIKE
    })
    expect(result.mode).toBe('splice')
    expect(result.code).toContain('C_VOL_UP')
    expect(result.code).toMatch(/#define VU C_VOL_UP/)
    // Bare VU bind token must not remain inside bindings
    const kmBlock = result.code.slice(
      result.code.indexOf('compatible = "zmk,keymap"'),
      result.code.indexOf('combos')
    )
    expect(kmBlock).not.toMatch(/\bVU\b/)
    expect(result.warnings).toContain('macros_expanded')
  })

  it('adds layer_2 when growing 2→3', () => {
    const spliced = spliceBindingsIntoDts(LARK_LIKE, {
      layout: TINY_LAYOUT,
      layers: [
        ['&kp A', '&kp B'],
        ['&kp C', '&trans'],
        ['&none', '&none']
      ],
    })
    expect(spliced).toMatch(/layer_0\s*\{/)
    expect(spliced).toMatch(/layer_1\s*\{/)
    expect(spliced).toMatch(/layer_2\s*\{/)
    expect(spliced).not.toMatch(/default_layer/)
    expect(spliced).not.toMatch(/layer_raise/)
  })

  it('removes trailing layer when shrinking 3→2', () => {
    const withThree = spliceBindingsIntoDts(LARK_LIKE, {
      layout: TINY_LAYOUT,
      layers: [
        ['&kp A', '&kp B'],
        ['&kp C', '&trans'],
        ['&none', '&none']
      ],
    })
    const back = spliceBindingsIntoDts(withThree, {
      layout: TINY_LAYOUT,
      layers: [
        ['&kp A', '&kp B'],
        ['&kp C', '&trans']
      ],
    })
    expect(back).toMatch(/layer_0\s*\{/)
    expect(back).toMatch(/layer_1\s*\{/)
    expect(back).not.toMatch(/layer_2\s*\{/)
  })

  it('preserves existing DTS layer node ids', () => {
    const spliced = spliceBindingsIntoDts(LARK_LIKE, {
      layout: TINY_LAYOUT,
      layers: [
        ['&kp A', '&kp B'],
        ['&kp C_VOL_UP', '&trans']
      ]
    })
    expect(spliced).toMatch(/layer_0\s*\{/)
    expect(spliced).toMatch(/layer_1\s*\{/)
  })

  it('does not modify combo bindings text', () => {
    const spliced = spliceBindingsIntoDts(LARK_LIKE, {
      layout: TINY_LAYOUT,
      layers: [
        ['&kp Z', '&kp Y'],
        ['&none', '&none']
      ],
    })
    expect(spliced).toContain('bindings = <&kp ESC>')
    expect(spliced).toContain('key-positions = <0 1>')
  })

  it('throws KeymapValidationError when no keymap block is present', () => {
    expect(() =>
      spliceBindingsIntoDts('/* no keymap */', {
        layout: TINY_LAYOUT,
        layers: [['&kp A', '&kp B']],
      })
    ).toThrow(KeymapValidationError)
    try {
      spliceBindingsIntoDts('/* no keymap */', {
        layout: TINY_LAYOUT,
        layers: [['&kp A', '&kp B']],
      })
    } catch (e) {
      expect(e).toBeInstanceOf(KeymapValidationError)
      expect((e as KeymapValidationError).errors[0]).toMatch(/no keymap block/)
    }
  })

  it('throws KeymapValidationError for too-short and too-long layers', () => {
    const layout = layoutOf(84)
    const short = Array.from({ length: 83 }, () => '&none')
    const long = Array.from({ length: 85 }, () => '&none')

    expect(() =>
      spliceBindingsIntoDts(LARK_LIKE, {
        layout,
        layers: [short],
      })
    ).toThrow(KeymapValidationError)

    expect(() =>
      spliceBindingsIntoDts(LARK_LIKE, {
        layout,
        layers: [long],
      })
    ).toThrow(KeymapValidationError)

    try {
      spliceBindingsIntoDts(LARK_LIKE, {
        layout,
        layers: [short],
      })
    } catch (e) {
      expect(e).toBeInstanceOf(KeymapValidationError)
      const err = e as KeymapValidationError
      expect(err.errors[0]).toMatch(/83/)
      expect(err.errors[0]).toMatch(/84/)
      expect(err.errors[0]).toMatch(/0/)
    }
  })

  it('deletes a labeled layer without leaving raise: };', () => {
    const src = `/ {
    keymap {
        compatible = "zmk,keymap";
        default_layer {
            bindings = <&kp A &kp B>;
        };
        raise: layer_1 {
            bindings = <&kp C &kp D>;
        };
    };
};
`
    const spliced = spliceBindingsIntoDts(src, {
      layout: TINY_LAYOUT,
      layers: [['&kp A', '&kp B']]
    })
    expect(spliced).not.toMatch(/raise:/)
    expect(spliced).not.toMatch(/layer_1/)
    const km = parseDtsKeymap(spliced)
    expect(km.layers).toHaveLength(1)
    expect(km.layer_names).toEqual(['default'])
    expect(spliced).toMatch(/\n        \};\n    \};\n\};\n?$/)
  })

  it('deletes a hyphenated layer and keeps layer-base', () => {
    const src = `/ {
    keymap {
        compatible = "zmk,keymap";
        layer-base {
            bindings = <&kp A &kp B>;
        };
        layer-raise {
            bindings = <&kp C &kp D>;
        };
    };
};
`
    const spliced = spliceBindingsIntoDts(src, {
      layout: TINY_LAYOUT,
      layers: [['&kp A', '&kp B']]
    })
    expect(spliced).not.toContain('layer-}')
    expect(spliced).not.toContain('layer-raise')
    const km = parseDtsKeymap(spliced)
    expect(km.layers).toHaveLength(1)
    expect(km.layer_names).toEqual(['layer-base'])
    expect(spliced).toMatch(/\n        \};\n    \};\n\};\n?$/)
  })

  it('does not write a second layer_2 when base and layer_2 already exist', () => {
    const src = `/ {
    keymap {
        compatible = "zmk,keymap";
        base {
            bindings = <&kp A &kp B>;
        };
        layer_2 {
            bindings = <&kp C &kp D>;
        };
    };
};
`
    const spliced = spliceBindingsIntoDts(src, {
      layout: TINY_LAYOUT,
      layers: [
        ['&kp A', '&kp B'],
        ['&kp C', '&kp D'],
        ['&none', '&none']
      ]
    })
    expect(spliced.match(/\blayer_2\s*\{/g)?.length).toBe(1)
    expect(spliced).toMatch(/\blayer_2_2\s*\{/)
    const km = parseDtsKeymap(spliced)
    expect(km.layers).toHaveLength(3)
    expect(km.layer_names).toEqual(['base', 'layer_2', 'layer_2_2'])
  })
})

describe('buildKeymapCode paths', () => {
  const parsed = parseKeymap({
    layer_names: ['default'],
    layers: [['&kp A', '&trans']]
  })

  it('preserves CRLF endings when splicing into a CRLF keymap', () => {
    const crlf = LARK_LIKE.replace(/\n/g, '\r\n')
    expect(crlf).toContain('\r\n')
    const spliced = spliceBindingsIntoDts(crlf, {
      layout: TINY_LAYOUT,
      layers: [
        ['&kp Z', '&kp B'],
        ['&kp C_VOL_UP', '&trans']
      ],
    })
    expect(spliced).toContain('&kp Z')
    expect(spliced).toContain('\r\n')
    // Inserted bindings must not introduce bare LF (mixed endings).
    expect(spliced.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('rejects duplicate matrix cells on the splice save path', () => {
    const dupLayout: LayoutKey[] = [
      { x: 0, y: 0, row: 0, col: 0 },
      { x: 1, y: 0, row: 0, col: 0 }
    ]
    expect(() =>
      buildKeymapCode(
        dupLayout,
        parseKeymap({
          layers: [['&kp A', '&kp B']],
          layer_names: ['default']
        }),
        { originalSource: LARK_LIKE }
      )
    ).toThrow(KeymapValidationError)
  })

  it('path 1: template wins over originalSource', () => {
    const result = buildKeymapCode(TINY_LAYOUT, parsed, {
      template: '/* TEMPLATE_MARKER */\n{{rendered_layers}}\n',
      originalSource: LARK_LIKE
    })
    expect(result.mode).toBe('template')
    expect(result.code).toContain('TEMPLATE_MARKER')
    expect(result.code).not.toContain('#define VU C_VOL_UP')
  })

  it('path 3: default template when no template/originalSource', () => {
    const result = buildKeymapCode(TINY_LAYOUT, parsed)
    expect(result.mode).toBe('default_template')
    expect(result.code).toContain('THIS FILE WAS GENERATED')
    expect(result.warnings).toContain('generated_default_template')
  })

  it('throws KeymapValidationError on key-count mismatch', () => {
    const layout = layoutOf(84)
    const shortLayer = Array.from({ length: 83 }, () => '&none')
    const km = parseKeymap({
      layer_names: ['x'],
      layers: [shortLayer]
    })
    expect(() => buildKeymapCode(layout, km, { originalSource: LARK_LIKE })).toThrow(
      KeymapValidationError
    )
  })
})

describe('parseDtsKeymap scope and warnings', () => {
  it('ignores combo bindings as layers', () => {
    const km = parseDtsKeymap(LARK_LIKE)
    expect(km.layer_names).toEqual(['layer_0', 'layer_1'])
    expect(km.layers).toHaveLength(2)
    expect(km.layers.flat().join(' ')).not.toContain('&kp ESC')
    expect(km.warnings).toContain('macros_expanded')
  })

  it('omits macros_expanded when no define is used in bindings', () => {
    const src = `#define UNUSED FOO
/ {
  keymap {
    compatible = "zmk,keymap";
    layer_0 {
      bindings = <&kp A &kp B>;
    };
  };
};
`
    const km = parseDtsKeymap(src)
    expect(km.warnings).not.toContain('macros_expanded')
    expect(km.layers[0]).toEqual(['&kp A', '&kp B'])
  })
})
