import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  generateKeymap,
  loadBehaviorsData,
  parseKeymap,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import { config, REPO_ROOT } from '../../config.js'

const DATA_DIR = path.join(REPO_ROOT, 'packages/keymap-core/data')

const EMPTY_KEYMAP = {
  keyboard: 'unknown',
  keymap: 'unknown',
  layout: 'unknown',
  layer_names: ['default'],
  layers: [[]] as string[][]
}

export function loadBehaviors() {
  return loadBehaviorsData()
}

export function loadKeycodes() {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'zmk-keycodes.json'), 'utf8'))
}

export function loadLayout(layoutName = 'LAYOUT'): LayoutKey[] {
  const layoutPath = path.join(config.ZMK_CONFIG_PATH, 'config', 'info.json')
  return JSON.parse(fs.readFileSync(layoutPath, 'utf8')).layouts[layoutName].layout
}

export function loadKeymap(): ParsedKeymap {
  const keymapPath = path.join(config.ZMK_CONFIG_PATH, 'config', 'keymap.json')
  const keymapContent = fs.existsSync(keymapPath)
    ? JSON.parse(fs.readFileSync(keymapPath, 'utf8'))
    : EMPTY_KEYMAP
  return parseKeymap(keymapContent)
}

function findKeymapFile(): string {
  const files = fs.readdirSync(path.join(config.ZMK_CONFIG_PATH, 'config'))
  const found = files.find(file => file.endsWith('.keymap'))
  if (!found) throw new Error('No .keymap file in zmk-config/config')
  return found
}

export function exportKeymap(
  generatedKeymap: { json: string; code: string },
  _flash: boolean,
  callback: (err: Error | null, stdout?: string, stderr?: string) => void
) {
  const keymapPath = path.join(config.ZMK_CONFIG_PATH, 'config')
  const keymapFile = findKeymapFile()

  if (!fs.existsSync(keymapPath)) fs.mkdirSync(keymapPath, { recursive: true })
  fs.writeFileSync(path.join(keymapPath, 'keymap.json'), generatedKeymap.json)
  fs.writeFileSync(path.join(keymapPath, keymapFile), generatedKeymap.code)

  return execFile('git', ['status'], { cwd: config.ZMK_CONFIG_PATH }, callback)
}

export { generateKeymap }
