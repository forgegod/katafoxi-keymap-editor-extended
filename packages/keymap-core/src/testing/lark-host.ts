import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hostLayoutFromXkb } from '../host-layout-import.js'
import { registerHostLayout } from '../host-layout-registry.js'
import type { HostLayout } from '../host-layout.js'

const HOST_DIR = fileURLToPath(new URL('../../fixtures/lark/host', import.meta.url))

function cloneWithId(source: HostLayout, id: string): HostLayout {
  const byZmk = new Map(source.byZmk)
  // Both fixture sections comment out <LSGT>. hostLayoutFromXkb still
  // inherits it from ru(common); that extra NON_US_BSLH only changes the
  // golden table cell for that key. Drop it so the snapshot stays valid.
  byZmk.delete('NON_US_BSLH')
  return { id, byZmk }
}

/** Register the vendored host fixtures as user layouts `lark-en` / `lark-ru`. */
export function registerLarkHostFixture(): void {
  const au = readFileSync(path.join(HOST_DIR, 'au'), 'utf8')
  const ru = readFileSync(path.join(HOST_DIR, 'ru'), 'utf8')
  registerHostLayout(
    {
      id: 'lark-en',
      language: 'en',
      name: 'au',
      flag: '🇦🇺',
      origin: 'user'
    },
    cloneWithId(hostLayoutFromXkb(au, 'basic', { fileName: 'au' }), 'lark-en')
  )
  registerHostLayout(
    {
      id: 'lark-ru',
      language: 'ru',
      name: 'legacy',
      flag: '🇷🇺',
      origin: 'user'
    },
    cloneWithId(hostLayoutFromXkb(ru, 'legacy', { fileName: 'ru' }), 'lark-ru')
  )
}
