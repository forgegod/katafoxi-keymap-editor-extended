import { describe, expect, it } from 'vitest'
import {
  formatKeymapSaveWarningNotices,
  formatKeymapSaveWarnings,
  INFO_JSON_LAYOUT_TOOL_LINK
} from './keymap-save-warnings'

describe('formatKeymapSaveWarnings', () => {
  it('maps known warning codes to user-facing copy', () => {
    expect(
      formatKeymapSaveWarnings([
        'clipboard_inferred_layout',
        'clipboard_json_no_export_source',
        'github_inferred_layout',
        'host_snapshot_unsupported_version',
        'host_snapshot_invalid'
      ])
    ).toEqual([
      'No info.json — using a flat rectangular board from the binding count. Paste info.json for the real layout.',
      'Loaded from keymap.json only — Copy .keymap will use the default ZMK template unless you also paste a .keymap under “Export source”.',
      'No config/info.json — using a flat rectangular board from the binding count. Commit still updates the keymap only; add info.json for the real geometry.',
      'This repository has a newer host_keymap/snapshot.json than this editor can read. Commit will update the keymap only and leave that snapshot unchanged.',
      'The repository host_keymap/snapshot.json is invalid. Host legends on this device come from the browser until you Commit a new snapshot.'
    ])
  })

  it('attaches example-layout links for inferred boards', () => {
    expect(
      formatKeymapSaveWarningNotices([
        'github_inferred_layout',
        'clipboard_json_no_export_source'
      ])
    ).toEqual([
      {
        message:
          'No config/info.json — using a flat rectangular board from the binding count. Commit still updates the keymap only; add info.json for the real geometry.',
        link: INFO_JSON_LAYOUT_TOOL_LINK
      },
      {
        message:
          'Loaded from keymap.json only — Copy .keymap will use the default ZMK template unless you also paste a .keymap under “Export source”.',
        link: undefined
      }
    ])
  })

  it('passes through unknown codes', () => {
    expect(formatKeymapSaveWarnings(['custom_code'])).toEqual(['custom_code'])
  })

  it('does not treat prototype keys as known warning codes', () => {
    expect(formatKeymapSaveWarnings(['constructor'])).toEqual(['constructor'])
    expect(formatKeymapSaveWarningNotices(['__proto__'])).toEqual([
      { message: '__proto__', link: undefined }
    ])
  })
})
