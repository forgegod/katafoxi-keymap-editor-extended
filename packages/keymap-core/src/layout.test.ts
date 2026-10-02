import { describe, expect, it } from 'vitest'
import {
  absentLayoutIndexes,
  bindingColumnWidths,
  buildKeymapCode,
  parseKeymap,
  promoteAbsentLayoutKey,
  renderTable,
  validateInfoJson
} from './index.js'
import type { LayoutKey } from './types.js'

/** Thumb-cluster style: physical row 1 unused in matrix numbering. */
const GAPPED_LAYOUT: LayoutKey[] = [
  { x: 0, y: 0, row: 0, col: 0 },
  { x: 1, y: 0, row: 0, col: 1 },
  { x: 0, y: 2, row: 2, col: 0 },
  { x: 1, y: 2, row: 2, col: 1 }
]

describe('renderTable', () => {
  it('keeps all bindings when layout row indices are non-contiguous', () => {
    const layer = ['&kp A', '&kp B', '&kp C', '&kp D']
    const rendered = renderTable(GAPPED_LAYOUT, layer, { columnSeparator: ' ' })

    expect(rendered).toContain('&kp A')
    expect(rendered).toContain('&kp B')
    expect(rendered).toContain('&kp C')
    expect(rendered).toContain('&kp D')
    expect(rendered.trim()).not.toBe('')
  })

  it('renders contiguous rows as before', () => {
    const layout: LayoutKey[] = [
      { x: 0, y: 0, row: 0, col: 0 },
      { x: 1, y: 0, row: 0, col: 1 },
      { x: 0, y: 1, row: 1, col: 0 },
      { x: 1, y: 1, row: 1, col: 1 }
    ]
    const rendered = renderTable(layout, ['&kp A', '&kp B', '&kp C', '&kp D'], {
      columnSeparator: ' '
    })
    const lines = rendered.split('\n').map(l => l.trim()).filter(Boolean)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/&kp A\s+&kp B/)
    expect(lines[1]).toMatch(/&kp C\s+&kp D/)
  })

  it('still emits bindings for absent matrix slots', () => {
    const layout: LayoutKey[] = [
      { x: 0, y: 0, row: 0, col: 0, absent: true },
      { x: 1, y: 0, row: 0, col: 1 }
    ]
    const rendered = renderTable(layout, ['&none', '&kp A'], { columnSeparator: ' ' })
    expect(rendered).toContain('&none')
    expect(rendered).toContain('&kp A')
  })

  it('aligns the same matrix column across layers when widths are shared', () => {
    const layout: LayoutKey[] = [
      { x: 0, y: 0, row: 0, col: 0 },
      { x: 1, y: 0, row: 0, col: 1 },
      { x: 2, y: 0, row: 0, col: 2 }
    ]
    const layers = [
      ['&kp A', '&kp B', '&kp C'],
      ['&trans', '&mt LCTRL J', '&kp D']
    ]
    const columnWidths = bindingColumnWidths(layout, layers, { columnSeparator: ' ' })
    const [shortLayer, longLayer] = layers.map(layer =>
      renderTable(layout, layer, { columnSeparator: ' ', columnWidths })
    )
    // padEnd: left edges of the same matrix column line up across layers.
    expect(shortLayer.indexOf('&kp B')).toBe(longLayer.indexOf('&mt LCTRL J'))
    expect(shortLayer.indexOf('&kp C')).toBe(longLayer.indexOf('&kp D'))
  })
})

describe('absentLayoutIndexes', () => {
  it('lists only slots marked absent', () => {
    const layout: LayoutKey[] = [
      { x: 0, y: 0, row: 0, col: 0, absent: true },
      { x: 1, y: 0, row: 0, col: 1 },
      { x: 2, y: 0, row: 0, col: 2, absent: true }
    ]
    expect(absentLayoutIndexes(layout)).toEqual([0, 2])
  })
})

describe('promoteAbsentLayoutKey', () => {
  it('clears absent on the edited slot and leaves others alone', () => {
    const layout: LayoutKey[] = [
      { x: 0, y: 0, row: 0, col: 0, absent: true, label: '0,0' },
      { x: 1, y: 0, row: 0, col: 1, absent: true, label: '0,1' }
    ]
    const next = promoteAbsentLayoutKey(layout, 0)
    expect(next[0]).toEqual({ x: 0, y: 0, row: 0, col: 0, label: '0,0' })
    expect(next[1]?.absent).toBe(true)
  })

  it('returns the same array when the slot is already present', () => {
    const layout: LayoutKey[] = [{ x: 0, y: 0, row: 0, col: 0 }]
    expect(promoteAbsentLayoutKey(layout, 0)).toBe(layout)
  })
})

describe('validateInfoJson absent', () => {
  it('accepts boolean absent on a key', () => {
    expect(() =>
      validateInfoJson({
        layouts: {
          LAYOUT: {
            layout: [{ x: 0, y: 0, row: 0, col: 0, absent: true }]
          }
        }
      })
    ).not.toThrow()
  })

  it('rejects a non-boolean absent flag', () => {
    expect(() =>
      validateInfoJson({
        layouts: {
          LAYOUT: {
            layout: [{ x: 0, y: 0, row: 0, col: 0, absent: 'yes' }]
          }
        }
      })
    ).toThrow(/absent/)
  })
})

describe('buildKeymapCode with gapped rows', () => {
  it('splices a full bindings block instead of an empty one', () => {
    const original = `/ {
    keymap {
        compatible = "zmk,keymap";
        default_layer {
            bindings = <
&kp A &kp B
&kp C &kp D
            >;
        };
    };
};
`
    const result = buildKeymapCode(
      GAPPED_LAYOUT,
      parseKeymap({
        layers: [['&kp Z', '&kp B', '&kp C', '&kp D']],
        layer_names: ['default']
      }),
      { originalSource: original }
    )

    expect(result.mode).toBe('splice')
    expect(result.code).toContain('&kp Z')
    expect(result.code).toContain('&kp B')
    expect(result.code).toContain('&kp C')
    expect(result.code).toContain('&kp D')
    expect(result.json).toContain('&kp Z')
  })
})
