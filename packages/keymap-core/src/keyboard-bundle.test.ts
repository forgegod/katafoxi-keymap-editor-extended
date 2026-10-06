import { describe, expect, it } from 'vitest'
import { loadKeyboardBundle, pickInfoLayout } from './keyboard-bundle.js'
import { KeymapValidationError } from './errors.js'
import { parseKeymap } from './keymap.js'

const info = {
  id: 'toy',
  layouts: {
    LAYOUT: {
      layout: [
        { x: 0, y: 0, row: 0, col: 0 },
        { x: 1, y: 0, row: 0, col: 1 }
      ]
    }
  }
}

const keymap = parseKeymap({
  layers: [['&kp A', '&kp B']]
})

describe('pickInfoLayout', () => {
  it('reads id and the first layout', () => {
    const picked = pickInfoLayout(info)
    expect(picked.keyboard).toBe('toy')
    expect(picked.layoutName).toBe('LAYOUT')
    expect(picked.layout).toHaveLength(2)
  })

  it('prefers layouts.default when present', () => {
    const picked = pickInfoLayout({
      layouts: {
        OTHER: { layout: [{ x: 0, y: 0, row: 0, col: 0 }] },
        default: {
          layout: [
            { x: 0, y: 0, row: 0, col: 0 },
            { x: 1, y: 0, row: 0, col: 1 }
          ]
        }
      }
    })
    expect(picked.layoutName).toBe('default')
    expect(picked.layout).toHaveLength(2)
  })

  it('honors an explicit layoutName', () => {
    const picked = pickInfoLayout(
      {
        layouts: {
          LAYOUT: { layout: [{ x: 0, y: 0, row: 0, col: 0 }] },
          THUMBS: {
            layout: [
              { x: 0, y: 0, row: 0, col: 0 },
              { x: 1, y: 0, row: 0, col: 1 }
            ]
          }
        }
      },
      { layoutName: 'THUMBS' }
    )
    expect(picked.layoutName).toBe('THUMBS')
    expect(picked.layout).toHaveLength(2)
  })

  it('returns a copied layout array', () => {
    const picked = pickInfoLayout(info)
    picked.layout.pop()
    expect(info.layouts.LAYOUT.layout).toHaveLength(2)
  })

  it('throws KeymapValidationError for an unknown layout name', () => {
    expect(() => pickInfoLayout(info, { layoutName: 'NOPE' })).toThrow(
      KeymapValidationError
    )
  })
})

describe('loadKeyboardBundle', () => {
  it('picks layout from info.json without inferring', () => {
    const bundle = loadKeyboardBundle({ infoJson: info, keymap })
    expect(bundle.inferredLayout).toBe(false)
    expect(bundle.warnings).toEqual([])
    expect(bundle.layout).toHaveLength(2)
    expect(bundle.keyboard).toBe('toy')
    expect(bundle.layoutName).toBe('LAYOUT')
  })

  it('infers a rectangle and attaches the warning code', () => {
    const bundle = loadKeyboardBundle({
      infoJson: null,
      keymap,
      inferredLayoutWarning: 'clipboard_inferred_layout',
      fallbackKeyboard: 'clipboard'
    })
    expect(bundle.inferredLayout).toBe(true)
    expect(bundle.warnings).toEqual(['clipboard_inferred_layout'])
    expect(bundle.layout).toHaveLength(2)
    expect(bundle.keyboard).toBe('clipboard')
    expect(bundle.layout[0]).toMatchObject({ row: 0, col: 0, x: 0, y: 0 })
  })

  it('treats empty layouts like a missing info.json', () => {
    const bundle = loadKeyboardBundle({
      infoJson: { layouts: {} },
      keymap,
      inferredLayoutWarning: 'github_inferred_layout',
      fallbackKeyboard: 'github'
    })
    expect(bundle.inferredLayout).toBe(true)
    expect(bundle.warnings).toEqual(['github_inferred_layout'])
  })

  it('throws when there is nothing to infer from', () => {
    expect(() =>
      loadKeyboardBundle({
        infoJson: null,
        keymap: parseKeymap({ layers: [[]] }),
        missingLayoutMessage: 'Missing file config/info.json and keymap has no bindings to infer a layout from'
      })
    ).toThrow(KeymapValidationError)
  })
})
