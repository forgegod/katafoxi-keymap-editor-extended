import fs from 'node:fs'
import path from 'node:path'
import {
  buildKeymapCode,
  generateKeymap,
  isPrimaryKeymapJson,
  isUserKeymapFilename,
  parseDtsKeymap,
  parseKeymap,
  type BuildKeymapCodeResult,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import { config } from '../../config.js'

const EMPTY_KEYMAP = {
  keyboard: 'unknown',
  keymap: 'unknown',
  layout: 'unknown',
  layer_names: ['default'],
  layers: [[]] as string[][]
}

export function loadLayout(layoutName = 'LAYOUT'): LayoutKey[] {
  const layoutPath = path.join(config.ZMK_CONFIG_PATH, 'config', 'info.json')
  return JSON.parse(fs.readFileSync(layoutPath, 'utf8')).layouts[layoutName].layout
}

function findKeymapFile(): string | null {
  const dir = path.join(config.ZMK_CONFIG_PATH, 'config')
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir)
  return files.find(file => isUserKeymapFilename(file)) ?? null
}

function findKeymapTemplateFile(): string | null {
  const dir = path.join(config.ZMK_CONFIG_PATH, 'config')
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir)
  return (
    files.find(file => file.toLowerCase().endsWith('.keymap.template')) ?? null
  )
}

function loadKeymapFromDts(): ParsedKeymap | null {
  const keymapFile = findKeymapFile()
  if (!keymapFile) return null
  const source = fs.readFileSync(
    path.join(config.ZMK_CONFIG_PATH, 'config', keymapFile),
    'utf8'
  )
  let keyboard = 'unknown'
  try {
    const info = JSON.parse(
      fs.readFileSync(path.join(config.ZMK_CONFIG_PATH, 'config', 'info.json'), 'utf8')
    )
    keyboard = info.id || info.name || keyboard
  } catch {
    /* ignore */
  }
  const raw = parseDtsKeymap(source, {
    keyboard,
    keymap: keymapFile.replace(/\.keymap$/i, ''),
    layout: 'LAYOUT'
  })
  return parseKeymap(raw)
}

export function loadKeymap(): ParsedKeymap {
  const keymapPath = path.join(config.ZMK_CONFIG_PATH, 'config', 'keymap.json')
  if (fs.existsSync(keymapPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(keymapPath, 'utf8'))
      if (isPrimaryKeymapJson(parsed)) {
        return parseKeymap(parsed)
      }
    } catch {
      /* fall through to .keymap */
    }
  }
  const fromDts = loadKeymapFromDts()
  if (fromDts) return fromDts
  return parseKeymap(EMPTY_KEYMAP)
}

export function saveLocalKeymap(
  keymap: ParsedKeymap
): Pick<BuildKeymapCodeResult, 'mode' | 'warnings'> {
  const keymapDir = path.join(config.ZMK_CONFIG_PATH, 'config')
  const keymapFile = findKeymapFile()
  if (!keymapFile) {
    throw new Error('No .keymap file in zmk-config/config')
  }

  const layout = loadLayout()
  const keymapPath = path.join(keymapDir, keymapFile)
  const originalSource = fs.existsSync(keymapPath)
    ? fs.readFileSync(keymapPath, 'utf8')
    : undefined

  const templateFile = findKeymapTemplateFile()
  const template =
    templateFile != null
      ? fs.readFileSync(path.join(keymapDir, templateFile), 'utf8')
      : undefined

  const built = buildKeymapCode(layout, keymap, { template, originalSource })

  if (!fs.existsSync(keymapDir)) fs.mkdirSync(keymapDir, { recursive: true })
  fs.writeFileSync(path.join(keymapDir, 'keymap.json'), built.json)
  fs.writeFileSync(keymapPath, built.code)

  return { mode: built.mode, warnings: built.warnings }
}

export { generateKeymap }
