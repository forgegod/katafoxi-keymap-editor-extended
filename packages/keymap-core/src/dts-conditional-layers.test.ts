import { describe, expect, it } from 'vitest'
import {
  buildKeymapCode,
  conditionalLayerCoverWarning,
  conditionalLayerHover,
  conditionalLayerRowPeer,
  conditionalLayerSentence,
  conditionalLayerWhenText,
  diffKeymaps,
  encodeKeymap,
  nextConditionalLayerId,
  parseDtsConditionalLayers,
  parseDtsKeymap,
  parseKeymap,
  remapConditionalLayersAfterDelete,
  spliceConditionalLayersIntoDts,
  summarizeKeymapDiff
} from './index.js'
import type { LayoutKey, ParsedKeymap, ZmkConditionalLayer } from './types.js'

const TINY: LayoutKey[] = [
  { x: 0, y: 0, row: 0, col: 0 },
  { x: 1, y: 0, row: 0, col: 1 }
]

const WITH_RULE = `/ {
    keymap {
        compatible = "zmk,keymap";

        default_layer {
            bindings = <
&kp A &kp B
            >;
        };
    };

    conditional_layers {
        compatible = "zmk,conditional-layers";

        tri_layer {
            if-layers = <1 2>;
            then-layer = <3>;
        };
    };
};
`

const rule = (
  id: string,
  ifLayers: number[],
  thenLayer: number
): ZmkConditionalLayer => ({ id, ifLayers, thenLayer })

describe('parseDtsConditionalLayers', () => {
  it('reads the held layers and the layer they show', () => {
    expect(parseDtsConditionalLayers(WITH_RULE)).toEqual([
      rule('tri_layer', [1, 2], 3)
    ])
  })

  it('returns [] when the file has no conditional layers', () => {
    expect(
      parseDtsConditionalLayers(`/ {
    keymap {
        compatible = "zmk,keymap";
        default_layer { bindings = <&kp A>; };
    };
};`)
    ).toEqual([])
  })

  it('ignores braces inside conditional-layer comments', () => {
    const src = `/ {
    conditional_layers {
        compatible = "zmk,conditional-layers";
        tri_layer {
            // { decoy
            /* } */
            if-layers = <1 2>;
            then-layer = <3>;
        };
    };
};
`
    expect(parseDtsConditionalLayers(src)).toEqual([rule('tri_layer', [1, 2], 3)])
  })

  it('attaches rules on DTS import and round-trips through keymap JSON', () => {
    const raw = parseDtsKeymap(WITH_RULE)
    expect(raw.conditionalLayers).toEqual([rule('tri_layer', [1, 2], 3)])
    const parsed = parseKeymap(raw)
    expect(parsed.conditionalLayers).toEqual([rule('tri_layer', [1, 2], 3)])
    const again = parseKeymap(encodeKeymap(parsed))
    expect(again.conditionalLayers).toEqual(parsed.conditionalLayers)
  })
})

describe('spliceConditionalLayersIntoDts', () => {
  it('inserts a block and keeps the preamble', () => {
    const source = `/* keep */
/ {
    keymap {
        compatible = "zmk,keymap";
        default_layer {
            bindings = <&kp A &kp B>;
        };
    };
};
`
    const next = spliceConditionalLayersIntoDts(source, [rule('tri_layer', [2, 1], 3)])
    expect(next).toContain('/* keep */')
    expect(next).toContain('compatible = "zmk,conditional-layers"')
    expect(next).toContain('if-layers = <1 2>;')
    expect(next).toContain('then-layer = <3>;')
    expect(parseDtsConditionalLayers(next)).toEqual([rule('tri_layer', [1, 2], 3)])
  })

  it('removes the block when the list is empty', () => {
    const next = spliceConditionalLayersIntoDts(WITH_RULE, [])
    expect(next).not.toContain('conditional_layers')
    expect(next).toContain('&kp A')
    expect(parseDtsConditionalLayers(next)).toEqual([])
  })

  it('writes the block on save and drops it after the rules are cleared', () => {
    const parsed = parseKeymap(parseDtsKeymap(WITH_RULE))
    const built = buildKeymapCode(TINY, parsed, { originalSource: WITH_RULE })
    expect(built.mode).toBe('splice')
    expect(built.code).toContain('then-layer = <3>;')
    expect(built.json).toContain('"conditionalLayers"')

    const cleared: ParsedKeymap = { ...parsed, conditionalLayers: [] }
    const gone = buildKeymapCode(TINY, cleared, { originalSource: built.code })
    expect(gone.code).not.toContain('conditional_layers')
  })
})

describe('remapConditionalLayersAfterDelete', () => {
  const rules = [rule('when_lower_raise', [1, 2], 3)]

  it('renumbers when a layer below the rule is removed', () => {
    expect(remapConditionalLayersAfterDelete(rules, 0)).toEqual([
      rule('when_lower_raise', [0, 1], 2)
    ])
  })

  it('drops the rule when the shown layer or a required hold disappears', () => {
    expect(remapConditionalLayersAfterDelete(rules, 3)).toEqual([])
    expect(remapConditionalLayersAfterDelete(rules, 2)).toEqual([])
  })

  it('keeps a rule that still has two holds after a spare layer is removed', () => {
    expect(
      remapConditionalLayersAfterDelete([rule('wide', [1, 2, 4], 3)], 4)
    ).toEqual([rule('wide', [1, 2], 3)])
  })
})

describe('conditional layer copy and hover', () => {
  const names = ['Base', 'Lower', 'Raise', 'Adjust']
  const rules = [rule('when_lower_raise', [1, 2], 3)]

  it('names the overlap in a sentence and a short row mark', () => {
    expect(conditionalLayerSentence(rules[0], names)).toBe(
      'When Lower and Raise are held, show Adjust'
    )
    expect(conditionalLayerWhenText(rules, 3, names)).toBe('when Lower + Raise')
    expect(conditionalLayerWhenText(rules, 0, names)).toBeNull()
  })

  it('warns when the shown layer can be covered', () => {
    expect(conditionalLayerCoverWarning(rules[0])).toBeNull()
    expect(conditionalLayerCoverWarning(rule('low', [1, 2], 2))).toMatch(/below/)
  })

  it('builds a unique id from the held layer names', () => {
    expect(nextConditionalLayerId([1, 2], names, [])).toBe('when_lower_raise')
    expect(nextConditionalLayerId([1, 2], names, rules)).toBe('when_lower_raise_2')
  })

  it('points a then-layer hover at the held layers and marks the partner row', () => {
    expect(conditionalLayerHover(3, rules)).toEqual({
      kind: 'layers',
      layers: [1, 2],
      source: 3
    })
    expect(conditionalLayerHover(1, rules)).toEqual({ kind: 'layer', layer: 1 })
    const hover = conditionalLayerHover(3, rules)
    expect(conditionalLayerRowPeer(1, hover, rules)).toBe(true)
    expect(conditionalLayerRowPeer(3, hover, rules)).toBe(false)
    expect(conditionalLayerRowPeer(3, { kind: 'layer', layer: 1 }, rules)).toBe(true)
  })
})

describe('conditional layer diff', () => {
  function bare(): ParsedKeymap {
    return {
      layer_names: ['Base'],
      layers: [[{ value: '&trans', params: [] }]]
    }
  }

  it('treats a missing list and an empty list as equal', () => {
    const a = bare()
    const b = bare()
    b.conditionalLayers = []
    expect(diffKeymaps(a, b)).toEqual([])
  })

  it('counts an added rule', () => {
    const a = bare()
    const b = bare()
    b.conditionalLayers = [rule('when_lower_raise', [2, 1], 3)]
    const changes = diffKeymaps(a, b)
    expect(changes).toEqual([
      {
        type: 'conditional_layer',
        id: 'when_lower_raise',
        before: '',
        after: '1+2->3'
      }
    ])
    expect(summarizeKeymapDiff(changes)).toBe('1 conditional layer')
  })
})
