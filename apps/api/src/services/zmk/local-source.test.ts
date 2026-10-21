/**
 * Local adapter save/load against a temp copy of the vendored LARK fixture.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encodeKeyBinding, ensureHoldTapPreset, InfoValidationError } from '@keymap-editor/keymap-core'
import { config } from '../../config.js'
import * as zmk from './local-source.js'

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../packages/keymap-core/fixtures/lark'
)

let tmpRoot: string
let previousZmkPath: string

function bindStrings(km: ReturnType<typeof zmk.loadKeymap>): string[] {
  return km.layers.flat().map(encodeKeyBinding)
}

beforeEach(() => {
  previousZmkPath = config.ZMK_CONFIG_PATH
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'keymap-lark-'))
  const configDir = path.join(tmpRoot, 'config')
  fs.mkdirSync(configDir, { recursive: true })
  fs.copyFileSync(
    path.join(FIXTURE_DIR, 'lark.keymap'),
    path.join(configDir, 'lark.keymap')
  )
  fs.copyFileSync(
    path.join(FIXTURE_DIR, 'info.json'),
    path.join(configDir, 'info.json')
  )
  config.ZMK_CONFIG_PATH = tmpRoot
})

afterEach(() => {
  config.ZMK_CONFIG_PATH = previousZmkPath
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('CHG-011 Local layout boundary', () => {
  it.each(['{"settings":true}', '{"layers":[["&kp Z"]]}', 'null', '[]', 'false', '"settings"'])
  ('ignores named non-layout %s but still requires layout metadata', content => {
    fs.rmSync(path.join(tmpRoot, 'config/info.json'))
    fs.writeFileSync(path.join(tmpRoot, 'config/lark.json'), content)
    expect(() => zmk.loadLayout()).toThrow(expect.objectContaining({ code: 'ENOENT', message: 'Layout info.json not found' }))
    expect(zmk.loadKeymap().layers).toHaveLength(7)
  })

  describe.each(['config/info.json', 'config/lark.json'])('%s diagnostics', filePath => {
    it.each(['{}', '{"layouts":null}', '{"layouts":[]}', '{"layouts":{}}',
      '{"layouts":{"default":{"layout":[{"x":"bad","y":0}]}}}', '{not-json'])
    ('retains the repository-relative path for %s', content => {
      if (filePath !== 'config/info.json') fs.rmSync(path.join(tmpRoot, 'config/info.json'))
      fs.writeFileSync(path.join(tmpRoot, filePath), content)
      // Absent layouts is ignorable only in the named case.
      if (content === '{}' && filePath !== 'config/info.json') {
        expect(() => zmk.loadLayout()).toThrow(expect.objectContaining({ code: 'ENOENT' }))
      } else {
        expect(() => zmk.loadLayout()).toThrow(InfoValidationError)
        expect(() => zmk.loadLayout()).toThrow(expect.objectContaining({ path: filePath }))
      }
      try { zmk.loadLayout() } catch (error) { expect(String(error)).not.toContain(tmpRoot) }
    })
  })

  it('prefers shared info without reading invalid named metadata', () => {
    const layout = zmk.loadLayout()
    fs.writeFileSync(path.join(tmpRoot, 'config/lark.json'), '{not-json')
    expect(zmk.loadLayout()).toEqual(layout)
  })

  it('does not use reserved firmware JSON as named geometry', () => {
    fs.rmSync(path.join(tmpRoot, 'config/info.json'))
    fs.renameSync(path.join(tmpRoot, 'config/lark.keymap'), path.join(tmpRoot, 'config/keymap.keymap'))
    fs.writeFileSync(path.join(tmpRoot, 'config/keymap.json'), JSON.stringify({ layouts: { default: { layout: [{ x: 0, y: 0 }] } } }))
    expect(() => zmk.loadLayout()).toThrow(expect.objectContaining({ code: 'ENOENT' }))
  })
})

describe.each(['&hm', '&as'])('CHG-011 Local %s dependency selection', code => {
  it.each(['layers', 'combos', 'sensorBindings'])('falls back for undeclared %s but accepts matching holdTaps', site => {
    const json = {
      layers: [[site === 'layers' ? `${code} 0 A` : '&kp Z']],
      combos: site === 'combos' ? [{ id: 'probe', keyPositions: [0], binding: `${code} 0 A` }] : [],
      sensorBindings: site === 'sensorBindings' ? [[`${code} 0 A`]] : [],
      holdTaps: [] as ReturnType<typeof ensureHoldTapPreset>
    }
    const filePath = path.join(tmpRoot, 'config/keymap.json')
    fs.writeFileSync(filePath, JSON.stringify(json))
    expect(zmk.loadKeymap().layers).toHaveLength(7)
    json.holdTaps = ensureHoldTapPreset(undefined, code)
    fs.writeFileSync(filePath, JSON.stringify(json))
    const loaded = zmk.loadKeymap()
    expect(loaded.layers.map(layer => layer.map(encodeKeyBinding))).toEqual(json.layers)
    expect(loaded.holdTaps).toEqual(json.holdTaps)
  })
})

describe('local-source LARK fixture', () => {
  it('loads from .keymap with expanded macros when keymap.json is absent', () => {
    const loaded = zmk.loadKeymap()
    const binds = bindStrings(loaded)
    expect(binds.some(b => b.includes('C_VOL_UP'))).toBe(true)
    expect(binds.some(b => /\bVU\b/.test(b))).toBe(false)
    expect(loaded.layers.length).toBe(7)
    expect(loaded.layers[0].length).toBe(zmk.loadLayout().length)
    expect(loaded.holdTaps).toEqual([
      { code: '&mt', override: true, flavor: 'tap-preferred', tappingTermMs: 300 },
      { code: '&lt', override: true, flavor: 'balanced', tappingTermMs: 150 }
    ])
  })

  it('writes files and reloads expanded bindings after save', () => {
    const loaded = zmk.loadKeymap()
    const layout = zmk.loadLayout()

    const draft = {
      ...loaded,
      layers: loaded.layers.map((layer, li) =>
        li === 0
          ? layer.map((bind, ki) =>
              ki === 1
                ? { value: '&kp', params: [{ value: 'M', params: [] }] }
                : bind
            )
          : layer
      )
    }

    const result = zmk.saveLocalKeymap(draft)
    expect(result.mode).toBe('splice')
    expect(result.warnings).toContain('macros_expanded')

    const keymapJsonPath = path.join(tmpRoot, 'config', 'keymap.json')
    const keymapPath = path.join(tmpRoot, 'config', 'lark.keymap')
    expect(fs.existsSync(keymapJsonPath)).toBe(true)
    expect(fs.existsSync(keymapPath)).toBe(true)

    const writtenCode = fs.readFileSync(keymapPath, 'utf8')
    expect(writtenCode).toContain('#define VU')
    expect(writtenCode).toContain('C_VOL_UP')
    expect(writtenCode).not.toMatch(/bindings = <[^>]*\bVU\b/)

    const writtenJson = fs.readFileSync(keymapJsonPath, 'utf8')
    expect(writtenJson).toContain('C_VOL_UP')
    expect(writtenJson).toContain('&kp M')

    const reloaded = zmk.loadKeymap()
    expect(reloaded.layers[0].length).toBe(layout.length)
    const binds = bindStrings(reloaded)
    expect(binds.some(b => b.includes('C_VOL_UP'))).toBe(true)
    expect(binds.some(b => b === '&kp M' || b.startsWith('&kp M'))).toBe(true)
  })

  it('loads a matching keymap JSON layout when info.json is absent', () => {
    const configDir = path.join(tmpRoot, 'config')
    const infoPath = path.join(configDir, 'info.json')
    const expectedLayout = zmk.loadLayout()
    const info = JSON.parse(fs.readFileSync(infoPath, 'utf8')) as {
      layouts: Record<string, unknown>
    }
    fs.rmSync(infoPath)
    fs.writeFileSync(
      path.join(configDir, 'lark.json'),
      JSON.stringify({ ...info, layouts: { default_layout: info.layouts.LAYOUT } })
    )

    expect(zmk.loadLayout()).toEqual(expectedLayout)
  })

  it('loadLayout throws a path-free ENOENT when info.json is missing', () => {
    fs.rmSync(path.join(tmpRoot, 'config', 'info.json'))
    expect(() => zmk.loadLayout()).toThrow(/Layout info\.json not found/)
    try {
      zmk.loadLayout()
    } catch (err) {
      expect((err as NodeJS.ErrnoException).code).toBe('ENOENT')
      expect(String(err)).not.toContain(tmpRoot)
    }
  })
})
