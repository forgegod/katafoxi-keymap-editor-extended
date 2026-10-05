import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildKeymapCode,
  encodeKeyBinding,
  parseDtsKeymap,
  parseKeymap,
  spliceBindingsIntoDts
} from '../src/index.js'
import type { LayoutKey } from '../src/types.js'

const WITH_SENSORS = `
/ {
  keymap {
    compatible = "zmk,keymap";
    default_layer {
      sensor-bindings = <&inc_dec_kp C_VOL_UP C_VOL_DN>;
      bindings = <
&kp A &kp B
      >;
    };
    lower_layer {
      bindings = <
&kp C &kp D
      >;
      sensor-bindings = <&inc_dec_kp PG_UP PG_DN &inc_dec_kp C_VOL_UP C_VOL_DN>;
    };
  };
};
`

const TWO: LayoutKey[] = [
  { x: 0, y: 0, row: 0, col: 0 },
  { x: 1, y: 0, row: 0, col: 1 }
]

describe('sensor-bindings', () => {
  it('does not treat sensor-bindings as the layer key list', () => {
    const raw = parseDtsKeymap(WITH_SENSORS)
    expect(raw.layers).toEqual([
      ['&kp A', '&kp B'],
      ['&kp C', '&kp D']
    ])
    expect(raw.sensorBindings).toEqual([
      ['&inc_dec_kp C_VOL_UP C_VOL_DN'],
      ['&inc_dec_kp PG_UP PG_DN', '&inc_dec_kp C_VOL_UP C_VOL_DN']
    ])
  })

  it('keeps a sensor line when the editor does not know about encoders', () => {
    const spliced = spliceBindingsIntoDts(WITH_SENSORS, {
      layout: TWO,
      layers: [
        ['&kp Z', '&kp B'],
        ['&kp C', '&kp D']
      ],
      layerNames: ['default', 'lower_layer']
    })
    expect(spliced).toContain('sensor-bindings = <&inc_dec_kp C_VOL_UP C_VOL_DN>;')
    expect(spliced).toContain('&kp Z')
    expect(spliced).not.toContain('&kp A')
  })

  it('round-trips encoder turns through keymap.json and writes a copied list onto a new layer', () => {
    const parsed = parseKeymap(parseDtsKeymap(WITH_SENSORS))
    expect(parsed.sensorBindings?.[0]?.map(encodeKeyBinding)).toEqual([
      '&inc_dec_kp C_VOL_UP C_VOL_DN'
    ])

    const again = parseKeymap(JSON.parse(buildKeymapCode(TWO, parsed, {
      originalSource: WITH_SENSORS
    }).json) as { layers: string[][] })
    expect(again.sensorBindings?.[1]?.map(encodeKeyBinding)).toEqual([
      '&inc_dec_kp PG_UP PG_DN',
      '&inc_dec_kp C_VOL_UP C_VOL_DN'
    ])

    const withLayer = {
      ...parsed,
      layer_names: ['default', 'lower_layer', 'raise'],
      layers: [...parsed.layers, parsed.layers[0].map(() => ({ value: '&trans', params: [] }))],
      sensorBindings: [
        ...(parsed.sensorBindings ?? []),
        parsed.sensorBindings?.[1] ?? []
      ]
    }
    const built = buildKeymapCode(TWO, withLayer, { originalSource: WITH_SENSORS })
    const turns = built.code.match(/sensor-bindings = <[^;]*>;/g) ?? []
    expect(turns).toHaveLength(3)
    expect(turns[2]).toContain('PG_UP')
    expect(built.code).toContain('&trans')
  })

  it('keeps Lily58 volume turns on every layer', () => {
    const source = readFileSync(
      new URL('../fixtures/demo/lily58/lily58.keymap', import.meta.url),
      'utf8'
    )
    const info = JSON.parse(
      readFileSync(new URL('../fixtures/demo/lily58/info.json', import.meta.url), 'utf8')
    ) as { layouts: Record<string, { layout: LayoutKey[] }> }
    const layout = Object.values(info.layouts)[0].layout
    const parsed = parseKeymap(parseDtsKeymap(source))
    expect(parsed.sensorBindings).toHaveLength(3)
    for (const row of parsed.sensorBindings ?? []) {
      expect(row.map(encodeKeyBinding)).toEqual(['&inc_dec_kp C_VOL_UP C_VOL_DN'])
    }

    const built = buildKeymapCode(layout, parsed, { originalSource: source })
    const turns = built.code.match(/sensor-bindings = <[^;]*>;/g) ?? []
    expect(turns).toEqual([
      'sensor-bindings = <&inc_dec_kp C_VOL_UP C_VOL_DN>;',
      'sensor-bindings = <&inc_dec_kp C_VOL_UP C_VOL_DN>;',
      'sensor-bindings = <&inc_dec_kp C_VOL_UP C_VOL_DN>;'
    ])
  })
})
