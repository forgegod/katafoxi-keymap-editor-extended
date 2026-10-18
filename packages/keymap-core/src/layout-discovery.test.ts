import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LAYOUT_DISCOVERY_LIMITS, LayoutDiscoveryError, parseLayoutMetadata } from './layout-discovery.js'

const fixture = (name: string) => readFileSync(
  new URL(`../fixtures/layout-discovery/${name}`, import.meta.url), 'utf8'
)

describe('bounded layout metadata', () => {
  it('reports unknown compatible values as unsupported, including prototype property names', () => {
    expect(() => parseLayoutMetadata(fixture('unibody.dtsi').replace('alps,ec11', 'toString'))).toThrow(LayoutDiscoveryError)
  })

  it('refuses document label collisions instead of pretending the catalog closure still applies', () => {
    const selectedSource = '/ { spec_transform: chosen { zmk,matrix-transform = &spec_transform; }; };'
    expect(() => parseLayoutMetadata(fixture('unibody.dtsi'), { selectedSource })).toThrow(LayoutDiscoveryError)
  })

  it('only offers physical candidates when physical layouts are present and unchosen', () => {
    const source = fixture('physical.dtsi').replace('    chosen { zmk,physical-layout = &spec_physical; };', '')
    expect(() => parseLayoutMetadata(source, { candidate: { kind: 'transform', label: 'spec_transform' } })).toThrow(LayoutDiscoveryError)
  })

  it('checks exact and excessive source, key, candidate and sensor bounds', () => {
    const source = fixture('unibody.dtsi')
    const exact = source + ' '.repeat(LAYOUT_DISCOVERY_LIMITS.sourceBytes - new TextEncoder().encode(source).length)
    expect(parseLayoutMetadata(exact).positions).toHaveLength(4)
    expect(() => parseLayoutMetadata(exact + ' ')).toThrow(/limit/)
    expect(() => parseLayoutMetadata(exact + 'é')).toThrow(/limit/)
    const map = (count: number) => `/ { transform: transform { compatible = "zmk,matrix-transform"; rows = <3>; columns = <255>; map = <${Array.from({ length: count }, (_, i) => `RC(${Math.floor(i / 255)},${i % 255})`).join(' ')}>; }; };`
    expect(parseLayoutMetadata(map(512)).layout).toHaveLength(512)
    expect(() => parseLayoutMetadata(map(513))).toThrow(/limit/)
    const candidates = (count: number) => source.replace('/ {', `/ { ${Array.from({ length: count - 1 }, (_, i) => `t${i}: t${i} { compatible = "zmk,matrix-transform"; rows = <1>; columns = <1>; map = <RC(0,0)>; };`).join(' ')}`)
    expect(parseLayoutMetadata(candidates(64)).transform).toBe('spec_transform')
    expect(() => parseLayoutMetadata(candidates(65))).toThrow(/limit/)
    const sensors = (count: number) => source.replace('/ {', `/ { ${Array.from({ length: count }, (_, i) => `s${i}: s${i} { compatible = "alps,ec11"; };`).join(' ')}`)
      .replace('&spec_encoder_b &spec_encoder_a', Array.from({ length: count }, (_, i) => `&s${i}`).join(' '))
    expect(parseLayoutMetadata(sensors(16)).sensorLabels).toHaveLength(16)
    expect(() => parseLayoutMetadata(sensors(17))).toThrow(/limit/)
  })

  it.each([
    ['rows = <2>;', 'rows = <0>;'], ['columns = <2>;', 'columns = <256>;'],
    ['RC(0,1)', '0x0001'], ['RC(0,1)', 'RC(0,SYMBOL)'],
    ['/ {', '#if CONFIG_TEST\n/ {'], ['/ {', '/delete-node/ &spec_transform; / {'],
    ['map = <', 'map = <RC(0,0) '],
    ['rows = <2>;', 'rows = <2>; rows = <2>;'],
    ['chosen {', 'chosen { zmk,matrix_transform = &missing;'],
    ['spec_transform: transform {', 'spec_transform: transform { status = "disabled";'],
    ['spec_encoder_a: encoder_a', 'spec_transform: encoder_a']
  ])('fails closed for unsupported or invalid transform constructs: %s', (old, replacement) => {
    expect(() => parseLayoutMetadata(fixture('unibody.dtsi').replace(old, replacement))).toThrow(LayoutDiscoveryError)
  })

  it.each([
    ['#key-cells = <7>;', '#key-cells = <6>;'],
    ['&key_physical_attrs 125 100', '&missing 125 100'],
    ['&key_physical_attrs 125 100', '&key_physical_attrs 0 100'],
    ['&key_physical_attrs 125 100', '&key_physical_attrs 125 0'],
    ['&key_physical_attrs 125 100', '&key_physical_attrs 32768 100'],
    ['125 150 (-1500)', '125 150 (-32769)'],
    ['125 150 (-1500)', '125 150 (-1500 + 1)'],
    ['125 150 (-1500)', '125 150 -1500'],
    ['125 100 125 0 0 0 0>', '125 100 125 0 0 0 0 0>'],
    ['transform = <&spec_transform>;', 'transform = <&missing>;'],
    ['display-name = "Synthetic geometry";', 'position-map = <0 1 2 3>;']
  ])('fails closed for invalid physical cells/providers: %s', (old, replacement) => {
    expect(() => parseLayoutMetadata(fixture('physical.dtsi').replace(old, replacement))).toThrow(LayoutDiscoveryError)
  })

  it('honors chosen matrix precedence without attaching ignored physical keys', () => {
    const source = fixture('physical.dtsi').replace('chosen {', 'chosen { zmk,matrix-transform = &spec_transform;')
    const result = parseLayoutMetadata(source)
    expect(result.geometry).toBe('electrical-inference')
    expect(result.physicalLayout).toBeUndefined()
    expect(result.layout[1]).not.toHaveProperty('w')
  })

  it('permits absent physical keys but not malformed present keys', () => {
    const source = fixture('physical.dtsi').replace(/        keys =[\s\S]*?;/, '')
    expect(parseLayoutMetadata(source).geometry).toBe('electrical-inference')
    expect(() => parseLayoutMetadata(source.replace('display-name = "Synthetic geometry";', 'keys;'))).toThrow()
  })

  it('keeps electrical map order separate from serialization slots', () => {
    const result = parseLayoutMetadata(fixture('unibody.dtsi'))
    expect(result.positions).toEqual([[1, 1], [0, 0], [1, 0], [0, 1]])
    expect(result.layout).toEqual([
      { row: 0, col: 0, x: 1, y: 1 },
      { row: 0, col: 1, x: 0, y: 0 },
      { row: 0, col: 2, x: 0, y: 1 },
      { row: 0, col: 3, x: 1, y: 0 }
    ])
    expect(result.transform).toBe('spec_transform')
    expect(result.compatible).toBe('zmk,matrix-transform')
    expect(result.geometry).toBe('electrical-inference')
  })

  it('converts selected physical cells in logical order with equal width fields', () => {
    const result = parseLayoutMetadata(fixture('physical.dtsi'))
    expect(result.geometry).toBe('source-declared')
    expect(result.physicalLayout).toBe('spec_physical')
    expect(result.layout[1]).toEqual({ row: 0, col: 1, x: 1.25, y: 0, w: 1.25, u: 1.25, h: 1, r: 0, rx: 0, ry: 0 })
    expect(result.layout[3]).toMatchObject({ r: -15, rx: 1.25, ry: 1.5 })
  })

  it('associates only declared, resolved sensors in list order', () => {
    expect(parseLayoutMetadata(fixture('unibody.dtsi')).sensorLabels).toEqual(['spec_encoder_b', 'spec_encoder_a'])
    const missing = fixture('unibody.dtsi').replace(/    sensors \{[\s\S]*?    \};\n/, '')
    expect(parseLayoutMetadata(missing).sensorLabels).toBeUndefined()
    expect(parseLayoutMetadata(missing).layout).toEqual(parseLayoutMetadata(fixture('unibody.dtsi')).layout)
  })

  it.each([
    ['sensors = <&spec_encoder_b &spec_encoder_a>;', ''],
    ['&spec_encoder_b &spec_encoder_a', '&spec_encoder_b &spec_encoder_b'],
    ['&spec_encoder_b &spec_encoder_a', '&missing &spec_encoder_a'],
    ['spec_encoder_a: encoder_a {', 'spec_encoder_a: encoder_a { status = "disabled";'],
    ['compatible = "alps,ec11";', 'compatible = "unknown,sensor";'],
    ['columns = <2>;', 'columns = <2>; mystery = <1>;'],
    ['chosen {', 'aliases { alias = &spec_transform; }; chosen {']
  ])('rejects unproved or malformed metadata: %s', (old, replacement) => {
    expect(() => parseLayoutMetadata(fixture('unibody.dtsi').replace(old, replacement))).toThrow()
  })

  it.each([
    ['row-offset', 1, 0], ['col-offset', 1, 0],
    ['row-offset', 0, 0], ['col-offset', 0, 0],
    ['row-offset', 0, 1], ['col-offset', 0, 1]
  ])('requires part closure for declared or assigned %s (%i to %i)', (property, declared, effective) => {
    const metadata = fixture('unibody.dtsi').replace('rows = <2>;', `rows = <2>; ${property} = <${declared}>;`)
    const selectedSource = `&spec_transform { ${property} = <${effective}>; };`
    expect(() => parseLayoutMetadata(metadata, { selectedSource })).toThrow(/part event closure/)
  })

  it('preserves zero-offset non-split discovery without selected offset assignments', () => {
    const source = fixture('unibody.dtsi')
    const expected = parseLayoutMetadata(source)
    expect(expected.offset).toEqual([0, 0])
    expect(parseLayoutMetadata(source.replace('rows = <2>;', 'rows = <2>; row-offset = <0>; col-offset = <0>;'), {
      selectedSource: '/ { chosen { zmk,matrix-transform = &spec_transform; }; };'
    })).toEqual(expected)
  })

  it('requires a complete split event closure and applies offsets to events only', () => {
    const item = JSON.parse(fixture('cases.json')).cases.find((entry: { id: string }) => entry.id === 'split')
    const options = { parts: item.parts, selectedPart: 'right' }
    const result = parseLayoutMetadata(fixture('split.dtsi'), options)
    expect(result.positions).toEqual(item.orderedPositions)
    expect(result.layout).toEqual(item.normalizedLayout)
    expect(() => parseLayoutMetadata(fixture('split.dtsi'))).toThrow(/part/i)
    expect(() => parseLayoutMetadata(fixture('split.dtsi'), { ...options, parts: item.parts.slice(1) })).toThrow(/cover/i)
    const overlap = structuredClone(options)
    overlap.parts[0].events[1] = overlap.parts[0].events[0]
    expect(() => parseLayoutMetadata(fixture('split.dtsi'), overlap)).toThrow()
    const left = parseLayoutMetadata(fixture('split.dtsi'), {
      parts: item.parts, selectedPart: 'left',
      selectedSource: '&spec_transform { row-offset = <0>; col-offset = <0>; };'
    })
    expect(left.positions).toEqual(result.positions)
    expect(left.offset).toEqual([0, 0])
    expect(() => parseLayoutMetadata(fixture('split.dtsi'), {
      parts: item.parts.slice(0, 1), selectedPart: 'left',
      selectedSource: '&spec_transform { row-offset = <0>; col-offset = <0>; };'
    })).toThrow(/cover/i)
    expect(() => parseLayoutMetadata(fixture('split.dtsi'), {
      parts: item.parts, selectedPart: 'left',
      selectedSource: '&spec_transform { row-offset = <0>; col-offset = <0>; }; &spec_transform { col-offset = <0>; };'
    })).toThrow(/Repeated offset/)
  })

  it('inspects selected document includes and literal offset overrides without following includes', () => {
    const source = fixture('bindings.keymap')
    const stockIncludes = ['#include <behaviors.dtsi>', '#include <dt-bindings/zmk/keys.h>']
    const options = { selectedSource: source, stockIncludes }
    expect(parseLayoutMetadata(fixture('unibody.dtsi'), options).transform).toBe('spec_transform')
    expect(() => parseLayoutMetadata(fixture('unibody.dtsi'), { selectedSource: source })).toThrow(/include/i)
    expect(() => parseLayoutMetadata(fixture('unibody.dtsi'), { ...options, selectedSource: source + '\n#include "unresolved-layout.dtsi"' })).toThrow(/include/i)
    expect(() => parseLayoutMetadata(fixture('unibody.dtsi'), { ...options, selectedSource: source + '\n&spec_transform { map = <RC(0,0)>; };' })).toThrow()
  })

  it('disambiguates only unchosen candidates and never contradicts firmware chosen', () => {
    const source = fixture('unibody.dtsi').replace('    chosen { zmk,matrix-transform = &spec_transform; };', '')
      .replace('/ {', '/ { other: other { compatible = "zmk,matrix-transform"; rows = <2>; columns = <2>; map = <RC(0,0) RC(0,1) RC(1,0) RC(1,1)>; };')
    expect(() => parseLayoutMetadata(source)).toThrow(/select/i)
    expect(parseLayoutMetadata(source, { candidate: { kind: 'transform', label: 'other' } }).transform).toBe('other')
    expect(() => parseLayoutMetadata(source.replace('/ {', '/ { chosen { zmk,matrix-transform = &spec_transform; };'), { candidate: { kind: 'transform', label: 'other' } })).toThrow(/conflict/i)
    expect(parseLayoutMetadata(source, { selectedSource: '/ { chosen { zmk,matrix_transform = <&other>; }; };' }).transform).toBe('other')
    expect(() => parseLayoutMetadata(source, { selectedSource: '/ { chosen { zmk,matrix-transform = &missing; }; };' })).toThrow(/existing/)
  })
})
