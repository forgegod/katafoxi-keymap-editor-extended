import { describe, expect, it } from 'vitest'
import { formatKeymapSaveWarnings } from './keymap-save-warnings'

describe('formatKeymapSaveWarnings', () => {
  it('maps known warning codes to user-facing copy', () => {
    expect(
      formatKeymapSaveWarnings([
        'clipboard_inferred_layout',
        'clipboard_json_no_export_source'
      ])
    ).toEqual([
      'No info.json — using a flat rectangular board from the binding count. Paste info.json for the real layout.',
      'Loaded from keymap.json only — Copy .keymap will use the default ZMK template unless you also paste a .keymap under “Export source”.'
    ])
  })

  it('passes through unknown codes', () => {
    expect(formatKeymapSaveWarnings(['custom_code'])).toEqual(['custom_code'])
  })
})
