import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildKeymapCode,
  diffKeymaps,
  getBehaviorCatalog,
  getBehaviourParams,
  autoshiftBindingParams,
  encodeKeyBinding,
  ensureHoldTapPreset,
  holdTapTimingNote,
  isPrimaryKeymapJson,
  mergeHoldTapCatalog,
  parseDtsHoldTaps,
  parseDtsKeymap,
  replaceHoldTapTiming,
  spliceHoldTapsIntoDts,
  parseKeyBinding,
  parseKeymap,
  resolveBinding
} from './index.js'
import type { LayoutKey } from './types.js'

const NAMED = `/ {
    behaviors {
        hm: homerow_mods {
            compatible = "zmk,behavior-hold-tap";
            label = "HOMEROW_MODS";
            #binding-cells = <2>;
            tapping-term-ms = <280>;
            quick-tap-ms = <0>;
            flavor = "tap-preferred";
            bindings = <&kp>, <&kp>;
        };
    };

    keymap {
        compatible = "zmk,keymap";

        default_layer {
            bindings = <
&hm LCTRL A &kp B
            >;
        };
    };
};
`

const TINY: LayoutKey[] = [
  { x: 0, y: 0, row: 0, col: 0 },
  { x: 1, y: 0, row: 0, col: 1 }
]

describe('parseDtsHoldTaps', () => {
  it('reads a named hold-tap and keeps its arguments on the binding', () => {
    const raw = parseDtsKeymap(NAMED)
    expect(raw.holdTaps).toEqual([
      {
        code: '&hm',
        nodeName: 'homerow_mods',
        tappingTermMs: 280,
        quickTapMs: 0,
        flavor: 'tap-preferred',
        bindings: ['&kp', '&kp'],
        params: ['code', 'code']
      }
    ])

    const parsed = parseKeymap(raw)
    const catalog = mergeHoldTapCatalog(getBehaviorCatalog(), parsed.holdTaps)
    const hm = catalog.byCode['&hm']
    expect(hm?.params).toEqual(['mod', 'code'])
    expect(hm?.name).toBe('Homerow')
    expect(hm?.description).toBe('Homerow, 280 ms, tap preferred, quick-tap 0 ms')

    const binding = parsed.layers[0][0]
    expect(getBehaviourParams(binding.params, hm).length).toBe(2)
    expect(resolveBinding(binding)).toEqual({
      tap: 'A',
      hold: { kind: 'mod', code: 'LCTRL' }
    })
    expect(resolveBinding(parseKeyBinding('&hm 1 TAB'))).toEqual({
      tap: 'TAB',
      hold: { kind: 'layer', layer: 1 }
    })
  })

  it('ignores a commented-out term and a commented compatible', () => {
    const source = `
      /* compatible = "zmk,behavior-hold-tap"; tapping-term-ms = <999>; */
      hm: hm {
          compatible = "zmk,behavior-hold-tap";
          // tapping-term-ms = <999>;
          tapping-term-ms = <200>;
          bindings = <&kp>, <&kp>;
      };
    `
    expect(parseDtsHoldTaps(source)).toEqual([
      {
        code: '&hm',
        nodeName: 'hm',
        tappingTermMs: 200,
        bindings: ['&kp', '&kp'],
        params: ['code', 'code']
      }
    ])
  })

  it('ignores braces inside hold-tap comments when matching the node', () => {
    const source = `
      hm: hm {
          compatible = "zmk,behavior-hold-tap";
          // { decoy
          /* } */
          tapping-term-ms = <200>;
          flavor = "balanced";
          bindings = <&kp>, <&kp>;
      };
    `
    expect(parseDtsHoldTaps(source)).toEqual([
      {
        code: '&hm',
        nodeName: 'hm',
        tappingTermMs: 200,
        flavor: 'balanced',
        bindings: ['&kp', '&kp'],
        params: ['code', 'code']
      }
    ])
  })

  it('reads &mt and &lt timing blocks from the LARK keymap', () => {
    const source = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/lark/lark.keymap'),
      'utf8'
    )
    const holdTaps = parseDtsHoldTaps(source)
    expect(holdTaps).toEqual([
      { code: '&mt', override: true, flavor: 'tap-preferred', tappingTermMs: 300 },
      { code: '&lt', override: true, flavor: 'balanced', tappingTermMs: 150 }
    ])
    const catalog = mergeHoldTapCatalog(getBehaviorCatalog(), holdTaps)
    expect(catalog.byCode['&mt']?.description).toBe('Mod Tap, 300 ms, tap preferred')
    expect(catalog.byCode['&mt']?.params).toEqual(['mod', 'code'])
    expect(catalog.list.some(behavior => behavior.code === '&hm')).toBe(false)
    expect(holdTapTimingNote(catalog.byCode['&lt'])).toBe('150 ms, balanced')
    expect(getBehaviorCatalog().byCode['&mt']?.description).toBeUndefined()
  })

  it('round-trips hold-taps through keymap.json and leaves the nodes in the file', () => {
    const parsed = parseKeymap(parseDtsKeymap(NAMED))
    const built = buildKeymapCode(TINY, parsed, { originalSource: NAMED })
    expect(built.code).toContain('compatible = "zmk,behavior-hold-tap"')
    expect(built.code).toContain('tapping-term-ms = <280>')
    expect(built.code).toContain('&hm LCTRL A')

    const json = JSON.parse(built.json) as { layers: string[][]; holdTaps?: unknown }
    expect(isPrimaryKeymapJson(json)).toBe(true)
    const again = parseKeymap(json)
    expect(again.holdTaps).toEqual(parsed.holdTaps)
    expect(again.layers[0][0]).toMatchObject({
      value: '&hm',
      params: [{ value: 'LCTRL' }, { value: 'A' }]
    })
  })

  it('rejects &hm in keymap.json when the hold-tap list is missing', () => {
    expect(isPrimaryKeymapJson({ layers: [['&hm LCTRL A']] })).toBe(false)
  })

  it('keeps an empty holdTaps array so a later load does not guess', () => {
    expect(parseKeymap({ layers: [['&kp A']], holdTaps: [] }).holdTaps).toEqual([])
  })

  it('rewrites an &mt term in place and keeps the rest of the node', () => {
    const source = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/lark/lark.keymap'),
      'utf8'
    )
    const next = replaceHoldTapTiming(parseDtsHoldTaps(source), '&mt', {
      tappingTermMs: 280,
      flavor: 'tap-preferred'
    })
    const spliced = spliceHoldTapsIntoDts(source, next)
    expect(spliced).toContain('#define VU          C_VOL_UP')
    expect(spliced).toContain('tapping-term-ms = <280>')
    expect(spliced).toContain('tapping-term-ms = <150>')
    expect(spliced).not.toContain('tapping-term-ms = <300>')
    expect(parseDtsHoldTaps(spliced)).toEqual(next)
  })

  it('inserts a named hold-tap without dropping an existing label property', () => {
    const parsed = parseKeymap(parseDtsKeymap(NAMED))
    const changed = replaceHoldTapTiming(parsed.holdTaps, '&hm', {
      tappingTermMs: 100,
      flavor: 'balanced'
    })
    const spliced = spliceHoldTapsIntoDts(NAMED, changed)
    expect(spliced).toContain('label = "HOMEROW_MODS"')
    expect(spliced).toContain('quick-tap-ms = <0>')
    expect(spliced).toContain('tapping-term-ms = <100>')
    expect(spliced).toContain('flavor = "balanced"')
    expect(parseDtsHoldTaps(spliced)[0]).toMatchObject({
      code: '&hm',
      tappingTermMs: 100,
      flavor: 'balanced',
      quickTapMs: 0
    })
  })

  it('adds a new hold-tap node inside the keymap root', () => {
    const source = `/ {\n    keymap {\n        compatible = "zmk,keymap";\n        default_layer {\n            bindings = <&kp A>;\n        };\n    };\n};\n`
    const node = {
      code: '&hm',
      nodeName: 'hm',
      tappingTermMs: 200,
      flavor: 'tap-preferred',
      bindings: ['&kp', '&kp'],
      params: ['code', 'code']
    }
    const spliced = spliceHoldTapsIntoDts(source, [node])
    expect(spliced).toContain('behaviors {')
    expect(spliced).toContain('hm: hm {')
    expect(spliced).toContain('compatible = "zmk,behavior-hold-tap"')
    expect(parseDtsHoldTaps(spliced)).toEqual([node])
  })

  it('inserts a hold-tap with CRLF when the source uses CRLF', () => {
    const source =
      `/ {\r\n    keymap {\r\n        compatible = "zmk,keymap";\r\n        default_layer {\r\n            bindings = <&kp A>;\r\n        };\r\n    };\r\n};\r\n`
    const node = {
      code: '&hm',
      nodeName: 'hm',
      tappingTermMs: 200,
      flavor: 'tap-preferred',
      bindings: ['&kp', '&kp'],
      params: ['code', 'code']
    }
    const spliced = spliceHoldTapsIntoDts(source, [node])
    expect(spliced).toContain('hm: hm {')
    expect(spliced.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('drops a cleared &mt block and reports the behavior as dirty', () => {
    const source = `&mt {\n    flavor = "tap-preferred";\n    tapping-term-ms = <300>;\n};\n\n/ {\n    keymap {\n        compatible = "zmk,keymap";\n        default_layer {\n            bindings = <&kp A>;\n        };\n    };\n};\n`
    const cleared = replaceHoldTapTiming(parseDtsHoldTaps(source), '&mt', {
      tappingTermMs: undefined,
      flavor: undefined
    })
    expect(cleared).toEqual([])
    const spliced = spliceHoldTapsIntoDts(source, cleared)
    expect(spliced).not.toContain('&mt {')
    expect(spliced).toContain('compatible = "zmk,keymap"')
    const before = parseKeymap(parseDtsKeymap(source))
    const after = { ...before, holdTaps: cleared }
    expect(diffKeymaps(before, after).some(change => change.type === 'hold_tap')).toBe(true)
  })

  it('adds homerow and autoshift once, with their default timing', () => {
    const homerow = ensureHoldTapPreset(undefined, '&hm')
    expect(homerow).toEqual([
      {
        code: '&hm',
        nodeName: 'hm',
        tappingTermMs: 280,
        flavor: 'balanced',
        quickTapMs: 175,
        requirePriorIdleMs: 150,
        bindings: ['&kp', '&kp'],
        params: ['mod', 'code']
      }
    ])
    expect(ensureHoldTapPreset(homerow, '&hm')).toBe(homerow)

    const both = ensureHoldTapPreset(homerow, '&as')
    expect(both.map(node => node.code)).toEqual(['&hm', '&as'])
    expect(both[1]).toMatchObject({
      tappingTermMs: 135,
      flavor: 'tap-preferred',
      quickTapMs: 0,
      params: ['code', 'code']
    })
    expect(encodeKeyBinding({ value: '&as', params: autoshiftBindingParams('Q') })).toBe(
      '&as LS(Q) Q'
    )
  })
})
