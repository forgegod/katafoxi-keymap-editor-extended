import {
  loadKeyboardBundle,
  parseDtsKeymap,
  parseKeymap,
  pickInfoLayout,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import catalogJson from '../../../../../packages/keymap-core/fixtures/demo/catalog.json'
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

type DemoFiles = { info: InfoJson; keymapSource: string }

const DEMO_LOADERS: Record<string, () => Promise<DemoFiles>> = {
  lark: async () => {
    const [{ default: info }, { default: keymapSource }] = await Promise.all([
      import('../../../../../packages/keymap-core/fixtures/lark/info.json'),
      import('../../../../../packages/keymap-core/fixtures/lark/lark.keymap?raw')
    ])
    return { info: info as InfoJson, keymapSource }
  },
  corne: async () => {
    const [{ default: info }, { default: keymapSource }] = await Promise.all([
      import('../../../../../packages/keymap-core/fixtures/demo/corne/info.json'),
      import('../../../../../packages/keymap-core/fixtures/demo/corne/corne.keymap?raw')
    ])
    return { info: info as InfoJson, keymapSource }
  },
  lily58: async () => {
    const [{ default: info }, { default: keymapSource }] = await Promise.all([
      import('../../../../../packages/keymap-core/fixtures/demo/lily58/info.json'),
      import('../../../../../packages/keymap-core/fixtures/demo/lily58/lily58.keymap?raw')
    ])
    return { info: info as InfoJson, keymapSource }
  },
  cradio: async () => {
    const [{ default: info }, { default: keymapSource }] = await Promise.all([
      import('../../../../../packages/keymap-core/fixtures/demo/cradio/info.json'),
      import('../../../../../packages/keymap-core/fixtures/demo/cradio/cradio.keymap?raw')
    ])
    return { info: info as InfoJson, keymapSource }
  }
}

export const DEMO_CATALOG: DemoCatalogEntry[] = (
  catalogJson as { demos: DemoCatalogEntry[] }
).demos

const DEMO_STORAGE_KEY = 'selectedDemo'
const DEMO_CACHE = new Map<string, Promise<DemoBundle>>()

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

/** Load a bundled demo keyboard (layout + parsed keymap). */
export function loadDemo(id: string): Promise<DemoBundle> {
  const cached = DEMO_CACHE.get(id)
  if (cached) return cached
  const pending = loadDemoUncached(id)
  DEMO_CACHE.set(id, pending)
  pending.catch(() => {
    DEMO_CACHE.delete(id)
  })
  return pending
}

async function loadDemoUncached(id: string): Promise<DemoBundle> {
  const entry = DEMO_CATALOG.find(item => item.id === id)
  if (!entry) throw new Error(`Unknown demo: ${id}`)
  const loader = DEMO_LOADERS[id]
  if (!loader) throw new Error(`Demo files missing for: ${id}`)
  const files = await loader()

  const { keyboard, layoutName } = pickInfoLayout(files.info, {
    fallbackKeyboard: id
  })
  const raw = parseDtsKeymap(files.keymapSource, {
    keyboard,
    keymap: id,
    layout: layoutName
  })
  const bundle = loadKeyboardBundle({
    infoJson: files.info,
    keymap: parseKeymap(raw),
    fallbackKeyboard: keyboard
  })
  return {
    entry,
    layout: bundle.layout,
    keymap: bundle.keymap,
    hostSeeds: demoHostSeeds(id)
  }
}
