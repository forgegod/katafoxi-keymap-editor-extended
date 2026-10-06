import { describe, expect, it } from 'vitest'
import {
  buildKeymapCode,
  parseKeymap
} from '../src/keymap.js'
import {
  parseDefines,
  parseDtsKeymap,
  tokenizeBindings
} from '../src/dts-keymap.js'
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
