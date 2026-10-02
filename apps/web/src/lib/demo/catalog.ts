import {
  parseDtsKeymap,
  parseKeymap,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import catalogJson from '../../../../../packages/keymap-core/fixtures/demo/catalog.json'
import larkInfo from '../../../../../packages/keymap-core/fixtures/lark/info.json'
import larkKeymapSource from '../../../../../packages/keymap-core/fixtures/lark/lark.keymap?raw'
import corneInfo from '../../../../../packages/keymap-core/fixtures/demo/corne/info.json'
import corneKeymapSource from '../../../../../packages/keymap-core/fixtures/demo/corne/corne.keymap?raw'
import lily58Info from '../../../../../packages/keymap-core/fixtures/demo/lily58/info.json'
import lily58KeymapSource from '../../../../../packages/keymap-core/fixtures/demo/lily58/lily58.keymap?raw'
import cradioInfo from '../../../../../packages/keymap-core/fixtures/demo/cradio/info.json'
import cradioKeymapSource from '../../../../../packages/keymap-core/fixtures/demo/cradio/cradio.keymap?raw'
import { demoHostSeeds, type DemoHostLayoutSeed } from './host-seeds.js'

export type DemoCatalogEntry = {
  id: string
  name: string
  blurb: string
  repoUrl: string
  default?: boolean
}

export type DemoBundle = {
  entry: DemoCatalogEntry
  layout: LayoutKey[]
  keymap: ParsedKeymap
  hostSeeds: DemoHostLayoutSeed[]
}

type InfoJson = {
  id?: string
  name?: string
  layouts: Record<string, { layout: LayoutKey[] }>
}

const DEMO_FILES: Record<string, { info: InfoJson; keymapSource: string }> = {
  lark: { info: larkInfo as InfoJson, keymapSource: larkKeymapSource },
  corne: { info: corneInfo as InfoJson, keymapSource: corneKeymapSource },
  lily58: { info: lily58Info as InfoJson, keymapSource: lily58KeymapSource },
  cradio: { info: cradioInfo as InfoJson, keymapSource: cradioKeymapSource }
}

export const DEMO_CATALOG: DemoCatalogEntry[] = (
  catalogJson as { demos: DemoCatalogEntry[] }
).demos

const DEMO_STORAGE_KEY = 'selectedDemo'

export function defaultDemoId(): string {
  return DEMO_CATALOG.find(entry => entry.default)?.id ?? DEMO_CATALOG[0]?.id ?? 'corne'
}

export function readStoredDemoId(): string {
  try {
    const stored = localStorage.getItem(DEMO_STORAGE_KEY)
    if (stored && DEMO_CATALOG.some(entry => entry.id === stored)) return stored
  } catch {
    /* private mode / unavailable */
  }
  return defaultDemoId()
}

export function writeStoredDemoId(id: string) {
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

function layoutFromInfo(info: InfoJson): { layout: LayoutKey[]; layoutName: string } {
  const layoutName = Object.keys(info.layouts)[0]
  if (!layoutName) throw new Error('Demo info.json has no layouts')
  return { layout: info.layouts[layoutName].layout, layoutName }
}

/** Load a bundled demo keyboard (layout + parsed keymap). */
export function loadDemo(id: string): DemoBundle {
  const entry = DEMO_CATALOG.find(item => item.id === id)
  if (!entry) throw new Error(`Unknown demo: ${id}`)
  const files = DEMO_FILES[id]
  if (!files) throw new Error(`Demo files missing for: ${id}`)

  const { layout, layoutName } = layoutFromInfo(files.info)
  const raw = parseDtsKeymap(files.keymapSource, {
    keyboard: files.info.id ?? id,
    keymap: id,
    layout: layoutName
  })
  const keymap = parseKeymap(raw)
  return { entry, layout, keymap, hostSeeds: demoHostSeeds(id) }
}
