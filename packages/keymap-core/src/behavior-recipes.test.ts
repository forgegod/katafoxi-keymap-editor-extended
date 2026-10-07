import { describe, expect, it } from 'vitest'
import {
  BEHAVIOR_RECIPES,
  defaultRgbLayerBinding,
  defaultRgbLayerHsb,
  detectRgbLayerRecipeFromDts,
  dtsHasRgbLayerNode,
  encodeKeyBinding,
  hsbBindingNode,
  hsbToCss,
  mergeRecipeCatalog,
  normalizeRgbLayerBinding,
  parseHsbBindingNode,
  parseKeyBinding,
  parseKeymap,
  RGB_LAYER_RECIPE,
  RGB_LAYER_RECIPE_CODE,
  shouldEnsureRgbLayerRecipe,
  spliceRgbLayerRecipeIntoDts,
  buildKeymapCode
} from './index.js'
import { getBehaviorCatalog } from './catalog.js'
import type { LayoutKey } from './types.js'

const TINY: LayoutKey[] = [
  { x: 0, y: 0, row: 0, col: 0 },
  { x: 1, y: 0, row: 0, col: 1 }
]

describe('RGB layer recipe', () => {
  it('lists the layer+RGB recipe', () => {
    expect(BEHAVIOR_RECIPES.map(r => r.code)).toEqual([RGB_LAYER_RECIPE_CODE])
    expect(RGB_LAYER_RECIPE.params).toEqual(['layer', 'hsb'])
  })

  it('round-trips HSB binding nodes', () => {
    const node = hsbBindingNode({ h: 128, s: 100, b: 50 })
    expect(parseHsbBindingNode(node)).toEqual({ h: 128, s: 100, b: 50 })
    expect(encodeKeyBinding({ value: '&rgblayer', params: [{ value: 1, params: [] }, node] })).toBe(
      '&rgblayer 1 RGB_COLOR_HSB(128,100,50)'
    )
    const parsed = parseKeyBinding('&rgblayer 1 RGB_COLOR_HSB(10, 20, 30)')
    expect(parseHsbBindingNode(parsed.params[1]!)).toEqual({ h: 10, s: 20, b: 30 })
  })

  it('collapses CMD+VAL into one HSB node', () => {
    const raw = parseKeyBinding(
      '&rgblayer 2 RGB_COLOR_HSB_CMD RGB_COLOR_HSB_VAL(1,2,3)'
    )
    const normalized = normalizeRgbLayerBinding(raw)
    expect(encodeKeyBinding(normalized)).toBe('&rgblayer 2 RGB_COLOR_HSB(1,2,3)')
  })

  it('merges the recipe into the behavior catalog when armed', () => {
    const base = getBehaviorCatalog()
    expect(mergeRecipeCatalog(base, undefined).byCode['&rgblayer']).toBeUndefined()
    const merged = mergeRecipeCatalog(base, true)
    expect(merged.byCode['&rgblayer']?.params).toEqual(['layer', 'hsb'])
    expect(merged.byCode['&rgblayer']?.name).toBe('Layer + RGB')
  })

  it('detects an existing rgblayer node and inserts when missing', () => {
    const withNode = `/ {
    behaviors {
        rgblayer: rgb_layer {
            compatible = "zmk,behavior-macro-two-param";
            #binding-cells = <2>;
        };
    };
    keymap {
        compatible = "zmk,keymap";
        default_layer {
            bindings = <&kp A &kp B>;
        };
    };
};
`
    expect(dtsHasRgbLayerNode(withNode)).toBe(true)
    expect(spliceRgbLayerRecipeIntoDts(withNode)).toBe(withNode)

    const bare = `/ {
    behaviors {
        hm: hm {
            compatible = "zmk,behavior-hold-tap";
            bindings = <&kp>, <&kp>;
        };
    };
    keymap {
        compatible = "zmk,keymap";
        default_layer {
            bindings = <&kp A &kp B>;
        };
    };
};
`
    expect(dtsHasRgbLayerNode(bare)).toBe(false)
    const spliced = spliceRgbLayerRecipeIntoDts(bare)
    expect(dtsHasRgbLayerNode(spliced)).toBe(true)
    expect(spliced).toContain('MOMENTARY_LAYER_WITH_RGB_COLOR')
    expect(spliced).toContain('hm: hm')
    // Idempotent.
    expect(spliceRgbLayerRecipeIntoDts(spliced)).toBe(spliced)
  })

  it('ensures the node on Save when rgbLayerRecipe is set', () => {
    const source = `/ {
    behaviors {
    };
    keymap {
        compatible = "zmk,keymap";
        default_layer {
            bindings = <
&kp A &kp B
            >;
        };
    };
};
`
    const km = parseKeymap({
      layers: [['&rgblayer 1 RGB_COLOR_HSB(128,100,100)', '&kp B']],
      rgbLayerRecipe: true
    })
    expect(shouldEnsureRgbLayerRecipe(km)).toBe(true)
    const built = buildKeymapCode(TINY, km, { originalSource: source })
    expect(built.code).toContain('rgblayer: rgb_layer')
    expect(built.code).toContain('&rgblayer 1 RGB_COLOR_HSB(128,100,100)')
  })

  it('detects recipe from DTS bindings without a node yet', () => {
    expect(
      detectRgbLayerRecipeFromDts('keymap {}', [['&rgblayer 1 RGB_COLOR_HSB(0,0,0)']])
    ).toBe(true)
    expect(detectRgbLayerRecipeFromDts('keymap {}', [['&kp A']])).toBe(false)
  })

  it('builds a default binding with a per-layer tone', () => {
    const tone = defaultRgbLayerHsb(3)
    expect(defaultRgbLayerHsb(0).h).not.toBe(defaultRgbLayerHsb(1).h)
    expect(defaultRgbLayerHsb(4)).toEqual(defaultRgbLayerHsb(0))
    expect(encodeKeyBinding(defaultRgbLayerBinding(3))).toBe(
      `&rgblayer 3 RGB_COLOR_HSB(${tone.h},${tone.s},${tone.b})`
    )
    expect(encodeKeyBinding(defaultRgbLayerBinding(1, { h: 10, s: 20, b: 30 }))).toBe(
      '&rgblayer 1 RGB_COLOR_HSB(10,20,30)'
    )
  })

  it('maps HSB to a CSS color', () => {
    expect(hsbToCss({ h: 0, s: 0, b: 255 })).toMatch(/^hsl\(/)
  })
})
