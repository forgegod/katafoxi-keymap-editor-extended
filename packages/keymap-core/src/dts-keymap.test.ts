import { describe, expect, it } from 'vitest'
import { parseDtsKeymap, tokenizeBindings } from '../src/dts-keymap.js'

describe('tokenizeBindings', () => {
  it('splits binds including multi-param', () => {
    const binds = tokenizeBindings(`
      &kp A &mt LCTRL J &lt 1 LS(CAPS) &none
    `)
    expect(binds).toEqual(['&kp A', '&mt LCTRL J', '&lt 1 LS(CAPS)', '&none'])
  })
})

describe('parseDtsKeymap', () => {
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
})
