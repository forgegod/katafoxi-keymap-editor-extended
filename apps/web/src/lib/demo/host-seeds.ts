import {
  hostLayoutFromXkb,
  type HostLanguageId,
  type HostLayout
} from '@keymap-editor/keymap-core'
import larkAu from '../../../../../packages/keymap-core/fixtures/lark/host/au?raw'
import larkRu from '../../../../../packages/keymap-core/fixtures/lark/host/ru?raw'

/** Stable user layout ids so reloading the Lark demo reuses the same tables. */
export const DEMO_LARK_EN_ID = 'user:demo-lark-en'
export const DEMO_LARK_RU_ID = 'user:demo-lark-ru'

export type DemoHostLayoutSeed = {
  id: string
  language: HostLanguageId
  name: string
  section: string
  text: string
}

/** Host layouts to open with a demo keyboard (empty for demos without fixtures). */
export function demoHostSeeds(demoId: string): DemoHostLayoutSeed[] {
  if (demoId !== 'lark') return []
  return [
    {
      id: DEMO_LARK_EN_ID,
      language: 'en',
      name: 'en2',
      section: 'basic',
      text: larkAu
    },
    {
      id: DEMO_LARK_RU_ID,
      language: 'ru',
      name: 'ru2',
      section: 'legacy',
      text: larkRu
    }
  ]
}

/** Parse a demo host seed into a registry table (drop inherited LSGT noise). */
export function demoHostLayoutTable(seed: DemoHostLayoutSeed): HostLayout {
  const table = hostLayoutFromXkb(seed.text, seed.section, {
    fileName: seed.name
  })
  const byZmk = new Map(table.byZmk)
  byZmk.delete('NON_US_BSLH')
  return { id: seed.id, byZmk }
}
