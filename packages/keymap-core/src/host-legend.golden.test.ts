import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  addHostLanguage,
  assignHostLanguageLayout,
  composeKey,
  composeLegendDecode,
  HOST_KEY_IDS,
  hostLegendTableRow,
  keycapFace,
  parseKeyBinding,
  setHostColumnAlt,
  standardHostLegendView,
  SYSTEM_RU_LAYOUT_ID,
  SYSTEM_US_LAYOUT_ID,
  toggleHostLanguage,
  type HostLegendView,
  type KeycapFace,
  type LegendDecodeCard
} from './index.js'
import { registerLarkHostFixture } from './testing/lark-host.js'

registerLarkHostFixture()

const GOLDEN_PATH = fileURLToPath(new URL('./__golden__/host-legend.json', import.meta.url))
const UPDATE_GOLDEN = process.env.UPDATE_GOLDEN === '1'

const BINDINGS = [
  { id: 'kp', code: (zmk: string) => `&kp ${zmk}` },
  { id: 'mt', code: (zmk: string) => `&mt LCTRL ${zmk}` },
  { id: 'lt', code: (zmk: string) => `&lt 1 ${zmk}` }
] as const

function assignColumns(enId: string, ruId: string): HostLegendView {
  const started = addHostLanguage(standardHostLegendView(), 'ru')
  const withEn = assignHostLanguageLayout(started, 'en', enId)
  return assignHostLanguageLayout(withEn, 'ru', ruId)
}

const VIEW_BUILDERS: ReadonlyArray<{ id: string; build: () => HostLegendView }> = [
  { id: 'lark-en-ru', build: () => assignColumns('lark-en', 'lark-ru') },
  {
    id: 'system-en-ru',
    build: () => assignColumns(SYSTEM_US_LAYOUT_ID, SYSTEM_RU_LAYOUT_ID)
  },
  {
    id: 'system-en-ru-uk',
    build: () => addHostLanguage(assignColumns(SYSTEM_US_LAYOUT_ID, SYSTEM_RU_LAYOUT_ID), 'uk')
  },
  {
    id: 'system-en-ru-de',
    build: () => addHostLanguage(assignColumns(SYSTEM_US_LAYOUT_ID, SYSTEM_RU_LAYOUT_ID), 'de')
  },
  {
    id: 'lark-hidden-base',
    build: () => toggleHostLanguage(assignColumns('lark-en', 'lark-ru'), 'en')
  },
  {
    id: 'lark-hidden-second-altgr',
    build: () => setHostColumnAlt(assignColumns('lark-en', 'lark-ru'), 'ru', 'altGr', false)
  },
  {
    id: 'system-en-ru-legacy',
    build: () => assignColumns(SYSTEM_US_LAYOUT_ID, 'system-ru-legacy')
  }
]


interface GoldenRecord {
  view: string
  key: string
  binding: string
  keycap: KeycapFace | null
  hold: string | null
  decode: LegendDecodeCard
  table: ReturnType<typeof hostLegendTableRow>
}

interface GoldenSnapshot {
  views: string[]
  keys: string[]
  bindings: string[]
  records: GoldenRecord[]
}

function captureSnapshot(): GoldenSnapshot {
  const views = VIEW_BUILDERS.map(item => item.id)
  const keys = HOST_KEY_IDS.map(key => key.zmk)
  const bindings = BINDINGS.map(item => item.id)
  const records: GoldenRecord[] = []

  for (const viewSpec of VIEW_BUILDERS) {
    const view = viewSpec.build()
    for (const key of HOST_KEY_IDS) {
      for (const bindingSpec of BINDINGS) {
        const bindingCode = bindingSpec.code(key.zmk)
        const binding = parseKeyBinding(bindingCode)
        const legend = composeKey({ binding, hostView: view })
        records.push({
          view: viewSpec.id,
          key: key.zmk,
          binding: bindingCode,
          keycap: legend ? keycapFace(legend) : null,
          hold: legend?.hold ?? null,
          decode: composeLegendDecode(binding, view),
          table: hostLegendTableRow(binding, view)
        })
      }
    }
  }

  return { views, keys, bindings, records }
}

function toJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

function writeGolden(snapshot: GoldenSnapshot) {
  mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true })
  writeFileSync(GOLDEN_PATH, `${JSON.stringify(snapshot, null, 2)}\n`)
}

describe('host legend golden', () => {
  const snapshot = captureSnapshot()

  it('covers every host key, binding, and public-transition view', () => {
    expect(snapshot.keys).toEqual(HOST_KEY_IDS.map(key => key.zmk))
    expect(snapshot.views).toEqual(VIEW_BUILDERS.map(item => item.id))
    expect(snapshot.bindings).toEqual(BINDINGS.map(item => item.id))
    expect(snapshot.records).toHaveLength(snapshot.views.length * snapshot.keys.length * snapshot.bindings.length)
  })

  it('matches the stored keycap, table, and decode snapshot', context => {
    const actual = toJson(snapshot)
    if (UPDATE_GOLDEN) writeGolden(snapshot)
    if (!existsSync(GOLDEN_PATH)) {
      context.skip()
      return
    }
    const expected = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'))
    expect(actual).toEqual(expected)
  })
})
