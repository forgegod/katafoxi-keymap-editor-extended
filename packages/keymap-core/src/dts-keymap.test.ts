import { describe, expect, it } from 'vitest'
import {
  buildKeymapCode,
  parseKeymap
} from '../src/keymap.js'
import {
  compileMacros,
  parseDefines,
  parseDtsKeymap,
  tokenizeBindings
} from '../src/dts-keymap.js'
import { findNamedBlock, maskDts } from '../src/dts-scan.js'
import { KeymapValidationError } from '../src/errors.js'
import type { LayoutKey } from '../src/types.js'

const TINY_LAYOUT: LayoutKey[] = [
  { x: 0, y: 0, row: 0, col: 0 },
  { x: 1, y: 0, row: 0, col: 1 }
]

describe('tokenizeBindings', () => {
  it('splits binds including multi-param', () => {
    const binds = tokenizeBindings(`
      &kp A &mt LCTRL J &lt 1 LS(CAPS) &none
    `)
    expect(binds).toEqual(['&kp A', '&mt LCTRL J', '&lt 1 LS(CAPS)', '&none'])
  })
})

describe('parseDtsKeymap lone &', () => {
  it('throws KeymapValidationError for bindings = <&>', () => {
    const src = `/ {
  keymap {
    compatible = "zmk,keymap";
    default_layer {
      bindings = <&>;
    };
  };
};
`
    expect(() => parseKeymap(parseDtsKeymap(src))).toThrow(KeymapValidationError)
  })
})

describe('parseDtsKeymap', () => {
  it('throws KeymapValidationError when no keymap block is present', () => {
    expect(() => parseDtsKeymap('/* empty */')).toThrow(KeymapValidationError)
    try {
      parseDtsKeymap('/* empty */')
    } catch (e) {
      expect(e).toBeInstanceOf(KeymapValidationError)
      expect((e as KeymapValidationError).errors).toEqual([
        'No layers with bindings found in .keymap'
      ])
    }
  })

  it('parses layers and expands defines', () => {
    const src = `
#define VU C_VOL_UP
/ {
  keymap {
    compatible = "zmk,keymap";
    layer_0 {
      bindings = <
&kp A &kp VU
      >;
    };
    layer_1 {
      bindings = <
&trans &mo 1
      >;
    };
  };
};
`
    const km = parseDtsKeymap(src, { keyboard: 'lark' })
    expect(km.layer_names).toEqual(['layer_0', 'layer_1'])
    expect(km.layers[0]).toEqual(['&kp A', '&kp C_VOL_UP'])
    expect(km.layers[1]).toEqual(['&trans', '&mo 1'])
    expect(km.warnings).toContain('macros_expanded')
  })

  it('ignores braces inside layer comments when reading bindings', () => {
    const src = `/ {
  keymap {
    compatible = "zmk,keymap";
    layer_0 {
      // { decoy open
      /* } decoy close */
      bindings = <
&kp A &kp B
      >;
    };
  };
};
`
    const km = parseDtsKeymap(src)
    expect(km.layers).toEqual([['&kp A', '&kp B']])
  })

  it('ignores #define lines that sit inside comments', () => {
    const src = `// #define LINE_FAKE C_VOL_DN
/*
#define BLOCK_FAKE C_VOL_DN
*/
#define REAL C_VOL_UP
/ {
  keymap {
    compatible = "zmk,keymap";
    layer_0 {
      bindings = <&kp A &kp REAL>;
    };
  };
};
`
    expect(parseDefines(src)).toEqual({ REAL: 'C_VOL_UP' })
    const km = parseDtsKeymap(src)
    expect(km.layers[0]).toEqual(['&kp A', '&kp C_VOL_UP'])
    expect(km.warnings).toContain('macros_expanded')
  })

  it('warns when non-& scraps remain after macro expand', () => {
    const src = `#define ORPHAN C_VOL_UP
/ {
  keymap {
    compatible = "zmk,keymap";
    layer_0 {
      bindings = <
ORPHAN &kp A
      >;
    };
  };
};
`
    const km = parseDtsKeymap(src)
    expect(km.layers[0]).toEqual(['&kp A'])
    expect(km.warnings).toContain('unparsed_binding_fragment')
    expect(km.warnings).toContain('macros_expanded')
  })

  it('does not treat comment interiors as extra or glued bindings', () => {
    const src = `/ { keymap { compatible = "zmk,keymap";
  base { bindings = < /* L & R */ &kp A // tail
    &kp B >; }; }; };
`
    const km = parseDtsKeymap(src)
    expect(km.layers).toEqual([['&kp A', '&kp B']])
    const result = buildKeymapCode(TINY_LAYOUT, parseKeymap(km), {
      originalSource: src
    })
    const bindingLine = result.code
      .split(/\r?\n/)
      .find(line => line.includes('bindings = <'))
    expect(bindingLine).toBeDefined()
    expect(bindingLine).not.toContain('//')
    expect(result.code).toMatch(/bindings = <\s*&kp A\s+&kp B\s*>/)
  })

  it('does not warn macros_expanded for a define name that only appears in a bindings comment', () => {
    const src = `#define UNUSED FOO
/ {
  keymap {
    compatible = "zmk,keymap";
    layer_0 {
      bindings = <&kp A // UNUSED
        &kp B>;
    };
  };
};
`
    const km = parseDtsKeymap(src)
    expect(km.layers[0]).toEqual(['&kp A', '&kp B'])
    expect(km.warnings).not.toContain('macros_expanded')
  })

  it('keeps a hyphenated layer node name', () => {
    const src = `/ {
  keymap {
    compatible = "zmk,keymap";
    layer-base {
      bindings = <&kp A &kp B>;
    };
  };
};
`
    const km = parseDtsKeymap(src)
    expect(km.layer_names).toEqual(['layer-base'])
    expect(km.layers).toEqual([['&kp A', '&kp B']])
  })

  it('expands a define that introduces the leading & before tokenize', () => {
    const src = `#define VOL &kp C_VOL_UP
/ {
  keymap {
    compatible = "zmk,keymap";
    layer_0 {
      bindings = <VOL &kp A>;
    };
  };
};
`
    const km = parseDtsKeymap(src)
    expect(km.layers[0]).toEqual(['&kp C_VOL_UP', '&kp A'])
    expect(km.warnings).toContain('macros_expanded')
    expect(km.warnings).not.toContain('unparsed_binding_fragment')
  })

  it('joins a backslash-newline continued #define before parsing', () => {
    const src = `#define VU C_VOL_\\
UP
/ {
  keymap {
    compatible = "zmk,keymap";
    layer_0 {
      bindings = <&kp VU &kp A>;
    };
  };
};
`
    expect(parseDefines(src)).toEqual({ VU: 'C_VOL_UP' })
    const km = parseDtsKeymap(src)
    expect(km.layers[0]).toEqual(['&kp C_VOL_UP', '&kp A'])
  })

  it('takes the #define value from the mask so a block comment is not a token', () => {
    const src = `#define VOL &kp /* skip */ C_VOL_UP
/ {
  keymap {
    compatible = "zmk,keymap";
    layer_0 {
      bindings = <VOL &kp A>;
    };
  };
};
`
    expect(parseDefines(src)).toEqual({ VOL: '&kp C_VOL_UP' })
    const km = parseDtsKeymap(src)
    expect(km.layers[0]).toEqual(['&kp C_VOL_UP', '&kp A'])
  })

  it('does not treat the next line as a value of an empty #define', () => {
    const src = `#define FOO
&kp STOLEN
/ {
  keymap {
    compatible = "zmk,keymap";
    layer_0 {
      bindings = <&kp A &kp B>;
    };
  };
};
`
    expect(parseDefines(src)).toEqual({})
    const km = parseDtsKeymap(src)
    expect(km.layers[0]).toEqual(['&kp A', '&kp B'])
  })

  it('expands chained #define aliases regardless of declaration order', () => {
    const src = `#define A B
#define B X
/ {
  keymap {
    compatible = "zmk,keymap";
    layer_0 {
      bindings = <&kp A &kp C>;
    };
  };
};
`
    const km = parseDtsKeymap(src)
    expect(km.layers[0]).toEqual(['&kp X', '&kp C'])
    expect(km.warnings).toContain('macros_expanded')
  })

  it('does not expand a #define whose value is several & bindings', () => {
    const src = `#define KEYS &kp A &kp B
/ {
  keymap {
    compatible = "zmk,keymap";
    layer_0 {
      bindings = <KEYS>;
    };
  };
};
`
    const km = parseDtsKeymap(src)
    expect(km.layers[0]).not.toEqual(['&kp A', '&kp B'])
    expect(km.layers[0]).toEqual([])
    expect(km.warnings).toContain('macros_multi_binding')
  })
})

describe('buildKeymapCode macros_expanded regions', () => {
  it('warns when a define is used only in combo bindings', () => {
    const src = `#define ESC_KEY ESC
/ {
  keymap {
    compatible = "zmk,keymap";
    layer_0 {
      bindings = <&kp A &kp B>;
    };
  };
  combos {
    compatible = "zmk,combos";
    combo_esc {
      bindings = <&kp ESC_KEY>;
      key-positions = <0 1>;
    };
  };
};
`
    const parsed = parseDtsKeymap(src)
    expect(parsed.warnings).toContain('macros_expanded')
    const result = buildKeymapCode(TINY_LAYOUT, parseKeymap(parsed), {
      originalSource: src
    })
    expect(result.warnings).toContain('macros_expanded')
  })

  it('warns when a define is used only in sensor-bindings', () => {
    const src = `#define VU C_VOL_UP
/ {
  keymap {
    compatible = "zmk,keymap";
    layer_0 {
      bindings = <&kp A &kp B>;
      sensor-bindings = <&inc_dec_kp VU C_VOL_DN>;
    };
  };
};
`
    const parsed = parseDtsKeymap(src)
    expect(parsed.warnings).toContain('macros_expanded')
    const result = buildKeymapCode(TINY_LAYOUT, parseKeymap(parsed), {
      originalSource: src
    })
    expect(result.warnings).toContain('macros_expanded')
  })
})

describe('parseDtsKeymap preprocessor and multiple keymap nodes', () => {
  it('warns preprocessor_conditional for #if 0 layers and refuses Save splice', () => {
    const src = `/ {
  keymap {
    compatible = "zmk,keymap";
    layer_0 { bindings = <&kp A &kp B>; };
#if 0
    layer_1 { bindings = <&kp C &kp D>; };
#endif
  };
};
`
    const km = parseDtsKeymap(src)
    expect(km.warnings).toContain('preprocessor_conditional')
    expect(km.layers.length).toBe(2)
    expect(() =>
      buildKeymapCode(TINY_LAYOUT, parseKeymap(km), { originalSource: src })
    ).toThrow(KeymapValidationError)
    try {
      buildKeymapCode(TINY_LAYOUT, parseKeymap(km), { originalSource: src })
    } catch (e) {
      expect((e as KeymapValidationError).errors[0]).toMatch(/preprocessor/)
    }
  })

  it('warns multiple_keymap_nodes after /delete-node/ and refuses splice', () => {
    const src = `/ {
  keymap {
    compatible = "zmk,keymap";
    layer_0 { bindings = <&kp A &kp B>; };
  };
};
/delete-node/ &{/keymap};
/ {
  keymap {
    compatible = "zmk,keymap";
    layer_0 { bindings = <&kp C &kp D>; };
  };
};
`
    const km = parseDtsKeymap(src)
    expect(km.warnings).toContain('multiple_keymap_nodes')
    expect(km.layers[0]).toEqual(['&kp A', '&kp B'])
    expect(() =>
      buildKeymapCode(TINY_LAYOUT, parseKeymap(km), { originalSource: src })
    ).toThrow(KeymapValidationError)
    try {
      buildKeymapCode(TINY_LAYOUT, parseKeymap(km), { originalSource: src })
    } catch (e) {
      expect((e as KeymapValidationError).errors[0]).toMatch(/multiple keymap/)
    }
  })
})

const WITH_UNCHANGED_BLOCKS = `/ {
    behaviors {
        hm: homerow_mods {
            compatible = "zmk,behavior-hold-tap";
            // keep-ht
            label = "HOMEROW_MODS";
            #binding-cells = <2>;
            tapping-term-ms = <280>;
            flavor = "tap-preferred";
            bindings = <&kp>, <&kp>;
        };
    };

    keymap {
        compatible = "zmk,keymap";
        default_layer {
            bindings = <
&kp A &kp B
            >;
        };
    };

    combos {
        compatible = "zmk,combos";
        // keep-combo
        combo_esc {
            bindings = <&kp ESC>;
            key-positions = <0 1>;
            timeout-ms = <40>;
        };
    };

    conditional_layers {
        compatible = "zmk,conditional-layers";
        // keep-cl
        tri_layer {
            if-layers = <1 2>;
            then-layer = <3>;
        };
    };
};
`

function namedBlockSlice(
  source: string,
  keyword: string,
  compatible?: string
): string {
  const block = findNamedBlock(source, maskDts(source), keyword, {
    ...(compatible ? { compatible } : {})
  })
  expect(block).not.toBeNull()
  return source.slice(block!.keywordStart, block!.closeBrace + 2)
}

describe('buildKeymapCode unchanged combos/conditional/hold-tap', () => {
  it('leaves those blocks byte-identical when only a key binding changes', () => {
    const km = parseKeymap(parseDtsKeymap(WITH_UNCHANGED_BLOCKS))
    km.layers[0][0] = { value: '&kp', params: [{ value: 'C', params: [] }] }
    const built = buildKeymapCode(TINY_LAYOUT, km, {
      originalSource: WITH_UNCHANGED_BLOCKS
    })
    expect(built.mode).toBe('splice')
    expect(built.code).toContain('&kp C')
    expect(namedBlockSlice(built.code, 'combos', 'zmk,combos')).toBe(
      namedBlockSlice(WITH_UNCHANGED_BLOCKS, 'combos', 'zmk,combos')
    )
    expect(
      namedBlockSlice(built.code, 'conditional_layers', 'zmk,conditional-layers')
    ).toBe(
      namedBlockSlice(
        WITH_UNCHANGED_BLOCKS,
        'conditional_layers',
        'zmk,conditional-layers'
      )
    )
    expect(namedBlockSlice(built.code, 'behaviors')).toBe(
      namedBlockSlice(WITH_UNCHANGED_BLOCKS, 'behaviors')
    )
  })

  it('still rewrites a block when its model fingerprint changes', () => {
    const km = parseKeymap(parseDtsKeymap(WITH_UNCHANGED_BLOCKS))
    km.combos = [
      {
        id: 'combo_esc',
        keyPositions: [0, 1],
        binding: { value: '&kp', params: [{ value: 'TAB', params: [] }] }
      }
    ]
    const built = buildKeymapCode(TINY_LAYOUT, km, {
      originalSource: WITH_UNCHANGED_BLOCKS
    })
    expect(built.code).toContain('&kp TAB')
    expect(built.code).not.toContain('// keep-combo')
  })
})

describe('compileMacros', () => {
  it('copies the macro table so later mutation of the input is ignored', () => {
    const macros = { FOO: '&kp A' }
    const compiled = compileMacros(macros)
    macros.FOO = '&kp B'
    compiled.macros.BAR = '&kp C'
    expect(compiled.macros.FOO).toBe('&kp A')
    expect(Object.prototype.hasOwnProperty.call(macros, 'BAR')).toBe(false)
  })
})
