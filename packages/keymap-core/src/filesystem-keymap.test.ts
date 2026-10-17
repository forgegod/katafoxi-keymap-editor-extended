import { describe, expect, it } from 'vitest'
import { buildKeymapCode, KeymapValidationError, parseKeyBinding, parseKeymap } from './keymap.js'
import { parseDtsKeymap } from './dts-keymap.js'
import { buildFilesystemKeymap } from './filesystem-keymap.js'

// Core-preservation fixture: preamble #define, includes, a hold-tap behavior,
// an unknown external behavior with raw params, combos, conditional layers and
// per-layer encoder sensor-bindings.
const SOURCE = `/*
 * filesystem save fixture
 */
#define BT1 BT_SEL 1

#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>

/ {
    behaviors {
        hm: homerow_mods {
            compatible = "zmk,behavior-hold-tap";
            tapping-term-ms = <280>;
            flavor = "tap-preferred";
            bindings = <&kp>, <&kp>;
            #binding-cells = <2>;
        };
    };

    combos {
        compatible = "zmk,combos";
        combo_esc {
            bindings = <&kp ESC>;
            key-positions = <0 1>;
        };
    };

    conditional_layers {
        compatible = "zmk,conditional-layers";
        tri {
            if-layers = <0 1>;
            then-layer = <1>;
        };
    };

    keymap {
        compatible = "zmk,keymap";

        layer_0 {
            bindings = <
&external_unicode UC_DE_AE &kp BT1
&hm LCTRL A &kp B
            >;
            sensor-bindings = <&inc_dec_kp C_VOL_UP C_VOL_DN>;
        };

        layer_1 {
            bindings = <
&trans &trans
&trans &trans
            >;
        };
    };
};
`

const LAYOUT = [
  { x: 0, y: 0, row: 0, col: 0 },
  { x: 1, y: 0, row: 0, col: 1 },
  { x: 0, y: 1, row: 1, col: 0 },
  { x: 1, y: 1, row: 1, col: 1 }
]

const parsed = () => parseKeymap(parseDtsKeymap(SOURCE))

describe('buildFilesystemKeymap', () => {
  it('splices against the raw source and returns only code, mode and warnings', () => {
    const keymap = parsed()
    const result = buildFilesystemKeymap({ keymap, layout: LAYOUT, originalSource: SOURCE })

    expect(Object.keys(result).sort()).toEqual(['code', 'mode', 'warnings'])
    expect(result.mode).toBe('splice')
    expect(Array.isArray(result.warnings)).toBe(true)

    const expected = buildKeymapCode(LAYOUT, keymap, { originalSource: SOURCE })
    expect(result.code).toBe(expected.code)
    expect(expected.mode).toBe('splice')

    // Output is the full core code: preamble, includes, unknown behavior params
    // and the model blocks all survive.
    expect(result.code).toContain('#define BT1 BT_SEL 1')
    expect(result.code).toContain('#include <behaviors.dtsi>')
    expect(result.code).toContain('&external_unicode UC_DE_AE')
    expect(result.code).toContain('combo_esc')
    expect(result.code).toContain('conditional_layers')

    // Never the default template and never a second output.
    expect(result.warnings).not.toContain('generated_default_template')
    expect('json' in result).toBe(false)
  })

  it('propagates the core layer-count refusal instead of truncating', () => {
    const keymap = parsed()
    expect(() => buildFilesystemKeymap({
      keymap,
      layout: LAYOUT.slice(0, 3),
      originalSource: SOURCE
    })).toThrow(KeymapValidationError)
  })

  it.each([undefined, null, '', '   \n  '])(
    'refuses a missing or blank source instead of falling back to the default template: %j',
    source => {
      const keymap = parseKeymap({ layers: [['&kp A', '&kp B', '&kp C', '&kp D'], ['&trans', '&trans', '&trans', '&trans']] })
      expect(() => buildFilesystemKeymap({
        keymap,
        layout: LAYOUT,
        originalSource: source as unknown as string
      })).toThrow(KeymapValidationError)
    }
  )

  it.each([
    { template: '/ { keymap { compatible = "zmk,keymap"; }; };' },
    { outputs: ['a.keymap', 'b.keymap'] },
    { files: ['a.keymap', 'a.json'] },
    { sidecars: ['a.keymap.json'] },
    { json: '{"layers":[]}' },
    { hostSnapshot: { version: 1 } },
    { mode: 'template' }
  ])('rejects unsupported save parameters before any work: %j', extra => {
    const keymap = parsed()
    expect(() => buildFilesystemKeymap({
      keymap,
      layout: LAYOUT,
      originalSource: SOURCE,
      ...extra
    } as unknown as Parameters<typeof buildFilesystemKeymap>[0])).toThrow(KeymapValidationError)
  })

  it('surfaces splice warnings from the shared writer', () => {
    const result = buildFilesystemKeymap({ keymap: parsed(), layout: LAYOUT, originalSource: SOURCE })
    expect(result.warnings).toContain('macros_expanded')
  })

  it('splices a second save against the retained first verified output', () => {
    const first = buildFilesystemKeymap({ keymap: parsed(), layout: LAYOUT, originalSource: SOURCE })
    expect(first.mode).toBe('splice')

    const edited = parseKeymap(parseDtsKeymap(first.code))
    edited.layers[0][3] = parseKeyBinding('&kp Z')

    const second = buildFilesystemKeymap({ keymap: edited, layout: LAYOUT, originalSource: first.code })
    expect(second.mode).toBe('splice')
    // Preamble, includes, unknown behavior params and model blocks survive the repeat save.
    expect(second.code).toContain('#define BT1 BT_SEL 1')
    expect(second.code).toContain('#include <behaviors.dtsi>')
    expect(second.code).toContain('&external_unicode UC_DE_AE')
    expect(second.code).toContain('combo_esc')
    expect(second.code).toContain('conditional_layers')
    expect(second.code).toContain('&kp Z')
    expect(second.warnings).not.toContain('generated_default_template')
  })
})
