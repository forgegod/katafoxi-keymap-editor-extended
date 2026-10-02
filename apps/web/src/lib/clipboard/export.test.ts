import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadClipboardBundle } from './load'
import { buildClipboardExport } from './export'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, '../../../../../packages/keymap-core/fixtures/lark')
const infoText = readFileSync(join(fixtures, 'info.json'), 'utf8')
const keymapText = readFileSync(join(fixtures, 'lark.keymap'), 'utf8')

describe('buildClipboardExport', () => {
  it('splices into the pasted .keymap', () => {
    const bundle = loadClipboardBundle(infoText, keymapText)
    const exported = buildClipboardExport(
      bundle.layout,
      bundle.keymap,
      bundle.originalSource
    )
    expect(exported.mode).toBe('splice')
    expect(exported.code).toContain('compatible = "zmk,keymap"')
    expect(exported.warnings).not.toContain('generated_default_template')
  })

  it('falls back to the default template without originalSource', () => {
    const json = JSON.stringify({
      layer_names: bundleLayerNames(),
      layers: [Array(bundleKeyCount()).fill('&trans')]
    })
    const bundle = loadClipboardBundle(infoText, json)
    const exported = buildClipboardExport(bundle.layout, bundle.keymap, null)
    expect(exported.mode).toBe('default_template')
    expect(exported.warnings).toContain('generated_default_template')
  })
})

function bundleKeyCount(): number {
  return loadClipboardBundle(infoText, keymapText).layout.length
}

function bundleLayerNames(): string[] {
  return ['default']
}
